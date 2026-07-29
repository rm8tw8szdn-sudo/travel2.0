import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFailureDecisionTrace,
  buildRouteCandidatesFromPool,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  normalizeRouteCandidate,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-07-21T00:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-candidate-selection-stabilization-"));
const JP_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "\u4e1c\u4eac", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
  { wikidataId: "Q39231", countryCode: "JP", name: "\u5bcc\u58eb\u5c71", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274 },
  { wikidataId: "Q34600", countryCode: "JP", name: "\u4eac\u90fd", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
  { wikidataId: "Q169134", countryCode: "JP", name: "\u5948\u826f", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048 },
  { wikidataId: "Q35765", countryCode: "JP", name: "\u5927\u962a", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
  { wikidataId: "Q19869", countryCode: "JP", name: "\u91d1\u6cfd", entityTypeName: "city", latitude: 36.5613, longitude: 136.6562 },
  { wikidataId: "Q200516", countryCode: "JP", name: "\u9ad8\u5c71", entityTypeName: "town", latitude: 36.1461, longitude: 137.2522 },
  { wikidataId: "Q242666", countryCode: "JP", name: "\u677e\u672c", entityTypeName: "city", latitude: 36.238, longitude: 137.972 },
];

function jsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function createHarness(name, {
  candidatePathOverride = null,
  tracePathOverride = null,
  candidatePoolStoreOverride = null,
  decisionTraceStoreOverride = null,
  routeCandidateBuilder = null,
  strategyRegistry = null,
  knowledgeGraphOverride = null,
} = {}) {
  const root = path.join(tempRoot, name);
  fs.mkdirSync(root, { recursive: true });
  const candidatePath = candidatePathOverride || path.join(root, "route-candidate-pool.jsonl");
  const tracePath = tracePathOverride || path.join(root, "decision-traces.jsonl");
  const env = {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ROUTE_V2_TRACE_PATH: tracePath,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(root, "accepted.json") });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(root, "evidence.json") });
  const candidatePoolStore = candidatePoolStoreOverride || createRouteCandidatePoolStore({ storagePath: candidatePath, env, now: () => fixedNow });
  const decisionTraceStore = decisionTraceStoreOverride || createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const plannerOptions = {
    acceptedRepository,
    evidenceRepository,
    candidatePoolStore,
    decisionTraceStore,
    strategyRegistry,
    knowledgeGraph: knowledgeGraphOverride || {
      queryDestinations({ country }) {
        return country === "JP" ? JP_POOL.map((item) => structuredClone(item)) : [];
      },
    },
    env,
  };
  if (routeCandidateBuilder) plannerOptions.routeCandidateBuilder = routeCandidateBuilder;
  const actualPlanner = createRouteCompositionPlanner(plannerOptions);
  const planner = {
    buildCandidates({ context = null, ...input } = {}) {
      return actualPlanner.buildCandidates({
        ...input,
        context: context ? {
          ...context,
          sessionId: context.sessionId || `candidate-selection-${name}`,
        } : context,
      });
    },
  };
  return { root, env, acceptedRepository, evidenceRepository, candidatePoolStore, decisionTraceStore, candidatePath, tracePath, planner };
}

