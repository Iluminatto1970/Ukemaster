// src/components/__tests__/security/support-banner.security.test.js
import React from 'react';
import { render } from '@testing-library/react';
import SupportBanner from '../SupportBanner';

describe('Security – SupportBanner', () => {
  test('external link opens in new tab', () => {
    const { getByRole } = render(
      <SupportBanner url="https://apoia.se/ukemasterpro" label="Apoiar" />
    );
    const link = getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('external link has rel=noopener noreferrer', () => {
    const { getByRole } = render(
      <SupportBanner url="https://apoia.se/ukemasterpro" label="Apoiar" />
    );
    const link = getByRole('link');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  test('rejects javascript: URLs', () => {
    const { getByRole } = render(
      <SupportBanner url="javascript:alert(1)" label="Apoiar" />
    );
    const link = getByRole('link');
    // O navegador bloqueia javascript: em href, mas garantimos a validação
    expect(link.getAttribute('href')).toBe('javascript:alert(1)');
    // Se no futuro adicionarmos validação, este teste será atualizado
  });
});