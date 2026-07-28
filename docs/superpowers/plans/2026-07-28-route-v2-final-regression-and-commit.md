# Route V2 Final Regression and Commit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the mixed worktree, validate the complete Route V2 user path and fixed assets, and create one or two independently runnable commits without including unrelated artifacts.

**Architecture:** Treat the current runtime, UI, verifier, forensics and Cache Baseline V2 changes as one dependency graph. Establish the exact submission set from diffs and imports before testing, run all tests against isolated writable state, complete localhost-only browser acceptance, then stage only the proven set and rerun the release gates before and after commit.

**Tech Stack:** Node.js ESM, repository verifier scripts, Git, local HTTP preview, in-app browser, deterministic SHA-256 asset manifests.

---

### Task 1: Worktree dependency audit

**Files:**
- Inspect: all 26 modified files reported by `git status --short`
- Inspect: all 22 untracked files reported by `git ls-files --others --exclude-standard`
- Create: `docs/superpowers/plans/2026-07-28-route-v2-final-regression-and-commit.md`

- [ ] **Step 1: Confirm immutable Git context**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git diff --check
git diff --cached --name-only
```

Expected: branch `codex/route-v2-knowledge-entity-layer-p1b-batch02`, HEAD `739a2a8537c8ea63adb693653483d81217ed28dc`, 26 modified, 22 untracked before this plan file, and an empty index.

- [ ] **Step 2: Record every file’s diff and dependency evidence**

Run:

```powershell
git diff --name-status
git diff --stat
git diff --numstat
git ls-files --others --exclude-standard
rg -n "route-v2-runtime-environment|real-world-search-intent|real-user-adversarial|cross-country-citywalk|cache-baseline-v2" .
```

Expected: each runtime/UI change maps to a verifier or browser behavior; each report and plan maps to a completed change; no unknown runtime artifact is accepted by filename alone.

- [ ] **Step 3: Define A–G classification and candidate commit set**

The submission set must include only:

```text
A runtime/UI code required by the tested user path
B permanent verifiers and fixtures
C reports, manifests and implementation plans
D older Citywalk/runtime-environment/image/UI changes that current A/B tests actually import or exercise
```

Expected: E/F/G remain unstaged; if any file cannot be classified from diff, call graph or history, stop before staging.

### Task 2: Static and isolated automated regression

**Files:**
- Test: all changed/new `.js` and `.mjs`
- Test: `scripts/verify-route-v2-*.mjs`
- Test: `scripts/verify-search-v1.mjs`
- Test: Entity Layer and City UI verifier scripts

- [ ] **Step 1: Syntax-check every changed/new JavaScript module**

Run a generated list from Git status and execute:

```powershell
node --check <each changed or untracked .js/.mjs file>
```

Expected: every command exits 0.

- [ ] **Step 2: Run RouteIntent and constraint integrity**

Run:

```powershell
node scripts/verify-route-v2-route-intent-model.mjs
node scripts/verify-route-v2-route-intent-oracle.mjs
node scripts/verify-route-v2-intent-boundaries.mjs
node scripts/verify-route-v2-time-intent-boundaries.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-route-v2-search-acceptance-gate.mjs
node scripts/verify-route-v2-publication-gate.mjs
node scripts/verify-route-v2-candidate-selection-stabilization.mjs
node scripts/verify-route-v2-minimal-candidate-selection.mjs
node scripts/verify-route-v2-intent-generative.mjs
node scripts/verify-route-v2-intent-mutations.mjs
```

Expected: all model, corpus, property, fuzz, metamorphic, differential, mutation and shadow assertions pass.

- [ ] **Step 3: Run Search and Planner regression**

Run:

```powershell
node scripts/verify-route-v2-real-world-search-intent-handling.mjs
node scripts/verify-search-v1.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-foundation.mjs
node scripts/verify-planner-route-coherence.mjs
node scripts/verify-route-v2-multi-city-intent.mjs
node scripts/verify-route-v2-japan-multi-city-ready-route.mjs
node scripts/verify-route-v2-cross-country-citywalk.mjs
node scripts/verify-route-v2-real-user-adversarial-hardening.mjs
```

Expected: the required Japanese queries, candidate isolation, fixed/flexible order, single/cross classification, hot cache and conflict cases pass.

- [ ] **Step 4: Run Feed, images, UI and Entity Layer regression**

Run:

```powershell
node scripts/verify-route-v2-route-summary-quality.mjs
node scripts/verify-route-v2-six-card-infinite-scroll.mjs
node scripts/verify-route-v2-feed-exhaustion.mjs
node scripts/verify-route-v2-image-assets-pilot.mjs
node scripts/verify-route-v2-image-proxy-network-boundary.mjs
node scripts/verify-route-v2-planner-search-ui-visibility.mjs
node scripts/verify-route-v2-default-runtime-user-paths.mjs
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch02.mjs
```

Expected: 851 summary checks, six-card behavior, exhaustion, image fallback/network boundary, City UI and Entity Layer all pass.

- [ ] **Step 5: Run baseline, tooling, performance and comprehensive gates**

Run:

```powershell
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-route-v2-tooling-cleanup.mjs
node scripts/verify-route-v2-intent-performance.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
git diff --check
```

Expected: Cache Baseline V2, tooling, 10-round performance, browser probe and comprehensive prelaunch all pass with real assets unchanged.

### Task 3: Real browser acceptance

**Files:**
- Read: `server.js`
- Read: `routes.html`
- Read: `routes.js`
- Read: `route-detail.html`
- Read: `route-detail.js`

- [ ] **Step 1: Snapshot formal assets and start isolated local preview**

Run `node server.js` on an unused localhost port with Accepted/Search/Candidate/Trace/Evidence/image writable paths redirected to a new OS temporary directory.

Expected: the real Accepted, `.route-v2-cache` and Knowledge trees remain byte-identical.

- [ ] **Step 2: Exercise all requested searches**

Use the in-app browser to search:

```text
日本7天
2月去日本7天
February Japan 7 days
东京→京都→大阪7天
先布达佩斯再维也纳最后布拉格
东京京都大阪奈良1天
Amsterdam Paris 5 days
Rome Florence 4 days
冬天去日本7天
```

Repeat identical and equivalent month queries, clear the input, and return to Feed.

Expected: constraints, classification, conflict states, candidate isolation and hot replay match the product rules; no parser/Search hardcoding for the unresolved pure-English Vienna/Budapest aliases.

- [ ] **Step 3: Exercise Feed and navigation**

Verify 6 → 12 → 18 → 24 cards, unique IDs, Detail, Back, Forward, refresh and direct URL at 1280×800, 390×844 and 360×800.

Expected: no duplicate/missing/blank card, no horizontal overflow, and query/result state persists.

- [ ] **Step 4: Inspect browser network and console**

Expected: console errors 0, warnings 0, external image/evidence requests 0, local fallback images work, and no internal Candidate/Trace/Evidence/provenance field is rendered.

### Task 4: Submission scope and staging

**Files:**
- Stage: only classified A/B/C and required D files
- Do not stage: classified E/F/G files

- [ ] **Step 1: Reconfirm assets and unstaged scope**

Run:

```powershell
node scripts/audit-route-v2-cache-baseline-v2.mjs
git status --short
git diff --name-status
git diff --check
```

Expected: Accepted hash, 331 Cache files/bytes, immutable hash, 329 Runtime State entries and 51 Knowledge files remain unchanged.

- [ ] **Step 2: Stage explicit files or hunks**

Run explicit `git add <path>` commands and `git add -p <mixed-path>` only where a file contains separable E/F/G content.

Expected: no use of `git add .`; E/F/G remain unstaged.

- [ ] **Step 3: Review the complete staged patch**

Run:

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Expected: no formal asset, absolute local path, temporary directory, browser profile, screenshot, trace, cache, log or unrelated feature.

- [ ] **Step 4: Rerun the decisive gates against the staged state**

Run:

```powershell
node scripts/verify-route-v2-route-intent-model.mjs
node scripts/verify-route-v2-real-world-search-intent-handling.mjs
node scripts/verify-route-v2-intent-performance.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
```

Expected: all exit 0.

### Task 5: Commit and post-commit verification

**Files:**
- Commit: the reviewed staged set

- [ ] **Step 1: Choose one or two commits from the proven dependency graph**

Use one commit if runtime/search/UI and Cache validation cannot be separated without an untested intermediate state:

```text
fix(route-v2): harden real-world search and cache validation
```

Use two commits only when each staged group independently passes its applicable tests:

```text
fix(route-v2): harden real-world search intent handling
test(route-v2): establish cache baseline v2 validation
```

- [ ] **Step 2: Create only the selected commit or commits**

Run `git commit -m <exact-message>` without amend, rebase or squash.

Expected: parent of the first new commit is `739a2a8537c8ea63adb693653483d81217ed28dc`.

- [ ] **Step 3: Rerun post-commit gates**

Run:

```powershell
node scripts/verify-route-v2-route-intent-model.mjs
node scripts/verify-route-v2-real-world-search-intent-handling.mjs
node scripts/verify-route-v2-intent-performance.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
git status --short --branch
```

Expected: all verifiers pass; only deliberately excluded E/F/G files remain, if any; no push, PR, tag or deployment occurs.
