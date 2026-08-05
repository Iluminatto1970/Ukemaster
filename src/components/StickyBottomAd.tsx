/**
 * Anúncio fixo na base (mobile): aparece após rolar, com botão fechar — âncora de alto eCPM.
 */
import React, { useEffect, useState } from 'react';
import { AdSenseSlot } from './AdSenseSlot';
import { X } from 'lucide-react';

/**
 * Banner fixo na base da tela (mobile-first) — o formato "âncora" do
 * AdSense tem o maior eCPM em sites de música. Mostra apenas depois de
 * rolar um pouco (para não abrir logo na entrada) e pode ser fechado.
 */
export const StickyBottomAd: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-2 pt-1.5 pb-1 animate-fade-in">
      <button
        onClick={() => setDismissed(true)}
        aria-label="Fechar anúncio"
        className="absolute -top-3 right-2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <AdSenseSlot
        format="horizontal"
        label=""
        className="min-h-[50px]"
      />
    </div>
  );
};
