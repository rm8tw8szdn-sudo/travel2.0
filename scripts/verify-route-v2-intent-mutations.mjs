import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  attachRouteIntentEnvelope,
  createRouteSearchCache,
  createRouteIntentFingerprint,
  finalizeRouteResult,
  normalizeRouteCandidate,
  normalizeRouteIntent,
  validateEmbeddedRouteIntent,
  validateNormalizedRouteIntent,
  validateRouteCandidate,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";
import { auditRouteV2Cache } from "../src/lib/routes/cache-baseline-v2.mjs";

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
