import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateKnowledgeCityEntity } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntity } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { createTypedEntityId } from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import {
  semanticFactFromWikidataEntity,
  validatePublishedKnowledgeSemantics as validatePublishedKnowledgeSemanticsRaw,
} from "../src/lib/routes/knowledge-semantic-gate.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_ROOT = path.join(ROOT, "data/knowledge/raw");
const CORRECTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/production-integrity-corrections.json");
const EXCEPTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-exceptions.json");
const TYPE_POLICY_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-type-policy.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function semanticFacts() {
  const facts = new Map();
  for (const name of fs.readdirSync(RAW_ROOT).filter((entry) => entry.endsWith(".wikidata.json")).sort()) {
    const raw = readJson(path.join(RAW_ROOT, name));
    const source = { sourcePath: `data/knowledge/raw/${name}`, retrievedAt: raw.retrievedAt };
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      if (/^Q\d+$/u.test(String(value.id || "")) && value.labels && value.claims) {
        const fact = semanticFactFromWikidataEntity(value, source);
        if (fact) facts.set(fact.qid, fact);
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(raw);

    for (const binding of raw.wikidata?.results?.bindings || []) {
      const qid = String(binding.country?.value || "").match(/Q\d+$/u)?.[0];
      if (!qid) continue;
      const point = String(binding.coordinate?.value || "").match(/Point\(([-\d.]+)\s+([-\d.]+)\)/u);
      facts.set(qid, {
        qid,
        labels: Object.entries(binding)
          .filter(([key]) => /country(?:Label|Alias)/u.test(key))
          .map(([, item]) => item?.value)
          .filter(Boolean),
        semanticClass: "country",
        instanceOfIds: ["Q6256"],
        countryQids: [],
        coordinates: point ? { latitude: Number(point[2]), longitude: Number(point[1]) } : null,
        ...source,
      });
    }
  }
  const corrections = readJson(CORRECTIONS_PATH);
  for (const [qid, fact] of Object.entries(corrections.entities || {})) {
    facts.set(qid, { ...facts.get(qid), ...fact, qid, retrievedAt: corrections.retrievedAt });
  }
  return facts;
}

function violationCodes(result) {
  return new Set(result.violations.map((entry) => entry.code));
}

let negativeFixturesKilled = 0;
function assertKilled(label, result, expectedCode) {
  assert.equal(result.accepted, false, `${label}: mutation must be rejected`);
  assert(violationCodes(result).has(expectedCode), `${label}: expected ${expectedCode}; ${JSON.stringify(result.violations)}`);
  negativeFixturesKilled += 1;
}

function assertAccepted(label, result) {
  assert.equal(result.accepted, true, `${label}: expected acceptance; ${JSON.stringify(result.violations)}`);
}

function semanticExceptionId(entry) {
  const scope = {
    qid: String(entry.qid || "").trim().toUpperCase(),
    entityId: String(entry.entityId || "").trim(),
    kind: String(entry.kind || "").trim().toLowerCase(),
    parentEntityId: String(entry.parentEntityId || "").trim(),
    expectedCountryQid: String(entry.expectedCountryQid || "").trim().toUpperCase(),
    code: String(entry.code || "").trim(),
  };
  return `knowledge-semantic-exception-${stableHash(scope).slice(0, 16)}`;
}

const typePolicy = readJson(TYPE_POLICY_PATH);
function validatePublishedKnowledgeSemantics(options = {}) {
  return validatePublishedKnowledgeSemanticsRaw({ typePolicy, ...options });
}

const repository = createPublishedKnowledgeEntityLayerRepository();
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const facts = semanticFacts();
const exceptionDocument = readJson(EXCEPTIONS_PATH);
const exceptions = exceptionDocument.exceptions || [];

const production = validatePublishedKnowledgeSemantics({ countries, cities, pois, factsByQid: facts, exceptionDocument });
assert.equal(production.accepted, true, JSON.stringify(production.violations, null, 2));
assert.equal(production.checked, countries.length + cities.length + pois.length, "all published entities must be checked");
assert.equal(production.exceptionCount, 15, "all 15 semantic exceptions must be valid");
assert.equal(production.usedExceptionCount, 15, "all 15 semantic exceptions must be consumed");

const nara = cities.find((entity) => entity.wikidataId === "Q169134");
const japan = countries.find((entity) => entity.wikidataId === "Q17");
const germany = countries.find((entity) => entity.wikidataId === "Q183");
const churchOfTheHolySpirit = pois.find((entity) => entity.wikidataId === "Q574702");
const heidelberg = cities.find((entity) => entity.entityId === churchOfTheHolySpirit?.parentCityEntityId);
const linz = cities.find((entity) => entity.wikidataId === "Q41329");
const linzPalace = pois.find((entity) => entity.wikidataId === "Q686508");
const singaporeCountry = countries.find((entity) => entity.wikidataId === "Q334");
const singaporeCity = cities.find((entity) => entity.wikidataId === "Q334");
const netherlands = countries.find((entity) => entity.wikidataId === "Q55");
const panoramaMesdag = pois.find((entity) => entity.wikidataId === "Q110996824");
const alternateNetherlandsCity = cities.find((entity) => (
  entity.parentCountryEntityId === netherlands?.entityId
  && entity.entityId !== panoramaMesdag?.parentCityEntityId
));
assert(
  nara && japan && germany && churchOfTheHolySpirit && heidelberg && linz && linzPalace && singaporeCountry && singaporeCity
  && netherlands && panoramaMesdag && alternateNetherlandsCity,
  "semantic regression anchors must exist",
);

const churchAsCity = {
  ...nara,
  entityId: createTypedEntityId({ entityType: "city", wikidataId: churchOfTheHolySpirit.wikidataId }),
  parentCountryEntityId: germany.entityId,
  wikidataId: churchOfTheHolySpirit.wikidataId,
  canonicalNameZh: churchOfTheHolySpirit.canonicalNameZh,
  canonicalNameEn: churchOfTheHolySpirit.canonicalNameEn,
  aliases: churchOfTheHolySpirit.aliases,
  coordinates: churchOfTheHolySpirit.coordinates,
};
churchAsCity.provenance = Object.fromEntries(Object.entries(nara.provenance).map(([field, entry]) => [
  field,
  {
    ...entry,
    sourceUrl: `https://www.wikidata.org/wiki/${churchOfTheHolySpirit.wikidataId}`,
    value: churchAsCity[field],
  },
]));
assert.equal(validateKnowledgeCityEntity(churchAsCity).accepted, true, "adversarial church fixture must be schema-valid");
assertKilled("church-published-as-city", validatePublishedKnowledgeSemantics({
  countries: [germany], cities: [churchAsCity], factsByQid: facts,
}), "instance-type-not-allowed");

assertAccepted("legal-city-positive-type", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: facts,
}));
assertAccepted("legal-poi-positive-type-subclass", validatePublishedKnowledgeSemantics({
  countries: [germany], cities: [heidelberg], pois: [churchOfTheHolySpirit], factsByQid: facts,
}));

