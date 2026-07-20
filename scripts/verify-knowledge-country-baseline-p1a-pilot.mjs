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
import { auditKnowledgeCountryBaselinePilot } from "./audit-knowledge-country-baseline-pilot.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = path.resolve(projectRoot, "data", "knowledge", "raw", "countries-p1a-pilot.wikidata.json");
const countriesPath = path.resolve(projectRoot, "data", "knowledge", "countries.p1a-pilot.json");
const provenancePath = path.resolve(projectRoot, "data", "knowledge", "provenance.p1a-pilot.json");
const conflictsPath = path.resolve(projectRoot, "data", "knowledge", "conflicts.p1a-pilot.json");
const reviewQueuePath = path.resolve(projectRoot, "data", "knowledge", "review-queue.p1a-pilot.json");
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
const before = statesFor(protectedPaths);
const expectedCountrySet = ["AD", "CD", "FJ", "JP", "MA"];

function readJson(filePath) {
  assert.equal(fs.existsSync(filePath), true, `${path.relative(projectRoot, filePath)} should exist`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function feedReadyCounts() {
  const repo = createAcceptedRouteRepository({ storagePath: acceptedPath });
  return {
    all: repo.list({ limit: 10_000, sessionId: "p1a-country-baseline-count" }).total,
    cross: repo.list({ limit: 10_000, routeType: "cross", sessionId: "p1a-country-baseline-count" }).total,
    single: repo.list({ limit: 10_000, routeType: "single", sessionId: "p1a-country-baseline-count" }).total,
  };
}

const countsBefore = feedReadyCounts();
assert.deepEqual(countsBefore, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline mismatch");

const raw = readJson(rawPath);
const countriesAsset = readJson(countriesPath);
const provenanceAsset = readJson(provenancePath);
const conflictsAsset = readJson(conflictsPath);
const reviewAsset = readJson(reviewQueuePath);
const countries = countriesAsset.countries || [];
assert.equal(raw.source?.provider, "wikidata-sparql", "raw snapshot should come from Wikidata SPARQL");
assert.equal(raw.source?.countryCount, 5, "raw snapshot should cover exactly five pilot countries");
assert.deepEqual([...raw.source.countries].sort(), expectedCountrySet, "raw snapshot country set mismatch");
assert.equal(countries.length, 5, "published pilot countries should be exactly five");
assert.deepEqual(countries.map((country) => country.isoAlpha2).sort(), expectedCountrySet, "published country set mismatch");

const setValidation = validateCountryEntitySet(countries);
assert.equal(setValidation.accepted, true, `country set validation failed: ${setValidation.reasons.join(",")}`);

const iso2 = new Set();
const iso3 = new Set();
const qids = new Set();
for (const country of countries) {
  assert.equal(validateCountryEntity(country).accepted, true, `${country.isoAlpha2} should validate`);
  assert.equal(country.entityType, "country", `${country.isoAlpha2} entityType should be country`);
  assert.equal(country.entitySourceType, "wikidata", `${country.isoAlpha2} should be wikidata-sourced`);
  assert.match(country.isoAlpha2, /^[A-Z]{2}$/u);
  assert.match(country.isoAlpha3, /^[A-Z]{3}$/u);
  assert.match(country.isoNumeric, /^\d{3}$/u);
  assert.match(country.wikidataId, /^Q\d+$/u);
  assert(country.entityId && !country.entityId.includes(country.canonicalNameEn), "entityId must not be display-name based");
  assert(country.canonicalNameZh, `${country.isoAlpha2} should have Chinese name`);
  assert(country.canonicalNameEn, `${country.isoAlpha2} should have English name`);
  assert(Array.isArray(country.aliases), `${country.isoAlpha2} aliases should exist`);
  assert(country.capital?.wikidataId && country.capital?.canonicalNameEn, `${country.isoAlpha2} should have capital`);
  assert(country.continent?.wikidataId && country.continent?.canonicalNameEn, `${country.isoAlpha2} should have continent`);
  assert(country.coordinates?.latitude >= -90 && country.coordinates?.latitude <= 90, `${country.isoAlpha2} latitude valid`);
  assert(country.coordinates?.longitude >= -180 && country.coordinates?.longitude <= 180, `${country.isoAlpha2} longitude valid`);
  assert(country.retrievedAt === raw.retrievedAt, `${country.isoAlpha2} retrievedAt should come from raw snapshot`);
  assert(Number.isFinite(country.confidence) && country.confidence > 0 && country.confidence <= 1, `${country.isoAlpha2} confidence valid`);
  for (const field of ["entityId", "isoAlpha2", "isoAlpha3", "isoNumeric", "wikidataId", "canonicalNameZh", "canonicalNameEn", "aliases", "continent", "region", "subregion", "capital", "coordinates"]) {
    assert(Array.isArray(country.provenance[field]) && country.provenance[field].length > 0, `${country.isoAlpha2} missing provenance for ${field}`);
  }
  const sourceTypes = Object.values(country.provenance).flat().map((entry) => entry.sourceType);
  for (const forbidden of ["coverage-placeholder", "search-fallback", "route-record-derived", "unknown"]) {
    assert.equal(sourceTypes.includes(forbidden), false, `${country.isoAlpha2} should not use forbidden source ${forbidden}`);
  }
  assert(!iso2.has(country.isoAlpha2), "duplicate isoAlpha2 should not publish");
  assert(!iso3.has(country.isoAlpha3), "duplicate isoAlpha3 should not publish");
  assert(!qids.has(country.wikidataId), "duplicate QID should not publish");
  iso2.add(country.isoAlpha2);
  iso3.add(country.isoAlpha3);
  qids.add(country.wikidataId);
}

assert.equal(Object.keys(provenanceAsset.provenance || {}).length, 5, "provenance should cover five countries");
assert.equal((conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking").length, 0, "blocking conflicts should be zero");
assert.equal(Array.isArray(reviewAsset.reviewQueue), true, "review queue should exist");

const normalizerInput = [
  { isoAlpha2: "JP", isoAlpha3: "JPN", isoNumeric: "392", canonicalNameZh: "日本", nameEn: "Japan", region: "东亚", subregion: "East Asia" },
  { isoAlpha2: "AD", isoAlpha3: "AND", isoNumeric: "020", canonicalNameZh: "安道尔", nameEn: "Andorra", region: "南欧", subregion: "Southern Europe" },
  { isoAlpha2: "FJ", isoAlpha3: "FJI", isoNumeric: "242", canonicalNameZh: "斐济", nameEn: "Fiji", region: "美拉尼西亚", subregion: "Melanesia" },
  { isoAlpha2: "MA", isoAlpha3: "MAR", isoNumeric: "504", canonicalNameZh: "摩洛哥", nameEn: "Morocco", region: "北非", subregion: "Northern Africa" },
  { isoAlpha2: "CD", isoAlpha3: "COD", isoNumeric: "180", canonicalNameZh: "刚果民主共和国", nameEn: "Democratic Republic of the Congo", region: "中非", subregion: "Middle Africa" },
];
const normalizedA = normalizeCountryBaseline({ rawSnapshot: raw, pilotCountries: normalizerInput });
const normalizedB = normalizeCountryBaseline({ rawSnapshot: raw, pilotCountries: normalizerInput });
assert.deepEqual(normalizedB, normalizedA, "normalization should be deterministic from same raw snapshot");

const [first] = countries;
assert(dedupeCountryEntities([{ ...first }, { ...first, entityId: "duplicate-iso" }]).conflicts.some((item) => item.type === "isoAlpha2-duplicate"), "duplicate ISO alpha-2 should block");
assert(dedupeCountryEntities([{ ...first }, { ...first, entityId: "duplicate-qid", isoAlpha2: "ZZ", isoAlpha3: "ZZZ" }]).conflicts.some((item) => item.type === "wikidataId-duplicate"), "duplicate QID should block");
assert.equal(validateCountryEntity({ ...first, wikidataId: "bad-qid" }).accepted, false, "invalid QID should fail");
assert.equal(validateCountryEntity({ ...first, coordinates: { latitude: 120, longitude: 0 } }).accepted, false, "invalid coordinates should fail");
assert.equal(validateCountryEntity({ ...first, provenance: {} }).accepted, false, "missing provenance should fail");
assert.equal(validateCountryEntity({ ...first, entityType: "capital" }).accepted, false, "wrong entityType should fail");

const syntheticReview = normalizeCountryBaseline({
  rawSnapshot: {
    retrievedAt: raw.retrievedAt,
    wikidata: {
      results: {
        bindings: [
          {
            iso2: { value: "JP" },
            iso3: { value: "JPN" },
            isoNumeric: { value: "392" },
            country: { value: "http://www.wikidata.org/entity/Q17" },
            countryLabelEn: { value: "Japan" },
            countryLabelZh: { value: "日本" },
            capital: { value: "http://www.wikidata.org/entity/Q1490" },
            capitalLabelEn: { value: "Tokyo" },
            continent: { value: "http://www.wikidata.org/entity/Q48" },
            continentLabelEn: { value: "Asia" },
            coordinate: { value: "Point(138 36)" },
          },
          {
            iso2: { value: "JP" },
            iso3: { value: "JPN" },
            isoNumeric: { value: "392" },
            country: { value: "http://www.wikidata.org/entity/Q17" },
            countryLabelEn: { value: "Japan" },
            countryLabelZh: { value: "日本" },
            capital: { value: "http://www.wikidata.org/entity/Q34600" },
            capitalLabelEn: { value: "Kyoto" },
            continent: { value: "http://www.wikidata.org/entity/Q48" },
            continentLabelEn: { value: "Asia" },
            coordinate: { value: "Point(138 36)" },
          },
        ],
      },
    },
  },
  pilotCountries: [normalizerInput[0]],
});
assert(syntheticReview.reviewQueue.some((item) => item.type === "multiple-capital-candidates"), "multiple capitals should enter review queue");

function syntheticCountryRaw({ continents = [], capital = true } = {}) {
  const base = {
    iso2: { value: "ZZ" },
    iso3: { value: "ZZZ" },
    isoNumeric: { value: "999" },
    country: { value: "http://www.wikidata.org/entity/Q999999" },
    countryLabelEn: { value: "Exampleland" },
    countryLabelZh: { value: "Exampleland ZH" },
    coordinate: { value: "Point(10 20)" },
  };
  const capitalFields = capital ? {
    capital: { value: "http://www.wikidata.org/entity/Q111" },
    capitalLabelEn: { value: "Example City" },
    capitalLabelZh: { value: "Example City ZH" },
  } : {};
  return {
    retrievedAt: raw.retrievedAt,
    wikidata: {
      results: {
        bindings: (continents.length ? continents : [null]).map((continent) => ({
          ...base,
          ...capitalFields,
          ...(continent ? {
            continent: { value: `http://www.wikidata.org/entity/${continent.wikidataId}` },
            continentLabelEn: { value: continent.canonicalNameEn },
            continentLabelZh: { value: continent.canonicalNameZh },
          } : {}),
        })),
      },
    },
  };
}

const syntheticSeed = {
  isoAlpha2: "ZZ",
  isoAlpha3: "ZZZ",
  isoNumeric: "999",
  canonicalNameZh: "Exampleland ZH",
  nameEn: "Exampleland",
  region: "Example Region",
  subregion: "Example Subregion",
};

const singleContinent = normalizeCountryBaseline({
  rawSnapshot: syntheticCountryRaw({
    continents: [{ wikidataId: "Q48", canonicalNameZh: "Asia ZH", canonicalNameEn: "Asia" }],
  }),
  pilotCountries: [syntheticSeed],
});
assert.equal(validateCountryEntity(singleContinent.countries[0]).accepted, true, "single continent candidate should publish");
assert.equal(singleContinent.reviewQueue.some((item) => item.type.includes("continent")), false, "single continent candidate should not enter review");

const duplicateContinent = normalizeCountryBaseline({
  rawSnapshot: syntheticCountryRaw({
    continents: [
      { wikidataId: "Q48", canonicalNameZh: "Asia ZH", canonicalNameEn: "Asia" },
      { wikidataId: "Q48", canonicalNameZh: "Asia ZH", canonicalNameEn: "Asia" },
    ],
  }),
  pilotCountries: [syntheticSeed],
});
assert.equal(duplicateContinent.reviewQueue.some((item) => item.type.includes("continent")), false, "duplicate same continent should dedupe and avoid review");

const multipleContinent = normalizeCountryBaseline({
  rawSnapshot: syntheticCountryRaw({
    continents: [
      { wikidataId: "Q48", canonicalNameZh: "Asia ZH", canonicalNameEn: "Asia" },
      { wikidataId: "Q15", canonicalNameZh: "Africa ZH", canonicalNameEn: "Africa" },
    ],
  }),
  pilotCountries: [syntheticSeed],
});
const multipleContinentReview = multipleContinent.reviewQueue.find((item) => item.type === "multiple-continent-candidates");
assert(multipleContinentReview, "multiple continent candidates should enter review queue");
assert.deepEqual(multipleContinentReview.candidates.map((item) => item.wikidataId).sort(), ["Q15", "Q48"], "continent review should preserve all candidates");

const overrideContinent = normalizeCountryBaseline({
  rawSnapshot: syntheticCountryRaw({
    continents: [
      { wikidataId: "Q48", canonicalNameZh: "Asia ZH", canonicalNameEn: "Asia" },
      { wikidataId: "Q15", canonicalNameZh: "Africa ZH", canonicalNameEn: "Africa" },
    ],
  }),
  pilotCountries: [{
    ...syntheticSeed,
    continentOverride: {
      wikidataId: "Q999",
      canonicalNameZh: "Curated Region ZH",
      canonicalNameEn: "Curated Region",
      source: "P1A test curated override",
    },
  }],
});
assert.equal(overrideContinent.countries[0].continent.wikidataId, "Q999", "curated override should select canonical continent");
const overrideReview = overrideContinent.reviewQueue.find((item) => item.type === "multiple-continent-candidates-with-curated-override");
assert(overrideReview, "curated override should still preserve multiple raw continent candidates in review");
assert(overrideContinent.countries[0].provenance.continent.some((entry) => entry.sourceType === "manual-override"), "curated override should be preserved in provenance");
assert(overrideContinent.countries[0].provenance.continent.some((entry) => entry.sourceType === "wikidata" && entry.value?.candidates?.length === 2), "raw Wikidata continent candidates should remain in provenance");

const missingContinent = normalizeCountryBaseline({
  rawSnapshot: syntheticCountryRaw({ continents: [] }),
  pilotCountries: [syntheticSeed],
});
assert(missingContinent.reviewQueue.some((item) => item.type === "continent-candidate-missing"), "missing continent should enter review queue");
assert(missingContinent.conflicts.some((item) => item.type === "country-validation-failed"), "missing continent should not be silently filled");

assert(reviewAsset.reviewQueue.some((item) => item.isoAlpha2 === "FJ" && item.type === "multiple-country-labels"), "Fiji real data should keep label review item");
assert.equal(reviewAsset.reviewQueue.some((item) => item.isoAlpha2 === "FJ" && item.type.includes("continent")), false, "Fiji real data should not create continent review with current single P30 candidate");

const serializedPublished = JSON.stringify({ countriesAsset, provenanceAsset, conflictsAsset, reviewAsset });
for (const forbidden of ["accepted-routes.json", "RouteRecord", "plannerReason", "summary", "coverage:", "search-", "route-record-derived"]) {
  assert.equal(serializedPublished.includes(forbidden), false, `published country baseline should not contain ${forbidden}`);
}

const audit = auditKnowledgeCountryBaselinePilot();
assert.equal(audit.status, "PASS", "pilot audit should pass");
assert.equal(audit.countryCount, 5);
assert.deepEqual(audit.actualCountrySet, expectedCountrySet);
assert.equal(audit.provenanceCoverage, 5);
assert.equal(audit.conflicts.blocking, 0);

assert.deepEqual(feedReadyCounts(), countsBefore, "FeedReadyPoolCount should remain unchanged");
assertStatesUnchanged(before, statesFor(protectedPaths), "protected route/cache files changed during P1A verification");

console.log(JSON.stringify({
  status: "PASS",
  countryCount: countries.length,
  countrySet: countries.map((country) => country.isoAlpha2).sort(),
  wikidataQids: Object.fromEntries(countries.map((country) => [country.isoAlpha2, country.wikidataId])),
  provenanceCoverage: Object.keys(provenanceAsset.provenance || {}).length,
  blockingConflictCount: conflictsAsset.blockingCount,
  reviewQueueCount: reviewAsset.reviewCount,
  deterministicNormalization: true,
  feedReadyPoolCount: countsBefore,
}, null, 2));
