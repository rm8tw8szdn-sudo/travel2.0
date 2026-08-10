import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  createPublishedKnowledgeEntityLayerRepository,
} from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETRIEVED_AT = "2026-08-03T14:00:00.000Z";
const EXPECTED_TOTALS = Object.freeze({ countries: 51, cities: 99, pois: 568, total: 718 });
const EXPECTED_JAPAN_POIS = Object.freeze({
  Beppu: 3,
  Fujikawaguchiko: 4,
  Fukuoka: 7,
  Hakodate: 5,
  Hakone: 5,
  Hiroshima: 7,
  Kamakura: 6,
  Kanazawa: 5,
  Kobe: 6,
  Kumamoto: 5,
  Kyoto: 19,
  Miyajima: 6,
  Nagoya: 8,
  Naha: 5,
  Nara: 8,
  "Okinawa City": 3,
  Osaka: 15,
  Otaru: 3,
  Sapporo: 7,
  Takayama: 4,
  Tokyo: 19,
  "Yufuin (Yufu)": 3,
});
const EXPECTED_DIRECTED_PAIRS = Object.freeze([
  ["Tokyo", "Nagoya"], ["Nagoya", "Kyoto"], ["Kyoto", "Osaka"],
  ["Osaka", "Nara"], ["Osaka", "Kobe"], ["Kobe", "Hiroshima"],
  ["Hiroshima", "Miyajima"], ["Hiroshima", "Fukuoka"], ["Tokyo", "Hakone"],
  ["Tokyo", "Kamakura"], ["Tokyo", "Fujikawaguchiko"], ["Nagoya", "Takayama"],
  ["Takayama", "Kanazawa"], ["Fukuoka", "Kumamoto"], ["Fukuoka", "Beppu"],
  ["Beppu", "Yufuin (Yufu)"], ["Sapporo", "Otaru"], ["Sapporo", "Hakodate"],
  ["Naha", "Okinawa City"],
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readJsonl(relativePath) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim();
  return text ? text.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, EXPECTED_TOTALS);
assert.deepEqual(repository.validateParentReferences(), { accepted: true, reasons: [] });

const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const entities = [...countries, ...cities, ...pois];
assert.deepEqual({
  countries: countries.length,
  cities: cities.length,
  pois: pois.length,
  total: entities.length,
}, EXPECTED_TOTALS);
assert.equal(new Set(entities.map((entity) => entity.entityId)).size, entities.length);
assert.equal(new Set(cities.map((entity) => entity.wikidataId)).size, cities.length);
assert.equal(new Set(pois.map((entity) => entity.wikidataId)).size, pois.length);

const japan = countries.find((country) => country.isoAlpha2 === "JP" && country.wikidataId === "Q17");
assert.ok(japan, "Japan Country entity must remain the stable Q17 record");
const japanCities = cities.filter((city) => city.parentCountryEntityId === japan.entityId);
const japanCityIds = new Set(japanCities.map((city) => city.entityId));
const japanPois = pois.filter((poi) => japanCityIds.has(poi.parentCityEntityId));
assert.equal(japanCities.length, 22);
assert.equal(japanPois.length, 153);
assert.deepEqual(
  [...japanCities.map((city) => city.canonicalNameEn)].sort((left, right) => left.localeCompare(right, "en")),
  Object.keys(EXPECTED_JAPAN_POIS).sort((left, right) => left.localeCompare(right, "en")),
);

const cityByName = new Map(japanCities.map((city) => [city.canonicalNameEn, city]));
for (const [cityName, expectedPoiCount] of Object.entries(EXPECTED_JAPAN_POIS)) {
  const city = cityByName.get(cityName);
  assert.ok(city, `Japan city missing: ${cityName}`);
  assert.match(city.wikidataId, /^Q\d+$/u);
  assert.ok(Number.isFinite(city.coordinates?.latitude) && Number.isFinite(city.coordinates?.longitude));
  const cityPois = repository.listPoisByCity(city.entityId);
  assert.equal(cityPois.length, expectedPoiCount, `${cityName} POI depth changed`);
  assert.equal(new Set(cityPois.map((poi) => poi.wikidataId)).size, cityPois.length);
  assert.ok(cityPois.every((poi) => /^Q\d+$/u.test(poi.wikidataId)));
  assert.ok(cityPois.every((poi) => Number.isFinite(poi.coordinates?.latitude) && Number.isFinite(poi.coordinates?.longitude)));
}
assert.ok(cityByName.get("Fujikawaguchiko").aliases.some((alias) => /kawaguchiko/iu.test(alias)));
assert.ok(cityByName.get("Yufuin (Yufu)").aliases.some((alias) => /yufuin/iu.test(alias)));

const batchCities = readJson("data/knowledge/batches/cities.p1b-batch04.json");
const batchPois = readJson("data/knowledge/batches/pois.p1b-batch04.json");
const selection = readJson("data/knowledge/batches/selection.p1b-batch04.json");
const conflicts = readJson("data/knowledge/batches/conflicts.knowledge-expansion-batch02.json");
const review = readJson("data/knowledge/batches/review-queue.knowledge-expansion-batch02.json");
assert.equal(batchCities.cityCount, 20);
assert.equal(batchPois.poiCount, 147);
assert.equal(selection.cities.length, 22);
assert.equal(selection.cities.reduce((total, city) => total + city.targetPoiCount, 0), 153);
assert.equal(conflicts.conflictCount, 0);
assert.equal(review.reviewCount, 28);
assert.ok(review.entries.every((entry) => entry.disposition === "excluded-from-published-batch"));
const publishedQids = new Set([...batchCities.cities, ...batchPois.pois].map((entity) => entity.wikidataId));
assert.ok(review.entries.every((entry) => !entry.wikidataId || !publishedQids.has(entry.wikidataId)));

const allLegs = readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const allSeasons = readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const batchLegs = allLegs.filter((record) => record.retrievedAt === RETRIEVED_AT);
const batchSeasons = allSeasons.filter((record) => record.retrievedAt === RETRIEVED_AT);
assert.equal(batchLegs.length, 38);
assert.equal(batchSeasons.length, 14);
assert.ok(batchLegs.every((record) => record.directed === true && record.feasibilityStatus === "feasible"));
assert.ok(batchLegs.every((record) => record.durationMinMinutes === null && record.durationMaxMinutes === null));
assert.ok(batchLegs.every((record) => record.sources.length > 0 && record.sources.every((source) => /^https:\/\//u.test(source.url))));
assert.equal(new Set(batchLegs.flatMap((record) => [record.fromEntityId, record.toEntityId])).size, 22);

for (const [fromName, toName] of EXPECTED_DIRECTED_PAIRS) {
  const from = cityByName.get(fromName);
  const to = cityByName.get(toName);
  assert.ok(batchLegs.some((record) => record.fromEntityId === from.entityId && record.toEntityId === to.entityId), `${fromName} -> ${toName} missing`);
  assert.ok(batchLegs.some((record) => record.fromEntityId === to.entityId && record.toEntityId === from.entityId), `${toName} -> ${fromName} missing`);
}

assert.ok(batchSeasons.every((record) => japanCityIds.has(record.entityId)));
assert.ok(batchSeasons.every((record) => Number.isInteger(record.month) && record.month >= 1 && record.month <= 12));
assert.ok(batchSeasons.every((record) => record.season === null && record.suitabilityStatus === "unknown"));
assert.ok(batchSeasons.every((record) => record.recommendedBufferMinutes === null));
assert.ok(batchSeasons.every((record) => record.sources.length > 0));
const seasonText = JSON.stringify(batchSeasons.map((record) => ({
  weatherRisks: record.weatherRisks,
  transportRisks: record.transportRisks,
  closureRisks: record.closureRisks,
  sourceFacts: record.sources.map((source) => source.factExcerpt),
}))).toLocaleLowerCase("en-US");
for (const forbidden of ["best month", "recommended month", "best season", "recommended season"]) {
  assert.equal(seasonText.includes(forbidden), false, `subjective season claim found: ${forbidden}`);
}

const manifest = readJson("data/route-v2/evidence-seed/evidence-seed-manifest.json");
assert.deepEqual(manifest.counts, { routeLeg: 130, season: 56, total: 186 });
assert.equal(new Set(manifest.routeLegEvidenceIds).size, 130);
assert.equal(new Set(manifest.seasonEvidenceIds).size, 56);

const importerSource = fs.readFileSync(path.join(ROOT, "scripts/import-knowledge-expansion-batch02-japan-depth.mjs"), "utf8");
assert.match(importerSource, /atomicText\(OUTPUTS\.raw/u);
assert.match(importerSource, /atomicText\(OUTPUTS\.cities/u);
assert.match(importerSource, /atomicText\(OUTPUTS\.pois/u);
assert.ok(importerSource.includes("--resolve-fallbacks"));

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch02-japan-depth",
  status: "PASS",
  totals: EXPECTED_TOTALS,
  japan: {
    country: 1,
    cities: japanCities.length,
    pois: japanPois.length,
    directedTransportEvidence: batchLegs.length,
    riskMonthEvidence: batchSeasons.length,
    citiesCoveredByTransport: 22,
    citiesCoveredByRiskMonth: new Set(batchSeasons.map((record) => record.entityId)).size,
  },
  quality: {
    duplicateEntityIds: 0,
    duplicateCityQids: 0,
    duplicatePoiQids: 0,
    orphanEntities: 0,
    conflicts: conflicts.conflictCount,
    excludedUnconfirmedCandidates: review.reviewCount,
    titleFallbacksUsedForPublishedData: 0,
  },
}, null, 2));
