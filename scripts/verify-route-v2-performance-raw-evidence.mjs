import assert from "node:assert/strict";
import { ROUTE_V2_PERFORMANCE_PROTOCOL as protocol } from "./lib/route-v2-performance-reliability.mjs";
import { reconstructRawPerformanceEvidence } from "./lib/route-v2-performance-raw-evidence.mjs";

function measurement(value, multiplier = 1) {
  const samplesMs = Array.from({ length: protocol.samplesPerSide }, () => value);
  const logicalOperations = protocol.samplesPerSide * protocol.batchSize;
  return { p95Ms: value, samplesMs, logicalOperations, actualOperations: Math.round(logicalOperations * multiplier) };
}

function evidence(multiplier = 1, baseline = 0.2, current = 0.2 * multiplier) {
  return Array.from({ length: protocol.pairs }, (_, index) => ({
    worker: "route-v2-invariant-pair",
    schemaVersion: 1,
    order: index % 2 === 0 ? "baseline-current" : "current-baseline",
    currentMultiplier: multiplier,
    baseline: measurement(baseline),
    current: measurement(current, multiplier),
  }));
}

function expectInvalid(mutator, message) {
  const fixture = structuredClone(evidence());
  mutator(fixture);
  assert.equal(reconstructRawPerformanceEvidence(fixture, protocol).valid, false, message);
}

const normal = reconstructRawPerformanceEvidence(evidence(), protocol, { expectedMultiplier: 1 });
assert.equal(normal.valid, true);
assert.equal(normal.baselineAbsoluteP95Ms, 0.2);
assert.equal(normal.currentAbsoluteP95Ms, 0.2);
assert.equal(normal.medianPairedDelta, 0);
assert.equal(normal.pairedRatioSpread, 0);
assert.equal(normal.reliable, true);
assert.equal(normal.regressionVerdict, "NO REGRESSION");
assert.deepEqual(normal.retainedSampleCounts, { baseline: 240, current: 240 });

const synthetic20 = reconstructRawPerformanceEvidence(evidence(1.2), protocol, { expectedMultiplier: 1.2 });
assert.equal(synthetic20.valid, true);
assert.equal(synthetic20.reliable, true);
assert.equal(synthetic20.regressionVerdict, "REGRESSION");
assert.equal(synthetic20.regressingPairs, 6);

expectInvalid((pairs) => { delete pairs[0].baseline.samplesMs; }, "missing raw samples");
expectInvalid((pairs) => { pairs[0].baseline.samplesMs[0] = Number.NaN; }, "malformed raw samples");
expectInvalid((pairs) => { pairs[0].current.samplesMs.pop(); }, "sample count mismatch");
expectInvalid((pairs) => { pairs[0].worker = "unexpected-worker"; }, "worker identity mismatch");
expectInvalid((pairs) => { pairs[0].baseline.p95Ms = 0.21; }, "p95 mismatch");
expectInvalid((pairs) => { pairs[0].current.actualOperations = 1; }, "operation count mismatch");
expectInvalid((pairs) => { pairs[0].order = "current-baseline"; }, "balanced order mismatch");
expectInvalid((pairs) => { pairs[0].extra = true; }, "unknown evidence field");
assert.equal(reconstructRawPerformanceEvidence(evidence().slice(0, 5), protocol).valid, false);
assert.equal(reconstructRawPerformanceEvidence(evidence(1.1), protocol, { expectedMultiplier: 1.2 }).valid, false);

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-performance-raw-evidence",
  status: "PASS",
  completeEvidence: "PASS",
  independentReconstruction: "PASS",
  failClosedCases: 10,
}, null, 2)}\n`);
