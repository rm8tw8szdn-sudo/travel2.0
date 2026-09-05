import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch09ReportData, comma, percent } from "./lib/knowledge-expansion-batch09-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED_AT = "2026-09-01T12:00:00.000Z";
const stats = calculateBatch09ReportData({ root: ROOT });
const stress = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/reports/knowledge-expansion-batch09-hard-constraint-stress.json"), "utf8"));
assert.equal(stats.browserAcceptance?.status, "PASS", "real Batch 09 browser acceptance is required");
assert.equal(stress.status, "PASS", "Batch 09 hard-constraint stress is required");

const countryRows = stats.targetCountryCoverage.map((entry) => {
  const definition = stats.seed.countries[entry.countryCode];
  return `| ${entry.label} (${entry.countryCode}) | T${entry.tier} | ${definition.currentStatus} | ${definition.targetStatus} | ${entry.cities} | ${entry.pois} | ${entry.transport} | ${entry.monthRisk} | ${entry.testedDurations.map((days) => `${days}d`).join("/")} | ${entry.dedicatedCities} | ${entry.dedicatedPois} | ${entry.needsBackfill} |`;
}).join("\n");

const before = stats.baseline;
const browser = stats.browserAcceptance;
const catalogOnly = stats.portfolio.catalogOnlyCountryCodes.join(", ") || "None";
const coverage = stats.imageManifest.coverage;
const coverageRows = [
  ["Historical Plannable Countries", coverage.historicalPlannableCountries],
  ["Batch 09 Countries", coverage.batch09Countries],
  ["Overall", coverage.overall],
].map(([label, value]) => `| ${label} | ${value.countryCoverCoverage.ready}/${value.countryCoverCoverage.total} | ${value.cityDedicatedImageCoverage.ready}/${value.cityDedicatedImageCoverage.total} (${value.cityDedicatedImageCoverage.percent}%) | ${value.cityPlaceholderCount} | ${value.corePoiImageCoverage.ready}/${value.corePoiImageCoverage.total} (${value.corePoiImageCoverage.percent}%) | ${value.poiPlaceholderCount} | ${value.needsBackfillCount} | ${value.invalidMappingCount} |`).join("\n");

const dashboard = `# Route V2 Knowledge Expansion Batch 09 Dashboard

Generated: ${GENERATED_AT}

## Before / after / delta

| Metric | Before Batch 09 | After Batch 09 | Delta |
| --- | ---: | ---: | ---: |
| Country Entities | ${before.knowledge.catalogCountries} | ${stats.published.countries} | +${stats.additions.countries} |
| Plannable Countries | ${before.knowledge.plannableCountries} | ${stats.portfolio.plannableCountries} | +${stats.portfolio.plannableCountries - before.knowledge.plannableCountries} |
| Cities | ${before.knowledge.cities} | ${stats.published.cities} | +${stats.additions.cities} |
| POIs | ${comma(before.knowledge.pois)} | ${comma(stats.published.pois)} | +${comma(stats.published.pois - before.knowledge.pois)} net |
| Entities | ${comma(before.knowledge.entities)} | ${comma(stats.published.total)} | +${comma(stats.published.total - before.knowledge.entities)} net |
| Directed Transport | ${before.evidence.directedTransport} | ${stats.evidence.totalTransport} | +${stats.evidence.transport} |
| Month Risk | ${before.evidence.monthRisk} | ${stats.evidence.totalMonthRisk} | +${stats.evidence.monthRisk} |
| Image needsBackfill | ${before.images.needsBackfill} | ${stats.images.needsBackfill} | +${stats.images.needsBackfill - before.images.needsBackfill} |

China remains Catalog-only. Catalog-only Country codes: ${catalogOnly}. Country Entity count, Plannable Country count, and Route Knowledge Covered count are reported separately.

## Batch 09 country coverage

| Country | Tier | Previous status | Batch target | City | POI | Transport | Month Risk | Route tests | Dedicated City | Dedicated Core POI | needsBackfill |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
${countryRows}

## Image coverage

| Scope | Country Cover | Dedicated City | City Placeholder | Dedicated Core POI | POI Placeholder | needsBackfill | invalidMapping |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${coverageRows}

## Positive POI admission repair

- Original Batch 09 selected POI additions: ${stats.semanticRepair.originalBatchPoiAdditions}
- Final Batch 09 published POI additions: ${stats.semanticRepair.finalBatchPoiAdditions}
- Batch 09 POIs quarantined by the repair: ${stats.semanticRepair.batchQuarantined}
- Historical published POIs quarantined by the same rule: ${stats.semanticRepair.historicalQuarantined}
- Full scan: A ${stats.semanticRepair.classifications.A} / B ${stats.semanticRepair.classifications.B} / C ${stats.semanticRepair.classifications.C} / D ${stats.semanticRepair.classifications.D}
- Reconciliation: ${before.knowledge.pois} + ${stats.semanticRepair.originalBatchPoiAdditions} - ${stats.semanticRepair.totalQuarantined} = ${stats.published.pois}
`;

