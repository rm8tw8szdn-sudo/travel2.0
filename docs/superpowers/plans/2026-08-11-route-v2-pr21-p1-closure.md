# Route V2 PR21 P1 Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two PR #21 P1 gaps by enforcing auditable positive Knowledge types and making Trip/Footprint identity verification mandatory in every comprehensive release run.

**Architecture:** Keep release verification deterministic and offline. Capture a bounded Wikidata P279 graph with a small reviewed root set, require every published City or POI P31 to reach a root for its own kind, validate every exception declaration and prove it is actually consumed, then add the existing TravelState E2E verifier to the mandatory stage registry and directly test status/signal/error propagation.

**Tech Stack:** Node.js ESM, repository JSON semantic snapshots, Wikidata P31/P279/P17, `node:assert`, Git/GitHub CLI, isolated local browser verification.

---

### Task 1: Positive semantic type policy

**Files:**
- Create: `data/knowledge/semantic/knowledge-semantic-type-policy.json`
- Create: `scripts/build-knowledge-semantic-type-policy.mjs`
- Modify: `src/lib/routes/knowledge-semantic-gate.mjs`
- Test: `scripts/verify-knowledge-semantic-gate.mjs`

- [ ] **Step 1: Add failing positive-type fixtures**

Add production-path assertions that a church (`Q574702` / `Q16970`), island, and country fail as City; a City fails as POI; and known legal City/POI facts pass.

```js
assertKilled("church-published-as-city", validatePublishedKnowledgeSemantics({
  countries: [germany],
  cities: [churchAsCity],
  factsByQid: facts,
  typePolicy,
}), "instance-type-not-allowed");
```

- [ ] **Step 2: Build a reviewed, bounded P279 snapshot**

Read the current published P31 values, retrieve only their P279 ancestors from the official Wikidata API, stop expansion at depth 8, and write deterministic roots, nodes, direct parent edges, source URLs, and retrieval metadata.

```js
const MAX_SUBCLASS_DEPTH = 8;
const policy = {
  schemaVersion: "route-v2-knowledge-semantic-type-policy-v1",
  maximumSubclassDepth: MAX_SUBCLASS_DEPTH,
  roots: {
    city: ["Q486972", "Q515", "Q3957", "Q532", "Q15284"],
    poi: reviewedPoiRoots,
  },
  types: auditedTypeNodes,
};
```

- [ ] **Step 3: Replace blacklist acceptance with positive reachability**

Validate the policy shape, perform cycle-safe breadth-first P279 traversal within `maximumSubclassDepth`, and accept a City or POI only when at least one P31 reaches a root for that same kind. Missing policy entries, unknown chains, cycles beyond the bound, and cross-kind roots must fail closed.

```js
const match = resolveAllowedSemanticType({
  instanceOfIds: fact.instanceOfIds,
  kind,
  typePolicy,
});
if (!match.accepted) add("instance-type-not-allowed", {
  instanceOfIds: match.instanceOfIds,
  maximumSubclassDepth: match.maximumSubclassDepth,
});
```

- [ ] **Step 4: Verify all 1,099 published entities**

Run: `node scripts/verify-knowledge-semantic-gate.mjs`

Expected: PASS; all 144 Cities and 904 POIs have a positive type path or one exact, audited exception; every negative fixture is killed.

### Task 2: Auditable semantic exceptions

**Files:**
- Modify: `data/knowledge/semantic/knowledge-semantic-exceptions.json`
- Modify: `src/lib/routes/knowledge-semantic-gate.mjs`
- Test: `scripts/verify-knowledge-semantic-gate.mjs`

- [ ] **Step 1: Make every exception self-identifying and sourced**

For all 15 entries add a deterministic `exceptionId`, `exceptionType`, exact entity/QID/parent/country scope, `sourceUrl` or `sourcePath`, `reviewStatus`, `reviewVersion`, and `reviewedAt`. The five existing Singapore/Vatican gaps use their exact Wikidata entity pages, not placeholder URLs.

