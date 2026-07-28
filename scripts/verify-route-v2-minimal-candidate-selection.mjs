import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";
import {
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  isRouteV2CandidatePoolEnabled,
  isRouteV2IntentEnabled,
  isRouteV2TraceEnabled,
  validateRouteCandidate,
  validateDecisionTrace,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-07-21T00:00:00.000Z";
const RealDate = Date;
globalThis.Date = class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length) return new RealDate(...args);
    return new RealDate(fixedNow);
  }

  static now() { return new RealDate(fixedNow).getTime(); }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-minimal-candidate-selection-"));
const realProtectedPaths = [
  path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json"),
  path.resolve(projectRoot, ".route-v2-cache", "route-candidate-pool.jsonl"),
  path.resolve(projectRoot, ".route-v2-cache", "decision-traces.jsonl"),
  path.resolve(projectRoot, "route-feed-bootstrap.js"),
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-feed-preload.js"),
  path.resolve(projectRoot, "city-detail.js"),
];
const protectedBefore = statesFor(realProtectedPaths);

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
const TEST_INTENTS = [
  { intentId: "intent-jp-7d", durationDays: 7, country: "JP", travelStyle: "classic-first-trip", candidateSeed: "jp-7d" },
  { intentId: "intent-jp-8d", durationDays: 8, country: "JP", travelStyle: "classic-first-trip", candidateSeed: "jp-8d" },
  { intentId: "intent-jp-9d", durationDays: 9, country: "JP", travelStyle: "classic-first-trip", candidateSeed: "jp-9d" },
];

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function routeOrder(record = {}) {
  return (record.destinationEntities || []).map((item) => item.wikidataId || item.entityId || item.id || item.name);
}

function createHarness(name, envOverrides = {}, paths = {}) {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const acceptedPath = path.join(dir, "accepted-routes.json");
  const candidatePath = paths.candidatePath || path.join(dir, "route-candidate-pool.jsonl");
  const tracePath = paths.tracePath || path.join(dir, "decision-traces.jsonl");
  const env = {
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "false",
    ROUTE_V2_INTENT_ENABLED: "false",
    ROUTE_V2_TRACE_ENABLED: "false",
    ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT: "false",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ROUTE_V2_TRACE_PATH: tracePath,
    ...envOverrides,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(dir, "evidence.json") });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: candidatePath, env, now: () => fixedNow });
  const decisionTraceStore = createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const networkProbe = { calls: 0 };
  const plannerOptions = {
    acceptedRepository,
    evidenceRepository,
    knowledgeGraph: {
      queryDestinations(query) {
        return query.country === "JP" ? JP_POOL.map((item) => ({ ...item })) : [];
      },
    },
    candidatePoolStore,
    decisionTraceStore,
    env,
  };
  if (env.ROUTE_V2_INTENT_ENABLED === "true") {
    plannerOptions.webEvidencePipeline = {
      provider: { async searchEvidence() { networkProbe.calls += 1; throw new Error("unexpected-online-evidence-call"); } },
      extractor: { extract() { return { evidence: [] }; } },
    };
  }
  const planner = createRouteCompositionPlanner(plannerOptions);
  return { dir, acceptedPath, candidatePath, tracePath, env, acceptedRepository, planner, networkProbe };
}

async function buildOne(harness, contextOverrides = {}) {
  const result = await harness.planner.buildCandidates({
    limit: 1,
    context: {
      ...TEST_INTENTS[0],
      countryName: "\u65e5\u672c",
      ...contextOverrides,
    },
  });
  assert.equal(result.accepted.length, 1, `expected one legacy Planner result: ${JSON.stringify(result.rejected)}`);
  return result.accepted[0];
}

assert.equal(isRouteV2IntentEnabled({}), false, "RouteIntent flag must default to off");
assert.equal(isRouteV2CandidatePoolEnabled({}), false, "Candidate Pool flag must default to off");
assert.equal(isRouteV2TraceEnabled({}), false, "DecisionTrace flag must default to off");

const flagOffHarness = createHarness("flag-off");
const flagOffResult = await buildOne(flagOffHarness);
assert.equal(fs.existsSync(flagOffHarness.candidatePath), false, "default-off must not create Candidate Pool storage");
assert.equal(fs.existsSync(flagOffHarness.tracePath), false, "default-off must not create DecisionTrace storage");

