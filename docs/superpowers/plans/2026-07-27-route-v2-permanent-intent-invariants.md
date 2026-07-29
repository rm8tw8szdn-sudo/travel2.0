# Route V2 Permanent Intent Invariants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one permanent, versioned RouteIntent correctness boundary that prevents every successful Route V2 result from weakening user hard constraints across generation, fallback, persistence, replay, Feed, and Detail.

**Architecture:** The existing free-text parser remains the only text parser. A new structured RouteIntent model normalizes its output, generates a stable fingerprint, and separates hard constraints from preferences and display/evidence metadata. A shared production invariant gate protects every success/persistence/display boundary, while a separately implemented Model Oracle, deterministic generators, permanent corpus, mutation harness, and shadow comparison independently prove the gate.

**Tech Stack:** Node.js ESM, `node:crypto`, `node:assert/strict`, existing file-backed repositories, existing verifier convention, isolated temporary directories, existing local HTTP server and browser acceptance flow.

---

### Task 1: Freeze the route-constraint data contract

**Files:**
- Create: `src/lib/routes/route-intent-model.mjs`
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/index.mjs`
- Test: `scripts/verify-route-v2-route-intent-model.mjs`

- [ ] **Step 1: Write model tests for semantic normalization**

Assert that equivalent whitespace, case, punctuation, aliases, and unordered preference arrays normalize identically; fixed city order remains ordered; missing and explicit-empty fields remain distinct; exact days, month range, season, country, region, and capacity retain structured presence.

- [ ] **Step 2: Run the model verifier and confirm the missing exports fail**

Run: `node scripts/verify-route-v2-route-intent-model.mjs`

Expected: FAIL because `normalizeRouteIntent` and `createRouteIntentFingerprint` do not exist.

- [ ] **Step 3: Implement the single structured model**

Export:

```js
export const ROUTE_INTENT_SCHEMA_VERSION = "route-intent-v1";
export const ROUTE_INTENT_FINGERPRINT_VERSION = "route-intent-fingerprint-v1";
export function normalizeRouteIntent(input = {}) {}
export function createRouteIntentFingerprint(input = {}) {}
export function attachRouteIntentEnvelope(record = {}, input = {}) {}
export function readRouteIntentEnvelope(record = {}) {}
```

The normalized model contains `hardConstraints`, `softPreferences`, `displayMetadata`, and `evidenceStatus`. Fingerprint input contains the schema version plus request semantics, never timestamps, paths, ports, random seeds, or display text.

- [ ] **Step 4: Make the existing parser emit the model and fingerprint**

Keep `parseSearchIntent()` as the only text parser. Add `normalizedRouteIntent`, `routeIntentFingerprint`, and `routeIntentFingerprintVersion` to its output while preserving the existing `intentHash` compatibility field.

- [ ] **Step 5: Run the model and existing parser regressions**

Run:

```text
node scripts/verify-route-v2-route-intent-model.mjs
node scripts/verify-route-v2-time-intent-boundaries.mjs
node scripts/verify-search-v1.mjs
```

Expected: PASS.

### Task 2: Add the production invariant gate and independent Oracle

**Files:**
- Create: `src/lib/routes/route-intent-invariant-gate.mjs`
- Create: `src/lib/routes/route-intent-model-oracle.mjs`
- Create: `src/lib/routes/route-intent-shadow-validation.mjs`
- Modify: `src/lib/routes/route-fallback-constraint-validator.mjs`
- Modify: `src/lib/routes/index.mjs`
- Test: `scripts/verify-route-v2-route-intent-oracle.mjs`

- [ ] **Step 1: Write disagreement and violation tests**

Cover missing, added, replaced, reordered, and duplicated cities; exact-day mismatch; capacity overflow; month/season/country/region loss; fingerprint mismatch/version mismatch; rejected-to-success relabeling; and missing structured evidence metadata.

- [ ] **Step 2: Run the Oracle verifier and confirm failure**

Run: `node scripts/verify-route-v2-route-intent-oracle.mjs`

Expected: FAIL because the gate and Oracle do not exist.

- [ ] **Step 3: Implement the production gate**

Export:

```js
export function validateRouteIntentInvariants(record = {}, routeIntent = {}, options = {}) {}
export function finalizeRouteResult(record = {}, routeIntent = {}, options = {}) {}
export function validateEmbeddedRouteIntent(record = {}, options = {}) {}
```

The gate returns `{ matched, outcome, reasonCodes, violations, requiresEvidence, fingerprint }`. It never edits route destinations or user constraints. Failure produces an explicit rejected/conflict result.

- [ ] **Step 4: Implement the independent Oracle**

Export `evaluateRouteIntentOracle(normalizedIntent, record, options)`. It must not import or call the production gate or fallback validator. It derives route identity, order, duration, time, country, and region from structured fields only and returns its own violation list.

- [ ] **Step 5: Add shadow comparison**

Export `runRouteIntentShadowValidation()` with structured diagnostics. The production gate always remains active; only the extra Oracle comparison is controlled by `ROUTE_V2_ROUTE_INTENT_SHADOW_VALIDATION`.

- [ ] **Step 6: Replace the fallback validator core**

Keep `validateFallbackRouteAgainstIntent()` as a compatibility adapter to the shared gate so existing callers do not gain a second constraint implementation.

- [ ] **Step 7: Run Oracle, fallback, and fixed-case regressions**

Expected: the gate and Oracle agree on every fixture; invalid results are rejected without route mutation.

### Task 3: Carry fingerprints through generation and audit records

**Files:**
- Modify: `src/lib/routes/decision-trace-schema.mjs`
- Modify: `src/lib/routes/route-candidate-builder.mjs`
- Modify: `src/lib/routes/route-candidate-pool.mjs`
- Modify: `src/lib/routes/route-candidate-selection.mjs`
- Modify: `src/lib/routes/evidence-bundle-schema.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Test: `scripts/verify-route-v2-route-intent-boundary-integration.mjs`

