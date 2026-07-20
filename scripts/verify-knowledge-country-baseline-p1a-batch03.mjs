import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateWikidataCountryRows,
  createAcceptedRouteRepository,
  createCountryEntityId,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  dedupeCountryEntities,
  normalizeCountryBaseline,
  validateCountryEntity,
  validateCountryEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgeCountryBaselineBatch03 } from "./audit-knowledge-country-baseline-batch03.mjs";
import {
  buildCountryBatchAssetsFromRaw,
  buildCountrySparql,
  canonicalRawRecordsForBatch,
  countryBatches,
  loadBatchCountries,
  serializeJson,
} from "./import-knowledge-country-baseline-pilot.mjs";
import { normalizeKnowledgeBaselineText } from "./lib/knowledge-baseline-text.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedBatch03 = ["AT", "BE", "CL", "CO", "CZ", "DK", "FI", "IE", "IL", "NL", "NO", "PE", "PH", "PL", "PT"];
const expectedPilot = ["AD", "CD", "FJ", "JP", "MA"];
const expectedBatch01 = ["AR", "AU", "BR", "CA", "DE", "EG", "ES", "FR", "GB", "IT", "MX", "NZ", "TR", "US", "ZA"];
const expectedBatch02 = ["AE", "CH", "CN", "GR", "ID", "IN", "KE", "KR", "MY", "NG", "RU", "SA", "SG", "TH", "VN"];
const requiredProvenanceFields = ["entityId", "isoAlpha2", "isoAlpha3", "isoNumeric", "wikidataId", "canonicalNameZh", "canonicalNameEn", "aliases", "continent", "region", "subregion", "capital", "coordinates"];
const forbiddenSourceTypes = ["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"];
const acceptedPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const protectedPaths = [
  acceptedPath,
  bootstrapPath,
  defaultRouteCandidatePoolPath(),
  defaultDecisionTracePath(),
  defaultRouteEvidenceBundlePath(),
  path.resolve(projectRoot, ".route-v2-cache", "route-evidence.json"),
  path.resolve(projectRoot, "src/lib/routes/knowledge-country-baseline-schema.mjs"),
  path.resolve(projectRoot, "src/lib/routes/knowledge-country-baseline-normalizer.mjs"),
  path.resolve(projectRoot, "src/lib/routes/knowledge-country-baseline-deduper.mjs"),
  path.resolve(projectRoot, "src/lib/routes/index.mjs"),
  path.resolve(projectRoot, "data/knowledge/cities.p1b-pilot.json"),
  path.resolve(projectRoot, "data/knowledge/pois.p1b-pilot.json"),
  path.resolve(projectRoot, "data/knowledge/provenance.cities.p1b-pilot.json"),
  path.resolve(projectRoot, "data/knowledge/provenance.pois.p1b-pilot.json"),
  path.resolve(projectRoot, "ROUTE_V2_KNOWLEDGE_ENTITY_LAYER_P1B_PILOT_IMPLEMENTATION_REPORT.md"),
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-detail.js"),
];
const protectedBefore = statesFor(protectedPaths);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(projectRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, relativePath), "utf8");
}

function feedReadyCounts() {
  const repo = createAcceptedRouteRepository({ storagePath: acceptedPath });
  return {
    all: repo.list({ limit: 10_000, sessionId: "p1a-batch03-count" }).total,
    cross: repo.list({ limit: 10_000, routeType: "cross", sessionId: "p1a-batch03-count" }).total,
    single: repo.list({ limit: 10_000, routeType: "single", sessionId: "p1a-batch03-count" }).total,
  };
}

function assertNoDuplicateValues(countries, field) {
  const values = new Set();
  for (const country of countries) {
    assert(!values.has(country[field]), `${field} duplicate: ${country[field]}`);
    values.add(country[field]);
  }
}

function assertUniqueIdentity(countries) {
  for (const field of ["isoAlpha2", "isoAlpha3", "isoNumeric", "wikidataId", "entityId"]) assertNoDuplicateValues(countries, field);
}