const FIXED_SAMPLES = [
  {
    name: "Japan classic first trip, 7 days",
    context: { intentId: "intent-jp-classic-7d", country: "JP", countryName: "\u65e5\u672c", durationDays: 7, travelStyle: "classic-first-trip", candidateSeed: "jp-classic-7d" },
    expectedOutcome: "success",
  },
  {
    name: "Japan rail journey, 9 days",
    context: { intentId: "intent-jp-rail-9d", country: "JP", countryName: "\u65e5\u672c", durationDays: 9, travelStyle: "rail-journey", transportPreference: ["rail"], candidateSeed: "jp-rail-9d" },
    expectedOutcome: "success",
  },
  {
    name: "Japan cultural deep dive, 6 days",
    context: { intentId: "intent-jp-culture-6d", country: "JP", countryName: "\u65e5\u672c", durationDays: 6, travelStyle: "deep-dive", theme: "\u6587\u5316", candidateSeed: "jp-culture-6d" },
    expectedOutcome: "success",
  },
  {
    name: "Eight Japan destinations in one day",
    context: {
      intentId: "intent-jp-impossible-1d-8",
      country: "JP",
      countryName: "\u65e5\u672c",
      durationDays: 1,
      travelStyle: "classic-first-trip",
      destinations: JP_POOL.map((destination) => destination.name),
      candidateSeed: "jp-impossible-1d-8",
    },
    expectedOutcome: "failure",
    expectedFailureStage: "input-constraints",
  },
  {
    name: "February snow rail hard constraint",
    context: {
      intentId: "intent-jp-snow-rail-feb",
      country: "JP",
      countryName: "\u65e5\u672c",
      durationDays: 7,
      travelStyle: "rail-journey",
      transportPreference: ["rail"],
      season: "2\u6708",
      seasonHardConstraint: true,
      theme: "\u96ea\u5b63",
      candidateSeed: "jp-snow-rail-feb",
    },
    expectedOutcome: "success",
  },
];
const context = FIXED_SAMPLES[0].context;

const harness = createHarness("selected-drives-route");
const first = await harness.planner.buildCandidates({ limit: 1, context });
assert.equal(first.accepted.length, 1, JSON.stringify(first.rejected));
const firstRecord = first.accepted[0].record;
const firstCandidates = harness.candidatePoolStore.listByIntent(context.intentId);
const firstTrace = harness.decisionTraceStore.readAll().find((item) => item.ok)?.trace;
assert.equal(firstCandidates.length, 3);
assert.equal(new Set(firstCandidates.map((candidate) => candidate.candidateId)).size, 3);
assert.equal(firstCandidates.filter((candidate) => candidate.status === "selected").length, 1);
assert.equal(firstCandidates.filter((candidate) => candidate.status === "rejected").length, 2);
assert(firstCandidates.filter((candidate) => candidate.status === "rejected").every((candidate) => candidate.rejectionReasons.length > 0));
assert.equal(firstRecord.selectedCandidateId, firstTrace.selectedCandidate.candidateId);
assert.deepEqual(firstRecord.countries, firstTrace.selectedCandidate.countries);
assert.deepEqual(
  firstRecord.destinationEntities.map((item) => item.wikidataId || item.entityId || item.name),
  firstTrace.selectedCandidate.proposedOrder,
  "selected Candidate order must be the final RouteRecord order",
);
for (const persistedCandidate of firstCandidates) {
  const traceCandidate = firstTrace.candidatePool.find((candidate) => candidate.candidateId === persistedCandidate.candidateId);
  assert(traceCandidate);
  assert.equal(traceCandidate.status, persistedCandidate.status);
  assert.deepEqual(traceCandidate.rejectionReasons, persistedCandidate.rejectionReasons);
}

await harness.planner.buildCandidates({ limit: 1, context });
assert.equal(jsonl(harness.candidatePath).length, 3, "same task retry must keep three physical Candidate records");
assert.equal(jsonl(harness.tracePath).length, 1, "same task retry must keep one physical DecisionTrace record");

const sampleResults = [{
  name: FIXED_SAMPLES[0].name,
  candidateIds: firstCandidates.map((candidate) => candidate.candidateId),
  selectedCandidateId: firstTrace.selectedCandidate.candidateId,
  routeId: firstRecord.id,
  routeOrder: firstRecord.destinationEntities.map((item) => item.wikidataId || item.entityId || item.name),
  selectedMatchesRoute: true,
  rejectedCandidates: firstTrace.rejectedCandidates.map((candidate) => ({ candidateId: candidate.candidateId, reasons: candidate.rejectionReasons })),
  failureStage: null,
  legacyFallback: false,
  publishable: false,
}];

