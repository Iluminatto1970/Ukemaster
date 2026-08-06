/**
 * Anúncio intersticial antes de abrir cifras (a cada 2ª): espera mínima para monetizar a impressão e botão Continuar liberado após o tempo.
 */
import React, { useState, useEffect } from 'react';
import { AdSenseSlot } from './AdSenseSlot';
import { useT } from '../lib/i18n';
import { Clock, Music, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';

interface AdInterstitialModalProps {
  isOpen: boolean;
  onComplete: () => void;
  title?: string;
  artist?: string;
}

/**
 * Tempo mínimo de permanência (segundos) para que a impressão do anúncio
 * seja contabilizada e o usuário tenha chance real de clicar. Aumenta a
 * receita por sessão (eCPM/cliques) sem tornar o portal pago.
 */
const MIN_WATCH_SECONDS = 10;

export const AdInterstitialModal: React.FC<AdInterstitialModalProps> = ({
  isOpen,
  onComplete,
  title,
  artist,
}) => {
  const { t } = useT();
  const [countdown, setCountdown] = useState(MIN_WATCH_SECONDS);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(MIN_WATCH_SECONDS);
      setCanSkip(false);
      return;
    }

    setCountdown(MIN_WATCH_SECONDS);
    setCanSkip(false);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden relative">
        {/* Header with Portal Brand */}
        <div className="bg-gradient-to-r from-[#1D2D44] via-[#0E7C7B] to-[#1D2D44] p-4 sm:p-5 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Logomarca oficial do portal — variante clara p/ fundo gradiente escuro */}
            <Logo size="sm" variant="light" />
            <span className="text-[10px] sm:text-xs text-teal-100 font-semibold hidden sm:inline">
              {t('ad.sponsor')}
            </span>
          </div>

          {canSkip ? (
            <button
              onClick={onComplete}
              className="px-3 py-1 rounded-full bg-[#F26419] hover:bg-[#D9530D] text-white font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <span>{t('ad.continue')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-teal-200 font-bold bg-white/10 px-2.5 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>{t('ad.unlockIn').replace('{s}', String(countdown))}</span>
            </div>
          )}
        </div>

        {/* Content Preview Notice */}
        {title && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium truncate">
              {t('ad.loading')} <strong className="text-[#1D2D44]">{title}</strong> {artist ? `— ${artist}` : ''}
            </span>
            <Music className="w-4 h-4 text-[#F26419] shrink-0 ml-2" />
          </div>
        )}

        {/* Dedicated Interstitial Ad Slot */}
        <div className="p-6 space-y-4">
          <div className="text-center space-y-1">
            <h3 className="text-base font-black text-[#1D2D44]">
              {t('ad.officialSupporter')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('ad.explain')}
              {!canSkip && ` ${t('ad.waitToUnlock').replace('{s}', String(countdown))}`}
            </p>
          </div>

          <AdSenseSlot
            format="rectangle"
            label={t('ad.label')}
            className="my-2 min-h-[280px]"
          />

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={onComplete}
              disabled={!canSkip}
              className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all ${
                canSkip
                  ? 'bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white cursor-pointer shadow-md shadow-[#0E7C7B]/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {canSkip ? (
                <>
                  <span>{t('ad.openNow')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  <span>{t('ad.displaying').replace('{s}', String(countdown))}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
