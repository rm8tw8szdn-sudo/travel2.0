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
import { SEALED_SNAPSHOT_PATH } from "./lib/historical-knowledge-report-snapshots.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sealedSnapshots = JSON.parse(fs.readFileSync(path.join(projectRoot, SEALED_SNAPSHOT_PATH), "utf8"));
const batch05Snapshot = sealedSnapshots.batches["05"];
const comma = (value) => Number(value).toLocaleString("en-US");
const requiredNames = new Set(MANDATORY_PRELAUNCH_VERIFIERS.map((stage) => stage.name));
for (const name of [
  "multi-city-hard-constraints",
  "homonymous-city-country-disambiguation",
  "overlapping-country-city-entity-parser",
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
  "route-v2-image-debt-elimination",
  "route-v2-image-provenance-completeness",
  "route-v2-image-asset-baseline",
  "route-v2-image-quality-adversarial",
  "route-v2-city-detail-image-fallback",
  "knowledge-expansion-batch05-report-consistency",
  "historical-knowledge-reports-git-anchored",
  "knowledge-expansion-batch06-integrity",
  "knowledge-expansion-batch06-route-consumption",
  "knowledge-expansion-batch06-report-consistency",
  "knowledge-expansion-batch07-integrity",
  "knowledge-expansion-batch07-route-consumption",
  "knowledge-expansion-batch07-report-consistency",
  "knowledge-expansion-batch08-integrity",
  "knowledge-expansion-batch08-route-consumption",
  "knowledge-expansion-batch08-hard-constraint-stress",
  "knowledge-expansion-batch08-semantic-adversarial",
  "knowledge-expansion-batch08-report-consistency",
  "knowledge-expansion-batch09-integrity",
  "knowledge-expansion-batch09-sovereignty",
  "knowledge-expansion-batch09-route-consumption",
  "knowledge-expansion-batch09-hard-constraint-stress",
  "knowledge-expansion-batch09-semantic-adversarial",
  "knowledge-poi-positive-admission",
  "knowledge-poi-ancestry-admission",
  "knowledge-poi-policy-consistency",
  "knowledge-poi-mixed-type-admission",
  "knowledge-financial-market-admission",
  "knowledge-expansion-batch09-browser-acceptance",
  "knowledge-expansion-batch09-report-consistency",
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
const imageDebtStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "route-v2-image-debt-elimination");
assert(imageDebtStage, "Image debt verification must be registered");
const imageProvenanceStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "route-v2-image-provenance-completeness");
assert(imageProvenanceStage, "Image provenance completeness verification must be registered");
const homonymousCityStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "homonymous-city-country-disambiguation");
assert(homonymousCityStage, "Homonymous City disambiguation verification must be registered");
const overlappingEntityStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "overlapping-country-city-entity-parser");
assert(overlappingEntityStage, "Overlapping Country/City parser verification must be registered");
const batch07ReportConsistencyStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-expansion-batch07-report-consistency");
assert(batch07ReportConsistencyStage, "Batch 07 report consistency verification must be registered");
const batch08ReportConsistencyStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-expansion-batch08-report-consistency");
assert(batch08ReportConsistencyStage, "Batch 08 report consistency verification must be registered");
const batch09ReportConsistencyStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-expansion-batch09-report-consistency");
assert(batch09ReportConsistencyStage, "Batch 09 report consistency verification must be registered");
const historicalReportStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "historical-knowledge-reports-git-anchored");
assert(historicalReportStage, "Git-anchored historical report verification must be registered");
const positivePoiAdmissionStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-poi-positive-admission");
assert(positivePoiAdmissionStage, "Positive POI admission verification must be registered");
const poiAncestryAdmissionStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-poi-ancestry-admission");
assert(poiAncestryAdmissionStage, "POI ancestry admission verification must be registered");
const poiPolicyConsistencyStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-poi-policy-consistency");
assert(poiPolicyConsistencyStage, "POI policy consistency verification must be registered");
const poiMixedTypeStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-poi-mixed-type-admission");
assert(poiMixedTypeStage, "Mixed-type POI admission verification must be registered");
const financialMarketStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "knowledge-financial-market-admission");
assert(financialMarketStage, "Financial-market POI admission verification must be registered");

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

let imageDebtFailure = null;
try {
  runMandatoryVerifierStage({
    stage: imageDebtStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 41, signal: null, stdout: "", stderr: "controlled image debt failure\n" }),
  });
} catch (error) {
  imageDebtFailure = error;
}
assert(imageDebtFailure instanceof MandatoryVerifierStageError);
assert.equal(imageDebtFailure.stageResult.name, "route-v2-image-debt-elimination");
assert.equal(imageDebtFailure.stageResult.exitCode, 41);

