import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch08ReportData, comma, percent } from "./lib/knowledge-expansion-batch08-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const stats = calculateBatch08ReportData({ root: ROOT });
const normalize = (value) => value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
const read = (name) => normalize(fs.readFileSync(path.join(ROOT, name), "utf8"));
const reportPath = process.env.ROUTE_V2_BATCH08_REPORT_PATH || path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md");
const report = normalize(fs.readFileSync(reportPath, "utf8"));
const dashboard = read("ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_DASHBOARD.md");
const imageAudit = read("ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH08_AUDIT.md");
const sizeAudit = read("ROUTE_V2_IMAGE_ASSET_SIZE_BATCH08_AUDIT.md");
const browser = JSON.parse(read("data/knowledge/reports/knowledge-expansion-batch08-browser-acceptance.json"));
const requireTokens = (source, tokens, label) => tokens.forEach((token) => assert(source.includes(token), `${label}:missing-or-stale:${token}`));

function verifyReport(source) {
  requireTokens(source, [
    `Countries expanded: ${stats.targets.count}`,
    `Published additions: ${stats.additions.countries} Countries / ${stats.additions.cities} Cities / ${comma(stats.additions.pois)} POIs`,
    `Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities`,
    `Directed Transport Evidence added: ${stats.evidence.transport}; cumulative: ${stats.evidence.totalTransport}`,
    `Objective Month Risk added: ${stats.evidence.monthRisk}; cumulative: ${stats.evidence.totalMonthRisk}`,
    `Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`,
    `Batch 08 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}`,
    `Batch 08 verified dedicated destination images: ${stats.images.batchVerifiedImages}`,
    `Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${percent(stats.images.dedicatedCities, stats.images.cityTotal)}%)`,
    `Dedicated Core POI coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal} (${percent(stats.images.dedicatedPois, stats.images.poiTotal)}%)`,
    `Historical image debt before/after Batch 08: ${stats.images.historicalDebtBefore}/${stats.images.historicalDebtAfter}`,
    `Remaining needsBackfill: ${stats.images.needsBackfill}`,
    `invalidMapping: ${stats.images.invalidMappings}`,
    `Catalog-only: ${stats.portfolio.catalogOnlyCountryCodes.join(", ")}`,
    `Batch 08 Country searches: ${browser.searchAcceptance.successfulQueries}/${browser.searchAcceptance.countryQueries} PASS`,
  ], "Batch08 report");
}

verifyReport(report);
requireTokens(dashboard, [
  `| Country Entities | ${stats.baseline.knowledge.catalogCountries} | ${stats.published.countries} | +${stats.additions.countries} |`,
  `| Cities | ${stats.baseline.knowledge.cities} | ${stats.published.cities} | +${stats.additions.cities} |`,
  `| POIs | ${comma(stats.baseline.knowledge.pois)} | ${comma(stats.published.pois)} | +${comma(stats.additions.pois)} |`,
  `| Directed Transport | ${stats.baseline.evidence.directedTransport} | ${stats.evidence.totalTransport} | +${stats.evidence.transport} |`,
  `| Image needsBackfill | ${stats.baseline.images.needsBackfill} | ${stats.images.needsBackfill} | +${stats.images.needsBackfill - stats.baseline.images.needsBackfill} |`,
], "Batch08 dashboard");
for (const entry of stats.targetCountryCoverage) requireTokens(dashboard, [`${entry.label} (${entry.countryCode})`], `${entry.countryCode} row`);
requireTokens(imageAudit, [
  `Historical image debt before Batch 08: ${stats.images.historicalDebtBefore}`,
  `Historical image debt after Batch 08: ${stats.images.historicalDebtAfter}`,
  `Plannable Country graphic covers: ${stats.images.countryCovers}/${stats.images.countryTotal}`,
  `Batch 08 Country graphic covers added: ${stats.images.batchCountryCovers}`,
  `Verified destination City images: ${stats.images.dedicatedCities}`,
  `Batch 08 verified destination images: ${stats.images.batchVerifiedImages}`,
  `Needs backfill: ${stats.images.needsBackfill}`,
  `Active invalid mappings: ${stats.images.invalidMappings}`,
], "Batch08 image audit");
requireTokens(sizeAudit, [
  `Images: ${stats.images.assetCount}`,
  `Total bytes: ${stats.images.totalBytes}`,
  `>300KB audit: ${stats.images.largerThan300Kb}`,
  `>500KB exact-baseline exception required: ${stats.images.largerThan500Kb}`,
  `>5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}`,
], "Batch08 size audit");

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

const mutations = [
  [`${comma(stats.additions.pois)} POIs`, `${comma(stats.additions.pois + 1)} POIs`, "POI addition"],
  [`${stats.images.dedicatedCities}/${stats.images.cityTotal}`, `${stats.images.dedicatedCities + 1}/${stats.images.cityTotal}`, "dedicated City"],
  [`${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`, `${stats.routeConsumption.queryCount - 1}/${stats.routeConsumption.queryCount} PASS`, "route consumption"],
  ["Batch 08 Country Covers", "Batch 07 Country Covers", "batch label"],
  [`${stats.evidence.transport}; cumulative: ${stats.evidence.totalTransport}`, `${stats.evidence.transport + 1}; cumulative: ${stats.evidence.totalTransport}`, "transport"],
  [`Remaining needsBackfill: ${stats.images.needsBackfill}`, `Remaining needsBackfill: ${stats.images.needsBackfill - 1}`, "image debt"],
  ["Catalog-only: CN", "Catalog-only: None", "China status"],
  [`Batch 08 verified dedicated destination images: ${stats.images.batchVerifiedImages}`, "Batch 08 verified dedicated destination images: 1", "placeholder accounting"],
];
for (const [search, replacement, label] of mutations) {
  const mutated = report.replace(search, replacement);
  assert.notEqual(mutated, report, `${label}: mutation must alter report`);
  assert.throws(() => verifyReport(mutated), /missing-or-stale/u, `${label}: mutation must be killed`);
}

console.log(JSON.stringify({ verifier: "knowledge-expansion-batch08-report-consistency", status: "PASS", comparedDocuments: 5, mutationCasesKilled: mutations.length, published: stats.published, additions: stats.additions, evidence: stats.evidence, images: stats.images }, null, 2));
