import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";
import {
  createAcceptedRouteRepository,
  createEvidenceBundleId,
  createEvidenceBundleStore,
  createRouteCandidateId,
  createDecisionTraceId,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  isRouteV2EvidenceBundleEnabled,
  normalizeEvidenceBundle,
  validateEvidenceBundle,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-01-01T00:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase3a-evidence-"));

const acceptedRepositoryPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const realCandidatePoolPath = defaultRouteCandidatePoolPath();
const realDecisionTracePath = defaultDecisionTracePath();
const realEvidenceBundlePath = defaultRouteEvidenceBundlePath();
const protectedPaths = [
  acceptedRepositoryPath,
  bootstrapPath,
  realCandidatePoolPath,
  realDecisionTracePath,
  realEvidenceBundlePath,
];
const protectedBefore = statesFor(protectedPaths);

assert.equal(isRouteV2EvidenceBundleEnabled({}), false, "EvidenceBundle feature flag must default to false");
assert.equal(isRouteV2EvidenceBundleEnabled({ ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "" }), false, "empty flag must stay false");
assert.equal(isRouteV2EvidenceBundleEnabled({ ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" }), true, "true flag should enable store");

const candidateId = "rc-5bd691815c0bfa25ad41";
const intentId = "intent-japan-8d-first-trip";
const baseBundle = {
  candidateId,
  intentId,
  generationSource: "phase3a-test-candidate-builder",
  createdAt: fixedNow,
  items: [
    {
      status: "verified",
      sourceType: "knowledge-graph",
      sourceId: "Q1490",
      evidenceCategory: "destination-identity",
      extractedFacts: { name: "Tokyo", countryCode: "JP" },
      supportsWhichDecision: ["destination-inclusion"],
      confidence: 1,
      freshness: "local-snapshot",
      matchMethod: "kg-id",
    },
    {
      status: "weak_signal",
      sourceType: "candidate-builder",
      sourceId: "phase2b1",
      evidenceCategory: "duration-fit",
      extractedFacts: { durationDays: 8, destinationCount: 3 },
      supportsWhichDecision: ["duration-feasibility"],
      confidence: 0.6,
      matchMethod: "local-heuristic",
    },
    {
      status: "unknown",
      sourceType: "",
      evidenceCategory: "transport-evidence",
      extractedFacts: {},
      supportsWhichDecision: ["transport-feasibility"],
      unknownReason: "Phase 3A does not collect transport evidence.",
    },
    {
      status: "failed",
      sourceType: "web-search",
      evidenceCategory: "seasonal-evidence",
      extractedFacts: {},
      supportsWhichDecision: ["season-feasibility"],
      failureReason: "provider-not-configured",
    },
  ],
  unknowns: [
    { field: "budgetEvidence", reason: "Phase 3A does not collect budget evidence." },
  ],
  failures: [
    { field: "wikivoyageEvidence", reason: "online evidence is disabled in Phase 3A.", sourceType: "wikivoyage" },
  ],
  summary: { verified: 999, weak_signal: 999, unknown: 999, failed: 999, total: 999 },
};

const normalized = normalizeEvidenceBundle(baseBundle, { now: () => fixedNow });
assert.equal(validateEvidenceBundle(normalized).accepted, true, "valid normalized EvidenceBundle should pass validation");
assert.deepEqual(normalized.summary, {
  verified: 1,
  weak_signal: 1,
  unknown: 2,
  failed: 2,
  totalItems: 4,
  totalUnknowns: 1,
  totalFailures: 1,
  total: 6,
}, "summary must be recomputed from items, unknowns, and failures");

const sameId = createEvidenceBundleId(baseBundle);
assert.equal(normalized.evidenceBundleId, sameId, "EvidenceBundle ID should be stable for the same semantic input");

const reorderedKeysBundle = {
  failures: baseBundle.failures,
  summary: { ignored: true },
  unknowns: baseBundle.unknowns,
  items: [
    {
      supportsWhichDecision: ["destination-inclusion"],
      extractedFacts: { countryCode: "JP", name: "Tokyo" },
      evidenceCategory: "destination-identity",
      sourceId: "Q1490",
      confidence: 1,
      status: "verified",
      matchMethod: "kg-id",
      sourceType: "knowledge-graph",
      freshness: "local-snapshot",
    },
    baseBundle.items[1],
    baseBundle.items[2],
    baseBundle.items[3],
  ],
  generationSource: baseBundle.generationSource,
  intentId: baseBundle.intentId,
  candidateId: baseBundle.candidateId,
  createdAt: "2035-12-31T23:59:59.000Z",
};
assert.equal(createEvidenceBundleId(reorderedKeysBundle), sameId, "object key order must not affect EvidenceBundle ID");

const timeChanged = { ...baseBundle, createdAt: "2040-01-01T00:00:00.000Z" };
assert.equal(createEvidenceBundleId(timeChanged), sameId, "createdAt must not affect EvidenceBundle ID");

const mismatchedId = validateEvidenceBundle({ ...baseBundle, evidenceBundleId: "eb-wrong" });
assert.equal(mismatchedId.accepted, false, "mismatched caller-provided EvidenceBundle ID should be rejected");
assert(mismatchedId.reasons.includes("evidenceBundleId-mismatch"));

const invalidStatus = validateEvidenceBundle({
  ...baseBundle,
  items: [{ ...baseBundle.items[0], status: "selected" }],
});
assert.equal(invalidStatus.accepted, false, "invalid evidence status should be rejected");
assert(invalidStatus.reasons.some((reason) => reason.includes("status-invalid")));

const invalidItem = validateEvidenceBundle({
  ...baseBundle,
  items: [{ ...baseBundle.items[0], evidenceCategory: "", supportsWhichDecision: [] }],
});
assert.equal(invalidItem.accepted, false, "invalid evidence item should be rejected");
assert(invalidItem.reasons.some((reason) => reason.includes("evidenceCategory-required")));
assert(invalidItem.reasons.some((reason) => reason.includes("supportsWhichDecision-required")));

for (const poison of [
  { title: "Final route title must be rejected" },
  { summary: "Final route summary text must be rejected" },
  { plannerReason: "Post-hoc planner reason" },
  { recommendationText: "Display recommendation" },
  { coverUrl: "https://example.invalid/cover.jpg" },
  { routeId: "route-final" },
  { acceptedAt: fixedNow },
  { contentQualityStatus: "accepted" },
]) {
  const validation = validateEvidenceBundle({ ...baseBundle, ...poison });
  assert.equal(validation.accepted, false, `final RouteRecord field was accepted: ${Object.keys(poison)[0]}`);
  assert(validation.reasons.some((reason) => reason.startsWith("forbidden-final-route-field:")));
}

const itemPoison = validateEvidenceBundle({
  ...baseBundle,
  items: [{ ...baseBundle.items[0], plannerReason: "not evidence" }],
});
assert.equal(itemPoison.accepted, false, "forbidden final fields inside evidence items should be rejected");

const summaryPoison = validateEvidenceBundle({
  ...baseBundle,
  summary: { routeSummaryText: "This must not be accepted as structured evidence summary." },
});
assert.equal(summaryPoison.accepted, false, "summary must only accept structural count fields");
assert(summaryPoison.reasons.some((reason) => reason.startsWith("summary-unsupported-key:")));

const disabledPath = path.join(tempRoot, "disabled", "route-evidence-bundles.jsonl");
const disabledStore = createEvidenceBundleStore({
  storagePath: disabledPath,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false" },
  now: () => fixedNow,
});
const disabledWrite = disabledStore.append(baseBundle);
assert.equal(disabledWrite.reason, "evidence-bundle-disabled");
assert.equal(fs.existsSync(disabledPath), false, "flag off must not create test EvidenceBundle storage");

const enabledPath = path.join(tempRoot, "enabled", "route-evidence-bundles.jsonl");
const enabledStore = createEvidenceBundleStore({
  storagePath: enabledPath,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" },
  now: () => fixedNow,
});
const write = enabledStore.append(baseBundle);
assert.equal(write.written, true, "valid EvidenceBundle should write when flag is enabled");
assert.equal(write.evidenceBundleId, sameId);

const invalidWrite = enabledStore.append({ ...baseBundle, items: [{ ...baseBundle.items[0], status: "invalid" }] });
assert.equal(invalidWrite.written, false, "invalid EvidenceBundle should not be written");
assert.equal(invalidWrite.reason, "evidence-bundle-invalid");

const records = enabledStore.readAll();
assert.equal(records.length, 1, "JSONL should contain only one valid EvidenceBundle line");
assert.equal(records[0].ok, true);
assert.equal(records[0].validation.accepted, true);
assert.equal(enabledStore.listByCandidate(candidateId).length, 1, "read helper should filter by candidateId");
for (const line of fs.readFileSync(enabledPath, "utf8").trim().split(/\r?\n/u)) {
  assert.doesNotThrow(() => JSON.parse(line), "each JSONL line should parse");
}

const failureDir = path.join(tempRoot, "write-failure-target");
fs.mkdirSync(failureDir, { recursive: true });
const failureStore = createEvidenceBundleStore({
  storagePath: failureDir,
  env: { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true" },
  now: () => fixedNow,
});
const failureWrite = failureStore.append(baseBundle);
assert.equal(failureWrite.written, false, "write failure should be captured");
assert.equal(failureWrite.reason, "evidence-bundle-write-failed");

const acceptedCopyPath = path.join(tempRoot, "accepted-routes-copy.json");
fs.copyFileSync(acceptedRepositoryPath, acceptedCopyPath);
const repository = createAcceptedRouteRepository({ storagePath: acceptedCopyPath });
const feedCounts = {
  all: repository.list({ limit: 99999 }).total,
  cross: repository.list({ limit: 99999, routeType: "cross" }).total,
  single: repository.list({ limit: 99999, routeType: "single" }).total,
};
assert.deepEqual(feedCounts, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline changed");

const stableCandidateId = createRouteCandidateId({
  intentId,
  countries: ["JP"],
  destinations: [
    { wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
    { wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
    { wikidataId: "Q35765", countryCode: "JP", name: "Osaka", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
  ],
  proposedOrder: ["Q1490", "Q34600", "Q35765"],
  durationDays: 8,
  travelStyle: "classic-first-trip",
  generationSource: "phase2a-test-knowledge-graph",
});
assert.equal(stableCandidateId, "rc-5bd691815c0bfa25ad41", "candidateId golden changed");
assert.equal(createDecisionTraceId({
  routeId: "route-japan-8d",
  candidateId: stableCandidateId,
  intentId,
}), "dt-3d1cfa5d81194500df25", "traceId golden changed");

assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "real route/cache files changed during Phase 3A verification");

console.log(JSON.stringify({
  status: "PASS",
  tempRoot,
  evidenceBundleId: sameId,
  featureFlagDefault: false,
  flagOffCreatedStorage: fs.existsSync(disabledPath),
  jsonlRecords: records.length,
  summaryRecomputed: normalized.summary,
  routeRecordFieldsRejected: true,
  unknownFailedSeparated: true,
  feedReadyPoolCount: feedCounts,
  realCachesUnchanged: true,
  acceptedRepositoryUnchanged: true,
  bootstrapUnchanged: true,
}, null, 2));
