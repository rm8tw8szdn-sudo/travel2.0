import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SEARCH_KNOWLEDGE_GRAPH_FALLBACKS,
  buildRouteDestinationSuggestion,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createLocalEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  isRouteV2TimeIntentEnabled,
  parseSearchIntent,
  parseTimeIntent,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-07-21T10:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-time-intent-boundaries-"));

const JP_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "东京", sourceTitle: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
  { wikidataId: "Q39231", countryCode: "JP", name: "富士山", sourceTitle: "Mount Fuji", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274 },
  { wikidataId: "Q34600", countryCode: "JP", name: "京都", sourceTitle: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
  { wikidataId: "Q169134", countryCode: "JP", name: "奈良", sourceTitle: "Nara", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048 },
  { wikidataId: "Q35765", countryCode: "JP", name: "大阪", sourceTitle: "Osaka", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
  { wikidataId: "Q19869", countryCode: "JP", name: "金泽", sourceTitle: "Kanazawa", entityTypeName: "city", latitude: 36.5613, longitude: 136.6562 },
  { wikidataId: "Q200516", countryCode: "JP", name: "高山", sourceTitle: "Takayama", entityTypeName: "town", latitude: 36.1461, longitude: 137.2522 },
  { wikidataId: "Q242666", countryCode: "JP", name: "松本", sourceTitle: "Matsumoto", entityTypeName: "city", latitude: 36.238, longitude: 137.972 },
];

function parse(query) {
  return parseSearchIntent(query, { timeIntentEnabled: true });
}

const parserCases = [
  { query: "日本7天", countryCode: "JP", days: 7, type: "unspecified", months: [], mode: "specified-destination", canGenerate: true },
  { query: "2月去日本7天", countryCode: "JP", days: 7, type: "single-month", months: [2], mode: "specified-destination", canGenerate: true },
  { query: "February Japan 7 days", countryCode: "JP", days: 7, type: "single-month", months: [2], mode: "specified-destination", canGenerate: true },
  { query: "Feb Japan 7 days", countryCode: "JP", days: 7, type: "single-month", months: [2], mode: "specified-destination", canGenerate: true },
  { query: "3月至4月去日本", countryCode: "JP", days: null, type: "month-range", months: [3, 4], mode: "specified-destination", canGenerate: true },
  { query: "冬天去日本", countryCode: "JP", days: null, type: "season-only", months: [], season: "winter", mode: "specified-destination", canGenerate: true },
  { query: "日本2天", countryCode: "JP", days: 2, type: "unspecified", months: [], mode: "specified-destination", canGenerate: true },
  { query: "2月", countryCode: "", days: null, type: "single-month", months: [2], mode: "destination-suggestion", canGenerate: true },
  { query: "2", countryCode: "", days: 2, type: "unspecified", months: [], mode: "destination-suggestion", canGenerate: true },
  { query: "2月 2天", countryCode: "", days: 2, type: "single-month", months: [2], mode: "destination-suggestion", canGenerate: true },
  { query: "冬天", countryCode: "", days: null, type: "season-only", months: [], season: "winter", mode: "destination-suggestion", canGenerate: true },
  { query: "7天", countryCode: "", days: 7, type: "unspecified", months: [], mode: "destination-suggestion", canGenerate: true },
  { query: "13月", countryCode: "", days: null, type: "invalid", months: [], mode: "invalid-time-intent", canGenerate: false },
  { query: "0月", countryCode: "", days: null, type: "invalid", months: [], mode: "invalid-time-intent", canGenerate: false },
  { query: "13月去日本", countryCode: "JP", days: null, type: "invalid", months: [], mode: "invalid-time-intent", canGenerate: false },
  { query: "0月去日本", countryCode: "JP", days: null, type: "invalid", months: [], mode: "invalid-time-intent", canGenerate: false },
  { query: "", countryCode: "", days: null, type: "unspecified", months: [], mode: "insufficient-intent", canGenerate: false },
  { query: "完全无法识别的乱码xyz", countryCode: "", days: null, type: "unspecified", months: [], mode: "insufficient-intent", canGenerate: false },
];

for (const expected of parserCases) {
  const intent = parse(expected.query);
  assert.equal(intent.countryCode, expected.countryCode, `${expected.query}: country`);
  assert.equal(intent.durationDays, expected.days, `${expected.query}: duration`);
  assert.equal(intent.timeIntent.type, expected.type, `${expected.query}: time type`);
  assert.deepEqual(intent.timeIntent.months, expected.months, `${expected.query}: months`);
  assert.equal(intent.timeIntent.season, expected.season || null, `${expected.query}: season`);
  assert.equal(intent.intentMode, expected.mode, `${expected.query}: intent mode`);
  assert.equal(intent.canGenerate, expected.canGenerate, `${expected.query}: generation eligibility`);
}

assert.equal(parse("2月").insufficientDestination, false);
assert.equal(parse("2月").destinationUnspecified, true);
assert.equal(parse("2").durationDays, 2);
assert.equal(parseTimeIntent("2").type, "unspecified");
assert.equal(parse("日本2天").timeIntent.type, "unspecified");
for (const query of ["13月", "0月", "13月去日本", "0月去日本"]) {
  assert.equal(parse(query).failureReason, "invalid-time-intent");
  assert(parse(query).timeIntent.diagnostics.some((item) => item.code === "invalid-month"));
}
assert.deepEqual(
  { ...parse("February Japan 7 days").timeIntent, rawText: "<normalized-away>" },
  { ...parse("Feb Japan 7 days").timeIntent, rawText: "<normalized-away>" },
  "English full and abbreviated month names must have equivalent normalized semantics",
);
assert.equal(parse("February Japan 7 days").intentHash, parse("Feb Japan 7 days").intentHash);
assert.notEqual(parse("13月").intentHash, parse("0月").intentHash);
assert.equal(isRouteV2TimeIntentEnabled({}), false);
assert.equal(isRouteV2TimeIntentEnabled({
  ROUTE_V2_RUNTIME_ENABLED: "true",
  ROUTE_V2_TIME_INTENT_ENABLED: "true",
}), true);
assert.equal(
  isRouteV2TimeIntentEnabled({ ROUTE_V2_TIME_INTENT_ENABLED: "true" }),
  false,
  "the Time Intent child flag must not bypass the missing master switch",
);

const legacyIntent = parseSearchIntent("2月去日本7天");
assert.equal(Object.hasOwn(legacyIntent, "timeIntent"), false, "flag-off parser shape must remain legacy-compatible");
assert.equal(Object.hasOwn(legacyIntent, "intentMode"), false, "flag-off parser shape must not gain V2 intent mode");
assert.equal(parseSearchIntent("2").durationDays, null, "legacy bare number behavior must remain unchanged");

const suggestionIntent = parse("2月");
const stableSuggestionA1 = buildRouteDestinationSuggestion({ intent: suggestionIntent, sessionId: "session-a" });
const stableSuggestionA2 = buildRouteDestinationSuggestion({ intent: suggestionIntent, sessionId: "session-a" });
const stableSuggestionB = buildRouteDestinationSuggestion({ intent: suggestionIntent, sessionId: "session-b" });
assert.deepEqual(stableSuggestionA1, stableSuggestionA2, "same session suggestion must be stable");
assert.equal(stableSuggestionA1.ready, true);
assert.equal(stableSuggestionB.ready, true);
assert.notEqual(stableSuggestionA1.suggestion.countryCode, stableSuggestionB.suggestion.countryCode, "different sessions should normally vary destination order");
assert.equal(stableSuggestionA1.suggestion.seasonEvidencePending, true, "month suitability must remain unverified without local evidence");

function memorySearchCache() {
  const items = new Map();
  const reviews = [];
  return {
    get(key) { return items.get(key) ? structuredClone(items.get(key)) : null; },
    put({ intent, records = [], status = "search-generated" } = {}) {
      const item = { intentHash: intent.intentHash, records: structuredClone(records), status };
      items.set(intent.intentHash, item);
      return structuredClone(item);
    },
    appendReviewCandidates(payload) { reviews.push(structuredClone(payload)); return { persisted: true }; },
    findRoute(routeId) {
      for (const item of items.values()) {
        const record = item.records.find((candidate) => candidate.id === routeId);
        if (record) return { item: structuredClone(item), record: structuredClone(record) };
      }
      return null;
    },
    snapshot() { return { items: structuredClone([...items.values()]), reviews: structuredClone(reviews) }; },
  };
}

function plannerHarness(label) {
  const root = path.join(tempRoot, label.replace(/[^a-z0-9-]+/giu, "-"));
  const candidatePath = path.join(root, "route-candidate-pool.jsonl");
  const tracePath = path.join(root, "decision-traces.jsonl");
  const evidencePath = path.join(root, "evidence-bundles.jsonl");
  const acceptedPath = path.join(root, "accepted-routes.json");
  const localEvidenceRoot = path.join(root, "local-evidence");
  const env = {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ROUTE_V2_TRACE_PATH: tracePath,
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: evidencePath,
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "true",
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: candidatePath, env, now: () => fixedNow });
  const decisionTraceStore = createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const evidenceBundleStore = createEvidenceBundleStore({ storagePath: evidencePath, env, now: () => fixedNow });
  const localEvidenceRepository = createLocalEvidenceRepository({ env, storageRoot: localEvidenceRoot, now: () => fixedNow });
  const pools = {
    ...Object.fromEntries(Object.entries(SEARCH_KNOWLEDGE_GRAPH_FALLBACKS).map(([code, destinations]) => [
      code,
      destinations.map((destination) => structuredClone(destination)),
    ])),
    JP: JP_POOL,
  };
  const actualPlanner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({ storagePath: path.join(root, "legacy-route-evidence.json") }),
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    knowledgeGraph: {
      queryDestinations({ country }) {
        return (pools[country] || []).map((destination) => structuredClone(destination));
      },
    },
    env,
  });
  let plannerCalls = 0;
  let lastPlannerResult = null;
  const planner = {
    async buildCandidates(input) {
      plannerCalls += 1;
      lastPlannerResult = await actualPlanner.buildCandidates(input);
      return lastPlannerResult;
    },
  };
  const searchCache = memorySearchCache();
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache,
    planner,
    now: () => Date.parse(fixedNow),
    env,
  });
  return {
    root,
    acceptedPath,
    acceptedRepository,
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    searchCache,
    service,
    plannerCalls: () => plannerCalls,
    lastPlannerResult: () => lastPlannerResult,
  };
}

