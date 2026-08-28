/**
 * Verificação de admin server-side (Vercel Functions + Express).
 *
 * A área administrativa (scraping, cron, exclusão de músicas) NÃO pode
 * confiar em um segredo embutido no bundle do navegador. Aqui o acesso é
 * autorizado de verdade: o cliente envia o JWT da sessão Supabase
 * (Authorization: Bearer) e o servidor valida esse token na API do
 * Supabase (GET /auth/v1/user) conferindo o e-mail contra o admin.
 *
 * Alternativas aceitas em /api/scrape-platforms (cron):
 *  - `Authorization: Bearer <CRON_SECRET>` → invocação legítima do cron da
 *    Vercel (a env CRON_SECRET é adicionada automaticamente pela infra);
 *  - header `x-admin-secret` → token compartilhado (ADMIN_SECRET), para
 *    disparos fora do navegador (CLI/scripts) — nunca no bundle.
 *  - header `x-vercel-cron: 1` → SOMENTE fallback quando CRON_SECRET não
 *    está configurado (o header é forjável — não é aceito com CRON_SECRET).
 */
import { getSupabaseServer } from './supabaseServer.js';

/** E-mail do proprietário (admin). Configurável via env ADMIN_EMAIL. */
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'iluminatto@gmail.com').toLowerCase();

/** Cache em memória (5 min) de tokens já validados: token → email (ou null). */
const tokenCache = new Map<string, { email: string | null; at: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Remove entradas expiradas do cache (evita crescimento sem limite). */
function sweepTokenCache(now: number): void {
  if (tokenCache.size < 500) return;
  for (const [k, v] of tokenCache) {
    if (now - v.at >= CACHE_TTL_MS) tokenCache.delete(k);
  }
}

/** Valida um access_token do Supabase e devolve o e-mail do usuário (ou null). */
export async function verifySupabaseToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  const now = Date.now();
  sweepTokenCache(now);
  const cached = tokenCache.get(accessToken);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.email;

  const sb = getSupabaseServer();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}/auth/v1/user`, {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      tokenCache.set(accessToken, { email: null, at: Date.now() });
      return null;
    }
    const data = (await res.json()) as { email?: string };
    const email = (data?.email || '').toLowerCase() || null;
    tokenCache.set(accessToken, { email, at: Date.now() });
    return email;
  } catch {
    return null;
  }
}

export interface AdminAuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Autoriza uma requisição administrativa.
 *
 * Ordem de verificação (qualquer uma satisfaz):
 *  1. `Authorization: Bearer <jwt>` válido no Supabase com e-mail admin;
 *  2. `x-admin-secret` igual a ADMIN_SECRET (quando configurado);
 *  3. `x-vercel-cron: 1` (apenas quando allowCron — invocação do cron).
 *
 * Em produção (VERCEL/NODE_ENV=production) a rota NUNCA fica aberta:
 * sem nenhuma credencial válida → 403.
 *
 * Cron da Vercel: com a env CRON_SECRET definida, o Vercel Cron Jobs envia
 * automaticamente `Authorization: Bearer <CRON_SECRET>` nas invocações — é a
 * forma SEGURA de autenticar o cron (o header x-vercel-cron é forjável e só
 * é aceito como fallback quando CRON_SECRET NÃO está configurado).
 */
export async function authorizeAdminRequest(
  headers: Record<string, string | string[] | undefined>,
  opts: { allowCron?: boolean } = {}
): Promise<AdminAuthResult> {
  const authHeader = headers['authorization'];
  const bearer =
    typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : '';

  // 0. Cron da Vercel legítimo: Bearer igual a CRON_SECRET (env da infra).
  if (opts.allowCron && bearer && process.env.CRON_SECRET) {
    if (bearer === process.env.CRON_SECRET) return { ok: true };
  }

  // 1. JWT do usuário logado (fonte principal — o admin loga no app)
  if (bearer) {
    const email = await verifySupabaseToken(bearer);
    if (email === ADMIN_EMAIL) return { ok: true };
  }

  // 2. Token compartilhado (CLI/scripts fora do navegador)
  const expected = process.env.ADMIN_SECRET;
  if (expected) {
    const secret = headers['x-admin-secret'];
    if (typeof secret === 'string' && secret === expected) return { ok: true };
  }

  // 3. x-vercel-cron NÃO é mais aceito como autenticação — é forjável.
  //    O cron DEVE usar CRON_SECRET (injetado pela Vercel automaticamente)
  //    ou o JWT do admin. Sem nenhuma credencial válida → 403.

  // Fail-closed em produção: sem credencial válida → nega.
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  if (!isProd && !expected) return { ok: true }; // dev-friendly sem secret
  return { ok: false, reason: 'Acesso administrativo negado. Faça login como administrador.' };
}
