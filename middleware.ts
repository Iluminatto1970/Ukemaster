/**
 * Middleware Edge (Vercel) — SSR da HOME para crawlers.
 *
 * POR QUE middleware e não rewrite do vercel.json: na raiz `/` existe o
 * arquivo estático index.html, e arquivos estáticos têm PRIORIDADE sobre
 * rewrites do vercel.json — por isso a rewrite `{ source: "/", has: bot }`
 * nunca aplicava (o crawler recebia o shell vazio do SPA). O middleware
 * roda ANTES do serving estático e pode reescrever a requisição.
 *
 * A reescrita é para `/api/home` (função autocontida que pré-renderiza
 * título, descrição, JSON-LD e a lista de sugestões). Navegadores passam
 * direto (NextResponse.next()) e recebem o SPA normalmente. O `matcher`
 * limita a execução à raiz — zero overhead nas demais rotas.
 */
import { NextRequest, NextResponse } from 'next/server';

// NOTA: `(?i)` inline não existe em JS (V8/Edge) — usa a flag 'i' do RegExp.
// O vercel.json usa `(?i)` porque o roteador tem engine próprio; o middleware
// roda no Edge Runtime (V8), então aqui é `new RegExp(..., 'i')`.
const BOT_RE = new RegExp(
  '.*(bot|crawler|spider|googlebot|bingbot|yandex|duckduckbot|baiduspider|whatsapp|instagram|facebookexternalhit|twitterbot|linkedinbot|telegrambot|discordbot|slackbot|pinterest|applebot|gptbot|ccbot|anthropic|claudebot|perplexitybot|ahrefs|semrush).*',
  'i'
);

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname === '/') {
    const ua = request.headers.get('user-agent') || '';
    if (BOT_RE.test(ua)) {
      return NextResponse.rewrite(new URL('/api/home', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
