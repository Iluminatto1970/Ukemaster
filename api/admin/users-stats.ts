/**
 * Endpoint administrativo — /api/admin/users-stats
 * Contagem de usuários cadastrados, usuários ONLINE (login nos últimos 15
 * min) e NOVOS cadastros desde um timestamp.
 *
 * SEGURANÇA: só o proprietário (ADMIN_EMAIL) consegue — o token da sessão
 * Supabase do usuário é validado server-side (authorizeAdminRequest). O
 * `SUPABASE_ACCESS_TOKEN` (Management API) é usado para obter a service
 * role key do projeto — ambas são envs server-side, nunca vão ao bundle.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorizeAdminRequest } from '../../src/lib/adminAuth.js';
import { getServiceRoleKey } from '../../src/lib/serviceRoleKey.js';

export const maxDuration = 30;

/**
 * Janela considerada "online": quem fez login (ou renovou a sessão) nos
 * últimos 15 minutos. É uma aproximação — o GoTrue não tem presença em
 * tempo real, só o último sign-in/refresh de sessão.
 */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

interface AdminUser {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const auth = await authorizeAdminRequest(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (!auth.ok) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Falha no processamento' }));
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
    res.end(JSON.stringify({ error: 'Falha no processamento' }));
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
      res.end(JSON.stringify({ error: 'Falha no processamento' }));
      return;
    }
    const data = (await r.json()) as { users?: AdminUser[] };
    const users = data.users || [];
    // O GoTrue retorna o total real no header X-Total-Count (o corpo traz só users)
    const totalHeader = r.headers.get('x-total-count');
    const total = totalHeader ? Number(totalHeader) : users.length;

    // Online = login (last_sign_in_at) dentro da janela.
    const now = Date.now();
    const online = users.filter((u) => {
      const t = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      return Number.isFinite(t) && t > 0 && now - t <= ONLINE_WINDOW_MS;
    }).length;

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
    res.end(JSON.stringify({ total, online, recent }));
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Falha no processamento' }));
  }
}
