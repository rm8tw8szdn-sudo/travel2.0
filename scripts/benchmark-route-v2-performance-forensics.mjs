import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  attachRouteIntentEnvelope,
  createRouteIntentFingerprint,
  createRouteSearchCache,
  createRouteV2ReadyPool,
  normalizeRouteIntent,
  parseSearchIntent,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function numberOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function stats(values) {
  const average = mean(values);
  const deviation = standardDeviation(values);
  return {
    samples: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(6)),
    p95Ms: Number(percentile(values, 0.95).toFixed(6)),
    p99Ms: Number(percentile(values, 0.99).toFixed(6)),
    maxMs: Number(Math.max(...values, 0).toFixed(6)),
    meanMs: Number(average.toFixed(6)),
    standardDeviationMs: Number(deviation.toFixed(6)),
    coefficientOfVariation: Number((average ? deviation / average : 0).toFixed(6)),
  };
}

function measureRound(operation, {
  roundWarmupBatches,
  sampleBatches,
  batchSize,
}) {
  for (let sample = 0; sample < roundWarmupBatches; sample += 1) {
    for (let index = 0; index < batchSize; index += 1) operation();
  }
  const values = [];
  for (let sample = 0; sample < sampleBatches; sample += 1) {
    const startedAt = performance.now();
    for (let index = 0; index < batchSize; index += 1) operation();
    values.push((performance.now() - startedAt) / batchSize);
  }
  return { values, ...stats(values) };
}

function measureRounds(operation, config) {
  for (let sample = 0; sample < config.initialWarmupBatches; sample += 1) {
    for (let index = 0; index < config.batchSize; index += 1) operation();
  }
  const rounds = [];
  const allValues = [];
  for (let round = 0; round < config.rounds; round += 1) {
    globalThis.gc?.();
    const memoryBefore = process.memoryUsage();
    const resourceBefore = process.resourceUsage();
    const measured = measureRound(operation, config);
    const resourceAfter = process.resourceUsage();
    const memoryAfter = process.memoryUsage();
    allValues.push(...measured.values);
    rounds.push({
      round: round + 1,
      ...stats(measured.values),
      heapUsedBefore: memoryBefore.heapUsed,
      heapUsedAfter: memoryAfter.heapUsed,
      userCpuMicros: resourceAfter.userCPUTime - resourceBefore.userCPUTime,
      systemCpuMicros: resourceAfter.systemCPUTime - resourceBefore.systemCPUTime,
    });
  }
  const p95Values = rounds.map((round) => round.p95Ms);
  return {
    config: {
      rounds: config.rounds,
      initialWarmupBatches: config.initialWarmupBatches,
      roundWarmupBatches: config.roundWarmupBatches,
      sampleBatches: config.sampleBatches,
      batchSize: config.batchSize,
      operationsPerRound: config.sampleBatches * config.batchSize,
    },
    rounds,
    aggregate: stats(allValues),
    roundP95: stats(p95Values),
    firstRoundP95Ms: rounds[0]?.p95Ms ?? 0,
    laterRoundP95MeanMs: Number(mean(rounds.slice(1).map((round) => round.p95Ms)).toFixed(6)),
  };
}

async function requestJson(url, body) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return {
    durationMs: performance.now() - startedAt,
    serverDurationMs: Number(payload?.diagnostics?.durationMs) || null,
    payload,
  };
}

async function measureHttpRounds(operation, rounds) {
  const values = [];
  const serverValues = [];
  const records = [];
  for (let index = 0; index < rounds; index += 1) {
    const result = await operation(index);
    values.push(result.durationMs);
    if (Number.isFinite(result.serverDurationMs)) serverValues.push(result.serverDurationMs);
    records.push({
      round: index + 1,
      durationMs: Number(result.durationMs.toFixed(3)),
      serverDurationMs: Number.isFinite(result.serverDurationMs)
        ? Number(result.serverDurationMs.toFixed(3))
        : null,
      recordCount: result.payload?.records?.length ?? null,
      plannerCalled: result.payload?.diagnostics?.plannerCalled ?? null,
      cacheHit: result.payload?.diagnostics?.cacheHit ?? null,
      cacheStatus: result.payload?.cacheStatus ?? null,
    });
  }
  return {
    rounds: records,
    aggregate: stats(values),
    serverAggregate: serverValues.length ? stats(serverValues) : null,
  };
}

