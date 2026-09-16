import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createKnowledgeCoverageSemantics } from "../src/lib/routes/knowledge-coverage-semantics.mjs";
import { createPublishedKnowledgeEntityLayerRepository, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { createKnowledgeEntityLayerSearchIntentCatalog, parseSearchIntent } from "../src/lib/routes/index.mjs";
import { getAuthoritativeKnowledgeReadiness, validateKnowledgeReadinessAuthority } from "../src/lib/routes/knowledge-readiness-authority.mjs";
import { createRouteSearchService } from "../src/lib/routes/route-search-service.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const jsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const CODES = ["BB", "BZ", "CV", "DM", "MN", "RW", "SC", "SM", "TT", "UG", "ZM", "ZW"];
const citiesAsset = json("data/knowledge/batches/cities.p1b-batch50.json");
const poisAsset = json("data/knowledge/batches/pois.p1b-batch50.json");
const reviewQueue = json("data/knowledge/batches/review-queue.plannable-expansion-batch01.json");
const report = json("data/knowledge/reports/plannable-expansion-batch01-entity-review.json");
const readinessPolicy = json("data/knowledge/semantic/country-route-readiness-policy.json");

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 195, cities: 866, pois: 4071, total: 5132 });
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.at(-1), "data/knowledge/batches/cities.p1b-batch50.json");
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.at(-1), "data/knowledge/batches/pois.p1b-batch50.json");
assert.deepEqual(validateKnowledgeCityEntitySet(citiesAsset.cities), { accepted: true, reasons: [] });
assert.deepEqual(validateKnowledgePoiEntitySet(poisAsset.pois), { accepted: true, reasons: [] });
assert.equal(citiesAsset.cities.length, 33);
assert.equal(poisAsset.pois.length, 108);
assert.equal(reviewQueue.reviewCount, 32);
assert.equal(reviewQueue.reviews.length, 32);
assert.equal(reviewQueue.reviews.every((entry) => entry.disposition === "candidate-quarantine-retained" && entry.reason && entry.sourceEntity?.provenance), true);

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));
const publishedEntityIds = new Set([...countries, ...cities, ...pois].map((entity) => entity.entityId));
assert.equal(reviewQueue.reviews.every((entry) => !publishedEntityIds.has(entry.entityId)), true, "rejected candidates must not leak into production");
const batchCountryCodes = new Set(citiesAsset.cities.map((city) => countryById.get(city.parentCountryEntityId)?.isoAlpha2));
assert.deepEqual([...batchCountryCodes].sort(), [...CODES].sort());
assert.equal(poisAsset.pois.every((poi) => citiesAsset.cities.some((city) => city.entityId === poi.parentCityEntityId)), true);

const entityIds = [...countries, ...cities, ...pois].map((entity) => entity.entityId);
assert.equal(new Set(entityIds).size, entityIds.length, "published entity IDs must remain unique");
for (const [label, entities] of [["Country", countries], ["City", cities], ["POI", pois]]) {
  const qids = entities.map((entity) => entity.wikidataId);
  assert.equal(new Set(qids).size, qids.length, `${label} QIDs must remain unique within their authority layer`);
}
const radians = (degrees) => degrees * Math.PI / 180;
const distanceKm = (left, right) => {
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(right.longitude - left.longitude);
  return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2));
};
for (const poi of poisAsset.pois) {
  const city = cityById.get(poi.parentCityEntityId);
  assert(city, `${poi.wikidataId}: parent City must be published`);
  assert(distanceKm(city.coordinates, poi.coordinates) <= 25, `${poi.wikidataId}: parent distance must remain locally sane`);
}

