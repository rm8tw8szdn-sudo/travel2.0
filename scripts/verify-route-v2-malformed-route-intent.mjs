import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  attachRouteIntentEnvelope,
  createAcceptedRouteRepository,
  createRouteCandidatePoolStore,
  createRouteSearchCache,
  createRouteV2ReadyPool,
  normalizeRouteCandidate,
  normalizeRouteIntent,
  readRouteIntentEnvelope,
  routeIntentSnapshot,
  validateEmbeddedRouteIntent,
  validateNormalizedRouteIntent,
  validateRouteCandidate,
} from "../src/lib/routes/index.mjs";
import { auditRouteV2Cache } from "../src/lib/routes/cache-baseline-v2.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-malformed-intent-"));
process.once("exit", () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

const normalizedRouteIntent = normalizeRouteIntent({
  rawQuery: "2月去日本7天",
  countryCode: "JP",
  durationDays: 7,
  timeIntent: { type: "single-month", months: [2] },
});
const validRoute = attachRouteIntentEnvelope({
  id: "malformed-intent-control",
  countries: ["JP"],
  countryCodes: ["JP"],
  durationDays: 7,
  timeIntent: { type: "single-month", months: [2], evidenceStatus: "ready" },
  evidenceStatus: "ready",
  destinations: ["东京", "京都"],
  destinationEntities: [
    { entityId: "Q1490", countryCode: "JP" },
    { entityId: "Q34600", countryCode: "JP" },
  ],
}, normalizedRouteIntent);

const malformedRoute = structuredClone(validRoute);
malformedRoute.normalizedRouteIntent.hardConstraints.months.values = null;

let schemaValidation;
assert.doesNotThrow(() => {
  schemaValidation = validateNormalizedRouteIntent(malformedRoute.normalizedRouteIntent);
}, "strict RouteIntent schema validation must never throw");
assert.equal(schemaValidation.valid, false);
assert.equal(schemaValidation.reasonCode, "route-intent-schema-invalid");
assert(schemaValidation.violations.some((entry) => entry.path === "hardConstraints.months.values"));

const malformedCases = [
  ["months-string", (intent) => { intent.hardConstraints.months.values = "2"; }, "hardConstraints.months.values"],
  ["months-object", (intent) => { intent.hardConstraints.months.values = {}; }, "hardConstraints.months.values"],
  ["months-zero", (intent) => { intent.hardConstraints.months.values = [0]; }, "hardConstraints.months.values[0]"],
  ["months-thirteen", (intent) => { intent.hardConstraints.months.values = [13]; }, "hardConstraints.months.values[0]"],
  ["months-null-member", (intent) => { intent.hardConstraints.months.values = [2, null]; }, "hardConstraints.months.values[1]"],
  ["unknown-state", (intent) => { intent.hardConstraints.months.state = "unknown"; }, "hardConstraints.months.state"],
  ["non-string-state", (intent) => { intent.hardConstraints.months.state = 2; }, "hardConstraints.months.state"],
  ["provided-empty-conflict", (intent) => { intent.hardConstraints.months.values = []; }, "hardConstraints.months.values"],
  ["missing-state", (intent) => { delete intent.hardConstraints.months.state; }, "hardConstraints.months.state"],
  ["missing-values", (intent) => { delete intent.hardConstraints.months.values; }, "hardConstraints.months.values"],
  ["season-array", (intent) => { intent.hardConstraints.season.value = ["winter"]; }, "hardConstraints.season.value"],
  ["season-state-conflict", (intent) => {
    intent.hardConstraints.season.state = "unspecified";
    intent.hardConstraints.season.value = "winter";
  }, "hardConstraints.season.value"],
  ["required-cities-not-array", (intent) => { intent.hardConstraints.requiredCities.values = {}; }, "hardConstraints.requiredCities.values"],
  ["required-cities-null", (intent) => { intent.hardConstraints.requiredCities.values = [null]; }, "hardConstraints.requiredCities.values[0]"],
  ["required-cities-empty-object", (intent) => { intent.hardConstraints.requiredCities.values = [{}]; }, "hardConstraints.requiredCities.values[0]"],
  ["fixed-order-object", (intent) => { intent.hardConstraints.destinationOrderMode = {}; }, "hardConstraints.destinationOrderMode.state"],
  ["fixed-order-invalid", (intent) => { intent.hardConstraints.destinationOrderMode.value = "random"; }, "hardConstraints.destinationOrderMode.value"],
  ["exact-days-string", (intent) => { intent.hardConstraints.exactDays.value = "7"; }, "hardConstraints.exactDays.value"],
  ["exact-days-zero", (intent) => { intent.hardConstraints.exactDays.value = 0; }, "hardConstraints.exactDays.value"],
  ["countries-string", (intent) => { intent.hardConstraints.countries.values = "JP"; }, "hardConstraints.countries.values"],
  ["countries-null-member", (intent) => {
    intent.hardConstraints.countries.state = "provided";
    intent.hardConstraints.countries.values = [null];
  }, "hardConstraints.countries.values[0]"],
  ["region-number", (intent) => {
    intent.hardConstraints.region.state = "provided";
    intent.hardConstraints.region.value = 1;
  }, "hardConstraints.region.value"],
  ["capacity-infinity", (intent) => { intent.hardConstraints.routeCapacity.value = Infinity; }, "hardConstraints.routeCapacity.value"],
  ["soft-preferences-missing", (intent) => { delete intent.softPreferences; }, "softPreferences"],
  ["soft-preferences-array", (intent) => { intent.softPreferences = []; }, "softPreferences"],
  ["transport-null", (intent) => { intent.softPreferences.transport.values = null; }, "softPreferences.transport.values"],
  ["exclusions-object", (intent) => { intent.softPreferences.exclusions = {}; }, "softPreferences.exclusions"],
  ["schema-missing", (intent) => { delete intent.schemaVersion; }, "schemaVersion"],
  ["schema-unknown", (intent) => { intent.schemaVersion = "route-intent-v999"; }, "schemaVersion"],
  ["hard-constraints-child-missing", (intent) => { delete intent.hardConstraints.country; }, "hardConstraints.country"],
  ["unknown-top-level", (intent) => { intent.futureField = true; }, "$.futureField"],
  ["unknown-deep-field", (intent) => { intent.hardConstraints.months.futureField = { deep: { value: true } }; }, "hardConstraints.months.futureField"],
];
for (const [name, mutate, expectedPath] of malformedCases) {
  const subject = structuredClone(normalizedRouteIntent);
  mutate(subject);
  let result;
  assert.doesNotThrow(() => {
    result = validateNormalizedRouteIntent(subject);
  }, `${name}: schema validation must not throw`);
  assert.equal(result.valid, false, `${name}: malformed intent must fail`);
  assert(
    result.violations.some((entry) => entry.path === expectedPath || entry.path.startsWith(`${expectedPath}.`)),
    `${name}: expected diagnostic path ${expectedPath}`,
  );
}
const validFebruary = validateNormalizedRouteIntent(normalizedRouteIntent);
assert.equal(validFebruary.valid, true, "a valid February intent must remain accepted");

let envelopeValidation;
assert.doesNotThrow(() => {
  envelopeValidation = validateEmbeddedRouteIntent(malformedRoute, {
    source: "malformed-route-intent-regression",
    allowLegacyUnbound: false,
  });
}, "the exact months.values=null reproduction must not throw");
assert.equal(envelopeValidation.matched, false);
assert(envelopeValidation.reasonCodes.includes("route-intent-schema-invalid"));

const legacyEnvelope = readRouteIntentEnvelope({ id: "genuine-legacy" });
assert.equal(legacyEnvelope.status, "legacy-unbound");
assert.equal(validateEmbeddedRouteIntent({ id: "genuine-legacy" }, { allowLegacyUnbound: true }).legacyUnbound, true);
for (const [name, record] of [
  ["partial-schema-only", { routeIntentSchemaVersion: normalizedRouteIntent.schemaVersion }],
  ["fingerprint-number", { ...validRoute, routeIntentFingerprint: 7 }],
  ["fingerprint-version-missing", (() => {
    const value = structuredClone(validRoute);
    delete value.routeIntentFingerprintVersion;
    return value;
  })()],
  ["normalized-intent-missing", (() => {
    const value = structuredClone(validRoute);
    delete value.normalizedRouteIntent;
    return value;
  })()],
]) {
  let result;
  assert.doesNotThrow(() => {
    result = validateEmbeddedRouteIntent(record, { allowLegacyUnbound: true });
  }, `${name}: partial envelope validation must not throw`);
  assert.equal(result.matched, false, `${name}: a claimed malformed envelope must not become legacy`);
  assert.equal(result.reasonCodes.includes("route-intent-schema-invalid"), true);
}

const cachePath = path.join(temporaryRoot, "search-cache.json");
const reviewPath = path.join(temporaryRoot, "search-review.json");
const cache = createRouteSearchCache({
  storagePath: cachePath,
  reviewPath,
});
assert(cache.put({ intent: normalizedRouteIntent, records: [validRoute] }));
cache.appendReviewCandidates({
  intent: normalizedRouteIntent,
  records: [validRoute],
  queryId: "malformed-route-intent-regression",
});
const malformedReviewPayload = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
malformedReviewPayload.candidates[0].normalizedIntent.hardConstraints.months.values = null;
fs.writeFileSync(reviewPath, JSON.stringify(malformedReviewPayload, null, 2), "utf8");
const cachePayload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const [cacheKey] = Object.keys(cachePayload.items);
cachePayload.items[cacheKey].records[0].normalizedRouteIntent.hardConstraints.months.values = null;
fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), "utf8");