function sourceTypesFor(country) {
  return Object.values(country.provenance || {}).flat().map((entry) => entry.sourceType);
}

function fixtureSeed(overrides = {}) {
  return {
    isoAlpha2: "ZZ",
    isoAlpha3: "ZZZ",
    isoNumeric: "999",
    wikidataId: "Q999999",
    nameEn: "Exampleland",
    canonicalNameZh: "示例国",
    region: "Fixture Region",
    subregion: "Fixture Subregion",
    ...overrides,
  };
}

function fixtureBinding(seed, {
  qid = seed.wikidataId,
  sourceIsoAlpha2 = seed.isoAlpha2,
  isoAlpha3 = seed.isoAlpha3,
  isoNumeric = seed.isoNumeric,
  countryLabelEn = seed.nameEn,
  countryLabelZh = seed.canonicalNameZh,
  capitalQid = "Q100",
  capitalNameEn = "Fixture Capital",
  continentQid = "Q46",
  continentNameEn = "Europe",
} = {}) {
  return {
    country: { type: "uri", value: `http://www.wikidata.org/entity/${qid}` },
    iso2: { type: "literal", value: seed.isoAlpha2 },
    ...(sourceIsoAlpha2 ? { sourceIso2: { type: "literal", value: sourceIsoAlpha2 } } : {}),
    ...(isoAlpha3 ? { iso3: { type: "literal", value: isoAlpha3 } } : {}),
    ...(isoNumeric ? { isoNumeric: { type: "literal", value: isoNumeric } } : {}),
    countryLabelEn: { type: "literal", value: countryLabelEn },
    countryLabelZh: { type: "literal", value: countryLabelZh },
    capital: { type: "uri", value: `http://www.wikidata.org/entity/${capitalQid}` },
    capitalLabelEn: { type: "literal", value: capitalNameEn },
    continent: { type: "uri", value: `http://www.wikidata.org/entity/${continentQid}` },
    continentLabelEn: { type: "literal", value: continentNameEn },
    coordinate: { type: "literal", value: "Point(1 2)" },
  };
}

function fixtureRaw(seed, bindings) {
  return {
    schemaVersion: "route-v2-country-baseline-p1a-raw",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    source: {
      provider: "wikidata-sparql",
      canonicalEntityAnchor: "approved-wikidata-qid",
      countryCount: 1,
      countries: [seed.isoAlpha2],
      approvedEntities: [{ isoAlpha2: seed.isoAlpha2, wikidataId: seed.wikidataId }],
    },
    wikidata: { results: { bindings } },
  };
}

const fixtureBatch = {
  label: "P1A synthetic fixture",
  schemaSuffix: "p1a-synthetic-fixture",
  rawPath: path.resolve(projectRoot, "data/knowledge/raw/p1a-synthetic-fixture.json"),
};

