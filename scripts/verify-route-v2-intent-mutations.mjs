import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  attachRouteIntentEnvelope,
  buildEvidenceBundleLifecycle,
  createEvidenceBundleLifecycleId,
  createRouteSearchCache,
  createRouteIntentFingerprint,
  finalizeRouteResult,
  normalizeRouteCandidate,
  normalizeRouteIntent,
  routeIntentSnapshot,
  validateEmbeddedRouteIntent,
  validateEvidenceBundleLifecycle,
  validateNormalizedRouteIntent,
  validateRouteCandidate,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";
import { auditRouteV2Cache } from "../src/lib/routes/cache-baseline-v2.mjs";
import {
  AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES,
  authorizeSearchCacheSemanticMigrationSignatures,
} from "../src/lib/routes/search-cache-semantic-migration-policy.mjs";

const baseIntent = {
  intentMode: "specified-destination",
  requiredDestinationIds: ["Q1490", "Q34600", "Q35765"],
  requiredDestinationNames: ["Tokyo", "Kyoto", "Osaka"],
  destinationOrderMode: "fixed",
  durationDays: 7,
  countryCode: "JP",
  region: "Japan Core",
  timeIntent: { type: "single-month", months: [2], season: null },
};
const baseRoute = {
  id: "mutation-base",
  destinationEntities: [
    { wikidataId: "Q1490", name: "Tokyo", countryCode: "JP", region: "Japan Core" },
    { wikidataId: "Q34600", name: "Kyoto", countryCode: "JP", region: "Japan Core" },
    { wikidataId: "Q35765", name: "Osaka", countryCode: "JP", region: "Japan Core" },
  ],
  destinations: ["Tokyo", "Kyoto", "Osaka"],
  countryEntities: [{ countryCode: "JP" }],
  regions: ["Japan Core"],
  durationDays: 7,
  timeIntent: { type: "single-month", months: [2], season: null },
  evidenceValidationStatus: "ready",
};