let replay;
assert.doesNotThrow(() => {
  replay = cache.get(normalizedRouteIntent);
}, "one malformed cache record must not crash Search cache replay");
assert.equal(replay, null, "one malformed cache record must be treated as a cache miss");
assert(cache.diagnostics().some((entry) => (
  entry.type === "search-cache-record-invalid"
  && entry.reasonCode === "route-intent-schema-invalid"
  && entry.path === "normalizedRouteIntent.hardConstraints.months.values"
)));
assert(cache.put({ intent: normalizedRouteIntent, records: [validRoute] }));
const malformedItemPayload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
malformedItemPayload.items[cacheKey].normalizedIntent.hardConstraints.months.values = null;
fs.writeFileSync(cachePath, JSON.stringify(malformedItemPayload, null, 2), "utf8");
assert.doesNotThrow(() => cache.get(normalizedRouteIntent));
assert.equal(cache.get(normalizedRouteIntent), null, "a malformed cache item intent must safe-miss");
assert(cache.diagnostics().some((entry) => (
  entry.type === "search-cache-item-intent-invalid"
  && entry.reasonCode === "route-intent-schema-invalid"
  && entry.path === "hardConstraints.months.values"
)));
assert(cache.put({ intent: normalizedRouteIntent, records: [validRoute] }));