for (const [index, sample] of FIXED_SAMPLES.slice(1).entries()) {
  const sampleHarness = createHarness(`sample-${index + 2}`);
  const result = await sampleHarness.planner.buildCandidates({ limit: 1, context: sample.context });
  const traces = sampleHarness.decisionTraceStore.list();
  assert.equal(traces.length, 1, `${sample.name}: exactly one idempotent trace is expected`);
  const trace = traces[0];
  const record = result.accepted[0]?.record || null;
  const candidates = sampleHarness.candidatePoolStore.listByIntent(sample.context.intentId);
  if (sample.expectedOutcome === "success") {
    assert.equal(result.accepted.length, 1, `${sample.name}: ${JSON.stringify(result.rejected)}`);
    assert.equal(candidates.length, 3);
    assert.equal(new Set(candidates.map((candidate) => candidate.candidateId)).size, 3);
    assert.equal(candidates.filter((candidate) => candidate.status === "selected").length, 1);
    assert.equal(candidates.filter((candidate) => candidate.status === "rejected").length, 2);
    assert.equal(trace.outcome, "success");
    assert.equal(trace.selectedCandidate.status, "selected");
    assert.equal(record.selectedCandidateId, trace.selectedCandidate.candidateId);
    assert.deepEqual(
      record.destinationEntities.map((item) => item.wikidataId || item.entityId || item.name),
      trace.selectedCandidate.proposedOrder,
      `${sample.name}: selected Candidate and RouteRecord must match`,
    );
    assert.deepEqual(record.countries, trace.selectedCandidate.countries);
    assert.equal(trace.rejectedCandidates.length, 2);
    assert(trace.rejectedCandidates.every((candidate) => candidate.rejectionReasons.length > 0));
    assert.equal(record.v2PublicationStatus, "v2-not-publishable-yet");
    assert(trace.unknowns.some((unknown) => unknown.field === "externalEvidence"));
    assert(trace.dataSourcesUsed.every((source) => !/tavily|wikivoyage|online|web/iu.test(JSON.stringify(source))));
    for (const persistedCandidate of candidates) {
      const traceCandidate = trace.candidatePool.find((candidate) => candidate.candidateId === persistedCandidate.candidateId);
      assert(traceCandidate);
      assert.equal(traceCandidate.status, persistedCandidate.status);
      assert.deepEqual(traceCandidate.rejectionReasons, persistedCandidate.rejectionReasons);
    }
    if (sample.name.includes("snow")) {
      assert.equal(record.enrichmentStatus, "needsEvidence", "snow-season hard constraint remains evidence-incomplete in offline Phase 1");
    }
  } else {
    assert.equal(candidates.length, 3, `${sample.name}: Phase 1 must still preserve three generated alternatives before rejecting the request`);
    assert.equal(trace.outcome, "failure");
    assert.equal(trace.selectedCandidate, null);
    assert.equal(trace.failureStage, sample.expectedFailureStage);
    assert.equal(trace.legacyFallback, true);
    if (record) {
      assert.equal(record.generationVersion, "route-generation-v2-fallback");
      assert.equal(record.v2PublicationStatus, "v2-not-publishable-yet");
    } else {
      assert(result.rejected.length > 0, `${sample.name}: rejected Planner output must remain explicit`);
    }
  }
  assert.equal(fs.existsSync(path.join(sampleHarness.root, "accepted.json")), false, `${sample.name}: Planner must not write accepted repository`);
  sampleResults.push({
    name: sample.name,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    selectedCandidateId: trace.selectedCandidate?.candidateId || null,
    routeId: record?.id || null,
    routeOrder: record?.destinationEntities?.map((item) => item.wikidataId || item.entityId || item.name) || [],
    selectedMatchesRoute: trace.outcome === "success",
    rejectedCandidates: trace.rejectedCandidates.map((candidate) => ({ candidateId: candidate.candidateId, reasons: candidate.rejectionReasons })),
    failureStage: trace.failureStage || null,
    failureReason: trace.failureReason || null,
    legacyFallback: trace.legacyFallback || false,
    publishable: false,
  });
}