let imageProvenanceFailure = null;
try {
  runMandatoryVerifierStage({
    stage: imageProvenanceStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 43, signal: null, stdout: "{\"status\":\"PASS\"}\n", stderr: "controlled image provenance failure\n" }),
  });
} catch (error) {
  imageProvenanceFailure = error;
}
assert(imageProvenanceFailure instanceof MandatoryVerifierStageError);
assert.equal(imageProvenanceFailure.stageResult.name, "route-v2-image-provenance-completeness");
assert.equal(imageProvenanceFailure.stageResult.exitCode, 43);

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

let batch08ReportFailure = null;
try {
  runMandatoryVerifierStage({
    stage: batch08ReportConsistencyStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 47, signal: null, stdout: "", stderr: "controlled Batch 08 report failure\n" }),
  });
} catch (error) {
  batch08ReportFailure = error;
}
assert(batch08ReportFailure instanceof MandatoryVerifierStageError);
assert.equal(batch08ReportFailure.stageResult.name, "knowledge-expansion-batch08-report-consistency");
assert.equal(batch08ReportFailure.stageResult.exitCode, 47);

let batch09ReportFailure = null;
try {
  runMandatoryVerifierStage({
    stage: batch09ReportConsistencyStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({ status: 53, signal: null, stdout: "", stderr: "controlled Batch 09 report failure\n" }),
  });
} catch (error) {
  batch09ReportFailure = error;
}
assert(batch09ReportFailure instanceof MandatoryVerifierStageError);
assert.equal(batch09ReportFailure.stageResult.name, "knowledge-expansion-batch09-report-consistency");
assert.equal(batch09ReportFailure.stageResult.exitCode, 53);

function controlledStageFailure(stage, status, message) {
  let failure = null;
  try {
    runMandatoryVerifierStage({
      stage,
      projectRoot,
      env: process.env,
      spawnImpl: () => ({ status, signal: null, stdout: "", stderr: `${message}\n` }),
    });
  } catch (error) {
    failure = error;
  }
  assert(failure instanceof MandatoryVerifierStageError);
  assert.equal(failure.stageResult.name, stage.name);
  assert.equal(failure.stageResult.exitCode, status);
  return failure.stageResult;
}

const historicalReportFailure = controlledStageFailure(historicalReportStage, 59, "controlled historical report failure");
const positivePoiAdmissionFailure = controlledStageFailure(positivePoiAdmissionStage, 61, "controlled positive POI admission failure");
const poiAncestryAdmissionFailure = controlledStageFailure(poiAncestryAdmissionStage, 67, "controlled POI ancestry admission failure");
const poiPolicyConsistencyFailure = controlledStageFailure(poiPolicyConsistencyStage, 71, "controlled POI policy consistency failure");
const overlappingEntityFailure = controlledStageFailure(overlappingEntityStage, 73, "controlled overlapping entity parser failure");
const poiMixedTypeFailure = controlledStageFailure(poiMixedTypeStage, 79, "controlled mixed-type POI admission failure");
const financialMarketFailure = controlledStageFailure(financialMarketStage, 83, "controlled financial-market POI admission failure");

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
  `${comma(batch05Snapshot.knowledge.additions.pois)} POIs`,
  `${comma(batch05Snapshot.knowledge.additions.pois + 1)} POIs`,
  "POI total",
);
const reportCityImageMutation = realReportMutationFailure(
  `Dedicated City covers: ${comma(batch05Snapshot.images.dedicatedCities)}/${comma(batch05Snapshot.images.cityTotal)}`,
  `Dedicated City covers: ${comma(batch05Snapshot.images.dedicatedCities + 1)}/${comma(batch05Snapshot.images.cityTotal)}`,
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
  imageDebtFailurePropagated: imageDebtFailure.stageResult.exitCode === 41,
  homonymousCityFailurePropagated: homonymousCityFailure.stageResult.exitCode === 31,
  batch07ReportFailurePropagated: batch07ReportFailure.stageResult.exitCode === 37,
  batch08ReportFailurePropagated: batch08ReportFailure.stageResult.exitCode === 47,
  batch09ReportFailurePropagated: batch09ReportFailure.stageResult.exitCode === 53,
  historicalReportFailurePropagated: historicalReportFailure.exitCode === 59,
  positivePoiAdmissionFailurePropagated: positivePoiAdmissionFailure.exitCode === 61,
  poiAncestryAdmissionFailurePropagated: poiAncestryAdmissionFailure.exitCode === 67,
  poiPolicyConsistencyFailurePropagated: poiPolicyConsistencyFailure.exitCode === 71,
  overlappingEntityFailurePropagated: overlappingEntityFailure.exitCode === 73,
  poiMixedTypeFailurePropagated: poiMixedTypeFailure.exitCode === 79,
  financialMarketFailurePropagated: financialMarketFailure.exitCode === 83,
  reportPoiMutationPropagated: reportPoiMutation.exitCode !== 0,
  reportDedicatedCityMutationPropagated: reportCityImageMutation.exitCode !== 0,
}, null, 2)}\n`);