function destinationOrderForRoute(route = {}) {
  return (route.destinationEntities || []).map((item) => item.wikidataId || item.entityId || item.id || item.name).filter(Boolean);
}

function summarizeExecution(query, sessionId, harness, searchResult) {
  const plannerResult = harness.lastPlannerResult();
  const finalRoute = plannerResult?.accepted?.[0]?.record || null;
  const effectiveIntentId = finalRoute?.intentId || (searchResult.intent.destinationSuggestion
    ? `${searchResult.intent.intentHash}-${searchResult.intent.destinationSuggestion.seed.slice(0, 12)}`
    : searchResult.intent.intentHash);
  const candidates = harness.candidatePoolStore.listByIntent(effectiveIntentId);
  const traces = harness.decisionTraceStore.list().filter((trace) => trace.intentId === effectiveIntentId);
  const bundles = harness.evidenceBundleStore.listLifecycle().filter((bundle) => bundle.intentId === effectiveIntentId);
  const seasonRecords = harness.localEvidenceRepository.seasonStore.list();
  const seasonMissing = harness.localEvidenceRepository.missingEvidenceStore.list().filter((item) => item.evidenceType === "season");
  const selectedCandidate = candidates.find((candidate) => candidate.status === "selected") || null;
  const routeIntentFingerprints = {
    candidate: selectedCandidate?.routeIntentFingerprint || null,
    route: finalRoute?.routeIntentFingerprint || null,
    trace: traces[0]?.routeIntentFingerprint || null,
    evidence: bundles[0]?.routeIntentFingerprint || null,
  };
  if (selectedCandidate && finalRoute && traces[0] && bundles[0]) {
    assert.ok(routeIntentFingerprints.candidate, `${query}: selected Candidate must retain the RouteIntent fingerprint`);
    assert.equal(routeIntentFingerprints.route, routeIntentFingerprints.candidate, `${query}: RouteRecord fingerprint must match the selected Candidate`);
    assert.equal(routeIntentFingerprints.trace, routeIntentFingerprints.candidate, `${query}: DecisionTrace fingerprint must match the selected Candidate`);
    assert.equal(routeIntentFingerprints.evidence, routeIntentFingerprints.candidate, `${query}: EvidenceBundle fingerprint must match the selected Candidate`);
  }
  return {
    query,
    sessionId,
    intentMode: searchResult.intent.intentMode,
    timeIntent: searchResult.intent.timeIntent,
    durationDays: searchResult.intent.durationDays,
    suggestedCountry: searchResult.intent.destinationSuggestion?.countryCode || searchResult.intent.countryCode || null,
    suggestedCities: searchResult.intent.destinationSuggestion?.cities || searchResult.intent.cities,
    plannerCalls: harness.plannerCalls(),
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      status: candidate.status,
      destinations: candidate.destinations.map((destination) => destination.name),
      rejectionReasons: candidate.rejectionReasons,
    })),
    routeRecords: plannerResult?.accepted?.length || 0,
    finalRoute: finalRoute ? {
      routeId: finalRoute.id,
      durationDays: finalRoute.durationDays,
      destinations: finalRoute.destinations,
      bestMonths: finalRoute.bestMonths,
      destinationOrder: destinationOrderForRoute(finalRoute),
      selectedCandidateId: finalRoute.selectedCandidateId,
      publicationStatus: finalRoute.v2PublicationStatus,
    } : null,
    selectedCandidateId: selectedCandidate?.candidateId || null,
    selectedOrder: selectedCandidate?.proposedOrder || [],
    traces: traces.length,
    traceOutcome: traces[0]?.outcome || null,
    evidenceBundles: bundles.length,
    evidenceStatus: bundles[0]?.status || null,
    evidenceFailureReason: bundles[0]?.failureReason || null,
    evidenceDiagnostics: bundles[0]?.diagnostics || [],
    routeIntentFingerprints,
    destinationCount: bundles[0]?.destinationOrder?.length || 0,
    seasonEvidenceRefs: bundles[0]?.seasonEvidenceRefs?.length || 0,
    seasonMonths: [...new Set(seasonRecords.map((record) => record.month))].sort((left, right) => left - right),
    seasonMissing: seasonMissing.length,
    sources: bundles[0]?.sources?.length || 0,
    responseRecords: searchResult.records.length,
    responseStatuses: [...new Set(searchResult.records.map((record) => record.searchStatus))],
    searchDiagnostics: searchResult.diagnostics,
  };
}

