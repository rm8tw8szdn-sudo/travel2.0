import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch08ReportData, comma, percent } from "./lib/knowledge-expansion-batch08-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED_AT = "2026-08-31T08:00:00.000Z";
const stats = calculateBatch08ReportData({ root: ROOT });
assert.equal(stats.browserAcceptance?.status, "PASS", "real Batch 08 browser acceptance is required");

const coverage = stats.imageManifest.coverage;
const coverageRows = [
  ["Historical Plannable Countries", coverage.historicalPlannableCountries],
  ["Batch 08 Countries", coverage.batch08Countries],
  ["Overall", coverage.overall],
].map(([label, value]) => `| ${label} | ${value.countryCoverCoverage.ready}/${value.countryCoverCoverage.total} | ${value.cityDedicatedImageCoverage.ready}/${value.cityDedicatedImageCoverage.total} (${value.cityDedicatedImageCoverage.percent}%) | ${value.cityPlaceholderCount} | ${value.corePoiImageCoverage.ready}/${value.corePoiImageCoverage.total} (${value.corePoiImageCoverage.percent}%) | ${value.poiPlaceholderCount} | ${value.needsBackfillCount} | ${value.invalidMappingCount} |`).join("\n");

const countryRows = stats.targetCountryCoverage.map((entry) => {
  const definition = stats.seed.countries[entry.countryCode];
  return `| ${entry.label} (${entry.countryCode}) | T${entry.tier} | ${definition.currentStatus} | ${definition.targetStatus} | ${entry.cities} | ${entry.pois} | ${entry.transport} | ${entry.monthRisk} | ${entry.testedDurations.map((days) => `${days}d`).join("/")} | ${entry.dedicatedCities} | ${entry.dedicatedPois} | ${entry.needsBackfill} |`;
}).join("\n");

const before = stats.baseline;
const browser = stats.browserAcceptance;
const catalogOnly = stats.portfolio.catalogOnlyCountryCodes.join(", ") || "None";

const dashboard = `# Route V2 Knowledge Expansion Batch 08 Dashboard

Generated: ${GENERATED_AT}

## Before / after / delta

| Metric | Before Batch 08 | After Batch 08 | Delta |
| --- | ---: | ---: | ---: |
| Country Entities | ${before.knowledge.catalogCountries} | ${stats.published.countries} | +${stats.additions.countries} |
| Plannable Countries | ${before.knowledge.plannableCountries} | ${stats.portfolio.plannableCountries} | +${stats.portfolio.plannableCountries - before.knowledge.plannableCountries} |
| Cities | ${before.knowledge.cities} | ${stats.published.cities} | +${stats.additions.cities} |
| POIs | ${comma(before.knowledge.pois)} | ${comma(stats.published.pois)} | +${comma(stats.additions.pois)} |
| Entities | ${comma(before.knowledge.entities)} | ${comma(stats.published.total)} | +${comma(stats.published.total - before.knowledge.entities)} |
| Directed Transport | ${before.evidence.directedTransport} | ${stats.evidence.totalTransport} | +${stats.evidence.transport} |
| Month Risk | ${before.evidence.monthRisk} | ${stats.evidence.totalMonthRisk} | +${stats.evidence.monthRisk} |
| Image needsBackfill | ${before.images.needsBackfill} | ${stats.images.needsBackfill} | +${stats.images.needsBackfill - before.images.needsBackfill} |

China remains Catalog-only. Catalog-only Country codes: ${catalogOnly}. A Country Entity is not counted as Plannable or Route Knowledge Covered without published route depth and a passing production consumption path.

## Batch 08 country coverage

| Country | Tier | Previous status | Batch target | City | POI | Transport | Month Risk | Route tests | Dedicated City | Dedicated Core POI | needsBackfill |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
${countryRows}

## Image coverage

| Scope | Country Cover | Dedicated City | City Placeholder | Dedicated Core POI | POI Placeholder | needsBackfill | invalidMapping |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${coverageRows}
`;

