/**
 * Políticas de boas práticas de segurança do UkeMaster Pro.
 *
 * Centraliza 4 defesas reutilizáveis em server.ts e nas Vercel Functions:
 *  1. securityHeaders()        — headers de segurança HTTP (CSP, nosniff,
 *                                frame-options, referrer-policy, HSTS...).
 *  2. isAllowedFetchUrl()      — anti-SSRF: só permite fetch de domínios de
 *                                cifra conhecidos (bloqueia IPs privados/
 *                                localhost/metadata cloud).
 *  3. rateLimit()              — limite de requisições por IP (janela móvel)
 *                                para endpoints POST de escrita/scraping.
 *  4. requireAdminSecret()     — protege rotas administrativas (scrape/cron)
 *                                com um token compartilhado (env ADMIN_SECRET).
 */

// ── 0. Classificação de User-Agent (bots × crawlers de SEO) ──────────
/**
 * Crawlers de SEO/redes sociais que DEVEM continuar acessando (o site
 * depende do prerender /musica/:id para indexar e para links do WhatsApp).
 */
export const SEO_CRAWLERS =
  /(googlebot|bingbot|duckduckbot|baiduspider|yandexbot|applebot|facebookexternalhit|whatsapp|instagram|linkedinbot|twitterbot|telegrambot|discordbot|slackbot|pinterest|snapchat|tiktok|flipboard|feedbin|gptbot|ccbot|anthropic|claudebot|perplexitybot|ahrefs|semrush|moz(?:illa)?bot|screaming\s*frog|archive\.org_bot|petalbot|bytespider|pingdom|uptimerobot|exabot|mj12bot|dotbot|adidxbot|naverbot)/i;

/**
 * Ferramentas de scraping/automação clássicas (curl, python-requests...).
 * Usadas pelo middleware Edge e pelo server.ts para negar rotas caras.
 */
export const SCRAPER_BOTS =
  /(curl|wget2?|libwww|python-requests|python-urllib|scrapy|aiohttp|httpx|go-http-client|okhttp|node-fetch|axios|undici|fetch\/|postman|httpie|apache-httpclient|php\/|ruby|perl|powershell|masscan|nikto|sqlmap|zgrab|nessus|burp|selenium|playwright|puppeteer|phantomjs|headlesschrome|headless-chrome|python)/i;

/**
 * Classifica o User-Agent de uma requisição:
 *  - 'seo'     → crawler de busca/redes (permitido SEMPRE — indexação);
 *  - 'scraper' → ferramenta de automação/raspagem (bloquear rotas caras);
 *  - 'browser' → navegador comum (permitido, sujeito a rate limit);
 *  - null      → sem UA identificável (tratar como browser, rate limit).
 */
export function classifyUserAgent(
  ua: string | undefined
): 'seo' | 'scraper' | 'browser' | null {
  const value = (ua || '').trim();
  if (!value) return null;
  if (SEO_CRAWLERS.test(value)) return 'seo';
  if (SCRAPER_BOTS.test(value)) return 'scraper';
  return 'browser';
}

// ── 0b. Fetch seguro com guarda de redirecionamento (anti-SSRF) ───────
/**
 * Busca uma URL externa validando CADA hop de redirecionamento contra a
 * allowlist — um atacante não consegue usar o proxy como SSRF via
 * redirect (ex.: um domínio permitido que 302 para 169.254.169.254).
 * Máx. 4 hops, limite de tamanho e validação de Content-Type.
 */
export async function fetchWithRedirectGuard(
  rawUrl: string,
  opts: { maxBytes?: number; headers?: Record<string, string> } = {}
): Promise<{ ok: boolean; status?: number; html?: string; error?: string }> {
  const maxBytes = opts.maxBytes || 2_000_000;
  const baseHeaders = opts.headers || {};
  let current = rawUrl.trim();
  if (!/^https?:\/\//i.test(current)) current = 'https://' + current;

  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedFetchUrl(current)) {
      return { ok: false, error: SSRF_ERROR };
    }
    let response: Response;
    try {
      response = await fetch(current, {
        headers: baseHeaders,
        redirect: 'manual',
      });
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Erro de conexão ao buscar a URL solicitada.' };
    }

    const status = response.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, status, error: 'Redirecionamento sem destino.' };
      try {
        current = new URL(location, current).href;
      } catch {
        return { ok: false, status, error: 'Redirecionamento inválido.' };
      }
      continue;
    }

    if (!response.ok) {
      return { ok: false, status, error: `O site de origem respondeu com status ${status}.` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain|text\/markdown/i.test(contentType)) {
      return { ok: false, status, error: 'O link não retornou conteúdo HTML/texto.' };
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      return { ok: false, status, error: 'Página muito grande para importação.' };
    }
    return { ok: true, status, html: text };
  }

  return { ok: false, error: 'Redirecionamentos em excesso.' };
}

// ── 1. Headers de segurança HTTP ──────────────────────────────────────
export interface SecurityHeaderOptions {
  /** true em produção → adiciona Strict-Transport-Security. */
  hsts?: boolean;
}