const enabledFlags = {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
};
const enabledHarness = createHarness("enabled", enabledFlags);
const enabledResult = await buildOne(enabledHarness);
assert.equal(flagOffResult.record.generationVersion, undefined, "flag-off must preserve the legacy Planner record shape");
assert.equal(enabledResult.record.generationVersion, "route-generation-v2-phase1");
assert.equal(enabledResult.record.v2PublicationStatus, "v2-not-publishable-yet");
assert.equal(enabledResult.record.intentId, TEST_INTENTS[0].intentId);

const candidates = readJsonl(enabledHarness.candidatePath);
assert.equal(candidates.length, 3, "each test intent must contain three candidates by default");
assert.equal(new Set(candidates.map((candidate) => candidate.candidateId)).size, candidates.length, "candidateId values must be unique");
assert.equal(candidates.filter((candidate) => candidate.status === "selected").length, 1, "Candidate Pool must persist exactly one selected Candidate");
assert.equal(candidates.filter((candidate) => candidate.status === "rejected").length, 2, "Candidate Pool must persist exactly two rejected Candidates");
assert(candidates.filter((candidate) => candidate.status === "rejected").every((candidate) => candidate.rejectionReasons.length > 0), "rejected Candidate states require explicit reasons");
assert(candidates.every((candidate) => candidate.inputIntentSnapshot?.intentId === TEST_INTENTS[0].intentId), "Candidate Pool must preserve the input intent snapshot");
assert(candidates.every((candidate) => candidate.countries.length > 0), "each candidate must preserve countries");
assert(candidates.every((candidate) => candidate.destinations.length >= 2), "each candidate must preserve destinations");
assert(candidates.every((candidate) => candidate.proposedOrder.length >= 2), "each candidate must preserve order");
assert(candidates.every((candidate) => candidate.initialReason), "each candidate must preserve its initial reason");
assert(candidates.every((candidate) => candidate.supportingSignals.some((signal) => signal.type === "candidate-builder-method")), "each candidate must preserve its initial generation reason");

const traces = readJsonl(enabledHarness.tracePath);
assert.equal(traces.length, 1, "one accepted legacy route must create one DecisionTrace");
const trace = traces[0];
assert.equal(validateDecisionTrace(trace).accepted, true, "candidate-selection trace must pass schema validation");
assert.equal(trace.phase, "minimal-candidate-selection", "trace must identify the candidate-selection phase");
assert.equal(trace.inputIntentSnapshot.intentId, TEST_INTENTS[0].intentId);
assert.deepEqual(trace.inputContext, trace.inputIntentSnapshot, "DecisionTrace inputContext must be the same RouteIntent snapshot");
assert.deepEqual(candidates[0].inputIntentSnapshot, trace.inputIntentSnapshot, "Candidate Pool and DecisionTrace must share the RouteIntent snapshot");
assert.equal(validateRouteCandidate({ ...candidates[0], inputIntentSnapshot: { ...candidates[0].inputIntentSnapshot, intentId: "mismatched-intent" } }).accepted, false, "mismatched Candidate Pool intent snapshots must be rejected");
assert.equal(trace.candidatePool.length, 3);
assert.equal(trace.selectedCandidate.status, "selected");
assert.equal(trace.candidateId, trace.selectedCandidate.candidateId);
assert.equal(enabledResult.record.selectedCandidateId, trace.selectedCandidate.candidateId);
assert.equal(enabledResult.record.decisionTraceId, trace.traceId);
assert.deepEqual(routeOrder(enabledResult.record), trace.selectedCandidate.proposedOrder, "selected Candidate must drive the final RouteRecord order");
assert.deepEqual(enabledResult.record.countries, trace.selectedCandidate.countries, "selected Candidate countries must drive the final RouteRecord");
if (enabledResult.record.travelStyle === "classic-first-trip") {
  const displayCopy = String(enabledResult.record.recommendationText || "");
  assert.doesNotMatch(
    displayCopy,
    /日均一个主要体验|在给定天数内保留\d+个目的地|停留点多，先锁定重点/u,
    "classic route display copy must not expose a mechanical capacity template",
  );
  assert.match(
    displayCopy,
    /日本|古都|寺院|街巷|山海/u,
    "classic Japan display copy must remain concise and regionally grounded",
  );
}
assert.equal(trace.rejectedCandidates.length, 2);
assert.equal(trace.rejectionReasons.length, 2);
assert(trace.rejectedCandidates.every((candidate) => candidate.status === "rejected"), "every non-selected candidate must be marked rejected in the trace");
assert(trace.rejectedCandidates.every((candidate) => candidate.rejectionReasons.length >= 1), "every rejected candidate must have an explicit reason");
assert(trace.decisionFactors.length >= 2, "minimal decision factors must be recorded");
assert(trace.unknowns.some((item) => item.field === "externalEvidence"), "absence of external evidence must be explicit");
assert(trace.dataSourcesUsed.every((item) => !/tavily|wikivoyage|online|web/iu.test(JSON.stringify(item))), "selection trace must not claim online evidence");
assert.equal(enabledHarness.networkProbe.calls, 0, "minimal Phase 1 selection must not call online evidence");
for (const persistedCandidate of candidates) {
  const traceCandidate = trace.candidatePool.find((item) => item.candidateId === persistedCandidate.candidateId);
  assert(traceCandidate, `Trace must contain persisted Candidate ${persistedCandidate.candidateId}`);
  assert.equal(traceCandidate.status, persistedCandidate.status);
  assert.deepEqual(traceCandidate.rejectionReasons, persistedCandidate.rejectionReasons);
}

