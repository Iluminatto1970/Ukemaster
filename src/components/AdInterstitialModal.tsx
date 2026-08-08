/**
 * Anúncio intersticial antes de ações premium (a cada 3ª abertura de cifra,
 * e também downloads/playlists/afinador/metrônomo): espera mínima para
 * monetizar a impressão e botão Continuar liberado após o tempo.
 *
 * O anúncio exibido é a VIGNETTE da Monetag (zona 11510035): o script abre
 * um overlay de tela cheia POR CIMA do modal (z-index próprio da Monetag),
 * exatamente o formato "só passa depois de ver o anúncio". Usamos o MESMO
 * id do Monetag.tsx ('monetag-vignette-script') para o disparo automático
 * (75s de sessão) não duplicar o script — a Monetag controla a frequência
 * pelo painel. A contagem de 10s e o limite diário (App.tsx) não mudam.
 */
import React, { useState, useEffect } from 'react';
import { useT } from '../lib/i18n';
import { Clock, Music, ArrowRight, Megaphone } from 'lucide-react';
import { Logo } from './Logo';
import { MONETAG_VIGNETTE } from '../config';

interface AdInterstitialModalProps {
  isOpen: boolean;
  onComplete: () => void;
  /** O que está sendo liberado (cifra, download, playlists, afinador...). */
  title?: string;
  artist?: string;
  /** Texto do botão principal (padrão: "Abrir Cifra Agora"). */
  openLabel?: string;
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
  openLabel,
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

  // Vignette Monetag (zona 11510035): injeta o script quando o modal abre.
  // A Monetag abre o anúncio em TELA CHEIA por cima do modal — o formato
  // "só passa depois de ver". O id é o mesmo usado pelo Monetag.tsx, então
  // não há duplicação com o disparo automático dos 75s.
  //
  // IMPORTANTE: a Monetag NÃO tem API pública de re-disparo sob demanda —
  // o script, uma vez no <head>, mostra a vignette conforme o frequency
  // capping configurado NO PAINEL (recomendado 1x/sessão). Ou seja: o
  // limite diário de 6 intersticiais (App.tsx) é um TETO de exibição do
  // modal, não uma garantia de 6 anúncios — a 1ª abertura da sessão
  // monetiza com a vignette e as demais mostram apenas a contagem
  // (placeholder). Para mais impressões, ajuste a frequência no painel.
  useEffect(() => {
    if (!isOpen) return;
    if (document.getElementById('monetag-vignette-script')) return;
    const s = document.createElement('script');
    s.id = 'monetag-vignette-script';
    s.src = MONETAG_VIGNETTE.src;
    s.async = true;
    s.setAttribute('data-zone', MONETAG_VIGNETTE.zone);
    document.head.appendChild(s);
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

          {/* A vignette Monetag abre em TELA CHEIA por cima deste modal — o
              bloco abaixo é o fallback visual (enquanto o anúncio carrega e
              após fechá-lo), nunca um segundo anúncio. */}
          <div className="my-2 min-h-[280px] rounded-2xl border-2 border-dashed border-[#0E7C7B]/25 bg-gradient-to-br from-[#0E7C7B]/[0.05] via-white to-amber-50/70 flex flex-col items-center justify-center gap-2.5 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center animate-pulse">
              <Megaphone className="w-6 h-6 text-[#F26419]" />
            </div>
            <p className="text-xs font-black text-[#1D2D44]">
              {t('ad.officialSupporter')}
            </p>
            <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
              {t('ad.explain')}
            </p>
          </div>

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
                  <span>{openLabel || t('ad.openNow')}</span>
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
