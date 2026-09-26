/**
 * Scraping de cifras: extrai músicas de CifraClub e sites internacionais, detecta acordes, limpa títulos/artistas, descarta cifras vazias e lixo de metadados.
 */
/**
 * Scraping de cifras — lógica compartilhada entre a API (Vercel) e o servidor
 * local (server.ts). Roda no NODE (sem DOM): fetch + regex, e reaproveita o
 * pipeline de conversão/SEO que já existe no frontend (chordUtils/seoUtils).
 *
 * Fluxo:
 *  1. descobrirSongsNaPagina(html, url) → lista de links de músicas
 *  2. scrapeSong(url) → { dados processados no formato do UkeMaster }
 */

import {
  autoConvertTextToChordPro,
  extractSongMetadata,
  generateSongSeoAndHashtags,
  extractUniqueChords,
} from '../utils/chordUtils.js';
import { CIFRACLUB_CATALOG } from '../data/cifraclubCatalog.js';
import { CIFRACLUB_SITEMAP_INDEX } from '../data/cifraclubSitemapIndex.js';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Song } from '../types';

export interface ScrapedLink {
  url: string;
  title: string;
  artist: string;
}

export interface ScrapedSongResult {
  song?: Song;
  error?: string;
}

export interface ScrapeArtistOptions {
  /** Limite de músicas por artista (padrão 30). */
  limit?: number;
  /** Atraso entre requisições em ms (educado com o site de origem). */
  delayMs?: number;
  /** Para o processamento educadamente após esse tempo (ms) — retorna o parcial. */
  timeoutMs?: number;
  /** Callback de progresso (por música processada). */
  onProgress?: (done: number, total: number, link: ScrapedLink) => void;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Busca o HTML de uma URL (com headers de navegador e timeout). */
// Simple proxy rotation
const PROXIES: string[] = (process.env.SCRAPER_PROXIES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
let proxyIndex = 0;
function getNextProxy(): string | undefined {
  if (PROXIES.length === 0) return undefined;
  const proxy = PROXIES[proxyIndex];
  proxyIndex = (proxyIndex + 1) % PROXIES.length;
  return proxy;
}

// Circuit‑breaker state
let failureCount = 0;
let circuitOpenUntil: number | null = null;
const FAILURE_THRESHOLD = 5; // failures before opening
const COOLDOWN_MS = 60_000; // 1 minute

function checkCircuitBreaker() {
  if (circuitOpenUntil && Date.now() < circuitOpenUntil) {
    throw new Error('Circuit breaker open – waiting before new requests');
  }
}

function recordFailure() {
  failureCount++;
  if (failureCount >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + COOLDOWN_MS;
    failureCount = 0;
  }
}

function resetCircuit() {
  failureCount = 0;
  circuitOpenUntil = null;
}

async function fetchHtml(url: string): Promise<string> {
  // Circuit‑breaker: abort if open
  checkCircuitBreaker();
  // Choose proxy if any
  const proxy = getNextProxy();
  const target = proxy ? `${proxy}/${url}` : url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) {
      throw new Error(`O site respondeu com status ${res.status}.`);
    }
    resetCircuit();
    return await res.text();
  } catch (e) {
    recordFailure();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

/**
 * Descobre links de músicas numa página de artista/índice.
 * Funciona para CifraClub (href="/artista/musica.html" ou "/artista/musica/")
 * e para a maioria dos sites de cifra que listam músicas por artista.
 */
/**
 * U-FRET (Japão): a página do artista lista as músicas como links
 * "/song.php?data=<id>" com o título japonês no texto do <a>. O artista
 * sai do <h1 class="p-artist__name"> (ou do parâmetro data= da própria URL).
 */
/**
 * Extrai o JSON embutido do Ultimate-Guitar (<div class="js-store" data-content="…">).
 * O conteúdo chega com entidades HTML escapadas (&quot;, &#039;, &amp;) — decodifica
 * antes do JSON.parse. Retorna null se a página não tiver o js-store.
 */
function parseUltimateGuitarStore(html: string): any | null {
  const m = html.match(/<div class="js-store" data-content="([\s\S]*?)"><\/div>/);
  if (!m) return null;
  try {
    return JSON.parse(
      m[1]
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
    );
  } catch {
    return null;
  }
}

/**
 * Conteúdo da cifra do Ultimate-Guitar (página de música): lê o js-store e
 * devolve `store.page.data.tab_view.wiki_tab.content` (letra + acordes em
 * [ch]X[/ch]). Retorna '' se não for página de música do UG.
 */
function extractUltimateGuitarContent(html: string): string {
  const store = parseUltimateGuitarStore(html);
  const content =
    store?.store?.page?.data?.tab_view?.wiki_tab?.content ||
    store?.store?.page?.data?.wiki_tab?.content ||
    '';
  return typeof content === 'string' ? content : '';
}

/**
 * Links de músicas do Ultimate-Guitar (página de artista): extrai de
 * `store.page.data.other_tabs[]` ({ song_name, artist_name, tab_url }).
 * Filtra só cifras com LETRA (Chords / Ukulele Chords) e URLs públicas
 * (tabs.ultimate-guitar.com/tab/...) — descarta versões Pro/Official
 * (assinatura, sem acesso via curl), Tabs/Bass/Drums (sem letra).
 */
function discoverUltimateGuitarLinks(html: string, _baseUrl: string): ScrapedLink[] {
  const store = parseUltimateGuitarStore(html);
  const tabs = store?.store?.page?.data?.other_tabs;
  if (!Array.isArray(tabs)) return [];
  const links: ScrapedLink[] = [];
  const seen = new Set<string>();
  const collected: { url: string; title: string; artist: string; rating: number }[] = [];
  for (const t of tabs) {
    const url = t?.tab_url;
    if (!url || !url.includes('tabs.ultimate-guitar.com/tab/')) continue;
    // Só cifras com letra (Chords / Ukulele Chords) — Tabs/Bass/Drums não têm letra
    const type = String(t?.type || '').toLowerCase();
    if (!/chords?/.test(type)) continue;
    const title = String(t?.song_name || '').trim();
    const artist = String(t?.artist_name || '').trim();
    if (!title || !artist) continue;
    collected.push({ url, title, artist, rating: Number(t?.rating) || 0 });
  }
  // O UG lista VÁRIAS versões da mesma música (ex.: 8× "All I Ask"). O dedupe
  // por título|artista joga as demais fora — então ordenamos por AVALIAÇÃO
  // (melhor versão primeiro) para a versão que sobrevive ser a melhor.
  collected.sort((a, b) => b.rating - a.rating);
  for (const c of collected) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    links.push({ url: c.url, title: c.title, artist: c.artist });
  }
  return links;
}

/** URLs das páginas seguintes do artista no Ultimate-Guitar (paginação).
 * Pula a página 1 (já foi buscada — a URL base do artista é equivalente a
 * ela; re-buscá-la seria 1 request desperdiçado por artista). */
function discoverUltimateGuitarNextPages(html: string, baseUrl: string): string[] {
  const store = parseUltimateGuitarStore(html);
  const pages = store?.store?.page?.data?.pagination?.pages;
  if (!Array.isArray(pages)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (p?.page === 1) continue; // página atual — já buscada
    const u = p?.url;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    try {
      out.push(new URL(u, new URL(baseUrl).origin).href);
    } catch {
      // URL inválida — ignora
    }
  }
  return out;
}

function discoverUfretLinks(html: string, baseUrl: string): ScrapedLink[] {
  const links: ScrapedLink[] = [];
  const seen = new Set<string>();
  // Artista: h1 do próprio site (formato: B&#039;z) — senão, do slug data= da URL
  const h1 = html.match(/<h1[^>]*class="[^"]*p-artist__name[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const clean = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
  let artist = h1 ? clean(h1[1]) : '';
  if (!artist) {
    try {
      const q = new URL(baseUrl).searchParams.get('data') || '';
      if (q) artist = decodeURIComponent(q);
    } catch {
      // URL inválida
    }
  }

  const re = /<a[^>]*href="[^"]*song\.php\?data=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    // O <a> traz o título + espaços + sufixos do site ("初心者ver" = versão
    // iniciante) e o nome do ARTISTA no fim — remove tudo isso do título.
    let title = clean(m[2]).replace(/\s+/g, ' ').trim();
    if (artist && title.endsWith(artist)) {
      title = title.slice(0, title.length - artist.length).trim();
    }
    if (!title || seen.has(id)) continue;
    seen.add(id);
    links.push({
      url: `https://www.ufret.jp/song.php?data=${id}`,
      title,
      artist,
    });
  }
  return links;
}