const failureTarget = path.join(tempRoot, "candidate-write-failure-target");
fs.mkdirSync(failureTarget, { recursive: true });
const failureHarness = createHarness("candidate-write-failure", { candidatePathOverride: failureTarget });
const failureResult = await failureHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-write-failure" } });
assert.equal(failureResult.accepted.length, 1, "legacy Planner must continue after V2 Candidate persistence failure");
const failureTraces = jsonl(failureHarness.tracePath);
assert(failureTraces.some((trace) => trace.outcome === "failure" && trace.failureStage === "candidate-persistence"));
assert(failureTraces.every((trace) => trace.outcome !== "success" || trace.phase !== "minimal-candidate-selection"));

const throwingCandidateStore = {
  enabled() { return true; },
  replaceForIntent() { throw new Error("injected-candidate-store-failure"); },
};
const throwingCandidateHarness = createHarness("candidate-store-throws", { candidatePoolStoreOverride: throwingCandidateStore });
const throwingCandidateResult = await throwingCandidateHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-store-throws" } });
assert.equal(throwingCandidateResult.accepted.length, 1, "sync Candidate store failure must preserve legacy Planner availability");
const throwingCandidateTrace = throwingCandidateHarness.decisionTraceStore.list()[0];
assert.equal(throwingCandidateTrace.outcome, "failure");
assert.equal(throwingCandidateTrace.failureStage, "candidate-persistence");
assert.equal(throwingCandidateTrace.selectedCandidate, null);

const throwingEnabledHarness = createHarness("candidate-store-enabled-throws", {
  candidatePoolStoreOverride: { enabled() { throw new Error("injected-enabled-check-failure"); } },
});
const throwingEnabledResult = await throwingEnabledHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-enabled-check-throws" } });
assert.equal(throwingEnabledResult.accepted.length, 1, "Candidate store initialization failure must preserve legacy Planner availability");
assert.equal(throwingEnabledHarness.decisionTraceStore.list()[0].failureReason, "candidate-store-initialization-failed");

const emptyCandidateHarness = createHarness("candidate-pool-empty", { routeCandidateBuilder: () => [] });
const emptyCandidateResult = await emptyCandidateHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-candidate-empty" } });
assert.equal(emptyCandidateResult.accepted.length, 1, "empty V2 Candidate Pool must fall back to the legacy Planner");
const emptyCandidateTrace = emptyCandidateHarness.decisionTraceStore.list()[0];
assert.equal(emptyCandidateTrace.outcome, "failure");
assert.equal(emptyCandidateTrace.failureStage, "candidate-generation");
assert.equal(emptyCandidateTrace.failureReason, "candidate-pool-empty");

const invalidCandidateHarness = createHarness("candidate-schema-invalid", {
  routeCandidateBuilder: () => [{ intentId: "intent-schema-invalid", status: "pending", proposedOrder: [] }],
});
const invalidCandidateResult = await invalidCandidateHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-schema-invalid" } });
assert.equal(invalidCandidateResult.accepted.length, 1);
const invalidCandidateTrace = invalidCandidateHarness.decisionTraceStore.list()[0];
assert.equal(invalidCandidateTrace.failureStage, "candidate-schema-validation");
assert.equal(invalidCandidateTrace.failureReason, "candidate-schema-invalid");

