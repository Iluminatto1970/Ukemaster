/**
 * Motor do cron de plataformas: varre artistas por plataforma até sincronizar tudo, com dedupe anti-duplicata, histórico (cron_imports), cursor de progresso e modo REPARO (restaura conteúdo vazio preservando ids/votos).
 */
/**
 * Cron de plataformas de cifras — varre as plataformas ATÉ sincronizar tudo.
 *
 * Como funciona (cursor + histórico persistente no Supabase):
 *  - Cada execução processa UM OU MAIS artistas, respeitando um orçamento
 *    de tempo (um artista gigante pode ficar incompleto numa rodada).
 *  - ROTAÇÃO JUSTA: o progresso (índice do artista atual) é salvo na tabela
 *    `scrape_state` e SEMPRE avança para o próximo artista, mesmo em timeout
 *    — assim nenhum catálogo gigante monopoliza a fila. Na próxima execução
 *    continua do próximo artista; os incompletos são retomados quando a
 *    rotação completa o ciclo (o dedupe impede duplicatas).
 *  - Quando chega ao fim da lista de artistas, volta ao início (recomeça a
 *    varredura para pegar músicas novas publicadas no site de origem).
 *  - ANTI-DUPLICIDADE (3 camadas):
 *      1. `cron_imports` — histórico persistente de músicas já importadas
 *         (chave normalizada "titulo|artista"). A mesma música NUNCA é
 *         importada duas vezes, mesmo se a nuvem estiver indisponível.
 *      2. Acervo atual da tabela `songs` (título+artista já existentes).
 *      3. Dedupe em memória dentro da mesma rodada (scraper).
 *  - `cron_log` — histórico das execuções (o que cada rodada importou,
 *    pulou e errou, com duração).
 *  - Resultado: o acervo fica 100% alinhado com o site, sem duplicatas.
 */

import os from 'os';
import { scrapeArtistPage, isJunkArtistName, isJunkTitle } from './scraper.js';
import { CHORD_PLATFORMS } from './platforms.js';
import { CIFRACLUB_CATALOG } from '../data/cifraclubCatalog.js';
import type { Song } from '../types';

export interface PlatformCronOptions {
  /** Roda uma plataforma/artista específico (uso manual/admin). */
  platformId?: string;
  artistUrl?: string;
  limit?: number;
  /** Pula delays (modo manual rápido). */
  fast?: boolean;
  /** Força recomeçar do início da fila. */
  reset?: boolean;
  /** Orçamento de tempo em ms (padrão 50s — dentro do limite Vercel 60s). */
  timeBudgetMs?: number;
  /**
   * Modo REPARO: re-scrapeia e atualiza o CONTEÚDO de músicas existentes que
   * estão vazias (`content = ''`), preservando o id (votos/playlists intactos).
   * Usado após incidentes em que o push do frontend sobrescreveu o acervo com
   * cifras vazias. Sem ele, o dedupe pula essas músicas para sempre.
   */
  repairContent?: boolean;
  /**
   * Modo ATUALIZAÇÃO: re-scrapeia as músicas que JÁ EXISTEM no acervo e
   * renova o conteúdo/cifra/dificuldade/tom/categoria/SEO (preservando id,
   * votos, playlists e o título/artista do banco). É o "ver o que temos e
   * atualizar": sincroniza o acervo com o site de origem e aplica melhorias
   * retroativas (ex.: novas classificações de dificuldade e as variações
   * simplificadas, que entram como entradas novas). Sem ele, o dedupe pula
   * tudo que já está no acervo.
   */
  updateExisting?: boolean;
}

export interface PlatformCronResult {
  ok: boolean;
  ranAt: string;
  message?: string;
  totalImported: number;
  totalDuplicates: number;
  totalErrors: number;
  /** Músicas existentes com conteúdo vazio que foram REPARADAS (preservando id). */
  totalRepaired: number;
  /** Músicas EXISTENTES que foram ATUALIZADAS (modo updateExisting) — o "ver o que temos e atualizar". */
  totalUpdated: number;
  /** Músicas já presentes no acervo/histórico (artista já sincronizado). */
  totalAlreadyKnown: number;
  artistsProcessed: number;
  cursor: { platformIndex: number; artistIndex: number } | null;
  results: {
    platform: string;
    artistUrl: string;
    imported: number;
    duplicates: number;
    errors: number;
    repaired: number;
    updated: number;
    errorMessage?: string;
  }[];
}

interface ArtistJob {
  platformId: string;
  platformName: string;
  url: string;
  delayMs: number;
}

// ── Mapeamento Song (camelCase) ⇄ linha da tabela songs (snake_case) ────
// A tabela no Supabase usa colunas snake_case (created_at etc.); o frontend
// usa camelCase. O cron reusa o mesmo mapeamento do app (cloudSync.ts) para
// persistir corretamente.
function songToRow(s: Song) {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key ?? null,
    tempo: s.tempo ?? null,
    strumming_pattern: s.strummingPattern ?? null,
    youtube_url: s.youtubeUrl ?? null,
    youtube_id: s.youtubeId ?? null,
    content: s.content ?? null,
    simplified_content: s.simplifiedContent ?? null,
    difficulty: s.difficulty ?? null,
    category: s.category ?? null,
    tags: s.tags ?? [],
    seo_description: s.seoDescription ?? null,
    hashtags: s.hashtags ?? [],
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

// ── Acesso Supabase (server-side, sem depender de import.meta.env) ────────
export function getSupabaseEnv() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  return { url: url.replace(/\/+$/, ''), key };
}