export function discoverSongLinks(html: string, baseUrl: string): ScrapedLink[] {
  const links: ScrapedLink[] = [];
  const seen = new Set<string>();
  const base = new URL(baseUrl);
  // U-FRET (Japão): estrutura própria (song.php?data=ID) — o regex genérico
  // de "/artista/musica" não captura query strings.
  if (base.hostname.includes('ufret')) {
    return discoverUfretLinks(html, baseUrl);
  }
  // Ultimate-Guitar (EN): a lista de músicas vive no js-store (other_tabs[])
  // — o regex genérico de hrefs não alcança os links embutidos no JSON.
  if (base.hostname.includes('ultimate-guitar')) {
    return discoverUltimateGuitarLinks(html, baseUrl);
  }
  const baseDepth = base.pathname.split('/').filter(Boolean).length;

  // Regex de hrefs: captura RELATIVOS ("/artista/musica.html") e ABSOLUTOS
  // do mesmo domínio ("https://site/artista/musica/", ex.: UkuTabs). Os
  // absolutos de outros domínios e os utilitários são filtrados adiante.
  const hrefRegex = /href="([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    let rawHref = match[1];
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;

    // URLs absolutas do MESMO domínio são válidas (ex.: UkuTabs usa
    // href="https://ukutabs.com/a/adele/all-i-ask/") — normaliza para o
    // pathname e segue o fluxo igual ao relativo. Outros domínios: ignora.
    if (rawHref.includes('://')) {
      try {
        const u = new URL(rawHref);
        if (u.origin !== base.origin) continue;
        rawHref = u.pathname;
      } catch {
        continue;
      }
    }

    // Remove query string e âncora ANTES de tudo: o CifraClub polui os hrefs
    // com ?instrument=... (variantes por instrumento) e #autoplay=true
    // (videoaulas) — sem isso eles virariam "músicas" falsas (ex.:
    // "/artista/musicas.html?instrument=lyrics" ou "/artista/musica/#autoplay").
    rawHref = rawHref.split(/[?#]/)[0];

    // Ignora caminhos de imagem/arquivo/âncora
    if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico|pdf|zip|woff2?|mp3|mp4)$/i.test(rawHref)) continue;

    const parts = rawHref.split('/').filter(Boolean);
    // Precisamos de pelo menos "artista/musica"
    if (parts.length < 2) continue;

    // Sites em índice A-Z (ex.: Guitaretab /x/artista/): a página do artista
    // tem profundidade N e as MÚSICAS têm N+1. Links na MESMA profundidade
    // são auto-links ou artistas VIZINHOS — nunca são cifras (ex.:
    // /s/sita/ dentro da página do Vance Joy). No CifraClub a página do
    // artista tem 1 segmento e as músicas têm 2 — a regra vale igual.
    if (parts.length <= baseDepth) continue;

    // Ignora páginas de navegação comum (musicas.html, discografia.html,
    // videoaulas.html, biografia, álbuns, agenda, etc.)
    const skipWords = [
      'lista', 'mais-tocadas', 'melhores', 'top', 'pagina', 'page', 'letras',
      'artistas', 'busca', 'buscar', 'login', 'cadastro', 'premium', 'app',
      'termos', 'privacidade', 'sobre', 'contato', 'ajuda', 'noticias', 'news',
      'video-aula', 'videoaula', 'videoaulas', 'videos', 'tutorial', 'aulas',
      'curso', 'assinaturas', 'musicas', 'musica', 'discografia', 'discos',
      'clipes', 'albums', 'albuns', 'fotos', 'biografia', 'agenda', 'shows',
      'radio', 'cifras', 'acordes', 'dicionario', 'dicionario-de-acordes',
      'comunidade', 'forum', 'loja', 'anuncie', 'home', 'index', 'enviar',
      'playlists', 'colecoes', 'artigo', 'conheca', 'historia', 'cifra-club',
      'mpb', 'sertanejo', 'forro', 'rock', 'pop', 'instrumentais', 'internacionais',
    ];
    const lastBase = parts[parts.length - 1]
      .toLowerCase()
      .replace(/\.(html?|php)$/i, '');
    // Guitaretab e afins: páginas de agregação/utilitárias não são cifras
    const extraSkip = ['all', 'add', 'new-tab', 'newtab', 'upload', 'submit', 'faq', 'help', 'recommend', 'versions', 'print', 'index'];
    if (skipWords.includes(lastBase) || extraSkip.includes(lastBase)) continue;

    // Filtro alfabético A-Z (ex.: /artista/A/) — página de índice, não cifra
    if (/^[a-z0-9]$/.test(lastBase) && parts.length >= 2) continue;

    // Página de álbum (ex.: /artista/vesuvio-2018/) — sem cifra direta
    if (/-\d{4}$/.test(lastBase)) continue;

    // Pega título do slug (última parte), artist do penúltimo
    const slugTitle = parts[parts.length - 1];
    const slugArtist = parts[parts.length - 2];
    // Base do slug sem extensão (.html/.php) — os sufixos de variante do
    // CifraClub chegam com extensão (ex.: "/artista/musica/simplificada.html").
    const slugBase = slugTitle.replace(/\.(html?|php)$/i, '');

    // Ignora versões que NÃO são cifra principal (CifraClub usa sufixos):
    // "musica-letra", "musica-video-aula", "musica-tab", "musica-solos",
    // "musica-guitarpro", "musica-backing-track"…
    const variantWords = 'letra|letras|video-aula|videoaula|tab|tabs|solos|solo|guitarpro|cifra-simplificada|simplificada|backing-track|playback|partitura|exercicios';
    const nonChordVersion = new RegExp(`-(${variantWords})$`, 'i');
    if (nonChordVersion.test(slugBase)) continue;
    // Página da própria variante (profundidade extra): o CifraClub usa
    // /artista/musica/simplificada.html — o último segmento é o NOME da
    // variante, não uma música ("Simplificada", "Letra"...).
    if (new RegExp(`^(${variantWords})$`, 'i').test(slugBase)) continue;

    const key = `${slugArtist}/${slugTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fullUrl = new URL(rawHref, base.origin).href;
    // Defensivo: URL vazia, raiz do site ou a própria página de artista
    const basePath = base.pathname.replace(/\/$/, '');
    const fullPath = new URL(fullUrl).pathname.replace(/\/$/, '');
    if (!fullUrl || fullPath === base.origin || (basePath.length > 1 && fullPath === basePath)) continue;

    links.push({
      url: fullUrl,
      title: slugToTitle(slugTitle),
      artist: slugToTitle(slugArtist),
    });
  }

  return links;
}

/** Converte slug "alceu-valenca" → "Alceu Valenca". */
function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Limpa títulos no formato de sites internacionais, ex.:
 * "10000 Motherfuckers tab ver. 2 with lyrics by Jason Mraz for guitar
 * and ukulele @ Guitaretab" → "10000 Motherfuckers".
 */
function cleanSongTitle(raw: string): string {
  let t = (raw || '').trim();
  // Normaliza quebras de linha/espaços múltiplos — o Guitaretab vaza títulos
  // com \n\n e indentação no h1 (ex.: "Coldplay\nA Head Full Of Dreams").
  t = t.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^~+\s*/, ''); // Guitaretab prefixa títulos com "~"
  t = t.replace(/\s+(?:tabs?|chords?|tablatures?)\s+ver\.?\s*\d+[\s\S]*$/i, '');
  t = t.replace(/\s+(?:tabs?|chords?)\s+with\s+lyrics[\s\S]*$/i, '');
  t = t.replace(/\s+with\s+lyrics\s+by\s+[\s\S]*$/i, '');
  t = t.replace(/\s+for\s+(?:guitar|ukulele|piano|bass|drums?|cavaquinho|band)[\s\S]*$/i, '');
  t = t.replace(/\s+@\s+[a-z0-9.]+\s*$/i, '');
  t = t.replace(/\s+(?:tabs?|chords?|cifra|cifras)\s*$/i, '');
  return t.trim();
}

/**
 * Extrai o artista do rótulo "…with lyrics by {Artista} for …" (Guitaretab).
 */
function artistFromLyricsTag(raw: string): string {
  const m = (raw || '').match(
    /with\s+lyrics\s+by\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .&-]{1,40}?)\s+(?:for\s+|@\s+|$)/i
  );
  return m ? m[1].trim() : '';
}

/**
 * DETECTOR DE LIXO — impede que trechos de cifra/estrutura da página virem
 * "artista" ou "título" no acervo. Casos reais que já entraram no banco:
 *   "[Tab", "RIFF 1", "Intro.: do Solo( G", "Luz da Minha Vida / Avião Das
 *   Nove (Pot", "[Pré", "-======-", "(Renato Russo)", "0".
 */
const JUNK_ARTIST_PATTERNS: RegExp[] = [
  /^\[/, // começa com [
  /\[[A-G][#b]?/, // contém acorde (ex.: "[Tab", "[Pré", "[Ebm7]")
  /^[)\]}\s]+/, // começa com fechamento/colchete (ex.: "(Renato Russo)")
  /^[^\p{L}\p{N}]{1,4}$/u, // símbolos/pontuação puros (ex.: "-======-", "|-", "0") — NÃO rejeita nomes japoneses/árabes (藤井風 = \p{L})
  /^\d+$/, // só números
  /desconhecid|unknown\s+artist/i, // fallback de artista não resolvido (ufret/guitaretab)
  /^\s*[-|_=]+\s*$/, // separadores
  /^~+[\s~]*/, // prefixo "~" do Guitaretab (nunca é nome de artista)
  /\b(intro|solo|riff|refr[aã]o|refrao|verso|vers|ponte|final|outro|backing|playback|instrumental|tablatura|guitarpro|partitura)\b/i,
  /need\s+rating\s+details/i, // h2 de navegação do Guitaretab
  /pot-?pourri|medley/i, // "(Pot-Pourri)" e truncamentos
  /\(pot\s*$/i, // "(Pot" truncado
  /\([A-G][#b]?\s*\)?$/, // acorde no fim (ex.: "...do Solo( G")
  /^[a-z0-9]+\.[a-z]{2,}$/i, // parece domínio/arquivo (ex.: "musicas.html")
  // Comentários/notas de tab que o Guitaretab deixa escapar como "artista":
  /\bcapo\b/i, // "(**)Adding a capo...", "CAPO 3... CHORD's..."
  /\bstandard tuning\b/i,
  /^notes:?$/i,
  /^verse\s*\d+(:?\s|$)/i, // "Verse 1" / "Verse 1:"
  /\b(this song|the whole song|the lyrics|the website|the album)\b/i,
  /\b(leave|please leave)\s+feedback\b/i,
  /@[a-z0-9._-]+\.[a-z]{2,}/i, // e-mail de contato do autor
  /\bchords?\s*:/i, // "CHORD's : Am, G, F"
  /\btook too much\b/i,
  /\bfirst time i\b/i,
  /^[^|]{40,}$/, // frase longa sem barra (comentário virou artista)
  /^\S+( \S+){5,}$/, // 6+ palavras (nome real de artista nunca é tão longo)
];

/** true se o nome NÃO pode ser um artista válido (deve ser descartado). */
export function isJunkArtistName(name: string): boolean {
  const n = (name || '').trim();
  if (!n || n.length < 2 || n.length > 60) return true;
  return JUNK_ARTIST_PATTERNS.some((p) => p.test(n));
}

/**
 * true se o nome é uma PESSOA plausível (≤5 palavras, sem símbolos de tab).
 * Usado como camada extra para descartar comentários do Guitaretab que ainda
 * não casam com os padrões de lixo (ex.: "Now this will be the last time").
 */
export function looksLikeRealArtist(name: string): boolean {
  const n = (name || '').trim();
  if (!n) return false;
  if (n.length > 45) return false;
  const words = n.split(/\s+/);
  if (words.length > 5) return false;
  // Stopwords de comentário ("This is my first tab", "The whole song...")
  // contam apenas a partir da SEGUNDA palavra — assim "The Rolling Stones",
  // "The Black Keys" (bandas reais começando com "The") passam, mas
  // "The whole song is a story" (comentário) é rejeitado.
  const rest = words.slice(1).join(' ');
  const stopwords = /\b(this|that|the|with|for|and|but|you|your|when|there|here|will|been|have|were|i'm|i'?ve|you'?ll|don'?t|can'?t)\b/i;
  if (rest && stopwords.test(rest) && words.length >= 3) return false;
  // Nomes reais de artista não terminam com "!" ou ":"
  if (/[:!][\s]*$/.test(n)) return false;
  return true;
}

/** true se o título é lixo estrutural (seção de cifra virou título). */
export function isJunkTitle(title: string): boolean {
  const t = (title || '').trim();
  if (!t) return true;
  if (/^\[/.test(t) && /\]/.test(t)) return true; // "[Primeira Parte]"
  if (/\[[A-G][#b]?/.test(t)) return true; // contém acorde
  if (/^[)\]}\s]+/.test(t)) return true;
  if (/pot-?pourri\(/i.test(t) || /\(pot\s*$/i.test(t)) return true;
  return false;
}

/**
 * Extrai o ID de um vídeo do YouTube a partir do HTML da página de cifra
 * (o CifraClub embute a videoaula oficial). Retorna null se não houver.
 */
export function extractYoutubeFromHtml(html: string): string | null {
  const patterns = [
    /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/i,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/i,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/i,
    /data-video-?id=["']([A-Za-z0-9_-]{6,})["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Extrai texto de cifra bruto de um HTML (sem DOM — regex + stripping de tags).
 * Tenta CifraClub (data-chord-name) e depois qualquer <pre>/artigo.
 */
export function extractChordsFromHtml(html: string): string {
  let text = html;

  // Ultimate-Guitar (EN): a cifra COMPLETA (letra + acordes) vive no js-store
  // → store.page.data.tab_view.wiki_tab.content, em formato [ch]X[/ch] com
  // seções [Verse]…[Chorus] e blocos [tab]…[/tab]. Converte direto:
  //   [ch]Em[/ch] → [Em]   ·   [tab]…[/tab] → remove as tags (conteúdo fica)
  const ugContent = extractUltimateGuitarContent(text);
  if (ugContent) {
    text = ugContent
      .replace(/\[ch\]([^\[]*?)\[\/ch\]/gi, '[$1]') // [ch]Em[/ch] → [Em]
      .replace(/\[tab\]\s*/gi, '')
      .replace(/\s*\[\/tab\]/gi, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '');
    // Cabeçalhos do autor que poluem a letra ("Chasing Pavements - Adele",
    // "by claudio@tognozzi.it", "[Bb6] = 653333"): linhas iniciais que sejam
    // "Título - Artista", "by …" ou legendas de shape são descartadas.
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && i < 4) {
      const l = lines[i].trim();
      const isAuthorLine = /^by\s+.+@/i.test(l) || /^by\s+[a-z0-9_.-]+$/i.test(l);
      const isShapeLegend = /^\[[A-G][#b]?[^\]]*\]\s*=\s*\d{5,6}$/.test(l);
      const isStrumPattern = /^(standard strum|fingerpick(ing)?|strumming pattern|picking pattern|no capo)$/i.test(l);
      const isTitleDashArtist = /^[^\[].*\s[-–—]\s/.test(l) && !/^\[/.test(l);
      if (isAuthorLine || isShapeLegend || isStrumPattern || isTitleDashArtist) {
        lines.splice(i, 1);
        continue;
      }
      i++;
    }
    text = lines.join('\n');
  }

  // CifraClub: <b data-chord-name="C">C</b> → [C]
  text = text.replace(/<b[^>]*data-chord-name="([^"]+)"[^>]*>[\s\S]*?<\/b>/gi, '[$1]');
  text = text.replace(/<b[^>]*class="[^"]*c-chord[^"]*"[^>]*>[\s\S]*?<\/b>/gi, (m) => {
    const inner = m.replace(/<[^>]+>/g, '').trim();
    return inner ? `[${inner}]` : '';
  });

  // Guitaretab: a cifra vive num <pre class="js-tab-fit-to-screen"> dentro de
  // <div class="gt-tab-content">; cada linha é um <span class="js-tab-row">.
  const gtPre = text.match(
    /<pre[^>]*class="[^"]*js-tab-fit-to-screen[^"]*"[^>]*>([\s\S]*?)<\/pre>/i
  );
  if (gtPre) {
    text = gtPre[1]
      .replace(/<span[^>]*class="[^"]*js-tab-row[^"]*"[^>]*>/gi, '\n')
      .replace(/<div[^>]*class="js-text-tab[^"]*"[^>]*>/gi, '');
  } else {
    // UkuTabs (EN): a cifra vive no <pre id="ukutabs-song"> com os acordes
    // em <a class="ukutabschord"> — vira [X] inline (formato ChordPro).
    const utPre = text.match(/<pre[^>]*id="ukutabs-song"[^>]*>([\s\S]*?)<\/pre>/i);
    if (utPre) {
      text = utPre[1]
        .replace(/<a[^>]*class="[^"]*ukutabschord[^"]*"[^>]*>([^<]*)<\/a>/gi, '[$1]')
        .replace(/<span[^>]*class="[^"]*uku-cl-chord[^"]*"[^>]*>([^<]*)<\/span>/gi, '[$1]')
        .replace(/<br\s*\/?>/gi, '\n');
    }

    // U-FRET (JA): a cifra completa (letra + acordes [X]) vem numa variável
    // JS `ufret_chord_datas = ["[D]さよなら[G]...", "..."]` — JSON válido
    // com \u escapes; cada elemento é uma linha/estrofe.
    const ufretMatch = text.match(/var ufret_chord_datas\s*=\s*(\[[\s\S]*?\])\s*;\s*\r?\n/);
    if (ufretMatch) {
      try {
        const rows = JSON.parse(ufretMatch[1]) as string[];
        if (Array.isArray(rows) && rows.length > 0) {
          text = rows.join('\n');
        }
      } catch {
        // JSON malformado — cai no fallback genérico
      }
    }
    // <pre> geralmente guarda a cifra inteira
    const preMatch = text.match(/<pre[^>]*data-chord-content[^>]*>([\s\S]*?)<\/pre>/i);
    const preFallback = preMatch || text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preFallback) {
      text = preFallback[1];
    } else {
      // Fallback: artigo / corpo — preserva apenas texto e quebras
      const article = text.match(/<(?:article|main|div)[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i);
      if (article) text = article[1];
    }
  }

  // Quebras
  text = text.replace(/<\/(?:div|p|li|tr|h\d)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove tags restantes e decodifica TODAS as entidades (inclui &#x27; e
  // &#NNN; — antes, apóstrofos viravam literal "d&#x27;ocê" nas letras).
  text = decodeEntities(text.replace(/<[^>]+>/g, ''));

  // Limpa: linhas vazias múltiplas, espaços em excesso no fim de linha
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sanitiza o texto importado: remove qualquer menção ao site de origem,
 * marcas, copyright, URLs e elementos de navegação — para que nada do site
 * importado "vaze" para o acervo do UkeMaster Pro.
 */
export function sanitizeImportedText(raw: string): string {
  // Padrões de marca/site/direitos a remover (linha inteira quando possível)
  const leakPatterns = [
    /cifra\s*club/i,
    /cifraclub/i,
    /ultimate\s*-?\s*guitar/i,
    /e-?chords?/i,
    /letras\.mus/i,
    /\b(?:cifras|chords?)\s*(?:\.com|\.br|\s*(?:de|da|do)\s*\w+\s*(?:club|guitar|music))/i,
    /©|copyright|direitos?\s*(?:reservados|autorais)|todos\s+os\s+direitos/i,
    /ver\s+(?:cifra|letra|versão|versao|tablatura|mais|todas)\s*/i,
    /enviar\s*(?:cifra|letra|erro|correção|correcao)/i,
    /cifra\s*(?:errada|simplificada|completa)/i,
    /\[?\s*(?:parte|part)\s*\d+\s*de\s*\d+\s*\]?/i,
  ];

  const lines = raw.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Remove URLs completas e menções a domínios
    if (/https?:\/\/|www\./i.test(trimmed)) {
      // Linhas que são SÓ URL — remove; URLs embutidas em texto — tira o trecho
      const noUrl = trimmed.replace(/https?:\/\/[^\s]+/gi, '').trim();
      if (!noUrl) continue;
      cleaned.push(noUrl);
      continue;
    }

    // Remove linha se ela for apenas navegação/marca
    const isPureLeak = leakPatterns.some((p) => p.test(trimmed) && trimmed.length < 90);
    if (isPureLeak) continue;

    // Em linhas longas, remove apenas o trecho que vaza
    let fixed = trimmed;
    fixed = fixed.replace(/\s*-?\s*Cifra\s*Club[^\n]*/gi, '');
    fixed = fixed.replace(/\s*©[^\n]*/gi, '');
    fixed = fixed.replace(/\s*\d+\s*visualiza[çc][õo]es?[^\n]*/gi, '');

    cleaned.push(fixed);
  }

  return cleaned
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Decodifica entidades HTML básicas (incluindo numéricas e &#x27;). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

/** Extrai título/artista do HTML (h1/h2, <title>, meta og:). */
export function extractMetaFromHtml(html: string): { title?: string; artist?: string } {
  const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).trim();

  // Ultimate-Guitar: a página de música NÃO tem h1/h2 — o título/artista
  // exatos vivem no js-store (tab.song_name / tab.artist_name).
  const ugStore = parseUltimateGuitarStore(html);
  const ugTab = ugStore?.store?.page?.data?.tab;
  if (ugTab?.song_name) {
    return {
      title: String(ugTab.song_name).trim(),
      artist: String(ugTab.artist_name || '').trim(),
    };
  }

  // U-FRET (Japão): o <title> é "Música / Artista ギターコード/... - U-FRET" —
  // parse direto (o h1/h2 genérico não expõe o artista de forma estável).
  const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  if (rawTitle && /U-FRET/i.test(rawTitle)) {
    const t = clean(rawTitle);
    // Formato real: "Música / Artista ギターコード/ウクレレコード/... - U-FRET".
    // O [\u30a0-\u30ff]* cobre o prefixo de instrumento em KATAKANA antes de
    // コード (ギター/ウクレレ/ピアノ) — o regex antigo consumia o katakana
    // no grupo errado e o artista saía "Desconhecido".
    const m = t.match(/^(.+?)\s*\/\s*(.+?)\s+[\u30a0-\u30ff]*コード/);
    if (m && m[1] && m[2]) {
      return { title: m[1].trim(), artist: m[2].trim() };
    }
  }

  // Ignora elementos de acessibilidade (u-srOnly) — o CifraClub usa h2 "Menu
  // principal" como primeiro <h2> só para leitores de tela.
  const notSrOnly = (s: string) => !/u-srOnly|sr-only|visually-hidden/i.test(s);

  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];

  const h1 = h1s.find((m) => notSrOnly(m[0]))?.[1];
  let h1Clean = clean(h1 || '') || undefined;
  // Guitaretab e afins: o <h1> é "Artista – Música" (com travessão) → fica
  // só a MÚSICA. No CifraClub o h1 já é só o título (sem travessão), então
  // nada muda. Títulos com "-" real não são afetados (só corta se houver
  // 2+ segmentos e o último for o nome da música).
  if (h1Clean && /[–—-]/.test(h1Clean)) {
    const parts = h1Clean.split(/[–—-]/);
    const last = parts[parts.length - 1].trim();
    if (parts.length >= 2 && last && last.length >= 2) {
      h1Clean = last;
    }
  }
  // No CifraClub o artista é o 2º <h2> visível; em geral, preferimos o que
  // não for srOnly e tenha poucas palavras (nome de artista).
  const visibleH2 = h2s.filter((m) => notSrOnly(m[0]));
  const h2 = visibleH2[0]?.[1];

  // og:title independente da ordem dos atributos (Guitaretab usa
  // content= antes de property= em algumas páginas)
  const ogTag = html.match(/<meta[^>]*property=["']og:title["'][^>]*>/i);
  const ogTitle = ogTag
    ? ogTag[0].match(/content=["']([^"']+)["']/i)?.[1]
    : undefined;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return {
    title: h1Clean || clean(ogTitle || '') || clean(title || '') || undefined,
    artist: clean(h2 || '') || undefined,
  };
}

/**
 * Extrai o artista a partir do slug da URL.
 * CifraClub: /artista/musica/ → parts[0]; Guitaretab: /j/artista/123.html →
 * o penúltimo segmento também é o artista. Usar parts[length-2] cobre os dois.
 */
export function artistFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return slugToTitle(parts[parts.length - 2]);
  } catch {
    // ignora URL inválida
  }
  return '';
}

// ── Inferência de categoria/estilo ────────────────────────────────────────
// Mapa de artistas conhecidos → estilo (as plataformas não expõem gênero no
// HTML). O fallback é 'Outros' e o admin pode ajustar depois no editor.
const ARTIST_CATEGORY: Record<string, string> = {
  'alceu valença': 'MPB',
  'caetano veloso': 'MPB',
  'gilberto gil': 'MPB',
  'tom jobim': 'MPB',
  'djavan': 'MPB',
  'tim maia': 'MPB',
  'marisa monte': 'MPB',
  'adriana calcanhotto': 'MPB',
  'roberto carlos': 'MPB',
  'chico buarque': 'MPB',
  'elvis presley': 'Internacional',
  'the beatles': 'Internacional',
  'ed sheeran': 'Internacional',
  'jason mraz': 'Internacional',
  'vance joy': 'Internacional',
  "israel kamakawiwo'ole": 'Internacional',
  'billie eilish': 'Internacional',
  'adele': 'Internacional',
  'coldplay': 'Internacional',
  'marília mendonça': 'Sertanejo',
  'gusttavo lima': 'Sertanejo',
  'jorge e mateus': 'Sertanejo',
  'zezé di camargo e luciano': 'Sertanejo',
  'chitãozinho e xororó': 'Sertanejo',
  'henrique e juliano': 'Sertanejo',
  // Gospel / música cristã — sem isso as cifras gospel caíam em 'Outros'
  // (o índice CIFRACLUB_CATALOG também cobre 33 artistas gospel).
  // (antes não havia NENHUM artista gospel no mapa nem na fila do cron).
  'aline barros': 'Gospel',
  'gabriela rocha': 'Gospel',
  'fernanda brum': 'Gospel',
  'preto no branco': 'Gospel',
  'diante do trono': 'Gospel',
  'marcelo rossi': 'Gospel',
  'cassiane': 'Gospel',
  'ana paula valadão': 'Gospel',
  'casa worship': 'Gospel',
  'isadora pompeo': 'Gospel',
  'luma elpidio': 'Gospel',
  'midian lima': 'Gospel',
  'paulo césar baruk': 'Gospel',
  'daniela araujo': 'Gospel',
  'hillsong': 'Gospel',
  'legião urbana': 'Rock',
  'engenheiros do hawaii': 'Rock',
  'paralamas do sucesso': 'Rock',
  'titãs': 'Rock',
  'queen': 'Rock',
  'guns n roses': 'Rock',
  'luiz gonzaga': 'Forró',
  'dominguinhos': 'Forró',
  'wesley safadão': 'Forró',
  'raimundos': 'Rock',
  'cazuza': 'Rock',
  'renato russo': 'Rock',
  'anitta': 'Pop',
  'ivete sangalo': 'Pop',
  'claudia leitte': 'Pop',
  'kate perry': 'Pop',
  'miley cyrus': 'Pop',
  'taylor swift': 'Internacional',
  'bruno mars': 'Internacional',
  'bob marley': 'Reggae',
  'skank': 'Rock',
  'rihanna': 'Internacional',
  'priscilla alcantara': 'Gospel',
};

/** Normaliza um nome p/ comparação (sem acentos, minúsculas, & → e). */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Índice de lookup PRÉ-COMPUTADO (uma vez, no import do módulo): nome
// normalizado → categoria. Evita re-normalizar os 667 nomes do catálogo a
// cada música importada (o scraper chama inferCategory por MÚSICA).
const CATALOG_NORM_INDEX: { exact: Map<string, string>; fuzzy: { name: string; cat: string }[] } = (() => {
  const exact = new Map<string, string>();
  const fuzzy: { name: string; cat: string }[] = [];
  for (const entry of CIFRACLUB_CATALOG) {
    const n = normalizeForMatch(entry.name);
    if (n) {
      exact.set(n, entry.category);
      if (n.length >= 4) fuzzy.push({ name: n, cat: entry.category });
    }
  }
  return { exact, fuzzy };
})();

/**
 * Inferência de categoria a partir do artista, com 2 fontes em ORDEM:
 *  1. Mapa MANUAL curado (ARTIST_CATEGORY): os artistas reais do acervo
 *     histórico (Roberto Carlos→MPB, Tim Maia→MPB, Coldplay→Internacional,
 *     Ivete→Pop...) — corrige casos em que o gênero do CifraClub engana
 *     (Tim Maia é listado como "soul" mas é música BR; Elvis como
 *     "rockabilly" mas é Internacional).
 *  2. ÍNDICE DE CATÁLOGO do CifraClub (667 artistas × 98 gêneros): cobre
 *     gospel, forró, reggae, infantil etc. sem depender de lista manual.
 *  Fallback final: 'Outros'.
 */
export function inferCategory(artist: string): string {
  const normalized = normalizeForMatch(artist);
  if (!normalized) return 'Outros';

  // 1) Mapa manual curado primeiro (nacionalidade/orientação editorial)
  // Guarda: artista e chave com ≥ 4 letras — "tom" (3) não casa com
  // "tom jobim", e lixo curto não é classificado por engano.
  if (normalized.length >= 4) {
    for (const [key, cat] of Object.entries(ARTIST_CATEGORY)) {
      const normKey = normalizeForMatch(key);
      if (normKey.length >= 4 && (normalized.includes(normKey) || normKey.includes(normalized))) {
        return cat;
      }
    }
  }

  // 2) Catálogo do CifraClub: match exato do nome normalizado
  const exactCat = CATALOG_NORM_INDEX.exact.get(normalized);
  if (exactCat) return exactCat;

  // Match FUZZY por contenção ("priscilla alcantara & whindersson" contém
  // "priscilla alcantara"; "chitaozinho e xororo" casa com o índice).
  // Só com nome do índice ≥ 4 letras E artista de entrada ≥ 6 letras —
  // evita "tom" casar com "tom jobim" e lixo curto ("Super", "Doo").
  if (normalized.length >= 6) {
    for (const { name, cat } of CATALOG_NORM_INDEX.fuzzy) {
      if (normalized.includes(name) || name.includes(normalized)) {
        return cat;
      }
    }
  }
  return 'Outros';
}

/**
 * fetchHtml com retry educado: sob rate-limit (429/503) ou timeout, tenta de
 * novo com backoff (2s, 4s). Evita que um burst derrube o cron inteiro.
 */
async function fetchHtmlWithRetry(url: string): Promise<string> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchHtml(url);
    } catch (e: any) {
      const msg = e?.message || '';
      const retriable = /status (429|503|403)/.test(msg) || e?.name === 'AbortError';
      if (retriable && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 2_000 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Falha após tentativas de busca.');
}

/**
 * Detecta a URL da versão SIMPLIFICADA (chip "Simplificada" do CifraClub) na
 * página da cifra. Formato real: "/artista/musica/simplificada.html".
 * Retorna null quando a música não tem essa variação.
 */
export function detectSimplifiedVersionUrl(html: string, baseUrl: string): string | null {
  const m = html.match(/href="(\/[a-z0-9-]+\/[a-z0-9-]+\/simplificada\.html)"/i);
  if (!m) return null;
  try {
    return new URL(m[1], new URL(baseUrl).origin).href;
  } catch {
    return null;
  }
}

/**
 * Infere a dificuldade pela COMPLEXIDADE REAL dos acordes (quando a meta do
 * site não diz). Acordes "pesados" no ukulele: raiz sustenida/bemol (quase
 * sempre pestana: F, B, Bb, F#, C#m...) ou qualidades complexas (maj7, 9,
 * 11, 13, dim, aug, sus4, add). Isso torna os filtros Modo Médio/Avançado
 * reais no acervo (antes quase tudo caía em 'Simplificado' por padrão).
 */
function inferDifficultyFromChords(
  chords: string[],
  metaDifficulty?: string
): Song['difficulty'] {
  // Meta do site tem prioridade quando diz o nível
  if (metaDifficulty === 'Avançado' || metaDifficulty === 'Difícil') return 'Avançado';
  if (metaDifficulty === 'Intermediário' || metaDifficulty === 'Médio') return 'Médio';

  let complex = 0;
  for (const c of chords) {
    const root = (c.match(/^[A-G][#b]?/) || [''])[0];
    if (/[#b]/.test(root)) complex++;
    else if (/(maj7|m7b5|dim|aug|sus4|sus2|add[0-9]*|9|11|13)/i.test(c)) complex++;
  }
  if (complex >= 3) return 'Avançado';
  if (complex >= 1) return 'Médio';
  return 'Simplificado';
}

/**
 * Faz o scrape de UMA música: busca o HTML, extrai a cifra, roda o conversor
 * automático (formato [C], tom, dificuldade) e o gerador de SEO.
 * Retorna uma Song pronta para ser adicionada ao acervo.
 */
export async function scrapeSong(url: string): Promise<Song> {
  const html = await fetchHtmlWithRetry(url);
  return scrapeSongFromHtml(url, html);
}

/**
 * Parseia a cifra de um HTML JÁ baixado (sem fetch) — separado do scrape
 * para a versão com variantes reutilizar o mesmo pipeline sem baixar 2x.
 */
export function scrapeSongFromHtml(url: string, html: string): Song {
  const rawChords = extractChordsFromHtml(html);
  const meta = extractMetaFromHtml(html);
  const urlArtist = artistFromUrl(url);

  if (!rawChords || rawChords.length < 10) {
    throw new Error('Nenhuma cifra detectada nesta página.');
  }

  // Remove vazamentos do site de origem (marcas, URLs, copyright, navegação)
  const sanitizedChords = sanitizeImportedText(rawChords);

  // Reaproveita o pipeline do app: formato [C], acordes detectados, tom, SEO
  const { content, detectedChords, suggestedKey } = autoConvertTextToChordPro(sanitizedChords);

  // Cifra VAZIA/BLOQUEADA (ex.: Guitaretab "not in a position to display"
  // por licença) — converte para nada e não deve entrar no acervo. Antes
  // disso, músicas assim eram importadas com content vazio (acervo poluído).
  if (!content || content.trim().length < 10 || detectedChords.length === 0) {
    throw new Error('Cifra vazia ou bloqueada nesta página (licença/estrutura).');
  }

  const extractedMeta = extractSongMetadata(rawChords, meta.title || meta.artist || '');

  // Título: prioriza o <h1>/og:title do HTML (com limpeza para sites INT,
  // ex.: "X tab ver. 2 with lyrics by Y @ Site" → "X"), depois a extração
  // do texto, e por fim o slug da URL. Rejeita lixo com acordes e headers
  // de seção (ex.: "[Primeira Parte]").
  const urlTitle = url.split('/').filter(Boolean).pop() || '';
  const cleanMetaTitle = cleanSongTitle(meta.title || '');
  const looksCleanTitle = (t?: string) =>
    !!t &&
    t.length <= 80 &&
    !/^\[[^\]]*\]$/.test(t.trim()) &&
    !/\[[A-G][#b]?[^\]]*\]/.test(t) &&
    !/^[)\]}\s]+\s*\[/.test(t) &&
    !/[A-Ga-g]\s*\|/.test(t) && // linha de tablatura (ex.: "E|----|")
    !/menu principal|página inicial|acessibilidade|tab ver\.|chords ver\./i.test(t);
  // Normaliza também o título extraído do texto e o slug (mesmo caso do h1).
  const normTitle = (t?: string) =>
    (t || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const title =
    looksCleanTitle(normTitle(cleanMetaTitle))
      ? normTitle(cleanMetaTitle)
      : extractedMeta.title !== 'Nova Música' && looksCleanTitle(extractedMeta.title)
      ? normTitle(extractedMeta.title)
      : normTitle(slugToTitle(urlTitle)) || 'Música sem título';
  // Prioridade do artista: meta extraída (se limpa) > "with lyrics by X" do
  // título (Guitaretab) > meta HTML > slug da URL. Rejeita lixo com acordes.
  // No Ultimate-Guitar o js-store (song_name/artist_name) é a fonte
  // AUTORITATIVA — o conteúdo das cifras tem cabeçalhos soltos ("Chasing
  // Pavements - Adele", "Standard Strum", "by claudio@tognozzi.it") que
  // poluiriam o artista (ex.: artista = "Standard Strum"). O meta do UG
  // vem primeiro, SEM cair na heurística do conteúdo.
  const metaArtist = meta.artist || '';
  const lyricsTagArtist = artistFromLyricsTag(meta.title || '');
  const looksCleanArtist = (t?: string) =>
    !!t &&
    t.length <= 60 &&
    !/\[[A-G][#b]?/.test(t) &&
    !/^[)\]}\s]+/.test(t) &&
    !/[A-Ga-g]\s*\|/.test(t) && // linha de tablatura (ex.: "E|----|", "B |3-2")
    !/menu principal|acessibilidade|página inicial/i.test(t);
  const plausibleName = (t?: string) =>
    !!t && t.split(' ').length <= 4 && t.trim().length > 1;
  const isUltimateGuitar = /ultimate-guitar/i.test(url);
  const artistRaw = isUltimateGuitar
    ? looksCleanArtist(metaArtist) && looksLikeRealArtist(metaArtist)
      ? metaArtist
      : urlArtist || 'Artista Desconhecido'
    : extractedMeta.artist !== 'Artista Desconhecido' &&
        looksCleanArtist(extractedMeta.artist) &&
        looksLikeRealArtist(extractedMeta.artist)
      ? extractedMeta.artist
      : looksCleanArtist(lyricsTagArtist) && plausibleName(lyricsTagArtist)
      ? lyricsTagArtist
      : looksCleanArtist(metaArtist) && plausibleName(metaArtist) && looksLikeRealArtist(metaArtist)
      ? metaArtist
      : urlArtist || 'Artista Desconhecido';
  // Última camada: se o nome ainda for lixo ("Intro.: do Solo( G", "[Pré",
  // comentário de tab do Guitaretab...), usa o slug da URL — fonte canônica.
  const artist =
    isJunkArtistName(artistRaw) || !looksLikeRealArtist(artistRaw)
      ? urlArtist || 'Artista Desconhecido'
      : artistRaw;

  // VÍDEO: se a página de origem embute a videoaula oficial do YouTube,
  // aproveita (o card mostra thumbnail real em vez de ícone genérico).
  const youtubeId = extractYoutubeFromHtml(html);

  const finalKey = extractedMeta.suggestedKey || suggestedKey || 'C';
  const difficulty = inferDifficultyFromChords(detectedChords, extractedMeta.difficulty);

  // Categoria/estilo inferida (mapa de artistas + fallback 'Outros')
  const category = inferCategory(artist);

  const seo = generateSongSeoAndHashtags(title, artist, finalKey, difficulty, detectedChords, undefined, category);

  const now = new Date().toISOString();
  const song: Song = {
    id: `scraped-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    artist,
    key: finalKey,
    difficulty,
    category,
    content,
    youtubeId: youtubeId || undefined,
    youtubeUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : undefined,
    seoDescription: seo.seoDescription,
    hashtags: seo.hashtags,
    tags: seo.tags,
    createdAt: now,
    updatedAt: now,
  };

  return song;
}

