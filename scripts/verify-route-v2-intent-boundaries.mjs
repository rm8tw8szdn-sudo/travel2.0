import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  attachRouteIntentEnvelope,
  createAcceptedRouteRepository,
  createRouteDiscovery,
  createRouteSearchCache,
  createRouteV2ReadyPool,
  normalizeDiscoveredRoute,
  validateEmbeddedRouteIntent,
} from "../src/lib/routes/index.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-intent-boundaries-"));
const intent = {
  intentMode: "specified-destination",
  requiredDestinationIds: ["Q1490", "Q34600"],
  requiredDestinationNames: ["Tokyo", "Kyoto"],
  destinationOrderMode: "fixed",
  durationDays: 4,
  countryCode: "JP",
  timeIntent: { type: "single-month", months: [2], season: null },
};

function route(id = "intent-bound-route") {
  return {
    id,
    name: "Tokyo to Kyoto",
    canonicalTitle: "Tokyo to Kyoto",
    summary: "A structured route used only by the isolated invariant verifier.",
    recommendationText: "The route preserves its exact requested city order and duration.",
    countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "Japan" }],
    destinationEntities: [
      { wikidataId: "Q1490", name: "Tokyo", countryCode: "JP" },
      { wikidataId: "Q34600", name: "Kyoto", countryCode: "JP" },
    ],
    countries: ["JP"],
    destinations: ["Tokyo", "Kyoto"],
    durationDays: 4,
    recommendedDays: "4 days",
    timeIntent: { type: "single-month", months: [2], season: null },
    evidenceValidationStatus: "ready",
    bestMonths: ["2"],
    themes: ["culture"],
    tags: ["single-country"],
    highlights: ["Tokyo", "Kyoto"],
    coverAsset: {
      provider: "local-static-fallback",
      assetId: "trip-cover-placeholder",
      imageUrl: "assets/trip-cover-placeholder.svg",
      author: "Route V2",
      license: "project-local",
    },
    source: { name: "Invariant verifier", url: "" },
    sourceType: "planner-designed",
    destinationSource: "knowledge-graph",
    enrichmentStatus: "enriched",
    contentQualityStatus: "accepted",
    classification: "single",
    generationVersion: "route-generation-v2-phase1",
    selectedCandidateId: "rc-boundary",
    decisionTraceId: "dt-boundary",
    v2PublicationStatus: "ready-for-display",
  };
}

const valid = attachRouteIntentEnvelope(route(), intent);
assert.equal(validateEmbeddedRouteIntent(valid, { allowLegacyUnbound: false }).matched, true);

let converted = valid;
for (let count = 0; count < 6; count += 1) converted = normalizeDiscoveredRoute(converted);
assert.equal(converted.routeIntentFingerprint, valid.routeIntentFingerprint);
assert.deepEqual(converted.normalizedRouteIntent, valid.normalizedRouteIntent);
assert.equal(validateEmbeddedRouteIntent(converted, { allowLegacyUnbound: false }).matched, true);

const cachePath = path.join(root, "cache", "search-cache.json");
const reviewPath = path.join(root, "cache", "reviews.json");
const cache = createRouteSearchCache({ storagePath: cachePath, reviewPath, now: () => Date.parse("2026-07-27T00:00:00.000Z") });
const written = cache.put({ intent, records: [valid], sourceQuery: "February Tokyo Kyoto 4 days" });
assert(written);
assert.equal(written.records.length, 1);
assert.equal(cache.get(intent)?.records.length, 1);
assert.equal(cache.get({ ...intent, durationDays: 5 }), null, "changed exact days must miss the old fingerprint");
assert.equal(cache.get({ ...intent, timeIntent: { type: "single-month", months: [3], season: null } }), null, "changed month must miss");

const cachePayload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const cacheKey = Object.keys(cachePayload.items)[0];
cachePayload.items[cacheKey].records[0].durationDays = 5;
fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), "utf8");
assert.equal(cache.get(intent), null, "tampered cache record must safe-miss");

fs.writeFileSync(cachePath, JSON.stringify({
  schemaVersion: 1,
  items: {
    legacy: { schemaVersion: 1, expiresAt: "2099-01-01T00:00:00.000Z", records: [route("legacy-cache")] },
  },
}, null, 2), "utf8");
assert.equal(cache.get(intent), null, "old unversioned cache must not replay across a fingerprint boundary");