function materializationFailureCandidates({ context: builderContext = {}, concept = {} } = {}) {
  const candidateDestinations = [
    [
      { wikidataId: "Q-MISSING", countryCode: "JP", name: "Missing City", entityTypeName: "city" },
      JP_POOL[0],
    ],
    [JP_POOL[2], JP_POOL[4]],
    [JP_POOL[3], JP_POOL[5]],
  ];
  return candidateDestinations.map((destinations, index) => normalizeRouteCandidate({
    intentId: builderContext.intentId,
    countries: ["JP"],
    destinations,
    proposedOrder: destinations.map((destination) => destination.wikidataId),
    durationDays: builderContext.durationDays || concept.durationDays || 7,
    travelStyle: builderContext.travelStyle || concept.travelStyle || "classic-first-trip",
    generationSource: "materialization-failure-test",
    supportingSignals: [{ type: "candidate-builder-method", value: `materialization-${index}` }],
    status: "pending",
    rejectionReasons: [],
    unknowns: [],
    createdAt: fixedNow,
  }, { now: () => fixedNow }));
}
const materializationHarness = createHarness("selected-materialization-failure", { routeCandidateBuilder: materializationFailureCandidates });
const materializationResult = await materializationHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-materialization-failure" } });
assert.equal(materializationResult.accepted.length, 1, "unresolvable selected Candidate must fall back to legacy Planner");
assert.equal(materializationResult.accepted[0].record.generationVersion, "route-generation-v2-fallback");
assert.equal(materializationResult.accepted[0].record.selectedCandidateId, undefined);
const materializationTrace = materializationHarness.decisionTraceStore.list()[0];
assert.equal(materializationTrace.outcome, "failure");
assert.equal(materializationTrace.failureStage, "selected-candidate-materialization");
assert.equal(materializationHarness.candidatePoolStore.listByIntent("intent-materialization-failure").filter((candidate) => candidate.status === "selected").length, 0);

const validatorHarness = createHarness("legacy-validator-rejection", {
  strategyRegistry: { evaluate() { return { accepted: false, reasons: ["forced-validator-rejection"] }; } },
});
const validatorResult = await validatorHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-validator-rejection" } });
assert.equal(validatorResult.accepted.length, 0);
assert(validatorResult.rejected.length > 0);
const validatorTrace = validatorHarness.decisionTraceStore.list()[0];
assert.equal(validatorTrace.outcome, "failure");
assert.equal(validatorTrace.failureStage, "legacy-validator");
assert.equal(validatorTrace.selectedCandidate, null);

const validatorExceptionHarness = createHarness("legacy-validator-exception", {
  strategyRegistry: { evaluate() { throw new Error("forced-validator-exception"); } },
});
const validatorExceptionResult = await validatorExceptionHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-validator-exception" } });
assert.equal(validatorExceptionResult.accepted.length, 0);
const validatorExceptionTrace = validatorExceptionHarness.decisionTraceStore.list()[0];
assert.equal(validatorExceptionTrace.failureStage, "legacy-validator");
assert.match(validatorExceptionTrace.failureReason, /validator-exception/);

const rejectingTraceStore = {
  appendLegacyRouteTrace() { return Promise.reject(new Error("injected-success-trace-failure")); },
  appendFailureTrace() { return Promise.reject(new Error("injected-failure-trace-failure")); },
};
const tracePersistenceHarness = createHarness("trace-store-rejects", { decisionTraceStoreOverride: rejectingTraceStore });
const tracePersistenceResult = await tracePersistenceHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-trace-store-rejects" } });
assert.equal(tracePersistenceResult.accepted.length, 1, "Trace store rejection must preserve legacy Planner availability");
assert.equal(tracePersistenceResult.accepted[0].record.generationVersion, "route-generation-v2-fallback");
assert.equal(tracePersistenceResult.accepted[0].record.selectedCandidateId, undefined);
assert.equal(tracePersistenceResult.accepted[0].v2Failure.stage, "decision-trace-persistence");
assert.equal(tracePersistenceResult.accepted[0].decisionTrace.reason, "trace-write-failed");

