import assert from "node:assert/strict";

import {
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteSearchService,
  parseSearchIntent,
} from "../src/lib/routes/index.mjs";
import { buildRouteDestinationSuggestion } from "../src/lib/routes/route-destination-suggestion.mjs";
import { validateFallbackRouteAgainstIntent } from "../src/lib/routes/route-fallback-constraint-validator.mjs";
import { evaluateRouteIntentOracle } from "../src/lib/routes/route-intent-model-oracle.mjs";

const knowledgeRepository = createPublishedKnowledgeEntityLayerRepository();
const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository: knowledgeRepository });
const parse = (query) => parseSearchIntent(query, { catalogs, timeIntentEnabled: true });

const regionCases = [
  ["Andalusia road trip", "andalusia", "ES", true],
  ["Mallorca island vacation", "mallorca", "ES", false],
  ["Tenerife island vacation", "tenerife", "ES", false],
  ["Provence 7 days", "provence", "FR", true],
  ["Lake Como 7 days", "lake-como", "IT", true],
  ["Dolomites hiking 7 days", "dolomites", "IT", false],
  ["Jeju island vacation", "jeju-island", "KR", true],
];

const parsedByRegion = new Map();
for (const [query, regionKey, countryCode, supported] of regionCases) {
  const intent = parse(query);
  parsedByRegion.set(regionKey, intent);
  assert.equal(intent.parseSuccess, true, query);
  assert.equal(intent.intentMode, "specified-destination", query);
  assert.equal(intent.normalizedRegion, regionKey, query);
  assert.equal(intent.regionEntityId, regionKey, query);
  assert.deepEqual(intent.regionCountryCodes, [countryCode], query);
  assert.equal(intent.countryCode, countryCode, query);
  assert.equal(intent.regionConstraint?.supported, supported, query);
  assert.equal(intent.normalizedRouteIntent.hardConstraints.region.state, "provided", query);
  assert.equal(intent.normalizedRouteIntent.hardConstraints.region.value, regionKey.replaceAll("-", ""), query);
}

assert.equal(
  new Set([...parsedByRegion.values()].map((intent) => intent.routeIntentFingerprint)).size,
  regionCases.length,
  "each explicit region must participate in the stable RouteIntent fingerprint",
);

const globalIsland = parse("island vacation");
assert.equal(globalIsland.intentMode, "destination-suggestion");
assert.equal(globalIsland.normalizedRegion, "");

const andalusiaIntent = parsedByRegion.get("andalusia");
const andalusiaSuggestion = buildRouteDestinationSuggestion({
  intent: andalusiaIntent,
  sessionId: "region-andalusia",
  acceptedRoutes: [],
  intentCatalog: catalogs,
});
assert.equal(andalusiaSuggestion.ready, true, JSON.stringify(andalusiaSuggestion));
assert.equal(andalusiaSuggestion.suggestion.countryCode, "ES");
assert(andalusiaSuggestion.suggestion.destinationIds.length >= 2);
assert(
  andalusiaSuggestion.suggestion.destinationIds.every((value) => {
    const catalogCity = catalogs.cities.find((city) => [city.entityId, city.wikidataId].includes(value));
    return catalogCity && andalusiaIntent.regionConstraint.knownDestinationIds.includes(catalogCity.wikidataId);
  }),
  JSON.stringify(andalusiaSuggestion.suggestion.destinationIds),
);

for (const regionKey of ["mallorca", "tenerife", "dolomites"]) {
  const result = buildRouteDestinationSuggestion({
    intent: parsedByRegion.get(regionKey),
    sessionId: `region-${regionKey}`,
    acceptedRoutes: [],
    intentCatalog: catalogs,
  });
  assert.equal(result.ready, false, regionKey);
  assert.equal(result.reason, "destination-suggestion-region-unsupported", regionKey);
}

function route(id, countryCode, destinations, overrides = {}) {
  return {
    id,
    name: id,
    canonicalTitle: id,
    durationDays: overrides.durationDays ?? 7,
    recommendedDays: `${overrides.durationDays ?? 7}天`,
    countryEntities: [{ countryCode, name: countryCode }],
    countries: [countryCode],
    destinationEntities: destinations.map((destination) => ({
      wikidataId: destination.id,
      entityId: destination.id,
      name: destination.name,
      countryCode,
      entityTypeName: "city",
    })),
    destinations: destinations.map((destination) => destination.name),
    contentQualityStatus: "accepted",
    enrichmentStatus: "enriched",
    repositoryStatus: "accepted",
    source: { name: "Verifier", url: "" },
    ...overrides,
  };
}

