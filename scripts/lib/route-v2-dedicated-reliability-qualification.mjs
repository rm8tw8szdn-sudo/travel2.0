import { ROUTE_V2_PERFORMANCE_PROTOCOL } from "./route-v2-performance-reliability.mjs";
import { reconstructRawPerformanceEvidence } from "./route-v2-performance-raw-evidence.mjs";
import { validateDedicatedEnvironmentSnapshot } from "./route-v2-dedicated-performance-environment.mjs";

function sameProtocol(actual) {
  return JSON.stringify(actual) === JSON.stringify(ROUTE_V2_PERFORMANCE_PROTOCOL);
}

export function evaluateDedicatedReliabilityQualification({ runs, before, after, exitCodes }, expected) {
  const errors = [];
  if (!Array.isArray(runs) || runs.length !== 5) errors.push(`qualification:run-count:${Array.isArray(runs) ? runs.length : "malformed"}`);
  if (!Array.isArray(exitCodes) || exitCodes.length !== 5 || exitCodes.some((code) => !Number.isInteger(code))) errors.push("qualification:exit-codes");
  const beforeValidation = validateDedicatedEnvironmentSnapshot(before, expected);
  const afterValidation = validateDedicatedEnvironmentSnapshot(after, expected);
  if (!beforeValidation.valid || before?.phase !== "before") errors.push(...beforeValidation.errors.map((error) => `before:${error}`), "before:phase");
  if (!afterValidation.valid || after?.phase !== "after") errors.push(...afterValidation.errors.map((error) => `after:${error}`), "after:phase");
  const runResults = [];
  if (Array.isArray(runs)) runs.forEach((run, index) => {
    const prefix = `run-${index + 1}`;
    const runErrors = [];
    if (!run || typeof run !== "object" || Array.isArray(run)) runErrors.push(`${prefix}:malformed`);
    else {
      if (run.kind !== "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION_RUN") runErrors.push(`${prefix}:kind`);
      if (run.formal !== false || run.gating !== false) runErrors.push(`${prefix}:isolation`);
      if (run.runIndex !== index + 1) runErrors.push(`${prefix}:index`);
      if (run.coordinatorSha !== expected.coordinatorSha || run.currentSha !== expected.currentSha || run.baselineSha !== expected.baselineSha) runErrors.push(`${prefix}:identity`);
      if (!sameProtocol(run.protocol)) runErrors.push(`${prefix}:protocol`);
      const normal = reconstructRawPerformanceEvidence(run.normal?.rawPairs, ROUTE_V2_PERFORMANCE_PROTOCOL, { expectedMultiplier: 1 });
      const synthetic10 = reconstructRawPerformanceEvidence(run.synthetic10?.rawPairs, ROUTE_V2_PERFORMANCE_PROTOCOL, { expectedMultiplier: 1.1 });
      const synthetic20 = reconstructRawPerformanceEvidence(run.synthetic20?.rawPairs, ROUTE_V2_PERFORMANCE_PROTOCOL, { expectedMultiplier: 1.2 });
      if (!normal.valid) runErrors.push(...normal.errors.map((error) => `${prefix}:normal:${error}`));
      if (!synthetic10.valid) runErrors.push(...synthetic10.errors.map((error) => `${prefix}:synthetic10:${error}`));
      if (!synthetic20.valid) runErrors.push(...synthetic20.errors.map((error) => `${prefix}:synthetic20:${error}`));
      if (normal.valid && (!normal.reliable || normal.pairedRatioSpread > ROUTE_V2_PERFORMANCE_PROTOCOL.maximumPairedRatioSpread)) runErrors.push(`${prefix}:normal-unreliable`);
      if (synthetic20.valid && (!synthetic20.reliable || synthetic20.regressionVerdict !== "REGRESSION")) runErrors.push(`${prefix}:synthetic20-not-detected`);
      if (run.qualificationVerdict !== (runErrors.length === 0 ? "QUALIFICATION PASS" : "QUALIFICATION FAIL")) runErrors.push(`${prefix}:declared-verdict`);
      runResults.push({ runIndex: index + 1, valid: runErrors.length === 0, normal, synthetic10, synthetic20 });
    }
    errors.push(...runErrors);
  });
  if (Array.isArray(exitCodes) && exitCodes.some((code) => code !== 0)) errors.push("qualification:execution-failure");
  return {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION",
    formal: false,
    gating: false,
    verdict: errors.length === 0 ? "QUALIFICATION PASS" : "QUALIFICATION FAIL",
    errors,
    requiredRuns: 5,
    acceptedRuns: runResults.filter((run) => run.valid).length,
    runs: runResults,
  };
}
