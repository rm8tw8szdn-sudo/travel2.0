import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
} from "../src/lib/routes/knowledge-entity-layer-planner-adapter.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { createRouteCompositionPlanner } from "../src/lib/routes/route-composition-planner.mjs";
import { createRouteDiscovery } from "../src/lib/routes/discovery.mjs";
import { createRouteSearchService } from "../src/lib/routes/route-search-service.mjs";
import { parseSearchIntent } from "../src/lib/routes/search-intent-parser.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function directorySnapshot(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      const bytes = fs.readFileSync(absolutePath);
      const stat = fs.statSync(absolutePath);
      output.push({
        path: path.relative(root, absolutePath).replaceAll("\\", "/"),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  visit(root);
  return output;
}

const cacheBefore = directorySnapshot(path.join(projectRoot, ".route-v2-cache"));
const knowledgeDataBefore = directorySnapshot(path.join(projectRoot, "data", "knowledge"));
const originalFetch = globalThis.fetch;
let networkRequestCount = 0;
globalThis.fetch = async () => {
  networkRequestCount += 1;
  throw new Error("NETWORK_DISABLED_FOR_ENTITY_LAYER_PLANNER_VERIFIER");
};

const repository = createPublishedKnowledgeEntityLayerRepository();
const fallbackTokyo = {
  wikidataId: "Q1490",
  countryCode: "JP",
  name: "Tokyo fallback",
  entityTypeName: "city",
  latitude: 35.6894,
  longitude: 139.6917,
};
const fallbackMcMurdo = {
  wikidataId: "Q498872",
  countryCode: "AQ",
  name: "McMurdo Station",
  entityTypeName: "city",
  latitude: -77.846,
  longitude: 166.676,
};
const fallbackKnowledgeGraph = {
  queryDestinations(query = {}) {
    if (query.country === "JP") return [structuredClone(fallbackTokyo)];
    if (query.country === "AQ") return [structuredClone(fallbackMcMurdo)];
    return [];
  },
};

const adapter = createKnowledgeEntityLayerPlannerAdapter({ repository, fallbackKnowledgeGraph });
const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });

assert.equal(repository.listCountries().length, 79);
assert.equal(repository.listCities().length, 601);
assert.equal(repository.listPois().length, 4038);
assert.equal(catalogs.countries.length, 79);
assert.equal(catalogs.cities.length, 601);

for (const country of repository.listCountries()) {
  const intent = parseSearchIntent(country.canonicalNameEn, { catalogs });
  assert.equal(intent.countryCode, country.isoAlpha2, `Country intent should resolve ${country.canonicalNameEn}`);
}

for (const city of repository.listCities()) {
  const country = repository.getEntity(city.parentCountryEntityId);
  const catalogCity = catalogs.cities.find((item) => item.entityId === city.entityId);
  const intent = parseSearchIntent(`${country.canonicalNameEn} ${city.canonicalNameEn}`, { catalogs });
  assert.equal(intent.countryCode, country.isoAlpha2, `City intent should keep the parent Country for ${city.canonicalNameEn}`);
  assert.ok(intent.requiredDestinationIds.includes(city.wikidataId), `City intent should resolve the Knowledge identity for ${city.canonicalNameEn}`);
  assert.ok(catalogCity, `Search catalog must retain ${city.canonicalNameEn}`);
}

const adapterCities = repository.listCountries().flatMap((country) => adapter.queryDestinations({
  country: country.isoAlpha2,
  limit: 100,
}).filter((destination) => destination.destinationSource === "knowledge-entity-layer"));
assert.equal(adapterCities.length, 601);
assert.equal(adapterCities.flatMap((city) => city.poiEntities).length, 4038);
assert.ok(adapterCities.every((city) => city.poiEntities.length >= 1), "every published City must retain at least one validated POI");
const reviewQueueDirectory = path.join(projectRoot, "data", "knowledge", "batches");
const reviewedCapacityShortfalls = fs.readdirSync(reviewQueueDirectory)
  .filter((fileName) => /^review-queue\.knowledge-expansion-batch\d{2}(?:-wave\d+)?\.json$/.test(fileName))
  .flatMap((fileName) => {
    const reviewQueue = JSON.parse(fs.readFileSync(path.join(reviewQueueDirectory, fileName), "utf8"));
    return Array.isArray(reviewQueue) ? reviewQueue : reviewQueue.entries ?? [];
  })
  .filter((entry) => entry.entityType === "poi-capacity"
    && entry.disposition === "accepted-below-target-without-padding"
    && entry.reasonCodes?.includes("route-quality-capacity-shortfall"));

