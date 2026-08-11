import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import { validateKnowledgeCityEntity } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntity } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import {
  semanticFactFromWikidataEntity,
  validatePublishedKnowledgeSemantics,
} from "../src/lib/routes/knowledge-semantic-gate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_ROOT = path.join(ROOT, "data/knowledge/raw");
const CORRECTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/production-integrity-corrections.json");
const EXCEPTIONS_PATH = path.join(ROOT, "data/knowledge/semantic/knowledge-semantic-exceptions.json");

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

function assertKilled(label, result, expectedCode) {
  assert.equal(result.accepted, false, `${label}: mutation must be rejected`);
  assert(violationCodes(result).has(expectedCode), `${label}: expected ${expectedCode}; ${JSON.stringify(result.violations)}`);
}

const repository = createPublishedKnowledgeEntityLayerRepository();
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const facts = semanticFacts();
const exceptions = readJson(EXCEPTIONS_PATH).exceptions || [];

const production = validatePublishedKnowledgeSemantics({ countries, cities, pois, factsByQid: facts, exceptions });
assert.equal(production.accepted, true, JSON.stringify(production.violations, null, 2));
assert.equal(production.checked, 1099, "all published entities must be checked");

const nara = cities.find((entity) => entity.wikidataId === "Q169134");
const japan = countries.find((entity) => entity.wikidataId === "Q17");
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
  nara && japan && linz && linzPalace && singaporeCountry && singaporeCity
  && netherlands && panoramaMesdag && alternateNetherlandsCity,
  "semantic regression anchors must exist",
);

assertKilled("nonexistent-qid", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [{ ...nara, wikidataId: "Q999999999999" }], factsByQid: facts,
}), "qid-not-in-semantic-snapshot");

assertKilled("island-published-as-city", validatePublishedKnowledgeSemantics({
  countries: [japan], cities: [nara], factsByQid: new Map(facts).set("Q169134", {
    ...facts.get("Q169134"), semanticClass: "city", instanceOfIds: ["Q23442"],
  }),
}), "instance-type-incompatible");

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
}), "instance-type-incompatible");

assertKilled("exception-scope-cannot-survive-reparent", validatePublishedKnowledgeSemantics({
  countries: [netherlands],
  cities: [alternateNetherlandsCity],
  pois: [{ ...panoramaMesdag, parentCityEntityId: alternateNetherlandsCity.entityId }],
  factsByQid: facts,
  exceptions,
}), "country-claim-missing");

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
  ["historical-miyajima-island", { ...nara, wikidataId: "Q875301", canonicalNameEn: "Miyajima", canonicalNameZh: "宫岛" }, "city", "instance-type-incompatible"],
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
  negativeFixturesKilled: 15,
}, null, 2));
