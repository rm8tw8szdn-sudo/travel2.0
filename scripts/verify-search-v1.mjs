import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createRouteDiscovery,
  createRouteSearchAnalytics,
  createRouteSearchCache,
  parseSearchIntent,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-search-v1-"));

const jp8 = "\u65e5\u672c8\u5929";
const jp8Alt = "\u65e5\u672c8\u65e5";
const tokyoOsaka = "\u4e1c\u4eac\u5927\u962a";
const jpFirst = "\u65e5\u672c\u7b2c\u4e00\u6b21";
const icelandRoadTrip = "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e";
const turkeyPhoto = "\u571f\u8033\u5176\u70ed\u6c14\u7403\u6444\u5f71";
const china8 = "\u4e2d\u56fd8\u5929";

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

function route(overrides = {}) {
  return {
    id: "accepted-japan-8",
    name: "\u65e5\u672c\u7b2c\u4e00\u6b21 8 \u5929\u7ecf\u5178\u8def\u7ebf",
    canonicalTitle: "\u65e5\u672c\u7b2c\u4e00\u6b21 8 \u5929\u7ecf\u5178\u8def\u7ebf",
    sourceTitle: "Japan first trip itinerary",
    summary: "\u4e32\u8054\u4e1c\u4eac\u3001\u4eac\u90fd\u548c\u5927\u962a\uff0c\u9002\u5408\u7b2c\u4e00\u6b21\u53bb\u65e5\u672c\u7684\u65c5\u884c\u8005\u3002",
    recommendationText: "\u4e1c\u4eac\u3001\u4eac\u90fd\u3001\u5927\u962a\u6784\u6210\u6e05\u6670\u7684\u65e5\u672c\u9996\u6b21\u65c5\u884c\u8def\u7ebf\u3002",
    countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "\u65e5\u672c" }],
    destinationEntities: [
      { wikidataId: "Q1490", name: "\u4e1c\u4eac", countryCode: "JP" },
      { wikidataId: "Q34600", name: "\u4eac\u90fd", countryCode: "JP" },
      { wikidataId: "Q35765", name: "\u5927\u962a", countryCode: "JP" },
    ],
    countries: ["\u65e5\u672c"],
    destinations: ["\u4e1c\u4eac", "\u4eac\u90fd", "\u5927\u962a"],
    recommendedDays: "8\u5929",
    durationDays: 8,
    bestMonths: ["3-5\u6708", "10-11\u6708"],
    themes: ["\u6587\u5316\u65c5\u884c"],
    tags: ["\u5355\u56fd\u8def\u7ebf", "\u7ecf\u5178"],
    highlights: ["\u4e1c\u4eac\u57ce\u5e02\u8857\u533a", "\u4eac\u90fd\u53e4\u90fd\u5bfa\u9662", "\u5927\u962a\u996e\u98df\u6587\u5316"],
    coverAsset,
    source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Japan_itinerary" },
    enrichmentStatus: "enriched",
    contentQualityStatus: "accepted",
    classification: "single",
    sourceType: "planner-designed",
    qualityScore: 0.92,
    travelStyle: "classic-first-trip",
    travelStyleConceptKey: "classic-first-trip",
    designStrategies: ["Geographic", "Efficiency"],
    plannerReason: [{ text: "\u4e1c\u4eac\u3001\u4eac\u90fd\u3001\u5927\u962a\u5f62\u6210\u9996\u6b21\u65e5\u672c\u65c5\u884c\u7684\u7a33\u5b9a\u9aa8\u67b6\u3002", strategy: "Geographic", evidenceIds: [] }],
    ...overrides,
  };
}

