/**
 * Detecção client-side de navegadores automatizados/headless.
 *
 * Um scraper sofisticado pode usar um navegador real com o app — esta camada
 * complementa o middleware Edge (que pega curl/python/headless por User-Agent
 * e rate limit). Sinais clássicos de automação:
 *   - navigator.webdriver === true (Chrome/Chromium sob automação);
 *   - UA headless/automação (HeadlessChrome, PhantomJS, Playwright...);
 *   - Chrome real sem window.chrome (ou sem userAgentData) + plugins vazios;
 *   - plugins vazios + um único idioma + UA de Chrome (assinatura de headless).
 *
 * Uso no app: se detectado, o catálogo da nuvem não é baixado (o visitante
 * só vê as músicas default) e a sessão de anúncios é marcada — o custo de
 * scraping em massa via navegador cai, sem afetar usuários reais.
 */
export function isLikelyAutomatedBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;

  try {
    const nav = navigator as Navigator & {
      webdriver?: boolean;
      userAgentData?: unknown;
      languages?: string[];
      plugins?: { length: number };
    };
    const ua = nav.userAgent || '';

    // Sinal de desktop: mobile tem plugins vazios por padrão (Chrome Android,
    // iOS) — os heurísticos abaixo só acusam automação em DESKTOP, evitando
    // falsos positivos em celulares legítimos (plugins.length === 0 é normal).
    const uad = (nav as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
    const isMobile =
      uad?.mobile === true ||
      /Mobile|Android|iPhone|iPad|iPod/i.test(ua) ||
      /Mobi/i.test(ua) ||
      typeof window.orientation !== 'undefined';

    // Sinal mais forte: o navegador se declara sob automação.
    if (nav.webdriver === true) return true;

    // UAs de automação/headless explícitos.
    if (/HeadlessChrome|PhantomJS|Phantom|puppeteer|playwright|selenium/i.test(ua)) return true;

    // Chrome headless clássico: UA de Chrome + plugins vazios + 1 idioma
    // (browsers reais têm plugins.length >= 1 em desktop).
    const pluginsCount = nav.plugins?.length ?? 0;
    const langsCount = nav.languages?.length ?? 0;
    if (!isMobile && /Chrome/i.test(ua) && pluginsCount === 0 && langsCount <= 1 && !nav.userAgentData) {
      return true;
    }

    // Chrome headless novo (--headless=new): Chrome sem runtime nem userAgentData.
    const w = window as Window & { chrome?: unknown };
    if (!isMobile && /Chrome/i.test(ua) && !nav.userAgentData && !w.chrome && pluginsCount === 0) {
      return true;
    }
  } catch {
    // heurística falhou — não acusar usuário real
  }

  return false;
}

/** Marca a sessão como bot (data attribute para CSS/logs). */
export function markSessionAsBot(): void {
  try {
    document.documentElement.setAttribute('data-bot', '1');
  } catch {
    // sem DOM ainda — ignora
  }
}
