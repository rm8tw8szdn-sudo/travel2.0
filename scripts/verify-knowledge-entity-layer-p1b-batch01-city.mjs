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
import { auditKnowledgeCityBaselineP1bBatch01 } from "./audit-knowledge-city-baseline-p1b-batch01.mjs";
import {
  CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS,
  CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS,
} from "./import-knowledge-city-baseline-p1b-batch01.mjs";
import {
  assertStatesUnchanged,
  statesFor,
} from "./lib/route-v2-test-file-state.mjs";

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

const countries = CITY_BASELINE_P1B_BATCH01_COUNTRY_ASSET_RELATIVE_PATHS.flatMap((relativePath) => readJson(relativePath).countries || []);
const pilotCities = readJson("data/knowledge/cities.p1b-pilot.json").cities || [];
const batchCities = readJson(CITY_BASELINE_P1B_BATCH01_PUBLISH_RELATIVE_PATHS.cities).cities || [];
const pilotPois = readJson("data/knowledge/pois.p1b-pilot.json").pois || [];
const allCities = [...pilotCities, ...batchCities];
const allEntities = [...countries, ...allCities, ...pilotPois];
const countryByIso = new Map(countries.map((country) => [country.isoAlpha2, country]));
const cityById = new Map(allCities.map((city) => [city.entityId, city]));

assert.equal(countries.length, 50);
assert.equal(pilotCities.length, 5);
assert.equal(batchCities.length, 10);
assert.equal(allCities.length, 15);
assert.equal(pilotPois.length, 15);
assert.equal(allEntities.length, 80);
assert.equal(validateCountryEntitySet(countries).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(pilotCities).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(batchCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(pilotPois).accepted, true);
assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, 80);
assert.equal(new Set(allCities.map((city) => city.wikidataId)).size, 15);
assert.equal(new Set(pilotPois.map((poi) => poi.wikidataId)).size, 15);

const countryCityOverlaps = countries.flatMap((country) => allCities
  .filter((city) => city.wikidataId === country.wikidataId)
  .map((city) => ({ country, city })));
assert.equal(countryCityOverlaps.length, 1);
assert.equal(countryCityOverlaps[0].country.wikidataId, "Q334");
assert.equal(countryCityOverlaps[0].city.wikidataId, "Q334");
assert.equal(countries.some((country) => pilotPois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(allCities.some((city) => pilotPois.some((poi) => poi.wikidataId === city.wikidataId)), false);

for (const poi of pilotPois) {
  const parentCity = cityById.get(poi.parentCityEntityId);
  assert(parentCity, `${poi.entityId} Pilot POI parent missing`);
  assert.equal(pilotCities.some((city) => city.entityId === parentCity.entityId), true, `${poi.entityId} Pilot POI parent changed to Batch City`);
}

const repository = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: pilotPois });
assert.equal(repository.validateParentReferences().accepted, true);
assert.deepEqual(repository.listCities(), stableCitySort(allCities));
assert.deepEqual(repository.listPois(), stablePoiSort(pilotPois));
assert.equal(repository.listCities().length, 15);
assert.equal(repository.listPois().length, 15);

const expectedCityCounts = Object.freeze({ JP: 2, TR: 2, SG: 1, CO: 2, CZ: 2, FI: 2, NL: 2, PL: 2 });
for (const [isoAlpha2, expectedCount] of Object.entries(expectedCityCounts)) {
  const country = countryByIso.get(isoAlpha2);
  assert(country, `${isoAlpha2} Country missing`);
  assert.equal(repository.listCitiesByCountry(country.entityId).length, expectedCount, `${isoAlpha2} City distribution mismatch`);
}
const poiDistribution = Object.fromEntries(pilotCities.map((city) => [city.canonicalNameEn, repository.listPoisByCity(city.entityId).length]));
assert.deepEqual(poiDistribution, { Ankara: 3, Istanbul: 3, Kyoto: 3, Tokyo: 3, Singapore: 3 });

const cityCopy = repository.listCities();
const poiCopy = repository.listPois();
cityCopy[0].canonicalNameEn = "external mutation";
poiCopy[0].canonicalNameEn = "external mutation";
assert.notEqual(repository.listCities()[0].canonicalNameEn, "external mutation");
assert.notEqual(repository.listPois()[0].canonicalNameEn, "external mutation");

const repositoryAgain = createKnowledgeEntityLayerRepository({ countries, cities: allCities, pois: pilotPois });
assert.deepEqual(repositoryAgain.listCities(), repository.listCities());
assert.deepEqual(repositoryAgain.listPois(), repository.listPois());
assert.deepEqual(repositoryAgain.validateParentReferences(), repository.validateParentReferences());

const audit = auditKnowledgeCityBaselineP1bBatch01();
assert.equal(audit.status, "PASS");
assert.equal(audit.sourceProjectionDifferences.length, 10);
assert.equal(audit.cityDetails.every((city) => city.semanticGate.typeClassification?.policy === "exact-p31-qid-v1"), true);
assert.equal(audit.cityDetails.every((city) => city.semanticGate.rejectedTypeLabels.length === 0), true);
assert.deepEqual(audit.cumulative, {
  countries: 50,
  cities: 15,
  pois: 15,
  totalEntities: 80,
  cityDistribution: expectedCityCounts,
});

const verifierSource = readText("scripts/verify-knowledge-entity-layer-p1b-batch01-city.mjs");
for (const forbidden of [["fe", "tch("].join(""), ["write", "File"].join(""), ["--", "refresh"].join("")]) {
  assert.equal(verifierSource.includes(forbidden), false, `cumulative City verifier references ${forbidden}`);
}
const pilotDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PILOT_PATHS], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
assert.equal(pilotDiff, "", `Pilot assets changed:\n${pilotDiff}`);
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "cumulative City verifier changed Pilot assets or caches");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  totals: {
    countries: countries.length,
    cities: allCities.length,
    pois: pilotPois.length,
    totalEntities: allEntities.length,
  },
  cityDistribution: expectedCityCounts,
  pilotPoiDistribution: poiDistribution,
  identity: {
    entityIdsGloballyUnique: true,
    cityQidsUnique: true,
    poiQidsUnique: true,
    onlyCountryCityQidOverlap: "Q334",
  },
  parents: {
    orphanCities: 0,
    orphanPilotPois: 0,
    allPilotPoiParentsUnchanged: true,
  },
  repository: {
    listCities: 15,
    listPois: 15,
    stableOrdering: true,
    defensiveCopies: true,
    parentReferencesValid: true,
  },
  pilotAssetsUnchanged: true,
  realNetworkCalls: 0,
}, null, 2)}\n`);
