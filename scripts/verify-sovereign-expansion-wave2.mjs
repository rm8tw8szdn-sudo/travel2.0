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
const CODES = ["AF", "AG", "BY", "BJ", "BF", "BI", "CV", "CF", "TD", "KM", "CG", "DJ", "DM", "GQ", "ER", "SZ", "GA", "GM"];
const READINESS = "wave2-catalog-only-evidence-pending";
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
const seed = json("data/knowledge/seeds/knowledge-expansion-batch11-18-country.json");

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 157, cities: 833, pois: 3963, total: 4953 });
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.at(-1), "data/knowledge/batches/countries.p1a-batch11.json");
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.some((entry) => /batch(?:38|39|40|41)\.json$/u.test(entry)), false);
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.some((entry) => /batch(?:38|39|40|41)\.json$/u.test(entry)), false);

const preparedCities = [38, 39, 40, 41].flatMap((batch) => json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [38, 39, 40, 41].flatMap((batch) => json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
assert.equal(preparedCities.length, 37);
assert.equal(preparedPois.length, 157);
assert.equal(validateKnowledgeCityEntitySet(preparedCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(preparedPois).accepted, true);
assert.equal(new Set(preparedCities.map((entry) => entry.entityId)).size, 37);
assert.equal(new Set(preparedPois.map((entry) => entry.entityId)).size, 157);
const publishedCityIds = new Set(cities.map((entry) => entry.entityId));
const publishedPoiIds = new Set(pois.map((entry) => entry.entityId));
assert.equal(preparedCities.every((entry) => !publishedCityIds.has(entry.entityId)), true);
assert.equal(preparedPois.every((entry) => !publishedPoiIds.has(entry.entityId)), true);
for (const wave of [1, 2, 3, 4]) {
  const batch = 37 + wave;
  const selection = json(`data/knowledge/batches/selection.p1b-batch${batch}.json`);
  const provenance = json(`data/knowledge/batches/provenance.knowledge-expansion-batch11-wave${wave}.json`);
  const review = json(`data/knowledge/batches/review-queue.knowledge-expansion-batch11-wave${wave}.json`);
  const conflicts = json(`data/knowledge/batches/conflicts.knowledge-expansion-batch11-wave${wave}.json`);
  const raw = json(`data/knowledge/raw/knowledge-expansion-batch11-wave${wave}.wikidata.json`);
  assert.equal(selection.wave, wave);
  assert.equal(selection.cities.length, json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities.length);
  assert.equal(selection.pois.length, json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois.length);
  assert.equal(provenance.publishedEntityQids.length, selection.cities.length + selection.pois.length);
  assert.equal(review.reviewCount, review.entries.length);
  assert.equal(conflicts.conflictCount, conflicts.conflicts.length);
  assert.equal(raw.wave, wave);
  assert.equal(raw.seedPath, "data/knowledge/seeds/knowledge-expansion-batch11-18-country.json");
}

const policy = json("data/knowledge/semantic/sovereign-country-policy.json");
assert.equal(CODES.every((code) => policy.sovereignIsoAlpha2.includes(code)), true);
for (const code of CODES) {
  const country = countryByCode.get(code);
  assert(country, `missing published Wave 2 Country ${code}`);
  assert.equal(country.wikidataId, seed.countries[code].qid, `${code} canonical identity mismatch`);
  const countryCities = preparedCities.filter((entry) => entry.parentCountryEntityId === country.entityId);
  const cityIds = new Set(countryCities.map((entry) => entry.entityId));
  assert(countryCities.length > 0, `${code} must retain at least one prepared destination`);
  assert(preparedPois.some((entry) => cityIds.has(entry.parentCityEntityId)), `${code} must retain at least one prepared POI`);
}
const congo = countryByCode.get("CG");
const dominica = countryByCode.get("DM");
const caboVerde = countryByCode.get("CV");
assert.equal(caboVerde.canonicalNameEn, "Cabo Verde", "CV canonical English identity must use Cabo Verde");
assert.equal(caboVerde.isoAlpha2, "CV");
assert.equal(caboVerde.wikidataId, "Q1011");
assert.equal(caboVerde.aliases.includes("Cape Verde"), true, "Cape Verde must remain an alternate name for CV");
assert.equal(congo.aliases.includes("Congo"), false, "unqualified Congo must remain ambiguity-safe");
assert.equal(congo.aliases.includes("刚果"), false, "unqualified Chinese Congo must remain ambiguity-safe");
assert.equal(dominica.aliases.includes("DOM"), false, "Dominican Republic ISO3 must not alias Dominica");
assert.equal(dominica.aliases.includes("多米尼加"), false, "Dominican Republic Chinese name must not alias Dominica");
const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
for (const [query, countryCode] of [
  ["Republic of the Congo 7 days", "CG"],
  ["Democratic Republic of the Congo 7 days", "CD"],
  ["Dominica 7 days", "DM"],
  ["Dominican Republic 7 days", "DO"],
  ["多米尼加 7 days", "DO"],
  ["Cabo Verde 7 days", "CV"],
  ["Cape Verde 7 days", "CV"],
]) {
  const intent = parseSearchIntent(query, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.parseSuccess, true, `${query}: qualified Country must resolve`);
  assert.deepEqual(intent.explicitCountryCodes, [countryCode], `${query}: exact Country identity`);
}
assert.equal(parseSearchIntent("Congo 7 days", { catalogs, timeIntentEnabled: true }).parseSuccess, false, "unqualified Congo must fail closed");

const report = json("data/knowledge/reports/sovereign-expansion-wave2.json");
const plan = json("data/knowledge/reports/sovereign-country-expansion-plan.json");
const wave2 = plan.futureWaves.find((entry) => entry.wave === 2);
assert.deepEqual(wave2.countries.map((entry) => entry.isoAlpha2), CODES);
const caboVerdePlan = wave2.countries.find((entry) => entry.isoAlpha2 === "CV");
assert.equal(caboVerdePlan.canonicalCountryName, "Cabo Verde");
assert.equal(caboVerdePlan.wikidataId, "Q1011");
assert.equal(wave2.countries.every((entry) => entry.routeReadiness === READINESS), true);
assert.equal(wave2.countries.every((entry) => !/(?:plannable|route-ready|evidence-backed)/iu.test(entry.routeReadiness)), true);
assert.deepEqual(report.additions, { publishedCountries: 18, preparedCities: 37, preparedPois: 157, publishedEvidenceRecords: 0, plannableCountries: 0, evidenceBackedCountries: 0, catalogOnlyCountries: 18 });
assert.deepEqual(report.after, { countries: 157, cities: 833, pois: 3963, totalEntities: 4953, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 39, remainingSovereignGap: 38 });
assert.equal(report.statusMatrix.length, 18);
assert.equal(report.statusMatrix.every((entry) => entry.published && entry.preparedCityCount > 0 && entry.preparedPoiCount > 0), true);
assert.equal(report.statusMatrix.every((entry) => !entry.validEvidence && !entry.plannable && !entry.evidenceBacked && entry.catalogOnly && entry.evidencePending && entry.routeReadiness === READINESS), true);

const wave1AtMerge = JSON.parse(childProcess.execFileSync("git", ["show", "8265d0be89393d10458c0b877b7e42441197a7c0:data/knowledge/reports/sovereign-expansion-wave1.json"], { cwd: ROOT, encoding: "utf8" }));
const wave1Current = json("data/knowledge/reports/sovereign-expansion-wave1.json");
assert.deepEqual(wave1Current, wave1AtMerge, "Wave 1 sealed report must remain byte-semantically unchanged");
assert.equal(report.quarantine.historicalSealed, 1416);
assert.equal(report.performance.formalExperimentExecutions, 1);
assert.equal(report.performance.realQualificationExecutions, 0);
assert.equal(report.performance.formalRun34622976529, "BLOCKED_INCONCLUSIVE");
assert.equal(report.performance.clearance, "NOT_CLEARED");

console.log(JSON.stringify({ verifier: "sovereign-expansion-wave2", status: "PASS", published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, additions: report.additions, quarantine: report.quarantine, performance: report.performance }, null, 2));