async function executeThroughSearch(query, label, sessionId = `session-${label}`) {
  const harness = plannerHarness(label);
  const searchResult = await harness.service.search({ query, limit: 6, sessionId }, { requestId: `time-intent-${label}` });
  const summary = summarizeExecution(query, sessionId, harness, searchResult);
  if (!searchResult.intent.canGenerate) {
    assert.equal(summary.plannerCalls, 0, `${query || "<empty>"}: invalid or insufficient input must not call Planner`);
    assert.equal(summary.candidates.length, 0);
    assert.equal(summary.routeRecords, 0);
    assert.equal(summary.traces, 0);
    assert.equal(summary.evidenceBundles, 0);
    assert.equal(fs.existsSync(harness.acceptedPath), false);
    return { harness, searchResult, summary };
  }
  assert.equal(summary.plannerCalls, 1, `${query}: Planner must be called`);
  assert.equal(summary.candidates.length, 3, `${query}: V2 must persist exactly three candidates`);
  assert.equal(summary.candidates.filter((candidate) => candidate.status === "selected").length, 1, `${query}: one candidate selected`);
  assert.equal(summary.candidates.filter((candidate) => candidate.status === "rejected").length, 2, `${query}: two candidates rejected`);
  assert(summary.candidates.filter((candidate) => candidate.status === "rejected").every((candidate) => candidate.rejectionReasons.length > 0));
  assert.equal(summary.routeRecords, 1, `${query}: final RouteRecord expected`);
  assert.equal(summary.traces, 1, `${query}: DecisionTrace expected`);
  assert.equal(summary.evidenceBundles, 1, `${query}: EvidenceBundle expected`);
  assert.equal(summary.selectedCandidateId, summary.finalRoute.selectedCandidateId, `${query}: selected Candidate must drive final RouteRecord`);
  assert.deepEqual(summary.selectedOrder, summary.finalRoute.destinationOrder, `${query}: selected and final order must match`);
  assert.equal(summary.finalRoute.publicationStatus, "v2-not-publishable-yet");
  assert.equal(summary.sources, 0, `${query}: no evidence source may be fabricated`);
  assert.equal(summary.responseRecords, 1, `${query}: Search must expose the generated text route; route=${JSON.stringify(summary.finalRoute)} diagnostics=${JSON.stringify(summary.searchDiagnostics)}`);
  assert.deepEqual(summary.responseStatuses, ["needs-review"], `${query}: suggestion remains review-only`);
  assert.equal(fs.existsSync(harness.acceptedPath), false, `${query}: V2 auto-accept gate must keep accepted repository untouched`);
  return { harness, searchResult, summary };
}

let externalFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("Time intent verification must not call external services");
};

const executionResults = [];
try {
  for (const [index, entry] of parserCases.entries()) {
    const execution = await executeThroughSearch(entry.query, `sample-${index + 1}`, `sample-session-${index + 1}`);
    executionResults.push(execution.summary);
  }
} finally {
  globalThis.fetch = originalFetch;
}

function resultFor(query) {
  return executionResults.find((entry) => entry.query === query);
}

const noTime = resultFor("日本7天");
assert.equal(noTime.seasonEvidenceRefs, 0);
assert.equal(noTime.seasonMissing, 0);
assert.equal(noTime.evidenceStatus, "pending");

for (const query of ["2月去日本7天", "February Japan 7 days", "Feb Japan 7 days"]) {
  const result = resultFor(query);
  assert.equal(result.seasonEvidenceRefs, result.destinationCount, `${query}: one February reference per destination`);
  assert.equal(result.seasonMissing, result.destinationCount, `${query}: one February missing item per destination`);
  assert.deepEqual(result.seasonMonths, [2]);
  assert.equal(result.evidenceStatus, "needs-review", `${query}: ${JSON.stringify(result)}`);
}

const monthRange = resultFor("3月至4月去日本");
assert.equal(monthRange.seasonEvidenceRefs, monthRange.destinationCount * 2);
assert.equal(monthRange.seasonMissing, monthRange.destinationCount * 2);
assert.deepEqual(monthRange.seasonMonths, [3, 4]);
assert.equal(monthRange.evidenceStatus, "needs-review");

