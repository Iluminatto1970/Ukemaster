/**
 * Endpoint /api/sitemap: gera o sitemap.xml dinâmico com todas as cifras (SEO para o Google indexar).
 */
/**
 * Vercel Serverless Function — /sitemap.xml (via rewrite)
 * Gera o sitemap com todas as cifras do acervo (paginação completa).
 *
 * NOTA: esta function é AUTOCONTIDA (não importa de src/) — a Vercel compila
 * cada arquivo de api/ isoladamente e imports ESM relativos para src/ sem
 * extensão falham em runtime (ERR_MODULE_NOT_FOUND). Mantém o fetch do
 * Supabase inline, como no api/fetch-url.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 30;

/** Lê a config do Supabase das env vars da Vercel. */
function getSupabase() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const key =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function getSiteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.APP_URL ||
    'https://ukemasterpro.com'
  );
}

interface SongRow {
  id: string;
  title: string;
  updated_at?: string | null;
}

/** Busca TODAS as músicas paginando (o PostgREST limita a 1000 por página). */
async function fetchAllSongsServer(): Promise<SongRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const all: SongRow[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const res = await fetch(
      `${sb.url}/rest/v1/songs?select=id,title,updated_at&limit=1000&offset=${offset}`,
      {
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as SongRow[];
    if (rows.length) all.push(...rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return all;
}

function send(res: ServerResponse, status: number, body: string, type = 'application/xml') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
  res.end(body);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    return send(res, 405, 'Method Not Allowed', 'text/plain');
  }

  const siteUrl = getSiteUrl();
  const songs = await fetchAllSongsServer();
  if (!songs) {
    return send(res, 502, '<!-- Supabase indisponível para gerar o sitemap -->', 'text/html');
  }

  const today = new Date().toISOString().slice(0, 10);
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const url = (loc: string, lastmod?: string) =>
    `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${lastmod || today}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`;

  const urls: string[] = [
    url(`${siteUrl}/`),
    url(`${siteUrl}/dicionario`),
    url(`${siteUrl}/afinador`),
    url(`${siteUrl}/ritmos`),
  ];
  for (const s of songs) {
    if (!s.id || !s.title) continue;
    urls.push(url(`${siteUrl}/musica/${encodeURIComponent(s.id)}`, s.updated_at?.slice(0, 10)));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    `\n</urlset>`;

  return send(res, 200, xml);
}
