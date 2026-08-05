/**
 * Monetag — apenas VIGNETTE ativa (2026-08, configuração final).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O POPUNDER ficou DESATIVADO: o intervalo de reexibição dele é controlado
 * internamente pelo script da Monetag (painel → frequency capping) e NÃO
 * pelo nosso código — depois de injetado, ele pode abrir a qualquer
 * momento e sequestrar cliques. Sem controle, não usamos.
 *
 * Fica ATIVADA apenas a VIGNETTE (zona 11510035): overlay de tela cheia
 * por impressão, injetada após 4 min de sessão e nunca sobreposta ao
 * intersticial do app (coordenador). Ela não intercepta cliques.
 *
 * Receita que NÃO abre nada: Google AdSense (banners), sticky bottom
 * (mobile, fechável), intersticial próprio (a cada 6ª música, máx 6/dia)
 * e banner APOIA.se (sempre visível no topo).
 * ─────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect } from 'react';
import { MONETAG_VIGNETTE } from '../config';
import { isAdOverlayBusy, onAdOverlayChange } from '../lib/adCoordinator';

/** Delay antes de injetar a vignette (4 min = 240s). */
const MONETAG_DELAY_MS = 4 * 60 * 1000;

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

    // Vignette (zona 11510035) — injetada após 4 min de sessão e espera o
    // intersticial do app fechar para nunca abrir dois overlays juntos.
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
    }, MONETAG_DELAY_MS);

    return () => window.clearTimeout(vignetteTimer);
  }, []);

  return null;
};
