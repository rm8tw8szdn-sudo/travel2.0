import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  createPublishedKnowledgeEntityLayerRepository,
  entityLayerDistanceKm,
} from "../src/lib/routes/index.mjs";
import {
  evaluatePoiTypeIdsForConsumer,
  evaluatePoiTypePaths,
} from "../src/lib/routes/knowledge-poi-semantic-admission.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const BATCHES = ["14", "15", "16", "17"];
const WAVES = ["1", "2", "3", "4"];
const TARGET_CODES = new Set([
  "GB", "IE", "CZ", "HU", "HR", "NO", "SE", "FI", "DK", "BE",
  "PL", "SI", "VN", "MY", "ID", "PH", "CA", "US", "MX", "PE",
]);
const CITY_ROOTS = new Set(["Q486972", "Q15284"]);
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

function pathIsBacked(pathValues, roots, nodes) {
  if (!Array.isArray(pathValues) || pathValues.length < 1 || pathValues.length > 9) return false;
  if (!roots.has(pathValues.at(-1))) return false;
  return pathValues.slice(0, -1).every((qid, index) => (nodes[qid]?.parentQids || []).includes(pathValues[index + 1]));
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
const positiveAdmissionAudit = readJson("data/knowledge/reports/knowledge-poi-positive-admission-audit.json");
const semanticTypePolicy = readJson("data/knowledge/semantic/knowledge-semantic-type-policy.json");
const poiPathTerminals = new Set(semanticTypePolicy.roots.poi.map((entry) => entry.qid));
const postSealQuarantine = positiveAdmissionAudit.quarantined.filter((entry) => (
  /^data\/knowledge\/raw\/knowledge-expansion-batch05-wave[1-4]\.wikidata\.json$/u.test(entry.identityEvidence?.sourcePath || "")
));
const removedSinceSeal = 1197 - batch05Pois.length;

assert.equal([...TARGET_CODES].every((code) => countryByCode.has(code)), true);
assert.equal(targetCities.length, 168);
assert(removedSinceSeal >= postSealQuarantine.length, "current Batch 05 removals must cover the source-scoped semantic quarantine");
assert.equal(targetPois.length + removedSinceSeal, 1215);
assert.equal(batch05Pois.length + removedSinceSeal, 1197);
assert.equal(postSealQuarantine.every((entry) => !targetPois.some((poi) => poi.entityId === entry.entityId)), true);

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

const semanticallyInadmissiblePois = [];
for (const poi of batch05Pois) {
  const parent = cityById.get(poi.parentCityEntityId);
  const country = countryById.get(parent?.parentCountryEntityId);
  const raw = poiFactByQid.get(poi.wikidataId);
  const selection = selectionPoiByQid.get(poi.wikidataId);
  assert(raw && selection && parent && country, `${poi.wikidataId}:POI raw/selection/parent evidence missing`);
  const instanceOfIds = claimEntityIds(raw, "P31");
  assert(instanceOfIds.includes(selection.positiveTypePath[0]), `${poi.wikidataId}:POI P31/path mismatch`);
  assert(pathIsBacked(selection.positiveTypePath, poiPathTerminals, poiTypeNodes), `${poi.wikidataId}:POI subclass path not backed`);
  assert(claimEntityIds(raw, "P17").includes(country.wikidataId), `${poi.wikidataId}:POI country mismatch`);
  const distanceKm = entityLayerDistanceKm(parent.coordinates, coordinates(raw));
  assert(Math.abs(distanceKm - selection.distanceKm) < 0.02, `${poi.wikidataId}:POI distance mismatch`);
  if (!evaluatePoiTypeIdsForConsumer("batch05-adversarial-verifier", instanceOfIds, semanticTypePolicy).accepted) {
    semanticallyInadmissiblePois.push({
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
  { name: "airport", paths: [["Q1248784"]], expected: false },
  { name: "aerodrome", paths: [["Q62447"]], expected: false },
  { name: "airbase", paths: [["Q695850"]], expected: false },
  { name: "railway-station", paths: [["Q55488"]], expected: false },
  { name: "metro-station", paths: [["Q928830"]], expected: false },
  { name: "transit-system", paths: [["Q5503"]], expected: false },
  { name: "port", paths: [["Q44782"]], expected: false },
  { name: "university", paths: [["Q3918"]], expected: false },
  { name: "hospital", paths: [["Q16917"]], expected: false },
  { name: "prison", paths: [["Q40357"]], expected: false },
  { name: "police-station", paths: [["Q861951"]], expected: false },
  { name: "military-academy", paths: [["Q917182"]], expected: false },
  { name: "generic-building-only", paths: [["Q41176"]], expected: false },
  { name: "museum", paths: [["Q33506"]], expected: true },
  { name: "tourist-attraction", paths: [["Q570116"]], expected: true },
  { name: "heritage-station", paths: [["Q55488"], ["Q570116"]], expected: false },
];
for (const mutation of mutationCases) {
  assert.equal(evaluatePoiTypePaths(mutation.paths).accepted, mutation.expected, `mutation:${mutation.name}`);
}

assert.equal(
  semanticallyInadmissiblePois.length,
  0,
  `semantically inadmissible entities must not be published as Route POIs:${semanticallyInadmissiblePois.length}:${JSON.stringify(semanticallyInadmissiblePois.slice(0, 20))}`,
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
  semanticallyInadmissiblePois: semanticallyInadmissiblePois.length,
  postSealQuarantine: postSealQuarantine.length,
  mutationCases: mutationCases.length,
}, null, 2));
