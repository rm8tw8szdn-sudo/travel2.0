import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS,
  createKnowledgeEntityLayerRepository,
} from "../src/lib/routes/index.mjs";
import { validateCountryEntitySet } from "../src/lib/routes/knowledge-country-baseline-schema.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { validateLocalEvidenceSource } from "../src/lib/routes/local-evidence-source-schema.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETRIEVED_AT = "2026-08-10T14:00:00.000Z";
const BATCH04_PATH = /(?:cities|pois)\.p1b-batch(?:09|10|11|12|13)\.json$/u;
const ACCEPTED_SHA256 = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";
const IMMUTABLE_EVIDENCE_SHA256 = "4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376";
const FINAL_EVIDENCE_COUNTS = Object.freeze({ routeLeg: 196, season: 76, total: 272 });
const CONFIG = Object.freeze({
  DE: {
    label: "Germany",
    iso: "DE",
    qid: "Q183",
    batch: "09",
    slug: "batch04a-germany",
    cityCount: 12,
    poiCount: 91,
    newCities: 10,
    newPois: 85,
    reviews: 0,
    directedLegs: 16,
    season: 4,
    minimumManifest: { routeLeg: 146, season: 60, total: 206 },
  },
  AT: {
    label: "Austria",
    iso: "AT",
    qid: "Q40",
    batch: "10",
    slug: "batch04b-austria",
    cityCount: 8,
    poiCount: 55,
    newCities: 8,
    newPois: 55,
    reviews: 0,
    directedLegs: 10,
    season: 4,
    minimumManifest: { routeLeg: 156, season: 64, total: 220 },
  },
  PT: {
    label: "Portugal",
    iso: "PT",
    qid: "Q45",
    batch: "11",
    slug: "batch04c-portugal",
    cityCount: 10,
    poiCount: 69,
    newCities: 10,
    newPois: 69,
    reviews: 1,
    directedLegs: 14,
    season: 4,
    minimumManifest: { routeLeg: 170, season: 68, total: 238 },
  },
  GR: {
    label: "Greece",
    iso: "GR",
    qid: "Q41",
    batch: "12",
    slug: "batch04d-greece",
    cityCount: 9,
    poiCount: 66,
    newCities: 9,
    newPois: 66,
    reviews: 4,
    directedLegs: 12,
    season: 4,
    minimumManifest: { routeLeg: 182, season: 72, total: 254 },
  },
  NL: {
    label: "Netherlands",
    iso: "NL",
    qid: "Q55",
    batch: "13",
    slug: "batch04e-netherlands",
    cityCount: 10,
    poiCount: 67,
    newCities: 8,
    newPois: 61,
    reviews: 0,
    directedLegs: 14,
    season: 4,
    minimumManifest: { routeLeg: 196, season: 76, total: 272 },
  },
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

function hashFile(relativePath) {
  return crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(ROOT, relativePath)))
    .digest("hex");
}

function readAssets(paths, key) {
  return paths.flatMap((relativePath) => readJson(relativePath)[key]);
}

const countryCode = argument("country").toUpperCase();
const config = CONFIG[countryCode];
assert.ok(config, `--country must be one of ${Object.keys(CONFIG).join("|")}`);

