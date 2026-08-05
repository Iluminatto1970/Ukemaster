/**
 * Injeção dos scripts Monetag no <head>.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTRATÉGIA (revisada 2026-08, após feedback de UX):
 * Os scripts de PUSH (ntfc.php) e VIGNETTE (vignette.min.js) interceptam
 * cliques e abrem popunder/overlay a CADA interação do usuário — travavam
 * a navegação ("tudo que clica abre anúncio"). Por isso ficam DESATIVADOS.
 *
 * Mantemos apenas as TAGS IN-PAGE (banners renderizados dentro da página),
 * que monetizam por impressão SEM interceptar cliques nem abrir janelas.
 *
 * Para reativar push/vignette no futuro, basta descomentar abaixo — mas
 * NUNCA ligue ao evento de clique do usuário.
 * ─────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect } from 'react';
import {
  MONETAG_VIGNETTE,
  MONETAG_TAG_NAP5K,
  MONETAG_TAG_QUGE5,
} from '../config';
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

    // 1) Tag in-page (zona 11510029) — banner dentro da página, imediata
    injectScript('monetag-nap5k-script', MONETAG_TAG_NAP5K.src, {
      'data-zone': MONETAG_TAG_NAP5K.zone,
    });

    // 2) Tag adicional in-page (zona 267181) — banner dentro da página
    injectScript('monetag-quge5-script', MONETAG_TAG_QUGE5.src, {
      'data-zone': MONETAG_TAG_QUGE5.zone,
    });

    // 3) Vignette (overlay tela cheia, zona 11510035) — REATIVADA com
    //    espaçamento grande: o script só é injetado após 60s de sessão,
    //    e ainda espera o overlay do app (intersticial) fechar para não
    //    abrir dois ao mesmo tempo. O timing interno de reexibição é do
    //    próprio Monetag (configurável no painel: frequency capping).
    const vignetteTimer = window.setTimeout(() => {
      if (document.getElementById('monetag-vignette-script')) return;
      const injectVignette = () => {
        if (document.getElementById('monetag-vignette-script')) return;
        injectScript('monetag-vignette-script', MONETAG_VIGNETTE.src, {
          'data-zone': MONETAG_VIGNETTE.zone,
        });
      };
      // Se o intersticial do app estiver aberto, espera liberar.
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
    }, 60000);

    // Push notifications (ntfc.php) — permanece DESATIVADO: pedia permissão
    // e abria popunder a cada interação (pior experiência de todas).

    return () => window.clearTimeout(vignetteTimer);
  }, []);

  return null;
};
