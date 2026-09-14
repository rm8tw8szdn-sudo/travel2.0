import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const write = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const WAVE_CODES = Object.freeze(["LC", "VC", "ST", "SC", "SL", "SB", "SO", "SS", "SD", "SR", "SY", "TG", "TO", "TM", "TV", "VE", "YE"]);
const READINESS = "wave4-catalog-only-evidence-pending";

const seed = read("data/knowledge/seeds/knowledge-expansion-batch13-17-country.json");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
const preparedCities = [46, 47, 48, 49].flatMap((batch) => read(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [46, 47, 48, 49].flatMap((batch) => read(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
const quarantinedCandidates = [1, 2, 3, 4].flatMap((wave) => read(`data/knowledge/batches/review-queue.knowledge-expansion-batch13-wave${wave}.json`).entries);

const plan = read("data/knowledge/reports/sovereign-country-expansion-plan.json");
const wave4 = plan.futureWaves.find((entry) => entry.wave === 4);
if (!wave4 || JSON.stringify(wave4.countries.map((entry) => entry.isoAlpha2)) !== JSON.stringify(WAVE_CODES)) {
  throw new Error("sealed-wave4-plan-country-set-mismatch");
}
for (const entry of wave4.countries) {
  const reviewed = seed.countries[entry.isoAlpha2];
  entry.canonicalCountryName = reviewed.label;
  entry.wikidataId = reviewed.qid;
  entry.routeReadiness = READINESS;
}
write("data/knowledge/reports/sovereign-country-expansion-plan.json", plan);

const statusMatrix = WAVE_CODES.map((code) => {
  const country = countryByCode.get(code);
  const countryCities = preparedCities.filter((entry) => entry.parentCountryEntityId === country?.entityId);
  const cityIds = new Set(countryCities.map((entry) => entry.entityId));
  return {
    countryCode: code,
    published: Boolean(country),
    preparedCityCount: countryCities.length,
    preparedPoiCount: preparedPois.filter((entry) => cityIds.has(entry.parentCityEntityId)).length,
    validEvidence: false,
    plannable: false,
    evidenceBacked: false,
    catalogOnly: true,
    evidencePending: true,
    routeReadiness: READINESS,
  };
});

const report = {
  schemaVersion: "route-v2-sovereign-expansion-wave4-report-v1",
  status: "READY_FOR_FINAL_REVIEW",
  baseline: { countries: 175, cities: 833, pois: 3963, totalEntities: 4971, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 57 },
  wave4Countries: WAVE_CODES,
  additions: {
    publishedCountries: WAVE_CODES.length,
    preparedCities: preparedCities.length,
    preparedPois: preparedPois.length,
    publishedEvidenceRecords: 0,
    plannableCountries: 0,
    evidenceBackedCountries: 0,
    catalogOnlyCountries: WAVE_CODES.length,
  },
  after: { countries: countries.length, cities: cities.length, pois: pois.length, totalEntities: countries.length + cities.length + pois.length, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 74, remainingSovereignGap: 3, remainingNormalGap: 0, remainingSpecialReviewGap: 3 },
  remainingSpecialReview: ["VA", "PS", "KP"],
  statusMatrix,
  quarantine: { historicalSealed: 1416, wave1Candidates: 2959, wave2Candidates: 1566, wave3Candidates: 1056, newCandidateEntries: quarantinedCandidates.length },
  images: { assets: 1401, countryCovers: "118/118 plannable countries", dedicatedCities: "823/833", dedicatedCorePois: "313/342", activeDebt: 39, invalidMappings: 0, productionChanges: 0 },
  historical: { wave3: { countries: 175, cities: 833, pois: 3963, total: 4971 }, wave1: { countries: 139, cities: 833, pois: 3963, total: 4935 }, wave2: { countries: 157, cities: 833, pois: 3963, total: 4953 }, batch09: { countries: 119, cities: 833, pois: 3963, total: 4915 }, gitAnchoredSnapshotFiles: 26 },
  performance: { dedicatedRunner: "NOT_AVAILABLE", realQualificationExecutions: 0, formalExperimentExecutions: 1, formalRun34622976529: "BLOCKED_INCONCLUSIVE", clearance: "NOT_CLEARED" },
};

write("data/knowledge/reports/sovereign-expansion-wave4.json", report);
console.log(JSON.stringify(report, null, 2));
