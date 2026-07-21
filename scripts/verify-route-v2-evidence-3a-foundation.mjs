import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION,
  buildEvidenceBundleLifecycle,
  createEvidenceBundleLifecycleId,
  validateEvidenceBundleLifecycle,
} from "../src/lib/routes/evidence-bundle-schema.mjs";
import {
  createEvidenceBundleStore,
  isRouteV2EvidenceBundleEnabled,
} from "../src/lib/routes/evidence-bundle-store.mjs";
import {
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  writeEvidenceBundleLifecycleSidecarSafe,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-07-21T00:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-evidence-3a-foundation-"));

const selectedCandidate = {
  candidateId: "rc-evidence-foundation-sample",
  intentId: "intent-evidence-foundation-sample",
  status: "selected",
  countries: ["JP"],
  destinations: [
    { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo" },
    { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto" },
    { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka" },
  ],
  proposedOrder: ["Q1490", "Q34600", "Q35765"],
  durationDays: 7,
  travelStyle: "classic-first-trip",
};

const routeRecord = {
  id: "planner-designed-evidence-foundation-sample",
  intentId: selectedCandidate.intentId,
  selectedCandidateId: selectedCandidate.candidateId,
  generationVersion: "route-generation-v2-phase1",
  v2PublicationStatus: "v2-not-publishable-yet",
  countries: ["JP"],
  destinationEntities: selectedCandidate.destinations.map((destination) => ({ ...destination })),
};

const decisionTrace = {
  traceId: "dt-evidence-foundation-sample",
  intentId: selectedCandidate.intentId,
  outcome: "success",
  selectedCandidate: structuredClone(selectedCandidate),
};

const built = buildEvidenceBundleLifecycle({
  selectedCandidate,
  routeRecord,
  decisionTrace,
  context: { season: "", seasonHardConstraint: false },
  now: () => fixedNow,
});
assert.equal(built.created, true);
assert.equal(built.bundle.schemaVersion, EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION);
assert.equal(built.bundle.status, "pending");
assert.equal(built.bundle.candidateId, selectedCandidate.candidateId);
assert.equal(built.bundle.decisionTraceId, decisionTrace.traceId);
assert.equal(built.bundle.routeRecordId, routeRecord.id);
assert.deepEqual(built.bundle.destinationOrder, selectedCandidate.proposedOrder);
assert.equal(built.bundle.legs.length, 2);
assert(built.bundle.legs.every((leg) => leg.estimatedDurationMinutes === null));
assert(built.bundle.legs.every((leg) => ["unknown", "needs-evidence"].includes(leg.feasibilityStatus)));
assert(built.bundle.legs.every((leg) => leg.evidenceRefs.length === 0));
assert.deepEqual(built.bundle.sources, []);
assert.equal(built.bundle.conflicts.length, 0);
assert.equal(validateEvidenceBundleLifecycle(built.bundle).accepted, true);
assert.equal(validateEvidenceBundleLifecycle({ ...built.bundle, status: undefined }).accepted, false);
assert.equal(validateEvidenceBundleLifecycle({ ...built.bundle, evidenceBundleId: undefined }).accepted, false);

const stableBuilt = buildEvidenceBundleLifecycle({
  selectedCandidate: structuredClone(selectedCandidate),
  routeRecord: structuredClone(routeRecord),
  decisionTrace: structuredClone(decisionTrace),
  now: () => "2026-07-21T01:00:00.000Z",
});
assert.equal(stableBuilt.bundle.evidenceBundleId, built.bundle.evidenceBundleId);
assert.equal(createEvidenceBundleLifecycleId(built.bundle), built.bundle.evidenceBundleId);

const snowBuilt = buildEvidenceBundleLifecycle({
  selectedCandidate: { ...selectedCandidate, candidateId: "rc-evidence-snow", intentId: "intent-evidence-snow" },
  routeRecord: { ...routeRecord, id: "route-evidence-snow", selectedCandidateId: "rc-evidence-snow", intentId: "intent-evidence-snow" },
  decisionTrace: {
    ...decisionTrace,
    traceId: "dt-evidence-snow",
    intentId: "intent-evidence-snow",
    selectedCandidate: { ...selectedCandidate, candidateId: "rc-evidence-snow", intentId: "intent-evidence-snow" },
  },
  context: { season: "February", seasonHardConstraint: true },
  now: () => fixedNow,
});
assert.equal(snowBuilt.bundle.status, "needs-review");
assert.equal(snowBuilt.bundle.seasonality.status, "needs-evidence");
assert(snowBuilt.bundle.unknowns.some((entry) => entry.field === "seasonality"));
assert.deepEqual(snowBuilt.bundle.sources, []);

const mismatchBuilt = buildEvidenceBundleLifecycle({
  selectedCandidate,
  routeRecord: {
    ...routeRecord,
    destinationEntities: [routeRecord.destinationEntities[1], routeRecord.destinationEntities[0], routeRecord.destinationEntities[2]],
  },
  decisionTrace,
  now: () => fixedNow,
});
assert.equal(mismatchBuilt.created, true);
assert.equal(mismatchBuilt.bundle.status, "failed");
assert.equal(mismatchBuilt.bundle.failureReason, "candidate-route-destination-order-mismatch");
assert.equal(validateEvidenceBundleLifecycle(mismatchBuilt.bundle).accepted, true);

const routeIdMismatchBuilt = buildEvidenceBundleLifecycle({
  selectedCandidate,
  routeRecord: { ...routeRecord, selectedCandidateId: "rc-other-candidate" },
  decisionTrace,
  now: () => fixedNow,
});
assert.equal(routeIdMismatchBuilt.bundle.status, "failed");
assert.equal(routeIdMismatchBuilt.bundle.failureReason, "candidate-route-id-mismatch");

const traceIdMismatchBuilt = buildEvidenceBundleLifecycle({
  selectedCandidate,
  routeRecord,
  decisionTrace: { ...decisionTrace, selectedCandidate: { ...decisionTrace.selectedCandidate, candidateId: "rc-other-candidate" } },
  now: () => fixedNow,
});
assert.equal(traceIdMismatchBuilt.bundle.status, "failed");
assert.equal(traceIdMismatchBuilt.bundle.failureReason, "candidate-trace-id-mismatch");

const missingSelected = buildEvidenceBundleLifecycle({ routeRecord, decisionTrace, now: () => fixedNow });
assert.equal(missingSelected.created, false);
assert.equal(missingSelected.reason, "selected-candidate-missing");

assert.equal(isRouteV2EvidenceBundleEnabled({}), false);
const disabledPath = path.join(tempRoot, "disabled", "evidence-bundles.jsonl");
const disabledStore = createEvidenceBundleStore({
  storagePath: disabledPath,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false" },
  now: () => fixedNow,
});
assert.equal(disabledStore.upsertLifecycle(built.bundle).reason, "evidence-bundle-disabled");
assert.deepEqual(disabledStore.listLifecycle(), []);
assert.equal(fs.existsSync(disabledPath), false);

const enabledPath = path.join(tempRoot, "enabled", "evidence-bundles.jsonl");
const enabledStore = createEvidenceBundleStore({
  storagePath: enabledPath,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" },
  now: () => fixedNow,
});
const firstWrite = enabledStore.upsertLifecycle(built.bundle);
assert.equal(firstWrite.persisted, true);
assert.equal(firstWrite.written, true);
const retryWrite = enabledStore.upsertLifecycle(structuredClone(built.bundle));
assert.equal(retryWrite.persisted, true);
assert.equal(retryWrite.skipped, true);
assert.equal(enabledStore.listLifecycle().length, 1);
assert.equal(fs.readFileSync(enabledPath, "utf8").trim().split(/\r?\n/u).length, 1);

const defensive = enabledStore.getLifecycle(built.bundle.evidenceBundleId);
defensive.status = "complete";
defensive.legs[0].fromEntityId = "mutated";
assert.equal(enabledStore.getLifecycle(built.bundle.evidenceBundleId).status, "pending");
assert.equal(enabledStore.getLifecycle(built.bundle.evidenceBundleId).legs[0].fromEntityId, "Q1490");

let updateNow = fixedNow;
const updatePath = path.join(tempRoot, "atomic-update", "evidence-bundles.jsonl");
const updateStore = createEvidenceBundleStore({
  storagePath: updatePath,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" },
  now: () => updateNow,
});
assert.equal(updateStore.upsertLifecycle(built.bundle).persisted, true);
updateNow = "2026-07-21T02:00:00.000Z";
const updatedBundle = { ...built.bundle, status: "collecting" };
assert.equal(updateStore.upsertLifecycle(updatedBundle).persisted, true);
assert.equal(updateStore.listLifecycle().length, 1);
assert.equal(updateStore.listLifecycle()[0].status, "collecting");
assert.equal(updateStore.listLifecycle()[0].createdAt, fixedNow);
assert.equal(updateStore.listLifecycle()[0].updatedAt, updateNow);
assert.equal(fs.existsSync(`${updatePath}.${process.pid}.tmp`), false, "atomic temp file must be removed");

fs.appendFileSync(enabledPath, "{corrupt-json\n", "utf8");
fs.appendFileSync(enabledPath, `${JSON.stringify({ ...built.bundle, evidenceBundleId: "eb-invalid", status: "invalid" })}\n`, "utf8");
fs.appendFileSync(enabledPath, `${JSON.stringify(built.bundle)}\n`, "utf8");
assert.equal(enabledStore.listLifecycle().length, 1, "corrupt, invalid, and duplicate records must be skipped");
const diagnosticTypes = new Set(enabledStore.lifecycleDiagnostics().map((entry) => entry.type));
assert(diagnosticTypes.has("evidence-lifecycle-corrupt-json"));
assert(diagnosticTypes.has("evidence-lifecycle-schema-invalid"));
assert(diagnosticTypes.has("evidence-lifecycle-duplicate"));

const failureTarget = path.join(tempRoot, "write-failure-target");
fs.mkdirSync(failureTarget, { recursive: true });
const failureStore = createEvidenceBundleStore({
  storagePath: failureTarget,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" },
  now: () => fixedNow,
});
const failedWrite = failureStore.upsertLifecycle(built.bundle);
assert.equal(failedWrite.written, false);
assert.equal(failedWrite.persisted, false);
assert.match(failedWrite.reason, /evidence-bundle-(read|write)-failed/u);

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

function plannerHarness(name, { evidenceEnabled = true, evidenceBundleStoreOverride = null, decisionTraceStoreOverride = null } = {}) {
  const root = path.join(tempRoot, `planner-${name}`);
  fs.mkdirSync(root, { recursive: true });
  const candidatePath = path.join(root, "route-candidate-pool.jsonl");
  const tracePath = path.join(root, "decision-traces.jsonl");
  const evidencePath = path.join(root, "evidence-bundles.jsonl");
  const acceptedPath = path.join(root, "accepted-routes.json");
  const env = {
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: evidenceEnabled ? "true" : "false",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ROUTE_V2_TRACE_PATH: tracePath,
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: evidencePath,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(root, "legacy-route-evidence.json") });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: candidatePath, env, now: () => fixedNow });
  const decisionTraceStore = decisionTraceStoreOverride || createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const evidenceBundleStore = evidenceBundleStoreOverride || createEvidenceBundleStore({ storagePath: evidencePath, env, now: () => fixedNow });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository,
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    knowledgeGraph: {
      queryDestinations({ country }) {
        return country === "JP" ? JP_POOL.map((destination) => structuredClone(destination)) : [];
      },
    },
    env,
  });
  return { root, env, candidatePath, tracePath, evidencePath, acceptedPath, acceptedRepository, candidatePoolStore, decisionTraceStore, evidenceBundleStore, planner };
}

