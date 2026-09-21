import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createKnowledgeCoverageSemantics } from "../src/lib/routes/knowledge-coverage-semantics.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { createPublishedKnowledgeEntityLayerRepository, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS, KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { createKnowledgeEntityLayerSearchIntentCatalog, parseSearchIntent } from "../src/lib/routes/index.mjs";
import { getAuthoritativeKnowledgeReadiness } from "../src/lib/routes/knowledge-readiness-authority.mjs";
import { createRouteSearchService } from "../src/lib/routes/route-search-service.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const jsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const FINAL_CODES = Object.freeze(["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "SZ", "TL", "TT", "UG"]);
const NEW_CODES = Object.freeze(["AO", "BJ", "BY", "CI", "CM", "MZ", "SZ", "TL"]);
const AFFECTED_DISPOSITION_QIDS = Object.freeze(["Q815650", "Q21870703", "Q609946", "Q6970423", "Q6974145", "Q112031", "Q7056504", "Q7190503", "Q7337452", "Q3018552", "Q625912", "Q17509679", "Q4151227", "Q18354333", "Q5045524", "Q5594671", "Q618252", "Q22082371", "Q122933018"]);
const citiesAsset = json("data/knowledge/batches/cities.p1b-batch51.json");
const poisAsset = json("data/knowledge/batches/pois.p1b-batch51.json");
const quarantine = json("data/knowledge/batches/review-queue.plannable-expansion-batch02.json");
const discovery = json("data/knowledge/reports/plannable-expansion-batch02-discovery.json");
const report = json("data/knowledge/reports/plannable-expansion-batch02-entity-review.json");

assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, { countries: 195, cities: 890, pois: 4159, total: 5244 });
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.at(-1), "data/knowledge/batches/cities.p1b-batch51.json");
assert.equal(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.at(-1), "data/knowledge/batches/pois.p1b-batch51.json");
assert.deepEqual(validateKnowledgeCityEntitySet(citiesAsset.cities), { accepted: true, reasons: [] });
assert.deepEqual(validateKnowledgePoiEntitySet(poisAsset.pois), { accepted: true, reasons: [] });
assert.equal(citiesAsset.cities.length, 24);
assert.equal(poisAsset.pois.length, 88);
assert.equal(quarantine.reviewCount, 33);
assert.equal(quarantine.reviews.length, 33);
assert.equal(discovery.inventory.length, 73);
assert.deepEqual(discovery.selection.final, FINAL_CODES);
assert.deepEqual(report.selection.final, FINAL_CODES);
assert.deepEqual(report.selection.initial, ["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "PG", "SZ", "TT", "UG"]);
assert.deepEqual(report.selection.replacements, [{ removed: "PG", added: "TL", reason: "PG failed per-destination POI sufficiency after region/river candidates were excluded" }]);

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryById = new Map(countries.map((country) => [country.entityId, country]));
const cityById = new Map(cities.map((city) => [city.entityId, city]));
const entityIds = [...countries, ...cities, ...pois].map((entity) => entity.entityId);
assert.equal(new Set(entityIds).size, entityIds.length);
for (const entities of [countries, cities, pois]) assert.equal(new Set(entities.map((entry) => entry.wikidataId)).size, entities.length);
const batchCodes = [...new Set(citiesAsset.cities.map((city) => countryById.get(city.parentCountryEntityId)?.isoAlpha2))].sort();
assert.deepEqual(batchCodes, [...NEW_CODES].sort());
assert.equal(poisAsset.pois.every((poi) => cityById.has(poi.parentCityEntityId)), true);

function reviewedCandidatePoiUniverse() {
  const batchDirectory = path.join(ROOT, "data/knowledge/batches");
  const names = fs.readdirSync(batchDirectory);
  const cityOccurrences = new Map();
  for (const name of names.filter((entry) => /^cities\.p1b-batch\d+\.json$/u.test(entry) && entry !== "cities.p1b-batch51.json")) {
    for (const city of json(`data/knowledge/batches/${name}`).cities) {
      const current = cityOccurrences.get(city.entityId) || [];
      current.push({ file: `data/knowledge/batches/${name}`, entity: city });
      cityOccurrences.set(city.entityId, current);
    }
  }
  const allCityById = new Map([...cityOccurrences].map(([entityId, occurrences]) => [entityId, occurrences.at(-1).entity]));
  const productionPoiFiles = new Set(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.filter((file) => !file.endsWith("pois.p1b-batch51.json")));
  const poiOccurrences = new Map();
  for (const name of names.filter((entry) => /^pois\.p1b-batch\d+\.json$/u.test(entry) && entry !== "pois.p1b-batch51.json")) {
    const file = `data/knowledge/batches/${name}`;
    for (const poi of json(file).pois) {
      const current = poiOccurrences.get(poi.entityId) || [];
      current.push({ file, entity: poi });
      poiOccurrences.set(poi.entityId, current);
    }
  }
  return [...poiOccurrences.values()].filter((occurrences) => {
    if (occurrences.some((entry) => productionPoiFiles.has(entry.file))) return false;
    const poi = occurrences.at(-1).entity;
    const city = allCityById.get(poi.parentCityEntityId);
    return FINAL_CODES.includes(countryById.get(city?.parentCountryEntityId)?.isoAlpha2);
  }).map((occurrences) => occurrences.at(-1).entity);
}

function assertPoiDispositionAccounting({ candidatePois, dispositions, productionPois, quarantineReviews }) {
  const allowed = new Set(["ADMITTED_NEW", "EXISTING_PRODUCTION_REUSED", "QUARANTINED_REJECTED"]);
  const candidateById = new Map(candidatePois.map((entry) => [entry.entityId, entry]));
  assert.equal(candidateById.size, candidatePois.length, "review candidate identities must be unique");
  const dispositionsById = new Map();
  for (const disposition of dispositions) {
    assert.equal(allowed.has(disposition.disposition), true, "unknown POI disposition");
    assert.equal(candidateById.has(disposition.candidateEntityId), true, "disposition must bind a reviewed candidate");
    const current = dispositionsById.get(disposition.candidateEntityId) || [];
    current.push(disposition);
    dispositionsById.set(disposition.candidateEntityId, current);
  }
  for (const candidate of candidatePois) assert.equal(dispositionsById.get(candidate.entityId)?.length, 1, `${candidate.entityId}: exactly one disposition required`);
  const productionById = new Map(productionPois.map((entry) => [entry.entityId, entry]));
  const productionByQid = new Map(productionPois.map((entry) => [entry.wikidataId, entry]));
  const quarantineById = new Map(quarantineReviews.map((entry) => [entry.entityId, entry]));
  for (const candidate of candidatePois) {
    const disposition = dispositionsById.get(candidate.entityId)[0];
    const production = productionById.get(candidate.entityId);
    const productionQid = productionByQid.get(candidate.wikidataId);
    const quarantined = quarantineById.get(candidate.entityId);
    if (disposition.disposition === "ADMITTED_NEW") {
      assert(production, `${candidate.entityId}: admitted candidate missing from production`);
      assert.equal(production.wikidataId, candidate.wikidataId);
      assert.equal(production.parentCityEntityId, candidate.parentCityEntityId);
      assert.equal(quarantined, undefined, `${candidate.entityId}: admitted candidate also quarantined`);
    } else if (disposition.disposition === "EXISTING_PRODUCTION_REUSED") {
      assert(production && productionQid, `${candidate.entityId}: false reused identity`);
      assert.equal(production.entityId, candidate.entityId);
      assert.equal(productionQid.entityId, candidate.entityId);
      assert.equal(production.parentCityEntityId, candidate.parentCityEntityId);
      assert.equal(quarantined, undefined);
    } else {
      assert(quarantined, `${candidate.entityId}: rejected candidate missing quarantine record`);
      assert.equal(production, undefined, `${candidate.entityId}: quarantined candidate leaked into production`);
      assert.equal(productionQid, undefined, `${candidate.wikidataId}: quarantined QID leaked into production`);
    }
  }
  assert.equal(dispositions.length, candidatePois.length, "reviewed/disposition total mismatch");
}

const reviewedCandidatePois = reviewedCandidatePoiUniverse();
assert.equal(reviewedCandidatePois.length, 121);
assert.doesNotThrow(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: report.poiDispositions, productionPois: pois, quarantineReviews: quarantine.reviews }));
const admittedDisposition = report.poiDispositions.find((entry) => entry.disposition === "ADMITTED_NEW");
const rejectedDisposition = report.poiDispositions.find((entry) => entry.disposition === "QUARANTINED_REJECTED");
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: report.poiDispositions.filter((entry) => entry !== admittedDisposition), productionPois: pois, quarantineReviews: quarantine.reviews }), /exactly one disposition|required|mismatch/u);
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: [...report.poiDispositions, { ...admittedDisposition, disposition: "QUARANTINED_REJECTED" }], productionPois: pois, quarantineReviews: quarantine.reviews }), /exactly one disposition/u);
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: report.poiDispositions.map((entry) => entry === rejectedDisposition ? { ...entry, disposition: "EXISTING_PRODUCTION_REUSED" } : entry), productionPois: pois, quarantineReviews: quarantine.reviews }), /false reused identity/u);
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: report.poiDispositions, productionPois: pois.filter((entry) => entry.entityId !== admittedDisposition.candidateEntityId), quarantineReviews: quarantine.reviews }), /missing from production/u);
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: report.poiDispositions.map((entry) => entry === admittedDisposition ? { ...entry, disposition: "QUARANTINED_REJECTED" } : entry), productionPois: pois, quarantineReviews: quarantine.reviews }), /missing quarantine record|leaked into production/u);
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: report.poiDispositions, productionPois: [...pois, reviewedCandidatePois.find((entry) => entry.entityId === rejectedDisposition.candidateEntityId)], quarantineReviews: quarantine.reviews }), /leaked into production/u);
const sameLengthWrongTotals = report.poiDispositions.filter((entry) => entry !== rejectedDisposition);
sameLengthWrongTotals.push(structuredClone(admittedDisposition));
assert.throws(() => assertPoiDispositionAccounting({ candidatePois: reviewedCandidatePois, dispositions: sameLengthWrongTotals, productionPois: pois, quarantineReviews: quarantine.reviews }), /exactly one disposition/u);