for (const city of adapterCities.filter((entry) => entry.poiEntities.length < 3)) {
  const review = reviewedCapacityShortfalls.find((entry) => entry.parentCityEntityId === city.entityId
    && entry.wikidataId === city.wikidataId
    && entry.countryCode === city.countryCode);
  assert.ok(review, `${city.canonicalNameEn} must have an exact reviewed capacity-shortfall record`);
  assert.equal(review.selectedPoiCount, city.poiEntities.length, `${city.canonicalNameEn} reviewed POI count must match published data`);
  assert.ok(review.targetPoiCount >= 3, `${city.canonicalNameEn} review must document the unmet route-capacity target`);
}

const expectedCities = new Map([
  ["Amsterdam", ["Anne Frank House", "Rijksmuseum", "Van Gogh Museum"]],
  ["Bogotá", ["Bogotá Primatial Cathedral", "Botero Museum", "National Museum of Colombia"]],
  ["Prague", ["Church of Our Lady before Týn", "Old Town Hall with Astronomical Clock", "Žižkov Television Tower"]],
  ["Tokyo", ["Meiji Jingū", "Sensō-ji Temple", "Tokyo Tower"]],
  ["Paris", ["Eiffel Tower", "Louvre Museum", "Musée d'Orsay"]],
  ["Berlin", ["Brandenburg Gate", "East Side Gallery", "Museum Island"]],
  ["Rome", ["Colosseum", "Pantheon", "Trevi Fountain"]],
  ["Madrid", ["El Retiro Park", "Museo del Prado", "Royal Palace of Madrid"]],
  ["Seoul", ["Changdeokgung", "Namsan Seoul Tower", "National Museum of Korea"]],
]);

for (const [countryCode, cityName] of [
  ["NL", "Amsterdam"],
  ["CO", "Bogotá"],
  ["CZ", "Prague"],
  ["JP", "Tokyo"],
  ["FR", "Paris"],
  ["DE", "Berlin"],
  ["IT", "Rome"],
  ["ES", "Madrid"],
  ["KR", "Seoul"],
]) {
  const destinations = adapter.queryDestinations({ country: countryCode, limit: 100 });
  const city = destinations.find((item) => item.canonicalNameEn === cityName);
  assert.ok(city, `${cityName} should be available through the Planner adapter`);
  assert.ok(city.entityId.startsWith("city-"));
  assert.ok(city.parentCountryEntityId.startsWith("country-"));
  assert.equal(city.entityTypeName, "city");
  for (const expectedPoi of expectedCities.get(cityName)) {
    assert.ok(city.poiEntities.some((poi) => poi.canonicalNameEn === expectedPoi), `${cityName} should retain ${expectedPoi}`);
  }
  assert.ok(city.poiEntities.every((poi) => poi.parentCityEntityId === city.entityId));
  assert.ok(city.poiEntities.every((poi) => !Object.hasOwn(poi, "provenance")));
  assert.ok(!Object.hasOwn(city, "provenance"));
}

const firstJapan = adapter.queryDestinations({ country: "JP", limit: 100 });
const secondJapan = adapter.queryDestinations({ country: "JP", limit: 100 });
assert.deepEqual(firstJapan, secondJapan, "Planner adapter ordering should be stable");
assert.equal(firstJapan.filter((item) => item.wikidataId === "Q1490").length, 1, "fallback Tokyo should be de-duplicated");
firstJapan[0].canonicalNameEn = "mutated";
firstJapan[0].poiEntities[0].canonicalNameEn = "mutated";
assert.deepEqual(adapter.queryDestinations({ country: "JP", limit: 100 }), secondJapan, "Planner adapter should return defensive copies");
assert.deepEqual(adapter.queryDestinations({ country: "AQ", limit: 20 }), [fallbackMcMurdo], "unmapped countries should retain the fallback graph");

const netherlandsIntent = parseSearchIntent("Netherlands Amsterdam 4 days", { catalogs });
assert.equal(netherlandsIntent.countryCode, "NL");
assert.deepEqual(netherlandsIntent.normalizedCities, ["amsterdam"]);
assert.equal(netherlandsIntent.canGenerate, true);

