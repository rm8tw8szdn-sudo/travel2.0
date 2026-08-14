import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { createTypedEntityId } from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import { validateCountryEntitySet } from "../src/lib/routes/knowledge-country-baseline-schema.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { validateRouteLegEvidence } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { validateSeasonEvidence } from "../src/lib/routes/season-evidence-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
const jsonl = async (relativePath) => (await readFile(path.join(ROOT, relativePath), "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));

const countryAsset = await json("data/knowledge/batches/countries.p1a-batch04.json");
const cityAsset = await json("data/knowledge/batches/cities.p1b-batch03.json");
const poiAsset = await json("data/knowledge/batches/pois.p1b-batch03.json");
const conflicts = await json("data/knowledge/batches/conflicts.knowledge-expansion-batch01.json");
const manifest = await json("data/route-v2/evidence-seed/evidence-seed-manifest.json");
const routeLegs = await jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const seasons = await jsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const batch01RouteLegs = routeLegs.filter((record) => record.retrievedAt === "2026-08-03T08:30:00.000Z");
const batch01Seasons = seasons.filter((record) => record.retrievedAt === "2026-08-03T08:30:00.000Z");

assert.equal(countryAsset.countryCount, 1);
assert.equal(cityAsset.cityCount, 10);
assert.equal(poiAsset.poiCount, 30);
assert.deepEqual(validateCountryEntitySet(countryAsset.countries), { accepted: true, reasons: [] });
assert.deepEqual(validateKnowledgeCityEntitySet(cityAsset.cities), { accepted: true, reasons: [] });
assert.deepEqual(validateKnowledgePoiEntitySet(poiAsset.pois), { accepted: true, reasons: [] });
assert.equal(conflicts.conflictCount, 0);
assert.equal(conflicts.conflicts.length, 0);

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
assert.deepEqual({ countries: repository.listCountries().length, cities: repository.listCities().length, pois: repository.listPois().length }, { countries: 55, cities: 306, pois: 2101 });
assert.equal(repository.validateParentReferences().accepted, true);

const expectedCityQids = ["Q1764", "Q685369", "Q1861", "Q52028", "Q72", "Q4191", "Q37100", "Q613602", "Q3130", "Q3141"];
assert.deepEqual(cityAsset.cities.map((city) => city.wikidataId).sort(), [...expectedCityQids].sort());
for (const qid of expectedCityQids) {
  const city = cityAsset.cities.find((value) => value.wikidataId === qid);
  const pois = poiAsset.pois.filter((poi) => poi.parentCityEntityId === city.entityId);
  assert.equal(pois.length, 3, `${city.canonicalNameEn} must have exactly three pilot POIs`);
  assert.equal(new Set(pois.map((poi) => poi.wikidataId)).size, 3);
  assert(pois.every((poi) => poi.canonicalNameZh && poi.canonicalNameEn && poi.coordinates));
}

const allEntities = [...repository.listCountries(), ...repository.listCities(), ...repository.listPois()];
assert.equal(new Set(allEntities.map((entity) => entity.entityId)).size, 2462);
// The pre-existing Singapore country/city pair intentionally shares Q334 across
// entity types. Batch 01 must not add another cross-type QID collision.
assert.equal(new Set(allEntities.map((entity) => entity.wikidataId)).size, 2472);
const duplicateQids = [...new Set(allEntities.map((entity) => entity.wikidataId))]
  .filter((qid) => allEntities.filter((entity) => entity.wikidataId === qid).length > 1);
assert.deepEqual(duplicateQids, ["Q334"]);
assert.equal(new Set([...countryAsset.countries, ...cityAsset.cities, ...poiAsset.pois].map((entity) => entity.wikidataId)).size, 41);

for (const record of routeLegs) assert.equal(validateRouteLegEvidence(record).accepted, true, record.legEvidenceId);
for (const record of seasons) assert.equal(validateSeasonEvidence(record).accepted, true, record.seasonEvidenceId);
assert.deepEqual(manifest.counts, { routeLeg: 414, season: 156, total: 570 });
assert.equal(batch01RouteLegs.length, 12);
assert.equal(batch01Seasons.length, 20);

const cityId = (qid) => createTypedEntityId({ entityType: "city", wikidataId: qid });
const directedPairs = [
  ["Q1764", "Q685369"], ["Q1861", "Q52028"], ["Q72", "Q4191"],
  ["Q37100", "Q613602"], ["Q3130", "Q3141"], ["Q8684", "Q16520"],
];
for (const [left, right] of directedPairs) {
  const forward = batch01RouteLegs.find((record) => record.fromEntityId === cityId(left) && record.toEntityId === cityId(right));
  const reverse = batch01RouteLegs.find((record) => record.fromEntityId === cityId(right) && record.toEntityId === cityId(left));
  assert(forward && reverse, `missing directed evidence pair ${left}<->${right}`);
  assert.notEqual(forward.legEvidenceId, reverse.legEvidenceId);
  assert.equal(forward.directed, true);
  assert.equal(reverse.directed, true);
}

for (const qid of expectedCityQids) {
  const records = batch01Seasons.filter((record) => record.entityId === cityId(qid));
  assert.equal(records.length, 2, `${qid} must have two risk-only month records`);
  for (const record of records) {
    assert.equal(record.suitabilityStatus, "unknown");
    assert.equal(record.season, null);
    assert.equal(record.recommendedBufferMinutes, null);
    assert(record.sources.length > 0);
    assert(record.weatherRisks.length + record.transportRisks.length + record.closureRisks.length > 0);
  }
}

const newEvidence = [
  ...batch01RouteLegs,
  ...batch01Seasons,
];
assert(newEvidence.every((record) => record.sources.every((item) => item.url.startsWith("https://"))));
assert(newEvidence.every((record) => record.sources.every((item) => /^[a-f0-9]{64}$/u.test(item.contentHash))));

console.log(JSON.stringify({
  status: "PASS",
  totals: { countries: 55, cities: 306, pois: 2101, entities: 2462 },
  batch01: { countries: 1, cities: 10, pois: 30, directedRouteLegs: 12, seasonRiskRecords: 20 },
  integrity: { orphan: 0, duplicateEntityId: 0, newDuplicateQid: 0, preExistingCrossTypeQid: "Q334", conflicts: 0 },
}, null, 2));
