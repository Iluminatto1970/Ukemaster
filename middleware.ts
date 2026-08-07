/**
 * Routing Middleware (Vercel) — SSR da HOME para crawlers.
 *
 * POR QUE middleware e não rewrite do vercel.json: na raiz `/` existe o
 * arquivo estático index.html, e arquivos estáticos têm PRIORIDADE sobre
 * rewrites do vercel.json — a rewrite `{ source: "/", has: bot }` nunca
 * aplicava (o crawler recebia o shell vazio do SPA). O middleware roda
 * ANTES do serving estático e pode reescrever a requisição.
 *
 * Segue a doc oficial do Vercel para frameworks "other" (não-Next):
 *   - DEFAULT export (não named export);
 *   - helper `rewrite()` de `@vercel/functions` (já no package.json) —
 *     reescreve a rota mantendo a URL visível;
 *   - sem return explícito = pass-through (serve o recurso normal).
 * `matcher: '/'` limita a execução à raiz — zero overhead nas demais rotas.
 */
import { rewrite } from '@vercel/functions';

const BOT_RE = new RegExp(
  '.*(bot|crawler|spider|googlebot|bingbot|yandex|duckduckbot|baiduspider|whatsapp|instagram|facebookexternalhit|twitterbot|linkedinbot|telegrambot|discordbot|slackbot|pinterest|applebot|gptbot|ccbot|anthropic|claudebot|perplexitybot|ahrefs|semrush).*',
  'i'
);

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === '/') {
    const ua = request.headers.get('user-agent') || '';
    if (BOT_RE.test(ua)) {
      // Crawler → SSR da home com conteúdo indexável (api/home.ts)
      return rewrite(new URL('/api/home', request.url));
    }
  }
  // Sem return = pass-through (navegador recebe o SPA normal)
}

export const config = {
  matcher: '/',
};
