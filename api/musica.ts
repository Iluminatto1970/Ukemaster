/**
 * Vercel Serverless Function — /musica/:id (via rewrite, apenas para crawlers)
 * Prerender completo para o Google/WhatsApp: title, description, canonical,
 * og tags e JSON-LD MusicRecording — sem depender do JavaScript do cliente.
 *
 * NOTA: AUTOCONTIDA (não importa de src/) — a Vercel compila cada api/*.ts
 * isolado e imports ESM relativos para src/ sem extensão falham em runtime.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 30;

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
    'https://ukemasterpro.vercel.app'
  );
}

interface SongRow {
  id: string;
  title: string;
  artist: string;
  key?: string | null;
  content?: string | null;
  category?: string | null;
  difficulty?: string | null;
  seo_description?: string | null;
}

async function fetchSongByIdServer(id: string): Promise<SongRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const res = await fetch(
    `${sb.url}/rest/v1/songs?select=id,title,artist,key,content,category,difficulty,seo_description&id=eq.${encodeURIComponent(id)}&limit=1`,
    {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as SongRow[];
  return rows[0] || null;
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function send(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  { query }: { query: Record<string, string | string[]> }
) {
  const id = Array.isArray(query.id) ? query.id[0] : (query.id as string | undefined);
  if (!id) return send(res, 400, 'Música não informada.');
  if (req.method !== 'GET') return send(res, 405, 'Method Not Allowed');

  const song = await fetchSongByIdServer(decodeURIComponent(id));
  if (!song) {
    return send(
      res,
      404,
      '<!doctype html><html><head><title>Música não encontrada — UkeMaster Pro</title></head><body><h1>404</h1><p>Esta cifra não existe mais no acervo.</p></body></html>'
    );
  }

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/musica/${encodeURIComponent(song.id)}`;
  const title = `${song.title} - ${song.artist} | Cifra de Ukulele no UkeMaster Pro`;
  const description =
    song.seo_description ||
    `Cifra de ukulele de ${song.title} (${song.artist})${song.key ? ` no tom ${song.key}` : ''} — acordes, ritmo e letra para tocar agora.`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: song.title,
    byArtist: { '@type': 'MusicGroup', name: song.artist },
    ...(song.key ? { inKey: song.key } : {}),
    ...(song.category ? { genre: song.category } : {}),
    url: pageUrl,
    publisher: { '@type': 'Organization', name: 'UkeMaster Pro', url: siteUrl },
  });

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:title" content="${esc(song.title)} — ${esc(song.artist)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:site_name" content="UkeMaster Pro" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(song.title)} — ${esc(song.artist)}" />
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <h1>${esc(song.title)}</h1>
  <p>${esc(song.artist)}${song.key ? ` — Tom ${esc(song.key)}` : ''}</p>
  <p>Confira a cifra completa de ${esc(song.title)} no UkeMaster Pro.</p>
  <p><a href="${esc(pageUrl)}">Abrir cifra</a></p>
</body>
</html>`;

  return send(res, 200, html);
}
