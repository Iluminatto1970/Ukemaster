/**
 * Bloco de anúncio Google AdSense real: injeta adsbygoogle.js e registra o slot (formatos auto/rectangle/horizontal).
 */
import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSenseSlotProps {
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  label?: string;
  className?: string;
  /** Slot específico criado no painel do AdSense (data-ad-slot). */
  adSlot?: string;
}

/** Publisher ID do Google AdSense (definido no painel da Vercel). */
const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT_ID || '';

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
export const AdSenseSlot: React.FC<AdSenseSlotProps> = ({
  format = 'auto',
  label,
  className,
  adSlot,
}) => {
  const insRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!AD_CLIENT || !insRef.current) return;

    // Injeta o loader do AdSense UMA vez (o Google exige exatamente o
    // <script async src="...adsbygoogle.js?..."> — sem atributos extras,
    // que gerariam warning "AdSense head tag doesn't support...").
    if (!document.getElementById('adsense-loader')) {
      const s = document.createElement('script');
      s.id = 'adsense-loader';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
      s.async = true;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }

    const push = () => {
      if (pushedRef.current || !insRef.current) return;
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.adsbygoogle as any).push({});
        pushedRef.current = true;
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
        style={{ display: 'block', minHeight: format === 'auto' ? 90 : undefined }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot || undefined}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};
