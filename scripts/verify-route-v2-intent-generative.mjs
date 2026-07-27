import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachRouteIntentEnvelope,
  createRouteIntentFingerprint,
  finalizeRouteResult,
  normalizeRouteIntent,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";
import { evaluateRouteIntentOracle } from "../src/lib/routes/route-intent-model-oracle.mjs";

const SEED = 0x5eedc0de;
const PROPERTY_CASES = 1200;
const FUZZ_CASES = 900;
const METAMORPHIC_CASES = 300;
const DIFFERENTIAL_SOURCES = ["candidate", "accepted", "mature", "legacy", "fallback", "cache", "ready-pool"];
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(projectRoot, "scripts", "fixtures", "route-v2-permanent-intent-corpus.json");

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);
const integer = (minimum, maximum) => minimum + Math.floor(random() * (maximum - minimum + 1));
const pick = (values) => values[integer(0, values.length - 1)];
const shuffled = (values) => {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = integer(0, index);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
};

const CITY_POOL = [
  ["Q1490", "Tokyo", "JP", "Kanto"],
  ["Q34600", "Kyoto", "JP", "Kansai"],
  ["Q35765", "Osaka", "JP", "Kansai"],
  ["Q169134", "Nara", "JP", "Kansai"],
  ["Q90", "Paris", "FR", "Ile-de-France"],
  ["Q84", "London", "GB", "England"],
];

function daysForCount(count) {
  if (count <= 2) return integer(1, 2);
  if (count === 3) return integer(3, 4);
  if (count === 4) return integer(5, 7);
  if (count === 5) return integer(8, 10);
  return integer(11, 18);
}

function generatedCase(index) {
  const count = integer(1, 5);
  const selected = shuffled(CITY_POOL).slice(0, count);
  const fixed = random() < 0.5;
  const durationDays = daysForCount(count);
  const timeMode = pick(["none", "month", "season"]);
  const months = timeMode === "month" ? [...new Set([integer(1, 12), ...(random() < 0.25 ? [integer(1, 12)] : [])])].sort((a, b) => a - b) : [];
  const season = timeMode === "season" ? pick(["winter", "spring", "summer", "autumn"]) : null;
  const country = selected.every((entry) => entry[2] === selected[0][2]) ? selected[0][2] : "";
  const region = selected.every((entry) => entry[3] === selected[0][3]) && random() < 0.35 ? selected[0][3] : "";
  const intent = {
    intentMode: "specified-destination",
    requiredDestinationIds: selected.map((entry) => entry[0]),
    requiredDestinationNames: selected.map((entry) => entry[1]),
    destinationOrderMode: fixed ? "fixed" : "flexible",
    durationDays,
    ...(country ? { countryCode: country } : {}),
    ...(region ? { region } : {}),
    timeIntent: timeMode === "month"
      ? { type: months.length > 1 ? "month-range" : "single-month", months, season: null }
      : timeMode === "season"
        ? { type: "season-only", months: [], season }
        : { type: "unspecified", months: [], season: null },
    travelStyle: pick(["city-break", "classic-first-trip", "rail-journey"]),
    theme: pick(["culture", "food", "history"]),
    transportPreference: shuffled(["rail", "walk", "bus"]).slice(0, integer(0, 3)),
  };
  const order = fixed ? selected : shuffled(selected);
  const route = {
    id: `property-route-${index}`,
    name: `Property route ${index}`,
    destinationEntities: order.map(([wikidataId, name, countryCode, regionName]) => ({
      wikidataId,
      name,
      countryCode,
      region: regionName,
    })),
    destinations: order.map((entry) => entry[1]),
    countryEntities: [...new Set(order.map((entry) => entry[2]))].map((countryCode) => ({ countryCode })),
    regions: [...new Set(order.map((entry) => entry[3]))],
    durationDays,
    ...(months.length ? {
      timeIntent: { type: months.length > 1 ? "month-range" : "single-month", months, season: null },
      evidenceValidationStatus: "ready",
    } : {}),
    ...(season ? {
      timeIntent: { type: "season-only", months: [], season },
      evidenceValidationStatus: "ready",
    } : {}),
  };
  return { intent, route, fixed, selected };
}

