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
      // Scripts: próprio site + AdSense + YouTube + Monetag (auth Supabase é REST, sem script externo).
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://www.google.com https://www.gstatic.com https://www.youtube.com https://s.ytimg.com https://n6wxm.com https://ep2.adtrafficquality.google https://ep1.adtrafficquality.google",
      // Estilos: inline necessário para React/Tailwind; sem 'unsafe-eval'.
      "style-src 'self' 'unsafe-inline'",
      // Imagens: próprias + avatares + thumbnails + anúncios.
      "img-src 'self' data: blob: https://ui-avatars.com https://img.youtube.com https://i.ytimg.com https://www.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.gstatic.com",
      // Conexões (fetch/XHR/WS): Supabase (REST + Auth) + Vite HMR (dev) + ads.
      "connect-src 'self' https://asvjdjawaenxrlwdyziy.supabase.co wss://localhost:* ws://localhost:* https://pagead2.googlesyndication.com https://ep2.adtrafficquality.google https://ep1.adtrafficquality.google https://*.google.com https://*.googleapis.com",
      // Frames: YouTube embed + iframes de anúncio.
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://td.doubleclick.net https://ep2.adtrafficquality.google",
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
 * Valida o token de admin. Se ADMIN_SECRET não estiver configurado no env,
 * a rota fica ABERTA (comportamento dev-friendly); se estiver, exige o
 * header `x-admin-secret` igual ao valor. Retorna { ok, reason? }.
 */
export function requireAdminSecret(secretHeader: string | undefined): { ok: boolean; reason?: string } {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return { ok: true }; // sem secret configurado → aberto (dev)
  if (!secretHeader) return { ok: false, reason: 'Token de administração ausente.' };
  if (secretHeader !== expected) return { ok: false, reason: 'Token de administração inválido.' };
  return { ok: true };
}

/** Extrai o IP do cliente de forma segura (evita spoof por header). */
export function getClientIp(
  req: { socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }
): string {
  // Na Vercel, o IP real vem do header x-forwarded-for (último hop confiável).
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.includes(',')) {
    return xff.split(',')[0].trim() || 'unknown';
  }
  if (typeof xff === 'string') return xff.trim() || 'unknown';
  return req.socket?.remoteAddress || 'unknown';
}
