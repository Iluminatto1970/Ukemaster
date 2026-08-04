import React, { useEffect } from 'react';
import { MONETAG_SCRIPT_URL } from '../config';

/**
 * Monetag — monetização por anúncios (push notifications / popunder).
 *
 * Estratégia: ads desde o dia zero, sem paywall.
 *
 * O arquivo de verificação `sw.js` (service worker da Monetag) fica em
 * `public/sw.js` e é servido em `/sw.js` no site. Este componente injeta
 * o script de push da zona (ver `MONETAG_SCRIPT_URL` em `src/config.ts`).
 *
 * IMPORTANTE: a Monetag recomenda o script logo abaixo do <head>.
 */
export const Monetag: React.FC = () => {
  useEffect(() => {
    const scriptId = 'monetag-push-script';
    // Evita injeção duplicada (StrictMode / re-renders)
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = MONETAG_SCRIPT_URL;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    document.head.appendChild(script);

    // Sem cleanup de propósito: o script de anúncio é global e deve persistir
    // enquanto o app vive (re-injeção recarregaria a publicidade).
  }, []);

  return null;
};
