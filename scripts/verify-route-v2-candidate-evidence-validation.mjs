import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceRepository,
  createLocalEvidenceIndex,
  createMissingEvidenceManifestStore,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteLegEvidenceStore,
  createSeasonEvidenceStore,
  isRouteV2EvidenceValidationEnabled,
  normalizeRouteCandidate,
  routeIntentSnapshot,
  selectRouteCandidates,
  selectRouteCandidatesWithEvidence,
  validateRouteForUse,
} from "../src/lib/routes/index.mjs";
import { normalizeLocalEvidenceSource, sha256EvidenceContent } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { normalizeSeasonEvidence, validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";

const fixedNow = "2026-07-21T12:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-candidate-evidence-validation-"));
const canaryPath = path.resolve(".route-v2-local-evidence-canary");
const canaryExistedBefore = fs.existsSync(canaryPath);
let externalRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalRequests += 1;
  throw new Error("NETWORK_FORBIDDEN_IN_CANDIDATE_VALIDATION");
};

const DESTINATIONS = Object.freeze({
  tokyo: { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
  kyoto: { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
  osaka: { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
  nara: { id: "Q169134", wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048 },
  matsumoto: { id: "Q242666", wikidataId: "Q242666", countryCode: "JP", name: "松本", entityTypeName: "city", latitude: 36.238, longitude: 137.972 },
  takayama: { id: "Q200516", wikidataId: "Q200516", countryCode: "JP", name: "高山", entityTypeName: "city", latitude: 36.1461, longitude: 137.2522 },
});
const KG_POOL = Object.values(DESTINATIONS).map((destination) => structuredClone(destination));

function source(supports, suffix = "kyoto") {
  const content = `${supports.join("|")}|${suffix}`;
  return normalizeLocalEvidenceSource({
    url: `https://global.jr-central.co.jp/en/onlinebooking/contents/${suffix}/`,
    retrievedAt: fixedNow,
    supports,
    confidence: 0.95,
    contentHash: sha256EvidenceContent(content),
  });
}

function routeLeg(fromEntityId, toEntityId, {
  feasibilityStatus = "feasible",
  durationMinMinutes = 45,
  durationMaxMinutes = 60,
  freshnessStatus = "fresh",
  conflicts = [],
  transportMode = "rail",
} = {}) {
  const evidenceSource = source(["route-leg-feasibility", "route-leg-duration"], `${fromEntityId}-${toEntityId}`);
  const record = normalizeRouteLegEvidence({
    schemaVersion: "route-generation-v2-evidence-3a2-route-leg-v1",
    fromEntityId,
    toEntityId,
    transportMode,
    directed: true,
    feasibilityStatus,
    durationMinMinutes,
    durationMaxMinutes,
    transferCount: null,
    frequencyLevel: "regular",
    sourceRefs: [evidenceSource.sourceId],
    sources: [evidenceSource],
    confidence: 0.95,
    freshnessStatus,
    retrievedAt: fixedNow,
    expiresAt: freshnessStatus === "fresh" ? "2027-07-21T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
    unknowns: [],
    conflicts,
    diagnostics: [],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }, { now: () => fixedNow });
  assert.equal(validateRouteLegEvidence(record).accepted, true);
  return record;
}

function season(entityId, month, {
  suitabilityStatus = "suitable",
  freshnessStatus = "fresh",
  weatherRisks = [],
  transportRisks = [],
  closureRisks = [],
  conflicts = [],
} = {}) {
  const evidenceSource = normalizeLocalEvidenceSource({
    url: "https://www.japan.travel/en/guide/february/",
    retrievedAt: fixedNow,
    supports: ["season-hard-risk"],
    confidence: 0.9,
    contentHash: sha256EvidenceContent(`${entityId}|${month}|season`),
  });
  const record = normalizeSeasonEvidence({
    schemaVersion: "route-generation-v2-evidence-3a2-season-v1",
    entityId,
    month,
    season: null,
    suitabilityStatus,
    weatherRisks,
    transportRisks,
    closureRisks,
    recommendedBufferMinutes: null,
    sourceRefs: [evidenceSource.sourceId],
    sources: [evidenceSource],
    confidence: 0.9,
    freshnessStatus,
    retrievedAt: fixedNow,
    expiresAt: freshnessStatus === "fresh" ? "2027-07-21T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
    unknowns: [],
    conflicts,
    diagnostics: [],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }, { now: () => fixedNow });
  assert.equal(validateSeasonEvidence(record).accepted, true);
  return record;
}

function candidate(intentId, destinations, { durationDays = 7, travelStyle = "rail-journey" } = {}) {
  return normalizeRouteCandidate({
    intentId,
    countries: ["JP"],
    destinations: destinations.map((destination) => structuredClone(destination)),
    proposedOrder: destinations.map((destination) => destination.id),
    durationDays,
    travelStyle,
    generationSource: "candidate-evidence-validation-fixture",
    supportingSignals: [],
    status: "pending",
    rejectionReasons: [],
    unknowns: [],
    createdAt: fixedNow,
  }, { now: () => fixedNow });
}

function createLocalHarness(name, { legs = [], seasons = [], corruptLegLine = "", invalidLegRecord = null } = {}) {
  const root = path.join(tempRoot, name);
  const env = {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
  };
  const routeLegPath = path.join(root, "route-leg-evidence.jsonl");
  const seasonPath = path.join(root, "season-evidence.jsonl");
  const missingPath = path.join(root, "missing-evidence-manifest.jsonl");
  const routeLegStore = createRouteLegEvidenceStore({ storagePath: routeLegPath, env, now: () => fixedNow });
  const seasonStore = createSeasonEvidenceStore({ storagePath: seasonPath, env, now: () => fixedNow });
  const missingStore = createMissingEvidenceManifestStore({ storagePath: missingPath, env, now: () => fixedNow });
  if (legs.length) assert.equal(routeLegStore.upsertMany(legs).persisted, true);
  if (seasons.length) assert.equal(seasonStore.upsertMany(seasons).persisted, true);
  if (corruptLegLine || invalidLegRecord) {
    fs.mkdirSync(path.dirname(routeLegPath), { recursive: true });
    if (corruptLegLine) fs.appendFileSync(routeLegPath, `${corruptLegLine}\n`, "utf8");
    if (invalidLegRecord) fs.appendFileSync(routeLegPath, `${JSON.stringify(invalidLegRecord)}\n`, "utf8");
  }
  const index = createLocalEvidenceIndex({ routeLegStore, seasonStore, missingEvidenceStore: missingStore });
  return { root, env, routeLegStore, seasonStore, missingStore, index, repository: { index } };
}

function baseContext(extra = {}) {
  return {
    intentId: "intent-evidence-validation",
    country: "JP",
    durationDays: 7,
    travelStyle: "rail-journey",
    transportPreference: ["rail"],
    timeIntent: { type: "unspecified", months: [], season: null, rawText: "", diagnostics: [] },
    ...extra,
  };
}

const intentId = "intent-evidence-validation";
const candidates = [
  candidate(intentId, [DESTINATIONS.tokyo, DESTINATIONS.kyoto]),
  candidate(intentId, [DESTINATIONS.kyoto, DESTINATIONS.osaka]),
  candidate(intentId, [DESTINATIONS.osaka, DESTINATIONS.nara]),
];
const completeHarness = createLocalHarness("complete-selection", {
  legs: [
    routeLeg("Q34600", "Q35765", { feasibilityStatus: "infeasible", durationMinMinutes: null, durationMaxMinutes: null }),
    routeLeg("Q35765", "Q169134", { durationMinMinutes: 40, durationMaxMinutes: 55 }),
    routeLeg("Q169134", "Q242666", { durationMinMinutes: 150, durationMaxMinutes: 180 }),
  ],
});

const inputCandidatesBefore = JSON.stringify(candidates);
const selection = selectRouteCandidatesWithEvidence({
  candidates,
  context: baseContext(),
  intentId,
  evidenceRepository: completeHarness.repository,
  now: () => fixedNow,
});
assert.equal(selection.ready, true);
assert.equal(selection.selectedCandidate.candidateId, candidates[2].candidateId, "the only ready candidate must be selected");
assert.deepEqual(selection.validationResults.map((result) => result.status), ["needs-evidence", "rejected", "ready"]);
assert.equal(selection.selectionMode, "evidence-ready");
assert.equal(JSON.stringify(candidates), inputCandidatesBefore, "validation and selection must not mutate Candidate input");
assert.equal(selection.candidatePool.find((item) => item.candidateId === candidates[0].candidateId).status, "needs-evidence");
assert.equal(selection.candidatePool.find((item) => item.candidateId === candidates[1].candidateId).status, "rejected");

const reverseOnly = createLocalHarness("reverse-only", {
  legs: [routeLeg("Q34600", "Q1490")],
});
const reverseValidation = validateRouteForUse(candidates[0], baseContext(), reverseOnly.repository, { now: () => fixedNow });
assert.equal(reverseValidation.status, "needs-evidence");
assert.equal(reverseValidation.legResults[0].evidenceId, null, "reverse evidence must not satisfy the directed forward leg");

const excessiveTravel = createLocalHarness("excessive-travel", {
  legs: [routeLeg("Q1490", "Q34600", { durationMinMinutes: 900, durationMaxMinutes: 960 })],
});
const excessiveValidation = validateRouteForUse(candidates[0], baseContext({ durationDays: 2 }), excessiveTravel.repository, { now: () => fixedNow });
assert.equal(excessiveValidation.status, "rejected");
assert(excessiveValidation.pacingResult.reasonCodes.includes("pacing-single-leg-impossible"));

const readyValidation = selection.validationResults[2];
assert.equal(readyValidation.seasonResults[0].validation, "skipped");
assert.equal(readyValidation.seasonResults[0].status, "skipped");
assert(!readyValidation.reasonCodes.includes("season-evidence-missing"));

const febMissingHarness = createLocalHarness("february-missing", {
  legs: [routeLeg("Q35765", "Q169134")],
  seasons: [season("Q35765", 2)],
});
const febMissing = validateRouteForUse(candidates[2], baseContext({
  timeIntent: { type: "single-month", months: [2], season: null, rawText: "2月", diagnostics: [] },
}), febMissingHarness.repository, { now: () => fixedNow });
assert.equal(febMissing.status, "needs-evidence");
assert.equal(febMissing.seasonResults.length, 2);
assert(febMissing.seasonResults.some((result) => result.entityId === "Q169134" && result.evidenceId === null));

const canonicalFebruarySnapshot = routeIntentSnapshot({
  context: baseContext({
    timeIntent: { type: "single-month", months: [2], season: null, rawText: "February", diagnostics: [] },
  }),
  intentId,
  source: "candidate-evidence-validation-authoritative-intent",
});
const canonicalFebruaryCandidate = normalizeRouteCandidate({
  ...candidates[2],
  routeIntentFingerprintVersion: canonicalFebruarySnapshot.routeIntentFingerprintVersion,
  routeIntentFingerprint: canonicalFebruarySnapshot.routeIntentFingerprint,
  normalizedRouteIntent: canonicalFebruarySnapshot.normalizedRouteIntent,
  inputIntentSnapshot: canonicalFebruarySnapshot,
}, { now: () => fixedNow });
const canonicalFebruaryValidation = validateRouteForUse(
  canonicalFebruaryCandidate,
  baseContext({
    timeIntent: { type: "unspecified", months: [], season: null, rawText: "", diagnostics: [] },
  }),
  febMissingHarness.repository,
  { now: () => fixedNow },
);
assert.equal(canonicalFebruaryValidation.status, "needs-evidence");
assert.equal(canonicalFebruaryValidation.seasonResults.length, 2, "canonical Candidate months must override conflicting runtime context");
assert(canonicalFebruaryValidation.seasonResults.every((result) => result.month === 2));

const hardSeasonHarness = createLocalHarness("february-hard-stop", {
  legs: [routeLeg("Q35765", "Q169134")],
  seasons: [
    season("Q35765", 2),
    season("Q169134", 2, { suitabilityStatus: "unsuitable", transportRisks: ["rail service suspended"] }),
  ],
});
const hardSeason = validateRouteForUse(candidates[2], baseContext({
  timeIntent: { type: "single-month", months: [2], season: null, rawText: "2月", diagnostics: [] },
}), hardSeasonHarness.repository, { now: () => fixedNow });
assert.equal(hardSeason.status, "rejected");
assert(hardSeason.reasonCodes.includes("season-hard-closure-or-suspension"));

const rangeHarness = createLocalHarness("month-range", {
  legs: [routeLeg("Q35765", "Q169134")],
  seasons: [season("Q35765", 2), season("Q169134", 2), season("Q35765", 3), season("Q169134", 3)],
});
const rangeValidation = validateRouteForUse(candidates[2], baseContext({
  timeIntent: { type: "month-range", months: [2, 3], season: null, rawText: "2月至3月", diagnostics: [] },
}), rangeHarness.repository, { now: () => fixedNow });
assert.equal(rangeValidation.status, "ready");
assert.equal(rangeValidation.seasonResults.length, 4, "every destination and every normalized month must be checked");

const seasonOnly = validateRouteForUse(candidates[2], baseContext({
  timeIntent: { type: "season-only", months: [], season: "winter", rawText: "冬天", diagnostics: [] },
}), completeHarness.repository, { now: () => fixedNow });
assert.equal(seasonOnly.status, "needs-evidence");
assert(seasonOnly.reasonCodes.includes("season-only-month-mapping-unavailable"));

const emptyHarness = createLocalHarness("empty-library");
const allNeedsSelection = selectRouteCandidatesWithEvidence({
  candidates,
  context: baseContext(),
  intentId,
  evidenceRepository: emptyHarness.repository,
  now: () => fixedNow,
});
assert.equal(allNeedsSelection.ready, true);
assert.equal(allNeedsSelection.selectionMode, "needs-evidence-preview");
assert.equal(allNeedsSelection.selectedCandidate.candidateId, candidates[0].candidateId);
assert.equal(allNeedsSelection.selectedValidationStatus, "needs-evidence");

const legacySelection = selectRouteCandidates({ candidates, context: baseContext(), intentId });
assert.equal(isRouteV2EvidenceValidationEnabled({}), false);
assert.equal(legacySelection.selectedCandidate.candidateId, candidates[0].candidateId);
assert.equal(legacySelection.validationResults, undefined);

const missingLibrary = validateRouteForUse(candidates[0], baseContext(), createLocalHarness("missing-library").repository, { now: () => fixedNow });
assert.equal(missingLibrary.status, "needs-evidence");
const unavailableIndex = validateRouteForUse(candidates[0], baseContext(), null, { now: () => fixedNow });
assert.equal(unavailableIndex.status, "needs-evidence");
assert(unavailableIndex.reasonCodes.includes("local-evidence-index-unavailable"));

const corruptRecord = routeLeg("Q1490", "Q34600");
const invalidRecord = { ...corruptRecord, schemaVersion: "invalid-schema" };
const corruptHarness = createLocalHarness("corrupt-and-invalid", {
  legs: [corruptRecord],
  corruptLegLine: "{not-json",
  invalidLegRecord: invalidRecord,
});
const corruptValidation = validateRouteForUse(candidates[0], baseContext(), corruptHarness.repository, { now: () => fixedNow });
assert.equal(corruptValidation.status, "needs-evidence");
assert(corruptValidation.legResults[0].reasonCodes.includes("route-leg-schema-invalid"));

const throwingIndex = {
  getRouteLegsByEndpoints() { throw new Error("INDEX_LOAD_FAILED"); },
  getSeason() { return null; },
};
const indexFailure = validateRouteForUse(candidates[0], baseContext(), throwingIndex, { now: () => fixedNow });
assert.equal(indexFailure.status, "needs-evidence");
assert(indexFailure.reasonCodes.includes("local-evidence-index-read-failed"));

const missingReference = validateRouteForUse(candidates[2], baseContext({
  evidenceBundle: {
    candidateId: candidates[2].candidateId,
    destinationOrder: ["Q169134", "Q35765"],
    legEvidenceRefs: ["rle-does-not-exist"],
    seasonEvidenceRefs: [],
  },
}), completeHarness.repository, { now: () => fixedNow });
assert.equal(missingReference.status, "needs-evidence");
assert(missingReference.reasonCodes.includes("evidence-bundle-order-mismatch"));
assert(missingReference.reasonCodes.includes("evidence-bundle-leg-reference-missing"));

const nullDurationHarness = createLocalHarness("null-duration", {
  legs: [routeLeg("Q35765", "Q169134", { durationMinMinutes: null, durationMaxMinutes: null })],
});
const nullDuration = validateRouteForUse(candidates[2], baseContext(), nullDurationHarness.repository, { now: () => fixedNow });
assert.equal(nullDuration.status, "needs-evidence");
assert(nullDuration.reasonCodes.includes("route-leg-duration-missing"));

const conflictHarness = createLocalHarness("conflict", {
  legs: [routeLeg("Q35765", "Q169134", { conflicts: [{ field: "duration", reason: "official sources disagree" }] })],
});
const conflictValidation = validateRouteForUse(candidates[2], baseContext(), conflictHarness.repository, { now: () => fixedNow });
assert.equal(conflictValidation.status, "needs-evidence");
assert.equal(conflictValidation.conflictEvidenceIds.length, 1);

const staleHarness = createLocalHarness("stale", {
  legs: [routeLeg("Q35765", "Q169134", { freshnessStatus: "stale" })],
});
const staleValidation = validateRouteForUse(candidates[2], baseContext(), staleHarness.repository, { now: () => fixedNow });
assert.equal(staleValidation.status, "needs-evidence");
assert.equal(staleValidation.staleEvidenceIds.length, 1);

const thrownSelection = selectRouteCandidatesWithEvidence({
  candidates,
  context: baseContext(),
  intentId,
  evidenceRepository: completeHarness.repository,
  validator() { throw new Error("VALIDATOR_EXPLODED"); },
  now: () => fixedNow,
});
assert.equal(thrownSelection.ready, false);
assert.equal(thrownSelection.reason, "candidate-evidence-validator-exception");
const malformedSelection = selectRouteCandidatesWithEvidence({
  candidates,
  context: baseContext(),
  intentId,
  evidenceRepository: completeHarness.repository,
  validator() { return null; },
  now: () => fixedNow,
});
assert.equal(malformedSelection.ready, false);
assert.equal(malformedSelection.reason, "candidate-evidence-validation-invalid");

const performanceHarness = createLocalHarness("performance", {
  legs: [routeLeg("Q35765", "Q169134", { durationMinMinutes: 40, durationMaxMinutes: 55 })],
});
const parseBefore = performanceHarness.index.stats();
const coldStarted = performance.now();
validateRouteForUse(candidates[2], baseContext(), performanceHarness.repository, { now: () => fixedNow });
const coldDurationMs = performance.now() - coldStarted;
const parseAfterCold = performanceHarness.index.stats().storeParseCounts;
const warmStarted = performance.now();
const warmValidation = validateRouteForUse(candidates[2], baseContext(), performanceHarness.repository, { now: () => fixedNow });
const warmDurationMs = performance.now() - warmStarted;
const batchStarted = performance.now();
candidates.map((item) => validateRouteForUse(item, baseContext(), performanceHarness.repository, { now: () => fixedNow }));
const threeCandidateDurationMs = performance.now() - batchStarted;
assert.equal(warmValidation.status, "ready");
assert(warmDurationMs < 50, `warm candidate validation exceeded 50ms: ${warmDurationMs}`);
assert(threeCandidateDurationMs < 150, `three-candidate validation exceeded 150ms: ${threeCandidateDurationMs}`);
assert.deepEqual(performanceHarness.index.stats().storeParseCounts, parseAfterCold, "warm validation must not rescan JSONL stores");

function plannerHarness(name, validationEnabled, validator = validateRouteForUse, localRepository = completeHarness.repository) {
  const root = path.join(tempRoot, `planner-${name}`);
  const candidatePath = path.join(root, "candidate-pool.jsonl");
  const tracePath = path.join(root, "decision-traces.jsonl");
  const env = {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: validationEnabled ? "true" : "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ROUTE_V2_TRACE_PATH: tracePath,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: path.join(root, "accepted.json") });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(root, "legacy-evidence.json") });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: candidatePath, env, now: () => fixedNow });
  const decisionTraceStore = createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const plannerCandidates = [
    candidate(intentId, [DESTINATIONS.tokyo, DESTINATIONS.kyoto, DESTINATIONS.osaka]),
    candidate(intentId, [DESTINATIONS.kyoto, DESTINATIONS.osaka, DESTINATIONS.nara]),
    candidate(intentId, [DESTINATIONS.osaka, DESTINATIONS.nara, DESTINATIONS.matsumoto]),
  ];
  const actualPlanner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository,
    candidatePoolStore,
    decisionTraceStore,
    localEvidenceRepository: localRepository,
    candidateEvidenceValidator: validator,
    routeCandidateBuilder() { return plannerCandidates.map((item) => structuredClone(item)); },
    knowledgeGraph: { queryDestinations() { return KG_POOL.map((item) => structuredClone(item)); } },
    env,
  });
  const planner = {
    buildCandidates({ context = null, ...input } = {}) {
      return actualPlanner.buildCandidates({
        ...input,
        context: context ? {
          ...context,
          sessionId: context.sessionId || `candidate-evidence-${name}`,
        } : context,
      });
    },
  };
  return { planner, acceptedRepository, candidatePoolStore, decisionTraceStore, plannerCandidates };
}

const plannerContext = baseContext({ intentId, candidateSeed: "evidence-validation-planner" });
const plannerReadyHarness = plannerHarness("ready", true);
const plannerResult = await plannerReadyHarness.planner.buildCandidates({ limit: 1, context: plannerContext });
assert.equal(plannerResult.accepted.length, 1, JSON.stringify(plannerResult.rejected));
const plannerRecord = plannerResult.accepted[0].record;
const plannerTrace = plannerReadyHarness.decisionTraceStore.list()[0];
assert.equal(plannerRecord.selectedCandidateId, plannerReadyHarness.plannerCandidates[2].candidateId);
assert.equal(plannerRecord.evidenceValidationStatus, "ready");
assert.equal(plannerRecord.v2PublicationStatus, "v2-not-publishable-yet");
assert.equal(plannerReadyHarness.acceptedRepository.list({ limit: 100 }).records.length, 0, "V2 validation must not write accepted routes");
assert.equal(plannerTrace.candidateValidations.length, 3);
assert.equal(plannerTrace.selectedCandidateValidation.candidateId, plannerReadyHarness.plannerCandidates[2].candidateId);
assert.equal(plannerTrace.candidateSelectionMode, "evidence-ready");
assert.deepEqual(
  plannerRecord.destinationEntities.map((destination) => destination.wikidataId || destination.entityId || destination.id),
  plannerTrace.selectedCandidate.proposedOrder,
  "RouteRecord must still come from the evidence-selected Candidate",
);

const previewPlannerHarness = plannerHarness("needs-evidence-preview", true, validateRouteForUse, emptyHarness.repository);
const previewPlannerResult = await previewPlannerHarness.planner.buildCandidates({ limit: 1, context: plannerContext });
assert.equal(previewPlannerResult.accepted.length, 1, JSON.stringify(previewPlannerResult.rejected));
assert.equal(previewPlannerResult.accepted[0].record.evidenceValidationStatus, "needs-evidence");
assert.equal(previewPlannerResult.accepted[0].record.evidenceSelectionMode, "needs-evidence-preview");
assert.equal(previewPlannerResult.accepted[0].record.v2PublicationStatus, "v2-not-publishable-yet");
assert.equal(previewPlannerHarness.acceptedRepository.list({ limit: 100 }).records.length, 0);
assert.equal(previewPlannerHarness.decisionTraceStore.list()[0].candidateSelectionMode, "needs-evidence-preview");

const allRejectedLocalHarness = createLocalHarness("all-rejected", {
  legs: [
    routeLeg("Q1490", "Q34600", { feasibilityStatus: "infeasible", durationMinMinutes: null, durationMaxMinutes: null }),
    routeLeg("Q34600", "Q35765", { feasibilityStatus: "infeasible", durationMinMinutes: null, durationMaxMinutes: null }),
    routeLeg("Q35765", "Q169134", { feasibilityStatus: "infeasible", durationMinMinutes: null, durationMaxMinutes: null }),
    routeLeg("Q169134", "Q242666", { feasibilityStatus: "infeasible", durationMinMinutes: null, durationMaxMinutes: null }),
  ],
});
const allRejectedPlannerHarness = plannerHarness("all-rejected", true, validateRouteForUse, allRejectedLocalHarness.repository);
const allRejectedPlannerResult = await allRejectedPlannerHarness.planner.buildCandidates({ limit: 1, context: plannerContext });
const allRejectedTrace = allRejectedPlannerHarness.decisionTraceStore.list()[0];
assert(allRejectedPlannerResult.accepted.length + allRejectedPlannerResult.rejected.length > 0);
assert.equal(allRejectedTrace.outcome, "failure");
assert.equal(allRejectedTrace.failureReason, "candidate-evidence-all-rejected");
assert.equal(allRejectedTrace.candidateValidations.length, 3);
assert(allRejectedTrace.candidateValidations.every((validation) => validation.status === "rejected"));
assert.equal(allRejectedPlannerHarness.acceptedRepository.list({ limit: 100 }).records.length, 0);

let flagOffValidatorCalls = 0;
const flagOffHarness = plannerHarness("flag-off", false, () => {
  flagOffValidatorCalls += 1;
  throw new Error("FLAG_OFF_VALIDATOR_MUST_NOT_RUN");
});
const flagOffResult = await flagOffHarness.planner.buildCandidates({ limit: 1, context: plannerContext });
assert.equal(flagOffResult.accepted.length, 1, JSON.stringify(flagOffResult.rejected));
assert.equal(flagOffValidatorCalls, 0);
assert.equal(flagOffResult.accepted[0].record.selectedCandidateId, flagOffHarness.plannerCandidates[0].candidateId, "flag-off selection must remain the current stable first candidate");
assert.equal(flagOffHarness.decisionTraceStore.list()[0].candidateValidations, undefined);

const throwingPlannerHarness = plannerHarness("validator-exception", true, () => { throw new Error("VALIDATOR_EXPLODED"); });
const throwingPlannerResult = await throwingPlannerHarness.planner.buildCandidates({ limit: 1, context: plannerContext });
const throwingTrace = throwingPlannerHarness.decisionTraceStore.list()[0];
assert(throwingPlannerResult.accepted.length + throwingPlannerResult.rejected.length > 0, "legacy fallback must remain explicit");
assert.equal(throwingTrace.outcome, "failure");
assert.equal(throwingTrace.failureReason, "candidate-evidence-validator-exception");
assert.equal(throwingPlannerHarness.acceptedRepository.list({ limit: 100 }).records.length, 0);

assert.equal(externalRequests, 0);
assert.equal(fs.existsSync(canaryPath), canaryExistedBefore, "validation must not read or create the live canary directory");

const report = {
  ok: true,
  fixedScenarios: 10,
  faultScenarios: 13,
  selectionStatuses: selection.validationResults.map((result) => ({ candidateId: result.candidateId, status: result.status })),
  selectedCandidateId: selection.selectedCandidate.candidateId,
  allNeedsEvidenceMode: allNeedsSelection.selectionMode,
  flagDefault: false,
  externalRequests,
  acceptedWrites: 0,
  performance: {
    initiallyLoaded: parseBefore.loaded,
    coldDurationMs: Number(coldDurationMs.toFixed(3)),
    warmDurationMs: Number(warmDurationMs.toFixed(3)),
    threeCandidateDurationMs: Number(threeCandidateDurationMs.toFixed(3)),
    parseCountsAfterCold: parseAfterCold,
  },
  tempRoot,
};
console.log(JSON.stringify(report, null, 2));

globalThis.fetch = originalFetch;
fs.rmSync(tempRoot, { recursive: true, force: true });