const allowedAndalusia = route("andalusia-valid", "ES", [
  { id: "Q8717", name: "Seville" },
  { id: "Q8810", name: "Granada" },
]);
const madridFallback = route("spain-outside-andalusia", "ES", [
  { id: "Q2807", name: "Madrid" },
  { id: "Q1492", name: "Barcelona" },
]);
const foreignFallback = route("new-zealand-road-trip", "NZ", [
  { id: "Q37100", name: "Auckland" },
  { id: "Q219416", name: "Queenstown" },
]);

const andalusiaNoTheme = parse("Andalusia 7 days");
assert.equal(validateFallbackRouteAgainstIntent(allowedAndalusia, andalusiaNoTheme).matched, true);
assert.equal(evaluateRouteIntentOracle(andalusiaNoTheme.normalizedRouteIntent, allowedAndalusia, { requireFingerprint: false }).matched, true);
const outsideValidation = validateFallbackRouteAgainstIntent(madridFallback, andalusiaNoTheme);
assert.equal(outsideValidation.matched, false);
assert(outsideValidation.reasonCodes.includes("region-mismatch"));
const outsideOracle = evaluateRouteIntentOracle(andalusiaNoTheme.normalizedRouteIntent, madridFallback, { requireFingerprint: false });
assert.equal(outsideOracle.matched, false);
assert(outsideOracle.violationCodes.includes("region-mismatch"));
const foreignValidation = validateFallbackRouteAgainstIntent(foreignFallback, andalusiaNoTheme);
assert.equal(foreignValidation.matched, false);
assert(foreignValidation.reasonCodes.some((code) => ["country-mismatch", "region-country-mismatch"].includes(code)));

const unsupportedMallorca = validateFallbackRouteAgainstIntent(
  route("generic-spain-island-label", "ES", [{ id: "Q1492", name: "Barcelona" }]),
  parsedByRegion.get("mallorca"),
);
assert.equal(unsupportedMallorca.matched, false);
assert(unsupportedMallorca.reasonCodes.includes("unsupported-region"));
const unsupportedMallorcaOracle = evaluateRouteIntentOracle(
  parsedByRegion.get("mallorca").normalizedRouteIntent,
  route("generic-spain-island-label-oracle", "ES", [{ id: "Q1492", name: "Barcelona" }]),
  { requireFingerprint: false },
);
assert.equal(unsupportedMallorcaOracle.matched, false);
assert(unsupportedMallorcaOracle.violationCodes.includes("unsupported-region"));

function memorySearchCache() {
  return {
    get() { return null; },
    put() {},
    appendReviewCandidates() {},
    findRoute() { return null; },
  };
}

const accepted = [
  route("accepted-nz-road-trip", "NZ", [{ id: "Q37100", name: "Auckland" }, { id: "Q219416", name: "Queenstown" }], {
    durationDays: 10,
    travelStyle: "road-trip",
    themes: ["self-drive"],
  }),
  route("accepted-us-island", "US", [{ id: "Q18094", name: "Honolulu" }], {
    durationDays: 7,
    travelStyle: "island-hopping",
    themes: ["island-vacation"],
  }),
];
const acceptedRepository = {
  list() { return { records: structuredClone(accepted) }; },
  get(id) { return structuredClone(accepted.find((record) => record.id === id) || null); },
  upsert() { throw new Error("ACCEPTED_MUST_REMAIN_READ_ONLY"); },
};
const service = createRouteSearchService({
  acceptedRepository,
  searchCache: memorySearchCache(),
  planner: null,
  intentCatalog: catalogs,
  env: {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "0",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  },
});

for (const query of ["Andalusia road trip", "Mallorca island vacation", "Tenerife island vacation"]) {
  const result = await service.search({ query, limit: 6, sessionId: `region-search-${query}` });
  assert.equal(result.records.length, 0, `${query}: ${JSON.stringify(result.records)}`);
  assert(["constraint-conflict", "destination-suggestion-region-unsupported"].includes(
    result.diagnostics.reason || result.intent.destinationSuggestionStatus,
  ), JSON.stringify(result.diagnostics));
}

const globalResult = await service.search({ query: "island vacation", limit: 6, sessionId: "global-island" });
assert(globalResult.records.length > 0, JSON.stringify(globalResult.diagnostics));
assert(globalResult.records.some((record) => record.id === "accepted-us-island"));

console.log(JSON.stringify({
  status: "PASS",
  regionCases: regionCases.length,
  fingerprints: new Set([...parsedByRegion.values()].map((intent) => intent.routeIntentFingerprint)).size,
  globalIslandRecords: globalResult.records.length,
}));