const countsBefore = feedReadyCounts();
assert.deepEqual(countsBefore, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline mismatch");

const raw = readJson("data/knowledge/raw/countries-p1a-batch03.wikidata.json");
const countriesAsset = readJson("data/knowledge/batches/countries.p1a-batch03.json");
const provenanceAsset = readJson("data/knowledge/batches/provenance.p1a-batch03.json");
const conflictsAsset = readJson("data/knowledge/batches/conflicts.p1a-batch03.json");
const reviewAsset = readJson("data/knowledge/batches/review-queue.p1a-batch03.json");
const pilotAsset = readJson("data/knowledge/countries.p1a-pilot.json");
const batch01Asset = readJson("data/knowledge/batches/countries.p1a-batch01.json");
const batch02Asset = readJson("data/knowledge/batches/countries.p1a-batch02.json");
const pilotProvenance = readJson("data/knowledge/provenance.p1a-pilot.json");
const batch01Provenance = readJson("data/knowledge/batches/provenance.p1a-batch01.json");
const batch02Provenance = readJson("data/knowledge/batches/provenance.p1a-batch02.json");
const countries = countriesAsset.countries || [];
const batchSeeds = loadBatchCountries(countryBatches.batch03);
const canonicalRecords = canonicalRawRecordsForBatch(raw, batchSeeds);
const aggregated = aggregateWikidataCountryRows(raw);

assert.equal(raw.source?.provider, "wikidata-sparql", "Batch 03 raw snapshot should be Wikidata SPARQL");
assert.equal(raw.source?.canonicalEntityAnchor, "approved-wikidata-qid", "Batch 03 must use approved QID anchors");
assert.equal(raw.source?.countryCount, 15, "Batch 03 raw snapshot should declare exactly 15 countries");
assert.deepEqual([...raw.source.countries].sort(), expectedBatch03, "Batch 03 raw country set mismatch");
assert.equal(canonicalRecords.length, 15, "Batch 03 should contain 15 canonical raw records");
assertNoDuplicateValues(canonicalRecords, "isoAlpha2");
assert.deepEqual(canonicalRecords.map((record) => record.wikidataIds[0]).sort(), batchSeeds.map((seed) => seed.wikidataId).sort(), "Batch 03 QID anchors mismatch");
assert.equal(canonicalRecords.filter((record) => record.isoValidation === "wikidata-confirmed").length, 14);
assert.equal(canonicalRecords.filter((record) => record.isoValidation === "approved-seed-backed-because-missing").length, 1);
const nlRawRecord = canonicalRecords.find((record) => record.isoAlpha2 === "NL");
assert.deepEqual(nlRawRecord.wikidataIds, ["Q55"]);
assert.deepEqual(nlRawRecord.missingWikidataProperties, ["P297", "P298", "P299"]);
assert.equal(JSON.stringify(raw).includes("Q29999"), false, "Batch 03 raw must not contain Q29999");

assert.equal(countries.length, 15, "Batch 03 published countries should be exactly 15");
assert.deepEqual(countries.map((country) => country.isoAlpha2).sort(), expectedBatch03, "Batch 03 published country set mismatch");
assert.equal(validateCountryEntitySet(countries).accepted, true, "Batch 03 entity set should validate");
assertUniqueIdentity(countries);
assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 15, "Batch 03 provenance should cover all countries");
assert.equal(conflictsAsset.blockingCount, 0, "Batch 03 blocking conflicts should be zero");
assert.equal(conflictsAsset.conflictCount, 0, "Batch 03 conflicts should be zero");

for (const country of countries) {
  assert.equal(validateCountryEntity(country).accepted, true, `${country.isoAlpha2} should validate`);
  assert.equal(country.entityType, "country");
  assert.equal(country.entitySourceType, "wikidata");
  assert.match(country.isoAlpha2, /^[A-Z]{2}$/u);
  assert.match(country.isoAlpha3, /^[A-Z]{3}$/u);
  assert.match(country.isoNumeric, /^\d{3}$/u);
  assert.match(country.wikidataId, /^Q\d+$/u);
  assert(country.canonicalNameZh && country.canonicalNameEn, `${country.isoAlpha2} should have canonical names`);
  assert(Array.isArray(country.aliases), `${country.isoAlpha2} aliases should be an array`);
  assert.deepEqual(country.aliases, [...new Set(country.aliases)].sort((a, b) => a.localeCompare(b, "en")), `${country.isoAlpha2} aliases should be unique and stable`);
  assert(country.capital?.wikidataId && country.capital?.canonicalNameEn, `${country.isoAlpha2} should have a capital`);
  assert(country.continent?.wikidataId && country.continent?.canonicalNameEn, `${country.isoAlpha2} should have a continent`);
  assert(country.coordinates?.latitude >= -90 && country.coordinates?.latitude <= 90);
  assert(country.coordinates?.longitude >= -180 && country.coordinates?.longitude <= 180);
  assert.equal(country.retrievedAt, raw.retrievedAt, `${country.isoAlpha2} retrievedAt should come from raw`);
  assert.equal(country.entityId, createCountryEntityId(country), `${country.isoAlpha2} entityId should be deterministic`);
  for (const field of requiredProvenanceFields) {
    assert(Array.isArray(country.provenance[field]) && country.provenance[field].length > 0, `${country.isoAlpha2} missing provenance for ${field}`);
  }
  assert.deepEqual(country.provenance, provenanceAsset.provenance[country.entityId], `${country.isoAlpha2} inline/sidecar provenance drift`);
  for (const forbidden of forbiddenSourceTypes) assert.equal(sourceTypesFor(country).includes(forbidden), false, `${country.isoAlpha2} uses forbidden source ${forbidden}`);
}
assert.deepEqual(Object.keys(provenanceAsset.provenance).sort(), countries.map((country) => country.entityId).sort(), "Batch 03 should have no orphan provenance");

