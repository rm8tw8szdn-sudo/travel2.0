import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCountryEntitySet } from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedCountrySet = ["AE", "CH", "CN", "GR", "ID", "IN", "KE", "KR", "MY", "NG", "RU", "SA", "SG", "TH", "VN"];

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

export function auditKnowledgeCountryBaselineBatch02() {
  const countriesAsset = readJson("data/knowledge/batches/countries.p1a-batch02.json", { countries: [] });
  const provenanceAsset = readJson("data/knowledge/batches/provenance.p1a-batch02.json", { provenance: {} });
  const conflictsAsset = readJson("data/knowledge/batches/conflicts.p1a-batch02.json", { conflicts: [] });
  const reviewAsset = readJson("data/knowledge/batches/review-queue.p1a-batch02.json", { reviewQueue: [] });
  const countries = countriesAsset.countries || [];
  const validation = validateCountryEntitySet(countries);
  return {
    status: validation.accepted && (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking").length === 0 ? "PASS" : "BLOCKED",
    countryCount: countries.length,
    expectedCountrySet,
    actualCountrySet: countries.map((country) => country.isoAlpha2).sort(),
    isoAlpha2Coverage: coverage(countries, (country) => /^[A-Z]{2}$/u.test(country.isoAlpha2)),
    isoAlpha3Coverage: coverage(countries, (country) => /^[A-Z]{3}$/u.test(country.isoAlpha3)),
    qidCoverage: coverage(countries, (country) => /^Q\d+$/u.test(country.wikidataId)),
    canonicalNameZhCoverage: coverage(countries, (country) => Boolean(country.canonicalNameZh)),
    canonicalNameEnCoverage: coverage(countries, (country) => Boolean(country.canonicalNameEn)),
    capitalCoverage: coverage(countries, (country) => Boolean(country.capital?.wikidataId && country.capital?.canonicalNameEn)),
    coordinateCoverage: coverage(countries, (country) => Boolean(country.coordinates)),
    provenanceCoverage: Object.keys(provenanceAsset.provenance || {}).length,
    conflicts: {
      total: (conflictsAsset.conflicts || []).length,
      blocking: (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking").length,
    },
    reviewQueue: {
      total: (reviewAsset.reviewQueue || []).length,
      byType: summarizeReviews(reviewAsset.reviewQueue || []),
      items: (reviewAsset.reviewQueue || []).map((item) => ({ isoAlpha2: item.isoAlpha2, type: item.type })),
    },
    validation,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(auditKnowledgeCountryBaselineBatch02(), null, 2));
}
