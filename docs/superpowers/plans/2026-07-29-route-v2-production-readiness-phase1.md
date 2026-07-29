# Route Generation V2 Production Readiness Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off Route Generation V2 master switch and deterministic per-user/session percentage rollout that always falls back to the legacy path outside the canary.

**Architecture:** Keep `createRouteV2RuntimeEnvironment()` as the server startup configuration boundary, but make its master switch default to off and make an explicit master-off override every V2 child flag. Add a pure per-request resolver that hashes an authenticated user ID when one is supplied, otherwise the existing browser session ID, and returns a sanitized decision plus an effective environment. Route Search passes that effective environment to Planner so both parsing and Candidate/Trace/Evidence behavior use the same decision.

**Tech Stack:** Node.js ESM, SHA-256 deterministic hashing, existing Route Search/Planner modules, standalone Node verifier scripts.

---

### Task 1: Lock the runtime decision contract with a failing verifier

**Files:**
- Create: `scripts/verify-route-v2-production-readiness-phase1.mjs`
- Modify: `scripts/verify-route-v2-default-runtime-user-paths.mjs`

- [ ] **Step 1: Add assertions for safe defaults and hard master override**

The verifier imports `createRouteV2RuntimeEnvironment()`, `resolveRouteV2RuntimeDecision()`, and `envFlag()`. It asserts that an empty environment resolves to master disabled and 0%, and that this input cannot enable any child:

```js
const disabled = resolveRouteV2RuntimeDecision({
  env: createRouteV2RuntimeEnvironment({
    ROUTE_V2_RUNTIME_ENABLED: "false",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  }),
  sessionId: "phase1-disabled-session",
});
assert.equal(disabled.decision.enabled, false);
assert.equal(disabled.environment.ROUTE_V2_INTENT_ENABLED, "false");
assert.equal(disabled.environment.ROUTE_V2_CANDIDATE_POOL_ENABLED, "false");
assert.equal(envFlag(disabled.environment, "ROUTE_V2_INTENT_ENABLED", true), false);
```

- [ ] **Step 2: Add deterministic rollout assertions**

Use 0%, 100%, and 50% configurations. Re-resolve 200 stable session IDs twice, require identical decisions, require both enrolled and legacy buckets at 50%, and require no raw subject ID in diagnostics:

```js
const decisions = Array.from({ length: 200 }, (_, index) => {
  const sessionId = `phase1-session-${index}`;
  return [
    resolveRouteV2RuntimeDecision({ env: halfRuntime, sessionId }),
    resolveRouteV2RuntimeDecision({ env: halfRuntime, sessionId }),
  ];
});
assert(decisions.every(([left, right]) => left.decision.bucket === right.decision.bucket));
assert(decisions.some(([item]) => item.decision.enabled));
assert(decisions.some(([item]) => !item.decision.enabled));
```

- [ ] **Step 3: Add a production-path legacy fallback assertion**

Create a Search service with a spy Planner. Send a non-enrolled `日本7天` request and assert that Planner receives an effective environment with every V2 child flag off, Search still returns the legacy fallback record, and no Candidate/Trace/Evidence sidecar is claimed.

- [ ] **Step 4: Run the verifier and confirm it fails**

Run:

```text
node scripts/verify-route-v2-production-readiness-phase1.mjs
```

Expected: FAIL because the rollout resolver and safe default do not exist yet.

### Task 2: Implement the hard master switch and stable canary resolver

