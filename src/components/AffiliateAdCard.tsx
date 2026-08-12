/**
 * Card de anúncio de AFILIADO (Mercado Livre, Shopee, Amazon...) — aparece
 * no site para todos os visitantes. Rotaciona entre os links habilitados,
 * exibindo um por vez (seed estável por sessão para não piscar a cada render).
 * Tag "Patrocinado" discreta e cliques rastreados (analytics).
 */
import React, { useMemo, useState } from 'react';
import { AffiliateLink } from '../types';
import { ExternalLink, ShoppingBag, X } from 'lucide-react';
import { trackEvent } from '../lib/analytics';

interface AffiliateAdCardProps {
  links: AffiliateLink[];
  /** Posição/contexto onde o card aparece (ex.: "song_viewer", "feed"). */
  placement?: string;
  /** Mostra botão de fechar (esconde na sessão). */
  dismissible?: boolean;
  /** Título do bloco (padrão: "Patrocinado"). */
  label?: string;
}

const SESSION_DISMISS_KEY = 'ukemaster_affiliate_dismissed_v1';

function isDismissed(placement: string): boolean {
  try {
    const raw = localStorage.getItem(SESSION_DISMISS_KEY);
    if (!raw) return false;
    const set = JSON.parse(raw) as string[];
    return set.includes(placement);
  } catch {
    return false;
  }
}

function dismissPlacement(placement: string) {
  try {
    const raw = localStorage.getItem(SESSION_DISMISS_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(placement)) {
      localStorage.setItem(SESSION_DISMISS_KEY, JSON.stringify([...set, placement]));
    }
  } catch {
    // segue sem persistir
  }
}

export const AffiliateAdCard: React.FC<AffiliateAdCardProps> = ({
  links,
  placement = 'default',
  dismissible = false,
  label = 'Patrocinado',
}) => {
  const [hidden, setHidden] = useState<boolean>(() => (dismissible ? isDismissed(placement) : false));

  // Escolhe 1 link habilitado de forma estável na sessão (hash do placement +
  // índice aleatório fixado no primeiro render) — o card não troca a cada render.
  const active = useMemo(() => links.filter((l) => l.enabled), [links]);
  const pick = useMemo(() => {
    if (active.length === 0) return null;
    // Seed estável por placement: usa a data do dia + placement para variar
    // a cada dia sem trocar a cada interação.
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    const seedStr = `${placement}|${day}`;
    for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    return active[h % active.length];
  }, [active, placement]);

  if (!pick || hidden) return null;

  const store = pick.store || 'Loja Parceira';
  const handleClick = () => {
    trackEvent('affiliate_click', {
      placement,
      store,
      title: pick.title,
      url: pick.url,
    });
  };

  return (
    <div className="relative group rounded-2xl border border-slate-200 bg-gradient-to-r from-[#0E7C7B]/[0.07] via-white to-amber-50/70 p-3.5 pl-4 shadow-2xs hover:shadow-md hover:border-[#0E7C7B]/30 transition-all">
      {dismissible && (
        <button
          onClick={() => {
            setHidden(true);
            dismissPlacement(placement);
          }}
          title="Não mostrar de novo nesta sessão"
          aria-label="Fechar anúncio"
          className="absolute top-1.5 right-1.5 p-1 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <a
        href={pick.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        className="flex items-center gap-3 min-w-0"
      >
        {/* Ícone da loja */}
        <div className="w-10 h-10 shrink-0 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-[#0E7C7B] group-hover:scale-105 transition-transform">
          <ShoppingBag className="w-5 h-5" />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#0E7C7B]">
              {label}
            </span>
            <span className="text-[9px] text-slate-300">•</span>
            <span className="text-[9px] font-bold text-slate-400 truncate">{store}</span>
          </div>
          <p className="text-xs font-extrabold text-slate-900 truncate mt-0.5 group-hover:text-[#0E7C7B] transition-colors">
            {pick.title}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-1 text-[10px] font-black text-white bg-[#F26419] hover:bg-[#D9530D] px-3 py-1.5 rounded-lg shadow-sm transition-colors">
          Ver na loja <ExternalLink className="w-3 h-3" />
        </div>
      </a>
    </div>
  );
};
