import React from 'react';
import { ActiveTab } from '../types';
import {
  Home,
  FolderHeart,
  BookOpen,
  ListMusic,
  Music4,
  Radio,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  songsCount: number;
  playlistsCount?: number;
  viewMode?: 'list' | 'viewer' | 'editor' | 'playlists';
  onOpenPlaylists?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  songsCount,
  playlistsCount = 0,
  viewMode = 'list',
  onOpenPlaylists,
  isOpenMobile = false,
  onCloseMobile,
  isAdmin = false,
}) => {
  const navItems = [
    {
      id: 'musicas',
      label: 'HOME',
      icon: Home,
      badge: songsCount,
      onClick: () => setActiveTab('musicas'),
      // Não destaca HOME quando a aba de PLAYLISTS está aberta
      isActive: activeTab === 'musicas' && viewMode !== 'playlists',
    },
    {
      id: 'dashboard',
      label: 'MEUS REPERTÓRIOS',
      icon: FolderHeart,
      onClick: () => setActiveTab('dashboard'),
    },
    {
      id: 'dicionario',
      label: 'DICIONÁRIO',
      icon: BookOpen,
      onClick: () => setActiveTab('dicionario'),
    },
    {
      id: 'playlists',
      label: 'PLAYLISTS',
      icon: ListMusic,
      badge: playlistsCount,
      onClick: () => onOpenPlaylists?.(),
      isActive: activeTab === 'musicas' && viewMode === 'playlists',
    },
    {
      id: 'ritmos',
      label: 'ESTUDO DE RITMOS',
      icon: Music4,
      onClick: () => setActiveTab('ritmos'),
    },
    {
      id: 'afinador',
      label: 'AFINADOR',
      icon: Radio,
      onClick: () => setActiveTab('afinador'),
    },
    ...(isAdmin
      ? [
          {
            id: 'admin' as const,
            label: 'ADMIN',
            icon: ShieldCheck,
            onClick: () => setActiveTab('admin'),
          },
        ]
      : []),
  ];

  const content = (
    <div className="flex flex-col h-full bg-[#0E7C7B] text-white">
      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-black text-teal-100/70 uppercase tracking-widest px-3 py-1">
          Menu Principal
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

      {/* Footer Info */}
      <div className="p-4 border-t border-white/10 text-[10px] text-teal-100/70 font-medium safe-bottom">
        <p className="flex items-center gap-1 font-bold text-teal-50">
          <Sparkles className="w-3 h-3 text-[#F6AE2D]" /> UkeMaster Pro v2.0
        </p>
        <p className="mt-0.5">Portal de Músicas, Cifras & Acordes</p>
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
