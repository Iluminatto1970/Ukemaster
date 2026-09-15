// src/components/AffiliateLinks.js
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Widget de links afiliados.
 * Recebe um array de IDs de produtos e renderiza um grid de banners
 * com os respectivos links de afiliado (ex.: Amazon, afiliados diversos).
 *
 * @param {Object} props
 * @param {string[]} props.productIds - IDs dos produtos a exibir.
 */
export default function AffiliateLinks({ productIds }) {
  // Dados simulados – em produção seria chamada a API de afiliados.
  const products = [
    { id: '1', name: 'Cifra Ukulele Completa', affiliateId: 'amzn1' },
    { id: '2', name: 'Ukulele Soprano', affiliateId: 'amzn2' },
    { id: '3', name: 'Afinador Clip-on', affiliateId: 'amzn3' },
    // ... mais produtos
  ];

  const displayedProducts = productIds
    ? productIds.map(id => products.find(p => p.id === id)).filter(Boolean)
    : products;

  if (!displayedProducts.length) {
    return <div className="affiliate-links-empty">Nenhum produto encontrado.</div>;
  }

  return (
    <section className="affiliate-links">
      <h2>Produtos Recomendados</h2>
      <div className="affiliate-grid">
        {displayedProducts.map(product => (
          <div
            key={product.id}
            className="affiliate-item"
            data-affiliate-id={product.affiliateId}
          >
            <h3>{product.name}</h3>
            <a
              href={`https://www.amazon.com/dp/${product.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver no Amazon
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

AffiliateLinks.propTypes = {
  /** Array de IDs de produtos (ex.: ['1', '3']) */
  productIds: PropTypes.arrayOf(PropTypes.string),
};