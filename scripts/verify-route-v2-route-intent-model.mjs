import assert from "node:assert/strict";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  ROUTE_INTENT_SCHEMA_VERSION,
  attachRouteIntentEnvelope,
  createRouteIntentFingerprint,
  normalizeRouteIntent,
  readRouteIntentEnvelope,
} from "../src/lib/routes/route-intent-model.mjs";

const base = {
  requiredDestinationIds: ["Q1490", "Q34600", "Q35765"],
  requiredDestinationNames: ["Tokyo", "Kyoto", "Osaka"],
  destinationOrderMode: "fixed",
  durationDays: 7,
  countryCode: "jp",
  region: "  Kansai ",
  timeIntent: { type: "month-range", months: [4, 3, 4], season: "" },
  travelStyle: " Rail-Journey ",
  transportPreference: ["rail", "walk", "rail"],
  rawQuery: "Tokyo → Kyoto → Osaka 7 days",
};

const equivalent = {
  ...base,
  requiredDestinationIds: ["q1490", "q34600", "q35765"],
  requiredDestinationNames: [" TOKYO ", "kyoto", "OSAKA"],
  countryCode: "JP",
  region: "kansai",
  timeIntent: { type: "month-range", months: [3, 4], season: "" },
  transportPreference: ["walk", "rail"],
  rawQuery: "different display text",
};

const normalized = normalizeRouteIntent(base);
const equivalentNormalized = normalizeRouteIntent(equivalent);
assert.equal(normalized.schemaVersion, ROUTE_INTENT_SCHEMA_VERSION);
assert.equal(normalized.hardConstraints.requiredCities.state, "provided");
assert.deepEqual(normalized.hardConstraints.requiredCities.values.map((item) => item.id), ["Q1490", "Q34600", "Q35765"]);
assert.equal(normalized.hardConstraints.destinationOrderMode.value, "fixed");
assert.equal(normalized.hardConstraints.exactDays.value, 7);
assert.deepEqual(normalized.hardConstraints.months.values, [3, 4]);
assert.equal(normalized.hardConstraints.country.value, "JP");
assert.equal(normalized.hardConstraints.region.value, "kansai");
assert.deepEqual(normalized.softPreferences.transport.values, ["rail", "walk"]);

const fingerprint = createRouteIntentFingerprint(normalized);
assert.equal(fingerprint.version, ROUTE_INTENT_FINGERPRINT_VERSION);
assert.equal(fingerprint.value, createRouteIntentFingerprint(equivalentNormalized).value);
assert.match(fingerprint.value, /^rif-v1-[a-f0-9]{64}$/u);

const changedOrder = normalizeRouteIntent({
  ...base,
  requiredDestinationIds: ["Q1490", "Q35765", "Q34600"],
  requiredDestinationNames: ["Tokyo", "Osaka", "Kyoto"],
});
assert.notEqual(createRouteIntentFingerprint(changedOrder).value, fingerprint.value);
assert.notEqual(createRouteIntentFingerprint({ ...base, durationDays: 8 }).value, fingerprint.value);
assert.notEqual(createRouteIntentFingerprint({ ...base, timeIntent: { type: "single-month", months: [2] } }).value, fingerprint.value);
assert.notEqual(createRouteIntentFingerprint({ ...base, countryCode: "TR" }).value, fingerprint.value);
assert.notEqual(createRouteIntentFingerprint({ ...base, region: "hokkaido" }).value, fingerprint.value);

const multiCountry = normalizeRouteIntent({
  countries: ["HU", "AT", "CZ", "SK"],
  country: "AT/SK/HU/CZ",
  durationDays: 7,
});
assert.deepEqual(multiCountry.hardConstraints.countries.values, ["AT", "CZ", "HU", "SK"]);
assert.equal(multiCountry.hardConstraints.country.state, "unspecified", "multi-country display text must not become a synthetic country ID");
assert.equal(
  createRouteIntentFingerprint({ countries: ["AT", "SK", "HU", "CZ"], durationDays: 7 }).value,
  createRouteIntentFingerprint({ countries: ["CZ", "HU", "SK", "AT"], durationDays: 7 }).value,
  "multi-country constraints must be order-insensitive",
);
assert.notEqual(
  createRouteIntentFingerprint({ countries: ["AT", "SK", "HU", "CZ"], durationDays: 7 }).value,
  createRouteIntentFingerprint({ countries: ["AT", "SK", "HU"], durationDays: 7 }).value,
  "removing a required country must change the fingerprint",
);

const unspecified = normalizeRouteIntent({});
const explicitEmpty = normalizeRouteIntent({
  requiredDestinationIds: [],
  requiredDestinationNames: [],
  timeIntent: { type: "unspecified", months: [] },
});
assert.equal(unspecified.hardConstraints.requiredCities.state, "unspecified");
assert.equal(explicitEmpty.hardConstraints.requiredCities.state, "explicit-empty");
assert.notEqual(createRouteIntentFingerprint(unspecified).value, createRouteIntentFingerprint(explicitEmpty).value);

const envelope = attachRouteIntentEnvelope({ id: "route-model" }, base);
assert.equal(envelope.routeIntentFingerprint, fingerprint.value);
assert.equal(envelope.routeIntentFingerprintVersion, ROUTE_INTENT_FINGERPRINT_VERSION);
assert.deepEqual(readRouteIntentEnvelope(envelope).normalizedIntent, normalized);
const defensive = readRouteIntentEnvelope(envelope);
defensive.normalizedIntent.hardConstraints.requiredCities.values[0].id = "mutated";
assert.equal(readRouteIntentEnvelope(envelope).normalizedIntent.hardConstraints.requiredCities.values[0].id, "Q1490");

const destinationSuggestionSnapshot = normalizeRouteIntent({
  intentMode: "destination-suggestion",
  timeIntent: { type: "season-only", season: "winter" },
});
assert.deepEqual(
  normalizeRouteIntent({
    normalizedRouteIntent: destinationSuggestionSnapshot,
    countryCode: "MA",
    durationDays: 12,
    destinations: ["Casablanca", "Marrakesh"],
  }),
  destinationSuggestionSnapshot,
  "derived destination suggestions must not be reinterpreted as user hard constraints",
);

console.log(JSON.stringify({
  status: "PASS",
  schemaVersion: ROUTE_INTENT_SCHEMA_VERSION,
  fingerprintVersion: ROUTE_INTENT_FINGERPRINT_VERSION,
  fingerprint: fingerprint.value,
  semanticNormalization: true,
  missingVsEmpty: true,
}, null, 2));
