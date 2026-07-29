# Route V2 Prelaunch UX and Performance Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Route Generation V2 through the real local routes page, remove the confirmed route-summary duplication defect, measure search and infinite-feed performance, and produce one auditable prelaunch report and commit.

**Architecture:** Keep Search, Planner, Feed, evidence, and publication architecture unchanged. Add read-only verifiers around the existing Accepted Repository and browser-facing feed contract, make the smallest possible change to `routeFeatureIntroV2()` in `routes.js`, and run the real page with V2 flags enabled against an isolated Ready Pool.

**Tech Stack:** Node.js 24 ES modules, the existing local HTTP server, the in-app browser, Accepted Repository pagination, plain JavaScript verifiers, Markdown reporting, and Git.

---

### Task 1: Lock the baseline and protected fingerprints

**Files:**
- Inspect: `server.js`
- Inspect: `routes.html`
- Inspect: `routes.js`
- Inspect: `.route-v2-cache/accepted-routes.json`
- Inspect: `data/knowledge/**`

- [ ] **Step 1: Confirm branch and clean HEAD**

Run:

```powershell
git status --short --branch
git log -3 --oneline
git show --stat --oneline 288c136
```

Expected: branch `codex/route-v2-knowledge-entity-layer-p1b-batch02`, HEAD `288c136f39258b199401387c11e21227053184e8`, clean worktree.

- [ ] **Step 2: Record protected snapshots**

Record the accepted SHA-256 plus cache and knowledge tree fingerprints using the same sorted path/size/mtime/content algorithm as the Evidence verifiers. Repeat after all tests and require exact equality.

- [ ] **Step 3: Confirm the launch contract**

Run `node server.js` with an unused `PORT`. Verify `/travel-collection/routes.html` is the real route page and `/api/routes/discovery` is its data endpoint.

### Task 2: Add a failing route-summary quality verifier

**Files:**
- Create: `scripts/verify-route-v2-route-summary-quality.mjs`
- Inspect: `src/lib/routes/accepted-repository.mjs`
- Inspect: `routes.js`

- [ ] **Step 1: Load every strict cross-route record**

The verifier must create the real Accepted Repository, consume six records per page with one stable session until `hasMore=false`, and assert exactly 357 unique route IDs with no empty pages.

- [ ] **Step 2: Execute the browser summary function**

Read and evaluate `routeSearchText`, `uniqueList`, `routeDestinations`, and `routeFeatureIntroV2` from `routes.js`, then generate the exact UI introduction for all 357 records.

- [ ] **Step 3: Assert completeness and safety**

Reject empty text, fragments without sentence punctuation, `undefined`, `null`, placeholders, unbalanced punctuation, generic banned slogans, ungrounded season superlatives, and introductions outside 25–80 Chinese characters.

- [ ] **Step 4: Assert route-specific uniqueness**

Require zero exact duplicate groups and require every introduction to mention at least one real route destination or a route-specific origin/destination pair. Report normalized high-similarity groups without failing solely on a shared style phrase.

- [ ] **Step 5: Run the verifier and confirm the current defect**

Run:

```powershell
node scripts/verify-route-v2-route-summary-quality.mjs
```

Expected before the fix: FAIL because the existing 357 routes produce only 16 exact introductions and 354 routes belong to duplicate groups.

### Task 3: Make route introductions complete and route-specific

**Files:**
- Modify: `routes.js`
- Test: `scripts/verify-route-v2-route-summary-quality.mjs`

- [ ] **Step 1: Preserve the existing feature classification**

Keep the existing road, rail, theme, deep-dive, seasonal, city-break, country-hopper, desert, island, pilgrimage, wildlife, and heritage classifications. Do not change Search, Planner, route data, or Feed ordering.

- [ ] **Step 2: Ground every sentence in the route**

Build a compact route anchor from the first destination, last destination, and at most one intermediate destination. Generate one complete sentence in the form “从 A 经 B 到 C，<specific feature>；<pace guidance>。” so routes with the same style remain distinguishable.

- [ ] **Step 3: Keep claims conservative**

Do not say “最佳季节”, “已验证”, “直达”, “轻松慢游”, or another evidence claim. For short high-stop routes, retain the explicit tight-pacing warning.

- [ ] **Step 4: Re-run the quality verifier**

Expected: 357 introductions checked, zero exact duplicate groups, zero invalid or ungrounded introductions.

### Task 4: Add the repeatable prelaunch browser contract verifier

**Files:**
- Create: `scripts/verify-route-v2-prelaunch-browser.mjs`
- Inspect: `routes.html`
- Inspect: `routes.js`
- Inspect: `mobile.css`

- [ ] **Step 1: Verify browser-facing structure**

Assert the real page contains one search input, one feed, one sentinel, desktop/mobile viewport support, and scripts for image assets, bootstrap data, state, and `routes.js`.

- [ ] **Step 2: Verify six-card and terminal contracts**

