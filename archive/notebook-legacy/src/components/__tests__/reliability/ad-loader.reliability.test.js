// src/components/__tests__/reliability/ad-loader.reliability.test.js
import React from 'react';
import { render } from '@testing-library/react';
import AdSenseLoader from '../../AdSenseLoader';

// Mock console.error to silence expected warnings
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Reliability – AdSenseLoader', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not crash when script fails to load', () => {
    // Mock the script creation to throw an error
    const originalCreateElement = document.createElement;
    document.createElement = (tagName) => {
      if (tagName === 'script') {
        const el = originalCreateElement.call(document, tagName);
        // Make appendChild throw when trying to append the script
        const originalAppendChild = el.appendChild;
        el.appendChild = () => {
          throw new Error('Script load error');
        };
        return el;
      }
      return originalCreateElement.call(document, tagName);
    };

    const { unmount } = render(<AdSenseLoader pageType="article" />);
    expect(() => unmount()).not.toThrow();

    // Restore
    document.createElement = originalCreateElement;
  });

  test('gracefully handles missing window.pbjs', () => {
    const originalPbjs = window.pbjs;
    delete window.pbjs;
    const { unmount } = render(<AdSenseLoader pageType="article" />);
    expect(() => unmount()).not.toThrow();
    window.pbjs = originalPbjs;
  });
});
