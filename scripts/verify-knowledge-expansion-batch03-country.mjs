import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  createPublishedKnowledgeEntityLayerRepository,
} from "../src/lib/routes/index.mjs";
import { validateLocalEvidenceSource } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETRIEVED_AT = "2026-08-03T18:00:00.000Z";
const EXPECTED_TOTALS = Object.freeze({ countries: 55, cities: 306, pois: 2101, total: 2462 });
const CONFIG = Object.freeze({
  IT: { label: "Italy", iso: "IT", qid: "Q38", batch: "05", slug: "batch03a-italy", cityCount: 13, poiCount: 90, newCities: 11, newPois: 84, reviews: 4, directedLegs: 18, season: 4 },
  FR: { label: "France", iso: "FR", qid: "Q142", batch: "06", slug: "batch03b-france", cityCount: 13, poiCount: 82, newCities: 11, newPois: 76, reviews: 3, directedLegs: 18, season: 4 },
  ES: { label: "Spain", iso: "ES", qid: "Q29", batch: "07", slug: "batch03c-spain", cityCount: 13, poiCount: 98, newCities: 11, newPois: 92, reviews: 3, directedLegs: 16, season: 4 },
  KR: { label: "South Korea", iso: "KR", qid: "Q884", batch: "08", slug: "batch03d-south-korea", cityCount: 13, poiCount: 70, newCities: 11, newPois: 64, reviews: 2, directedLegs: 20, season: 4 },
});

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readJsonl(relativePath) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim();
  return text ? text.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
}

const countryCode = argument("country").toUpperCase();
const config = CONFIG[countryCode];
assert.ok(config, `--country must be one of ${Object.keys(CONFIG).join("|")}`);

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, EXPECTED_TOTALS);
assert.deepEqual(repository.validateParentReferences(), { accepted: true, reasons: [] });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const allEntities = [...countries, ...cities, ...pois];
assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, allEntities.length);
assert.equal(new Set(cities.map((entity) => entity.wikidataId)).size, cities.length);
assert.equal(new Set(pois.map((entity) => entity.wikidataId)).size, pois.length);

const country = countries.find((entity) => entity.isoAlpha2 === config.iso && entity.wikidataId === config.qid);
assert.ok(country, `${config.label} country entity missing`);
const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId);
const countryCityIds = new Set(countryCities.map((city) => city.entityId));
const countryPois = pois.filter((poi) => countryCityIds.has(poi.parentCityEntityId));
assert.equal(countryCities.length, config.cityCount);
assert.equal(countryPois.length, config.poiCount);
assert.ok(countryCities.every((city) => /^Q\d+$/u.test(city.wikidataId)));
assert.ok(countryPois.every((poi) => /^Q\d+$/u.test(poi.wikidataId)));
assert.ok(countryCities.every((city) => Number.isFinite(city.coordinates?.latitude) && Number.isFinite(city.coordinates?.longitude)));
assert.ok(countryPois.every((poi) => Number.isFinite(poi.coordinates?.latitude) && Number.isFinite(poi.coordinates?.longitude)));

const citiesAsset = readJson(`data/knowledge/batches/cities.p1b-batch${config.batch}.json`);
const poisAsset = readJson(`data/knowledge/batches/pois.p1b-batch${config.batch}.json`);
const selection = readJson(`data/knowledge/batches/selection.p1b-batch${config.batch}.json`);
const provenance = readJson(`data/knowledge/batches/provenance.knowledge-expansion-${config.slug}.json`);
const conflicts = readJson(`data/knowledge/batches/conflicts.knowledge-expansion-${config.slug}.json`);
const review = readJson(`data/knowledge/batches/review-queue.knowledge-expansion-${config.slug}.json`);
assert.equal(citiesAsset.cityCount, config.newCities);
assert.equal(poisAsset.poiCount, config.newPois);
assert.equal(selection.cities.length, config.cityCount);
assert.equal(selection.pois.length, config.newPois);
assert.ok(selection.cities.every((city) => city.selectedPoiCount >= city.targetPoiCount));
assert.equal(conflicts.conflictCount, 0);
assert.equal(review.reviewCount, config.reviews);
assert.ok(review.entries.every((entry) => entry.entityType === "region"));
assert.ok(review.entries.every((entry) => entry.reasonCode === "entity-type-not-supported-by-current-schema"));
assert.ok(review.entries.every((entry) => entry.disposition === "excluded-from-published-batch"));
const provenanceQids = new Set(provenance.entityQids);
assert.ok([...citiesAsset.cities, ...poisAsset.pois].every((entity) => provenanceQids.has(entity.wikidataId)));

const routeLegs = readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const seasons = readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const countryLegs = routeLegs.filter((record) => record.retrievedAt === RETRIEVED_AT && countryCityIds.has(record.fromEntityId) && countryCityIds.has(record.toEntityId));
const countrySeasons = seasons.filter((record) => record.retrievedAt === RETRIEVED_AT && countryCityIds.has(record.entityId));
assert.equal(countryLegs.length, config.directedLegs);
assert.equal(countrySeasons.length, config.season);
for (const record of countryLegs) {
  const validation = validateRouteLegEvidence(record);
  assert.equal(validation.accepted, true, validation.reasons.join(","));
  assert.equal(record.directed, true);
  assert.equal(record.feasibilityStatus, "feasible");
  assert.equal(record.durationMinMinutes, null);
  assert.equal(record.durationMaxMinutes, null);
  assert.ok(countryLegs.some((reverse) => reverse.fromEntityId === record.toEntityId && reverse.toEntityId === record.fromEntityId));
  assert.ok(record.sources.length > 0);
  for (const source of record.sources) assert.equal(validateLocalEvidenceSource(source).accepted, true);
}
for (const record of countrySeasons) {
  const validation = validateSeasonEvidence(record);
  assert.equal(validation.accepted, true, validation.reasons.join(","));
  assert.equal(record.suitabilityStatus, "unknown");
  assert.equal(record.season, null);
  assert.equal(record.recommendedBufferMinutes, null);
  assert.ok(record.weatherRisks.length + record.transportRisks.length + record.closureRisks.length > 0);
  assert.ok(record.sources.length > 0);
  for (const source of record.sources) assert.equal(validateLocalEvidenceSource(source).accepted, true);
}
const objectiveText = JSON.stringify(countrySeasons).toLocaleLowerCase("en-US");
for (const forbidden of ["best month", "recommended month", "best season", "recommended season", "ideal month"]) {
  assert.equal(objectiveText.includes(forbidden), false, `subjective season statement found: ${forbidden}`);
}

const manifest = readJson("data/route-v2/evidence-seed/evidence-seed-manifest.json");
assert.ok(manifest.countries.includes(countryCode));
assert.deepEqual(manifest.counts, { routeLeg: 414, season: 156, total: 570 });
assert.equal(new Set(manifest.routeLegEvidenceIds).size, manifest.routeLegEvidenceIds.length);
assert.equal(new Set(manifest.seasonEvidenceIds).size, manifest.seasonEvidenceIds.length);

console.log(JSON.stringify({
  verifier: `knowledge-expansion-${config.slug}`,
  status: "PASS",
  country: config.label,
  totals: { cities: countryCities.length, pois: countryPois.length },
  additions: { cities: config.newCities, pois: config.newPois, directedTransportEvidence: countryLegs.length, riskMonthEvidence: countrySeasons.length },
  quality: { orphanEntities: 0, duplicateEntityIds: 0, duplicateCityQids: 0, duplicatePoiQids: 0, conflicts: 0, regionalItemsIsolated: review.reviewCount },
}, null, 2));
