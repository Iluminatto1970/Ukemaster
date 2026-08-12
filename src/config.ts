/**
 * Configuração global: URLs públicas (APOIA.se, Monetag, scripts de anúncio) e constantes de ambiente do projeto.
 */
/**
 * Configurações globais do UkeMaster Pro.
 *
 * Estratégia: ads (Monetag) desde o dia zero + comunidade (APOIA.se),
 * sem paywall — acervo 100% gratuito para a comunidade de ukulele.
 */

/** URL pública da sua campanha no APOIA.se (troque pela sua página real). */
export const APOIA_SE_URL = 'https://apoia.se/ukemasterpro';

/**
 * Scripts de anúncios da Monetag (zonas criadas no painel).
 *
 * - MONETAG_SCRIPT_URL: push notifications (zona 11530027)
 * - MONETAG_VIGNETTE: interstitial/vignette (zona 11510035)
 * - MONETAG_TAG_NAP5K: in-page push / tag (zona 11510029)
 * - MONETAG_TAG_QUGE5: tag adicional (zona 268081)
 *
 * Cole a URL exata exibida no painel (botão "Get Tag") aqui.
 */
export const MONETAG_SCRIPT_URL = 'https://3nbf4.com/ntfc.php?p=11530027&tco=1';

export const MONETAG_VIGNETTE = {
  zone: '11510035',
  src: 'https://n6wxm.com/vignette.min.js',
};

export const MONETAG_TAG_NAP5K = {
  zone: '11510029',
  src: 'https://nap5k.com/tag.min.js',
};

export const MONETAG_TAG_QUGE5 = {
  src: 'https://quge5.com/88/tag.min.js',
  zone: '268081', // zona recriada para o domínio ukemasterpro.com (era 267181 no vercel.app)
};

/**
 * REGRA DE TRANSIÇÃO (igual ao SistemaPainho): a rede antiga (Monetag)
 * continua no ar ATÉ o Google AdSense ser aprovado (site READY no painel).
 * Quando aprovar, mude para `true` — toda a Monetag para de carregar
 * (Monetag.tsx e a vignette do intersticial) e o AdSense, que já está
 * integrado (loader no index.html + AdSenseSlot), assume sozinho.
 */
export const ADSENSE_APPROVED = false;