for (const [name, successAck] of [
  ["undurable-trace-ack", { written: true, persisted: false, traceId: "dt-undurable" }],
  ["missing-trace-id-ack", { written: false, persisted: true }],
]) {
  const partialTraceStore = {
    appendLegacyRouteTrace() { return structuredClone(successAck); },
    appendFailureTrace() { return { written: true, persisted: true, traceId: `dt-failure-${name}` }; },
  };
  const partialTraceHarness = createHarness(name, { decisionTraceStoreOverride: partialTraceStore });
  const partialTraceResult = await partialTraceHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: `intent-${name}` } });
  assert.equal(partialTraceResult.accepted.length, 1);
  assert.equal(partialTraceResult.accepted[0].record.generationVersion, "route-generation-v2-fallback");
  assert.equal(partialTraceResult.accepted[0].record.selectedCandidateId, undefined);
  assert.equal(partialTraceResult.accepted[0].v2Failure.stage, "decision-trace-persistence");
}

const emptyKnowledgeHarness = createHarness("knowledge-pool-empty", {
  knowledgeGraphOverride: { queryDestinations() { return []; } },
});
const emptyKnowledgeResult = await emptyKnowledgeHarness.planner.buildCandidates({ limit: 1, context: { ...context, intentId: "intent-knowledge-empty" } });
assert.equal(emptyKnowledgeResult.accepted.length, 0);
assert.equal(emptyKnowledgeHarness.decisionTraceStore.list()[0].failureStage, "candidate-generation");

const failureTraceA = buildFailureDecisionTrace({ context: { ...context, intentId: "intent-failure-idempotency" }, failureStage: "candidate-persistence", failureReason: "write-failed", timestamp: fixedNow });
const failureTraceB = buildFailureDecisionTrace({ context: { ...context, intentId: "intent-failure-idempotency" }, failureStage: "candidate-persistence", failureReason: "write-failed", timestamp: fixedNow });
const failureTraceC = buildFailureDecisionTrace({ context: { ...context, intentId: "intent-failure-idempotency" }, failureStage: "legacy-validator", failureReason: "rejected", timestamp: fixedNow });
assert.equal(failureTraceA.traceId, failureTraceB.traceId, "same logical failure retry must have a stable traceId");
assert.notEqual(failureTraceA.traceId, failureTraceC.traceId, "materially different failure stages must remain separately traceable");

const railIntentCandidates = buildRouteCandidatesFromPool({
  context: { country: "JP", durationDays: 7, travelStyle: "classic-first-trip", targetCities: ["Tokyo"], transportPreference: ["rail"] },
  pool: JP_POOL,
  targetCount: 3,
  seed: "intent-identity",
});
const carIntentCandidates = buildRouteCandidatesFromPool({
  context: { country: "JP", durationDays: 7, travelStyle: "classic-first-trip", targetCities: ["Kyoto"], transportPreference: ["car"], budgetConstraint: "luxury" },
  pool: JP_POOL,
  targetCount: 3,
  seed: "intent-identity",
});
assert(railIntentCandidates.length >= 3 && carIntentCandidates.length >= 3);
assert.notEqual(railIntentCandidates[0].intentId, carIntentCandidates[0].intentId, "different canonical RouteIntents must not alias to one storage key");
assert.equal(railIntentCandidates.some((candidate) => carIntentCandidates.some((other) => other.candidateId === candidate.candidateId)), false);

console.log(JSON.stringify({
  status: "PASS",
  selectedCandidateId: firstRecord.selectedCandidateId,
  candidateStatuses: firstCandidates.map((candidate) => ({ candidateId: candidate.candidateId, status: candidate.status })),
  routeOrder: firstRecord.destinationEntities.map((item) => item.wikidataId || item.entityId || item.name),
  retryCandidateLines: jsonl(harness.candidatePath).length,
  retryTraceLines: jsonl(harness.tracePath).length,
  candidateFailureTrace: true,
  candidateStoreThrowFailureTrace: true,
  candidateStoreInitializationFailureTrace: true,
  emptyCandidateFailureTrace: true,
  materializationFailureTrace: true,
  validatorFailureTrace: true,
  validatorExceptionFailureTrace: true,
  tracePersistenceFallback: true,
  strictTracePersistenceAck: true,
  failureTraceIdempotency: true,
  intentIdentityIsolation: true,
  samples: sampleResults,
  tempRoot,
}, null, 2));
