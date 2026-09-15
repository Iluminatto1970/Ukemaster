// src/components/__tests__/AffiliateLinks.test.js
import React from 'react';
import { render, screen } from '@testing-library/react';
import AffiliateLinks from '../AffiliateLinks';

// Mock do produto – remove dependência externa
jest.mock('../AffiliateLinks', () => ({
  default: jest.fn(() =>
    <div data-testid="affiliate-links-mock" />
  ),
}));

describe('AffiliateLinks', () => {
  const productIds = ['1', '3'];

  it('renderiza lista vazia quando productIds não contém IDs válidos', () => {
    const { container } = render(<AffiliateLinks productIds={['99']} />);
    expect(container.querySelector('.affiliate-links-empty')).toBeTruthy();
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