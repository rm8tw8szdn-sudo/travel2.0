import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateWikidataCountryRows, validateCountryEntitySet } from "../src/lib/routes/index.mjs";
import {
  canonicalRawRecordsForBatch,
  countryBatches,
  loadBatchCountries,
} from "./import-knowledge-country-baseline-pilot.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedCountrySet = ["AT", "BE", "CL", "CO", "CZ", "DK", "FI", "IE", "IL", "NL", "NO", "PE", "PH", "PL", "PT"];
const expectedP1bParents = Object.freeze({
  JP: { entityId: "country-a0509b9eab0ea9ce", wikidataId: "Q17" },
  TR: { entityId: "country-03919f1fd24fd3dc", wikidataId: "Q43" },
  SG: { entityId: "country-e0a550ef5a59c6f9", wikidataId: "Q334" },
});

function readJson(relativePath, fallback = null) {
  const fullPath = path.resolve(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function coverage(countries, predicate) {
  return countries.filter(predicate).length;
}

function summarizeReviews(reviewQueue = []) {
  return Object.fromEntries(reviewQueue.reduce((map, item) => {
    map.set(item.type, (map.get(item.type) || 0) + 1);
    return map;
  }, new Map()));
}

function duplicateValues(countries, field) {
  const counts = new Map();
  for (const country of countries) counts.set(country[field], (counts.get(country[field]) || 0) + 1);
  return [...counts].filter(([value, count]) => value && count > 1).map(([value]) => value).sort();
}

function reviewClass(type = "") {
  if (type === "multiple-country-labels") return "low-value-label-noise";
  if (type === "wikidata-iso-identifiers-missing") return "source-gap-review";
  if (type.includes("capital") || type.includes("continent")) return "high-value-identity-review";
  return "other-manual-review";
}

function priorCountries() {
  return [
    ...readJson("data/knowledge/countries.p1a-pilot.json", { countries: [] }).countries,
    ...readJson("data/knowledge/batches/countries.p1a-batch01.json", { countries: [] }).countries,
    ...readJson("data/knowledge/batches/countries.p1a-batch02.json", { countries: [] }).countries,
  ];
}

export function auditKnowledgeCountryBaselineBatch03() {
  const raw = readJson("data/knowledge/raw/countries-p1a-batch03.wikidata.json", {});
  const countriesAsset = readJson("data/knowledge/batches/countries.p1a-batch03.json", { countries: [] });
  const provenanceAsset = readJson("data/knowledge/batches/provenance.p1a-batch03.json", { provenance: {} });
  const conflictsAsset = readJson("data/knowledge/batches/conflicts.p1a-batch03.json", { conflicts: [] });
  const reviewAsset = readJson("data/knowledge/batches/review-queue.p1a-batch03.json", { reviewQueue: [] });
  const countries = countriesAsset.countries || [];
  const previous = priorCountries();
  const cumulative = [...previous, ...countries].sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2));
  const validation = validateCountryEntitySet(countries);
  const batchSeeds = loadBatchCountries(countryBatches.batch03);
  const canonicalRecords = canonicalRawRecordsForBatch(raw, batchSeeds);
  const aggregated = aggregateWikidataCountryRows(raw);
  const reviews = reviewAsset.reviewQueue || [];
  const provenance = provenanceAsset.provenance || {};
  const entityIds = new Set(countries.map((country) => country.entityId));
  const orphanProvenance = Object.keys(provenance).filter((entityId) => !entityIds.has(entityId)).sort();
  const cumulativeDuplicates = Object.fromEntries(["isoAlpha2", "isoAlpha3", "isoNumeric", "wikidataId", "entityId"]
    .map((field) => [field, duplicateValues(cumulative, field)]));
  const p1bParents = Object.fromEntries(Object.entries(expectedP1bParents).map(([isoAlpha2, expected]) => {
    const actual = cumulative.find((country) => country.isoAlpha2 === isoAlpha2);
    return [isoAlpha2, {
      expected,
      actual: actual ? { entityId: actual.entityId, wikidataId: actual.wikidataId } : null,
      unchanged: actual?.entityId === expected.entityId && actual?.wikidataId === expected.wikidataId,
    }];
  }));
  const nl = countries.find((country) => country.isoAlpha2 === "NL");
  const nlRaw = aggregated.get("NL");
  const israel = countries.find((country) => country.isoAlpha2 === "IL");
  const israelRaw = aggregated.get("IL");
  const blockingConflicts = (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking");
  const status = validation.accepted
    && countries.length === 15
    && countries.map((country) => country.isoAlpha2).sort().join(",") === expectedCountrySet.join(",")
    && Object.values(cumulativeDuplicates).every((values) => values.length === 0)
    && Object.keys(provenance).length === 15
    && orphanProvenance.length === 0
    && blockingConflicts.length === 0
    && (conflictsAsset.conflicts || []).length === 0
    && Object.values(p1bParents).every((item) => item.unchanged)
    && nl?.wikidataId === "Q55"
    && !countries.some((country) => country.wikidataId === "Q29999")
    ? "PASS"
    : "BLOCKED";
  return {
    status,
    countryCount: countries.length,
    cumulativeCountryCount: cumulative.length,
    remainingCountryCount: 195 - cumulative.length,
    expectedCountrySet,
    actualCountrySet: countries.map((country) => country.isoAlpha2).sort(),
    raw: {
      provider: raw.source?.provider,
      retrievedAt: raw.retrievedAt,
      bindingCount: raw.wikidata?.results?.bindings?.length || 0,
      canonicalRecordCount: canonicalRecords.length,
      isoValidation: Object.fromEntries(canonicalRecords.map((record) => [record.isoAlpha2, record.isoValidation])),
    },
    countries: countries.map((country) => ({
      entityId: country.entityId,
      isoAlpha2: country.isoAlpha2,
      isoAlpha3: country.isoAlpha3,
      isoNumeric: country.isoNumeric,
      wikidataId: country.wikidataId,
      canonicalNameEn: country.canonicalNameEn,
      canonicalNameZh: country.canonicalNameZh,
      capital: country.capital,
      coordinates: country.coordinates,
      continent: country.continent,
      region: country.region,
      subregion: country.subregion,
      aliases: country.aliases,
    })),
    coverage: {
      isoAlpha2: coverage(countries, (country) => /^[A-Z]{2}$/u.test(country.isoAlpha2)),
      isoAlpha3: coverage(countries, (country) => /^[A-Z]{3}$/u.test(country.isoAlpha3)),
      isoNumeric: coverage(countries, (country) => /^\d{3}$/u.test(country.isoNumeric)),
      qid: coverage(countries, (country) => /^Q\d+$/u.test(country.wikidataId)),
      canonicalNameEn: coverage(countries, (country) => Boolean(country.canonicalNameEn)),
      canonicalNameZh: coverage(countries, (country) => Boolean(country.canonicalNameZh)),
      capital: coverage(countries, (country) => Boolean(country.capital?.wikidataId && country.capital?.canonicalNameEn)),
      coordinates: coverage(countries, (country) => Boolean(country.coordinates)),
      continent: coverage(countries, (country) => Boolean(country.continent?.wikidataId)),
      provenance: Object.keys(provenance).length,
    },
    identity: {
      batchDuplicates: Object.fromEntries(["isoAlpha2", "isoAlpha3", "isoNumeric", "wikidataId", "entityId"].map((field) => [field, duplicateValues(countries, field)])),
      cumulativeDuplicates,
    },
    provenance: {
      coverage: Object.keys(provenance).length,
      orphanEntityIds: orphanProvenance,
      inlineSidecarMatches: countries.filter((country) => JSON.stringify(country.provenance) === JSON.stringify(provenance[country.entityId])).length,
    },
    conflicts: {
      total: (conflictsAsset.conflicts || []).length,
      blocking: blockingConflicts.length,
      items: conflictsAsset.conflicts || [],
    },
    reviews: {
      total: reviews.length,
      byType: summarizeReviews(reviews),
      byClass: summarizeReviews(reviews.map((review) => ({ type: reviewClass(review.type) }))),
      items: reviews.map((review) => ({ isoAlpha2: review.isoAlpha2, type: review.type, reviewId: review.reviewId, class: reviewClass(review.type) })),
    },
    netherlands: {
      entityId: nl?.entityId,
      wikidataId: nl?.wikidataId,
      canonicalNameEn: nl?.canonicalNameEn,
      iso: nl ? { isoAlpha2: nl.isoAlpha2, isoAlpha3: nl.isoAlpha3, isoNumeric: nl.isoNumeric } : null,
      capital: nl?.capital,
      coordinates: nl?.coordinates,
      continent: nl?.continent,
      rawQid: nlRaw?.wikidataId,
      rawIsoValidation: canonicalRecords.find((record) => record.isoAlpha2 === "NL"),
      isoProvenance: nl ? Object.fromEntries(["isoAlpha2", "isoAlpha3", "isoNumeric"].map((field) => [field, nl.provenance[field]])) : null,
      missingIsoReviews: reviews.filter((review) => review.isoAlpha2 === "NL" && review.type === "wikidata-iso-identifiers-missing"),
    },
    israel: {
      wikidataId: israel?.wikidataId,
      selectedCapital: israel?.capital,
      capitalCandidates: [...(israelRaw?.capitalCandidates || new Map()).values()].map((candidate) => ({ ...candidate, aliases: [...candidate.aliases] })),
      selectedContinent: israel?.continent,
      continentCandidates: [...(israelRaw?.continentCandidates || new Map()).values()],
      handling: "Wikidata P30/P36 source facts with deterministic selection and conditional review when multiple candidates exist.",
    },
    p1bParents,
    validation,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(auditKnowledgeCountryBaselineBatch03(), null, 2));
}
