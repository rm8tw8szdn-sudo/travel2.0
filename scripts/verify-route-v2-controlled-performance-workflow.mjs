import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { ROUTE_V2_PERFORMANCE_PROTOCOL } from "./lib/route-v2-performance-reliability.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(projectRoot, ".github/workflows/route-v2-controlled-performance.yml");
const source = fs.readFileSync(workflowPath, "utf8");
const CURRENT_SHA = "1a9234f14e11aebe63eb043c78eeb73040ab7452";
const BASELINE_SHA = "826439f41523500ad805d0bcb9966a630e90b859";
const SECURITY_SENSITIVE_ENV_KEYS = Object.freeze([
  "CONTROLLED_CURRENT_SHA",
  "SEALED_BASELINE_SHA",
]);

function normalizedRun(value) {
  return String(value || "").replaceAll("\r\n", "\n").trim();
}

function stepByName(steps, name) {
  const matches = steps.filter((step) => step?.name === name);
  assert.equal(matches.length, 1, `workflow requires exactly one step named ${name}`);
  return matches[0];
}

function parseWorkflow(workflowSource) {
  const document = parseDocument(workflowSource, { uniqueKeys: true });
  assert.equal(document.errors.length, 0, document.errors.map((error) => error.message).join("\n"));
  const workflow = document.toJS();
  assert(workflow && typeof workflow === "object" && !Array.isArray(workflow), "workflow must be a mapping");
  return workflow;
}

function assertNoSecuritySensitiveEnvOverrides(scope, label) {
  if (scope === undefined) return;
  assert(scope && typeof scope === "object" && !Array.isArray(scope), `${label} env must be a mapping`);
  const overrides = SECURITY_SENSITIVE_ENV_KEYS.filter((key) => Object.hasOwn(scope, key));
  assert.deepEqual(overrides, [], `${label} must not override security-sensitive env`);
}