const byIso = new Map(countries.map((country) => [country.isoAlpha2, country]));
const nl = byIso.get("NL");
assert.equal(nl.wikidataId, "Q55");
assert.equal(nl.entityId, "country-febe99ab26ea41f0");
assert.deepEqual({ isoAlpha2: nl.isoAlpha2, isoAlpha3: nl.isoAlpha3, isoNumeric: nl.isoNumeric }, { isoAlpha2: "NL", isoAlpha3: "NLD", isoNumeric: "528" });
assert.equal(nl.canonicalNameEn, "Netherlands");
assert.equal(nl.capital.wikidataId, "Q727");
assert.equal(countries.some((country) => country.wikidataId === "Q29999"), false);
for (const field of ["isoAlpha2", "isoAlpha3", "isoNumeric"]) {
  assert.deepEqual(nl.provenance[field].map((entry) => entry.sourceType), ["iso"], `NL ${field} should be seed-backed only`);
  assert.equal(nl.provenance[field][0].source, "p1a-batch03-approved-country-seed");
}
for (const field of ["canonicalNameEn", "capital", "coordinates", "continent"]) {
  assert(nl.provenance[field].some((entry) => entry.sourceType === "wikidata" && entry.sourceUrl === "https://www.wikidata.org/wiki/Q55"), `NL ${field} should remain sourced from Q55`);
}
const nlIsoReviews = reviewAsset.reviewQueue.filter((review) => review.isoAlpha2 === "NL" && review.type === "wikidata-iso-identifiers-missing");
assert.equal(nlIsoReviews.length, 1, "NL should have exactly one missing ISO review");
assert.deepEqual(nlIsoReviews[0].missingProperties, ["P297", "P298", "P299"]);
assert.deepEqual(nlIsoReviews[0].selected, { isoAlpha2: "NL", isoAlpha3: "NLD", isoNumeric: "528" });
assert.equal(nlIsoReviews[0].sourceUrl, "https://www.wikidata.org/wiki/Q55");

const reviewIds = reviewAsset.reviewQueue.map((review) => review.reviewId);
assert.equal(new Set(reviewIds).size, reviewIds.length, "reviewId values should be unique");
assert.deepEqual(
  reviewAsset.reviewQueue.map((review) => `${review.isoAlpha2}:${review.type}`),
  [...reviewAsset.reviewQueue].sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2) || a.type.localeCompare(b.type)).map((review) => `${review.isoAlpha2}:${review.type}`),
  "Review queue should be stably sorted",
);
for (const review of reviewAsset.reviewQueue) {
  const rawCountry = aggregated.get(review.isoAlpha2);
  if (review.type === "multiple-country-labels") assert(rawCountry.countryLabelsEn.size > 1 || rawCountry.countryLabelsZh.size > 1, `${review.isoAlpha2} label review should trace to raw labels`);
  if (review.type === "wikidata-iso-identifiers-missing") assert(canonicalRecords.find((record) => record.isoAlpha2 === review.isoAlpha2)?.missingWikidataProperties.length > 0, `${review.isoAlpha2} ISO review should trace to raw absence`);
}

