/**
 * Monetag — apenas VIGNETTE ativa (2026-08, meio-termo após feedbacks).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O QUE FICA LIGADO:
 *   - VIGNETTE (zona 11510035): overlay de tela cheia por IMPRESSÃO.
 *     Ela NÃO intercepta cliques (diferente dos popunders): o usuário
 *     navega normalmente e a vignette abre por cima quando o Monetag
 *     dispara. Injetada só após 90s de sessão para não incomodar a
 *     entrada, e espera o intersticial do app fechar (nunca 2 overlays).
 *
 * O QUE FICA DESLIGADO (sequestravam cliques — "qualquer clique abre
 * anúncio"):
 *   - PUSH (ntfc.php): popup de permissão + popunder.
 *   - TAGS in-page (nap5k/quge5 tag.min.js): popunder, abriam nova aba
 *     a cada interação.
 *
 * Receita adicional que NÃO abre nada: Google AdSense (banners), sticky
 * bottom (mobile, fechável), intersticial próprio (a cada 6ª música,
 * máx 6/dia) e banner APOIA.se (sempre visível).
 * ─────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect } from 'react';
import { MONETAG_VIGNETTE } from '../config';
import { isAdOverlayBusy, onAdOverlayChange } from '../lib/adCoordinator';

export const Monetag: React.FC = () => {
  useEffect(() => {
    const injectScript = (
      id: string,
      src: string,
      attrs?: Record<string, string>
    ) => {
      if (document.getElementById(id)) return;
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
      }
      document.head.appendChild(script);
    };

    // Única tag Monetag: VIGNETTE — após 90s de sessão e nunca sobreposta
    // ao intersticial do app. O timing interno de reexibição é do Monetag
    // (configurável no painel: frequency capping — recomendo 1 por visita).
    const vignetteTimer = window.setTimeout(() => {
      if (document.getElementById('monetag-vignette-script')) return;
      const injectVignette = () => {
        if (document.getElementById('monetag-vignette-script')) return;
        injectScript('monetag-vignette-script', MONETAG_VIGNETTE.src, {
          'data-zone': MONETAG_VIGNETTE.zone,
        });
      };
      if (isAdOverlayBusy()) {
        const off = onAdOverlayChange(() => {
          if (!isAdOverlayBusy()) {
            off();
            injectVignette();
          }
        });
      } else {
        injectVignette();
      }
    }, 90000);

    return () => window.clearTimeout(vignetteTimer);
  }, []);

  return null;
};
