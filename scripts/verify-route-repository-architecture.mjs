import assert from "node:assert/strict";
import {
  createAcceptedRouteRepository,
  createDestinationImageRepository,
  createFeedBuffer,
  createEvidenceRepository,
  createRouteCompositionPlanner,
  createProviderRegistry,
  createRepositoryBuild,
  createRouteJobStore,
  createSearchIndex,
  createTextEnrichmentProvider,
  createDashScopeTextEnrichmentProvider,
  validateCompositionRecord,
  ROUTE_ACCEPTED_POOL_MINIMUMS,
  ROUTE_ACCEPTED_POOL_TARGETS,
  ROUTE_ACCEPTED_POOL_TOTAL_MINIMUM,
  ROUTE_ACCEPTED_POOL_TOTAL_TARGET,
  dedupeRouteRecords,
} from "../src/lib/routes/index.mjs";

const coverAsset = {
  provider: "wikivoyage-pageimage",
  assetId: "kansai-route.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Kansai-route.jpg",
  imageUrl: "https://upload.wikimedia.org/kansai-route.jpg",
  author: "Wikimedia",
  license: "CC BY-SA",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};

const onlineCoverAsset = {
  ...coverAsset,
  title: "Kansai, Japan",
  imageCountryCodes: ["JP"],
  status: "verified",
  semanticStatus: "verified",
  coverStatus: "verified",
  matchEvidence: "JP",
  imageDedupeKey: "kansai-route.jpg",
  dedupeKey: "kansai-route.jpg",
  verifiedAt: "2026-07-20T00:00:00.000Z",
};

function route(overrides = {}) {
  const days = overrides.recommendedDays || "5-7天";
  return {
    id: overrides.id || `wikivoyage-${days}`,
    name: overrides.name || "日本关西古都之旅",
    canonicalTitle: overrides.canonicalTitle || "日本关西古都之旅",
    sourceTitle: overrides.sourceTitle || "Kansai",
    summary: overrides.summary || "串联京都、大阪与奈良，围绕古都寺院、街区漫步和关西城市体验展开。",
    recommendationText: overrides.recommendationText || "京都寺院、大阪街区与奈良古迹构成清晰的关西入门路线。",
    countries: ["日本"],
    countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "日本" }],
    destinations: ["京都", "大阪", "奈良"],
    destinationEntities: [
      { wikidataId: "Q34600", countryCode: "JP", name: "京都" },
      { wikidataId: "Q35765", countryCode: "JP", name: "大阪" },
      { wikidataId: "Q169134", countryCode: "JP", name: "奈良" },
    ],
    recommendedDays: days,
    durationDays: Number(days.match(/\d+/u)?.[0] || 5),
    bestMonths: ["3-5月", "10-11月"],
    themes: ["古都", "文化旅行"],
    tags: ["古都", "文化旅行"],
    highlights: ["漫步京都寺院街区", "体验大阪城市风味", "探访奈良古迹"],
    coverAsset,
    onlineCoverAsset: overrides.onlineCoverAsset === undefined ? onlineCoverAsset : overrides.onlineCoverAsset,
    feedReady: overrides.feedReady ?? true,
    feedReadyAt: overrides.feedReadyAt || "2026-07-20T00:00:00.000Z",
    coverStatus: overrides.coverStatus || "verified",
    source: { name: "Wikivoyage", url: overrides.sourceUrl || "https://en.wikivoyage.org/wiki/Kansai" },
    enrichmentStatus: overrides.enrichmentStatus || "enriched",
    contentQualityStatus: overrides.contentQualityStatus || "accepted",
    classification: "single",
    provenance: overrides.provenance || { providerId: "wikivoyage", sources: [{ providerId: "wikivoyage", url: "https://en.wikivoyage.org/wiki/Kansai" }] },
  };
}

const acceptedRepository = createAcceptedRouteRepository();
const accepted = acceptedRepository.upsert(route());
assert.equal(accepted.accepted, true);
assert.equal(acceptedRepository.list({ limit: 10 }).records.length, 1);
assert.equal(acceptedRepository.upsert(route({ id: "bad", contentQualityStatus: "", name: "经典路线 · 774" })).accepted, false);
assert.equal(acceptedRepository.list({ limit: 10 }).records.length, 1, "Repository must only store accepted records");

const searchIndex = createSearchIndex({ repository: acceptedRepository });
assert.equal(searchIndex.search({ query: "京都", limit: 10 }).records.length, 1);
assert.equal(searchIndex.search({ query: "冷门不存在路线", limit: 10 }).pending, true);
assert.match(searchIndex.search({ query: "冷门不存在路线", limit: 10 }).pendingSearchJobId, /^search:/u);

