import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const expectedCodes = ["AO", "CM", "CI", "RW", "UG", "ZM", "ZW", "MZ", "MN", "TJ", "IR", "MM", "TL", "BZ", "BB", "TT", "GY", "UA", "SM", "PG"];
const expectedQids = Object.fromEntries(Object.entries(json("data/knowledge/seeds/knowledge-expansion-batch10-20-country.json").countries).map(([code, entry]) => [code, entry.qid]));
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 139, cities: 833, pois: 3963, total: 4935 });
assert.equal(new Set(countries.map((entry) => entry.entityId)).size, countries.length);
assert.equal(new Set(cities.map((entry) => entry.entityId)).size, cities.length);
assert.equal(new Set(pois.map((entry) => entry.entityId)).size, pois.length);
assert.deepEqual(repository.validateParentReferences(), { accepted: true, reasons: [] });

const preparedCities = [34, 35, 36, 37].flatMap((batch) => json(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [34, 35, 36, 37].flatMap((batch) => json(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
const preparedCityIds = new Set(preparedCities.map((entry) => entry.entityId));
const publishedCityIds = new Set(cities.map((entry) => entry.entityId));
const publishedPoiIds = new Set(pois.map((entry) => entry.entityId));
assert.equal(validateKnowledgeCityEntitySet(preparedCities).accepted, true);
assert.equal(validateKnowledgePoiEntitySet(preparedPois).accepted, true);
assert.equal(new Set(preparedCities.map((entry) => entry.wikidataId)).size, preparedCities.length);
assert.equal(new Set(preparedPois.map((entry) => entry.wikidataId)).size, preparedPois.length);
for (const code of expectedCodes) {
  const country = countryByCode.get(code);
  assert(country, `missing Wave 1 country ${code}`);
  assert.equal(country.wikidataId, expectedQids[code], `${code} canonical QID mismatch`);
  const countryCities = preparedCities.filter((entry) => entry.parentCountryEntityId === country.entityId);
  const cityIds = new Set(countryCities.map((entry) => entry.entityId));
  const countryPois = preparedPois.filter((entry) => cityIds.has(entry.parentCityEntityId));
  assert(countryCities.length > 0, `${code} must have at least one prepared City`);
  assert(countryPois.length > 0, `${code} must have at least one prepared POI`);
}
assert.equal(preparedCities.length, 60);
assert.equal(preparedPois.length, 256);
assert.equal(preparedCities.every((entry) => !publishedCityIds.has(entry.entityId)), true, "evidence-pending Cities must not be published");
assert.equal(preparedPois.every((entry) => !publishedPoiIds.has(entry.entityId)), true, "evidence-pending POIs must not be published");

const policy = json("data/knowledge/semantic/sovereign-country-policy.json");
assert.equal(policy.referenceCount, 195);
assert.equal(policy.sovereignIsoAlpha2.length, 195);
assert.equal(expectedCodes.every((code) => policy.sovereignIsoAlpha2.includes(code)), true);
assert.equal(policy.nonSovereignExamples.every((entry) => !expectedCodes.includes(entry.code)), true);

const plan = json("data/knowledge/reports/sovereign-country-expansion-plan.json");
assert.equal(plan.supportedBeforeWave1.length, 119);
assert.equal(plan.wave1.length, 20);
assert.equal(plan.wave1.every((entry) => entry.routeReadiness === "wave1-catalog-only-evidence-pending"), true);
assert.equal(plan.wave1.every((entry) => !entry.routeReadiness.toLowerCase().includes("plannable")), true);
assert.deepEqual(plan.futureWaves.map((entry) => entry.countries.length), [18, 18, 17]);
assert.equal(plan.specialReview.length, 3);
const plannedCodes = new Set([...plan.supportedBeforeWave1, ...plan.wave1, ...plan.futureWaves.flatMap((entry) => entry.countries), ...plan.specialReview].map((entry) => entry.isoAlpha2));
assert.equal(plannedCodes.size, 195);
assert.equal(policy.sovereignIsoAlpha2.every((code) => plannedCodes.has(code)), true);

const report = json("data/knowledge/reports/sovereign-expansion-wave1.json");
assert.deepEqual(report.after, { countries: 139, cities: 833, pois: 3963, totalEntities: 4935 });
assert.deepEqual(report.additions, { publishedCountries: 20, preparedCities: 60, preparedPois: 256, publishedEvidenceRecords: 0 });
assert.equal(report.classifications.knowledgeReadyAdded, 20);
assert.equal(report.classifications.plannableAdded, 0);
assert.equal(report.classifications.evidenceBackedAdded, 0);
assert.equal(report.classifications.catalogOnlyAdded, 20);
assert.deepEqual(report.classifications.evidencePending, expectedCodes);
assert.equal(report.countryStatusMatrix.length, 20);
assert.equal(report.countryStatusMatrix.every((entry) => entry.knowledgeReady && entry.validPreparedCityDestination && entry.validPreparedPoi), true);
assert.equal(report.countryStatusMatrix.every((entry) => !entry.validEvidence && !entry.evidenceBacked && !entry.plannable && entry.evidencePending), true);
assert.equal(report.performance.formalExperimentExecutions, 1);
assert.equal(report.performance.realQualificationExecutions, 0);
assert.equal(report.performance.formalRun34622976529, "BLOCKED_INCONCLUSIVE");
assert.equal(report.performance.clearance, "NOT_CLEARED");

const manifest = json("data/route-v2/images/image-coverage-manifest.json");
const manifestIds = new Set([...manifest.countries, ...manifest.cities, ...manifest.pois].map((entry) => entry.entityId));
const waveIds = new Set([...expectedCodes.map((code) => countryByCode.get(code).entityId), ...preparedCityIds, ...preparedPois.map((entry) => entry.entityId)]);
assert.equal([...waveIds].some((entityId) => manifestIds.has(entityId)), false, "catalog-only Wave 1 entities must not enter the plannable image manifest");
assert.equal(manifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);
assert.equal(manifest.fallbackPolicy.city, "assets/route-city-placeholder.svg");
assert.equal(manifest.fallbackPolicy.poi, "assets/route-city-placeholder.svg");

console.log(JSON.stringify({
  verifier: "sovereign-expansion-wave1",
  status: "PASS",
  universe: 195,
  published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  additions: report.additions,
  futureWaveSizes: [18, 18, 17],
  specialReview: plan.specialReview.map((entry) => entry.isoAlpha2),
  imagePolicy: "neutral-local-fallback-no-impersonation",
  performance: report.performance,
}, null, 2));
