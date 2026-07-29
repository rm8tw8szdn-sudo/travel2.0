import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ROUTE_V2_RUNTIME_METRICS_SCHEMA_VERSION,
  createRouteSearchService,
  createRouteV2RuntimeMetrics,
  finalizeRouteV2RuntimeDecision,
  resolveRouteV2RuntimeDecision,
} from "../src/lib/routes/index.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-production-readiness-phase2-"));
const metricsPath = path.join(temporaryRoot, "runtime", "route-v2-runtime-metrics.json");
const acceptedPath = path.resolve(".route-v2-cache", "accepted-routes.json");
const acceptedBefore = crypto.createHash("sha256").update(fs.readFileSync(acceptedPath)).digest("hex");

const anonymousFullRuntime = {
  ROUTE_V2_RUNTIME_ENABLED: "true",
  ROUTE_V2_CANARY_PERCENTAGE: "100",
};
const anonymousDecision = resolveRouteV2RuntimeDecision({ env: anonymousFullRuntime });
assert.equal(anonymousDecision.decision.enabled, true);
assert.equal(anonymousDecision.decision.included, true);
assert.equal(anonymousDecision.decision.subjectType, "anonymous");
assert.equal(anonymousDecision.decision.subjectHash, null);
assert.equal(anonymousDecision.decision.bucket, null);
assert.equal(anonymousDecision.decision.reason, "canary-included");

const metrics = createRouteV2RuntimeMetrics({
  storagePath: metricsPath,
  maxRequestsPerWindow: 100,
  maxArchives: 2,
  now: (() => {
    let tick = Date.parse("2026-07-29T00:00:00.000Z");
    return () => {
      tick += 1_000;
      return tick;
    };
  })(),
});

for (const event of [
  {
    v2Attempted: true,
    v2Displayed: true,
    fallback: false,
    rejectCount: 0,
    resultCount: 1,
    timings: { searchMs: 40, plannerMs: 25, cacheMs: 2 },
    query: "this must never be persisted",
    sessionId: "anonymous-session-secret",
    userId: "anonymous-user-secret",
    localPath: process.cwd(),
  },
  {
    v2Attempted: true,
    v2Displayed: false,
    fallback: true,
    fallbackReason: "candidate-rejected",
    rejectCount: 2,
    resultCount: 1,
    candidateRejectReasons: ["duration-capacity-conflict", "duration-capacity-conflict"],
    evidenceRejectReasons: ["route-leg-evidence-missing"],
    publicationRejectReasons: ["validation-not-ready"],
    timings: { searchMs: 120, plannerMs: 90, cacheMs: 5 },
  },
  {
    v2Attempted: false,
    v2Displayed: false,
    fallback: true,
    fallbackReason: "master-disabled",
    rejectCount: 0,
    resultCount: 0,
    timings: { searchMs: 300, plannerMs: 0, cacheMs: 15 },
  },
]) {
  const write = metrics.record(event);
  assert.equal(write.persisted, true);
}

const metricSnapshot = metrics.snapshot();
assert.equal(metricSnapshot.schemaVersion, ROUTE_V2_RUNTIME_METRICS_SCHEMA_VERSION);
assert.deepEqual(metricSnapshot.totals, {
  requests: 3,
  v2Attempts: 2,
  v2Displayed: 1,
  legacyFallbacks: 2,
  rejects: 2,
  emptyResults: 1,
});
assert.equal(metricSnapshot.reasons.fallback["candidate-rejected"], 1);
assert.equal(metricSnapshot.reasons.fallback["master-disabled"], 1);
assert.equal(metricSnapshot.reasons.candidate["duration-capacity-conflict"], 2);
assert.equal(metricSnapshot.reasons.evidence["route-leg-evidence-missing"], 1);
assert.equal(metricSnapshot.reasons.publication["validation-not-ready"], 1);
for (const stage of ["search", "planner", "cache"]) {
  assert(metricSnapshot.latencies[stage].count > 0);
  assert(Number.isFinite(metricSnapshot.latencies[stage].p50Ms));
  assert(Number.isFinite(metricSnapshot.latencies[stage].p95Ms));
  assert(Number.isFinite(metricSnapshot.latencies[stage].p99Ms));
}

const persistedMetrics = fs.readFileSync(metricsPath, "utf8");
for (const forbidden of [
  "this must never be persisted",
  "anonymous-session-secret",
  "anonymous-user-secret",
  process.cwd(),
  "query",
  "sessionId",
  "userId",
]) {
  assert.equal(persistedMetrics.includes(forbidden), false, `metrics must not contain ${forbidden}`);
}

const rotatingPath = path.join(temporaryRoot, "rotation", "metrics.json");
const rotatingMetrics = createRouteV2RuntimeMetrics({
  storagePath: rotatingPath,
  maxRequestsPerWindow: 3,
  maxArchives: 2,
  now: () => Date.parse("2026-07-29T01:00:00.000Z"),
});
for (let index = 0; index < 7; index += 1) {
  assert.equal(rotatingMetrics.record({
    resultCount: 1,
    timings: { searchMs: index + 1, plannerMs: 0, cacheMs: 0 },
  }).persisted, true);
}
assert.equal(rotatingMetrics.snapshot().totals.requests, 1);
assert.equal(fs.existsSync(`${rotatingPath}.1`), true);
assert.equal(fs.existsSync(`${rotatingPath}.2`), true);
assert.equal(fs.existsSync(`${rotatingPath}.3`), false);
assert(fs.statSync(rotatingPath).size <= rotatingMetrics.diagnostics().maxBytes);

