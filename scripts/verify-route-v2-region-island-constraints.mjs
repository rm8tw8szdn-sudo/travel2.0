import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeTravelRegionKey,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  parseSearchIntent,
  ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS,
  ROUTE_V2_TRAVEL_REGION_DEFINITIONS,
  validateNormalizedRouteIntent,
} from "../src/lib/routes/index.mjs";
import { buildRouteDestinationSuggestion } from "../src/lib/routes/route-destination-suggestion.mjs";
import { validateFallbackRouteAgainstIntent } from "../src/lib/routes/route-fallback-constraint-validator.mjs";
import { evaluateRouteIntentOracle } from "../src/lib/routes/route-intent-model-oracle.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-region-island-"));
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;
globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_REGION_ISLAND_VERIFIER");
};

const knowledgeRepository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
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
  assert.equal(intent.normalizedRouteIntent.hardConstraints.region.value, regionKey, query);
}

for (const definition of [
  ...ROUTE_V2_TRAVEL_REGION_DEFINITIONS,
  ...ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS,
]) {
  assert.equal(canonicalizeTravelRegionKey(definition.key), definition.key, definition.key);
  assert.equal(canonicalizeTravelRegionKey(definition.label), definition.key, definition.label);
  for (const alias of definition.aliases || []) {
    assert.equal(canonicalizeTravelRegionKey(alias), definition.key, `${definition.key}: ${alias}`);
  }
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

function runtimeEnv() {
  return {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "false",
    ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
    ROUTE_V2_READY_POOL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
}

function createRealService(root) {
  const env = runtimeEnv();
  const acceptedRepository = createAcceptedRouteRepository({
    storagePath: path.join(root, "accepted", "accepted-routes.json"),
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({
      storagePath: path.join(root, "runtime", "legacy-evidence.json"),
    }),
    candidatePoolStore: createRouteCandidatePoolStore({
      storagePath: path.join(root, "runtime", "candidate-pool.jsonl"),
      env,
    }),
    decisionTraceStore: createDecisionTraceStore({
      storagePath: path.join(root, "runtime", "decision-traces.jsonl"),
      env,
    }),
    evidenceBundleStore: createEvidenceBundleStore({
      storagePath: path.join(root, "runtime", "evidence-bundles.jsonl"),
      env,
    }),
    knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository: knowledgeRepository }),
    env,
  });
  return {
    acceptedRepository,
    service: createRouteSearchService({
      acceptedRepository,
      searchCache: memorySearchCache(),
      planner,
      intentCatalog: catalogs,
      env,
    }),
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

const real = createRealService(path.join(temporaryRoot, "real-planner"));
const productionCases = [
  ["Lake Como 7 days", "lake-como", "Q1308"],
  ["Jeju Island 7 days", "jeju-island", "Q42142"],
  ["Mallorca island vacation", "mallorca", null],
  ["Tenerife island vacation", "tenerife", null],
  ["Andalusia road trip", "andalusia", null],
  ["Provence 7 days", "provence", null],
  ["Dolomites hiking 7 days", "dolomites", null],
];
const productionResults = [];
for (const [query, regionKey, requiredDestinationId] of productionCases) {
  const result = await real.service.search({ query, limit: 6, sessionId: `region-production-${regionKey}` });
  productionResults.push({ query, regionKey, records: result.records.length, reason: result.diagnostics.reason || "" });
  assert.equal(result.intent.normalizedRouteIntent.hardConstraints.region.value, regionKey, query);
  for (const record of result.records) {
    const validation = validateFallbackRouteAgainstIntent(record, result.intent);
    assert.equal(validation.matched, true, `${query}: ${JSON.stringify(validation)}`);
    const oracle = evaluateRouteIntentOracle(result.intent.normalizedRouteIntent, record, { requireFingerprint: false });
    assert.equal(oracle.matched, true, `${query}: ${JSON.stringify(oracle)}`);
    if (requiredDestinationId) {
      const destinationIds = (record.destinationEntities || []).flatMap((destination) => [
        destination.wikidataId,
        destination.entityId,
        destination.id,
      ]).filter(Boolean);
      assert(destinationIds.includes(requiredDestinationId), `${query}: ${JSON.stringify(destinationIds)}`);
    }
  }
  if (result.records.length === 0) {
    assert([
      "constraint-conflict",
      "destination-suggestion-region-unsupported",
      "no-valid-route",
    ].includes(result.diagnostics.reason || result.intent.destinationSuggestionStatus), JSON.stringify(result.diagnostics));
  }
}
assert.equal(real.acceptedRepository.list({ limit: 100 }).records.length, 0);

const canonicalMismatchIntent = structuredClone(parsedByRegion.get("lake-como").normalizedRouteIntent);
canonicalMismatchIntent.hardConstraints.region.value = "lake-como-stale";
const canonicalMismatchRoute = route("lake-como-canonical-mutation", "IT", [{ id: "Q1308", name: "Como" }]);
const canonicalMismatchValidation = validateFallbackRouteAgainstIntent(canonicalMismatchRoute, canonicalMismatchIntent);
assert.equal(canonicalMismatchValidation.matched, false);
assert(canonicalMismatchValidation.reasonCodes.includes("region-definition-missing"), JSON.stringify(canonicalMismatchValidation));
const canonicalMismatchOracle = evaluateRouteIntentOracle(canonicalMismatchIntent, canonicalMismatchRoute, { requireFingerprint: false });
assert.equal(canonicalMismatchOracle.matched, false);
assert(canonicalMismatchOracle.violationCodes.includes("region-definition-missing"), JSON.stringify(canonicalMismatchOracle));

const legacyCompactedRegionIntent = structuredClone(parsedByRegion.get("lake-como").normalizedRouteIntent);
legacyCompactedRegionIntent.hardConstraints.region.value = "lakecomo";
const compactedValidation = validateNormalizedRouteIntent(legacyCompactedRegionIntent);
assert.equal(compactedValidation.valid, false);
assert(compactedValidation.violations.some((entry) => (
  entry.path === "hardConstraints.region.value" && entry.code === "non-canonical-value"
)), JSON.stringify(compactedValidation));

assert.equal(externalFetchCalls, 0);
globalThis.fetch = originalFetch;
fs.rmSync(temporaryRoot, { recursive: true, force: true });

console.log(JSON.stringify({
  status: "PASS",
  regionCases: regionCases.length,
  fingerprints: new Set([...parsedByRegion.values()].map((intent) => intent.routeIntentFingerprint)).size,
  globalIslandRecords: globalResult.records.length,
  productionResults,
  externalFetchCalls,
}));