```json
{
  "exceptionId": "knowledge-semantic-exception-<stable-scope-hash>",
  "exceptionType": "country-claim-mismatch",
  "reviewStatus": "approved",
  "reviewVersion": 1,
  "reviewedAt": "2026-08-11T00:00:00.000Z"
}
```

- [ ] **Step 2: Validate declarations before applying them**

Reject missing source/scope/review fields, duplicate IDs or scopes, entity/QID/kind/parent/country drift, and any declaration whose scoped violation is not consumed during the production run.

```js
if (exceptionIds.has(entry.exceptionId)) addExceptionViolation("exception-id-duplicate", entry);
if (!clean(entry.sourceUrl || entry.sourcePath)) addExceptionViolation("exception-source-missing", entry);
for (const entry of normalizedExceptions) {
  if (!usedExceptionIds.has(entry.exceptionId)) addExceptionViolation("exception-unused", entry);
}
```

- [ ] **Step 3: Add exception mutation coverage**

Mutate one field at a time: source, ID, entityId, parentEntityId, expectedCountryQid, and duplicate scope. Each mutation must make the production gate reject.

- [ ] **Step 4: Re-run the semantic gate**

Run: `node scripts/verify-knowledge-semantic-gate.mjs`

Expected: PASS with 15/15 active exceptions sourced, exact, unique, and used.

### Task 3: Mandatory Trip/Footprint release stage

**Files:**
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`
- Modify: `docs/superpowers/plans/2026-08-11-route-v2-final-adversarial-review.md`

- [ ] **Step 1: Register the existing E2E verifier**

```js
Object.freeze({
  name: "trip-footprint-knowledge-identity",
  relativePath: "scripts/verify-travel-state.mjs",
  phase: "static",
}),
```

- [ ] **Step 2: Prove all child-failure channels stop release**

Inject a non-zero exit, a termination signal, and a spawn error for `trip-footprint-knowledge-identity`; each call to `runMandatoryVerifierStage()` must throw `MandatoryVerifierStageError` without inspecting PASS text.

```js
assertStageFailure(travelStateStage, { status: 23, signal: null }, 23);
assertStageFailure(travelStateStage, { status: null, signal: "SIGTERM" }, null);
assertStageFailure(travelStateStage, { status: null, signal: null, error: new Error("injected") }, null);
```

- [ ] **Step 3: Update the stage claim**

Change the current review report from 36/36 to 37/37 mandatory stages; keep the dynamic live-browser stage reported separately.

- [ ] **Step 4: Verify release behavior**

Run: `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

Expected: PASS with `mandatoryStageCount: 37` and Trip/Footprint status/signal/error propagation all true.

### Task 4: Regression, browser, assets, and publication

**Files:**
- Verify: all modified/new `.mjs` files
- Verify: formal cache/evidence/runtime assets
- Update: PR #21 body after push

- [ ] **Step 1: Run focused and comprehensive gates**

Run the requested semantic, cumulative Knowledge, TravelState, single/multi/mixed constraints, Region/Island, theme, Search V1, Planner, fallback, server security, Cache Baseline V2, comprehensive prelaunch, failure propagation, `node --check`, and `git diff --check` checks.

Expected: every command exits 0; comprehensive reports exactly 37 mandatory stages and executes all of them.

- [ ] **Step 2: Run only the three requested browser checks**

Verify `Germany Austria 14 days` through completed Trip and Footprint (2 countries, 6 cities, entityId/QID intact), plus `Nara 7 days` and `Linz 7 days`; keep the page stable and require zero console warnings/errors and zero external Evidence/image requests.

- [ ] **Step 3: Recheck protected assets and stash**

Expected: Accepted, Immutable Cache, Formal Evidence hashes unchanged; Cache 331, Runtime State 329, Metrics absent; `stash@{0}` message unchanged.

- [ ] **Step 4: Commit independently and push normally**

```text
fix(route-v2): enforce positive knowledge semantic types
test(route-v2): require trip footprint release verification
```

After each commit run `git diff --check` and its focused verifier. Push the existing branch without force, update PR #21, and do not merge, deploy, tag, or touch stash.
