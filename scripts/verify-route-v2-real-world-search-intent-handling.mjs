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

const fixedNow = "2026-07-28T09:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-real-world-intent-"));
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_REAL_WORLD_INTENT_VERIFIER");
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

function parserFixtureCatalogs(baseCatalogs) {
  return {
    ...baseCatalogs,
    cities: [
      ...(baseCatalogs.cities || []),
      {
        label: "Vienna",
        normalizedLabel: "vienna",
        countryCode: "AT",
        aliases: ["Vienna", "维也纳"],
        entityId: "fixture-city-vienna",
        wikidataId: "Q1741",
      },
      {
        label: "Budapest",
        normalizedLabel: "budapest",
        countryCode: "HU",
        aliases: ["Budapest", "布达佩斯"],
        entityId: "fixture-city-budapest",
        wikidataId: "Q1781",
      },
    ],
  };
}

try {
  const repository = createPublishedKnowledgeEntityLayerRepository();
  const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
  const delimiterCatalogs = parserFixtureCatalogs(catalogs);
  const expectedFlexibleOrder = ["Q1085", "Q1741", "Q1781"];

  for (const query of [
    "布拉格 维也纳 布达佩斯 7天",
    "布拉格、维也纳、布达佩斯 7天",
    "布拉格，维也纳，布达佩斯 7天",
    "布拉格,维也纳,布达佩斯 7天",
    "布拉格/维也纳/布达佩斯 7天",
    "布拉格维也纳布达佩斯7天",
  ]) {
    const intent = parseSearchIntent(query, {
      catalogs: delimiterCatalogs,
      timeIntentEnabled: true,
    });
    assert.deepEqual(intent.requiredDestinationIds, expectedFlexibleOrder, query);
    assert.equal(intent.destinationOrderMode, "flexible", query);
  }

  for (const query of [
    "布达佩斯→维也纳→布拉格 7天",
    "布达佩斯 -> 维也纳 -> 布拉格 7天",
    "先布达佩斯再维也纳最后布拉格 7天",
  ]) {
    const intent = parseSearchIntent(query, {
      catalogs: delimiterCatalogs,
      timeIntentEnabled: true,
    });
    assert.deepEqual(intent.requiredDestinationIds, ["Q1781", "Q1741", "Q1085"], query);
    assert.equal(intent.destinationOrderMode, "fixed", query);
  }

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
    knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository }),
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

  const countryQueries = [
    { query: "日本7天", months: [] },
    { query: "2月去日本7天", months: [2] },
    { query: "February Japan 7 days", months: [2] },
  ];
  const countryResults = [];
  for (const sample of countryQueries) {
    const result = await service.search({
      query: sample.query,
      limit: 6,
      sessionId: "equivalent-japan-intent-session",
    });
    assert.equal(result.records.length, 1, `${sample.query}: ${JSON.stringify(result.diagnostics)}`);
    const record = result.records[0];
    assert.equal(record.classification, "single", sample.query);
    assert.deepEqual(record.countries, ["JP"], sample.query);
    assert.equal(record.durationDays, 7, sample.query);
    assert.deepEqual(result.intent.timeIntent?.months || [], sample.months, sample.query);
    assert.equal(result.diagnostics.plannerCalled, true, sample.query);
    assert.equal(result.diagnostics.destinationSuggestion?.countryCode, "JP", sample.query);
    assert.equal(record.searchStatus, "needs-review", sample.query);
    assert.equal(record.v2PublicationStatus, "v2-not-publishable-yet", sample.query);
    assert.doesNotMatch(
      record.recommendationText || "",
      /日均一个主要体验|停留点多，先锁定重点|在给定天数内保留\d+个目的地/u,
      sample.query,
    );
    const candidates = candidatePoolStore.listByIntent(record.intentId);
    assert.equal(candidates.length, 3, sample.query);
    assert.equal(candidates.filter((candidate) => candidate.status === "selected").length, 1, sample.query);
    assert.equal(candidates.filter((candidate) => candidate.status === "rejected").length, 2, sample.query);
    countryResults.push({ query: sample.query, record, candidates });
  }

  const equivalentChinese = countryResults[1];
  const equivalentEnglish = countryResults[2];
  assert.equal(
    equivalentChinese.candidates[0].routeIntentFingerprint,
    equivalentEnglish.candidates[0].routeIntentFingerprint,
    "equivalent language forms must preserve the same hard-constraint fingerprint",
  );
  assert.notEqual(
    equivalentChinese.record.intentId,
    equivalentEnglish.record.intentId,
    "raw-query snapshots must use isolated Candidate storage identities",
  );
  assert.equal(
    new Set([...equivalentChinese.candidates, ...equivalentEnglish.candidates].map((candidate) => candidate.candidateId)).size,
    6,
    "equivalent expressions must not collide in physical Candidate records",
  );
  const equivalentEnglishReplay = await service.search({
    query: "February Japan 7 days",
    limit: 6,
    sessionId: "equivalent-japan-intent-session",
  });
  assert.equal(equivalentEnglishReplay.records.length, 1);
  assert.equal(equivalentEnglishReplay.diagnostics.cacheHit, true);
  assert.equal(equivalentEnglishReplay.diagnostics.plannerCalled, false);
  assert.equal(
    candidatePoolStore.listByIntent(equivalentEnglish.record.intentId).length,
    3,
    "an exact-query cache replay must not append duplicate Candidate records",
  );

  const changedConstraint = await service.search({
    query: "日本8天",
    limit: 6,
    sessionId: "equivalent-japan-intent-session",
  });
  assert.equal(changedConstraint.records.length, 1, JSON.stringify(changedConstraint.diagnostics));
  assert.notEqual(
    changedConstraint.records[0].routeIntentFingerprint,
    equivalentChinese.record.routeIntentFingerprint,
    "different exact-day constraints must remain different intents",
  );

  const crossResult = await service.search({
    query: "阿姆斯特丹 巴黎 5天",
    limit: 6,
    sessionId: "cross-classification-session",
  });
  assert.equal(crossResult.records.length, 1, JSON.stringify(crossResult.diagnostics));
  assert.equal(crossResult.records[0].classification, "cross");
  assert.deepEqual(
    new Set(crossResult.records[0].countryEntities.map((country) => country.countryCode)),
    new Set(["NL", "FR"]),
  );

  assert.equal(acceptedRepository.list({ limit: 100 }).records.length, 0);
  assert.equal(externalFetchCalls, 0);

  console.log(JSON.stringify({
    verifier: "route-v2-real-world-search-intent-handling",
    status: "PASS",
    countryQueries: countryResults.map(({ query, record }) => ({
      query,
      intentId: record.intentId,
      classification: record.classification,
      destinations: record.destinationEntities.map((destination) => destination.canonicalNameEn || destination.name),
    })),
    changedConstraintFingerprint: changedConstraint.records[0].routeIntentFingerprint,
    separatorVariants: 6,
    fixedOrderVariants: 3,
    externalFetchCalls,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
