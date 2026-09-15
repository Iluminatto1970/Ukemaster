// src/components/__tests__/security/xss-content.test.js
import React from 'react';
import { render } from '@testing-library/react';
import Listing from '../../components/Listing';
import { encodeEntities } from '../../utils/sanitize';

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
    const link = container.querySelector('a');
    expect(link.getAttribute('href')).not.toBe('javascript:alert(1)');
    // Deve apontar para um caminho válido (fallback previsto no componente)
    expect(link.getAttribute('href')).toMatch(/^\/cifra\//);
  });
});
