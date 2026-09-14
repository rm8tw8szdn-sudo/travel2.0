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
const CODES = ["LC", "VC", "ST", "SC", "SL", "SB", "SO", "SS", "SD", "SR", "SY", "TG", "TO", "TM", "TV", "VE", "YE"];
const SPECIAL_CODES = ["VA", "PS", "KP"];
const READINESS = "wave4-catalog-only-evidence-pending";
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
const seed = json("data/knowledge/seeds/knowledge-expansion-batch13-17-country.json");

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 192, cities: 833, pois: 3963, total: 4988 });
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.at(-1), "data/knowledge/batches/countries.p1a-batch13.json");
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.some((entry) => /batch(?:46|47|48|49)\.json$/u.test(entry)), false);
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.some((entry) => /batch(?:46|47|48|49)\.json$/u.test(entry)), false);

const preparedCities = [46, 47, 48, 49].flatMap((batch) => json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [46, 47, 48, 49].flatMap((batch) => json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
assert.equal(preparedCities.length, 21);
assert.equal(preparedPois.length, 123);
assert.equal(validateKnowledgeCityEntitySet(preparedCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(preparedPois).accepted, true);
assert.equal(new Set(preparedCities.map((entry) => entry.entityId)).size, preparedCities.length);
assert.equal(new Set(preparedPois.map((entry) => entry.entityId)).size, preparedPois.length);
const publishedCityIds = new Set(cities.map((entry) => entry.entityId));
const publishedPoiIds = new Set(pois.map((entry) => entry.entityId));
assert.equal(preparedCities.every((entry) => !publishedCityIds.has(entry.entityId)), true);
assert.equal(preparedPois.every((entry) => !publishedPoiIds.has(entry.entityId)), true);

for (const wave of [1, 2, 3, 4]) {
  const batch = 45 + wave;
  const selection = json(`data/knowledge/batches/selection.p1b-batch${batch}.json`);
  const provenance = json(`data/knowledge/batches/provenance.knowledge-expansion-batch13-wave${wave}.json`);
  const review = json(`data/knowledge/batches/review-queue.knowledge-expansion-batch13-wave${wave}.json`);
  const conflicts = json(`data/knowledge/batches/conflicts.knowledge-expansion-batch13-wave${wave}.json`);
  const raw = json(`data/knowledge/raw/knowledge-expansion-batch13-wave${wave}.wikidata.json`);
  assert.equal(selection.wave, wave);
  assert.equal(selection.cities.length, json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities.length);
  assert.equal(selection.pois.length, json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois.length);
  assert.equal(provenance.publishedEntityQids.length, selection.cities.length + selection.pois.length);
  assert.equal(review.reviewCount, review.entries.length);
  assert.equal(conflicts.conflictCount, conflicts.conflicts.length);
  assert.equal(raw.wave, wave);
  assert.equal(raw.seedPath, "data/knowledge/seeds/knowledge-expansion-batch13-17-country.json");
}

const policy = json("data/knowledge/semantic/sovereign-country-policy.json");
assert.equal(CODES.every((code) => policy.sovereignIsoAlpha2.includes(code)), true);
for (const code of CODES) {
  const country = countryByCode.get(code);
  assert(country, `missing published Wave 4 Country ${code}`);
  assert.equal(country.wikidataId, seed.countries[code].qid, `${code} canonical identity mismatch`);
  assert.equal(country.canonicalNameEn, seed.countries[code].label, `${code} reviewed canonical name mismatch`);
  const countryCities = preparedCities.filter((entry) => entry.parentCountryEntityId === country.entityId);
  const cityIds = new Set(countryCities.map((entry) => entry.entityId));
  if (code === "TV") {
    assert.equal(countryCities.length, 0, "Tuvalu atolls and islands must not be modeled as City");
    assert.equal(preparedPois.some((entry) => cityIds.has(entry.parentCityEntityId)), false);
  } else {
    assert(countryCities.length > 0, `${code} must retain at least one prepared destination`);
    assert(preparedPois.some((entry) => cityIds.has(entry.parentCityEntityId)), `${code} must retain at least one prepared POI`);
  }
}

const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
assert.equal(catalogs.countries.every((country) => !(country.aliases || []).some((alias) => alias.toLocaleLowerCase("en-US") === country.code.toLocaleLowerCase("en-US"))), true, "lowercase ISO alpha-2 tokens must not have natural-language parser authority");
for (const [query, countryCode] of [
  ["Saint Lucia 7 days", "LC"],
  ["St. Lucia 7 days", "LC"],
  ["Saint Vincent and the Grenadines 7 days", "VC"],
  ["St. Vincent & the Grenadines 7 days", "VC"],
  ["São Tomé and Príncipe 7 days", "ST"],
  ["Sao Tome and Principe 7 days", "ST"],
  ["Sudan 7 days", "SD"],
  ["South Sudan 7 days", "SS"],
]) {
  const intent = parseSearchIntent(query, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.parseSuccess, true, `${query}: qualified Country must resolve`);
  assert.deepEqual(intent.explicitCountryCodes, [countryCode], `${query}: exact Country identity`);
}
for (const query of ["Paris to London 7 days", "walk to beach 7 days", "St Paul 7 days"]) {
  const intent = parseSearchIntent(query, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.explicitCountryCodes.includes("TO"), false, `${query}: weak lowercase ISO alias must not resolve Tonga`);
  assert.equal(intent.explicitCountryCodes.includes("ST"), false, `${query}: weak lowercase ISO alias must not resolve São Tomé and Príncipe`);
}

const report = json("data/knowledge/reports/sovereign-expansion-wave4.json");
const plan = json("data/knowledge/reports/sovereign-country-expansion-plan.json");
const wave4 = plan.futureWaves.find((entry) => entry.wave === 4);
assert.deepEqual(wave4.countries.map((entry) => entry.isoAlpha2), CODES);
assert.equal(new Set([...CODES, ...SPECIAL_CODES]).size, 20);
assert.deepEqual(plan.specialReview.map((entry) => entry.isoAlpha2), SPECIAL_CODES);
assert.equal(SPECIAL_CODES.every((code) => !countryByCode.has(code)), true, "special-review entities must remain unpublished");
assert.equal(SPECIAL_CODES.every((code) => !Object.hasOwn(seed.countries, code)), true, "special-review entities must not enter the normal Wave 4 seed");
assert.equal(countries.length + SPECIAL_CODES.length, policy.sovereignIsoAlpha2.length, "published plus remaining special-review entities must equal the declared sovereign universe");
assert.equal(wave4.countries.every((entry) => entry.canonicalCountryName === seed.countries[entry.isoAlpha2].label && entry.wikidataId === seed.countries[entry.isoAlpha2].qid), true);
assert.equal(wave4.countries.every((entry) => entry.routeReadiness === READINESS), true);
assert.equal(wave4.countries.every((entry) => !/(?:plannable|route-ready|evidence-backed)/iu.test(entry.routeReadiness)), true);
assert.deepEqual(report.additions, { publishedCountries: 17, preparedCities: 21, preparedPois: 123, publishedEvidenceRecords: 0, plannableCountries: 0, evidenceBackedCountries: 0, catalogOnlyCountries: 17 });
assert.deepEqual(report.after, { countries: 192, cities: 833, pois: 3963, totalEntities: 4988, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 74, remainingSovereignGap: 3, remainingNormalGap: 0, remainingSpecialReviewGap: 3 });
assert.equal(report.statusMatrix.length, 17);
assert.equal(report.statusMatrix.every((entry) => entry.published && !entry.validEvidence && !entry.plannable && !entry.evidenceBacked && entry.catalogOnly && entry.evidencePending && entry.routeReadiness === READINESS), true);
assert.equal(report.statusMatrix.find((entry) => entry.countryCode === "TV").preparedCityCount, 0);
assert.equal(report.statusMatrix.find((entry) => entry.countryCode === "TV").preparedPoiCount, 0);

const wave3AtMerge = JSON.parse(childProcess.execFileSync("git", ["show", "ff280297fba180fa7d1fad7f00c126aa5512a303:data/knowledge/reports/sovereign-expansion-wave3.json"], { cwd: ROOT, encoding: "utf8" }));
assert.deepEqual(json("data/knowledge/reports/sovereign-expansion-wave3.json"), wave3AtMerge, "Wave 3 sealed report must remain unchanged");
assert.equal(report.quarantine.historicalSealed, 1416);
assert.equal(report.performance.formalExperimentExecutions, 1);
assert.equal(report.performance.realQualificationExecutions, 0);
assert.equal(report.performance.formalRun34622976529, "BLOCKED_INCONCLUSIVE");
assert.equal(report.performance.clearance, "NOT_CLEARED");

console.log(JSON.stringify({ verifier: "sovereign-expansion-wave4", status: "PASS", published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, additions: report.additions, quarantine: report.quarantine, performance: report.performance }, null, 2));
