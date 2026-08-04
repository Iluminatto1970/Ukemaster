export interface SongSeoData {
  title: string;
  artist: string;
  key?: string;
  difficulty?: string;
  chords?: string[];
  strummingPattern?: string;
  category?: string;
}

export interface GeneratedSeoResult {
  seoTitle: string;
  seoDescription: string;
  hashtags: string[];
  tags: string[];
  keywords: string;
}

/**
 * Generates SEO Title, SEO Description, Hashtags, and Keywords based on title and artist.
 */
export function generateSongSeo(data: SongSeoData): GeneratedSeoResult {
  const cleanTitle = data.title?.trim() || '';
  const cleanArtist = data.artist?.trim() || '';
  const displayTitle = cleanTitle || 'Nova Música';
  const displayArtist = cleanArtist || 'Artista Desconhecido';

  const key = data.key || 'C';
  const difficulty = data.difficulty || 'Simplificado';
  const category = data.category || 'Ukulele';
  const strumming = data.strummingPattern ? ` Batida: ${data.strummingPattern}.` : '';
  
  const chordsStr = data.chords && data.chords.length > 0 
    ? data.chords.slice(0, 6).join(', ') 
    : 'C, G, Am, F';

  // 1. Title SEO
  const seoTitle = cleanTitle && cleanArtist
    ? `${cleanTitle} - ${cleanArtist} | Cifra de Ukulele no UkeMaster Pro`
    : cleanTitle
    ? `${cleanTitle} | Cifra de Ukulele no UkeMaster Pro`
    : 'UkeMaster Pro — Cifras, Dicionário de Acordes & Afinador de Ukulele';

  // 2. Meta Description SEO
  const seoDescription = `Cifra de Ukulele da música "${displayTitle}" de ${displayArtist}. Aprenda a tocar no Ukulele em tom de ${key} (${difficulty}). Inclui acordes [${chordsStr}], diagramas interativos,${strumming} e letra completa formatada no UkeMaster Pro.`;

  // Helper for clean hashtags
  const sanitizeForHashtag = (str: string) =>
    str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();

  const hTitle = sanitizeForHashtag(displayTitle);
  const hArtist = sanitizeForHashtag(displayArtist);
  const hKey = sanitizeForHashtag(key);
  const hDiff = sanitizeForHashtag(difficulty);
  const hCat = sanitizeForHashtag(category);

  // 3. Hashtags
  const hashtagSet = new Set<string>();

  if (hTitle) {
    hashtagSet.add(`#${hTitle}`);
    hashtagSet.add(`#Ukulele${hTitle}`);
    hashtagSet.add(`#Cifra${hTitle}`);
  }
  if (hArtist && hArtist !== 'ArtistaDesconhecido') {
    hashtagSet.add(`#${hArtist}`);
    hashtagSet.add(`#Ukulele${hArtist}`);
  }
  if (hTitle && hArtist && hArtist !== 'ArtistaDesconhecido') {
    hashtagSet.add(`#${hTitle}${hArtist}`);
  }

  hashtagSet.add('#Ukulele');
  hashtagSet.add('#CifraUkulele');
  hashtagSet.add('#UkeMasterPro');
  hashtagSet.add('#UkuleleBrasil');
  hashtagSet.add('#AprenderUkulele');
  hashtagSet.add('#AcordesUkulele');
  hashtagSet.add('#AulasDeUkulele');
  hashtagSet.add('#CoverUkulele');
  hashtagSet.add('#UkuleleChords');

  if (hCat) hashtagSet.add(`#Ukulele${hCat}`);
  if (hDiff) hashtagSet.add(`#Ukulele${hDiff}`);
  if (hKey) hashtagSet.add(`#Tom${hKey}`);

  const hashtags = Array.from(hashtagSet);

  // 4. Keywords
  const tags = [
    displayTitle,
    displayArtist,
    `${displayTitle} ukulele`,
    `cifra ${displayTitle}`,
    `acordes ${displayTitle}`,
    `${displayTitle} ${displayArtist}`,
    'Ukulele',
    'Cifra Ukulele',
    'Acordes Ukulele',
    'UkeMaster Pro',
    `Tom ${key}`,
    `Ukulele ${difficulty}`,
    'Aprender Ukulele',
  ].filter((t) => Boolean(t) && t !== 'Artista Desconhecido');

  const keywords = Array.from(new Set(tags)).join(', ');

  return {
    seoTitle,
    seoDescription,
    hashtags,
    tags,
    keywords,
  };
}

/**
 * Dynamically updates DOM head metatags (<title>, description, og:title, og:description, keywords, twitter)
 */
export function updateDocumentMetaTags(seoResult: Partial<GeneratedSeoResult> & { customTitle?: string; customDescription?: string }) {
  if (typeof document === 'undefined') return;

  const pageTitle = seoResult.customTitle || seoResult.seoTitle || 'UkeMaster Pro — Cifras, Dicionário de Acordes & Afinador de Ukulele';
  const pageDescription = seoResult.customDescription || seoResult.seoDescription || 'O Portal Oficial do Ukulele: Cifras de músicas públicas, dicionário de acordes, afinador de precisão, ritmos e seu repertório privado.';
  const pageKeywords = seoResult.keywords || 'ukulele, cifra, acordes, ukemaster pro, musica, letras, afinador';

  // Update document.title
  document.title = pageTitle;

  // Helper to safely set or create <meta> tags in <head>
  const setMetaTag = (selector: string, attrName: string, attrValue: string, contentValue: string) => {
    let element = document.querySelector(selector) as HTMLMetaElement | null;
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attrName, attrValue);
      document.head.appendChild(element);
    }
    element.setAttribute('content', contentValue);
  };

  setMetaTag('meta[name="description"]', 'name', 'description', pageDescription);
  setMetaTag('meta[name="keywords"]', 'name', 'keywords', pageKeywords);

  // Open Graph
  setMetaTag('meta[property="og:title"]', 'property', 'og:title', pageTitle);
  setMetaTag('meta[property="og:description"]', 'property', 'og:description', pageDescription);
  setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', 'UkeMaster Pro');

  // Twitter Cards
  setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', pageTitle);
  setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', pageDescription);
}
