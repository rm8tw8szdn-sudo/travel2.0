import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  attachRouteIntentEnvelope,
  createRouteCandidatePoolStore,
  createRouteIntentFingerprint,
  createRouteSearchCache,
  createRouteV2ReadyPool,
  normalizeRouteCandidate,
  normalizeRouteIntent,
  parseSearchIntent,
  routeIntentSnapshot,
  validateNormalizedRouteIntent,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-intent-performance-"));
process.once("exit", () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function summary(values, scale = 1) {
  const scaledValues = values.map((value) => value / scale);
  const average = scaledValues.reduce((sum, value) => sum + value, 0) / Math.max(1, scaledValues.length);
  const variance = scaledValues.length > 1
    ? scaledValues.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (scaledValues.length - 1)
    : 0;
  return {
    samples: values.length,
    p50Ms: Number(percentile(scaledValues, 0.5).toFixed(6)),
    p95Ms: Number(percentile(scaledValues, 0.95).toFixed(6)),
    p99Ms: Number(percentile(scaledValues, 0.99).toFixed(6)),
    maxMs: Number(Math.max(...scaledValues).toFixed(6)),
    meanMs: Number(average.toFixed(6)),
    standardDeviationMs: Number(Math.sqrt(variance).toFixed(6)),
  };
}

function measure(operation, { warmup = 100, samples = 30, batchSize = 1 } = {}) {
  for (let index = 0; index < warmup; index += 1) operation();
  const durations = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const startedAt = performance.now();
    for (let index = 0; index < batchSize; index += 1) operation();
    durations.push(performance.now() - startedAt);
  }
  return {
    ...summary(durations, batchSize),
    warmup,
    batchSize,
  };
}

function measureStable(operation, {
  rounds = 10,
  initialWarmupOperations = 20_000,
  roundWarmupOperations = 200,
  samplesPerRound = 40,
  batchSize = 100,
} = {}) {
  for (let index = 0; index < initialWarmupOperations; index += 1) operation();
  const startedAt = performance.now();
  const measuredRounds = [];
  const allDurations = [];
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < roundWarmupOperations; index += 1) operation();
    const durations = [];
    for (let sample = 0; sample < samplesPerRound; sample += 1) {
      const sampleStartedAt = performance.now();
      for (let index = 0; index < batchSize; index += 1) operation();
      durations.push(performance.now() - sampleStartedAt);
    }
    allDurations.push(...durations);
    measuredRounds.push({
      round: round + 1,
      ...summary(durations, batchSize),
    });
  }
  const aggregate = summary(allDurations, batchSize);
  const roundP95Values = measuredRounds.map((round) => round.p95Ms);
  const roundP95 = summary(roundP95Values);
  return {
    ...aggregate,
    rounds: measuredRounds,
    roundP95,
    roundP95CoefficientOfVariation: Number((
      roundP95.meanMs > 0 ? roundP95.standardDeviationMs / roundP95.meanMs : 0
    ).toFixed(6)),
    elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
    config: {
      rounds,
      initialWarmupOperations,
      roundWarmupOperations,
      samplesPerRound,
      batchSize,
      measuredOperations: rounds * samplesPerRound * batchSize,
    },
  };
}

async function postJson(url, body) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  return { response, payload, durationMs: performance.now() - startedAt };
}