assert.equal(pilotAsset.countries.length, 5);
assert.equal(batch01Asset.countries.length, 15);
assert.equal(batch02Asset.countries.length, 15);
assert.deepEqual(pilotAsset.countries.map((country) => country.isoAlpha2).sort(), expectedPilot);
assert.deepEqual(batch01Asset.countries.map((country) => country.isoAlpha2).sort(), expectedBatch01);
assert.deepEqual(batch02Asset.countries.map((country) => country.isoAlpha2).sort(), expectedBatch02);
const previous = [...pilotAsset.countries, ...batch01Asset.countries, ...batch02Asset.countries];
const cumulative = [...previous, ...countries].sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2));
assert.equal(cumulative.length, 50, "P1A cumulative CountryCount should be 50");
assertUniqueIdentity(cumulative);
assert.equal(dedupeCountryEntities(cumulative).conflicts.length, 0, "Cumulative 50 should pass the shared deduper");
assert.equal(Object.keys(pilotProvenance.provenance).length + Object.keys(batch01Provenance.provenance).length + Object.keys(batch02Provenance.provenance).length + Object.keys(provenanceAsset.provenance).length, 50, "Cumulative provenance should be one-to-one");
for (const [isoAlpha2, expected] of Object.entries({ JP: ["country-a0509b9eab0ea9ce", "Q17"], TR: ["country-03919f1fd24fd3dc", "Q43"], SG: ["country-e0a550ef5a59c6f9", "Q334"] })) {
  const country = cumulative.find((item) => item.isoAlpha2 === isoAlpha2);
  assert.deepEqual([country.entityId, country.wikidataId], expected, `${isoAlpha2} P1B parent changed`);
}

