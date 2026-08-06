/**
 * Endpoint /api/robots: gera robots.txt apontando para o sitemap.
 */
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
  // robots.txt: as APIs não devem ser indexadas; scrapers de ferramentas
  // conhecidas são bloqueados também no nível educado do robots (a proteção
  // real é o middleware Edge + rate limit).
  res.end(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      // Ferramentas de raspagem — nada a fazer aqui
      'User-agent: curl',
      'Disallow: /',
      'User-agent: wget',
      'Disallow: /',
      'User-agent: python-requests',
      'Disallow: /',
      'User-agent: python-urllib',
      'Disallow: /',
      'User-agent: scrapy',
      'Disallow: /',
      'User-agent: go-http-client',
      'Disallow: /',
      'User-agent: headlesschrome',
      'Disallow: /',
      '',
      `Sitemap: ${siteUrl}/sitemap.xml`,
      '',
    ].join('\n')
  );
}
