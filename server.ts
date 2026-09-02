import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';

import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  discoverArtistSongLinks,
  inferPlatformLang,
  scrapeLinksChunk,
  scrapeSongWithVariants,
} from './src/lib/scraper';
import { runPlatformCron } from './src/lib/platformCron';
import {
  fetchAllSongsServer,
  fetchSongByIdServer,
  fetchSongCountServer,
  getCachedSongCount,
  getSiteUrl,
  isBotRequest,
} from './src/lib/supabaseServer';
import {
  applySecurityHeaders,
  isAllowedFetchUrl,
  SSRF_ERROR,
  rateLimit,
  getClientIp,
  classifyUserAgent,
  fetchWithRedirectGuard,
} from './src/lib/security';
import { authorizeAdminRequest } from './src/lib/adminAuth';
import { csrfProtect } from './src/lib/csrf';
import {
  fetchLatestChannelVideos,
  FALLBACK_VIDEOS,
  YOUTUBE_CHANNEL_ID,
  YOUTUBE_CHANNEL_HANDLE,
  YOUTUBE_CHANNEL_URL,
} from './src/lib/youtubeChannel';

// CSRF double‑submit protection using central module
function csrfProtection(req: any, res: any, next: any) {
  const result = csrfProtect(
    req.method,
    req.headers.cookie,
    req.headers['x-csrf-token'],
    process.env.NODE_ENV === 'production'
  );
  if (result.setCookie) {
    const existing = res.getHeader('Set-Cookie');
    const arr = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
    arr.push(result.setCookie);
    res.setHeader('Set-Cookie', arr);
  }
  if (!result.ok) {
    return res.status(403).json({ error: 'Falha no processamento' });
  }
  next();
}

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
  // Porta configurável via env (PORT) — padrão 3000. Usada quando a 3000
  // está ocupada por outro processo (ex.: outro projeto em dev local).
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Apply CSRF protection middleware
  app.use(csrfProtection);

  // Warm-up: busca a contagem real do acervo em background (title/og/JSON-LD).
  fetchSongCountServer().catch(() => {});

  // ── Política de segurança: headers HTTP em TODAS as respostas ────────
  // (CSP, nosniff, frame-options, referrer-policy, HSTS em produção...)
  app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    // attach nonce to request for downstream use
    (req as any).nonce = nonce;
    applySecurityHeaders(res, { hsts: isProd, nonce });
    next();
  });

  // ── Camada anti-scraping local (espelho do Edge Middleware da Vercel) ─
  // Em dev/self-host o Express É a borda: honeypot de varredura, bloqueio
  // de ferramentas de raspagem em rotas caras e rate limit global por IP.
  app.use((req, res, next) => {
    // Honeypot: rotas clássicas de varredura de vulnerabilidades recebem o
    // mesmo 404 de "não existe" — sem gastar recursos do app.
    if (
      /^\/(wp-admin|wp-login(?:\.php)?|\.env|\.git|config(?:\.php)?|admin(?:\.php)?|phpmyadmin|\.aws|\.ssh|\.htaccess|\.DS_Store|server-status|server-info)(\/|$)/i.test(
        req.path
      )
    ) {
      return res.status(404).type('text/plain').send('Not Found');
    }

    // /api/* nunca é indexado nem cacheado (as funções respondem JSON/HTML).
    if (req.path.startsWith('/api/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', 'no-store');
    }

    // Ferramentas de raspagem/automação não usam o app — bloqueia rotas que
    // entregam dados ou custam Supabase (mesma política do middleware.ts).
    const kind = classifyUserAgent(String(req.headers['user-agent'] || ''));
    if (kind === 'scraper' && (req.path.startsWith('/api/') || req.path.startsWith('/musica/'))) {
      return res.status(403).type('text/plain').send('Acesso negado.');
    }

    // Rate limit global leve por IP (humano navega muito abaixo disso;
    // evita varredura em massa mesmo com navegador de verdade). Rotas do
    // Vite (HMR/módulos) ficam FORA do rate limit — hot updates frequentes
    // podem estourar o teto e causar 429 falso durante o desenvolvimento.
    const isViteRoute =
      req.path.startsWith('/@vite') ||
      req.path.startsWith('/@id') ||
      req.path.startsWith('/@fs') ||
      req.path.startsWith('/node_modules/') ||
      req.path.startsWith('/src/');
    if (!isViteRoute) {
      const rl = rateLimit(getClientIp(req), 'global', 600, 60_000);
      if (!rl.ok) {
        return res.status(429).json({ error: 'Falha no processamento' });
      }
    }

    next();
  });

  // Body limit reduzido: cifras nunca passam de ~1MB (evita abuso de payload).
  app.use(express.json({ limit: '1mb' }));

  // API Endpoint to fetch external URLs (e.g. CifraClub) without CORS restrictions
  app.post('/api/fetch-url', async (req, res) => {
    try {
      // Rate limit: máx 20 fetchs/min por IP (evita abuso do proxy).
      const rl = rateLimit(getClientIp(req), 'fetch-url', 20, 60_000);
      if (!rl.ok) {
        return res.status(429).json({ error: 'Falha no processamento' });
      }

      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Falha no processamento' });
      }

      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }

      // Anti-SSRF com GUARDA DE REDIRECIONAMENTO: valida a URL original e
      // CADA hop de redirect contra a allowlist (impede 302 para a rede
      // interna/metadata cloud — mesmo comportamento da api/fetch-url.ts).
      const result = await fetchWithRedirectGuard(targetUrl, {
        maxBytes: 2_000_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Cache-Control': 'no-cache',
        },
      });

      if (!result.ok) {
        const status = result.status && result.status >= 400 ? result.status : 502;
        return res.status(status).json({ error: 'Falha no processamento' });
      }

      return res.json({ ok: true, html: result.html });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Falha no processamento',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Endpoint público: publicações mais recentes do canal no YouTube
  // (vídeos + shorts, feed RSS oficial + innertube para views, sem API
  // key). Espelho local do api/youtube-channel-videos.ts — o painel direito
  // usa para rotacionar o destaque, listar as 4 últimas e montar o rank dos
  // mais vistos; se o feed falhar, devolve as publicações de segurança
  // (o painel nunca fica vazio).
  app.get('/api/youtube-channel-videos', async (req, res) => {
    const channel = {
      id: YOUTUBE_CHANNEL_ID,
      handle: YOUTUBE_CHANNEL_HANDLE,
      url: YOUTUBE_CHANNEL_URL,
    };
    try {
      const videos = await fetchLatestChannelVideos();
      res.json({ channel, videos, source: 'live', fetchedAt: new Date().toISOString() });
    } catch {
      res.json({
        channel,
        videos: FALLBACK_VIDEOS,
        source: 'fallback',
        fetchedAt: new Date().toISOString(),
      });
    }
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
      url(`${siteUrl}/trilhas`),
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
    const ogImage = `${siteUrl}/og-image.png`;
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
      `<meta property="og:image" content="${esc(ogImage)}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(song.title)} - ${esc(song.artist)} | UkeMaster Pro" />`,
      `<meta name="twitter:description" content="${esc(seoDescription)}" />`,
      `<meta name="twitter:image" content="${esc(ogImage)}" />`,
      `<meta name="keywords" content="cifra ukulele, ${esc(song.title)}, ${esc(song.artist)}, acordes ukulele, ${esc(chords)}" />`,
      `<script nonce="${(req as any).nonce || ''}" type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      `<link rel="icon" href="/favicon.png" />`,
    ].join('\n    ');

    html = html.replace('</head>', `    ${head}\n  </head>`);
    return res.type('text/html').send(html);
  });

  // Scrape de cifras (área admin) — mesmo comportamento da serverless function
  app.post('/api/scrape', async (req, res) => {
    try {
      // Proteção: só admin (JWT Supabase do proprietário ou ADMIN_SECRET) pode
      // disparar scraping. O app envia Authorization: Bearer (sessão logada).
      const auth = await authorizeAdminRequest(req.headers as Record<string, string | string[] | undefined>, {
        allowCron: false,
      });
      if (!auth.ok) return res.status(403).json({ error: auth.reason });

      const rl = rateLimit(getClientIp(req), 'scrape', 10, 60_000);
      if (!rl.ok) {
        return res.status(429).json({ error: 'Falha no processamento' });
      }

      const body = req.body || {};

      // Modo descoberta — varre o CATÁLOGO COMPLETO (raiz + /musicas.html).
      // Antes só a página informada era varrida: Roberto Carlos achava 25 de
      // 617 músicas (a raiz mostra só as populares).
      if (body.discover) {
        const url = String(body.discover).trim();
        if (!/^https?:\/\//i.test(url) || !isAllowedFetchUrl(url)) {
          return res.status(400).json({ error: SSRF_ERROR });
        }
        const links = await discoverArtistSongLinks(url);
        return res.json({ ok: true, links, total: links.length });
      }

      // Modo scrape em lote (seleção manual) — com variantes simplificadas
      // e idioma da plataforma, igual ao cron.
      if (Array.isArray(body.songs) && body.songs.length > 0) {
        const urls = body.songs.slice(0, 6).map((u: unknown) => String(u));
        // Anti-SSRF também no lote: cada URL precisa ser de plataforma permitida.
        const blocked = urls.filter((u) => !isAllowedFetchUrl(u));
        if (blocked.length > 0) {
          return res.status(403).json({ error: SSRF_ERROR });
        }
        const lang = inferPlatformLang(urls[0] || '');
        const results = [];
        for (const u of urls) {
          try {
            const variants = await scrapeSongWithVariants(u);
            for (const song of variants) {
              if (lang && !song.lang) song.lang = lang;
              results.push({ song });
            }
          } catch (e: any) {
            results.push({ url: u, error: e?.message || 'Erro ao processar esta música.' });
          }
        }
        return res.json({ ok: true, results });
      }

      // Importação do CATÁLOGO COMPLETO em chunks (admin) — mesma lógica da
      // serverless function: o cliente descobre os links e varre em fatias.
      if (Array.isArray(body.links) && body.links.length > 0) {
        const offset = Math.max(0, Number(body.offset) || 0);
        const count = Math.max(1, Math.min(Number(body.count) || 6, 12));
        const links = (body.links as any[])
          .map((l) => ({
            url: String(l?.url || l || ''),
            title: String(l?.title || ''),
            artist: String(l?.artist || ''),
          }))
          .filter((l) => l.url && isAllowedFetchUrl(l.url));
        if (links.length === 0) {
          return res.status(400).json({ error: SSRF_ERROR });
        }
        const lang = inferPlatformLang(links[0].url);
        const result = await scrapeLinksChunk(links, { offset, count, delayMs: 350, lang });
        return res.json({ ok: true, ...result });
      }

      return res
        .status(400)
        .json({ error: 'Envie { discover }, { songs } ou { links, offset, count } no corpo da requisição.' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Erro no scraping.' });
    }
  });

  // Cron de plataformas (disparo manual no dev / teste local)
  app.post('/api/scrape-platforms', async (req, res) => {
    try {
      // Proteção: JWT admin, cron da Vercel (x-vercel-cron) ou ADMIN_SECRET.
      const auth = await authorizeAdminRequest(req.headers as Record<string, string | string[] | undefined>, {
        allowCron: true,
      });
      if (!auth.ok) return res.status(403).json({ error: auth.reason });

      const rl = rateLimit(getClientIp(req), 'scrape-platforms', 6, 60_000);
      if (!rl.ok) {
        return res.status(429).json({ error: 'Falha no processamento' });
      }

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
      plugins: [
        {
          // Injeta a contagem REAL do acervo no index.html (title/og/JSON-LD)
          // servido pelo Vite — o preview/tab mostra 16.044, não o estático.
          name: 'inject-real-song-count',
          transformIndexHtml(html: string) {
            const count = getCachedSongCount();
            if (count == null) return html;
            return html.replaceAll('16.000+', count.toLocaleString('pt-BR'));
          },
        },
      ],
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Injeta a contagem REAL do acervo no index.html servido em produção
    // (title/og/JSON-LD do site). Renova o cache se estiver vazio.
    app.use(async (req, res, next) => {
      if (req.path !== '/' && req.path !== '/index.html') return next();
      let count = getCachedSongCount();
      if (count == null) count = await fetchSongCountServer();
      const distIndex = path.join(distPath, 'index.html');
      if (count != null && fs.existsSync(distIndex)) {
        let html = fs.readFileSync(distIndex, 'utf-8');
        html = html.replaceAll('16.000+', count.toLocaleString('pt-BR'));
        return res.type('text/html').send(html);
      }
      next();
    });
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
