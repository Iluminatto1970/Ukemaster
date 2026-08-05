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
 */

// Extensão .ts explícita: sem ela a Vercel (ESM) não resolve o módulo em
// runtime (ERR_MODULE_NOT_FOUND). O tsconfig tem allowImportingTsExtensions.
import { runPlatformCron } from '../src/lib/platformCron.ts';
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
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Use POST.' });
  }

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
