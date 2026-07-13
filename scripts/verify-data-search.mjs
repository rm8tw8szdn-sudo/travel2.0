import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const travelData = require("../travel-data.js");
const travelSearch = require("../travel-search.js");

const strictLongTail = process.argv.includes("--strict-long-tail");

const state = {
  countries: travelData.DEFAULT_COUNTRIES,
  cities: travelData.DEFAULT_CITIES,
  countriesById: Object.fromEntries(travelData.DEFAULT_COUNTRIES.map((item) => [item.id, item])),
  citiesById: Object.fromEntries(travelData.DEFAULT_CITIES.map((item) => [item.id, item])),
};

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function verify(condition, message) {
  if (!condition) fail(message);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function ids(items) {
  return items.map((item) => `${item.id}:${item.name}`).join(", ");
}

function hasGuideCoverage(country) {
  return (country.cityIds || []).length > 0;
}

function resultHas(results, typeOrId, id) {
  if (id) return results.some((item) => item.type === typeOrId && item.id === id);
  return results.some((item) => item.id === typeOrId);
}

const requiredCountryIds = ["JP", "FR", "TR", "TH", "IT", "IS", "NO", "FI", "EG", "KE", "TZ", "ES", "PT"];
const requiredCityIds = ["JP-TYO", "JP-KYO", "JP-OSA", "EG-CAI", "KE-NBO"];

for (const id of requiredCountryIds) verify(state.countriesById[id], `Required country ${id} should exist`);
for (const id of requiredCityIds) verify(state.citiesById[id], `Required city ${id} should exist`);

verify(travelData.DEFAULT_COUNTRIES.length >= 180, "Country seed should keep broad atlas coverage");
verify(travelData.DEFAULT_CITIES.length >= 100, "City seed should keep guide-ready city coverage");

const duplicateCountryIds = travelData.DEFAULT_COUNTRIES.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index);
const duplicateCityIds = travelData.DEFAULT_CITIES.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index);
verify(!duplicateCountryIds.length, `Duplicate country ids: ${unique(duplicateCountryIds).join(", ")}`);
verify(!duplicateCityIds.length, `Duplicate city ids: ${unique(duplicateCityIds).join(", ")}`);

for (const country of travelData.DEFAULT_COUNTRIES) {
  for (const key of ["id", "name", "englishName", "continent", "cover", "intro", "recommendedDays", "bestSeason", "budgetLevel"]) {
    verify(country[key], `Country ${country.id} should include ${key}`);
  }
  verify(Array.isArray(country.tags) && country.tags.length, `Country ${country.id} should include tags`);
  verify(Array.isArray(country.keywords) && country.keywords.length, `Country ${country.id} should include keywords`);

  const cityIds = country.cityIds || [];
  cityIds.forEach((id) => verify(state.citiesById[id], `Country ${country.id} should reference existing city ${id}`));

  if (strictLongTail || hasGuideCoverage(country)) {
    verify(cityIds.length > 0, `Guide-ready country ${country.id} should link recommended cities`);
  }
}

for (const city of travelData.DEFAULT_CITIES) {
  for (const key of ["id", "countryId", "name", "englishName", "cover", "intro"]) {
    verify(city[key], `City ${city.id} should include ${key}`);
  }
  verify(state.countriesById[city.countryId], `City ${city.id} should reference an existing country`);
  verify(Array.isArray(city.tags) && city.tags.length, `City ${city.id} should include tags`);
  verify(Array.isArray(city.spots) && city.spots.length >= 3 && city.spots.length <= 5, `City ${city.id} should include 3-5 spots`);
  verify(Array.isArray(city.keywords) && city.keywords.length, `City ${city.id} should include keywords`);
}

const atlasExpectations = [
  ["日本", [["country", "JP"], ["city", "JP-TYO"], ["city", "JP-KYO"], ["city", "JP-OSA"]]],
  ["东京", [["city", "JP-TYO"], ["country", "JP"]]],
];

for (const [query, expected] of atlasExpectations) {
  const results = travelSearch.searchAtlas(state, query);
  for (const [type, id] of expected) {
    verify(resultHas(results, type, id), `Atlas search "${query}" should include ${type} ${id}`);
  }
}

const countriesWithoutCities = travelData.DEFAULT_COUNTRIES.filter((country) => !(country.cityIds || []).length);
const atlasOnlyCountries = travelData.DEFAULT_COUNTRIES.filter((country) => !hasGuideCoverage(country));
if (atlasOnlyCountries.length) {
  warn(`${atlasOnlyCountries.length} atlas-only countries intentionally have no city guide coverage yet. Sample: ${ids(atlasOnlyCountries.slice(0, 12))}`);
}
if (countriesWithoutCities.length) {
  warn(`Coverage report: ${countriesWithoutCities.length} countries without cities. Use --strict-long-tail to make this blocking.`);
}

if (errors.length) {
  console.error(`Data/search verification failed:\n${errors.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

if (warnings.length) {
  console.warn(`Data/search non-blocking coverage warnings:\n${warnings.map((item) => `- ${item}`).join("\n")}`);
}

assert.equal(errors.length, 0);
console.log(`Data and atlas search integration verified. Countries=${travelData.DEFAULT_COUNTRIES.length}, Cities=${travelData.DEFAULT_CITIES.length}.`);
