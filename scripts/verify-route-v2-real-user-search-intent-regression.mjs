import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = path.join(projectRoot, "scripts", "fixtures", "route-v2-real-user-search-intent-matrix.json");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-real-user-intent-"));
const fixedNow = "2026-07-29T12:00:00.000Z";
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;

globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_REAL_USER_SEARCH_INTENT_REGRESSION");
};

function clean(value) {
  return String(value || "").trim();
}

function semanticIntentToken(value) {
  return clean(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "");
}

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

function recordCountryCodes(record = {}) {
  return [...new Set([
    ...(Array.isArray(record.countryEntities) ? record.countryEntities.map((entry) => entry?.countryCode) : []),
    ...(Array.isArray(record.destinationEntities) ? record.destinationEntities.map((entry) => entry?.countryCode) : []),
    ...(Array.isArray(record.countryCodes) ? record.countryCodes : []),
    ...(Array.isArray(record.countries) ? record.countries : []),
  ].map((value) => clean(value).toUpperCase()).filter((value) => /^[A-Z]{2}$/u.test(value)))];
}

function assertParserCase(testCase, intent) {
  const expected = testCase.expected || {};
  const label = `${testCase.id}: ${testCase.query}`;
  if (Object.hasOwn(expected, "parseSuccess")) assert.equal(intent.parseSuccess, expected.parseSuccess, label);
  if (Object.hasOwn(expected, "intentMode")) assert.equal(intent.intentMode, expected.intentMode, label);
  if (Object.hasOwn(expected, "failureReason")) assert.equal(intent.failureReason, expected.failureReason, label);
  if (Object.hasOwn(expected, "countryCode")) assert.equal(intent.countryCode, expected.countryCode, label);
  if (Object.hasOwn(expected, "region")) {
    assert.equal(intent.normalizedRegion, expected.region, label);
    assert(intent.regionCountryCodes.length > 0, `${label}: region must resolve to a bounded country set`);
    assert.equal(
      intent.normalizedRouteIntent.hardConstraints.region.value,
      expected.region,
      label,
    );
  }
  if (Object.hasOwn(expected, "durationDays")) {
    assert.equal(intent.durationDays, expected.durationDays, label);
    assert.equal(intent.normalizedRouteIntent.hardConstraints.exactDays.value, expected.durationDays, label);
  }
  if (Object.hasOwn(expected, "season")) {
    assert.equal(intent.timeIntent?.type, "season-only", label);
    assert.equal(intent.timeIntent?.season, expected.season, label);
  }
  if (Object.hasOwn(expected, "months")) assert.deepEqual(intent.timeIntent?.months || [], expected.months, label);
  if (Object.hasOwn(expected, "travelStyle")) {
    assert.equal(intent.travelStyle, expected.travelStyle, label);
    assert.equal(intent.normalizedRouteIntent.softPreferences.travelStyle, semanticIntentToken(expected.travelStyle), label);
  }
  if (Object.hasOwn(expected, "theme")) {
    assert.equal(intent.themeKey, expected.theme, label);
    assert.equal(intent.normalizedRouteIntent.softPreferences.theme, semanticIntentToken(expected.theme), label);
    assert.equal(intent.normalizedRouteIntent.softPreferences.themeConstraintMode, "explicit", label);
  }
  if (Object.hasOwn(expected, "tripIntent")) {
    assert.equal(intent.tripIntent, expected.tripIntent, label);
    assert.equal(intent.normalizedRouteIntent.softPreferences.tripIntent, semanticIntentToken(expected.tripIntent), label);
  }
  if (Object.hasOwn(expected, "correctionCountryCode")) {
    assert.equal(intent.destinationCorrection?.countryCode, expected.correctionCountryCode, label);
    assert.equal(intent.destinationCorrection?.requiresConfirmation, true, label);
    assert.deepEqual(intent.suggestions, [intent.destinationCorrection.countryName], label);
  }
}