// ── Autenticação como UkeMaster (conta do cron) ─────────────────────────
// O cron escreve no acervo (songs, cron_imports, cron_log, scrape_state).
// Para "nunca contribuir sem login" valer DE FATO no banco, o cron não usa
// mais o papel anônimo: faz login com a conta dedicada UkeMaster (password
// grant do Supabase Auth) e usa o JWT da sessão em todas as chamadas REST.
// Assim o RLS trata o cron como usuário autenticado (auth.uid() = UkeMaster).
//
// Configuração (env):
//   CRON_UKEMATER_EMAIL      e-mail da conta UkeMater (ukemater@...)
//   CRON_UKEMATER_PASSWORD   senha da conta UkeMater
// Sem essas vars o cron DEGRADA para o comportamento antigo (anon key) —
// útil durante a transição, mas as escritas passarão a falhar assim que o
// RLS de songs exigir login (migration-ukemater-cron.sql).
let cachedCronToken: string | null | undefined; // undefined = ainda não tentou
let cronTokenFetchedAt = 0;
const CRON_TOKEN_RETRY_MS = 5 * 60_000; // re-tenta login após 5 min de falha

async function getCronToken(url: string): Promise<string | null> {
  // Token já obtido → usa; falha recente → não martela o login (espera retry)
  if (cachedCronToken) return cachedCronToken;
  if (
    cachedCronToken === null &&
    Date.now() - cronTokenFetchedAt < CRON_TOKEN_RETRY_MS
  ) {
    return null;
  }
  const fetchedAt = Date.now();
  const email = process.env.CRON_UKEMATER_EMAIL;
  const password = process.env.CRON_UKEMATER_PASSWORD;
  if (!email || !password) {
    cachedCronToken = null;
    return null;
  }
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: getSupabaseEnv().key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      console.error(`[cron-auth] login UkeMaster falhou (HTTP ${res.status}) — usando anon key.`);
      cachedCronToken = null;
      cronTokenFetchedAt = fetchedAt;
      return null;
    }
    const data = (await res.json()) as { access_token?: string };
    cachedCronToken = data.access_token || null;
    cronTokenFetchedAt = fetchedAt;
  } catch (e) {
    console.error('[cron-auth] erro ao autenticar UkeMaster — usando anon key.', e);
    cachedCronToken = null;
    cronTokenFetchedAt = fetchedAt;
  }
  return cachedCronToken;
}

/** Headers padrão das chamadas REST: apikey do projeto + Bearer (JWT do
 * UkeMaster quando disponível, senão a anon key como fallback de transição). */
export async function cronHeaders(key: string): Promise<Record<string, string>> {
  const token = await getCronToken(getSupabaseEnv().url);
  return { apikey: key, Authorization: `Bearer ${token || key}` };
}

/**
 * Busca TODAS as linhas de uma tabela (paginação de 1000 em 1000).
 * Retorna [] se a tabela não existir ou a API falhar (degradação graciosa).
 */
async function fetchAllRows(
  url: string,
  key: string,
  table: string,
  columns: string,
  maxRows = 20_000
): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    try {
      const res = await fetch(
        `${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=${pageSize}&offset=${offset}`,
        { headers: await cronHeaders(key) }
      );
      if (!res.ok) return rows;
      const page = (await res.json()) as any[];
      rows.push(...page);
      if (page.length < pageSize) break;
    } catch {
      return rows;
    }
  }
  return rows;
}

/**
 * Enriquecimento com vídeo: busca a videoaula no YouTube (Data API v3) para
 * as músicas recém-importadas e grava youtube_id/youtube_url. Opcional — roda
 * SÓ se YOUTUBE_API_KEY estiver no ambiente (senão é no-op, zero custo).
 *
 * Cota: a API gratuita dá ~10.000 unidades/dia; cada busca = 100 unidades.
 * O maxPerRun (padrão 20) limita a ~2.000 unidades por execução. O app roda
 * a cada 30 min, então em 1 dia preenche o acervo novo sem estourar a cota.
 */
