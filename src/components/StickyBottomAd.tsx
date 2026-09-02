/**
 * Anúncio fixo na base (mobile): aparece após rolar, com botão fechar — âncora de alto eCPM.
 */
import React, { useEffect, useState } from 'react';
import { AdSenseSlot } from './AdSenseSlot';
import { ADSENSE_SLOTS } from '../config';
import { trackEvent } from '../lib/analytics';
import { getAbVariant } from '../lib/abTest';
import { X } from 'lucide-react';

/**
 * Banner fixo na base da tela (mobile-first) — o formato "âncora" do
 * AdSense tem o maior eCPM em sites de música. Mostra apenas depois de
 * rolar um pouco (para não abrir logo na entrada) e pode ser fechado.
 */
interface StickyBottomAdProps {
  /** Exibe o anúncio só em páginas com conteúdo editorial (AdSense policy). */
  show?: boolean;
}

export const StickyBottomAd: React.FC<StickyBottomAdProps> = ({ show = true }) => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('sticky_ad_dismissed');
    }
    return false;
  });

  useEffect(() => {
    // Só exibe em telas pequenas (mobile) e após scroll de ~400px
    const onScroll = () => {
      if (window.innerWidth < 768 && window.scrollY > 400) {
        setVisible(true);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A/B test: sticky_ad — control = mostrar, hide = esconder
  const abVariant = getAbVariant('sticky_ad');

  if (!show || !visible || dismissed || abVariant === 'hide') return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden flex items-end justify-center bg-black/30 pointer-events-none" aria-label="Publicidade">
      <div
        className="relative w-full max-w-md pointer-events-auto bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-2 pt-1.5 pb-1 animate-fade-in min-h-[60px]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}
      >
        <button
          onClick={() => { trackEvent('ad_sticky_dismiss'); localStorage.setItem('sticky_ad_dismissed', '1'); setDismissed(true); }}
          aria-label="Fechar anúncio"
          className="absolute -top-3 right-2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <AdSenseSlot
          format="fluid"
          layoutKey="-hz+e-15-33+a0"
          label="Publicidade"
          className="min-h-[50px]"
          adSlot={ADSENSE_SLOTS.stickyBottom}
          abTestId="sticky_ad"
        />
      </div>
    </div>
  );
};

