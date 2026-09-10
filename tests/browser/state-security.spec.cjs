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

test('reset query parameters cannot erase travel state', async ({ page }) => {
  await page.goto('/travel-collection/mobile.html');
  await page.evaluate(() => window.TravelState.updateTravelState(state => {
    state.trips = [{
      id: 'state-preservation-trip', name: '必须保留的行程', status: 'upcoming',
      start: '2099.01.01', end: '2099.01.04', countryIds: ['JP'], cityIds: ['JP-TYO'],
    }];
    return state;
  }));

  await page.goto('/travel-collection/mobile.html?reset=empty');
  expect(await page.evaluate(() => window.TravelState.readTravelState().trips.map(trip => trip.id)))
    .toContain('state-preservation-trip');
});

test('malformed city fragments fall back without a page error', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/travel-collection/city-oslo.html#%');
  await expect(page.locator('[data-city-name]')).toHaveText('奥斯陆');
  expect(pageErrors).toEqual([]);
});

test('server rejects internal files and malformed discovery payloads', async ({ request }) => {
  for (const path of [
    '.git/HEAD', '.cache/runtime.json', 'server.js', 'package.json',
    'data/knowledge/raw/knowledge-expansion-batch05-wave1.wikidata.json',
    'data/knowledge/reports/knowledge-expansion-batch09-baseline.json',
    'data/route-v2/images/image-debt-visual-audit.json',
    'data/knowledge/raw/nested/lfs-object.json',
    'data/%2e%2e/server.js', 'data/%252e%252e/server.js',
    'data%2fknowledge%2fraw%2fobject.json',
    'data%252fknowledge%252fraw%252fobject.json',
    'data/%5c..%5cserver.js',
  ]) {
    expect((await request.get(`/travel-collection/${path}`)).status()).toBe(404);
  }
  for (const path of [
    'mobile.html', 'mobile.css', 'travel-state.js',
    'assets/footprint-achievement-ten.svg', 'vendor/d3.min.js',
    'data/countries.zh.json', 'data/countries-50m.json',
  ]) {
    expect((await request.get(`/travel-collection/${path}`)).status(), path).toBe(200);
  }
  for (const data of [null, [], { mode: 'feed', query: { text: '东京' } }]) {
    const response = await request.post('/api/routes/discovery', { data });
    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.error.code).toBe('INVALID_INPUT');
    expect(payload.error.details).toBeUndefined();
  }
});
