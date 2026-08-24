import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch07ReportData, comma, percent } from "./lib/knowledge-expansion-batch07-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const stats = calculateBatch07ReportData({ root: ROOT });
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replaceAll("\r\n", "\n");
const reportPath = process.env.ROUTE_V2_BATCH07_REPORT_PATH || path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_REPORT.md");
const report = fs.readFileSync(reportPath, "utf8").replaceAll("\r\n", "\n");
const dashboard = read("ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_DASHBOARD.md");
const imageAudit = read("ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH07_AUDIT.md");
const sizeAudit = read("ROUTE_V2_IMAGE_ASSET_SIZE_BATCH07_AUDIT.md");
const browserAcceptance = JSON.parse(read("data/knowledge/reports/knowledge-expansion-batch07-browser-acceptance.json"));
const requireTokens = (source, tokens, label) => tokens.forEach((token) => assert(source.includes(token), `${label}:missing-or-stale:${token}`));

function verifyReport(source) {
  requireTokens(source, [
    `Countries expanded: ${stats.targets.count}`,
    `Published additions: ${stats.additions.countries} Countries / ${stats.additions.cities} Cities / ${comma(stats.additions.pois)} POIs`,
    `Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities`,
    `Directed Transport Evidence added: ${stats.evidence.transport}`,
    `Objective Month Risk added: ${stats.evidence.monthRisk}`,
    `Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`,
    `Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${percent(stats.images.dedicatedCities, stats.images.cityTotal)}%)`,
    `Dedicated Core POI coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal} (${percent(stats.images.dedicatedPois, stats.images.poiTotal)}%)`,
    `Remaining needsBackfill: ${stats.images.needsBackfill}`,
    `invalidMapping: ${stats.images.invalidMappings}`,
    `Batch 07 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}`,
    `Batch 07 Country searches exercised in the real browser: ${browserAcceptance.searchAcceptance.countryQueries}/${stats.targets.count}`,
    `Route → Detail → Trip → Footprint flows: ${browserAcceptance.tripFootprintAcceptance.flows}; duplicate City: ${browserAcceptance.tripFootprintAcceptance.duplicateCityCount}`,
    `Wrong semantic images: ${browserAcceptance.imageAcceptance.wrongSemanticImages}; broken images: ${browserAcceptance.imageAcceptance.brokenImages}`,
  ], "Batch07 report");
}

verifyReport(report);
requireTokens(dashboard, [
  `Country Entities (Catalog): ${stats.portfolio.catalogCountries}`,
  `Plannable Countries: ${stats.portfolio.plannableCountries}`,
  `Route Knowledge Covered Countries: ${stats.portfolio.routeKnowledgeCoveredCountries}`,
  `Evidence-backed Countries: ${stats.portfolio.evidenceBackedCountries}`,
  `Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities`,
], "Batch07 dashboard");
for (const entry of stats.targetCountryCoverage) requireTokens(dashboard, [
  `${entry.label} (${entry.countryCode})`,
  `| T${entry.tier} | ${stats.seed.countries[entry.countryCode].currentStatus} | ${stats.seed.countries[entry.countryCode].targetStatus} | ${entry.cities} | ${entry.pois} |`,
], `${entry.countryCode} row`);
requireTokens(imageAudit, [
  `Historical image debt before Batch 07: ${stats.images.historicalDebtBefore}`,
  `Historical image debt after Batch 07: ${stats.images.historicalDebtAfter}`,
  `Plannable Country graphic covers: ${stats.images.countryCovers}/${stats.images.countryTotal}`,
  `Batch 07 Country graphic covers added: ${stats.images.batchCountryCovers}`,
  `Verified destination City images: ${stats.images.dedicatedCities}`,
  `Batch 07 verified destination images: ${stats.images.batchVerifiedImages}`,
  `Needs backfill: ${stats.images.needsBackfill}`,
  `Active invalid mappings: ${stats.images.invalidMappings}`,
], "Batch07 image audit");
requireTokens(sizeAudit, [
  `Images: ${stats.images.assetCount}`,
  `Total bytes: ${stats.images.totalBytes}`,
  `>300KB audit: ${stats.images.largerThan300Kb}`,
  `>500KB exact-baseline exception required: ${stats.images.largerThan500Kb}`,
  `>5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}`,
], "Batch07 size audit");

assert.equal(browserAcceptance.status, "PASS");
assert.equal(browserAcceptance.searchAcceptance.countryQueries, stats.targets.count);
assert.equal(browserAcceptance.searchAcceptance.constraintPreservationFailures, 0);
assert.equal(browserAcceptance.tripFootprintAcceptance.flows, 2);
assert.equal(browserAcceptance.tripFootprintAcceptance.duplicateCityCount, 0);
assert.equal(browserAcceptance.tripFootprintAcceptance.knowledgeEntityIdsPreserved, true);
assert.equal(browserAcceptance.tripFootprintAcceptance.wikidataIdsPreserved, true);
assert.equal(browserAcceptance.imageAcceptance.wrongSemanticImages, 0);
assert.equal(browserAcceptance.imageAcceptance.brokenImages, 0);
assert.equal(browserAcceptance.imageAcceptance.runtimeExternalImageRequests, 0);
assert.equal(browserAcceptance.imageAcceptance.runtimeExternalEvidenceRequests, 0);
assert.equal(browserAcceptance.console.errors + browserAcceptance.console.warnings, 0);

const mutations = [
  [
    `${comma(stats.additions.pois)} POIs`,
    `${comma(stats.additions.pois + 1)} POIs`,
    "published POI addition",
  ],
  [
    `Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal}`,
    `Dedicated City coverage: ${stats.images.dedicatedCities + 1}/${stats.images.cityTotal}`,
    "dedicated City total",
  ],
  [
    `Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`,
    `Route consumption: ${stats.routeConsumption.queryCount - 1}/${stats.routeConsumption.queryCount} PASS`,
    "route consumption total",
  ],
  [
    `Batch 07 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}`,
    `Batch 06 Country Covers: ${stats.images.batchCountryCovers}/${stats.targets.count}`,
    "Batch label",
  ],
];
for (const [search, replacement, label] of mutations) {
  const mutated = report.replace(search, replacement);
  assert.notEqual(mutated, report, `${label}: mutation must alter report`);
  assert.throws(() => verifyReport(mutated), /missing-or-stale/u, `${label}: mutation must be killed`);
}

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch07-report-consistency",
  status: "PASS",
  comparedDocuments: 5,
  mutationCasesKilled: mutations.length,
  published: stats.published,
  additions: stats.additions,
  evidence: { transport: stats.evidence.transport, monthRisk: stats.evidence.monthRisk },
  images: {
    countries: stats.images.countryCovers,
    dedicatedCities: stats.images.dedicatedCities,
    dedicatedPois: stats.images.dedicatedPois,
    needsBackfill: stats.images.needsBackfill,
    invalidMappings: stats.images.invalidMappings,
  },
  browserAcceptance: {
    countryQueries: browserAcceptance.searchAcceptance.countryQueries,
    tripFootprintFlows: browserAcceptance.tripFootprintAcceptance.flows,
  },
}, null, 2));
