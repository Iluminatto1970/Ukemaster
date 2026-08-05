/**
 * Injeção dos scripts Monetag no <head>.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTRATÉGIA FINAL (revisada 2026-08, após feedbacks de UX):
 *
 * O usuário relatou que a navegação ficava travada porque "tudo que clica
 * abria anúncio". Causa raiz: TODAS as tags da Monetag do tipo
 * `tag.min.js` / `ntfc.php` são POPUNDER — interceptam o clique e abrem
 * novas abas/janelas. Mesmo "in-page", elas sequestram a interação.
 *
 * Portanto, da Monetag mantemos APENAS a VIGNETTE (overlay tela cheia),
 * injetada só após 60s de sessão e nunca sobreposta ao intersticial do
 * app. Ela monetiza por impressão sem travar a navegação. Os popunders
 * (push, nap5k, quge5) ficam DESATIVADOS de vez.
 *
 * A receita de banner fica com o Google AdSense (in-page, não abre nada)
 * + intersticial próprio espaçado (a cada 6ª música, máx 6/dia).
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

    // Única tag Monetag ativa: VIGNETTE (zona 11510035).
    // Injeta o script só após 60s de sessão, e espera o overlay do app
    // (intersticial) fechar para nunca abrir dois ao mesmo tempo.
    // O timing interno de reexibição é do próprio Monetag
    // (configurável no painel: frequency capping).
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

    // ── DESATIVADOS (eram POPUNDER — abriam abas a cada clique) ────────
    // - MONETAG_SCRIPT_URL (push, ntfc.php)
    // - MONETAG_TAG_NAP5K (tag.min.js, zona 11510029)
    // - MONETAG_TAG_QUGE5 (tag.min.js, zona 267181)

    return () => window.clearTimeout(vignetteTimer);
  }, []);

  return null;
};
