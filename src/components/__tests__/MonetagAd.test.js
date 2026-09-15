// src/components/__tests__/MonetagAd.test.js
import React from 'react';
import { render } from '@testing-library/react';
import MonetagAd from '../MonetagAd';

// Mock do script Monetag para evitar chamadas externas
jest.mock('../MonetagAd', () => () => <div data-testid="monetag-mock" />);

describe('MonetagAd', () => {
  test('não renderiza nada em páginas de listagem', () => {
    const { container } = render(<MonetagAd adSlotId="slot1" pageType="listing" />);
    // O componente deve renderizar null (sem nós)
    expect(container.firstChild).toBeNull();
  });

  test('insere div com id correto para pageType de artigo', () => {
    const { container } = render(<MonetagAd adSlotId="slot1" pageType="article" />);
    // Agora esperamos que o componente renderize um contêiner <div id="monetag-slot1" />
    // Verifique que o elemento existe (caso seu componente renderize um contêiner)
    const el = container.querySelector('#monetag-slot-01');
    expect(el).toBeTruthy();
  });
});