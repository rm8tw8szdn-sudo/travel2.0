const { test, expect } = require('@playwright/test');

test('trip names render as text on the home page', async ({ page }) => {
  const payload = '<img src=x onerror="window.__auditExecuted=1">';
  await page.goto('/travel-collection/trips.html');
  await page.locator('[data-new-trip]').click();
  await page.locator('[data-trip-name-input]').fill(payload);
  await page.locator('[data-trip-start-input]').fill('2099.01.01');
  await page.locator('[data-trip-end-input]').fill('2099.01.04');
  await page.locator('[data-trip-step="1"] [data-trip-next]').click();
  await page.locator('[data-place-suggestion="日本"]').click();
  await page.locator('[data-trip-step="2"] [data-trip-next]').click();
  await page.locator('[data-create-trip]').click();

  await page.goto('/travel-collection/mobile.html');
  await expect(page.getByText(payload, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__auditExecuted === true)).toBe(false);
});
