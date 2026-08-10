# Route V2 Explicit Multi-Destination Hard Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair explicit multi-city and multi-country hard-constraint preservation without changing Batch 04 Knowledge data, UI behavior, or the formal asset state.

**Architecture:** Preserve every explicitly recognized city and country from the search parser through RouteIntent, candidate construction, planning, fallback, and the final production/Oracle gates. Explicit city sets define the exact destination set; explicit country sets define exact country coverage. Fixed-order syntax adds an ordered invariant, while ordinary separators permit route optimization. Long durations deepen stays and POIs instead of forcing extra destinations.

**Tech Stack:** Node.js ESM, Route V2 search/parser/planner modules, JSON-schema-style runtime validation, repository verifier scripts, Playwright through the in-app Browser skill.

---

### Task 1: Add focused failing multi-city coverage

**Files:**
- Create: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`
- Test: `src/lib/routes/search-intent-parser.mjs`
- Test: `src/lib/routes/route-composition-planner.mjs`
- Test: `src/lib/routes/route-intent-invariant-gate.mjs`

- [ ] Exercise Berlin/Munich, Lisbon/Porto, Athens/Thessaloniki, Rome/Florence, Madrid/Barcelona, and Seoul/Busan with reliable durations.
- [ ] Cover ordinary separators and explicit arrow/order syntax.
- [ ] Assert both cities enter `requiredDestinationIds`, candidates contain exactly those cities, successful results retain both, and fixed-order results preserve order.
- [ ] Run the verifier and record the current failure before applying the production fix.

### Task 2: Repair explicit-city planning without broadening route behavior

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Verify: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`

- [ ] Derive the content-quality minimum from the explicit required-city count when required cities are present.
- [ ] Keep the exact-set invariant active so no required city can be removed and no recommendation-only city can be added.
- [ ] Allow a two-city route at seven or ten days; let itinerary depth absorb extra days rather than requiring a third destination.
- [ ] Confirm candidate variants remain valid and meaningfully distinct without changing the user's required city set.

### Task 3: Add focused failing multi-country coverage

**Files:**
- Create: `scripts/verify-route-v2-multi-country-hard-constraints.mjs`
- Test: `src/lib/routes/search-intent-parser.mjs`
- Test: `src/lib/routes/route-search-service.mjs`
- Test: `src/lib/routes/route-intent-model.mjs`
- Test: `src/lib/routes/route-intent-invariant-gate.mjs`

- [ ] Exercise Germany/Austria, France/Germany, Spain/Portugal, Italy/Austria, France/Spain, and Austria/Germany.
- [ ] Cover ordinary input, `Germany → Austria 14 days`, and `先法国再德国14天`.
- [ ] Assert all explicit country codes reach the hard constraints and fingerprint.
- [ ] Assert candidates, planner output, fallback output, production gate, and independent Oracle require complete country coverage.
- [ ] Run the verifier and record the current single-country failure before applying production changes.

### Task 4: Preserve all explicit countries and fixed country order

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/route-intent-model.mjs`
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify if schema validation requires it: `src/lib/routes/route-intent-schema.mjs`
- Verify: `scripts/verify-route-v2-multi-country-hard-constraints.mjs`

- [ ] Recognize every explicit country in query occurrence order rather than selecting only one catalog entry.
- [ ] Expose `requiredCountryCodes` and a country order mode as hard-constraint inputs.
- [ ] Prevent destination suggestion from rewriting a multi-country request into a single-country context.
- [ ] Include the complete required-country set and order mode in normalized RouteIntent and the stable fingerprint.
- [ ] Make both production gate and independent Oracle reject a missing required country, a multi-country-to-single-country downgrade, and fixed-order reversal.
- [ ] Keep ordinary multi-country order flexible while preserving exact coverage.

### Task 5: Extend mutation and integration safeguards

**Files:**
- Modify: `scripts/verify-route-v2-intent-mutations.mjs`
- Modify only where an existing verifier needs the new normalized fields: relevant RouteIntent/candidate/fallback verifier scripts

- [ ] Add mutations that delete one required city, delete one required country, turn multi-country into single-country, and turn two cities into one.
- [ ] Require every mutation to be killed independently by production and Oracle decisions where applicable.
- [ ] Run RouteIntent model/invariant/oracle, candidate selection, fallback preservation, search acceptance, planner pipeline, Search V1, real-user intent, region/island, and long-trip regressions.

### Task 6: Run Batch 04 and formal-asset regressions

**Files:**
- Verify only: Batch 04 country/entity/runtime/cache/performance/prelaunch scripts

- [ ] Run all five Batch 04 country verifiers and the cumulative Entity Layer verifier.
- [ ] Run Runtime API, Cache Baseline V2, performance, and comprehensive prelaunch checks using their isolated directories.
- [ ] Run `node --check` on every modified or added `.mjs` file and run `git diff --check`.
- [ ] Recompute Accepted, immutable Cache, evidence Cache, Runtime State, and formal Metrics status; confirm Batch 04 data files did not change during this repair.

### Task 7: Perform real-browser acceptance in isolation

**Files:**
- Verify only: local application served with temporary runtime/cache/metrics paths

- [ ] Use the in-app Browser skill and an isolated local server to submit all requested multi-city and multi-country queries.
- [ ] Confirm every explicit city/country is visible, fixed country order is correct, and unconstrained order may be optimized without deleting countries.
- [ ] Confirm constraint conflicts are explicit when no reliable result exists.
- [ ] Confirm browser console errors/warnings and external Evidence/image requests are both zero.

### Task 8: Audit the final worktree without publishing

**Files:**
- Modify: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH04_AUDIT.md`
- Review: all current worktree changes

- [ ] Document the two root causes, fixes, Oracle/mutation results, browser evidence, asset hashes, and remaining Git state.
- [ ] Confirm staged files remain zero, stash remains untouched, and no commit, push, PR, merge, deploy, tag, or branch deletion occurred.
- [ ] Leave all Batch 04 and blocker fixes unstaged for user review.
