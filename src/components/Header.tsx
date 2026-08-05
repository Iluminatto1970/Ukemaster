import React, { useState } from 'react';
import { ActiveTab } from '../types';
import { Logo } from './Logo';
import { DonationModal } from './DonationModal';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react';
import { useAuth } from '../auth';
import { Search, Menu, Sparkles, Bell, Mail } from 'lucide-react';

interface HeaderProps {
  setActiveTab: (tab: ActiveTab) => void;
  onToggleMobileSidebar?: () => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  setActiveTab,
  onToggleMobileSidebar,
  searchQuery = '',
  setSearchQuery,
}) => {
  const [donationOpen, setDonationOpen] = useState(false);
  const { available, isLoaded, user } = useAuth();

  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Músico';

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs safe-top">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 sm:gap-4 sm:py-0 sm:h-16">
            {/* Left: Mobile Menu + Brand Logo (sempre visível, conforme template) */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 order-1">
              {onToggleMobileSidebar && (
                <button
                  onClick={onToggleMobileSidebar}
                  className="lg:hidden p-2 text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Abrir Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              <div
                onClick={() => setActiveTab('musicas')}
                className="cursor-pointer select-none"
                title="Ir para o início"
              >
                <Logo size="sm" />
              </div>
            </div>

            {/* Center Search Bar — linha própria no mobile (embaixo), inline no desktop */}
            <div className="order-3 basis-full sm:order-2 sm:basis-auto sm:flex-1 sm:max-w-xl sm:mx-auto sm:min-w-0">
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

            {/* Right: Icons & Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 order-2 sm:order-3 ml-auto sm:ml-0">
              {/* Envelope (Apoio — visível também no mobile) */}
              <button
                onClick={() => setDonationOpen(true)}
                title="Apoiar o projeto"
                className="flex p-2 rounded-xl text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Mail className="w-5 h-5" />
              </button>

              {/* Bell com badge de notificação */}
              <button
                title="Notificações"
                className="hidden sm:flex p-2 rounded-xl text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 transition-colors cursor-pointer relative"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#F26419] text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white">
                  1
                </span>
              </button>


              {/* Autenticação via Clerk (quando disponível e carregada) */}
              {available && isLoaded ? (
                <>
                  {/* Visitante: botões de autenticação do Clerk */}
                  <SignedOut>
                    <div className="flex items-center gap-1.5">
                      <SignInButton
                        mode="modal"
                        className="px-3 py-1.5 rounded-xl text-xs font-extrabold text-[#1D2D44] hover:bg-slate-100 transition-colors cursor-pointer hidden sm:block"
                      >
                        Entrar
                      </SignInButton>
                      <SignUpButton
                        mode="modal"
                        className="px-3.5 py-1.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-xs tracking-wider uppercase shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Cadastrar Grátis</span>
                        <span className="md:hidden">Cadastrar</span>
                      </SignUpButton>
                    </div>
                  </SignedOut>

                  {/* Usuário autenticado: nome + perfil do Clerk */}
                  <SignedIn>
                    <div className="flex items-center gap-2.5 pl-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors">
                      <span className="text-right hidden sm:block">
                        <span className="font-extrabold text-xs text-[#1D2D44] leading-tight block truncate max-w-[110px]">
                          {displayName}
                        </span>
                        <span className="text-[9px] font-bold text-emerald-600 block leading-tight">
                          Membro Ativo
                        </span>
                      </span>
                      <UserButton afterSignOutUrl="/" />
                    </div>
                  </SignedIn>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <DonationModal isOpen={donationOpen} onClose={() => setDonationOpen(false)} />
    </>
  );
};
