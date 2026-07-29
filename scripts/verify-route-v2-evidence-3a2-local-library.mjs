import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  buildMissingRouteLegEvidence,
  createRouteLegEvidenceId,
  routeLegEvidenceKey,
  validateRouteLegEvidence,
} from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { createRouteLegEvidenceStore } from "../src/lib/routes/route-leg-evidence-store.mjs";
import {
  buildMissingSeasonEvidence,
  createSeasonEvidenceId,
  normalizeEvidenceMonth,
  seasonEvidenceKey,
  validateSeasonEvidence,
} from "../src/lib/routes/season-evidence-schema.mjs";
import { createSeasonEvidenceStore } from "../src/lib/routes/season-evidence-store.mjs";
import {
  buildMissingEvidenceManifestItem,
  createMissingEvidenceId,
  validateMissingEvidenceManifestItem,
} from "../src/lib/routes/missing-evidence-manifest-schema.mjs";
import { createMissingEvidenceManifestStore } from "../src/lib/routes/missing-evidence-manifest-store.mjs";
import { createLocalEvidenceIndex } from "../src/lib/routes/local-evidence-index.mjs";
import {
  createLocalEvidenceRepository,
  isRouteV2LocalEvidenceIndexEnabled,
} from "../src/lib/routes/local-evidence-repository.mjs";
import {
  buildEvidenceBundleLifecycle,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  routeIntentSnapshot,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-07-21T08:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-evidence-3a2-local-library-"));
const enabledEnv = { ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true" };

const tokyoMatsumoto = buildMissingRouteLegEvidence({ fromEntityId: "Q1490", toEntityId: "Q242666", transportMode: "unknown" }, { now: () => fixedNow });
assert.equal(tokyoMatsumoto.created, true);
assert.equal(validateRouteLegEvidence(tokyoMatsumoto.record).accepted, true);
assert.equal(tokyoMatsumoto.record.directed, true);
assert.equal(tokyoMatsumoto.record.feasibilityStatus, "needs-evidence");
assert.equal(tokyoMatsumoto.record.durationMinMinutes, null);
assert.equal(tokyoMatsumoto.record.durationMaxMinutes, null);
assert.equal(tokyoMatsumoto.record.transferCount, null);
assert.equal(tokyoMatsumoto.record.confidence, null);
assert.equal(tokyoMatsumoto.record.retrievedAt, null);
assert.equal(tokyoMatsumoto.record.expiresAt, null);
assert.deepEqual(tokyoMatsumoto.record.sourceRefs, []);
assert.equal(createRouteLegEvidenceId(tokyoMatsumoto.record), tokyoMatsumoto.record.legEvidenceId);
assert.equal(routeLegEvidenceKey(tokyoMatsumoto.record), "Q1490>Q242666|unknown");

const reverseLeg = buildMissingRouteLegEvidence({ fromEntityId: "Q242666", toEntityId: "Q1490", transportMode: "unknown" }, { now: () => fixedNow });
assert.notEqual(reverseLeg.record.legEvidenceId, tokyoMatsumoto.record.legEvidenceId);
assert.equal(buildMissingRouteLegEvidence({ fromEntityId: "Q1490", toEntityId: "Q1490" }).created, false);
assert.equal(buildMissingRouteLegEvidence({ fromEntityId: "Q1490", toEntityId: "Q242666" }).record.transportMode, "unknown");

assert.equal(normalizeEvidenceMonth("2月"), 2);
assert.equal(normalizeEvidenceMonth("February"), 2);
assert.equal(normalizeEvidenceMonth(12), 12);
assert.equal(normalizeEvidenceMonth(0), null);
assert.equal(normalizeEvidenceMonth(13), null);
assert.equal(normalizeEvidenceMonth(""), null);

const febTokyo = buildMissingSeasonEvidence({ entityId: "Q1490", month: 2 }, { now: () => fixedNow });
assert.equal(febTokyo.created, true);
assert.equal(validateSeasonEvidence(febTokyo.record).accepted, true);
assert.equal(febTokyo.record.suitabilityStatus, "needs-evidence");
assert.deepEqual(febTokyo.record.weatherRisks, []);
assert.deepEqual(febTokyo.record.transportRisks, []);
assert.deepEqual(febTokyo.record.closureRisks, []);
assert.equal(febTokyo.record.recommendedBufferMinutes, null);
assert.deepEqual(febTokyo.record.sourceRefs, []);
assert.equal(febTokyo.record.confidence, null);
assert.equal(createSeasonEvidenceId(febTokyo.record), febTokyo.record.seasonEvidenceId);
assert.equal(seasonEvidenceKey(febTokyo.record), "Q1490|2");
assert.notEqual(createSeasonEvidenceId({ entityId: "Q1490", month: 2 }), createSeasonEvidenceId({ entityId: "Q1490", month: 3 }));
assert.equal(buildMissingSeasonEvidence({ entityId: "Q1490", month: 0 }).created, false);

const missingLeg = buildMissingEvidenceManifestItem({
  evidenceType: "route-leg",
  targetKey: routeLegEvidenceKey(tokyoMatsumoto.record),
  legEvidenceId: tokyoMatsumoto.record.legEvidenceId,
  requestedByBundleIds: ["ebl-one"],
  selectedCandidate: true,
  critical: true,
}, { now: () => fixedNow });
assert.equal(missingLeg.created, true);
assert.equal(validateMissingEvidenceManifestItem(missingLeg.record).accepted, true);
assert.equal(missingLeg.record.status, "pending");
assert.equal(missingLeg.record.attemptCount, 0);
assert.equal(createMissingEvidenceId(missingLeg.record), missingLeg.record.missingEvidenceId);

assert.equal(isRouteV2LocalEvidenceIndexEnabled({}), false);

const localRoot = path.join(tempRoot, "local-library");
const legPath = path.join(localRoot, "route-leg-evidence.jsonl");
const seasonPath = path.join(localRoot, "season-evidence.jsonl");
const missingPath = path.join(localRoot, "missing-evidence-manifest.jsonl");
const routeLegStore = createRouteLegEvidenceStore({ storagePath: legPath, env: enabledEnv, now: () => fixedNow });
const seasonStore = createSeasonEvidenceStore({ storagePath: seasonPath, env: enabledEnv, now: () => fixedNow });
const missingStore = createMissingEvidenceManifestStore({ storagePath: missingPath, env: enabledEnv, now: () => fixedNow });

const firstLegWrite = routeLegStore.upsert(tokyoMatsumoto.record);
assert.equal(firstLegWrite.persisted, true);
assert.equal(firstLegWrite.written, true);
assert.equal(routeLegStore.upsert(structuredClone(tokyoMatsumoto.record)).skipped, true);
assert.equal(routeLegStore.upsert(reverseLeg.record).persisted, true);
assert.equal(fs.readFileSync(legPath, "utf8").trim().split(/\r?\n/u).length, 2);

assert.equal(seasonStore.upsert(febTokyo.record).persisted, true);
assert.equal(seasonStore.upsert(structuredClone(febTokyo.record)).skipped, true);
assert.equal(fs.readFileSync(seasonPath, "utf8").trim().split(/\r?\n/u).length, 1);

assert.equal(missingStore.aggregate(missingLeg.record).persisted, true);
assert.equal(missingStore.aggregate(missingLeg.record).skipped, true);
const secondRequest = missingStore.aggregate({
  ...missingLeg.record,
  requestedByBundleIds: ["ebl-two"],
});
assert.equal(secondRequest.persisted, true);
assert.deepEqual(missingStore.get(missingLeg.record.missingEvidenceId).requestedByBundleIds, ["ebl-one", "ebl-two"]);
assert.equal(fs.readFileSync(missingPath, "utf8").trim().split(/\r?\n/u).length, 1);

const localIndex = createLocalEvidenceIndex({ routeLegStore, seasonStore, missingEvidenceStore: missingStore });
const beforeFirstIndexLoad = localIndex.stats();
assert.equal(beforeFirstIndexLoad.loaded, false);
const indexedLeg = localIndex.getRouteLeg({ fromEntityId: "Q1490", toEntityId: "Q242666", transportMode: "unknown" });
assert.equal(indexedLeg.legEvidenceId, tokyoMatsumoto.record.legEvidenceId);
const afterFirstIndexLoad = localIndex.stats();
assert.equal(afterFirstIndexLoad.loadCount, 1);
const parseCountsAfterFirstLoad = structuredClone(afterFirstIndexLoad.storeParseCounts);
assert.equal(localIndex.getRouteLegById(tokyoMatsumoto.record.legEvidenceId).legEvidenceId, tokyoMatsumoto.record.legEvidenceId);
assert.equal(localIndex.getSeason({ entityId: "Q1490", month: "February" }).seasonEvidenceId, febTokyo.record.seasonEvidenceId);
assert.equal(localIndex.getMissing(missingLeg.record.missingEvidenceId).requestedByBundleIds.length, 2);
assert.deepEqual(localIndex.stats().storeParseCounts, parseCountsAfterFirstLoad, "cached queries must not rescan JSONL files");
indexedLeg.fromEntityId = "mutated";
assert.equal(localIndex.getRouteLegById(tokyoMatsumoto.record.legEvidenceId).fromEntityId, "Q1490", "index must return defensive copies");

const matsumotoKyoto = buildMissingRouteLegEvidence({ fromEntityId: "Q242666", toEntityId: "Q34600", transportMode: "unknown" }, { now: () => fixedNow });
assert.equal(routeLegStore.upsert(matsumotoKyoto.record).persisted, true);
assert.equal(localIndex.getRouteLegById(matsumotoKyoto.record.legEvidenceId).toEntityId, "Q34600", "store revision must refresh index");
assert.equal(localIndex.stats().loadCount, 2);
localIndex.reset();
assert.equal(localIndex.stats().loaded, false);
assert.equal(localIndex.getRouteLegById(matsumotoKyoto.record.legEvidenceId).legEvidenceId, matsumotoKyoto.record.legEvidenceId);
assert.equal(localIndex.stats().loadCount, 3);

const baseIntentSnapshot = routeIntentSnapshot({
  context: {
    country: "JP",
    durationDays: 7,
    travelStyle: "rail-journey",
    timeIntent: { type: "single-month", months: [2], season: null, rawText: "2月", diagnostics: [] },
  },
  intentId: "intent-evidence-3a2-sample",
  source: "evidence-3a2-local-library-verifier",
  createdAt: fixedNow,
});
const selectedCandidate = {
  candidateId: "rc-evidence-3a2-sample",
  intentId: "intent-evidence-3a2-sample",
  status: "selected",
  countries: ["JP"],
  destinations: [
    { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo" },
    { id: "Q242666", wikidataId: "Q242666", countryCode: "JP", name: "Matsumoto" },
    { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto" },
  ],
  proposedOrder: ["Q1490", "Q242666", "Q34600"],
  durationDays: 7,
  travelStyle: "rail-journey",
  routeIntentFingerprintVersion: baseIntentSnapshot.routeIntentFingerprintVersion,
  routeIntentFingerprint: baseIntentSnapshot.routeIntentFingerprint,
  normalizedRouteIntent: structuredClone(baseIntentSnapshot.normalizedRouteIntent),
  inputIntentSnapshot: structuredClone(baseIntentSnapshot),
};
const routeRecord = {
  id: "planner-designed-evidence-3a2-sample",
  intentId: selectedCandidate.intentId,
  selectedCandidateId: selectedCandidate.candidateId,
  generationVersion: "route-generation-v2-phase1",
  v2PublicationStatus: "v2-not-publishable-yet",
  destinationEntities: selectedCandidate.destinations.map((destination) => structuredClone(destination)),
  routeIntentFingerprintVersion: selectedCandidate.routeIntentFingerprintVersion,
  routeIntentFingerprint: selectedCandidate.routeIntentFingerprint,
  normalizedRouteIntent: structuredClone(selectedCandidate.normalizedRouteIntent),
};
const decisionTrace = {
  traceId: "dt-evidence-3a2-sample",
  intentId: selectedCandidate.intentId,
  outcome: "success",
  selectedCandidate: structuredClone(selectedCandidate),
  routeIntentFingerprintVersion: selectedCandidate.routeIntentFingerprintVersion,
  routeIntentFingerprint: selectedCandidate.routeIntentFingerprint,
};
const lifecycle = buildEvidenceBundleLifecycle({
  selectedCandidate,
  routeRecord,
  decisionTrace,
  context: { season: "2\u6708", seasonHardConstraint: true },
  now: () => fixedNow,
});
assert.equal(lifecycle.created, true);
const lifecyclePath = path.join(tempRoot, "repository-link", "evidence-bundles.jsonl");
const lifecycleEnv = { ...enabledEnv, ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" };
const lifecycleStore = createEvidenceBundleStore({ storagePath: lifecyclePath, env: lifecycleEnv, now: () => fixedNow });
assert.equal(lifecycleStore.upsertLifecycle(lifecycle.bundle).persisted, true);
const repository = createLocalEvidenceRepository({
  env: lifecycleEnv,
  storageRoot: path.join(tempRoot, "repository-link", "local-evidence"),
  now: () => fixedNow,
});
const linked = await repository.linkEvidenceBundle({
  bundle: lifecycle.bundle,
  routeRecord,
  evidenceBundleStore: lifecycleStore,
  context: { season: "2\u6708", seasonHardConstraint: true },
});
assert.equal(linked.persisted, true);
assert.equal(linked.failed, false);
assert.equal(linked.bundle.status, "needs-review");
assert.equal(linked.bundle.evidenceReferenceMode, "public-evidence-references");
assert.equal(linked.bundle.legEvidenceRefs.length, 2);
assert.equal(linked.bundle.seasonEvidenceRefs.length, 3);
assert.equal(linked.bundle.missingEvidenceRefs.length, 5);
assert.deepEqual(linked.bundle.sources, []);
assert(linked.bundle.legs.every((leg) => leg.estimatedDurationMinutes === null));
assert.equal(validateMissingEvidenceManifestItem(repository.missingEvidenceStore.list()[0]).accepted, true);
assert.equal(repository.routeLegStore.list().length, 2);
assert.equal(repository.seasonStore.list().length, 3);
assert.equal(repository.missingEvidenceStore.list().length, 5);
const linkedRetry = await repository.linkEvidenceBundle({
  bundle: linked.bundle,
  routeRecord,
  evidenceBundleStore: lifecycleStore,
  context: { season: "2\u6708", seasonHardConstraint: true },
});
assert.equal(linkedRetry.persisted, true);
assert.equal(linkedRetry.skipped, true, "unchanged public references must skip the bundle rewrite");
assert.equal(repository.routeLegStore.list().length, 2, "retry must not duplicate route-leg records");
assert.equal(repository.seasonStore.list().length, 3, "retry must not duplicate season records");
assert.equal(repository.missingEvidenceStore.list().length, 5, "retry must not duplicate missing records");

const secondCandidate = {
  ...selectedCandidate,
  candidateId: "rc-evidence-3a2-shared-leg",
  intentId: "intent-evidence-3a2-shared-leg",
};
const secondRoute = {
  ...routeRecord,
  id: "planner-designed-evidence-3a2-shared-leg",
  intentId: secondCandidate.intentId,
  selectedCandidateId: secondCandidate.candidateId,
};
const secondTrace = {
  ...decisionTrace,
  traceId: "dt-evidence-3a2-shared-leg",
  intentId: secondCandidate.intentId,
  selectedCandidate: structuredClone(secondCandidate),
};
const secondLifecycle = buildEvidenceBundleLifecycle({
  selectedCandidate: secondCandidate,
  routeRecord: secondRoute,
  decisionTrace: secondTrace,
  context: { season: "2\u6708" },
  now: () => fixedNow,
});
assert.equal(lifecycleStore.upsertLifecycle(secondLifecycle.bundle).persisted, true);
const secondLinked = await repository.linkEvidenceBundle({
  bundle: secondLifecycle.bundle,
  routeRecord: secondRoute,
  evidenceBundleStore: lifecycleStore,
  context: { season: "2\u6708" },
});
assert.equal(secondLinked.persisted, true);
assert.deepEqual(secondLinked.legEvidenceRefs, linked.legEvidenceRefs, "same directed legs must reuse IDs");
assert.deepEqual(secondLinked.seasonEvidenceRefs, linked.seasonEvidenceRefs, "same city-month evidence must reuse IDs");
assert.equal(repository.routeLegStore.list().length, 2);
assert.equal(repository.seasonStore.list().length, 3);
assert.equal(repository.missingEvidenceStore.list().length, 5);
assert(repository.missingEvidenceStore.list().every((item) => item.requestedByBundleIds.length === 2));

const mismatchLink = await repository.linkEvidenceBundle({
  bundle: lifecycle.bundle,
  routeRecord: { ...routeRecord, destinationEntities: [...routeRecord.destinationEntities].reverse() },
  evidenceBundleStore: lifecycleStore,
  context: { season: "2\u6708" },
});
assert.equal(mismatchLink.failed, true);
assert.equal(mismatchLink.reason, "local-evidence-destination-order-mismatch");

const duplicateDestinationLink = await repository.linkEvidenceBundle({
  bundle: {
    ...lifecycle.bundle,
    destinationOrder: ["Q1490", "Q1490", "Q34600"],
  },
  routeRecord: {
    ...routeRecord,
    destinationEntities: [
      routeRecord.destinationEntities[0],
      routeRecord.destinationEntities[0],
      routeRecord.destinationEntities[2],
    ],
  },
  evidenceBundleStore: lifecycleStore,
});
assert.equal(duplicateDestinationLink.failed, true);
assert.equal(duplicateDestinationLink.reason, "local-evidence-destination-order-duplicate");

const disabledRoot = path.join(tempRoot, "disabled-local-library");
const disabledRepository = createLocalEvidenceRepository({ env: {}, storageRoot: disabledRoot, now: () => fixedNow });
const disabledLink = await disabledRepository.linkEvidenceBundle({ bundle: lifecycle.bundle, routeRecord, evidenceBundleStore: lifecycleStore });
assert.equal(disabledLink.enabled, false);
assert.equal(fs.existsSync(disabledRoot), false, "flag off must not create local evidence storage");

const performanceRoot = path.join(tempRoot, "performance");
const performanceLegStore = createRouteLegEvidenceStore({ storagePath: path.join(performanceRoot, "legs.jsonl"), env: enabledEnv, now: () => fixedNow });
const performanceSeasonStore = createSeasonEvidenceStore({ storagePath: path.join(performanceRoot, "seasons.jsonl"), env: enabledEnv, now: () => fixedNow });
const performanceMissingStore = createMissingEvidenceManifestStore({ storagePath: path.join(performanceRoot, "missing.jsonl"), env: enabledEnv, now: () => fixedNow });
const performanceLegs = Array.from({ length: 1200 }, (_, index) => buildMissingRouteLegEvidence({
  fromEntityId: `QPERF${index}`,
  toEntityId: `QPERF${index + 1}`,
  transportMode: "unknown",
}, { now: () => fixedNow }).record);
const performanceSeasons = Array.from({ length: 1200 }, (_, index) => buildMissingSeasonEvidence({
  entityId: `QPERF${index}`,
  month: 2,
}, { now: () => fixedNow }).record);
assert.equal(performanceLegStore.upsertMany(performanceLegs).persisted, true);
assert.equal(performanceSeasonStore.upsertMany(performanceSeasons).persisted, true);
const aggregationStartedAt = performance.now();
assert.equal(performanceMissingStore.aggregateMany(performanceLegs.map((record, index) => ({
  evidenceType: "route-leg",
  targetKey: routeLegEvidenceKey(record),
  legEvidenceId: record.legEvidenceId,
  requestedByBundleIds: [`ebl-performance-${index % 10}`],
  selectedCandidate: true,
}))).persisted, true);
const aggregationMs = performance.now() - aggregationStartedAt;
const performanceIndex = createLocalEvidenceIndex({
  routeLegStore: performanceLegStore,
  seasonStore: performanceSeasonStore,
  missingEvidenceStore: performanceMissingStore,
});
const performanceRouteOrder = Array.from({ length: 6 }, (_, index) => `QPERF${index}`);
const coldLoadStartedAt = performance.now();
const firstAggregation = performanceIndex.getRouteEvidence({
  destinationOrder: performanceRouteOrder,
  transportMode: "unknown",
  month: 2,
});
const coldLoadMs = performance.now() - coldLoadStartedAt;
assert.equal(firstAggregation.routeLegEvidence.filter(Boolean).length, 5);
assert.equal(firstAggregation.seasonEvidence.filter(Boolean).length, 6);
const hotAggregationStartedAt = performance.now();
for (let index = 0; index < 1000; index += 1) {
  const aggregate = performanceIndex.getRouteEvidence({
    destinationOrder: performanceRouteOrder,
    transportMode: "unknown",
    month: 2,
  });
  assert.equal(aggregate.routeLegEvidence.filter(Boolean).length, 5);
}
const hotAggregationTotalMs = performance.now() - hotAggregationStartedAt;
const hotAggregationAverageMs = hotAggregationTotalMs / 1000;
const queryStartedAt = performance.now();
for (let index = 0; index < 1200; index += 1) {
  assert.equal(performanceIndex.getRouteLegById(performanceLegs[index].legEvidenceId).legEvidenceId, performanceLegs[index].legEvidenceId);
}
const queryTotalMs = performance.now() - queryStartedAt;
const queryAverageMs = queryTotalMs / 1200;
assert.equal(performanceIndex.stats().loadCount, 1, "1200 indexed queries must share one snapshot load");

fs.appendFileSync(legPath, "{corrupt-json\n", "utf8");
fs.appendFileSync(legPath, `${JSON.stringify({ ...tokyoMatsumoto.record, legEvidenceId: "invalid-id", fromEntityId: "" })}\n`, "utf8");
fs.appendFileSync(legPath, `${JSON.stringify(tokyoMatsumoto.record)}\n`, "utf8");
localIndex.reset();
assert.equal(localIndex.getRouteLegById(tokyoMatsumoto.record.legEvidenceId).legEvidenceId, tokyoMatsumoto.record.legEvidenceId);
const invalidDiagnosticTypes = new Set(routeLegStore.diagnostics().map((entry) => entry.type));
assert(invalidDiagnosticTypes.has("route-leg-evidence-corrupt-json"));
assert(invalidDiagnosticTypes.has("route-leg-evidence-schema-invalid"));
assert(invalidDiagnosticTypes.has("route-leg-evidence-duplicate"));

const emptyRoot = path.join(tempRoot, "empty-library");
const emptyLegStore = createRouteLegEvidenceStore({ storagePath: path.join(emptyRoot, "legs.jsonl"), env: enabledEnv, now: () => fixedNow });
const emptySeasonStore = createSeasonEvidenceStore({ storagePath: path.join(emptyRoot, "seasons.jsonl"), env: enabledEnv, now: () => fixedNow });
const emptyMissingStore = createMissingEvidenceManifestStore({ storagePath: path.join(emptyRoot, "missing.jsonl"), env: enabledEnv, now: () => fixedNow });
const emptyIndex = createLocalEvidenceIndex({ routeLegStore: emptyLegStore, seasonStore: emptySeasonStore, missingEvidenceStore: emptyMissingStore });
assert.equal(emptyIndex.getRouteLegById("rle-missing"), null);
assert.equal(emptyIndex.getSeason({ entityId: "Q1", month: 1 }), null);
assert.equal(emptyIndex.getMissing("me-missing"), null);
assert.equal(fs.existsSync(emptyRoot), false, "reading an empty evidence library must not create directories");

const atomicFailureParent = path.join(tempRoot, "atomic-write-failure-parent");
fs.writeFileSync(atomicFailureParent, "not-a-directory", "utf8");
const atomicFailureTarget = path.join(atomicFailureParent, "route-leg-evidence.jsonl");
const atomicFailureStore = createRouteLegEvidenceStore({ storagePath: atomicFailureTarget, env: enabledEnv, now: () => fixedNow });
const atomicFailure = atomicFailureStore.upsert(tokyoMatsumoto.record);
assert.equal(atomicFailure.persisted, false);
assert.equal(atomicFailure.reason, "route-leg-evidence-write-failed");
assert.equal(fs.existsSync(`${atomicFailureTarget}.${process.pid}.tmp`), false, "failed atomic writes must remove temp files");

const concurrentPath = path.join(tempRoot, "concurrent", "legs.jsonl");
const concurrentStore = createRouteLegEvidenceStore({ storagePath: concurrentPath, env: enabledEnv, now: () => fixedNow });
await Promise.all(Array.from({ length: 20 }, async () => concurrentStore.upsert(structuredClone(tokyoMatsumoto.record))));
assert.equal(concurrentStore.list().length, 1, "repeated concurrent upsert attempts must remain idempotent");
assert.equal(fs.readFileSync(concurrentPath, "utf8").trim().split(/\r?\n/u).length, 1);

let mutableNow = fixedNow;
const updateStore = createRouteLegEvidenceStore({ storagePath: path.join(tempRoot, "updates", "legs.jsonl"), env: enabledEnv, now: () => mutableNow });
assert.equal(updateStore.upsert(tokyoMatsumoto.record).persisted, true);
mutableNow = "2026-07-21T09:00:00.000Z";
assert.equal(updateStore.upsert({
  ...tokyoMatsumoto.record,
  diagnostics: [{ field: "audit", reason: "Local schema-only audit marker." }],
}).persisted, true);
const updatedLegRecord = updateStore.get(tokyoMatsumoto.record.legEvidenceId);
assert.equal(updatedLegRecord.createdAt, fixedNow);
assert.equal(updatedLegRecord.updatedAt, mutableNow);

const failingIndex = createLocalEvidenceIndex({
  routeLegStore: { revision: () => 0, parseCount: () => 0, list() { throw new Error("injected-index-load-failure"); } },
  seasonStore: { revision: () => 0, parseCount: () => 0, list: () => [] },
  missingEvidenceStore: { revision: () => 0, parseCount: () => 0, list: () => [] },
});
assert.throws(() => failingIndex.getRouteLegById("rle-any"), /injected-index-load-failure/u);

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

const FIXED_SAMPLES = [
  {
    name: "Japan classic first trip, 7 days",
    context: { intentId: "intent-jp-classic-7d-evidence-3a2", country: "JP", countryName: "\u65e5\u672c", durationDays: 7, travelStyle: "classic-first-trip", candidateSeed: "jp-classic-7d" },
    expectedStatus: "pending",
  },
  {
    name: "Japan rail journey, 9 days",
    context: { intentId: "intent-jp-rail-9d-evidence-3a2", country: "JP", countryName: "\u65e5\u672c", durationDays: 9, travelStyle: "rail-journey", transportPreference: ["rail"], candidateSeed: "jp-rail-9d" },
    expectedStatus: "pending",
  },
  {
    name: "Japan cultural deep dive, 6 days",
    context: { intentId: "intent-jp-culture-6d-evidence-3a2", country: "JP", countryName: "\u65e5\u672c", durationDays: 6, travelStyle: "deep-dive", theme: "\u6587\u5316", candidateSeed: "jp-culture-6d" },
    expectedStatus: "pending",
  },
  {
    name: "Eight Japan destinations in one day",
    context: { intentId: "intent-jp-impossible-1d-8-evidence-3a2", country: "JP", countryName: "\u65e5\u672c", durationDays: 1, travelStyle: "classic-first-trip", destinations: JP_POOL.map((destination) => destination.name), candidateSeed: "jp-impossible-1d-8" },
    expectedStatus: "none",
  },
  {
    name: "February snow rail hard constraint",
    context: { intentId: "intent-jp-snow-rail-feb-evidence-3a2", country: "JP", countryName: "\u65e5\u672c", durationDays: 7, travelStyle: "rail-journey", transportPreference: ["rail"], season: "2\u6708", seasonHardConstraint: true, theme: "\u96ea\u5b63", candidateSeed: "jp-snow-rail-feb" },
    expectedStatus: "needs-review",
  },
];

function plannerHarness(name, {
  localEnabled = true,
  localEvidenceRepositoryOverride = null,
} = {}) {
  const root = path.join(tempRoot, `planner-${name}`);
  const candidatePath = path.join(root, "route-candidate-pool.jsonl");
  const tracePath = path.join(root, "decision-traces.jsonl");
  const evidencePath = path.join(root, "evidence-bundles.jsonl");
  const acceptedPath = path.join(root, "accepted-routes.json");
  const localEvidenceRoot = path.join(root, "local-evidence");
  const env = {
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: localEnabled ? "true" : "false",
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
  const decisionTraceStore = createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const evidenceBundleStore = createEvidenceBundleStore({ storagePath: evidencePath, env, now: () => fixedNow });
  const localEvidenceRepository = localEvidenceRepositoryOverride || createLocalEvidenceRepository({
    env,
    storageRoot: localEvidenceRoot,
    now: () => fixedNow,
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository,
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    knowledgeGraph: {
      queryDestinations({ country }) {
        return country === "JP" ? JP_POOL.map((destination) => structuredClone(destination)) : [];
      },
    },
    env,
  });
  return {
    root,
    env,
    planner,
    acceptedPath,
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    localEvidenceRoot,
  };
}

let externalFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("Evidence 3A-2 must not call fetch");
};

const sampleResults = [];
let flagOffComparable = null;
let flagOnComparable = null;
try {
  for (const [index, sample] of FIXED_SAMPLES.entries()) {
    const harness = plannerHarness(`sample-${index + 1}`);
    const plannerResult = await harness.planner.buildCandidates({ limit: 1, context: sample.context });
    const candidates = harness.candidatePoolStore.listByIntent(sample.context.intentId);
    const traces = harness.decisionTraceStore.list();
    const bundles = harness.evidenceBundleStore.listLifecycle();
    const record = plannerResult.accepted[0]?.record || null;
    assert.equal(candidates.length, 3, `${sample.name}: three candidates expected`);
    assert.equal(traces.length, 1, `${sample.name}: one decision trace expected`);
    if (sample.expectedStatus === "none") {
      assert.equal(bundles.length, 0, `${sample.name}: failed V2 request must not create EvidenceBundle`);
      assert.equal(fs.existsSync(harness.localEvidenceRoot), false, `${sample.name}: failed request must not create local evidence storage`);
      assert.equal(traces[0].outcome, "failure");
      assert.equal(traces[0].selectedCandidate, null);
    } else {
      assert.equal(plannerResult.accepted.length, 1, `${sample.name}: ${JSON.stringify(plannerResult.rejected)}`);
      assert.equal(bundles.length, 1, `${sample.name}: one EvidenceBundle expected`);
      const bundle = bundles[0];
      const selected = candidates.find((candidate) => candidate.status === "selected");
      assert(selected, `${sample.name}: selected candidate missing`);
      assert.equal(bundle.status, sample.expectedStatus);
      assert.equal(bundle.evidenceReferenceMode, "public-evidence-references");
      assert.equal(bundle.candidateId, selected.candidateId);
      assert.equal(bundle.routeRecordId, record.id);
      assert.equal(bundle.decisionTraceId, record.decisionTraceId);
      assert.deepEqual(bundle.destinationOrder, selected.proposedOrder);
      assert.deepEqual(bundle.destinationOrder, record.destinationEntities.map((destination) => destination.wikidataId || destination.entityId || destination.id || destination.name));
      assert.equal(bundle.legEvidenceRefs.length, bundle.destinationOrder.length - 1);
      assert.deepEqual(bundle.sources, []);
      assert(bundle.legs.every((leg) => leg.estimatedDurationMinutes === null));
      assert.equal(record.v2PublicationStatus, "v2-not-publishable-yet");
      assert.equal(fs.existsSync(harness.acceptedPath), false, `${sample.name}: accepted repository must not be written`);
      const legRecords = harness.localEvidenceRepository.routeLegStore.list();
      const seasonRecords = harness.localEvidenceRepository.seasonStore.list();
      const missingRecords = harness.localEvidenceRepository.missingEvidenceStore.list();
      assert.equal(legRecords.length, bundle.legEvidenceRefs.length);
      assert(legRecords.every((leg) => leg.sourceRefs.length === 0 && leg.durationMinMinutes == null && leg.durationMaxMinutes == null));
      bundle.legEvidenceRefs.forEach((legEvidenceId, legIndex) => {
        const leg = harness.localEvidenceRepository.index.getRouteLegById(legEvidenceId);
        assert.equal(leg.fromEntityId, bundle.destinationOrder[legIndex]);
        assert.equal(leg.toEntityId, bundle.destinationOrder[legIndex + 1]);
      });
      assert.equal(missingRecords.length, bundle.missingEvidenceRefs.length);
      if (index === 4) {
        assert.equal(seasonRecords.length, bundle.destinationOrder.length);
        assert.equal(bundle.seasonEvidenceRefs.length, bundle.destinationOrder.length);
        assert(seasonRecords.every((season) => season.month === 2 && season.sourceRefs.length === 0));
      } else {
        assert.equal(seasonRecords.length, 0);
        assert.equal(bundle.seasonEvidenceRefs.length, 0);
      }
      if (index === 0) {
        const beforeCounts = {
          legs: legRecords.length,
          seasons: seasonRecords.length,
          missing: missingRecords.length,
        };
        const retry = await harness.planner.buildCandidates({ limit: 1, context: sample.context });
        assert.equal(retry.accepted.length, 1);
        assert.equal(retry.accepted[0].evidenceBundleLifecycle.localEvidence.skipped, true, "unchanged Planner retry must skip public reference rewrite");
        assert.equal(harness.evidenceBundleStore.listLifecycle().length, 1);
        assert.deepEqual({
          legs: harness.localEvidenceRepository.routeLegStore.list().length,
          seasons: harness.localEvidenceRepository.seasonStore.list().length,
          missing: harness.localEvidenceRepository.missingEvidenceStore.list().length,
        }, beforeCounts, "idempotent planner retry must not append local evidence records");
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
      legEvidenceRefs: bundles[0]?.legEvidenceRefs?.length || 0,
      seasonEvidenceRefs: bundles[0]?.seasonEvidenceRefs?.length || 0,
      missingEvidenceRefs: bundles[0]?.missingEvidenceRefs?.length || 0,
      sourceCount: bundles[0]?.sources?.length || 0,
      failureStage: traces[0].failureStage || null,
      legacyFallback: traces[0].legacyFallback || false,
      publishable: false,
    });
  }

  const flagOffHarness = plannerHarness("local-flag-off", { localEnabled: false });
  const flagOffContext = { ...FIXED_SAMPLES[0].context, intentId: "intent-local-evidence-flag-comparison" };
  const flagOffResult = await flagOffHarness.planner.buildCandidates({ limit: 1, context: flagOffContext });
  assert.equal(flagOffResult.accepted.length, 1);
  assert.equal(fs.existsSync(flagOffHarness.localEvidenceRoot), false);
  const flagOffBundle = flagOffHarness.evidenceBundleStore.listLifecycle()[0];
  assert.equal(flagOffBundle.evidenceReferenceMode, "embedded-compatibility");
  assert.deepEqual(flagOffBundle.legEvidenceRefs, []);
  assert.deepEqual(flagOffBundle.seasonEvidenceRefs, []);
  assert.deepEqual(flagOffBundle.missingEvidenceRefs, []);
  flagOffComparable = {
    selectedCandidateId: flagOffResult.accepted[0].record.selectedCandidateId,
    routeRecordId: flagOffResult.accepted[0].record.id,
    destinationOrder: flagOffResult.accepted[0].record.destinationEntities.map((destination) => destination.wikidataId),
  };

  const flagOnHarness = plannerHarness("local-flag-on-comparison", { localEnabled: true });
  const flagOnResult = await flagOnHarness.planner.buildCandidates({ limit: 1, context: flagOffContext });
  assert.equal(flagOnResult.accepted.length, 1);
  flagOnComparable = {
    selectedCandidateId: flagOnResult.accepted[0].record.selectedCandidateId,
    routeRecordId: flagOnResult.accepted[0].record.id,
    destinationOrder: flagOnResult.accepted[0].record.destinationEntities.map((destination) => destination.wikidataId),
  };
  assert.deepEqual(flagOnComparable, flagOffComparable, "local evidence flag must not change planner selection or final route");

  const throwingLocalRepository = {
    async linkEvidenceBundle() {
      throw new Error("injected-local-index-initialization-failure");
    },
  };
  const initFailureHarness = plannerHarness("local-index-init-failure", { localEvidenceRepositoryOverride: throwingLocalRepository });
  const initFailureResult = await initFailureHarness.planner.buildCandidates({
    limit: 1,
    context: { ...FIXED_SAMPLES[0].context, intentId: "intent-local-index-init-failure" },
  });
  assert.equal(initFailureResult.accepted.length, 1, "local index initialization failure must not block planner");
  assert.equal(initFailureResult.accepted[0].evidenceBundleLifecycle.persisted, true);
  assert.equal(initFailureResult.accepted[0].evidenceBundleLifecycle.localEvidence.failed, true);

  const writeFailureRepository = {
    async linkEvidenceBundle() {
      return { enabled: true, persisted: false, failed: true, reason: "injected-local-evidence-write-failure" };
    },
  };
  const writeFailureHarness = plannerHarness("local-write-failure", { localEvidenceRepositoryOverride: writeFailureRepository });
  const writeFailureResult = await writeFailureHarness.planner.buildCandidates({
    limit: 1,
    context: { ...FIXED_SAMPLES[0].context, intentId: "intent-local-write-failure" },
  });
  assert.equal(writeFailureResult.accepted.length, 1, "local evidence write failure must not block planner");
  assert.equal(writeFailureResult.accepted[0].evidenceBundleLifecycle.persisted, true);
  assert.equal(writeFailureResult.accepted[0].evidenceBundleLifecycle.localEvidence.reason, "injected-local-evidence-write-failure");
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(externalFetchCalls, 0, "Evidence 3A-2 must not issue external requests");

console.log(JSON.stringify({
  status: "PASS",
  routeLegEvidenceId: tokyoMatsumoto.record.legEvidenceId,
  reverseLegEvidenceId: reverseLeg.record.legEvidenceId,
  seasonEvidenceId: febTokyo.record.seasonEvidenceId,
  missingEvidenceId: missingLeg.record.missingEvidenceId,
  tempRoot,
  index: localIndex.stats(),
  reuse: {
    routeLegRecords: repository.routeLegStore.list().length,
    seasonRecords: repository.seasonStore.list().length,
    missingRecords: repository.missingEvidenceStore.list().length,
    requestingBundlesPerMissingItem: repository.missingEvidenceStore.list()[0].requestedByBundleIds.length,
  },
  performance: {
    recordCount: 1200,
    aggregationMs: Number(aggregationMs.toFixed(3)),
    coldLoadMs: Number(coldLoadMs.toFixed(3)),
    firstRouteAggregationMs: Number(coldLoadMs.toFixed(3)),
    hotRouteAggregationTotalMs: Number(hotAggregationTotalMs.toFixed(3)),
    hotRouteAggregationAverageMs: Number(hotAggregationAverageMs.toFixed(6)),
    queryTotalMs: Number(queryTotalMs.toFixed(3)),
    queryAverageMs: Number(queryAverageMs.toFixed(6)),
    indexLoadCount: performanceIndex.stats().loadCount,
  },
  diagnostics: [...invalidDiagnosticTypes].sort(),
  samples: sampleResults,
  featureFlagComparison: {
    defaultEnabled: isRouteV2LocalEvidenceIndexEnabled({}),
    plannerOutputUnchanged: JSON.stringify(flagOffComparable) === JSON.stringify(flagOnComparable),
  },
  faultIsolation: {
    indexInitializationFailure: true,
    localWriteFailure: true,
    destinationOrderMismatch: true,
    schemaInvalidAndCorruptRecordsSkipped: true,
  },
  externalFetchCalls,
}, null, 2));
