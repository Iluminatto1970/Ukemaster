import React, { useState } from 'react';
import { ActiveTab } from '../types';
import { Logo } from './Logo';
import { DonationModal } from './DonationModal';
import { Search, Bell, MessageSquare, ChevronDown, Menu, User, LogOut, Sparkles, Lock, FolderHeart } from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  songsCount: number;
  onToggleMobileSidebar?: () => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  currentUser: { name: string; email: string } | null;
  onOpenAuth: (mode?: 'signup' | 'login') => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  songsCount,
  onToggleMobileSidebar,
  searchQuery = '',
  setSearchQuery,
  currentUser,
  onOpenAuth,
  onLogout,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [donationOpen, setDonationOpen] = useState(false);

  return (
    <>
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left Mobile Menu Toggle & Logo for small screens */}
          <div className="flex items-center gap-3">
            {onToggleMobileSidebar && (
              <button
                onClick={onToggleMobileSidebar}
                className="lg:hidden p-2 text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Abrir Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {/* Logo on small screens where sidebar is hidden */}
            <div
              onClick={() => setActiveTab('musicas')}
              className="lg:hidden cursor-pointer"
            >
              <Logo size="sm" variant="light" />
            </div>
          </div>

          {/* Center Search Bar */}
          <div className="flex-1 max-w-md mx-auto">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
                placeholder="Buscar por música, autor, artista, categoria ou gênero..."
                className="w-full bg-slate-100/90 border border-slate-200 rounded-full pl-10 pr-4 py-2 text-xs font-medium text-[#1D2D44] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#F26419] focus:ring-2 focus:ring-[#F26419]/20 transition-all"
              />
            </div>
          </div>

          {/* Right Profile & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setDonationOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Apoie o Projeto via Pix"
            >
              ☕ Apoie
           </button>
            {currentUser ? (
              /* Logged In User Pill */
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer border border-slate-200"
                >
                  <div className="w-7 h-7 rounded-full bg-[#F26419] text-white flex items-center justify-center font-black text-xs shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="font-extrabold text-xs text-[#1D2D44] leading-tight truncate max-w-[100px]">
                      {currentUser.name}
                    </div>
                    <span className="text-[9px] font-bold text-emerald-600 block leading-tight">
                      Membro Ativo
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Profile Dropdown */}
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 text-xs font-bold text-[#1D2D44] animate-fade-in">
                    <button
                      onClick={() => {
                        setActiveTab('dashboard');
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-800"
                    >
                      <FolderHeart className="w-4 h-4 text-[#F26419]" />
                      <span>Meu Dashboard</span>
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button
                      onClick={() => {
                        onLogout();
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sair da Conta</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Guest Visitor - Login/Signup CTA */
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onOpenAuth('login')}
                  className="px-3 py-1.5 rounded-xl text-xs font-extrabold text-[#1D2D44] hover:bg-slate-100 transition-colors cursor-pointer hidden sm:block"
                >
                  Entrar
                </button>
                <button
                  onClick={() => onOpenAuth('signup')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-xs tracking-wider uppercase shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cadastrar Grátis</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    <DonationModal isOpen={donationOpen} onClose={() => setDonationOpen(false)} />
    </>
  );
};