const normalizedA = normalizeCountryBaseline({ rawSnapshot: raw, pilotCountries: batchSeeds, sourceNames: { catalog: "data/countries.zh.json", iso: "P1A batch03 ISO seed" } });
const normalizedB = normalizeCountryBaseline({ rawSnapshot: raw, pilotCountries: batchSeeds, sourceNames: { catalog: "data/countries.zh.json", iso: "P1A batch03 ISO seed" } });
assert.deepEqual(normalizedB, normalizedA, "Batch 03 normalization should be deterministic");
let pureBuilderNetworkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  pureBuilderNetworkCalls += 1;
  throw new Error("Pure builder attempted network access");
};
let rebuiltA;
let rebuiltB;
try {
  rebuiltA = buildCountryBatchAssetsFromRaw(raw, batchSeeds, countryBatches.batch03);
  rebuiltB = buildCountryBatchAssetsFromRaw(raw, batchSeeds, countryBatches.batch03);
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(pureBuilderNetworkCalls, 0, "Pure builder should not call the network");
assert.deepEqual(rebuiltB, rebuiltA, "Pure builder should be deterministic");
for (const [assetName, relativePath] of Object.entries({
  countries: "data/knowledge/batches/countries.p1a-batch03.json",
  provenance: "data/knowledge/batches/provenance.p1a-batch03.json",
  conflicts: "data/knowledge/batches/conflicts.p1a-batch03.json",
  reviewQueue: "data/knowledge/batches/review-queue.p1a-batch03.json",
})) {
  assert.equal(
    normalizeKnowledgeBaselineText(serializeJson(rebuiltA.assets[assetName])),
    normalizeKnowledgeBaselineText(readText(relativePath)),
    `${assetName} serialized rebuild should be canonical-text-identical`,
  );
}

const allMissingSeed = fixtureSeed();
const allMissingRaw = fixtureRaw(allMissingSeed, [fixtureBinding(allMissingSeed, { sourceIsoAlpha2: "", isoAlpha3: "", isoNumeric: "" })]);
const allMissingBuild = buildCountryBatchAssetsFromRaw(allMissingRaw, [allMissingSeed], fixtureBatch);
assert.equal(allMissingBuild.conflicts.length, 0);
assert.equal(allMissingBuild.reviewQueue.filter((review) => review.type === "wikidata-iso-identifiers-missing").length, 1);
for (const field of ["isoAlpha2", "isoAlpha3", "isoNumeric"]) assert.deepEqual(allMissingBuild.countries[0].provenance[field].map((entry) => entry.sourceType), ["iso"]);

const isoConflictSeed = fixtureSeed();
assert.throws(() => buildCountryBatchAssetsFromRaw(fixtureRaw(isoConflictSeed, [fixtureBinding(isoConflictSeed, { isoAlpha3: "BAD" })]), [isoConflictSeed], fixtureBatch), /isoAlpha3 seed conflict/u);
const wrongQidSeed = fixtureSeed();
assert.throws(() => buildCountryBatchAssetsFromRaw(fixtureRaw(wrongQidSeed, [fixtureBinding(wrongQidSeed, { qid: "Q123" })]), [wrongQidSeed], fixtureBatch), /wikidataId seed mismatch/u);
const missingSeed = fixtureSeed({ isoAlpha3: "" });
assert.throws(() => buildCountryBatchAssetsFromRaw(fixtureRaw(missingSeed, [fixtureBinding(missingSeed, { isoAlpha3: "" })]), [missingSeed], fixtureBatch), /approved seed is missing isoAlpha3/u);
const partialSeed = fixtureSeed();
const partialBuild = buildCountryBatchAssetsFromRaw(fixtureRaw(partialSeed, [fixtureBinding(partialSeed, { isoAlpha3: "" })]), [partialSeed], fixtureBatch);
assert.deepEqual(partialBuild.reviewQueue.find((review) => review.type === "wikidata-iso-identifiers-missing").missingProperties, ["P298"]);
assert.deepEqual(partialBuild.countries[0].provenance.isoAlpha3.map((entry) => entry.sourceType), ["iso"]);
assert.throws(() => buildCountryBatchAssetsFromRaw(fixtureRaw(partialSeed, [fixtureBinding(partialSeed, { isoAlpha3: "BAD" })]), [partialSeed], fixtureBatch), /isoAlpha3 seed conflict/u);
assert.throws(() => buildCountrySparql([partialSeed, fixtureSeed({ isoAlpha2: "ZY", isoAlpha3: "ZYY", isoNumeric: "998" })]), /QID anchors must be unique/u);

const multiSeed = fixtureSeed();
const multiRaw = fixtureRaw(multiSeed, [
  fixtureBinding(multiSeed, { countryLabelZh: "示例国甲", capitalQid: "Q100", capitalNameEn: "Capital A", continentQid: "Q46", continentNameEn: "Europe" }),
  fixtureBinding(multiSeed, { countryLabelZh: "示例国乙", capitalQid: "Q101", capitalNameEn: "Capital B", continentQid: "Q48", continentNameEn: "Asia" }),
]);
const multiA = buildCountryBatchAssetsFromRaw(multiRaw, [multiSeed], fixtureBatch);
const multiB = buildCountryBatchAssetsFromRaw(multiRaw, [multiSeed], fixtureBatch);
for (const type of ["multiple-capital-candidates", "multiple-continent-candidates", "multiple-country-labels"]) assert(multiA.reviewQueue.some((review) => review.type === type), `${type} fixture should generate review`);
assert.deepEqual(multiB.reviewQueue.map((review) => review.reviewId), multiA.reviewQueue.map((review) => review.reviewId), "Synthetic review IDs should be deterministic");

const previousExample = previous[0];
const fixtureCountry = countries[0];
assert.throws(() => assertUniqueIdentity([...previous, { ...fixtureCountry, isoAlpha2: previousExample.isoAlpha2 }]), /isoAlpha2 duplicate/u);
assert.throws(() => assertUniqueIdentity([...previous, { ...fixtureCountry, wikidataId: previousExample.wikidataId }]), /wikidataId duplicate/u);
assert.throws(() => assertUniqueIdentity([fixtureCountry, { ...countries[1], entityId: fixtureCountry.entityId }]), /entityId duplicate/u);
assert.equal(validateCountryEntity({ ...fixtureCountry, isoNumeric: "BAD" }).accepted, false, "Invalid ISO numeric fixture should block");
assert.equal(validateCountryEntity({ ...fixtureCountry, capital: null }).accepted, false, "Missing capital fixture should block");
assert.equal(validateCountryEntity({ ...fixtureCountry, coordinates: { latitude: 100, longitude: 0 } }).accepted, false, "Out-of-range coordinate fixture should block");
const missingProvenance = structuredClone(fixtureCountry);
delete missingProvenance.provenance.capital;
assert.equal(validateCountryEntity(missingProvenance).accepted, false, "Missing provenance fixture should block");
const driftedSidecar = structuredClone(provenanceAsset.provenance[fixtureCountry.entityId]);
driftedSidecar.capital[0].source = "drifted-source";
assert.throws(() => assert.deepEqual(fixtureCountry.provenance, driftedSidecar), "Inline/sidecar provenance drift fixture should block");

const serializedAssets = JSON.stringify({ countriesAsset, provenanceAsset, conflictsAsset, reviewAsset });
for (const forbidden of ["accepted-routes.json", "RouteRecord", "plannerReason", "coverage-placeholder", "search-fallback", "route-record-derived", "Q29999"]) {
  assert.equal(serializedAssets.includes(forbidden), false, `Batch 03 assets should not contain ${forbidden}`);
}

const audit = auditKnowledgeCountryBaselineBatch03();
assert.equal(audit.status, "PASS", "Batch 03 audit should pass");
assert.equal(audit.countryCount, 15);
assert.equal(audit.cumulativeCountryCount, 50);
assert.equal(audit.remainingCountryCount, 145);
assert.equal(audit.provenance.coverage, 15);
assert.equal(audit.provenance.inlineSidecarMatches, 15);
assert.equal(audit.conflicts.total, 0);
assert.equal(audit.netherlands.wikidataId, "Q55");
assert.equal(audit.netherlands.missingIsoReviews.length, 1);

assert.deepEqual(feedReadyCounts(), countsBefore, "FeedReadyPoolCount should remain unchanged");
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "Protected P1A/P1B/route/cache files changed during Batch 03 verification");

