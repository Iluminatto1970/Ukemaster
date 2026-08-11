/**
 * Endpoint administrativo — /api/admin/users-stats
 * Contagem de usuários cadastrados + NOVOS cadastros desde um timestamp.
 *
 * SEGURANÇA: só o proprietário (ADMIN_EMAIL) consegue — o token da sessão
 * Supabase do usuário é validado server-side (authorizeAdminRequest). O
 * `SUPABASE_ACCESS_TOKEN` (Management API) é usado para obter a service
 * role key do projeto — ambas são envs server-side, nunca vão ao bundle.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorizeAdminRequest } from '../../src/lib/adminAuth.js';

export const maxDuration = 30;

/** Cache em memória (10 min) da service role key obtida via Management API. */
let serviceRoleCache: { key: string; at: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getServiceRoleKey(): Promise<string | null> {
  const ref = process.env.SUPABASE_PROJECT_REF || '';
  const token = process.env.SUPABASE_ACCESS_TOKEN || '';
  if (!ref || !token) return null;
  if (serviceRoleCache && Date.now() - serviceRoleCache.at < CACHE_TTL_MS) {
    return serviceRoleCache.key;
  }
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const keys = (await r.json()) as { name: string; api_key: string }[];
    const sr = keys.find((k) => k.name === 'service_role');
    if (!sr?.api_key) return null;
    serviceRoleCache = { key: sr.api_key, at: Date.now() };
    return sr.api_key;
  } catch {
    return null;
  }
}

interface AdminUser {
  id: string;
  email?: string;
  created_at?: string;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const auth = await authorizeAdminRequest(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (!auth.ok) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: auth.reason || 'Acesso restrito.' }));
    return;
  }

  // Mesma lógica do getSupabaseEnv (platformCron) — aceita os nomes usados
  // na Vercel (NEXT_PUBLIC_*) e no dev local (VITE_*).
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
  const serviceRole = await getServiceRoleKey();
  if (!url || !serviceRole) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase não configurado no servidor.' }));
    return;
  }

  try {
    const r = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
      },
    });
    if (!r.ok) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Falha ao consultar usuários.' }));
      return;
    }
    const data = (await r.json()) as { users?: AdminUser[] };
    const users = data.users || [];
    // O GoTrue retorna o total real no header X-Total-Count (o corpo traz só users)
    const totalHeader = r.headers.get('x-total-count');
    const total = totalHeader ? Number(totalHeader) : users.length;

    const after = new URL(req.url || '/', 'http://localhost').searchParams.get('after') || '';
    let recent: { id: string; email: string; createdAt: string }[] = [];
    // created_at vem em ISO (ex.: 2026-08-11T18:22:39.123Z) — comparação lexicográfica OK
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(after)) {
      recent = users
        .filter((u) => u.created_at && u.created_at > after)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 10)
        .map((u) => ({ id: u.id, email: u.email || '', createdAt: u.created_at || '' }));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ total, recent }));
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Erro ao consultar usuários.' }));
  }
}
