# Route V2 PR #19 P1 Closures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three merge-blocking PR #19 findings without changing formal route assets or implementing unrelated P2 maintenance.

**Architecture:** Add one request-scoped side-effect decision at the Planner boundary, replace suffix-only typo detection with residual-token classification in the existing Search Intent parser, and enforce explicit theme compatibility in the existing final RouteIntent invariant gate. Exercise all three changes through real Search and Planner instances backed only by temporary stores, then expose theme mismatch through the existing search result diagnostics.

**Tech Stack:** Node.js ESM, built-in `node:test`-style assertions, existing Route V2 repositories, browser JavaScript, Git/GitHub CLI.

---

### Task 1: Add the failing production-path regression

**Files:**
- Create: `scripts/verify-route-v2-pr19-p1-closures.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`

- [ ] **Step 1: Write isolated real-Planner side-effect assertions**

Create a verifier that builds the published Entity Layer repository, real Planner, real Search service, and temporary Candidate/Trace/Evidence/Ready Pool stores. For master-off, 0%, and excluded 50% cases, snapshot every sidecar path before and after Search and assert byte equality:

```js
assert.equal(result.diagnostics.routeV2Runtime.enabled, false);
assert.deepEqual(snapshotSidecars(paths), before);
```

For included 50% and 100% cases, assert the runtime decision is enabled and at least Candidate/Trace lifecycle output is persisted.

- [ ] **Step 2: Add typo and theme production cases**

Exercise the same real Search/Planner path:

```js
for (const query of ["Jappann 7 days", "Italyyy 7 days", "Thailannd 10 days"]) {
  const result = await service.search({ query, sessionId: stableSession(query) });
  assert.equal(result.records.length, 0);
  assert(["destination-confirmation-required", "unresolved-destination"].includes(result.diagnostics.reason));
}
```

Assert explicit theme cases either return compatible records or `constraint-conflict` containing `explicit-theme-mismatch`; never accept a classic route as family, hiking, or honeymoon.

- [ ] **Step 3: Run the new verifier and confirm it fails**

Run:

```text
node scripts/verify-route-v2-pr19-p1-closures.mjs
```

Expected: FAIL against the current PR head for excluded sidecar writes, residual typo fallback, and explicit theme mismatch.

### Task 2: Enforce request-scoped V2 side effects

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Test: `scripts/verify-route-v2-pr19-p1-closures.mjs`

- [ ] **Step 1: Define a request-scoped side-effect decision**

Use the resolved request decision when present and the request environment for each child capability:

```js
const requestAllowsV2SideEffects = context?.routeV2RuntimeDecision
  ? context.routeV2RuntimeDecision.enabled === true
  : isRouteV2IntentEnabled(env);
const candidateWritesAllowed = requestAllowsV2SideEffects
  && isRouteV2CandidatePoolEnabled(env);
const traceWritesAllowed = requestAllowsV2SideEffects
  && isRouteV2TraceEnabled(env);
```

- [ ] **Step 2: Guard every sidecar call**

Skip Candidate creation/persistence, legacy/failure Trace writes, local Evidence sidecars, EvidenceBundle lifecycle, Publication/Ready Pool writes whenever the request decision is disabled. Preserve legacy route construction and response behavior.

- [ ] **Step 3: Run the side-effect scenarios**

Run the targeted verifier. Expected: excluded scenarios have byte-identical sidecars; included scenarios retain V2 persistence.

### Task 3: Replace suffix-only typo detection

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `scripts/fixtures/route-v2-real-user-search-intent-matrix.json`
- Modify: `scripts/verify-route-v2-real-user-search-intent-regression.mjs`
- Test: `scripts/verify-route-v2-pr19-p1-closures.mjs`

- [ ] **Step 1: Build residual Latin token classification**

Remove known country/city/region/style/theme/season/transport aliases, parsed duration words, and a bounded list of ordinary travel-language stop words. Treat remaining Latin words as unresolved destinations when no destination was matched:

```js
const unresolvedCountryTokens = !matchedDestination && !destinationCorrection
  ? unresolvedLatinDestinationTokens(rawQuery, knownCatalogs)
  : [];
```

Do not special-case Japan, Italy, Thailand, or fixture strings.

- [ ] **Step 2: Preserve generic recommendation queries**

Verify that `where should I travel for seven days`, `family trip for seven days`, and other condition-only inputs retain `destination-suggestion`, while unknown proper-looking residual tokens stop safely.

- [ ] **Step 3: Run parser and production regressions**

Run both Search Intent and targeted P1 verifiers. Expected: all old cases plus new typo and generic-English controls pass.

### Task 4: Enforce explicit theme compatibility

**Files:**
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `routes.js`
- Modify: `scripts/verify-route-v2-real-user-search-intent-regression.mjs`
- Test: `scripts/verify-route-v2-pr19-p1-closures.mjs`

- [ ] **Step 1: Validate explicit themes at the final invariant gate**

When `normalizedIntent.softPreferences.theme` is non-empty, validate it against independent route semantics:

```js
if (requiredTheme && !routeSupportsExplicitTheme(record, requiredTheme)) {
  violations.push(violation(
    "explicit-theme-mismatch",
    "theme",
    requiredTheme,
    routeThemeSignals(record),
    source,
  ));
}
```

Structural mappings may accept road-trip, island-hopping, city-break, and citywalk records. Family, hiking, and honeymoon require matching route theme evidence; query-copied labels in `search-knowledge-graph-fallback` are not proof.

- [ ] **Step 2: Expose a safe user-visible state**

When Search diagnostics contain `explicit-theme-mismatch`, render a message stating that no reliable route currently satisfies the requested theme. Do not relabel a generic route.

- [ ] **Step 3: Run Planner, fallback, and UI assertions**

Confirm compatible routes pass and unsupported themes return no route with the explicit diagnostic.

### Task 5: Run release gates and publish the focused fix

**Files:**
- Modify only files from Tasks 1-4 and this plan.

- [ ] **Step 1: Run targeted and full automated verification**

Run Phase 1, Phase 2, Search Intent, Search V1, Planner, RouteIntent, fallback, Cache V2, performance, comprehensive prelaunch, Node syntax checks, and `git diff --check`.

- [ ] **Step 2: Run local browser checks**

Verify 0% rollout sidecars, typo inputs, explicit themes, Iceland ring-road, and one destination-suggestion input without external Evidence or image requests.

- [ ] **Step 3: Confirm formal asset fingerprints**

Compare Accepted, Immutable Cache, Knowledge, Evidence seed, Runtime State, and metrics snapshots before and after. Expected: unchanged.

- [ ] **Step 4: Commit and update PR #19**

Stage only the reviewed files, create one new commit without amend, push normally to `codex/route-v2-production-readiness-search-intent-release`, and update the existing PR description with the three root causes, fixes, and regression coverage. Do not merge or deploy.
