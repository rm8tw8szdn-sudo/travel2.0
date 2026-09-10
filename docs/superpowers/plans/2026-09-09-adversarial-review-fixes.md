# Adversarial Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine reproducible security, data-integrity, cancellation, validation, and test-reproducibility gaps found by the repository-wide adversarial review.

**Architecture:** Keep the existing local Node server and browser application, but make every trust boundary fail closed. Isolate public assets through an explicit manifest, centralize safe browser text rendering, make destructive test state explicit, serialize file-backed repository mutations, propagate cancellation, and make optional diagnostics and release fixtures independent from runtime caches.

**Tech Stack:** Node.js 24, CommonJS/ES modules, browser DOM APIs, Node test runner, Playwright 1.63.

---

### Task 1: Restrict static serving to public files

**Files:**
- Modify: `server-security.js`
- Modify: `server.js`
- Modify: `tests/server-security.test.mjs`

- [x] Add a failing test that permits known HTML/assets/data/vendor files and rejects `.git`, `.cache`, `.env`, server modules, tests, scripts, docs, and encoded hidden paths.
- [x] Add `PUBLIC_TOP_LEVEL_FILES`, `PUBLIC_DIRECTORIES`, and `resolvePublicStaticPath(root, urlPath)`; call `safeStaticPath` first, then require an exact public manifest match.
- [x] Switch the HTTP static route to `resolvePublicStaticPath` and verify internal files return 404 while all browser scenarios still load.
- [x] Commit the isolated security fix.

### Task 2: Eliminate stored HTML execution

**Files:**
- Modify: `home-components.js`
- Modify: `travel-state.js`
- Modify: `app-shared.js`
- Create: `tests/browser/state-security.spec.cjs`

- [x] Add a browser test that creates a trip named `<img src=x onerror="window.__auditExecuted=1">`, opens the home page and asserts no marker executes while the literal name is visible.
- [x] Export one shared `escapeHtml` implementation from `TravelState` and use it for dynamic values interpolated by shared modals.
- [x] Use the shared escape function for home component attributes and text originating from state or custom-element attributes.
- [x] Run the browser test before and after the implementation, then commit.

### Task 3: Remove destructive URL reset from production

**Files:**
- Modify: `travel-state.js`
- Modify: `tests/browser/state-security.spec.cjs`

- [x] Add a browser regression proving `?reset=empty` cannot erase an existing trip.
- [x] Delete the query-parameter mutation from `readTravelState`; isolated browser contexts already provide empty test state where needed.
- [x] Verify reload and navigation preserve user data, then commit.

### Task 4: Prevent stale repository writers

**Files:**
- Modify: `src/lib/routes/accepted-repository.mjs`
- Create: `tests/accepted-repository-concurrency.test.mjs`
- Modify: `package.json`

- [x] Add a failing test with two instances writing different fields to the same storage path and asserting both changes survive.
- [x] Track the storage file signature and reload validated records immediately before every mutation when the signature changed.
- [x] Serialize in-process writes per resolved storage path and reject a conflicting stale mutation rather than overwriting unseen data.
- [x] Preserve atomic temporary-file replacement and add cleanup for failed renames.
- [x] Run repository and route regression checks, then commit.

### Task 5: Cancel timed-out refill work

**Files:**
- Modify: `src/lib/routes/route-feed-refill-worker.mjs`
- Modify: `src/lib/routes/repository-warmup-runner.mjs`
- Modify: `scripts/verify-route-feed-refill-worker.mjs`

- [x] Add a failing verifier where warmup observes an abort signal after the deadline and a second schedule reuses the first task until it settles.
- [x] Create an `AbortController` per running refill and pass its signal into warmup, planner, fetch, waits, and provider calls.
- [x] On timeout abort the controller; retain the running-map entry until the underlying promise settles and suppress late writes after cancellation.
- [x] Verify no duplicate same-key work starts, then commit.

### Task 6: Make analytics best-effort

**Files:**
- Modify: `src/lib/routes/route-search-analytics.mjs`
- Create: `tests/route-search-analytics.test.mjs`

- [x] Add a failing test using an unwritable analytics target and assert search still returns its normal result.
- [x] Catch append failures inside the analytics adapter, retain bounded diagnostic metadata, and return a success/failure result without throwing.
- [x] Verify valid JSONL logging still works and commit.

### Task 7: Validate discovery request shapes

**Files:**
- Modify: `src/lib/routes/contracts.mjs`
- Create: `tests/discovery-contracts.test.mjs`

- [x] Add table-driven failures for `null`, arrays, scalar roots, object-valued query/IDs, oversized lists, malformed cursor payloads, and unexpected modes.
- [x] Require a plain-object root and the declared scalar/list field types before normalization; report `INVALID_INPUT` with status 400.
- [x] Keep internal exception messages out of public `RouteDiscoveryError` details.
- [x] Run unit, smoke, and browser API checks, then commit.

### Task 8: Make release verifiers reproducible

**Files:**
- Create: `scripts/lib/verifier-prerequisites.mjs`
- Modify: `scripts/verify-route-v2-malformed-route-intent.mjs`
- Modify: `scripts/verify-route-v2-intent-mutations.mjs`
- Modify: `scripts/verify-route-v2-cache-semantic-integrity.mjs`
- Modify: `scripts/verify-knowledge-semantic-gate.mjs`
- Modify: `DEV_SETUP.md`

- [x] Detect missing ignored `.route-v2-cache` integration artifacts before use and emit structured `BLOCKED` output with restore guidance.
- [x] Detect Git LFS pointer text before JSON parsing and emit named `GIT_LFS_CONTENT_MISSING` output instead of a syntax error.
- [x] Use exit code 2 for missing prerequisites so release automation cannot count a blocked check as PASS.
- [x] Run the affected scripts in the current partial checkout and document how to fetch the optional 1.51 GB corpus, then commit.

### Task 9: Handle malformed city fragments

**Files:**
- Modify: `city-detail.js`
- Modify: `tests/browser/state-security.spec.cjs`

- [x] Add a browser test for `city-oslo.html#%` asserting no page error and a usable fallback city.
- [x] Decode the fragment in a guarded helper that returns the default city ID for malformed or empty input.
- [x] Run all browser widths and commit.

### Task 10: Full validation and PR update

**Files:**
- Modify: `docs/code-review-2026-09-07.md`
- Modify: `docs/browser-acceptance-2026-09-08.md`

- [x] Run `npm.cmd test`, `npm.cmd run test:smoke`, `npm.cmd run test:browser`, the adversarial probes, and `npm.cmd audit`.
- [x] Re-run the previously passing constraint, mutation, semantic, and failure-propagation verifiers; report LFS-dependent results separately.
- [x] Check `git diff --check`, inspect every changed file, update review evidence, push the branch, and update draft PR #30 without merging it.
