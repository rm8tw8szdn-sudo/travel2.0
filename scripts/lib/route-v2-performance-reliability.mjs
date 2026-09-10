export const ROUTE_V2_PERFORMANCE_PROTOCOL = Object.freeze({
  baselineRef: "826439f41523500ad805d0bcb9966a630e90b859",
  absoluteThresholdMs: 0.25,
  pairs: 6,
  warmupOperations: 5_000,
  samplesPerSide: 40,
  batchSize: 250,
  maximumSideCoefficientOfVariation: 0.15,
  maximumPairedRatioSpread: 0.10,
  regressionMedianRatio: 1.10,
  regressionPairRatioFloor: 1.05,
  requiredRegressingPairs: 5,
});

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("percentile requires samples");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("median requires samples");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarize(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("summary requires samples");
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  return {
    count: values.length,
    min: Math.min(...values),
    p50: median(values),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
    mean,
    standardDeviation,
    coefficientOfVariation: mean > 0 ? standardDeviation / mean : Number.POSITIVE_INFINITY,
  };
}

function invalidEvaluation(errors, protocol) {
  return {
    valid: false,
    validationErrors: errors,
    baselineAbsoluteP95Ms: null,
    currentAbsoluteP95Ms: null,
    absoluteThresholdMs: protocol.absoluteThresholdMs,
    absoluteResult: "FAIL",
    pairResults: [],
    medianRatio: null,
    medianRelativeDelta: null,
    pairedRatioSpread: null,
    baselineDispersion: null,
    currentDispersion: null,
    pairedRatioDispersion: null,
    regressingPairs: 0,
    reliable: false,
    regressionVerdict: "INCONCLUSIVE",
    retainedSampleCounts: { baseline: 0, current: 0 },
  };
}

function measurementValidationErrors(measurement, prefix, protocol) {
  if (!measurement || typeof measurement !== "object" || Array.isArray(measurement)) return [`${prefix}:malformed`];
  const errors = [];
  if (!Number.isFinite(measurement.p95Ms) || measurement.p95Ms <= 0) errors.push(`${prefix}:invalid-p95`);
  if (!Array.isArray(measurement.samplesMs) || measurement.samplesMs.length !== protocol.samplesPerSide) {
    errors.push(`${prefix}:invalid-sample-count`);
    return errors;
  }
  if (measurement.samplesMs.some((sample) => !Number.isFinite(sample) || sample <= 0)) {
    errors.push(`${prefix}:invalid-sample`);
    return errors;
  }
  if (Number.isFinite(measurement.p95Ms) && measurement.p95Ms !== percentile(measurement.samplesMs, 0.95)) {
    errors.push(`${prefix}:p95-sample-mismatch`);
  }
  return errors;
}

export function validateWorkerEnvelope(workerResult, expected = {}, protocol = ROUTE_V2_PERFORMANCE_PROTOCOL) {
  const errors = [];
  if (!workerResult || typeof workerResult !== "object" || Array.isArray(workerResult)) {
    return { valid: false, errors: ["worker-envelope:malformed"], pair: null };
  }
  if (workerResult.worker !== "route-v2-invariant-pair") errors.push("worker-envelope:invalid-worker");
  if (workerResult.valid === false) errors.push("worker-envelope:invalid-marker");
  if (workerResult.success === false) errors.push("worker-envelope:unsuccessful-marker");
  if (!["baseline-current", "current-baseline"].includes(workerResult.order)) errors.push("worker-envelope:invalid-order");
  if (expected.order !== undefined && workerResult.order !== expected.order) errors.push("worker-envelope:unexpected-order");
  if (!Number.isFinite(workerResult.currentMultiplier) || workerResult.currentMultiplier <= 0) {
    errors.push("worker-envelope:invalid-current-multiplier");
  } else if (expected.currentMultiplier !== undefined && workerResult.currentMultiplier !== expected.currentMultiplier) {
    errors.push("worker-envelope:unexpected-current-multiplier");
  }
  errors.push(...measurementValidationErrors(workerResult.baseline, "worker-envelope:baseline", protocol));
  errors.push(...measurementValidationErrors(workerResult.current, "worker-envelope:current", protocol));
  return { valid: errors.length === 0, errors, pair: errors.length === 0 ? workerResult : null };
}

export function parseWorkerEnvelope(output, expected = {}, protocol = ROUTE_V2_PERFORMANCE_PROTOCOL) {
  if (typeof output !== "string" || output.trim() === "") {
    return { valid: false, errors: ["worker-envelope:missing-output"], pair: null };
  }
  try {
    return validateWorkerEnvelope(JSON.parse(output), expected, protocol);
  } catch {
    return { valid: false, errors: ["worker-envelope:invalid-json"], pair: null };
  }
}

