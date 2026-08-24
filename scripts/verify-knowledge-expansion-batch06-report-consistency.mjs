import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calculateBatch06ReportData, comma, percent } from "./lib/knowledge-expansion-batch06-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const stats = calculateBatch06ReportData({ root: ROOT });
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replaceAll("\r\n", "\n");
const report = read("ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_REPORT.md");
const dashboard = read("ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_DASHBOARD.md");
const imageAudit = read("ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md");
const sizeAudit = read("ROUTE_V2_IMAGE_ASSET_SIZE_BATCH06_AUDIT.md");
const browserAcceptance = JSON.parse(read("data/knowledge/reports/knowledge-expansion-batch06-browser-acceptance.json"));
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
    `Route V2 country searches: ${stats.browserAcceptance.searchAcceptance.countryQueries7Days}/20 at 7 days`,
    `Route → Detail → Trip → Footprint: ${stats.browserAcceptance.tripFootprintAcceptance.countryCount} Countries / ${stats.browserAcceptance.tripFootprintAcceptance.cityCount} Cities; duplicate City: ${stats.browserAcceptance.tripFootprintAcceptance.duplicateCityCount}`,
    `Dedicated images visually inspected: ${stats.browserAcceptance.imageAcceptance.dedicatedAssetsVisuallyInspected}; wrong semantic image: ${stats.browserAcceptance.imageAcceptance.wrongSemanticImages}; broken image: ${stats.browserAcceptance.imageAcceptance.brokenImages}`,
  ], "Batch06 report");
}

verifyReport(report);
requireTokens(dashboard, [
  `Country Entities (Catalog): ${stats.portfolio.catalogCountries}`,
  `Plannable Countries: ${stats.portfolio.plannableCountries}`,
  `Route Knowledge Covered Countries: ${stats.portfolio.routeKnowledgeCoveredCountries}`,
  `Evidence-backed Countries: ${stats.portfolio.evidenceBackedCountries}`,
  `Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities`,
], "Batch06 dashboard");
for (const entry of stats.targetCountryCoverage) requireTokens(dashboard, [`${entry.label} (${entry.countryCode})`, `| T${entry.tier} | ${entry.cities} | ${entry.pois} |`], `${entry.countryCode} row`);
requireTokens(imageAudit, [
  `Plannable Country graphic covers: ${stats.images.countryCovers}/${stats.images.countryTotal}`,
  `Verified destination City images: ${stats.images.dedicatedCities}`,
  `Dedicated City image coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal}`,
  `Verified Core POI image coverage: ${stats.images.dedicatedPois}/${stats.images.poiTotal}`,
  `Needs backfill: ${stats.images.needsBackfill}`,
  `Active invalid mappings: ${stats.images.invalidMappings}`,
], "Batch06 image audit");
requireTokens(sizeAudit, [`Images: ${stats.images.assetCount}`, `Total bytes: ${stats.images.totalBytes}`, `>300KB audit: ${stats.images.largerThan300Kb}`, `>5MB ordinary Git hard fail: ${stats.images.largerThan5Mb}`], "Batch06 size audit");

assert.equal(browserAcceptance.status, "PASS");
assert.equal(browserAcceptance.searchAcceptance.successfulQueries, 50);
assert.equal(browserAcceptance.searchAcceptance.constraintPreservationFailures, 0);
assert.equal(browserAcceptance.tripFootprintAcceptance.duplicateCityCount, 0);
assert.equal(browserAcceptance.imageAcceptance.dedicatedAssetsVisuallyInspected, stats.images.batch06VerifiedImages + stats.images.historicalBackfillImages);
assert.equal(browserAcceptance.imageAcceptance.wrongSemanticImages, 0);
assert.equal(browserAcceptance.imageAcceptance.brokenImages, 0);
assert.equal(browserAcceptance.imageAcceptance.runtimeExternalImageRequests, 0);
assert.equal(browserAcceptance.imageAcceptance.runtimeExternalEvidenceRequests, 0);
assert.equal(browserAcceptance.console.errors + browserAcceptance.console.warnings, 0);

const wrongPoi = report.replace(`${comma(stats.additions.pois)} POIs`, `${comma(stats.additions.pois + 1)} POIs`);
assert.notEqual(wrongPoi, report);
assert.throws(() => verifyReport(wrongPoi), /missing-or-stale/u);
const wrongImage = report.replace(`Dedicated City coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal}`, `Dedicated City coverage: ${stats.images.dedicatedCities + 1}/${stats.images.cityTotal}`);
assert.notEqual(wrongImage, report);
assert.throws(() => verifyReport(wrongImage), /missing-or-stale/u);
const wrongRoute = report.replace(`Route consumption: ${stats.routeConsumption.queryCount}/${stats.routeConsumption.queryCount} PASS`, `Route consumption: ${stats.routeConsumption.queryCount - 1}/${stats.routeConsumption.queryCount} PASS`);
assert.notEqual(wrongRoute, report);
assert.throws(() => verifyReport(wrongRoute), /missing-or-stale/u);

console.log(JSON.stringify({ verifier: "knowledge-expansion-batch06-report-consistency", status: "PASS", comparedDocuments: 5, mutationCasesKilled: 3, published: stats.published, additions: stats.additions, evidence: { transport: stats.evidence.transport, monthRisk: stats.evidence.monthRisk }, images: { countries: stats.images.countryCovers, dedicatedCities: stats.images.dedicatedCities, dedicatedPois: stats.images.dedicatedPois, needsBackfill: stats.images.needsBackfill, invalidMappings: stats.images.invalidMappings }, browserAcceptance: { successfulQueries: browserAcceptance.searchAcceptance.successfulQueries, duplicateCityCount: browserAcceptance.tripFootprintAcceptance.duplicateCityCount, dedicatedAssetsVisuallyInspected: browserAcceptance.imageAcceptance.dedicatedAssetsVisuallyInspected } }, null, 2));
