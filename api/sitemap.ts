/**
 * Vercel Serverless Function — /sitemap.xml (via rewrite)
 * Gera o sitemap com todas as cifras do acervo (paginação completa).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchAllSongsServer, getSiteUrl } from '../src/lib/supabaseServer';

export const maxDuration = 30;

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
