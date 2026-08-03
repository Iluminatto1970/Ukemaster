import React from 'react';
import { ActiveTab } from '../types';
import { Logo } from './Logo';
import {
  LayoutDashboard,
  FolderHeart,
  BookOpen,
  ListMusic,
  Compass,
  Zap,
  Radio,
  Plus,
  Sparkles,
  Music,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  songsCount: number;
  onNewSong?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  songsCount,
  onNewSong,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const navItems = [
    {
      id: 'musicas',
      label: 'MÚSICAS PÚBLICAS',
      icon: Music,
      badge: songsCount,
      onClick: () => setActiveTab('musicas'),
    },
    {
      id: 'dashboard',
      label: 'MEU DASHBOARD',
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
      id: 'ritmos',
      label: 'EXPLORAR RITMOS',
      icon: Compass,
      onClick: () => setActiveTab('ritmos'),
    },
    {
      id: 'afinador',
      label: 'AFINADOR MIC',
      icon: Radio,
      onClick: () => setActiveTab('afinador'),
    },
  ];

  const content = (
    <div className="flex flex-col h-full bg-[#0E7C7B] text-white">
      {/* Top Brand Logo inside Sidebar */}
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div
          onClick={() => setActiveTab('musicas')}
          className="cursor-pointer group"
        >
          <Logo size="md" variant="dark" />
        </div>
      </div>

      {/* Quick Add Song Button */}
      {onNewSong && (
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => {
              onNewSong();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-extrabold text-xs tracking-wider uppercase shadow-md shadow-black/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Nova Cifra</span>
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-black text-teal-100/70 uppercase tracking-widest px-3 py-1">
          Navegação Principal
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id ||
            (item.id === 'musicas_list' && activeTab === 'musicas');

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.onClick) item.onClick();
                else setActiveTab(item.id as ActiveTab);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#1D2D44] text-white shadow-sm border-l-4 border-[#F26419] pl-2.5'
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

        {/* Navigation List End */}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/10 text-[10px] text-teal-100/70 font-medium">
        <p className="flex items-center gap-1 font-bold text-teal-50">
          <Sparkles className="w-3 h-3 text-[#F6AE2D]" /> Ukemaster v2.0
        </p>
        <p className="mt-0.5">Portal de Músicas, Cifras & Acordes</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed Left) */}
      <aside className="hidden lg:block w-64 shrink-0 min-h-screen sticky top-0 shadow-xl z-30">
        {content}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
