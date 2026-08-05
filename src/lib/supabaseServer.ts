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
 * Busca TODAS as músicas (paginação via limit/offset na query — o PostgREST
 * limita a 1000 por página). Retorna [] se vazio, null se falhou.
 */
export async function fetchAllSongsServer(): Promise<SongRow[] | null> {
  const sb = getSupabaseServer();
  if (!sb) return null;
  const all: SongRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const url = `${sb.url}/rest/v1/songs?select=${encodeURIComponent(
      'id,title,artist,key,category,difficulty,tags,seo_description,updated_at,votes'
    )}&limit=${pageSize}&offset=${offset}`;
    try {
      const res = await fetch(url, {
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
        },
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as SongRow[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    } catch {
      return null;
    }
  }
  return all;
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
    'https://ukemasterpro.vercel.app'
  ).replace(/\/+$/, '');
}

const BOT_REGEX =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|twitterbot|linkedinbot|telegrambot|discordbot|slackbot|pinterest|embedly|quora|tumblr|vkshare|applebot|duckduckbot|yandex|baiduspider|googlebot|google-inspectiontool|bingbot|ahrefs|semrush|majestic|petalbot|bytespider|amazonbot|gptbot|ccbot|anthropic|claudebot|perplexitybot/i;

/** Detecta se a requisição veio de um crawler/robô (para servir prerender). */
export function isBotRequest(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return BOT_REGEX.test(userAgent);
}