const valid = finalizeRouteResult(baseRoute, baseIntent, { claimedSuccess: true, source: "mutation-base" });
assert.equal(valid.matched, true);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-intent-mutations-"));
process.once("exit", () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

const results = [];
function kill(name, assertion, detectedBy) {
  const killed = Boolean(assertion);
  results.push({ name, killed, detectedBy });
  assert.equal(killed, true, `${name} survived`);
}

const missingCity = attachRouteIntentEnvelope({
  ...baseRoute,
  destinationEntities: baseRoute.destinationEntities.slice(0, -1),
  destinations: baseRoute.destinations.slice(0, -1),
}, baseIntent);
kill(
  "remove-required-cities-check",
  !validateRouteIntentInvariants(missingCity, baseIntent, { requireFingerprint: true, claimedSuccess: true }).matched,
  "required-city-missing",
);

const reordered = attachRouteIntentEnvelope({
  ...baseRoute,
  destinationEntities: [baseRoute.destinationEntities[0], baseRoute.destinationEntities[2], baseRoute.destinationEntities[1]],
  destinations: ["Tokyo", "Osaka", "Kyoto"],
}, baseIntent);
kill(
  "treat-fixed-order-as-set",
  validateRouteIntentInvariants(reordered, baseIntent, { requireFingerprint: true, claimedSuccess: true }).reasonCodes.includes("fixed-order-mismatch"),
  "fixed-order-mismatch",
);

const wrongDays = attachRouteIntentEnvelope({ ...baseRoute, durationDays: 8 }, baseIntent);
kill(
  "replace-exact-days-with-greater-or-equal",
  validateRouteIntentInvariants(wrongDays, baseIntent, { requireFingerprint: true, claimedSuccess: true }).reasonCodes.includes("exact-days-mismatch"),
  "exact-days-mismatch",
);

const monthLost = attachRouteIntentEnvelope({
  ...baseRoute,
  timeIntent: { type: "unspecified", months: [], season: null },
  evidenceValidationStatus: "",
}, baseIntent);
kill(
  "ignore-month",
  validateRouteIntentInvariants(monthLost, baseIntent, { requireFingerprint: true, claimedSuccess: true }).outcome !== "success",
  "month-evidence-pending",
);

const winterIntent = {
  ...baseIntent,
  timeIntent: { type: "season-only", months: [], season: "winter" },
};
const seasonLost = attachRouteIntentEnvelope({
  ...baseRoute,
  timeIntent: { type: "unspecified", months: [], season: null },
  evidenceValidationStatus: "",
}, winterIntent);
kill(
  "ignore-season",
  validateRouteIntentInvariants(seasonLost, winterIntent, { requireFingerprint: true, claimedSuccess: true }).outcome !== "success",
  "season-evidence-pending",
);

const sameLegacyHashA = { ...baseIntent, intentHash: "legacy-key" };
const sameLegacyHashB = { ...baseIntent, durationDays: 8, intentHash: "legacy-key" };
kill(
  "cache-key-omits-route-intent-fingerprint",
  createRouteIntentFingerprint(sameLegacyHashA).value !== createRouteIntentFingerprint(sameLegacyHashB).value,
  "versioned-fingerprint-cache-key",
);

const readyPoolTamper = structuredClone(valid.record);
readyPoolTamper.destinationEntities.pop();
readyPoolTamper.destinations.pop();
kill(
  "ready-pool-bypasses-final-gate",
  !validateEmbeddedRouteIntent(readyPoolTamper, { allowLegacyUnbound: false }).matched,
  "ready-pool-embedded-validation",
);

kill(
  "fallback-deletes-a-city-and-succeeds",
  !validateRouteIntentInvariants(missingCity, baseIntent, { requireFingerprint: true, claimedSuccess: true }).matched,
  "shared-final-gate",
);

const repackaged = attachRouteIntentEnvelope({
  ...baseRoute,
  status: "rejected",
  accepted: true,
}, baseIntent);
kill(
  "rejected-repackaged-as-accepted",
  validateRouteIntentInvariants(repackaged, baseIntent, { requireFingerprint: true }).reasonCodes.includes("rejected-result-repackaged-as-success"),
  "success-state-consistency",
);

kill(
  "feed-or-detail-bypasses-final-gate",
  !validateEmbeddedRouteIntent(readyPoolTamper, { allowLegacyUnbound: false, source: "feed-detail-mutation" }).matched,
  "feed-detail-embedded-validation",
);

const hardConstraintMutations = [
  { ...baseIntent, requiredDestinationIds: [...baseIntent.requiredDestinationIds, "Q169134"] },
  { ...baseIntent, requiredDestinationIds: [...baseIntent.requiredDestinationIds].reverse(), requiredDestinationNames: [...baseIntent.requiredDestinationNames].reverse() },
  { ...baseIntent, durationDays: 8 },
  { ...baseIntent, timeIntent: { type: "single-month", months: [3], season: null } },
  { ...baseIntent, timeIntent: { type: "season-only", months: [], season: "winter" } },
  { ...baseIntent, countryCode: "FR" },
  { ...baseIntent, region: "Kansai" },
  { ...baseIntent, maxDestinations: 2 },
];
const baseFingerprint = createRouteIntentFingerprint(baseIntent).value;
kill(
  "fingerprint-ignores-a-hard-constraint",
  hardConstraintMutations.every((intent) => createRouteIntentFingerprint(intent).value !== baseFingerprint),
  "fingerprint-hard-constraint-sensitivity",
);

const malformedNormalizedIntent = normalizeRouteIntent(baseIntent);
malformedNormalizedIntent.hardConstraints.months.values = null;
let malformedValidation;
kill(
  "skip-months-values-type-check",
  (() => {
    assert.doesNotThrow(() => { malformedValidation = validateNormalizedRouteIntent(malformedNormalizedIntent); });
    return malformedValidation.valid === false;
  })(),
  "strict-normalized-route-intent-schema",
);
kill(
  "validator-exception-defaults-valid",
  malformedValidation.reasonCode === "route-intent-schema-invalid",
  "non-throwing-fail-closed-validator",
);

const malformedEnvelope = structuredClone(valid.record);
malformedEnvelope.normalizedRouteIntent.hardConstraints.months.values = null;
kill(
  "candidate-schema-invalid-becomes-legacy",
  !validateEmbeddedRouteIntent(malformedEnvelope, { allowLegacyUnbound: true }).matched,
  "claimed-envelope-never-legacy",
);

const candidate = normalizeRouteCandidate({
  intentId: "mutation-intent",
  countries: ["JP"],
  destinations: [
    { id: "Q1490", name: "Tokyo", countryCode: "JP" },
    { id: "Q34600", name: "Kyoto", countryCode: "JP" },
  ],
  proposedOrder: ["Q1490", "Q34600"],
  durationDays: 7,
  travelStyle: "classic",
  generationSource: "mutation",
  routeIntentFingerprint: valid.record.routeIntentFingerprint,
  routeIntentFingerprintVersion: valid.record.routeIntentFingerprintVersion,
  normalizedRouteIntent: malformedNormalizedIntent,
  createdAt: "2026-07-28T00:00:00.000Z",
});
kill(
  "candidate-skips-route-intent-schema",
  !validateRouteCandidate(candidate).accepted,
  "candidate-schema-gate",
);

const canonicalSnapshot = routeIntentSnapshot({
  context: {
    ...baseIntent,
    intentId: "mutation-intent",
    normalizedRouteIntent: normalizeRouteIntent(baseIntent),
  },
  intentId: "mutation-intent",
  source: "intent-mutation-verifier",
  createdAt: "2026-07-28T00:00:00.000Z",
});
const validCandidate = normalizeRouteCandidate({
  intentId: "mutation-intent",
  countries: ["JP"],
  destinations: [
    { id: "Q1490", wikidataId: "Q1490", name: "Tokyo", countryCode: "JP" },
    { id: "Q34600", wikidataId: "Q34600", name: "Kyoto", countryCode: "JP" },
  ],
  proposedOrder: ["Q1490", "Q34600"],
  durationDays: 7,
  travelStyle: "classic",
  generationSource: "mutation",
  status: "selected",
  routeIntentFingerprint: canonicalSnapshot.routeIntentFingerprint,
  routeIntentFingerprintVersion: canonicalSnapshot.routeIntentFingerprintVersion,
  normalizedRouteIntent: canonicalSnapshot.normalizedRouteIntent,
  inputIntentSnapshot: canonicalSnapshot,
  createdAt: "2026-07-28T00:00:00.000Z",
});
assert.equal(validateRouteCandidate(validCandidate).accepted, true);
const snapshotTimeTamper = structuredClone(validCandidate);
snapshotTimeTamper.inputIntentSnapshot.timeIntent = {
  type: "unspecified",
  months: [],
  season: null,
  rawText: "",
  diagnostics: [],
};
kill(
  "candidate-trusts-audit-snapshot-over-canonical-intent",
  !validateRouteCandidate(snapshotTimeTamper).accepted,
  "candidate-snapshot-consistency",
);

const semanticMutationCases = [
  ["single-month-allows-empty-month-list", (intent) => {
    intent.hardConstraints.months = { state: "provided", values: [] };
  }],
  ["single-month-allows-multiple-months", (intent) => {
    intent.hardConstraints.months = { state: "provided", values: [2, 3] };
  }],
  ["season-only-allows-empty-season", (intent) => {
    intent.hardConstraints.timeType = "season-only";
    intent.hardConstraints.months = { state: "unspecified", values: [] };
    intent.hardConstraints.season = { state: "explicit-empty", value: "" };
  }],
  ["unspecified-allows-explicit-month", (intent) => {
    intent.hardConstraints.timeType = "unspecified";
    intent.hardConstraints.months = { state: "provided", values: [2] };
    intent.evidenceStatus.time = "not-requested";
  }],
  ["invalid-intent-allows-valid-time", (intent) => {
    intent.intentMode = "invalid-time-intent";
  }],
  ["insufficient-intent-allows-destination", (intent) => {
    intent.intentMode = "insufficient-intent";
  }],
];
for (const [name, mutate] of semanticMutationCases) {
  const subject = normalizeRouteIntent(baseIntent);
  mutate(subject);
  const validation = validateNormalizedRouteIntent(subject);
  kill(
    name,
    validation.valid === false
      && validation.violations.some((entry) => entry.code === "route-intent-semantic-invalid"),
    "cross-field-semantic-validator",
  );
}

const evidenceRouteRecord = {
  id: "mutation-evidence-route",
  intentId: validCandidate.intentId,
  selectedCandidateId: validCandidate.candidateId,
  generationVersion: "route-generation-v2-phase1",
  routeIntentFingerprintVersion: validCandidate.routeIntentFingerprintVersion,
  routeIntentFingerprint: validCandidate.routeIntentFingerprint,
  normalizedRouteIntent: structuredClone(validCandidate.normalizedRouteIntent),
  destinationEntities: validCandidate.destinations.map((entry) => structuredClone(entry)),
};
const evidenceTrace = {
  traceId: "dt-mutation-evidence",
  intentId: validCandidate.intentId,
  outcome: "success",
  routeIntentFingerprintVersion: validCandidate.routeIntentFingerprintVersion,
  routeIntentFingerprint: validCandidate.routeIntentFingerprint,
  selectedCandidate: structuredClone(validCandidate),
};
const evidenceBuild = buildEvidenceBundleLifecycle({
  selectedCandidate: validCandidate,
  routeRecord: evidenceRouteRecord,
  decisionTrace: evidenceTrace,
  context: {
    ...baseIntent,
    intentId: validCandidate.intentId,
    normalizedRouteIntent: validCandidate.normalizedRouteIntent,
  },
  now: () => "2026-07-28T00:00:00.000Z",
});
assert.equal(evidenceBuild.created, true);
const evidenceWithoutFingerprint = {
  ...evidenceBuild.bundle,
  routeIntentFingerprint: "",
};
evidenceWithoutFingerprint.evidenceBundleId = createEvidenceBundleLifecycleId(evidenceWithoutFingerprint);
kill(
  "standalone-evidence-allows-empty-fingerprint",
  !validateEvidenceBundleLifecycle(evidenceWithoutFingerprint).accepted,
  "standalone-evidence-association-validation",
);
const evidenceWithoutVersion = {
  ...evidenceBuild.bundle,
  routeIntentFingerprintVersion: "",
};
evidenceWithoutVersion.evidenceBundleId = createEvidenceBundleLifecycleId(evidenceWithoutVersion);
kill(
  "standalone-evidence-allows-empty-fingerprint-version",
  !validateEvidenceBundleLifecycle(evidenceWithoutVersion).accepted,
  "standalone-evidence-association-validation",
);
kill(
  "evidence-expected-context-allows-fingerprint-mismatch",
  !validateEvidenceBundleLifecycle(evidenceBuild.bundle, {
    selectedCandidate: {
      ...validCandidate,
      routeIntentFingerprint: `rif-v1-${"0".repeat(64)}`,
    },
    routeRecord: evidenceRouteRecord,
    decisionTrace: evidenceTrace,
  }).accepted,
  "evidence-expected-context-association-validation",
);

const publicationGateSource = fs.readFileSync(
  path.resolve("src/lib/routes/route-publication-gate.mjs"),
  "utf8",
);
kill(
  "publication-gate-reads-months-from-audit-snapshot",
  publicationGateSource.includes("selectedCandidate.normalizedRouteIntent.hardConstraints")
    && !publicationGateSource.includes("inputIntentSnapshot?.timeIntent?.months"),
  "publication-gate-canonical-hard-constraints",
);

const cachePath = path.join(temporaryRoot, "search-cache.json");
const cache = createRouteSearchCache({
  storagePath: cachePath,
  reviewPath: path.join(temporaryRoot, "search-review.json"),
});
assert(cache.put({ intent: baseIntent, records: [valid.record] }));
const cachePayload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const [cacheKey] = Object.keys(cachePayload.items);
cachePayload.items[cacheKey].records[0].normalizedRouteIntent.hardConstraints.months.values = null;
fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), "utf8");
let cacheReplay;
kill(
  "search-cache-does-not-catch-schema-error",
  (() => {
    assert.doesNotThrow(() => { cacheReplay = cache.get(baseIntent); });
    return cacheReplay === null;
  })(),
  "search-cache-safe-miss",
);