const japanVariants = [
  {
    destinations: ["\u4e1c\u4eac", "\u4eac\u90fd", "\u5927\u962a"],
    destinationEntities: [
      { wikidataId: "Q1490", name: "\u4e1c\u4eac", countryCode: "JP" },
      { wikidataId: "Q34600", name: "\u4eac\u90fd", countryCode: "JP" },
      { wikidataId: "Q35765", name: "\u5927\u962a", countryCode: "JP" },
    ],
  },
  {
    destinations: ["\u4e1c\u4eac", "\u954c\u4ed3", "\u7bb1\u6839"],
    destinationEntities: [
      { wikidataId: "Q1490", name: "\u4e1c\u4eac", countryCode: "JP" },
      { wikidataId: "Q200376", name: "\u954c\u4ed3", countryCode: "JP" },
      { wikidataId: "Q847355", name: "\u7bb1\u6839", countryCode: "JP" },
    ],
  },
  {
    destinations: ["\u5927\u962a", "\u5948\u826f", "\u795e\u6237"],
    destinationEntities: [
      { wikidataId: "Q35765", name: "\u5927\u962a", countryCode: "JP" },
      { wikidataId: "Q169134", name: "\u5948\u826f", countryCode: "JP" },
      { wikidataId: "Q48320", name: "\u795e\u6237", countryCode: "JP" },
    ],
  },
  {
    destinations: ["\u672d\u5e4c", "\u5c0f\u6a3d", "\u51fd\u9986"],
    destinationEntities: [
      { wikidataId: "Q37951", name: "\u672d\u5e4c", countryCode: "JP" },
      { wikidataId: "Q39232", name: "\u5c0f\u6a3d", countryCode: "JP" },
      { wikidataId: "Q184893", name: "\u51fd\u9986", countryCode: "JP" },
    ],
  },
  {
    destinations: ["\u91d1\u6cfd", "\u9ad8\u5c71", "\u767d\u5ddd\u4e61"],
    destinationEntities: [
      { wikidataId: "Q200940", name: "\u91d1\u6cfd", countryCode: "JP" },
      { wikidataId: "Q186672", name: "\u9ad8\u5c71", countryCode: "JP" },
      { wikidataId: "Q193206", name: "\u767d\u5ddd\u4e61", countryCode: "JP" },
    ],
  },
  {
    destinations: ["\u798f\u5188", "\u957f\u5d0e", "\u7531\u5e03\u9662"],
    destinationEntities: [
      { wikidataId: "Q26600", name: "\u798f\u5188", countryCode: "JP" },
      { wikidataId: "Q38234", name: "\u957f\u5d0e", countryCode: "JP" },
      { wikidataId: "Q1205823", name: "\u7531\u5e03\u9662", countryCode: "JP" },
    ],
  },
];

const a = parseSearchIntent(jp8);
const b = parseSearchIntent(jp8Alt);
const c = parseSearchIntent("Japan 8 days");
assert.equal(a.intentHash, b.intentHash);
assert.equal(a.intentHash, c.intentHash);
assert.equal(parseSearchIntent(tokyoOsaka).countryCode, "JP");
assert.equal(parseSearchIntent(jpFirst).tripIntent, "first-trip");
assert.equal(parseSearchIntent(icelandRoadTrip).transport, "self-drive");
assert.equal(parseSearchIntent(turkeyPhoto).theme, "\u70ed\u6c14\u7403");
assert.equal(parseSearchIntent(china8).isChinaBlocked, true);
assert.equal(parseSearchIntent("island hopping").countryCode, "", "generic island hopping must not parse as Iceland");

const repository = createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted.json") });
for (let index = 0; index < 6; index += 1) {
  const variant = japanVariants[index];
  assert.equal(repository.upsert(route({
    id: `accepted-japan-8-${index}`,
    name: `\u65e5\u672c\u7b2c\u4e00\u6b21 8 \u5929\u7ecf\u5178\u8def\u7ebf ${index + 1}`,
    canonicalTitle: `\u65e5\u672c\u7b2c\u4e00\u6b21 8 \u5929\u7ecf\u5178\u8def\u7ebf ${index + 1}`,
    destinations: variant.destinations,
    destinationEntities: variant.destinationEntities,
    source: { name: "Wikivoyage", url: `https://en.wikivoyage.org/wiki/Japan_itinerary_${index}` },
  })).accepted, true);
}

