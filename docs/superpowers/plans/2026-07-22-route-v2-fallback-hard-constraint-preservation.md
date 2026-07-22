# Route V2 Fallback Hard Constraint Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every accepted, mature, cached, or legacy fallback route preserves the original structured RouteIntent and fails closed when no route satisfies all hard constraints.

**Architecture:** Add one pure fallback constraint validator shared by every Search fallback boundary. Route Search will retain structured validation results through ranking, revalidate the final merged response, expose a bounded `constraint-conflict` diagnostic, and let the existing page render a non-technical recovery message without creating a second parser.

**Tech Stack:** Node.js ESM, existing Route V2 Search/Planner modules, browser JavaScript, standalone Node verifier scripts.

---

### Task 1: Add the pure fallback constraint validator

**Files:**
- Create: `src/lib/routes/route-fallback-constraint-validator.mjs`
- Modify: `src/lib/routes/route-candidate-evidence-validation.mjs`
- Test: `scripts/verify-route-v2-fallback-constraint-preservation.mjs`

- [ ] **Step 1: Write failing validator cases**

Cover complete required-city matching, fixed relative order, flexible completeness, exact duration, V2-equivalent destination capacity, country/region compatibility, month conflict, season conflict, and evidence-missing time previews.

- [ ] **Step 2: Run the focused verifier and confirm failure**

Run: `node scripts/verify-route-v2-fallback-constraint-preservation.mjs`

Expected: FAIL because `validateFallbackRouteAgainstIntent` is not implemented.

- [ ] **Step 3: Implement one deterministic validator**

Return this stable shape from every call:

```js
{
  matched,
  reasonCodes,
  missingRequiredDestinationIds,
  missingRequiredDestinationNames,
  orderMismatch,
  durationConflict,
  capacityConflict,
  timeConstraintConflict,
  destinationConflict,
  countryConflict,
  regionConflict,
  requiresEvidence,
}
```

Use the candidate evidence validator's exported `maxDestinationsForDuration()` so fallback pacing cannot diverge from V2 pacing.

- [ ] **Step 4: Run the focused validator cases**

Run: `node scripts/verify-route-v2-fallback-constraint-preservation.mjs`

Expected: all pure validation cases PASS.

### Task 2: Put every Search fallback behind the validator

**Files:**
- Modify: `src/lib/routes/route-search-service.mjs`
- Test: `scripts/verify-route-v2-fallback-constraint-preservation.mjs`

- [ ] **Step 1: Add failing service scenarios**

Use mock repositories and planners to prove that a rejected V2 candidate may fall back to a fully matching mature route, but cannot fall back to a route missing a required city, changing fixed order, changing exact duration, exceeding pacing capacity, or conflicting with an explicit month/season.

- [ ] **Step 2: Replace ad-hoc fallback filters**

Apply `validateFallbackRouteAgainstIntent(record, intent)` to structured accepted ranking, structured keyword fallback, cached generated routes, planner records, legacy generated routes, and the final merged response. Keep destination-suggestion enabled while applying its explicit duration/time constraints.

- [ ] **Step 3: Preserve review semantics**

When time metadata is absent, return the matching route as `needs-review`; when time metadata conflicts, reject it. Never write rejected results to Search cache, Review Candidates, Ready Pool, or accepted storage.

- [ ] **Step 4: Emit bounded conflict diagnostics**

When all fallbacks fail, return zero records with `diagnostics.reason="constraint-conflict"`, a unique reason-code list, missing destination IDs, and conflict booleans. Do not retry another fallback cycle.

- [ ] **Step 5: Run the service verifier**

Run: `node scripts/verify-route-v2-fallback-constraint-preservation.mjs`

Expected: the 11 required fallback scenarios PASS with zero accepted writes.

### Task 3: Render honest failure and evidence states

**Files:**
- Modify: `routes.js`
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `scripts/verify-route-v2-prelaunch-browser.mjs`

- [ ] **Step 1: Preserve Search diagnostics in feed state**

Store only the current response's failure reason and reason codes, reset them on refresh/new search, and ignore stale responses through the existing request token and AbortController boundary.

- [ ] **Step 2: Render a constraint-conflict message**

For capacity/destination failures show `条件无法同时满足，请增加天数或减少城市` in both the live summary and accessible empty state. Other empty results retain the existing wording.

- [ ] **Step 3: Keep titles and evidence labels honest**

Collapse adjacent duplicated title tokens such as `经典经典`, and display `证据待验证` for `needs-review` results instead of an unsupported month claim.

- [ ] **Step 4: Add live localhost probes**

Assert zero results and a completed loading state for both impossible one-day Japan inputs and the fixed-order one-day input; assert exact-city completeness for valid seven-day inputs; assert no autumn route for February and a visible evidence-review label where applicable.

### Task 4: Verify, stage precisely, and commit once

**Files:**
- Test: all directly related Route V2 verifier scripts named in the execution contract

- [ ] **Step 1: Run the directed regression matrix**

Run the fallback, multi-city, time intent, destination suggestion, candidate builder/stabilization/validation, publication gate, Ready Pool, Search gate, Planner pipeline, Japan Ready Route, summary quality, prelaunch browser, legacy Search, Feed exhaustion, and six-card infinite scroll verifiers.

- [ ] **Step 2: Verify isolated assets**

Compare Accepted, Cache, and Knowledge manifests with the task-start baseline and confirm external evidence requests remain zero.

- [ ] **Step 3: Stage only fallback files**

Use explicit `git add <file>` paths, then run `git diff --cached --check` and inspect the complete cached diff. Do not stage runtime evidence or the comprehensive prelaunch follow-up files.

- [ ] **Step 4: Create the sole commit**

```bash
git commit -m "fix(route-v2): preserve hard constraints across fallback"
```

- [ ] **Step 5: Restore the isolated prelaunch follow-up**

Apply the external `prelaunch-followup.patch`, verify the three restored file hashes exactly match their pre-split values, and leave them unstaged.
