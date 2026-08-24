import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANDATORY_PRELAUNCH_VERIFIERS,
  MandatoryVerifierStageError,
  runMandatoryVerifierStage,
} from "../src/lib/routes/prelaunch-verifier-gate.mjs";
import { calculateBatch05ReportData, comma } from "./lib/knowledge-expansion-batch05-report-data.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const batch05ReportData = calculateBatch05ReportData({ root: projectRoot });
const requiredNames = new Set(MANDATORY_PRELAUNCH_VERIFIERS.map((stage) => stage.name));
for (const name of [
  "multi-city-hard-constraints",
  "homonymous-city-country-disambiguation",
  "single-city-hard-constraint",
  "trip-footprint-knowledge-identity",
  "multi-country-hard-constraints",
  "semantic-intent-and-candidate-snapshot-consistency",
  "malformed-route-intent-production-paths",
  "cache-semantic-and-evidence-association-integrity",
  "published-knowledge-semantic-integrity",
  "knowledge-coverage-semantics",
  "knowledge-expansion-batch05-integrity",
  "knowledge-expansion-batch05-adversarial-semantics",
  "knowledge-expansion-batch05-route-consumption",
  "route-v2-image-coverage-batch05",
  "route-v2-image-asset-baseline",
  "route-v2-image-quality-adversarial",
  "route-v2-city-detail-image-fallback",
  "knowledge-expansion-batch05-report-consistency",
  "knowledge-expansion-batch06-integrity",
  "knowledge-expansion-batch06-route-consumption",
  "knowledge-expansion-batch06-report-consistency",
  "knowledge-expansion-batch07-integrity",
  "knowledge-expansion-batch07-route-consumption",
  "knowledge-expansion-batch07-report-consistency",
  "publication-gate",
  "search-cache-semantic-migration",
  "cache-baseline-v2",
  "intent-performance",
  "server-security-boundaries",
  "neutral-city-placeholder",
  "verifier-lifecycle-and-platform-integrity",
]) {
  assert(requiredNames.has(name), `${name} must be a mandatory comprehensive stage`);
}

const travelStateStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "trip-footprint-knowledge-identity");
assert(travelStateStage, "Trip/Footprint identity verification must be registered");
const reportConsistencyStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-expansion-batch05-report-consistency");
assert(reportConsistencyStage, "Batch 05 report consistency verification must be registered");
const imageBaselineStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "route-v2-image-asset-baseline");
assert(imageBaselineStage, "Image asset baseline verification must be registered");
const homonymousCityStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "homonymous-city-country-disambiguation");
assert(homonymousCityStage, "Homonymous City disambiguation verification must be registered");
const batch07ReportConsistencyStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-expansion-batch07-report-consistency");
assert(batch07ReportConsistencyStage, "Batch 07 report consistency verification must be registered");

function injectedFailure(result) {
  let thrown = null;
  try {
    runMandatoryVerifierStage({
      stage: travelStateStage,
      projectRoot,
      env: process.env,
      spawnImpl: () => result,
    });
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof MandatoryVerifierStageError);
  assert.equal(thrown.stageResult.name, "trip-footprint-knowledge-identity");
  assert.equal(thrown.stageResult.command, "node scripts/verify-travel-state.mjs");
  return thrown.stageResult;
}

const nonZero = injectedFailure({
  status: 23,
  signal: null,
  stdout: "{\"verifier\":\"injected-trip-footprint\",\"status\":\"PASS\"}\n",
  stderr: "controlled child failure\n",
});
assert.equal(nonZero.exitCode, 23);
assert.match(nonZero.stdoutSummary, /injected-trip-footprint/u);
assert.match(nonZero.stderrSummary, /controlled child failure/u);

const signaled = injectedFailure({
  status: null,
  signal: "SIGTERM",
  stdout: "",
  stderr: "controlled signal\n",
});
assert.equal(signaled.signal, "SIGTERM");

const spawnError = injectedFailure({
  status: null,
  signal: null,
  stdout: "",
  stderr: "",
  error: new Error("controlled spawn error"),
});
assert.match(spawnError.stderrSummary, /controlled spawn error/u);

const passTextIgnored = runMandatoryVerifierStage({
  stage: travelStateStage,
  projectRoot,
  env: process.env,
  spawnImpl: () => ({
    status: 0,
    signal: null,
    stdout: "text intentionally contains FAIL without affecting exit status\n",
    stderr: "",
  }),
});
assert.equal(passTextIgnored.exitCode, 0);

