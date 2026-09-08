const { test, expect, ROUTES, API, mockDiscovery, disableBootstrap, expectLoadedImages } = require('./fixtures.cjs');

test('six-card feed appends five batches and stops at the final partial batch', async ({ page }) => {
  const mock = await mockDiscovery(page);
  await page.goto(ROUTES);
  const cards = page.locator('[data-route-card]');
  await expect(cards).toHaveCount(6);
  await expectLoadedImages(page);
  await page.evaluate(() => { window.__firstAcceptanceCard = document.querySelector('[data-route-card]'); });
  for (const count of [12, 18, 24, 30, 33]) {
    await page.mouse.wheel(0, 6000);
    await expect(cards).toHaveCount(count);
  }
  await expect(page.locator('[data-route-feed-state="complete"]')).toBeVisible();
  await expectLoadedImages(page);
  expect(await page.evaluate(() => window.__firstAcceptanceCard === document.querySelector('[data-route-card]'))).toBe(true);
  const ids = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.routeId));
  expect(new Set(ids).size).toBe(33);
  const requestCount = mock.requests.length;
  await page.mouse.wheel(0, 6000);
  await expect.poll(() => page.evaluate(() => window.__routeFeedDebug())).toMatchObject({ hasMore: false, observerActive: false });
  // Observe a full 700ms continuation-poller interval after another real scroll.
  await page.waitForTimeout(900);
  await expect(cards).toHaveCount(33);
  expect(mock.requests.every(input => input.limit === 6 && input.mode === 'feed')).toBe(true);
  expect(mock.requests.length).toBe(requestCount);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('search opens detail, persists a favorite and returns to the query', async ({ page }, testInfo) => {
  const mock = await mockDiscovery(page);
  await page.goto(ROUTES);
  await expect(page.locator('[data-route-card]')).toHaveCount(6);
  await page.locator('[data-route-search]').fill('东京 7天');
  await expect(page.locator('[data-route-tab="single"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-route-card]')).toHaveCount(6);
  await expect(page.locator('[data-route-card]').first()).toContainText('东京街区');
  expect(mock.requests.some(input => input.mode === 'search' && input.query === '东京 7天' && input.limit === 6)).toBe(true);
  await page.locator('[data-route-open="browser-single-1"]').click();
  await expect(page).toHaveURL(/route-detail\.html\?.*id=browser-single-1/);
  await expect(page.locator('[data-route-detail-state="ready"]')).toBeVisible();
  await expect(page.locator('[data-route-name]')).toHaveText('东京街区文化漫游 1');
  await expectLoadedImages(page, '[data-route-cover]');
  expect(await page.locator('[data-route-source]').evaluate(link => (
    link.getBoundingClientRect().right <= link.parentElement.getBoundingClientRect().right
  )), 'long source names must stay inside their metadata column').toBe(true);
  const detailScreenshot = testInfo.outputPath('detail-metadata.png');
  await page.screenshot({ path: detailScreenshot, fullPage: true });
  await testInfo.attach('detail-metadata', { path: detailScreenshot, contentType: 'image/png' });
  await page.locator('[data-route-favorite]').click();
  await expect(page.locator('[data-route-favorite]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('[data-route-detail-state="ready"]')).toBeVisible();
  await expect(page.locator('[data-route-favorite]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-route-back]').first().click();
  await expect(page.locator('[data-route-search]')).toHaveValue('东京 7天');
  await expect(page.locator('[data-route-card]')).toHaveCount(6);
});

test('failed feed request recovers and empty search has an explicit state', async ({ page, browserAudit }) => {
  browserAudit.allowed.push(/\/api\/routes\/discovery/, /Route Discovery load failed.*Browser fixture failure/);
  const mock = await mockDiscovery(page, { failFeed: true });
  await page.goto(ROUTES);
  await expect(page.locator('[data-route-feed-state="error"]')).toBeVisible();
  await expect(page.locator('[data-route-card]')).toHaveCount(0);
  mock.failFeed = false;
  await page.locator('[data-route-feed-refresh]').click();
  await expect(page.locator('[data-route-card]')).toHaveCount(6);
  mock.emptySearch = true;
  await page.locator('[data-route-search]').fill('空结果测试');
  await expect(page.locator('[data-route-feed-state="empty"]')).toBeVisible();
  await expect(page.locator('[data-route-card]')).toHaveCount(0);
});

test('detail failure offers a working retry', async ({ page, browserAudit }) => {
  browserAudit.allowed.push(/\/api\/routes\/discovery/, /Route detail load failed.*Browser fixture failure/);
  const mock = await mockDiscovery(page, { failDetail: true });
  await page.goto('/travel-collection/route-detail.html?id=browser-cross-1');
  await expect(page.locator('[data-route-detail-state="error"]')).toBeVisible();
  mock.failDetail = false;
  await page.locator('[data-route-detail-retry]').click();
  await expect(page.locator('[data-route-detail-state="ready"]')).toBeVisible();
  await expect(page.locator('[data-route-name]')).toHaveText('巴黎伦敦文化漫游 1');
});

test('pagination retry retains previous cards and resumes the failed cursor', async ({ page, browserAudit }) => {
  browserAudit.allowed.push(/\/api\/routes\/discovery/, /Route Discovery load failed.*Browser fixture failure/);
  const mock = await mockDiscovery(page, { total: 18, failOffset: 12 });
  await page.goto(ROUTES);
  const cards = page.locator('[data-route-card]');
  await expect(cards).toHaveCount(6);
  await page.mouse.wheel(0, 6000);
  await expect(cards).toHaveCount(12);
  await page.mouse.wheel(0, 6000);
  await expect(page.locator('[data-route-feed-state="error"]')).toBeVisible();
  await expect(cards).toHaveCount(12);
  const failedCursor = mock.requests.at(-1).cursor;
  mock.failOffset = null;
  await page.locator('[data-route-feed-more]').click();
  await expect(cards).toHaveCount(18);
  expect(mock.requests.at(-1).cursor).toBe(failedCursor);
  expect(new Set(await cards.evaluateAll(nodes => nodes.map(node => node.dataset.routeId))).size).toBe(18);
  await expect(page.locator('[data-route-feed-state="complete"]')).toBeVisible();
});

test('failed local route images use real placeholders without dropping cards', async ({ page, browserAudit }) => {
  const broken = /\/assets\/route-v2-images\//;
  browserAudit.allowed.push(broken);
  await mockDiscovery(page, { total: 6 });
  await page.route('**/assets/route-v2-images/**', route => route.fulfill({ status: 404, body: 'Injected image failure' }));
  await page.goto(ROUTES);
  await expect(page.locator('[data-route-card]')).toHaveCount(6);
  await expectLoadedImages(page);
  for (const image of await page.locator('[data-route-card] img').all()) {
    await expect(image).toHaveAttribute('src', /trip-cover-placeholder\.svg/);
  }
  await page.locator('[data-route-open="browser-cross-1"]').click();
  await expect(page.locator('[data-route-detail-state="ready"]')).toBeVisible();
  await expect(page.locator('[data-route-cover]')).toHaveAttribute('src', /trip-cover-placeholder\.svg/);
  await expectLoadedImages(page, '[data-route-cover]');
  const destinations = page.locator('[data-route-destination]');
  await expect(destinations).toHaveCount(2);
  for (const destination of await destinations.all()) {
    await destination.scrollIntoViewIfNeeded();
    await expect(destination).toHaveAttribute('data-route-destination-media', 'fallback');
    await expect(destination.locator('img')).toHaveAttribute('src', /route-city-placeholder\.svg/);
  }
  await expectLoadedImages(page, '[data-route-destination] img');
});

test('actual server returns published knowledge and an empty isolated repository', async ({ page }) => {
  // Only disable the bundled feed preview; discovery and knowledge requests reach server.js.
  await disableBootstrap(page);
  await page.goto(ROUTES);
  await expect(page.locator('[data-route-feed]')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-route-feed]')).toHaveAttribute('data-feed-status', 'ready');
  await expect(page.locator('[data-route-feed-state="empty"]')).toBeVisible();
  const result = await page.evaluate(async endpoint => {
    const summaryResponse = await fetch('/api/knowledge-entities/summary');
    const feedResponse = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'feed', limit: 6, routeType: 'cross', sessionId: 'browser-real-server' }) });
    return { summaryStatus: summaryResponse.status, summary: await summaryResponse.json(), feedStatus: feedResponse.status, feed: await feedResponse.json() };
  }, API);
  expect(result.summaryStatus).toBe(200);
  expect(result.summary).toMatchObject({ countries: 119, cities: 833, pois: 3963, total: 4915 });
  expect(result.feedStatus).toBe(200);
  expect(result.feed.ok).toBe(true);
  expect(result.feed.records).toEqual([]);
  expect(result.feed.hasMore).toBe(false);
  await expect(page.locator('[data-route-card]')).toHaveCount(0);
});
