import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const readJsonl = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const writeJson = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const sorted = (values) => [...new Set(values)].sort();

const SEALED_MAIN = "eddf46512863c115b7f39e29d5f6c448d1ce6251";
const INITIAL_SELECTION = Object.freeze(["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "PG", "SZ", "TT", "UG"]);
const FINAL_SELECTION = Object.freeze(["AO", "BJ", "BY", "BZ", "CI", "CM", "CV", "DM", "MN", "MZ", "SZ", "TL", "TT", "UG"]);
const EXISTING_FOUNDATION = new Set(["BZ", "CV", "DM", "MN", "TT", "UG"]);
const NEW_ADMISSION = new Set(FINAL_SELECTION.filter((code) => !EXISTING_FOUNDATION.has(code)));
const SPECIAL_RISK = new Set(["AF", "CN", "HT", "IQ", "IR", "KP", "LY", "MM", "PS", "SD", "SO", "SS", "SY", "UA", "VA", "YE"]);
const REJECTED_POIS = Object.freeze({
  Q4795789: "operational-archive",
  Q6974138: "operational-library",
  Q108103114: "operational-library",
  Q626855: "operational-library",
  Q6974144: "operational-library",
  Q1405842: "generic-watercourse",
  Q6974139: "operational-library",
  Q4781577: "generic-watercourse",
  Q855412: "generic-watercourse",
  Q2116568: "generic-watercourse",
  Q890723: "generic-watercourse",
  Q16498204: "operational-library",
  Q2267147: "generic-watercourse",
  Q23693634: "operational-library",
  Q4789096: "generic-watercourse",
  Q5423444: "region-not-city-scoped-poi",
  Q815650: "generic-watercourse",
  Q21870703: "generic-watercourse",
  Q609946: "operational-library",
  Q6970423: "operational-archive",
  Q6974145: "operational-library",
  Q112031: "generic-island",
  Q7056504: "generic-watercourse",
  Q7190503: "generic-watercourse",
  Q7337452: "generic-watercourse",
  Q3018552: "generic-watercourse",
  Q625912: "operational-library",
  Q17509679: "generic-geological-formation",
  Q4151227: "generic-watercourse",
  Q18354333: "generic-geological-formation",
  Q5045524: "generic-watercourse",
  Q618252: "operational-library",
  Q22082371: "generic-geographic-feature",
});

const readiness = readJson("data/knowledge/semantic/country-route-readiness-policy.json");
assert.deepEqual(readiness.expectedCounts, { plannable: 122, evidenceBacked: 119, catalogOnly: 73 });
assert.equal(readiness.plannableCountryCodes.length + readiness.catalogOnlyCountryCodes.length, 195);
assert.equal(readiness.catalogOnlyCountryCodes.every((code) => !readiness.plannableCountryCodes.includes(code)), true);

const countries = KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries.flatMap((file) => readJson(file).countries);
const countryByEntityId = new Map(countries.map((country) => [country.entityId, country]));
const countryByCode = new Map(countries.map((country) => [country.isoAlpha2, country]));
const publishedCityFiles = new Set(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities);
const publishedPoiFiles = new Set(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois);
const batchNames = fs.readdirSync(path.join(ROOT, "data/knowledge/batches"));
const cityFiles = batchNames.filter((name) => /^cities\.p1b-batch\d+\.json$/u.test(name) && name !== "cities.p1b-batch51.json").map((name) => `data/knowledge/batches/${name}`);
const poiFiles = batchNames.filter((name) => /^pois\.p1b-batch\d+\.json$/u.test(name) && name !== "pois.p1b-batch51.json").map((name) => `data/knowledge/batches/${name}`);
const allCities = [];
const citySource = new Map();
const citySources = new Map();
for (const file of cityFiles) {
  for (const city of readJson(file).cities) {
    allCities.push(city);
    citySource.set(city.entityId, file);
    citySources.set(city.entityId, new Set([...(citySources.get(city.entityId) || []), file]));
  }
}
const cityByEntityId = new Map(allCities.map((city) => [city.entityId, city]));
const allPois = [];
const poiSource = new Map();
const poiSources = new Map();
for (const file of poiFiles) {
  for (const poi of readJson(file).pois) {
    allPois.push(poi);
    poiSource.set(poi.entityId, file);
    poiSources.set(poi.entityId, new Set([...(poiSources.get(poi.entityId) || []), file]));
  }
}
const transportEvidence = readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const seasonEvidence = readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const imageManifest = readJson("data/route-v2/images/image-coverage-manifest.json");
const imageCountryCodes = new Set(imageManifest.countries.map((entry) => entry.countryCode));
const previousQuarantine = readJson("data/knowledge/batches/review-queue.plannable-expansion-batch01.json").reviews;
const previousQuarantineByCountry = new Map(readiness.catalogOnlyCountryCodes.map((code) => [code, previousQuarantine.filter((entry) => entry.countryCode === code).length]));

function entriesForCountry(code) {
  const country = countryByCode.get(code);
  const cities = [...new Map(allCities.filter((city) => city.parentCountryEntityId === country.entityId).map((city) => [city.entityId, city])).values()];
  const isPublishedCity = (city) => [...(citySources.get(city.entityId) || [])].some((file) => publishedCityFiles.has(file));
  const publishedCities = cities.filter(isPublishedCity);
  const candidateCities = cities.filter((city) => !isPublishedCity(city));
  const cityIds = new Set(cities.map((city) => city.entityId));
  const pois = [...new Map(allPois.filter((poi) => cityIds.has(poi.parentCityEntityId)).map((poi) => [poi.entityId, poi])).values()];
  const isPublishedPoi = (poi) => [...(poiSources.get(poi.entityId) || [])].some((file) => publishedPoiFiles.has(file));
  const publishedPois = pois.filter(isPublishedPoi);
  const candidatePois = pois.filter((poi) => !isPublishedPoi(poi));
  const productionCityIds = new Set(publishedCities.map((city) => city.entityId));
  const transport = transportEvidence.filter((entry) => productionCityIds.has(entry.fromEntityId) && productionCityIds.has(entry.toEntityId));
  const season = seasonEvidence.filter((entry) => productionCityIds.has(entry.entityId));
  return { country, cities, publishedCities, candidateCities, publishedPois, candidatePois, transport, season };
}

function tierFor(facts) {
  const code = facts.country.isoAlpha2;
  if (SPECIAL_RISK.has(code)) return "D";
  if (facts.publishedCities.length > 0 || (facts.candidateCities.length >= 3 && facts.candidatePois.length >= 10)) return "A";
  if (facts.candidateCities.length >= 1 && facts.candidatePois.length >= 5) return "B";
  return "C";
}

function riskFor(code, facts) {
  if (SPECIAL_RISK.has(code)) return "special-or-high-risk-review";
  if (facts.candidateCities.length === 0 && facts.publishedCities.length === 0) return "country-only-foundation";
  if (facts.candidateCities.length === 1) return "single-destination-model-review";
  return "standard-country-context-review";
}

const inventory = readiness.catalogOnlyCountryCodes.map((code) => {
  const facts = entriesForCountry(code);
  const destinations = facts.publishedCities.length || facts.candidateCities.length;
  return {
    countryCode: code,
    countryEntityId: facts.country.entityId,
    wikidataId: facts.country.wikidataId,
    canonicalNameEn: facts.country.canonicalNameEn,
    existingProductionDestinations: facts.publishedCities.length,
    existingProductionPois: facts.publishedPois.length,
    existingCandidateDestinations: facts.candidateCities.length,
    existingCandidatePois: facts.candidatePois.length,
    quarantinedCandidatePois: previousQuarantineByCountry.get(code) || 0,
    existingTransportEvidence: facts.transport.length,
    existingSeasonEvidence: facts.season.length,
    existingThemeEvidence: 0,
    knownRouteBlockers: facts.publishedCities.length ? ["evidence-or-live-route-gate-pending"] : ["production-entity-foundation-pending", "evidence-pending"],
    singleDestinationFeasibility: destinations === 1,
    multiDestinationFeasibility: destinations > 1,
    identityAmbiguityRisk: SPECIAL_RISK.has(code) ? "high-review" : "normal-fail-closed-parser",
    regionIslandModelingRisk: destinations <= 1 ? "review-required" : "normal",
    specialStatusRisk: SPECIAL_RISK.has(code),
    currentImageAvailability: imageCountryCodes.has(code) ? "dedicated-production-country-cover" : "neutral-safe-runtime-fallback",
    estimatedEvidenceWorkRemaining: Math.max(0, 2 * Math.max(0, destinations - 1) - facts.transport.length) + Math.max(0, destinations - facts.season.length),
    tier: tierFor(facts),
    modelingRisk: riskFor(code, facts),
  };
}).sort((left, right) => left.countryCode.localeCompare(right.countryCode));

const tiers = Object.fromEntries(["A", "B", "C", "D"].map((tier) => [tier, inventory.filter((entry) => entry.tier === tier).map((entry) => entry.countryCode)]));
const promotionBlocked = new Set(readiness.batch01Promotion.blockedCountryCodes);
const initialRanked = inventory.filter((entry) => !promotionBlocked.has(entry.countryCode) && entry.tier !== "D" && (entry.existingProductionDestinations > 0 || (entry.existingCandidateDestinations >= 2 && entry.existingCandidatePois >= 8)))
  .map((entry) => ({ ...entry, score: entry.existingProductionDestinations * 50 + entry.existingProductionPois * 3 + entry.existingCandidateDestinations * 10 + entry.existingCandidatePois }))
  .sort((left, right) => right.score - left.score || left.countryCode.localeCompare(right.countryCode));
assert.deepEqual(sorted(initialRanked.slice(0, 14).map((entry) => entry.countryCode)), sorted(INITIAL_SELECTION));

const admittedCities = [];
const admittedPois = [];
const rejectedPois = [];
const reusedPois = [];
const poiDispositions = [];
for (const code of FINAL_SELECTION) {
  const facts = entriesForCountry(code);
  if (NEW_ADMISSION.has(code)) for (const city of facts.candidateCities) admittedCities.push(city);
  for (const poi of facts.candidatePois) {
    const city = cityByEntityId.get(poi.parentCityEntityId);
    const productionMatch = facts.publishedPois.find((entry) => entry.entityId === poi.entityId || entry.wikidataId === poi.wikidataId);
    if (productionMatch) {
      assert.equal(productionMatch.entityId, poi.entityId);
      assert.equal(productionMatch.wikidataId, poi.wikidataId);
      assert.equal(productionMatch.parentCityEntityId, poi.parentCityEntityId);
      reusedPois.push({ countryCode: code, candidate: poi, production: productionMatch });
      poiDispositions.push({ countryCode: code, destinationEntityId: city.entityId, destinationName: city.canonicalNameEn, candidateEntityId: poi.entityId, wikidataId: poi.wikidataId, canonicalNameEn: poi.canonicalNameEn, disposition: "EXISTING_PRODUCTION_REUSED", reason: "exact-stable-identity-and-destination-binding-match", productionEntityId: productionMatch.entityId });
    } else if (Object.hasOwn(REJECTED_POIS, poi.wikidataId)) {
      rejectedPois.push({ countryCode: code, destinationEntityId: city.entityId, destinationName: city.canonicalNameEn, sourceFile: poiSource.get(poi.entityId), entity: poi, reason: REJECTED_POIS[poi.wikidataId] });
      poiDispositions.push({ countryCode: code, destinationEntityId: city.entityId, destinationName: city.canonicalNameEn, candidateEntityId: poi.entityId, wikidataId: poi.wikidataId, canonicalNameEn: poi.canonicalNameEn, disposition: "QUARANTINED_REJECTED", reason: REJECTED_POIS[poi.wikidataId], quarantineEntityId: poi.entityId });
    } else {
      admittedPois.push(poi);
      poiDispositions.push({ countryCode: code, destinationEntityId: city.entityId, destinationName: city.canonicalNameEn, candidateEntityId: poi.entityId, wikidataId: poi.wikidataId, canonicalNameEn: poi.canonicalNameEn, disposition: "ADMITTED_NEW", reason: "reviewed-specific-travel-compatible-poi", admittedProductionEntityId: poi.entityId });
    }
  }
}
admittedCities.sort((a, b) => a.entityId.localeCompare(b.entityId));
admittedPois.sort((a, b) => a.entityId.localeCompare(b.entityId));
rejectedPois.sort((a, b) => a.entity.wikidataId.localeCompare(b.entity.wikidataId));
const admittedCityIds = new Set(admittedCities.map((city) => city.entityId));
assert.equal(admittedCities.length, 24);
assert.equal(admittedPois.length, 88);
assert.equal(reusedPois.length, 0);
assert.equal(rejectedPois.length, 33);
assert.equal(poiDispositions.length, 121);
assert.equal(new Set(poiDispositions.map((entry) => entry.candidateEntityId)).size, 121);
const productionCityIds = new Set([...citySources].filter(([, files]) => [...files].some((file) => publishedCityFiles.has(file))).map(([entityId]) => entityId));
assert.equal(admittedPois.every((poi) => admittedCityIds.has(poi.parentCityEntityId) || productionCityIds.has(poi.parentCityEntityId)), true);
assert.equal(new Set(admittedCities.map((city) => city.entityId)).size, admittedCities.length);
assert.equal(new Set(admittedCities.map((city) => city.wikidataId)).size, admittedCities.length);
assert.equal(new Set(admittedPois.map((poi) => poi.entityId)).size, admittedPois.length);
assert.equal(new Set(admittedPois.map((poi) => poi.wikidataId)).size, admittedPois.length);

writeJson("data/knowledge/batches/cities.p1b-batch51.json", { schemaVersion: "route-v2-city-baseline-p1b-batch51", generatedFrom: "data/knowledge/reports/plannable-expansion-batch02-entity-review.json", cityCount: admittedCities.length, cities: admittedCities });
writeJson("data/knowledge/batches/pois.p1b-batch51.json", { schemaVersion: "route-v2-poi-baseline-p1b-batch51", generatedFrom: "data/knowledge/reports/plannable-expansion-batch02-entity-review.json", poiCount: admittedPois.length, pois: admittedPois });
writeJson("data/knowledge/batches/review-queue.plannable-expansion-batch02.json", {
  schemaVersion: "route-v2-plannable-expansion-batch02-review-v1",
  reviewCount: rejectedPois.length,
  reviews: rejectedPois.map((entry) => ({ entityId: entry.entity.entityId, wikidataId: entry.entity.wikidataId, canonicalNameEn: entry.entity.canonicalNameEn, countryCode: entry.countryCode, destinationEntityId: entry.destinationEntityId, destinationName: entry.destinationName, sourceFile: entry.sourceFile, sourceEntity: entry.entity, disposition: "candidate-quarantine-retained", reason: entry.reason })),
});

const byCountry = FINAL_SELECTION.map((countryCode) => {
  const before = entriesForCountry(countryCode);
  const newCities = admittedCities.filter((city) => city.parentCountryEntityId === before.country.entityId);
  const allProductionCities = [...before.publishedCities, ...newCities];
  const allCityIds = new Set(allProductionCities.map((city) => city.entityId));
  const newPois = admittedPois.filter((poi) => allCityIds.has(poi.parentCityEntityId));
  const allProductionPois = [...before.publishedPois, ...newPois];
  const rejected = rejectedPois.filter((entry) => entry.countryCode === countryCode);
  const directedSegments = [];
  for (let index = 0; index < allProductionCities.length - 1; index += 1) {
    const left = allProductionCities[index];
    const right = allProductionCities[index + 1];
    directedSegments.push({ fromEntityId: left.entityId, toEntityId: right.entityId }, { fromEntityId: right.entityId, toEntityId: left.entityId });
  }
  return {
    countryCode,
    selectionRationale: EXISTING_FOUNDATION.has(countryCode) ? "existing-reviewed-production-foundation; evidence-work-remains" : "high-ranked-candidate-foundation; identity-and-poi-review-passed",
    candidateDestinationsReviewed: before.candidateCities.length,
    admittedDestinations: newCities.length,
    productionDestinationsAfter: allProductionCities.length,
    candidatePoisReviewed: before.candidatePois.length,
    admittedPois: newPois.length,
    productionPoisAfter: allProductionPois.length,
    quarantinedPois: rejected.length,
    routeModel: allProductionCities.length === 1 ? "single-destination" : "multi-destination",
    directedTransportSegmentUnits: directedSegments,
    seasonMonthProfileUnits: allProductionCities.map((city) => ({ entityId: city.entityId, countryCode })),
    existingReusableEvidence: { transport: before.transport.length, season: before.season.length, theme: 0 },
    missingTransportUnits: Math.max(0, directedSegments.length - before.transport.length),
    missingSeasonUnits: Math.max(0, allProductionCities.length - before.season.length),
    validEvidence: false,
    plannable: false,
    evidenceBacked: false,
    catalogOnly: true,
    evidencePending: true,
  };
});

const report = {
  schemaVersion: "route-v2-plannable-expansion-batch02-entity-review-v1",
  phase: "discovery-selection-entity-foundation",
  sealedMain: SEALED_MAIN,
  baseline: { countries: 195, cities: 866, pois: 4071, totalEntities: 5132, plannable: 122, evidenceBacked: 119, catalogOnly: 73 },
  discovery: { catalogCountries: 195, plannableCountries: 122, catalogOnlyCountries: 73, exactDisjointComplete: true, tiers },
  selection: { initial: INITIAL_SELECTION, replacements: [{ removed: "PG", added: "TL", reason: "PG failed per-destination POI sufficiency after region/river candidates were excluded" }], final: FINAL_SELECTION, batchSize: FINAL_SELECTION.length, authority: "derived-discovery-facts-and-fixed-selection-criteria; report-is-audit-only" },
  review: { candidateDestinationsReviewed: byCountry.reduce((sum, entry) => sum + entry.candidateDestinationsReviewed, 0), destinationsAdmitted: admittedCities.length, destinationsRejected: 0, candidatePoisReviewed: byCountry.reduce((sum, entry) => sum + entry.candidatePoisReviewed, 0), poisAdmitted: admittedPois.length, poisExistingProductionReused: reusedPois.length, poisQuarantined: rejectedPois.length, poisUnaccounted: 0, poisMultiDisposition: 0, identityConflicts: 0, duplicateConflicts: 0, regionIslandConflicts: rejectedPois.filter((entry) => /water|island|region|geological|geographic/u.test(entry.reason)).length },
  poiDispositions,
  after: { countries: 195, cities: 890, pois: 4159, totalEntities: 5244, plannable: 122, evidenceBacked: 119, catalogOnly: 73 },
  evidenceAdditions: { transport: 0, seasonMonth: 0, theme: 0 },
  readinessPromotions: 0,
  accidentalPromotions: 0,
  candidateLeakage: "NONE",
  countriesReviewed: byCountry,
  nextEvidencePhase: {
    countries: FINAL_SELECTION,
    directedTransportSegmentUnits: byCountry.reduce((sum, entry) => sum + entry.directedTransportSegmentUnits.length, 0),
    seasonMonthProfileUnits: byCountry.reduce((sum, entry) => sum + entry.seasonMonthProfileUnits.length, 0),
    singleDestinationCountries: byCountry.filter((entry) => entry.routeModel === "single-destination").map((entry) => entry.countryCode),
    multiDestinationCountries: byCountry.filter((entry) => entry.routeModel === "multi-destination").map((entry) => entry.countryCode),
    existingReusableTransportEvidence: byCountry.reduce((sum, entry) => sum + entry.existingReusableEvidence.transport, 0),
    existingReusableSeasonEvidence: byCountry.reduce((sum, entry) => sum + entry.existingReusableEvidence.season, 0),
    missingTransportUnits: byCountry.reduce((sum, entry) => sum + entry.missingTransportUnits, 0),
    missingSeasonUnits: byCountry.reduce((sum, entry) => sum + entry.missingSeasonUnits, 0),
    themeEvidenceAdded: 0,
  },
  performance: { dedicatedRunner: "NOT_AVAILABLE", realQualificationExecutions: 0, formalExperimentExecutions: 1, formalRun34622976529: "BLOCKED_INCONCLUSIVE", clearance: "NOT_CLEARED" },
};

writeJson("data/knowledge/reports/plannable-expansion-batch02-discovery.json", { schemaVersion: "route-v2-plannable-expansion-batch02-discovery-v1", sealedMain: SEALED_MAIN, inventory, tiers, selection: report.selection });
writeJson("data/knowledge/reports/plannable-expansion-batch02-entity-review.json", report);
console.log(JSON.stringify({ status: "GENERATED", inventory: inventory.length, tiers: Object.fromEntries(Object.entries(tiers).map(([tier, codes]) => [tier, codes.length])), selected: FINAL_SELECTION, cities: admittedCities.length, pois: admittedPois.length, quarantined: rejectedPois.length }, null, 2));
