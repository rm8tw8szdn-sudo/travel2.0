import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANDATORY_PRELAUNCH_VERIFIERS,
  MandatoryVerifierStageError,
  runMandatoryVerifierStage,
} from "../src/lib/routes/prelaunch-verifier-gate.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredNames = new Set(MANDATORY_PRELAUNCH_VERIFIERS.map((stage) => stage.name));
for (const name of [
  "multi-city-hard-constraints",
  "single-city-hard-constraint",
  "trip-footprint-knowledge-identity",
  "multi-country-hard-constraints",
  "semantic-intent-and-candidate-snapshot-consistency",
  "malformed-route-intent-production-paths",
  "cache-semantic-and-evidence-association-integrity",
  "published-knowledge-semantic-integrity",
  "knowledge-coverage-semantics",
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
}, null, 2)}\n`);
