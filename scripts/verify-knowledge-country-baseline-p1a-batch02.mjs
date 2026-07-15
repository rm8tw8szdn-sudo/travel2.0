import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateWikidataCountryRows,
  createAcceptedRouteRepository,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  dedupeCountryEntities,
  normalizeCountryBaseline,
  validateCountryEntity,
  validateCountryEntitySet,
} from "../src/lib/routes/index.mjs";
import { auditKnowledgeCountryBaselineBatch02 } from "./audit-knowledge-country-baseline-batch02.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedBatch02 = ["AE", "CH", "CN", "GR", "ID", "IN", "KE", "KR", "MY", "NG", "RU", "SA", "SG", "TH", "VN"];
const expectedPilot = ["AD", "CD", "FJ", "JP", "MA"];
const expectedBatch01 = ["AR", "AU", "BR", "CA", "DE", "EG", "ES", "FR", "GB", "IT", "MX", "NZ", "TR", "US", "ZA"];
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
    all: repo.list({ limit: 10_000, sessionId: "p1a-batch02-count" }).total,
    cross: repo.list({ limit: 10_000, routeType: "cross", sessionId: "p1a-batch02-count" }).total,
    single: repo.list({ limit: 10_000, routeType: "single", sessionId: "p1a-batch02-count" }).total,
  };
}

function assertNoDuplicateValues(countries, field) {
  const values = new Set();
  for (const country of countries) {
    assert(!values.has(country[field]), `${field} duplicate: ${country[field]}`);
    values.add(country[field]);
  }
}

function sourceTypesFor(country) {
  return Object.values(country.provenance || {}).flat().map((entry) => entry.sourceType);
}

const countsBefore = feedReadyCounts();
assert.deepEqual(countsBefore, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline mismatch");

const raw = readJson("data/knowledge/raw/countries-p1a-batch02.wikidata.json");
const countriesAsset = readJson("data/knowledge/batches/countries.p1a-batch02.json");
const provenanceAsset = readJson("data/knowledge/batches/provenance.p1a-batch02.json");
const conflictsAsset = readJson("data/knowledge/batches/conflicts.p1a-batch02.json");
const reviewAsset = readJson("data/knowledge/batches/review-queue.p1a-batch02.json");
const pilotAsset = readJson("data/knowledge/countries.p1a-pilot.json");
const batch01Asset = readJson("data/knowledge/batches/countries.p1a-batch01.json");
const pilotProvenance = readJson("data/knowledge/provenance.p1a-pilot.json");
const batch01Provenance = readJson("data/knowledge/batches/provenance.p1a-batch01.json");
const countries = countriesAsset.countries || [];

assert.equal(raw.source?.provider, "wikidata-sparql", "Batch 02 raw snapshot should be Wikidata SPARQL");
assert.equal(raw.source?.countryCount, 15, "Batch 02 raw snapshot should cover exactly 15 countries");
assert.deepEqual([...raw.source.countries].sort(), expectedBatch02, "Batch 02 raw country set mismatch");
assert.equal(countries.length, 15, "Batch 02 published countries should be exactly 15");
assert.deepEqual(countries.map((country) => country.isoAlpha2).sort(), expectedBatch02, "Batch 02 country set mismatch");
assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 15, "Batch 02 provenance should cover all countries");
assert.equal(conflictsAsset.blockingCount, 0, "Batch 02 blocking conflicts should be zero");

assert.equal(validateCountryEntitySet(countries).accepted, true, "Batch 02 entity set should validate");
assertNoDuplicateValues(countries, "isoAlpha2");
assertNoDuplicateValues(countries, "isoAlpha3");
assertNoDuplicateValues(countries, "wikidataId");
assertNoDuplicateValues(countries, "entityId");

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
  for (const forbidden of ["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"]) {
    assert.equal(sourceTypesFor(country).includes(forbidden), false, `${country.isoAlpha2} should not use forbidden source ${forbidden}`);
  }
}

const byIso = new Map(countries.map((country) => [country.isoAlpha2, country]));
assert.equal(byIso.get("CN").wikidataId, "Q148", "China should publish as Q148");
assert.equal(byIso.get("CN").entityType, "country", "China should remain a country entity");
assert.equal(byIso.get("KR").wikidataId, "Q884", "Korea batch entry should publish South Korea / Republic of Korea");
assert.equal(countries.some((country) => country.wikidataId === "Q423"), false, "North Korea must not be published in Batch 02");
assert.equal(byIso.get("SG").wikidataId, "Q334", "Singapore should publish as country Q334");
assert.equal(byIso.get("SG").entityType, "country", "Singapore should not be demoted to city");
assert.equal(byIso.get("RU").wikidataId, "Q159", "Russia should publish as Q159");
assert.equal(byIso.get("NG").capital.canonicalNameEn, "Abuja", "Nigeria capital English label should use explicit curated override");
assert(
  reviewAsset.reviewQueue.some((item) => item.isoAlpha2 === "NG" && item.type === "capital-curated-override"),
  "Nigeria capital override should remain visible in review queue",
);
assert(
  byIso.get("NG").provenance.capital.some((entry) => entry.sourceType === "manual-override"),
  "Nigeria capital override should be preserved in provenance",
);