export function verifyControlledPerformanceWorkflow(workflowSource) {
  const workflow = parseWorkflow(workflowSource);
  assert.deepEqual(workflow.on, { workflow_dispatch: null }, "workflow must be manual-only with no dispatch inputs");
  assert.deepEqual(workflow.permissions, { contents: "read" }, "workflow permissions must be read-only");
  assert.deepEqual(workflow.concurrency, {
    group: "route-v2-controlled-performance",
    "cancel-in-progress": false,
  });
  assert.deepEqual(workflow.env, {
    CONTROLLED_CURRENT_SHA: CURRENT_SHA,
    SEALED_BASELINE_SHA: BASELINE_SHA,
  }, "current and baseline commits must be fixed outside dispatch input");
  assert.deepEqual(Object.keys(workflow.jobs), ["controlled-performance"]);

  const job = workflow.jobs["controlled-performance"];
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.equal(job["timeout-minutes"], 15);
  assert.equal(job.strategy, undefined, "matrix/strategy execution is forbidden");
  assert.equal(job.permissions, undefined, "job-level permissions overrides are forbidden");
  assertNoSecuritySensitiveEnvOverrides(job.env, "controlled-performance job");
  assert(Array.isArray(job.steps));
  for (const step of job.steps) {
    assertNoSecuritySensitiveEnvOverrides(step?.env, `step ${step?.name || "<unnamed>"}`);
  }
  assert.deepEqual(job.steps.map((step) => step.name), [
    "Require trusted main dispatch",
    "Checkout trusted workflow revision",
    "Verify trusted execution and target lineage",
    "Pin Node.js",
    "Install locked dependencies",
    "Record controlled environment",
    "Validate reliability infrastructure",
    "Validate controlled workflow contract",
    "Run one sealed controlled performance validation",
    "Upload complete performance evidence",
    "Enforce controlled performance verdict",
  ]);

  const trustedDispatch = stepByName(job.steps, "Require trusted main dispatch");
  assert.equal(trustedDispatch.shell, "bash");
  assert.equal(normalizedRun(trustedDispatch.run), 'test "${GITHUB_REF}" = "refs/heads/main"');

  const checkout = stepByName(job.steps, "Checkout trusted workflow revision");
  assert.equal(checkout.uses, "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
  assert.deepEqual(checkout.with, { "fetch-depth": 0, lfs: false }, "checkout must use trusted GITHUB_SHA, not current target");

  const lineage = stepByName(job.steps, "Verify trusted execution and target lineage");
  assert.equal(lineage.shell, "bash");
  assert.equal(normalizedRun(lineage.run), [
    'test "$(git rev-parse HEAD)" = "${GITHUB_SHA}"',
    '[[ "${CONTROLLED_CURRENT_SHA}" =~ ^[0-9a-f]{40}$ ]]',
    '[[ "${SEALED_BASELINE_SHA}" =~ ^[0-9a-f]{40}$ ]]',
    'git cat-file -e "${CONTROLLED_CURRENT_SHA}^{commit}"',
    'git cat-file -e "${SEALED_BASELINE_SHA}^{commit}"',
    'git merge-base --is-ancestor "${CONTROLLED_CURRENT_SHA}" HEAD',
  ].join("\n"));

  const node = stepByName(job.steps, "Pin Node.js");
  assert.equal(node.uses, "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
  assert.deepEqual(node.with, { "node-version": "24.18.0", cache: "npm" });
  assert.equal(normalizedRun(stepByName(job.steps, "Install locked dependencies").run), "npm ci --ignore-scripts");

  const environment = stepByName(job.steps, "Record controlled environment");
  assert.equal(environment.shell, "bash");
  for (const requiredLine of [
    'test "${RUNNER_ARCH}" = "X64"',
    'echo "workflow_sha=${GITHUB_SHA}"',
    'echo "requested_current_sha=${CONTROLLED_CURRENT_SHA}"',
    'echo "actual_current_sha=$(git rev-parse "${CONTROLLED_CURRENT_SHA}^{commit}")"',
    'echo "baseline_sha=$(git rev-parse "${SEALED_BASELINE_SHA}^{commit}")"',
    "lscpu",
  ]) assert(normalizedRun(environment.run).split("\n").map((line) => line.trim()).includes(requiredLine));

  assert.equal(
    normalizedRun(stepByName(job.steps, "Validate reliability infrastructure").run),
    "node scripts/verify-route-v2-performance-reliability-logic.mjs",
  );
  assert.equal(
    normalizedRun(stepByName(job.steps, "Validate controlled workflow contract").run),
    "node scripts/verify-route-v2-controlled-performance-workflow.mjs",
  );
  const benchmark = stepByName(job.steps, "Run one sealed controlled performance validation");
  assert.equal(benchmark.id, "performance");
  assert.equal(benchmark.shell, "bash");
  assert.equal(normalizedRun(benchmark.run), [
    "set +e",
    "node scripts/verify-route-v2-performance-reliability.mjs \\",
    '  --current-ref "${CONTROLLED_CURRENT_SHA}" \\',
    "  > performance-artifacts/result.json \\",
    "  2> performance-artifacts/stderr.log",
    "exit_code=$?",
    "set -e",
    'echo "exit_code=${exit_code}" >> "${GITHUB_OUTPUT}"',
    "cat performance-artifacts/result.json",
  ].join("\n"));

  const upload = stepByName(job.steps, "Upload complete performance evidence");
  assert.equal(upload.if, "always()");
  assert.equal(upload.uses, "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  assert.deepEqual(upload.with, {
    name: `route-v2-controlled-performance-${CURRENT_SHA}`,
    path: "performance-artifacts/",
    "if-no-files-found": "error",
    "retention-days": 30,
  });

  const enforce = stepByName(job.steps, "Enforce controlled performance verdict");
  assert.equal(enforce.if, "always()");
  assert.equal(enforce.shell, "bash");
  assert.equal(normalizedRun(enforce.run), 'test "${{ steps.performance.outputs.exit_code }}" = "0"');
  return workflow;
}

verifyControlledPerformanceWorkflow(source);

const spoofCases = [
  ["runner hidden by comment", source.replace("runs-on: ubuntu-24.04", "runs-on: windows-2025 # runs-on: ubuntu-24.04")],
  ["floating Node hidden by comment", source.replace("node-version: 24.18.0", "node-version: 24 # node-version: 24.18.0")],
  ["changed baseline hidden by comment", source.replace(`SEALED_BASELINE_SHA: ${BASELINE_SHA}`, `SEALED_BASELINE_SHA: ${"0".repeat(40)} # ${BASELINE_SHA}`)],
  ["second performance invocation", source.replace("    exit_code=$?", "    node scripts/verify-route-v2-performance-reliability.mjs\n    exit_code=$?")],
  ["push trigger", source.replace("  workflow_dispatch:", "  workflow_dispatch:\n  push:")],
  ["arbitrary target checkout", source.replace("          fetch-depth: 0", "          ref: ${{ inputs.current_ref }}\n          fetch-depth: 0")],
  ["artifact not always", source.replace("      - name: Upload complete performance evidence\n        if: always()", "      - name: Upload complete performance evidence\n        if: success()")],
  ["verdict swallowed", source.replace('run: test "${{ steps.performance.outputs.exit_code }}" = "0"', "run: true")],
];
for (const [name, spoofedSource] of spoofCases) {
  assert.throws(() => verifyControlledPerformanceWorkflow(spoofedSource), `${name} must fail structural verification`);
}

const securityOverrideCases = [
  ["job write permissions", source.replace("    runs-on: ubuntu-24.04", "    permissions:\n      contents: write\n    runs-on: ubuntu-24.04")],
  ["job current SHA", source.replace("    runs-on: ubuntu-24.04", `    env:\n      CONTROLLED_CURRENT_SHA: ${"0".repeat(40)}\n    runs-on: ubuntu-24.04`)],
  ["benchmark-step current SHA", source.replace("        id: performance", `        id: performance\n        env:\n          CONTROLLED_CURRENT_SHA: ${"0".repeat(40)}`)],
  ["unrelated-step current SHA", source.replace("      - name: Record controlled environment", `      - name: Record controlled environment\n        env:\n          CONTROLLED_CURRENT_SHA: ${"0".repeat(40)}`)],
  ["job baseline SHA", source.replace("    runs-on: ubuntu-24.04", `    env:\n      SEALED_BASELINE_SHA: ${"0".repeat(40)}\n    runs-on: ubuntu-24.04`)],
  ["benchmark-step baseline SHA", source.replace("        id: performance", `        id: performance\n        env:\n          SEALED_BASELINE_SHA: ${"0".repeat(40)}`)],
  ["same-value duplicate current SHA", source.replace("    runs-on: ubuntu-24.04", `    env:\n      CONTROLLED_CURRENT_SHA: ${CURRENT_SHA}\n    runs-on: ubuntu-24.04`)],
];
for (const [name, spoofedSource] of securityOverrideCases) {
  assert.throws(() => verifyControlledPerformanceWorkflow(spoofedSource), `${name} must fail effective override verification`);
}

assert.deepEqual({
  absoluteThresholdMs: ROUTE_V2_PERFORMANCE_PROTOCOL.absoluteThresholdMs,
  pairs: ROUTE_V2_PERFORMANCE_PROTOCOL.pairs,
  warmupOperations: ROUTE_V2_PERFORMANCE_PROTOCOL.warmupOperations,
  samplesPerSide: ROUTE_V2_PERFORMANCE_PROTOCOL.samplesPerSide,
  batchSize: ROUTE_V2_PERFORMANCE_PROTOCOL.batchSize,
}, {
  absoluteThresholdMs: 0.25,
  pairs: 6,
  warmupOperations: 5_000,
  samplesPerSide: 40,
  batchSize: 250,
});

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-controlled-performance-workflow",
  status: "PASS",
  parser: "yaml-2.9.0 structured document",
  spoofRegressions: spoofCases.length,
  securityOverrideRegressions: securityOverrideCases.length,
  trustedExecution: "workflow main revision; fixed ancestor target is data-only",
  environment: "ubuntu-24.04 / X64 / Node 24.18.0",
  performanceRunsPerDispatch: 1,
}, null, 2)}\n`);
