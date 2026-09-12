import { ROUTE_V2_PERFORMANCE_PROTOCOL } from "./route-v2-performance-reliability.mjs";
import { reconstructRawPerformanceEvidence } from "./route-v2-performance-raw-evidence.mjs";
import { validateDedicatedEnvironmentSnapshot } from "./route-v2-dedicated-performance-environment.mjs";

function sameProtocol(actual) {
  return JSON.stringify(actual) === JSON.stringify(ROUTE_V2_PERFORMANCE_PROTOCOL);
}

export function evaluateDedicatedReliabilityQualification({ runs, before, after, exitCodes }, expected) {
  const errors = [];
  const qualificationRunIds = new Set();
  const pairExecutionIds = new Set();
  const pairOccurrenceIds = new Set();
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
      if (typeof run.qualificationRunId !== "string" || qualificationRunIds.has(run.qualificationRunId)) runErrors.push(`${prefix}:qualification-run-id`);
      qualificationRunIds.add(run.qualificationRunId);
      if (run.coordinatorSha !== expected.coordinatorSha || run.currentSha !== expected.currentSha || run.baselineSha !== expected.baselineSha) runErrors.push(`${prefix}:identity`);
      if (!sameProtocol(run.protocol)) runErrors.push(`${prefix}:protocol`);
      const normal = reconstructRawPerformanceEvidence(run.normal?.rawPairs, ROUTE_V2_PERFORMANCE_PROTOCOL, { expectedMultiplier: 1, qualificationRunId: run.qualificationRunId, protocolLabel: "normal" });
      const synthetic10 = reconstructRawPerformanceEvidence(run.synthetic10?.rawPairs, ROUTE_V2_PERFORMANCE_PROTOCOL, { expectedMultiplier: 1.1, qualificationRunId: run.qualificationRunId, protocolLabel: "synthetic10" });
      const synthetic20 = reconstructRawPerformanceEvidence(run.synthetic20?.rawPairs, ROUTE_V2_PERFORMANCE_PROTOCOL, { expectedMultiplier: 1.2, qualificationRunId: run.qualificationRunId, protocolLabel: "synthetic20" });
      for (const pair of [run.normal, run.synthetic10, run.synthetic20].flatMap((result) => result?.rawPairs || [])) {
        if (pairExecutionIds.has(pair?.pairExecutionId)) runErrors.push(`${prefix}:duplicate-pair-execution-id`);
        if (typeof pair?.pairExecutionId === "string") {
          pairExecutionIds.add(pair.pairExecutionId);
          const occurrenceId = pair.pairExecutionId.split(":").at(-1);
          if (pairOccurrenceIds.has(occurrenceId)) runErrors.push(`${prefix}:reused-pair-occurrence-id`);
          pairOccurrenceIds.add(occurrenceId);
        }
      }
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
