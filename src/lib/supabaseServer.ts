/**
 * Cliente Supabase usado apenas em server-side (APIs Vercel/Express): leitura do acervo para prerender de cifras, sitemap e robots.
 */
/**
 * Acesso ao Supabase LADO SERVIDOR (Node: server.ts, Vercel Functions, cron).
 *
 * Diferente do cliente (src/lib/supabase.ts que usa import.meta.env), aqui
 * lemos de process.env — funciona em qualquer runtime Node.
 *
 * Usado por:
 *  - /sitemap.xml (listar todas as músicas paginado)
 *  - prerender de /musica/:id (buscar 1 música para os meta tags/JSON-LD)
 */

export function getSupabaseServer() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export interface SongRow {
  id: string;
  title: string;
  artist: string;
  key?: string | null;
  category?: string | null;
  difficulty?: string | null;
  tags?: string[] | null;
  seo_description?: string | null;
  content?: string | null;
  updated_at?: string | null;
  votes?: number | null;
}

/**
 * Busca TODAS as músicas (PAGINAÇÃO KEYSET via `id=gt.ultimo&order=id.asc`).
 *
 * Por quê não offset: com 62 mil linhas e colunas de texto largas, offsets
 * altos estouram o statement timeout do PostgREST (erro 57014) — o carrega-
 * mento do catálogo morria pela metade e o app caía no fallback de 5 músicas.
 * Keyset é O(1) por página: validado com 62k linhas sem falhas.
 * Retorna [] se vazio, null se falhou já na primeira página.
 */
export async function fetchAllSongsServer(): Promise<SongRow[] | null> {
  const sb = getSupabaseServer();
  if (!sb) return null;
  const all: SongRow[] = [];
  const pageSize = 1000;
  let lastId: string | null = null;
  for (let page = 0; page < 200; page++) {
    const keyset = lastId ? `&id=gt.${encodeURIComponent(lastId)}` : '';
    const url = `${sb.url}/rest/v1/songs?select=${encodeURIComponent(
      'id,title,artist,key,category,difficulty,tags,seo_description,updated_at,votes'
    )}&order=id.asc&limit=${pageSize}${keyset}`;
    try {
      const res = await fetch(url, {
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
        },
      });
      if (!res.ok) return all.length ? all : null;
      const rows = (await res.json()) as SongRow[];
      if (!Array.isArray(rows) || !rows.length) break;
      all.push(...rows);
      lastId = String(rows[rows.length - 1]?.id ?? '');
      if (!lastId || rows.length < pageSize) break;
    } catch {
      return all.length ? all : null;
    }
  }
  return all;
}

// Cache da contagem do acervo (o número muda pouco entre rodadas do cron).
let songCountCache: { count: number; at: number } | null = null;
const SONG_COUNT_TTL = 10 * 60 * 1000; // 10 min

/**
 * Contagem REAL de músicas no banco (para title/og/JSON-LD do site).
 * Usa `Prefer: count=exact` → header `content-range: 0-0/16044` — 1 requisição
 * leve, sem trazer linhas. Retorna null se indisponível (fallback: 16.000+).
 */
export async function fetchSongCountServer(): Promise<number | null> {
  if (songCountCache && Date.now() - songCountCache.at < SONG_COUNT_TTL) {
    return songCountCache.count;
  }
  const sb = getSupabaseServer();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}/rest/v1/songs?select=id&limit=1`, {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) return null;
    const range = res.headers.get('content-range');
    const m = range ? range.match(/\/(\d+)$/) : null;
    const count = m ? Number(m[1]) : null;
    if (count != null && Number.isFinite(count)) {
      songCountCache = { count, at: Date.now() };
      return count;
    }
    return null;
  } catch {
    return null;
  }
}

/** Versão síncrona (para hooks que não podem aguardar) — usa o cache. */
export function getCachedSongCount(): number | null {
  return songCountCache && Date.now() - songCountCache.at < SONG_COUNT_TTL
    ? songCountCache.count
    : null;
}

/** Busca UMA música por id (para o prerender de /musica/:id). */
export async function fetchSongByIdServer(id: string): Promise<SongRow | null> {
  const sb = getSupabaseServer();
  if (!sb) return null;
  const url = `${sb.url}/rest/v1/songs?select=${encodeURIComponent(
    'id,title,artist,key,category,difficulty,tags,seo_description,content,updated_at,votes'
  )}&id=eq.${encodeURIComponent(id)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
      },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as SongRow[];
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** URL pública do site (para sitemap/canonical). Configurável via env. */
export function getSiteUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://ukemasterpro.com'
  ).replace(/\/+$/, '');
}

const BOT_REGEX =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|twitterbot|linkedinbot|telegrambot|discordbot|slackbot|pinterest|embedly|quora|tumblr|vkshare|applebot|duckduckbot|yandex|baiduspider|googlebot|google-inspectiontool|bingbot|ahrefs|semrush|majestic|petalbot|bytespider|amazonbot|gptbot|ccbot|anthropic|claudebot|perplexitybot/i;

/** Detecta se a requisição veio de um crawler/robô (para servir prerender). */
export function isBotRequest(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return BOT_REGEX.test(userAgent);
}
