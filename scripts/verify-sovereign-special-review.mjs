import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { createKnowledgeEntityLayerSearchIntentCatalog, parseSearchIntent } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const CODES = ["VA", "PS", "KP"];
const READINESS = "special-review-catalog-only-evidence-pending";
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((country) => [country.isoAlpha2, country]));
const policy = json("data/knowledge/semantic/sovereign-special-country-identity-policy.json");
const sovereignPolicy = json("data/knowledge/semantic/sovereign-country-policy.json");
const plan = json("data/knowledge/reports/sovereign-country-expansion-plan.json");
const report = json("data/knowledge/reports/sovereign-special-review.json");

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 195, cities: 833, pois: 3963, total: 4991 });
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.at(-1), "data/knowledge/batches/countries.p1a-batch14.json");
assert.equal(countries.length, sovereignPolicy.referenceCount);
assert.equal(CODES.every((code) => sovereignPolicy.sovereignIsoAlpha2.includes(code)), true);
assert.deepEqual(plan.specialReview, []);
assert.deepEqual(plan.resolvedSpecialReview.map((entry) => entry.isoAlpha2), CODES);
assert.equal(plan.resolvedSpecialReview.every((entry) => entry.routeReadiness === READINESS && entry.resolution === "published-catalog-only"), true);
assert.equal(report.after.remainingSpecialReviewGap, 0);
assert.deepEqual(report.after, { countries: 195, cities: 833, pois: 3963, totalEntities: 4991, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 77, remainingNormalGap: 0, remainingSpecialReviewGap: 0 });
assert.equal(report.countries.every((entry) => entry.published && !entry.validEvidence && !entry.plannable && !entry.evidenceBacked && entry.catalogOnly && entry.evidencePending && entry.routeReadiness === READINESS), true);

for (const [code, name, qid] of [["VA", "Vatican City", "Q237"], ["PS", "State of Palestine", "Q219060"], ["KP", "North Korea", "Q423"]]) {
  const country = countryByCode.get(code);
  assert(country, `${code} must be published`);
  assert.equal(country.canonicalNameEn, name);
  assert.equal(country.wikidataId, qid);
  assert.equal(cities.some((city) => city.parentCountryEntityId === country.entityId), false, `${code} must remain Country-only`);
}
const publishedCityIds = new Set(cities.map((city) => city.entityId));
assert.equal(pois.some((poi) => publishedCityIds.has(poi.parentCityEntityId) && CODES.includes(countryByCode.get(poi.countryCode)?.isoAlpha2)), false);

const va = countryByCode.get("VA");
assert.equal(va.aliases.includes("Vatican City State"), true);
assert.equal(va.aliases.includes("Holy See"), false);
assert.deepEqual(policy.entities.VA.relatedIdentities, [{ canonicalNameEn: "Holy See", wikidataId: "Q159583", relationship: "distinct-related-sovereign-identity", ordinaryCountryAlias: false }]);
const ps = countryByCode.get("PS");
assert.equal(ps.canonicalNameEn, "State of Palestine");
assert.equal(ps.subregion, "Western Asia");
assert.equal(ps.region, "亚洲");
for (const rejected of ["Palestinian Territories", "Palestinian Territory", "West Bank", "Gaza", "Gaza Strip"]) assert.equal(ps.aliases.includes(rejected), false);
const kp = countryByCode.get("KP");
for (const alias of ["Democratic People's Republic of Korea", "Democratic People’s Republic of Korea", "DPRK"]) assert.equal(kp.aliases.includes(alias), true);
assert.equal(kp.aliases.includes("Korea"), false);

const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
assert.equal(catalogs.countries.every((country) => !(country.aliases || []).some((alias) => alias.toLocaleLowerCase("en-US") === country.code.toLocaleLowerCase("en-US"))), true);
function assertCountry(query, expectedCode, expectedQid) {
  const intent = parseSearchIntent(`${query} 7 days`, { catalogs, timeIntentEnabled: true });
  assert.deepEqual(intent.explicitCountryCodes, [expectedCode], `${query}: exact Country code`);
  const country = catalogs.countries.find((entry) => entry.code === expectedCode);
  assert.equal(country.wikidataId, expectedQid, `${query}: stable Country identity`);
}
for (const [query, code, qid] of [
  ["Vatican City", "VA", "Q237"], ["Vatican City State", "VA", "Q237"],
  ["State of Palestine", "PS", "Q219060"], ["Palestine", "PS", "Q219060"],
  ["North Korea", "KP", "Q423"], ["DPRK", "KP", "Q423"],
  ["Democratic People's Republic of Korea", "KP", "Q423"], ["Democratic People’s Republic of Korea", "KP", "Q423"],
  ["Republic of Korea", "KR", "Q884"], ["South Korea", "KR", "Q884"],
]) assertCountry(query, code, qid);

for (const [query, rejectedCode] of [
  ["Holy See", "VA"], ["West Bank", "PS"], ["Gaza", "PS"], ["Gaza Strip", "PS"],
  ["Palestinian Territories", "PS"], ["Palestinian Territory", "PS"], ["Korea", "KP"],
  ["Paris to London", "TO"], ["St Paul", "ST"],
]) {
  const intent = parseSearchIntent(`${query} 7 days`, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.explicitCountryCodes.includes(rejectedCode), false, `${query}: must not gain ${rejectedCode} Country alias authority`);
}

for (const historicalPath of [
  "data/knowledge/reports/knowledge-expansion-batch09-baseline.json",
  "data/knowledge/reports/sovereign-expansion-wave1.json",
  "data/knowledge/reports/sovereign-expansion-wave2.json",
  "data/knowledge/reports/sovereign-expansion-wave3.json",
  "data/knowledge/reports/sovereign-expansion-wave4.json",
]) {
  const baseline = JSON.parse(childProcess.execFileSync("git", ["show", `a0ffa940ee82af52ec87ab89ca2c73ca354d7236:${historicalPath}`], { cwd: ROOT, encoding: "utf8" }));
  assert.deepEqual(json(historicalPath), baseline, `${historicalPath} must remain sealed`);
}
assert.equal(report.historical.historicalQuarantine, 1416);
assert.equal(report.performance.realQualificationExecutions, 0);
assert.equal(report.performance.formalExperimentExecutions, 1);
assert.equal(report.performance.formalRun34622976529, "BLOCKED_INCONCLUSIVE");
assert.equal(report.performance.clearance, "NOT_CLEARED");

console.log(JSON.stringify({ verifier: "sovereign-special-review", status: "PASS", published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, countries: CODES, readiness: READINESS }, null, 2));