- [ ] **Step 1: Write failing propagation tests**

Assert that request, all candidates, selected candidate, RouteRecord, DecisionTrace, and EvidenceBundle share one fingerprint and normalized hard-constraint snapshot.

- [ ] **Step 2: Propagate the fingerprint without changing legacy flags**

Add optional compatibility fields to schemas and builders. Legacy records without an embedded intent remain readable, but new V2 records cannot claim success without a valid envelope.

- [ ] **Step 3: Gate the Planner success exit**

Before `accepted` is returned or Ready Pool evaluation runs, call the shared finalizer. A failed invariant becomes an explicit rejected result and cannot be repackaged by legacy fallback.

- [ ] **Step 4: Run Candidate, DecisionTrace, Evidence, and Planner regressions**

Expected: PASS with all feature flags retaining their existing default values.

### Task 4: Protect cache, Ready Pool, Search, accepted/mature routes, Feed, and Detail

**Files:**
- Modify: `src/lib/routes/route-search-cache.mjs`
- Modify: `src/lib/routes/route-v2-ready-pool.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/accepted-repository.mjs`
- Modify: `src/lib/routes/contracts.mjs`
- Modify: `src/lib/routes/discovery.mjs`
- Test: `scripts/verify-route-v2-route-intent-boundary-integration.mjs`

- [ ] **Step 1: Add failing boundary tests**

Exercise accepted, mature, legacy, fallback, cache replay, Ready Pool, Search response, Planner response, Feed, Detail, and search-detail with valid and tampered records.

- [ ] **Step 2: Version cache entries by fingerprint**

`put()` rejects records incompatible with the supplied intent. `get()` requires the current intent/fingerprint. Old schema entries remain parseable but are safe misses when intent integrity cannot be proven. Search-detail validates the cached item and embedded record before returning it.

- [ ] **Step 3: Gate Ready Pool writes and reads**

Only records with a valid embedded intent and matching publication decision can enter or leave the Ready Pool. Tampered or old incompatible entries are skipped with diagnostics.

- [ ] **Step 4: Gate accepted/mature/fallback conversion and final Search**

Attach the current request envelope only after a source route passes the shared gate. Final Search always revalidates the decorated result and emits a conflict response instead of a weakened success.

- [ ] **Step 5: Gate Feed and Detail display boundaries**

Legacy accepted routes with no user-bound intent remain compatible. Any route carrying intent/fingerprint metadata must pass embedded validation before Feed or Detail exposure; invalid records never appear transiently.

- [ ] **Step 6: Run boundary integration and existing Search/Feed/Detail regressions**

Expected: no cross-fingerprint cache hit, no incompatible Ready Pool result, and no invalid display record.

### Task 5: Build permanent generative, fuzz, metamorphic, differential, and mutation defenses

