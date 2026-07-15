import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAcceptedRouteRepository,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  dedupeCountryEntities,
  normalizeCountryBaseline,
  validateCountryEntity,
  validateCountryEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgeCountryBaselineBatch01 } from "./audit-knowledge-country-baseline-batch01.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedBatch01 = ["AR", "AU", "BR", "CA", "DE", "EG", "ES", "FR", "GB", "IT", "MX", "NZ", "TR", "US", "ZA"];
const expectedPilot = ["AD", "CD", "FJ", "JP", "MA"];
const acceptedPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const protectedPaths = [
  acceptedPath,
  bootstrapPath,
  defaultRouteCandidatePoolPath(),
  defaultDecisionTracePath(),
  defaultRouteEvidenceBundlePath(),
  path.resolve(projectRoot, ".route-v2-cache", "route-evidence.json"),
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-detail.js"),
];
const protectedBefore = statesFor(protectedPaths);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(projectRoot, relativePath), "utf8"));
}

function feedReadyCounts() {
  const repo = createAcceptedRouteRepository({ storagePath: acceptedPath });
  return {
    all: repo.list({ limit: 10_000, sessionId: "p1a-batch01-count" }).total,
    cross: repo.list({ limit: 10_000, routeType: "cross", sessionId: "p1a-batch01-count" }).total,
    single: repo.list({ limit: 10_000, routeType: "single", sessionId: "p1a-batch01-count" }).total,
  };
}

function assertNoDuplicateValues(countries, field) {
  const values = new Set();
  for (const country of countries) {
    assert(!values.has(country[field]), `${field} duplicate: ${country[field]}`);
    values.add(country[field]);
  }
}

const countsBefore = feedReadyCounts();
assert.deepEqual(countsBefore, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline mismatch");

const raw = readJson("data/knowledge/raw/countries-p1a-batch01.wikidata.json");
const countriesAsset = readJson("data/knowledge/batches/countries.p1a-batch01.json");
const provenanceAsset = readJson("data/knowledge/batches/provenance.p1a-batch01.json");
const conflictsAsset = readJson("data/knowledge/batches/conflicts.p1a-batch01.json");
const reviewAsset = readJson("data/knowledge/batches/review-queue.p1a-batch01.json");
const pilotAsset = readJson("data/knowledge/countries.p1a-pilot.json");
const pilotProvenance = readJson("data/knowledge/provenance.p1a-pilot.json");
const countries = countriesAsset.countries || [];
const pilotCountries = pilotAsset.countries || [];

assert.equal(raw.source?.provider, "wikidata-sparql", "Batch 01 raw snapshot should be Wikidata SPARQL");
assert.equal(raw.source?.countryCount, 15, "Batch 01 raw snapshot should cover exactly 15 countries");
assert.deepEqual([...raw.source.countries].sort(), expectedBatch01, "Batch 01 raw country set mismatch");
assert.equal(countries.length, 15, "Batch 01 published countries should be exactly 15");
assert.deepEqual(countries.map((country) => country.isoAlpha2).sort(), expectedBatch01, "Batch 01 country set mismatch");
assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 15, "Batch 01 provenance should cover all countries");
assert.equal(conflictsAsset.blockingCount, 0, "Batch 01 blocking conflicts should be zero");

assert.equal(validateCountryEntitySet(countries).accepted, true, "Batch 01 entity set should validate");
assertNoDuplicateValues(countries, "isoAlpha2");
assertNoDuplicateValues(countries, "isoAlpha3");
assertNoDuplicateValues(countries, "wikidataId");

for (const country of countries) {
  assert.equal(validateCountryEntity(country).accepted, true, `${country.isoAlpha2} should validate`);
  assert.equal(country.entityType, "country");
  assert.equal(country.entitySourceType, "wikidata");
  assert.match(country.isoAlpha2, /^[A-Z]{2}$/u);
  assert.match(country.isoAlpha3, /^[A-Z]{3}$/u);
  assert.match(country.isoNumeric, /^\d{3}$/u);
  assert.match(country.wikidataId, /^Q\d+$/u);
  assert(country.canonicalNameZh && country.canonicalNameEn, `${country.isoAlpha2} should have canonical names`);
  assert(Array.isArray(country.aliases), `${country.isoAlpha2} aliases should exist`);
  assert(country.capital?.wikidataId && country.capital?.canonicalNameEn, `${country.isoAlpha2} should have capital`);
  assert(country.continent?.wikidataId && country.continent?.canonicalNameEn, `${country.isoAlpha2} should have continent`);
  assert(country.coordinates?.latitude >= -90 && country.coordinates?.latitude <= 90);
  assert(country.coordinates?.longitude >= -180 && country.coordinates?.longitude <= 180);
  assert.equal(country.retrievedAt, raw.retrievedAt, `${country.isoAlpha2} retrievedAt should come from raw snapshot`);
  for (const field of ["entityId", "isoAlpha2", "isoAlpha3", "isoNumeric", "wikidataId", "canonicalNameZh", "canonicalNameEn", "aliases", "continent", "region", "subregion", "capital", "coordinates"]) {
    assert(Array.isArray(country.provenance[field]) && country.provenance[field].length > 0, `${country.isoAlpha2} missing provenance for ${field}`);
  }
  const sourceTypes = Object.values(country.provenance).flat().map((entry) => entry.sourceType);
  for (const forbidden of ["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"]) {
    assert.equal(sourceTypes.includes(forbidden), false, `${country.isoAlpha2} should not use forbidden source ${forbidden}`);
  }
}