function assertAdmissionBoundary({ candidateCities, candidatePois }) {
  assert.deepEqual(validateKnowledgeCityEntitySet(candidateCities), { accepted: true, reasons: [] });
  assert.deepEqual(validateKnowledgePoiEntitySet(candidatePois), { accepted: true, reasons: [] });
  assert.equal(candidateCities.every((city) => NEW_CODES.includes(countryById.get(city.parentCountryEntityId)?.isoAlpha2)), true, "wrong Country binding");
  assert.equal(candidateCities.every((city) => city.entityType === "city"), true, "Region/Island may not impersonate City");
  assert.equal(candidatePois.every((poi) => candidateCities.some((city) => city.entityId === poi.parentCityEntityId) || cityById.has(poi.parentCityEntityId)), true, "wrong Destination binding");
  assert.equal(new Set(candidateCities.map((city) => city.entityId)).size, candidateCities.length, "duplicate City entity identity");
  assert.equal(new Set(candidateCities.map((city) => city.wikidataId)).size, candidateCities.length, "duplicate City QID");
  assert.equal(new Set(candidatePois.map((poi) => poi.entityId)).size, candidatePois.length, "duplicate POI entity identity");
  assert.equal(new Set(candidatePois.map((poi) => poi.wikidataId)).size, candidatePois.length, "duplicate POI QID");
}
function distanceKm(left, right) {
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(value));
}
assert.doesNotThrow(() => assertAdmissionBoundary({ candidateCities: citiesAsset.cities, candidatePois: poisAsset.pois }));
const admittedCityById = cityById;
assert.equal(poisAsset.pois.every((poi) => {
  const city = admittedCityById.get(poi.parentCityEntityId);
  const distance = distanceKm(city.coordinates, poi.coordinates);
  return Number.isFinite(distance) && distance <= 25;
}), true, "admitted POI must remain within the reviewed destination distance boundary");
const clonedCity = structuredClone(citiesAsset.cities[0]);
assert.throws(() => assertAdmissionBoundary({ candidateCities: [{ ...clonedCity, parentCountryEntityId: "country-0000000000000000" }], candidatePois: [] }), /wrong Country binding/u);
assert.throws(() => assertAdmissionBoundary({ candidateCities: [clonedCity, structuredClone(clonedCity)], candidatePois: [] }), /duplicate/u);
assert.throws(() => assertAdmissionBoundary({ candidateCities: [{ ...clonedCity, entityType: "region" }], candidatePois: [] }), /Region\/Island|entity-type-invalid/u);
const clonedPoi = structuredClone(poisAsset.pois[0]);
assert.throws(() => assertAdmissionBoundary({ candidateCities: [clonedCity], candidatePois: [{ ...clonedPoi, parentCityEntityId: "city-0000000000000000" }] }), /wrong Destination binding/u);
assert.throws(() => assertAdmissionBoundary({ candidateCities: [clonedCity], candidatePois: [clonedPoi, structuredClone(clonedPoi)] }), /duplicate/u);

