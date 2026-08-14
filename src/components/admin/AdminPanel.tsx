/**
 * PAINEL ADMIN reconstruído — áreas divididas em abas:
 *   1) Visão Geral  (métricas + últimos cadastros/músicas)
 *   2) Músicas      (CRUD completo — cria/edita/exclui)
 *   3) Usuários     (gestão de contas: suspender/excluir)
 *   4) Conteúdo     (afiliados, parceiros, blog — painel anterior)
 *   5) Manutenção   (scraping/cron)
 *   6) Acervo       (contagem em tempo real + crescimento por dia)
 * Apenas o proprietário acessa (renderizado condicionalmente no App).
 */
import React, { useState } from 'react';
import { LayoutDashboard, Music, Users, ShoppingBag, Wrench, ShieldCheck, BarChart3 } from 'lucide-react';
import { Song, AffiliateLink, PartnerLink, BlogPost } from '../../types';
import { AdminDashboard, AdminSection } from './AdminDashboard';
import { AdminSongs } from './AdminSongs';
import { AdminUsers } from './AdminUsers';
import { AdminContentPanel } from '../AdminContentPanel';
import { AdminScraper } from '../AdminScraper';
import { AdminCatalogStats } from './AdminCatalogStats';

interface AdminPanelProps {
  songs: Song[];
  onSongsChange: React.Dispatch<React.SetStateAction<Song[]>>;
  onImportSongs: (importedSongs: Song[]) => void;
  affiliateLinks: AffiliateLink[];
  onAffiliateChange: (links: AffiliateLink[]) => void;
  partnerLinks: PartnerLink[];
  onPartnerChange: (links: PartnerLink[]) => void;
  blogPosts: BlogPost[];
  onBlogChange: (posts: BlogPost[]) => void;
  userCount: number;
  /** Usuários online agora (login nos últimos 15 min) — polling do AdminSignupWatch. */
  onlineCount: number;
}

const TABS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: 'visao-geral', label: 'Visão Geral', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'musicas', label: 'Músicas', icon: <Music className="w-4 h-4" /> },
  { id: 'usuarios', label: 'Usuários', icon: <Users className="w-4 h-4" /> },
  { id: 'conteudo', label: 'Conteúdo', icon: <ShoppingBag className="w-4 h-4" /> },
  { id: 'manutencao', label: 'Manutenção', icon: <Wrench className="w-4 h-4" /> },
  { id: 'acervo', label: 'Acervo', icon: <BarChart3 className="w-4 h-4" /> },
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  songs,
  onSongsChange,
  onImportSongs,
  affiliateLinks,
  onAffiliateChange,
  partnerLinks,
  onPartnerChange,
  blogPosts,
  onBlogChange,
  userCount,
  onlineCount,
}) => {
  const [section, setSection] = useState<AdminSection>('visao-geral');

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#0E7C7B]" />
          <h2 className="text-lg font-black text-slate-900">Painel Administrativo</h2>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-extrabold border border-rose-200 uppercase tracking-wider self-start">
          🔒 Restrito ao proprietário
        </span>
      </div>

      {/* Contadores no TOPO: usuários cadastrados + online agora (atualizados
          pelo polling de 30s do AdminSignupWatch). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-[11px] font-extrabold text-indigo-700">
          <Users className="w-3.5 h-3.5" />
          {userCount.toLocaleString('pt-BR')} usuários cadastrados
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-extrabold text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {onlineCount.toLocaleString('pt-BR')} online agora
        </span>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-2xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
              section === t.id
                ? 'bg-[#0E7C7B] text-white shadow-md shadow-[#0E7C7B]/20'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            {t.label}
            {t.id === 'usuarios' && userCount > 0 && (
              <span
                className={`ml-0.5 text-[9px] font-black rounded-full px-1.5 py-0.5 ${
                  section === t.id ? 'bg-white/20' : 'bg-[#0E7C7B]/10 text-[#0E7C7B]'
                }`}
              >
                {userCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo da seção */}
      <div>
        {section === 'visao-geral' && (
          <AdminDashboard
            songs={songs}
            userCount={userCount}
            affiliateLinks={affiliateLinks}
            partnerLinks={partnerLinks}
            blogPosts={blogPosts}
            onNavigate={setSection}
          />
        )}
        {section === 'musicas' && <AdminSongs songs={songs} onSongsChange={onSongsChange} />}
        {section === 'usuarios' && <AdminUsers />}
        {section === 'conteudo' && (
          <AdminContentPanel
            affiliateLinks={affiliateLinks}
            onAffiliateChange={onAffiliateChange}
            partnerLinks={partnerLinks}
            onPartnerChange={onPartnerChange}
            blogPosts={blogPosts}
            onBlogChange={onBlogChange}
            userCount={userCount}
          />
        )}
        {section === 'manutencao' && <AdminScraper songs={songs} onImportSongs={onImportSongs} />}
        {section === 'acervo' && (
          <AdminCatalogStats songs={songs} onSongsChange={onSongsChange} />
        )}
      </div>
    </div>
  );
};