/**
 * Scrape de UMA música com TODAS as variações disponíveis no site de origem.
 *
 * O CifraClub expõe a versão SIMPLIFICADA em "/artista/musica/simplificada.html"
 * (chip "Simplificada"): acordes mais fáceis para quem está começando. Quando
 * ela existe, retornamos DUAS músicas:
 *   - a ORIGINAL (dificuldade real, Médio/Avançado quando há variação simples);
 *   - a SIMPLIFICADA como entrada própria "Título (Simplificada)", dificuldade
 *     Simplificado — o filtro "Modo Simplificado" do app passa a mostrá-la.
 * Músicas sem variação continuam retornando só a original.
 */
export async function scrapeSongWithVariants(url: string): Promise<Song[]> {
  const html = await fetchHtmlWithRetry(url);
  const song = scrapeSongFromHtml(url, html);
  const out: Song[] = [song];

  // Variação simplificada: só quando o próprio HTML da página a anuncia
  // (link /artista/musica/simplificada.html) — zero requisições extras para
  // músicas que não têm versão simplificada.
  const simplifiedUrl = detectSimplifiedVersionUrl(html, url);
  if (!simplifiedUrl) return out;

  try {
    const sHtml = await fetchHtmlWithRetry(simplifiedUrl);
    const v = scrapeSongFromHtml(simplifiedUrl, sHtml);
    // Rede de segurança: variação vazia/indisponível não entra
    if ((v.content || '').trim().length < 10) return out;

    out.push({
      ...v,
      id: `scraped-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `${song.title} (Simplificada)`,
      difficulty: 'Simplificado',
      key: v.key || song.key,
      category: v.category && v.category !== 'Outros' ? v.category : song.category,
      youtubeId: v.youtubeId || song.youtubeId,
      youtubeUrl: v.youtubeUrl || song.youtubeUrl,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    });

    // Existe uma versão simplificada → a ORIGINAL não é para iniciantes:
    // sobe a dificuldade dela para Médio (a simples já cobre o nível básico).
    if (song.difficulty === 'Simplificado') song.difficulty = 'Médio';
  } catch {
    // Simplificada indisponível (404/rate-limit) — segue só com a original
  }

  return out;
}

/**
 * Descobre a(s) página(s) do catálogo COMPLETO do artista.
 * No CifraClub é o /artista/musicas.html (lista TODAS as músicas, enquanto
 * a página raiz mostra só as principais).
 */
export function discoverCatalogUrls(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const regex = /href="(\/[a-z0-9-]+\/musicas\.html(?:\?[^"]*)?)"/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    // Ignora variantes por instrumento (bass, guitarpro, lyrics, sheet) —
    // listam as mesmas músicas e só desperdiçariam requisições.
    if (/instrument=/.test(match[1])) continue;
    try {
      const full = new URL(match[1], new URL(baseUrl).origin).href;
      if (!seen.has(full)) {
        seen.add(full);
        out.push(full);
      }
    } catch {
      // ignora URL inválida
    }
  }
  return out;
}

/**
 * Descobre o catálogo COMPLETO de um artista/página de lista.
 * - Busca a página informada e extrai os links (discoverSongLinks);
 * - Completa com o CATÁLOGO COMPLETO (CifraClub: /artista/musicas.html lista
 *   TODAS as músicas; a raiz mostra só as ~15 principais; Ultimate-Guitar:
 *   paginação do js-store, pagination.pages);
 * - Deduplica por URL e filtra links de outros artistas da navegação.
 *
 * BUGFIX (Roberto Carlos: 25 de 617): o /api/scrape em modo "descobrir"
 * varria só a página raiz — por isso achava apenas as músicas populares. Aqui
 * a raiz é mesclada com /musicas.html, que lista o catálogo inteiro.
 *
 * Detalhe de profundidade: o catálogo (/artista/musicas.html) TEM profundidade
 * 2 e as músicas também têm 2 — usar a URL do catálogo como base faria o
 * filtro `parts.length <= baseDepth` descartar TODAS as músicas. Por isso a
 * descoberta usa a RAIZ do artista (profundidade 1) como base e filtra só
 * links do próprio artista (evita músicas de artistas vizinhos da navegação).
 * No UG o filtro por prefixo não se aplica (URLs tabs.ultimate-guitar.com) —
 * o próprio extrator já retorna só cifras do artista consultado.
 */
export interface DiscoverArtistSongLinksOptions {
  /** Corte máximo de links (0/undefined = todos — usado pelo descobridor). */
  limit?: number;
  /** Atraso entre fetch de páginas de catálogo (ms). */
  delayMs?: number;
  /** Corta por tempo (ms) — 0/undefined = sem corte. */
  timeoutMs?: number;
}

/**
 * FONTES COMPLETAS (BUGFIX: "importa só as ~50 primeiras"):
 *
 * A página /artista/musicas.html — que era a fonte da descoberta do catálogo
 * completo — foi DESCONTINUADA pelo CifraClub (404 em 2026-09) e a raiz do
 * artista só entrega ~15-25 músicas no HTML server-side (o restante é
 * carregado via JS, invisível para scraper server-side).
 *
 * A fonte confiável hoje são os SITEMAPS OFICIAIS (robots.txt →
 * gcs/sitemap/sitemap_index.xml → sitemap_cifras_1..21.xml.gz), que listam
 * TODAS as músicas de TODOS os artistas. O índice embutido
 * (src/data/cifraclubSitemapIndex.ts, ~135 mil artistas) mapeia cada slug
 * aos arquivos que contêm as músicas dele; a descoberta baixa SÓ esses
 * arquivos (concorrência limitada + cache em /tmp da instância) e extrai as
 * URLs /artista/musica/ do artista.
 */
const CIFRACLUB_SITEMAP_BASE = 'https://www.cifraclub.com.br/gcs/sitemap';

async function fetchSitemapCifrasXml(n: number, cacheDir: string, deadline: number): Promise<string | null> {
  const cacheFile = path.join(cacheDir, `sitemap_cifras_${n}.xml`);
  if (fs.existsSync(cacheFile)) {
    try {
      return fs.readFileSync(cacheFile, 'utf8');
    } catch {
      // cache ilegível — baixa de novo
    }
  }
  if (deadline && Date.now() > deadline) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`${CIFRACLUB_SITEMAP_BASE}/sitemap_cifras_${n}.xml.gz`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const xml = gunzipSync(gz).toString('utf8');
    try {
      fs.writeFileSync(cacheFile, xml);
    } catch {
      // sem cache (fs read-only em alguns runtimes) — segue sem persistir
    }
    return xml;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Descobre TODAS as músicas de um artista do CifraClub via sitemaps oficiais.
 * Retorna:
 *  - null → artista não está no índice (chamador cai no fluxo HTML antigo);
 *  - []   → indexado, mas nenhum arquivo pôde ser baixado a tempo
 *           (o chamador também cai no fallback HTML);
 *  - links → catálogo completo (título/artista derivados do slug — a página
 *           real de cada música ainda é lida depois pelo pipeline).
 */
export async function discoverArtistSongLinksViaSitemap(
  pageUrl: string,
  options: { timeoutMs?: number; concurrency?: number } = {}
): Promise<ScrapedLink[] | null> {
  let slug = '';
  try {
    const u = new URL(normalizeUrl(pageUrl));
    // GUARDA: só CifraClub tem este índice de sitemaps. Sem o check, uma URL
    // de outra plataforma (ex.: lacuerda.net/adele/) casaria por acidente com
    // o artista "adele" do CifraClub e importaria o catálogo errado.
    if (!/(^|\.)cifraclub\.com(\.br)?$/i.test(u.hostname)) return null;
    slug = u.pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    return null;
  }
  if (!slug) return null;
  const files = CIFRACLUB_SITEMAP_INDEX[slug];
  if (!files || files.length === 0) return null;

  const deadline =
    options.timeoutMs && options.timeoutMs > 0 ? Date.now() + options.timeoutMs : 0;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 6));
  const cacheDir = path.join(os.tmpdir(), 'cifraclub-sitemaps');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch {
    // sem /tmp — só perde o cache
  }

  const results: (string | null)[] = new Array(files.length).fill(null);
  let next = 0;
  let deadlineHit = false;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (deadlineHit) return;
      const i = next++;
      if (i >= files.length) return;
      const xml = await fetchSitemapCifrasXml(files[i], cacheDir, deadline);
      results[i] = xml;
      if (xml === null && deadline && Date.now() > deadline) deadlineHit = true;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, () => worker())
  );

  const artistRe = new RegExp(
    `<loc>https://www\\.cifraclub\\.com\\.br/${slug}/[a-z0-9-]+/</loc>`,
    'g'
  );
  const seen = new Set<string>();
  const links: ScrapedLink[] = [];
  for (const xml of results) {
    if (!xml) continue;
    let m: RegExpExecArray | null;
    while ((m = artistRe.exec(xml)) !== null) {
      const url = m[0].replace(/<\/?loc>/g, '');
      if (seen.has(url)) continue;
      seen.add(url);
      // pathname = /artista/musica/ → filter(Boolean)[1] é o slug da música
      // (índice 0 é o artista; split da URL completa enganaria — o índice 1
      // seria o hostname).
      const songSlug = new URL(url).pathname.split('/').filter(Boolean)[1] || '';
      if (!songSlug) continue;
      links.push({ url, title: slugToTitle(songSlug), artist: slugToTitle(slug) });
    }
  }
  return links;
}

export async function discoverArtistSongLinks(
  pageUrl: string,
  options: DiscoverArtistSongLinksOptions = {}
): Promise<ScrapedLink[]> {
  let url = normalizeUrl(pageUrl);
  const pathname = new URL(url).pathname;
  const firstSeg = pathname.split('/').filter(Boolean)[0] || '';
  const segs = pathname.split('/').filter(Boolean);
  const lastSeg = segs[segs.length - 1] || '';

  // Normaliza a URL de entrada para a RAIZ do artista (é ela que lista o
  // catálogo completo) em dois casos:
  //  1. A URL JÁ é o catálogo (/artista/musicas.html): o filtro de
  //     profundidade do discoverSongLinks descartaria TODAS as músicas
  //     (mesma profundidade do catálogo) — a raiz tem profundidade 1.
  //  2. A URL é uma página de MÚSICA (CifraClub: /artista/musica/): a página
  //     não lista o catálogo nem links de outras músicas no HTML — subimos
  //     para a raiz do artista (mesmo primeiro segmento) e varremos dela.
  if (firstSeg && /cifraclub/i.test(new URL(url).hostname)) {
    const isCatalogPage = /^musicas\.html?$/i.test(lastSeg);
    const isSongOrSubPage = segs.length >= 2 && !isCatalogPage;
    if (isCatalogPage || isSongOrSubPage) {
      // Caminho absoluto (com barra inicial): um caminho RELATIVO resolveria
      // contra o último segmento da base e viraria /artista/artista/ (404).
      url = new URL('/' + firstSeg + '/', url).href;
    }
  }

  const startedAt = Date.now();

  // PRIMÁRIO: catálogo completo via sitemaps oficiais (veja função acima).
  // Se o artista está no índice e os arquivos baixarem, retorna direto — o
  // fluxo HTML abaixo não acharia mais que ~25 músicas de qualquer forma.
  const viaSitemap = await discoverArtistSongLinksViaSitemap(url, {
    timeoutMs: options.timeoutMs || 0,
  });
  if (viaSitemap && viaSitemap.length > 0) {
    return options.limit ? viaSitemap.slice(0, options.limit) : viaSitemap;
  }

  // FALLBACK: fluxo HTML antigo (raiz + /musicas.html se existir) — mantido
  // para artistas fora do índice e para as outras plataformas.
  const html = await fetchHtml(url);
  const links = discoverSongLinks(html, url);
  const isUltimateGuitar = new URL(url).hostname.includes('ultimate-guitar');

  // Completa com o CATÁLOGO COMPLETO do artista (CifraClub: /musicas.html;
  // Ultimate-Guitar: paginação do js-store).
  const catalogUrls = isUltimateGuitar
    ? discoverUltimateGuitarNextPages(html, url)
    : discoverCatalogUrls(html, url);
  // Filtro pelo ARTISTA: usa o PRIMEIRO segmento da URL base — cobre a raiz
  // (/roberto-carlos/) E páginas de música (/roberto-carlos/detalhes/).
  const artistPrefix = firstSeg ? `/${firstSeg}` : '';
  const seenUrls = new Set(links.map((l) => l.url));

  for (const catalogUrl of catalogUrls) {
    if (options.timeoutMs && Date.now() - startedAt > options.timeoutMs) break;
    // Já temos links suficientes? Não busca mais páginas (evita requests
    // desperdiçados em testes/limites pequenos).
    if (options.limit && links.length >= options.limit) break;
    try {
      const catHtml = await fetchHtml(catalogUrl);
      const catLinks = discoverSongLinks(catHtml, url).filter((l) => {
        if (isUltimateGuitar) return true;
        const p = new URL(l.url).pathname.replace(/\/$/, '');
        // Só links DENTRO do catálogo do próprio artista (evita prefixo
        // comum falso-positivo: /chitaozinho-e-xororo2/musica/ não passa).
        return p === artistPrefix || p.startsWith(artistPrefix + '/');
      });
      for (const l of catLinks) {
        if (!seenUrls.has(l.url)) {
          seenUrls.add(l.url);
          links.push(l);
        }
      }
    } catch {
      // catálogo indisponível — segue com o que já tem
    }
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  }

  return options.limit ? links.slice(0, options.limit) : links;
}

/**
 * Scrape de todas as músicas de um artista/página de lista.
 * - Descobre o CATÁLOGO COMPLETO (raiz + /musicas.html) via discoverArtistSongLinks
 * - Processa cada música com delay educado
 * - Ignora duplicados existentes (por título+artista)
 * Retorna { songs, errors, totalEncontradas, duplicadosIgnorados }
 */
export async function scrapeArtistPage(
  pageUrl: string,
  options: ScrapeArtistOptions = {}
): Promise<{
  songs: Song[];
  errors: { url: string; error: string }[];
  total: number;
  duplicates: number;
  /** true se parou por estourar o timeout (artista incompleto). */
  timedOut: boolean;
}> {
  const limit = options.limit || 30;
  // Override operacional: CRON_PAGE_DELAY_MS manda sobre o delay da
  // plataforma (ex.: rodar devagar após bloqueio 403 do site de origem).
  const envDelay = Number.parseInt(process.env.CRON_PAGE_DELAY_MS ?? '', 10);
  const delayMs =
    Number.isFinite(envDelay) && envDelay >= 0
      ? envDelay
      : (options.delayMs ?? 600);
  const timeoutMs = options.timeoutMs || 0;
  const startedAt = Date.now();
  const url = normalizeUrl(pageUrl);

  // Descobre raiz + catálogo completo numa função só (com limite e timeout).
  const links = await discoverArtistSongLinks(url, { limit, delayMs, timeoutMs });
  const cappedLinks = links.slice(0, limit);

  const songs: Song[] = [];
  const errors: { url: string; error: string }[] = [];
  let duplicates = 0;
  let timedOut = false;
  const seenKeys = new Set<string>();

  for (let i = 0; i < cappedLinks.length; i++) {
    // Timeout educado: para no meio do artista sem perder o progresso.
    // Na próxima execução o mesmo artista é reprocessado e o dedupe pula
    // as músicas já importadas (idempotente).
    if (timeoutMs > 0 && Date.now() - startedAt > timeoutMs) {
      timedOut = true;
      break;
    }

    const link = cappedLinks[i];
    const key = `${link.artist.toLowerCase()}|${link.title.toLowerCase()}`;
    if (seenKeys.has(key)) {
      duplicates++;
      continue;
    }
    seenKeys.add(key);

    try {
      // Uma música pode gerar MAIS de uma entrada: a versão original + a
      // SIMPLIFICADA ("Título (Simplificada)") quando o CifraClub a oferece.
      const variants = await scrapeSongWithVariants(link.url);
      for (const song of variants) {
        // Rede de segurança: nunca deixa um trecho de cifra virar artista/título
        if (isJunkArtistName(song.artist) || isJunkTitle(song.title)) {
          errors.push({ url: link.url, error: 'Metadados inválidos (artista/título-lixo) descartados.' });
          continue;
        }
        songs.push(song);
      }
    } catch (e: any) {
      errors.push({ url: link.url, error: e?.message || 'Erro desconhecido' });
    }

    options.onProgress?.(i + 1, cappedLinks.length, link);

    if (i < cappedLinks.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { songs, errors, total: cappedLinks.length, duplicates, timedOut };
}

/** Expõe os acordes detectados (para preview). */
export function detectChordsOfContent(content: string): string[] {
  return extractUniqueChords(content, 0);
}

/**
 * Idioma da plataforma de origem, pelo hostname — espelha o lang que o cron
 * aplica (cifraclub→pt, ufret→ja, guitaretab→multi, ukutabs→en). As sugestões
 * da home filtram por idioma da interface, então cada música importada deve
 * carregar o lang de onde veio.
 */
export function inferPlatformLang(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('cifraclub')) return 'pt';
    if (host.includes('ufret')) return 'ja';
    if (host.includes('guitaretab')) return 'multi';
    if (host.includes('ukutabs')) return 'en';
    if (host.includes('ultimate-guitar')) return 'en';
  } catch {
    // URL inválida
  }
  return undefined;
}

export interface ScrapeLinksChunkOptions {
  /** Índice inicial dentro da lista de links (0 = primeira música). */
  offset?: number;
  /** Quantas músicas processar nesta chamada (padrão 6). */
  count?: number;
  /** Atraso educado entre músicas (ms). */
  delayMs?: number;
  /** Idioma da plataforma de origem (aplicado às músicas sem lang). */
  lang?: string;
}

export interface ScrapeLinksChunkResult {
  /** Tamanho total do catálogo (para o cliente calcular o progresso). */
  total: number;
  offset: number;
  count: number;
  songs: Song[];
  errors: { url: string; error: string }[];
}

/**
 * Processa uma FAIXA do catálogo de um artista (usado pelo importador em
 * lote da área admin). Cada chamada processa `count` links com:
 *  - variantes simplificadas ("Título (Simplificada)" quando existem);
 *  - delay educado entre músicas (não bombardeia o site de origem);
 *  - filtro de lixo (artista/título inválidos) e idioma da plataforma.
 * Retorna as músicas prontas + erros + o total do catálogo, para o cliente
 * avançar o offset até concluir. Idempotente: o cliente deduplica antes de
 * salvar, então interromper e retomar não duplica nada.
 */
export async function scrapeLinksChunk(
  links: ScrapedLink[],
  options: ScrapeLinksChunkOptions = {}
): Promise<ScrapeLinksChunkResult> {
  const offset = Math.max(0, options.offset || 0);
  const count = Math.max(1, Math.min(options.count || 6, 12));
  const slice = links.slice(offset, offset + count);
  const songs: Song[] = [];
  const errors: { url: string; error: string }[] = [];

  for (let i = 0; i < slice.length; i++) {
    const link = slice[i];
    try {
      // Uma música pode gerar MAIS de uma entrada: a original + a
      // SIMPLIFICADA ("Título (Simplificada)") quando o CifraClub a oferece.
      const variants = await scrapeSongWithVariants(link.url);
      for (const s of variants) {
        // Rede de segurança: trecho de cifra nunca vira artista/título
        if (isJunkArtistName(s.artist) || isJunkTitle(s.title)) continue;
        if (options.lang && !s.lang) s.lang = options.lang;
        songs.push(s);
      }
    } catch (e: any) {
      errors.push({ url: link.url, error: e?.message || 'Erro desconhecido' });
    }

    if (i < slice.length - 1 && options.delayMs) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  return { total: links.length, offset, count: slice.length, songs, errors };
}
