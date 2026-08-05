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
 * - MONETAG_SCRIPT_URL: push notifications (zona 11500772)
 * - MONETAG_VIGNETTE: interstitial/vignette (zona 11510035)
 * - MONETAG_TAG_NAP5K: in-page push / tag (zona 11510029)
 * - MONETAG_TAG_QUGE5: tag adicional (zona 267181)
 *
 * Cole a URL exata exibida no painel (botão "Get Tag") aqui.
 */
export const MONETAG_SCRIPT_URL = 'https://5gvci.com/ntfc.php?p=11500772&tco=1';

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
  zone: '267181',
};