const validCandidate = normalizeRouteCandidate({
  intentId: "intent-malformed-regression",
  countries: ["JP"],
  destinations: [
    { id: "Q1490", name: "Tokyo", countryCode: "JP" },
    { id: "Q34600", name: "Kyoto", countryCode: "JP" },
  ],
  proposedOrder: ["Q1490", "Q34600"],
  durationDays: 7,
  travelStyle: "classic-first-trip",
  generationSource: "malformed-regression",
  routeIntentFingerprint: validRoute.routeIntentFingerprint,
  routeIntentFingerprintVersion: validRoute.routeIntentFingerprintVersion,
  normalizedRouteIntent,
  inputIntentSnapshot: routeIntentSnapshot({
    context: {
      intentId: "intent-malformed-regression",
      countryCode: "JP",
      durationDays: 7,
      timeIntent: { type: "single-month", months: [2], season: null },
      normalizedRouteIntent,
    },
    intentId: "intent-malformed-regression",
    source: "malformed-regression",
    createdAt: "2026-07-28T00:00:00.000Z",
  }),
  createdAt: "2026-07-28T00:00:00.000Z",
});
assert.equal(validateRouteCandidate(validCandidate).accepted, true);
const malformedCandidate = structuredClone(validCandidate);
malformedCandidate.candidateId = `${validCandidate.candidateId}-malformed`;
malformedCandidate.normalizedRouteIntent.hardConstraints.months.values = null;
assert.equal(validateRouteCandidate(malformedCandidate).accepted, false);
assert(validateRouteCandidate(malformedCandidate).reasons.includes("route-intent-schema-invalid"));

