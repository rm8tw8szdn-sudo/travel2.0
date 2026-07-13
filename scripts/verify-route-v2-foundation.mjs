import assert from "node:assert/strict";
import {
  createAcceptedRouteRepository,
  createInMemoryTtlCache,
  createRouteDiscovery,
  createRouteDiscoveryHandler,
  normalizeDiscoveryRequest,
} from "../src/lib/routes/index.mjs";

assert.deepEqual(normalizeDiscoveryRequest({ mode: "feed", query: "  日本  ", limit: 99, excludeIds: ["one", "one"], routeType: "single" }), {
  mode: "feed", query: "日本", locale: "zh-CN", limit: 20, cursor: null, sessionId: null, excludeIds: ["one"], routeType: "single",
});

const coverAsset = {
  provider: "wikivoyage-pageimage",
  assetId: "route",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:route.jpg",
  imageUrl: "https://upload.wikimedia.org/route.jpg",
  author: "A",
  license: "CC",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};
const record = {
  id: "wikivoyage-1",
  name: "日本经典文化线",
  canonicalTitle: "日本经典文化线",
  sourceTitle: "Japan itinerary",
  summary: "串联东京、京都和大阪，覆盖现代都市、古都寺院与关西街区。",
  recommendationText: "东京的城市节奏、京都寺院与大阪街区构成清晰的日本入门路线。",
  countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "日本" }],
  destinationEntities: [
    { wikidataId: "Q1490", name: "东京", countryCode: "JP" },
    { wikidataId: "Q34600", name: "京都", countryCode: "JP" },
    { wikidataId: "Q35765", name: "大阪", countryCode: "JP" },
  ],
  countries: ["日本"],
  destinations: ["东京", "京都", "大阪"],
  recommendedDays: "7天",
  durationDays: 7,
  bestMonths: ["3-5月", "10-11月"],
  themes: ["文化旅行"],
  tags: ["单国路线"],
  highlights: ["东京城市街区", "京都古都寺院", "大阪饮食文化"],
  coverAsset,
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Japan_itinerary" },
  enrichmentStatus: "enriched",
  contentQualityStatus: "accepted",
  classification: "single",
};
const destinationAssets = record.destinationEntities.map((item, index) => ({
  provider: "wikimedia-commons",
  assetId: `d${index}`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:d${index}.jpg`,
  imageUrl: `https://upload.wikimedia.org/d${index}.jpg`,
  author: "A",
  license: "CC",
  width: 1200,
  height: 720,
  discoveredVia: "destination-wikipedia-pageimage",
  destinationId: item.wikidataId,
  destinationName: item.name,
}));

const repository = createAcceptedRouteRepository();
assert.equal(repository.upsert(record).accepted, true);
const backgroundTasks = [];
let destinationMediaCalls = 0;
const discovery = createRouteDiscovery({
  acceptedRepository: repository,
  mediaService: {
    async resolveDestinationMedia() {
      destinationMediaCalls += 1;
      return { destinationAssets, diagnostics: { missingDestinations: [], rejected: [] } };
    },
  },
  cache: createInMemoryTtlCache({ ttlMs: 60_000 }),
  requestId: () => "request-id",
});

const feed = await discovery.discover({ mode: "feed", query: "", limit: 8, cursor: null, routeType: "single", excludeIds: [] });
assert.equal(feed.cacheStatus, "REPOSITORY");
assert.equal(feed.records.length, 1);
assert.equal(feed.records[0].id, record.id);
assert.equal(feed.records[0].destinationAssets.length, 0, "Feed must not require destination media");
assert.equal(feed.diagnostics.source, "accepted-repository");
assert.equal(feed.diagnostics.liveSuccess, false, "Feed must not run live discovery");
assert.equal(feed.pending, true, "low accepted pool should enqueue refill without blocking the response");
assert(feed.pendingJobIds.some((id) => id.includes("feed-refill")));
assert.equal(feed.poolStatus.single, 1);
assert.equal(feed.poolStatus.meetsMinimum, false);

const searchMiss = await discovery.discover({ mode: "feed", query: "冷门不存在路线", limit: 8, cursor: null, routeType: "single", excludeIds: [] });
assert.deepEqual(searchMiss.records, []);
assert.equal(searchMiss.pending, true);
assert.match(searchMiss.pendingSearchJobId, /^search:/u);
assert.equal(searchMiss.diagnostics.source, "accepted-repository");
const searchBuiltRecord = {
  ...record,
  id: "wikivoyage-search-built",
  name: "冷门不存在路线测试行程",
  canonicalTitle: "冷门不存在路线测试行程",
  summary: "串联东京、京都和大阪，验证搜索后台任务写入后的路线回流。",
  recommendationText: "搜索后台任务完成后，这条合格路线可以被再次搜索直接命中。",
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Search_built_route" },
};
assert.equal(repository.upsert(searchBuiltRecord).accepted, true);
const searchVisible = await discovery.discover({ mode: "feed", query: "冷门不存在路线", limit: 8, cursor: null, routeType: "single", excludeIds: [] });
assert.equal(searchVisible.records[0].id, searchBuiltRecord.id, "A completed search build job must become visible through Accepted Repository search");

const detail = await discovery.discover({ mode: "detail", routeId: record.id }, { waitUntil(task) { backgroundTasks.push(task); } });
assert.equal(detail.record.id, record.id);
assert.equal(detail.record.enrichmentStatus, "enriched");
assert.deepEqual(detail.diagnostics.missingDestinations, record.destinationEntities.map((item) => item.name));
assert.equal(destinationMediaCalls, 0, "Detail must not synchronously call destination media");
await Promise.all(backgroundTasks);
assert.equal(destinationMediaCalls, 1, "Destination media should run as a background job");
const mediaReady = await discovery.discover({ mode: "detail", routeId: record.id });
assert.equal(mediaReady.record.enrichmentStatus, "mediaReady");
assert.equal(mediaReady.record.destinationAssets.length, 3);
assert.deepEqual(mediaReady.diagnostics.missingDestinations, []);

const missing = await discovery.discover({ mode: "feed", query: "", limit: 8, cursor: null, routeType: "cross", excludeIds: [] });
assert.deepEqual(missing.records, []);
assert.equal(missing.pending, true);
assert.equal(missing.cacheStatus, "EMPTY");

const response = await createRouteDiscoveryHandler({ discovery })(new Request("https://example.test/api/routes/discovery", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "detail", routeId: record.id }),
}));
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.record.name, "日本经典文化线");
assert.equal(payload.diagnostics.source, "accepted-repository");

console.log("Route V2 foundation verified: repository-only feed/search/detail, pool diagnostics, and async mediaReady upgrade.");
