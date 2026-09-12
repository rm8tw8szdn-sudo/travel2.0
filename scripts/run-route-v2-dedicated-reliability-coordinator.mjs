import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { auditDedicatedReliabilityQualificationEvidence } from "./lib/route-v2-dedicated-reliability-qualification.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceDirectory = path.resolve(option("evidence-directory"));
const expected = { cpu: option("cpu"), coordinatorSha: option("coordinator-sha"), currentSha: option("current-sha"), baselineSha: option("baseline-sha") };
const sessionId = randomUUID();
const sessionSecret = randomBytes(32);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-dedicated-qualification-"));
const attempts = [];

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return String(process.argv[index + 1]);
}

function internalId(label) {
  const value = [...createHmac("sha256", sessionSecret).update(`${sessionId}:${label}`, "utf8").digest("hex").slice(0, 32)];
  value[12] = "4";
  value[16] = "8";
  const hex = value.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function plan(runIndex) {
  const qualificationRunId = internalId(`run:${runIndex}`);
  const pairs = [];
  for (const protocolLabel of ["normal", "synthetic10", "synthetic20"]) for (let pairIndex = 1; pairIndex <= 6; pairIndex += 1) {
    pairs.push({ protocolLabel, pairIndex, occurrenceId: internalId(`run:${runIndex}:${protocolLabel}:${pairIndex}`) });
  }
  return { sessionId, runIndex, qualificationRunId, pairs };
}

function execute(command, args, options = {}) {
  return spawnSync(command, args, { cwd: projectRoot, encoding: "utf8", timeout: 900_000, windowsHide: true, ...options });
}

function collectEnvironment(phase) {
  const output = path.join(temporaryDirectory, `environment-${phase}.json`);
  const execution = execute(process.execPath, ["scripts/collect-route-v2-dedicated-performance-environment.mjs", "--phase", phase, "--cpu", expected.cpu, "--coordinator-sha", expected.coordinatorSha, "--current-sha", expected.currentSha, "--baseline-sha", expected.baselineSha, "--output", output]);
  assert.equal(execution.status, 0, execution.stderr || `${phase} environment collection failed`);
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

function matchesPlan(run, expectedPlan) {
  if (run?.runIndex !== expectedPlan.runIndex || run?.qualificationRunId !== expectedPlan.qualificationRunId) return false;
  const actualPairs = [run.normal, run.synthetic10, run.synthetic20].flatMap((result) => result?.rawPairs || []);
  if (actualPairs.length !== expectedPlan.pairs.length) return false;
  return expectedPlan.pairs.every((pairPlan) => actualPairs.some((pair) => pair.qualificationRunId === expectedPlan.qualificationRunId
    && pair.protocolLabel === pairPlan.protocolLabel && pair.pairIndex === pairPlan.pairIndex
    && pair.pairExecutionId === `${expectedPlan.qualificationRunId}:${pairPlan.protocolLabel}:${pairPlan.pairIndex}:${pairPlan.occurrenceId}`));
}

function preserveFailureEvidence(error) {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  for (const phase of ["before", "after"]) {
    const source = path.join(temporaryDirectory, `environment-${phase}.json`);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(evidenceDirectory, `environment-${phase}.json`));
  }
  attempts.forEach((attempt) => {
    fs.writeFileSync(path.join(evidenceDirectory, `qualification-run-${attempt.runIndex}.json`), `${JSON.stringify(attempt.run, null, 2)}\n`);
    fs.writeFileSync(path.join(evidenceDirectory, `qualification-run-${attempt.runIndex}.stderr.log`), attempt.stderr || "");
  });
  const result = {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION_RUNTIME_RESULT",
    formal: false,
    gating: false,
    sessionId,
    attemptedRuns: attempts.length,
    admittedRuns: attempts.filter((attempt) => attempt.provenanceAdmitted).length,
    failedRuns: attempts.filter((attempt) => attempt.exitCode !== 0 || !attempt.provenanceAdmitted).length,
    qualificationVerdict: "QUALIFICATION FAIL",
    runtimeError: error instanceof Error ? error.message : String(error),
  };
  fs.writeFileSync(path.join(evidenceDirectory, "qualification-result.json"), `${JSON.stringify(result, null, 2)}\n`);
}

try {
  const before = collectEnvironment("before");
  for (let runIndex = 1; runIndex <= 5; runIndex += 1) {
    const expectedPlan = plan(runIndex);
    const execution = execute(process.execPath, ["scripts/run-route-v2-performance-reliability-qualification.mjs", "--current-ref", expected.currentSha, "--run-index", String(runIndex)], {
      env: { ...process.env, ROUTE_V2_QUALIFICATION_EXECUTION_PLAN: JSON.stringify(expectedPlan) },
    });
    let run = null;
    try { run = JSON.parse(execution.stdout); } catch {}
    attempts.push({ runIndex, run, stderr: execution.stderr, exitCode: execution.status ?? 1, provenanceAdmitted: matchesPlan(run, expectedPlan) });
  }
  const after = collectEnvironment("after");
  const runs = attempts.map((attempt) => attempt.run);
  const exitCodes = attempts.map((attempt) => attempt.exitCode);
  const audit = auditDedicatedReliabilityQualificationEvidence({ runs, before, after, exitCodes }, expected);
  const runtimePassed = attempts.length === 5 && attempts.every((attempt, index) => attempt.runIndex === index + 1 && attempt.exitCode === 0 && attempt.provenanceAdmitted)
    && audit.auditVerdict === "AUDIT VALID";
  const result = {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION_RUNTIME_RESULT",
    formal: false,
    gating: false,
    sessionId,
    attemptedRuns: attempts.length,
    admittedRuns: attempts.filter((attempt) => attempt.provenanceAdmitted).length,
    failedRuns: attempts.filter((attempt) => attempt.exitCode !== 0 || !attempt.provenanceAdmitted).length,
    qualificationVerdict: runtimePassed ? "QUALIFICATION PASS" : "QUALIFICATION FAIL",
    audit,
  };
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, "environment-before.json"), `${JSON.stringify(before, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDirectory, "environment-after.json"), `${JSON.stringify(after, null, 2)}\n`);
  attempts.forEach((attempt) => {
    fs.writeFileSync(path.join(evidenceDirectory, `qualification-run-${attempt.runIndex}.json`), `${JSON.stringify(attempt.run, null, 2)}\n`);
    fs.writeFileSync(path.join(evidenceDirectory, `qualification-run-${attempt.runIndex}.stderr.log`), attempt.stderr || "");
  });
  fs.writeFileSync(path.join(evidenceDirectory, "qualification-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${result.qualificationVerdict}\n`);
  if (!runtimePassed) process.exitCode = 1;
} catch (error) {
  preserveFailureEvidence(error);
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  sessionSecret.fill(0);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
