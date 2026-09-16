// src/components/__tests__/SupportBanner.test.js
import React from 'react';
import { render, screen } from '@testing-library/react';
import SupportBanner from '../SupportBanner';

describe('SupportBanner', () => {
  const url = 'https://apoia.se/ukemasterpro';
  const label = 'Apoiar';
  const bgColor = '#ffcc00';

  test('renders with correct background color', () => {
    render(<SupportBanner url={url} label={label} bgColor={bgColor} />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveStyle('background-color: #ffcc00');
  });

  test('displays support message and link', () => {
    render(<SupportBanner url={url} label={label} />);
    expect(screen.getByText(/Apoie o Ukemaster Pro/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Apoiar/i })).toHaveAttribute('href', url);
  });

  test('uses default props when not provided', () => {
    render(<SupportBanner url={url} label={label} />);
    expect(screen.getByRole('banner')).toHaveStyle('background-color: #ffcc00');
    // default label is 'Apoiar no Apoia-se', but when label prop is passed it overrides
    expect(screen.getByRole('link')).toHaveTextContent(label);
  });
});