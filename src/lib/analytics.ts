/**
 * Analytics leve (GA4/Plausible via configuração): rastreia page views e eventos-chave (abrir cifra, votar, login, doação).
 */
/**
 * Analytics do UkeMaster Pro — GA4 + Plausible (opcionais, via env).
 *
 * Configuração (em .env.local e nas Environment Variables da Vercel):
 *   VITE_GA_MEASUREMENT_ID="G-XXXXXXXXXX"   → ativa o Google Analytics 4
 *   VITE_PLAUSIBLE_DOMAIN="ukemasterpro.com" → ativa o Plausible
 *
 * Com qualquer uma das chaves, o script é injetado no <head> e os eventos
 * passam a ser enviados. Sem chaves, TODAS as funções são no-op (o app
 * funciona normalmente, zero custo, zero rede).
 *
 * SPA: como o app não tem rotas de URL, cada "tela" relevante (abrir cifra,
 * trocar de aba) dispara um page_view virtual para o provider ativo, para
 * os relatórios terem uma noção de página.
 */

interface AnalyticsEnv {
  gaId: string;
  plausibleDomain: string;
  /** Host customizado do Plausible (ex.: auto-hospedado). Padrão: plausible.io */
  plausibleHost: string;
}

function getEnv(): AnalyticsEnv {
  const e = import.meta.env as Record<string, string | undefined>;
  return {
    gaId: e.VITE_GA_MEASUREMENT_ID || '',
    plausibleDomain: e.VITE_PLAUSIBLE_DOMAIN || '',
    plausibleHost: e.VITE_PLAUSIBLE_API_HOST || 'plausible.io',
  };
}

let initialized = false;
let env: AnalyticsEnv = { gaId: '', plausibleDomain: '', plausibleHost: 'plausible.io' };

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
    plausible?: (event: string, opts?: { props?: Record<string, string | number | boolean> }) => void;
  }
}

/** Carrega o script do GA4 (gtag.js) e configura o stream. */
function initGa(id: string) {
  const doc = document;
  const existing = doc.querySelector('script[data-ga4]');
  if (existing) return;
  const s = doc.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  s.dataset.ga4 = '1';
  doc.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    // Respeita o navegador: sem consentimento explícito não ativa
    // cookies de anúncio (o GA4 básico usa apenas cookies de analytics).
    anonymize_ip: true,
    // SPA: o gtag(config) já dispararia um page_view no load — desativamos
    // porque o App.tsx dispara o page_view manualmente a cada tela.
    send_page_view: false,
  });
}

/** Carrega o script do Plausible (script.js — ~1KB, sem cookies). */
function initPlausible(domain: string, host: string) {
  const doc = document;
  const existing = doc.querySelector('script[data-plausible]');
  if (existing) return;
  const s = doc.createElement('script');
  s.defer = true;
  s.dataset.domain = domain;
  s.dataset.plausible = '1';
  s.src = `https://${host}/js/script.js`;
  doc.head.appendChild(s);
}

/**
 * Inicializa o analytics. Deve ser chamado UMA vez, no boot do app
 * (main.tsx). Seguro chamar em qualquer ambiente (dev sem chave = no-op).
 */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  env = getEnv();
  if (env.gaId) initGa(env.gaId);
  if (env.plausibleDomain) initPlausible(env.plausibleDomain, env.plausibleHost);
}

/** true se pelo menos um provider está configurado. */
export function isAnalyticsEnabled(): boolean {
  return Boolean(env.gaId || env.plausibleDomain);
}

/**
 * Page view virtual (SPA). Dispara em "navegações" de estado: abrir cifra,
 * trocar de aba, abrir o afinador etc.
 */
export function trackPageView(title: string, path?: string): void {
  if (!isAnalyticsEnabled()) return;
  const location = path || window.location.pathname + window.location.search;
  const pageTitle = title || document.title;
  try {
    window.gtag?.('event', 'page_view', {
      page_title: pageTitle,
      page_location: location,
    });
    window.plausible?.('pageview');
  } catch {
    // nunca deixa analytics quebrar o app
  }
}

/**
 * Evento customizado. Enviado para GA4 (nome sem prefixo) e Plausible
 * (mesmo nome), com propriedades em ambos.
 *
 * Ex.: trackEvent('song_view', { id, title, artist });
 */
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>
): void {
  if (!isAnalyticsEnabled()) return;
  try {
    window.gtag?.('event', name, props);
    window.plausible?.(name, props ? { props } : undefined);
  } catch {
    // nunca deixa analytics quebrar o app
  }
}
