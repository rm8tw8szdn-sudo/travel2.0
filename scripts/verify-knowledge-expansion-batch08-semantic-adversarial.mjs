import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  parseSearchIntent,
} from "../src/lib/routes/index.mjs";
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
  const sourcePath = `data/knowledge/raw/knowledge-expansion-batch08-wave${wave}.wikidata.json`;
  const raw = readJson(sourcePath);
  visit(raw, { sourcePath, retrievedAt: raw.retrievedAt });
}

const armenia = countries.find((record) => record.isoAlpha2 === "AM");
const azerbaijan = countries.find((record) => record.isoAlpha2 === "AZ");
const armeniaCity = cities.find((record) => record.parentCountryEntityId === armenia?.entityId);
const azerbaijanCity = cities.find((record) => record.parentCountryEntityId === azerbaijan?.entityId);
const armeniaPoi = pois.find((record) => record.parentCityEntityId === armeniaCity?.entityId);
assert(armenia && azerbaijan && armeniaCity && azerbaijanCity && armeniaPoi, "Batch 08 semantic anchors must exist");
assert(facts.has(armenia.wikidataId) && facts.has(armeniaCity.wikidataId) && facts.has(armeniaPoi.wikidataId), "Batch 08 raw semantic facts must exist");

function validate({ countries: inputCountries = [armenia], cities: inputCities = [armeniaCity], pois: inputPois = [armeniaPoi], factsByQid = facts } = {}) {
  return validatePublishedKnowledgeSemantics({
    countries: inputCountries,
    cities: inputCities,
    pois: inputPois,
    factsByQid,
    typePolicy,
    exceptionDocument: emptyExceptions,
  });
}

function codes(result) {
  return new Set(result.violations.map((record) => record.code));
}

const legal = validate();
assert.equal(legal.accepted, true, JSON.stringify(legal.violations));
let mutationsKilled = 0;
function kill(label, input, expectedCodes) {
  const result = validate(input);
  assert.equal(result.accepted, false, `${label}: must fail closed`);
  assert(expectedCodes.some((code) => codes(result).has(code)), `${label}: ${JSON.stringify(result.violations)}`);
  mutationsKilled += 1;
}

const cityFact = facts.get(armeniaCity.wikidataId);
const poiFact = facts.get(armeniaPoi.wikidataId);
kill("Country type as City", { factsByQid: new Map(facts).set(armeniaCity.wikidataId, { ...cityFact, instanceOfIds: ["Q6256"] }) }, ["instance-type-not-allowed"]);
kill("Island type as City", { factsByQid: new Map(facts).set(armeniaCity.wikidataId, { ...cityFact, instanceOfIds: ["Q23442"] }) }, ["instance-type-not-allowed"]);
kill("Unknown type chain as City", { factsByQid: new Map(facts).set(armeniaCity.wikidataId, { ...cityFact, instanceOfIds: ["Q999999999999"] }) }, ["instance-type-not-allowed"]);
kill("Wrong Country claim on City", { factsByQid: new Map(facts).set(armeniaCity.wikidataId, { ...cityFact, countryQids: [azerbaijan.wikidataId] }) }, ["country-claim-mismatch"]);
kill("Wrong City coordinate", { cities: [{ ...armeniaCity, coordinates: azerbaijanCity.coordinates }] }, ["semantic-coordinate-mismatch"]);
kill("City type as POI", { factsByQid: new Map(facts).set(armeniaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q515"] }) }, ["instance-type-not-allowed"]);
kill("Country type as POI", { factsByQid: new Map(facts).set(armeniaPoi.wikidataId, { ...poiFact, instanceOfIds: ["Q6256"] }) }, ["instance-type-not-allowed"]);
kill("Wrong Country claim on POI", { factsByQid: new Map(facts).set(armeniaPoi.wikidataId, { ...poiFact, countryQids: [azerbaijan.wikidataId] }) }, ["country-claim-mismatch"]);
kill("Wrong parent Country on POI", { countries: [armenia, azerbaijan], cities: [armeniaCity, azerbaijanCity], pois: [{ ...armeniaPoi, parentCityEntityId: azerbaijanCity.entityId }] }, ["country-claim-mismatch"]);
kill("Country QID published as POI", { pois: [{ ...armeniaPoi, wikidataId: armenia.wikidataId }] }, ["country-published-as-poi"]);
kill("Missing canonical semantic fact", { factsByQid: new Map([...facts].filter(([qid]) => qid !== armeniaPoi.wikidataId)) }, ["qid-not-in-semantic-snapshot"]);

const intentCatalog = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
const ambiguous = parseSearchIntent("Lyon 7 days", { catalogs: intentCatalog, timeIntentEnabled: true });
assert.equal(ambiguous.parseSuccess, false, "Batch 08 homonym must fail closed without Country");
assert(ambiguous.destinationDiagnostics.some((record) => record.code === "ambiguous-city-alias"));
const qualified = parseSearchIntent("Lyon Nicaragua 7 days", { catalogs: intentCatalog, timeIntentEnabled: true });
assert.equal(qualified.parseSuccess, true);
assert.deepEqual(qualified.explicitCountryCodes, ["NI"]);
assert.deepEqual(qualified.requiredDestinationIds, ["Q208151"]);

const countryQids = new Set(countries.map((record) => record.wikidataId));
const batchPois = [26, 27, 28, 29].flatMap((batch) => readJson(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
assert.equal(batchPois.some((record) => countryQids.has(record.wikidataId)), false, "no Country QID may leak into Batch 08 POIs");
const reviews = [1, 2, 3, 4].flatMap((wave) => readJson(`data/knowledge/batches/review-queue.knowledge-expansion-batch08-wave${wave}.json`).entries);
const countryAsPoiQuarantine = reviews.filter((record) => record.reasonCodes?.includes("country-not-published-as-poi"));
assert(countryAsPoiQuarantine.length >= 20, "Country-as-POI candidates must be quarantined across the Batch 08 target set");
assert.equal(countryAsPoiQuarantine.every((record) => !batchPois.some((poi) => poi.wikidataId === record.wikidataId && poi.parentCityEntityId === record.parentCityEntityId)), true);

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch08-semantic-adversarial",
  status: "PASS",
  productionSubsetChecked: legal.checked,
  mutationsKilled,
  homonymCases: 2,
  countryAsPoiCandidatesQuarantined: countryAsPoiQuarantine.length,
  publishedCountryQidsAsPois: 0,
}, null, 2));
