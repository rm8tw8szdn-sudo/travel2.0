import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS,
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  createPublishedKnowledgeEntityLayerRepository,
} from "../src/lib/routes/index.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BATCH02_CITY_NAMES = Object.freeze([
  "Barcelona", "Berlin", "Busan", "Florence", "Lyon",
  "Madrid", "Munich", "Paris", "Rome", "Seoul",
]);
const EXPECTED_BATCH02_POIS = Object.freeze({
  Paris: ["Eiffel Tower", "Louvre Museum", "Musée d'Orsay"],
  Lyon: ["Basilica of Notre-Dame de Fourvière", "Musée des Confluences", "Museum of Fine Arts of Lyon"],
  Berlin: ["Brandenburg Gate", "East Side Gallery", "Museum Island"],
  Munich: ["Englischer Garten", "Marienplatz", "Nymphenburg Palace"],
  Rome: ["Colosseum", "Pantheon", "Trevi Fountain"],
  Florence: ["Florence Cathedral", "piazzale Michelangelo", "Uffizi Gallery"],
  Madrid: ["El Retiro Park", "Museo del Prado", "Royal Palace of Madrid"],
  Barcelona: ["Basilica and Expiatory Church of the Holy Family", "Casa Batlló", "Park Güell"],
  Seoul: ["Changdeokgung", "Namsan Seoul Tower", "National Museum of Korea"],
  Busan: ["Busan Museum", "Diamond Tower", "Haedong Yonggungsa"],
});
const PROTECTED_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
  ".route-v2-cache/accepted-routes.json",
  ".route-v2-cache/route-candidate-pool.jsonl",
  ".route-v2-cache/decision-traces.jsonl",
  ".route-v2-cache/route-evidence-bundles.jsonl",
  "route-feed-bootstrap.js",
]);

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

