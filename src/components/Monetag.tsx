import React, { useEffect } from 'react';
import {
  MONETAG_SCRIPT_URL,
  MONETAG_VIGNETTE,
  MONETAG_TAG_NAP5K,
  MONETAG_TAG_QUGE5,
} from '../config';

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

    // 1) Push notifications (zona 11500772)
    injectScript('monetag-push-script', MONETAG_SCRIPT_URL);

    // 2) Vignette / interstitial (zona 11510035)
    injectScript('monetag-vignette-script', MONETAG_VIGNETTE.src, {
      'data-zone': MONETAG_VIGNETTE.zone,
    });

    // 3) In-page push / tag (zona 11510029)
    injectScript('monetag-nap5k-script', MONETAG_TAG_NAP5K.src, {
      'data-zone': MONETAG_TAG_NAP5K.zone,
    });

    // 4) Tag adicional (zona 267181)
    injectScript('monetag-quge5-script', MONETAG_TAG_QUGE5.src, {
      'data-zone': MONETAG_TAG_QUGE5.zone,
    });

    // Sem cleanup de propósito: os scripts de anúncio são globais e devem
    // persistir enquanto o app vive (re-injeção recarregaria a publicidade).
  }, []);

  return null;
};
