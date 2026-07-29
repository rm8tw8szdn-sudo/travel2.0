import assert from "node:assert/strict";

import { routeIntentSnapshot } from "../src/lib/routes/decision-trace-schema.mjs";
import {
  buildEvidenceBundleLifecycle,
  createEvidenceBundleLifecycleId,
  validateEvidenceBundleLifecycle,
} from "../src/lib/routes/evidence-bundle-schema.mjs";
import {
  normalizeRouteCandidate,
  validateRouteCandidate,
} from "../src/lib/routes/route-candidate-pool.mjs";
import {
  normalizeRouteIntent,
  validateNormalizedRouteIntent,
} from "../src/lib/routes/route-intent-model.mjs";

const fixedNow = "2026-07-28T00:00:00.000Z";
const baseContext = {
  intentId: "intent-semantic-consistency",
  intentMode: "specified-destination",
  country: "JP",
  countryCode: "JP",
  durationDays: 7,
  timeIntent: {
    type: "single-month",
    months: [2],
    season: null,
    rawText: "2月",
    diagnostics: [],
  },
};
const canonicalIntent = normalizeRouteIntent(baseContext);
assert.equal(validateNormalizedRouteIntent(canonicalIntent).valid, true);

function semanticCase(name, mutate) {
  const subject = structuredClone(canonicalIntent);
  mutate(subject);
  let validation;
  assert.doesNotThrow(() => {
    validation = validateNormalizedRouteIntent(subject);
  }, `${name}: validator must never throw`);
  assert.equal(validation.valid, false, `${name}: semantic contradiction must be rejected`);
  assert.equal(validation.reasonCode, "route-intent-schema-invalid", `${name}: top-level reason`);
  assert(
    validation.violations.some((entry) => entry.code === "route-intent-semantic-invalid" && entry.path),
    `${name}: structured semantic violation and path required`,
  );
  return {
    name,
    paths: validation.violations
      .filter((entry) => entry.code === "route-intent-semantic-invalid")
      .map((entry) => entry.path),
  };
}

const semanticResults = [
  semanticCase("single-month-unspecified-empty", (subject) => {
    subject.hardConstraints.months = { state: "unspecified", values: [] };
  }),
  semanticCase("single-month-multiple-values", (subject) => {
    subject.hardConstraints.months = { state: "provided", values: [2, 3] };
  }),
  semanticCase("season-only-empty-season", (subject) => {
    subject.hardConstraints.timeType = "season-only";
    subject.hardConstraints.months = { state: "unspecified", values: [] };
    subject.hardConstraints.season = { state: "explicit-empty", value: "" };
  }),
  semanticCase("unspecified-with-explicit-month", (subject) => {
    subject.hardConstraints.timeType = "unspecified";
    subject.hardConstraints.months = { state: "provided", values: [2] };
    subject.evidenceStatus.time = "not-requested";
  }),
  semanticCase("invalid-mode-with-valid-time", (subject) => {
    subject.intentMode = "invalid-time-intent";
  }),
  semanticCase("insufficient-mode-with-destination", (subject) => {
    subject.intentMode = "insufficient-intent";
  }),
];