const colombiaIntent = parseSearchIntent("Colombia Bogotá", { catalogs });
assert.equal(colombiaIntent.countryCode, "CO");
assert.deepEqual(colombiaIntent.normalizedCities, ["bogota"]);
assert.equal(colombiaIntent.canGenerate, true);
const franceIntent = parseSearchIntent("France Paris 4 days", { catalogs });
assert.equal(franceIntent.countryCode, "FR");
assert.deepEqual(franceIntent.normalizedCities, ["paris"]);
assert.equal(franceIntent.canGenerate, true);
const mixedCountryCityIntent = parseSearchIntent("Netherlands Prague", { catalogs });
assert.deepEqual(mixedCountryCityIntent.cities, ["Prague"], "an explicit City must not be dropped when its parent Country differs from another explicit Country");
assert.deepEqual(mixedCountryCityIntent.countryCodes, ["NL", "CZ"]);
assert.deepEqual(mixedCountryCityIntent.requiredCountryCodes, ["NL"]);
assert.deepEqual(mixedCountryCityIntent.requiredDestinationIds, ["Q1085"]);
assert.equal(parseSearchIntent("online itinerary", { catalogs }).countryCode, "", "short ISO aliases must match complete tokens only");

let capturedPlannerContext = null;
const searchService = createRouteSearchService({
  acceptedRepository: { list: () => ({ records: [] }) },
  searchCache: {
    get: () => null,
    put: () => {},
    appendReviewCandidates: () => {},
  },
  intentCatalog: catalogs,
  planner: {
    async buildCandidates(input) {
      capturedPlannerContext = structuredClone(input.context);
      return { accepted: [], rejected: [] };
    },
  },
  env: {
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "1000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  },
});
await searchService.search({ query: "Netherlands Amsterdam 4 days", limit: 10 });
assert.equal(capturedPlannerContext.countryCode, "NL");
assert.deepEqual(capturedPlannerContext.cities, ["Amsterdam"]);

const plannerRepositories = {
  acceptedRepository: { list: () => ({ records: [] }) },
  evidenceRepository: {
    bySourceRoute: () => [],
    list: () => [],
    upsert: () => ({ accepted: true }),
  },
};
const entityPlanner = createRouteCompositionPlanner({
  ...plannerRepositories,
  knowledgeGraph: adapter,
});
const entityPlannerResult = await entityPlanner.buildCandidates({
  limit: 1,
  context: {
    durationDays: 3,
    country: "NL",
    countryCode: "NL",
    countryName: "Netherlands",
    cities: ["Amsterdam"],
    normalizedCities: ["amsterdam"],
    travelStyle: "city-break",
  },
});
assert.equal(entityPlannerResult.accepted.length, 1, JSON.stringify(entityPlannerResult.rejected));
const entityPlannerCandidate = entityPlannerResult.accepted[0];
const entityPlannerRecord = entityPlannerCandidate.record;
assert.equal(entityPlannerRecord.destinationSource, "knowledge-entity-layer");
assert.equal(entityPlannerCandidate.destinationSource, "knowledge-entity-layer");
assert.equal(entityPlannerRecord.countryEntities[0].entityId, "country-febe99ab26ea41f0");
assert.ok(entityPlannerRecord.destinationEntities.every((city) => city.entityId && city.parentCountryEntityId));
assert.ok(entityPlannerRecord.destinationEntities.every((city) => city.poiEntities.length >= 3));
assert.equal(entityPlannerRecord.destinationEntities[0].canonicalNameEn, "Amsterdam");
assert.equal(entityPlannerRecord.provenance.sources[0].providerId, "knowledge-entity-layer");

for (const requested of [
  { countryCode: "CZ", countryName: "Czechia", city: "Prague", normalizedCity: "prague" },
  { countryCode: "CO", countryName: "Colombia", city: "Bogotá", normalizedCity: "bogota" },
  { countryCode: "FR", countryName: "France", city: "Paris", normalizedCity: "paris" },
]) {
  const result = await entityPlanner.buildCandidates({
    limit: 1,
    context: {
      durationDays: 3,
      country: requested.countryCode,
      countryCode: requested.countryCode,
      countryName: requested.countryName,
      cities: [requested.city],
      normalizedCities: [requested.normalizedCity],
      travelStyle: "city-break",
    },
  });
  assert.equal(result.accepted.length, 1, `${requested.city}: ${JSON.stringify(result.rejected)}`);
  assert.equal(result.accepted[0].record.destinationEntities[0].canonicalNameEn, requested.city);
  assert.ok(result.accepted[0].record.destinationEntities[0].poiEntities.length >= 3);
}

const legacyGraph = {
  queryDestinations(query = {}) {
    if (query.country !== "JP") return [];
    return [
      { wikidataId: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
      { wikidataId: "Q39231", countryCode: "JP", name: "富士山", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274 },
      { wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
      { wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048 },
      { wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
    ];
  },
};
const legacyPlanner = createRouteCompositionPlanner({ ...plannerRepositories, knowledgeGraph: legacyGraph });
const legacyPlannerResult = await legacyPlanner.buildCandidates({
  limit: 1,
  context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.equal(legacyPlannerResult.accepted.length, 1, JSON.stringify(legacyPlannerResult.rejected));
assert.equal(legacyPlannerResult.accepted[0].record.destinationSource, "knowledge-graph");
assert.equal(legacyPlannerResult.accepted[0].destinationSource, "knowledge-graph");

const discoverySource = fs.readFileSync(new URL("../src/lib/routes/discovery.mjs", import.meta.url), "utf8");
assert.match(discoverySource, /createPublishedKnowledgeEntityLayerRepository/u);
assert.match(discoverySource, /createKnowledgeEntityLayerPlannerAdapter/u);
assert.match(discoverySource, /createKnowledgeEntityLayerSearchIntentCatalog/u);
assert.match(discoverySource, /intentCatalog:/u);

const indexSource = fs.readFileSync(new URL("../src/lib/routes/index.mjs", import.meta.url), "utf8");
assert.match(indexSource, /createKnowledgeEntityLayerPlannerAdapter/u);
assert.match(indexSource, /createKnowledgeEntityLayerSearchIntentCatalog/u);

const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
assert.match(serverSource, /createDiscoveryHandler\(routeLibrary, knowledgeEntityLayerRepository, routeV2RuntimeEnv\)/u);
assert.match(serverSource, /createRouteDiscovery\(\{[^}]*knowledgeEntityLayerRepository/u);

const repositoryStatus = { meetsTarget: true, shortages: [], repositoryVersion: "entity-layer-planner-verifier" };
const previousLlmFlag = process.env.ROUTE_LLM_REFINE_ENABLED;
process.env.ROUTE_LLM_REFINE_ENABLED = "false";
const defaultDiscovery = createRouteDiscovery({
  knowledgeEntityLayerRepository: repository,
  acceptedRepository: {
    list: () => ({ records: [] }),
    status: () => repositoryStatus,
    version: () => repositoryStatus.repositoryVersion,
  },
  feedBuffer: { status: () => repositoryStatus },
  searchIndex: { search: () => ({ records: [] }) },
  searchCache: {
    get: () => null,
    put: () => {},
    appendReviewCandidates: () => {},
  },
  searchAnalytics: {
    logSearch: () => {},
    logDetailClick: () => {},
  },
  requestId: () => "entity-layer-planner-verifier",
});
const defaultSearchResult = await defaultDiscovery.discover({
  mode: "search",
  query: "Netherlands Amsterdam 3 days",
  limit: 10,
});
if (previousLlmFlag === undefined) delete process.env.ROUTE_LLM_REFINE_ENABLED;
else process.env.ROUTE_LLM_REFINE_ENABLED = previousLlmFlag;

assert.equal(defaultSearchResult.intent.countryCode, "NL");
assert.deepEqual(defaultSearchResult.intent.cities, ["Amsterdam"]);
assert.equal(defaultSearchResult.records.length, 1);
assert.equal(defaultSearchResult.records[0].destinationSource, "knowledge-entity-layer");
assert.equal(defaultSearchResult.records[0].countryEntities[0].entityId, "country-febe99ab26ea41f0");
assert.equal(defaultSearchResult.records[0].destinationEntities[0].canonicalNameEn, "Amsterdam");
const defaultAmsterdamPois = defaultSearchResult.records[0].destinationEntities[0].poiEntities
  .map((poi) => poi.canonicalNameEn);
assert.ok(expectedCities.get("Amsterdam").every((poi) => defaultAmsterdamPois.includes(poi)));

assert.equal(networkRequestCount, 0, "Planner integration must not perform external network requests");
assert.deepEqual(directorySnapshot(path.join(projectRoot, ".route-v2-cache")), cacheBefore, "Planner integration must not change route cache files");
assert.deepEqual(directorySnapshot(path.join(projectRoot, "data", "knowledge")), knowledgeDataBefore, "Planner integration must not change Knowledge Entity Layer assets");
globalThis.fetch = originalFetch;

console.log("PASS verify-knowledge-entity-layer-planner-integration-p1b-batch01");
