/**
 * Área ADMIN — Visão Geral.
 * Métricas do site: músicas, membros cadastrados, afiliados/parceiros
 * ativos, artigos publicados + últimas músicas e últimos cadastros.
 * Renderizada dentro do AdminPanel (só o proprietário vê).
 */
import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Music,
  Users,
  ShoppingBag,
  GraduationCap,
  Newspaper,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Song, AffiliateLink, PartnerLink, BlogPost } from '../../types';
import { getSessionAccessToken } from '../../lib/supabase';

export type AdminSection =
  | 'visao-geral'
  | 'musicas'
  | 'usuarios'
  | 'conteudo'
  | 'manutencao'
  | 'acervo';

interface AdminDashboardProps {
  songs: Song[];
  userCount: number;
  affiliateLinks: AffiliateLink[];
  partnerLinks: PartnerLink[];
  blogPosts: BlogPost[];
  onNavigate: (section: AdminSection) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  songs,
  userCount,
  affiliateLinks,
  partnerLinks,
  blogPosts,
  onNavigate,
}) => {
  const [recentUsers, setRecentUsers] = useState<{ email: string; createdAt: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Últimos cadastros (endpoint protegido — falha silenciosa fora de produção)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/users-list?page=1&per_page=5', {
      headers: { Authorization: `Bearer ${getSessionAccessToken() || ''}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => {
        if (!cancelled && Array.isArray(d.users)) {
          setRecentUsers(
            d.users.map((u: { email?: string; createdAt?: string }) => ({
              email: u.email || '(sem e-mail)',
              createdAt: u.createdAt || '',
            }))
          );
        }
      })
      .catch(() => {
        /* fora de produção — deixa vazio */
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const affiliatesActive = affiliateLinks.filter((l) => l.enabled).length;
  const partnersActive = partnerLinks.filter((p) => p.enabled).length;
  const postsPublished = blogPosts.filter((p) => p.enabled).length;

  const latestSongs = [...songs]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5);

  const cards: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    section: AdminSection;
  }[] = [
    {
      label: 'Músicas no acervo',
      value: songs.length,
      icon: <Music className="w-5 h-5" />,
      color: 'bg-[#0E7C7B]/10 text-[#0E7C7B] border-[#0E7C7B]/25',
      section: 'musicas',
    },
    {
      label: 'Membros cadastrados',
      value: userCount,
      icon: <Users className="w-5 h-5" />,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      section: 'usuarios',
    },
    {
      label: 'Afiliados ativos',
      value: affiliatesActive,
      icon: <ShoppingBag className="w-5 h-5" />,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      section: 'conteudo',
    },
    {
      label: 'Parceiros ativos',
      value: partnersActive,
      icon: <GraduationCap className="w-5 h-5" />,
      color: 'bg-orange-50 text-[#F26419] border-orange-200',
      section: 'conteudo',
    },
    {
      label: 'Artigos publicados',
      value: postsPublished,
      icon: <Newspaper className="w-5 h-5" />,
      color: 'bg-sky-50 text-sky-600 border-sky-200',
      section: 'conteudo',
    },
  ];

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-[#0E7C7B]/10 border border-[#0E7C7B]/25 text-[#0E7C7B]">
          <LayoutDashboard className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Visão Geral</h1>
          <p className="text-xs text-slate-500 font-medium">
            Resumo do UkeMaster Pro — clique em um card para ir direto à área.
          </p>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => onNavigate(c.section)}
            className={`text-left rounded-2xl border p-4 ${c.color} hover:shadow-md transition-shadow cursor-pointer`}
          >
            <div className="flex items-center justify-between">
              {c.icon}
              <ArrowRight className="w-3.5 h-3.5 opacity-50" />
            </div>
            <p className="mt-3 text-2xl font-black leading-none">{c.value.toLocaleString('pt-BR')}</p>
            <p className="mt-1.5 text-[11px] font-bold text-slate-600">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Últimas músicas */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
              🎵 Últimas músicas
            </h2>
            <button
              onClick={() => onNavigate('musicas')}
              className="text-[10px] font-black text-[#0E7C7B] hover:underline cursor-pointer"
            >
              Gerenciar →
            </button>
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            {latestSongs.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400 font-bold">Nenhuma música ainda.</p>
            )}
            {latestSongs.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">{s.title}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {s.artist} · {s.category || 'Sem categoria'}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 font-medium shrink-0">
                  {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Últimos cadastros */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
              👥 Últimos cadastros
            </h2>
            <button
              onClick={() => onNavigate('usuarios')}
              className="text-[10px] font-black text-[#0E7C7B] hover:underline cursor-pointer"
            >
              Gerenciar →
            </button>
          </div>
          <div className="mt-2 divide-y divide-slate-100">
            {usersLoading ? (
              <div className="flex items-center gap-2 py-6 justify-center text-slate-400 text-xs font-bold">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : recentUsers.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400 font-bold">
                Nenhum cadastro recente (disponível em produção).
              </p>
            ) : (
              recentUsers.map((u) => (
                <div key={u.email + u.createdAt} className="flex items-center gap-3 py-2.5">
                  <span className="w-8 h-8 shrink-0 rounded-full bg-indigo-50 text-indigo-600 font-black flex items-center justify-center text-sm">
                    {u.email.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 truncate">{u.email}</p>
                    <p className="text-[10px] text-slate-400">{u.createdAt ? new Date(u.createdAt).toLocaleString('pt-BR') : ''}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