assertKilled("country-published-as-city", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), semanticClass: "city", instanceOfIds: ["Q6256"],
  }),
}), "instance-type-not-allowed");

const naraAsPoi = {
  ...linzPalace,
  entityId: createTypedEntityId({ entityType: "poi", wikidataId: nara.wikidataId }),
  parentCityEntityId: nara.entityId,
  wikidataId: nara.wikidataId,
  canonicalNameZh: nara.canonicalNameZh,
  canonicalNameEn: nara.canonicalNameEn,
  aliases: nara.aliases,
  coordinates: nara.coordinates,
};
naraAsPoi.provenance = Object.fromEntries(Object.entries(linzPalace.provenance).map(([field, entry]) => [
  field,
  {
    ...entry,
    sourceUrl: `https://www.wikidata.org/wiki/${nara.wikidataId}`,
    value: naraAsPoi[field],
  },
]));
assert.equal(validateKnowledgePoiEntity(naraAsPoi).accepted, true, "adversarial City-as-POI fixture must be schema-valid");
assertKilled("city-published-as-poi", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], pois: [naraAsPoi], factsByQid: facts,
}), "instance-type-not-allowed");

assertKilled("unknown-instance-type-fails-closed", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), instanceOfIds: ["Q999999999999"],
  }),
}), "instance-type-not-allowed");