const FIXED_SAMPLES = [
  {
    name: "Japan classic first trip, 7 days",
    context: { intentId: "intent-jp-classic-7d-evidence", country: "JP", countryName: "\u65e5\u672c", durationDays: 7, travelStyle: "classic-first-trip", candidateSeed: "jp-classic-7d" },
    expected: "pending",
  },
  {
    name: "Japan rail journey, 9 days",
    context: { intentId: "intent-jp-rail-9d-evidence", country: "JP", countryName: "\u65e5\u672c", durationDays: 9, travelStyle: "rail-journey", transportPreference: ["rail"], candidateSeed: "jp-rail-9d" },
    expected: "pending",
  },
  {
    name: "Japan cultural deep dive, 6 days",
    context: { intentId: "intent-jp-culture-6d-evidence", country: "JP", countryName: "\u65e5\u672c", durationDays: 6, travelStyle: "deep-dive", theme: "\u6587\u5316", candidateSeed: "jp-culture-6d" },
    expected: "pending",
  },
  {
    name: "Eight Japan destinations in one day",
    context: { intentId: "intent-jp-impossible-1d-8-evidence", country: "JP", countryName: "\u65e5\u672c", durationDays: 1, travelStyle: "classic-first-trip", destinations: JP_POOL.map((destination) => destination.name), candidateSeed: "jp-impossible-1d-8" },
    expected: "none",
  },
  {
    name: "February snow rail hard constraint",
    context: { intentId: "intent-jp-snow-rail-feb-evidence", country: "JP", countryName: "\u65e5\u672c", durationDays: 7, travelStyle: "rail-journey", transportPreference: ["rail"], season: "2\u6708", seasonHardConstraint: true, theme: "\u96ea\u5b63", candidateSeed: "jp-snow-rail-feb" },
    expected: "needs-review",
  },
];

let externalFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("Evidence 3A must not call fetch");
};

const sampleResults = [];
try {
  for (const [index, sample] of FIXED_SAMPLES.entries()) {
    const harness = plannerHarness(`sample-${index + 1}`);
    const plannerResult = await harness.planner.buildCandidates({ limit: 1, context: sample.context });
    const candidates = harness.candidatePoolStore.listByIntent(sample.context.intentId);
    const traces = harness.decisionTraceStore.list();
    const bundles = harness.evidenceBundleStore.listLifecycle();
    const record = plannerResult.accepted[0]?.record || null;
    assert.equal(traces.length, 1, `${sample.name}: one DecisionTrace expected`);
    assert.equal(candidates.length, 3, `${sample.name}: three Candidates expected`);
    if (sample.expected === "none") {
      assert.equal(bundles.length, 0, `${sample.name}: rejected V2 request must not create a successful EvidenceBundle`);
      assert.equal(traces[0].outcome, "failure");
      assert.equal(traces[0].selectedCandidate, null);
      assert.equal(fs.existsSync(harness.evidencePath), false);
    } else {
      assert.equal(plannerResult.accepted.length, 1, `${sample.name}: ${JSON.stringify(plannerResult.rejected)}`);
      assert.equal(bundles.length, 1, `${sample.name}: one idempotent EvidenceBundle expected`);
      const bundle = bundles[0];
      const selected = candidates.find((candidate) => candidate.status === "selected");
      assert(selected, `${sample.name}: selected Candidate missing`);
      assert.equal(bundle.status, sample.expected);
      assert.equal(bundle.candidateId, selected.candidateId);
      assert.equal(bundle.candidateId, record.selectedCandidateId);
      assert.equal(bundle.decisionTraceId, record.decisionTraceId);
      assert.equal(bundle.routeRecordId, record.id);
      assert.equal(record.evidenceBundleId, bundle.evidenceBundleId);
      assert.equal(record.evidenceStatus, bundle.status);
      assert.deepEqual(bundle.destinationOrder, selected.proposedOrder);
      assert.deepEqual(bundle.destinationOrder, record.destinationEntities.map((destination) => destination.wikidataId || destination.entityId || destination.id || destination.name));
      assert.equal(bundle.legs.length, bundle.destinationOrder.length - 1);
      assert(bundle.legs.every((leg) => leg.estimatedDurationMinutes === null));
      assert.deepEqual(bundle.sources, []);
      assert.equal(record.v2PublicationStatus, "v2-not-publishable-yet");
      assert.equal(fs.existsSync(harness.acceptedPath), false, `${sample.name}: accepted repository must not be written`);
      if (index === 0) {
        const retry = await harness.planner.buildCandidates({ limit: 1, context: sample.context });
        assert.equal(retry.accepted.length, 1);
        assert.equal(harness.evidenceBundleStore.listLifecycle().length, 1);
        assert.equal(fs.readFileSync(harness.evidencePath, "utf8").trim().split(/\r?\n/u).length, 1);
        assert.equal(retry.accepted[0].record.evidenceBundleId, bundle.evidenceBundleId);
      }
    }
    sampleResults.push({
      name: sample.name,
      candidates: candidates.length,
      selectedCandidateId: traces[0].selectedCandidate?.candidateId || null,
      routeRecordId: record?.id || null,
      evidenceBundleId: bundles[0]?.evidenceBundleId || null,
      evidenceStatus: bundles[0]?.status || null,
      destinationOrder: bundles[0]?.destinationOrder || [],
      sourceCount: bundles[0]?.sources?.length || 0,
      unknownDurationLegs: bundles[0]?.legs?.filter((leg) => leg.estimatedDurationMinutes == null).length || 0,
      failureStage: traces[0].failureStage || null,
      legacyFallback: traces[0].legacyFallback || false,
      publishable: false,
    });
  }

  const flagOff = plannerHarness("flag-off", { evidenceEnabled: false });
  const flagOffResult = await flagOff.planner.buildCandidates({ limit: 1, context: { ...FIXED_SAMPLES[0].context, intentId: "intent-evidence-flag-off" } });
  assert.equal(flagOffResult.accepted.length, 1);
  assert.equal(flagOffResult.accepted[0].record.evidenceBundleId, undefined);
  assert.equal(flagOffResult.accepted[0].record.evidenceStatus, undefined);
  assert.equal(Object.hasOwn(flagOffResult.accepted[0], "evidenceBundleLifecycle"), false);
  assert.equal(fs.existsSync(flagOff.evidencePath), false, "flag off must not create EvidenceBundle storage");

  const initFailureStore = {
    enabled() { throw new Error("injected-evidence-store-init-failure"); },
    upsertLifecycle() { throw new Error("must-not-write-after-init-failure"); },
  };
  const initFailureHarness = plannerHarness("store-init-failure", { evidenceBundleStoreOverride: initFailureStore });
  const initFailureResult = await initFailureHarness.planner.buildCandidates({ limit: 1, context: { ...FIXED_SAMPLES[0].context, intentId: "intent-evidence-init-failure" } });
  assert.equal(initFailureResult.accepted.length, 1, "Evidence store initialization failure must not block Planner");
  assert.equal(initFailureResult.accepted[0].record.evidenceBundleId, undefined);
  assert.equal(initFailureResult.accepted[0].evidenceBundleLifecycle.reason, "evidence-bundle-store-initialization-failed");

  const writeFailureStore = {
    enabled() { return true; },
    upsertLifecycle() { return { written: false, persisted: false, reason: "injected-evidence-write-failure" }; },
  };
  const writeFailureHarness = plannerHarness("store-write-failure", { evidenceBundleStoreOverride: writeFailureStore });
  const writeFailureResult = await writeFailureHarness.planner.buildCandidates({ limit: 1, context: { ...FIXED_SAMPLES[0].context, intentId: "intent-evidence-write-failure" } });
  assert.equal(writeFailureResult.accepted.length, 1, "Evidence write failure must not block Planner");
  assert.equal(writeFailureResult.accepted[0].record.evidenceBundleId, undefined);
  assert.equal(writeFailureResult.accepted[0].evidenceBundleLifecycle.reason, "injected-evidence-write-failure");

  const missingTracePath = path.join(tempRoot, "missing-trace-evidence.jsonl");
  const missingTraceStore = createEvidenceBundleStore({ storagePath: missingTracePath, env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" }, now: () => fixedNow });
  const missingTraceSidecar = await writeEvidenceBundleLifecycleSidecarSafe({
    evidenceBundleStore: missingTraceStore,
    selectedCandidate,
    persistedCandidates: [selectedCandidate],
    routeRecord,
    decisionTraceWrite: { written: true, persisted: false, traceId: decisionTrace.traceId },
    now: () => fixedNow,
  });
  assert.equal(missingTraceSidecar.reason, "decision-trace-not-persisted");
  assert.equal(fs.existsSync(missingTracePath), false);

  const missingCandidateSidecar = await writeEvidenceBundleLifecycleSidecarSafe({
    evidenceBundleStore: missingTraceStore,
    selectedCandidate,
    persistedCandidates: [],
    routeRecord,
    decisionTraceWrite: { written: true, persisted: true, traceId: decisionTrace.traceId },
    now: () => fixedNow,
  });
  assert.equal(missingCandidateSidecar.reason, "selected-candidate-not-persisted");
  assert.equal(fs.existsSync(missingTracePath), false);

  const mismatchPath = path.join(tempRoot, "consistency-mismatch-evidence.jsonl");
  const mismatchStore = createEvidenceBundleStore({ storagePath: mismatchPath, env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" }, now: () => fixedNow });
  const mismatchSidecar = await writeEvidenceBundleLifecycleSidecarSafe({
    evidenceBundleStore: mismatchStore,
    selectedCandidate,
    persistedCandidates: [selectedCandidate],
    routeRecord: { ...routeRecord, destinationEntities: [routeRecord.destinationEntities[1], routeRecord.destinationEntities[0], routeRecord.destinationEntities[2]] },
    decisionTraceWrite: { written: true, persisted: true, traceId: decisionTrace.traceId },
    now: () => fixedNow,
  });
  assert.equal(mismatchSidecar.persisted, true);
  assert.equal(mismatchSidecar.failed, true);
  assert.equal(mismatchSidecar.status, "failed");
  assert.equal(mismatchSidecar.reason, "candidate-route-destination-order-mismatch");
  assert.equal(mismatchStore.listLifecycle()[0].status, "failed");
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(externalFetchCalls, 0, "Evidence 3A must not issue external requests");

console.log(JSON.stringify({
  status: "PASS",
  evidenceBundleId: built.bundle.evidenceBundleId,
  defaultStatus: built.bundle.status,
  snowStatus: snowBuilt.bundle.status,
  sourceCount: built.bundle.sources.length,
  legCount: built.bundle.legs.length,
  idempotentPhysicalRecords: enabledStore.listLifecycle().length,
  diagnostics: [...diagnosticTypes].sort(),
  samples: sampleResults,
  externalFetchCalls,
  plannerFailureIsolation: true,
  acceptedRepositoryWrites: 0,
  tempRoot,
}, null, 2));