const publishedIds = new Set(entityIds);
assert.equal(quarantine.reviews.every((entry) => entry.disposition === "candidate-quarantine-retained" && entry.reason && entry.sourceEntity?.provenance && !publishedIds.has(entry.entityId)), true);
const rejectedQids = new Set(quarantine.reviews.map((entry) => entry.wikidataId));
assert.equal(pois.every((poi) => !rejectedQids.has(poi.wikidataId)), true, "quarantine may not leak into production");
const pgCandidate = json("data/knowledge/batches/cities.p1b-batch37.json").cities.find((city) => city.wikidataId === "Q36526");
assert(pgCandidate, "PG candidate fixture");
assert.equal(cities.some((city) => city.entityId === pgCandidate.entityId), false, "candidate-only Destination may not leak into runtime");

const readiness = getAuthoritativeKnowledgeReadiness();
assert.deepEqual(readiness.expectedCounts, { plannable: 122, evidenceBacked: 119, catalogOnly: 73 });
assert.equal(FINAL_CODES.every((code) => readiness.catalogOnlyCountryCodes.includes(code) && readiness.evidencePendingCountryCodes.includes(code) && !readiness.plannableCountryCodes.includes(code) && !readiness.evidenceBackedCountryCodes.includes(code)), true);
const tamperedReport = structuredClone(report);
tamperedReport.countriesReviewed[0].plannable = true;
assert.equal(readiness.plannableCountryCodes.includes(tamperedReport.countriesReviewed[0].countryCode), false, "report cannot grant readiness");