const buffer = createFeedBuffer({ repository: acceptedRepository, targetSize: 40 });
assert.equal(buffer.page({ limit: 1 }).records[0].id, route().id);
assert.equal(buffer.status().targets.single, ROUTE_ACCEPTED_POOL_TARGETS.single);
assert.equal(buffer.status().targets.cross, ROUTE_ACCEPTED_POOL_TARGETS.cross);
assert.equal(buffer.status().targets.total, ROUTE_ACCEPTED_POOL_TOTAL_TARGET);
assert.equal(buffer.status().minimums.single, ROUTE_ACCEPTED_POOL_MINIMUMS.single);
assert.equal(buffer.status().minimums.cross, ROUTE_ACCEPTED_POOL_MINIMUMS.cross);
assert.equal(buffer.status().minimums.total, ROUTE_ACCEPTED_POOL_TOTAL_MINIMUM);

const destinationImages = createDestinationImageRepository();
const kyotoAsset = {
  provider: "wikimedia-commons",
  assetId: "kyoto.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Kyoto.jpg",
  imageUrl: "https://upload.wikimedia.org/kyoto.jpg",
  author: "Wikimedia",
  license: "CC BY-SA",
  width: 1200,
  height: 800,
  discoveredVia: "destination-wikipedia-pageimage",
};
assert.equal(destinationImages.upsert({ destinationEntityId: "Q34600", canonicalName: "京都", countryCode: "JP", asset: kyotoAsset }).accepted, true);
assert.equal(destinationImages.resolve({ destinationEntityId: "Q34600", canonicalName: "京都", countryCode: "JP" }).asset.imageUrl, kyotoAsset.imageUrl);
assert.equal(destinationImages.upsert({ destinationEntityId: "Q35765", canonicalName: "大阪", countryCode: "JP", asset: kyotoAsset }).accepted, false);

const provider = {
  id: "wikivoyage",
  name: "Wikivoyage",
  capabilities: { discovery: true, search: true, detail: true, imageHints: true, pagination: true, requiresApiKey: false, rateLimit: "public", license: "CC BY-SA" },
  async discover() { return { records: [route()], nextCursor: null, hasMore: false }; },
};
const registry = createProviderRegistry([provider]);
assert.equal(registry.get("wikivoyage").capabilities.discovery, true);
assert.equal(registry.list()[0].id, "wikivoyage");

const evidenceRepository = createEvidenceRepository();
assert.equal(evidenceRepository.ingestRouteRecord(route()).some((item) => item.kind === "destination"), true);
const planner = createRouteCompositionPlanner({ evidenceRepository, acceptedRepository });
assert.equal(Array.isArray((await planner.buildCandidates({ limit: 1 })).accepted), true);
assert.equal(validateCompositionRecord({ ...route(), sourceType: "evidence-composed" }).accepted, false);

const jobs = createRouteJobStore({ now: () => 1000 });
const job = jobs.enqueue({ type: "repository-build", providerId: "wikivoyage", evidenceHash: "hash-1", sourceIdentity: "wikivoyage:Kansai" });
assert.equal(jobs.enqueue({ type: "repository-build", providerId: "wikivoyage", evidenceHash: "hash-1", sourceIdentity: "wikivoyage:Kansai" }).job.id, job.job.id);
jobs.transition(job.job.id, "fetchingEvidence");
jobs.expireOlderThan(999);
assert.equal(jobs.get(job.job.id).status, "fetchingEvidence");

const builder = createRepositoryBuild({
  providerRegistry: registry,
  repository: acceptedRepository,
  jobStore: jobs,
  contentEnricher: {
    async enrich() { return { accepted: true, record: route({ id: "wikivoyage-built", sourceUrl: "https://en.wikivoyage.org/wiki/Kansai_route" }) }; },
  },
});
const buildResult = await builder.runProviderDiscovery({ providerId: "wikivoyage", query: "关西" });
assert.equal(buildResult.accepted.length, 1);

const sameRoute = dedupeRouteRecords([
  route({ id: "a", sourceUrl: "https://en.wikivoyage.org/wiki/Kansai" }),
  route({ id: "b", sourceUrl: "https://en.wikivoyage.org/wiki/Kansai" }),
]);
assert.equal(sameRoute.length, 1);
const durationVariants = dedupeRouteRecords([
  route({ id: "kansai-5", recommendedDays: "5-7天", sourceUrl: "https://example.org/kansai-5" }),
  route({ id: "kansai-10", recommendedDays: "10天", sourceUrl: "https://example.org/kansai-10" }),
]);
assert.equal(durationVariants.length, 1, "Routes with the same title and destination skeleton must collapse even when duration differs");

const dashscope = createDashScopeTextEnrichmentProvider({
  apiKey: "test",
  fetchImpl: async () => new Response("data_inspection", { status: 400 }),
});
await assert.rejects(() => dashscope.enrich({
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Kansai" },
  countryEntities: route().countryEntities,
  destinationEntities: route().destinationEntities,
}), /TEXT_ENRICHMENT_HTTP_400|TEXT_ENRICHMENT_REJECTED/u);

assert.throws(() => createTextEnrichmentProvider({}), /enrich/);
console.log("Route repository architecture invariants verified.");