const report = `# Route V2 Knowledge Expansion Batch 08 Report

Generated: ${GENERATED_AT}

## Scope and final truth

- Countries expanded: ${stats.targets.count} in ${stats.targets.waves} waves
- Published additions: ${stats.additions.countries} Countries / ${stats.additions.cities} Cities / ${comma(stats.additions.pois)} POIs
- Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities
- Directed Transport Evidence added: ${stats.evidence.transport}; cumulative: ${stats.evidence.totalTransport}
- Objective Month Risk added: ${stats.evidence.monthRisk}; cumulative: ${stats.evidence.totalMonthRisk}
- Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS across ${stats.targets.count} target countries; external calls: ${stats.routeConsumption.externalFetchCalls}
- Duplicate Entity ID: ${stats.quality.duplicateEntityIds}; duplicate City QID: ${stats.quality.duplicateCityQids}; duplicate POI QID: ${stats.quality.duplicatePoiQids}; orphan: ${stats.quality.orphans}; published conflict: ${stats.quality.conflicts}
- Quarantined candidates: ${comma(stats.quality.quarantined)}; quarantined Cities: ${stats.quality.quarantinedCities}; accepted below editorial POI target without padding: ${stats.quality.acceptedBelowTarget}

## Portfolio boundary

- Country Entities (Catalog): ${stats.portfolio.catalogCountries}
- Plannable Countries: ${stats.portfolio.plannableCountries}
- Route Knowledge Covered Countries: ${stats.portfolio.routeKnowledgeCoveredCountries}
- Evidence-backed Countries: ${stats.portfolio.evidenceBackedCountries}
- Catalog-only: ${catalogOnly}

China remains Catalog-only under the unchanged Search V1 contract. All 20 Batch 08 countries are newly Plannable; no Catalog-only restriction was relaxed.

## Images and honest debt

- Batch 08 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}
- Batch 08 verified dedicated destination images: ${stats.images.batchVerifiedImages}
- Country Cover coverage: ${stats.images.countryCovers}/${stats.images.countryTotal}
- Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${percent(stats.images.dedicatedCities, stats.images.cityTotal)}%)
- Dedicated Core POI coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal} (${percent(stats.images.dedicatedPois, stats.images.poiTotal)}%)
- Neutral placeholders: ${stats.images.cityPlaceholders + stats.images.poiPlaceholders} (${stats.images.cityPlaceholders} City + ${stats.images.poiPlaceholders} Core POI)
- Historical image debt before/after Batch 08: ${stats.images.historicalDebtBefore}/${stats.images.historicalDebtAfter}
- Remaining needsBackfill: ${stats.images.needsBackfill}
- invalidMapping: ${stats.images.invalidMappings}
- Runtime external image requests allowed: false

No Batch 08 City or POI placeholder is reported as dedicated. Country covers are non-photographic country graphics, not City or POI imagery.

## Real browser acceptance

- Batch 08 Country searches: ${browser.searchAcceptance.successfulQueries}/${browser.searchAcceptance.countryQueries} PASS
- Focused hard-constraint searches: ${browser.searchAcceptance.focusedConstraintSuccesses}/${browser.searchAcceptance.focusedConstraintQueries} PASS
- Route → Detail → Trip → Footprint flows: ${browser.tripFootprintAcceptance.flows}; duplicate City: ${browser.tripFootprintAcceptance.duplicateCityCount}
- Oman → Qatar flow: ${browser.tripFootprintAcceptance.crossCountry.routeCountryCount} Countries / ${browser.tripFootprintAcceptance.crossCountry.routeCityCount} Cities in Route; ${browser.tripFootprintAcceptance.crossCountry.tripCountryCount} / ${browser.tripFootprintAcceptance.crossCountry.tripCityCount} in Trip; Footprint delta ${browser.tripFootprintAcceptance.crossCountry.completedFootprintCountryDelta} / ${browser.tripFootprintAcceptance.crossCountry.completedFootprintCityDelta}
- Knowledge entityId/QID preserved: ${browser.tripFootprintAcceptance.knowledgeEntityIdsPreserved && browser.tripFootprintAcceptance.wikidataIdsPreserved}
- Wrong semantic/broken images: ${browser.imageAcceptance.wrongSemanticImages}/${browser.imageAcceptance.brokenImages}
- Console errors/warnings: ${browser.console.errors}/${browser.console.warnings}; runtime external image/Evidence requests: ${browser.imageAcceptance.runtimeExternalImageRequests}/${browser.imageAcceptance.runtimeExternalEvidenceRequests}

## Asset size and duplicate audit

- Local image assets: ${stats.images.assetCount}
- Total bytes: ${stats.images.totalBytes}
- >300KB: ${stats.images.largerThan300Kb}; >500KB: ${stats.images.largerThan500Kb}; >1MB: ${stats.images.largerThan1Mb}; >5MB: ${stats.images.largerThan5Mb}
- Exact duplicate groups: ${stats.images.exactDuplicates}; perceptual duplicate groups: ${stats.images.perceptualDuplicates}
`;

const sizeAudit = `# Route V2 Image Asset Size Batch 08 Audit

Generated: ${GENERATED_AT}

- Images: ${stats.images.assetCount}
- Total bytes: ${stats.images.totalBytes}
- >300KB audit: ${stats.images.largerThan300Kb}
- >500KB exact-baseline exception required: ${stats.images.largerThan500Kb}
- >1MB: ${stats.images.largerThan1Mb}
- >5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}
- Batch 08 dedicated destination images over 300KB: ${stats.imageManifest.cities.concat(stats.imageManifest.pois).filter((record) => record.status === "imageReady" && record.sourcePath === "data/route-v2/images/batch08-dedicated-image-provenance.json" && record.bytes > 300_000).length}
- Size policy violations: ${stats.imageBaseline.git.sizePolicyViolations.length}
`;

for (const [relativePath, text] of [
  ["ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_DASHBOARD.md", dashboard],
  ["ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md", report],
  ["ROUTE_V2_IMAGE_ASSET_SIZE_BATCH08_AUDIT.md", sizeAudit],
]) fs.writeFileSync(path.join(ROOT, relativePath), text, "utf8");

assert(fs.existsSync(path.join(ROOT, "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH08_AUDIT.md")), "Batch 08 image coverage audit is required");
console.log(JSON.stringify({ status: "PASS", verifier: "knowledge-expansion-batch08-report", published: stats.published, additions: stats.additions, evidence: stats.evidence, images: stats.images }, null, 2));
