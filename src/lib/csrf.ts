/**
 * CSRF protection via double-submit cookie pattern.
 * - GET/HEAD/OPTIONS: emit __Host-csrf cookie (SameSite=Strict, Secure).
 * - POST/PUT/DELETE/PATCH: validate x-csrf-token header matches cookie.
 * No external deps; uses Node crypto on server / Web Crypto on Edge.
 */

const COOKIE_NAME = '__Host-csrf';
const HEADER_NAME = 'x-csrf-token';

function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

function buildSetCookie(token: string, isProd: boolean): string {
  // __Host- prefix requires Secure + Path=/ + no Domain → only over HTTPS in prod.
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'SameSite=Strict',
    isProd ? 'Secure' : '',
    // Token is intentionally JS-readable so client can echo it as a header
    // (double-submit). Not httpOnly by design.
  ].filter(Boolean);
  return parts.join('; ');
}

function randomToken(): string {
  // 16 bytes hex → 32 chars.
  // Prefer Node crypto (available in api/* and server.ts); fall back to Web Crypto for Edge.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof (c as Crypto & { randomBytes?: unknown }).randomBytes === 'function') {
    return (c as unknown as { randomBytes(n: number): Buffer }).randomBytes(16).toString('hex');
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CsrfResult {
  ok: boolean;
  setCookie?: string;
  reason?: string;
}

/**
 * Validate the request and, if needed, produce a Set-Cookie to emit.
 * Caller must forward setCookie to the response (Edge middleware sets it
 * on the request, serverless attaches via res.setHeader).
 */
export function csrfProtect(
  method: string | undefined,
  cookieHeader: string | null | undefined,
  csrfHeader: string | null | undefined,
  isProd: boolean = true
): CsrfResult {
  const cookies = parseCookies(cookieHeader);
  let token = cookies[COOKIE_NAME];
  let setCookie: string | undefined;

  if (!token) {
    token = randomToken();
    setCookie = buildSetCookie(token, isProd);
  }

  const m = (method || 'GET').toUpperCase();
  if (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
    if (!csrfHeader || csrfHeader !== token) {
      // Even on failure, refresh the cookie so the client can retry cleanly.
      setCookie = buildSetCookie(token, isProd);
      return { ok: false, setCookie, reason: 'CSRF token ausente ou inválido.' };
    }
  }

  return { ok: true, setCookie };
}
