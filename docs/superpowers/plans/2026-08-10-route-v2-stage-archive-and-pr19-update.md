# Route V2 Stage Archive and PR #19 Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify, verify, commit, push, and document the completed Route V2 safeguards and Knowledge Expansion Batch 01/02/03 without changing product behavior or formal runtime assets.

**Architecture:** Preserve the two real dependency units found in the mixed worktree. The first commit contains the production Search/RouteIntent/Planner/UI safeguard chain and its permanent regressions; the second contains the cumulative Knowledge assets because all three batches share one published-asset index, one cumulative Evidence seed manifest, and cumulative verifiers.

**Tech Stack:** Node.js ESM/CommonJS browser scripts, JSON/JSONL Knowledge assets, Git, GitHub CLI, in-app browser.

---

### Task 1: Freeze the classification and asset baselines

**Files:**
- Inspect: all modified and untracked paths reported by `git status --short --branch`
- Inspect: formal Accepted, Cache, Runtime State, Knowledge, Evidence seed, and Metrics locations

- [ ] **Step 1: Record branch, HEAD, staged state, and complete modified/untracked lists**

Run `git status --short --branch`, `git diff --name-status`, `git diff --stat`, and `git ls-files --others --exclude-standard`.

- [ ] **Step 2: Classify each path and mixed hunk**

Assign every path to PR #19 safeguards, Region/Island, Detail/UI, Batch 01, Batch 02, Batch 03, supporting verification/docs, or unowned content. Stop before staging if any unowned content remains.

- [ ] **Step 3: Record formal asset fingerprints**

Read and hash the external formal Accepted/Cache/Knowledge trees. Do not point tests at those writable locations.

### Task 2: Run the complete pre-commit verification matrix

**Files:**
- Test: `scripts/verify-route-v2-pr19-p1-closures.mjs`
- Test: all Production Readiness, SearchIntent, Region, Detail, long-trip, Search, Planner, fallback, RouteIntent, Knowledge, Evidence, UI, Feed, image, Cache, performance, and comprehensive verifiers requested for this archive

- [ ] **Step 1: Run focused engine and UI verifiers**

Require zero non-zero exits from the requested PR #19, Region/Island, generated-detail, long-trip, Search, Planner, fallback, RouteIntent, feed, image, and City UI checks.

- [ ] **Step 2: Run Knowledge and Evidence verifiers**

Require Batch 01, Batch 02, all four Batch 03 countries, cumulative Entity Layer, Runtime API, Planner integration, Evidence promotion, and Candidate Evidence Validation to pass.

- [ ] **Step 3: Run release gates and static checks**

Require Cache Baseline V2, performance, comprehensive prelaunch, every changed JavaScript file's `node --check`, and `git diff --check` to pass.

### Task 3: Complete real-browser acceptance

**Files:**
- Exercise: `routes.html`
- Exercise: `route-detail.html`

- [ ] **Step 1: Test the requested country and region queries**

Exercise Japan 7/14/21/30 days, Italy 14/30 days, France 14 days, Spain 14 days, Andalusia road trip, Mallorca island vacation, South Korea 14 days, and Seoul-Gyeongju-Busan 10 days.

- [ ] **Step 2: Verify feed, detail, and history behavior**

Observe Feed 6→12→18→24, wait at least five seconds on generated details, and verify Back, Forward, and in-page return restore query, classification, loaded-card count, and scroll state.

- [ ] **Step 3: Verify browser safety signals**

Require zero console errors/warnings and zero external Evidence or image requests.

### Task 4: Commit the cumulative Knowledge dependency unit

**Files:**
- Stage: Batch 01/02/03 Country, City, POI, raw, selection, provenance, conflicts, review, Evidence seed, importers, published index, verifiers, audits, dashboards, and matching plans

- [ ] **Step 1: Stage only the complete Knowledge dependency set**

Use explicit pathspecs. Confirm the staged diff contains no Search/Planner/UI safeguard code.

- [ ] **Step 2: Check and commit**

Run cached name/status/stat/check and create `feat(route-v2): expand priority destination knowledge`.

### Task 5: Commit production safeguards

**Files:**
- Stage: SearchIntent, trip capacity, Region/Island, Planner/fallback/final gate, image safety, route list navigation, generated-detail controller, permanent regressions, and matching plans

- [ ] **Step 1: Stage the remaining owned safeguard paths**

Confirm no runtime files, formal cache files, browser profiles, temporary data, or secrets are staged.

- [ ] **Step 2: Check and commit**

Run cached name/status/stat/check and create `fix(route-v2): finalize production search and detail safeguards`.

### Task 6: Post-commit verification and PR update

**Files:**
- Update: existing GitHub PR #19 description only

- [ ] **Step 1: Re-run critical post-commit gates**

Require Region/Island, generated detail, Batch 01/02/03, Cache Baseline V2, comprehensive prelaunch, and `git diff --check` to pass.

- [ ] **Step 2: Verify formal assets again**

Compare Accepted, Immutable Cache, Runtime State, formal Knowledge, Evidence seed, and Metrics with Task 1.

- [ ] **Step 3: Push and update PR #19**

Use a normal push on the existing branch, then update PR #19 with the safeguards, long-trip behavior, three Knowledge batches, coverage totals, and validation results. Do not merge, deploy, tag, release, amend, rebase, squash, or force-push.
