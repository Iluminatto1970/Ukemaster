import { AdSenseConfig } from '../types';

const STORAGE_KEY = 'ukemaster_adsense_config';

export function formatPublisherId(rawId: string): string {
  if (!rawId) return '';
  const trimmed = rawId.trim();
  if (trimmed.startsWith('ca-pub-')) return trimmed;
  if (trimmed.startsWith('pub-')) return `ca-${trimmed}`;
  if (/^\d+$/.test(trimmed)) return `ca-pub-${trimmed}`;
  return trimmed;
}

export const DEFAULT_ADSENSE_CONFIG: AdSenseConfig = {
  publisherId: formatPublisherId(import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-7409769323856107'),
  enabled: true,
  showTestPlaceholders: true,
  slotTopHeader: '',
  slotInSong: '',
  slotInFeed: '',
  slotAnchorBottom: '',
};

export function getAdSenseConfig(): AdSenseConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const rawPubId = parsed.publisherId || import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-7409769323856107';
      return {
        ...DEFAULT_ADSENSE_CONFIG,
        ...parsed,
        publisherId: formatPublisherId(rawPubId),
      };
    }
  } catch (e) {
    console.error('Error loading AdSense config:', e);
  }
  return DEFAULT_ADSENSE_CONFIG;
}

export function saveAdSenseConfig(config: AdSenseConfig): void {
  try {
    const formattedConfig = {
      ...config,
      publisherId: formatPublisherId(config.publisherId),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formattedConfig));
  } catch (e) {
    console.error('Error saving AdSense config:', e);
  }
}

let scriptInjected = false;

export function initAdSenseScript(publisherId: string): void {
  if (!publisherId || scriptInjected) return;
  if (typeof window === 'undefined') return;

  const cleanPubId = formatPublisherId(publisherId);
  if (!cleanPubId.startsWith('ca-pub-')) return;

  const existingScript = document.querySelector(`script[src*="pagead2.googlesyndication.com"]`);
  if (existingScript) {
    scriptInjected = true;
    return;
  }

  try {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cleanPubId}`;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    scriptInjected = true;
  } catch (e) {
    console.error('Error injecting Google AdSense script:', e);
  }
}
