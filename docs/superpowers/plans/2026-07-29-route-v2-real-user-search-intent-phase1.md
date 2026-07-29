# Route V2 Real User Search Intent Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a permanent real-tourist search matrix and close the highest-risk region, duration, typo, and travel-theme intent gaps without special-casing individual destinations.

**Architecture:** The existing `parseSearchIntent()` remains the only free-text parser. A small region taxonomy derives macro-region membership from published Country entity metadata, while duration and theme normalization stay in the parser. RouteIntent persists the derived allowed-country set for region requests, and the existing invariant gate enforces that set across Planner, Candidate, fallback, cache, and final Search results.

**Tech Stack:** Node.js ESM, built-in `assert`, existing RouteIntent/Planner/Search modules, JSON fixtures, isolated temporary repositories.

---

### Task 1: Establish the real-tourist matrix

**Files:**
- Create: `scripts/fixtures/route-v2-real-user-search-intent-matrix.json`
- Create: `scripts/verify-route-v2-real-user-search-intent-regression.mjs`

- [ ] **Step 1: Add parser-level cases**

Cover macro-regions, Chinese and English duration expressions, bounded typo handling, travel themes, vague destination suggestions, and mixed-language requests. Each case declares the expected normalized region, duration, theme/style, failure reason, or correction target.

- [ ] **Step 2: Add production-path cases**

Construct the published Entity Layer, real Planner, Candidate/Trace/Evidence stores, and Search service in an OS temporary directory. Assert that European requests never return non-European countries, English durations survive to RouteRecord, typo requests do not invoke Planner, and recognized themes remain in the attached RouteIntent.

- [ ] **Step 3: Run the verifier before implementation**

Run:

```text
node scripts/verify-route-v2-real-user-search-intent-regression.mjs
```

Expected: FAIL on missing macro-region recognition, word durations, typo confirmation, and theme preservation.

### Task 2: Add metadata-driven macro-region constraints

**Files:**
- Create: `src/lib/routes/route-search-region-taxonomy.mjs`
- Modify: `src/lib/routes/knowledge-entity-layer-planner-adapter.mjs`
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/route-intent-model.mjs`
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `src/lib/routes/route-destination-suggestion.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Publish region metadata to the intent catalog**

Expose Country `continent`, `region`, and `subregion` fields through the existing Search Intent catalog. Build deterministic entries for Europe, Asia, Southeast Asia, Northern Europe, and the Americas from that metadata.

- [ ] **Step 2: Persist allowed countries in RouteIntent**

For a macro-region request, preserve a canonical region key plus the deterministic set of matching ISO country codes. Direct country and city requests keep their existing exact-country semantics.

- [ ] **Step 3: Enforce region membership**

When a region and its allowed-country set are present, every returned route country must belong to that set. Candidate, accepted, cache, generated fallback, and final response records must all pass the same invariant.

- [ ] **Step 4: Restrict automatic destination suggestion**

Filter the destination suggestion pool by the allowed region countries before stable session ordering. If no locally grounded country remains, return a safe empty result rather than widening the region.

### Task 3: Normalize human duration expressions

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`

- [ ] **Step 1: Add deterministic number normalization**

Support positive Chinese numerals, English number words, `一周`, `一周左右`, `十来天`, `one week`, `a week`, and hyphenated forms such as `10-day trip`.

- [ ] **Step 2: Fail closed on duration-like text**

If text clearly declares a duration but its number cannot be normalized, return `invalid-duration-intent`; do not drop the duration and continue with an unconstrained route.

- [ ] **Step 3: Verify RouteRecord consistency**

Assert the normalized exact day count is present in RouteIntent, Planner context, Candidate, and final RouteRecord.

### Task 4: Add bounded typo confidence and theme preservation

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `routes.js`

- [ ] **Step 1: Tighten ASCII alias matching**

Require word boundaries for Latin aliases so `Italyy` does not silently match `Italy`.

- [ ] **Step 2: Detect high-confidence country typos**

Use a generic adjacent-transposition-aware edit distance over Country aliases. A unique one-edit match returns `destination-confirmation-required` plus a suggested Country; it never auto-selects or calls Planner.

- [ ] **Step 3: Preserve travel themes**

Normalize ring road, self-drive, island holiday, weekend short trip, honeymoon, family, hiking, and city walk into existing RouteIntent soft preferences. Map only themes with existing Planner concepts to a travel style.

- [ ] **Step 4: Surface safe failures**

Show a clear correction-confirmation or unsupported-theme message in the existing empty state instead of an unrelated route.

### Task 5: Wire the permanent release gate and document the audit

**Files:**
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Create: `ROUTE_V2_REAL_USER_SEARCH_INTENT_AUDIT_PHASE1.md`

- [ ] **Step 1: Register the verifier**

Add `verify-route-v2-real-user-search-intent-regression.mjs` as a mandatory static comprehensive-prelaunch stage.

- [ ] **Step 2: Run directed regressions**

Run:

```text
node scripts/verify-route-v2-real-user-search-intent-regression.mjs
node scripts/verify-route-v2-time-intent-boundaries.mjs
node scripts/verify-route-v2-real-world-search-intent-handling.mjs
node scripts/verify-route-v2-real-user-adversarial-hardening.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-route-v2-search-acceptance-gate.mjs
node scripts/verify-route-v2-planner-pipeline.mjs
git diff --check
```

Expected: all commands exit 0; external requests remain 0.

- [ ] **Step 3: Run comprehensive prelaunch**

Run the comprehensive prelaunch verifier in its existing isolated environment and confirm Accepted, Cache, and Knowledge fingerprints are unchanged.

- [ ] **Step 4: Record the audit**

Document supported behavior, P0/P1/P2 baseline failures, their parser/model/planner/entity causes, fixed cases, deferred gaps, and the recommendation for the next Knowledge expansion stage.
