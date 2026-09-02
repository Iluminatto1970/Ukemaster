/**
 * Endpoint utilitário: proxy de fetch de URLs (usado para ler páginas no editor/importação).
 */
/**
 * Vercel Serverless Function — /api/fetch-url
 * Busca o HTML de uma URL externa sem restrições de CORS.
 * Equivale ao endpoint do server.ts, mas disponível na Vercel (produção).
 *
 * SEGURANÇA (defesa em profundidade — o middleware Edge já bloqueia bots):
 *  - Rate limit por IP (janela móvel em memória);
 *  - Bloqueio de bots/ferramentas de raspagem (User-Agent);
 *  - Anti-SSRF com GUARDA DE REDIRECIONAMENTO: cada hop do redirect é
 *    revalidado contra a allowlist (impede 302 para rede interna/metadata);
 *  - Limite de tamanho da resposta e validação de Content-Type.
 */
import { fetchWithRedirectGuard, classifyUserAgent, getClientIp, rateLimit } from '../src/lib/security.js';
import { csrfProtect } from '../src/lib/csrf.js';
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
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  securityHeaders(res);
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Falha no processamento' });
  }

  // Ferramentas de raspagem não usam este proxy (é para o import manual).
  if (classifyUserAgent(String(req.headers['user-agent'] || '')) === 'scraper') {
    return send(res, 403, { error: 'Falha no processamento' });
  }

  // CSRF protection (double‑submit: cookie __Host-csrf + header x-csrf-token)
  const csrfResult = csrfProtect(
    req.method,
    req.headers.cookie,
    req.headers['x-csrf-token'],
    process.env.NODE_ENV === 'production'
  );
  if (csrfResult.setCookie) {
    const existing = res.getHeader('Set-Cookie');
    const arr = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
    arr.push(csrfResult.setCookie);
    res.setHeader('Set-Cookie', arr);
  }
  if (!csrfResult.ok) {
    return send(res, 403, { error: csrfResult.reason });
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

  const result = await fetchWithRedirectGuard(url.trim(), {
    maxBytes: 2_000_000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
    },
  });

  if (!result.ok) {
    const status = result.status && result.status >= 400 ? result.status : 502;
    return send(res, status, { error: result.error || 'Erro ao buscar a URL solicitada.' });
  }

  return send(res, 200, { ok: true, html: result.html });
}
