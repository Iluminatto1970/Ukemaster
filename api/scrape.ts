/**
 * Vercel Serverless Function — /api/scrape
 * Scraping de cifras do UkeMaster Pro (área admin, uso do proprietário).
 *
 * Dois modos (POST com JSON):
 *  1. { "discover": "https://www.cifraclub.com.br/alceu-valenca/" }
 *     → { links: [{ url, title, artist }] }   (rápido — 1 fetch)
 *  2. { "songs": ["https://...musica.html", ...] }   (máx ~6 por chamada)
 *     → { results: [{ song?, error? }] }
 *
 * Roda no Node (fetch + regex), sem dependências. Timeout ajustado para
 * comportar lotes pequenos no plano gratuito (Hobby).
 */

// Extensão .ts explícita: sem ela a Vercel (ESM) não resolve o módulo em
// runtime (ERR_MODULE_NOT_FOUND). O tsconfig tem allowImportingTsExtensions.
import { discoverSongLinks, fetchHtml, scrapeSong } from '../src/lib/scraper.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel: permite até 60s no Hobby (padrão 10s)
export const maxDuration = 60;

const BATCH_LIMIT = 6;

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
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

  try {
    // ── Modo 1: descoberta de links ─────────────────────────────────
    if (body.discover) {
      const url = String(body.discover).trim();
      if (!/^https?:\/\//i.test(url)) {
        return send(res, 400, { error: 'Informe uma URL válida (https://...).' });
      }
      const html = await fetchHtml(url);
      const links = discoverSongLinks(html, url);
      return send(res, 200, { ok: true, links, total: links.length });
    }

    // ── Modo 2: scrape em lote de URLs ─────────────────────────────
    if (Array.isArray(body.songs) && body.songs.length > 0) {
      const urls = body.songs.slice(0, BATCH_LIMIT).map((u: unknown) => String(u));
      const results = [];
      for (const url of urls) {
        try {
          const song = await scrapeSong(url);
          results.push({ song });
        } catch (e: any) {
          results.push({ url, error: e?.message || 'Erro ao processar esta música.' });
        }
      }
      return send(res, 200, { ok: true, results });
    }

    return send(res, 400, { error: 'Envie { discover } ou { songs } no corpo da requisição.' });
  } catch (e: any) {
    return send(res, 500, { error: e?.message || 'Erro no scraping.' });
  }
}
