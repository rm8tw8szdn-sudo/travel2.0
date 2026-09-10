import assert from "node:assert/strict";
import {
  ROUTE_V2_PERFORMANCE_PROTOCOL,
  evaluatePairedPerformance,
  parseWorkerEnvelope,
  performanceGateStatus,
  validateWorkerEnvelope,
  validateWorkerResult,
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

function workerEnvelope(pairIndex = 0) {
  const pair = pairs([1, 1, 1, 1, 1, 1])[pairIndex];
  return {
    worker: "route-v2-invariant-pair",
    schemaVersion: 1,
    success: true,
    error: null,
    currentMultiplier: 1,
    ...pair,
    baseline: { ...pair.baseline, logicalOperations: 10_000, actualOperations: 10_000 },
    current: { ...pair.current, logicalOperations: 10_000, actualOperations: 10_000 },
  };
}

function assertWorkerValidationBlocked(validation, label) {
  assert.equal(validation.valid, false, `${label}: worker envelope must be invalid`);
  const candidatePairs = Array.from({ length: 6 }, (_, index) => workerEnvelope(index));
  candidatePairs[0] = validation.pair;
  assertBlocked(candidatePairs, label);
}

function assertEnvelopeBlocked(workerResult, label, expected = { order: "baseline-current", currentMultiplier: 1 }) {
  assertWorkerValidationBlocked(validateWorkerEnvelope(workerResult, expected), label);
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

assertEnvelopeBlocked(null, "null worker result");
assertEnvelopeBlocked(undefined, "undefined worker result");
assertEnvelopeBlocked({}, "empty worker result");
assertEnvelopeBlocked("route-v2-invariant-pair", "primitive worker result");
assertEnvelopeBlocked({ worker: "route-v2-invariant-pair", order: "baseline-current", currentMultiplier: 1 }, "missing measurements");
const missingBaseline = workerEnvelope();
delete missingBaseline.baseline;
assertEnvelopeBlocked(missingBaseline, "missing baseline identity");
const missingCurrent = workerEnvelope();
delete missingCurrent.current;
assertEnvelopeBlocked(missingCurrent, "missing current identity");
const missingOrder = workerEnvelope();
delete missingOrder.order;
assertEnvelopeBlocked(missingOrder, "missing order metadata");
assertEnvelopeBlocked({ error: "worker failed", success: false }, "worker error envelope");
const malformedNestedSamples = workerEnvelope();
malformedNestedSamples.current.samplesMs[0] = null;
assertEnvelopeBlocked(malformedNestedSamples, "malformed nested samples");
const falseValidMarker = workerEnvelope();
falseValidMarker.valid = false;
assertEnvelopeBlocked(falseValidMarker, "valid false envelope");
const falseSuccessMarker = workerEnvelope();
falseSuccessMarker.success = false;
assertEnvelopeBlocked(falseSuccessMarker, "success false envelope");
const explicitError = workerEnvelope();
explicitError.error = "worker failed";
assertEnvelopeBlocked(explicitError, "explicit worker error");
const explicitErrors = workerEnvelope();
explicitErrors.errors = ["worker failed"];
assertEnvelopeBlocked(explicitErrors, "explicit worker error list");
const explicitOkFalse = workerEnvelope();
explicitOkFalse.ok = false;
assertEnvelopeBlocked(explicitOkFalse, "explicit ok false");
const explicitFailed = workerEnvelope();
explicitFailed.failed = true;
assertEnvelopeBlocked(explicitFailed, "explicit failed marker");
const explicitWorkerError = workerEnvelope();
explicitWorkerError.workerError = "worker failed";
assertEnvelopeBlocked(explicitWorkerError, "explicit workerError marker");
const explicitExecutionError = workerEnvelope();
explicitExecutionError.executionError = "worker failed";
assertEnvelopeBlocked(explicitExecutionError, "explicit executionError marker");
const wrongMultiplier = workerEnvelope();
wrongMultiplier.currentMultiplier = 1.2;
assertEnvelopeBlocked(wrongMultiplier, "unexpected multiplier");
const wrongBalancedOrder = workerEnvelope();
wrongBalancedOrder.order = "current-baseline";
assertEnvelopeBlocked(wrongBalancedOrder, "unexpected pair order");
assertWorkerValidationBlocked(parseWorkerEnvelope("", {}), "missing worker output");
assertWorkerValidationBlocked(parseWorkerEnvelope("{not-json", {}), "unparsable worker output");
assert.equal(parseWorkerEnvelope(JSON.stringify(workerEnvelope()), { order: "baseline-current", currentMultiplier: 1 }).valid, true);
assertWorkerValidationBlocked(validateWorkerResult({ status: 1, stdout: "", stderr: "worker failed", signal: null }, {}), "non-zero process exit");
assertWorkerValidationBlocked(validateWorkerResult({ status: 0, stdout: JSON.stringify(workerEnvelope()), stderr: "warning", signal: null }, {}), "worker stderr");
assertWorkerValidationBlocked(validateWorkerResult({ status: 0, stdout: JSON.stringify(workerEnvelope()), stderr: "", signal: null, error: new Error("spawn failed") }, {}), "worker execution error");
assert.equal(validateWorkerResult({ status: 0, stdout: JSON.stringify(workerEnvelope()), stderr: "", signal: null }, { order: "baseline-current", currentMultiplier: 1 }).valid, true);

process.stdout.write(`${JSON.stringify({ verifier: "route-v2-performance-reliability-logic", status: "PASS" }, null, 2)}\n`);
