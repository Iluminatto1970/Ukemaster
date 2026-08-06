/**
 * Endpoint /api/scrape-platforms: dispara o cron de plataformas (BR/internacionais) sob demanda.
 */
/**
 * Vercel Serverless Function — /api/scrape-platforms
 * Alvo do CRON diário (vercel.json) + disparo manual pela área admin.
 *
 * POST com corpo opcional:
 *   { "platformId": "cifraclub-br", "artistUrl": "https://...", "limit": 5, "fast": true }
 *   (vazio = cron automático com rotação diária)
 *
 * Retorna { ok, ranAt, results: [...], totalImported, ... }.
 *
 * SEGURANÇA (ver src/lib/adminAuth.ts):
 *  - Rate limit por IP (anti-abuso);
 *  - Autorização: JWT do admin logado (Authorization: Bearer) OU o cron da
 *    Vercel (header x-vercel-cron: 1) OU x-admin-secret (CLI). Em produção,
 *    sem credencial válida → 403.
 */

// Extensão .ts explícita: sem ela a Vercel (ESM) não resolve o módulo em
// runtime (ERR_MODULE_NOT_FOUND). O tsconfig tem allowImportingTsExtensions.
import { runPlatformCron } from '../src/lib/platformCron.ts';
import { authorizeAdminRequest } from '../src/lib/adminAuth.ts';
import { getClientIp, rateLimit } from '../src/lib/security.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 60;

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) {
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
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function securityHeaders(res: ServerResponse) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  securityHeaders(res);
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Use POST.' });
  }

  // Rate limit: máx 6 disparos/min por IP (o cron roda 1x/dia; o resto é abuso).
  const rl = rateLimit(getClientIp(req), 'scrape-platforms', 6, 60_000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter ?? 60));
    return send(res, 429, { error: `Muitas requisições. Tente novamente em ${rl.retryAfter}s.` });
  }

  // Autorização: JWT admin, cron da Vercel ou admin secret.
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const auth = await authorizeAdminRequest(headers, { allowCron: true });
  if (!auth.ok) return send(res, 403, { error: auth.reason });

  let body: any = {};
  try {
    body = await readBody(req);
  } catch (e: any) {
    return send(res, 400, { error: e?.message || 'Requisição inválida.' });
  }

  try {
    const result = await runPlatformCron({
      platformId: body.platformId,
      artistUrl: body.artistUrl,
      limit: body.limit ? Number(body.limit) : undefined,
      fast: Boolean(body.fast),
    });
    return send(res, 200, result);
  } catch (e: any) {
    return send(res, 500, {
      ok: false,
      error: e?.message || 'Erro ao executar o cron de plataformas.',
    });
  }
}
