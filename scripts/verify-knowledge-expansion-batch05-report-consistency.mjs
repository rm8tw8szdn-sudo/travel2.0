import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  calculateBatch05ReportData,
  comma,
  imageCoverageNarrative,
  imageSemanticSampleNarrative,
} from "./lib/knowledge-expansion-batch05-report-data.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPORT_PATH = path.resolve(process.env.ROUTE_V2_BATCH05_REPORT_PATH || path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md"));
const DASHBOARD_PATH = path.resolve(process.env.ROUTE_V2_BATCH05_DASHBOARD_PATH || path.join(ROOT, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_DASHBOARD.md"));
const IMAGE_AUDIT_PATH = path.resolve(process.env.ROUTE_V2_BATCH05_IMAGE_AUDIT_PATH || path.join(ROOT, "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md"));
const stats = calculateBatch05ReportData({ root: ROOT });

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");
}

function requireLines(text, lines, label) {
  for (const line of lines) assert.ok(text.includes(line), `${label} missing or stale: ${line}`);
}

function verifyMainReport(text) {
  requireLines(text, [
    `- Waves: ${stats.waveCount} (${stats.targetCountryCount / stats.waveCount} countries each)`,
    `- Countries expanded: ${stats.targetCountryCount}`,
    `- Published additions: ${comma(stats.additions.countries)} Countries / ${comma(stats.additions.cities)} Cities / ${comma(stats.additions.pois)} POIs`,
    `- Published totals: ${comma(stats.published.countries)} Countries / ${comma(stats.published.cities)} Cities / ${comma(stats.published.pois)} POIs / ${comma(stats.published.total)} entities`,
    `- Directed transport Evidence added: ${comma(stats.evidence.routeLegs)} (${comma(stats.evidence.domesticRouteLegs)} domestic + ${comma(stats.evidence.crossBorderRouteLegs)} cross-border)`,
    `- Objective month-risk Evidence added: ${comma(stats.evidence.monthRisk)}`,
    `- Duplicate Entity ID: ${stats.quality.duplicateEntityIds}; duplicate City QID: ${stats.quality.duplicateCityQids}; duplicate POI QID: ${stats.quality.duplicatePoiQids}; orphan: ${stats.quality.orphans}; published conflict: ${stats.quality.conflicts}`,
    `- Historical image debt discovered: ${comma(stats.images.historicalNeedsBackfill)}`,
    `- Country graphic covers available: ${comma(stats.images.countryCovers)}/${comma(stats.images.countryCoverTotal)}`,
    `- Batch 05 Country graphic covers added: ${comma(stats.images.batch05CountryCovers)}`,
    `- Dedicated City covers: ${comma(stats.images.dedicatedCities)}/${comma(stats.images.cityTotal)}`,
    `- Dedicated Core POI images: ${comma(stats.images.dedicatedCorePois)}/${comma(stats.images.corePoiTotal)}`,
    `- Neutral placeholders: ${comma(stats.images.neutralPlaceholders)} (${comma(stats.images.cityPlaceholders)} City + ${comma(stats.images.poiPlaceholders)} Core POI)`,
    `- Batch 05 trusted local images added: ${comma(stats.images.batch05TrustedLocalImages)}`,
    `- Active invalid mappings: ${comma(stats.images.invalidMappings)}`,
    `- Remaining needsBackfill: ${comma(stats.images.needsBackfill)}`,
    imageCoverageNarrative(stats),
    `- ${imageSemanticSampleNarrative(stats)}`,
  ], "Batch 05 report");
  assert.doesNotMatch(text, /Dedicated City covers added:\s*[1-9]/u, "placeholder or graphic card must not be reported as a dedicated City image");
  assert.doesNotMatch(text, /entity-bound London City image/iu, "London has no verified dedicated City image");
  assert.doesNotMatch(text, /Exact local Country\/City\/POI SVG cards are entity-bound/iu, "generic graphic cards must not be described as dedicated entity imagery");
}

function verifyDashboard(text) {
  const overall = stats.imageManifest.coverage.overall;
  requireLines(text, [
    `- Catalog Countries: ${stats.published.countries}`,
    `- Batch 05 Countries: ${stats.targetCountryCount}`,
    `- Published totals: ${stats.published.countries} Countries / ${stats.published.cities} Cities / ${stats.published.pois} POIs / ${stats.published.total} entities`,
    `| Overall | ${overall.countryCoverCoverage.ready}/${overall.countryCoverCoverage.total} (${overall.countryCoverCoverage.percent}%) | ${overall.cityDedicatedImageCoverage.ready}/${overall.cityDedicatedImageCoverage.total} (${overall.cityDedicatedImageCoverage.percent}%) | ${overall.cityPlaceholderCount} | ${overall.corePoiImageCoverage.ready}/${overall.corePoiImageCoverage.total} (${overall.corePoiImageCoverage.percent}%) | ${overall.invalidMappingCount} | ${overall.needsBackfillCount} |`,
  ], "Batch 05 Dashboard");

  const rows = text.split("\n").flatMap((line) => {
    const match = line.match(/^\| .+ \(([A-Z]{2})\) \| yes \| yes \| (\d+) \| (\d+) \| (\d+) \+ (\d+) \| (\d+) \|/u);
    return match ? [{
      countryCode: match[1],
      cities: Number(match[2]),
      pois: Number(match[3]),
      domesticRouteLegs: Number(match[4]),
      crossBorderRouteLegs: Number(match[5]),
      monthRisk: Number(match[6]),
    }] : [];
  });
  assert.equal(rows.length, stats.targetCountryCount, "Batch 05 Dashboard must contain one live row per target country");
  const rowByCountry = new Map(rows.map((row) => [row.countryCode, row]));
  assert.equal(rowByCountry.size, rows.length, "Batch 05 Dashboard contains a duplicate country row");
  for (const expected of stats.targetCountryCoverage) {
    assert.deepEqual(rowByCountry.get(expected.countryCode), expected, `${expected.countryCode}:Dashboard Knowledge/Evidence row is stale`);
  }
}

function verifyImageAudit(text) {
  const cityCoverage = stats.imageManifest.coverage.overall.cityDedicatedImageCoverage;
  const poiCoverage = stats.imageManifest.coverage.overall.corePoiImageCoverage;
  requireLines(text, [
    `- Historical image debt discovered: ${stats.images.historicalNeedsBackfill}`,
    `- Country graphic covers added: ${stats.images.countryCovers}`,
    `- Verified destination City images: ${stats.images.dedicatedCities}`,
    `- Batch 05 local Country graphic covers added: ${stats.images.batch05CountryCovers}`,
    `- Dedicated City image coverage: ${stats.images.dedicatedCities}/${stats.images.cityTotal} (${cityCoverage.percent}%)`,
    `- City neutral placeholders: ${stats.images.cityPlaceholders}`,
    `- Verified Core POI image coverage: ${stats.images.dedicatedCorePois}/${stats.images.corePoiTotal} (${poiCoverage.percent}%)`,
    `- POI neutral placeholders: ${stats.images.poiPlaceholders}`,
    `- Active invalid mappings: ${stats.images.invalidMappings}`,
    `- Needs backfill: ${stats.images.needsBackfill}`,
  ], "Image Backfill Audit");
}

const reportText = readText(REPORT_PATH);
const dashboardText = readText(DASHBOARD_PATH);
const imageAuditText = readText(IMAGE_AUDIT_PATH);
verifyMainReport(reportText);
verifyDashboard(dashboardText);
verifyImageAudit(imageAuditText);

const correctPoiToken = `${comma(stats.additions.pois)} POIs`;
const wrongPoiReport = reportText.replace(correctPoiToken, `${comma(stats.additions.pois + 1)} POIs`);
assert.notEqual(wrongPoiReport, reportText, "POI mutation fixture must alter the report");
assert.throws(() => verifyMainReport(wrongPoiReport), /missing or stale/u, "wrong POI count must fail report consistency");

const correctCityToken = `Dedicated City covers: ${comma(stats.images.dedicatedCities)}/${comma(stats.images.cityTotal)}`;
const wrongCityReport = reportText.replace(correctCityToken, `Dedicated City covers: ${comma(stats.images.dedicatedCities + 1)}/${comma(stats.images.cityTotal)}`);
assert.notEqual(wrongCityReport, reportText, "Dedicated City mutation fixture must alter the report");
assert.throws(() => verifyMainReport(wrongCityReport), /missing or stale/u, "wrong dedicated City count must fail report consistency");

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch05-report-consistency",
  status: "PASS",
  published: stats.published,
  additions: stats.additions,
  evidence: stats.evidence,
  images: stats.images,
  comparedDocuments: 3,
  mutationCasesKilled: 2,
}, null, 2));
