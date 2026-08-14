import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  createPublishedKnowledgeEntityLayerRepository,
  entityLayerDistanceKm,
} from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BATCHES = ["14", "15", "16", "17"];
const WAVES = ["1", "2", "3", "4"];
const TARGET_CODES = new Set([
  "GB", "IE", "CZ", "HU", "HR", "NO", "SE", "FI", "DK", "BE",
  "PL", "SI", "VN", "MY", "ID", "PH", "CA", "US", "MX", "PE",
]);
const CITY_ROOTS = new Set(["Q486972", "Q15284"]);
const POI_ROOTS = new Set([
  "Q570116", "Q41176", "Q33506", "Q4989906", "Q1370598", "Q22698", "Q839954", "Q9259",
  "Q473972", "Q294440", "Q121359", "Q13226383", "Q3918", "Q37654", "Q166118", "Q838948",
  "Q172754", "Q35145263", "Q20719696", "Q15324", "Q271669", "Q811979", "Q811430", "Q1497375",
  "Q132911", "Q210272", "Q338112", "Q123705",
]);
const OPERATIONAL_ROOTS = new Set([
  "Q1248784", // airport
  "Q62447", // aerodrome
  "Q695850", // airbase
  "Q55488", // railway station
  "Q928830", // metro station
  "Q728937", // railway line
  "Q5503", // rapid transit
  "Q18325841", // public transport network
  "Q2678338", // railway network
  "Q2516436", // transportation system
  "Q15984860", // transport system
  "Q44782", // port
  "Q3918", // university institution rather than a visitable site
  "Q16917", // hospital
  "Q40357", // prison
  "Q861951", // police station
  "Q917182", // military academy
]);
const VISITOR_ROOTS = new Set([
  "Q570116", "Q33506", "Q4989906", "Q1370598", "Q22698", "Q839954", "Q9259", "Q473972",
  "Q294440", "Q166118", "Q172754", "Q35145263", "Q15324", "Q271669", "Q1497375", "Q37654",
]);

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const claimEntityIds = (entity, property) => [...new Set((entity?.claims?.[property] || [])
  .filter((claim) => claim?.rank !== "deprecated")
  .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
  .filter((value) => /^Q\d+$/u.test(String(value || ""))))];
const coordinates = (entity) => {
  const value = (entity?.claims?.P625 || []).find((claim) => claim?.rank !== "deprecated")?.mainsnak?.datavalue?.value;
  return Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude))
    ? { latitude: Number(value.latitude), longitude: Number(value.longitude) }
    : null;
};

function reachesAny(startQid, targets, nodes, seen = new Set()) {
  if (targets.has(startQid)) return true;
  if (!startQid || seen.has(startQid)) return false;
  seen.add(startQid);
  return (nodes[startQid]?.parentQids || []).some((parentQid) => reachesAny(parentQid, targets, nodes, seen));
}

function pathIsBacked(pathValues, roots, nodes) {
  if (!Array.isArray(pathValues) || pathValues.length < 1 || pathValues.length > 9) return false;
  if (!roots.has(pathValues.at(-1))) return false;
  return pathValues.slice(0, -1).every((qid, index) => (nodes[qid]?.parentQids || []).includes(pathValues[index + 1]));
}

