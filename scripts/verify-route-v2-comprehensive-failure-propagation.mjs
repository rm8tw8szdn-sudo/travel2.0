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

const failingStage = MANDATORY_PRELAUNCH_VERIFIERS.find((stage) => stage.name === "publication-gate");
let thrown = null;
try {
  runMandatoryVerifierStage({
    stage: failingStage,
    projectRoot,
    env: process.env,
    spawnImpl: () => ({
      status: 17,
      signal: null,
      stdout: "{\"verifier\":\"injected-child\",\"status\":\"FAIL\"}\n",
      stderr: "controlled child failure\n",
    }),
  });
} catch (error) {
  thrown = error;
}

assert(thrown instanceof MandatoryVerifierStageError);
assert.equal(thrown.stageResult.name, "publication-gate");
assert.equal(thrown.stageResult.command, "node scripts/verify-route-v2-publication-gate.mjs");
assert.equal(thrown.stageResult.exitCode, 17);
assert.match(thrown.stageResult.stdoutSummary, /injected-child/u);
assert.match(thrown.stageResult.stderrSummary, /controlled child failure/u);

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-comprehensive-failure-propagation",
  status: "PASS",
  mandatoryStageCount: MANDATORY_PRELAUNCH_VERIFIERS.length,
  nonZeroChildPropagated: true,
  injectedExitCode: 17,
  productionRunnerExercised: true,
}, null, 2)}\n`);
