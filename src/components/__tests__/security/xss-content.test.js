// src/components/__tests__/security/xss-content.test.js
import React from 'react';
import { render } from '@testing-library/react';
import Listing from '../../Listing';
import { encodeEntities } from '../../../utils/sanitize';

describe('Security – XSS Prevention', () => {
  it('escapes malicious titles', () => {
    const maliciousTitle = '<script>alert(1)</script> fake';
    const { container } = render(
      <Listing
        items={[{ id: '1', title: maliciousTitle, url: '/cifra/1', popularity: 2000 }]}
        pageType="article"
      />
    );
    // O componente deve renderizar o título escapado
    expect(container).not.toContainHTML('<script>');
    expect(container).toContainHTML(encodeEntities(maliciousTitle));
  });

  it('sanitiza URLs para evitar javascript:', () => {
    const { container } = render(
      <Listing
        items={[{ id: '1', title: 'Cifra', url: 'javascript:alert(1)', popularity: 2000 }]}
        pageType="article"
      />
    );
    // Pega todos os links e filtra o da listagem (não o do SupportBanner)
    const links = container.querySelectorAll('.listing-item a');
    const link = links[0];
    expect(link.getAttribute('href')).not.toBe('javascript:alert(1)');
    // Deve apontar para o fallback /cifra/
    expect(link.getAttribute('href')).toBe('/cifra/');
  });
});
