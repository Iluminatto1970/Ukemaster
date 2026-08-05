/**
 * Vercel Serverless Function — /musica/:id (prerender para crawlers)
 *
 * A rota /musica/:id é redirecionada aqui quando o User-Agent é de um
 * crawler (ver vercel.json, rewrite com condição `has`). Entregamos o HTML
 * completo da cifra (title, description, canonical, og:, JSON-LD MusicRecording)
 * para o Google/WhatsApp/redes indexarem e mostrarem preview correto.
 *
 * Usuários humanos caem no rewrite padrão → /index.html (SPA), que abre a
 * cifra via /musica/:id no cliente.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchSongByIdServer, getSiteUrl } from '../src/lib/supabaseServer';

export const maxDuration = 15;

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function send(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.end(body);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const id = decodeURIComponent((req.url || '').split('?')[0].replace(/^\/musica\//, ''));
  if (!id) return send(res, 404, '<h1>Não encontrada</h1>');

  const song = await fetchSongByIdServer(id);
  if (!song) return send(res, 404, '<h1>Música não encontrada</h1>');

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/musica/${encodeURIComponent(id)}`;
  const title = `${song.title} — ${song.artist} | UkeMaster Pro`;
  const description =
    song.seo_description ||
    `Cifra de ${song.title} (${song.artist}) para ukulele${song.key ? ` no tom de ${song.key}` : ''}. Portal oficial do ukulele.`;
  const ogImage = `${siteUrl}/logo.png`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: song.title,
    byArtist: { '@type': 'MusicGroup', name: song.artist },
    ...(song.key ? { inKey: song.key } : {}),
    ...(song.category ? { genre: song.category } : {}),
    url: pageUrl,
    ...(song.updated_at ? { dateModified: song.updated_at } : {}),
    publisher: { '@type': 'Organization', name: 'UkeMaster Pro', url: siteUrl },
  };

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(pageUrl)}" />
    <meta property="og:type" content="music.song" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(pageUrl)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head>
  <body>
    <h1>${esc(song.title)} — ${esc(song.artist)}</h1>
    <p>${esc(description)}</p>
    <p><a href="${esc(pageUrl)}">Ver cifra completa no UkeMaster Pro</a></p>
  </body>
</html>`;

  return send(res, 200, html);
}
