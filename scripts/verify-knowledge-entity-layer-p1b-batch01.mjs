import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createKnowledgeEntityLayerRepository,
  validateCountryEntitySet,
  validateKnowledgeCityEntitySet,
  validateKnowledgePoiEntitySet,
} from "../src/lib/routes/index.mjs";
import { CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS } from "./import-knowledge-city-baseline-p1b-batch01.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PILOT_PATHS = Object.freeze([
  "data/knowledge/raw/cities-p1b-pilot.wikidata.json",
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/provenance.cities.p1b-pilot.json",
  "data/knowledge/raw/pois-p1b-pilot.wikidata.json",
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/provenance.pois.p1b-pilot.json",
  "data/knowledge/conflicts.p1b-pilot.json",
  "data/knowledge/review-queue.p1b-pilot.json",
  "ROUTE_V2_KNOWLEDGE_ENTITY_LAYER_P1B_PILOT_IMPLEMENTATION_REPORT.md",
]);
const CACHE_PATHS = Object.freeze([
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);
const protectedPaths = [...PILOT_PATHS, ...CACHE_PATHS].map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor(protectedPaths);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function stableCitySort(cities) {
  return [...cities].sort((left, right) => left.parentCountryEntityId.localeCompare(right.parentCountryEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

function stablePoiSort(pois) {
  return [...pois].sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

const countries = CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS
  .flatMap((relativePath) => readJson(relativePath).countries || []);
const pilotCities = readJson("data/knowledge/cities.p1b-pilot.json").cities || [];
const batchCities = readJson("data/knowledge/batches/cities.p1b-batch01.json").cities || [];
const pilotPois = readJson("data/knowledge/pois.p1b-pilot.json").pois || [];
const batchPois = readJson("data/knowledge/batches/pois.p1b-batch01.json").pois || [];
const allCities = [...pilotCities, ...batchCities];
const allPois = [...pilotPois, ...batchPois];
const allEntities = [...countries, ...allCities, ...allPois];
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(allCities.map((city) => [city.entityId, city]));
const pilotCityIds = new Set(pilotCities.map((city) => city.entityId));
const batchCityIds = new Set(batchCities.map((city) => city.entityId));

assert.equal(countries.length, 50);
assert.equal(allCities.length, 15);
assert.equal(pilotPois.length, 15);
assert.equal(batchPois.length, 30);
assert.equal(allPois.length, 45);
assert.equal(allEntities.length, 110);
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(allCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(allPois).accepted, true);
assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, 110);
assert.equal(new Set(allPois.map((poi) => poi.wikidataId)).size, 45);

const countryCityOverlaps = countries.flatMap((country) => allCities
  .filter((city) => city.wikidataId === country.wikidataId)
  .map((city) => ({ country, city })));
assert.equal(countryCityOverlaps.length, 1);
assert.equal(countryCityOverlaps[0].country.wikidataId, "Q334");
assert.equal(countryCityOverlaps[0].city.wikidataId, "Q334");
assert.equal(countries.some((country) => allPois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(allCities.some((city) => allPois.some((poi) => poi.wikidataId === city.wikidataId)), false);

for (const city of allCities) {
  assert.equal(countryById.get(city.parentCountryEntityId)?.entityType, "country", `${city.entityId} orphan City`);
}
for (const poi of allPois) {
  assert.equal(cityById.get(poi.parentCityEntityId)?.entityType, "city", `${poi.entityId} orphan POI`);
}
for (const poi of pilotPois) assert.equal(pilotCityIds.has(poi.parentCityEntityId), true, `${poi.entityId} Pilot parent changed`);
for (const poi of batchPois) assert.equal(batchCityIds.has(poi.parentCityEntityId), true, `${poi.entityId} Batch parent outside Batch01 City scope`);
for (const city of pilotCities) assert.equal(pilotPois.filter((poi) => poi.parentCityEntityId === city.entityId).length, 3);
for (const city of batchCities) assert.equal(batchPois.filter((poi) => poi.parentCityEntityId === city.entityId).length, 3);

const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: allPois });
assert.equal(repository.validateParentReferences().accepted, true);
assert.deepEqual(repository.listCities(), stableCitySort(allCities));
assert.deepEqual(repository.listPois(), stablePoiSort(allPois));
assert.equal(repository.listCities().length, 15);
assert.equal(repository.listPois().length, 45);
for (const city of batchCities) assert.equal(repository.listPoisByCity(city.entityId).length, 3);

const cityCopy = repository.listCities();
const poiCopy = repository.listPois();
cityCopy[0].canonicalNameEn = "external mutation";
poiCopy[0].canonicalNameEn = "external mutation";
assert.notEqual(repository.listCities()[0].canonicalNameEn, "external mutation");
assert.notEqual(repository.listPois()[0].canonicalNameEn, "external mutation");

const repositoryAgain = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: allPois });
assert.deepEqual(repositoryAgain.listCities(), repository.listCities());
assert.deepEqual(repositoryAgain.listPois(), repository.listPois());
assert.deepEqual(repositoryAgain.validateParentReferences(), repository.validateParentReferences());

const repositorySource = readText("src/lib/routes/knowledge-entity-layer-repository.mjs");
for (const forbidden of ["readFile", "readdir", "fetch(", ".route-v2-cache", "writeFile"]) {
  assert.equal(repositorySource.includes(forbidden), false, `repository uses forbidden capability: ${forbidden}`);
}
const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PILOT_PATHS, "src/lib/routes/knowledge-entity-layer-repository.mjs", "src/lib/routes/index.mjs"], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(protectedDiff, "", `Pilot/repository/index changed:\n${protectedDiff}`);
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "cumulative verifier changed Pilot assets or caches");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  totals: {
    countries: countries.length,
    cities: allCities.length,
    pois: allPois.length,
    totalEntities: allEntities.length,
  },
  layers: {
    pilotPois: pilotPois.length,
    batch01Pois: batchPois.length,
    listCities: repository.listCities().length,
    listPois: repository.listPois().length,
  },
  identity: {
    entityIdsGloballyUnique: true,
    poiQidsGloballyUnique: true,
    onlyCountryCityQidOverlap: "Q334",
    countryPoiOverlap: 0,
    cityPoiOverlap: 0,
  },
  parents: {
    orphanCities: 0,
    orphanPois: 0,
    pilotPoiParentsUnchanged: true,
    batch01PoisPerCity: 3,
  },
  repository: {
    stableOrdering: true,
    defensiveCopies: true,
    parentValidation: true,
    filesystemScanning: false,
    networkCalls: 0,
    cacheWrites: 0,
  },
}, null, 2)}\n`);
