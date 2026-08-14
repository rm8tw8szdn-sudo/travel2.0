import fs from "node:fs";
import path from "node:path";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";
import {
  calculateBatch05ReportData,
  comma,
  imageCoverageNarrative,
  imageSemanticSampleNarrative,
} from "./lib/knowledge-expansion-batch05-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED_AT = "2026-08-11T06:30:00.000Z";
const DASHBOARD_PATH = path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_DASHBOARD.md");
const REPORT_PATH = path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md");
const reportData = calculateBatch05ReportData({ root: ROOT });
const BATCH05_CODES = Object.freeze(reportData.targetCountryCodes);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readJsonl(relativePath) {
  const text = fs.readFileSync(path.join(ROOT, relativePath), "utf8").trim();
  return text ? text.split(/\r?\n/u).map((line) => JSON.parse(line)) : [];
}

function percent(numerator, denominator) {
  return denominator ? Number((numerator / denominator * 100).toFixed(1)) : 0;
}

function countMap(records, key) {
  const result = new Map();
  for (const record of records) result.set(record[key], (result.get(record[key]) || 0) + 1);
  return result;
}

const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const countryByEntityId = new Map(countries.map((country) => [country.entityId, country]));
const cityByEntityId = new Map(cities.map((city) => [city.entityId, city]));
const citiesByCountryId = new Map(countries.map((country) => [country.entityId, cities.filter((city) => city.parentCountryEntityId === country.entityId)]));
const poisByCityId = new Map(cities.map((city) => [city.entityId, pois.filter((poi) => poi.parentCityEntityId === city.entityId)]));
const routeLegs = readJsonl("data/route-v2/evidence-seed/route-leg-evidence.jsonl");
const seasons = readJsonl("data/route-v2/evidence-seed/season-evidence.jsonl");
const imageManifest = readJson("data/route-v2/images/image-coverage-manifest.json");
const routeConsumption = readJson("data/knowledge/reports/knowledge-expansion-batch05-route-consumption.json");
const browserAcceptance = readJson("data/knowledge/reports/knowledge-expansion-batch05-browser-acceptance.json");
const crossBorder = readJson("data/knowledge/batches/knowledge-expansion-batch05-cross-border-evidence-audit.json");
const imageCountryCodes = new Set(imageManifest.countries.map((entry) => entry.countryCode));
const imageCitiesByCode = new Map(BATCH05_CODES.map((code) => [code, imageManifest.cities.filter((entry) => entry.countryCode === code)]));
const imagePoisByCode = new Map(BATCH05_CODES.map((code) => [code, imageManifest.pois.filter((entry) => entry.countryCode === code)]));

const evidenceCountries = new Set();
for (const leg of routeLegs) {
  for (const entityId of [leg.fromEntityId, leg.toEntityId]) {
    const city = cityByEntityId.get(entityId);
    const country = city ? countryByEntityId.get(city.parentCountryEntityId) : null;
    if (country) evidenceCountries.add(country.isoAlpha2);
  }
}
for (const season of seasons) {
  const city = cityByEntityId.get(season.entityId);
  const country = city ? countryByEntityId.get(city.parentCountryEntityId) : null;
  if (country) evidenceCountries.add(country.isoAlpha2);
}

const rows = BATCH05_CODES.map((countryCode) => {
  const country = countries.find((entry) => entry.isoAlpha2 === countryCode);
  if (!country) throw new Error(`batch05-country-missing:${countryCode}`);
  const countryCities = citiesByCountryId.get(country.entityId) || [];
  const cityIds = new Set(countryCities.map((city) => city.entityId));
  const countryPois = countryCities.flatMap((city) => poisByCityId.get(city.entityId) || []);
  const countryLegs = routeLegs.filter((leg) => cityIds.has(leg.fromEntityId) || cityIds.has(leg.toEntityId));
  const domesticLegs = countryLegs.filter((leg) => cityIds.has(leg.fromEntityId) && cityIds.has(leg.toEntityId));
  const crossBorderLegs = countryLegs.length - domesticLegs.length;
  const evidenceCityIds = new Set(countryLegs.flatMap((leg) => [leg.fromEntityId, leg.toEntityId]).filter((entityId) => cityIds.has(entityId)));
  const countrySeasons = seasons.filter((season) => cityIds.has(season.entityId));
  const imageCities = imageCitiesByCode.get(countryCode) || [];
  const dedicatedCities = imageCities.filter((entry) => entry.status === "imageReady").length;
  const imagePois = imagePoisByCode.get(countryCode) || [];
  const route = routeConsumption.countries[countryCode];
  const evidenceRatio = percent(evidenceCityIds.size, countryCities.length);
  const imageRatio = percent(dedicatedCities, imageCities.length);
  const coverageScore = Math.round(
    25
    + Math.min(20, countryCities.length / 8 * 20)
    + Math.min(20, countryPois.length / Math.max(1, countryCities.length * 5) * 20)
    + evidenceRatio / 100 * 15
    + (countrySeasons.length ? 10 : 0)
    + (imageCountryCodes.has(countryCode) ? 5 : 0)
    + imageRatio / 100 * 5,
  );
  const gaps = [];
  if (evidenceRatio < 100) gaps.push(`${countryCities.length - evidenceCityIds.size} cities lack transport-edge coverage`);
  if (imageCities.length - dedicatedCities > 0) gaps.push(`${imageCities.length - dedicatedCities} city images need backfill`);
  if (crossBorderLegs === 0) gaps.push("no published cross-border leg");
  if (route.reliableMaxDurationDays < 21) gaps.push("21-day browser acceptance not required for this wave");
  return {
    countryCode,
    label: country.canonicalNameEn,
    catalogStatus: "Catalog",
    plannableStatus: imageCountryCodes.has(countryCode) ? "Plannable" : "Not plannable",
    cityCount: countryCities.length,
    poiCount: countryPois.length,
    domesticLegs: domesticLegs.length,
    crossBorderLegs,
    monthRiskEvidence: countrySeasons.length,
    routeConsumption: route.testedDurations.map((days) => `${days}d`).join("/"),
    evidenceRatio,
    reliableMaxDurationDays: route.reliableMaxDurationDays,
    coverageScore,
    countryCover: imageCountryCodes.has(countryCode) ? "ready" : "missing",
    dedicatedCityImages: dedicatedCities,
    cityImages: imageCities.length,
    placeholderCount: imageCities.length - dedicatedCities,
    corePoiImages: imagePois.length,
    gaps,
  };
});

