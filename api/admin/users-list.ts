/**
 * Endpoint administrativo — /api/admin/users-list
 * Gestão de usuários cadastrados (via Admin API do Supabase / GoTrue):
 *   GET    /api/admin/users-list?search=&page=&per_page=  → lista com
 *          e-mail, datas, provedor (identidade) e paginação (X-Total-Count);
 *   POST   /api/admin/users-list?id=...&action=ban        → suspende 7 dias;
 *   DELETE /api/admin/users-list?id=...                   → exclui o usuário.
 *
 * SEGURANÇA: só o proprietário (authorizeAdminRequest — JWT da sessão do dono
 * ou x-admin-secret). O dono NUNCA pode se excluir/suspender (fail-safe).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorizeAdminRequest, ADMIN_EMAIL } from '../../src/lib/adminAuth.js';
import { getServiceRoleKey } from '../../src/lib/serviceRoleKey.js';

export const maxDuration = 30;

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

interface AdminUserRow {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  identities?: { provider: string }[];
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const auth = await authorizeAdminRequest(
    req.headers as Record<string, string | string[] | undefined>
  );
  if (!auth.ok) {
    sendJson(res, 403, { error: auth.reason || 'Acesso restrito.' });
    return;
  }

  const { url, anon } = getSupabaseEnv();
  const serviceRole = await getServiceRoleKey();
  if (!url || !serviceRole) {
    sendJson(res, 500, { error: 'Supabase não configurado no servidor.' });
    return;
  }

  const qs = new URL(req.url || '/', 'http://localhost').searchParams;
  const method = (req.method || 'GET').toUpperCase();
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  };

  try {
    // ── DELETE: excluir usuário ────────────────────────────────────────
    if (method === 'DELETE') {
      const id = (qs.get('id') || '').trim();
      if (!id) return sendJson(res, 400, { error: 'id obrigatório.' });
      // Fail-safe: o dono nunca pode se excluir
      const target = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers });
      if (target.ok) {
        const u = (await target.json()) as AdminUserRow;
        if (String(u.email).toLowerCase() === ADMIN_EMAIL) {
          return sendJson(res, 403, { error: 'Você não pode excluir o próprio administrador.' });
        }
      }
      const r = await fetch(`${url}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers,
      });
      return r.ok
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 502, { error: 'Falha ao excluir usuário.' });
    }

    // ── POST: suspender (ban) por 7 dias ───────────────────────────────
    if (method === 'POST') {
      const id = (qs.get('id') || '').trim();
      if (!id) return sendJson(res, 400, { error: 'id obrigatório.' });
      const target = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers });
      if (target.ok) {
        const u = (await target.json()) as AdminUserRow;
        if (String(u.email).toLowerCase() === ADMIN_EMAIL) {
          return sendJson(res, 403, { error: 'Você não pode suspender o próprio administrador.' });
        }
      }
      const r = await fetch(
        `${url}/auth/v1/admin/users/${id}/ban?ban_duration=7d`,
        { method: 'POST', headers }
      );
      return r.ok
        ? sendJson(res, 200, { ok: true, bannedUntil: (await r.json() as { banned_until?: string }).banned_until ?? null })
        : sendJson(res, 502, { error: 'Falha ao suspender usuário.' });
    }

    // ── GET: listar/buscar ─────────────────────────────────────────────
    const search = (qs.get('search') || '').trim();
    const page = Math.max(1, Number(qs.get('page') || '1') || 1);
    const perPage = Math.min(200, Math.max(1, Number(qs.get('per_page') || '50') || 50));

    const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
    if (search) params.set('search', search);

    const r = await fetch(`${url}/auth/v1/admin/users?${params}`, { headers });
    if (!r.ok) return sendJson(res, 502, { error: 'Falha ao consultar usuários.' });

    const data = (await r.json()) as { users?: AdminUserRow[] };
    const users = (data.users || []).map((u) => ({
      id: u.id,
      email: u.email || '',
      createdAt: u.created_at || '',
      lastSignInAt: u.last_sign_in_at || '',
      bannedUntil: u.banned_until || null,
      provider: u.identities?.[0]?.provider || 'email',
    }));
    const total = Number(r.headers.get('x-total-count')) || users.length;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ users, total, page, perPage }));
  } catch {
    sendJson(res, 502, { error: 'Erro ao processar usuários.' });
  }
}
