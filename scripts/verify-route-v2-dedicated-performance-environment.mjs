import assert from "node:assert/strict";
import { validateDedicatedEnvironmentSnapshot } from "./lib/route-v2-dedicated-performance-environment.mjs";

const expected = {
  cpu: "0",
  coordinatorSha: "a".repeat(40),
  currentSha: "b".repeat(40),
  baselineSha: "c".repeat(40),
};
const fixture = {
  kind: "NON_FORMAL_DEDICATED_RELIABILITY_ENVIRONMENT",
  schemaVersion: 1,
  phase: "before",
  platform: "linux",
  architecture: "x64",
  node: "v24.18.0",
  kernel: "Linux dedicated 6.x",
  cpuModel: "Dedicated CPU",
  cpuTopology: "CPU(s): 4",
  hypervisor: "none",
  smtEnabled: false,
  affinityList: "0",
  governor: "performance",
  minimumFrequencyKHz: 3000000,
  maximumFrequencyKHz: 3000000,
  currentFrequencyKHz: 3000000,
  loadAverage: "0.00 0.00 0.00 1/100 1",
  procStat: "cpu  1 0 1 100 0 0 0 0\nctxt 10",
  contextSwitches: 10,
  cpuMigrations: 0,
  stealTicks: 0,
  memoryState: "MemTotal: 16384 kB",
  lockfileSha256: "d".repeat(64),
  coordinatorSha: expected.coordinatorSha,
  currentSha: expected.currentSha,
  baselineSha: expected.baselineSha,
};
assert.equal(validateDedicatedEnvironmentSnapshot(fixture, expected).valid, true);
for (const [name, mutate] of [
  ["missing telemetry", (value) => { delete value.procStat; }],
  ["wrong platform", (value) => { value.platform = "win32"; }],
  ["wrong affinity", (value) => { value.affinityList = "0-3"; }],
  ["wrong governor", (value) => { value.governor = "schedutil"; }],
  ["wrong identity", (value) => { value.currentSha = "e".repeat(40); }],
  ["malformed frequency", (value) => { value.minimumFrequencyKHz = null; }],
  ["wrong Node", (value) => { value.node = "v24.17.0"; }],
]) {
  const changed = structuredClone(fixture);
  mutate(changed);
  assert.equal(validateDedicatedEnvironmentSnapshot(changed, expected).valid, false, name);
}
process.stdout.write(`${JSON.stringify({ verifier: "route-v2-dedicated-performance-environment", status: "PASS", failClosedCases: 7 }, null, 2)}\n`);