let imageBaselineFailure = null;
try {
  runMandatoryVerifierStage({
    stage: imageBaselineStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 29, signal: null, stdout: "", stderr: "controlled image baseline failure\n" }),
  });
} catch (error) {
  imageBaselineFailure = error;
}
assert(imageBaselineFailure instanceof MandatoryVerifierStageError);
assert.equal(imageBaselineFailure.stageResult.name, "route-v2-image-asset-baseline");
assert.equal(imageBaselineFailure.stageResult.exitCode, 29);

let homonymousCityFailure = null;
try {
  runMandatoryVerifierStage({
    stage: homonymousCityStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 31, signal: null, stdout: "", stderr: "controlled homonymous City failure\n" }),
  });
} catch (error) {
  homonymousCityFailure = error;
}
assert(homonymousCityFailure instanceof MandatoryVerifierStageError);
assert.equal(homonymousCityFailure.stageResult.name, "homonymous-city-country-disambiguation");
assert.equal(homonymousCityFailure.stageResult.exitCode, 31);

let batch07ReportFailure = null;
try {
  runMandatoryVerifierStage({
    stage: batch07ReportConsistencyStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 37, signal: null, stdout: "", stderr: "controlled Batch 07 report failure\n" }),
  });
} catch (error) {
  batch07ReportFailure = error;
}
assert(batch07ReportFailure instanceof MandatoryVerifierStageError);
assert.equal(batch07ReportFailure.stageResult.name, "knowledge-expansion-batch07-report-consistency");
assert.equal(batch07ReportFailure.stageResult.exitCode, 37);

function realReportMutationFailure(search, replacement, label) {
  const sourcePath = path.join(projectRoot, "ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md");
  const source = fs.readFileSync(sourcePath, "utf8");
  const mutated = source.replace(search, replacement);
  assert.notEqual(mutated, source, `${label}:mutation must change the report`);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-report-propagation-"));
  const reportPath = path.join(temporaryRoot, "mutated-report.md");
  fs.writeFileSync(reportPath, mutated, "utf8");
  let thrown = null;
  try {
    runMandatoryVerifierStage({
      stage: reportConsistencyStage,
      projectRoot,
      env: { ...process.env, ROUTE_V2_BATCH05_REPORT_PATH: reportPath },
      timeoutMs: 30_000,
    });
  } catch (error) {
    thrown = error;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  assert(thrown instanceof MandatoryVerifierStageError, `${label}:comprehensive stage must reject the mutated report`);
  assert.equal(thrown.stageResult.name, "knowledge-expansion-batch05-report-consistency");
  assert.notEqual(thrown.stageResult.exitCode, 0);
  return thrown.stageResult;
}

const reportPoiMutation = realReportMutationFailure(
  `${comma(batch05ReportData.additions.pois)} POIs`,
  `${comma(batch05ReportData.additions.pois + 1)} POIs`,
  "POI total",
);
const reportCityImageMutation = realReportMutationFailure(
  `Dedicated City covers: ${comma(batch05ReportData.images.dedicatedCities)}/${comma(batch05ReportData.images.cityTotal)}`,
  `Dedicated City covers: ${comma(batch05ReportData.images.dedicatedCities + 1)}/${comma(batch05ReportData.images.cityTotal)}`,
  "Dedicated City image total",
);

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-comprehensive-failure-propagation",
  status: "PASS",
  mandatoryStageCount: MANDATORY_PRELAUNCH_VERIFIERS.length,
  tripFootprintNonZeroPropagated: true,
  tripFootprintSignalPropagated: true,
  tripFootprintSpawnErrorPropagated: true,
  outputTextIgnored: true,
  injectedExitCode: 23,
  productionRunnerExercised: true,
  imageBaselineFailurePropagated: imageBaselineFailure.stageResult.exitCode === 29,
  homonymousCityFailurePropagated: homonymousCityFailure.stageResult.exitCode === 31,
  batch07ReportFailurePropagated: batch07ReportFailure.stageResult.exitCode === 37,
  reportPoiMutationPropagated: reportPoiMutation.exitCode !== 0,
  reportDedicatedCityMutationPropagated: reportCityImageMutation.exitCode !== 0,
}, null, 2)}\n`);
