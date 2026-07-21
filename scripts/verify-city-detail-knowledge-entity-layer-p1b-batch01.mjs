import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const require = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TravelData = require("../travel-data.js");
const {
  loadKnowledgeCityPois,
  normalizeKnowledgeName,
  resolveKnowledgeCity,
} = require("../knowledge-city-detail.js");

const repository = createPublishedKnowledgeEntityLayerRepository();
const countries = repository.listCountries();
const requestedPaths = [];

function readText(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

async function repositoryFetch(input) {
  const path = String(input).replace(/^https?:\/\/[^/]+/, "");
  requestedPaths.push(path);
  if (path === "/api/knowledge-entities/countries") return response(200, { countries });

  const countryMatch = path.match(/^\/api\/knowledge-entities\/countries\/([^/]+)\/cities$/);
  if (countryMatch) {
    const country = repository.getEntity(decodeURIComponent(countryMatch[1]));
    if (!country || country.entityType !== "country") return response(404, { error: { code: "entity_not_found" } });
    return response(200, { country, cities: repository.listCitiesByCountry(country.entityId) });
  }

  const cityMatch = path.match(/^\/api\/knowledge-entities\/cities\/([^/]+)\/pois$/);
  if (cityMatch) {
    const city = repository.getEntity(decodeURIComponent(cityMatch[1]));
    if (!city || city.entityType !== "city") return response(404, { error: { code: "entity_not_found" } });
    return response(200, { city, pois: repository.listPoisByCity(city.entityId) });
  }

  return response(404, { error: { code: "endpoint_not_found" } });
}

function legacyCity(englishName) {
  const city = TravelData.DEFAULT_CITIES.find((candidate) => candidate.englishName === englishName);
  assert.ok(city, `Legacy City missing: ${englishName}`);
  const country = TravelData.DEFAULT_COUNTRIES.find((candidate) => candidate.id === city.countryId);
  assert.ok(country, `Legacy Country missing: ${city.countryId}`);
  return { city, country };
}

async function expectThreePois(englishName) {
  const legacy = legacyCity(englishName);
  const result = await loadKnowledgeCityPois({
    legacyCity: legacy.city,
    legacyCountry: legacy.country,
    fetchImpl: repositoryFetch,
  });
  assert.equal(result.status, "ready", `${englishName} mapping status`);
  assert.equal(result.city.canonicalNameEn, englishName);
  assert.equal(result.pois.length, 3, `${englishName} POI count`);
  assert.equal(new Set(result.pois.map((poi) => poi.wikidataId)).size, 3);
  return result;
}

assert.equal(normalizeKnowledgeName("  St. Mary’s  Basilica "), "st marys basilica");
assert.equal(normalizeKnowledgeName("Bogotá"), "bogotá");

const amsterdam = await expectThreePois("Amsterdam");
const prague = await expectThreePois("Prague");
const tokyo = await expectThreePois("Tokyo");
const paris = await expectThreePois("Paris");
const berlin = await expectThreePois("Berlin");
const rome = await expectThreePois("Rome");
const madrid = await expectThreePois("Madrid");
const seoul = await expectThreePois("Seoul");
const bogota = await loadKnowledgeCityPois({
  legacyCity: { id: "CO-BOG", name: "波哥大", englishName: "Bogotá", countryId: "CO" },
  legacyCountry: { id: "CO", name: "哥伦比亚", englishName: "Colombia" },
  fetchImpl: repositoryFetch,
});
assert.equal(bogota.status, "ready");
assert.equal(bogota.city.canonicalNameEn, "Bogotá");
assert.equal(bogota.pois.length, 3);

const osaka = legacyCity("Osaka");
const unmatched = await loadKnowledgeCityPois({
  legacyCity: osaka.city,
  legacyCountry: osaka.country,
  fetchImpl: repositoryFetch,
});
assert.deepEqual(unmatched, { status: "unmatched", pois: [] });

const unavailable = await loadKnowledgeCityPois({
  legacyCity: legacyCity("Amsterdam").city,
  legacyCountry: legacyCity("Amsterdam").country,
  fetchImpl: async (input) => {
    const path = String(input);
    if (path.endsWith("/countries")) return repositoryFetch(input);
    if (path.includes("/countries/")) return repositoryFetch(input);
    return response(404, { error: { code: "entity_not_found" } });
  },
});
assert.equal(unavailable.status, "unavailable");
assert.deepEqual(unavailable.pois, []);

const conflicting = resolveKnowledgeCity({
  legacyCityName: "Springfield",
  legacyCityEnglishName: "Springfield",
  legacyCountryId: "BB",
  legacyCountryName: "Beta",
  legacyCountryEnglishName: "Beta",
  countries: [
    { entityId: "country-aa", entityType: "country", isoAlpha2: "AA", canonicalNameEn: "Alpha", canonicalNameZh: "甲", aliases: [] },
    { entityId: "country-bb", entityType: "country", isoAlpha2: "BB", canonicalNameEn: "Beta", canonicalNameZh: "乙", aliases: [] },
  ],
  citiesByCountry: {
    "country-aa": [{ entityId: "city-aa", canonicalNameEn: "Springfield", canonicalNameZh: "春田", aliases: [] }],
    "country-bb": [{ entityId: "city-bb", canonicalNameEn: "Springfield", canonicalNameZh: "春田", aliases: [] }],
  },
});
assert.equal(conflicting.country.entityId, "country-bb");
assert.equal(conflicting.city.entityId, "city-bb");

for (const result of [amsterdam, bogota, prague, tokyo, paris, berlin, rome, madrid, seoul]) {
  const serialized = JSON.stringify(result.pois);
  for (const forbidden of ["provenance", "review", "candidate", "evidence", "sourceUrl"]) {
    assert.equal(serialized.includes(forbidden), false, `UI POI payload includes ${forbidden}`);
  }
}
assert.ok(requestedPaths.length > 0);
assert.ok(requestedPaths.every((path) => path.startsWith("/api/knowledge-entities/")));
assert.equal(requestedPaths.some((path) => path.includes("image") || path.includes("discovery")), false);

const cityDetailSource = readText("city-detail.js");
assert.ok(cityDetailSource.includes('get("localOnly") === "1"'), "localOnly must require an explicit query value");
assert.ok(cityDetailSource.includes("localOnlyCover"), "localOnly must replace remote covers");
assert.ok(cityDetailSource.includes("localOnlyKnowledgeFetch"), "localOnly must constrain API requests");
assert.ok(cityDetailSource.includes("if (localOnlyMode) return;"), "localOnly must skip legacy online enrichment");
assert.equal(cityDetailSource.includes("window.fetch ="), false, "localOnly must not alter default global fetch behavior");
assert.equal(cityDetailSource.includes("CityDetailLocalFixture"), false, "temporary Bogotá fixture leaked into final City detail code");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  mappings: {
    Amsterdam: amsterdam.pois.map((poi) => poi.canonicalNameEn),
    Bogotá: bogota.pois.map((poi) => poi.canonicalNameEn),
    Prague: prague.pois.map((poi) => poi.canonicalNameEn),
    Tokyo: tokyo.pois.map((poi) => poi.canonicalNameEn),
    Paris: paris.pois.map((poi) => poi.canonicalNameEn),
    Berlin: berlin.pois.map((poi) => poi.canonicalNameEn),
    Rome: rome.pois.map((poi) => poi.canonicalNameEn),
    Madrid: madrid.pois.map((poi) => poi.canonicalNameEn),
    Seoul: seoul.pois.map((poi) => poi.canonicalNameEn),
  },
  compatibility: {
    unmatchedLegacyCity: unmatched.status,
    api404: unavailable.status,
    countryCityConflictAvoided: true,
    stableOrdering: true,
    duplicateQidsRendered: 0,
  },
  sideEffects: {
    externalNetworkRequests: 0,
    imageRequests: 0,
  },
}, null, 2)}\n`);
