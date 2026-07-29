import assert from "node:assert/strict";
import {
  attachRouteIntentEnvelope,
  createRouteIntentFingerprint,
  normalizeRouteIntent,
} from "../src/lib/routes/route-intent-model.mjs";
import {
  finalizeRouteResult,
  validateEmbeddedRouteIntent,
  validateRouteIntentInvariants,
} from "../src/lib/routes/route-intent-invariant-gate.mjs";
import { evaluateRouteIntentOracle } from "../src/lib/routes/route-intent-model-oracle.mjs";
import { runRouteIntentShadowValidation } from "../src/lib/routes/route-intent-shadow-validation.mjs";

const intent = normalizeRouteIntent({
  requiredDestinationIds: ["Q1490", "Q34600", "Q35765"],
  requiredDestinationNames: ["东京", "京都", "大阪"],
  destinationOrderMode: "fixed",
  durationDays: 7,
  countryCode: "JP",
  region: "kansai",
  timeIntent: { type: "single-month", months: [2] },
});

const route = {
  id: "route-valid",
  destinations: ["东京", "京都", "大阪"],
  destinationEntities: [
    { wikidataId: "Q1490", name: "东京", countryCode: "JP", region: "kansai" },
    { wikidataId: "Q34600", name: "京都", countryCode: "JP", region: "kansai" },
    { wikidataId: "Q35765", name: "大阪", countryCode: "JP", region: "kansai" },
  ],
  countryEntities: [{ countryCode: "JP", name: "日本" }],
  durationDays: 7,
  timeIntent: { type: "single-month", months: [2] },
  searchStatus: "accepted",
};

const multiCountryIntent = normalizeRouteIntent({
  countries: ["AT", "SK", "HU", "CZ"],
  country: "AT/SK/HU/CZ",
  durationDays: 7,
});
const multiCountryRoute = {
  durationDays: 7,
  destinationEntities: [
    { wikidataId: "Q1741", name: "Vienna", countryCode: "AT" },
    { wikidataId: "Q1780", name: "Bratislava", countryCode: "SK" },
    { wikidataId: "Q1781", name: "Budapest", countryCode: "HU" },
    { wikidataId: "Q1085", name: "Prague", countryCode: "CZ" },
  ],
  countryEntities: ["AT", "SK", "HU", "CZ"].map((countryCode) => ({ countryCode })),
};
assert.equal(evaluateRouteIntentOracle(multiCountryIntent, multiCountryRoute, { requireFingerprint: false }).matched, true);
assert.equal(
  evaluateRouteIntentOracle(multiCountryIntent, {
    ...multiCountryRoute,
    destinationEntities: multiCountryRoute.destinationEntities.slice(0, -1),
    countryEntities: multiCountryRoute.countryEntities.slice(0, -1),
  }, { requireFingerprint: false }).violationCodes.includes("country-mismatch"),
  true,
);

function compare(candidate, expectedCode = "") {
  const production = validateRouteIntentInvariants(candidate, intent);
  const oracle = evaluateRouteIntentOracle(intent, candidate);
  assert.equal(production.matched, oracle.matched);
  assert.equal(production.requiresEvidence, oracle.requiresEvidence);
  assert.deepEqual([...production.reasonCodes].sort(), [...oracle.violationCodes].sort());
  if (expectedCode) assert(production.reasonCodes.includes(expectedCode), `${expectedCode} should be reported`);
  return production;
}

const finalized = finalizeRouteResult(route, intent, { source: "oracle-verifier" });
assert.equal(finalized.accepted, true);
compare(finalized.record);
assert.equal(validateEmbeddedRouteIntent(finalized.record).matched, true);
assert.equal(runRouteIntentShadowValidation({
  routeIntent: intent,
  record: finalized.record,
  productionValidation: validateEmbeddedRouteIntent(finalized.record),
}).consistent, true);

const entityLayerQidRoute = finalizeRouteResult({
  ...route,
  id: "route-entity-layer-qid",
  destinationEntities: route.destinationEntities.map((entry, index) => ({
    entityId: `city-jp-${index}`,
    qid: entry.wikidataId,
    name: entry.name,
    countryCode: entry.countryCode,
    region: entry.region,
  })),
}, intent, { source: "entity-layer-qid-verifier" });
assert.equal(entityLayerQidRoute.matched, true, "Entity Layer qid must remain the authoritative destination identity");
compare(entityLayerQidRoute.record);

const cases = [
  ["required-city-missing", { ...route, destinations: ["东京", "京都"], destinationEntities: route.destinationEntities.slice(0, 2) }],
  ["unexpected-city-added", {
    ...route,
    destinations: [...route.destinations, "奈良"],
    destinationEntities: [...route.destinationEntities, { wikidataId: "Q169134", name: "奈良", countryCode: "JP", region: "kansai" }],
  }],
  ["fixed-order-mismatch", {
    ...route,
    destinations: ["东京", "大阪", "京都"],
    destinationEntities: [route.destinationEntities[0], route.destinationEntities[2], route.destinationEntities[1]],
  }],
  ["exact-days-mismatch", { ...route, durationDays: 8 }],
  ["month-conflict", { ...route, timeIntent: { type: "single-month", months: [3] } }],
  ["country-mismatch", {
    ...route,
    countryEntities: [{ countryCode: "TR" }],
    destinationEntities: route.destinationEntities.map((entry) => ({ ...entry, countryCode: "TR" })),
  }],
  ["region-mismatch", {
    ...route,
    region: "hokkaido",
    destinationEntities: route.destinationEntities.map((entry) => ({ ...entry, region: "hokkaido" })),
  }],
];

for (const [code, candidate] of cases) {
  compare(attachRouteIntentEnvelope(candidate, intent), code);
}

const needsEvidence = finalizeRouteResult({ ...route, timeIntent: null, bestMonths: [] }, intent);
assert.equal(needsEvidence.accepted, true);
assert.equal(needsEvidence.validation.requiresEvidence, true);
assert.equal(needsEvidence.status, "needs-evidence");

const mismatchedEnvelope = attachRouteIntentEnvelope(route, {
  requiredDestinationIds: ["Q1490", "Q34600", "Q35765"],
  requiredDestinationNames: ["东京", "京都", "大阪"],
  destinationOrderMode: "fixed",
  durationDays: 8,
  countryCode: "JP",
  region: "kansai",
  timeIntent: { type: "single-month", months: [2] },
});
compare(mismatchedEnvelope, "route-intent-fingerprint-mismatch");

const tampered = structuredClone(finalized.record);
tampered.normalizedRouteIntent.hardConstraints.exactDays.value = 9;
compare(tampered, "route-intent-envelope-tampered");

const absentFingerprint = validateRouteIntentInvariants(route, intent);
assert.equal(absentFingerprint.matched, false);
assert(absentFingerprint.reasonCodes.includes("route-intent-fingerprint-missing"));
assert.equal(validateEmbeddedRouteIntent(route).legacyUnbound, true);
assert.equal(validateEmbeddedRouteIntent(route, { allowLegacyUnbound: false }).matched, false);

const fingerprint = createRouteIntentFingerprint(intent).value;
console.log(JSON.stringify({
  status: "PASS",
  validFingerprint: fingerprint,
  independentOracle: true,
  comparedCases: cases.length + 4,
  shadowConsistent: true,
  structuredTimeOnly: true,
}, null, 2));