try {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert.equal(matrix.schemaVersion, "route-v2-real-user-search-intent-matrix-v1");
  assert(Array.isArray(matrix.cases) && matrix.cases.length >= 35);
  assert.equal(new Set(matrix.cases.map((entry) => entry.id)).size, matrix.cases.length);
  const routesSource = fs.readFileSync(path.join(projectRoot, "routes.js"), "utf8");
  const searchTimeoutMatch = routesSource.match(/const SEARCH_DISCOVERY_TIMEOUT_MS = ([\d_]+);/u);
  const searchWatchdogMatch = routesSource.match(/const SEARCH_LOAD_WATCHDOG_MS = ([\d_]+);/u);
  assert(searchTimeoutMatch, "search discovery timeout must be explicit");
  assert(searchWatchdogMatch, "search loading watchdog must be explicit");
  const searchTimeoutMs = Number(searchTimeoutMatch[1].replace(/_/gu, ""));
  const searchWatchdogMs = Number(searchWatchdogMatch[1].replace(/_/gu, ""));
  assert(searchTimeoutMs >= 6_000, "real planner searches need a bounded but usable request window");
  assert(searchWatchdogMs > searchTimeoutMs, "the loading watchdog must not preempt the search request deadline");
  assert(routesSource.includes('searchFailureReason === "destination-confirmation-required"'));

  const repository = createPublishedKnowledgeEntityLayerRepository();
  const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
  const parse = (query) => parseSearchIntent(query, {
    catalogs,
    timeIntentEnabled: true,
  });
  const parserResults = matrix.cases.map((testCase) => {
    const intent = parse(testCase.query);
    assertParserCase(testCase, intent);
    return {
      id: testCase.id,
      category: testCase.category,
      parseSuccess: intent.parseSuccess,
      intentMode: intent.intentMode,
      failureReason: intent.failureReason,
    };
  });

  const env = {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "false",
    ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
    ROUTE_V2_READY_POOL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
  const acceptedRepository = createAcceptedRouteRepository({
    storagePath: path.join(tempRoot, "accepted", "accepted-routes.json"),
  });
  const candidatePoolStore = createRouteCandidatePoolStore({
    storagePath: path.join(tempRoot, "runtime", "candidate-pool.jsonl"),
    env,
    now: () => fixedNow,
  });
  const decisionTraceStore = createDecisionTraceStore({
    storagePath: path.join(tempRoot, "runtime", "decision-traces.jsonl"),
    env,
    now: () => fixedNow,
  });
  const evidenceBundleStore = createEvidenceBundleStore({
    storagePath: path.join(tempRoot, "runtime", "evidence-bundles.jsonl"),
    env,
    now: () => fixedNow,
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({
      storagePath: path.join(tempRoot, "runtime", "legacy-evidence.json"),
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
    env,
    now: () => Date.parse(fixedNow),
  });

  const europe = await service.search({
    query: "夏天去欧洲10天",
    limit: 6,
    sessionId: "real-user-region-europe",
  });
  assert(europe.records.length > 0, JSON.stringify(europe.diagnostics));
  const allowedEurope = new Set(europe.intent.regionCountryCodes);
  for (const record of europe.records) {
    const codes = recordCountryCodes(record);
    assert(codes.length > 0, record.id);
    assert(codes.every((code) => allowedEurope.has(code)), `${record.id}: ${codes.join(",")}`);
    assert.equal(record.durationDays, 10);
    assert.equal(record.normalizedRouteIntent.hardConstraints.region.value, "europe");
  }

  const englishDuration = await service.search({
    query: "Japan seven days",
    limit: 6,
    sessionId: "real-user-duration-seven",
  });
  assert(englishDuration.records.length > 0, JSON.stringify(englishDuration.diagnostics));
  assert.equal(englishDuration.intent.durationDays, 7);
  assert(englishDuration.records.every((record) => Number(record.durationDays) === 7));
  assert(englishDuration.records.every((record) => recordCountryCodes(record).every((code) => code === "JP")));

  const typo = await service.search({
    query: "Jappan 7 days",
    limit: 6,
    sessionId: "real-user-typo-jappan",
  });
  assert.equal(typo.records.length, 0);
  assert.equal(typo.diagnostics.reason, "destination-confirmation-required");
  assert.equal(typo.diagnostics.plannerCalled, undefined);
  assert.equal(typo.intent.destinationCorrection?.countryCode, "JP");

  const ringRoad = await service.search({
    query: "冰岛环岛7天",
    limit: 6,
    sessionId: "real-user-ring-road",
  });
  assert.equal(ringRoad.intent.travelStyle, "road-trip");
  assert.equal(ringRoad.intent.themeKey, "ring-road");
  assert.equal(ringRoad.intent.durationDays, 7);
  assert.equal(ringRoad.intent.countryCode, "IS");
  if (ringRoad.records.length) {
    assert(ringRoad.records.every((record) => Number(record.durationDays) === 7));
    assert(ringRoad.records.every((record) => record.normalizedRouteIntent.softPreferences.theme === "ringroad"));
    assert(ringRoad.records.every((record) => recordCountryCodes(record).every((code) => code === "IS")));
  } else {
    assert(["constraint-conflict", "no-valid-route"].includes(ringRoad.diagnostics.reason));
  }

  assert.equal(acceptedRepository.list({ limit: 10_000 }).records.length, 0);
  assert.equal(externalFetchCalls, 0);

  const categories = Object.fromEntries([...new Set(parserResults.map((entry) => entry.category))]
    .map((category) => [category, parserResults.filter((entry) => entry.category === category).length]));
  console.log(JSON.stringify({
    status: "PASS",
    matrixCases: matrix.cases.length,
    categories,
    productionPathCases: 4,
    europeResultCountries: [...new Set(europe.records.flatMap(recordCountryCodes))].sort(),
    englishDurationDays: englishDuration.records.map((record) => record.durationDays),
    typoFailureReason: typo.diagnostics.reason,
    ringRoadOutcome: ringRoad.records.length ? "route-returned" : ringRoad.diagnostics.reason,
    externalFetchCalls,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