const additionalIntentHarnesses = [];
const intentResults = [{
  intentId: TEST_INTENTS[0].intentId,
  candidateIds: candidates.map((candidate) => candidate.candidateId),
  selectedCandidateId: trace.selectedCandidate.candidateId,
  rejectedCandidateIds: trace.rejectedCandidates.map((candidate) => candidate.candidateId),
}];
for (const [index, intent] of TEST_INTENTS.slice(1).entries()) {
  const harness = createHarness(`test-intent-${index + 1}`, enabledFlags);
  await buildOne(harness, intent);
  const intentCandidates = readJsonl(harness.candidatePath);
  const intentTrace = readJsonl(harness.tracePath)[0];
  assert.equal(intentCandidates.length, 3, "each independent test intent must generate exactly three candidates");
  assert.equal(new Set(intentCandidates.map((candidate) => candidate.candidateId)).size, 3, "each test intent must have unique candidate IDs");
  assert.equal(intentCandidates.every((candidate) => candidate.inputIntentSnapshot?.intentId === intent.intentId), true, "each candidate must carry its matching intent snapshot");
  assert.equal(intentTrace.inputContext.intentId, intent.intentId);
  assert.equal(intentTrace.selectedCandidate.status, "selected");
  assert.equal(intentTrace.rejectedCandidates.length, 2);
  assert.equal(intentCandidates.filter((candidate) => candidate.status === "selected").length, 1);
  assert.equal(intentCandidates.filter((candidate) => candidate.status === "rejected").length, 2);
  intentResults.push({
    intentId: intent.intentId,
    candidateIds: intentCandidates.map((candidate) => candidate.candidateId),
    selectedCandidateId: intentTrace.selectedCandidate.candidateId,
    rejectedCandidateIds: intentTrace.rejectedCandidates.map((candidate) => candidate.candidateId),
  });
  additionalIntentHarnesses.push(harness);
}

const stableHarness = createHarness("stable", enabledFlags);
await buildOne(stableHarness);
const stableCandidates = readJsonl(stableHarness.candidatePath);
const stableTrace = readJsonl(stableHarness.tracePath)[0];
assert.deepEqual(stableCandidates.map((candidate) => candidate.candidateId), candidates.map((candidate) => candidate.candidateId), "candidate order and IDs must be stable");
assert.equal(stableTrace.selectedCandidate.candidateId, trace.selectedCandidate.candidateId, "selection must be stable");
await buildOne(enabledHarness);
assert.equal(readJsonl(enabledHarness.candidatePath).length, 3, "same task retry must not append Candidate records");
assert.equal(readJsonl(enabledHarness.tracePath).length, 1, "same task retry must not append DecisionTrace records");

const boundedHarness = createHarness("bounded-target", enabledFlags);
await buildOne(boundedHarness, { candidateTargetCount: 5 });
assert.equal(readJsonl(boundedHarness.candidatePath).length, 3, "Phase 1 must keep every test intent at exactly three candidates");
assert.equal(readJsonl(boundedHarness.tracePath)[0].rejectedCandidates.length, 2, "three-candidate selection must reject exactly two alternatives");

