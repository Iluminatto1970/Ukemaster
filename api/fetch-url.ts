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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Use POST.' });
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
