/**
 * Endpoint /api/scrape: scraping on-demand de uma URL de cifra (usado pelo AdminScraper).
 */
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
import { authorizeAdminRequest } from '../src/lib/adminAuth.ts';
import { getClientIp, rateLimit } from '../src/lib/security.ts';
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

// ── Segurança: headers + proteção admin + anti-SSRF + rate limit ──────
function securityHeaders(res: ServerResponse) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

const ALLOWED_DOMAINS = /(^|\.)(cifraclub\.com\.br|cifraclub\.com|ultimateguitar\.com|e-chords\.com|guitaretab\.com|guitartabs\.cc|songsterr\.com|jellynote\.com|studylib\.net)$/i;

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

/** Rota administrativa: JWT do admin (Authorization: Bearer) ou x-admin-secret. */
function requireAdmin(req: IncomingMessage): Promise<{ ok: boolean; reason?: string }> {
  return authorizeAdminRequest(req.headers as Record<string, string | string[] | undefined>, {
    allowCron: false,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  securityHeaders(res);
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Use POST.' });
  }

  // Proteção: só o proprietário (JWT do admin logado ou ADMIN_SECRET).
  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, 403, { error: auth.reason });

  const rl = rateLimit(getClientIp(req), 'scrape', 10, 60_000);
  if (!rl.ok) {
    return send(res, 429, { error: `Muitas requisições. Tente novamente em ${rl.retryAfter}s.` });
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
      if (!isAllowedFetchUrl(url)) {
        return send(res, 403, { error: 'URL fora da lista de plataformas permitidas.' });
      }
      const html = await fetchHtml(url);
      const links = discoverSongLinks(html, url);
      return send(res, 200, { ok: true, links, total: links.length });
    }

    // ── Modo 2: scrape em lote de URLs ─────────────────────────────
    if (Array.isArray(body.songs) && body.songs.length > 0) {
      const urls = body.songs.slice(0, BATCH_LIMIT).map((u: unknown) => String(u));
      const blocked = urls.filter((u) => !isAllowedFetchUrl(u));
      if (blocked.length > 0) {
        return send(res, 403, { error: 'URL fora da lista de plataformas permitidas.' });
      }
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