function validatePairs(pairs, protocol) {
  const errors = [];
  if (!Array.isArray(pairs)) return ["pairs:not-array"];
  if (pairs.length !== protocol.pairs) errors.push(`pairs:expected-${protocol.pairs}:actual-${pairs.length}`);
  for (const [pairIndex, pair] of pairs.entries()) {
    if (!pair || typeof pair !== "object" || Array.isArray(pair)) {
      errors.push(`pair-${pairIndex + 1}:malformed`);
      continue;
    }
    if (!["baseline-current", "current-baseline"].includes(pair.order)) errors.push(`pair-${pairIndex + 1}:invalid-order`);
    errors.push(...measurementValidationErrors(pair.baseline, `pair-${pairIndex + 1}:baseline`, protocol));
    errors.push(...measurementValidationErrors(pair.current, `pair-${pairIndex + 1}:current`, protocol));
  }
  return errors;
}

export function evaluatePairedPerformance(pairs, protocol = ROUTE_V2_PERFORMANCE_PROTOCOL) {
  const validationErrors = validatePairs(pairs, protocol);
  if (validationErrors.length > 0) return invalidEvaluation(validationErrors, protocol);
  const baselineP95Values = pairs.map((pair) => pair.baseline.p95Ms);
  const currentP95Values = pairs.map((pair) => pair.current.p95Ms);
  const ratios = pairs.map((pair) => pair.current.p95Ms / pair.baseline.p95Ms);
  if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) {
    return invalidEvaluation(["pairs:invalid-ratio"], protocol);
  }
  const deltas = ratios.map((ratio) => ratio - 1);
  const baseline = summarize(baselineP95Values);
  const current = summarize(currentP95Values);
  const ratio = summarize(ratios);
  const pairedRatioSpread = ratio.max - ratio.min;
  const reliable = baseline.coefficientOfVariation <= protocol.maximumSideCoefficientOfVariation
    && current.coefficientOfVariation <= protocol.maximumSideCoefficientOfVariation
    && pairedRatioSpread <= protocol.maximumPairedRatioSpread;
  const regressingPairs = ratios.filter((value) => value >= protocol.regressionPairRatioFloor).length;
  let regressionVerdict = "INCONCLUSIVE";
  if (reliable) {
    regressionVerdict = ratio.p50 >= protocol.regressionMedianRatio
      && regressingPairs >= protocol.requiredRegressingPairs
      ? "REGRESSION"
      : "NO REGRESSION";
  }
  const allBaselineSamples = pairs.flatMap((pair) => pair.baseline.samplesMs);
  const allCurrentSamples = pairs.flatMap((pair) => pair.current.samplesMs);
  const baselineAbsoluteP95Ms = percentile(allBaselineSamples, 0.95);
  const currentAbsoluteP95Ms = percentile(allCurrentSamples, 0.95);
  const absoluteResult = currentAbsoluteP95Ms < protocol.absoluteThresholdMs ? "PASS" : "FAIL";
  return {
    valid: true,
    validationErrors: [],
    baselineAbsoluteP95Ms,
    currentAbsoluteP95Ms,
    absoluteThresholdMs: protocol.absoluteThresholdMs,
    absoluteResult,
    pairResults: pairs.map((pair, index) => ({
      pair: index + 1,
      order: pair.order,
      baselineP95Ms: pair.baseline.p95Ms,
      currentP95Ms: pair.current.p95Ms,
      ratio: ratios[index],
      relativeDelta: deltas[index],
    })),
    medianRatio: ratio.p50,
    medianRelativeDelta: ratio.p50 - 1,
    pairedRatioSpread,
    baselineDispersion: baseline,
    currentDispersion: current,
    pairedRatioDispersion: ratio,
    regressingPairs,
    reliable,
    regressionVerdict,
    retainedSampleCounts: {
      baseline: allBaselineSamples.length,
      current: allCurrentSamples.length,
    },
  };
}

export function performanceGateStatus(result) {
  if (!result || result.valid !== true) return "BLOCKED_INCONCLUSIVE";
  if (result.absoluteResult !== "PASS") return "BLOCKED_ABSOLUTE_CONTRACT";
  if (result.regressionVerdict === "REGRESSION") return "BLOCKED_REGRESSION";
  if (result.regressionVerdict === "INCONCLUSIVE") return "BLOCKED_INCONCLUSIVE";
  return "PASS";
}
