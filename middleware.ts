/**
 * Middleware Edge (Vercel) — SSR da HOME para crawlers.
 *
 * POR QUE middleware e não rewrite do vercel.json: na raiz `/` existe o
 * arquivo estático index.html, e arquivos estáticos têm PRIORIDADE sobre
 * rewrites do vercel.json — a rewrite `{ source: "/", has: bot }` nunca
 * aplicava (o crawler recebia o shell vazio do SPA). O middleware roda
 * ANTES do serving estático e pode reescrever a requisição.
 *
 * SEM `next/server`: em projeto não-Next (Vite, `"type": "module"`), importar
 * `{ NextResponse } from 'next/server'` quebra no Edge Runtime do Vercel
 * (ReferenceError: __dirname is not defined — o bundler não transforma o
 * CJS interno do pacote next). Aqui usamos Web APIs puras:
 *   - reescrita  → Response com header `x-middleware-rewrite` (é exatamente
 *     o que NextResponse.rewrite() emite internamente);
 *   - pass-through → Response com header `x-middleware-next` (equivale ao
 *     NextResponse.next()).
 * Navegadores passam direto e recebem o SPA normalmente. O `matcher`
 * limita a execução à raiz — zero overhead nas demais rotas.
 */

const BOT_RE = new RegExp(
  '.*(bot|crawler|spider|googlebot|bingbot|yandex|duckduckbot|baiduspider|whatsapp|instagram|facebookexternalhit|twitterbot|linkedinbot|telegrambot|discordbot|slackbot|pinterest|applebot|gptbot|ccbot|anthropic|claudebot|perplexitybot|ahrefs|semrush).*',
  'i'
);

export function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (url.pathname === '/') {
    const ua = request.headers.get('user-agent') || '';
    if (BOT_RE.test(ua)) {
      // Reescreve a raiz para o SSR da home (mesma semântica de
      // NextResponse.rewrite('/api/home')). O crawler vê o conteúdo
      // indexável; a URL na barra permanece "https://site/".
      return new Response(null, {
        headers: { 'x-middleware-rewrite': '/api/home' },
      });
    }
  }
  // Pass-through para o servidor estático / SPA
  return new Response(null, {
    headers: { 'x-middleware-next': '1' },
  });
}

export const config = {
  matcher: ['/'],
};
