/**
 * Vercel Serverless Function — /robots.txt (via rewrite)
 * Autocontida (não importa de src/) — a Vercel compila cada api/*.ts isolado.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 5;

function getSiteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.APP_URL ||
    'https://ukemasterpro.vercel.app'
  );
}

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
