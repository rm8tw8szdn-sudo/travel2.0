# Route V2 Canonical Region Key Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve one stable canonical Region key from SearchIntent through final validation so hyphenated regions cannot degrade to country-only matching.

**Architecture:** `route-search-region-taxonomy.mjs` owns canonicalization and definition resolution. RouteIntent, Candidate snapshots, the production invariant gate, fallback, and the independent Oracle consume that shared canonical representation; an unknown explicit Region fails closed. The permanent verifier exercises the real Search/Planner/store path in an isolated directory and adds a tampered-key negative case.

**Tech Stack:** Node.js ESM, Route V2 JSON/JSONL stores, built-in `assert`, local browser preview.

---

### Task 1: Lock the failing production behavior into the permanent verifier

**Files:**
- Modify: `scripts/verify-route-v2-region-island-constraints.mjs`

- [ ] **Step 1: Add a real isolated Planner/Search fixture**

Reuse `createRouteCompositionPlanner`, the published Knowledge repository, and temporary Candidate/Trace/Evidence stores. Disable every external evidence provider and point every writable store at `os.tmpdir()`.

- [ ] **Step 2: Add Lake Como and Jeju production assertions**

For every returned record, assert that its destination QIDs are a non-empty subset of the resolved Region definition. If no matching route can be constructed, assert a structured Region failure instead of accepting a parent-country route.

- [ ] **Step 3: Add a canonical-key mutation case**

Clone a valid normalized intent, replace its Region key with an unregistered canonical key, and assert both production validation and the Oracle reject it with `region-definition-missing`.

- [ ] **Step 4: Run the verifier and confirm it fails before implementation**

Run: `node scripts/verify-route-v2-region-island-constraints.mjs`

Expected: FAIL because `lakecomo` and `jejuisland` can currently miss the taxonomy lookup.

### Task 2: Establish the single canonical Region representation

**Files:**
- Modify: `src/lib/routes/route-search-region-taxonomy.mjs`
- Modify: `src/lib/routes/route-intent-model.mjs`
- Modify: `src/lib/routes/route-candidate-pool.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Export a taxonomy-owned canonicalizer**

Implement `canonicalizeTravelRegionKey(value, catalog)` by resolving keys, labels, aliases, compact variants, and accented forms through the existing taxonomy token index. Known values return the definition's stable key, such as `lake-como`; unknown values receive one deterministic hyphenated key.

- [ ] **Step 2: Normalize RouteIntent with the taxonomy canonicalizer**

Replace punctuation-stripping Region normalization with `canonicalizeTravelRegionKey(...)` so the normalized RouteIntent and fingerprint retain `lake-como` and `jeju-island`.

- [ ] **Step 3: Preserve the same key in Candidate snapshots**

Replace Candidate-specific Region cleaning with the shared canonicalizer. Do not change non-Region snapshot semantics.

- [ ] **Step 4: Export the canonicalizer for verifier and integration use**

Add the taxonomy resolver/canonicalizer exports to `src/lib/routes/index.mjs`.

### Task 3: Fail closed in production validation, fallback, and Oracle

**Files:**
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `src/lib/routes/route-intent-model-oracle.mjs`
- Modify: `src/lib/routes/route-fallback-constraint-validator.mjs`

- [ ] **Step 1: Replace the raw production Map lookup**

Resolve the expected Region with the shared taxonomy resolver. Subnational definitions validate every destination; macro definitions retain their allowed-country-set behavior.

- [ ] **Step 2: Reject missing definitions**

When an explicit Region has neither a macro nor subnational definition, add `region-definition-missing` even when the parent-country set matches.

- [ ] **Step 3: Apply the same canonical key to the Oracle**

Use the shared canonicalizer in the independent Oracle and emit the same structured missing-definition violation while keeping the Oracle's matching logic independent.

- [ ] **Step 4: Surface the new failure through fallback diagnostics**

Treat `region-definition-missing` as a Region conflict in the fallback validator.

### Task 4: Verify, review scope, and publish the fix

**Files:**
- Test: `scripts/verify-route-v2-region-island-constraints.mjs`
- Test: existing RouteIntent, Search, Planner, fallback, Cache, and comprehensive verifiers

- [ ] **Step 1: Run the full requested automatic matrix**

Run Region/Island, Search Intent, RouteIntent model/invariant/oracle, fallback, Search acceptance, Planner, Search V1, comprehensive prelaunch, `node --check`, and `git diff --check`.

- [ ] **Step 2: Run isolated real-browser checks**

Search Lake Como, Jeju Island, Mallorca, and Andalusia. Confirm no Region leakage, no console errors/warnings, and no external image/evidence requests.

- [ ] **Step 3: Confirm formal assets are byte-identical**

Compare Accepted, immutable Cache, Runtime State, the 51 formal Knowledge files, Evidence seed, and Metrics state before/after.

- [ ] **Step 4: Stage only the canonical Region fix**

Review staged names, stats, full diff, and `git diff --cached --check` before committing.

- [ ] **Step 5: Create and push one independent commit**

Commit message: `fix(route-v2): preserve canonical region constraints`

Push normally to `codex/route-v2-production-readiness-search-intent-release`, update PR #19's description with the root cause and regression coverage, and do not merge or deploy.