**Files:**
- Create: `testdata/route-v2/route-intent-invariant-corpus.json`
- Create: `scripts/lib/route-v2-intent-test-generators.mjs`
- Create: `scripts/verify-route-v2-route-intent-properties.mjs`
- Create: `scripts/verify-route-v2-route-intent-fuzz.mjs`
- Create: `scripts/verify-route-v2-route-intent-metamorphic.mjs`
- Create: `scripts/verify-route-v2-route-intent-differential.mjs`
- Create: `scripts/verify-route-v2-route-intent-mutations.mjs`
- Create: `scripts/verify-route-v2-route-intent-corpus.mjs`

- [ ] **Step 1: Add the permanent corpus**

Include every required regression: impossible four-city day trip, valid fixed order, February two-day trip, each individual constraint loss, fingerprint mismatch, Ready Pool mismatch, rejected relabeling, legacy cache, multilingual punctuation, and boundary types.

- [ ] **Step 2: Implement deterministic generators**

Use a small repository-local seeded PRNG instead of adding a dependency. Emit the seed and minimized failing case. Generated data only lives in memory or unique temporary directories.

- [ ] **Step 3: Implement property and fuzz suites**

Run at least 2,000 property cases and 2,000 fuzz cases with bounded input sizes, fixed seeds, and per-case time guards.

- [ ] **Step 4: Implement metamorphic and differential suites**

Check semantic whitespace/case equivalence, unordered preference order, fixed-order sensitivity, additional required city invalidation, day/month replay invalidation, and source-independent invariant results.

- [ ] **Step 5: Implement the targeted mutation harness**

Create temporary mutated copies of the production gate and boundary adapters. Mutate each required check independently, run the permanent corpus and Oracle comparison, and fail unless every core mutant is killed. Emit total, killed, survived, and score.

- [ ] **Step 6: Run all permanent suites**

Expected: all cases pass and mutation score is 100% with zero surviving core mutations.

### Task 6: Add isolated E2E and performance validation

**Files:**
- Create: `scripts/verify-route-v2-route-intent-performance.mjs`
- Create: `scripts/verify-route-v2-route-intent-browser.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`

- [ ] **Step 1: Extend prelaunch isolation**

Use a dynamic port and unique temporary Accepted, Search cache, image cache, Candidate, Trace, Evidence, Ready Pool, browser profile, screenshot, and performance directories. Cleanup runs in `finally`.

- [ ] **Step 2: Add measured performance runs**

Measure normalize, fingerprint, gate, Search, Planner, Feed, Detail, cache replay, Ready Pool, property, and fuzz paths. Report sample count, warm-up, p50, p95, max, environment, and cache status.

- [ ] **Step 3: Run real browser acceptance**

Use 360px, 390px, and desktop viewports. Exercise Feed, Search, Planner-backed generation, Detail, conflict, fixed order, month, season, exact days, replay, refresh, back/forward, direct detail, and empty/rejected states. Confirm zero external image hosts and zero relevant console errors.

- [ ] **Step 4: Compare asset snapshots**

Accepted hash must remain `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`; Cache must remain 331 files with manifest `056d3af349b05cc7ae59620c23be26e11e91dd1d0c37a8bf2b153362834568cb`; Knowledge must remain 51 files with manifest `0fe85be00846386265718b1f3949d2e8ebcb220f124357ded9d68db5f2814d4b`.

### Task 7: Final verification and one isolated commit

**Files:**
- Create: `ROUTE_V2_PERMANENT_INTENT_INVARIANTS_VALIDATION.md`
- Review: every staged file

- [ ] **Step 1: Run syntax, all new suites, direct regressions, comprehensive verifier, and browser acceptance**

Every command must exit 0 without widened timeouts or weakened assertions.

- [ ] **Step 2: Recheck mutation and asset gates**

Require zero surviving core mutants and exact asset counts/hashes.

- [ ] **Step 3: Inspect unstaged and staged diffs**

Confirm no knowledge, accepted data, cache, screenshots, browser profiles, absolute local paths, unrelated formatting, or feature work.

- [ ] **Step 4: Create the only commit**

Run:

```text
git commit -m "fix(route-v2): enforce permanent route intent invariants"
```

- [ ] **Step 5: Confirm final state**

Branch remains `codex/route-v2-knowledge-entity-layer-p1b-batch02`; working tree, staged, unstaged, and untracked counts are all zero.
