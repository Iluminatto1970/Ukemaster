import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { isSafeUrl } from '../utils/sanitize';
import SupportBanner from './SupportBanner';
import MonetagAd from './MonetagAd';

/**
 * Componente de listagem de cifras.
 * - Paginação simples (15 itens por página).
 * - Filtra apenas as cifras mais populares (campo `popularity`).
 * - Exibe um banner de apoio voluntário no topo.
 */
const ITEMS_PER_PAGE = 15;

export default function Listing({ items }) {
  const [page, setPage] = useState(1);
  const [filtered, setFiltered] = useState([]);

  // Filtrar itens populares (> 1000 visualizações, por exemplo)
  const popularItems = items.filter(item => item.popularity && item.popularity > 1000);

  // Atualiza a lista filtrada a cada mudança de página
  useEffect(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    setFiltered(popularItems.slice(start, end));
  }, [page, items]);

  const totalPages = Math.ceil(popularItems.length / ITEMS_PER_PAGE);

  return (
    <>
      <SupportBanner
        url="https://apoia.se/ukemasterpro"
        label="Apoiar no Apoia-se"
        bgColor="#ffcc00"
      />
      <MonetagAd adSlotId="monetag-slot-01" pageType="article" />
      <div className="listing">
        <ul>
          {filtered.map(item => (
            <li key={item.id} className="listing-item">
              <a href={isSafeUrl(item.url) ? item.url : '/cifra/'}>{item.title}</a>
              <span className="popularity">👁️ {item.popularity}</span>
            </li>
          ))}
        </ul>
        {totalPages > 1 && (
          <nav className="pagination">
            <button
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              disabled={page === 1}
            >
              ← Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              disabled={page === totalPages}
            >
              Próxima →
            </button>
          </nav>
        )}
      </div>
    </>
  );
}

Listing.propTypes = {
  /**
   * Lista de objetos de cifra.
   * Cada item deve possuir: id, title, url e popularity (número).
   */
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired,
      popularity: PropTypes.number,
    })
  ).isRequired,
};