const auditRoot = path.join(temporaryRoot, "cache-audit");
fs.mkdirSync(auditRoot, { recursive: true });
for (const file of [
  "accepted-routes.json",
  "route-evidence.json",
  "provider-sync-state.json",
  "knowledge-graph-pool.json",
  "search-analytics.jsonl",
  "search-review-candidates.json",
]) {
  fs.copyFileSync(path.resolve(".route-v2-cache", file), path.join(auditRoot, file));
}
fs.copyFileSync(cachePath, path.join(auditRoot, "search-cache.json"));
const cacheAudit = auditRouteV2Cache(auditRoot);
kill(
  "cache-v2-validates-only-outer-json",
  cacheAudit.status === "FAIL"
    && cacheAudit.errors.some((entry) => entry.includes("route-intent-schema-invalid:normalizedRouteIntent.hardConstraints.months.values")),
  "cache-v2-deep-route-intent-audit",
);

const authorizedMigrationSignatures = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES
  .map((signature) => structuredClone(signature));
const changedStableIdSignatures = authorizedMigrationSignatures.map((signature) => structuredClone(signature));
changedStableIdSignatures[0].stableKey = `rif-v1-${"9".repeat(64)}`;
kill(
  "migration-removes-stable-id-check",
  !authorizeSearchCacheSemanticMigrationSignatures(changedStableIdSignatures).authorized,
  "migration-full-signature-authorization",
);
const changedItemHashSignatures = authorizedMigrationSignatures.map((signature) => structuredClone(signature));
changedItemHashSignatures[0].itemSha256 = "1".repeat(64);
kill(
  "migration-removes-item-hash-check",
  !authorizeSearchCacheSemanticMigrationSignatures(changedItemHashSignatures).authorized,
  "migration-full-signature-authorization",
);
const arbitraryCountOnlySignatures = authorizedMigrationSignatures.map((signature, index) => ({
  ...structuredClone(signature),
  stableKey: `rif-v1-${String(index + 2).repeat(64)}`,
}));
kill(
  "migration-authorizes-by-count-only",
  !authorizeSearchCacheSemanticMigrationSignatures(arbitraryCountOnlySignatures).authorized,
  "migration-exact-signature-set",
);
const extraDecoySignatures = authorizedMigrationSignatures.concat({
  ...structuredClone(authorizedMigrationSignatures[0]),
  stableKey: `rif-v1-${"8".repeat(64)}`,
});
kill(
  "migration-ignores-decoy-record",
  !authorizeSearchCacheSemanticMigrationSignatures(extraDecoySignatures).authorized,
  "migration-exact-signature-set",
);
kill(
  "migration-continues-with-missing-target",
  !authorizeSearchCacheSemanticMigrationSignatures(authorizedMigrationSignatures.slice(0, 1)).authorized,
  "migration-exact-signature-set",
);

