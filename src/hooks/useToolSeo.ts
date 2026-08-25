/**
 * SEO para páginas de ferramentas (afinador, metrônomo, dicionário):
 * injeta JSON-LD WebApplication + atualiza <title> e meta tags no <head>.
 *
 * Schema.org tipos usados:
 *  - WebApplication: descreve a ferramenta como um app interativo
 *  - SoftwareApplication (alternativa) para o Google
 */
import { useEffect } from 'react';

export interface ToolSeoConfig {
  /** Slug da rota (ex: 'afinador', 'metronomo', 'dicionario') */
  slug: string;
  /** Título da página (<title>) */
  title: string;
  /** Meta description */
  description: string;
  /** URL canônica (sem trailing slash) */
  url: string;
  /** Categoria do applicationCategory schema.org */
  applicationCategory?: string;
  /** Operação oferecida (ex: 'TuneAction', 'PracticeAction') */
  operatingSystem?: string;
}

/**
 * Injeta JSON-LD WebApplication no <head> e atualiza <title> / meta tags.
 * Faz cleanup ao desmontar (remove o que criou).
 */
export function useToolSeo(config: ToolSeoConfig): void {
  const {
    slug,
    title,
    description,
    url,
    applicationCategory = 'MultimediaApplication',
    operatingSystem = 'Web',
  } = config;

  useEffect(() => {
    const created: HTMLElement[] = [];

    // ── <title> ────────────────────────────────────────────────────────
    const prevTitle = document.title;
    document.title = `${title} | UkeMaster Pro`;

    // ── Canonical ──────────────────────────────────────────────────────
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
      created.push(canonical);
    }
    canonical.href = url;

    // ── Meta description ───────────────────────────────────────────────
    let metaDesc = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
      created.push(metaDesc);
    }
    metaDesc.content = description;

    // ── OG tags ────────────────────────────────────────────────────────
    const ogTags: Array<{ property: string; content: string }> = [
      { property: 'og:title', content: `${title} | UkeMaster Pro` },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'website' },
    ];

    for (const { property, content } of ogTags) {
      let meta = document.querySelector<HTMLMetaElement>(
        `meta[property="${property}"]`
      );
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
        created.push(meta);
      }
      meta.content = content;
    }

    // ── JSON-LD WebApplication ─────────────────────────────────────────
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: title,
      description,
      url,
      applicationCategory,
      operatingSystem,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'BRL',
      },
      author: {
        '@type': 'Organization',
        name: 'UkeMaster Pro',
        url: window.location.origin,
      },
      publisher: {
        '@type': 'Organization',
        name: 'UkeMaster Pro',
        url: window.location.origin,
      },
      // PotentialAction indica que a ferramenta executa uma ação útil
      potentialAction: {
        '@type': 'UseAction',
        target: url,
        name: title,
      },
    };

    let script = document.querySelector<HTMLScriptElement>(
      `script[data-tool-jsonld="${slug}"]`
    );
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-tool-jsonld', slug);
      document.head.appendChild(script);
      created.push(script);
    }
    script.textContent = JSON.stringify(jsonLd);

    // ── Cleanup ────────────────────────────────────────────────────────
    return () => {
      document.title = prevTitle;
      created.forEach((el) => el.remove());
    };
  }, [slug, title, description, url, applicationCategory, operatingSystem]);
}
