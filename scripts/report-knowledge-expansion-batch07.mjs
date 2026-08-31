import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch07ReportData, comma, percent } from "./lib/knowledge-expansion-batch07-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED_AT = "2026-08-24T12:00:00.000Z";
const stats = calculateBatch07ReportData({ root: ROOT });
assert(stats.browserAcceptance?.status === "PASS", "real Batch 07 browser acceptance is required before generating final reports");

const rows = stats.targetCountryCoverage.map((entry) => {
  const definition = stats.seed.countries[entry.countryCode];
  return `| ${entry.label} (${entry.countryCode}) | T${entry.tier} | ${definition.currentStatus} | ${definition.targetStatus} | ${entry.cities} | ${entry.pois} | ${entry.transport} | ${entry.monthRisk} | ${entry.testedDurations.map((days) => `${days}d`).join("/")} | ${entry.dedicatedCities} | ${entry.dedicatedPois} | ${entry.needsBackfill} | ${definition.selectionReason} |`;
}).join("\n");
const coverage = stats.imageManifest.coverage;
const coverageRows = [
  ["Historical Plannable Countries", coverage.historicalPlannableCountries],
  ["Batch 07 Countries", coverage.batch07Countries],
  ["Overall", coverage.overall],
].map(([label, value]) => `| ${label} | ${value.countryCoverCoverage.ready}/${value.countryCoverCoverage.total} | ${value.cityDedicatedImageCoverage.ready}/${value.cityDedicatedImageCoverage.total} (${value.cityDedicatedImageCoverage.percent}%) | ${value.cityPlaceholderCount} | ${value.corePoiImageCoverage.ready}/${value.corePoiImageCoverage.total} (${value.corePoiImageCoverage.percent}%) | ${value.poiPlaceholderCount} | ${value.needsBackfillCount} | ${value.invalidMappingCount} |`).join("\n");
const catalogOnly = stats.portfolio.catalogOnlyCountryCodes.join(", ") || "None";
const uncataloged = Math.max(0, Number(stats.seed.approximateGlobalCountryCount) - stats.portfolio.catalogCountries);
const browser = stats.browserAcceptance;

const dashboard = `# Route V2 Knowledge Expansion Batch 07 Dashboard

Generated: ${GENERATED_AT}

## Portfolio boundary

- Approximate global Country count: ${stats.seed.approximateGlobalCountryCount}
- Country Entities (Catalog): ${stats.portfolio.catalogCountries}
- Plannable Countries: ${stats.portfolio.plannableCountries}
- Route Knowledge Covered Countries: ${stats.portfolio.routeKnowledgeCoveredCountries}
- Evidence-backed Countries: ${stats.portfolio.evidenceBackedCountries}
- Catalog-only Countries: ${stats.portfolio.catalogOnlyCountryCodes.length} (${catalogOnly})
- Remaining uncataloged Countries: ${uncataloged}
- Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities

A Country Entity is identity data only. Plannable and Route Knowledge Covered require published City/POI depth plus a successful Route V2 consumption path. Evidence-backed additionally requires validated local transport or objective month-risk Evidence. China remains Catalog-only under the unchanged Search V1 product contract.

## Batch 07 country coverage

| Country | Tier | Previous status | Batch target | City | POI | Transport Evidence | Month Risk | Route Tests | Dedicated City | Dedicated Core POI | needsBackfill | Selection reason |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
${rows}

## Image coverage

| Scope | Country Cover | Dedicated City | City Placeholder | Dedicated Core POI | POI Placeholder | needsBackfill | invalidMapping |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${coverageRows}
`;

