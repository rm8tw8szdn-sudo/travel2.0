import assert from "node:assert/strict";

import {
  buildRouteCandidatesFromPool,
  parseSearchIntent,
  validateRouteForUse,
} from "../src/lib/routes/index.mjs";

const cities = Object.freeze([
  { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "东京", label: "东京", normalizedLabel: "tokyo", aliases: ["东京", "東京", "Tokyo"], latitude: 35.6894, longitude: 139.6917 },
  { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "京都", label: "京都", normalizedLabel: "kyoto", aliases: ["京都", "Kyoto"], latitude: 35.0116, longitude: 135.7681 },
  { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "大阪", label: "大阪", normalizedLabel: "osaka", aliases: ["大阪", "Osaka"], latitude: 34.6938, longitude: 135.5021 },
  { id: "Q169134", wikidataId: "Q169134", countryCode: "JP", name: "奈良", label: "奈良", normalizedLabel: "nara", aliases: ["奈良", "Nara"], latitude: 34.6850, longitude: 135.8048 },
  { id: "anchor:JP:kanazawa", wikidataId: "anchor:JP:kanazawa", countryCode: "JP", name: "金泽", label: "金泽", normalizedLabel: "kanazawa", aliases: ["金泽", "金沢", "Kanazawa"], latitude: 36.5613, longitude: 136.6562 },
]);

const catalogs = {
  countries: [{ code: "JP", label: "日本", normalizedLabel: "japan", aliases: ["日本", "Japan"] }],
  cities,
};

function parse(query) {
  return parseSearchIntent(query, { catalogs, timeIntentEnabled: true });
}

const parsingCases = [
  ["东京京都大阪7天", "flexible"],
  ["东京、京都、大阪7天", "flexible"],
  ["东京 京都 大阪 7天", "flexible"],
  ["东京→京都→大阪 7天", "fixed"],
  ["东京到京都再去大阪7天", "fixed"],
  ["先东京，然后京都，最后大阪7天", "fixed"],
  ["Tokyo Kyoto Osaka 7 days", "flexible"],
  ["Tokyo to Kyoto then Osaka 7 days", "fixed"],
];

for (const [query, orderMode] of parsingCases) {
  const intent = parse(query);
  assert.deepEqual(intent.requiredDestinationIds, ["Q1490", "Q34600", "Q35765"], query);
  assert.deepEqual(intent.requiredDestinationNames, ["东京", "京都", "大阪"], query);
  assert.equal(intent.destinationOrderMode, orderMode, query);
  assert.equal(intent.durationDays, 7, query);
  assert.equal(intent.countryCode, "JP", query);
}

const duplicate = parse("东京、京都、东京、大阪7天");
assert.deepEqual(duplicate.requiredDestinationIds, ["Q1490", "Q34600", "Q35765"]);
assert.equal(duplicate.destinationDiagnostics.some((item) => item.code === "duplicate-required-destination"), true);

const partialUnknown = parse("东京、火星城、京都7天");
assert.deepEqual(partialUnknown.requiredDestinationIds, ["Q1490", "Q34600"]);
assert.equal(partialUnknown.destinationDiagnostics.some((item) => item.code === "unknown-city-token" && item.rawValue === "火星城"), true);

const legacyFlagOff = parseSearchIntent("日本 东京 京都 7天", { catalogs, timeIntentEnabled: false });
assert.deepEqual(legacyFlagOff.cities, ["东京", "京都"]);
assert.equal(Object.hasOwn(legacyFlagOff, "requiredDestinationIds"), false);
assert.equal(Object.hasOwn(legacyFlagOff, "destinationOrderMode"), false);

function candidatesFor(intent, targetCount = 3) {
  return buildRouteCandidatesFromPool({
    context: {
      intentId: intent.intentHash,
      durationDays: intent.durationDays,
      countryCode: intent.countryCode,
      requiredDestinationIds: intent.requiredDestinationIds,
      requiredDestinationNames: intent.requiredDestinationNames,
      requiredDestinationRaw: intent.requiredDestinationRaw,
      destinationOrderMode: intent.destinationOrderMode,
      destinationDiagnostics: intent.destinationDiagnostics,
    },
    concept: { durationDays: intent.durationDays, travelStyle: "classic-first-trip" },
    pool: cities,
    targetCount,
    seed: "multi-city-verifier",
  });
}

const flexibleIntent = parse("东京京都大阪7天");
const flexibleCandidates = candidatesFor(flexibleIntent);
assert.equal(flexibleCandidates.length, 3);
for (const candidate of flexibleCandidates) {
  const ids = new Set(candidate.proposedOrder);
  assert.equal(ids.has("Q1490") && ids.has("Q34600") && ids.has("Q35765"), true);
}

const fixedIntent = parse("东京→京都→大阪7天");
const fixedCandidates = candidatesFor(fixedIntent);
assert.equal(fixedCandidates.length, 3);
for (const candidate of fixedCandidates) {
  assert.deepEqual(candidate.proposedOrder.slice(0, 3), ["Q1490", "Q34600", "Q35765"]);
}

const omittedRequired = {
  ...structuredClone(flexibleCandidates[0]),
  destinations: flexibleCandidates[0].destinations.filter((destination) => destination.id !== "Q35765"),
  proposedOrder: flexibleCandidates[0].proposedOrder.filter((id) => id !== "Q35765"),
  inputIntentSnapshot: {
    requiredDestinationIds: flexibleIntent.requiredDestinationIds,
    destinationOrderMode: flexibleIntent.destinationOrderMode,
  },
};
const omittedValidation = validateRouteForUse(omittedRequired, {}, { index: {} });
assert.equal(omittedValidation.status, "rejected");
assert.equal(omittedValidation.reasonCodes.includes("required-destination-missing"), true);

const reorderedFixed = {
  ...structuredClone(fixedCandidates[0]),
  destinations: [fixedCandidates[0].destinations[1], fixedCandidates[0].destinations[0], ...fixedCandidates[0].destinations.slice(2)],
  proposedOrder: ["Q34600", "Q1490", "Q35765"],
  inputIntentSnapshot: {
    requiredDestinationIds: fixedIntent.requiredDestinationIds,
    destinationOrderMode: fixedIntent.destinationOrderMode,
  },
};
const reorderedValidation = validateRouteForUse(reorderedFixed, {}, { index: {} });
assert.equal(reorderedValidation.status, "rejected");
assert.equal(reorderedValidation.reasonCodes.includes("required-destination-order-mismatch"), true);

const extremeIntent = parse("东京京都大阪奈良金泽1天");
const extremeCandidates = candidatesFor(extremeIntent);
assert.equal(extremeCandidates.length, 3);
for (const candidate of extremeCandidates) {
  assert.equal(candidate.proposedOrder.length >= 5, true);
  const validation = validateRouteForUse(candidate, {
    requiredDestinationIds: extremeIntent.requiredDestinationIds,
    destinationOrderMode: extremeIntent.destinationOrderMode,
  }, { index: {} });
  assert.equal(validation.status, "rejected");
  assert.equal(validation.reasonCodes.includes("duration-capacity-conflict"), true);
}

console.log(JSON.stringify({
  verifier: "route-v2-multi-city-intent",
  passed: true,
  parsingCases: parsingCases.length,
  flexibleCandidateOrders: flexibleCandidates.map((candidate) => candidate.proposedOrder),
  fixedCandidateOrders: fixedCandidates.map((candidate) => candidate.proposedOrder),
  extremeCandidateOrders: extremeCandidates.map((candidate) => candidate.proposedOrder),
}, null, 2));
