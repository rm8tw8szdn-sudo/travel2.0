import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCountryEntitySet } from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath, fallback = null) {
  const fullPath = path.resolve(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

export function auditKnowledgeCountryBaselinePilot() {
  const countriesAsset = readJson("data/knowledge/countries.p1a-pilot.json", { countries: [] });
  const provenanceAsset = readJson("data/knowledge/provenance.p1a-pilot.json", { provenance: {} });
  const conflictsAsset = readJson("data/knowledge/conflicts.p1a-pilot.json", { conflicts: [] });
  const reviewAsset = readJson("data/knowledge/review-queue.p1a-pilot.json", { reviewQueue: [] });
  const countries = countriesAsset.countries || [];
  const validation = validateCountryEntitySet(countries);
  const countWith = (predicate) => countries.filter(predicate).length;
  const sourceTypes = new Map();
  for (const country of countries) {
    sourceTypes.set(country.entitySourceType || "unknown", (sourceTypes.get(country.entitySourceType || "unknown") || 0) + 1);
  }
  return {
    status: validation.accepted && (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking").length === 0 ? "PASS" : "BLOCKED",
    countryCount: countries.length,
    expectedCountrySet: ["AD", "CD", "FJ", "JP", "MA"],
    actualCountrySet: countries.map((country) => country.isoAlpha2).sort(),
    isoAlpha2Coverage: countWith((country) => /^[A-Z]{2}$/u.test(country.isoAlpha2)),
    isoAlpha3Coverage: countWith((country) => /^[A-Z]{3}$/u.test(country.isoAlpha3)),
    qidCoverage: countWith((country) => /^Q\d+$/u.test(country.wikidataId)),
    canonicalNameZhCoverage: countWith((country) => Boolean(country.canonicalNameZh)),
    canonicalNameEnCoverage: countWith((country) => Boolean(country.canonicalNameEn)),
    capitalCoverage: countWith((country) => Boolean(country.capital?.wikidataId && country.capital?.canonicalNameEn)),
    coordinateCoverage: countWith((country) => Boolean(country.coordinates)),
    provenanceCoverage: Object.keys(provenanceAsset.provenance || {}).length,
    conflicts: {
      total: (conflictsAsset.conflicts || []).length,
      blocking: (conflictsAsset.conflicts || []).filter((item) => item.severity === "blocking").length,
      byType: Object.fromEntries((conflictsAsset.conflicts || []).reduce((map, item) => {
        map.set(item.type, (map.get(item.type) || 0) + 1);
        return map;
      }, new Map())),
    },
    reviewQueue: {
      total: (reviewAsset.reviewQueue || []).length,
      byType: Object.fromEntries((reviewAsset.reviewQueue || []).reduce((map, item) => {
        map.set(item.type, (map.get(item.type) || 0) + 1);
        return map;
      }, new Map())),
    },
    missingFieldsByCountry: Object.fromEntries(countries.map((country) => [
      country.isoAlpha2,
      [
        "entityId",
        "isoAlpha2",
        "isoAlpha3",
        "wikidataId",
        "canonicalNameZh",
        "canonicalNameEn",
        "aliases",
        "capital",
        "continent",
        "coordinates",
        "provenance",
        "retrievedAt",
        "confidence",
      ].filter((field) => {
        if (field === "aliases") return !Array.isArray(country.aliases);
        if (field === "capital") return !country.capital?.wikidataId || !country.capital?.canonicalNameEn;
        if (field === "continent") return !country.continent?.canonicalNameEn;
        if (field === "coordinates") return !country.coordinates;
        return !country[field];
      }),
    ])),
    sourceDistribution: Object.fromEntries([...sourceTypes.entries()].sort()),
    validation,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(auditKnowledgeCountryBaselinePilot(), null, 2));
}