function assertOracleAgreement(route, intent, label) {
  const production = validateRouteIntentInvariants(route, intent, {
    source: label,
    requireFingerprint: true,
    claimedSuccess: true,
  });
  const oracle = evaluateRouteIntentOracle(intent, route, { requireFingerprint: true });
  assert.equal(production.matched, oracle.matched, `${label}: matched disagreement`);
  assert.equal(production.requiresEvidence, oracle.requiresEvidence, `${label}: evidence disagreement`);
  assert.deepEqual(
    [...production.reasonCodes].sort(),
    [...oracle.violationCodes].sort(),
    `${label}: violation disagreement`,
  );
  return production;
}

let propertyAssertions = 0;
for (let index = 0; index < PROPERTY_CASES; index += 1) {
  const { intent, route, fixed } = generatedCase(index);
  const finalized = finalizeRouteResult(route, intent, { source: "property-valid", claimedSuccess: true });
  assert.equal(finalized.matched, true, `property ${index} valid route rejected`);
  assertOracleAgreement(finalized.record, intent, `property-valid-${index}`);
  propertyAssertions += 2;

  if (route.destinationEntities.length > 1) {
    const removed = attachRouteIntentEnvelope({
      ...route,
      destinationEntities: route.destinationEntities.slice(0, -1),
      destinations: route.destinations.slice(0, -1),
    }, intent);
    assert.equal(assertOracleAgreement(removed, intent, `property-removed-${index}`).matched, false);
    propertyAssertions += 1;
  }

  const wrongDays = attachRouteIntentEnvelope({ ...route, durationDays: route.durationDays + 1 }, intent);
  assert.equal(assertOracleAgreement(wrongDays, intent, `property-days-${index}`).matched, false);
  propertyAssertions += 1;

  if (fixed && route.destinationEntities.length > 1) {
    const reordered = attachRouteIntentEnvelope({
      ...route,
      destinationEntities: [...route.destinationEntities].reverse(),
      destinations: [...route.destinations].reverse(),
    }, intent);
    assert.equal(assertOracleAgreement(reordered, intent, `property-order-${index}`).matched, false);
    propertyAssertions += 1;
  }
}

const separators = [" ", "  ", "，", ",", "→", "->", "・"];
let metamorphicAssertions = 0;
for (let index = 0; index < METAMORPHIC_CASES; index += 1) {
  const { intent, route, fixed } = generatedCase(PROPERTY_CASES + index);
  const baseFingerprint = createRouteIntentFingerprint(intent).value;
  const equivalent = {
    ...intent,
    requiredDestinationNames: intent.requiredDestinationNames.map((name) => ` ${name.toUpperCase()} `),
    rawQuery: intent.requiredDestinationNames.join(pick(separators)),
    transportPreference: [...intent.transportPreference].reverse(),
  };
  assert.equal(createRouteIntentFingerprint(equivalent).value, baseFingerprint);
  metamorphicAssertions += 1;

  const changedDays = { ...intent, durationDays: intent.durationDays + 1 };
  assert.notEqual(createRouteIntentFingerprint(changedDays).value, baseFingerprint);
  metamorphicAssertions += 1;

  if (intent.requiredDestinationIds.length > 1) {
    const reversed = {
      ...intent,
      requiredDestinationIds: [...intent.requiredDestinationIds].reverse(),
      requiredDestinationNames: [...intent.requiredDestinationNames].reverse(),
    };
    if (fixed) assert.notEqual(createRouteIntentFingerprint(reversed).value, baseFingerprint);
    else assert.equal(createRouteIntentFingerprint(reversed).value, baseFingerprint);
    metamorphicAssertions += 1;
  }

  const changedSoftPreference = { ...intent, theme: `${intent.theme}-alternate` };
  const baseResult = finalizeRouteResult(route, intent, { source: "metamorphic-base", claimedSuccess: true });
  const softResult = finalizeRouteResult(route, changedSoftPreference, { source: "metamorphic-soft", claimedSuccess: true });
  assert.equal(baseResult.matched, softResult.matched);
  metamorphicAssertions += 1;
}

