import assert from "node:assert/strict";
import { ROUTE_V2_PERFORMANCE_PROTOCOL as protocol } from "./lib/route-v2-performance-reliability.mjs";
import { reconstructRawPerformanceEvidence } from "./lib/route-v2-performance-raw-evidence.mjs";
import { evaluateDedicatedReliabilityQualification } from "./lib/route-v2-dedicated-reliability-qualification.mjs";

const expected = { cpu: "0", coordinatorSha: "a".repeat(40), currentSha: "b".repeat(40), baselineSha: protocol.baselineRef };
function measurement(value, multiplier = 1) {
  const logicalOperations = protocol.samplesPerSide * protocol.batchSize;
  return { p95Ms: value, samplesMs: Array(protocol.samplesPerSide).fill(value), logicalOperations, actualOperations: Math.round(logicalOperations * multiplier) };
}
function pairs(multiplier) {
  return Array.from({ length: protocol.pairs }, (_, index) => ({
    worker: "route-v2-invariant-pair", schemaVersion: 1,
    order: index % 2 === 0 ? "baseline-current" : "current-baseline",
    currentMultiplier: multiplier, baseline: measurement(0.2), current: measurement(0.2 * multiplier, multiplier),
  }));
}
function run(index) {
  const normalPairs = pairs(1); const synthetic10Pairs = pairs(1.1); const synthetic20Pairs = pairs(1.2);
  return {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION_RUN", schemaVersion: 1, formal: false, gating: false,
    runIndex: index, coordinatorSha: expected.coordinatorSha, currentSha: expected.currentSha, baselineSha: expected.baselineSha,
    protocol: { ...protocol }, normal: { rawPairs: normalPairs, reconstruction: reconstructRawPerformanceEvidence(normalPairs, protocol) },
    synthetic10: { rawPairs: synthetic10Pairs, reconstruction: reconstructRawPerformanceEvidence(synthetic10Pairs, protocol) },
    synthetic20: { rawPairs: synthetic20Pairs, reconstruction: reconstructRawPerformanceEvidence(synthetic20Pairs, protocol) },
    qualificationVerdict: "QUALIFICATION PASS",
  };
}
function environment(phase) {
  return {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_ENVIRONMENT", schemaVersion: 1, phase, platform: "linux", architecture: "x64",
    node: "v24.18.0", kernel: "Linux dedicated", cpuModel: "Dedicated CPU", cpuTopology: "CPU(s): 4", hypervisor: "none",
    smtEnabled: false, affinityList: "0", governor: "performance", minimumFrequencyKHz: 3000000, maximumFrequencyKHz: 3000000,
    currentFrequencyKHz: 3000000, loadAverage: "0 0 0 1/1 1", procStat: "cpu  1 0 1 100 0 0 0 0\nctxt 10",
    contextSwitches: 10, cpuMigrations: 0, stealTicks: 0, memoryState: "MemTotal: 1 kB", lockfileSha256: "d".repeat(64),
    coordinatorSha: expected.coordinatorSha, currentSha: expected.currentSha, baselineSha: expected.baselineSha,
  };
}
function input() { return { runs: Array.from({ length: 5 }, (_, index) => run(index + 1)), before: environment("before"), after: environment("after"), exitCodes: [0, 0, 0, 0, 0] }; }
assert.equal(evaluateDedicatedReliabilityQualification(input(), expected).verdict, "QUALIFICATION PASS");
for (const [name, mutate] of [
  ["four runs", (value) => { value.runs.pop(); value.exitCodes.pop(); }],
  ["six runs", (value) => { value.runs.push(run(6)); value.exitCodes.push(0); }],
  ["one failed run", (value) => { value.runs[2].normal.rawPairs[0].current.p95Ms = 0.3; value.runs[2].qualificationVerdict = "QUALIFICATION FAIL"; }],
  ["missing evidence", (value) => { delete value.runs[0].normal.rawPairs; value.runs[0].qualificationVerdict = "QUALIFICATION FAIL"; }],
  ["missing synthetic10 evidence", (value) => { delete value.runs[0].synthetic10.rawPairs; value.runs[0].qualificationVerdict = "QUALIFICATION FAIL"; }],
  ["malformed telemetry", (value) => { delete value.after.procStat; }],
  ["identity drift", (value) => { value.runs[4].currentSha = "e".repeat(40); value.runs[4].qualificationVerdict = "QUALIFICATION FAIL"; }],
  ["execution failure", (value) => { value.exitCodes[1] = 1; }],
  ["protocol mutation", (value) => { value.runs[0].protocol.pairs = 5; value.runs[0].qualificationVerdict = "QUALIFICATION FAIL"; }],
]) {
  const changed = structuredClone(input()); mutate(changed);
  assert.equal(evaluateDedicatedReliabilityQualification(changed, expected).verdict, "QUALIFICATION FAIL", name);
}
process.stdout.write(`${JSON.stringify({ verifier: "route-v2-dedicated-reliability-qualification", status: "PASS", exactRuns: 5, failClosedCases: 9 }, null, 2)}\n`);
