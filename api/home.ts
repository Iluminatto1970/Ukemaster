/**
 * Endpoint /api/home: prerender da HOME para crawlers (HTML com conteúdo).
 *
 * A home é uma SPA (index.html com <div id="root"> vazio) — o Googlebot via
 * só o shell. Este endpoint serve o mesmo título/descrição/og do index.html
 * + a LISTA DE SUGESTÕES (músicas do idioma padrão, como o app computa na
 * UI: lang=nativo + 'multi' + sem idioma) em <ul> indexável, com links para
 * /musica/:id (que têm SSR próprio).
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
    'https://ukemasterpro.com'
  );
}

interface SongRow {
  id: string;
  title: string;
  artist: string;
  key?: string | null;
  difficulty?: string | null;
  lang?: string | null;
}

/**
 * Busca as sugestões da home: músicas com conteúdo, priorizando o idioma
 * padrão (pt) + 'multi' + sem idioma — a mesma regra da UI (SongList.tsx).
 * Limita a 60 para o HTML do SSR ficar leve. Ordena por views desc (as
 * "Mais Acessadas" primeiro, como o app destaca).
 */
/**
 * Contagem REAL de músicas no banco (title/og/JSON-LD mostram o acervo
 * verdadeiro, não um número fixo). `Prefer: count=exact` → header
 * `content-range: 0-0/16044` — 1 requisição leve. Null = fallback "16.000+".
 */
async function fetchSongCount(): Promise<number | null> {
  const sb = getSupabase();
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
    return count != null && Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

async function fetchSuggestedSongs(): Promise<SongRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const res = await fetch(
    `${sb.url}/rest/v1/songs?select=${encodeURIComponent(
      'id,title,artist,key,difficulty,lang'
    )}&content=not.eq.&order=${encodeURIComponent(
      'views.desc'
    )}&limit=500`,
    {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as SongRow[];
  // MESMA regra da UI (SongList.tsx langBaseSongs): se existe ao menos uma
  // música nativa em pt, filtra para lang nulo/'multi'/pt; senão cai para o
  // acervo todo (a home nunca fica vazia).
  const hasNative = rows.some((r) => r.lang === 'pt');
  const base = hasNative
    ? rows.filter((r) => !r.lang || r.lang === 'pt' || r.lang === 'multi')
    : rows;
  return base.slice(0, 60);
}

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/html; charset=utf-8',
  cache = 'no-store'
) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  res.end(body);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, 'Method Not Allowed');

  const siteUrl = getSiteUrl();
  const ogImage = `${siteUrl}/og-image.png`;
  const count = await fetchSongCount();
  const countLabel = count != null ? count.toLocaleString('pt-BR') : '16.000+';
  const title = `UkeMaster Pro — ${countLabel} Cifras de Ukulele, Acordes & Afinador Grátis`;
  const description = `O Portal do Ukulele com ${countLabel} cifras gratuitas: acordes, letra, ritmo, dicionário de acordes, afinador de precisão e repertório privado. 100% grátis.`;

  const songs = await fetchSuggestedSongs();

  // JSON-LD: WebSite (como no index.html) + ItemList das sugestões (conteúdo
  // real da home para o Google entender a estrutura do site).
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'UkeMaster Pro',
    url: siteUrl,
    inLanguage: 'pt-BR',
    description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    publisher: {
      '@type': 'Organization',
      name: 'UkeMaster Pro',
      url: siteUrl,
      logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png` },
    },
  };
  const itemListLd = songs
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Cifras em destaque no UkeMaster Pro',
        numberOfItems: songs.length,
        itemListElement: songs.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${s.title} — ${s.artist}`,
          url: `${siteUrl}/musica/${encodeURIComponent(s.id)}`,
        })),
      }
    : null;
  const jsonLd = JSON.stringify([websiteLd, itemListLd].filter(Boolean))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const suggestionsHtml = songs
    ? `<h2>Cifras em destaque</h2>\n  <ul>\n${songs
        .map(
          (s) =>
            `    <li><a href="${siteUrl}/musica/${encodeURIComponent(
              s.id
            )}">${esc(s.title)} — ${esc(s.artist)}</a>${
              s.key ? ` (Tom ${esc(s.key)})` : ''
            }</li>`
        )
        .join('\n')}\n  </ul>`
    : `<p>${countLabel} cifras de ukulele gratuitas — busque no app.</p>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- AdSense: o crawler recebe este SSR (o middleware reescreve / → /api/home
       para bots), então o loader PRECISA estar aqui para a verificação do
       AdSense (AdsBot-Google) e para o reconhecimento do site. -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7409769323856107" crossorigin="anonymous"></script>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${siteUrl}/" />
  <meta property="og:site_name" content="UkeMaster Pro" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${siteUrl}/" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <h1>${esc('UkeMaster Pro — Cifras de Ukulele Grátis')}</h1>
  <p>${esc(description)}</p>
  <p>${countLabel} cifras com letra, acordes, ritmo e tom — de CifraClub, Ultimate-Guitar, U-FRET e mais. Abra o app para tocar com dicionário de acordes, afinador e repertório privado.</p>
  ${suggestionsHtml}
  <p><a href="${siteUrl}/">Abrir o UkeMaster Pro</a></p>
</body>
</html>`;

  // Cache CDN: a home muda pouco (sugestões rotacionam por views). s-maxage
  // 6h + SWR 1d reduz invocações; crawlers servem do edge.
  //
  // Vary: User-Agent é CRÍTICO: o middleware reescreve `/` → /api/home SÓ
  // para crawlers. Sem este header, o SSR (HTML estático sem o app React)
  // cacheado sob `/` seria servido a navegadores reais na janela do TTL —
  // app quebrado. Com Vary, o CDN separa as entradas de cache por UA.
  const cache = 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400';
  res.setHeader('Vary', 'User-Agent');
  return send(res, 200, html, 'text/html; charset=utf-8', cache);
}