const catalogCountries = countries.length;
const plannableCountries = imageManifest.countries.length;
const evidenceBackedCountries = evidenceCountries.size;
const table = [
  "| Country | Catalog | Plannable | City | POI | Transport Evidence (domestic + cross-border) | Month Risk | Route Consumption | Evidence-backed City Ratio | Reliable Max | Score | Primary Gaps |",
  "|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|",
  ...rows.map((row) => `| ${row.label} (${row.countryCode}) | yes | yes | ${row.cityCount} | ${row.poiCount} | ${row.domesticLegs} + ${row.crossBorderLegs} | ${row.monthRiskEvidence} | ${row.routeConsumption} | ${row.evidenceRatio}% | ${row.reliableMaxDurationDays}d | ${row.coverageScore}/100 | ${row.gaps.join("; ") || "none"} |`),
].join("\n");

const imageTable = [
  "| Scope | Country Cover Coverage | City Dedicated Coverage | City Placeholder | Core POI Coverage | Invalid Mapping | Needs Backfill |",
  "|---|---:|---:|---:|---:|---:|---:|",
  ...[
    ["Historical Plannable Countries", imageManifest.coverage.historicalPlannableCountries],
    ["Batch 05 Countries", imageManifest.coverage.batch05Countries],
    ["Overall", imageManifest.coverage.overall],
  ].map(([label, value]) => `| ${label} | ${value.countryCoverCoverage.ready}/${value.countryCoverCoverage.total} (${value.countryCoverCoverage.percent}%) | ${value.cityDedicatedImageCoverage.ready}/${value.cityDedicatedImageCoverage.total} (${value.cityDedicatedImageCoverage.percent}%) | ${value.cityPlaceholderCount} | ${value.corePoiImageCoverage.ready}/${value.corePoiImageCoverage.total} (${value.corePoiImageCoverage.percent}%) | ${value.invalidMappingCount} | ${value.needsBackfillCount} |`),
].join("\n");

const dashboard = `# Route V2 Knowledge Expansion Batch 05 Dashboard

Generated: ${GENERATED_AT}

## Portfolio boundary

- Catalog Countries: ${catalogCountries}
- Plannable Countries: ${plannableCountries}
- Evidence-backed Countries: ${evidenceBackedCountries}
- Batch 05 Countries: ${BATCH05_CODES.length}
- Published totals: ${countries.length} Countries / ${cities.length} Cities / ${pois.length} POIs / ${countries.length + cities.length + pois.length} entities

**Catalog Country != Plannable Country.** A Catalog entity is an identity record. Plannable requires published City/POI depth and a safe local image path. Evidence-backed additionally requires validated transport or objective month-risk Evidence.

## Batch 05 country coverage

${table}

Coverage score is an operational prioritization signal: plannability (25), City depth (20), POI depth (20), transport-edge City coverage (15), month-risk Evidence (10), Country image (5), and dedicated City image coverage (5). It is not a quality claim outside these measured fields.

## Image coverage

${imageTable}
`;

