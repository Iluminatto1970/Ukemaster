/**
 * Vercel Serverless Function — /robots.txt (via rewrite)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getSiteUrl } from '../src/lib/supabaseServer';

export const maxDuration = 5;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const siteUrl = getSiteUrl();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.end(
    [
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: ${siteUrl}/sitemap.xml`,
      '',
    ].join('\n')
  );
}