const byIso = new Map(countries.map((country) => [country.isoAlpha2, country]));
assert.equal(byIso.get("TR").continent.wikidataId, "Q46", "Turkey selected canonical continent should be deterministic");
const turkeyReview = reviewAsset.reviewQueue.find((item) => item.isoAlpha2 === "TR" && item.type === "multiple-continent-candidates");
assert(turkeyReview, "Turkey should retain multiple continent review");
assert.deepEqual(turkeyReview.candidates.map((item) => item.wikidataId).sort(), ["Q46", "Q48"], "Turkey review should preserve Europe and Asia candidates");

assert.equal(byIso.get("GB").wikidataId, "Q145", "United Kingdom should be Q145");
assert.equal(byIso.get("GB").canonicalNameEn, "United Kingdom", "GB canonical name should not become England or Great Britain");
assert.equal(countries.some((country) => country.canonicalNameEn === "England" || country.wikidataId === "Q21"), false, "England must not publish as a country entity in Batch 01");

assert.equal(byIso.get("US").wikidataId, "Q30", "United States should be Q30");
assert.equal(byIso.get("US").capital.wikidataId, "Q61", "United States capital should be Washington, D.C.");

const southAfricaReview = reviewAsset.reviewQueue.find((item) => item.isoAlpha2 === "ZA" && item.type === "multiple-capital-candidates");
assert(southAfricaReview, "South Africa should retain multiple capital review");
assert.deepEqual(southAfricaReview.candidates.map((item) => item.wikidataId).sort(), ["Q37701", "Q3926", "Q5465"], "South Africa review should preserve all capital candidates");
assert.equal(byIso.get("ZA").capital.wikidataId, southAfricaReview.selected.wikidataId, "South Africa selected capital should be recorded in review");
assert.equal(byIso.get("ZA").capital.aliases.some((alias) => /Pretoria|Cape Town/iu.test(alias)), false, "Selected South Africa capital aliases should not mix other capital aliases");

assert.equal(byIso.get("AU").continent.wikidataId, "Q55643", "Australia continent/geographic-region should keep Wikidata QID");
assert.equal(byIso.get("EG").continent.wikidataId, "Q15", "Egypt should currently have Africa as single Wikidata P30 candidate");

const reviewTypes = reviewAsset.reviewQueue.map((item) => `${item.isoAlpha2}:${item.type}`).sort();
assert(reviewTypes.includes("TR:multiple-continent-candidates"), "Turkey continent review expected");
assert(reviewTypes.includes("ZA:multiple-capital-candidates"), "South Africa capital review expected");

const merged = [...pilotCountries, ...countries].sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2));
assert.equal(merged.length, 20, "Pilot + Batch 01 should merge to 20 countries");
assert.deepEqual([...new Set(merged.map((country) => country.isoAlpha2))].length, 20, "Pilot + Batch 01 ISO alpha-2 should be unique");
assert.deepEqual([...new Set(merged.map((country) => country.isoAlpha3))].length, 20, "Pilot + Batch 01 ISO alpha-3 should be unique");
assert.deepEqual([...new Set(merged.map((country) => country.wikidataId))].length, 20, "Pilot + Batch 01 QID should be unique");
assert.equal(dedupeCountryEntities(merged).conflicts.length, 0, "Pilot + Batch 01 should pass shared deduper");
assert.equal(Object.keys(pilotProvenance.provenance || {}).length + Object.keys(provenanceAsset.provenance || {}).length, 20, "Merged provenance should remain one-to-one");

const rerunA = normalizeCountryBaseline({
  rawSnapshot: raw,
  pilotCountries: countries.map((country) => ({
    isoAlpha2: country.isoAlpha2,
    isoAlpha3: country.isoAlpha3,
    isoNumeric: country.isoNumeric,
    canonicalNameZh: country.canonicalNameZh,
    nameEn: country.canonicalNameEn,
    region: country.region,
    subregion: country.subregion,
  })),
});
const rerunB = normalizeCountryBaseline({
  rawSnapshot: raw,
  pilotCountries: countries.map((country) => ({
    isoAlpha2: country.isoAlpha2,
    isoAlpha3: country.isoAlpha3,
    isoNumeric: country.isoNumeric,
    canonicalNameZh: country.canonicalNameZh,
    nameEn: country.canonicalNameEn,
    region: country.region,
    subregion: country.subregion,
  })),
});
assert.deepEqual(rerunB, rerunA, "Batch 01 normalization should be deterministic");

const serialized = JSON.stringify({ countriesAsset, provenanceAsset, conflictsAsset, reviewAsset });
for (const forbidden of ["accepted-routes.json", "RouteRecord", "plannerReason", "summary", "coverage:", "search-", "route-record-derived"]) {
  assert.equal(serialized.includes(forbidden), false, `Batch 01 assets should not contain ${forbidden}`);
}

const audit = auditKnowledgeCountryBaselineBatch01();
assert.equal(audit.status, "PASS", "Batch 01 audit should pass");
assert.equal(audit.countryCount, 15);
assert.deepEqual(audit.actualCountrySet, expectedBatch01);
assert.equal(audit.provenanceCoverage, 15);
assert.equal(audit.conflicts.blocking, 0);

assert.deepEqual(feedReadyCounts(), countsBefore, "FeedReadyPoolCount should remain unchanged");
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "protected route/cache files changed during Batch 01 verification");

console.log(JSON.stringify({
  status: "PASS",
  batchCountryCount: countries.length,
  mergedCountryCount: merged.length,
  countrySet: countries.map((country) => country.isoAlpha2).sort(),
  reviewTypes,
  provenanceCoverage: Object.keys(provenanceAsset.provenance || {}).length,
  blockingConflictCount: conflictsAsset.blockingCount,
  deterministicNormalization: true,
  feedReadyPoolCount: countsBefore,
}, null, 2));