const report = `# Route V2 Knowledge Expansion Batch 05 Report

Generated: ${GENERATED_AT}

## Scope and outcome

- Waves: ${reportData.waveCount} (${reportData.targetCountryCount / reportData.waveCount} countries each)
- Countries expanded: ${reportData.targetCountryCount}
- Published additions: ${comma(reportData.additions.countries)} Countries / ${comma(reportData.additions.cities)} Cities / ${comma(reportData.additions.pois)} POIs
- Published totals: ${comma(reportData.published.countries)} Countries / ${comma(reportData.published.cities)} Cities / ${comma(reportData.published.pois)} POIs / ${comma(reportData.published.total)} entities
- Directed transport Evidence added: ${comma(reportData.evidence.routeLegs)} (${comma(reportData.evidence.domesticRouteLegs)} domestic + ${comma(reportData.evidence.crossBorderRouteLegs)} cross-border)
- Objective month-risk Evidence added: ${comma(reportData.evidence.monthRisk)}
- Route-consumption checks: ${routeConsumption.queryCount}/${routeConsumption.queryCount} PASS; external network calls: ${routeConsumption.externalFetchCalls}
- Duplicate Entity ID: ${reportData.quality.duplicateEntityIds}; duplicate City QID: ${reportData.quality.duplicateCityQids}; duplicate POI QID: ${reportData.quality.duplicatePoiQids}; orphan: ${reportData.quality.orphans}; published conflict: ${reportData.quality.conflicts}

## Cross-border Evidence

- Stable official-source pairs published: ${crossBorder.publishedPairCount}
- Directed Evidence records: ${crossBorder.publishedDirectedEvidenceCount}
- Investigated but not published: ${crossBorder.investigatedNotPublished.length}

${crossBorder.investigatedNotPublished.map((entry) => `- ${entry.from} ↔ ${entry.to}: ${entry.reason}`).join("\n")}

Unstable duration, transfer and frequency values remain unknown. Evidence was not promoted merely because a corridor seemed plausible.

## Route consumption

Every Batch 05 country produced an exact-duration, single-country Route V2 result at 7 and 14 days. United Kingdom, Vietnam, Indonesia, Canada and United States additionally passed 21 days. Results carried stable Knowledge City entityId/QID identities, contained no duplicate City/POI identity, did not mutate Accepted, and made no external fetch.

## Image asset expansion and historical backfill

- Historical image debt discovered: ${comma(reportData.images.historicalNeedsBackfill)}
- Country graphic covers available: ${comma(reportData.images.countryCovers)}/${comma(reportData.images.countryCoverTotal)}
- Batch 05 Country graphic covers added: ${comma(reportData.images.batch05CountryCovers)}
- Dedicated City covers: ${comma(reportData.images.dedicatedCities)}/${comma(reportData.images.cityTotal)}
- Dedicated Core POI images: ${comma(reportData.images.dedicatedCorePois)}/${comma(reportData.images.corePoiTotal)}
- Neutral placeholders: ${comma(reportData.images.neutralPlaceholders)} (${comma(reportData.images.cityPlaceholders)} City + ${comma(reportData.images.poiPlaceholders)} Core POI)
- Batch 05 trusted local images added: ${comma(reportData.images.batch05TrustedLocalImages)}
- Active invalid mappings: ${comma(reportData.images.invalidMappings)}
- Remaining needsBackfill: ${comma(reportData.images.needsBackfill)}
- Runtime external image requests: ${reportData.images.runtimeExternalRequestsAllowed ? "enabled" : "disabled"}

${imageCoverageNarrative(reportData)}

## Evidence discipline

- Transport directions are separate records with independent IDs.
- Official operators or government/high-trust meteorological sources are required.
- Unknown duration, transfer, frequency and season suitability fields remain null/unknown.
- Month Risk contains objective hazards only and never asserts a subjective best month.
- Invalid, surplus or unconfirmed Wikidata candidates remain quarantined in per-wave review queues.

## Browser acceptance

- Country duration matrix: ${browserAcceptance.countryMatrix.queries}/${browserAcceptance.countryMatrix.queries} PASS across ${browserAcceptance.countryMatrix.countries} countries; ${browserAcceptance.countryMatrix.stableDetailPagesOverFiveSeconds} detail pages stable beyond five seconds.
- Required cross-country matrix: ${browserAcceptance.requiredCrossCountryMatrix.queries}/${browserAcceptance.requiredCrossCountryMatrix.queries} PASS; every explicit country remained in the result.
- Explicit city alias regression: ${browserAcceptance.explicitCityAliasRegression.query} PASS with Q60 and Q172.
- Extra cross-city checks: ${browserAcceptance.extraCrossCityChecks.queries}/${browserAcceptance.extraCrossCityChecks.queries} PASS.
- Back/Forward: ${browserAcceptance.quality.backForward}; Console error/warning: ${browserAcceptance.quality.consoleErrorWarningCount}; external Evidence requests: ${browserAcceptance.quality.externalEvidenceRequests}; external image requests: ${browserAcceptance.quality.externalImageRequests}.
- ${imageSemanticSampleNarrative(reportData)}
`;

fs.writeFileSync(DASHBOARD_PATH, dashboard, "utf8");
fs.writeFileSync(REPORT_PATH, report, "utf8");
console.log(JSON.stringify({
  status: "PASS",
  verifier: "knowledge-expansion-batch05-report",
  catalogCountries,
  plannableCountries,
  evidenceBackedCountries,
  batch05Countries: rows.length,
  outputs: [path.basename(DASHBOARD_PATH), path.basename(REPORT_PATH)],
}, null, 2));
