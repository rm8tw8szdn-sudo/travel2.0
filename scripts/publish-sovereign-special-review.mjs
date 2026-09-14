import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeCountryAliases,
  createCountryEntityId,
  sourceEntry,
  validateCountryEntitySet,
} from "../src/lib/routes/knowledge-country-baseline-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const write = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const SEED_PATH = "data/knowledge/seeds/sovereign-special-review-3-country.json";
const POLICY_PATH = "data/knowledge/semantic/sovereign-special-country-identity-policy.json";
const OUTPUT_PATH = "data/knowledge/batches/countries.p1a-batch14.json";
const PLAN_PATH = "data/knowledge/reports/sovereign-country-expansion-plan.json";
const REPORT_PATH = "data/knowledge/reports/sovereign-special-review.json";
const CODES = ["VA", "PS", "KP"];

const seed = read(SEED_PATH);
const policy = read(POLICY_PATH);

function provenance(code, field, value, sourceType = "wikidata") {
  return [sourceEntry({
    sourceType,
    source: sourceType === "iso" ? "ISO 3166 reviewed special-country seed" : "Reviewed sovereign special-country identity",
    field,
    sourceUrl: sourceType === "wikidata" ? `https://www.wikidata.org/wiki/${seed.countries[code].wikidataId}` : "",
    retrievedAt: seed.retrievedAt,
    value,
  })];
}

const countries = CODES.map((code) => {
  const reviewed = seed.countries[code];
  const entityId = createCountryEntityId({ isoAlpha2: code, wikidataId: reviewed.wikidataId });
  const aliases = canonicalizeCountryAliases(reviewed.aliases)
    .filter((alias) => alias.toLocaleLowerCase("en-US") !== code.toLocaleLowerCase("en-US"));
  const values = {
    entityId,
    isoAlpha2: code,
    isoAlpha3: reviewed.isoAlpha3,
    isoNumeric: reviewed.isoNumeric,
    wikidataId: reviewed.wikidataId,
    canonicalNameZh: reviewed.canonicalNameZh,
    canonicalNameEn: reviewed.canonicalNameEn,
    aliases,
    continent: reviewed.continent,
    region: reviewed.region,
    subregion: reviewed.subregion,
    capital: reviewed.capital,
    coordinates: reviewed.coordinates,
  };
  return {
    schemaVersion: "route-v2-country-baseline-p1a",
    entityType: "country",
    ...values,
    entitySourceType: "wikidata",
    provenance: Object.fromEntries(Object.entries(values).map(([field, value]) => [
      field,
      provenance(code, field, value, ["entityId", "isoAlpha2", "isoAlpha3", "isoNumeric"].includes(field) ? "iso" : "wikidata"),
    ])),
    confidence: 1,
    retrievedAt: seed.retrievedAt,
  };
});

const validation = validateCountryEntitySet(countries);
if (!validation.accepted) throw new Error(`special-country-validation-failed:${validation.reasons.join(",")}`);
write(OUTPUT_PATH, { schemaVersion: "route-v2-country-baseline-p1a-batch14", generatedFrom: SEED_PATH, countryCount: countries.length, countries });

const plan = read(PLAN_PATH);
const specialReviewEntries = plan.specialReview.length ? plan.specialReview : plan.resolvedSpecialReview;
if (JSON.stringify(specialReviewEntries.map((entry) => entry.isoAlpha2)) !== JSON.stringify(CODES)) throw new Error("special-review-plan-set-mismatch");
plan.resolvedSpecialReview = specialReviewEntries.map((entry) => {
  const reviewed = seed.countries[entry.isoAlpha2];
  return {
    ...entry,
    canonicalCountryName: reviewed.canonicalNameEn,
    wikidataId: reviewed.wikidataId,
    region: reviewed.subregion,
    expectedDestinations: 0,
    modelingType: entry.isoAlpha2 === "VA" ? "country-only-related-identity" : "country-only",
    routeReadiness: seed.readiness,
    resolution: "published-catalog-only",
  };
});
plan.specialReview = [];
write(PLAN_PATH, plan);

const report = {
  schemaVersion: "route-v2-sovereign-special-review-report-v1",
  status: "READY_FOR_FINAL_REVIEW",
  baseline: { countries: 192, cities: 833, pois: 3963, totalEntities: 4988, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 74 },
  additions: { publishedCountries: 3, publishedCities: 0, publishedPois: 0, publishedEvidenceRecords: 0, plannableCountries: 0, evidenceBackedCountries: 0, catalogOnlyCountries: 3 },
  after: { countries: 195, cities: 833, pois: 3963, totalEntities: 4991, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 77, remainingNormalGap: 0, remainingSpecialReviewGap: 0 },
  countries: CODES.map((code) => ({ countryCode: code, canonicalNameEn: seed.countries[code].canonicalNameEn, wikidataId: seed.countries[code].wikidataId, published: true, validEvidence: false, plannable: false, evidenceBacked: false, catalogOnly: true, evidencePending: true, routeReadiness: seed.readiness })),
  identityPolicyPath: POLICY_PATH,
  historical: { batch09: "119/833/3963/4915", wave1: "139/833/3963/4935", wave2: "157/833/3963/4953", wave3: "175/833/3963/4971", wave4: "192/833/3963/4988", historicalQuarantine: 1416, gitAnchoredSnapshots: 26 },
  performance: { dedicatedRunner: "NOT_AVAILABLE", realQualificationExecutions: 0, formalExperimentExecutions: 1, formalRun34622976529: "BLOCKED_INCONCLUSIVE", clearance: "NOT_CLEARED" },
};
write(REPORT_PATH, report);
console.log(JSON.stringify({ status: "PASS", output: OUTPUT_PATH, report: REPORT_PATH, countries: CODES }, null, 2));
