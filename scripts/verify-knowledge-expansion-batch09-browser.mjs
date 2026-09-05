import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(ROOT, "data/knowledge/reports/knowledge-expansion-batch09-browser-acceptance.json"), "utf8"));
const expectedCodes = ["DZ", "GH", "SN", "ET", "NA", "BW", "MG", "MU", "KZ", "UZ", "KG", "BD", "BT", "PK", "LA", "BN", "HN", "SV", "WS", "VU"];

assert.equal(report.schemaVersion, "route-v2-knowledge-expansion-batch09-browser-acceptance-v1");
assert.equal(report.status, "PASS");
assert.equal(report.runtime.browser, "Codex In-app Browser");
assert.equal(report.runtime.routeV2Enabled, true);
assert.equal(report.runtime.canaryPercentage, 100);
assert.equal(report.runtime.onlineEvidenceEnabled, false);
assert.equal(report.runtime.isolatedRuntimeState, true);
assert.equal(report.searchAcceptance.countryQueries, expectedCodes.length);
assert.equal(report.searchAcceptance.successfulQueries, expectedCodes.length);
assert.equal(report.searchAcceptance.focusedConstraintSuccesses, report.searchAcceptance.focusedConstraintQueries);
assert.deepEqual([...report.searchAcceptance.countryCodesObserved].sort(), [...expectedCodes].sort());
assert.equal(report.searchAcceptance.constraintPreservationFailures, 0);
assert.equal(report.searchAcceptance.routeDetailChecks >= 1, true);
assert.equal(report.searchAcceptance.countryDetailChecks >= 1, true);
assert.equal(report.searchAcceptance.cityDetailChecks >= 1, true);
assert.equal(report.searchAcceptance.backForwardChecks >= 1, true);

const trip = report.tripFootprintAcceptance;
assert.equal(trip.flows, 1);
assert.equal(trip.crossCountry.query, "Kazakhstan Uzbekistan 14 days");
assert.equal(trip.crossCountry.routeCountryCount, 2);
assert.equal(trip.crossCountry.tripCountryCount, 2);
assert.equal(trip.crossCountry.routeCityCount, 6);
assert.equal(trip.crossCountry.tripCityCount, 6);
assert.equal(trip.completedFootprintCountryCount, 2);
assert.equal(trip.completedFootprintCityCount, 6);
assert.equal(trip.duplicateCityCount, 0);
assert.equal(trip.knowledgeEntityIdsPreserved, true);
assert.equal(trip.wikidataIdsPreserved, true);

const p1Targeted = report.p1TargetedAcceptance;
assert.equal(p1Targeted.browser, "Codex In-app Browser");
assert.deepEqual(p1Targeted.cases.map((entry) => entry.query), [
  "Accra 7 days",
  "San Salvador El Salvador 7 days",
  "Honduras 7 days",
]);
assert.deepEqual(p1Targeted.cases[0].countryCodes, ["GH"]);
assert.equal(p1Targeted.cases[0].ghanaStockExchangeRendered, false);
assert.deepEqual(p1Targeted.cases[1].countryCodes, ["SV"]);
assert.deepEqual(p1Targeted.cases[1].cityQids, ["Q3110"]);
assert.deepEqual(p1Targeted.cases[1].spuriousCountryCodes, []);
assert.deepEqual(p1Targeted.cases[2].countryCodes, ["HN"]);
assert.equal(p1Targeted.cases[2].centroPenalRendered, false);
assert.equal(p1Targeted.brokenImages, 0);
assert.equal(p1Targeted.runtimeExternalImageRequests, 0);
assert.equal(p1Targeted.runtimeExternalEvidenceRequests, 0);
assert.equal(p1Targeted.consoleErrors, 0);
assert.equal(p1Targeted.consoleWarnings, 0);

assert.equal(report.imageAcceptance.wrongSemanticImages, 0);
assert.equal(report.imageAcceptance.brokenImages, 0);
assert.equal(report.imageAcceptance.runtimeExternalImageRequests, 0);
assert.equal(report.imageAcceptance.runtimeExternalEvidenceRequests, 0);
assert.equal(report.console.errors, 0);
assert.equal(report.console.warnings, 0);

console.log(JSON.stringify({
  verifier: "knowledge-expansion-batch09-browser",
  status: "PASS",
  countrySearches: `${report.searchAcceptance.successfulQueries}/${report.searchAcceptance.countryQueries}`,
  focusedConstraints: `${report.searchAcceptance.focusedConstraintSuccesses}/${report.searchAcceptance.focusedConstraintQueries}`,
  tripFootprint: `${trip.crossCountry.tripCountryCount} Countries / ${trip.crossCountry.tripCityCount} Cities`,
  p1TargetedCases: p1Targeted.cases.length,
  brokenImages: report.imageAcceptance.brokenImages,
  externalRequests: report.imageAcceptance.runtimeExternalImageRequests + report.imageAcceptance.runtimeExternalEvidenceRequests,
  consoleIssues: report.console.errors + report.console.warnings,
}, null, 2));