async function enrichWithYoutubeVideos(
  url: string,
  key: string,
  songs: Song[],
  maxPerRun = 20
): Promise<void> {
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey || songs.length === 0) return;

  const updates: { id: string; youtube_id: string; youtube_url: string }[] = [];
  let done = 0;
  for (const s of songs) {
    if (done >= maxPerRun) break;
    try {
      const q = encodeURIComponent(`${s.title} ${s.artist} cifra ukulele`);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${q}&key=${encodeURIComponent(ytKey)}`
      );
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      const data = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
      const videoId = data?.items?.[0]?.id?.videoId;
      if (videoId) {
        updates.push({
          id: s.id,
          youtube_id: videoId,
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        });
        done++;
      }
      // Respeita a cota/rate limit do Google
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      // segue sem vídeo — nunca derruba o cron
    }
  }

  if (updates.length > 0) {
    try {
      await fetch(`${url}/rest/v1/songs`, {
        method: 'POST',
        headers: {
          ...(await cronHeaders(key)),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(updates),
      });
    } catch {
      // não derruba o cron
    }
  }
}

/** Upsert em lote com `resolution=merge-duplicates` (idempotente). */
async function upsertRows(url: string, key: string, table: string, rows: any[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        ...(await cronHeaders(key)),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[upsert ${table}] HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(`Supabase upsert em ${table} falhou (${res.status}): ${text.slice(0, 200)}`);
    }
    return true;
  } catch (e) {
    // Tabela pode não existir ainda (schema não executado) — não derruba o cron
    return false;
  }
}

async function fetchExistingSongs(url: string, key: string): Promise<Song[]> {
  // category entra para o modo ATUALIZAÇÃO preservar categorias reais já
  // corrigidas no banco (se a inferência do scraper falhar e disser 'Outros').
  const rows = await fetchAllRows(url, key, 'songs', 'id,title,artist,category');
  return rows as Song[];
}

/**
 * Busca as músicas com conteúdo VAZIO (`content = ''`) — alvo do modo reparo.
 * O incidente real: o push do frontend (que roda com cache local sem content)
 * sobrescreveu o acervo inteiro com cifras vazias. Estas linhas mantêm
 * metadados bons (título/artista) e ids que votos/playlists referenciam.
 */
async function fetchEmptyContentSongs(
  url: string,
  key: string
): Promise<{ id: string; title: string; artist: string }[]> {
  const rows: { id: string; title: string; artist: string }[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20_000; offset += pageSize) {
    try {
      const res = await fetch(
        `${url}/rest/v1/songs?select=${encodeURIComponent('id,title,artist')}&content=eq.&limit=${pageSize}&offset=${offset}`,
        { headers: await cronHeaders(key) }
      );
      if (!res.ok) return rows;
      const page = (await res.json()) as { id: string; title: string; artist: string }[];
      rows.push(...page);
      if (page.length < pageSize) break;
    } catch {
      return rows;
    }
  }
  return rows;
}

/** Chaves ("titulo|artista" normalizado) do histórico de importações. */
async function fetchCronImportKeys(url: string, key: string): Promise<Set<string>> {
  const rows = await fetchAllRows(url, key, 'cron_imports', 'song_key');
  return new Set(rows.map((r) => r.song_key as string));
}

/**
 * true se a coluna existe na tabela (cache). O schema.sql ganha a coluna
 * `repaired` no cron_log — mas se o banco ainda não foi migrado, o log NÃO
 * pode incluí-la (PostgREST rejeita chaves desconhecidas e o histórico da
 * rodada inteira deixaria de ser gravado em silêncio).
 */
let repairedColumnCache: { exists: boolean } | null = null;
async function hasRepairedColumn(url: string, key: string): Promise<boolean> {
  if (repairedColumnCache) return repairedColumnCache.exists;
  try {
    const res = await fetch(
      `${url}/rest/v1/cron_log?select=${encodeURIComponent('repaired')}&limit=1`,
      { headers: await cronHeaders(key) }
    );
    repairedColumnCache = { exists: res.ok };
  } catch {
    repairedColumnCache = { exists: false };
  }
  return repairedColumnCache.exists;
}

/**
 * true se a coluna `worker` existe no cron_log (cache) — mesmo padrão do
 * `repaired`: pré-migração o log NÃO inclui a coluna (PostgREST rejeita
 * chaves desconhecidas e o histórico da rodada deixaria de ser gravado).
 */
let workerColumnCache: { exists: boolean } | null = null;
async function hasWorkerColumn(url: string, key: string): Promise<boolean> {
  if (workerColumnCache) return workerColumnCache.exists;
  try {
    const res = await fetch(
      `${url}/rest/v1/cron_log?select=${encodeURIComponent('worker')}&limit=1`,
      { headers: await cronHeaders(key) }
    );
    workerColumnCache = { exists: res.ok };
  } catch {
    workerColumnCache = { exists: false };
  }
  return workerColumnCache.exists;
}

async function readCursor(url: string, key: string): Promise<{ platformIndex: number; artistIndex: number }> {
  try {
    const res = await fetch(`${url}/rest/v1/scrape_state?key=eq.platform_cursor&select=value`, {
      headers: await cronHeaders(key),
    });
    if (!res.ok) return { platformIndex: 0, artistIndex: 0 };
    const rows = (await res.json()) as { value: any }[];
    const v = rows?.[0]?.value;
    if (v && typeof v.platformIndex === 'number' && typeof v.artistIndex === 'number') {
      return { platformIndex: v.platformIndex, artistIndex: v.artistIndex };
    }
  } catch {
    // tabela pode não existir ainda → recomeça
  }
  return { platformIndex: 0, artistIndex: 0 };
}

async function writeCursor(
  url: string,
  key: string,
  cursor: { platformIndex: number; artistIndex: number }
): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/scrape_state`, {
      method: 'POST',
      headers: {
        ...(await cronHeaders(key)),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        {
          key: 'platform_cursor',
          value: cursor,
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  } catch {
    // se falhar, o cron ainda roda — só não persiste o progresso
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const songKey = (s: { title: string; artist: string }) => normalize(`${s.title}|${s.artist}`);

/**
 * Match flexível de título para o modo REPARO.
 *
 * O scraper original (do incidente) gravou títulos sujos tipo "Coldplay\n42"
 * (artista embutido no título). A chave exata normalize(título|artista) então
 * NÃO bate com a cifra limpa que o scraper atual produz ("42") — e o repair
 * acabava criando uma linha NOVA em vez de preencher a existente, gerando
 * duplicatas. Aqui comparamos com tolerância: remove o nome do artista do
 * início do título do banco antes de comparar, e aceita contenção mútua.
 */
function flexibleTitleMatch(scraperTitle: string, scraperArtist: string, dbTitle: string): boolean {
  const t1 = normalize(scraperTitle);
  const t2 = normalize(dbTitle);
  if (!t1 || !t2) return false;
  if (t1 === t2) return true;
  // Remove nome do artista repetido no início do título do banco (lixo do incidente)
  const art = normalize(scraperArtist);
  let t2clean = t2;
  if (art && t2.startsWith(art) && t2.length > art.length) {
    t2clean = t2.slice(art.length);
  }
  if (!t2clean) return false;
  if (t1 === t2clean) return true;
  // Título curto (< 4 chars, ex.: "42"): SÓ casa por igualdade exata — nunca
  // por endsWith, que casaria "42" com "402" (falso-positivo que corromperia
  // o conteúdo da linha errada).
  if (t1.length < 4 || t2clean.length < 4) {
    return false;
  }
  // Contenção mútua só com tamanhos próximos (evita "Boa Noite" casar com
  // "Noite", ou "Stand By Me" com "By"): diferença máx. de 2 caracteres e
  // o menor termo com >= 4 chars. Ainda cobre "Fogão de Lenha" vs
  // "Obras de Poeta / Fogão de Lenha / No Rancho Fundo" quando o título
  // sujo começa com o nome do artista (já removido acima).
  const a = t1;
  const b = t2clean;
  if (Math.abs(a.length - b.length) <= 2) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

/**
 * Constrói a fila de artistas a partir das plataformas habilitadas.
 * Plataformas `catalogBased` (CifraClub) consomem o ÍNDICE DE CATÁLOGO
 * (src/data/cifraclubCatalog.ts — 667 artistas × 98 gêneros); plataformas
 * `artistQuery` (U-FRET) montam a URL por NOME de artista.
 *
 * FILTRO POR MÁQUINA: a env opcional CRON_PLATFORMS (ex.: "cifraclub-br,
 * ufret-ja") restringe a fila desta máquina às plataformas listadas. Útil
 * para dividir o trabalho entre as máquinas do proprietário (ex.: Acer roda
 * pt+ja, Windows roda en+int) sem disputar o lease entre si.
 */
function buildArtistQueue(): ArtistJob[] {
  const queue: ArtistJob[] = [];
  const only = (process.env.CRON_PLATFORMS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const platform of CHORD_PLATFORMS) {
    if (!platform.enabled) continue;
    if (only.length > 0 && !only.includes(platform.id.toLowerCase())) continue;
    if (platform.catalogBased) {
      for (const artist of CIFRACLUB_CATALOG) {
        queue.push({
          platformId: platform.id,
          platformName: platform.name,
          url: `https://www.cifraclub.com.br/${artist.slug}/`,
          delayMs: platform.delayMs,
        });
      }
      continue;
    }
    if (platform.artistQuery) {
      for (const name of platform.artistQuery.names) {
        queue.push({
          platformId: platform.id,
          platformName: platform.name,
          url: platform.artistQuery.buildUrl(name),
          delayMs: platform.delayMs,
        });
      }
      continue;
    }
    for (const artistPage of platform.artistPages) {
      queue.push({
        platformId: platform.id,
        platformName: platform.name,
        url: artistPage,
        delayMs: platform.delayMs,
      });
    }
  }
  return queue;
}

// ── LEASE DE WORKER (multimáquina sem duplicação) ───────────────────────
// A Vercel (1x/dia) e as máquinas locais (a cada 30 min) compartilham a
// MESMA fila e o MESMO cursor no Supabase. Sem proteção, duas execuções
// simultâneas processariam o mesmo artista (o dedupe evita duplicatas, mas
// desperdiça requisições e disputa o site).
//
// Solução: um LEASE ATÔMICO na tabela scrape_state (key='worker_lease').
//  - acquire: PATCH condicional que SÓ vence se o lease atual estiver
//    expirado/ausente (PostgREST: filtro na coluna jsonb `value->>expiresAt`).
//    O PATCH com filtro é atômico: apenas UMA requisição vence.
//  - renew (heartbeat): a cada artista processado, estende a expiração.
//  - release: ao terminar, libera para a próxima máquina imediatamente.
//  - Se uma máquina cair, o lease expira sozinho (TTL) e outra assume.
const LEASE_KEY = 'worker_lease';
const LEASE_TTL_MS = 25 * 60_000; // 25 min > maior orçamento local (15 min)

/**
 * Nome desta máquina/worker — usado no lease e no cron_log para o painel
 * admin saber quem rodou por último. Ordem de prioridade:
 *   1. CRON_WORKER_NAME (env das máquinas: 'acer', 'windows'...);
 *   2. 'vercel' quando rodando na Vercel (sandbox sem hostname útil);
 *   3. hostname do sistema (sanitizado, máx. 30 chars).
 */
export function getWorkerName(): string {
  const fromEnv = process.env.CRON_WORKER_NAME;
  if (fromEnv) {
    return fromEnv.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'unknown';
  }
  if (process.env.VERCEL) return 'vercel';
  try {
    return (
      os
        .hostname()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 30) || 'unknown'
    );
  } catch {
    return 'unknown';
  }
}

function workerId(): string {
  return `worker-${getWorkerName()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cria a linha do lease se ainda não existir (nunca sobrescreve).
 * Retorna true se a escrita foi aceita. Se false, a infra de lease NÃO está
 * disponível (RLS bloqueia INSERT, schema não aplicado...) — o acquire
 * deve DEGRADAR e o cron processar mesmo assim (o dedupe protege).
 */
async function ensureLeaseRow(url: string, key: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/scrape_state`, {
      method: 'POST',
      headers: {
        ...(await cronHeaders(key)),
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify([{ key: LEASE_KEY, value: {}, updated_at: new Date().toISOString() }]),
    });
    // 42501/401 = RLS sem policy (infra indisponível); 2xx = aceito
    return res.ok;
  } catch {
    // tabela ausente / erro de rede — segue sem lease (modo degradado)
    return false;
  }
}

/**
 * Resultado da tentativa de adquirir o lease:
 *  - 'acquired': esta máquina venceu o lease e pode processar.
 *  - 'held': outra máquina detém o lease ativo → esta execução espera.
 *  - 'unavailable': a tabela/infra do lease falhou (schema não aplicado,
 *    erro de rede...) → o cron DEGRADA e processa mesmo assim (o dedupe
 *    em 3 camadas continua protegendo contra duplicatas).
 */
type LeaseAcquireResult = 'acquired' | 'held' | 'unavailable';

/**
 * Tenta adquirir o lease de forma ATÔMICA. O PATCH só atualiza a linha se
 * `value->>expiresAt` for nulo OU anterior a agora (lease expirado) — como
 * é uma única query atômica, duas máquinas simultâneas NÃO vencem juntas
 * (o Postgres serializa o UPDATE...WHERE; a segunda não casa mais o filtro).
 *
 * IMPORTANTE (degradação): se a tabela scrape_state não existir (schema
 * ainda não aplicado) ou a infra falhar, retorna 'unavailable' — o cron
 * SEGUE processando (comportamento histórico: "sem scrape_state o cron
 * continua funcionando"). Só 'held' (outra máquina de fato detém o lease
 * ativo) faz a execução esperar.
 */
async function acquireLease(
  url: string,
  key: string,
  id: string,
  ttlMs = LEASE_TTL_MS
): Promise<LeaseAcquireResult> {
  // Se a escrita do lease é bloqueada (RLS sem policy / schema antigo),
  // a infra NÃO está disponível → degrada e processa (não espera).
  if (!(await ensureLeaseRow(url, key))) return 'unavailable';
  const now = new Date().toISOString();
  try {
    const res = await fetch(
      `${url}/rest/v1/scrape_state?key=eq.${LEASE_KEY}&or=(value->>expiresAt.is.null,value->>expiresAt.lt.${now})`,
      {
        method: 'PATCH',
        headers: {
          ...(await cronHeaders(key)),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          value: { workerId: id, expiresAt: new Date(Date.now() + ttlMs).toISOString() },
          updated_at: now,
        }),
      }
    );
    if (!res.ok) return 'unavailable';
    const rows = (await res.json()) as { value?: { workerId?: string } }[];
    // 0 linhas = outra máquina detém o lease ATIVO (a escrita funciona,
    // então é competição real) → held. 1 linha com nosso id = acquired.
    return rows?.[0]?.value?.workerId === id ? 'acquired' : 'held';
  } catch {
    // Erro de rede/infra → degrada (o dedupe protege)
    return 'unavailable';
  }
}

/** Heartbeat: estende o lease — só quem o detém consegue renovar. */
async function renewLease(url: string, key: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    await fetch(
      `${url}/rest/v1/scrape_state?key=eq.${LEASE_KEY}&value->>workerId=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          ...(await cronHeaders(key)),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          value: { workerId: id, expiresAt: new Date(Date.now() + LEASE_TTL_MS).toISOString() },
          updated_at: now,
        }),
      }
    );
  } catch {
    // heartbeat falhou — o TTL cobre até a próxima renovação
  }
}

/** Libera o lease ao terminar (a próxima máquina assume sem esperar TTL). */
async function releaseLease(url: string, key: string, id: string): Promise<void> {
  try {
    await fetch(
      `${url}/rest/v1/scrape_state?key=eq.${LEASE_KEY}&value->>workerId=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          ...(await cronHeaders(key)),
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ value: {}, updated_at: new Date().toISOString() }),
      }
    );
  } catch {
    // sem problema — o lease expira sozinho
  }
}