const preservedPath = path.join(temporaryRoot, "atomic", "metrics.json");
fs.mkdirSync(path.dirname(preservedPath), { recursive: true });
fs.writeFileSync(preservedPath, fs.readFileSync(metricsPath));
const preservedBefore = fs.readFileSync(preservedPath);
const failingFs = {
  ...fs,
  renameSync() {
    throw new Error("simulated-atomic-replace-failure");
  },
};
const failingMetrics = createRouteV2RuntimeMetrics({
  storagePath: preservedPath,
  fsImpl: failingFs,
});
const failedWrite = failingMetrics.record({
  resultCount: 0,
  timings: { searchMs: 1, plannerMs: 0, cacheMs: 0 },
});
assert.equal(failedWrite.persisted, false);
assert.deepEqual(fs.readFileSync(preservedPath), preservedBefore);
assert.equal(fs.existsSync(`${preservedPath}.${process.pid}.tmp`), false);

function memorySearchCache() {
  return {
    get: () => null,
    put: () => ({ persisted: true }),
    appendReviewCandidates: () => ({ persisted: true }),
    findRoute: () => null,
  };
}

async function runSearch(env, label) {
  const metricEvents = [];
  let plannerInput = null;
  const service = createRouteSearchService({
    acceptedRepository: {
      list: () => ({ records: [] }),
      upsert: () => {
        throw new Error("readiness verification must not write Accepted Repository");
      },
    },
    searchCache: memorySearchCache(),
    analytics: { logSearch() {} },
    runtimeMetrics: {
      record(event) {
        metricEvents.push(structuredClone(event));
        return { persisted: true };
      },
    },
    planner: {
      async buildCandidates(input) {
        plannerInput = structuredClone(input);
        return {
          accepted: [],
          rejected: [{ reason: "duration-capacity-conflict" }],
        };
      },
    },
    env,
  });
  const result = await service.search({
    mode: "search",
    query: "Iceland winter trip",
    limit: 6,
  }, {
    requestId: `phase2-${label}`,
  });
  return { result, plannerInput, metricEvents };
}

const anonymousFullSearch = await runSearch(anonymousFullRuntime, "anonymous-full");
assert(anonymousFullSearch.plannerInput);
assert.equal(anonymousFullSearch.plannerInput.context.routeV2RuntimeDecision.enabled, true);
assert.equal(anonymousFullSearch.plannerInput.context.routeV2RuntimeDecision.subjectType, "anonymous");
assert.equal(anonymousFullSearch.result.diagnostics.routeV2Runtime.attempted, true);
assert.equal(anonymousFullSearch.result.diagnostics.routeV2Runtime.fallback, true);
assert.equal(anonymousFullSearch.metricEvents.length, 1);
assert.equal(anonymousFullSearch.metricEvents[0].v2Attempted, true);

const emergencyOff = await runSearch({
  ROUTE_V2_RUNTIME_ENABLED: "false",
  ROUTE_V2_CANARY_PERCENTAGE: "100",
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
}, "emergency-off");
assert(emergencyOff.plannerInput, "legacy Planner must remain usable after emergency shutdown");
assert.equal(emergencyOff.plannerInput.context.routeV2RuntimeDecision.enabled, false);
assert.equal(emergencyOff.result.records.length, 1, "emergency rollback must preserve a usable legacy result");
assert.equal(emergencyOff.result.diagnostics.routeV2Runtime.fallback, true);
assert.equal(emergencyOff.result.diagnostics.routeV2Runtime.fallbackReason, "master-disabled");
assert.equal(emergencyOff.metricEvents.length, 1);
assert.equal(emergencyOff.metricEvents[0].v2Attempted, false);
assert.equal(emergencyOff.metricEvents[0].fallback, true);
assert.equal(emergencyOff.metricEvents[0].fallbackReason, "master-disabled");

const finalized = finalizeRouteV2RuntimeDecision(anonymousDecision.decision, {
  attempted: true,
  displayed: false,
  fallback: true,
  fallbackReason: "candidate-rejected",
});
assert.equal(finalized.outcome, "legacy-fallback");
assert.equal(finalized.fallbackReason, "candidate-rejected");
assert.equal(JSON.stringify(finalized).includes("Iceland winter road trip"), false);

const acceptedAfter = crypto.createHash("sha256").update(fs.readFileSync(acceptedPath)).digest("hex");
assert.equal(acceptedAfter, acceptedBefore);
fs.rmSync(temporaryRoot, { recursive: true, force: true });

console.log(JSON.stringify({
  verifier: "route-v2-production-readiness-phase2",
  status: "PASS",
  anonymousFullRollout: true,
  emergencyRollback: {
    legacyRecords: emergencyOff.result.records.length,
    fallbackReason: emergencyOff.result.diagnostics.routeV2Runtime.fallbackReason,
  },
  metrics: {
    totals: metricSnapshot.totals,
    latencyStages: Object.fromEntries(
      Object.entries(metricSnapshot.latencies).map(([stage, value]) => [
        stage,
        { p50Ms: value.p50Ms, p95Ms: value.p95Ms, p99Ms: value.p99Ms },
      ]),
    ),
    redacted: true,
    boundedRotation: true,
    atomicFailurePreservedExistingFile: true,
  },
  acceptedUnchanged: true,
  temporaryStorageCleaned: true,
}, null, 2));
