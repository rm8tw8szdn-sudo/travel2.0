import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ROUTE_V2_PERFORMANCE_PROTOCOL,
  evaluatePairedPerformance,
  performanceGateStatus,
  validateWorkerResult,
} from "./lib/route-v2-performance-reliability.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-performance-reliability-"));
const baselineRoot = path.join(temporaryRoot, "baseline");
const archivePath = path.join(temporaryRoot, "baseline.tar");
const currentArchivePath = path.join(temporaryRoot, "current.tar");
const archivedCurrentRoot = path.join(temporaryRoot, "current");
const normalOnly = process.argv.includes("--normal-only");
const currentRefOptionIndex = process.argv.indexOf("--current-ref");
const requestedCurrentRef = currentRefOptionIndex >= 0 ? String(process.argv[currentRefOptionIndex + 1] || "") : "";
fs.mkdirSync(baselineRoot, { recursive: true });
if (requestedCurrentRef) fs.mkdirSync(archivedCurrentRoot, { recursive: true });

function round(value) {
  return Number(value.toFixed(6));
}

function runPair({ baselineSubjectRoot, currentSubjectRoot, pairIndex, multiplier }) {
  const order = pairIndex % 2 === 0 ? "baseline-current" : "current-baseline";
  const result = spawnSync(process.execPath, [
    "--expose-gc",
    "scripts/benchmark-route-v2-invariant-pair-worker.mjs",
    "--baseline-root", baselineSubjectRoot,
    "--current-root", currentSubjectRoot,
    "--order", order,
    "--current-multiplier", String(multiplier),
    "--warmup-operations", String(ROUTE_V2_PERFORMANCE_PROTOCOL.warmupOperations),
    "--samples-per-side", String(ROUTE_V2_PERFORMANCE_PROTOCOL.samplesPerSide),
    "--batch-size", String(ROUTE_V2_PERFORMANCE_PROTOCOL.batchSize),
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  return validateWorkerResult(result, { order, currentMultiplier: multiplier });
}

function runProtocol({ label, baselineSubjectRoot, currentSubjectRoot, multiplier }) {
  const workerResults = Array.from({ length: ROUTE_V2_PERFORMANCE_PROTOCOL.pairs }, (_, pairIndex) => runPair({
    baselineSubjectRoot,
    currentSubjectRoot,
    pairIndex,
    multiplier,
  }));
  const workerErrors = workerResults.flatMap((result, pairIndex) => result.errors.map((error) => `pair-${pairIndex + 1}:${error}`));
  const evaluated = evaluatePairedPerformance(workerResults.map((result) => result.pair));
  if (workerErrors.length > 0) evaluated.validationErrors = [...workerErrors, ...evaluated.validationErrors];
  if (!evaluated.valid) {
    return { label, syntheticCurrentWorkMultiplier: multiplier, ...evaluated };
  }
  return {
    label,
    syntheticCurrentWorkMultiplier: multiplier,
    ...evaluated,
    baselineAbsoluteP95Ms: round(evaluated.baselineAbsoluteP95Ms),
    currentAbsoluteP95Ms: round(evaluated.currentAbsoluteP95Ms),
    medianRatio: round(evaluated.medianRatio),
    medianRelativeDelta: round(evaluated.medianRelativeDelta),
    pairedRatioSpread: round(evaluated.pairedRatioSpread),
    pairResults: evaluated.pairResults.map((pair) => ({
      ...pair,
      baselineP95Ms: round(pair.baselineP95Ms),
      currentP95Ms: round(pair.currentP95Ms),
      ratio: round(pair.ratio),
      relativeDelta: round(pair.relativeDelta),
    })),
  };
}

try {
  execFileSync("git", ["cat-file", "-e", `${ROUTE_V2_PERFORMANCE_PROTOCOL.baselineRef}^{commit}`], {
    cwd: projectRoot,
    stdio: "pipe",
  });
  execFileSync("git", [
    "archive", "--format=tar", `--output=${archivePath}`,
    ROUTE_V2_PERFORMANCE_PROTOCOL.baselineRef, "src",
  ], { cwd: projectRoot, stdio: "pipe" });
  execFileSync("tar", ["-xf", archivePath, "-C", baselineRoot], { stdio: "pipe" });
  let currentSubjectRoot = projectRoot;
  let resolvedCurrentRef = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim();
  if (requestedCurrentRef) {
    assert.match(requestedCurrentRef, /^[0-9a-f]{40}$/u, "--current-ref must be an exact lowercase commit SHA");
    execFileSync("git", ["cat-file", "-e", `${requestedCurrentRef}^{commit}`], { cwd: projectRoot, stdio: "pipe" });
    resolvedCurrentRef = execFileSync("git", ["rev-parse", `${requestedCurrentRef}^{commit}`], { cwd: projectRoot, encoding: "utf8" }).trim();
    assert.equal(resolvedCurrentRef, requestedCurrentRef, "--current-ref must resolve exactly");
    execFileSync("git", ["archive", "--format=tar", `--output=${currentArchivePath}`, requestedCurrentRef, "src"], { cwd: projectRoot, stdio: "pipe" });
    execFileSync("tar", ["-xf", currentArchivePath, "-C", archivedCurrentRoot], { stdio: "pipe" });
    currentSubjectRoot = archivedCurrentRoot;
  }

  const normal = runProtocol({
    label: "sealed-baseline-vs-current",
    baselineSubjectRoot: baselineRoot,
    currentSubjectRoot,
    multiplier: 1,
  });
  const synthetic10 = normalOnly ? null : runProtocol({
    label: "synthetic-10-percent",
    baselineSubjectRoot: currentSubjectRoot,
    currentSubjectRoot,
    multiplier: 1.1,
  });
  const synthetic20 = normalOnly ? null : runProtocol({
    label: "synthetic-20-percent",
    baselineSubjectRoot: currentSubjectRoot,
    currentSubjectRoot,
    multiplier: 1.2,
  });
  const detectsTwentyPercentRegression = synthetic20 === null ? null : synthetic20.reliable
    && synthetic20.regressionVerdict === "REGRESSION";
  const result = {
    verifier: "route-v2-performance-reliability",
    status: performanceGateStatus(normal),
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpuCount: os.cpus().length,
      sameHost: true,
      coordinatorSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim(),
      currentSha: resolvedCurrentRef,
      childProcessFlags: ["--expose-gc"],
    },
    protocol: {
      ...ROUTE_V2_PERFORMANCE_PROTOCOL,
      order: "balanced alternating baseline-current/current-baseline",
      input: "fixed Tokyo-Kyoto-Osaka seven-day RouteIntent fixture",
      samplePolicy: "retain every measured batch; no outlier removal or result-selected reruns",
      reliabilityBasis: "Each side's pair-p95 coefficient of variation must be <=15%, and the paired ratio range must be <=10%. The ratio range is capped below the mandatory 20% synthetic signal; the detector test proves whether this host can separate that signal from residual noise.",
    },
    normal,
    syntheticValidation: normalOnly ? null : {
      tenPercent: synthetic10,
      twentyPercent: synthetic20,
      detectsTwentyPercentRegression,
    },
    semantics: {
      absoluteContract: `${normal.currentAbsoluteP95Ms}ms < ${ROUTE_V2_PERFORMANCE_PROTOCOL.absoluteThresholdMs}ms => ${normal.absoluteResult}`,
      regressionGate: normal.regressionVerdict,
      combinedGate: performanceGateStatus(normal),
      absoluteFailureCannotBeOverriddenByNoRegression: true,
    },
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if ((!normalOnly && !detectsTwentyPercentRegression) || performanceGateStatus(normal) !== "PASS") process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