async function liveMeasurements(baseUrlText, rounds) {
  if (!baseUrlText) return null;
  const baseUrl = new URL(baseUrlText);
  assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname), "live benchmark is localhost-only");
  const pageUrl = new URL("/travel-collection/routes.html?localOnly=1", baseUrl);
  const discoveryUrl = new URL("/api/routes/discovery", baseUrl);

  await fetch(pageUrl, { signal: AbortSignal.timeout(10_000) }).then((response) => response.arrayBuffer());
  const routePage = await measureHttpRounds(async () => {
    const startedAt = performance.now();
    const response = await fetch(pageUrl, { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    return { durationMs: performance.now() - startedAt, serverDurationMs: null, payload: {} };
  }, rounds);

  let detailRouteId = "";
  const feedFirstPage = await measureHttpRounds(async (index) => {
    const result = await requestJson(discoveryUrl, {
      mode: "feed",
      query: "",
      limit: 6,
      cursor: null,
      sessionId: `forensics-feed-${index}`,
      excludeIds: [],
      excludeClusters: [],
      routeType: "cross",
    });
    detailRouteId ||= result.payload.records?.[0]?.id || "";
    return result;
  }, rounds);
  assert(detailRouteId, "Feed must provide a Detail route");

  const detail = await measureHttpRounds(() => requestJson(discoveryUrl, {
    mode: "detail",
    routeId: detailRouteId,
    source: "accepted",
  }), rounds);

  const coldQueries = Array.from({ length: rounds }, (_, index) => (
    `东京→京都→大阪${7 + index}天`
  ));
  const coldDistinctSearch = await measureHttpRounds((index) => requestJson(discoveryUrl, {
    mode: "search",
    query: coldQueries[index],
    limit: 6,
    cursor: null,
    sessionId: `forensics-cold-${index}`,
    excludeIds: [],
    excludeClusters: [],
    routeType: "",
  }), rounds);

  const hotQuery = "东京→京都→大阪7天";
  await requestJson(discoveryUrl, {
    mode: "search",
    query: hotQuery,
    limit: 6,
    cursor: null,
    sessionId: "forensics-hot-seed",
    excludeIds: [],
    excludeClusters: [],
    routeType: "",
  });
  const exactCacheReplay = await measureHttpRounds((index) => requestJson(discoveryUrl, {
    mode: "search",
    query: hotQuery,
    limit: 6,
    cursor: null,
    sessionId: `forensics-hot-${index}`,
    excludeIds: [],
    excludeClusters: [],
    routeType: "",
  }), rounds);

  const equivalentQueries = [
    "日本7天",
    "日本 7天",
    "日本7 天",
    "Japan 7 days",
    "Japan seven days",
    "7天 日本",
    "日本，7天",
    "日本、7天",
    "日本 / 7天",
    "日本 7 days",
  ].slice(0, rounds);
  const equivalentTextSearch = await measureHttpRounds((index) => requestJson(discoveryUrl, {
    mode: "search",
    query: equivalentQueries[index % equivalentQueries.length],
    limit: 6,
    cursor: null,
    sessionId: "forensics-equivalent-session",
    excludeIds: [],
    excludeClusters: [],
    routeType: "",
  }), rounds);

  return {
    routePage,
    feedFirstPage,
    detail,
    coldDistinctSearch,
    exactCacheReplay,
    equivalentTextSearch,
    queries: { cold: coldQueries, equivalent: equivalentQueries },
  };
}

const label = option("label", "unnamed");
const rounds = numberOption("rounds", 10);
const baseUrl = option("base-url", process.env.ROUTE_V2_PERFORMANCE_BASE_URL || "");
const liveOnly = process.argv.includes("--live-only");
const initialWarmupBatches = numberOption("initial-warmup-batches", 200);
const roundWarmupBatches = numberOption("round-warmup-batches", 1);
const sampleBatches = numberOption("sample-batches", 20);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-performance-forensics-"));

const rawIntent = {
  rawQuery: "东京→京都→大阪7天",
  requiredDestinationIds: ["Q1490", "Q34600", "Q35765"],
  requiredDestinationNames: ["东京", "京都", "大阪"],
  destinationOrderMode: "fixed",
  durationDays: 7,
  timeIntent: { type: "single-month", months: [2] },
  countryCode: "JP",
  normalizedRegion: "kansai",
  travelStyle: "文化",
};
const normalizedIntent = normalizeRouteIntent(rawIntent);
const route = attachRouteIntentEnvelope({
  id: "forensics-route",
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
  selectedCandidateId: "forensics-candidate",
  decisionTraceId: "forensics-trace",
  v2PublicationStatus: "ready-for-display",
}, normalizedIntent);

const cache = createRouteSearchCache({
  storagePath: path.join(temporaryRoot, "search-cache.json"),
  reviewPath: path.join(temporaryRoot, "search-review.json"),
});
assert(cache.put({ intent: rawIntent, records: [route] }));

const readyPool = createRouteV2ReadyPool({
  env: { ROUTE_V2_READY_POOL_ENABLED: "true" },
  storagePath: path.join(temporaryRoot, "ready-pool.json"),
});
assert.equal(readyPool.applyEvaluation({
  routeRecord: route,
  publicationGate: {
    status: "ready-for-display",
    publishable: true,
    routeRecordId: route.id,
    selectedCandidateId: route.selectedCandidateId,
    decisionTraceId: route.decisionTraceId,
  },
}).persisted, true);

const eventLoop = monitorEventLoopDelay({ resolution: 10 });
eventLoop.enable();
const common = { rounds, initialWarmupBatches, roundWarmupBatches, sampleBatches };
const local = liveOnly ? null : {
  parseSearchIntent: measureRounds(
    () => parseSearchIntent("东京→京都→大阪7天"),
    { ...common, batchSize: 100 },
  ),
  normalizeRouteIntent: measureRounds(
    () => normalizeRouteIntent(rawIntent),
    { ...common, batchSize: 200 },
  ),
  fingerprint: measureRounds(
    () => createRouteIntentFingerprint(normalizedIntent),
    { ...common, batchSize: 100 },
  ),
  finalInvariantGate: measureRounds(
    () => validateRouteIntentInvariants(route, normalizedIntent, { source: "performance-forensics" }),
    { ...common, batchSize: 100 },
  ),
  cacheReplay: measureRounds(() => {
    assert.equal(cache.get(rawIntent)?.records?.[0]?.id, route.id);
  }, { ...common, initialWarmupBatches: 10, roundWarmupBatches: 1, sampleBatches: 20, batchSize: 1 }),
  readyPoolRead: measureRounds(() => {
    assert.equal(readyPool.get(route.id)?.id, route.id);
  }, { ...common, initialWarmupBatches: 10, roundWarmupBatches: 1, sampleBatches: 20, batchSize: 1 }),
};
const live = await liveMeasurements(baseUrl, rounds);
eventLoop.disable();

const output = {
  benchmark: "route-v2-performance-forensics",
  label,
  projectRoot,
  capturedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model || "unknown",
    logicalProcessors: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    exposedGc: typeof globalThis.gc === "function",
  },
  eventLoop: {
    minMs: Number((eventLoop.min / 1e6).toFixed(3)),
    maxMs: Number((eventLoop.max / 1e6).toFixed(3)),
    meanMs: Number((eventLoop.mean / 1e6).toFixed(3)),
    p95Ms: Number((eventLoop.percentile(95) / 1e6).toFixed(3)),
    p99Ms: Number((eventLoop.percentile(99) / 1e6).toFixed(3)),
  },
  local,
  live,
};

const outputPath = option("output");
if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
fs.rmSync(temporaryRoot, { recursive: true, force: true });
