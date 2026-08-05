/**
 * Injeção dos scripts Monetag (push, vignette e tags) no <head> para monetização sem paywall.
 */
import React, { useEffect } from 'react';
import {
  MONETAG_SCRIPT_URL,
  MONETAG_VIGNETTE,
  MONETAG_TAG_NAP5K,
  MONETAG_TAG_QUGE5,
} from '../config';
import { isAdOverlayBusy, onAdOverlayChange } from '../lib/adCoordinator';

/**
 * Monetag — monetização por anúncios (push notifications / popunder /
 * vignette / in-page tags). Estratégia: ads desde o dia zero, sem paywall.
 *
 * O arquivo de verificação `sw.js` (service worker da Monetag) fica em
 * `public/sw.js` e é servido em `/sw.js` no site.
 *
 * IMPORTANTE: a Monetag recomenda os scripts logo abaixo do <head>.
 * Injetamos programaticamente no <head> para o SPA (equivalente a colar
 * as tags no index.html).
 */
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

    // NOTA DE EXPERIÊNCIA (2026-08): todos os scripts Monetag são mantidos
    // (push, vignette, tags in-page), MAS os mais agressivos (push e
    // vignette — que abrem popup de permissão / overlay de tela cheia)
    // só são injetados DEPOIS da primeira interação do usuário (clique/
    // scroll) ou após 15s — assim a navegação inicial não fica travada.
    // As tags in-page (banners) são injetadas imediatamente.

    // ── Escalonamento para NUNCA abrir vários anúncios ao mesmo tempo ──
    // 1) Tags in-page (banners): imediatas, não bloqueiam nada.
    // 2) Push (permissão/popup): só após a primeira interação (ou 20s).
    // 3) Vignette (overlay tela cheia): só depois do push E quando nenhum
    //    overlay do app estiver aberto — espera liberar se estiver ocupado.

    // 1) Tag in-page (zona 11510029) — imediata, não bloqueia navegação
    injectScript('monetag-nap5k-script', MONETAG_TAG_NAP5K.src, {
      'data-zone': MONETAG_TAG_NAP5K.zone,
    });

    // 2) Tag adicional in-page (zona 267181) — imediata
    injectScript('monetag-quge5-script', MONETAG_TAG_QUGE5.src, {
      'data-zone': MONETAG_TAG_QUGE5.zone,
    });

    // Push + vignette: aguardam a primeira interação do usuário para não
    // travar a navegação inicial (fallback: 20s sem interação).
    let aggressiveLoaded = false;
    let pushLoaded = false;

    const loadPush = () => {
      if (pushLoaded) return;
      pushLoaded = true;
      injectScript('monetag-push-script', MONETAG_SCRIPT_URL);
    };

    const loadVignette = () => {
      if (document.getElementById('monetag-vignette-script')) return;
      // Se o intersticial do app estiver aberto, espera liberar (nunca
      // dois overlays na tela ao mesmo tempo).
      if (isAdOverlayBusy()) {
        const off = onAdOverlayChange(() => {
          if (!isAdOverlayBusy()) {
            off();
            injectScript('monetag-vignette-script', MONETAG_VIGNETTE.src, {
              'data-zone': MONETAG_VIGNETTE.zone,
            });
          }
        });
        return;
      }
      injectScript('monetag-vignette-script', MONETAG_VIGNETTE.src, {
        'data-zone': MONETAG_VIGNETTE.zone,
      });
    };

    const loadAggressive = () => {
      if (aggressiveLoaded) return;
      aggressiveLoaded = true;

      window.removeEventListener('click', loadAggressive);
      window.removeEventListener('scroll', loadAggressive, { passive: true } as EventListenerOptions);
      window.removeEventListener('keydown', loadAggressive);
      window.clearTimeout(timeout);

      // Push primeiro; vignette só depois (escalonado: nunca juntos).
      loadPush();
      window.setTimeout(loadVignette, 8000);
    };

    // Fallback: carrega mesmo sem interação após 20s
    const timeout = window.setTimeout(loadAggressive, 20000);
    window.addEventListener('click', loadAggressive, { passive: true });
    window.addEventListener('scroll', loadAggressive, { passive: true } as EventListenerOptions);
    window.addEventListener('keydown', loadAggressive, { passive: true });

    // Sem cleanup de propósito: os scripts de anúncio são globais e devem
    // persistir enquanto o app vive (re-injeção recarregaria a publicidade).
  }, []);

  return null;
};
