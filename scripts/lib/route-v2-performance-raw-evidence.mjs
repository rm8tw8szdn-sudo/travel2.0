const WORKER = "route-v2-invariant-pair";
const SCHEMA_VERSION = 1;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarize(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  const standardDeviation = Math.sqrt(variance);
  return { mean, standardDeviation, coefficientOfVariation: standardDeviation / mean };
}

function exactKeys(value, expected, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label}:malformed`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    errors.push(`${label}:schema`);
    return false;
  }
  return true;
}

function validateMeasurement(measurement, label, expectedActualOperations, protocol, errors) {
  if (!exactKeys(measurement, ["actualOperations", "logicalOperations", "p95Ms", "samplesMs"], label, errors)) return;
  if (!Array.isArray(measurement.samplesMs) || measurement.samplesMs.length !== protocol.samplesPerSide) {
    errors.push(`${label}:sample-count`);
    return;
  }
  if (measurement.samplesMs.some((sample) => !Number.isFinite(sample) || sample <= 0)) {
    errors.push(`${label}:samples`);
    return;
  }
  const expectedLogicalOperations = protocol.samplesPerSide * protocol.batchSize;
  if (measurement.logicalOperations !== expectedLogicalOperations) errors.push(`${label}:logical-operations`);
  if (measurement.actualOperations !== expectedActualOperations) errors.push(`${label}:actual-operations`);
  const reconstructedP95 = percentile(measurement.samplesMs, 0.95);
  if (!Number.isFinite(measurement.p95Ms) || measurement.p95Ms !== reconstructedP95) errors.push(`${label}:p95`);
}

export function reconstructRawPerformanceEvidence(rawPairs, protocol, { expectedMultiplier } = {}) {
  const errors = [];
  if (!Array.isArray(rawPairs) || rawPairs.length !== protocol.pairs) {
    return { valid: false, errors: [`pairs:count:${Array.isArray(rawPairs) ? rawPairs.length : "malformed"}`] };
  }
  rawPairs.forEach((pair, pairIndex) => {
    const label = `pair-${pairIndex + 1}`;
    if (!exactKeys(pair, ["baseline", "current", "currentMultiplier", "order", "schemaVersion", "worker"], label, errors)) return;
    const expectedOrder = pairIndex % 2 === 0 ? "baseline-current" : "current-baseline";
    if (pair.worker !== WORKER) errors.push(`${label}:worker`);
    if (pair.schemaVersion !== SCHEMA_VERSION) errors.push(`${label}:schema-version`);
    if (pair.order !== expectedOrder) errors.push(`${label}:order`);
    if (![1, 1.1, 1.2].includes(pair.currentMultiplier)) errors.push(`${label}:multiplier`);
    if (expectedMultiplier !== undefined && pair.currentMultiplier !== expectedMultiplier) errors.push(`${label}:unexpected-multiplier`);
    const logicalOperations = protocol.samplesPerSide * protocol.batchSize;
    validateMeasurement(pair.baseline, `${label}:baseline`, logicalOperations, protocol, errors);
    validateMeasurement(pair.current, `${label}:current`, Math.round(logicalOperations * pair.currentMultiplier), protocol, errors);
  });
  if (errors.length > 0) return { valid: false, errors };

  const baselinePairP95 = rawPairs.map((pair) => pair.baseline.p95Ms);
  const currentPairP95 = rawPairs.map((pair) => pair.current.p95Ms);
  const ratios = rawPairs.map((pair) => pair.current.p95Ms / pair.baseline.p95Ms);
  if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) return { valid: false, errors: ["pairs:ratio"] };
  const baselineSamples = rawPairs.flatMap((pair) => pair.baseline.samplesMs);
  const currentSamples = rawPairs.flatMap((pair) => pair.current.samplesMs);
  const baselineDispersion = summarize(baselinePairP95);
  const currentDispersion = summarize(currentPairP95);
  const spread = Math.max(...ratios) - Math.min(...ratios);
  const reliable = baselineDispersion.coefficientOfVariation <= protocol.maximumSideCoefficientOfVariation
    && currentDispersion.coefficientOfVariation <= protocol.maximumSideCoefficientOfVariation
    && spread <= protocol.maximumPairedRatioSpread;
  const regressingPairs = ratios.filter((ratio) => ratio >= protocol.regressionPairRatioFloor).length;
  const medianRatio = median(ratios);
  const regressionVerdict = reliable
    ? medianRatio >= protocol.regressionMedianRatio && regressingPairs >= protocol.requiredRegressingPairs
      ? "REGRESSION"
      : "NO REGRESSION"
    : "INCONCLUSIVE";
  const currentAbsoluteP95Ms = percentile(currentSamples, 0.95);
  return {
    valid: true,
    errors: [],
    baselineAbsoluteP95Ms: percentile(baselineSamples, 0.95),
    currentAbsoluteP95Ms,
    absoluteResult: currentAbsoluteP95Ms < protocol.absoluteThresholdMs ? "PASS" : "FAIL",
    baselineCoefficientOfVariation: baselineDispersion.coefficientOfVariation,
    currentCoefficientOfVariation: currentDispersion.coefficientOfVariation,
    pairRatios: ratios,
    medianRatio,
    medianPairedDelta: medianRatio - 1,
    pairedRatioSpread: spread,
    regressingPairs,
    reliable,
    regressionVerdict,
    retainedSampleCounts: { baseline: baselineSamples.length, current: currentSamples.length },
  };
}

export function rawPairEvidenceFromValidatedPair(pair, currentMultiplier) {
  if (!pair) return null;
  return {
    worker: WORKER,
    schemaVersion: SCHEMA_VERSION,
    order: pair.order,
    currentMultiplier,
    baseline: {
      p95Ms: pair.baseline.p95Ms,
      samplesMs: [...pair.baseline.samplesMs],
      logicalOperations: pair.baseline.logicalOperations,
      actualOperations: pair.baseline.actualOperations,
    },
    current: {
      p95Ms: pair.current.p95Ms,
      samplesMs: [...pair.current.samplesMs],
      logicalOperations: pair.current.logicalOperations,
      actualOperations: pair.current.actualOperations,
    },
  };
}
