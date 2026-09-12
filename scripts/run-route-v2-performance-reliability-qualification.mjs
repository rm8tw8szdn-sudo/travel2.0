import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ROUTE_V2_PERFORMANCE_PROTOCOL as protocol,
  evaluatePairedPerformance,
  validateWorkerResult,
} from "./lib/route-v2-performance-reliability.mjs";
import {
  rawPairEvidenceFromValidatedPair,
  reconstructRawPerformanceEvidence,
} from "./lib/route-v2-performance-raw-evidence.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-reliability-qualification-"));
const baselineRoot = path.join(temporaryRoot, "baseline");
const currentRoot = path.join(temporaryRoot, "current");
const currentRef = option("current-ref");
const runIndex = Number(option("run-index"));
const qualificationRunId = randomUUID();

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return String(process.argv[index + 1]);
}

function exactCommit(ref, label) {
  assert.match(ref, /^[0-9a-f]{40}$/u, `${label} must be an exact lowercase commit SHA`);
  execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd: projectRoot, stdio: "pipe" });
  assert.equal(execFileSync("git", ["rev-parse", `${ref}^{commit}`], { cwd: projectRoot, encoding: "utf8" }).trim(), ref);
}

function archiveSource(ref, destination, archiveName) {
  fs.mkdirSync(destination, { recursive: true });
  const archive = path.join(temporaryRoot, archiveName);
  execFileSync("git", ["archive", "--format=tar", `--output=${archive}`, ref, "src"], { cwd: projectRoot, stdio: "pipe" });
  execFileSync("tar", ["-xf", archive, "-C", destination], { stdio: "pipe" });
}

function runPair({ baselineSubjectRoot, currentSubjectRoot, pairIndex, multiplier }) {
  const occurrenceId = randomUUID();
  const order = pairIndex % 2 === 0 ? "baseline-current" : "current-baseline";
  const execution = spawnSync(process.execPath, [
    "--expose-gc",
    "scripts/benchmark-route-v2-invariant-pair-worker.mjs",
    "--baseline-root", baselineSubjectRoot,
    "--current-root", currentSubjectRoot,
    "--order", order,
    "--current-multiplier", String(multiplier),
    "--warmup-operations", String(protocol.warmupOperations),
    "--samples-per-side", String(protocol.samplesPerSide),
    "--batch-size", String(protocol.batchSize),
  ], { cwd: projectRoot, encoding: "utf8", timeout: 120_000, windowsHide: true });
  return { validation: validateWorkerResult(execution, { order, currentMultiplier: multiplier }), occurrenceId };
}

function runProtocol(label, baselineSubjectRoot, currentSubjectRoot, multiplier) {
  const workers = Array.from({ length: protocol.pairs }, (_, pairIndex) => runPair({
    baselineSubjectRoot, currentSubjectRoot, pairIndex, multiplier,
  }));
  const workerErrors = workers.flatMap((worker, index) => worker.validation.errors.map((error) => `pair-${index + 1}:${error}`));
  const rawPairs = workers.map((worker, pairIndex) => rawPairEvidenceFromValidatedPair(worker.validation.pair, multiplier, {
    qualificationRunId, protocolLabel: label, pairIndex: pairIndex + 1, occurrenceId: worker.occurrenceId,
  }));
  const reconstruction = reconstructRawPerformanceEvidence(rawPairs, protocol, {
    expectedMultiplier: multiplier, qualificationRunId, protocolLabel: label,
  });
  if (workerErrors.length > 0 || !reconstruction.valid) {
    return { label, multiplier, valid: false, errors: [...workerErrors, ...(reconstruction.errors || [])], rawPairs, reconstruction };
  }
  const sealedEvaluation = evaluatePairedPerformance(workers.map((worker) => worker.validation.pair));
  assert.equal(sealedEvaluation.valid, true);
  for (const key of [
    "baselineAbsoluteP95Ms", "currentAbsoluteP95Ms", "absoluteResult", "medianRatio",
    "pairedRatioSpread", "regressingPairs", "reliable", "regressionVerdict",
  ]) assert.equal(reconstruction[key], sealedEvaluation[key], `independent reconstruction mismatch: ${key}`);
  return { label, multiplier, valid: true, errors: [], rawPairs, reconstruction };
}

try {
  assert(Number.isInteger(runIndex) && runIndex >= 1 && runIndex <= 5, "run-index must be 1..5");
  exactCommit(currentRef, "current-ref");
  exactCommit(protocol.baselineRef, "baseline-ref");
  archiveSource(protocol.baselineRef, baselineRoot, "baseline.tar");
  archiveSource(currentRef, currentRoot, "current.tar");
  const normal = runProtocol("normal", baselineRoot, currentRoot, 1);
  const synthetic10 = runProtocol("synthetic10", currentRoot, currentRoot, 1.1);
  const synthetic20 = runProtocol("synthetic20", currentRoot, currentRoot, 1.2);
  const passed = normal.valid && normal.reconstruction.reliable
    && normal.reconstruction.pairedRatioSpread <= protocol.maximumPairedRatioSpread
    && synthetic20.valid && synthetic20.reconstruction.reliable
    && synthetic20.reconstruction.regressionVerdict === "REGRESSION";
  const result = {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION_RUN",
    schemaVersion: 1,
    formal: false,
    gating: false,
    runIndex,
    qualificationRunId,
    coordinatorSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim(),
    currentSha: currentRef,
    baselineSha: protocol.baselineRef,
    environment: { platform: process.platform, architecture: process.arch, node: process.version, cpu: os.cpus()[0]?.model || "unknown" },
    protocol: { ...protocol },
    normal,
    synthetic10,
    synthetic20,
    qualificationVerdict: passed ? "QUALIFICATION PASS" : "QUALIFICATION FAIL",
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
