import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch09ReportData, comma, percent } from "./lib/knowledge-expansion-batch09-report-data.mjs";
import { verifyHistoricalKnowledgeReportSnapshots } from "./lib/historical-knowledge-report-snapshots.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const stats = calculateBatch09ReportData({ root: ROOT });
const normalize = (value) => value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
const read = (name) => normalize(fs.readFileSync(path.join(ROOT, name), "utf8"));
const reportPath = process.env.ROUTE_V2_BATCH09_REPORT_PATH || path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_REPORT.md");
const report = normalize(fs.readFileSync(reportPath, "utf8"));
const dashboard = read("ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_DASHBOARD.md");
const imageAudit = read("ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH09_AUDIT.md");
const sizeAudit = read("ROUTE_V2_IMAGE_ASSET_SIZE_BATCH09_AUDIT.md");
const browser = JSON.parse(read("data/knowledge/reports/knowledge-expansion-batch09-browser-acceptance.json"));
const stress = JSON.parse(read("data/knowledge/reports/knowledge-expansion-batch09-hard-constraint-stress.json"));
const historical = verifyHistoricalKnowledgeReportSnapshots({ root: ROOT });
const requireTokens = (source, tokens, label) => tokens.forEach((token) => assert(source.includes(token), `${label}:missing-or-stale:${token}`));

function verifyReport(source) {
  requireTokens(source, [
    `Countries expanded: ${stats.targets.count}`,
    `Published additions: ${stats.additions.countries} Countries / ${stats.additions.cities} Cities / ${comma(stats.additions.pois)} POIs`,
    `Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities`,
    `Directed Transport Evidence added: ${stats.evidence.transport}; cumulative: ${stats.evidence.totalTransport}`,
    `Objective Month Risk added: ${stats.evidence.monthRisk}; cumulative: ${stats.evidence.totalMonthRisk}`,
    `Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`,
    `Hard-constraint stress: ${stress.summary.totalCases}/${stress.summary.totalCases} PASS`,
    `Batch 09 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}`,
    `Batch 09 verified dedicated destination images: ${stats.images.batchVerifiedImages}`,
    `Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${percent(stats.images.dedicatedCities, stats.images.cityTotal)}%)`,
    `Dedicated Core POI coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal} (${percent(stats.images.dedicatedPois, stats.images.poiTotal)}%)`,
    `Sealed PR #27 historical Image Debt list: ${stats.images.sealedHistoricalDebt}`,
    `Batch 09 total needsBackfill before: ${stats.images.totalNeedsBackfillBefore}`,
    `Batch 09 total needsBackfill after: ${stats.images.totalNeedsBackfillAfter}`,
    `Pre-Batch09 scope needsBackfill after semantic repair: ${stats.images.preBatchScopeNeedsBackfillAfter}`,
    `Remaining needsBackfill: ${stats.images.needsBackfill}`,
    `POI reconciliation: ${stats.baseline.knowledge.pois} + ${stats.semanticRepair.originalBatchPoiAdditions} - ${stats.semanticRepair.totalQuarantined} = ${stats.published.pois}`,
    `invalidMapping: ${stats.images.invalidMappings}`,
    `Catalog-only: ${stats.portfolio.catalogOnlyCountryCodes.join(", ")}`,
    `Batch 09 Country searches: ${browser.searchAcceptance.successfulQueries}/${browser.searchAcceptance.countryQueries} PASS`,
    `P1 targeted browser searches: ${browser.p1TargetedAcceptance.cases.length}/${browser.p1TargetedAcceptance.cases.length} PASS`,
  ], "Batch09 report");
}

verifyReport(report);
requireTokens(dashboard, [
  `| Country Entities | ${stats.baseline.knowledge.catalogCountries} | ${stats.published.countries} | +${stats.additions.countries} |`,
  `| Plannable Countries | ${stats.baseline.knowledge.plannableCountries} | ${stats.portfolio.plannableCountries} | +${stats.portfolio.plannableCountries - stats.baseline.knowledge.plannableCountries} |`,
  `| Cities | ${stats.baseline.knowledge.cities} | ${stats.published.cities} | +${stats.additions.cities} |`,
  `| POIs | ${comma(stats.baseline.knowledge.pois)} | ${comma(stats.published.pois)} | +${comma(stats.published.pois - stats.baseline.knowledge.pois)} net |`,
  `| Directed Transport | ${stats.baseline.evidence.directedTransport} | ${stats.evidence.totalTransport} | +${stats.evidence.transport} |`,
  `| Image needsBackfill | ${stats.baseline.images.needsBackfill} | ${stats.images.needsBackfill} | +${stats.images.needsBackfill - stats.baseline.images.needsBackfill} |`,
], "Batch09 dashboard");
for (const entry of stats.targetCountryCoverage) requireTokens(dashboard, [`${entry.label} (${entry.countryCode})`], `${entry.countryCode} row`);
requireTokens(imageAudit, [
  `Sealed PR #27 historical Image Debt list: ${stats.images.sealedHistoricalDebt}`,
  `Batch 09 total needsBackfill before: ${stats.images.totalNeedsBackfillBefore}`,
  `Batch 09 total needsBackfill after: ${stats.images.totalNeedsBackfillAfter}`,
  `Pre-Batch09 scope needsBackfill after semantic repair: ${stats.images.preBatchScopeNeedsBackfillAfter}`,
  `Plannable Country graphic covers: ${stats.images.countryCovers}/${stats.images.countryTotal}`,
  `Batch 09 Country graphic covers added: ${stats.images.batchCountryCovers}`,
  `Verified destination City images: ${stats.images.dedicatedCities}`,
  `Batch 09 verified destination images: ${stats.images.batchVerifiedImages}`,
  `Needs backfill: ${stats.images.needsBackfill}`,
  `Active invalid mappings: ${stats.images.invalidMappings}`,
], "Batch09 image audit");
requireTokens(sizeAudit, [
  `Images: ${stats.images.assetCount}`,
  `Total bytes: ${stats.images.totalBytes}`,
  `>300KB audit: ${stats.images.largerThan300Kb}`,
  `>500KB exact-baseline exception required: ${stats.images.largerThan500Kb}`,
  `>5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}`,
], "Batch09 size audit");