const aggregated = aggregateWikidataCountryRows(raw);
for (const isoAlpha2 of ["ID", "MY"]) {
  const candidateCount = [...(aggregated.get(isoAlpha2)?.capitalCandidates || new Map()).keys()].length;
  if (candidateCount > 1) {
    assert(reviewAsset.reviewQueue.some((item) => item.isoAlpha2 === isoAlpha2 && item.type === "multiple-capital-candidates"), `${isoAlpha2} multiple capital candidates should enter review`);
  }
}
const russiaContinentCount = [...(aggregated.get("RU")?.continentCandidates || new Map()).keys()].length;
if (russiaContinentCount > 1) {
  const russiaReview = reviewAsset.reviewQueue.find((item) => item.isoAlpha2 === "RU" && item.type === "multiple-continent-candidates");
  assert(russiaReview, "Russia multiple continent candidates should enter review");
  assert(russiaReview.candidates.length >= 2, "Russia review should preserve all continent candidates");
}

const merged = [
  ...(pilotAsset.countries || []),
  ...(batch01Asset.countries || []),
  ...countries,
].sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2));
assert.equal(merged.length, 35, "Pilot + Batch 01 + Batch 02 should merge to 35 countries");
assert.deepEqual(merged.map((country) => country.isoAlpha2).sort(), [...expectedPilot, ...expectedBatch01, ...expectedBatch02].sort(), "Merged country set mismatch");
assertNoDuplicateValues(merged, "isoAlpha2");
assertNoDuplicateValues(merged, "isoAlpha3");
assertNoDuplicateValues(merged, "wikidataId");
assertNoDuplicateValues(merged, "entityId");
assert.equal(dedupeCountryEntities(merged).conflicts.length, 0, "Three-batch merge should pass shared deduper");
assert.equal(
  Object.keys(pilotProvenance.provenance || {}).length +
    Object.keys(batch01Provenance.provenance || {}).length +
    Object.keys(provenanceAsset.provenance || {}).length,
  35,
  "Merged provenance should remain one-to-one",
);

const rerunInput = countries.map((country) => ({
  isoAlpha2: country.isoAlpha2,
  isoAlpha3: country.isoAlpha3,
  isoNumeric: country.isoNumeric,
  canonicalNameZh: country.canonicalNameZh,
  nameEn: country.canonicalNameEn,
  region: country.region,
  subregion: country.subregion,
}));
const rerunA = normalizeCountryBaseline({ rawSnapshot: raw, pilotCountries: rerunInput });
const rerunB = normalizeCountryBaseline({ rawSnapshot: raw, pilotCountries: rerunInput });
assert.deepEqual(rerunB, rerunA, "Batch 02 normalization should be deterministic");

const serialized = JSON.stringify({ countriesAsset, provenanceAsset, conflictsAsset, reviewAsset });
for (const forbidden of ["accepted-routes.json", "RouteRecord", "plannerReason", "summary", "coverage:", "search-", "route-record-derived"]) {
  assert.equal(serialized.includes(forbidden), false, `Batch 02 assets should not contain ${forbidden}`);
}

const audit = auditKnowledgeCountryBaselineBatch02();
assert.equal(audit.status, "PASS", "Batch 02 audit should pass");
assert.equal(audit.countryCount, 15);
assert.deepEqual(audit.actualCountrySet, expectedBatch02);
assert.equal(audit.provenanceCoverage, 15);
assert.equal(audit.conflicts.blocking, 0);

assert.deepEqual(feedReadyCounts(), countsBefore, "FeedReadyPoolCount should remain unchanged");
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "protected route/cache files changed during Batch 02 verification");

console.log(JSON.stringify({
  status: "PASS",
  batchCountryCount: countries.length,
  mergedCountryCount: merged.length,
  countrySet: countries.map((country) => country.isoAlpha2).sort(),
  reviewTypes: reviewAsset.reviewQueue.map((item) => `${item.isoAlpha2}:${item.type}`).sort(),
  provenanceCoverage: Object.keys(provenanceAsset.provenance || {}).length,
  blockingConflictCount: conflictsAsset.blockingCount,
  deterministicNormalization: true,
  feedReadyPoolCount: countsBefore,
}, null, 2));
