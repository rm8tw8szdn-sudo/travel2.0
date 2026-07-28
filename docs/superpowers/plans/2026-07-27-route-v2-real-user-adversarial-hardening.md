# Route V2 Real User Adversarial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Route V2 through realistic browser journeys and adversarial inputs, then fix every reproducible defect without weakening route constraints or publishing unverified routes.

**Architecture:** Exercise the existing `routes.html` search and feed UI against the local `server.js` runtime, then encode every reproducible defect in one focused verifier before changing implementation. Fixes must reuse the existing SearchIntent → Candidate → RouteRecord → DecisionTrace → EvidenceBundle chain and preserve the accepted-repository, six-card feed, image fallback, and feature-flag boundaries.

**Tech Stack:** Node.js ES modules, the existing Route V2 repository and verifier conventions, browser-driven local acceptance testing, vanilla JavaScript UI.

---

### Task 1: Capture the real user journey

**Files:**
- Inspect: `routes.html`
- Inspect: `routes.js`
- Inspect: `route-detail.html`
- Inspect: `route-detail.js`

- [ ] **Step 1: Start the local server with isolated Route V2 sidecars**

Run `node server.js` on port `4174` with Candidate, Trace, Evidence, search cache, review candidates, analytics, and accepted routes redirected to a temporary directory.

Expected: the server reports 50 countries, 25 cities, and 75 POIs without writing to the repository cache.

- [ ] **Step 2: Exercise a normal browsing journey**

Open `routes.html`, verify the first six cards, switch between cross-country and single-country lists, scroll for the next six cards, open a detail page, return to the list, favorite a route, and add a route to the itinerary.

Expected: visible state changes complete without duplicate cards, blank cards, stuck loading text, console errors, or loss of the current search.

- [ ] **Step 3: Exercise representative searches**

Run these exact searches:

```text
阿姆斯特丹 巴黎 5天
罗马 佛罗伦萨 4天
首尔 东京 6天
巴黎 4天
巴黎 120天
东京 京都 大阪 奈良 1天
```

Expected: cross-country and single-country labels are correct, Paris long stays use the stable Citywalk reference, and the impossible one-day request returns a constraint conflict.

- [ ] **Step 4: Exercise adversarial inputs**

Run these exact searches:

```text


2
2月
13月
巴黎 0天
巴黎 -1天
巴黎 999999999999999999999天
巴黎 巴黎 4天
东京 京 4天
Paris, Berlin 6 days
阿姆斯特丹/巴黎/柏林 1天
```

Expected: the page never crashes, invalid constraints never become successful routes, duplicate destinations are deduplicated, short aliases do not create phantom cities, and all loading states finish.

### Task 2: Encode adversarial invariants

**Files:**
- Create: `scripts/verify-route-v2-real-user-adversarial-hardening.mjs`
- Modify if required: `scripts/verify-route-v2-cross-country-citywalk.mjs`

- [ ] **Step 1: Add parser assertions**

The verifier must assert:

```js
assert.deepEqual(parse("巴黎 巴黎 4天").requiredDestinationIds, ["Q90"]);
assert.deepEqual(parse("东京 京 4天").requiredDestinationIds, ["Q1490"]);
assert.equal(parse("巴黎 0天").timeIntent.type, "invalid");
assert.equal(parse("巴黎 999999999999999999999天").diagnostics.includes("invalid-duration"), true);
```

- [ ] **Step 2: Add end-to-end Search assertions**

For every successful request, assert exactly three Candidates, exactly one selected Candidate, selected order equals RouteRecord order, Trace and Evidence references match, and accepted routes remain empty.

- [ ] **Step 3: Add UI source assertions**

Assert the route page always ends search loading, Citywalk shows `不限天数`, invalid input shows an explicit diagnostic, and no internal evidence, provenance, or review payload is rendered.

- [ ] **Step 4: Run the verifier before implementation**

Run:

```powershell
node scripts/verify-route-v2-real-user-adversarial-hardening.mjs
```

Expected: each browser-reproduced defect fails with a focused assertion.

### Task 3: Apply minimal fixes

**Files:**
- Modify only when a failing assertion requires it: `src/lib/routes/search-intent-parser.mjs`
- Modify only when a failing assertion requires it: `src/lib/routes/route-search-service.mjs`
- Modify only when a failing assertion requires it: `src/lib/routes/route-composition-planner.mjs`
- Modify only when a failing assertion requires it: `routes.js`
- Modify only when a failing assertion requires it: `route-detail.js`

- [ ] **Step 1: Fix normalization defects at the single RouteIntent parser**

Keep destination, duration, and time parsing centralized. Invalid explicit durations must produce a diagnostic and must not be silently removed or converted into destination-suggestion mode.

- [ ] **Step 2: Fix Search fallback defects**

Every fallback result must continue to pass the existing invariant gate. No fallback may remove a required destination, change fixed order, loosen duration, or claim verified time suitability.

- [ ] **Step 3: Fix UI completion defects**

Every success, conflict, invalid-input, timeout, and empty-result branch must end search loading while preserving already-rendered cards.

- [ ] **Step 4: Preserve publishing boundaries**

All generated routes remain `needs-review` and `v2-not-publishable-yet`; accepted routes, Feed data, Knowledge assets, and cache remain unchanged.

### Task 4: Run regression and repeat browser acceptance

**Files:**
- Verify: `scripts/verify-route-v2-real-user-adversarial-hardening.mjs`
- Verify: `scripts/verify-route-v2-cross-country-citywalk.mjs`

- [ ] **Step 1: Run the focused matrix**

Run:

```powershell
node scripts/verify-route-v2-real-user-adversarial-hardening.mjs
node scripts/verify-route-v2-cross-country-citywalk.mjs
node scripts/verify-route-v2-time-intent-boundaries.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-search-acceptance-gate.mjs
node scripts/verify-route-v2-six-card-infinite-scroll.mjs
node scripts/verify-route-v2-image-assets-pilot.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
git diff --check
git diff --cached --check
```

Expected: every command exits 0.

- [ ] **Step 2: Repeat the browser journey**

Repeat the normal and adversarial searches, route-type switching, detail navigation, favorite, add-to-itinerary, and multi-batch scroll.

Expected: no lost or duplicate cards, no stuck loading state, no console errors, and no incorrect success route.

- [ ] **Step 3: Verify side-effect boundaries**

Compare repository status plus cache file count and total bytes with the pre-test baseline.

Expected: no Knowledge or accepted-route data change, repository cache remains unchanged, all runtime test records remain in the temporary directory, and staged files remain zero.
