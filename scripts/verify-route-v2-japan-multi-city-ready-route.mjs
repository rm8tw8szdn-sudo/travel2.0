import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES,
  buildRouteV2MissingEvidenceReport,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createLocalEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  createRouteV2ReadyPool,
  defaultRouteV2ReadyPoolPath,
  isRouteV2EvidenceValidationEnabled,
  isRouteV2PublicationGateEnabled,
  isRouteV2ReadyPoolEnabled,
  parseSearchIntent,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-07-22T04:00:00.000Z";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-japan-multi-city-ready-"));
const formalSeedRoot = path.resolve("data", "route-v2", "evidence-seed");
const productionReadyPath = defaultRouteV2ReadyPoolPath({});
const productionReadyBefore = fs.existsSync(productionReadyPath)
  ? { exists: true, size: fs.statSync(productionReadyPath).size, mtimeMs: fs.statSync(productionReadyPath).mtimeMs }
  : { exists: false };
const originalFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.fetch = async () => {
  externalRequests += 1;
  throw new Error("NETWORK_FORBIDDEN_IN_JAPAN_READY_ROUTE_VERIFIER");
};

const enabledEnv = Object.freeze({
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_TIME_INTENT_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
  ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "true",
  ROUTE_V2_PUBLICATION_GATE_ENABLED: "true",
  ROUTE_V2_READY_POOL_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
  SEARCH_AUTO_ACCEPT_GENERATED: "true",
  SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
  SEARCH_PLANNER_TIMEOUT_MS: "30000",
});

function memorySearchCache() {
  const entries = new Map();
  return {
    get(key) { return entries.get(key) ? structuredClone(entries.get(key)) : null; },
    put({ intent, records = [], status = "search-generated" } = {}) {
      const entry = { intentHash: intent.intentHash, records: structuredClone(records), status };
      entries.set(intent.intentHash, entry);
      return structuredClone(entry);
    },
    appendReviewCandidates() { return { persisted: true }; },
    findRoute() { return null; },
  };
}

function ids(values = []) {
  return values.map((value) => value?.id || value?.wikidataId || value).filter(Boolean);
}

async function runQuery(query, label) {
  const sampleRoot = path.join(root, label);
  const env = {
    ...enabledEnv,
    ROUTE_V2_CANDIDATE_POOL_PATH: path.join(sampleRoot, "candidates.jsonl"),
    ROUTE_V2_TRACE_PATH: path.join(sampleRoot, "traces.jsonl"),
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(sampleRoot, "bundles.jsonl"),
    ROUTE_V2_READY_POOL_PATH: path.join(sampleRoot, "ready-routes.json"),
  };
  const acceptedPath = path.join(sampleRoot, "accepted.json");
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: env.ROUTE_V2_CANDIDATE_POOL_PATH, env, now: () => fixedNow });
  const decisionTraceStore = createDecisionTraceStore({ storagePath: env.ROUTE_V2_TRACE_PATH, env, now: () => fixedNow });
  const evidenceBundleStore = createEvidenceBundleStore({ storagePath: env.ROUTE_V2_EVIDENCE_BUNDLE_PATH, env, now: () => fixedNow });
  const localEvidenceRepository = createLocalEvidenceRepository({
    env,
    seedRoot: formalSeedRoot,
    storageRoot: path.join(sampleRoot, "runtime-evidence"),
    now: () => fixedNow,
  });
  const readyPool = createRouteV2ReadyPool({ env, storagePath: env.ROUTE_V2_READY_POOL_PATH, now: () => fixedNow });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({ storagePath: path.join(sampleRoot, "legacy-evidence.json") }),
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    readyPool,
    knowledgeGraph: {
      queryDestinations() { return ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES.map((entry) => structuredClone(entry)); },
    },
    env,
  });
  let plannerOutput = null;
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache: memorySearchCache(),
    planner: {
      async buildCandidates(input) {
        const startedAt = performance.now();
        plannerOutput = await planner.buildCandidates(input);
        plannerOutput.elapsedMs = performance.now() - startedAt;
        return plannerOutput;
      },
    },
    now: () => Date.parse(fixedNow),
    env,
  });
  const parsedIntent = parseSearchIntent(query, { timeIntentEnabled: true });
  const response = await service.search({ query, limit: 6, sessionId: `japan-ready-${label}` }, { requestId: `japan-ready-${label}` });
  const trace = decisionTraceStore.list()[0] || null;
  const candidates = trace ? candidatePoolStore.listByIntent(trace.intentId) : [];
  const acceptedItem = plannerOutput?.accepted?.[0] || null;
  assert.equal(fs.existsSync(acceptedPath), false, `${query}: V2 must not write accepted repository`);
  return { query, parsedIntent, response, trace, candidates, acceptedItem, readyPool, plannerOutput };
}

