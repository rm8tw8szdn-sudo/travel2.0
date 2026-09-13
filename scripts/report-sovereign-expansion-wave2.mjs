import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const write = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
const WAVE_CODES = Object.freeze(["AF", "AG", "BY", "BJ", "BF", "BI", "CV", "CF", "TD", "KM", "CG", "DJ", "DM", "GQ", "ER", "SZ", "GA", "GM"]);
const READINESS = "wave2-catalog-only-evidence-pending";

const seed = read("data/knowledge/seeds/knowledge-expansion-batch11-18-country.json");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByCode = new Map(countries.map((entry) => [entry.isoAlpha2, entry]));
const preparedCities = [38, 39, 40, 41].flatMap((batch) => read(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [38, 39, 40, 41].flatMap((batch) => read(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
const quarantinedCandidates = [1, 2, 3, 4].flatMap((wave) => read(`data/knowledge/batches/review-queue.knowledge-expansion-batch11-wave${wave}.json`).entries);

const plan = read("data/knowledge/reports/sovereign-country-expansion-plan.json");
const wave2 = plan.futureWaves.find((entry) => entry.wave === 2);
if (!wave2 || JSON.stringify(wave2.countries.map((entry) => entry.isoAlpha2)) !== JSON.stringify(WAVE_CODES)) {
  throw new Error("sealed-wave2-plan-country-set-mismatch");
}
for (const entry of wave2.countries) {
  entry.routeReadiness = READINESS;
  if (entry.isoAlpha2 === "CV") {
    entry.canonicalCountryName = seed.countries.CV.label;
    entry.wikidataId = seed.countries.CV.qid;
  }
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
  schemaVersion: "route-v2-sovereign-expansion-wave2-report-v1",
  status: "READY_FOR_FINAL_REVIEW",
  baseline: { countries: 139, cities: 833, pois: 3963, totalEntities: 4935, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 21 },
  wave2Countries: WAVE_CODES,
  additions: {
    publishedCountries: WAVE_CODES.length,
    preparedCities: preparedCities.length,
    preparedPois: preparedPois.length,
    publishedEvidenceRecords: 0,
    plannableCountries: 0,
    evidenceBackedCountries: 0,
    catalogOnlyCountries: WAVE_CODES.length,
  },
  after: { countries: countries.length, cities: cities.length, pois: pois.length, totalEntities: countries.length + cities.length + pois.length, plannableCountries: 118, evidenceBackedCountries: 115, catalogOnlyCountries: 39, remainingSovereignGap: 38 },
  statusMatrix,
  quarantine: { historicalSealed: 1416, wave1Candidates: 2959, newCandidateEntries: quarantinedCandidates.length },
  images: { assets: 1401, countryCovers: "118/118 plannable countries", dedicatedCities: "823/833", dedicatedCorePois: "313/342", activeDebt: 39, invalidMappings: 0, productionChanges: 0 },
  historical: { wave1: "SEALED", wave1Published: { countries: 139, cities: 833, pois: 3963, total: 4935 }, batch09: { countries: 119, cities: 833, pois: 3963, total: 4915 }, gitAnchoredSnapshotFiles: 26 },
  performance: { dedicatedRunner: "NOT_AVAILABLE", realQualificationExecutions: 0, formalExperimentExecutions: 1, formalRun34622976529: "BLOCKED_INCONCLUSIVE", clearance: "NOT_CLEARED" },
};

write("data/knowledge/reports/sovereign-expansion-wave2.json", report);
console.log(JSON.stringify(report, null, 2));
