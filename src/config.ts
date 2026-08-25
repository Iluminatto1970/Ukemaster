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
 * IDs das unidades de anúncio AdSense — criadas no painel do AdSense
 * (Meus anúncios → Unidades de anúncio). Cada tela usa um formato
 * diferente; cole o ID numérico de cada unidade aqui.
 *
 * Se algum ID ficar vazio, o AdSenseSlot usa auto-format (funciona,
 * mas perde controle de formato e métricas por slot).
 */
/**
 * Slots AdSense criados no painel — 5 formatos diferentes:
 *  - SLOT_AUTO (5519639690): auto — fallback geral, responsivo
 *  - SLOT_OUT_OF_PAGE (6539253495): autorelaxed — sidebar
 *  - SLOT_IN_ARTICLE (7294871315): in-article fluid — dentro do conteúdo
 *  - SLOT_STICKY (5748916007): fluid + layout-key — sticky/anchor bottom
 *  - SLOT_MULTIPLEX: multiplex — recomendações de conteúdo no final da cifra
 *
 * AUTO-ADS: o Google AdSense auto-ads está ativo via index.html.
 * Ele coloca anúncios adicionais automaticamente nos espaços mortos.
 * No painel do AdSense, configure: Anúncios → Auto-ads → ativar +
 * escolher formatos permitidos (Anchor, Interstitial, In-article, Multiplex).
 */
const SLOT_AUTO = '5519639690';
const SLOT_OUT_OF_PAGE = '6539253495';
const SLOT_IN_ARTICLE = '7294871315';
const SLOT_STICKY = '5748916007';

export const ADSENSE_SLOTS = {
  /** Sticky bottom mobile (fluid + layout-key responsivo) */
  stickyBottom: import.meta.env.VITE_ADSENSE_SLOT_STICKY || SLOT_STICKY,
  /** Sidebar retângulo (autorelaxed) */
  sidebar: import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR || SLOT_OUT_OF_PAGE,
  /** Feed da lista de músicas (in-article fluid) */
  feed: import.meta.env.VITE_ADSENSE_SLOT_FEED || SLOT_IN_ARTICLE,
  /** Abaixo da cifra (in-article fluid) */
  songViewer: import.meta.env.VITE_ADSENSE_SLOT_VIEWER || SLOT_IN_ARTICLE,
  /** Dicionário de acordes (in-article fluid) */
  dictionary: import.meta.env.VITE_ADSENSE_SLOT_DICTIONARY || SLOT_IN_ARTICLE,
  /** Fallback geral (auto) — usado por slots sem ID específico */
  fallback: import.meta.env.VITE_ADSENSE_SLOT_FALLBACK || SLOT_AUTO,
  /** Multiplex — recomendações de conteúdo similar no final da cifra */
  multiplex: import.meta.env.VITE_ADSENSE_SLOT_MULTIPLEX || SLOT_AUTO,
};

/**
 * REGRA DE TRANSIÇÃO: a Monetag continua no ar ATÉ o AdSense ser aprovado.
 *
 * CHECKLIST ao trocar para `true`:
 *  1. Trocar ADSENSE_APPROVED para `true` neste arquivo.
 *  2. Verificar que os 5 ADSENSE_SLOTS estão com IDs reais (não vazios).
 *  3. O Monetag.tsx para de injetar scripts (web push, in-page, vignette).
 *  4. O AdInterstitialModal retorna null (sem modal de 10s sem ad).
 *  5. O gateAdAction no App.tsx libera ações direto (sem interstitial).
 *  6. Remover as chaves MONETAG_* deste arquivo (cleanup opcional).
 *  7. Desativar as zonas Monetag no painel deles (não só no código).
 *  8. Fazer deploy e verificar no Painel do AdSense → Revisão.
 */
export const ADSENSE_APPROVED = false;
