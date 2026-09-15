// src/components/SupportBanner.js
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Banner de apoio voluntário (Apoia-se).
 * Exibe uma faixa amarela/laranja no topo com link para a campanha.
 * Não bloqueia anúncios nem conteúdo.
 *
 * @param {string} url - Link da campanha no Apoia-se.
 * @param {string} label - Texto do botão/link.
 * @param {string} bgColor - Cor de fundo (hex ou nome).
 */
export default function SupportBanner({ url, label, bgColor }) {
  return (
    <header
      className="support-banner"
      style={{ backgroundColor: bgColor }}
      role="banner"
      aria-label="Apoie o Ukemaster Pro"
    >
      <div className="support-banner-inner">
        <span>💛 Apoie o Ukemaster Pro e mantenha o site gratuito!</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="support-banner-link"
        >
          {label}
        </a>
      </div>
    </header>
  );
}

SupportBanner.propTypes = {
  /** URL da campanha no Apoia-se */
  url: PropTypes.string.isRequired,
  /** Texto do botão de chamada */
  label: PropTypes.string.isRequired,
  /** Cor de fundo do banner (ex.: "#ffcc00" ou "#ff6600") */
  bgColor: PropTypes.string,
};

SupportBanner.defaultProps = {
  bgColor: '#ffcc00', // amarelo padrão
  label: 'Apoiar no Apoia-se',
};