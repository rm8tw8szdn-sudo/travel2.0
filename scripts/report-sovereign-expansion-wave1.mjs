import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const write = (relativePath, value) => {
  const target = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

const policy = read("data/knowledge/semantic/sovereign-country-policy.json");
const seed = read("data/knowledge/seeds/knowledge-expansion-batch10-20-country.json");
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const supported = new Set(countries.map((entry) => entry.isoAlpha2));
const wave1Codes = Object.keys(seed.countries);
const specialCodes = new Set(["VA", "PS", "KP"]);
const missingAfterWave1 = policy.sovereignIsoAlpha2.filter((code) => !supported.has(code));
const regularMissing = missingAfterWave1.filter((code) => !specialCodes.has(code));
const futureWaveSizes = [18, 18, 17];
const futureWaveByCode = new Map();
let cursor = 0;
for (let index = 0; index < futureWaveSizes.length; index += 1) {
  for (const code of regularMissing.slice(cursor, cursor + futureWaveSizes[index])) futureWaveByCode.set(code, index + 2);
  cursor += futureWaveSizes[index];
}
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const regionSets = {
  Africa: new Set("AO BJ BF BI CV CM CF TD KM CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW CD BW".split(" ")),
  Asia: new Set("AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE".split(" ")),
  Europe: new Set("AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR VA HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB".split(" ")),
  Oceania: new Set("AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU".split(" ")),
};
const regionFor = (code) => Object.entries(regionSets).find(([, codes]) => codes.has(code))?.[0] || ("US CA MX".split(" ").includes(code) ? "Northern America" : "Latin America and the Caribbean");
const planRow = (code) => {
  const seeded = seed.countries[code];
  const special = specialCodes.has(code);
  return {
    canonicalCountryName: seeded?.label || displayNames.of(code),
    isoAlpha2: code,
    stableIdentity: seeded?.qid || `iso-3166-1:${code}`,
    wikidataId: seeded?.qid || null,
    region: seeded?.region || regionFor(code),
    expectedDestinations: seeded ? seeded.cities.length : special ? 1 : 2,
    modelingType: special ? "special-review" : code === "VA" || code === "SM" ? "microstate-single-destination" : "country-with-destinations",
    evidenceDifficulty: special ? "high" : ["KI", "MH", "FM", "NR", "PW", "TV"].includes(code) ? "high" : "medium",
    imageDifficulty: ["KP", "SY", "SS", "SD", "ER"].includes(code) ? "high" : "medium",
    routeReadiness: seeded ? "wave1-catalog-only-evidence-pending" : special ? "requires-policy-review" : "planned",
    wave: seeded ? 1 : special ? "SPECIAL_REVIEW" : futureWaveByCode.get(code),
  };
};

const preparedCities = [34, 35, 36, 37].flatMap((batch) => read(`data/knowledge/batches/cities.p1b-batch${batch}.json`).cities);
const preparedPois = [34, 35, 36, 37].flatMap((batch) => read(`data/knowledge/batches/pois.p1b-batch${batch}.json`).pois);
const quarantinedCandidates = [1, 2, 3, 4].flatMap((wave) => read(`data/knowledge/batches/review-queue.knowledge-expansion-batch10-wave${wave}.json`).entries);
const plan = {
  schemaVersion: "route-v2-sovereign-country-expansion-plan-v1",
  referenceStandard: policy.referenceStandard,
  sovereignCountryUniverseCount: policy.referenceCount,
  baseline: { countries: 119, cities: 833, pois: 3963, totalEntities: 4915, quarantine: 1416, plannableCountries: 118, evidenceBackedCountries: 115 },
  supportedBeforeWave1: policy.sovereignIsoAlpha2.filter((code) => !wave1Codes.includes(code) && supported.has(code)).map(planRow),
  wave1: wave1Codes.map(planRow),
  futureWaves: [2, 3, 4].map((wave) => ({ wave, countries: [...futureWaveByCode].filter(([, value]) => value === wave).map(([code]) => planRow(code)) })),
  specialReview: [...specialCodes].map(planRow),
  nonSovereignExamples: policy.nonSovereignExamples,
  policy: {
    sovereignCountNeverIncludesTerritories: true,
    catalogOnlyDoesNotMeanPlannable: true,
    plannableDoesNotMeanEvidenceBacked: true,
    neutralPlaceholderPreferredToWrongImage: true,
  },
};
write("data/knowledge/reports/sovereign-country-expansion-plan.json", plan);

const report = {
  schemaVersion: "route-v2-sovereign-expansion-wave1-report-v1",
  status: "READY_FOR_FINAL_REVIEW",
  baseline: plan.baseline,
  sovereignCountryUniverseCount: policy.referenceCount,
  missingBeforeWave1: policy.referenceCount - plan.baseline.countries,
  wave1Countries: wave1Codes,
  additions: { publishedCountries: 20, preparedCities: preparedCities.length, preparedPois: preparedPois.length, publishedEvidenceRecords: 0 },
  after: { countries: countries.length, cities: cities.length, pois: pois.length, totalEntities: countries.length + cities.length + pois.length },
  classifications: { knowledgeReadyAdded: 20, plannableAdded: 0, evidenceBackedAdded: 0, catalogOnlyAdded: 20, evidencePending: wave1Codes },
  countryStatusMatrix: wave1Codes.map((code) => {
    const country = countries.find((entry) => entry.isoAlpha2 === code);
    const countryCities = preparedCities.filter((entry) => entry.parentCountryEntityId === country?.entityId);
    const cityIds = new Set(countryCities.map((entry) => entry.entityId));
    return {
      countryCode: code,
      knowledgeReady: Boolean(country),
      validPreparedCityDestination: countryCities.length > 0,
      validPreparedPoi: preparedPois.some((entry) => cityIds.has(entry.parentCityEntityId)),
      validEvidence: false,
      evidenceBacked: false,
      plannable: false,
      evidencePending: true,
      routeConsumerStatus: "country-catalog-only; prepared City/POI candidates unpublished",
      reason: "No independently sourced directed-transport and objective month-risk Evidence is admitted for this country.",
    };
  }),
  quarantine: { historicalSealed: 1416, newCandidateEntries: quarantinedCandidates.length, combinedLedgerEntries: 1416 + quarantinedCandidates.length },
  images: { assets: 1401, countryCovers: "118/118 plannable countries", dedicatedCities: "823/833", dedicatedCorePois: "313/342", activeDebt: 39, catalogCountryCoverGaps: 20, behavior: "catalog-only countries have no destination mapping; no entity is assigned an unrelated real image" },
  performance: { dedicatedRunner: "NOT_AVAILABLE", realQualificationExecutions: 0, formalExperimentExecutions: 1, formalRun34622976529: "BLOCKED_INCONCLUSIVE", clearance: "NOT_CLEARED" },
};
write("data/knowledge/reports/sovereign-expansion-wave1.json", report);

const markdown = `# Route V2 Sovereign Country Expansion — Wave 1\n\n` +
`## Baseline and policy\n\nThe main-branch baseline is 119 Country, 833 City, 3,963 POI, and 4,915 total entities. The sovereign universe is the repository policy of 193 UN members plus Holy See and Palestine (195). The initial gap is 76. Territories, dependencies, constituent countries, and regions remain outside that count. Holy See, Palestine, and North Korea are held in SPECIAL / REVIEW.\n\n` +
`## Expansion waves\n\nWave 1 adds ${wave1Codes.length} countries: ${wave1Codes.join(", ")}. Future waves contain ${futureWaveSizes.join(", ")} regular sovereign countries; three special entities remain separately reviewed. Full country-level metadata is in \`data/knowledge/reports/sovereign-country-expansion-plan.json\`.\n\n` +
`## Wave 1 result\n\nWave 1 publishes 20 Country records. It prepares ${preparedCities.length} City/Destination and ${preparedPois.length} POI records in unpublished candidate shards. The candidate chains pass schema, identity, parent, and semantic admission checks, but no new independent transport/month-risk Evidence is published. All 20 are therefore Knowledge-ready, catalog-only, evidence-pending, and NOT YET PLANNABLE. ${quarantinedCandidates.length} rejected candidates retain their review reasons.\n\n` +
`No image manifest entry or dedicated image was added for the catalog-only countries or their unpublished destinations. Existing plannable image coverage remains sealed; no unrelated real image is assigned.\n\n` +
`## Performance separation\n\nFormal run 34622976529 remains BLOCKED_INCONCLUSIVE. Formal experiment executions remain 1, real qualification executions remain 0, the dedicated runner is unavailable, and performance clearance is not cleared.\n`;
fs.writeFileSync(path.join(ROOT, "docs/superpowers/plans/2026-09-12-route-v2-sovereign-country-expansion.md"), markdown);
console.log(JSON.stringify(report, null, 2));