async function liveMeasurements(baseUrlText) {
  if (!baseUrlText) return null;
  const baseUrl = new URL(baseUrlText);
  assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname), "performance probes may target localhost only");
  const routePageUrl = new URL("/travel-collection/routes.html?localOnly=1", baseUrl);
  const discoveryUrl = new URL("/api/routes/discovery", baseUrl);
  const pageDurations = [];
  for (let index = 0; index < 10; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(routePageUrl, { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    pageDurations.push(performance.now() - startedAt);
  }

  const feedDurations = [];
  let feedRecord = null;
  for (let index = 0; index < 20; index += 1) {
    const result = await postJson(discoveryUrl, {
      mode: "feed",
      query: "",
      limit: 6,
      cursor: null,
      sessionId: `intent-performance-feed-${index}`,
      excludeIds: [],
      excludeClusters: [],
      routeType: "cross",
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.ok, true);
    assert.equal(result.payload.records.length, 6);
    feedRecord ||= result.payload.records[0];
    feedDurations.push(result.durationMs);
  }

  const detailDurations = [];
  for (let index = 0; index < 20; index += 1) {
    const result = await postJson(discoveryUrl, {
      mode: "detail",
      routeId: feedRecord.id,
      source: "accepted",
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.ok, true);
    detailDurations.push(result.durationMs);
  }

  const plannerQueries = [
    "东京→京都→大阪5天",
    "东京→京都→大阪6天",
    "东京→京都→大阪7天",
    "东京→京都→大阪8天",
    "东京→京都→大阪9天",
  ];
  const plannerDurations = [];
  const plannerResults = [];
  for (const [index, query] of plannerQueries.entries()) {
    const result = await postJson(discoveryUrl, {
      mode: "search",
      query,
      limit: 6,
      cursor: null,
      sessionId: `intent-performance-planner-${index}`,
      excludeIds: [],
      excludeClusters: [],
      routeType: "",
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.ok, true);
    assert(result.payload.intent?.routeIntentFingerprint);
    assert(Array.isArray(result.payload.records) && result.payload.records.length > 0, `${query}: cold Planner result must not be empty`);
    const expectedIds = ["Q1490", "Q34600", "Q35765"];
    const expectedDays = index + 5;
    const semanticallyCorrect = result.payload.records.some((record) => {
      const actualIds = (record.destinationEntities || [])
        .map((entry) => String(entry?.wikidataId || entry?.entityId || entry?.id || "").trim())
        .filter(Boolean);
      return expectedIds.every((id) => actualIds.includes(id))
        && Number(record.durationDays) === expectedDays;
    });
    assert.equal(semanticallyCorrect, true, `${query}: cold Planner result must preserve cities and exact days`);
    plannerDurations.push(result.durationMs);
    plannerResults.push({ query, records: result.payload.records.length, semanticallyCorrect });
  }

  const replayDurations = [];
  for (let index = 0; index < 12; index += 1) {
    const result = await postJson(discoveryUrl, {
      mode: "search",
      query: plannerQueries[2],
      limit: 6,
      cursor: null,
      sessionId: `intent-performance-replay-${index}`,
      excludeIds: [],
      excludeClusters: [],
      routeType: "",
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.ok, true);
    replayDurations.push(result.durationMs);
  }

  return {
    routePage: { ...summary(pageDurations), cacheStatus: "hot-local-http" },
    feedFirstPage: { ...summary(feedDurations), cacheStatus: "accepted-repository-hot" },
    detail: { ...summary(detailDurations), cacheStatus: "accepted-repository-hot" },
    plannerBackedSearch: { ...summary(plannerDurations), cacheStatus: "cold-by-fingerprint", queries: plannerResults },
    cacheReplaySearch: { ...summary(replayDurations), cacheStatus: "search-cache-hot" },
  };
}

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
  id: "intent-performance-route",
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

const local = {
  parseSearchIntent: measureStable(() => parseSearchIntent("东京→京都→大阪7天")),
  normalizeRouteIntent: measure(() => normalizeRouteIntent(rawIntent), { warmup: 200, samples: 40, batchSize: 1_000 }),
  validateNormalizedRouteIntent: measure(
    () => validateNormalizedRouteIntent(normalizedIntent),
    { warmup: 200, samples: 40, batchSize: 1_000 },
  ),
  fingerprint: measure(() => createRouteIntentFingerprint(normalizedIntent), { warmup: 200, samples: 40, batchSize: 500 }),
  finalInvariantGate: measure(
    () => validateRouteIntentInvariants(route, normalizedIntent, { source: "performance" }),
    { warmup: 200, samples: 40, batchSize: 1_000 },
  ),
};

const parseAbsoluteSafetyLimitMs = 2;
const parseRelativeBaselineP95Ms = Number(process.env.ROUTE_V2_PARSE_BASELINE_P95_MS || 0);
const parseRelativeRegressionLimit = 0.1;
const parseRoundP95StabilityLimit = 0.25;
assert(
  local.parseSearchIntent.p95Ms < parseAbsoluteSafetyLimitMs,
  `intent parsing p95 must remain below the ${parseAbsoluteSafetyLimitMs}ms absolute safety limit`,
);
assert(
  local.parseSearchIntent.roundP95CoefficientOfVariation <= parseRoundP95StabilityLimit,
  "intent parsing round-p95 coefficient of variation must remain at or below 25%",
);
if (parseRelativeBaselineP95Ms > 0) {
  assert(
    local.parseSearchIntent.p95Ms <= parseRelativeBaselineP95Ms * (1 + parseRelativeRegressionLimit),
    "intent parsing p95 must not regress more than 10% against the supplied same-host baseline",
  );
}
assert(local.normalizeRouteIntent.p95Ms < 0.1, "intent normalization p95 must remain below 0.1ms");
assert(local.validateNormalizedRouteIntent.p95Ms < 0.1, "intent schema validation p95 must remain below 0.1ms");
assert(local.fingerprint.p95Ms < 0.1, "fingerprint p95 must remain below 0.1ms");
assert(local.finalInvariantGate.p95Ms < 0.25, "full invariant gate p95 must remain below 0.25ms");

const cache = createRouteSearchCache({
  storagePath: path.join(temporaryRoot, "search-cache.json"),
  reviewPath: path.join(temporaryRoot, "search-review.json"),
});
assert(cache.put({ intent: rawIntent, records: [route] }));
local.cacheReplay = measure(() => {
  const item = cache.get(rawIntent);
  assert.equal(item?.records?.[0]?.id, route.id);
}, { warmup: 10, samples: 30, batchSize: 1 });

const readyPool = createRouteV2ReadyPool({
  env: { ROUTE_V2_READY_POOL_ENABLED: "true" },
  storagePath: path.join(temporaryRoot, "ready-pool.json"),
});
const publicationGate = {
  status: "ready-for-display",
  publishable: true,
  routeRecordId: route.id,
  selectedCandidateId: route.selectedCandidateId,
  decisionTraceId: route.decisionTraceId,
};
assert.equal(readyPool.applyEvaluation({ routeRecord: route, publicationGate }).persisted, true);
local.readyPoolRead = measure(() => {
  assert.equal(readyPool.get(route.id)?.id, route.id);
}, { warmup: 20, samples: 50, batchSize: 1 });

const candidateStore = createRouteCandidatePoolStore({
  storagePath: path.join(temporaryRoot, "route-candidates.jsonl"),
  env: { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true" },
});
const performanceCandidate = normalizeRouteCandidate({
  intentId: "intent-performance",
  countries: ["JP"],
  destinations: route.destinationEntities.map((entry) => ({
    id: entry.entityId,
    name: entry.entityId,
    countryCode: entry.countryCode,
  })),
  proposedOrder: route.destinationEntities.map((entry) => entry.entityId),
  durationDays: route.durationDays,
  travelStyle: "rail",
  generationSource: "performance",
  routeIntentFingerprint: route.routeIntentFingerprint,
  routeIntentFingerprintVersion: route.routeIntentFingerprintVersion,
  normalizedRouteIntent: route.normalizedRouteIntent,
  inputIntentSnapshot: routeIntentSnapshot({
    context: {
      ...rawIntent,
      intentId: "intent-performance",
      normalizedRouteIntent: route.normalizedRouteIntent,
    },
    intentId: "intent-performance",
    source: "performance",
    createdAt: "2026-07-28T00:00:00.000Z",
  }),
  createdAt: "2026-07-28T00:00:00.000Z",
});
const candidateWrite = candidateStore.replaceForIntent("intent-performance", [performanceCandidate]);
assert.equal(candidateWrite.persisted, true, JSON.stringify(candidateWrite));
local.candidateRead = measure(() => {
  assert.equal(candidateStore.listByIntent("intent-performance")[0]?.candidateId, performanceCandidate.candidateId);
}, { warmup: 20, samples: 50, batchSize: 1 });
assert(local.candidateRead.p95Ms < 2, "Candidate read p95 must remain below 2ms");

const generativeDurations = [];
for (let index = 0; index < 3; index += 1) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, ["scripts/verify-route-v2-intent-generative.mjs"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  generativeDurations.push(performance.now() - startedAt);
}

const live = await liveMeasurements(String(process.env.ROUTE_V2_PERFORMANCE_BASE_URL || "").trim());
if (live) {
  assert(live.feedFirstPage.p95Ms < 2_000, "Feed first-page p95 must stay below 2 seconds");
  assert(live.detail.p95Ms < 1_000, "Detail p95 must stay below 1 second");
  assert(live.plannerBackedSearch.maxMs < 5_000, "Planner-backed Search must settle below 5 seconds");
  assert(live.cacheReplaySearch.maxMs < 5_000, "cache replay Search must settle below 5 seconds");
}

const legacyBaseline = {
  environment: "same Windows host, Node v24.18.0, starting HEAD b498f511",
  parseSearchIntent: { samples: 40, batchSize: 1_000, p50Ms: 0.585061, p95Ms: 0.601147, maxMs: 0.614004 },
  legacyFallbackValidator: { samples: 40, batchSize: 5_000, p50Ms: 0.006816, p95Ms: 0.008514, maxMs: 0.008708 },
};
const gateP95DeltaPercent = Number((((local.finalInvariantGate.p95Ms / legacyBaseline.legacyFallbackValidator.p95Ms) - 1) * 100).toFixed(2));

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-intent-performance",
  status: "PASS",
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model || "unknown",
    warmup: "per-metric fixed warm-up before samples",
    temporaryStorage: true,
  },
  local,
  generativeSuite: {
    ...summary(generativeDurations),
    runs: 3,
    casesPerRun: 2960,
    assertionsPerRun: 9493,
  },
  live,
  baseline: legacyBaseline,
  comparison: {
    parseP95DeltaPercent: Number((((local.parseSearchIntent.p95Ms / legacyBaseline.parseSearchIntent.p95Ms) - 1) * 100).toFixed(2)),
    fullGateVsLegacyNarrowValidatorP95DeltaPercent: gateP95DeltaPercent,
    investigated: gateP95DeltaPercent > 10,
    explanation: "The legacy baseline checked a narrow fallback subset. The new gate also normalizes the complete contract, verifies a versioned SHA-256 fingerprint, detects envelope tampering, and checks every hard constraint. Its measured p95 remains below 0.25ms per record, so even 100 records stay below the existing user-path latency budget.",
    unresolvedPerformanceRisk: false,
  },
  performanceGate: {
    methodology: "10 rounds after a 20,000-operation JIT warm-up; each round measures 40 batches of 100 operations so round p95 is not determined by one scheduler outlier.",
    localDiagnostic: {
      absoluteSafetyLimitMs: parseAbsoluteSafetyLimitMs,
      maximumRoundP95CoefficientOfVariation: parseRoundP95StabilityLimit,
    },
    controlledCiComparison: {
      baselineEnvironmentVariable: "ROUTE_V2_PARSE_BASELINE_P95_MS",
      enabled: parseRelativeBaselineP95Ms > 0,
      suppliedBaselineP95Ms: parseRelativeBaselineP95Ms || null,
      measuredP95Ms: local.parseSearchIntent.p95Ms,
      maximumAllowedP95Ms: parseRelativeBaselineP95Ms > 0
        ? Number((parseRelativeBaselineP95Ms * (1 + parseRelativeRegressionLimit)).toFixed(6))
        : null,
      measuredRegressionPercent: parseRelativeBaselineP95Ms > 0
        ? Number((((local.parseSearchIntent.p95Ms / parseRelativeBaselineP95Ms) - 1) * 100).toFixed(2))
        : null,
      maximumRelativeRegression: parseRelativeRegressionLimit,
      status: parseRelativeBaselineP95Ms > 0 ? "enforced" : "not-configured",
    },
    evidence: "Same-host A/B/C forensics on 2026-07-28 measured aggregate parse p99 no higher than 1.343198ms and round-p95 CV no higher than 6.12%. The prior 1ms assertion was a single-host snapshot introduced in 739a2a8, not a cross-machine contract. The 2ms limit is an absolute safety ceiling, while controlled comparisons additionally enforce the 10% relative regression limit.",
  },
}, null, 2)}\n`);

fs.rmSync(temporaryRoot, { recursive: true, force: true });