/**
 * Headers de segurança recomendados pelo OWASP para uma SPA com anúncios.
 *
 * A CSP é pragmática: permite os domínios que o app precisa (Supabase,
 * AdSense, YouTube, Monetag) sem abrir 'unsafe-eval' para scripts de terceiros
 * (esses rodam em iframes próprios). Estilos inline são necessários para o
 * React (style={{}}) e o Tailwind.
 */
export function securityHeaders(opts: SecurityHeaderOptions = {}): Record<string, string> {
  const h: Record<string, string> = {
    // Mídias/navegação padrão: só o próprio site.
    'Content-Security-Policy': [
      "default-src 'self'",
      // Site 100% HTTPS: o navegador sobe qualquer recurso http:// para https.
      'upgrade-insecure-requests',
      // Scripts: próprio site + AdSense + YouTube + Monetag (auth Supabase é REST, sem script externo).
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://www.google.com https://www.gstatic.com https://www.youtube.com https://s.ytimg.com https://fundingchoicesmessages.google.com https://n6wxm.com https://nap5k.com https://quge5.com https://5gvci.com https://3nbf4.com https://ep2.adtrafficquality.google https://ep1.adtrafficquality.google",
      // Estilos: inline necessário para React/Tailwind; sem 'unsafe-eval'.
      "style-src 'self' 'unsafe-inline'",
      // Imagens: próprias + avatares + thumbnails + anúncios (inclui a
      // telemetria de qualidade do AdSense: ep1/ep2.adtrafficquality.google).
      "img-src 'self' data: blob: https://ui-avatars.com https://api.dicebear.com https://img.youtube.com https://i.ytimg.com https://*.ytimg.com https://www.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.gstatic.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
      // Conexões (fetch/XHR/WS): Supabase (REST + Auth) + Vite HMR (dev) + ads.
      "connect-src 'self' https://asvjdjawaenxrlwdyziy.supabase.co wss://localhost:* ws://localhost:* https://pagead2.googlesyndication.com https://ep2.adtrafficquality.google https://ep1.adtrafficquality.google https://*.google.com https://*.googleapis.com https://fundingchoicesmessages.google.com https://my.rtmark.net https://jhnwr.com https://ldrws.com https://n6wxm.com https://nap5k.com https://quge5.com https://5gvci.com https://3nbf4.com",
      // Frames: YouTube embed + iframes de anúncio (inclui a vignette Monetag).
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://td.doubleclick.net https://www.google.com https://fundingchoicesmessages.google.com https://ep2.adtrafficquality.google https://n6wxm.com",
      // Fontes: próprias + data URI (ícones).
      "font-src 'self' data:",
      // Workers (service worker PWA).
      "worker-src 'self' blob:",
      // Objetos/mídia: desabilitado por padrão.
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
    // Bloqueia MIME sniffing (evita que HTML seja executado como JS etc).
    'X-Content-Type-Options': 'nosniff',
    // Impede embedding em iframes de terceiros (clickjacking).
    'X-Frame-Options': 'SAMEORIGIN',
    // Protege contra site-isolation básica.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    // Referrer: nunca vaza a URL completa (só origem).
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Desliga APIs/permissões que o app não usa (câmera/mic só no afinador,
    // que pede permissão explicitamente).
    'Permissions-Policy':
      'camera=(self), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=()',
    // Pré-busca DNS desligada para domínios externos (privacy).
    'X-DNS-Prefetch-Control': 'off',
    // Bloqueia carregamento de recursos cross-origin deste documento
    // (proteção extra contra exfiltração em cenários de embedding).
    'X-Permitted-Cross-Domain-Policies': 'none',
    // Isolamento de agente de origem (mitigação de side-channel).
    'Origin-Agent-Cluster': '?2',
    // O filtro XSS legado é desligado — o CSP moderno já protege e o filtro
    // legado pode INTRODUZIR vulnerabilidades (recommendação OWASP atual).
    'X-XSS-Protection': '0',
  };

  if (opts.hsts) {
    h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }

  return h;
}

/**
 * Aplica os headers de segurança numa resposta Express (server.ts).
 * Chama antes de qualquer res.send/json.
 */
export function applySecurityHeaders(
  res: { setHeader: (k: string, v: string) => unknown },
  opts: SecurityHeaderOptions = {}
): void {
  const h = securityHeaders(opts);
  for (const [k, v] of Object.entries(h)) {
    res.setHeader(k, v);
  }
}

// ── 2. Anti-SSRF: allowlist de domínios de cifra ──────────────────────
/**
 * Domínios de plataformas de cifra que o UkeMaster Pro importa. Qualquer
 * URL fora desta lista é recusada pelo proxy /api/fetch-url e pelo scraping.
 */
const ALLOWED_CIFRA_DOMAINS: RegExp[] = [
  /^cifraclub\.com\.br$/i,
  /^www\.cifraclub\.com\.br$/i,
  /^cifraclub\.com$/i,
  /^www\.cifraclub\.com$/i,
  /^ultimateguitar\.com$/i,
  /^www\.ultimateguitar\.com$/i,
  /^tabs\.ultimate-guitar\.com$/i,
  /^e-chords\.com$/i,
  /^www\.e-chords\.com$/i,
  /^guitaretab\.com$/i,
  /^www\.guitaretab\.com$/i,
  /^guitartabs\.cc$/i,
  /^www\.guitartabs\.cc$/i,
  /^songsterr\.com$/i,
  /^www\.songsterr\.com$/i,
  /^jellynote\.com$/i,
  /^www\.jellynote\.com$/i,
  /^studylib\.net$/i,
  /^www\.studylib\.net$/i,
  // Fontes internacionais do cron (multi-idioma): UkuTabs (EN) e U-FRET (JA)
  /^ukutabs\.com$/i,
  /^www\.ukutabs\.com$/i,
  /^ufret\.jp$/i,
  /^www\.ufret\.jp$/i,
];

/**
 * Verifica se uma URL pode ser buscada pelo servidor (anti-SSRF).
 *  - Só aceita http(s).
 *  - O hostname precisa estar na allowlist de plataformas de cifra.
 *  - Bloqueia IPs (números/literal) e localhost — nunca resolve para a rede
 *    interna/metadata cloud.
 */
export function isAllowedFetchUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();

  // Bloqueia IPs literais (IPv4, IPv6) e localhost — o proxy nunca deve
  // alcançar a rede interna nem o metadata cloud (169.254.169.254).
  const isIpLiteral =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host.startsWith('[') ||
    host.includes(':');

  // Resolve IPs decimais "camuflados" (ex.: http://2130706433/) e hex.
  const looksNumeric = /^\d+$/.test(host.replace(/\./g, '')) && /\d{5,}/.test(host);
  if (isIpLiteral || looksNumeric) return false;

  return ALLOWED_CIFRA_DOMAINS.some((re) => re.test(host));
}

/** Mensagem de erro padrão quando a URL é recusada. */
export const SSRF_ERROR =
  'URL fora da lista de plataformas permitidas (CifraClub, Ultimate-Guitar, E-Chords, GuitarEtab, Songsterr...).';

// ── 3. Rate limit simples (janela móvel, em memória) ──────────────────
interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

/** Remove buckets expirados (evita vazamento de memória). */
function sweepRateBuckets(now: number): void {
  for (const [key, b] of rateBuckets) {
    if (b.resetAt <= now) rateBuckets.delete(key);
  }
}

/**
 * Limita requisições por IP em uma janela. Retorna { ok } ou { ok:false, retryAfter }.
 * Uso: `const r = rateLimit(ip, 'fetch-url', 10, 60_000); if (!r.ok) return 429;`
 */
export function rateLimit(
  ip: string,
  scope: string,
  maxRequests: number,
  windowMs: number
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  if (rateBuckets.size > 500) sweepRateBuckets(now);

  const key = `${scope}:${ip}`;
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

// ── 4. Proteção de rotas administrativas ──────────────────────────────
/**
 * Valida o token de admin (header x-admin-secret). Fail-closed em produção:
 * se NODE_ENV=production/VERCEL e ADMIN_SECRET não estiver configurado, a
 * rota é NEGADA (nunca fica aberta em produção). Em dev, sem secret, fica
 * aberta para facilitar o fluxo local.
 *
 * Obs.: para o app em si, use authorizeAdminRequest (src/lib/adminAuth.ts),
 * que valida o JWT do usuário Supabase — mais seguro que secret no bundle.
 */
export function requireAdminSecret(secretHeader: string | undefined): { ok: boolean; reason?: string } {
  const expected = process.env.ADMIN_SECRET;
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  if (!expected) {
    if (isProd) return { ok: false, reason: 'ADMIN_SECRET não configurado em produção.' };
    return { ok: true }; // dev sem secret → aberto (conveniência local)
  }
  if (!secretHeader) return { ok: false, reason: 'Token de administração ausente.' };
  if (secretHeader !== expected) return { ok: false, reason: 'Token de administração inválido.' };
  return { ok: true };
}

/**
 * Extrai o IP do cliente de forma segura (evita spoof de header).
 *
 * Anti-spoof: o header x-forwarded-for é controlado pelo cliente fora de
 * proxies confiáveis, então só confiamos nele na Vercel (onde a plataforma
 * define o valor). Em dev/Express usamos o IP do socket — um atacante não
 * consegue burlar o rate limit enviando XFF falso.
 */
export function getClientIp(
  req: { socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }
): string {
  const onVercel = !!process.env.VERCEL;

  // Na Vercel, o x-vercel-forwarded-for contém o IP real do cliente (a
  // plataforma garante); x-forwarded-for pode ser influenciado pelo cliente.
  if (onVercel) {
    const vff = req.headers?.['x-vercel-forwarded-for'];
    if (typeof vff === 'string' && vff.trim()) return vff.trim().split(',')[0];
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.includes(',')) {
      // Último valor = adicionado pela Vercel (fonte confiável).
      const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
      return parts[parts.length - 1] || 'unknown';
    }
    if (typeof xff === 'string' && xff.trim()) return xff.trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}
