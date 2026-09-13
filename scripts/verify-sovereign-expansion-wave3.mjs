import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { createKnowledgeEntityLayerSearchIntentCatalog, parseSearchIntent } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const CODES = ["GD", "GN", "GW", "HT", "IQ", "KI", "LS", "LR", "LY", "MW", "ML", "MH", "MR", "FM", "NR", "NE", "PW", "KN"];
const READINESS = "wave3-catalog-only-evidence-pending";
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
const seed = json("data/knowledge/seeds/knowledge-expansion-batch12-18-country.json");

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 175, cities: 833, pois: 3963, total: 4971 });
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.at(-1), "data/knowledge/batches/countries.p1a-batch12.json");
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.some((entry) => /batch(?:42|43|44|45)\.json$/u.test(entry)), false);
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.some((entry) => /batch(?:42|43|44|45)\.json$/u.test(entry)), false);

const preparedCities = [42, 43, 44, 45].flatMap((batch) => json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [42, 43, 44, 45].flatMap((batch) => json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
assert.equal(preparedCities.length, 28);
assert.equal(preparedPois.length, 110);
assert.equal(validateKnowledgeCityEntitySet(preparedCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(preparedPois).accepted, true);
assert.equal(new Set(preparedCities.map((entry) => entry.entityId)).size, preparedCities.length);
assert.equal(new Set(preparedPois.map((entry) => entry.entityId)).size, preparedPois.length);
const publishedCityIds = new Set(cities.map((entry) => entry.entityId));
const publishedPoiIds = new Set(pois.map((entry) => entry.entityId));
assert.equal(preparedCities.every((entry) => !publishedCityIds.has(entry.entityId)), true);
assert.equal(preparedPois.every((entry) => !publishedPoiIds.has(entry.entityId)), true);

for (const wave of [1, 2, 3, 4]) {
  const batch = 41 + wave;
  const selection = json(`data/knowledge/batches/selection.p1b-batch${batch}.json`);
  const provenance = json(`data/knowledge/batches/provenance.knowledge-expansion-batch12-wave${wave}.json`);
  const review = json(`data/knowledge/batches/review-queue.knowledge-expansion-batch12-wave${wave}.json`);
  const conflicts = json(`data/knowledge/batches/conflicts.knowledge-expansion-batch12-wave${wave}.json`);
  const raw = json(`data/knowledge/raw/knowledge-expansion-batch12-wave${wave}.wikidata.json`);
  assert.equal(selection.wave, wave);
  assert.equal(selection.cities.length, json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities.length);
  assert.equal(selection.pois.length, json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois.length);
  assert.equal(provenance.publishedEntityQids.length, selection.cities.length + selection.pois.length);
  assert.equal(review.reviewCount, review.entries.length);
  assert.equal(conflicts.conflictCount, conflicts.conflicts.length);
  assert.equal(raw.wave, wave);
  assert.equal(raw.seedPath, "data/knowledge/seeds/knowledge-expansion-batch12-18-country.json");
}

const policy = json("data/knowledge/semantic/sovereign-country-policy.json");
assert.equal(CODES.every((code) => policy.sovereignIsoAlpha2.includes(code)), true);
for (const code of CODES) {
  const country = countryByCode.get(code);
  assert(country, `missing published Wave 3 Country ${code}`);
  assert.equal(country.wikidataId, seed.countries[code].qid, `${code} canonical identity mismatch`);
  assert.equal(country.canonicalNameEn, seed.countries[code].label, `${code} reviewed canonical name mismatch`);
  const countryCities = preparedCities.filter((entry) => entry.parentCountryEntityId === country.entityId);
  const cityIds = new Set(countryCities.map((entry) => entry.entityId));
  if (code === "NR") {
    assert.equal(countryCities.length, 0, "Nauru districts and island must not be modeled as City");
    assert.equal(preparedPois.some((entry) => cityIds.has(entry.parentCityEntityId)), false);
  } else {
    assert(countryCities.length > 0, `${code} must retain at least one prepared destination`);
    assert(preparedPois.some((entry) => cityIds.has(entry.parentCityEntityId)), `${code} must retain at least one prepared POI`);
  }
}

const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
for (const [query, countryCode] of [
  ["Federated States of Micronesia 7 days", "FM"],
  ["Micronesia 7 days", "FM"],
  ["Saint Kitts and Nevis 7 days", "KN"],
  ["St. Kitts & Nevis 7 days", "KN"],
  ["Guinea 7 days", "GN"],
  ["Guinea-Bissau 7 days", "GW"],
  ["Equatorial Guinea 7 days", "GQ"],
  ["Papua New Guinea 7 days", "PG"],
  ["Niger 7 days", "NE"],
  ["Nigeria 7 days", "NG"],
]) {
  const intent = parseSearchIntent(query, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.parseSuccess, true, `${query}: qualified Country must resolve`);
  assert.deepEqual(intent.explicitCountryCodes, [countryCode], `${query}: exact Country identity`);
}

const report = json("data/knowledge/reports/sovereign-expansion-wave3.json");
const plan = json("data/knowledge/reports/sovereign-country-expansion-plan.json");
const wave3 = plan.futureWaves.find((entry) => entry.wave === 3);
assert.deepEqual(wave3.countries.map((entry) => entry.isoAlpha2), CODES);
assert.equal(wave3.countries.every((entry) => entry.canonicalCountryName === seed.countries[entry.isoAlpha2].label && entry.wikidataId === seed.countries[entry.isoAlpha2].qid), true);
assert.equal(wave3.countries.every((entry) => entry.routeReadiness === READINESS), true);
assert.equal(wave3.countries.every((entry) => !/(?:plannable|route-ready|evidence-backed)/iu.test(entry.routeReadiness)), true);
assert.deepEqual(report.additions, { publishedCountries: 18, preparedCities: 28, preparedPois: 110, publishedEvidenceRecords: 0, plannableCountries: 0, evidenceBackedCountries: 0, catalogOnlyCountries: 18 });
assert.deepEqual(report.after, { countries: 175, cities: 833, pois: 3963, totalEntities: 4971, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 57, remainingSovereignGap: 20 });
assert.equal(report.statusMatrix.length, 18);
assert.equal(report.statusMatrix.every((entry) => entry.published && !entry.validEvidence && !entry.plannable && !entry.evidenceBacked && entry.catalogOnly && entry.evidencePending && entry.routeReadiness === READINESS), true);
assert.equal(report.statusMatrix.find((entry) => entry.countryCode === "NR").preparedCityCount, 0);
assert.equal(report.statusMatrix.find((entry) => entry.countryCode === "NR").preparedPoiCount, 0);

const wave2AtMerge = JSON.parse(childProcess.execFileSync("git", ["show", "16ea3754f5796bf07753e8be1c65cc6b39eb61a0:data/knowledge/reports/sovereign-expansion-wave2.json"], { cwd: ROOT, encoding: "utf8" }));
assert.deepEqual(json("data/knowledge/reports/sovereign-expansion-wave2.json"), wave2AtMerge, "Wave 2 sealed report must remain unchanged");
assert.equal(report.quarantine.historicalSealed, 1416);
assert.equal(report.performance.formalExperimentExecutions, 1);
assert.equal(report.performance.realQualificationExecutions, 0);
assert.equal(report.performance.formalRun34622976529, "BLOCKED_INCONCLUSIVE");
assert.equal(report.performance.clearance, "NOT_CLEARED");

console.log(JSON.stringify({ verifier: "sovereign-expansion-wave3", status: "PASS", published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, additions: report.additions, quarantine: report.quarantine, performance: report.performance }, null, 2));
