/**
 * Endpoint utilitário: proxy de fetch de URLs (usado para ler páginas no editor/importação).
 */
/**
 * Vercel Serverless Function — /api/fetch-url
 * Busca o HTML de uma URL externa sem restrições de CORS.
 * Equivale ao endpoint do server.ts, mas disponível na Vercel (produção).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 30;

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 200_000) {
        reject(new Error('Corpo muito grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// ── Segurança: headers de proteção em TODA resposta desta rota ────────
function securityHeaders(res: ServerResponse) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ── Anti-SSRF: allowlist de domínios de plataformas de cifra ──────────
const ALLOWED_DOMAINS = /(^|\.)(cifraclub\.com\.br|cifraclub\.com|ultimateguitar\.com|e-chords\.com|guitaretab\.com|guitartabs\.cc|songsterr\.com|jellynote\.com|studylib\.net)$/i;

/**
 * Bloqueia fetch para IPs privados/localhost/metadata cloud (SSRF).
 * Só aceita http(s) e domínios da lista de plataformas de cifra.
 */
function isAllowedFetchUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host.includes(':');
  if (isIp) return false;
  return ALLOWED_DOMAINS.test(host);
}

// ── Rate limit simples (janela em memória) ────────────────────────────
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, scope: string, max: number, windowMs: number): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  b.count += 1;
  if (b.count > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  return { ok: true };
}

function getClientIp(req: IncomingMessage): string {
  // Anti-spoof: na Vercel o IP real do cliente vem do x-vercel-forwarded-for;
  // em x-forwarded-for o ÚLTIMO valor é o adicionado pela plataforma.
  if (process.env.VERCEL) {
    const vff = req.headers['x-vercel-forwarded-for'];
    if (typeof vff === 'string' && vff.trim()) return vff.trim().split(',')[0];
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.includes(',')) {
      const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
      return parts[parts.length - 1] || 'unknown';
    }
    if (typeof xff === 'string' && xff.trim()) return xff.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  securityHeaders(res);
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Use POST.' });
  }

  const rl = rateLimit(getClientIp(req), 'fetch-url', 20, 60_000);
  if (!rl.ok) {
    return send(res, 429, { error: `Muitas requisições. Tente novamente em ${rl.retryAfter}s.` });
  }

  let body: any;
  try {
    body = await readBody(req);
  } catch (e: any) {
    return send(res, 400, { error: e?.message || 'Requisição inválida.' });
  }

  const { url } = body;
  if (!url || typeof url !== 'string') {
    return send(res, 400, { error: 'URL inválida ou ausente.' });
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // Anti-SSRF: recusa qualquer URL fora da allowlist de plataformas de cifra.
  if (!isAllowedFetchUrl(targetUrl)) {
    return send(res, 403, {
      error: 'URL fora da lista de plataformas permitidas (CifraClub, Ultimate-Guitar, E-Chords, GuitarEtab, Songsterr...).',
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      return send(res, response.status, {
        error: `O site de origem respondeu com status ${response.status}.`,
      });
    }

    const html = await response.text();
    return send(res, 200, { ok: true, html });
  } catch (err: any) {
    return send(res, 500, {
      error: err?.message || 'Erro de conexão ao buscar a URL solicitada.',
    });
  }
}
