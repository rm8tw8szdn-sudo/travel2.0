import assert from "node:assert/strict";
import {
  ROUTE_V2_PERFORMANCE_PROTOCOL,
  evaluatePairedPerformance,
  performanceGateStatus,
} from "./lib/route-v2-performance-reliability.mjs";

function pairs(ratios, baselineValues = [0.2, 0.201, 0.199, 0.202, 0.198, 0.2]) {
  return baselineValues.map((baseline, index) => ({
    order: index % 2 === 0 ? "baseline-current" : "current-baseline",
    baseline: { p95Ms: baseline, samplesMs: Array(40).fill(baseline) },
    current: { p95Ms: baseline * ratios[index], samplesMs: Array(40).fill(baseline * ratios[index]) },
  }));
}

function assertBlocked(candidate, label) {
  const result = evaluatePairedPerformance(candidate);
  assert.equal(result.valid, false, `${label}: invalid input must be identified`);
  assert.equal(result.absoluteResult, "FAIL", `${label}: absolute result must fail closed`);
  assert.equal(result.reliable, false, `${label}: reliability must be false`);
  assert.equal(result.regressionVerdict, "INCONCLUSIVE", `${label}: regression must be inconclusive`);
  assert.equal(performanceGateStatus(result), "BLOCKED_INCONCLUSIVE", `${label}: combined gate must block`);
}

const equivalent = evaluatePairedPerformance(pairs([1, 1.01, 0.99, 1.02, 0.98, 1]));
assert.equal(equivalent.regressionVerdict, "NO REGRESSION");
assert.equal(equivalent.absoluteResult, "PASS");
assert.equal(performanceGateStatus(equivalent), "PASS");
assert.deepEqual(equivalent.retainedSampleCounts, { baseline: 240, current: 240 });

const regression = evaluatePairedPerformance(pairs([1.2, 1.19, 1.21, 1.2, 1.18, 1.22]));
assert.equal(regression.regressionVerdict, "REGRESSION");
assert.equal(performanceGateStatus(regression), "BLOCKED_REGRESSION");

const noisy = evaluatePairedPerformance(pairs([0.7, 1.3, 0.8, 1.4, 0.75, 1.35]));
assert.equal(noisy.regressionVerdict, "INCONCLUSIVE");
assert.equal(performanceGateStatus(noisy), "BLOCKED_ABSOLUTE_CONTRACT");

const absoluteFail = evaluatePairedPerformance(pairs([1, 1, 1, 1, 1, 1], [0.26, 0.261, 0.259, 0.262, 0.258, 0.26]));
assert.equal(absoluteFail.absoluteResult, "FAIL");
assert.equal(absoluteFail.regressionVerdict, "NO REGRESSION");
assert.equal(performanceGateStatus(absoluteFail), "BLOCKED_ABSOLUTE_CONTRACT");
assert.equal(ROUTE_V2_PERFORMANCE_PROTOCOL.absoluteThresholdMs, 0.25);

for (const [label, invalidValue] of [
  ["null", null],
  ["undefined", undefined],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["negative Infinity", Number.NEGATIVE_INFINITY],
  ["numeric string", "0.2"],
]) {
  const malformed = pairs([1, 1, 1, 1, 1, 1]);
  malformed[0].current.samplesMs[0] = invalidValue;
  assertBlocked(malformed, label);
}

const nullAbsolute = pairs([1, 1, 1, 1, 1, 1]);
nullAbsolute[0].baseline.p95Ms = null;
assertBlocked(nullAbsolute, "null baseline p95");
const undefinedAbsolute = pairs([1, 1, 1, 1, 1, 1]);
undefinedAbsolute[0].current.p95Ms = undefined;
assertBlocked(undefinedAbsolute, "undefined current p95");
const emptySamples = pairs([1, 1, 1, 1, 1, 1]);
emptySamples[0].current.samplesMs = [];
assertBlocked(emptySamples, "empty samples");
assertBlocked(pairs([1, 1, 1, 1, 1, 1]).slice(0, 5), "insufficient pairs");
const malformedPair = pairs([1, 1, 1, 1, 1, 1]);
malformedPair[2] = { order: "baseline-current", baseline: null };
assertBlocked(malformedPair, "malformed pair object");
const zeroBaseline = pairs([1, 1, 1, 1, 1, 1]);
zeroBaseline[0].baseline = { p95Ms: 0, samplesMs: Array(40).fill(0) };
assertBlocked(zeroBaseline, "non-positive baseline");
const missingRatioInput = pairs([1, 1, 1, 1, 1, 1]);
delete missingRatioInput[0].current.p95Ms;
assertBlocked(missingRatioInput, "missing ratio input");
const malformedWorkerOutput = pairs([1, 1, 1, 1, 1, 1]);
malformedWorkerOutput[0] = { worker: "unexpected-payload" };
assertBlocked(malformedWorkerOutput, "malformed worker output");

process.stdout.write(`${JSON.stringify({ verifier: "route-v2-performance-reliability-logic", status: "PASS" }, null, 2)}\n`);
