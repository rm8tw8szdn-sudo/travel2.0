import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { ROUTE_V2_PERFORMANCE_PROTOCOL } from "./lib/route-v2-performance-reliability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/route-v2-performance-reliability-qualification.yml");
const source = fs.readFileSync(workflowPath, "utf8");
const coordinatorSource = fs.readFileSync(path.join(root, "scripts/run-route-v2-dedicated-reliability-coordinator.mjs"), "utf8");
const CURRENT_SHA = "1a9234f14e11aebe63eb043c78eeb73040ab7452";
const BASELINE_SHA = "826439f41523500ad805d0bcb9966a630e90b859";
const SENSITIVE_ENV = ["CONTROLLED_CURRENT_SHA", "SEALED_BASELINE_SHA", "QUALIFICATION_CPU", "QUALIFICATION_RUNS"];

function normalizeNewlines(value) { return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n"); }
function normalizedRun(value) { return normalizeNewlines(value || "").trim(); }
function parse(sourceText) {
  const document = parseDocument(sourceText, { uniqueKeys: true });
  assert.equal(document.errors.length, 0, document.errors.map((error) => error.message).join("\n"));
  return document.toJS();
}
function step(steps, name) {
  const found = steps.filter((item) => item?.name === name);
  assert.equal(found.length, 1, `exactly one step required: ${name}`);
  return found[0];
}
function noSensitiveOverrides(env, label) {
  if (env === undefined) return;
  assert(env && typeof env === "object" && !Array.isArray(env), `${label}:env`);
  assert.deepEqual(SENSITIVE_ENV.filter((key) => Object.hasOwn(env, key)), [], `${label}:security-sensitive override`);
}
function mutate(sourceText, target, replacement, label) {
  const normalized = normalizeNewlines(sourceText);
  assert(normalized.includes(target), `${label}:target`);
  const changed = normalized.replace(target, replacement);
  assert.notEqual(changed, normalized, `${label}:mutation`);
  return changed;
}

export function verifyDedicatedQualificationWorkflow(sourceText) {
  const workflow = parse(sourceText);
  assert.equal(workflow["continue-on-error"], undefined, "workflow-level continue-on-error is forbidden");
  assert.deepEqual(workflow.on, { workflow_dispatch: null });
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.concurrency, { group: "route-v2-dedicated-reliability-qualification", "cancel-in-progress": false });
  assert.deepEqual(workflow.env, {
    CONTROLLED_CURRENT_SHA: CURRENT_SHA,
    SEALED_BASELINE_SHA: BASELINE_SHA,
    QUALIFICATION_CPU: "0",
    QUALIFICATION_RUNS: "5",
  });
  assert.deepEqual(Object.keys(workflow.jobs), ["dedicated-reliability-qualification"]);
  const job = workflow.jobs["dedicated-reliability-qualification"];
  assert.deepEqual(job["runs-on"], ["self-hosted", "linux", "x64", "route-v2-performance-dedicated"]);
  assert.equal(job["timeout-minutes"], 30);
  assert.equal(job.strategy, undefined);
  assert.equal(job.permissions, undefined);
  assert.equal(job["continue-on-error"], undefined, "job-level continue-on-error is forbidden");
  noSensitiveOverrides(job.env, "job");
  assert(Array.isArray(job.steps));
  for (const item of job.steps) {
    noSensitiveOverrides(item?.env, `step:${item?.name}`);
    assert.equal(item?.["continue-on-error"], undefined, `step:${item?.name}:continue-on-error is forbidden`);
  }
  assert.deepEqual(job.steps.map((item) => item.name), [
    "Require trusted main dispatch", "Checkout trusted qualification revision", "Verify trusted identities and lineage",
    "Pin Node.js", "Install locked dependencies", "Validate qualification infrastructure", "Run trusted single-process qualification coordinator",
    "Upload complete qualification evidence", "Enforce qualification verdict",
  ]);

  assert.equal(normalizedRun(step(job.steps, "Require trusted main dispatch").run), 'test "${GITHUB_REF}" = "refs/heads/main"');
  const checkout = step(job.steps, "Checkout trusted qualification revision");
  assert.equal(checkout.uses, "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
  assert.deepEqual(checkout.with, { "fetch-depth": 0, lfs: false });
  const node = step(job.steps, "Pin Node.js");
  assert.equal(node.uses, "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
  assert.deepEqual(node.with, { "node-version": "24.18.0", cache: "npm" });
  assert.equal(normalizedRun(step(job.steps, "Install locked dependencies").run), "npm ci --ignore-scripts");
  const validation = normalizedRun(step(job.steps, "Validate qualification infrastructure").run).split("\n");
  assert.deepEqual(validation, [
    "node scripts/verify-route-v2-performance-reliability-logic.mjs",
    "node scripts/verify-route-v2-performance-raw-evidence.mjs",
    "node scripts/verify-route-v2-dedicated-performance-environment.mjs",
    "node scripts/verify-route-v2-dedicated-reliability-qualification.mjs",
    "node scripts/verify-route-v2-dedicated-reliability-coordinator.mjs",
    "node scripts/verify-route-v2-performance-reliability-qualification-workflow.mjs",
  ]);
  const coordinator = normalizedRun(step(job.steps, "Run trusted single-process qualification coordinator").run);
  for (const required of ["command -v taskset", 'test "${RUNNER_OS}" = "Linux"', 'test "${RUNNER_ARCH}" = "X64"',
    "scripts/run-route-v2-dedicated-reliability-coordinator.mjs", "--evidence-directory qualification-artifacts",
    "--evidence-directory qualification-artifacts", '--cpu "${QUALIFICATION_CPU}"', '--coordinator-sha "${GITHUB_SHA}"',
    '--current-sha "${CONTROLLED_CURRENT_SHA}"', '--baseline-sha "${SEALED_BASELINE_SHA}"',
  ]) assert(coordinator.includes(required));
  assert.equal((coordinator.match(/run-route-v2-dedicated-reliability-coordinator\.mjs/gu) || []).length, 1);
  assert(coordinatorSource.includes("for (let runIndex = 1; runIndex <= 5; runIndex += 1)"));
  assert(coordinatorSource.includes("const sessionSecret = randomBytes(32)"));
  assert(coordinatorSource.includes("sessionSecret.fill(0)"));
  const upload = step(job.steps, "Upload complete qualification evidence");
  assert.equal(upload.if, "always()");
  assert.equal(upload.uses, "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  assert.equal(upload.with.path, "qualification-artifacts/");
  assert.equal(upload.with["if-no-files-found"], "error");
  const enforce = step(job.steps, "Enforce qualification verdict");
  assert.equal(enforce.if, "always()");
  assert.equal(normalizedRun(enforce.run), [
    'test "${{ steps.qualification.outputs.exit_code }}" = "0"',
    'test "${{ steps.evidence.outcome }}" = "success"',
  ].join("\n"));
  const serialized = JSON.stringify(workflow).toUpperCase();
  for (const forbidden of ["PERFORMANCE PASS", "PERFORMANCE BLOCKER CLEARED", "BATCH10 UNBLOCKED", "BATCH 10 UNBLOCKED"]) assert(!serialized.includes(forbidden));
  return workflow;
}

verifyDedicatedQualificationWorkflow(source);
const mutations = [
  ["hosted runner fallback", "runs-on: [self-hosted, linux, x64, route-v2-performance-dedicated]", "runs-on: ubuntu-24.04"],
  ["missing dedicated label", "runs-on: [self-hosted, linux, x64, route-v2-performance-dedicated]", "runs-on: [self-hosted, linux, x64]"],
  ["qualification count four", '  QUALIFICATION_RUNS: "5"', '  QUALIFICATION_RUNS: "4"'],
  ["retry path", "          exit_code=$?", "          node scripts/run-route-v2-dedicated-reliability-coordinator.mjs\n          exit_code=$?"],
  ["current override", "    timeout-minutes: 30", `    env:\n      CONTROLLED_CURRENT_SHA: ${"0".repeat(40)}\n    timeout-minutes: 30`],
  ["baseline step override", "        id: qualification", `        id: qualification\n        env:\n          SEALED_BASELINE_SHA: ${"0".repeat(40)}`],
  ["missing telemetry", "--evidence-directory qualification-artifacts", "--evidence-directory incomplete-artifacts"],
  ["artifact failure loss", "        if: always()", "        if: success()"],
  ["swallowed verdict", 'test "${{ steps.qualification.outputs.exit_code }}" = "0"', "true"],
  ["formal unblock wording", "name: Route V2 Dedicated Reliability Qualification (NON-FORMAL)", "name: PERFORMANCE BLOCKER CLEARED"],
  ["skip raw evidence verifier", "          node scripts/verify-route-v2-performance-raw-evidence.mjs\n", ""],
  ["job continue-on-error", "    timeout-minutes: 30", "    continue-on-error: true\n    timeout-minutes: 30"],
  ["normal step continue-on-error", "      - name: Validate qualification infrastructure", "      - name: Validate qualification infrastructure\n        continue-on-error: true"],
  ["final enforcement continue-on-error", "      - name: Enforce qualification verdict\n        if: always()", "      - name: Enforce qualification verdict\n        continue-on-error: true\n        if: always()"],
  ["expression continue-on-error", "      - name: Run trusted single-process qualification coordinator\n        id: qualification", "      - name: Run trusted single-process qualification coordinator\n        continue-on-error: ${{ inputs.tolerate_failure }}\n        id: qualification"],
];
for (const [label, target, replacement] of mutations) {
  assert.throws(() => verifyDedicatedQualificationWorkflow(mutate(source, target, replacement, label)), label);
}
assert.deepEqual({
  absoluteThresholdMs: ROUTE_V2_PERFORMANCE_PROTOCOL.absoluteThresholdMs,
  pairs: ROUTE_V2_PERFORMANCE_PROTOCOL.pairs,
  warmupOperations: ROUTE_V2_PERFORMANCE_PROTOCOL.warmupOperations,
  samplesPerSide: ROUTE_V2_PERFORMANCE_PROTOCOL.samplesPerSide,
  batchSize: ROUTE_V2_PERFORMANCE_PROTOCOL.batchSize,
}, { absoluteThresholdMs: 0.25, pairs: 6, warmupOperations: 5000, samplesPerSide: 40, batchSize: 250 });

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-performance-reliability-qualification-workflow",
  status: "PASS",
  dedicatedLabels: ["self-hosted", "linux", "x64", "route-v2-performance-dedicated"],
  exactQualificationRuns: 5,
  structuralRegressions: mutations.length,
  formalIsolation: "PASS",
}, null, 2)}\n`);
