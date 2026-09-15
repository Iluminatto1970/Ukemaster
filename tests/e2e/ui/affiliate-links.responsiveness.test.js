// tests/e2e/ui/affiliate-links.responsiveness.test.js
import { test, expect, describe } from '@playwright/test';

describe('AffiliateLinks UI Responsiveness', () => {
  test('displays correctly on mobile viewport', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    const banner = page.locator('.affiliate-links');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('display', 'flex');
  });

  test('displays correctly on desktop viewport', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.setViewportSize({ width: 1440, height: 900 });
    const banner = page.locator('.affiliate-links');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('display', 'flex');
  });
});