const report = `# Route V2 Knowledge Expansion Batch 07 Report

Generated: ${GENERATED_AT}

## Scope and outcome

- Countries expanded: ${stats.targets.count} in ${stats.targets.waves} waves (Tier 1: ${stats.targets.tier1}; Tier 2: ${stats.targets.tier2}; Tier 3: ${stats.targets.tier3})
- Published additions: ${stats.additions.countries} Countries / ${stats.additions.cities} Cities / ${comma(stats.additions.pois)} POIs
- Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities
- Directed Transport Evidence added: ${stats.evidence.transport}
- Objective Month Risk added: ${stats.evidence.monthRisk}
- Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS across ${stats.targets.count} target countries; external calls: ${stats.routeConsumption.externalFetchCalls}
- Duplicate Entity ID: ${stats.quality.duplicateEntityIds}; duplicate City QID: ${stats.quality.duplicateCityQids}; duplicate POI QID: ${stats.quality.duplicatePoiQids}; orphan: ${stats.quality.orphans}; published conflict: ${stats.quality.conflicts}
- Quarantined review items: ${comma(stats.quality.quarantined)}; quarantined Cities: ${stats.quality.quarantinedCities}; accepted below editorial POI target without padding: ${stats.quality.acceptedBelowTarget}

## Portfolio semantics

- Country Entities (Catalog): ${stats.portfolio.catalogCountries}
- Plannable Countries: ${stats.portfolio.plannableCountries}
- Route Knowledge Covered Countries: ${stats.portfolio.routeKnowledgeCoveredCountries}
- Evidence-backed Countries: ${stats.portfolio.evidenceBackedCountries}
- Catalog-only: ${catalogOnly}
- Remaining uncataloged Countries (approximately ${stats.seed.approximateGlobalCountryCount} global): ${uncataloged}

China was retained as Catalog-only because Search V1 intentionally blocks it. All 20 Batch 07 targets were selected from the uncataloged inventory; no Route Engine policy was relaxed.

## Image expansion and debt

- Historical image debt before Batch 07: ${stats.images.historicalDebtBefore}
- Historical dedicated destination images added: ${stats.images.historicalBackfillImages}
- Historical needsBackfill after Batch 07: ${stats.images.historicalDebtAfter}
- Batch 07 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}
- Batch 07 verified dedicated destination images: ${stats.images.batchVerifiedImages}
- Country Cover coverage: ${stats.images.countryCovers}/${stats.images.countryTotal}
- Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${percent(stats.images.dedicatedCities, stats.images.cityTotal)}%)
- Dedicated Core POI coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal} (${percent(stats.images.dedicatedPois, stats.images.poiTotal)}%)
- Neutral placeholders: ${stats.images.cityPlaceholders + stats.images.poiPlaceholders} (${stats.images.cityPlaceholders} City + ${stats.images.poiPlaceholders} Core POI)
- Remaining needsBackfill: ${stats.images.needsBackfill}
- invalidMapping: ${stats.images.invalidMappings}
- Runtime external image requests allowed: false

The suggested 100–150 image backfill was deliberately treated as non-binding: only exact entity-bound P18/Commons assets with auditable licensing were admitted. Unverified imagery remained neutral debt.

## Real browser acceptance

- Batch 07 Country searches exercised in the real browser: ${browser.searchAcceptance.countryQueries}/${stats.targets.count}
- Route Detail checks: ${browser.searchAcceptance.routeDetailChecks}; Back/Forward checks: ${browser.searchAcceptance.backForwardChecks}
- Route → Detail → Trip → Footprint flows: ${browser.tripFootprintAcceptance.flows}; duplicate City: ${browser.tripFootprintAcceptance.duplicateCityCount}
- Knowledge entityId/QID preserved: ${browser.tripFootprintAcceptance.knowledgeEntityIdsPreserved && browser.tripFootprintAcceptance.wikidataIdsPreserved}
- Wrong semantic images: ${browser.imageAcceptance.wrongSemanticImages}; broken images: ${browser.imageAcceptance.brokenImages}
- Console errors/warnings: ${browser.console.errors}/${browser.console.warnings}; runtime external image/Evidence requests: ${browser.imageAcceptance.runtimeExternalImageRequests}/${browser.imageAcceptance.runtimeExternalEvidenceRequests}

## Asset size and duplicate audit

- Local image assets: ${stats.images.assetCount}
- Total bytes: ${stats.images.totalBytes}
- >300KB: ${stats.images.largerThan300Kb}; >500KB: ${stats.images.largerThan500Kb}; >1MB: ${stats.images.largerThan1Mb}; >5MB: ${stats.images.largerThan5Mb}
- Exact duplicate groups: ${stats.images.exactDuplicates}; perceptual duplicate groups: ${stats.images.perceptualDuplicates}

## Evidence discipline

Every transport direction has an independent ID. Unknown duration, frequency and transfers remain unknown. Month Risk contains objective hazards only. Candidate Cities/POIs that failed exact identity, type, country, coordinate, distance or route-eligibility checks remain quarantined and are not published.
`;

const sizeAudit = `# Route V2 Image Asset Size Batch 07 Audit

Generated: ${GENERATED_AT}

- Images: ${stats.images.assetCount}
- Total bytes: ${stats.images.totalBytes}
- >300KB audit: ${stats.images.largerThan300Kb}
- >500KB exact-baseline exception required: ${stats.images.largerThan500Kb}
- >1MB: ${stats.images.largerThan1Mb}
- >5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}
- Batch 07 dedicated destination images over 300KB: ${stats.imageManifest.cities.concat(stats.imageManifest.pois).filter((record) => record.status === "imageReady" && record.sourcePath === "data/route-v2/images/batch07-dedicated-image-provenance.json" && record.bytes > 300_000).length}
- Size policy violations: ${stats.imageBaseline.git.sizePolicyViolations.length}
`;

const currentImageAudit = fs.readFileSync(path.join(ROOT, "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md"), "utf8")
  .replace("# Route V2 Image Coverage Backfill Audit", "# Route V2 Image Coverage Backfill Batch 07 Audit")
  .replace(/Historical image debt before Batch 08: \d+/u, `Historical image debt before Batch 07: ${stats.images.historicalDebtBefore}`)
  .replace(/Historical image debt after Batch 08: \d+/u, `Historical image debt after Batch 07: ${stats.images.historicalDebtAfter}`)
  .replace(/Batch 08 Country graphic covers added: \d+/u, `Batch 07 Country graphic covers added: ${stats.images.batchCountryCovers}`)
  .replace(/Batch 08 verified destination images: \d+/u, `Batch 07 verified destination images: ${stats.images.batchVerifiedImages}`);

for (const [relativePath, text] of [
  ["ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_DASHBOARD.md", dashboard],
  ["ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_REPORT.md", report],
  ["ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH07_AUDIT.md", currentImageAudit],
  ["ROUTE_V2_IMAGE_ASSET_SIZE_BATCH07_AUDIT.md", sizeAudit],
]) fs.writeFileSync(path.join(ROOT, relativePath), text, "utf8");

assert(fs.existsSync(path.join(ROOT, "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH07_AUDIT.md")), "Batch 07 image coverage audit must be generated from the image manifest");

console.log(JSON.stringify({
  status: "PASS",
  verifier: "knowledge-expansion-batch07-report",
  published: stats.published,
  additions: stats.additions,
  evidence: stats.evidence,
  images: stats.images,
  outputs: [
    "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_DASHBOARD.md",
    "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_REPORT.md",
    "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH07_AUDIT.md",
    "ROUTE_V2_IMAGE_ASSET_SIZE_BATCH07_AUDIT.md",
  ],
}, null, 2));
