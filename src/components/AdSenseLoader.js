// src/components/AdSenseLoader.js
import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Carrega o script do Google AdSense apenas em páginas que NÃO sejam de listagem.
 * Exemplo de uso:
 *   <AdSenseLoader pageType={pageType} />
 *
 * pageType: string que identifica o tipo da página atual.
 *   - "listing"  → não carrega anúncios
 *   - "article", "home", etc. → carrega anúncios
 */
export default function AdSenseLoader({ pageType }) {
  useEffect(() => {
    // Se for uma página de listagem, nada a fazer.
    if (pageType === 'listing') return;

    // Verifica se o script já foi inserido para evitar duplicação.
    if (document.getElementById('adsense-script')) return;

    const script = document.createElement('script');
    script.id = 'adsense-script';
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    script.setAttribute('data-ad-client', 'ca-pub-XXXXXXXXXXXXXXXX'); // SUBSTITUA PELO SEU ID
    document.body.appendChild(script);

    // Inicializa o slot de anúncios após o script carregar.
    script.onload = () => {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    };
  }, [pageType]);

  // Caso a página seja de listagem, renderiza nada.
  if (pageType === 'listing') return null;

  // Renderiza um contêiner de anúncio padrão do AdSense.
  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-format="auto"
      data-full-width-responsive="true"
      data-ad-slot="1234567890" // SUBSTITUA PELO SLOT CORRETO
    />
  );
}

AdSenseLoader.propTypes = {
  /** Tipo da página renderizada (ex.: "listing", "article", "home") */
  pageType: PropTypes.string.isRequired,
};