const coverage = createKnowledgeCoverageSemantics({ countries, cities, pois, routeLegEvidence: jsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl"), seasonEvidence: jsonl("data/route-v2/evidence-seed/season-evidence.jsonl") });
assert.deepEqual({ catalog: coverage.catalogCountries, plannable: coverage.plannableCountries, evidenceBacked: coverage.evidenceBackedCountries, catalogOnly: coverage.countryOnlyCountries }, { catalog: 195, plannable: 122, evidenceBacked: 119, catalogOnly: 73 });

const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
for (const [query, code] of [["Luanda Angola", "AO"], ["Minsk Belarus", "BY"], ["Dili Timor-Leste", "TL"], ["Abidjan Ivory Coast", "CI"]]) {
  const intent = parseSearchIntent(`${query} 7 days`, { catalogs, timeIntentEnabled: true });
  assert.deepEqual(intent.explicitCountryCodes, [code], `${query}: contextual Country binding`);
}
const ambiguous = parseSearchIntent("Lagos 7 days", { catalogs, timeIntentEnabled: true });
assert.equal(ambiguous.requiredDestinationIds.length, 0, "same-name City without Country context must fail closed");
assert.equal(ambiguous.destinationDiagnostics.some((entry) => entry.code === "ambiguous-city-alias"), true);

let plannerCalls = 0;
const runtimeService = createRouteSearchService({
  acceptedRepository: { list: () => ({ records: [] }) },
  searchCache: { get: () => null, put: () => {} },
  planner: { buildCandidates: async () => { plannerCalls += 1; return { accepted: [], rejected: [] }; } },
  intentCatalog: catalogs,
  env: { ROUTE_V2_RUNTIME_ENABLED: "true", ROUTE_V2_INTENT_ENABLED: "true", ROUTE_V2_TIME_INTENT_ENABLED: "true", SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1", SEARCH_PLANNER_TIMEOUT_MS: "2000" },
});
for (const query of ["Angola 7 days", "Belarus 7 days", "Timor-Leste 7 days"]) await runtimeService.search({ query, limit: 3, sessionId: `batch02-${query}` });
assert.equal(plannerCalls, 0, "complete Entity foundation without Evidence/readiness must remain Catalog-only");

assert.deepEqual(report.after, { countries: 195, cities: 890, pois: 4159, totalEntities: 5244, plannable: 122, evidenceBacked: 119, catalogOnly: 73 });
assert.deepEqual(report.evidenceAdditions, { transport: 0, seasonMonth: 0, theme: 0 });
assert.equal(report.readinessPromotions, 0);
assert.equal(report.accidentalPromotions, 0);
assert.equal(report.candidateLeakage, "NONE");
assert.equal(report.countriesReviewed.every((entry) => !entry.validEvidence && !entry.plannable && !entry.evidenceBacked && entry.catalogOnly && entry.evidencePending), true);
assert.deepEqual(report.review, {
  candidateDestinationsReviewed: 24,
  destinationsAdmitted: 24,
  destinationsRejected: 0,
  candidatePoisReviewed: 121,
  poisAdmitted: 88,
  poisExistingProductionReused: 0,
  poisQuarantined: 33,
  poisUnaccounted: 0,
  poisMultiDisposition: 0,
  identityConflicts: 0,
  duplicateConflicts: 0,
  regionIslandConflicts: 20,
});
assert.equal(report.review.candidatePoisReviewed, report.review.poisAdmitted + report.review.poisExistingProductionReused + report.review.poisQuarantined);
const affectedDispositions = report.poiDispositions.filter((entry) => AFFECTED_DISPOSITION_QIDS.includes(entry.wikidataId));
assert.equal(affectedDispositions.length, 19);
assert.deepEqual(affectedDispositions.filter((entry) => ["Q5594671", "Q122933018"].includes(entry.wikidataId)).map((entry) => entry.disposition), ["ADMITTED_NEW", "ADMITTED_NEW"]);
assert.equal(affectedDispositions.filter((entry) => !["Q5594671", "Q122933018"].includes(entry.wikidataId)).every((entry) => entry.disposition === "QUARANTINED_REJECTED"), true);
assert.deepEqual(Object.fromEntries(FINAL_CODES.map((code) => [code, affectedDispositions.filter((entry) => entry.countryCode === code && entry.disposition === "QUARANTINED_REJECTED").length]).filter(([, count]) => count)), { BZ: 4, CV: 2, DM: 4, MN: 1, TT: 4, UG: 2 });
for (const entry of report.countriesReviewed) {
  const segmentKeys = entry.directedTransportSegmentUnits.map((segment) => `${segment.fromEntityId}->${segment.toEntityId}`);
  assert.equal(segmentKeys.every((key) => !/^(.+)->\1$/u.test(key)), true, `${entry.countryCode}: no self-loop Evidence work units`);
  assert.equal(new Set(segmentKeys).size, segmentKeys.length, `${entry.countryCode}: no duplicate Evidence work units`);
  assert.equal(new Set(entry.seasonMonthProfileUnits.map((unit) => unit.entityId)).size, entry.seasonMonthProfileUnits.length, `${entry.countryCode}: no duplicate season work units`);
}

console.log(JSON.stringify({
  verifier: "plannable-expansion-batch02-entity-foundation",
  status: "PASS",
  inventory: discovery.inventory.length,
  tiers: Object.fromEntries(Object.entries(discovery.tiers).map(([tier, codes]) => [tier, codes.length])),
  selected: FINAL_CODES,
  reviewed: { destinations: report.review.candidateDestinationsReviewed, pois: report.review.candidatePoisReviewed },
  admitted: { destinations: citiesAsset.cities.length, pois: poisAsset.pois.length },
  quarantined: quarantine.reviewCount,
  published: KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS,
  readiness: readiness.expectedCounts,
  negativeCases: 15,
  dispositionAccountingMutationsRejected: 7,
  candidateLeakage: "NONE",
}, null, 2));
