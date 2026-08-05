import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { discoverSongLinks, fetchHtml, scrapeSong } from './src/lib/scraper';
import { runPlatformCron } from './src/lib/platformCron';
import {
  fetchAllSongsServer,
  fetchSongByIdServer,
  getSiteUrl,
  isBotRequest,
} from './src/lib/supabaseServer';

// Carrega .env.local (o dotenv padrão lê só .env)
try {
  if (fs.existsSync(path.join(process.cwd(), '.env.local'))) {
    const content = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2];
      }
    });
  }
} catch {
  // ignora — sem .env.local não há problema
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Endpoint to fetch external URLs (e.g. CifraClub) without CORS restrictions
  app.post('/api/fetch-url', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL inválida ou ausente.' });
      }

      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `O site de origem respondeu com status ${response.status}.`,
        });
      }

      const html = await response.text();
      return res.json({ ok: true, html });
    } catch (err: any) {
      return res.status(500).json({
        error: err.message || 'Erro de conexão ao buscar a URL solicitada.',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // ── SEO: robots.txt ───────────────────────────────────────────────────
  app.get('/robots.txt', (req, res) => {
    const siteUrl = getSiteUrl();
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${siteUrl}/sitemap.xml`,
      ].join('\n')
    );
  });

  // ── SEO: sitemap.xml dinâmico (todas as cifras) ──────────────────────
  let sitemapCache: { xml: string; at: number } | null = null;
  app.get('/sitemap.xml', async (req, res) => {
    const siteUrl = getSiteUrl();
    const cacheTtl = 10 * 60 * 1000; // 10 min — acervo muda pouco entre rodadas

    if (sitemapCache && Date.now() - sitemapCache.at < cacheTtl) {
      return res.type('application/xml').send(sitemapCache.xml);
    }

    const songs = await fetchAllSongsServer();
    if (!songs) {
      return res.status(502).send('<!-- Supabase indisponível para gerar o sitemap -->');
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

    sitemapCache = { xml, at: Date.now() };
    return res.type('application/xml').send(xml);
  });

  // ── SEO: prerender de /musica/:id para crawlers ───────────────────────
  // Crawlers recebem HTML com meta tags + JSON-LD (indexação real).
  // Usuários normais recebem o SPA normal (o React abre a cifra pela rota).
  app.get('/musica/:id', async (req, res, next) => {
    const ua = req.headers['user-agent'];
    if (!isBotRequest(ua)) return next(); // deixa o SPA/vite resolver

    const song = await fetchSongByIdServer(req.params.id);
    const siteUrl = getSiteUrl();
    const canonicalUrl = `${siteUrl}/musica/${encodeURIComponent(req.params.id)}`;

    // Base HTML do SPA (root do projeto em dev, dist em produção)
    const indexHtmlPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'index.html')
      : path.join(process.cwd(), 'index.html');

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (!song) {
      res.status(404);
      return res.type('text/html').send(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cifra não encontrada | UkeMaster Pro</title></head><body><h1>Cifra não encontrada</h1></body></html>`
      );
    }

    const seoDescription =
      song.seo_description ||
      `Cifra de ukulele de "${song.title}" de ${song.artist}. Acordes, letra e diagramas para tocar no UkeMaster Pro.`;
    const chords = (song.tags || []).slice(0, 8).join(', ') || 'Ukulele';
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'MusicRecording',
      name: song.title,
      byArtist: { '@type': 'MusicGroup', name: song.artist },
      url: canonicalUrl,
      inLanguage: 'pt-BR',
      genre: song.category || 'Ukulele',
      description: seoDescription,
      ...(song.key ? { musicalKey: song.key } : {}),
      recordingOf: {
        '@type': 'MusicComposition',
        name: song.title,
        composer: { '@type': 'MusicGroup', name: song.artist },
      },
    };

    let html = fs.readFileSync(indexHtmlPath, 'utf-8');
    const head = [
      `<title>${esc(song.title)} - ${esc(song.artist)} | Cifra de Ukulele | UkeMaster Pro</title>`,
      `<meta name="description" content="${esc(seoDescription)}" />`,
      `<link rel="canonical" href="${esc(canonicalUrl)}" />`,
      `<meta property="og:title" content="${esc(song.title)} - ${esc(song.artist)} | UkeMaster Pro" />`,
      `<meta property="og:description" content="${esc(seoDescription)}" />`,
      `<meta property="og:type" content="music.song" />`,
      `<meta property="og:url" content="${esc(canonicalUrl)}" />`,
      `<meta property="og:site_name" content="UkeMaster Pro" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(song.title)} - ${esc(song.artist)} | UkeMaster Pro" />`,
      `<meta name="twitter:description" content="${esc(seoDescription)}" />`,
      `<meta name="keywords" content="cifra ukulele, ${esc(song.title)}, ${esc(song.artist)}, acordes ukulele, ${esc(chords)}" />`,
      `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      `<link rel="icon" href="/favicon.png" />`,
    ].join('\n    ');

    html = html.replace('</head>', `    ${head}\n  </head>`);
    return res.type('text/html').send(html);
  });

  // Scrape de cifras (área admin) — mesmo comportamento da serverless function
  app.post('/api/scrape', async (req, res) => {
    try {
      const body = req.body || {};

      // Modo descoberta
      if (body.discover) {
        const url = String(body.discover).trim();
        if (!/^https?:\/\//i.test(url)) {
          return res.status(400).json({ error: 'Informe uma URL válida (https://...).' });
        }
        const html = await fetchHtml(url);
        const links = discoverSongLinks(html, url);
        return res.json({ ok: true, links, total: links.length });
      }

      // Modo scrape em lote
      if (Array.isArray(body.songs) && body.songs.length > 0) {
        const urls = body.songs.slice(0, 6).map((u: unknown) => String(u));
        const results = [];
        for (const u of urls) {
          try {
            results.push({ song: await scrapeSong(u) });
          } catch (e: any) {
            results.push({ url: u, error: e?.message || 'Erro ao processar esta música.' });
          }
        }
        return res.json({ ok: true, results });
      }

      return res.status(400).json({ error: 'Envie { discover } ou { songs } no corpo da requisição.' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Erro no scraping.' });
    }
  });

  // Cron de plataformas (disparo manual no dev / teste local)
  app.post('/api/scrape-platforms', async (req, res) => {
    try {
      const result = await runPlatformCron({
        platformId: req.body?.platformId,
        artistUrl: req.body?.artistUrl,
        limit: req.body?.limit ? Number(req.body.limit) : undefined,
        fast: Boolean(req.body?.fast),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Erro no cron.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