const cache = createRouteSearchCache({
  storagePath: path.join(tempDir, "search-cache.json"),
  reviewPath: path.join(tempDir, "review.json"),
  ttlDays: 30,
});
const analyticsPath = path.join(tempDir, "analytics.jsonl");
const analytics = createRouteSearchAnalytics({ storagePath: analyticsPath });

let plannerCalls = 0;
const generated = route({
  id: "generated-iceland-roadtrip",
  name: "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e\u6781\u5149\u8def\u7ebf",
  canonicalTitle: "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e\u6781\u5149\u8def\u7ebf",
  sourceTitle: "Planner generated Iceland winter road trip",
  countryEntities: [{ wikidataId: "Q189", countryCode: "IS", name: "\u51b0\u5c9b" }],
  destinationEntities: [
    { wikidataId: "Q1764", name: "\u96f7\u514b\u96c5\u672a\u514b", countryCode: "IS" },
    { wikidataId: "Q208177", name: "\u9ec4\u91d1\u5708", countryCode: "IS" },
  ],
  countries: ["\u51b0\u5c9b"],
  destinations: ["\u96f7\u514b\u96c5\u672a\u514b", "\u9ec4\u91d1\u5708"],
  themes: ["\u6781\u5149"],
  recommendedDays: "8\u5929",
  durationDays: 8,
  travelStyle: "road-trip",
  travelStyleConceptKey: "road-trip",
  themeEvidence: [{
    sourceType: "verified-evidence",
    evidenceId: "verified-iceland-road-trip",
    theme: "self-drive",
    structureType: "road-trip",
  }],
  classification: "single",
  coverAsset: null,
});
const planner = {
  async buildCandidates() {
    plannerCalls += 1;
    return { accepted: [{ record: generated }], rejected: [] };
  },
};
const discovery = createRouteDiscovery({
  acceptedRepository: repository,
  searchCache: cache,
  searchAnalytics: analytics,
  searchPlanner: planner,
  requestId: () => "query-id",
});

const accepted = await discovery.discover({ mode: "search", query: jp8, limit: 20, sessionId: "s1" });
assert.equal(accepted.records.length, 6);
assert.equal(accepted.records[0].searchStatus, "accepted");
assert.match(accepted.records[0].matchReason, /\u56fd\u5bb6\u5339\u914d/u);
assert.equal(plannerCalls, 0, "accepted results should not call planner when enough for this intent");

const miss = await discovery.discover({ mode: "search", query: icelandRoadTrip, limit: 20, sessionId: "s1" });
assert.equal(miss.records[0].id, "generated-iceland-roadtrip");
assert.equal(miss.records[0].searchStatus, "needs-review", "winter intent without structured season evidence must not be presented as verified");
assert.ok(miss.records[0].coverAsset?.imageUrl, "search-generated route should receive fallback cover media");
assert.equal(plannerCalls, 1);

const cacheHit = await discovery.discover({ mode: "search", query: "Iceland winter road trip", limit: 20, sessionId: "s1" });
assert.equal(cacheHit.records[0].id, "generated-iceland-roadtrip");
assert.equal(plannerCalls, 1, "same normalized intent should use cache instead of regenerating");

const searchDetail = await discovery.discover({
  mode: "search-detail",
  routeId: "generated-iceland-roadtrip",
  source: "search",
  searchSessionId: "s1",
  queryId: miss.queryId,
});
assert.equal(searchDetail.record.id, "generated-iceland-roadtrip");
assert.equal(searchDetail.cacheStatus, "SEARCH_CACHE");

