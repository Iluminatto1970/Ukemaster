/**
 * Monetag — configuração balanceada (2026-08): mais receita sem os
 * popunders que sequestravam cliques.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HISTÓRICO (por que está assim):
 *  1. ago/2026 — TODAS as tags Monetag ativas → usuário: "tudo que clico
 *     abre anúncio" (popunder interceptava o clique). Tudo desligado.
 *  2. ago/2026 — restou só a VIGNETTE após 4 min de sessão → quase NENHUMA
 *     impressão (a maioria das sessões dura menos de 4 min). Receita
 *     Monetag praticamente zero.
 *  3. agora — equilíbrio: push por permissão + in-page push + vignette
 *     bem mais cedo, sem popunder. Cada zona é um bloco independente
 *     abaixo: dá para ligar/desligar e ajustar os delays sem mexer na
 *     lógica.
 *
 * ATIVO:
 *  - WEB PUSH (zona 11530027, ntfc.php) — o MAIOR gerador da Monetag.
 *    Baseado em permissão do navegador: o script pergunta (UI própria) e
 *    só entrega push ads para quem aceita — não abre aba. Injetado após a
 *    primeira interação (scroll/clique/touch) ou 20s no máximo, que é o
 *    timing recomendado para boa taxa de opt-in.
 *  - IN-PAGE PUSH (zona 11510029, nap5k.com) — toast de notificação
 *    DENTRO da página, estilo OneSignal. Não intercepta clique (verifique
 *    no painel se a zona está como "in-page push" e não "popunder").
 *    Injetado aos 45s.
 *  - VIGNETTE (zona 11510035) — overlay de tela cheia por impressão,
 *    injetada aos 75s, escalonada para nunca colidir com o in-page push
 *    (era 4 min = quase nunca disparava). Nunca sobreposta ao intersticial
 *    do app (adCoordinator).
 *
 * DESLIGADO (opt-in):
 *  - POPUNDER (zona 268081, quge5.com) — o intervalo de reexibição dele é
 *    controlado pelo script/painel (frequency capping), não pelo nosso
 *    código; depois de injetado pode abrir a qualquer momento e sequestrar
 *    cliques. Para religar: ENABLE_POPUNDER = true E configure o frequency
 *    capping no painel Monetag (recomendo 1x por sessão).
 * ─────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect } from 'react';
import {
  ADSENSE_APPROVED,
  MONETAG_SCRIPT_URL,
  MONETAG_VIGNETTE,
  MONETAG_TAG_NAP5K,
  MONETAG_TAG_QUGE5,
} from '../config';
import { isAdOverlayBusy, onAdOverlayChange } from '../lib/adCoordinator';

/** Liga/desliga cada zona sem mexer no resto. */
const ENABLE_WEB_PUSH = true; // zona 11530027 — permissão do navegador
const ENABLE_IN_PAGE_PUSH = true; // zona 11510029 — toast dentro da página
const ENABLE_VIGNETTE = true; // zona 11510035 — overlay por impressão
const ENABLE_POPUNDER = false; // zona 268081 — NÃO recomendado (sequestra cliques)

/** Delays (ms) — tune aqui, sem mexer na lógica. */
const PUSH_FALLBACK_MS = 20_000; // se o usuário não interagir até lá, injeta mesmo assim
const IN_PAGE_PUSH_DELAY_MS = 45_000;
const VIGNETTE_DELAY_MS = 75_000; // escalonado p/ nunca colidir com o in-page push
const POPUNDER_DELAY_MS = 30_000;

/** Eventos que contam como "primeira interação" (para injetar o web push). */
const INTERACTION_EVENTS = ['scroll', 'click', 'touchstart', 'keydown'] as const;

export const Monetag: React.FC = () => {
  useEffect(() => {
    // REGRA DE TRANSIÇÃO (igual ao SistemaPainho): a Monetag (rede antiga)
    // continua no ar ATÉ o Google AdSense ser aprovado. Quando aprovar,
    // troque ADSENSE_APPROVED para true no src/config.ts — toda a Monetag
    // para de carregar e o AdSense assume sozinho.
    if (ADSENSE_APPROVED) return;

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

    const timers: number[] = [];
    const cleanups: Array<() => void> = [];

    // ── 1. Web push (zona 11530027) — após a 1ª interação ───────────────
    if (ENABLE_WEB_PUSH) {
      let pushInjected = false;
      let fallbackTimer: number | undefined;

      const injectPush = () => {
        if (pushInjected) return;
        pushInjected = true;
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
        INTERACTION_EVENTS.forEach((ev) =>
          window.removeEventListener(ev, onFirstInteraction)
        );
        if (document.getElementById('monetag-push-script')) return;
        injectScript('monetag-push-script', MONETAG_SCRIPT_URL);
      };
      const onFirstInteraction = () => injectPush();

      INTERACTION_EVENTS.forEach((ev) =>
        window.addEventListener(ev, onFirstInteraction, { once: true, passive: true })
      );
      fallbackTimer = window.setTimeout(injectPush, PUSH_FALLBACK_MS);
      timers.push(fallbackTimer);
      cleanups.push(() => {
        INTERACTION_EVENTS.forEach((ev) =>
          window.removeEventListener(ev, onFirstInteraction)
        );
      });
    }

    // ── 2. In-page push (zona 11510029) — toast dentro da página ────────
    if (ENABLE_IN_PAGE_PUSH) {
      timers.push(
        window.setTimeout(() => {
          if (document.getElementById('monetag-nap5k-script')) return;
          injectScript('monetag-nap5k-script', MONETAG_TAG_NAP5K.src, {
            'data-zone': MONETAG_TAG_NAP5K.zone,
          });
        }, IN_PAGE_PUSH_DELAY_MS)
      );
    }

    // ── 3. Vignette (zona 11510035) — após 75s e nunca sobreposta ao
    //      intersticial do app (coordenador) ─────────────────────────────
    if (ENABLE_VIGNETTE) {
      timers.push(
        window.setTimeout(() => {
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
            cleanups.push(off);
          } else {
            injectVignette();
          }
        }, VIGNETTE_DELAY_MS)
      );
    }

    // ── 4. Popunder (zona 268081) — opt-in, exige frequency capping no
    //      painel Monetag. Desligado por padrão (histórico de cliques). ──
    if (ENABLE_POPUNDER) {
      timers.push(
        window.setTimeout(() => {
          if (document.getElementById('monetag-popunder-script')) return;
          injectScript('monetag-popunder-script', MONETAG_TAG_QUGE5.src, {
            'data-zone': MONETAG_TAG_QUGE5.zone,
          });
        }, POPUNDER_DELAY_MS)
      );
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      cleanups.forEach((c) => c());
    };
  }, []);

  return null;
};