const fuzzAtoms = [
  null,
  undefined,
  "",
  " ".repeat(2000),
  "東京→京都，Osaka\tNara",
  "🚄".repeat(1000),
  -1,
  0,
  999999999,
  [],
  [null, "Q1490", { nested: true }],
  {},
  { schemaVersion: "route-intent-v1", hardConstraints: {} },
  { requiredDestinationIds: "Q1490", durationDays: "not-a-number" },
  { requiredDestinationIds: [null, "", "Q1490", "q1490"], timeIntent: { type: "broken", months: [0, 13, "x"] } },
];
let fuzzAssertions = 0;
for (let index = 0; index < FUZZ_CASES; index += 1) {
  const input = structuredClone(pick(fuzzAtoms));
  const route = pick([
    {},
    { destinationEntities: null, durationDays: -1 },
    { destinationEntities: [{ wikidataId: "Q1490" }], status: "accepted" },
    { destinationEntities: "bad", routeIntentFingerprintVersion: "wrong" },
  ]);
  let normalized;
  assert.doesNotThrow(() => { normalized = normalizeRouteIntent(input); });
  assert.doesNotThrow(() => createRouteIntentFingerprint(normalized));
  assert.doesNotThrow(() => validateRouteIntentInvariants(route, normalized, {
    source: `fuzz-${index}`,
    requireFingerprint: true,
    claimedSuccess: true,
  }));
  fuzzAssertions += 3;
}

const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
assert.equal(corpus.schemaVersion, "route-v2-permanent-intent-corpus-v1");
let corpusAssertions = 0;
for (const entry of corpus.cases) {
  const bound = attachRouteIntentEnvelope(entry.route, entry.intent);
  const production = assertOracleAgreement(bound, entry.intent, `corpus-${entry.id}`);
  assert.equal(production.outcome, entry.expected, entry.id);
  if (entry.reasonCode) assert(production.reasonCodes.includes(entry.reasonCode), entry.id);
  corpusAssertions += entry.reasonCode ? 2 : 1;
}

let differentialAssertions = 0;
for (let index = 0; index < 80; index += 1) {
  const { intent, route } = generatedCase(PROPERTY_CASES + METAMORPHIC_CASES + index);
  for (const source of DIFFERENTIAL_SOURCES) {
    const sourceRoute = attachRouteIntentEnvelope({
      ...route,
      id: `${source}-${index}`,
      sourceType: source,
      displayMetadata: { nonCriticalOrder: shuffled(["a", "b", "c"]) },
    }, intent);
    assert.equal(assertOracleAgreement(sourceRoute, intent, `differential-${source}-${index}`).matched, true);
    differentialAssertions += 1;
  }
}

console.log(JSON.stringify({
  verifier: "route-v2-intent-generative",
  status: "PASS",
  seed: `0x${SEED.toString(16)}`,
  property: { cases: PROPERTY_CASES, assertions: propertyAssertions },
  fuzz: { cases: FUZZ_CASES, assertions: fuzzAssertions },
  metamorphic: { cases: METAMORPHIC_CASES, assertions: metamorphicAssertions },
  differential: { cases: 80 * DIFFERENTIAL_SOURCES.length, assertions: differentialAssertions, sources: DIFFERENTIAL_SOURCES },
  permanentCorpus: { cases: corpus.cases.length, assertions: corpusAssertions },
}, null, 2));