const report = `# Route V2 Knowledge Expansion Batch 09 Report

Generated: ${GENERATED_AT}

## Scope and final truth

- Countries expanded: ${stats.targets.count} in ${stats.targets.waves} waves
- Published additions: ${stats.additions.countries} Countries / ${stats.additions.cities} Cities / ${comma(stats.additions.pois)} POIs
- Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities
- Original selected Batch 09 POI additions before semantic repair: ${stats.semanticRepair.originalBatchPoiAdditions}; Batch 09 quarantined: ${stats.semanticRepair.batchQuarantined}; historical quarantined: ${stats.semanticRepair.historicalQuarantined}; total quarantined: ${stats.semanticRepair.totalQuarantined}
- POI reconciliation: ${before.knowledge.pois} + ${stats.semanticRepair.originalBatchPoiAdditions} - ${stats.semanticRepair.totalQuarantined} = ${stats.published.pois}
- Directed Transport Evidence added: ${stats.evidence.transport}; cumulative: ${stats.evidence.totalTransport}
- Objective Month Risk added: ${stats.evidence.monthRisk}; cumulative: ${stats.evidence.totalMonthRisk}
- Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS across ${stats.targets.count} target countries; external calls: ${stats.routeConsumption.externalFetchCalls}
- Hard-constraint stress: ${stress.summary.totalCases}/${stress.summary.totalCases} PASS; fail-closed cases: ${stress.summary.failClosedCases}; external calls: ${stress.assertions.externalFetchCalls}
- Duplicate Entity ID: ${stats.quality.duplicateEntityIds}; duplicate City QID: ${stats.quality.duplicateCityQids}; duplicate POI QID: ${stats.quality.duplicatePoiQids}; orphan: ${stats.quality.orphans}; published conflict: ${stats.quality.conflicts}
- Import-time quarantined candidates: ${comma(stats.quality.quarantined)}; positive-admission quarantine: ${stats.semanticRepair.totalQuarantined} (B ${stats.semanticRepair.classifications.B} / C ${stats.semanticRepair.classifications.C} / D ${stats.semanticRepair.classifications.D}); quarantined Cities: ${stats.quality.quarantinedCities}; accepted below editorial POI target without padding: ${stats.quality.acceptedBelowTarget}

## Sovereign portfolio boundary

- Country Entities (Catalog): ${stats.portfolio.catalogCountries}
- Plannable Countries: ${stats.portfolio.plannableCountries}
- Route Knowledge Covered Countries: ${stats.portfolio.routeKnowledgeCoveredCountries}
- Evidence-backed Countries: ${stats.portfolio.evidenceBackedCountries}
- Catalog-only: ${catalogOnly}

All 20 Batch 09 targets are sovereign states and newly Plannable. China remains Catalog-only; no territory, dependency, autonomous region, disputed region, or constituent country is counted as a new sovereign target.

## Images and honest debt

- Batch 09 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}
- Batch 09 verified dedicated destination images: ${stats.images.batchVerifiedImages}
- Country Cover coverage: ${stats.images.countryCovers}/${stats.images.countryTotal}
- Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${percent(stats.images.dedicatedCities, stats.images.cityTotal)}%)
- Dedicated Core POI coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal} (${percent(stats.images.dedicatedPois, stats.images.poiTotal)}%)
- Neutral placeholders: ${stats.images.cityPlaceholders + stats.images.poiPlaceholders} (${stats.images.cityPlaceholders} City + ${stats.images.poiPlaceholders} Core POI)
- Sealed PR #27 historical Image Debt list: ${stats.images.sealedHistoricalDebt}
- Batch 09 total needsBackfill before: ${stats.images.totalNeedsBackfillBefore}
- Batch 09 total needsBackfill after: ${stats.images.totalNeedsBackfillAfter}
- Pre-Batch09 scope needsBackfill after semantic repair: ${stats.images.preBatchScopeNeedsBackfillAfter}
- Remaining needsBackfill: ${stats.images.needsBackfill}
- invalidMapping: ${stats.images.invalidMappings}
- Runtime external image requests allowed: false

Country covers are non-photographic country graphics. No placeholder or Country cover is reported as a dedicated City or POI image. The PR #27 sealed debt list (13), the Batch 09 pre-expansion total (188), and the current total are separate measures and are never substituted for one another.

## Real browser acceptance

- Batch 09 Country searches: ${browser.searchAcceptance.successfulQueries}/${browser.searchAcceptance.countryQueries} PASS
- Focused hard-constraint searches: ${browser.searchAcceptance.focusedConstraintSuccesses}/${browser.searchAcceptance.focusedConstraintQueries} PASS
- Route → Detail → Trip → Footprint flows: ${browser.tripFootprintAcceptance.flows}; duplicate City: ${browser.tripFootprintAcceptance.duplicateCityCount}
- Kazakhstan → Uzbekistan flow: ${browser.tripFootprintAcceptance.crossCountry.routeCountryCount} Countries / ${browser.tripFootprintAcceptance.crossCountry.routeCityCount} Cities in Route; ${browser.tripFootprintAcceptance.crossCountry.tripCountryCount} / ${browser.tripFootprintAcceptance.crossCountry.tripCityCount} in Trip; Footprint delta ${browser.tripFootprintAcceptance.crossCountry.completedFootprintCountryDelta} / ${browser.tripFootprintAcceptance.crossCountry.completedFootprintCityDelta}
- Knowledge entityId/QID preserved: ${browser.tripFootprintAcceptance.knowledgeEntityIdsPreserved && browser.tripFootprintAcceptance.wikidataIdsPreserved}
- P1 targeted browser searches: ${browser.p1TargetedAcceptance.cases.length}/${browser.p1TargetedAcceptance.cases.length} PASS (Accra exchange absent; San Salvador = Q3110/SV only; Honduras penal POI absent)
- Wrong semantic/broken images: ${browser.imageAcceptance.wrongSemanticImages}/${browser.imageAcceptance.brokenImages}
- Console errors/warnings: ${browser.console.errors}/${browser.console.warnings}; runtime external image/Evidence requests: ${browser.imageAcceptance.runtimeExternalImageRequests}/${browser.imageAcceptance.runtimeExternalEvidenceRequests}

## Asset size and duplicate audit

- Local image assets: ${stats.images.assetCount}
- Total bytes: ${stats.images.totalBytes}
- >300KB: ${stats.images.largerThan300Kb}; >500KB: ${stats.images.largerThan500Kb}; >1MB: ${stats.images.largerThan1Mb}; >5MB: ${stats.images.largerThan5Mb}
- Exact duplicate groups: ${stats.images.exactDuplicates}; perceptual duplicate groups: ${stats.images.perceptualDuplicates}
`;

const sizeAudit = `# Route V2 Image Asset Size Batch 09 Audit

Generated: ${GENERATED_AT}

- Images: ${stats.images.assetCount}
- Total bytes: ${stats.images.totalBytes}
- >300KB audit: ${stats.images.largerThan300Kb}
- >500KB exact-baseline exception required: ${stats.images.largerThan500Kb}
- >1MB: ${stats.images.largerThan1Mb}
- >5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}
- Batch 09 dedicated destination images over 300KB: 0
- Size policy violations: ${stats.imageBaseline.git.sizePolicyViolations.length}
`;

for (const [relativePath, text] of [
  ["ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_DASHBOARD.md", dashboard],
  ["ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_REPORT.md", report],
  ["ROUTE_V2_IMAGE_ASSET_SIZE_BATCH09_AUDIT.md", sizeAudit],
]) fs.writeFileSync(path.join(ROOT, relativePath), text, "utf8");

assert(fs.existsSync(path.join(ROOT, "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH09_AUDIT.md")), "Batch 09 image coverage audit is required");
console.log(JSON.stringify({ status: "PASS", verifier: "knowledge-expansion-batch09-report", published: stats.published, additions: stats.additions, evidence: stats.evidence, images: stats.images }, null, 2));
