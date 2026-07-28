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

const fixedNow = "2026-07-27T10:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-real-user-adversarial-"));
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_REAL_USER_ADVERSARIAL_VERIFIER");
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

function distanceKm(left = {}, right = {}) {
  const values = [left.latitude, left.longitude, right.latitude, right.longitude].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [leftLatitude, leftLongitude, rightLatitude, rightLongitude] = values;
  const radians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = radians(rightLatitude - leftLatitude);
  const deltaLongitude = radians(rightLongitude - leftLongitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(leftLatitude)) * Math.cos(radians(rightLatitude))
    * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

try {
  const repository = createPublishedKnowledgeEntityLayerRepository();
  const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
  const adapter = createKnowledgeEntityLayerPlannerAdapter({ repository });
  const parse = (query) => parseSearchIntent(query, { catalogs, timeIntentEnabled: true });

  assert.deepEqual(parse("巴黎 巴黎 4天").requiredDestinationIds, ["Q90"]);
  assert.deepEqual(
    parse("东京 京 4天").requiredDestinationIds,
    ["Q1490"],
    "ambiguous one-character aliases must not create a phantom city",
  );
  for (const query of ["巴黎 0天", "巴黎 -1天", "巴黎 2.5天", "巴黎 1e3天", "巴黎 999999999999999999999天"]) {
    const intent = parse(query);
    assert.equal(intent.durationDays, null, query);
    assert.equal(intent.invalidDuration, true, query);
    assert.equal(intent.intentMode, "invalid-duration-intent", query);
    assert.equal(intent.failureReason, "invalid-duration", query);
    assert.equal(intent.parseSuccess, false, query);
    assert(intent.durationDiagnostics.some((item) => item.code === "invalid-duration"), query);
  }
  const legacyShape = parseSearchIntent("巴黎 4天", { catalogs, timeIntentEnabled: false });
  assert.equal(Object.hasOwn(legacyShape, "invalidDuration"), false);
  assert.equal(Object.hasOwn(legacyShape, "durationDiagnostics"), false);
  assert.deepEqual(
    parseSearchIntent("东京 京 4天", { catalogs, timeIntentEnabled: false }).normalizedCities,
    ["tokyo"],
    "legacy matching must also ignore ambiguous one-character aliases",
  );
  const acceptedDestinationCatalogFixture = [{
    id: "accepted-destination-catalog-fixture",
    destinationEntities: [
      { wikidataId: "Q1741", countryCode: "AT", name: "维也纳", sourceTitle: "Vienna", entityTypeName: "gold-case-anchor" },
      { wikidataId: "Q1781", countryCode: "HU", name: "布达佩斯", sourceTitle: "Budapest", entityTypeName: "town in Hungary" },
      { wikidataId: "Q8717", countryCode: "ES", name: "塞维利亚", sourceTitle: "Seville", entityTypeName: "municipality of Spain" },
    ],
  }];
  const centralEuropeIntent = parseSearchIntent("Prague Vienna Budapest 7 days", {
    acceptedRoutes: acceptedDestinationCatalogFixture,
    catalogs,
    timeIntentEnabled: true,
  });
  assert.deepEqual(centralEuropeIntent.requiredDestinationIds, ["Q1085", "Q1741", "Q1781"]);
  assert.equal(centralEuropeIntent.intentMode, "specified-destination");
  assert.equal(centralEuropeIntent.parseSuccess, true);
  assert.equal(centralEuropeIntent.destinationOrderMode, "flexible");
  const fixedCentralEuropeIntent = parseSearchIntent("Budapest -> Vienna -> Prague 7 days", {
    acceptedRoutes: acceptedDestinationCatalogFixture,
    catalogs,
    timeIntentEnabled: true,
  });
  assert.deepEqual(fixedCentralEuropeIntent.requiredDestinationIds, ["Q1781", "Q1741", "Q1085"]);
  assert.equal(fixedCentralEuropeIntent.destinationOrderMode, "fixed");
  const unresolvedDestinationIntent = parseSearchIntent("Lisbon Seville 4 days", {
    acceptedRoutes: acceptedDestinationCatalogFixture,
    catalogs,
    timeIntentEnabled: true,
  });
  assert.deepEqual(unresolvedDestinationIntent.requiredDestinationIds, ["Q8717"]);
  assert.deepEqual(unresolvedDestinationIntent.unresolvedDestinationNames, ["Lisbon"]);
  assert.equal(unresolvedDestinationIntent.failureReason, "unresolved-destination");
  assert.equal(unresolvedDestinationIntent.parseSuccess, false);

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

  const shortTrip = await service.search({
    query: "2",
    limit: 6,
    sessionId: "real-user-two-day-session",
  });
  assert.equal(shortTrip.records.length, 1, JSON.stringify(shortTrip.diagnostics));
  const shortDestinations = shortTrip.records[0].destinationEntities || [];
  assert(shortDestinations.length >= 1 && shortDestinations.length <= 2);
  if (shortDestinations.length === 2) {
    const distance = distanceKm(shortDestinations[0], shortDestinations[1]);
    assert(Number.isFinite(distance), "a two-day suggestion must use destinations with known coordinates");
    assert(distance <= 180, `two-day suggestion is too dispersed: ${distance.toFixed(1)}km ${JSON.stringify({
      destinations: shortDestinations.map((item) => ({
        id: item.wikidataId || item.entityId,
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
      })),
      destinationSuggestion: shortTrip.diagnostics?.destinationSuggestion,
    })}`);
  }
  assert.equal(shortTrip.records[0].classification, "single");
  assert.equal(shortTrip.records[0].searchStatus, "needs-review");
  assert.equal(shortTrip.records[0].v2PublicationStatus, "v2-not-publishable-yet");
  const shortTripCandidates = candidatePoolStore.listByIntent(shortTrip.records[0].intentId);
  assert.equal(shortTripCandidates.length, 3);
  assert.equal(shortTripCandidates.filter((candidate) => candidate.status === "selected").length, 1);
  assert.equal(shortTripCandidates.filter((candidate) => candidate.status === "rejected").length, 2);
  const shortTripTrace = decisionTraceStore.list().find((trace) => trace.traceId === shortTrip.records[0].decisionTraceId);
  const shortTripEvidence = evidenceBundleStore.getLifecycle(shortTrip.records[0].evidenceBundleId);
  assert.equal(shortTripTrace?.candidateId, shortTrip.records[0].selectedCandidateId);
  assert.equal(shortTripEvidence?.candidateId, shortTrip.records[0].selectedCandidateId);

  const countryOnlyResults = [];
  for (const [query, expectedMonths] of [
    ["日本7天", []],
    ["2月去日本7天", [2]],
    ["February Japan 7 days", [2]],
  ]) {
    const result = await service.search({
      query,
      limit: 6,
      sessionId: `country-scoped-${query}`,
    });
    assert.equal(result.records.length, 1, `${query}: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(result.diagnostics.plannerCalled, true, query);
    assert.equal(
      result.diagnostics.destinationSuggestion?.countryCode,
      "JP",
      `${query}: ${JSON.stringify(result.diagnostics)}`,
    );
    assert.deepEqual(result.intent.timeIntent?.months || [], expectedMonths, query);
    assert.equal(result.records[0].durationDays, 7, query);
    assert.deepEqual(result.records[0].countries, ["JP"], query);
    assert((result.records[0].destinationEntities || []).length >= 2, query);
    assert((result.records[0].destinationEntities || []).length <= 4, query);
    assert.equal(result.records[0].searchStatus, "needs-review", query);
    assert.equal(result.records[0].v2PublicationStatus, "v2-not-publishable-yet", query);
    assert.doesNotMatch(
      result.records[0].recommendationText || "",
      /日均一个主要体验|停留点多，先锁定重点|在给定天数内保留\d+个目的地/u,
      query,
    );
    countryOnlyResults.push({
      query,
      destinations: result.records[0].destinations,
      months: result.intent.timeIntent?.months || [],
    });
  }

  for (const query of ["巴黎 0天", "巴黎 -1天", "巴黎 2.5天", "巴黎 1e3天", "巴黎 999999999999999999999天"]) {
    const result = await service.search({
      query,
      limit: 6,
      sessionId: `invalid-duration-${query}`,
    });
    assert.equal(result.records.length, 0, query);
    assert.equal(result.diagnostics.reason, "invalid-duration", query);
    assert.equal(result.diagnostics.plannerCalled, undefined, query);
  }

  assert.equal(acceptedRepository.list({ limit: 100 }).records.length, 0);
  assert.equal(externalFetchCalls, 0);

  const routesSource = fs.readFileSync(new URL("../routes.js", import.meta.url), "utf8");
  const routeDetailSource = fs.readFileSync(new URL("../route-detail.js", import.meta.url), "utf8");
  const routeDetailHtml = fs.readFileSync(new URL("../route-detail.html", import.meta.url), "utf8");
  assert.match(routesSource, /function\s+activateRouteTab/u);
  assert.match(routesSource, /function\s+autoClassifySearchResults/u);
  assert.match(routesSource, /searchFailureReason\s*===\s*"invalid-duration"/u);
  assert.match(routesSource, /searchFailureReason\s*===\s*"unresolved-destination"/u);
  assert.match(routesSource, /aria-pressed/u);
  assert.match(routeDetailSource, /routeSearchStatus\s*===\s*"needs-review"/u);
  assert.match(routeDetailSource, /季节建议待验证/u);
  assert.match(routeDetailSource, /function\s+routeDetailRecommendationText/u);
  assert.match(routesSource, /function\s+routeLiteraryPhrase/u);
  assert.doesNotMatch(routesSource, /rhythm\s*=\s*"日均一个主要体验"/u);
  assert.match(routeDetailHtml, /data-route-review-notice/u);

  console.log(JSON.stringify({
    status: "PASS",
    shortTrip: {
      destinations: shortDestinations.map((item) => item.canonicalNameEn || item.name),
      distanceKm: shortDestinations.length === 2
        ? Number(distanceKm(shortDestinations[0], shortDestinations[1]).toFixed(1))
        : 0,
    },
    invalidDurationQueries: 5,
    acceptedDestinationCatalog: centralEuropeIntent.requiredDestinationIds,
    fixedDestinationCatalog: fixedCentralEuropeIntent.requiredDestinationIds,
    countryOnlyResults,
    unresolvedDestination: unresolvedDestinationIntent.unresolvedDestinationNames,
    externalFetchCalls,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
