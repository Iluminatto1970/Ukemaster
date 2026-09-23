/**
 * Bloco de anúncio Google AdSense real: injeta adsbygoogle.js e registra o slot (formatos auto/rectangle/horizontal).
 */
import React, { useEffect, useRef } from 'react';
import { trackEvent } from '../lib/analytics';
import { getAbVariant } from '../lib/abTest';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSenseSlotProps {
  /** Formato do anúncio: 'autorelaxed' (sidebar) ou 'fluid' (in-article/sticky). */
  format?: 'auto' | 'autorelaxed' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical';
  /** Layout do anúncio: 'in-article' para ads dentro do conteúdo. */
  layout?: 'in-article' | 'in-feed' | 'bridge';
  /** Layout key do AdSense (ex: '-hz+e-15-33+a0' para sticky responsivo). */
  layoutKey?: string;
  label?: string;
  className?: string;
  /** Slot específico criado no painel do AdSense (data-ad-slot). */
  adSlot?: string;
  /** Se true, não chama adsbygoogle.push (para evitar re-push em SPA). */
  suppressPush?: boolean;
  /** ID do teste A/B associado a este slot (para tracking). */
  abTestId?: string;
}

/**
 * Publisher ID do Google AdSense — mesmo do index.html. O fallback garante
 * que as unidades funcionem mesmo se a variável VITE_ADSENSE_CLIENT_ID não
 * existir no deploy (ex.: Vercel sem a env configurada).
 */
const AD_CLIENT =
  import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-7409769323856107';

/**
 * Bloco de anúncio do Google AdSense.
 *
 * Injeta o script `adsbygoogle.js` uma única vez e registra o slot com
 * `adsbygoogle.push({})` (o formato padrão para SPA/React).
 *
 * Regras do AdSense:
 * - Nunca renderizar mais de 3 slots por página.
 * - O `push` deve acontecer APÓS o script carregar; usamos um pequeno
 *   timeout e re-tentativa no evento de carregamento do script.
 */
/** Contador global de pushes (evita re-push ao navegar em SPA). */
let globalPushCount = 0;
const MAX_PUSHES_PER_PAGE = 8; // 5 slots manuais + auto-ads + margem

export const AdSenseSlot: React.FC<AdSenseSlotProps> = ({
  format = 'auto',
  layout,
  layoutKey,
  label,
  className,
  adSlot,
  suppressPush = false,
  abTestId,
}) => {
  const insRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!AD_CLIENT || !insRef.current) return;
    if (suppressPush) return;

    // O loader do AdSense (adsbyglobal.js) já está no index.html.
    // Só injeta como fallback se o <script> não existir (ex.: testes locais).
    if (!document.getElementById('adsense-loader') && !document.querySelector(`script[src*="adsbygoogle.js?client=${AD_CLIENT}"]`)) {
      const s = document.createElement('script');
      s.id = 'adsense-loader';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
      s.async = true;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }

    const push = () => {
      if (pushedRef.current || !insRef.current) return;
      if (globalPushCount >= MAX_PUSHES_PER_PAGE) return;
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.adsbygoogle as any).push({});
        pushedRef.current = true;
        globalPushCount++;
        // Analytics: rastrear impressão do ad para otimização de eCPM
        const abProps: Record<string, string> = {};
        if (abTestId) {
          abProps.ab_test = abTestId;
          abProps.ab_variant = getAbVariant(abTestId);
        }
        trackEvent('ad_impression', { slot: adSlot || 'auto', format, ...abProps });
      } catch {
        // AdSense bloqueado (adblock) — segue sem erro
      }
    };

    // Tenta após o script carregar; re-tenta uma vez para SPA
    const t1 = window.setTimeout(push, 250);
    const t2 = window.setTimeout(push, 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [suppressPush]);

  // Reset do contador global ao trocar de rota (SPA)
  useEffect(() => {
    globalPushCount = 0;
  }, []);

  if (!AD_CLIENT) return null;

  return (
    <div className={className}>
      {label && (
        <p className="text-[10px] uppercase tracking-wider text-slate-400 text-center mb-1">
          {label}
        </p>
      )}
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', textAlign: 'center' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot || undefined}
        data-ad-format={format}
        {...(layout ? { 'data-ad-layout': layout } : {})}
        {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
        data-full-width-responsive="true"
      />
    </div>
  );
};