let rejectedPlannerCalls = 0;
const fallbackDiscovery = createRouteDiscovery({
  acceptedRepository: createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted-fallback.json") }),
  searchCache: createRouteSearchCache({ storagePath: path.join(tempDir, "fallback-cache.json"), reviewPath: path.join(tempDir, "fallback-review.json") }),
  searchAnalytics: createRouteSearchAnalytics({ storagePath: path.join(tempDir, "fallback-analytics.jsonl") }),
  searchPlanner: {
    async buildCandidates() {
      rejectedPlannerCalls += 1;
      return { accepted: [], rejected: [{ reason: "missing-evidence" }] };
    },
  },
  requestId: () => "fallback-query-id",
});
const fallbackResult = await fallbackDiscovery.discover({ mode: "search", query: icelandRoadTrip, limit: 20, sessionId: "s-fallback" });
assert.equal(rejectedPlannerCalls, 1);
assert.equal(fallbackResult.records.length, 0, "a generic fallback must not impersonate an explicit road-trip route");
assert.equal(fallbackResult.diagnostics.reason, "constraint-conflict");
assert(fallbackResult.diagnostics.constraintConflict.reasonCodes.includes("explicit-theme-mismatch"));

const china = await discovery.discover({ mode: "search", query: china8, limit: 20, sessionId: "s1" });
assert.deepEqual(china.records, []);
assert.equal(plannerCalls, 1, "China intent must not call planner");
assert.ok(china.suggestions.length > 0);

let slowCalls = 0;
const originalTimeout = process.env.SEARCH_PLANNER_TIMEOUT_MS;
process.env.SEARCH_PLANNER_TIMEOUT_MS = "20";
const slowDiscovery = createRouteDiscovery({
  acceptedRepository: createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted-empty.json") }),
  searchCache: createRouteSearchCache({ storagePath: path.join(tempDir, "slow-cache.json"), reviewPath: path.join(tempDir, "slow-review.json") }),
  searchAnalytics: createRouteSearchAnalytics({ storagePath: path.join(tempDir, "slow-analytics.jsonl") }),
  searchPlanner: {
    async buildCandidates() {
      slowCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { accepted: [{ record: generated }], rejected: [] };
    },
  },
  requestId: () => "slow-query-id",
});
const timeoutResult = await slowDiscovery.discover({ mode: "search", query: icelandRoadTrip, limit: 20, sessionId: "s2" });
process.env.SEARCH_PLANNER_TIMEOUT_MS = originalTimeout;
assert.equal(slowCalls, 1);
assert.deepEqual(timeoutResult.records, []);
assert.equal(timeoutResult.diagnostics.plannerTimeout, true);

let abortedPlannerCalls = 0;
const abortedController = new AbortController();
abortedController.abort();
const abortedDiscovery = createRouteDiscovery({
  acceptedRepository: createAcceptedRouteRepository({ storagePath: path.join(tempDir, "accepted-aborted.json") }),
  searchCache: createRouteSearchCache({ storagePath: path.join(tempDir, "aborted-cache.json"), reviewPath: path.join(tempDir, "aborted-review.json") }),
  searchAnalytics: createRouteSearchAnalytics({ storagePath: path.join(tempDir, "aborted-analytics.jsonl") }),
  searchPlanner: {
    async buildCandidates() {
      abortedPlannerCalls += 1;
      return { accepted: [{ record: generated }], rejected: [] };
    },
  },
  requestId: () => "aborted-query-id",
});
const abortedResult = await abortedDiscovery.discover(
  { mode: "search", query: icelandRoadTrip, limit: 20, sessionId: "s3" },
  { abortSignal: abortedController.signal },
);
assert.equal(abortedPlannerCalls, 0, "aborted search must not start planner");
assert.deepEqual(abortedResult.records, []);

const analyticsLines = fs.readFileSync(analyticsPath, "utf8").trim().split(/\n/u).map((line) => JSON.parse(line));
assert.ok(analyticsLines.some((line) => line.type === "search" && line.cacheHit === true));
assert.ok(analyticsLines.some((line) => line.type === "detail-click" && line.routeId === "generated-iceland-roadtrip"));

console.log("Search V1 verified: normalized intent cache, planner budget, China block, detail, abort, analytics.");