for (const query of ["冬天去日本", "冬天"]) {
  const result = resultFor(query);
  assert.equal(result.seasonEvidenceRefs, 0);
  assert.equal(result.seasonMissing, 0);
  assert.deepEqual(result.seasonMonths, []);
  assert.equal(result.evidenceStatus, "needs-review", `${query}: ${JSON.stringify(result)}`);
}

const februaryOnly = resultFor("2月");
assert.equal(februaryOnly.intentMode, "destination-suggestion");
assert(februaryOnly.suggestedCountry);
assert.equal(februaryOnly.seasonEvidenceRefs, februaryOnly.destinationCount);
assert.equal(februaryOnly.seasonMissing, februaryOnly.destinationCount);
assert.deepEqual(februaryOnly.seasonMonths, [2]);
assert.equal(februaryOnly.evidenceStatus, "needs-review");

const twoDays = resultFor("2");
assert.equal(twoDays.durationDays, 2);
assert.equal(twoDays.timeIntent.type, "unspecified");
assert.equal(twoDays.finalRoute.durationDays, 2);
assert(twoDays.destinationCount <= 2, "bare 2 must respect the short-trip destination capacity");
assert(twoDays.candidates.every((candidate) => candidate.destinations.length <= 2), "every two-day Candidate must respect the short-trip capacity");
assert.equal(twoDays.seasonEvidenceRefs, 0);
assert.equal(twoDays.seasonMissing, 0);

const februaryTwoDays = resultFor("2月 2天");
assert.equal(februaryTwoDays.durationDays, 2);
assert.deepEqual(februaryTwoDays.timeIntent.months, [2]);
assert.equal(februaryTwoDays.finalRoute.durationDays, 2);
assert(februaryTwoDays.destinationCount <= 2, "February two-day route must respect short-trip capacity");
assert(februaryTwoDays.candidates.every((candidate) => candidate.destinations.length <= 2), "every February two-day Candidate must respect short-trip capacity");
assert.equal(februaryTwoDays.seasonEvidenceRefs, februaryTwoDays.destinationCount);
assert.deepEqual(februaryTwoDays.seasonMonths, [2]);