const coverage = createKnowledgeCoverageSemantics({
  countries,
  cities,
  pois,
  routeLegEvidence: jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl"),
  seasonEvidence: jsonl("data/route-v2/evidence-seed/season-evidence.jsonl"),
});
assert.equal(coverage.plannableCountries, 118);
assert.equal(coverage.evidenceBackedCountries, 115);
assert.equal(coverage.countryOnlyCountries, 77);
assert.equal(CODES.every((code) => coverage.countryOnlyCountryCodes.includes(code)), true);
assert.deepEqual(readinessPolicy.batch01EntityFoundationCountryCodes, CODES);
const readinessAuthority = getAuthoritativeKnowledgeReadiness();
assert.equal(readinessAuthority.plannableCountryCodes.length, 118);
assert.equal(readinessAuthority.evidenceBackedCountryCodes.length, 115);
assert.equal(readinessAuthority.catalogOnlyCountryCodes.length, 77);
assert.equal(CODES.every((code) => readinessAuthority.catalogOnlyCountryCodes.includes(code) && readinessAuthority.evidencePendingCountryCodes.includes(code)), true);
const replaceCode = (codes, from, to) => codes.map((code) => code === from ? to : code);
const malformedAuthorities = [
  null,
  {},
  { ...readinessPolicy, plannableCountryCodes: null },
  { ...readinessPolicy, catalogOnlyCountryCodes: [...readinessPolicy.catalogOnlyCountryCodes, "BB"] },
  { ...readinessPolicy, plannableCountryCodes: replaceCode(readinessPolicy.plannableCountryCodes, "JP", "ZZ"), evidenceBackedCountryCodes: replaceCode(readinessPolicy.evidenceBackedCountryCodes, "JP", "ZZ") },
  { ...readinessPolicy, evidenceBackedCountryCodes: replaceCode(readinessPolicy.evidenceBackedCountryCodes, "JP", "ZZ") },
  { ...readinessPolicy, catalogOnlyCountryCodes: replaceCode(readinessPolicy.catalogOnlyCountryCodes, "BB", "ZZ"), evidencePendingCountryCodes: replaceCode(readinessPolicy.evidencePendingCountryCodes, "BB", "ZZ") },
  { ...readinessPolicy, evidencePendingCountryCodes: replaceCode(readinessPolicy.evidencePendingCountryCodes, "BB", "ZZ") },
  { ...readinessPolicy, plannableCountryCodes: readinessPolicy.plannableCountryCodes.filter((code) => code !== "JP") },
  { ...readinessPolicy, catalogOnlyCountryCodes: [...readinessPolicy.catalogOnlyCountryCodes, "JP"] },
  { ...readinessPolicy, evidenceBackedCountryCodes: replaceCode(readinessPolicy.evidenceBackedCountryCodes, "JP", "BB") },
];
for (const malformed of malformedAuthorities) {
  assert.throws(() => validateKnowledgeReadinessAuthority(malformed), /READINESS_AUTHORITY_/u);
}
assert.deepEqual(report.evidenceAdditions, { transport: 0, seasonMonth: 0, theme: 0 });
assert.equal(report.readinessPromotions, 0);
assert.equal(report.candidateLeakage, "NONE");
assert.deepEqual(report.after, { countries: 195, cities: 866, pois: 4071, totalEntities: 5132, plannable: 118, evidenceBacked: 115, catalogOnly: 77 });
assert.equal(report.countriesReviewed.every((entry) => !entry.validEvidence && !entry.plannable && !entry.evidenceBacked && entry.catalogOnly && entry.evidencePending), true);
assert.equal(report.nextEvidencePhase.requiredDirectedTransportSegments, 42);
assert.equal(report.nextEvidencePhase.requiredSeasonMonthProfiles, 33);
assert.deepEqual(report.nextEvidencePhase.singleDestinationCountries.sort(), ["SC", "SM"]);

const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
for (const [query, expectedCode] of [
  ["Cabo Verde", "CV"], ["Cape Verde", "CV"], ["Dominica", "DM"], ["Dominican Republic", "DO"],
  ["Mongolia", "MN"], ["San Marino", "SM"], ["Seychelles", "SC"], ["Trinidad and Tobago", "TT"],
]) {
  const intent = parseSearchIntent(`${query} 7 days`, { catalogs, timeIntentEnabled: true });
  assert.deepEqual(intent.explicitCountryCodes, [expectedCode], `${query}: canonical Country identity`);
}
for (const [query, rejectedCode] of [["Paris to London", "TO"], ["St Paul", "ST"], ["Korea", "KP"], ["West Bank", "PS"], ["Holy See", "VA"]]) {
  const intent = parseSearchIntent(`${query} 7 days`, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.explicitCountryCodes.includes(rejectedCode), false, `${query}: weak/related identity must remain non-authoritative`);
}

let plannerCalls = 0;
const runtimeService = createRouteSearchService({
  acceptedRepository: { list: () => ({ records: [] }) },
  searchCache: { get: () => null, put: () => {} },
  planner: { buildCandidates: async () => { plannerCalls += 1; return { accepted: [], rejected: [] }; } },
  intentCatalog: catalogs,
  env: {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "2000",
  },
});
await runtimeService.search({ query: "Barbados 7 days", limit: 3, sessionId: "batch01-readiness-negative" });
assert.equal(plannerCalls, 0, "Catalog-only Country with production entity depth must not enter the planner");
await runtimeService.search({ query: "Japan 7 days", limit: 3, sessionId: "batch01-readiness-positive" });
assert.equal(plannerCalls, 1, "authoritative Plannable Country must remain planner-eligible");

for (const historicalPath of [
  "data/knowledge/reports/knowledge-expansion-batch09-baseline.json",
  "data/knowledge/reports/sovereign-expansion-wave1.json",
  "data/knowledge/reports/sovereign-expansion-wave2.json",
  "data/knowledge/reports/sovereign-expansion-wave3.json",
  "data/knowledge/reports/sovereign-expansion-wave4.json",
  "data/knowledge/reports/sovereign-special-review.json",
]) {
  const baseline = JSON.parse(childProcess.execFileSync("git", ["show", `74739dd87d2b2537707fa26c382feed27e528fdd:${historicalPath}`], { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual(json(historicalPath), baseline, `${historicalPath} must remain sealed`);
}

console.log(JSON.stringify({ verifier: "plannable-expansion-batch01-entity-foundation", status: "PASS", published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, reviewed: { countries: 12, cities: 33, pois: 140 }, admitted: { cities: 33, pois: 108 }, quarantined: { cities: 0, pois: 32 }, evidenceAdditions: 0, readinessPromotions: 0 }, null, 2));
