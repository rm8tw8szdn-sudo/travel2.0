import assert from "node:assert/strict";
import { createInMemoryTtlCache } from "../src/lib/routes/cache.mjs";
import { normalizeDiscoveredRoutes } from "../src/lib/routes/contracts.mjs";
import { createRouteDiscovery } from "../src/lib/routes/discovery.mjs";
import { createRouteMediaService } from "../src/lib/routes/media-service.mjs";

const source = (path) => ({ name: "Wikivoyage", url: `https://en.wikivoyage.org/wiki/${path}` });
const asset = (id, scope) => ({
  provider: "wikimedia-commons",
  assetId: id,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  imageUrl: `https://upload.wikimedia.org/${id}.jpg`,
  author: "Wikimedia contributor",
  license: "CC BY-SA 4.0",
  width: 1200,
  height: 720,
  scope,
});

{
  let calls = 0;
  const discovery = createRouteDiscovery({
    liveProvider: {
      async discover() { calls += 1; throw new Error("upstream unavailable"); },
      async getById() { return null; },
    },
    cache: createInMemoryTtlCache(),
  });
  const result = await discovery.discover({ mode: "feed", query: "日本", limit: 10, cursor: null, excludeIds: [] });
  assert.equal(result.records.length, 0, "Route Discovery must not use a local catalog when accepted repository has no match");
  assert.equal(result.pending, true);
  assert.match(result.pendingSearchJobId, /^search:/u);
  assert.equal(calls, 0, "User feed/search requests must not call live discovery");
}

{
  let calls = 0;
  const discovery = createRouteDiscovery({
    liveProvider: { async discover() { calls += 1; return { records: [{ id: "online-1", name: "联网路线", canonicalTitle: "联网路线", countryEntities: [{ countryCode: "JP", name: "日本" }], destinationEntities: [{ wikidataId: "Q1", name: "东京", countryCode: "JP" }], source: source("Online_route") }], nextCursor: null, hasMore: false }; } },
    mediaService: { async resolveRouteCover() { throw new Error("路线封面缺失"); } },
    cache: createInMemoryTtlCache(),
  });
  const result = await discovery.discover({ mode: "feed", query: "", limit: 10, cursor: null, excludeIds: [] });
  assert.deepEqual(result.records, []);
  assert.equal(result.pending, true);
  assert.equal(calls, 0, "Feed must not inspect online candidates or try secondary covers in the user request");
}

