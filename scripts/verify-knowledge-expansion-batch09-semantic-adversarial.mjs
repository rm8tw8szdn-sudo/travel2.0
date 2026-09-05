import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import {
  semanticFactFromWikidataEntity,
  validatePublishedKnowledgeSemantics,
} from "../src/lib/routes/knowledge-semantic-gate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const typePolicy = readJson("data/knowledge/semantic/knowledge-semantic-type-policy.json");
const emptyExceptions = { schemaVersion: "route-v2-knowledge-semantic-exceptions-v2", exceptions: [] };
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const facts = new Map();

function visit(value, source) {
  if (Array.isArray(value)) {
    value.forEach((entry) => visit(entry, source));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (/^Q\d+$/u.test(String(value.id || "")) && value.labels && value.claims) {
    const fact = semanticFactFromWikidataEntity(value, source);
    if (fact) facts.set(fact.qid, fact);
    return;
  }
  Object.values(value).forEach((entry) => visit(entry, source));
}

for (const wave of [1, 2, 3, 4]) {
  const sourcePath = `data/knowledge/raw/knowledge-expansion-batch09-wave${wave}.wikidata.json`;
  const raw = readJson(sourcePath);
  visit(raw, { sourcePath, retrievedAt: raw.retrievedAt });
}

const algeria = countries.find((record) => record.isoAlpha2 === "DZ");
const ghana = countries.find((record) => record.isoAlpha2 === "GH");
const algeriaCity = cities.find((record) => record.parentCountryEntityId === algeria?.entityId);
const ghanaCity = cities.find((record) => record.parentCountryEntityId === ghana?.entityId);
const algeriaPoi = pois.find((record) => record.parentCityEntityId === algeriaCity?.entityId);
assert(algeria && ghana && algeriaCity && ghanaCity && algeriaPoi, "Batch 09 semantic anchors must exist");
assert(facts.has(algeria.wikidataId) && facts.has(algeriaCity.wikidataId) && facts.has(algeriaPoi.wikidataId), "Batch 09 raw semantic facts must exist");

function validate({ countries: inputCountries = [algeria], cities: inputCities = [algeriaCity], pois: inputPois = [algeriaPoi], factsByQid = facts } = {}) {
  return validatePublishedKnowledgeSemantics({
    countries: inputCountries,
    cities: inputCities,
    pois: inputPois,
    factsByQid,
    typePolicy,
    exceptionDocument: emptyExceptions,
  });
}

const codes = (result) => new Set(result.violations.map((record) => record.code));
const legal = validate();
assert.equal(legal.accepted, true, JSON.stringify(legal.violations));
let mutationsKilled = 0;
function kill(label, input, expectedCodes) {
  const result = validate(input);
  assert.equal(result.accepted, false, `${label}: must fail closed`);
  assert(expectedCodes.some((code) => codes(result).has(code)), `${label}: ${JSON.stringify(result.violations)}`);
  mutationsKilled += 1;
}

const cityFact = facts.get(algeriaCity.wikidataId);
const poiFact = facts.get(algeriaPoi.wikidataId);
kill("Country type as City", { factsByQid: new Map(facts).set(algeriaCity.wikidataId, { ...cityFact, instanceOfIds: ["Q6256"] }) }, ["instance-type-not-allowed"]);
kill("Island type as City", { factsByQid: new Map(facts).set(algeriaCity.wikidataId, { ...cityFact, instanceOfIds: ["Q23442"] }) }, ["instance-type-not-allowed"]);
kill("Unknown type chain as City", { factsByQid: new Map(facts).set(algeriaCity.wikidataId, { ...cityFact, instanceOfIds: ["Q999999999999"] }) }, ["instance-type-not-allowed"]);
kill("Wrong Country claim on City", { factsByQid: new Map(facts).set(algeriaCity.wikidataId, { ...cityFact, countryQids: [ghana.wikidataId] }) }, ["country-claim-mismatch"]);
kill("Wrong City coordinate", { cities: [{ ...algeriaCity, coordinates: ghanaCity.coordinates }] }, ["semantic-coordinate-mismatch"]);
kill("Wrong POI coordinate", { pois: [{ ...algeriaPoi, coordinates: ghanaCity.coordinates }] }, ["semantic-coordinate-mismatch", "poi-parent-distance-exceeded"]);
kill("City type as POI", { factsByQid: new Map(facts).set(algeriaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q515"] }) }, ["instance-type-not-allowed"]);
kill("Country type as POI", { factsByQid: new Map(facts).set(algeriaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q6256"] }) }, ["instance-type-not-allowed"]);
kill("Prison as Core POI", { factsByQid: new Map(facts).set(algeriaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q40357"] }) }, ["instance-type-not-allowed"]);
kill("Detention facility as Core POI", { factsByQid: new Map(facts).set(algeriaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q40357"] }) }, ["instance-type-not-allowed"]);
kill("Generic building only as Core POI", { factsByQid: new Map(facts).set(algeriaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q41176"] }) }, ["instance-type-not-allowed"]);
const visitorBuilding = validate({
  factsByQid: new Map(facts).set(algeriaPoi.wikidataId, {
    ...poiFact,
    instanceOfIds: ["Q33506", "Q41176"],
  }),
});
assert.equal(visitorBuilding.accepted, true, `Museum building must remain eligible: ${JSON.stringify(visitorBuilding.violations)}`);
kill("Wrong Country claim on POI", { factsByQid: new Map(facts).set(algeriaPoi.wikidataId, { ...poiFact, countryQids: [ghana.wikidataId] }) }, ["country-claim-mismatch"]);
kill("Wrong parent Country on POI", { countries: [algeria, ghana], cities: [algeriaCity, ghanaCity], pois: [{ ...algeriaPoi, parentCityEntityId: ghanaCity.entityId }] }, ["country-claim-mismatch"]);
kill("Country QID published as POI", { pois: [{ ...algeriaPoi, wikidataId: algeria.wikidataId }] }, ["country-published-as-poi"]);
kill("Missing canonical semantic fact", { factsByQid: new Map([...facts].filter(([qid]) => qid !== algeriaPoi.wikidataId)) }, ["qid-not-in-semantic-snapshot"]);

const countryQids = new Set(countries.map((record) => record.wikidataId));
const batchPois = [30, 31, 32, 33].flatMap((batch) => readJson(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
assert.equal(batchPois.some((record) => countryQids.has(record.wikidataId)), false, "no Country QID may leak into Batch 09 POIs");
const reviews = [1, 2, 3, 4].flatMap((wave) => readJson(`data/knowledge/batches/review-queue.knowledge-expansion-batch09-wave${wave}.json`).entries);
const countryAsPoiQuarantine = reviews.filter((record) => record.reasonCodes?.includes("country-not-published-as-poi"));
assert(countryAsPoiQuarantine.length >= 20, "Country-as-POI candidates must be quarantined across the Batch 09 target set");
assert.equal(countryAsPoiQuarantine.every((record) => !batchPois.some((poi) => poi.wikidataId === record.wikidataId && poi.parentCityEntityId === record.parentCityEntityId)), true);
const productionTypeQuarantine = reviews.filter((record) => record.reasonCodes?.some((code) => code.startsWith("production-")));
assert(productionTypeQuarantine.length > 0, "unreviewed production type chains must remain quarantined");

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch09-semantic-adversarial",
  status: "PASS",
  productionSubsetChecked: legal.checked,
  mutationsKilled,
  countryAsPoiCandidatesQuarantined: countryAsPoiQuarantine.length,
  productionTypeCandidatesQuarantined: productionTypeQuarantine.length,
  publishedCountryQidsAsPois: 0,
}, null, 2));
