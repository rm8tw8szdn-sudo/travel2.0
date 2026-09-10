const { test: base, expect } = require('@playwright/test');

const ROUTES = '/travel-collection/routes.html';
const API = '/api/routes/discovery';

function record(index, { single = false } = {}) {
  const name = `${single ? '东京街区' : '巴黎伦敦'}文化漫游 ${index}`;
  const countryEntities = single
    ? [{ countryCode: 'JP', name: '日本' }]
    : [{ countryCode: 'FR', name: '法国' }, { countryCode: 'GB', name: '英国' }];
  const destinationEntities = single
    ? [{ entityId: 'city-5a21732f861ff7f1', wikidataId: 'Q1490', name: '东京', countryCode: 'JP' }]
    : [
      { entityId: 'city-32da4cad2757df97', wikidataId: 'Q90', name: '巴黎', countryCode: 'FR' },
      { entityId: 'city-eba7cc78f607d814', wikidataId: 'Q84', name: '伦敦', countryCode: 'GB' },
    ];
  return {
    id: `browser-${single ? 'single' : 'cross'}-${index}`,
    name, canonicalTitle: name,
    summary: `浏览器验收固定路线 ${index}，沿城市街巷体验建筑与文化。`,
    recommendationText: `路线 ${index} 串联城市街区与博物馆，保留充足的步行时间。`,
    countries: countryEntities.map(item => item.name), countryEntities,
    destinations: destinationEntities.map(item => item.name), destinationEntities,
    durationDays: 7, recommendedDays: '7天', bestMonths: ['5月', '6月'],
    themes: ['文化'], highlights: ['城市街区', '建筑与博物馆'],
    source: { name: 'Browser acceptance fixture', url: `https://example.test/routes/${index}` },
    contentQualityStatus: 'accepted', searchStatus: 'accepted', v2PublicationStatus: 'ready-for-display',
  };
}

function cursor(offset) {
  return Buffer.from(JSON.stringify({
    version: 1, provider: 'accepted-repository', orderVersion: 3,
    sessionHash: 123, filterHash: 456, randomRank: 4294967295, id: `cursor-${offset}`, offset,
  })).toString('base64url');
}

async function disableBootstrap(page) {
  await page.route('**/route-feed-bootstrap.js*', route => route.fulfill({
    contentType: 'text/javascript', body: 'window.__ROUTE_FEED_BOOTSTRAP = null;',
  }));
}

async function mockDiscovery(page, { total = 33, failFeed = false, failDetail = false, failOffset = null } = {}) {
  const state = { requests: [], failFeed, failDetail, failOffset, emptySearch: false };
  await disableBootstrap(page);
  await page.route(`**${API}`, async route => {
    const input = route.request().postDataJSON();
    state.requests.push(input);
    const detail = input.mode === 'detail' || input.mode === 'search-detail';
    const offset = input.cursor ? JSON.parse(Buffer.from(input.cursor, 'base64url')).offset : 0;
    if ((detail && state.failDetail) || (!detail && (state.failFeed || offset === state.failOffset))) {
      return route.fulfill({ status: 503, json: { ok: false, error: { message: 'Browser fixture failure' } } });
    }
    const single = input.mode === 'search' || String(input.routeId || '').includes('-single-');
    if (detail) {
      const index = Number(input.routeId.split('-').at(-1));
      return route.fulfill({ json: { ok: true, record: record(index, { single }) } });
    }
    const count = input.mode === 'search' ? (state.emptySearch ? 0 : 6) : total;
    const records = Array.from({ length: Math.min(6, Math.max(0, count - offset)) }, (_, i) => record(offset + i + 1, { single }));
    const hasMore = offset + records.length < count;
    return route.fulfill({ json: {
      ok: true, records, hasMore, nextCursor: hasMore ? cursor(offset + records.length) : null,
      repositoryVersion: 'browser-fixtures-v1', cacheStatus: 'MISS', pending: false,
      queryId: input.mode === 'search' ? 'browser-query' : null,
    } });
  });
  return state;
}

// Keep unknown browser errors visible; individual tests opt in only to precise injected failures.
const test = base.extend({
  browserAudit: [async ({ page }, use, testInfo) => {
    const audit = { pageErrors: [], consoleErrors: [], failedResponses: [], failedRequests: [], externalRequests: [], allowed: [] };
    page.on('pageerror', error => audit.pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') audit.consoleErrors.push({ text: message.text(), url: message.location().url });
    });
    page.on('response', response => {
      if (response.status() >= 400) audit.failedResponses.push({ status: response.status(), url: response.url() });
    });
    page.on('requestfailed', request => {
      // Normal navigation cancels prefetch requests; other failures must be explained by the test.
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') audit.failedRequests.push(request.url());
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') {
        audit.externalRequests.push(url.href);
        return route.abort();
      }
      return route.fallback();
    });
    await use(audit);
    await testInfo.attach('browser-audit', { body: JSON.stringify({ ...audit, allowed: audit.allowed.map(pattern => String(pattern)) }, null, 2), contentType: 'application/json' });
    if (page.url().startsWith('http://127.0.0.1')) {
      const screenshotPath = testInfo.outputPath('page.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach('browser-screen', { path: screenshotPath, contentType: 'image/png' });
    }
    const allowed = value => audit.allowed.some(pattern => pattern.test(value));
    expect(audit.pageErrors, 'uncaught page errors').toEqual([]);
    expect(audit.externalRequests, 'unexpected external network access').toEqual([]);
    expect(audit.consoleErrors.filter(item => !allowed(`${item.text} ${item.url}`)), 'unexpected console errors').toEqual([]);
    expect(audit.failedResponses.filter(item => !allowed(item.url)), 'unexpected failed responses').toEqual([]);
    expect(audit.failedRequests.filter(url => !allowed(url)), 'unexpected failed requests').toEqual([]);
  }, { auto: true }],
});

async function expectLoadedImages(page, selector = '[data-route-card] img') {
  await expect.poll(() => page.locator(selector).evaluateAll(images => images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
}

module.exports = { test, expect, ROUTES, API, record, mockDiscovery, disableBootstrap, expectLoadedImages };
