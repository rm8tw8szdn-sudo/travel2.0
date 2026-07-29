import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  parseSearchIntent,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-07-27T08:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-cross-country-citywalk-"));
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_CROSS_COUNTRY_CITYWALK_VERIFIER");
};

function memorySearchCache() {
  const byIntent = new Map();
  const byRoute = new Map();
  return {
    get(intent) {
      return structuredClone(byIntent.get(intent.intentHash) || null);
    },
    put(item) {
      byIntent.set(item.intent.intentHash, structuredClone(item));
      for (const record of item.records || []) byRoute.set(record.id, structuredClone(record));
    },
    appendReviewCandidates() {},
    findRoute(routeId) {
      const record = byRoute.get(routeId);
      return record ? { record: structuredClone(record) } : null;
    },
  };
}

function destinationIds(record = {}) {
  return (record.destinationEntities || []).map((item) => item.wikidataId || item.entityId || item.name);
}

try {
  const repository = createPublishedKnowledgeEntityLayerRepository();
  const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
  const adapter = createKnowledgeEntityLayerPlannerAdapter({ repository });

  const crossIntent = parseSearchIntent("阿姆斯特丹 巴黎 5天", {
    catalogs,
    timeIntentEnabled: true,
  });
  assert.deepEqual(crossIntent.requiredDestinationIds, ["Q727", "Q90"]);
  assert.deepEqual(crossIntent.countryCodes, ["NL", "FR"]);
  assert.deepEqual(crossIntent.normalizedRouteIntent.hardConstraints.countries.values, ["FR", "NL"]);

  const italyIntent = parseSearchIntent("罗马 佛罗伦萨 4天", {
    catalogs,
    timeIntentEnabled: true,
  });
  assert.deepEqual(italyIntent.requiredDestinationIds, ["Q220", "Q2044"]);
  assert.deepEqual(italyIntent.countryCodes, ["IT"]);

  const longStayIntent = parseSearchIntent("巴黎120天", {
    catalogs,
    timeIntentEnabled: true,
  });
  assert.equal(longStayIntent.durationDays, 120);
  assert.deepEqual(longStayIntent.requiredDestinationIds, ["Q90"]);

  const env = {
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
  const acceptedRepository = createAcceptedRouteRepository({
    storagePath: path.join(tempRoot, "accepted-routes.json"),
  });
  const candidatePoolStore = createRouteCandidatePoolStore({
    storagePath: path.join(tempRoot, "candidate-pool.jsonl"),
    env,
    now: () => fixedNow,
  });
  const decisionTraceStore = createDecisionTraceStore({
    storagePath: path.join(tempRoot, "decision-traces.jsonl"),
    env,
    now: () => fixedNow,
  });
  const evidenceBundleStore = createEvidenceBundleStore({
    storagePath: path.join(tempRoot, "evidence-bundles.jsonl"),
    env,
    now: () => fixedNow,
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({
      storagePath: path.join(tempRoot, "legacy-route-evidence.json"),
    }),
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    knowledgeGraph: adapter,
    env,
  });
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache: memorySearchCache(),
    planner,
    intentCatalog: catalogs,
    now: () => Date.parse(fixedNow),
    env,
  });

  const crossResult = await service.search({
    query: "阿姆斯特丹 巴黎 5天",
    limit: 6,
    sessionId: "cross-country-session",
  });
  assert.equal(crossResult.records.length, 1, JSON.stringify(crossResult.diagnostics));
  assert.deepEqual(destinationIds(crossResult.records[0]), ["Q727", "Q90"]);
  assert.deepEqual(crossResult.records[0].countryEntities.map((item) => item.countryCode), ["NL", "FR"]);
  assert.equal(crossResult.records[0].classification, "cross");
  assert.equal(crossResult.records[0].searchStatus, "needs-review");
  assert.equal(crossResult.records[0].v2PublicationStatus, "v2-not-publishable-yet");

  const additionalCrossRecords = [];
  for (const testCase of [
    { query: "巴黎 柏林 6天", ids: ["Q90", "Q64"], countries: ["FR", "DE"] },
    { query: "马德里 巴黎 5天", ids: ["Q2807", "Q90"], countries: ["ES", "FR"] },
    { query: "首尔 东京 6天", ids: ["Q8684", "Q1490"], countries: ["KR", "JP"] },
  ]) {
    const result = await service.search({
      query: testCase.query,
      limit: 6,
      sessionId: `cross-${testCase.countries.join("-")}`,
    });
    assert.equal(result.records.length, 1, `${testCase.query}: ${JSON.stringify(result.diagnostics)}`);
    assert.deepEqual(new Set(destinationIds(result.records[0])), new Set(testCase.ids));
    assert.deepEqual(new Set(result.records[0].countryEntities.map((item) => item.countryCode)), new Set(testCase.countries));
    assert.equal(result.records[0].classification, "cross");
    additionalCrossRecords.push(result.records[0]);
  }

  const italyResult = await service.search({
    query: "罗马 佛罗伦萨 4天",
    limit: 6,
    sessionId: "italy-session",
  });
  assert.equal(italyResult.records.length, 1, JSON.stringify(italyResult.diagnostics));
  assert.deepEqual(destinationIds(italyResult.records[0]), ["Q220", "Q2044"]);
  assert.deepEqual(italyResult.records[0].countryEntities.map((item) => item.countryCode), ["IT"]);

  const citywalkRecords = [];
  for (const days of [3, 4, 5, 6, 120]) {
    const result = await service.search({
      query: `巴黎${days}天`,
      limit: 6,
      sessionId: `paris-citywalk-${days}`,
    });
    assert.equal(result.records.length, 1, `${days} days: ${JSON.stringify(result.diagnostics)}`);
    const record = result.records[0];
    citywalkRecords.push(record);
    assert.equal(record.routeReferenceMode, "citywalk");
    assert.equal(record.durationPolicy, "open-ended");
    assert.equal(record.requestedDurationDays, days);
    assert.equal(record.durationDays, days, "exact user duration remains available for hard-constraint validation");
    assert.equal(record.recommendedDays, "不限天数");
    assert.equal(record.canonicalTitle, "巴黎城市漫游｜景点总览");
    assert.deepEqual(record.bestMonths, [], "Citywalk must not claim unverified best months");
    assert.equal(record.searchStatus, "needs-review");
    assert.equal(record.v2PublicationStatus, "v2-not-publishable-yet");
    const cityStops = record.destinationEntities.filter((item) => item.entityTypeName === "city");
    const poiStops = record.destinationEntities.filter((item) => item.entityTypeName === "poi");
    assert.deepEqual(cityStops.map((item) => item.wikidataId), ["Q90"]);
    assert.deepEqual(
      new Set(poiStops.map((item) => item.canonicalNameEn)),
      new Set(["Eiffel Tower", "Louvre Museum", "Musée d'Orsay"]),
    );
    assert.equal(poiStops.length, 3, "all published Paris POIs must be present");
  }
  assert.equal(new Set(citywalkRecords.map((record) => record.id)).size, 1, "the open-ended Citywalk reference must have a stable ID across requested durations");

  for (const record of [crossResult.records[0], ...additionalCrossRecords, italyResult.records[0], ...citywalkRecords]) {
    const candidates = candidatePoolStore.listByIntent(record.intentId);
    const selected = candidates.filter((candidate) => candidate.status === "selected");
    assert.equal(candidates.length, 3);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].candidateId, record.selectedCandidateId);
    assert.deepEqual(selected[0].proposedOrder, destinationIds(record));
    const trace = decisionTraceStore.list().find((item) => item.traceId === record.decisionTraceId);
    assert(trace, `DecisionTrace missing for ${record.id}`);
    assert.equal(trace.candidateId, record.selectedCandidateId);
    assert.equal(trace.routeId, record.id);
    const bundle = evidenceBundleStore.getLifecycle(record.evidenceBundleId);
    assert(bundle, `EvidenceBundle missing for ${record.id}`);
    assert.equal(bundle.candidateId, record.selectedCandidateId);
    assert.equal(bundle.decisionTraceId, record.decisionTraceId);
    assert.equal(bundle.routeRecordId, record.id);
    assert.equal(bundle.sources.length, 0);
  }

  assert.equal(acceptedRepository.list({ limit: 100 }).records.length, 0);
  assert.equal(externalFetchCalls, 0);

  const routesSource = fs.readFileSync(new URL("../routes.js", import.meta.url), "utf8");
  const detailSource = fs.readFileSync(new URL("../route-detail.js", import.meta.url), "utf8");
  assert.match(routesSource, /routeReferenceMode\s*===\s*"citywalk"/u);
  assert.match(routesSource, /不设天数上限/u);
  assert.match(detailSource, /routeReferenceMode\s*===\s*"citywalk"/u);
  assert.match(detailSource, /Route V2 城市漫游/u);

  console.log(JSON.stringify({
    status: "PASS",
    crossCountry: {
      destinations: destinationIds(crossResult.records[0]),
      countries: crossResult.records[0].countryEntities.map((item) => item.countryCode),
    },
    italy: destinationIds(italyResult.records[0]),
    citywalk: {
      routeId: citywalkRecords[0].id,
      title: citywalkRecords[0].canonicalTitle,
      publishedPoiCount: citywalkRecords[0].destinationEntities.filter((item) => item.entityTypeName === "poi").length,
      requestedDurations: citywalkRecords.map((record) => record.requestedDurationDays),
    },
    externalFetchCalls,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