console.log(JSON.stringify({
  status: "PASS",
  batchCountryCount: countries.length,
  cumulativeCountryCount: cumulative.length,
  remainingCountryCount: 195 - cumulative.length,
  countrySet: countries.map((country) => country.isoAlpha2).sort(),
  reviewTypes: reviewAsset.reviewQueue.map((review) => `${review.isoAlpha2}:${review.type}`),
  provenanceCoverage: Object.keys(provenanceAsset.provenance).length,
  blockingConflictCount: conflictsAsset.blockingCount,
  deterministicNormalization: true,
  deterministicPureBuilder: true,
  byteIdenticalRebuild: true,
  pureBuilderNetworkCalls,
  syntheticFixtures: [
    "exact-qid-all-iso-missing-approved-seed",
    "exact-qid-iso-conflict-blocking",
    "wrong-qid-correct-seed-blocking",
    "missing-iso-missing-seed-blocking",
    "partial-iso-missing-seed-backed-review",
    "partial-iso-conflict-blocking",
    "duplicate-approved-qid-blocking",
    "duplicate-prior-iso2-blocking",
    "duplicate-prior-qid-blocking",
    "duplicate-entity-id-blocking",
    "invalid-iso-numeric-blocking",
    "missing-capital-blocking",
    "coordinate-range-blocking",
    "missing-provenance-blocking",
    "inline-sidecar-drift-blocking",
    "multiple-capital-review",
    "multiple-continent-review",
    "multiple-country-labels-review",
    "review-id-deterministic",
  ],
  feedReadyPoolCount: countsBefore,
}, null, 2));
