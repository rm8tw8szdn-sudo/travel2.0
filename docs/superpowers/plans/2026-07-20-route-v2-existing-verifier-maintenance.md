# Route V2 Existing Verifier Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align two stale Route V2 verifier baselines with the product rules that have existed since the repository baseline, without changing six-card infinite scrolling or production behavior.

**Architecture:** Keep the current route dedupe implementation and current single-country UI label unchanged. Correct the online-only verifier's synthetic records so the records intended to survive are genuinely distinct under source, title, and destination-skeleton dedupe rules, and update the UI contract verifier to assert the current product copy.

**Tech Stack:** Node.js ES modules, built-in `assert`, Git history inspection, existing Route V2 verifier scripts.

---

### Task 1: Preserve the investigation evidence

**Files:**
- Inspect: `src/lib/routes/contracts.mjs`
- Inspect: `src/lib/routes/route-dedupe.mjs`
- Inspect: `routes.html`
- Inspect: `scripts/verify-route-v2-online-only.mjs`
- Inspect: `scripts/verify-route-v2-ui-contract.mjs`

- [x] Confirm `normalizeDiscoveredRoutes()` delegates duplicate detection to `isDuplicateRoute()`.
- [x] Confirm current duplicate identity includes normalized source, canonical title, and country/destination skeleton.
- [x] Confirm the current page label is `单国路线` and current Planner/materialization terminology uses the same copy.
- [x] Use `git blame` and `git log -S` to establish that both implementation and stale verifier expectations originated in baseline commit `d0b2fdc`, rather than a later regression.
- [x] Confirm no current production verifier, documentation, or page requires changing the dedupe implementation or restoring `单国城市路线`.

### Task 2: Correct the online-only normalization fixture

**Files:**
- Modify: `scripts/verify-route-v2-online-only.mjs`
- Do not modify: `src/lib/routes/contracts.mjs`
- Do not modify: `src/lib/routes/route-dedupe.mjs`

- [x] Keep the two deliberately duplicate records: one sharing the original identity and one differing only by a source query string.
- [x] Change the two records intended to survive so each has a distinct canonical title and destination skeleton, with destination assets matching its destinations.
- [x] Preserve the expected normalized count of three and add an exact surviving-ID assertion.
- [x] Update the assertion explanation to describe current source/title/destination-skeleton identity rules.
- [x] Run `node scripts/verify-route-v2-online-only.mjs` and confirm it passes.

### Task 3: Correct the stale UI copy contract

**Files:**
- Modify: `scripts/verify-route-v2-ui-contract.mjs`
- Do not modify: `routes.html`

- [x] Change only the expected single-country tab copy from `单国城市路线` to `单国路线`.
- [x] Replace the baseline-era assertion that rejects `route-placeholder` with an assertion for the existing `FALLBACK_ROUTE_COVER`, because retaining text cards with a safe placeholder is the current and baseline product behavior.
- [x] Run `node scripts/verify-route-v2-ui-contract.mjs` and confirm it passes.

### Task 4: Run related regression verification

**Files:**
- Verify: `routes.js`
- Verify: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`
- Verify: `scripts/verify-route-v2-planner-search-ui-visibility.mjs`

- [x] Run the six-card infinite-scroll verifier and confirm the feature remains unchanged.
- [x] Run the Planner search visibility verifier and confirm loading/result visibility remains unchanged.
- [x] Run the existing Route V2 normalization, foundation, UI, and repository-related verifiers that exercise the affected contracts.
- [x] If an unrelated pre-existing verifier fails before reaching the relevant assertion, report it without changing that verifier or production code.
- [x] Run `git diff --check` and confirm no whitespace errors.

### Task 5: Verify scope and leave changes uncommitted

**Files:**
- Modified: `scripts/verify-route-v2-online-only.mjs`
- Modified: `scripts/verify-route-v2-ui-contract.mjs`
- Added: `docs/superpowers/plans/2026-07-20-route-v2-existing-verifier-maintenance.md`

- [x] Confirm `routes.js` and all six-card infinite-scroll implementation files are unchanged.
- [x] Confirm Entity Layer, Planner data structures, knowledge assets, cache, and backend APIs are unchanged.
- [x] Confirm nothing is staged and no commit, push, PR, tag, amend, rebase, or squash operation occurred.