const sevenDays = resultFor("7天");
assert.equal(sevenDays.durationDays, 7);
assert.equal(sevenDays.finalRoute.durationDays, 7);
assert(sevenDays.suggestedCountry);

for (const query of ["13月", "0月", "13月去日本", "0月去日本", "", "完全无法识别的乱码xyz"]) {
  const result = resultFor(query);
  assert.equal(result.plannerCalls, 0);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.routeRecords, 0);
  assert.equal(result.evidenceBundles, 0);
}

assert.equal(resultFor("日本2天").durationDays, 2);
assert.equal(resultFor("日本2天").seasonEvidenceRefs, 0);
assert.equal(externalFetchCalls, 0);

const idempotent = plannerHarness("idempotent-february");
const idempotentRequest = { query: "2月", limit: 6, sessionId: "idempotent-session" };
const idempotentFirstResponse = await idempotent.service.search(idempotentRequest, { requestId: "idempotent-first" });
const idempotentIntentId = `${idempotentFirstResponse.intent.intentHash}-${idempotentFirstResponse.intent.destinationSuggestion.seed.slice(0, 12)}`;
const idempotentFirst = {
  candidates: idempotent.candidatePoolStore.listByIntent(idempotentIntentId).length,
  traces: idempotent.decisionTraceStore.list().length,
  bundles: idempotent.evidenceBundleStore.listLifecycle().length,
  seasons: idempotent.localEvidenceRepository.seasonStore.list().length,
};
const idempotentSecondResponse = await idempotent.service.search(idempotentRequest, { requestId: "idempotent-second" });
const idempotentSecond = {
  candidates: idempotent.candidatePoolStore.listByIntent(idempotentIntentId).length,
  traces: idempotent.decisionTraceStore.list().length,
  bundles: idempotent.evidenceBundleStore.listLifecycle().length,
  seasons: idempotent.localEvidenceRepository.seasonStore.list().length,
};
assert.deepEqual(idempotentSecond, idempotentFirst, "same session retry must remain physically idempotent");
assert.equal(idempotentSecondResponse.records[0]?.id, idempotentFirstResponse.records[0]?.id, "same session retry must return the same route");
assert.deepEqual(idempotentSecondResponse.records[0]?.destinations, idempotentFirstResponse.records[0]?.destinations, "same session retry must preserve route ordering");
assert.equal(idempotent.plannerCalls(), 2, "destination suggestion intentionally re-enters Planner rather than replaying another session's cache");

let flagOffPlannerCalls = 0;
let flagOffContext = null;
const flagOffService = createRouteSearchService({
  acceptedRepository: { list: () => ({ records: [] }) },
  searchCache: memorySearchCache(),
  planner: {
    async buildCandidates({ context }) {
      flagOffPlannerCalls += 1;
      flagOffContext = structuredClone(context);
      return { accepted: [], rejected: [] };
    },
  },
  now: () => Date.parse(fixedNow),
  env: {
    ROUTE_V2_TIME_INTENT_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
  },
});
const flagOff = await flagOffService.search({ query: "2月去日本7天", limit: 6 }, { requestId: "flag-off" });
assert.equal(flagOffPlannerCalls, 1);
assert.equal(Object.hasOwn(flagOff.intent, "timeIntent"), false);
assert.equal(Object.hasOwn(flagOff.intent, "intentMode"), false);
assert.equal(Object.hasOwn(flagOffContext, "timeIntent"), false);
assert.equal(Object.hasOwn(flagOffContext, "destinationSuggestion"), false);

console.log(JSON.stringify({
  status: "PASS",
  featureFlag: {
    name: "ROUTE_V2_TIME_INTENT_ENABLED",
    defaultEnabled: false,
    legacyContextUnchangedWhenDisabled: true,
  },
  sessionOrdering: {
    sameSessionStable: true,
    sessionA: stableSuggestionA1.suggestion.countryCode,
    sessionB: stableSuggestionB.suggestion.countryCode,
  },
  executions: executionResults,
  idempotent: idempotentSecond,
  externalFetchCalls,
  tempRoot,
}, null, 2));