const protectedAbsolutePaths = PROTECTED_PATHS.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath));
const protectedBefore = statesFor(protectedAbsolutePaths);
assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, {
  countries: 51,
  cities: 144,
  pois: 904,
  total: 1099,
});
assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities, [
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
  "data/knowledge/batches/cities.p1b-batch02.json",
  "data/knowledge/batches/cities.p1b-batch03.json",
  "data/knowledge/batches/cities.p1b-batch04.json",
  "data/knowledge/batches/cities.p1b-batch05.json",
  "data/knowledge/batches/cities.p1b-batch06.json",
  "data/knowledge/batches/cities.p1b-batch07.json",
  "data/knowledge/batches/cities.p1b-batch08.json",
  "data/knowledge/batches/cities.p1b-batch09.json",
  "data/knowledge/batches/cities.p1b-batch10.json",
  "data/knowledge/batches/cities.p1b-batch11.json",
  "data/knowledge/batches/cities.p1b-batch12.json",
  "data/knowledge/batches/cities.p1b-batch13.json",
]);
assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois, [
  "data/knowledge/pois.p1b-pilot.json",
  "data/knowledge/batches/pois.p1b-batch01.json",
  "data/knowledge/batches/pois.p1b-batch02.json",
  "data/knowledge/batches/pois.p1b-batch03.json",
  "data/knowledge/batches/pois.p1b-batch04.json",
  "data/knowledge/batches/pois.p1b-batch05.json",
  "data/knowledge/batches/pois.p1b-batch06.json",
  "data/knowledge/batches/pois.p1b-batch07.json",
  "data/knowledge/batches/pois.p1b-batch08.json",
  "data/knowledge/batches/pois.p1b-batch09.json",
  "data/knowledge/batches/pois.p1b-batch10.json",
  "data/knowledge/batches/pois.p1b-batch11.json",
  "data/knowledge/batches/pois.p1b-batch12.json",
  "data/knowledge/batches/pois.p1b-batch13.json",
]);

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: PROJECT_ROOT });
const repositoryAgain = createPublishedKnowledgeEntityLayerRepository({ projectRoot: PROJECT_ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const entities = [...countries, ...cities, ...pois];
assert.equal(countries.length, 51);
assert.equal(cities.length, 144);
assert.equal(pois.length, 904);
assert.equal(entities.length, 1099);
assert.equal(repository.validateParentReferences().accepted, true);
assert.deepEqual(repositoryAgain.listCountries(), countries);
assert.deepEqual(repositoryAgain.listCities(), cities);
assert.deepEqual(repositoryAgain.listPois(), pois);
assert.equal(new Set(entities.map((entity) => entity.entityId)).size, 1099);
assert.equal(new Set(cities.map((city) => city.wikidataId)).size, 144);
assert.equal(new Set(pois.map((poi) => poi.wikidataId)).size, 904);

const countryIds = new Set(countries.map((country) => country.entityId));
const cityIds = new Set(cities.map((city) => city.entityId));
assert.equal(cities.every((city) => countryIds.has(city.parentCountryEntityId)), true);
assert.equal(pois.every((poi) => cityIds.has(poi.parentCityEntityId)), true);
const countryCityOverlaps = countries.flatMap((country) => cities
  .filter((city) => city.wikidataId === country.wikidataId)
  .map((city) => ({ country, city })));
assert.equal(countryCityOverlaps.length, 1);
assert.equal(countryCityOverlaps[0].country.wikidataId, "Q334");
assert.equal(countryCityOverlaps[0].city.wikidataId, "Q334");
assert.equal(countries.some((country) => pois.some((poi) => poi.wikidataId === country.wikidataId)), false);
assert.equal(cities.some((city) => pois.some((poi) => poi.wikidataId === city.wikidataId)), false);

const batch02 = [];
for (const name of BATCH02_CITY_NAMES) {
  const city = cities.find((candidate) => candidate.canonicalNameEn === name);
  assert.ok(city, `Batch02 City missing: ${name}`);
  const cityPois = repository.listPoisByCity(city.entityId);
  assert.ok(cityPois.length >= 3, `${name} must retain at least its three Batch02 POIs`);
  assert.ok(EXPECTED_BATCH02_POIS[name].every((poiName) => cityPois.some((poi) => poi.canonicalNameEn === poiName)), `${name} must retain every Batch02 POI`);
  assert.equal(cityPois.every((poi) => poi.parentCityEntityId === city.entityId), true);
  batch02.push({ city: name, entityId: city.entityId, pois: cityPois.map((poi) => poi.canonicalNameEn) });
}

const countriesCopy = repository.listCountries();
const citiesCopy = repository.listCities();
const poisCopy = repository.listPois();
countriesCopy[0].canonicalNameEn = "external mutation";
citiesCopy[0].canonicalNameEn = "external mutation";
poisCopy[0].canonicalNameEn = "external mutation";
assert.notEqual(repository.listCountries()[0].canonicalNameEn, "external mutation");
assert.notEqual(repository.listCities()[0].canonicalNameEn, "external mutation");
assert.notEqual(repository.listPois()[0].canonicalNameEn, "external mutation");

const repositorySource = readText("src/lib/routes/knowledge-entity-layer-repository.mjs");
for (const forbidden of ["readFile", "readdir", "fetch(", ".route-v2-cache", "writeFile"]) {
  assert.equal(repositorySource.includes(forbidden), false, `repository uses forbidden capability: ${forbidden}`);
}
const loaderSource = readText("src/lib/routes/knowledge-entity-layer-published-assets.mjs");
for (const forbidden of ["raw/", "candidate", "selection", "review", "conflict", ".route-v2-cache", "readdir", "fetch(", "writeFile"]) {
  assert.equal(loaderSource.includes(forbidden), false, `published loader uses forbidden input or capability: ${forbidden}`);
}

const protectedDiff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...PROTECTED_PATHS], {
  cwd: PROJECT_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(protectedDiff, "", `Prior assets or cache changed:\n${protectedDiff}`);
assertStatesUnchanged(protectedBefore, statesFor(protectedAbsolutePaths), "Batch02 cumulative verifier changed prior assets or cache");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  totals: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  batch02,
  identity: {
    entityIdsGloballyUnique: true,
    cityQidsUnique: true,
    poiQidsUnique: true,
    onlyCountryCityQidOverlap: "Q334",
    countryPoiOverlap: 0,
    cityPoiOverlap: 0,
  },
  parents: { orphanCities: 0, orphanPois: 0, batch02PoisPerCity: 3 },
  repository: {
    stableOrdering: true,
    defensiveCopies: true,
    parentValidation: true,
    filesystemScanning: false,
    networkCalls: 0,
    cacheWrites: 0,
  },
}, null, 2)}\n`);