{
  const base = {
    id: "wikivoyage-100",
    name: "乘火车穿越澳大利亚",
    canonicalTitle: "乘火车穿越澳大利亚",
    sourceTitle: "Across Australia by train",
    source: source("Across_Australia_by_train"),
    summary: "一条横跨澳大利亚的铁路路线。",
    recommendationText: "横贯大陆的铁路旅程串联内陆地貌与沿线城市历史。",
    countryEntities: [{ wikidataId: "Q408", countryCode: "AU", name: "澳大利亚" }],
    destinationEntities: [
      { wikidataId: "Q3130", name: "悉尼", countryCode: "AU" },
      { wikidataId: "Q3141", name: "墨尔本", countryCode: "AU" },
      { wikidataId: "Q5112", name: "阿德莱德", countryCode: "AU" },
    ],
    countries: ["澳大利亚"],
    destinations: ["悉尼", "墨尔本", "阿德莱德"],
    durationDays: 14,
    recommendedDays: "14天",
    bestMonths: ["4-5月", "9-10月"],
    themes: ["铁路旅行"],
    tags: ["铁路旅行"],
    highlights: ["横跨多个州", "长距离铁路体验", "串联主要城市"],
    coverAsset: asset("route-banner", "route"),
    destinationAssets: [asset("sydney", "destination"), asset("melbourne", "destination"), asset("adelaide", "destination")],
  };
  const records = normalizeDiscoveredRoutes([
    base,
    { ...base, id: "wikivoyage-101", name: "澳大利亚铁路穿越线" },
    {
      ...base,
      id: "wikivoyage-102",
      canonicalTitle: "澳大利亚大陆线",
      source: source("Across_Australia_by_train?redirect=1"),
      destinationEntities: [{ wikidataId: "Q3130", name: "悉尼", countryCode: "AU" }],
    },
    {
      ...base,
      id: "wikivoyage-103",
      name: "悉尼铁路城市线",
      canonicalTitle: "悉尼铁路城市线",
      source: source("Australian_rail_journey"),
      destinationEntities: [{ wikidataId: "Q3130", name: "悉尼", countryCode: "AU" }],
      destinations: ["悉尼"],
      destinationAssets: [asset("sydney", "destination")],
    },
    {
      ...base,
      id: "wikivoyage-104",
      name: "澳大利亚铁路纵贯线",
      canonicalTitle: "澳大利亚铁路纵贯线",
      source: source("Australian_train_crossing"),
      destinationEntities: [
        { wikidataId: "Q3141", name: "墨尔本", countryCode: "AU" },
        { wikidataId: "Q5112", name: "阿德莱德", countryCode: "AU" },
      ],
      destinations: ["墨尔本", "阿德莱德"],
      destinationAssets: [asset("melbourne", "destination"), asset("adelaide", "destination")],
    },
  ], 20);
  assert.deepEqual(records.map((record) => record.id), ["wikivoyage-100", "wikivoyage-103", "wikivoyage-104"]);
  assert.equal(records.length, 3, "Only routes with distinct source, title, and destination skeletons should remain");
  assert.equal(records[0].coverAsset.assetId, "route-banner");
  assert.equal(records[0].destinationAssets.length, records[0].destinationEntities.length);
}

{
  const candidates = new Map([
    ["route:route-1", [asset("route-banner", "route")]],
    ["destination:Q1", [asset("city-one", "destination")]],
    ["destination:Q2", [asset("city-two", "destination")]],
  ]);
  const service = createRouteMediaService({
    provider: { async search(input) { return candidates.get(`${input.scope}:${input.cacheId}`) || []; } },
    cache: createInMemoryTtlCache({ ttlMs: 60_000 }),
  });
  const media = await service.resolveRouteMedia({
    id: "route-1",
    canonicalTitle: "日本经典线",
    themes: ["文化旅行"],
    countryEntities: [{ countryCode: "JP", name: "日本" }],
    destinationEntities: [
      { wikidataId: "Q1", name: "东京", countryCode: "JP" },
      { wikidataId: "Q2", name: "京都", countryCode: "JP" },
    ],
  });
  assert.equal(media.coverAsset.assetId, "route-banner");
  assert.deepEqual(media.destinationAssets.map((item) => item.assetId), ["city-one", "city-two"]);
  assert.equal(new Set([media.coverAsset, ...media.destinationAssets].map((item) => item.assetId)).size, 3);

  const incomplete = createRouteMediaService({
    provider: {
      async search(input) {
        return input.scope === "route"
          ? { candidates: [asset("cover", "route")], rejections: [] }
          : { candidates: [], rejections: [{ assetId: "nara-airport", reason: "forbidden-subject" }] };
      },
    },
    cache: createInMemoryTtlCache({ ttlMs: 60_000 }),
  });
  await assert.rejects(
    incomplete.resolveRouteMedia({
      id: "route-missing",
      canonicalTitle: "缺图路线",
      countryEntities: [{ countryCode: "JP", name: "日本" }],
      destinationEntities: [{ wikidataId: "Q404", name: "奈良", countryCode: "JP" }],
    }),
    (error) => error.code === "ROUTE_MEDIA_INCOMPLETE"
      && error.details.missingDestinations.includes("奈良")
      && error.details.rejectedImages.some((item) => item.destinationName === "奈良" && item.reason === "forbidden-subject"),
    "every declared destination must have a dedicated valid image",
  );
}

console.log("Route V2 online-only, dedupe, and mandatory media verification passed.");
