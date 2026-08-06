/**
 * Edge Middleware (Vercel) — camada de segurança na BORDA, antes do app.
 *
 * Projeto Vite (sem Next.js): o Edge Function usa a API web padrão
 * (Request/Response) — NÃO importar de next/server (o bundler rejeita).
 *
 * Defesas (todas executam em ~1ms no edge, sem custo de cold start):
 *  1. BLOQUEIO DE BOTS de scraping/automação em rotas caras (/api/* e
 *     /musica/* — o prerender consulta o Supabase por requisição). Os
 *     crawlers de SEO/redes sociais (Googlebot, WhatsApp, etc.) passam
 *     SEMPRE — a indexação e os links compartilhados continuam intactos.
 *  2. RATE LIMIT por IP (janela em memória da instância edge). Generoso
 *     para humanos, apertado para /api/* — o acervo fica protegido contra
 *     varredura em massa mesmo que o scraper rode o navegador de verdade.
 *  3. Isenções legítimas: cron da Vercel (x-vercel-cron: 1) e chamadas
 *     admin/CLI com x-admin-secret válido nunca são bloqueadas.
 *  4. Headers de segurança extras + X-Robots-Tag: noindex em /api/* (as
 *     respostas JSON/HTML das funções não devem ser indexadas).
 *
 * AUTOCONTIDO — duplicamos aqui os regexes para não arriscar resolução de
 * módulo em runtime (mesmo padrão das api/*.ts).
 */

import { next } from '@vercel/functions';

/** Crawlers de busca/redes sociais — SEMPRE permitidos (indexação/SEO). */
const SEO_CRAWLERS =
  /(googlebot|bingbot|duckduckbot|baiduspider|yandexbot|applebot|facebookexternalhit|whatsapp|instagram|linkedinbot|twitterbot|telegrambot|discordbot|slackbot|pinterest|snapchat|tiktok|flipboard|feedbin|gptbot|ccbot|anthropic|claudebot|perplexitybot|ahrefs|semrush|moz(?:illa)?bot|screaming\s*frog|archive\.org_bot|petalbot|bytespider|pingdom|uptimerobot|exabot|mj12bot|dotbot|adidxbot|naverbot)/i;

/** Ferramentas de raspagem/automação — bloqueadas em rotas caras. */
const SCRAPER_BOTS =
  /(curl|wget2?|libwww|python-requests|python-urllib|scrapy|aiohttp|httpx|go-http-client|okhttp|node-fetch|axios|undici|fetch\/|postman|httpie|apache-httpclient|php\/|ruby|perl|powershell|masscan|nikto|sqlmap|zgrab|nessus|burp|selenium|playwright|puppeteer|phantomjs|headlesschrome|headless-chrome|python)/i;

// ── Rate limit em memória (por instância edge; melhor esforço) ────────
const buckets = new Map<string, { count: number; resetAt: number }>();

function take(ip: string, group: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 4000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const key = `${group}:${ip}`;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

/** IP real do cliente (a Vercel garante o header; nunca confiar em XFF cru). */
function clientIp(req: Request): string {
  const vff = req.headers.get('x-vercel-forwarded-for');
  if (vff) return vff.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  });
}

function blockedText(): Response {
  return new Response('Acesso negado.', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function rateLimitedText(): Response {
  return new Response('Muitas requisições. Tente novamente em instantes.', {
    status: 429,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '60',
    },
  });
}

/** Headers extras a fixar quando a requisição segue o fluxo (next()). */
function extraHarden(isApi: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Origin-Agent-Cluster': '?2',
    'X-XSS-Protection': '0',
  };
  if (isApi) {
    h['X-Robots-Tag'] = 'noindex, nofollow';
    h['Cache-Control'] = 'no-store';
  }
  return h;
}

// Roda em tudo exceto assets estáticos (o Vite usa /assets/, e o público
// usa logo.png, sw.js, manifest.json, og-image.png etc.)
export const config = {
  matcher: [
    '/((?!_next/|@vite|assets/|src/|node_modules/|logo|favicon|sw\\.js|manifest\\.json|og-image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|mp3|mp4|webmanifest|txt)$).*)',
  ],
};

export default function middleware(req: Request): Response {
  const pathname = new URL(req.url).pathname;
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') || '';

  const isApi = pathname.startsWith('/api/');
  const isSong = pathname.startsWith('/musica/');
  const isSeo = SEO_CRAWLERS.test(ua);
  const isScraper = !isSeo && SCRAPER_BOTS.test(ua);

  // Isenções legítimas: cron da Vercel e chamadas admin (CLI/scripts).
  if (req.headers.get('x-vercel-cron') === '1') {
    return next({ headers: extraHarden(isApi) });
  }
  const expected = process.env.ADMIN_SECRET;
  if (expected && req.headers.get('x-admin-secret') === expected) {
    return next({ headers: extraHarden(isApi) });
  }

  // Bots de scraping em rotas que entregam dados/custo → 403.
  if (isScraper && (isApi || isSong)) {
    return isApi ? json(403, { error: 'Acesso negado.' }) : blockedText();
  }

  // Rate limit por IP: /api/* apertado, /musica/* médio, páginas folgado.
  // Em /musica/* e páginas HTML o 429 é texto (a rota entrega HTML, não JSON).
  if (isApi) {
    if (!take(ip, 'api', 120, 60_000)) {
      return json(429, { error: 'Muitas requisições. Tente novamente em instantes.' }, { 'Retry-After': '60' });
    }
  } else if (isSong) {
    if (!take(ip, 'song', 240, 60_000)) {
      return rateLimitedText();
    }
  } else if (!take(ip, 'page', 900, 300_000)) {
    return rateLimitedText();
  }

  // Continua a requisição para a função serverless/estático normalmente.
  return next({ headers: extraHarden(isApi) });
}