const candidatePath = path.join(temporaryRoot, "route-candidate-pool.jsonl");
fs.writeFileSync(candidatePath, `${JSON.stringify(validCandidate)}\n${JSON.stringify(malformedCandidate)}\n`, "utf8");
const candidateStore = createRouteCandidatePoolStore({
  storagePath: candidatePath,
  env: { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true" },
});
assert.equal(candidateStore.listByIntent(validCandidate.intentId).length, 1);
assert(candidateStore.diagnostics().some((entry) => entry.type === "candidate-schema-invalid"));

const readyPath = path.join(temporaryRoot, "ready-routes.json");
const readyPool = createRouteV2ReadyPool({
  storagePath: readyPath,
  env: { ROUTE_V2_READY_POOL_ENABLED: "true" },
  now: () => "2026-07-28T00:00:00.000Z",
});
const readyRoutes = ["ready-valid", "ready-malformed"].map((id) => attachRouteIntentEnvelope({
  ...validRoute,
  id,
  selectedCandidateId: `candidate-${id}`,
  decisionTraceId: `trace-${id}`,
  v2PublicationStatus: "ready-for-display",
}, normalizedRouteIntent));
for (const route of readyRoutes) {
  assert.equal(readyPool.applyEvaluation({
    routeRecord: route,
    publicationGate: {
      status: "ready-for-display",
      publishable: true,
      routeRecordId: route.id,
      selectedCandidateId: route.selectedCandidateId,
      decisionTraceId: route.decisionTraceId,
    },
  }).persisted, true);
}
const readyPayload = JSON.parse(fs.readFileSync(readyPath, "utf8"));
readyPayload.records.find((entry) => entry.routeRecord.id === "ready-malformed")
  .routeRecord.normalizedRouteIntent.hardConstraints.months.values = null;
fs.writeFileSync(readyPath, JSON.stringify(readyPayload, null, 2), "utf8");
assert.deepEqual(readyPool.list().map((route) => route.id), ["ready-valid"]);

const acceptedPath = path.join(temporaryRoot, "accepted-routes.json");
const acceptedControlPayload = JSON.parse(fs.readFileSync(path.resolve(".route-v2-cache", "accepted-routes.json"), "utf8"));
const acceptedControl = acceptedControlPayload.records.find((record) => (
  record.id === "gold-case-accepted-gold-c45-45-mekong-discovery"
));
assert(acceptedControl, "accepted legacy control route must exist");
fs.writeFileSync(acceptedPath, JSON.stringify({
  schemaVersion: acceptedControlPayload.schemaVersion,
  records: [acceptedControl, malformedRoute],
}, null, 2), "utf8");
const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
const normalizedLegacyAccepted = acceptedRepository.get(acceptedControl.id);
const normalizedLegacyValidation = validateEmbeddedRouteIntent(normalizedLegacyAccepted, {
  source: "normalized-legacy-control",
  allowLegacyUnbound: true,
});
assert.equal(normalizedLegacyValidation.matched, true);
assert.equal(normalizedLegacyValidation.legacyUnbound, true);
assert.deepEqual(
  acceptedRepository.list({ limit: 100 }).records.map((record) => record.id),
  [acceptedControl.id],
  "Accepted reads must skip one malformed bound record and retain its valid neighbor",
);
assert.equal(
  acceptedRepository.get(malformedRoute.id),
  null,
  "Detail lookup must not expose a malformed bound Accepted route",
);

const cacheAuditRoot = path.join(temporaryRoot, "cache-audit");
fs.mkdirSync(cacheAuditRoot, { recursive: true });
for (const file of [
  "accepted-routes.json",
  "route-evidence.json",
  "provider-sync-state.json",
  "knowledge-graph-pool.json",
  "search-analytics.jsonl",
  "search-review-candidates.json",
]) {
  fs.copyFileSync(path.resolve(".route-v2-cache", file), path.join(cacheAuditRoot, file));
}
const cacheAuditPayload = JSON.parse(fs.readFileSync(cachePath, "utf8"));
cacheAuditPayload.items[cacheKey].records[0].normalizedRouteIntent.hardConstraints.months.values = null;
fs.writeFileSync(path.join(cacheAuditRoot, "search-cache.json"), JSON.stringify(cacheAuditPayload, null, 2), "utf8");
fs.copyFileSync(reviewPath, path.join(cacheAuditRoot, "search-review-candidates.json"));
fs.copyFileSync(candidatePath, path.join(cacheAuditRoot, "route-candidate-pool.jsonl"));
fs.copyFileSync(readyPath, path.join(cacheAuditRoot, "ready-routes.json"));
const audit = auditRouteV2Cache(cacheAuditRoot);
assert.equal(audit.status, "FAIL");
assert(audit.errors.some((entry) => (
  entry.includes("search-cache.json:item-0.records[0]:route-intent-schema-invalid")
  && entry.endsWith("normalizedRouteIntent.hardConstraints.months.values")
)), "Cache V2 must report file, record index, reason, and field path");
assert(audit.errors.some((entry) => (
  entry.includes("search-review-candidates.json:candidate-0.normalizedIntent:route-intent-schema-invalid")
  && entry.endsWith("hardConstraints.months.values")
)), "Cache V2 must deep-audit search review candidate intents");
assert(audit.errors.some((entry) => (
  entry.includes("route-candidate-pool.jsonl:record-1:candidate-invalid:route-intent-schema-invalid")
)), "Cache V2 must deep-audit Candidate Pool records");
assert(audit.errors.some((entry) => (
  entry.includes("ready-routes.json:record-")
  && entry.includes(".routeRecord:route-intent-schema-invalid")
  && entry.endsWith("normalizedRouteIntent.hardConstraints.months.values")
)), "Cache V2 must deep-audit Ready Pool route intents");
assert(!audit.errors.some((entry) => entry.includes("2月去日本7天")), "Cache diagnostics must not include raw queries");

fs.rmSync(temporaryRoot, { recursive: true, force: true });

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-malformed-route-intent",
  status: "PASS",
  exactReproduction: "hardConstraints.months.values=null",
  noTypeError: true,
  searchCacheSafeMiss: true,
  malformedCases: malformedCases.length,
  candidateRejected: true,
  readyPoolSkipped: true,
  acceptedSkipped: true,
  cacheV2DeepAudit: true,
}, null, 2)}\n`);