assertKilled("nonexistent-qid", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [{ ...nara, wikidataId: "Q999999999999" }], factsByQid: facts,
}), "qid-not-in-semantic-snapshot");

assertKilled("island-published-as-city", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), semanticClass: "city", instanceOfIds: ["Q23442"],
  }),
}), "instance-type-not-allowed");

assertKilled("wrong-country", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), countryQids: ["Q142"],
  }),
}), "country-claim-mismatch");

assertKilled("wrong-coordinate", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), coordinates: { latitude: 49.131944444444, longitude: 6.839166666667 },
  }),
}), "semantic-coordinate-mismatch");

assertKilled("wrong-label", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), labels: ["Béning-lès-Saint-Avold"],
  }),
}), "canonical-name-mismatch");

assertKilled("missing-instance-type", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), instanceOfIds: [],
  }),
}), "instance-type-missing");

assertKilled("missing-country-claim", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), countryQids: [],
  }),
}), "country-claim-missing");

assertKilled("poi-far-from-parent", validatePublishedKnowledgeSemantics({
  countries: [countries.find((entity) => entity.wikidataId === "Q40")],
  cities: [linz],
  pois: [{ ...linzPalace, coordinates: { latitude: 50.566006, longitude: 7.278684 } }],
  factsByQid: facts,
}), "poi-parent-distance-implausible");

assertKilled("exception-scope-cannot-authorize-poi", validatePublishedKnowledgeSemantics({
  countries: [singaporeCountry],
  cities: [singaporeCity],
  pois: [{
    ...linzPalace,
    entityId: "poi-adversarial-singapore-city-state",
    wikidataId: "Q334",
    parentCityEntityId: singaporeCity.entityId,
    canonicalNameEn: "Singapore",
    canonicalNameZh: singaporeCity.canonicalNameZh,
    aliases: singaporeCity.aliases,
    coordinates: singaporeCity.coordinates,
  }],
  factsByQid: facts,
  exceptions,
}), "instance-type-not-allowed");

assertKilled("exception-scope-cannot-survive-reparent", validatePublishedKnowledgeSemantics({
  countries: [netherlands],
  cities: [alternateNetherlandsCity],
  pois: [{ ...panoramaMesdag, parentCityEntityId: alternateNetherlandsCity.entityId }],
  factsByQid: facts,
  exceptions,
}), "country-claim-missing");

assert.equal(exceptions.length, 15, "the active exception set must remain explicit");
assert.equal(new Set(exceptions.map((entry) => entry.exceptionId)).size, 15, "exception IDs must be unique");
for (const entry of exceptions) {
  assert.equal(entry.exceptionId, semanticExceptionId(entry), `${entry.qid}:${entry.code} must use its stable scope ID`);
  assert.equal(entry.exceptionType, entry.code, `${entry.exceptionId} must declare its exception type`);
  assert(entry.sourceUrl || entry.sourcePath, `${entry.exceptionId} must have an audit source`);
  if (entry.sourceUrl) assert.equal(entry.sourceUrl, `https://www.wikidata.org/wiki/${entry.qid}`);
  if (entry.sourcePath) assert(fs.existsSync(path.join(ROOT, entry.sourcePath)), `${entry.exceptionId} sourcePath must exist`);
  assert.equal(entry.reviewStatus, "approved");
  assert(Number.isInteger(entry.reviewVersion) && entry.reviewVersion >= 1);
  assert(!Number.isNaN(Date.parse(entry.reviewedAt)));
}

function mutatedExceptionDocument(mutator) {
  const document = structuredClone(exceptionDocument);
  mutator(document.exceptions);
  return document;
}

function validateExceptionMutation(mutator) {
  return validatePublishedKnowledgeSemantics({
    countries,
    cities,
    pois,
    factsByQid: facts,
    exceptionDocument: mutatedExceptionDocument(mutator),
  });
}

assertKilled("exception-source-required", validateExceptionMutation((entries) => {
  delete entries[0].sourceUrl;
  delete entries[0].sourcePath;
}), "exception-source-missing");

