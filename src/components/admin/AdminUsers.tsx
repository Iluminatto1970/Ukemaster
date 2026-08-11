/**
 * Área ADMIN — Usuários.
 * Lista/busca usuários cadastrados (Admin API do Supabase via endpoint
 * protegido /api/admin/users-list), com suspensão de 7 dias e exclusão.
 * Só o proprietário vê esta área (renderizada dentro do AdminPanel).
 */
import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Loader2,
  AlertCircle,
  ShieldOff,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Ban,
} from 'lucide-react';

interface AdminUserRow {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string;
  bannedUntil: string | null;
  provider: string;
}

const PER_PAGE = 50;

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '—';
  }
};

const fmtTime = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

export const AdminUsers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id em ação
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`/api/admin/users-list?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => {
        if (cancelled) return;
        setUsers(d.users || []);
        setTotal(typeof d.total === 'number' ? d.total : 0);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os usuários (endpoint disponível em produção).');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page]);

  const runAction = async (id: string, action: 'ban' | 'delete') => {
    setBusy(id);
    setError(null);
    try {
      const params = new URLSearchParams({ id });
      const res = await fetch(`/api/admin/users-list?${params}`, {
        method: action === 'ban' ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error || 'Falha na operação.');
      }
      // Atualiza a lista localmente
      if (action === 'delete') {
        setUsers((prev) => prev.filter((u) => u.id !== id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id
              ? { ...u, bannedUntil: new Date(Date.now() + 7 * 86400_000).toISOString() }
              : u
          )
        );
      }
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na operação.');
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#0E7C7B]/10 border border-[#0E7C7B]/25 text-[#0E7C7B]">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Usuários Cadastrados</h1>
            <p className="text-xs text-slate-500 font-medium">
              Gestão de contas via Admin API do Supabase — suspender (7 dias) ou excluir.
            </p>
          </div>
        </div>
        <span className="text-xs font-black text-[#0E7C7B] bg-[#0E7C7B]/10 rounded-full px-3 py-1.5 self-start">
          {total} usuário{total === 1 ? '' : 's'}
        </span>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por e-mail..."
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium"
        />
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-xs font-bold">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários...
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs font-bold">
            {debouncedSearch ? 'Nenhum usuário encontrado para essa busca.' : 'Nenhum usuário cadastrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-black">Usuário</th>
                  <th className="px-3 py-3 font-black">Cadastrado</th>
                  <th className="px-3 py-3 font-black">Último login</th>
                  <th className="px-3 py-3 font-black">Status</th>
                  <th className="px-3 py-3 font-black text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const banned = !!u.bannedUntil && new Date(u.bannedUntil).getTime() > Date.now();
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 shrink-0 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] font-black flex items-center justify-center text-sm">
                            {(u.email || '?').charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-900 truncate max-w-[220px]">{u.email || '(sem e-mail)'}</p>
                            <span
                              className={`inline-block mt-0.5 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                u.provider === 'google'
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'bg-amber-50 text-amber-600'
                              }`}
                            >
                              {u.provider === 'google' ? 'Google' : 'E-mail'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 font-medium whitespace-nowrap" title={u.createdAt}>
                        {fmtDate(u.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-slate-600 font-medium whitespace-nowrap" title={u.lastSignInAt}>
                        {fmtTime(u.lastSignInAt)}
                      </td>
                      <td className="px-3 py-3">
                        {banned ? (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                            Suspenso
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {confirmId === u.id ? (
                            <>
                              <button
                                onClick={() => runAction(u.id, 'delete')}
                                disabled={busy === u.id}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {busy === u.id ? 'Excluindo...' : 'Confirmar exclusão'}
                              </button>
                              <button
                                onClick={() => setConfirmId(null)}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => runAction(u.id, 'ban')}
                                disabled={busy === u.id || banned}
                                title={banned ? 'Já suspenso' : 'Suspender por 7 dias'}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmId(u.id)}
                                disabled={busy === u.id}
                                title="Excluir usuário"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#0E7C7B] transition-colors cursor-pointer disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#0E7C7B] transition-colors cursor-pointer disabled:opacity-40"
          >
            Próxima <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
        <ShieldOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Suspensão bloqueia o login por 7 dias (o usuário mantém a conta). Excluir remove a conta
        definitivamente — o administrador principal nunca pode ser suspenso nem excluído.
      </p>
    </div>
  );
};