const citiesPath = `data/knowledge/batches/cities.p1b-batch${config.batch}.json`;
const poisPath = `data/knowledge/batches/pois.p1b-batch${config.batch}.json`;
const baseCountries = readAssets(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries, "countries");
const baseCities = readAssets(
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.filter((value) => !BATCH04_PATH.test(value)),
  "cities",
);
const basePois = readAssets(
  KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.filter((value) => !BATCH04_PATH.test(value)),
  "pois",
);
assert.equal(validateCountryEntitySet(baseCountries).accepted, true);
assert.equal(validateKnowledgeCityEntitySet(baseCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(basePois).accepted, true);

const citiesAsset = readJson(citiesPath);
const poisAsset = readJson(poisPath);
assert.equal(validateKnowledgeCityEntitySet(citiesAsset.cities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(poisAsset.pois).accepted, true);
assert.equal(citiesAsset.cityCount, config.newCities);
assert.equal(poisAsset.poiCount, config.newPois);

const repository = createKnowledgeEntityLayerRepository({
  countries: baseCountries,
  cities: [...baseCities, ...citiesAsset.cities],
  pois: [...basePois, ...poisAsset.pois],
});
assert.deepEqual(repository.validateParentReferences(), { accepted: true, reasons: [] });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const allEntities = [...countries, ...cities, ...pois];
assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, allEntities.length);
assert.equal(new Set(cities.map((entity) => entity.wikidataId)).size, cities.length);
assert.equal(new Set(pois.map((entity) => entity.wikidataId)).size, pois.length);

const country = countries.find(
  (entity) => entity.isoAlpha2 === config.iso && entity.wikidataId === config.qid,
);
assert.ok(country, `${config.label} country entity missing`);
const countryCities = cities.filter((city) => city.parentCountryEntityId === country.entityId);
const countryCityIds = new Set(countryCities.map((city) => city.entityId));
const countryPois = pois.filter((poi) => countryCityIds.has(poi.parentCityEntityId));
assert.equal(countryCities.length, config.cityCount);
assert.equal(countryPois.length, config.poiCount);
assert.ok(countryCities.every((city) => /^Q\d+$/u.test(city.wikidataId)));
assert.ok(countryPois.every((poi) => /^Q\d+$/u.test(poi.wikidataId)));
assert.ok(countryCities.every(
  (city) => Number.isFinite(city.coordinates?.latitude)
    && Number.isFinite(city.coordinates?.longitude),
));
assert.ok(countryPois.every(
  (poi) => Number.isFinite(poi.coordinates?.latitude)
    && Number.isFinite(poi.coordinates?.longitude),
));

const selection = readJson(`data/knowledge/batches/selection.p1b-batch${config.batch}.json`);
const provenance = readJson(
  `data/knowledge/batches/provenance.knowledge-expansion-${config.slug}.json`,
);
const conflicts = readJson(
  `data/knowledge/batches/conflicts.knowledge-expansion-${config.slug}.json`,
);
const review = readJson(
  `data/knowledge/batches/review-queue.knowledge-expansion-${config.slug}.json`,
);
assert.equal(selection.cities.length, config.cityCount);
assert.equal(selection.pois.length, config.newPois);
assert.ok(selection.cities.every(
  (city) => city.selectedPoiCount === city.targetPoiCount,
));
assert.equal(conflicts.conflictCount, 0);
assert.deepEqual(conflicts.conflicts, []);
assert.equal(review.reviewCount, config.reviews);
assert.ok(review.entries.every((entry) => entry.entityType === "region"));
assert.ok(review.entries.every(
  (entry) => entry.reasonCode === "entity-type-not-supported-by-current-schema",
));
assert.ok(review.entries.every(
  (entry) => entry.disposition === "excluded-from-published-batch",
));
const provenanceQids = new Set(provenance.entityQids);
assert.ok([...citiesAsset.cities, ...poisAsset.pois].every(
  (entity) => provenanceQids.has(entity.wikidataId),
));

const routeLegs = readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const seasons = readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const countryLegs = routeLegs.filter(
  (record) => record.retrievedAt === RETRIEVED_AT
    && countryCityIds.has(record.fromEntityId)
    && countryCityIds.has(record.toEntityId),
);
const countrySeasons = seasons.filter(
  (record) => record.retrievedAt === RETRIEVED_AT
    && countryCityIds.has(record.entityId),
);
assert.equal(countryLegs.length, config.directedLegs);
assert.equal(countrySeasons.length, config.season);
for (const record of countryLegs) {
  const validation = validateRouteLegEvidence(record);
  assert.equal(validation.accepted, true, validation.reasons.join(","));
  assert.equal(record.directed, true);
  assert.equal(record.feasibilityStatus, "feasible");
  assert.equal(record.durationMinMinutes, null);
  assert.equal(record.durationMaxMinutes, null);
  assert.equal(record.transferCount, null);
  assert.equal(record.frequencyLevel, "unknown");
  assert.ok(countryLegs.some(
    (reverse) => reverse.fromEntityId === record.toEntityId
      && reverse.toEntityId === record.fromEntityId,
  ));
  assert.ok(record.sources.length > 0);
  for (const source of record.sources) {
    assert.equal(validateLocalEvidenceSource(source).accepted, true);
  }
}
for (const record of countrySeasons) {
  const validation = validateSeasonEvidence(record);
  assert.equal(validation.accepted, true, validation.reasons.join(","));
  assert.equal(record.suitabilityStatus, "unknown");
  assert.equal(record.season, null);
  assert.equal(record.recommendedBufferMinutes, null);
  assert.ok(
    record.weatherRisks.length + record.transportRisks.length + record.closureRisks.length > 0,
  );
  assert.ok(record.sources.length > 0);
  for (const source of record.sources) {
    assert.equal(validateLocalEvidenceSource(source).accepted, true);
  }
}
const objectiveText = JSON.stringify(countrySeasons).toLocaleLowerCase("en-US");
for (const forbidden of [
  "best month",
  "recommended month",
  "best season",
  "recommended season",
  "ideal month",
]) {
  assert.equal(
    objectiveText.includes(forbidden),
    false,
    `subjective season statement found: ${forbidden}`,
  );
}

const manifest = readJson("data/route-v2/evidence-seed/evidence-seed-manifest.json");
assert.ok(manifest.countries.includes(countryCode));
assert.equal(new Set(manifest.routeLegEvidenceIds).size, manifest.routeLegEvidenceIds.length);
assert.equal(new Set(manifest.seasonEvidenceIds).size, manifest.seasonEvidenceIds.length);
for (const key of ["routeLeg", "season", "total"]) {
  assert.ok(manifest.counts[key] >= config.minimumManifest[key]);
  assert.ok(manifest.counts[key] <= FINAL_EVIDENCE_COUNTS[key]);
}

assert.equal(
  hashFile(".route-v2-cache/accepted-routes.json"),
  ACCEPTED_SHA256,
  "Accepted repository changed",
);
assert.equal(
  hashFile(".route-v2-cache/route-evidence.json"),
  IMMUTABLE_EVIDENCE_SHA256,
  "Immutable route-evidence changed",
);

console.log(JSON.stringify({
  verifier: `knowledge-expansion-${config.slug}`,
  status: "PASS",
  country: config.label,
  totals: { cities: countryCities.length, pois: countryPois.length },
  additions: {
    cities: config.newCities,
    pois: config.newPois,
    directedTransportEvidence: countryLegs.length,
    riskMonthEvidence: countrySeasons.length,
  },
  quality: {
    orphanEntities: 0,
    duplicateEntityIds: 0,
    duplicateCityQids: 0,
    duplicatePoiQids: 0,
    conflicts: 0,
    regionalItemsIsolated: review.reviewCount,
  },
  formalAssets: {
    acceptedSha256: ACCEPTED_SHA256,
    immutableEvidenceSha256: IMMUTABLE_EVIDENCE_SHA256,
  },
}, null, 2));