const readyPath = path.join(root, "ready", "routes.json");
const readyPool = createRouteV2ReadyPool({
  storagePath: readyPath,
  env: { ROUTE_V2_READY_POOL_ENABLED: "true" },
  now: () => "2026-07-27T00:00:00.000Z",
});
const publicationGate = {
  status: "ready-for-display",
  publishable: true,
  routeRecordId: valid.id,
  selectedCandidateId: valid.selectedCandidateId,
  decisionTraceId: valid.decisionTraceId,
  checkedAt: "2026-07-27T00:00:00.000Z",
};
assert.equal(readyPool.applyEvaluation({ routeRecord: valid, publicationGate }).persisted, true);
assert.equal(readyPool.list().length, 1);
const readyPayload = JSON.parse(fs.readFileSync(readyPath, "utf8"));
readyPayload.records[0].routeRecord.destinationEntities.pop();
readyPayload.records[0].routeRecord.destinations.pop();
fs.writeFileSync(readyPath, JSON.stringify(readyPayload, null, 2), "utf8");
assert.equal(readyPool.list().length, 0, "tampered Ready Pool entry must be skipped");
assert(readyPool.diagnostics().some((entry) => entry.type === "ready-pool-route-intent-invalid"));

const acceptedPath = path.join(root, "accepted", "routes.json");
const accepted = createAcceptedRouteRepository({ storagePath: acceptedPath });
const tampered = structuredClone(valid);
tampered.destinationEntities.pop();
tampered.destinations.pop();
const acceptedTampered = {
  ...tampered,
  generationVersion: "",
  v2PublicationStatus: "",
};
const rejected = accepted.upsert(acceptedTampered);
assert.equal(rejected.accepted, false);
assert(rejected.reasons.includes("route-intent-invariant-failed"));

fs.mkdirSync(path.dirname(acceptedPath), { recursive: true });
fs.writeFileSync(acceptedPath, JSON.stringify({ schemaVersion: 2, records: [acceptedTampered] }, null, 2), "utf8");
const reloaded = createAcceptedRouteRepository({ storagePath: acceptedPath });
assert.equal(reloaded.list({ limit: 100 }).records.length, 0, "invalid persisted accepted route must be skipped");

const poolStatus = {
  meetsTarget: true,
  targets: {},
  repositoryVersion: "boundary-v1",
};
const feedBuffer = {
  page() {
    return {
      records: [tampered],
      nextCursor: null,
      hasMore: false,
      returnedCount: 1,
      remainingCount: 0,
      paginationStatus: "exhausted",
    };
  },
  needsRefill() { return false; },
  status() { return poolStatus; },
};
const discovery = createRouteDiscovery({
  acceptedRepository: {
    list() { return { records: [tampered] }; },
    get() { return tampered; },
    status() { return poolStatus; },
    version() { return "boundary-v1"; },
  },
  feedBuffer,
  searchIndex: { search: () => feedBuffer.page() },
  searchService: {
    async search() { return { records: [], nextCursor: null, hasMore: false }; },
    getSearchRoute() { return tampered; },
  },
  searchAnalytics: { logDetailClick() {} },
  requestId: () => "boundary-request",
});

const feed = await discovery.discover({ mode: "feed", limit: 6, sessionId: "boundary-session" });
assert.equal(feed.records.length, 0, "Feed must not expose an invalid bound route");
assert(feed.diagnostics.deferred.some((entry) => entry.stage === "route-intent-invariant"));

await assert.rejects(
  () => discovery.discover({ mode: "detail", routeId: tampered.id }),
  (error) => error?.code === "ROUTE_NOT_FOUND" && error?.status === 404,
);
await assert.rejects(
  () => discovery.discover({ mode: "search-detail", routeId: tampered.id }),
  (error) => error?.code === "ROUTE_NOT_FOUND" && error?.status === 404,
);

const legacyUnbound = route("legacy-unbound");
assert.equal(validateEmbeddedRouteIntent(legacyUnbound, { allowLegacyUnbound: true }).matched, true);
assert.equal(validateEmbeddedRouteIntent(legacyUnbound, { allowLegacyUnbound: false }).matched, false);

console.log(JSON.stringify({
  verifier: "route-v2-intent-boundaries",
  status: "PASS",
  tempRoot: root,
  conversionHops: 6,
  cache: {
    sameFingerprintHit: true,
    changedDaysMiss: true,
    changedMonthMiss: true,
    tamperMiss: true,
    oldSchemaMiss: true,
  },
  readyPool: { validWrite: true, tamperSkipped: true },
  acceptedRepository: { invalidWriteRejected: true, invalidStartupRecordSkipped: true },
  userBoundaries: { feedFiltered: true, detailRejected: true, searchDetailRejected: true },
  legacyUnboundCompatibility: true,
}, null, 2));
