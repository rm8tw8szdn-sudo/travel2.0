# Route Generation V2 Production Readiness Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe anonymous V2 operational metrics, outcome diagnostics, emergency legacy fallback, and bounded single-instance runtime persistence without changing route quality or formal assets.

**Architecture:** Keep the Phase 1 master switch as the only emergency control and treat a 100% rollout as eligible even when no visitor identity exists. Add a focused aggregate metrics store that accepts only sanitized counters, bounded reason codes, and latency histograms; Search finalizes the runtime decision after the response outcome and records one aggregate event. Persist the fixed-shape aggregate with atomic replacement and bounded window rotation, classify it as optional Runtime State, and inject an isolated path into comprehensive prelaunch.

**Tech Stack:** Node.js ESM, SHA-256 runtime decisions, atomic JSON files, deterministic latency histograms, existing Search/Planner/Cache modules and verifier scripts.

---

### Task 1: Define the failing Phase 2 production-readiness contract

**Files:**
- Create: `scripts/verify-route-v2-production-readiness-phase2.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`

- [ ] **Step 1: Write the failing verifier**

The verifier must assert anonymous 100% enrollment, emergency master-off fallback, final decision outcome fields, sanitized aggregate persistence, reason counters, latency percentiles, rotation, and fail-soft atomic persistence:

```js
const anonymous = resolveRouteV2RuntimeDecision({
  env: {
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
  },
});
assert.equal(anonymous.decision.enabled, true);
assert.equal(anonymous.decision.subjectType, "anonymous");

metrics.record({
  requestCount: 1,
  v2Attempted: true,
  v2Displayed: true,
  timings: { searchMs: 120, plannerMs: 80, cacheMs: 4 },
});
assert.equal(metrics.snapshot().totals.v2Displayed, 1);
assert.equal(JSON.stringify(metrics.snapshot()).includes("raw query"), false);
```

- [ ] **Step 2: Run the verifier and confirm it fails**

Run: `node scripts/verify-route-v2-production-readiness-phase2.mjs`

Expected: FAIL because anonymous full rollout, aggregate metrics, and final fallback diagnostics are not implemented.

- [ ] **Step 3: Register Phase 2 as a mandatory prelaunch stage**

Add a static verifier entry immediately after Phase 1:

```js
{
  name: "production-readiness-phase2-observability-and-rollback",
  relativePath: "scripts/verify-route-v2-production-readiness-phase2.mjs",
  phase: "static",
}
```

### Task 2: Add privacy-safe bounded aggregate metrics

**Files:**
- Create: `src/lib/routes/route-v2-runtime-metrics.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Define a fixed aggregate schema**

Use this public shape:

```js
{
  schemaVersion: "route-v2-runtime-metrics-v1",
  window: { startedAt, updatedAt, requestLimit },
  totals: {
    requests, v2Attempts, v2Displayed, legacyFallbacks,
    rejects, emptyResults,
  },
  reasons: { fallback, candidate, evidence, publication },
  latencies: {
    search: { count, buckets },
    planner: { count, buckets },
    cache: { count, buckets },
  },
}
```

The writer must accept no query, route, user, or session fields. Reason codes are normalized to bounded lowercase tokens, each reason map is capped, and unknown/excess values collapse to `other`.

- [ ] **Step 2: Implement bounded histograms and percentile summaries**

Use deterministic millisecond buckets:

```js
const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000];
```

Expose `snapshot()` with p50/p95/p99 derived from cumulative buckets. Do not retain per-request latency samples.

- [ ] **Step 3: Implement atomic persistence and basic rotation**

Write a complete JSON snapshot to a same-directory temporary file, `fsync`, then atomically rename it. Rotate after a bounded request count, retain at most `maxArchives`, cap the serialized document size, and fail softly without truncating an existing file.

- [ ] **Step 4: Export the metrics API**

Export `createRouteV2RuntimeMetrics`, schema constants, and sanitization helpers from `src/lib/routes/index.mjs`.

### Task 3: Finalize request decisions and collect stage metrics

**Files:**
- Modify: `src/lib/routes/route-v2-runtime-environment.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/discovery.mjs`

- [ ] **Step 1: Support anonymous full rollout**

At exactly 100%, a master-enabled request without user or session identity must be included as `subjectType: "anonymous"`. Partial canaries still require a stable session/user bucket and fail closed without one.

- [ ] **Step 2: Add a final outcome helper**

Add:

```js
finalizeRouteV2RuntimeDecision(decision, {
  attempted,
  displayed,
  fallback,
  fallbackReason,
})
```

It returns a defensive copy with `attempted`, `displayed`, `fallback`, `fallbackReason`, and an outcome code; fallback reasons are bounded diagnostic codes, never raw exception messages.

- [ ] **Step 3: Measure Search, Planner, and Cache stages**

Measure the complete Search request plus Planner and Cache operations with the injected clock. Record sanitized Candidate reject reasons and Evidence/Publication reason codes from Planner results.

- [ ] **Step 4: Emit exactly one aggregate event per Search outcome**

All early and normal Search returns must finalize the runtime decision, write one metrics event, and expose the same final decision in response diagnostics. Persistence failure must not alter Search or fallback results.

- [ ] **Step 5: Instantiate one metrics store per Discovery instance**

Create the store once when Discovery is constructed and pass it to Search. Do not create a new writer per request.

### Task 4: Classify and isolate the runtime metrics file

**Files:**
- Modify: `src/lib/routes/cache-baseline-v2.mjs`
- Modify: `scripts/verify-route-v2-cache-baseline-v2.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`

- [ ] **Step 1: Classify metrics as optional Runtime State**

Recognize `route-v2-runtime-metrics.json` and bounded numbered archives as `route-v2-runtime-metrics-json`. Validate schema, counters, reason maps, latency histograms, size limit, and absence of sensitive keys.

- [ ] **Step 2: Isolate comprehensive prelaunch writes**

Add:

```js
ROUTE_V2_RUNTIME_METRICS_PATH: path.join(temporaryRoot, "runtime", "route-v2-runtime-metrics.json")
```

The formal `.route-v2-cache`, Accepted, and Knowledge snapshots must remain unchanged.

- [ ] **Step 3: Add corruption and classification coverage**

Use only temporary cache copies to confirm malformed metrics fail Cache Baseline V2 and valid metrics/archives remain optional Runtime State.

### Task 5: Validate emergency rollback and regression safety

**Files:**
- Modify: `scripts/verify-route-v2-default-runtime-user-paths.mjs`
- Modify: directly affected Search/Planner verifier fixtures only when they must explicitly opt into the master switch

- [ ] **Step 1: Run Phase 2 and focused regressions**

Run:

```text
node scripts/verify-route-v2-production-readiness-phase1.mjs
node scripts/verify-route-v2-production-readiness-phase2.mjs
node scripts/verify-search-v1.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
```

Expected: PASS, with master-off returning a usable legacy result and no V2 child flag bypass.

- [ ] **Step 2: Run comprehensive prelaunch**

Run: `node scripts/verify-route-v2-comprehensive-prelaunch.mjs`

Expected: PASS with all mandatory stages, browser probe, performance verifier, Cache Baseline V2, and real asset isolation.

- [ ] **Step 3: Verify the final workspace**

Run:

```text
git diff --check
git diff --cached --check
git status --short --branch
```

Expected: no staged files; only Phase 1 and Phase 2 implementation/verification changes; no Accepted, Cache, or Knowledge diff.

Do not stage, commit, push, create a PR, deploy, or modify Git history in this phase.