/** Roda o cron. Retorna um resumo estruturado (nunca lança). */
export async function runPlatformCron(options: PlatformCronOptions = {}): Promise<PlatformCronResult> {
  const ranAt = new Date().toISOString();
  const timeBudgetMs = options.timeBudgetMs ?? 50_000;
  const startedAt = Date.now();

  const result: PlatformCronResult = {
    ok: true,
    ranAt,
    totalImported: 0,
    totalDuplicates: 0,
    totalErrors: 0,
    totalRepaired: 0,
    totalUpdated: 0,
    totalAlreadyKnown: 0,
    artistsProcessed: 0,
    cursor: null,
    results: [],
  };

  const sb = getSupabaseEnv();
  const hasDb = Boolean(sb.url && sb.key);

  // Fila de artistas (todas as plataformas habilitadas)
  const queue = buildArtistQueue();
  if (queue.length === 0) {
    result.message = 'Nenhuma plataforma habilitada no registro.';
    return result;
  }

  // ── Lease multimáquina: uma execução por vez por fila compartilhada ──
  // Só vale no modo automático (cursor). Execuções manuais (--artist,
  // --platform) são intencionais e não disputam a fila com outras máquinas.
  // 'unavailable' (tabela ausente/erro) DEGRADA: processa mesmo assim —
  // só 'held' (outra máquina com lease ativo) adia a execução.
  const isAutoMode = !options.platformId && !options.artistUrl;
  const leaseId = workerId();
  const leaseResult =
    isAutoMode && hasDb ? await acquireLease(sb.url, sb.key, leaseId) : 'acquired';
  if (leaseResult === 'held') {
    result.message = 'Outra máquina está processando a fila agora (lease ativo). Execução adiada — nada foi processado para evitar duplicação.';
    return result;
  }
  const acquiredLease = leaseResult === 'acquired';
  const release = async () => {
    if (isAutoMode && hasDb && acquiredLease) await releaseLease(sb.url, sb.key, leaseId);
  };

  // Posição inicial: cursor persistido OU manual (plataforma/artista)
  let cursor = { platformIndex: 0, artistIndex: 0 };
  if (options.reset) {
    cursor = { platformIndex: 0, artistIndex: 0 };
  } else if (options.platformId || options.artistUrl) {
    cursor = { platformIndex: 0, artistIndex: 0 };
  } else if (hasDb) {
    cursor = await readCursor(sb.url, sb.key);
  }
  result.cursor = { ...cursor };

  // Camadas anti-duplicidade: acervo atual + histórico persistente de importações
  const existing = hasDb ? await fetchExistingSongs(sb.url, sb.key) : [];
  const existingKeys = new Set(existing.map(songKey));
  const cronKeys = hasDb ? await fetchCronImportKeys(sb.url, sb.key) : new Set<string>();

  // Modo REPARO: mapa chave → id das músicas com conteúdo vazio. Estas serão
  // re-scrapeadas e ATUALIZADAS no mesmo id (não importadas de novo), então
  // votos (song_votes) e playlists que referenciam o id continuam válidos.
  // Guarda o REGISTRO completo (id + metadados originais): o título do banco
  // pode ser mais rico que o do scraper (ex.: "Obras de Poeta / Fogão de
  // Lenha / No Rancho Fundo (Pot-Pourri)" vs slug "Obras de Poeta") — no
  // repair preservamos título/artista do banco e só atualizamos o conteúdo.
  // Músicas EXISTENTES candidatas a ATUALIZAÇÃO (modos repair/update):
  // chave normalizada → registro. O repair mira só as de conteúdo vazio;
  // o updateExisting mira o acervo TODO ("ver o que temos e atualizar").
  const emptyContentById = new Map<string, { id: string; title: string; artist: string }>();
  // Índice secundário por ARTISTA normalizado: usado quando a chave exata
  // (título|artista) não bate por causa de títulos sujos no banco (ex.:
  // "Coldplay\n42"). O repair/update então casa por artista + match
  // flexível de título, atualizando a linha EXISTENTE em vez de criar
  // duplicata.
  const emptyByArtist = new Map<string, { id: string; title: string; artist: string }[]>();
  if (options.repairContent && hasDb) {
    const emptyRows = await fetchEmptyContentSongs(sb.url, sb.key);
    emptyRows.forEach((r) => {
      emptyContentById.set(songKey(r), r);
      const a = normalize(r.artist);
      if (!a) return;
      const list = emptyByArtist.get(a) || [];
      list.push(r);
      emptyByArtist.set(a, list);
    });
  } else if (options.updateExisting && hasDb) {
    // Modo ATUALIZAÇÃO: todo o acervo atual é alvo (não só o que está vazio)
    existing.forEach((r) => {
      emptyContentById.set(songKey(r), r);
      const a = normalize(r.artist);
      if (!a) return;
      const list = emptyByArtist.get(a) || [];
      list.push(r);
      emptyByArtist.set(a, list);
    });
  }

  // Modo manual: fila só com o solicitado
  let jobs: ArtistJob[] = [];
  if (options.artistUrl) {
    const platform = queue.find((q) => q.platformId === options.platformId) || queue[0];
    jobs = [{ ...platform, url: options.artistUrl, delayMs: options.fast ? 0 : platform.delayMs }];
  } else if (options.platformId) {
    jobs = queue.filter((q) => q.platformId === options.platformId);
  } else {
    // Modo automático: começa do cursor e gira pela fila inteira
    const startFlat = cursor.platformIndex * 1000 + cursor.artistIndex;
    for (let flat = 0; flat < queue.length; flat++) {
      const idx = (startFlat + flat) % queue.length;
      jobs.push(queue[idx]);
    }
  }

  // Histórico a gravar no final (cron_log) + novas importações (cron_imports)
  const runLogRows: any[] = [];
  const importHistoryRows: any[] = [];
  // Nome do worker desta rodada (calculado sob demanda, cacheado por rodada)
  let logWorkerName: string | null = null;

  // Processa até estourar o orçamento de tempo (sempre ao menos 1 artista)
  let wrapped = false;
  let timedOutLast = false;
  for (const item of jobs) {
    if (jobs.length > 1 && Date.now() - startedAt > timeBudgetMs && result.artistsProcessed > 0) {
      break;
    }

    const artistStart = Date.now();
    const entry = {
      platform: item.platformName,
      artistUrl: item.url,
      imported: 0,
      duplicates: 0,
      errors: 0,
      repaired: 0,
      updated: 0,
    } as {
      platform: string;
      artistUrl: string;
      imported: number;
      duplicates: number;
      errors: number;
      repaired: number;
      updated: number;
      errorMessage?: string;
    };

    try {
      // Processa o artista com timeout educado: se o tempo estiver perto do
      // limite, para NO MEIO do artista sem perder o que já importou (o dedupe
      // pula as já existentes na próxima passada).
      const remainingMs = Math.max(10_000, timeBudgetMs - (Date.now() - startedAt));
      const { songs, errors, duplicates, timedOut } = await scrapeArtistPage(item.url, {
        // Catálogo completo: artistas grandes passam de 300 (Roberto Carlos
        // tem ~617). O timeout educado encerra no meio sem perder progresso.
        limit: 2000,
        delayMs: options.fast ? 0 : item.delayMs,
        timeoutMs: options.fast ? 0 : remainingMs,
      });
      timedOutLast = timedOut;

      entry.duplicates = duplicates;
      entry.errors = errors.length;

      // Dedupe em 3 camadas: histórico de importações + acervo atual.
      // Rede de segurança extra: descarta lixo (artista/título inválido)
      // que porventura tenha escapado do scraper.
      //
      // No modo REPARO, músicas com conteúdo vazio NÃO são puladas: são
      // atualizadas no MESMO id (s.id = id existente) com a cifra recém-lida.
      const fresh: Song[] = [];
      const repairs: Song[] = [];
      // Atualizações de músicas EXISTENTES (modo updateExisting): mesmo
      // upsert por id, mas contadas à parte para o relatório.
      const updates: Song[] = [];
      // Dedupe por chave normalizada: duas URLs do catálogo podem scrapear
      // para o MESMO título|artista (ex.: variação de pot-pourri). Se dois
      // reparos levassem o mesmo id no mesmo upsert, o Postgres rejeita o
      // comando inteiro (21000: ON CONFLICT DO UPDATE cannot affect row a
      // second time) e nenhuma música seria salva nesta rodada.
      const seenThisArtist = new Set<string>();
      // Ids já agendados para reparo nesta rodada (impede o mesmo id aparecer
      // duas vezes no upsert — Postgres rejeitaria o lote com 21000).
      const repairedIdsThisArtist = new Set<string>();
      for (const s of songs) {
        if (isJunkArtistName(s.artist) || isJunkTitle(s.title)) continue;
        const k = songKey(s);
        if (seenThisArtist.has(k)) continue;
        seenThisArtist.add(k);
        let existing = emptyContentById.get(k);
        if (!existing) {
          // Chave exata não bateu → tenta artista + match flexível de título.
          // Cobre títulos sujos do incidente ("Coldplay\n42" vs "42").
          const art = normalize(s.artist);
          const candidates = art ? emptyByArtist.get(art) || [] : [];
          existing = candidates.find(
            (c) =>
              !repairedIdsThisArtist.has(c.id) &&
              flexibleTitleMatch(s.title, s.artist, c.title)
          );
        }
        if (existing) {
          if (repairedIdsThisArtist.has(existing.id)) continue;
          repairedIdsThisArtist.add(existing.id);
          // Preserva metadados ORIGINAIS do banco (título/artista podem ser
          // mais ricos que os do scraper); renova o conteúdo e a classificação.
          const updated: Song = { ...s, id: existing.id, title: existing.title, artist: existing.artist };
          // Guarda de categoria: se o banco já tem uma categoria REAL (≠
          // 'Outros') e o scraper não inferiu nenhuma, mantém a do banco —
          // evita que uma inferência falha regrida categorias já corrigidas.
          const existingCategory = (existing as any).category;
          if (
            existingCategory &&
            existingCategory !== 'Outros' &&
            (!updated.category || updated.category === 'Outros')
          ) {
            updated.category = existingCategory;
          }
          if (options.updateExisting) {
            updates.push(updated);
          } else {
            repairs.push(updated);
          }
        } else if (!cronKeys.has(k) && !existingKeys.has(k)) {
          fresh.push(s);
        }
      }

      if (repairs.length > 0 && hasDb) {
        // Upsert pela PK (id): como o id é o MESMO da linha existente, o
        // content é sobrescrito com a cifra nova — votos/playlists intactos.
        const repairOk = await upsertRows(sb.url, sb.key, 'songs', repairs.map(songToRow));
        if (repairOk) {
          repairs.forEach((s) => {
            existingKeys.add(songKey(s));
            emptyContentById.delete(songKey(s));
            // limpa também o índice por artista (não reparar de novo)
            const a = normalize(s.artist);
            if (a) {
              const list = emptyByArtist.get(a);
              if (list) emptyByArtist.set(a, list.filter((c) => c.id !== s.id));
            }
          });
          entry.repaired = repairs.length;
        } else {
          entry.errorMessage = 'Falha ao reparar conteúdo no Supabase.';
          entry.errors += repairs.length;
        }
      }

      // Modo ATUALIZAÇÃO: grava as músicas existentes renovadas (mesmo
      // upsert por id — votos/playlists intactos) e reporta no relatório.
      if (updates.length > 0 && hasDb) {
        const updateOk = await upsertRows(sb.url, sb.key, 'songs', updates.map(songToRow));
        if (updateOk) {
          updates.forEach((s) => {
            existingKeys.add(songKey(s));
            emptyContentById.delete(songKey(s));
            const a = normalize(s.artist);
            if (a) {
              const list = emptyByArtist.get(a);
              if (list) emptyByArtist.set(a, list.filter((c) => c.id !== s.id));
            }
          });
          entry.updated = updates.length;
        } else {
          entry.errorMessage = 'Falha ao atualizar músicas existentes no Supabase.';
          entry.errors += updates.length;
        }
      }

      if (fresh.length > 0 && hasDb) {
        const upsertOk = await upsertRows(sb.url, sb.key, 'songs', fresh.map(songToRow));
        if (upsertOk) {
          // Vídeo do YouTube (opcional, requer YOUTUBE_API_KEY) — enriquece
          // as novas importações desta rodada sem travar o loop do cron.
          await enrichWithYoutubeVideos(sb.url, sb.key, fresh);
          fresh.forEach((s) => {
            existingKeys.add(songKey(s));
            cronKeys.add(songKey(s));
          });
          entry.imported = fresh.length;

          // Registra no histórico anti-duplicidade (se a tabela existir)
          fresh.forEach((s) => {
            importHistoryRows.push({
              song_key: songKey(s),
              url: item.url,
              platform: item.platformName,
              imported_at: new Date().toISOString(),
            });
          });
        } else {
          entry.errorMessage = 'Falha ao persistir no Supabase (tabela songs ausente?).';
          entry.errors += fresh.length;
        }
      } else if (fresh.length > 0) {
        entry.imported = fresh.length;
        entry.errorMessage = 'Supabase não configurado — músicas detectadas mas não persistidas.';
      } else if (songs.length === 0 && repairs.length === 0 && errors.length === 0) {
        // Artista sem novas músicas E sem reparos: já está 100% sincronizado
        result.totalAlreadyKnown += songs.length;
      }

      if (songs.length === 0 && errors.length > 0) {
        entry.errorMessage = errors[0]?.error || entry.errorMessage;
      }
      if (timedOut) {
        entry.errorMessage = 'Tempo esgotado — artista incompleto; será retomado na próxima rotação da fila.';
      }
    } catch (e: any) {
      entry.errorMessage = e?.message || 'Erro desconhecido';
      entry.errors = 1;
    }

    result.results.push(entry);
    result.totalImported += entry.imported;
    result.totalDuplicates += entry.duplicates;
    result.totalErrors += entry.errors;
    result.totalRepaired += entry.repaired;
    result.totalUpdated += entry.updated;
    result.artistsProcessed++;

    // Linha de log da execução deste artista (histórico do cron). A coluna
    // `repaired` só entra se o schema migrado já a tiver — pré-migração,
    // omiti-la mantém o log funcionando (PostgREST rejeita chaves ausentes).
    const logRow: any = {
      id: `run-${ranAt}-${result.artistsProcessed}`,
      ran_at: new Date().toISOString(),
      platform: item.platformName,
      artist_url: item.url,
      imported: entry.imported,
      duplicates: entry.duplicates,
      errors: entry.errors,
      duration_ms: Date.now() - artistStart,
      // A coluna `repaired` (e o resumo de ATUALIZAÇÕES) vão no message —
      // sem exigir migração de schema para o cron_log.
      message:
        [
          entry.updated > 0 ? `${entry.updated} atualizada(s)` : '',
          entry.errorMessage,
        ]
          .filter(Boolean)
          .join(' | ') || null,
    };
    if (hasDb && (await hasRepairedColumn(sb.url, sb.key))) {
      logRow.repaired = entry.repaired;
    }
    if (hasDb && (await hasWorkerColumn(sb.url, sb.key))) {
      // Mesmo worker para toda a rodada — calculado UMA vez (os.hostname()
      // é chamada de sistema; evita repetir por artista).
      if (logWorkerName === null) logWorkerName = getWorkerName();
      logRow.worker = logWorkerName;
    }
    runLogRows.push(logRow);

    // Heartbeat do lease: enquanto esta máquina processa, mantém o lease
    // vivo (expira se ela cair no meio do artista).
    if (acquiredLease && isAutoMode && hasDb) await renewLease(sb.url, sb.key, leaseId);


    // Persiste o progresso (rotação justa): o cursor SEMPRE avança para o
    // próximo artista, mesmo quando o atual estourou o tempo (catálogo
    // gigante). Antes, um artista enorme (ex.: Roberto Carlos ~617 músicas)
    // monopolizava a fila para sempre — todos os artistas seguintes ficavam
    // sem cobertura. Agora cada execução cobre uma fatia de artistas
    // DIFERENTES, e o gigante é retomado incrementalmente quando a rotação
    // voltar a ele (o dedupe por título|artista impede duplicatas).
    if (!options.artistUrl) {
      const flatNow = queue.findIndex((q) => q.url === item.url);
      if (flatNow >= 0) {
        const nextFlat = (flatNow + 1) % queue.length;
        const next = { platformIndex: Math.floor(nextFlat / 1000), artistIndex: nextFlat % 1000 };
        if (nextFlat <= flatNow) wrapped = true; // voltou ao início
        cursor = next;
        result.cursor = { ...next };
        if (hasDb) await writeCursor(sb.url, sb.key, next);
      }
    }

    // Orçamento de tempo: encerra a execução no limite (o cursor já avançou)
    if (timedOutLast) break;
  }

  if (wrapped && result.artistsProcessed > 0) {
    result.message = 'Varredura completa do ciclo atingida — recomeçando do início.';
  } else if (result.artistsProcessed === 0) {
    result.message = 'Nenhum artista processado (orçamento de tempo muito curto).';
  }

  // Grava o histórico (nunca derruba a execução se as tabelas não existirem)
  if (hasDb) {
    if (importHistoryRows.length > 0) {
      await upsertRows(sb.url, sb.key, 'cron_imports', importHistoryRows);
    }
    if (runLogRows.length > 0) {
      await upsertRows(sb.url, sb.key, 'cron_log', runLogRows);
    }
  }

  // ok = o cron cumpriu o papel (progresso real, artista já sincronizado OU
  // zero erros). Erros por link (versões não-cifra, 404) são benignos e não
  // marcam a rodada como falha.
  result.ok =
    result.artistsProcessed > 0 &&
    (result.totalImported > 0 ||
      result.totalRepaired > 0 ||
      result.totalAlreadyKnown > 0 ||
      result.totalDuplicates > 0 ||
      result.totalErrors === 0);

  // Libera o lease ao final (a próxima máquina entra sem esperar o TTL).
  // Executado ANTES do return — inclusive em caminhos de erro acima, pois
  // o release é chamado no ponto único de saída da função.
  await release();

  return result;
}
