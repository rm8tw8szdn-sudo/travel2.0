# Route V2 Parser and Candidate Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the confirmed `December` parser false positive and eliminate repeated over-generation in the candidate sidecar without expanding product scope.

**Architecture:** Keep the existing SearchIntent, RouteIntent, Planner, and three-candidate selection contract. Narrow unknown-city validation to the destination portion of the common `destinations + duration + modifiers` query shape, remove only aliases of cities actually recognized, and make the candidate builder honor the planner's destination cap directly so the planner can build once instead of generating 12 candidates and retrying six times.

**Tech Stack:** Node.js ES modules, existing Route V2 verifier scripts, local Runtime API, in-app browser.

---

### Task 1: Lock the failure and performance boundary

**Files:**
- Modify: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`
- Modify: `scripts/verify-route-v2-planner-pipeline.mjs` or the existing candidate-sidecar verifier that owns builder call assertions

**Step 1: Keep the existing failing December regression**

Verify that `Berlin Munich 7 days in December` fails before the production change and that an actually unknown destination still fails closed.

**Step 2: Add one candidate-build-count assertion**

Assert that destination-suggestion planning performs one candidate-builder call with a destination cap and requests only the three candidates required by selection.

**Step 3: Run the focused verifiers and confirm the new assertion fails**

Run the multi-city and planner/candidate focused verifiers only.

### Task 2: Simplify unknown-city validation

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Test: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`

**Step 1: Limit English unknown-token inspection to the destination prefix**

For the common English query shape, inspect only text before the first explicit duration token. Time, season, theme, and other modifiers after duration are not destination candidates.

**Step 2: Stop scanning every city alias**

Remove aliases only for cities already recognized in the query. Retain the small country/region/style/theme/season/transport catalogs needed to clean supported modifiers.

**Step 3: Preserve fail-closed behavior**

Keep an unknown city between recognized destinations detectable; do not add month-specific or city-specific branches.

**Step 4: Run parser, SearchIntent, multi-city, multi-country, and boundary verifiers**

Expected: the December query succeeds with both required cities; unknown destinations still conflict.

### Task 3: Remove candidate over-generation retries

**Files:**
- Modify: `src/lib/routes/route-candidate-builder.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Test: the existing planner/candidate-sidecar verifier selected in Task 1

**Step 1: Add one direct destination-count cap to the builder**

Let the builder combine the RouteIntent day limit, pool size, and optional planner cap before creating sequences.

**Step 2: Build exactly once in the planner**

Request the existing three-candidate selection target once. Remove the 12-candidate build, six retry seeds, merge map, and capacity recovery loop.

**Step 3: Retain one fail-closed capacity filter**

If a custom builder ignores the cap, reject oversized candidates instead of retrying or weakening constraints.

**Step 4: Run candidate selection, planner pipeline, fallback, and acceptance-gate verifiers**

Expected: three stable candidates remain available where required, with no repeated builder calls.

### Task 4: Verify latency and real-user behavior

**Files:**
- No production file changes expected

**Step 1: Run syntax and diff checks**

Run `node --check` for modified JavaScript modules and `git diff --check`.

**Step 2: Run the relevant Route V2 regression set**

Run multi-city, multi-country, Real User Search Intent, RouteIntent invariant/oracle/mutation, Candidate selection, fallback, Search acceptance, Planner pipeline, Search V1, Region/Island, explicit theme, long-trip capacity, Runtime API, performance, and comprehensive prelaunch verifiers.

**Step 3: Perform real browser searches**

Verify `Berlin Munich 7 days in December`, one ordinary multi-city query, one ordinary multi-country query, and one fixed-order query. Confirm complete hard constraints, stable details, zero console errors/warnings, and zero external Evidence/image requests.

**Step 4: Compare performance and assets**

Require parser/final-gate p95 to remain under the existing 2 ms safety limit and browser/API response not to regress materially. Confirm Accepted, Immutable Cache, formal Evidence, Runtime State, Batch 04 data hashes, metrics absence, and stash remain unchanged.

**Step 5: Stop at the existing submission boundary**

Do not stage, commit, push, open a PR, deploy, tag, or touch the stash in this cleanup pass unless separately authorized after results are reported.
