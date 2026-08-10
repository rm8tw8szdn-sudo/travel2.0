# Route V2 Region Constraints And Detail Stability Implementation Plan

> **For agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve explicit region/island destinations through Search, Planner, fallback, and final validation, and keep generated-route detail pages stable after a successful render.

**Architecture:** Extend the existing region taxonomy with stable subnational/island definitions instead of introducing a second parser. Keep the normalized RouteIntent as the authority: its stable region identifier and allowed country set drive destination suggestion and the final invariant gate. For details, retain one request per navigation and add an explicit load generation/abort lifecycle so only the current successful response may change the visible state.

**Tech Stack:** Node.js ESM, existing Route V2 Search/Planner modules, browser JavaScript, existing discovery API, Node verifier scripts, in-app browser.

---

### Task 1: Add failing region/island constraint coverage

**Files:**
- Create: `scripts/verify-route-v2-region-island-constraints.mjs`
- Modify: `scripts/verify-route-v2-real-user-search-intent-regression.mjs`

**Step 1: Write the failing parser and fingerprint assertions**

Cover Andalusia, Mallorca, Tenerife, Provence, Lake Como, Dolomites, and Jeju. Assert stable region identity, parent/allowed country, and distinct fingerprints.

**Step 2: Write the failing production Search assertions**

Assert explicit regions never return another country, unsupported region/theme combinations return a structured empty/conflict result, and generic `island vacation` remains a global suggestion.

**Step 3: Run the focused verifier and confirm the intended failures**

Run: `node scripts/verify-route-v2-region-island-constraints.mjs`

Expected: FAIL on missing stable region identity and/or cross-region result acceptance.

### Task 2: Carry region/island constraints through the normalized intent

**Files:**
- Modify: `src/lib/routes/route-search-region-taxonomy.mjs`
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/route-destination-suggestion.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`

**Step 1: Extend the existing taxonomy**

Add data-driven subnational/island entries with stable identifier, parent country, allowed country codes, scope, and known published city identifiers. Regions without a supported City representation remain explicit but unsupported.

**Step 2: Normalize the parsed intent**

Set the stable region identity and allowed country set without converting the region/island into a City. Preserve the user-facing label separately.

**Step 3: Restrict destination suggestion**

Treat an explicit region as region-scoped even when its parent country is known. Filter the country pool to the region's known published cities; return a structured empty reason if the region has no supported city pool.

**Step 4: Run focused parser and suggestion tests**

Run: `node scripts/verify-route-v2-region-island-constraints.mjs`

Expected: parser/suggestion checks PASS; final-gate checks may still fail until Task 3.

### Task 3: Enforce region membership in every result path

**Files:**
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `scripts/verify-route-v2-fallback-constraint-preservation.mjs`
- Modify: `scripts/verify-route-v2-region-island-constraints.mjs`

**Step 1: Add region membership validation**

For macro regions, retain the existing allowed-country rule. For subnational/island regions, require every route city to belong to the trusted known-city set and reject unsupported regions explicitly.

**Step 2: Exercise accepted, generated, cache, and fallback records**

Assert that copied theme labels, accepted fallback, and generated fallback cannot bypass the same region rule.

**Step 3: Run the complete focused region verifier**

Run: `node scripts/verify-route-v2-region-island-constraints.mjs`

Expected: PASS with no country/region escape and no regression for generic themes.

### Task 4: Reproduce and fix generated-detail late 404

**Files:**
- Modify: `route-detail.js`
- Modify: `scripts/verify-route-detail-v2.mjs`
- Create: `scripts/verify-route-v2-generated-detail-stability.mjs`

**Step 1: Capture the failing browser lifecycle**

Record discovery requests, visible detail states, and console output for generated Italy/France/Spain/South Korea routes over at least five seconds.

**Step 2: Write the failing browser regression**

Assert one authoritative detail request/render per navigation, stable ready content after five seconds, and correct refresh/Back/Forward behavior.

**Step 3: Implement request generation and abort ownership**

Abort the previous detail request before retrying, ignore stale completion, and ensure only the active request may render ready/not-found/error. Cancel its watchdog after any terminal response and invalidate destination hydration from older records.

**Step 4: Run the detail verifier**

Run: `node scripts/verify-route-v2-generated-detail-stability.mjs`

Expected: PASS with no late 404, duplicate render, or console error/warning.

### Task 5: Verify Italy depth and full regressions

**Files:**
- Modify: `scripts/prelaunch-verifier-gate.mjs` only if the permanent verifiers are not already discovered by the existing mandatory gate.

**Step 1: Verify Italy 21/30-day depth**

Record city and POI identities, confirm 30-day POIs exceed 21-day POIs, no duplicates are used to pad duration, and the capacity/coverage message is accurate.

**Step 2: Run automated regression matrix**

Run the region/island verifier, Search Intent matrix, fallback preservation, RouteIntent model/invariant/oracle, Search acceptance gate, Planner pipeline, Search V1, generated detail, Batch 01/02/03, Runtime API, Cache Baseline V2, comprehensive prelaunch, `node --check` for modified JS/MJS, and `git diff --check`.

Expected: all PASS; any unrelated pre-existing failure is reported without changing its implementation.

**Step 3: Run real browser matrix**

Test the requested region and country queries, enter every generated detail, wait at least five seconds, and verify refresh/Back/Forward/return state with zero console errors/warnings and zero external Evidence/image requests.

### Task 6: Prove asset isolation and stop

**Files:**
- Modify: none

**Step 1: Compare formal asset fingerprints**

Confirm Accepted, Immutable Cache, formal Cache/Runtime State, and the 51-file formal Knowledge baseline are byte-identical before and after tests; verify Metrics was not created.

**Step 2: Review the final working tree**

Run status, name-status, stats, staged status, and diff checks. Confirm Batch data remains only as pre-existing working-tree changes and staged remains zero.

**Step 3: Stop without Git publication actions**

Do not stage, commit, push, update/create a PR, tag, or deploy.
