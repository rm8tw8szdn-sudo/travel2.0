import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAcceptedRouteRepository, createRouteSearchCache, createRouteSearchService } from "../src/lib/routes/index.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-search-acceptance-gate-"));

function route(overrides = {}) {
  return {
    id: "generated-iceland-v2",
    name: "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e\u8def\u7ebf",
    canonicalTitle: "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e\u8def\u7ebf",
    summary: "\u4ece\u96f7\u514b\u96c5\u672a\u514b\u524d\u5f80\u9ec4\u91d1\u5708\u7684\u51ac\u5b63\u81ea\u9a7e\u8def\u7ebf\u3002",
    recommendationText: "\u9002\u5408\u51ac\u5b63\u81ea\u9a7e\u4e0e\u6781\u5149\u89c2\u6d4b\u3002",
    countryEntities: [{ wikidataId: "Q189", countryCode: "IS", name: "\u51b0\u5c9b" }],
    destinationEntities: [
      { wikidataId: "Q1764", name: "\u96f7\u514b\u96c5\u672a\u514b", countryCode: "IS" },
      { wikidataId: "Q208177", name: "\u9ec4\u91d1\u5708", countryCode: "IS" },
    ],
    countries: ["IS"],
    destinations: ["\u96f7\u514b\u96c5\u672a\u514b", "\u9ec4\u91d1\u5708"],
    recommendedDays: "8\u5929",
    durationDays: 8,
    themes: ["\u6781\u5149"],
    tags: ["\u81ea\u9a7e"],
    themeEvidence: [{
      sourceType: "verified-evidence",
      evidenceId: "verified-iceland-road-trip",
      theme: "self-drive",
      structureType: "road-trip",
    }],
    source: { name: "Planner", url: "" },
    sourceType: "planner-designed",
    destinationSource: "knowledge-graph",
    designStrategies: ["Geographic", "Efficiency"],
    enrichmentStatus: "enriched",
    contentQualityStatus: "accepted",
    classification: "single",
    ...overrides,
  };
}

function createRepository() {
  const records = [];
  let upsertCalls = 0;
  return {
    list() { return { records: structuredClone(records) }; },
    upsert(record) {
      upsertCalls += 1;
      records.push(structuredClone(record));
      return { accepted: true, record: structuredClone(record) };
    },
    stats() { return { upsertCalls, records: structuredClone(records) }; },
  };
}

function createService(name, generatedRecord) {
  const acceptedRepository = createRepository();
  const searchCache = createRouteSearchCache({
    storagePath: path.join(tempRoot, `${name}-cache.json`),
    reviewPath: path.join(tempRoot, `${name}-review.json`),
  });
  const planner = { async buildCandidates() { return { accepted: [{ record: structuredClone(generatedRecord) }], rejected: [] }; } };
  return {
    acceptedRepository,
    search: createRouteSearchService({
      acceptedRepository,
      searchCache,
      planner,
      env: {
        SEARCH_AUTO_ACCEPT_GENERATED: "true",
        SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
        SEARCH_PLANNER_TIMEOUT_MS: "2000",
      },
    }),
  };
}

const v2Record = route({
  generationVersion: "route-generation-v2-phase1",
  selectedCandidateId: "rc-v2-selected",
  decisionTraceId: "dt-v2-selected",
  intentId: "intent-v2-search",
  v2PublicationStatus: "v2-not-publishable-yet",
});
const v2Harness = createService("v2", v2Record);
const v2Result = await v2Harness.search.search({ query: "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e", limit: 10 });
assert.equal(v2Result.records.length, 1);
assert.equal(v2Result.records[0].searchStatus, "needs-review");
assert.equal(v2Result.records[0].v2PublicationStatus, "v2-not-publishable-yet");
assert.equal(v2Result.records[0].selectedCandidateId, "rc-v2-selected");
assert.equal(v2Harness.acceptedRepository.stats().upsertCalls, 0, "V2 must not auto-accept before Review and Validation exist");

const v2CacheReplay = await v2Harness.search.search({ query: "Iceland winter road trip", limit: 10 });
assert.equal(v2CacheReplay.records[0].searchStatus, "needs-review", "cached V2 records must not replay as accepted");
assert.equal(v2Harness.acceptedRepository.stats().upsertCalls, 0);

const hardGatePath = path.join(tempRoot, "accepted-hard-gate.json");
const hardGateRepository = createAcceptedRouteRepository({ storagePath: hardGatePath });
const hardGateResult = hardGateRepository.upsert(v2Record);
assert.equal(hardGateResult.accepted, false, "Accepted Repository must reject V2 drafts even when called outside Search");
assert.deepEqual(hardGateResult.reasons, ["v2-not-publishable-yet"]);
assert.equal(hardGateRepository.list({ limit: 100 }).records.length, 0);

const startupGatePath = path.join(tempRoot, "accepted-startup-hard-gate.json");
fs.writeFileSync(startupGatePath, JSON.stringify({ schemaVersion: 2, records: [v2Record] }, null, 2), "utf8");
const startupGateRepository = createAcceptedRouteRepository({ storagePath: startupGatePath });
assert.equal(startupGateRepository.list({ limit: 100 }).records.length, 0, "startup loading must skip persisted V2 drafts before normalization can strip markers");

const legacyHarness = createService("legacy", route({ id: "generated-iceland-legacy" }));
const legacyResult = await legacyHarness.search.search({ query: "\u51b0\u5c9b\u51ac\u5b63\u81ea\u9a7e", limit: 10 });
assert.equal(legacyResult.records[0].searchStatus, "needs-review", "legacy generation must not auto-accept a season claim without structured evidence");
assert.equal(legacyHarness.acceptedRepository.stats().upsertCalls, 0);

console.log(JSON.stringify({
  status: "PASS",
  v2Status: v2Result.records[0].searchStatus,
  v2PublicationStatus: v2Result.records[0].v2PublicationStatus,
  v2AcceptedWrites: v2Harness.acceptedRepository.stats().upsertCalls,
  acceptedRepositoryHardGate: true,
  cacheReplayStatus: v2CacheReplay.records[0].searchStatus,
  legacyStatus: legacyResult.records[0].searchStatus,
  legacyAcceptedWrites: legacyHarness.acceptedRepository.stats().upsertCalls,
  tempRoot,
}, null, 2));
