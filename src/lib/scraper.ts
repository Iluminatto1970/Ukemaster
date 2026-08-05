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
} from '../utils/chordUtils';
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
export async function fetchHtml(url: string): Promise<string> {
  // Timeout absoluto: um link travado não pode pendurar o cron inteiro.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
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
    return await res.text();
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
export function discoverSongLinks(html: string, baseUrl: string): ScrapedLink[] {
  const links: ScrapedLink[] = [];
  const seen = new Set<string>();
  const base = new URL(baseUrl);
  const baseDepth = base.pathname.split('/').filter(Boolean).length;

  // Regex de hrefs relativos de música: "/artista/musica" (+ .html ou /)
  // Ex.: /alceu-valenca/anunciacao.html | /alceu-valenca/anunciacao/
  const hrefRegex = /href="(\/(?:[a-z0-9-]+\/)+[a-z0-9-]+(?:\.[a-z]+)?\/?)"/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = match[1];
    if (!rawHref || rawHref.includes('://')) continue;

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

    // Ignora versões que NÃO são cifra principal (CifraClub usa sufixos):
    // "musica-letra", "musica-video-aula", "musica-tab", "musica-solos",
    // "musica-guitarpro", "musica-backing-track"…
    const nonChordVersion = /-(letra|letras|video-aula|videoaula|tab|tabs|solos|solo|guitarpro|cifra-simplificada|simplificada|backing-track|playback|partitura|exercicios)$/i;
    if (nonChordVersion.test(slugTitle)) continue;

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
  /^[^a-zà-ú0-9]{1,4}$/i, // símbolos curtos (ex.: "-======-", "|-", "0")
  /^\d+$/, // só números
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

  // Remove tags restantes e decodifica entidades básicas
  text = text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');

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
function decodeEntities(s: string): string {
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
};

/** Inferência simples de categoria a partir do artista. */
export function inferCategory(artist: string): string {
  const normalizeForMatch = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();

  const normalized = normalizeForMatch(artist);

  // Match parcial: "jorge e mateus" casa com qualquer nome contendo.
  // Chaves do mapa são normalizadas (sem acentos) para casar com o artista.
  for (const [key, cat] of Object.entries(ARTIST_CATEGORY)) {
    const normKey = normalizeForMatch(key);
    if (normalized.includes(normKey) || normKey.includes(normalized)) {
      return cat;
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
 * Faz o scrape de UMA música: busca o HTML, extrai a cifra, roda o conversor
 * automático (formato [C], tom, dificuldade) e o gerador de SEO.
 * Retorna uma Song pronta para ser adicionada ao acervo.
 */
export async function scrapeSong(url: string): Promise<Song> {
  const html = await fetchHtmlWithRetry(url);
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
  const artistRaw =
    extractedMeta.artist !== 'Artista Desconhecido' &&
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
  const difficulty = (extractedMeta.difficulty === 'Iniciante' ? 'Simplificado'
    : extractedMeta.difficulty === 'Intermediário' ? 'Médio'
    : extractedMeta.difficulty || 'Simplificado') as Song['difficulty'];

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
 * Scrape de todas as músicas de um artista/página de lista.
 * - Descobre os links na página
 * - Se houver filtro alfabético (A-Z), varre as sub-páginas para capturar o
 *   CATÁLOGO COMPLETO do artista (CifraClub lista só uma parte na página raiz)
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
  const delayMs = options.delayMs ?? 600;
  const timeoutMs = options.timeoutMs || 0;
  const startedAt = Date.now();
  const url = normalizeUrl(pageUrl);

  const html = await fetchHtml(url);
  const links = discoverSongLinks(html, url);

  // Completa com o CATÁLOGO COMPLETO do artista (CifraClub: /musicas.html
  // lista todas as músicas; a raiz mostra só as principais).
  const catalogUrls = discoverCatalogUrls(html, url);
  const artistPrefix = new URL(url).pathname.replace(/\/$/, '');
  const seenUrls = new Set(links.map((l) => l.url));
  for (const catalogUrl of catalogUrls) {
    if (timeoutMs > 0 && Date.now() - startedAt > timeoutMs) break;
    try {
      const catHtml = await fetchHtml(catalogUrl);
      // BUGFIX: o catálogo (/artista/musicas.html) TEM profundidade 2, e as
      // músicas também têm 2 — usar a URL do catálogo como base faz o filtro
      // `parts.length <= baseDepth` descartar TODAS as músicas. Usamos a raiz
      // do ARTISTA (profundidade 1) como base e filtramos só links do próprio
      // artista (evita trazer músicas de artistas vizinhos da navegação).
      const catLinks = discoverSongLinks(catHtml, url).filter((l) => {
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
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

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
      const song = await scrapeSong(link.url);
      // Rede de segurança: nunca deixa um trecho de cifra virar artista/título
      if (isJunkArtistName(song.artist) || isJunkTitle(song.title)) {
        errors.push({ url: link.url, error: 'Metadados inválidos (artista/título-lixo) descartados.' });
        continue;
      }
      songs.push(song);
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