const associationRoot = path.join(temporaryRoot, "association-audit");
fs.mkdirSync(associationRoot, { recursive: true });
for (const file of [
  "accepted-routes.json",
  "route-evidence.json",
  "provider-sync-state.json",
  "knowledge-graph-pool.json",
  "search-analytics.jsonl",
  "search-cache.json",
  "search-review-candidates.json",
]) {
  fs.copyFileSync(path.resolve(".route-v2-cache", file), path.join(associationRoot, file));
}
fs.writeFileSync(
  path.join(associationRoot, "route-candidate-pool.jsonl"),
  `${JSON.stringify(validCandidate)}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(associationRoot, "route-evidence-bundles.jsonl"),
  `${JSON.stringify(evidenceBuild.bundle)}\n`,
  "utf8",
);
const associationAudit = auditRouteV2Cache(associationRoot);
const missingTraceDetected = associationAudit.errors.some((entry) => (
  entry.includes("evidence-decision-trace-reference-missing:decisionTraceId")
));
const missingRouteDetected = associationAudit.errors.some((entry) => (
  entry.includes("association-unverifiable:routeRecordId")
));
kill(
  "cache-association-skips-trace-existence",
  missingTraceDetected,
  "cache-v2-cross-record-association-audit",
);
kill(
  "cache-association-skips-route-record",
  missingRouteDetected,
  "cache-v2-cross-record-association-audit",
);
kill(
  "cache-association-compares-only-candidate-fingerprint",
  missingTraceDetected && missingRouteDetected,
  "cache-v2-cross-record-association-audit",
);
kill(
  "cache-association-missing-trace-defaults-pass",
  associationAudit.status === "FAIL" && missingTraceDetected,
  "cache-v2-fail-closed-association-audit",
);
kill(
  "cache-association-unverifiable-defaults-pass",
  associationAudit.status === "FAIL" && missingRouteDetected,
  "cache-v2-fail-closed-association-audit",
);

const killed = results.filter((result) => result.killed).length;
const survived = results.length - killed;
const score = Number(((killed / results.length) * 100).toFixed(2));
assert.equal(survived, 0);

console.log(JSON.stringify({
  verifier: "route-v2-intent-mutations",
  status: "PASS",
  totalMutants: results.length,
  killed,
  survived,
  mutationScore: score,
  results,
}, null, 2));

fs.rmSync(temporaryRoot, { recursive: true, force: true });
