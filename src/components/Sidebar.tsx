/**
 * Menu lateral de navegação (desktop e mobile): HOME, Repertórios, Dicionário, Playlists, Estudo de Ritmos, Afinador e ADMIN (só proprietário).
 */
import React, { useMemo } from 'react';
import { ActiveTab, Song } from '../types';
import { Logo } from './Logo';
import { useT } from '../lib/i18n';
import {
  Home,
  FolderHeart,
  BookOpen,
  ListMusic,
  Music4,
  Radio,
  ShieldCheck,
  Timer,
  Clapperboard,
  Newspaper,
  Star,
  Lightbulb,
  MessageCircle,
  Play,
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
  /** Cifra em destaque do dia (preenchida pelo App — abre ao clicar). */
  featuredSong?: Song | null;
  onSelectFeaturedSong?: (song: Song) => void;
}

/** Dicas rotativas de ukulele — a do dia é escolhida deterministicamente.
 * As dicas são traduzidas via i18n (chaves sidebar.tip1..tip12). */
const UKULELE_TIPS = [
  'sidebar.tip1',
  'sidebar.tip2',
  'sidebar.tip3',
  'sidebar.tip4',
  'sidebar.tip5',
  'sidebar.tip6',
  'sidebar.tip7',
  'sidebar.tip8',
  'sidebar.tip9',
  'sidebar.tip10',
  'sidebar.tip11',
  'sidebar.tip12',
];

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
  featuredSong = null,
  onSelectFeaturedSong,
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
            onClick: () => setActiveTab('admin'),
          },
        ]
      : []),
  ];

  // Dica do dia: estável por data (mesma dica para todos, muda à meia-noite)
  const tipOfTheDay = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return t(UKULELE_TIPS[h % UKULELE_TIPS.length]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = (
    <div className="flex flex-col h-full bg-[#0E7C7B] text-white">
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
                  {catalogLoading && item.id === 'musicas' ? '···' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Widgets: EM DESTAQUE + DICA DO DIA + WhatsApp — preenchem o vão
          entre o menu e o rodapé (antes ficava um espaço morto) */}
      {featuredSong && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-black text-teal-100/70 uppercase tracking-widest px-3 py-1">
            <Star className="w-3 h-3 text-[#F6AE2D]" /> {t('sidebar.featured')}
          </div>
          <button
            onClick={() => {
              onSelectFeaturedSong?.(featuredSong);
              if (onCloseMobile) onCloseMobile();
            }}
            title={`Abrir cifra: ${featuredSong.title} — ${featuredSong.artist}`}
            className="w-full text-left rounded-2xl bg-gradient-to-br from-[#F26419] via-[#F26419] to-[#F6AE2D] p-3.5 shadow-lg shadow-orange-900/30 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer group"
          >
            <p className="text-[9px] font-black text-white/85 uppercase tracking-widest">
              {t('sidebar.songOfDay')}
            </p>
            <p className="text-sm font-black text-white leading-tight mt-1 line-clamp-2">
              {featuredSong.title}
            </p>
            <p className="text-[11px] font-semibold text-white/85 mt-0.5 truncate">
              {featuredSong.artist}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/25 text-white font-bold">
                {t('sidebar.key')} {featuredSong.key || 'C'}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-black text-white group-hover:gap-1.5 transition-all">
                <Play className="w-3 h-3 fill-current" /> {t('sidebar.play')}
              </span>
            </div>
          </button>
        </div>
      )}

      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-teal-100/70 uppercase tracking-widest px-3 py-1">
          <Lightbulb className="w-3 h-3 text-[#F6AE2D]" /> {t('sidebar.tipOfDay')}
        </div>
        <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
          <p className="text-[11px] leading-snug text-teal-50">{tipOfTheDay}</p>
        </div>
      </div>

      {/* Convite à comunidade no WhatsApp — logo como emblema + símbolo do WhatsApp */}
      <div className="px-3 pb-2 shrink-0">
        <a
          href="https://chat.whatsapp.com/BrEFW78LBkLKhQUQKaWcuj"
          target="_blank"
          rel="noopener noreferrer"
          className="group block w-full rounded-2xl bg-gradient-to-br from-[#25D366]/95 to-[#128C7E] p-3.5 shadow-lg shadow-emerald-900/25 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative shrink-0">
              <img
                src="/logo.png"
                alt="UkeMaster Pro"
                className="h-9 w-9 object-contain rounded-xl bg-white/95 p-0.5 shrink-0"
                draggable={false}
              />
              <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white shadow-sm">
                <MessageCircle className="h-3 w-3 text-[#25D366] fill-[#25D366]/20" />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-white uppercase tracking-wide leading-tight">
                {t('sidebar.waCommunity')}
              </span>
              <span className="block text-[10px] font-medium text-white/85 leading-snug mt-0.5 line-clamp-2">
                {t('sidebar.waCommunityDesc')}
              </span>
            </span>
          </div>
        </a>
      </div>

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
      {/* Desktop Sidebar (Fixed Left, abaixo do header) */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] self-start shadow-xl z-30">
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