function isRouteEligiblePoi(instanceOfIds, nodes) {
  const hasOperationalType = instanceOfIds.some((qid) => reachesAny(qid, OPERATIONAL_ROOTS, nodes));
  const hasVisitorType = instanceOfIds.some((qid) => (
    !reachesAny(qid, OPERATIONAL_ROOTS, nodes) && reachesAny(qid, VISITOR_ROOTS, nodes)
  ));
  return !hasOperationalType || hasVisitorType;
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));
const countryByCode = new Map(countries.map((country) => [country.isoAlpha2, country]));
const targetCountryIds = new Set([...TARGET_CODES].map((code) => countryByCode.get(code)?.entityId));
const targetCities = cities.filter((city) => targetCountryIds.has(city.parentCountryEntityId));
const targetCityIds = new Set(targetCities.map((city) => city.entityId));
const targetPois = pois.filter((poi) => targetCityIds.has(poi.parentCityEntityId));
const batch05Pois = BATCHES.flatMap((batch) => readJson(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);

assert.equal([...TARGET_CODES].every((code) => countryByCode.has(code)), true);
assert.equal(targetCities.length, 168);
assert.equal(targetPois.length, 1215);
assert.equal(batch05Pois.length, 1197);

const rawByWave = WAVES.map((wave) => readJson(`data/knowledge/raw/knowledge-expansion-batch05-wave${wave}.wikidata.json`));
const selections = BATCHES.map((batch) => readJson(`data/knowledge/batches/selection.p1b-batch${batch}.json`));
const selectionCityByQid = new Map(selections.flatMap((selection) => selection.cities).map((entry) => [entry.wikidataId, entry]));
const selectionPoiByQid = new Map(selections.flatMap((selection) => selection.pois).map((entry) => [entry.wikidataId, entry]));
const cityFactByQid = new Map(rawByWave.flatMap((raw) => Object.values(raw.wikidata.cityEntities || {})).map((entry) => [entry.id, entry]));
const poiFactByQid = new Map(rawByWave.flatMap((raw) => Object.values(raw.wikidata.poiEntities || {})).map((entry) => [entry.id, entry]));
const cityTypeNodes = Object.assign({}, ...rawByWave.map((raw) => raw.typeGraphs.city || {}));
const poiTypeNodes = Object.assign({}, ...rawByWave.map((raw) => raw.typeGraphs.poi || {}));

for (const city of targetCities) {
  const country = countryById.get(city.parentCountryEntityId);
  const raw = cityFactByQid.get(city.wikidataId);
  const selection = selectionCityByQid.get(city.wikidataId);
  assert(raw && selection, `${city.wikidataId}:City raw/selection evidence missing`);
  const instanceOfIds = claimEntityIds(raw, "P31");
  assert(instanceOfIds.includes(selection.positiveTypePath[0]), `${city.wikidataId}:City P31/path mismatch`);
  assert(pathIsBacked(selection.positiveTypePath, CITY_ROOTS, cityTypeNodes), `${city.wikidataId}:City subclass path not backed`);
  assert(claimEntityIds(raw, "P17").includes(country.wikidataId), `${city.wikidataId}:City country mismatch`);
  assert(entityLayerDistanceKm(city.coordinates, coordinates(raw)) < 0.01, `${city.wikidataId}:City coordinate mismatch`);
}

const operationalPois = [];
for (const poi of batch05Pois) {
  const parent = cityById.get(poi.parentCityEntityId);
  const country = countryById.get(parent?.parentCountryEntityId);
  const raw = poiFactByQid.get(poi.wikidataId);
  const selection = selectionPoiByQid.get(poi.wikidataId);
  assert(raw && selection && parent && country, `${poi.wikidataId}:POI raw/selection/parent evidence missing`);
  const instanceOfIds = claimEntityIds(raw, "P31");
  assert(instanceOfIds.includes(selection.positiveTypePath[0]), `${poi.wikidataId}:POI P31/path mismatch`);
  assert(pathIsBacked(selection.positiveTypePath, POI_ROOTS, poiTypeNodes), `${poi.wikidataId}:POI subclass path not backed`);
  assert(claimEntityIds(raw, "P17").includes(country.wikidataId), `${poi.wikidataId}:POI country mismatch`);
  const distanceKm = entityLayerDistanceKm(parent.coordinates, coordinates(raw));
  assert(Math.abs(distanceKm - selection.distanceKm) < 0.02, `${poi.wikidataId}:POI distance mismatch`);
  if (!isRouteEligiblePoi(instanceOfIds, poiTypeNodes)) {
    operationalPois.push({
      qid: poi.wikidataId,
      name: poi.canonicalNameEn,
      parentCityEntityId: poi.parentCityEntityId,
      countryCode: country.isoAlpha2,
      distanceKm: Number(distanceKm.toFixed(3)),
      instanceOfIds,
    });
  }
}

const mutationCases = [
  { name: "airport", types: ["Q1248784"], expected: false },
  { name: "aerodrome", types: ["Q62447"], expected: false },
  { name: "airbase", types: ["Q695850"], expected: false },
  { name: "railway-station", types: ["Q55488"], expected: false },
  { name: "metro-station", types: ["Q928830"], expected: false },
  { name: "transit-system", types: ["Q5503"], expected: false },
  { name: "port", types: ["Q44782"], expected: false },
  { name: "university", types: ["Q3918"], expected: false },
  { name: "hospital", types: ["Q16917"], expected: false },
  { name: "prison", types: ["Q40357"], expected: false },
  { name: "police-station", types: ["Q861951"], expected: false },
  { name: "military-academy", types: ["Q917182"], expected: false },
  { name: "museum", types: ["Q33506"], expected: true },
  { name: "tourist-attraction", types: ["Q570116"], expected: true },
  { name: "heritage-station", types: ["Q55488", "Q570116"], expected: true },
];
for (const mutation of mutationCases) {
  assert.equal(isRouteEligiblePoi(mutation.types, poiTypeNodes), mutation.expected, `mutation:${mutation.name}`);
}

assert.equal(
  operationalPois.length,
  0,
  `operational entities must not be published as Route POIs:${operationalPois.length}:${JSON.stringify(operationalPois.slice(0, 20))}`,
);

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch05-adversarial",
  status: "PASS",
  countryEntities: countries.length,
  targetCountries: TARGET_CODES.size,
  targetCities: targetCities.length,
  targetPois: targetPois.length,
  batch05Pois: batch05Pois.length,
  rawCityFactsChecked: targetCities.length,
  rawPoiFactsChecked: batch05Pois.length,
  operationalPois: operationalPois.length,
  mutationCases: mutationCases.length,
}, null, 2));
