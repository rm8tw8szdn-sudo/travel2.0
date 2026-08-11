# Route V2 PR #20 Adversarial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every explicit city and country when one search mixes city-level and country-level hard constraints, and make the comprehensive release gate execute the permanent multi-city and multi-country production-path verifiers.

**Architecture:** Keep parsing, RouteIntent normalization, final invariants, fallback validation, and the Oracle unchanged because they already retain and enforce the combined hard-constraint set. Repair only Candidate Builder sequence construction so it supplements explicit cities with the minimum one city per uncovered explicit country, while preserving explicit-city order and fixed country order. Extend existing verifiers instead of adding another fallback or parallel planning path.

**Tech Stack:** Node.js ESM, deterministic Route V2 Candidate Builder, production explicit-constraint harness, Git release-gate scripts.

---

### Task 1: Freeze the mixed explicit city/country regression

**Files:**
- Modify: `scripts/verify-route-v2-multi-country-hard-constraints.mjs`

- [ ] **Step 1: Add production-path success cases for mixed hard constraints**

Add cases for `Berlin Austria 14 days`, `Germany Vienna 14 days`, `Berlin Munich Austria 14 days`, and `Germany Vienna Salzburg 14 days`. For each case, assert the exact explicit city IDs, the explicit country codes, the complete normalized country set, at least one generated record, all required cities in the final route, and exact final country coverage.

```js
const mixedCases = [
  {
    query: "Berlin Austria 14 days",
    requiredCityIds: ["Q64"],
    explicitCountryCodes: ["AT"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    query: "Germany Vienna 14 days",
    requiredCityIds: ["Q1741"],
    explicitCountryCodes: ["DE"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    query: "Berlin Munich Austria 14 days",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    query: "Germany Vienna Salzburg 14 days",
    requiredCityIds: ["Q1741", "Q34713"],
    explicitCountryCodes: ["DE"],
    requiredRouteCountries: ["AT", "DE"],
  },
];
```

- [ ] **Step 2: Add a genuinely infeasible mixed case**

Add `Berlin Austria 1 day` and assert that both hard countries remain present but the response returns zero records with `constraint-conflict`. This prevents the repair from weakening capacity checks.

- [ ] **Step 3: Run the verifier and confirm the new success cases fail before implementation**

Run: `node scripts/verify-route-v2-multi-country-hard-constraints.mjs`

Expected before implementation: FAIL on `Berlin Austria 14 days` because Candidate Builder produces no candidate covering both `DE` and `AT`.

### Task 2: Build one combined hard-constraint candidate path

**Files:**
- Modify: `src/lib/routes/route-candidate-builder.mjs`

- [ ] **Step 1: Select only city-level supplements for uncovered countries**

Create a small helper that derives the countries already covered by explicit cities, finds explicit countries not yet covered, and selects a deterministic city-level destination group for each missing country. Reject the build if any required country has no city-level option.

```js
function isCityLevelDestination(destination = {}) {
  return cleanString(destination.entityTypeName).toLocaleLowerCase("en-US") !== "poi";
}

function uncoveredRequiredCountryGroups(pool, required, countryConstraint, seed) {
  const covered = new Set(required.map((entry) => normalizeCode(entry.countryCode)).filter(Boolean));
  return countryConstraint.codes
    .filter((code) => !covered.has(code))
    .map((code) => ({
      code,
      destinations: stableSortDestinations(
        pool.filter((entry) => isCityLevelDestination(entry) && normalizeCode(entry.countryCode) === code),
        `${seed}:required-city-country:${code}`,
      ),
    }));
}
```

- [ ] **Step 2: Generate exactly three deterministic combined candidates**

When explicit cities and uncovered explicit countries coexist, generate `balanced`, `low-transfer`, and `depth` candidates from the same immutable hard-constraint set. Never remove explicit cities; never add more than one minimum representative per uncovered country; preserve explicit-city order when fixed; group by explicit country order when the country order is fixed.

- [ ] **Step 3: Keep existing pure-city and pure-country behavior unchanged**

Call the combined helper only when `requiredConstraint.ids.length > 0` and at least one `requiredCountryConstraint.code` is not covered by those required destinations. Continue using the existing `requiredCandidateSequences` and `requiredCountryCandidateSequences` paths otherwise.

- [ ] **Step 4: Run the focused verifier**

Run: `node scripts/verify-route-v2-multi-country-hard-constraints.mjs`

Expected: PASS for the original multi-country matrix, the four new mixed success cases, and the mixed one-day conflict.

### Task 3: Close the comprehensive release-gate coverage gap

**Files:**
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Register the existing production hard-constraint verifiers**

Add `scripts/verify-route-v2-multi-city-hard-constraints.mjs` and `scripts/verify-route-v2-multi-country-hard-constraints.mjs` as mandatory static stages immediately after the real-user search-intent regression stage.

- [ ] **Step 2: Require both stages in failure-propagation coverage**

Add `multi-city-hard-constraints` and `multi-country-hard-constraints` to the required stage-name assertions in `verify-route-v2-comprehensive-failure-propagation.mjs` so future removal fails visibly.

- [ ] **Step 3: Verify nonzero child failure still blocks the aggregate**

Run: `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

Expected: PASS with both hard-constraint stage names present and the injected exit code still propagated.

### Task 4: Validate the minimal repair and protected state

**Files:**
- Test: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`
- Test: `scripts/verify-route-v2-multi-country-hard-constraints.mjs`
- Test: `scripts/verify-route-v2-fallback-constraint-preservation.mjs`
- Test: `scripts/verify-route-v2-route-intent-oracle.mjs`
- Test: `scripts/verify-route-v2-intent-mutations.mjs`
- Test: `scripts/verify-route-v2-minimal-candidate-selection.mjs`
- Test: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`

- [ ] **Step 1: Run focused Route Engine regression**

Run the six focused scripts above. Expected: every script exits zero; mutation remains 42/42 killed; no external fetches or Accepted writes occur in the explicit-constraint harnesses.

- [ ] **Step 2: Run the comprehensive gate once**

Run: `node scripts/verify-route-v2-comprehensive-prelaunch.mjs`

Expected: PASS with the multi-city and multi-country stages listed among mandatory verifiers and real assets unchanged.

- [ ] **Step 3: Check syntax and whitespace**

Run `node --check` on every modified `.mjs` file and run `git diff --check`.

Expected: no syntax failures and no whitespace errors.

- [ ] **Step 4: Confirm repository and stash protection**

Confirm the worktree contains only the planned source, verifier, gate, and plan changes; staged remains zero; `stash@{0}` still exists with message `pre-pr19-merge-local-work-2026-08-10`; no formal Cache, Accepted, Evidence, Metrics, or Knowledge asset changed.

---

Plan self-review: the plan reproduces the observed production failure, adds one bounded Candidate path rather than a fallback, preserves infeasible fail-closed behavior, makes existing verifiers mandatory, and covers protected assets. It intentionally excludes Batch 05, UI work, deployment, database work, and unrelated parser expansion.
