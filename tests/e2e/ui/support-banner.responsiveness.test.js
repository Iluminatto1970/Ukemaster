// tests/e2e/ui/support-banner.responsiveness.test.js
import { test, expect, describe } from '@playwright/test';

describe('SupportBanner UI Responsiveness', () =>
  {
  test('mobile layout has correct background color and visibility', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.setViewportSize({ width: 375, height: 667 });
    const banner = page.locator('.support-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('background-color', 'rgb(255, 204, 0)'); // #ffcc00
    await expect(page.locator('text=Apoie o Ukemaster Pro')).toBeVisible();
  });

  test('desktop layout renders banner with same color', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.setViewportSize({ width: 1440, height: 900 });
    const banner = page.locator('.support-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('background-color', 'rgb(255, 204, 0)');
    await expect(page.locator('text=Apoie o Ukemaster Pro')).toBeVisible();
  });
});