const candidateFailureDir = path.join(tempRoot, "candidate-write-failure-target");
fs.mkdirSync(candidateFailureDir, { recursive: true });
const candidateFailureHarness = createHarness("candidate-write-failure", enabledFlags, { candidatePath: candidateFailureDir });
const candidateFailureResult = await buildOne(candidateFailureHarness);
assert.deepEqual(routeOrder(candidateFailureResult.record), routeOrder(flagOffResult.record), "Candidate Pool write failure must continue through the legacy Planner skeleton");
assert.equal(candidateFailureResult.record.generationVersion, "route-generation-v2-fallback");
assert.equal(candidateFailureResult.record.selectedCandidateId, undefined, "failed Candidate persistence must not claim a successful selection");
const candidateFailureTraces = readJsonl(candidateFailureHarness.tracePath);
assert.equal(candidateFailureTraces.length, 1);
assert.equal(candidateFailureTraces[0].outcome, "failure");
assert.equal(candidateFailureTraces[0].failureStage, "candidate-persistence");
assert.equal(candidateFailureTraces[0].selectedCandidate, null);
assert.equal(candidateFailureHarness.networkProbe.calls, 0, "V2 failure fallback must not start online evidence collection in Phase 1");

const traceFailureDir = path.join(tempRoot, "trace-write-failure-target");
fs.mkdirSync(traceFailureDir, { recursive: true });
const traceFailureHarness = createHarness("trace-write-failure", enabledFlags, { tracePath: traceFailureDir });
const traceFailureResult = await buildOne(traceFailureHarness);
assert.deepEqual(routeOrder(traceFailureResult.record), routeOrder(flagOffResult.record), "DecisionTrace write failure must continue through the legacy Planner skeleton");
assert.equal(traceFailureResult.decisionTrace.written, false);
assert.equal(traceFailureResult.decisionTrace.reason, "trace-read-failed");
assert.equal(traceFailureResult.record.generationVersion, "route-generation-v2-fallback");
assert.equal(traceFailureResult.record.selectedCandidateId, undefined, "Trace persistence failure must not return a V2 success selection");
assert.equal(traceFailureResult.v2Failure.stage, "decision-trace-persistence");
assert.equal(traceFailureHarness.networkProbe.calls, 0);

for (const harness of [flagOffHarness, enabledHarness, ...additionalIntentHarnesses, stableHarness, boundedHarness, candidateFailureHarness, traceFailureHarness]) {
  assert.equal(fs.existsSync(harness.acceptedPath), false, "Planner candidate generation must not write accepted repository");
}

for (const file of [
  "routes.js",
  "route-feed-preload.js",
  "src/lib/routes/discovery.mjs",
  "src/lib/routes/route-search-service.mjs",
]) {
  const text = fs.readFileSync(path.resolve(projectRoot, file), "utf8");
  assert.equal(/route-candidate-selection|decision-trace-schema|decision-trace-store/u.test(text), false, `${file} must not consume candidate selection or DecisionTrace`);
}

const selectionSource = fs.readFileSync(path.resolve(projectRoot, "src/lib/routes/route-candidate-selection.mjs"), "utf8");
assert.equal(/from\s+["'][^"']*provider|fetch\s*\(|https?:\/\//iu.test(selectionSource), false, "candidate selector may use local validation but must remain free of network providers");
assertStatesUnchanged(protectedBefore, statesFor(realProtectedPaths));

console.log(JSON.stringify({
  status: "PASS",
  candidateCount: candidates.length,
  uniqueCandidateIds: true,
  stableCandidateOrder: true,
  selectedCandidateId: trace.selectedCandidate.candidateId,
  rejectedCandidateCount: trace.rejectedCandidates.length,
  rejectionReasonsComplete: true,
  testIntents: intentResults,
  inputIntentSnapshot: true,
  decisionFactors: trace.decisionFactors.length,
  unknowns: trace.unknowns.length,
  externalRequests: 0,
  acceptedRepositoryChanged: false,
  feedChanged: false,
  candidateWriteFailureDegraded: true,
  traceWriteFailureDegraded: true,
  selectedCandidateDrivesRoute: true,
  idempotentRetry: true,
  flagDefault: false,
  tempRoot,
}, null, 2));
