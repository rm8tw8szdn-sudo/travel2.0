import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return String(process.argv[index + 1]);
}

const baselineRoot = path.resolve(option("baseline-root"));
const currentRoot = path.resolve(option("current-root"));
const order = option("order");
const currentMultiplier = Number(option("current-multiplier"));
const warmupOperations = Number(option("warmup-operations"));
const samplesPerSide = Number(option("samples-per-side"));
const batchSize = Number(option("batch-size"));
assert(["baseline-current", "current-baseline"].includes(order));
assert([1, 1.1, 1.2].includes(currentMultiplier));

async function loadSubject(root, label) {
  const url = pathToFileURL(path.join(root, "src/lib/routes/index.mjs"));
  url.searchParams.set("benchmarkSubject", `${label}-${process.pid}`);
  const module = await import(url.href);
  const rawIntent = {
    rawQuery: "东京→京都→大阪7天",
    requiredDestinationIds: ["Q1490", "Q34600", "Q35765"],
    requiredDestinationNames: ["东京", "京都", "大阪"],
    destinationOrderMode: "fixed",
    durationDays: 7,
    timeIntent: { type: "single-month", months: [2] },
    countryCode: "JP",
    travelStyle: "文化",
  };
  const normalizedIntent = module.normalizeRouteIntent(rawIntent);
  const route = module.attachRouteIntentEnvelope({
    id: `intent-performance-${label}`,
    destinations: ["东京", "京都", "大阪"],
    destinationEntities: [
      { entityId: "Q1490", countryCode: "JP", region: "kansai" },
      { entityId: "Q34600", countryCode: "JP", region: "kansai" },
      { entityId: "Q35765", countryCode: "JP", region: "kansai" },
    ],
    countries: ["JP"],
    countryCodes: ["JP"],
    regions: ["kansai"],
    durationDays: 7,
    timeIntent: { type: "single-month", months: [2], evidenceStatus: "ready" },
    evidenceStatus: "ready",
    selectedCandidateId: "intent-performance-candidate",
    decisionTraceId: "intent-performance-trace",
    v2PublicationStatus: "ready-for-display",
  }, normalizedIntent);
  const operation = () => module.validateRouteIntentInvariants(route, normalizedIntent, { source: "performance-reliability" });
  operation();
  return operation;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function runOperations(operation, logicalOperations, multiplier) {
  const actualOperations = Math.round(logicalOperations * multiplier);
  for (let index = 0; index < actualOperations; index += 1) operation();
}

function measure(operation, multiplier) {
  runOperations(operation, warmupOperations, multiplier);
  globalThis.gc?.();
  const samplesMs = [];
  for (let sample = 0; sample < samplesPerSide; sample += 1) {
    const startedAt = performance.now();
    runOperations(operation, batchSize, multiplier);
    samplesMs.push((performance.now() - startedAt) / batchSize);
  }
  return {
    p95Ms: percentile(samplesMs, 0.95),
    samplesMs,
    logicalOperations: samplesPerSide * batchSize,
    actualOperations: Math.round(samplesPerSide * batchSize * multiplier),
  };
}

const baselineOperation = await loadSubject(baselineRoot, "baseline");
const currentOperation = await loadSubject(currentRoot, "current");
const measured = {};
for (const side of order.split("-")) {
  measured[side] = side === "baseline"
    ? measure(baselineOperation, 1)
    : measure(currentOperation, currentMultiplier);
}

process.stdout.write(`${JSON.stringify({
  worker: "route-v2-invariant-pair",
  order,
  currentMultiplier,
  baseline: measured.baseline,
  current: measured.current,
})}\n`);
