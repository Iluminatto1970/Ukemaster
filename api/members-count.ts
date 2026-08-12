/**
 * Endpoint PÚBLICO — /api/members-count
 * Total de usuários cadastrados, para exibir um contador de membros no site.
 * Expõe apenas o número (nenhum dado de usuário). A service role key fica
 * server-side e o total é cacheado em memória (5 min) + Cache-Control.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getServiceRoleKey } from '../src/lib/serviceRoleKey.js';

/** Mesma lógica do getSupabaseEnv (platformCron) — aceita os nomes usados
 *  na Vercel (NEXT_PUBLIC_*) e no dev local (VITE_*). */
function getSupabaseEnv() {
  const url = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const anon =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  return { url, anon };
}

let totalCache: { total: number; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (totalCache && Date.now() - totalCache.at < CACHE_TTL_MS) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.end(JSON.stringify({ total: totalCache.total }));
    return;
  }

  const { url, anon } = getSupabaseEnv();
  const serviceRole = await getServiceRoleKey();
  if (!url || !serviceRole) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ total: 0 }));
    return;
  }

  try {
    const r = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
      },
    });
    if (!r.ok) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ total: 0 }));
      return;
    }
    const totalHeader = r.headers.get('x-total-count');
    const total = totalHeader ? Number(totalHeader) : 0;
    totalCache = { total, at: Date.now() };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.end(JSON.stringify({ total }));
  } catch {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ total: 0 }));
  }
}