**Files:**
- Modify: `src/lib/routes/route-v2-runtime-environment.mjs`
- Modify: `src/lib/routes/route-v2-env.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Make the startup configuration safe by default**

Change the master fallback to false. Parse `ROUTE_V2_CANARY_PERCENTAGE` as a clamped value from 0 through 100. If master is false, explicitly write `"false"` to every controlled V2 feature flag, even when a child was supplied as true.

- [ ] **Step 2: Add a deterministic decision function**

Export:

```js
resolveRouteV2RuntimeDecision({
  env,
  userId = "",
  sessionId = "",
})
```

The function selects `userId` before `sessionId`, hashes `schemaVersion + salt + subjectType + subjectId`, maps the first 32 hash bits into bucket `0..9999`, and enrolls when:

```js
masterEnabled
&& subjectId
&& bucket < rolloutPercentage * 100
```

It returns:

```js
{
  environment,
  decision: {
    schemaVersion,
    enabled,
    masterEnabled,
    rolloutPercentage,
    subjectType,
    subjectHash,
    bucket,
    reason,
    resolvedFlags,
    diagnostics,
  },
}
```

No raw user ID, session ID, environment secret, query, or local path may appear in the decision.

- [ ] **Step 3: Enforce master-off at the lowest shared flag reader**

Update `envFlag()` so an explicitly false `ROUTE_V2_RUNTIME_ENABLED` makes every `ROUTE_V2_*` boolean feature read false. Environments that omit the master retain module-level test compatibility, while production environments created by the runtime factory always contain the explicit master.

- [ ] **Step 4: Export the new contract**

Export the controlled flag list, decision schema version, rollout parser, and resolver through `src/lib/routes/index.mjs`.

- [ ] **Step 5: Run the focused verifier**

Run:

```text
node scripts/verify-route-v2-production-readiness-phase1.mjs
```

Expected: unit-level master, percentage, stability, privacy, and child-override assertions pass; Search/Planner integration assertions still fail.

### Task 3: Apply one resolved decision to Search and Planner

**Files:**
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`

- [ ] **Step 1: Resolve the request at Search entry**

At the beginning of `search()`, resolve with `context.userId` and `request.sessionId`. Use the resulting effective environment for Time Intent, shadow validation, and all request-scoped V2 behavior.

- [ ] **Step 2: Pass the exact effective environment to Planner**

Extend the existing Planner context with:

```js
routeV2RuntimeEnvironment: runtime.environment,
routeV2RuntimeDecision: runtime.decision,
```

Do not pass raw identities.

- [ ] **Step 3: Make Planner respect the request decision**

Before calling `runPipeline()`, select `context.routeV2RuntimeEnvironment` when present. When Planner is invoked outside Search, resolve the decision from the context user/session identity; no identity means legacy.

- [ ] **Step 4: Expose sanitized diagnostics**

Add the resolved decision to Search diagnostics and analytics so verification and future monitoring can distinguish `master-disabled`, `rollout-disabled`, `missing-subject`, `canary-included`, and `canary-excluded`.

- [ ] **Step 5: Run the full Phase 1 verifier**

Run:

```text
node scripts/verify-route-v2-production-readiness-phase1.mjs
```

Expected: PASS including non-enrolled legacy fallback.

### Task 4: Make the readiness check permanent and run regressions

**Files:**
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`

- [ ] **Step 1: Register the Phase 1 verifier**

Add `scripts/verify-route-v2-production-readiness-phase1.mjs` to the mandatory static prelaunch stages.

- [ ] **Step 2: Explicitly enable the isolated comprehensive run**

Set:

```text
ROUTE_V2_RUNTIME_ENABLED=true
ROUTE_V2_CANARY_PERCENTAGE=100
```

in the comprehensive verifier’s isolated environment. Keep online evidence and automatic acceptance false.

- [ ] **Step 3: Run focused and compatibility verification**

Run:

```text
node scripts/verify-route-v2-production-readiness-phase1.mjs
node scripts/verify-route-v2-default-runtime-user-paths.mjs
node scripts/verify-route-v2-search-v1.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-candidate-selection-stabilization.mjs
node scripts/verify-route-v2-search-acceptance-gate.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
git diff --check
git diff --cached --check
```

Expected: every command exits 0. Tests use isolated runtime paths, Accepted/Cache/Knowledge remain byte-for-byte unchanged, staged remains empty, and no network-dependent evidence path is enabled.

- [ ] **Step 4: Stop without committing**

Report modified and new files, decision architecture, bucket distribution, legacy fallback result, verification matrix, asset isolation, and the recommended Phase 2 monitoring work. Do not stage, commit, push, create a PR, deploy, or modify Git history.