const snapshot = routeIntentSnapshot({
  context: { ...baseContext, normalizedRouteIntent: canonicalIntent },
  intentId: baseContext.intentId,
  source: "semantic-consistency-verifier",
  createdAt: fixedNow,
});
const destinations = [
  { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo" },
  { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto" },
];
const candidate = normalizeRouteCandidate({
  intentId: baseContext.intentId,
  countries: ["JP"],
  destinations,
  proposedOrder: destinations.map((entry) => entry.id),
  durationDays: 7,
  travelStyle: "classic",
  generationSource: "semantic-consistency-verifier",
  supportingSignals: [],
  status: "selected",
  rejectionReasons: [],
  unknowns: [],
  routeIntentFingerprintVersion: snapshot.routeIntentFingerprintVersion,
  routeIntentFingerprint: snapshot.routeIntentFingerprint,
  normalizedRouteIntent: snapshot.normalizedRouteIntent,
  inputIntentSnapshot: snapshot,
  createdAt: fixedNow,
}, { now: () => fixedNow });
assert.equal(validateRouteCandidate(candidate).accepted, true);

const tamperedCandidate = structuredClone(candidate);
tamperedCandidate.inputIntentSnapshot.timeIntent = {
  type: "unspecified",
  months: [],
  season: null,
  rawText: "",
  diagnostics: [],
};
const tamperedValidation = validateRouteCandidate(tamperedCandidate);
assert.equal(tamperedValidation.accepted, false, "tampered Candidate snapshot must be rejected");
assert(
  tamperedValidation.reasons.some((reason) => reason.includes("inputIntentSnapshot-time-intent-mismatch")),
  JSON.stringify(tamperedValidation.reasons),
);

const routeRecord = {
  id: "route-semantic-consistency",
  intentId: candidate.intentId,
  selectedCandidateId: candidate.candidateId,
  generationVersion: "route-generation-v2-phase1",
  routeIntentFingerprintVersion: candidate.routeIntentFingerprintVersion,
  routeIntentFingerprint: candidate.routeIntentFingerprint,
  normalizedRouteIntent: structuredClone(candidate.normalizedRouteIntent),
  destinationEntities: destinations.map((entry) => structuredClone(entry)),
};
const decisionTrace = {
  traceId: "dt-semantic-consistency",
  intentId: candidate.intentId,
  outcome: "success",
  routeIntentFingerprintVersion: candidate.routeIntentFingerprintVersion,
  routeIntentFingerprint: candidate.routeIntentFingerprint,
  selectedCandidate: structuredClone(candidate),
};
const builtBundle = buildEvidenceBundleLifecycle({
  selectedCandidate: candidate,
  routeRecord,
  decisionTrace,
  context: baseContext,
  now: () => fixedNow,
});
assert.equal(builtBundle.created, true, JSON.stringify(builtBundle.reasons || []));
assert.equal(validateEvidenceBundleLifecycle(builtBundle.bundle).accepted, true);

const malformedBundles = [
  ["empty-fingerprint", { routeIntentFingerprint: "" }],
  ["null-fingerprint", { routeIntentFingerprint: null }],
  ["malformed-fingerprint", { routeIntentFingerprint: "rif-v1-not-a-sha" }],
  ["empty-version", { routeIntentFingerprintVersion: "" }],
  ["unknown-version", { routeIntentFingerprintVersion: "route-intent-fingerprint-v999" }],
];
for (const [name, patch] of malformedBundles) {
  const malformed = { ...builtBundle.bundle, ...patch };
  malformed.evidenceBundleId = createEvidenceBundleLifecycleId(malformed);
  const validation = validateEvidenceBundleLifecycle(malformed);
  assert.equal(validation.accepted, false, `${name}: standalone EvidenceBundle must fail`);
  assert(
    validation.reasons.some((reason) => reason.includes("route-intent-fingerprint")),
    `${name}: must fail for the RouteIntent association itself: ${JSON.stringify(validation.reasons)}`,
  );
}
const mismatchedExpected = validateEvidenceBundleLifecycle(builtBundle.bundle, {
  selectedCandidate: { ...candidate, routeIntentFingerprint: `rif-v1-${"0".repeat(64)}` },
  routeRecord,
  decisionTrace,
});
assert.equal(mismatchedExpected.accepted, false, "expected Candidate fingerprint mismatch must fail");
assert(
  mismatchedExpected.reasons.some((reason) => reason.includes("route-intent-fingerprint-mismatch")),
  JSON.stringify(mismatchedExpected.reasons),
);

console.log(JSON.stringify({
  verifier: "route-v2-semantic-intent-consistency",
  status: "PASS",
  semanticCases: semanticResults,
  candidateSnapshotTamperRejected: true,
  standaloneEvidenceAssociationRejected: malformedBundles.length,
}, null, 2));