assert.equal(browser.status, "PASS");
assert.equal(browser.searchAcceptance.countryQueries, stats.targets.count);
assert.equal(browser.searchAcceptance.successfulQueries, stats.targets.count);
assert.equal(browser.searchAcceptance.constraintPreservationFailures, 0);
assert.equal(browser.tripFootprintAcceptance.flows, 1);
assert.equal(browser.tripFootprintAcceptance.duplicateCityCount, 0);
assert.equal(browser.tripFootprintAcceptance.knowledgeEntityIdsPreserved, true);
assert.equal(browser.tripFootprintAcceptance.wikidataIdsPreserved, true);
assert.equal(browser.imageAcceptance.wrongSemanticImages, 0);
assert.equal(browser.imageAcceptance.brokenImages, 0);
assert.equal(browser.imageAcceptance.runtimeExternalImageRequests, 0);
assert.equal(browser.imageAcceptance.runtimeExternalEvidenceRequests, 0);
assert.equal(browser.console.errors + browser.console.warnings, 0);
assert.equal(stress.status, "PASS");
assert.equal(stress.assertions.externalFetchCalls, 0);
assert.equal(historical.status, "PASS");
assert.equal(stats.semanticRepair.originalBatchPoiAdditions, stats.semanticRepair.finalBatchPoiAdditions + stats.semanticRepair.batchQuarantined);
assert.equal(stats.baseline.knowledge.pois + stats.semanticRepair.originalBatchPoiAdditions - stats.semanticRepair.totalQuarantined, stats.published.pois);
assert.equal(stats.semanticRepair.batchQuarantined + stats.semanticRepair.historicalQuarantined, stats.semanticRepair.totalQuarantined);
assert.equal(stats.images.sealedHistoricalDebt, 13);
assert.equal(stats.images.totalNeedsBackfillBefore, 188);
assert.equal(stats.images.totalNeedsBackfillAfter, stats.images.needsBackfill);

const mutations = [
  [`${comma(stats.additions.pois)} POIs`, `${comma(stats.additions.pois + 1)} POIs`, "POI addition"],
  [`${stats.images.dedicatedCities}/${stats.images.cityTotal}`, `${stats.images.dedicatedCities + 1}/${stats.images.cityTotal}`, "dedicated City"],
  [`${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`, `${stats.routeConsumption.queryCount - 1}/${stats.routeConsumption.queryCount} PASS`, "route consumption"],
  [`${stress.summary.totalCases}/${stress.summary.totalCases} PASS`, `${stress.summary.totalCases - 1}/${stress.summary.totalCases} PASS`, "hard stress"],
  ["Batch 09 Country Covers", "Batch 08 Country Covers", "batch label"],
  [`${stats.evidence.transport}; cumulative: ${stats.evidence.totalTransport}`, `${stats.evidence.transport + 1}; cumulative: ${stats.evidence.totalTransport}`, "transport"],
  [`Remaining needsBackfill: ${stats.images.needsBackfill}`, `Remaining needsBackfill: ${stats.images.needsBackfill - 1}`, "image debt"],
  [`POI reconciliation: ${stats.baseline.knowledge.pois} + ${stats.semanticRepair.originalBatchPoiAdditions} - ${stats.semanticRepair.totalQuarantined} = ${stats.published.pois}`, `POI reconciliation: ${stats.baseline.knowledge.pois} + ${stats.semanticRepair.originalBatchPoiAdditions} - ${stats.semanticRepair.totalQuarantined - 1} = ${stats.published.pois}`, "semantic quarantine reconciliation"],
  ["Catalog-only: CN", "Catalog-only: None", "China status"],
  [`Batch 09 verified dedicated destination images: ${stats.images.batchVerifiedImages}`, "Batch 09 verified dedicated destination images: 1", "placeholder accounting"],
];
for (const [search, replacement, label] of mutations) {
  const mutated = report.replace(search, replacement);
  assert.notEqual(mutated, report, `${label}: mutation must alter report`);
  assert.throws(() => verifyReport(mutated), /missing-or-stale/u, `${label}: mutation must be killed`);
}

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch09-report-consistency",
  status: "PASS",
  comparedDocuments: 7,
  mutationCasesKilled: mutations.length,
  published: stats.published,
  additions: stats.additions,
  evidence: stats.evidence,
  images: stats.images,
}, null, 2));