try {
  assert.equal(isRouteV2EvidenceValidationEnabled({}), false);
  assert.equal(isRouteV2PublicationGateEnabled({}), false);
  assert.equal(isRouteV2ReadyPoolEnabled({}), false);

  const flexible = await runQuery("东京京都大阪7天", "flexible");
  const requiredIds = ["Q1490", "Q34600", "Q35765"];
  assert.deepEqual(flexible.parsedIntent.requiredDestinationIds, requiredIds);
  assert.equal(flexible.parsedIntent.destinationOrderMode, "flexible");
  assert.equal(flexible.candidates.length, 3);
  for (const candidate of flexible.candidates) {
    assert(requiredIds.every((id) => candidate.proposedOrder.includes(id)), "every Candidate must retain all required cities");
  }
  const selectedOrder = flexible.trace.selectedCandidate.proposedOrder;
  assert.deepEqual(selectedOrder, ["Q1490", "Q34600", "Q169134", "Q35765"]);
  assert.deepEqual(ids(flexible.acceptedItem.record.destinationEntities), selectedOrder);
  assert.equal(flexible.acceptedItem.record.selectedCandidateId, flexible.trace.candidateId);
  assert.equal(flexible.trace.candidateValidations.length, 3);
  assert.deepEqual(flexible.trace.inputIntentSnapshot.requiredDestinationIds, requiredIds);
  assert.equal(flexible.trace.inputIntentSnapshot.destinationOrderMode, "flexible");
  assert.equal(flexible.acceptedItem.publicationGate.status, "ready-for-display");
  assert.equal(flexible.readyPool.list().length, 1);
  assert(flexible.plannerOutput.elapsedMs < 200, `three-Candidate validation and Gate took ${flexible.plannerOutput.elapsedMs.toFixed(3)}ms`);

  const readyRecord = flexible.acceptedItem.record;
  const readyGate = flexible.acceptedItem.publicationGate;
  const beforeDuplicate = fs.readFileSync(enabledEnv.ROUTE_V2_READY_POOL_PATH || path.join(root, "flexible", "ready-routes.json"), "utf8");
  const duplicate = flexible.readyPool.applyEvaluation({ routeRecord: readyRecord, publicationGate: readyGate });
  assert.equal(duplicate.skipped, true);
  assert.equal(flexible.readyPool.list().length, 1);
  assert.equal(fs.readFileSync(path.join(root, "flexible", "ready-routes.json"), "utf8"), beforeDuplicate);
  const demoted = flexible.readyPool.applyEvaluation({
    routeRecord: readyRecord,
    publicationGate: { ...readyGate, status: "blocked-needs-evidence", publicationStatus: "blocked-needs-evidence", publishable: false },
  });
  assert.equal(demoted.demoted, true);
  assert.equal(flexible.readyPool.list().length, 0);

  const fixed = await runQuery("东京→京都→大阪7天", "fixed");
  assert.equal(fixed.parsedIntent.destinationOrderMode, "fixed");
  assert.equal(fixed.candidates.length, 3);
  assert(fixed.candidates.every((candidate) => candidate.proposedOrder.slice(0, 3).join(">") === requiredIds.join(">")));
  assert.notEqual(fixed.acceptedItem?.publicationGate?.status, "ready-for-display", "missing Kyoto -> Osaka evidence must keep fixed route blocked");

  const countryOnly = await runQuery("日本7天", "country-only");
  assert.equal(countryOnly.parsedIntent.requiredDestinationIds.length, 0);
  assert.equal(countryOnly.candidates.length, 3);

  const february = await runQuery("2月去日本7天", "february");
  assert.equal(february.candidates.length, 3);
  assert.notEqual(february.acceptedItem?.publicationGate?.status, "ready-for-display");
  assert(february.trace.candidateValidations.some((validation) => validation.reasonCodes.some((code) => code.startsWith("season-"))));

  const shortTrip = await runQuery("日本2天", "short-trip");
  assert.equal(shortTrip.candidates.length, 3);
  assert(shortTrip.candidates.every((candidate) => candidate.destinations.length <= 2));

  const missingEvidenceTop = buildRouteV2MissingEvidenceReport([
    ...fixed.trace.candidateValidations,
    ...countryOnly.trace.candidateValidations,
    ...february.trace.candidateValidations,
    ...shortTrip.trace.candidateValidations,
  ]).slice(0, 10);
  assert(!missingEvidenceTop.some((item) => item.targetKey === "Q34600>Q169134|rail"));
  assert(!missingEvidenceTop.some((item) => item.targetKey === "Q169134>Q35765|rail"));

  const productionReadyAfter = fs.existsSync(productionReadyPath)
    ? { exists: true, size: fs.statSync(productionReadyPath).size, mtimeMs: fs.statSync(productionReadyPath).mtimeMs }
    : { exists: false };
  assert.deepEqual(productionReadyAfter, productionReadyBefore, "default production Ready Pool must not be created or changed");
  assert.equal(externalRequests, 0);

  console.log(JSON.stringify({
    verifier: "route-v2-japan-multi-city-ready-route",
    passed: true,
    flexible: {
      routeIntent: {
        requiredDestinationIds: flexible.parsedIntent.requiredDestinationIds,
        requiredDestinationNames: flexible.parsedIntent.requiredDestinationNames,
        destinationOrderMode: flexible.parsedIntent.destinationOrderMode,
      },
      candidateOrders: flexible.candidates.map((candidate) => candidate.proposedOrder),
      candidateValidationStatuses: flexible.trace.candidateValidations.map((validation) => ({ candidateId: validation.candidateId, status: validation.status, reasonCodes: validation.reasonCodes })),
      selectedCandidateId: flexible.trace.candidateId,
      selectedOrder,
      finalRouteOrder: ids(flexible.acceptedItem.record.destinationEntities),
      publicationStatus: flexible.acceptedItem.publicationGate.status,
      readyPoolInitialCount: 1,
      duplicateWriteSkipped: duplicate.skipped,
      demoted: demoted.demoted,
      readyPoolAfterDemotion: flexible.readyPool.list().length,
      elapsedMs: Number(flexible.plannerOutput.elapsedMs.toFixed(3)),
    },
    fixed: {
      candidateOrders: fixed.candidates.map((candidate) => candidate.proposedOrder),
      publicationStatus: fixed.acceptedItem?.publicationGate?.status || "v2-fallback",
    },
    countryOnly: { candidateCount: countryOnly.candidates.length, requiredDestinationCount: 0 },
    february: { publicationStatus: february.acceptedItem?.publicationGate?.status || "v2-fallback" },
    shortTrip: { candidateOrders: shortTrip.candidates.map((candidate) => candidate.proposedOrder) },
    missingEvidenceTop,
    externalRequests,
    acceptedRepositoryWrites: 0,
    productionReadyPoolChanged: false,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(root, { recursive: true, force: true });
}
