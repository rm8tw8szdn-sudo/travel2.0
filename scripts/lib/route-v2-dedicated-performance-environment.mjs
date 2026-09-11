export const DEDICATED_ENVIRONMENT_SCHEMA_VERSION = 1;
export const DEDICATED_NODE_VERSION = "v24.18.0";

export function validateDedicatedEnvironmentSnapshot(snapshot, expected) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return { valid: false, errors: ["snapshot:malformed"] };
  if (snapshot.kind !== "NON_FORMAL_DEDICATED_RELIABILITY_ENVIRONMENT") errors.push("snapshot:kind");
  if (snapshot.schemaVersion !== DEDICATED_ENVIRONMENT_SCHEMA_VERSION) errors.push("snapshot:schema-version");
  if (!["before", "after"].includes(snapshot.phase)) errors.push("snapshot:phase");
  if (snapshot.platform !== "linux") errors.push("snapshot:platform");
  if (snapshot.architecture !== "x64") errors.push("snapshot:architecture");
  if (snapshot.node !== DEDICATED_NODE_VERSION) errors.push("snapshot:node");
  if (typeof snapshot.kernel !== "string" || snapshot.kernel.trim() === "") errors.push("snapshot:kernel");
  if (typeof snapshot.cpuModel !== "string" || snapshot.cpuModel.trim() === "") errors.push("snapshot:cpu-model");
  if (typeof snapshot.cpuTopology !== "string" || snapshot.cpuTopology.trim() === "") errors.push("snapshot:cpu-topology");
  if (typeof snapshot.hypervisor !== "string" || snapshot.hypervisor.trim() === "") errors.push("snapshot:hypervisor");
  if (typeof snapshot.smtEnabled !== "boolean") errors.push("snapshot:smt");
  if (snapshot.affinityList !== String(expected.cpu)) errors.push("snapshot:affinity");
  if (snapshot.governor !== "performance") errors.push("snapshot:governor");
  if (!Number.isFinite(snapshot.minimumFrequencyKHz) || snapshot.minimumFrequencyKHz <= 0) errors.push("snapshot:min-frequency");
  if (!Number.isFinite(snapshot.maximumFrequencyKHz) || snapshot.maximumFrequencyKHz <= 0) errors.push("snapshot:max-frequency");
  if (snapshot.currentFrequencyKHz !== null && (!Number.isFinite(snapshot.currentFrequencyKHz) || snapshot.currentFrequencyKHz <= 0)) errors.push("snapshot:current-frequency");
  if (typeof snapshot.loadAverage !== "string" || snapshot.loadAverage.trim() === "") errors.push("snapshot:load-average");
  if (typeof snapshot.procStat !== "string" || !snapshot.procStat.startsWith("cpu ")) errors.push("snapshot:proc-stat");
  if (!Number.isInteger(snapshot.contextSwitches) || snapshot.contextSwitches < 0) errors.push("snapshot:context-switches");
  if (!Number.isInteger(snapshot.cpuMigrations) || snapshot.cpuMigrations < 0) errors.push("snapshot:cpu-migrations");
  if (!Number.isInteger(snapshot.stealTicks) || snapshot.stealTicks < 0) errors.push("snapshot:steal-time");
  if (typeof snapshot.memoryState !== "string" || !snapshot.memoryState.includes("MemTotal:")) errors.push("snapshot:memory");
  if (!/^[0-9a-f]{64}$/u.test(snapshot.lockfileSha256 || "")) errors.push("snapshot:lockfile");
  for (const [field, wanted] of [["coordinatorSha", expected.coordinatorSha], ["currentSha", expected.currentSha], ["baselineSha", expected.baselineSha]]) {
    if (!/^[0-9a-f]{40}$/u.test(snapshot[field] || "") || snapshot[field] !== wanted) errors.push(`snapshot:${field}`);
  }
  return { valid: errors.length === 0, errors };
}
