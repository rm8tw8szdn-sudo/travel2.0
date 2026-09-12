import assert from "node:assert/strict";
import { ROUTE_V2_PERFORMANCE_PROTOCOL as protocol } from "./lib/route-v2-performance-reliability.mjs";
import { reconstructRawPerformanceEvidence } from "./lib/route-v2-performance-raw-evidence.mjs";
import { auditDedicatedReliabilityQualificationEvidence } from "./lib/route-v2-dedicated-reliability-qualification.mjs";

const expected = { cpu: "0", coordinatorSha: "a".repeat(40), currentSha: "b".repeat(40), baselineSha: protocol.baselineRef };
const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
function measurement(value, multiplier = 1) {
  const logicalOperations = protocol.samplesPerSide * protocol.batchSize;
  return { p95Ms: value, samplesMs: Array(protocol.samplesPerSide).fill(value), logicalOperations, actualOperations: Math.round(logicalOperations * multiplier) };
}
function pairs(multiplier, qualificationRunId, protocolLabel, identityOffset) {
  return Array.from({ length: protocol.pairs }, (_, index) => ({
    worker: "route-v2-invariant-pair", schemaVersion: 1,
    qualificationRunId, protocolLabel, pairIndex: index + 1,
    pairExecutionId: `${qualificationRunId}:${protocolLabel}:${index + 1}:${uuid(identityOffset + index)}`,
    order: index % 2 === 0 ? "baseline-current" : "current-baseline",
    currentMultiplier: multiplier, baseline: measurement(0.2), current: measurement(0.2 * multiplier, multiplier),
  }));
}
function run(index) {
  const qualificationRunId = uuid(index);
  const normalPairs = pairs(1, qualificationRunId, "normal", index * 100 + 1);
  const synthetic10Pairs = pairs(1.1, qualificationRunId, "synthetic10", index * 100 + 21);
  const synthetic20Pairs = pairs(1.2, qualificationRunId, "synthetic20", index * 100 + 41);
  return {
    kind: "NON_FORMAL_DEDICATED_RELIABILITY_QUALIFICATION_RUN", schemaVersion: 1, formal: false, gating: false,
    runIndex: index, qualificationRunId, coordinatorSha: expected.coordinatorSha, currentSha: expected.currentSha, baselineSha: expected.baselineSha,
    protocol: { ...protocol }, normal: { rawPairs: normalPairs }, synthetic10: { rawPairs: synthetic10Pairs }, synthetic20: { rawPairs: synthetic20Pairs },
    auditDeclaredResult: "RUN VALID",
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
const validAudit = auditDedicatedReliabilityQualificationEvidence(input(), expected);
assert.equal(validAudit.auditVerdict, "AUDIT VALID");
assert.equal(Object.hasOwn(validAudit, "qualificationVerdict"), false, "offline audit cannot issue authoritative verdict");
assert.equal(Object.hasOwn(validAudit, "verdict"), false, "offline audit cannot issue legacy authoritative verdict");
for (const [name, mutate] of [
  ["four runs", (value) => { value.runs.pop(); value.exitCodes.pop(); }],
  ["six runs", (value) => { value.runs.push(run(6)); value.exitCodes.push(0); }],
  ["one failed run", (value) => { value.runs[2].normal.rawPairs[0].current.p95Ms = 0.3; value.runs[2].auditDeclaredResult = "RUN INVALID"; }],
  ["missing evidence", (value) => { delete value.runs[0].normal.rawPairs; value.runs[0].auditDeclaredResult = "RUN INVALID"; }],
  ["missing synthetic10 evidence", (value) => { delete value.runs[0].synthetic10.rawPairs; value.runs[0].auditDeclaredResult = "RUN INVALID"; }],
  ["malformed telemetry", (value) => { delete value.after.procStat; }],
  ["identity drift", (value) => { value.runs[4].currentSha = "e".repeat(40); value.runs[4].auditDeclaredResult = "RUN INVALID"; }],
  ["execution failure", (value) => { value.exitCodes[1] = 1; }],
  ["protocol mutation", (value) => { value.runs[0].protocol.pairs = 5; value.runs[0].auditDeclaredResult = "RUN INVALID"; }],
  ["cloned run identity", (value) => { value.runs[2] = structuredClone(value.runs[0]); value.runs[2].runIndex = 3; }],
  ["five cloned runs", (value) => { const first = structuredClone(value.runs[0]); value.runs = Array.from({ length: 5 }, (_, index) => ({ ...structuredClone(first), runIndex: index + 1 })); }],
  ["replaced failed run", (value) => { value.runs[2] = structuredClone(value.runs[1]); value.runs[2].runIndex = 3; }],
  ["mixed-run pair", (value) => { value.runs[0].normal.rawPairs[2].qualificationRunId = value.runs[1].qualificationRunId; }],
  ["duplicate pair", (value) => { value.runs[0].normal.rawPairs[2] = structuredClone(value.runs[0].normal.rawPairs[0]); }],
  ["duplicate pair identity with modified measurements", (value) => { const pair = value.runs[0].normal.rawPairs[2]; pair.pairExecutionId = `${pair.qualificationRunId}:normal:3:${uuid(101)}`; pair.current.samplesMs.fill(0.21); pair.current.p95Ms = 0.21; }],
  ["pair index binding mismatch", (value) => { value.runs[0].normal.rawPairs[2].pairIndex = 1; }],
  ["clone with edited qualification identity", (value) => {
    const clone = structuredClone(value.runs[0]);
    clone.runIndex = 3;
    clone.qualificationRunId = uuid(99);
    for (const result of [clone.normal, clone.synthetic10, clone.synthetic20]) for (const pair of result.rawPairs) {
      pair.qualificationRunId = clone.qualificationRunId;
      pair.pairExecutionId = pair.pairExecutionId.replace(value.runs[0].qualificationRunId, clone.qualificationRunId);
    }
    value.runs[2] = clone;
  }],
]) {
  const changed = structuredClone(input()); mutate(changed);
  assert.equal(auditDedicatedReliabilityQualificationEvidence(changed, expected).auditVerdict, "AUDIT INVALID", name);
}
const rewrittenClones = input();
const sourceRun = structuredClone(rewrittenClones.runs[0]);
rewrittenClones.runs = Array.from({ length: 5 }, (_, index) => {
  const clone = structuredClone(sourceRun);
  clone.runIndex = index + 1;
  clone.qualificationRunId = uuid(500 + index);
  let occurrence = 1000 + index * 100;
  for (const result of [clone.normal, clone.synthetic10, clone.synthetic20]) for (const pair of result.rawPairs) {
    pair.qualificationRunId = clone.qualificationRunId;
    pair.pairExecutionId = `${clone.qualificationRunId}:${pair.protocolLabel}:${pair.pairIndex}:${uuid(occurrence++)}`;
  }
  return clone;
});
const cloneAudit = auditDedicatedReliabilityQualificationEvidence(rewrittenClones, expected);
assert.equal(cloneAudit.auditVerdict, "AUDIT VALID", "rewritten clone remains statistically auditable");
assert.equal(Object.hasOwn(cloneAudit, "qualificationVerdict"), false, "rewritten clone cannot create authoritative PASS");
process.stdout.write(`${JSON.stringify({ verifier: "route-v2-dedicated-reliability-qualification", status: "PASS", offlineAuthority: "NONE", exactRuns: 5, uniqueRunIds: 5, failClosedCases: 17 }, null, 2)}\n`);
