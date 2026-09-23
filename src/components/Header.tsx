/**
 * Cabeçalho fixo: busca global, logo, botões de apoio/doação, notificações e autenticação (Supabase direto).
 */
import React, { useState, useRef, useEffect } from 'react';
import { ActiveTab } from '../types';
import { Logo } from './Logo';
import { DonationModal } from './DonationModal';
import { useAuth } from '../auth';
import { useT, LANGS } from '../lib/i18n';
import { Search, Menu, Sparkles, Bell, Mail, LogOut, Globe, Check } from 'lucide-react';

interface HeaderProps {
  setActiveTab: (tab: ActiveTab) => void;
  onToggleMobileSidebar?: () => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  /** Estado do modal de doação controlado pelo App (disparo automático). */
  donationOpen?: boolean;
  onOpenDonation?: () => void;
  onCloseDonation?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  setActiveTab,
  onToggleMobileSidebar,
  searchQuery = '',
  setSearchQuery,
  donationOpen = false,
  onOpenDonation,
  onCloseDonation,
}) => {
  const [localDonationOpen, setLocalDonationOpen] = useState(false);
  const { available, isLoaded, isSignedIn, user, openSignIn, openSignUp, signOut } = useAuth();

  // Suporte a ambos: estado interno (fallback) e controlado pelo App
  const isDonationOpen = onOpenDonation ? donationOpen : localDonationOpen;
  const openDonation = () => (onOpenDonation ? onOpenDonation() : setLocalDonationOpen(true));
  const closeDonation = () => (onCloseDonation ? onCloseDonation() : setLocalDonationOpen(false));

  const displayName = user?.name || 'Músico';
  const { t, lang, setLang } = useT();

  // Seletor de idioma — dropdown ao clicar no globo (fecha ao clicar fora)
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <>
      {/* O sticky top-0 + safe-top agora ficam no wrapper do App (banner laranja + header juntos, sempre visíveis) */}
      <header className="bg-white border-b border-slate-200 z-20 shadow-2xs">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 sm:gap-4 sm:py-0 sm:h-16">
            {/* Left: Mobile Menu + Brand Logo (sempre visível, conforme template) */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 order-1">
              {onToggleMobileSidebar && (
                <button
                  onClick={onToggleMobileSidebar}
                  className="lg:hidden p-2 text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title={t('header.openMenu')}
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              <div
                onClick={() => setActiveTab('musicas')}
                className="cursor-pointer select-none"
                title={t('header.goHome')}
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
                  placeholder={t('header.searchPlaceholder')}
                  className="w-full bg-slate-100/90 border border-slate-200 rounded-full pl-10 pr-4 py-2 text-xs font-medium text-[#1D2D44] placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#F26419] focus:ring-2 focus:ring-[#F26419]/20 transition-all"
                />
              </div>
            </div>

            {/* Right: Icons & Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 order-2 sm:order-3 ml-auto sm:ml-0">
              {/* Seletor de IDIOMA — traduz apenas a interface do portal
                  (as cifras/músicas permanecem no idioma original) */}
              <div className="relative" ref={langRef}>
                <button
                  onClick={() => setLangOpen((v) => !v)}
                  title={t('header.language')}
                  aria-expanded={langOpen}
                  aria-haspopup="menu"
                  className={`flex items-center gap-1.5 p-2 rounded-xl transition-colors cursor-pointer ${
                    langOpen
                      ? 'bg-[#0E7C7B]/10 text-[#0E7C7B]'
                      : 'text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100'
                  }`}
                >
                  <Globe className="w-5 h-5" />
                  <span className="hidden sm:inline text-xs font-black uppercase tracking-wide">
                    {lang.toUpperCase()}
                  </span>
                </button>

                {langOpen && (
                  <div
                    role="menu"
                    aria-label={t('header.language')}
                    className="absolute right-0 top-full mt-2 z-50 w-56 max-h-[75vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 animate-fade-in"
                  >
                    {LANGS.map((l) => (
                      <button
                        key={l.id}
                        role="menuitem"
                        onClick={() => {
                          setLang(l.id);
                          setLangOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer ${
                          lang === l.id
                            ? 'bg-amber-50 text-[#F26419]'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-sm">{l.flag}</span>
                        <span className="flex-1">{l.label}</span>
                        {lang === l.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Envelope (Apoio — visível também no mobile) */}
              <button
                onClick={openDonation}
                title={t('header.support')}
                className="flex p-2 rounded-xl text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Mail className="w-5 h-5" />
              </button>

              {/* Bell com badge de notificação */}
              <button
                title={t('header.notifications')}
                className="hidden sm:flex p-2 rounded-xl text-[#1D2D44] hover:text-[#0E7C7B] hover:bg-slate-100 transition-colors cursor-pointer relative"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#F26419] text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white">
                  1
                </span>
              </button>


              {/* Autenticação direta no Supabase (quando configurado) */}
              {available && isLoaded ? (
                isSignedIn && user ? (
                  /* Usuário autenticado: nome + avatar com iniciais + sair */
                  <div className="flex items-center gap-2 pl-2 py-1 pr-1.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-[#0E7C7B] text-white flex items-center justify-center text-[11px] font-black shrink-0">
                      {(user.name || 'M').slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-right hidden sm:block">
                      <span className="font-extrabold text-xs text-[#1D2D44] leading-tight block truncate max-w-[110px]">
                        {displayName}
                      </span>
                      <span className="text-[9px] font-bold text-emerald-600 block leading-tight">
                        {t('header.activeMember')}
                      </span>
                    </span>
                    <button
                      onClick={() => signOut()}
                      title={t('header.signOut')}
                      className="p-1.5 rounded-full text-slate-500 hover:text-[#F26419] hover:bg-white transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Visitante: botões Entrar / Cadastrar Grátis */
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openSignIn()}
                      className="px-3 py-1.5 rounded-xl text-xs font-extrabold text-[#1D2D44] hover:bg-slate-100 transition-colors cursor-pointer hidden sm:block"
                    >
                      {t('header.signIn')}
                    </button>
                    <button
                      onClick={() => openSignUp()}
                      className="px-3.5 py-1.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-xs tracking-wider uppercase shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{t('header.signUp')}</span>
                        <span className="md:hidden">{t('header.signUpShort')}</span>
                      </span>
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <DonationModal isOpen={isDonationOpen} onClose={closeDonation} />
    </>
  );
};
