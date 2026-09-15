// src/components/__tests__/reliability/ad-loader.reliability.test.js
import React from 'react';
import { render } from '@testing-library/react';
import AdSenseLoader from '../../components/AdSenseLoader';

// Mock console.error to silence expected warnings
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Reliability – AdSenseLoader', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not crash when script fails to load', () => {
    const originalAppendChild = document.body.appendChild;
    document.body.appendChild = () => {
      throw new Error('Script load error');
    };
    const { unmount } = render(<AdSenseLoader pageType="article" />);
    expect(() => unmount()).not.toThrow();
    document.body.appendChild = originalAppendChild;
  });

  test('gracefully handles missing window.pbjs', () => {
    const originalPbjs = window.pbjs;
    delete window.pbjs;
    const { unmount } = render(<AdSenseLoader pageType="article" />);
    expect(() => unmount()).not.toThrow();
    window.pbjs = originalPbjs;
  });
});
