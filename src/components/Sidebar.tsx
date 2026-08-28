/**
 * Menu lateral de navegação (desktop e mobile): HOME, Repertórios, Dicionário,
 * Playlists, Estudo de Ritmos, Afinador e ADMIN (só proprietário).
 *
 * Os widgets (Cifra do Dia, Dica do Dia, Comunidade WhatsApp) foram movidos
 * para o painel do lado direito (SideWidgets) — aqui fica só o menu.
 */
import React from 'react';
import { ActiveTab } from '../types';
import { Logo } from './Logo';
import { useT } from '../lib/i18n';
import {
  Home,
  FolderHeart,
  BookOpen,
  GraduationCap,
  ListMusic,
  Music4,
  Radio,
  ShieldCheck,
  Timer,
  Clapperboard,
  Newspaper,
  MessageCircle,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  songsCount: number;
  /** O acervo da nuvem ainda está carregando (mostra "···" no contador). */
  catalogLoading?: boolean;
  playlistsCount?: number;
  viewMode?: 'list' | 'viewer' | 'editor' | 'playlists';
  onOpenPlaylists?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isAdmin?: boolean;
  /** Total de usuários cadastrados (polling do AdminSignupWatch) — badge no
   * item ADMIN. Só o proprietário vê (o item já é condicional a isAdmin). */
  adminUserCount?: number;
  /** Altura do topo fixo (banner laranja + header) em px — a sidebar cola
   * logo abaixo dele, para não sobrepor o header ao rolar. */
  topOffset?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  songsCount,
  catalogLoading = false,
  playlistsCount = 0,
  viewMode = 'list',
  onOpenPlaylists,
  isOpenMobile = false,
  onCloseMobile,
  isAdmin = false,
  adminUserCount = 0,
  topOffset = 64,
}) => {
  const { t } = useT();
  const navItems = [
    {
      id: 'musicas',
      label: t('sidebar.home'),
      icon: Home,
      badge: songsCount,
      onClick: () => setActiveTab('musicas'),
      // Não destaca HOME quando a aba de PLAYLISTS está aberta
      isActive: activeTab === 'musicas' && viewMode !== 'playlists',
    },
    {
      id: 'dashboard',
      label: t('sidebar.myRepertoires'),
      icon: FolderHeart,
      onClick: () => setActiveTab('dashboard'),
    },
    {
      id: 'dicionario',
      label: t('sidebar.dictionary'),
      icon: BookOpen,
      onClick: () => setActiveTab('dicionario'),
    },
    {
      id: 'trilhas',
      label: t('sidebar.trails'),
      icon: GraduationCap,
      onClick: () => setActiveTab('trilhas'),
    },
    {
      id: 'playlists',
      label: t('sidebar.playlists'),
      icon: ListMusic,
      badge: playlistsCount,
      onClick: () => onOpenPlaylists?.(),
      isActive: activeTab === 'musicas' && viewMode === 'playlists',
    },
    {
      id: 'ritmos',
      label: t('sidebar.rhythms'),
      icon: Music4,
      onClick: () => setActiveTab('ritmos'),
    },
    {
      id: 'afinador',
      label: t('sidebar.tuner'),
      icon: Radio,
      onClick: () => setActiveTab('afinador'),
    },
    {
      id: 'metronomo',
      label: t('sidebar.metronome'),
      icon: Timer,
      onClick: () => setActiveTab('metronomo'),
    },
    {
      id: 'videos',
      label: t('sidebar.videos'),
      icon: Clapperboard,
      onClick: () => setActiveTab('videos'),
    },
    {
      id: 'blog',
      label: t('sidebar.blog'),
      icon: Newspaper,
      onClick: () => setActiveTab('blog'),
    },
    ...(isAdmin
      ? [
          {
            id: 'admin' as const,
            label: t('sidebar.admin'),
            icon: ShieldCheck,
            // badge com o total de usuários cadastrados (só o dono vê)
            badge: adminUserCount > 0 ? adminUserCount : undefined,
            onClick: () => setActiveTab('admin'),
          },
        ]
      : []),
  ];

  // pb-12: a sidebar vai até o fundo da tela e o rodapé (barra laranja) é
  // FIXO — sem este espaço, o branding do fim da sidebar (logo/tagline)
  // ficava escondido atrás do rodapé.
  const content = (
    <div className="flex flex-col h-full bg-[#0E7C7B] text-white pb-12">
      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-black text-teal-100/70 uppercase tracking-widest px-3 py-1">
          {t('sidebar.mainMenu')}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.isActive !== undefined ? item.isActive : activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.onClick) item.onClick();
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                isActive
                  ? 'bg-teal-500/30 text-white border-l-4 border-[#F6AE2D] pl-2.5 shadow-sm'
                  : 'text-teal-50 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#F6AE2D]' : 'text-teal-200/90'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[#F26419] text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Convite ao WhatsApp — botão de contato direto, sempre visível */}
      <div className="px-6 pb-3 shrink-0">
        <a
          href="https://wa.me/5581986607510?text=Ol%C3%A1!%20Vim%20pelo%20UkeMaster%20Pro%20%E2%9C%A8"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366]/90 hover:bg-[#25D366] text-white text-[11px] font-black uppercase tracking-wider py-2.5 transition-colors"
        >
          <MessageCircle className="w-4 h-4" /> {t('sidebar.talkToUs')}
        </a>
      </div>

      {/* Footer Info — logo oficial sempre visível (de onde vem o conteúdo) */}
      <div className="p-4 border-t border-white/10 safe-bottom">
        <Logo size="sm" variant="light" />
        <p className="mt-2 text-[10px] text-teal-100/70 font-medium">
          {t('sidebar.footer')}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed Left, abaixo do topo fixo — banner + header).
          É FIXED (não sticky) para nunca "descolar" no fim da página e cobrir
          o header: o main recebe lg:pl-[304px] no App para compensar. */}
      <aside
        className="hidden lg:block fixed w-64 shrink-0 shadow-xl z-30"
        style={{
          top: topOffset,
          height: `calc(100vh - ${topOffset}px)`,
          left: 'max(24px, calc((100vw - 1600px) / 2 + 24px))',
        }}
      >
        {content}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm animate-fade-in"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10 animate-slide-in-left">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