Assert `BATCH_SIZE = 6`, `IntersectionObserver` uses an early `rootMargin`, terminal state renders “已经到底了”, observer disconnects when `hasMore=false`, and the empty-batch guard cannot request forever.

- [ ] **Step 3: Verify image and summary contracts**

Assert cards are inserted independently of image readiness, fallback image remains available, later image updates do not reinsert cards, and `routeFeatureIntroV2(record)` is the rendered summary.

- [ ] **Step 4: Optionally probe the live local page**

When `ROUTE_V2_PRELAUNCH_BASE_URL` is set, fetch the route page and one Discovery request from localhost only. Reject any non-local base URL and assert HTTP 200 plus a valid six-record page.

### Task 5: Run the real local browser acceptance and performance matrix

**Files:**
- Runtime only: isolated Ready Pool under the OS temporary directory
- Runtime only: screenshots under the OS temporary directory
- Do not commit: browser traces, screenshots, Ready Pool, raw timings

- [ ] **Step 1: Start the enabled server**

Start `node server.js` on an unused port with the five requested V2 flags true, Candidate/Trace/Evidence Bundle flags true where required by the existing chain, online evidence false, runtime image search false, and all storage paths except formal seed directed to temporary isolated directories.

- [ ] **Step 2: Run 13 search cases in the real page**

Type each requested query into `[data-route-search]`, submit it, wait for search loading to settle, and record visible cards, summary text, status text, console errors/warnings, local API statuses, and non-local requests.

- [ ] **Step 3: Validate desktop and mobile summaries**

At desktop and mobile viewport widths inspect the first six cards, five batches/30 cards, fixed Japanese search, February search, and mature fallback. Confirm the two-line clamp preserves the route anchor and no card is blank.

- [ ] **Step 4: Exercise 20 batches and full exhaustion**

Scroll near the sentinel repeatedly, record every route ID and request, then consume to terminal. Require 357 unique routes, no duplicates, no empty loop, final batch 3, `hasMore=false`, terminal text visible, and zero requests after further scrolling.

- [ ] **Step 5: Observe long-list behavior**

At 30, 60, and 120 cards record DOM card count, document height, heap usage when exposed, scroll responsiveness, and whether upward scrolling preserves content. Open one route and return to observe scroll restoration.

- [ ] **Step 6: Measure performance**

Run three cold server starts, five warm route-page loads, ten next-batch loads, and at least eight searches. Calculate min, median, p95, maximum, and the slowest stage for startup, first skeleton/content, six cards, search-first-result, search-stable, next batch, seed/index lookup, Candidate validation/Gate, and image/fallback.

- [ ] **Step 7: Restart and disable flags**

Restart the enabled server and repeat the ready search. Then restart with all V2 flags false and verify legacy Search, Planner, Feed, six-card loading, summaries, and no evidence network requests.

### Task 6: Run regressions and write the prelaunch report

**Files:**
- Create: `ROUTE_V2_PRELAUNCH_UX_PERFORMANCE_VALIDATION.md`
- Test: all directed verifiers listed in the user request

- [ ] **Step 1: Run the directed verifier matrix**

Run Multi-city Intent, Japan Ready Route, Evidence Promotion, Publication Gate, Candidate Evidence Validation, Time Intent, Candidate/Trace stabilization, Search gate, Planner pipeline, Feed exhaustion, six-card infinite scroll, image fallback, City UI, Runtime API, the two new verifiers, `git diff --check`, and `git diff --cached --check`.

- [ ] **Step 2: Recheck protected snapshots**

Require accepted, cache, and knowledge fingerprints to match Task 1. Confirm default flags remain false and no screenshot, timing log, runtime Ready Pool, or browser profile is tracked.

- [ ] **Step 3: Write only measured facts**

Write the requested 17-section report with exact counts, timings, browser URLs, visual findings, console/network observations, fixed defects, follow-ups, and the final PASS/PASS WITH FOLLOW-UPS/FAIL result.

### Task 7: Review and create one commit

**Files:**
- Stage only: `routes.js`, the two new verifiers, the prelaunch report, and this plan when all are in scope

- [ ] **Step 1: Review unstaged scope**

Run `git diff --name-status`, `git diff --stat`, `git diff --check`, and inspect the full diff. Reject accepted/cache/knowledge changes, screenshots, raw logs, Ready Pool files, secrets, or unrelated modules.

- [ ] **Step 2: Stage explicit files and recheck**

Run `git diff --cached --name-status`, `git diff --cached --stat`, `git diff --cached --check`, and inspect the full staged diff.

- [ ] **Step 3: Create exactly one commit**

Because the confirmed duplicate-summary defect requires a code fix, use:

```powershell
git commit -m "fix(route-v2): polish prelaunch feed and route summaries"
```

- [ ] **Step 4: Confirm final state**

Report short/full SHA, parent `288c136`, commit file list, clean worktree, unchanged branch, and no push, PR, deployment, tag, amend, rebase, or squash.
