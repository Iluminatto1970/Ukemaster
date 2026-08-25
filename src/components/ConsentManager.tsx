/**
 * Consent Management Platform (CMP) — Google Funding Choices.
 *
 * Exigência do Google AdSense para tráfego europeu (GDPR / TCF v2):
 * sem um CMP certificado, o AdSense serve ads como "não-personalizados"
 * (eCPM ~60% menor).
 *
 * O script do Funding Choices é carregado do Google e mostra um banner
 * de consentimento ao usuário na primeira visita. O Google respeita
 * a escolha do usuário e serve ads de acordo.
 *
 * Para ativar:
 *  1. No painel do AdSense → Revisão → CMP → ativar Funding Choices
 *  2. Copie o ID do publisher (ca-pub-...) e configure abaixo
 *  3. Faça deploy
 *
 * Docs: https://support.google.com/adsense/answer/13554136
 */
import React, { useEffect } from 'react';

/** Publisher ID do AdSense — deve ser o mesmo do AdSenseSlot. */
const AD_CLIENT =
  import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-7409769323856107';

/**
 * Detecta se o usuário provavelmente está na UE/EEE (baseada no idioma
 * do navegador). Não é perfeito, mas ativa o CMP para qualquer visitante
 * europeu potencial — o Google também faz sua própria geo-verificação.
 */
function isEuropeanVisitor(): boolean {
  const lang = navigator.language || navigator.languages?.[0] || '';
  const europeanLangs = [
    'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'sv', 'da', 'fi',
    'nb', 'nn', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'el',
    'et', 'lv', 'lt', 'mt', 'ga', 'cy', 'lb', 'mk', 'sq', 'bs',
    'sr', 'tr',
  ];
  const primary = lang.split('-')[0].toLowerCase();
  return europeanLangs.includes(primary);
}

export const ConsentManager: React.FC = () => {
  useEffect(() => {
    // Só carrega o CMP para visitantes europeus (ou sempre se forçado via env)
    const forceCMP = import.meta.env.VITE_FORCE_CMP === 'true';
    if (!forceCMP && !isEuropeanVisitor()) return;

    // Google Funding Choices — TCF v2
    // O script carrega automaticamente o banner de consentimento
    // e comunica as escolhas com o AdSense via TCF API.
    if (document.getElementById('fc-consent-manager')) return;

    // Configuração do Funding Choices
    // Docs: https://developers.google.com/funding-circles/technical/concepts-funding-choices
    const script = document.createElement('script');
    script.id = 'fc-consent-manager';
    script.src = `https://fundingchoicesmessages.google.com/i/${AD_CLIENT}`;
    script.async = true;
    document.head.appendChild(script);

    // Inicializa o CMP após o script carregar
    const initCMP = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (typeof w.__tcfapi !== 'undefined') {
        // TCF v2 API já disponível — o Google se encarrega do resto
        return;
      }
      // Fallback: se o script não carregou em 5s, não bloqueia o site
    };

    script.onload = initCMP;
    const fallbackTimer = window.setTimeout(initCMP, 5000);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  return null;
};
