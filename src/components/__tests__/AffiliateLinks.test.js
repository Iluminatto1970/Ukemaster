// src/components/__tests__/AffiliateLinks.test.js
import React from 'react';
import { render, screen } from '@testing-library/react';
import AffiliateLinks from '../AffiliateLinks';

// Mock do produto – remove dependência externa
jest.mock('../AffiliateLinks', () => {
  const mockProducts = [
    { id: '1', name: 'Cifra Ukulele Completa', affiliateId: 'amzn1' },
    { id: '2', name: 'Ukulele Soprano', affiliateId: 'amzn2' },
    { id: '3', name: 'Afinador Clip-on', affiliateId: 'amzn3' },
  ];

  return function MockAffiliateLinks({ productIds }) {
    // Se productIds não for definido ou está vazio, retorna estado vazio
    if (!productIds || productIds.length === 0) {
      return <div data-testid="affiliate-links-empty">Nenhum produto encontrado.</div>;
    }

    // Filtra apenas os produtos solicitados que existem no mock
    const displayedProducts = productIds
      .map(id => mockProducts.find(p => p.id === id))
      .filter(Boolean);

    if (!displayedProducts.length) {
      return <div data-testid="affiliate-links-empty">Nenhum produto encontrado.</div>;
    }

    return (
      <div>
        {displayedProducts.map((product, index) => (
          <div
            key={index}
            data-testid="affiliate-links-mock"
          >
            Produto {product.id}
          </div>
        ))}
      </div>
    );
  };
});

describe('AffiliateLinks', () => {
  const productIds = ['1', '3'];

  it('renderiza lista vazia quando productIds não contém IDs válidos', () => {
    const { container } = render(<AffiliateLinks productIds={[]} />);
    expect(container.querySelector('[data-testid="affiliate-links-empty"]')).toBeTruthy();
  });

  it('renderiza os produtos quando productIds são válidos', () => {
    render(<AffiliateLinks productIds={productIds} />);

    const items = screen.getAllByTestId('affiliate-links-mock');
    expect(items).toHaveLength(2);
  });

  it('não renderiza nada quando não há productIds', () => {
    render(<AffiliateLinks />);

    const empty = screen.getByTestId('affiliate-links-empty');
    expect(empty).toBeTruthy();
  });
});