assertKilled("duplicate-exception-rejected", validateExceptionMutation((entries) => {
  entries.push(structuredClone(entries[0]));
}), "exception-id-duplicate");

assertKilled("incomplete-exception-scope-rejected", validateExceptionMutation((entries) => {
  entries[0].parentEntityId = "";
}), "exception-parent-scope-invalid");

assertKilled("exception-cannot-change-entity", validateExceptionMutation((entries) => {
  entries[0].entityId = nara.entityId;
}), "exception-entity-scope-invalid");

assertKilled("exception-cannot-change-parent", validateExceptionMutation((entries) => {
  entries[2].parentEntityId = alternateNetherlandsCity.entityId;
}), "exception-parent-scope-invalid");

assertKilled("exception-cannot-change-country", validateExceptionMutation((entries) => {
  entries[2].expectedCountryQid = "Q183";
}), "exception-country-scope-invalid");

assertKilled("unused-exception-rejected", validateExceptionMutation((entries) => {
  const unused = {
    qid: nara.wikidataId,
    entityId: nara.entityId,
    kind: "city",
    parentEntityId: nara.parentCountryEntityId,
    expectedCountryQid: japan.wikidataId,
    code: "canonical-name-mismatch",
    exceptionType: "canonical-name-mismatch",
    reason: "Negative fixture: a valid declaration for a violation that does not exist must be reported unused.",
    sourceUrl: `https://www.wikidata.org/wiki/${nara.wikidataId}`,
    reviewStatus: "approved",
    reviewVersion: 1,
    reviewedAt: "2026-08-11T00:00:00.000Z",
  };
  unused.exceptionId = semanticExceptionId(unused);
  entries.push(unused);
}), "exception-unused");

assertKilled("subclass-depth-policy-fails-closed", validatePublishedKnowledgeSemantics({
  countries: [japan],
  cities: [nara],
  factsByQid: facts,
  typePolicy: { ...typePolicy, maximumSubclassDepth: 9 },
}), "type-policy-subclass-depth-invalid");

assert.equal(
  validateKnowledgeCityEntity({ ...nara, entityId: "city-0000000000000000" }).accepted,
  false,
  "unapproved city identity drift must fail schema validation",
);
assert.equal(
  validateKnowledgePoiEntity({ ...linzPalace, entityId: "poi-0000000000000000" }).accepted,
  false,
  "unapproved POI identity drift must fail schema validation",
);

for (const [label, badEntity, kind, expectedCode] of [
  ["historical-nara-qid", { ...nara, wikidataId: "Q22150" }, "city", "canonical-name-mismatch"],
  ["historical-miyajima-island", { ...nara, wikidataId: "Q875301", canonicalNameEn: "Miyajima", canonicalNameZh: "宫岛" }, "city", "instance-type-not-allowed"],
  ["historical-linz-castle", { ...linzPalace, wikidataId: "Q1012988", canonicalNameEn: "Linz Castle", canonicalNameZh: "Linz Castle" }, "poi", "country-claim-mismatch"],
]) {
  const result = validatePublishedKnowledgeSemantics({
    countries: kind === "city" ? [japan] : [countries.find((entity) => entity.wikidataId === "Q40")],
    cities: kind === "city" ? [badEntity] : [linz],
    pois: kind === "poi" ? [badEntity] : [],
    factsByQid: facts,
  });
  assertKilled(label, result, expectedCode);
}

console.log(JSON.stringify({
  verifier: "knowledge-semantic-gate",
  passed: true,
  checkedPublishedEntities: production.checked,
  semanticFacts: production.factCount,
  explicitExceptions: production.exceptionCount,
  semanticTypePolicy: {
    maximumSubclassDepth: typePolicy.maximumSubclassDepth,
    roots: {
      city: typePolicy.roots.city.length,
      poi: typePolicy.roots.poi.length,
    },
    classifiedTypes: Object.keys(typePolicy.typeClassifications).length,
    graphNodes: production.typePolicyNodeCount,
    compositeAllowances: production.compositeAllowanceCount,
  },
  usedExceptions: production.usedExceptionCount,
  negativeFixturesKilled,
}, null, 2));
