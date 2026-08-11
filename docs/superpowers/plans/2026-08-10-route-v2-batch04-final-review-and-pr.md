# Route V2 Batch 04 Final Review and PR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently review, fully verify, browser-accept, archive, commit, push, and open the Batch 04 pull request without changing Knowledge scope or formal assets.

**Architecture:** Treat the existing unstaged worktree as two logical units: additive Batch 04 Knowledge/Evidence and explicit multi-city/multi-country Route Engine constraint preservation. Review the actual diff first, run all tests against isolated writable state, and publish only if no P0/P1, browser failure, regression failure, or protected-asset drift remains.

**Tech Stack:** Git, Node.js ESM verifiers, local `server.js`, in-app browser automation, GitHub CLI/app.

---

### Task 1: Establish the immutable baseline and review scope

**Files:**
- Inspect: all tracked and untracked files reported by Git
- Inspect: `.route-v2-cache/accepted-routes.json`
- Inspect: `.route-v2-cache/route-evidence.json`
- Inspect: `route-v2-cache-manifest-v2.json`

- [ ] **Step 1: Confirm branch, commit, ahead/behind, staging, stash, remotes and GitHub authentication**

Run `git status -sb`, `git rev-parse HEAD main origin/main`, `git rev-list --left-right --count main...origin/main`, `git stash list`, `git remote -v`, `gh --version`, and `gh auth status`.

Expected: branch `codex/route-v2-knowledge-expansion-batch04`, all three revisions `17e28bba6eac61391ad04ba53cd6423d86387456`, ahead/behind `0/0`, staged files `0`, retained stash message `pre-pr19-merge-local-work-2026-08-10`, and authenticated GitHub access.

- [ ] **Step 2: Snapshot protected assets and Batch 04 data**

Record SHA-256, file counts and byte totals for Accepted, immutable Cache, formal Evidence, full Cache, Runtime State and the 14 Batch 04 City/POI/seed/Evidence assets.

Expected: Accepted `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, immutable aggregate `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, Evidence `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, Cache `331` files, Runtime State `329` files, and no formal Metrics.

- [ ] **Step 3: Review every actual diff by responsibility**

Inspect Knowledge data/schema/registry/importer/verifier/report changes separately from SearchIntent, RouteIntent, Candidate, Planner, fallback, invariant, Oracle and permanent-test changes. Verify no Batch 05, UI/P2, guessed QID, region-as-City, broad fallback, hidden constraint deletion, or unrelated file is present.

Expected: no P0/P1 and a complete explicit commit manifest.

### Task 2: Verify explicit destination hard constraints

**Files:**
- Test: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`
- Test: `scripts/verify-route-v2-multi-country-hard-constraints.mjs`
- Test: `scripts/verify-route-v2-route-intent-model.mjs`
- Test: `scripts/verify-route-v2-route-intent-oracle.mjs`
- Test: `scripts/verify-route-v2-intent-mutations.mjs`
- Test: `scripts/verify-route-v2-fallback-constraint-preservation.mjs`

- [ ] **Step 1: Run focused city and country verifiers**

Run the two hard-constraint verifiers and confirm ordinary, arrow-fixed and Chinese fixed-order samples preserve exact required sets and reject `Germany Austria 1 day`.

Expected: PASS with no external fetch or Accepted write.

- [ ] **Step 2: Run composition regressions**

Run RouteIntent model/invariant/Oracle, mutations, Real User Search Intent, Candidate selection, fallback preservation, Search acceptance, Planner pipeline, Search V1, Region/Island, explicit-theme trust, long-trip capacity and Production Readiness Phase 1/2.

Expected: every verifier PASS; all required-city/country mutants killed.

### Task 3: Verify Batch 04 Knowledge and runtime consumption

**Files:**
- Test: `scripts/verify-knowledge-expansion-batch04-country.mjs`
- Test: cumulative Entity Layer, Runtime API, Planner Entity integration, Evidence promotion and Candidate Evidence Validation verifiers

- [ ] **Step 1: Run all five country verifiers**

Expected: Germany `12/91`, Austria `8/55`, Portugal `10/69`, Greece `9/66`, Netherlands `10/67`; duplicate IDs/QIDs, orphans and invalid parents `0`; isolated Region/Island candidates unpublished.

- [ ] **Step 2: Run cumulative and evidence verifiers**

Expected: `51` Countries, `144` Cities, `904` POIs, `1,099` entities; directed official Evidence and objective Month Risk schemas pass; Runtime and Planner consume published assets.

### Task 4: Run UI, cache, performance and comprehensive regression

**Files:**
- Test: City Detail UI, six-card feed, image fallback, Cache Baseline V2, performance and comprehensive prelaunch verifiers

- [ ] **Step 1: Run UI and feed verifiers**

Expected: PASS with no UI/P2 source changes.

- [ ] **Step 2: Run Cache Baseline V2, performance and comprehensive prelaunch**

Expected: all stages PASS against isolated paths, Cache baseline unchanged, and no formal write.

- [ ] **Step 3: Check syntax and whitespace**

Run `node --check` for every changed/untracked `.js` and `.mjs`, then `git diff --check`.

Expected: PASS.

### Task 5: Perform real-user browser acceptance

**Files:**
- Exercise: `travel-collection/routes.html` through isolated `server.js`

- [ ] **Step 1: Start an isolated local server**

Redirect Accepted, Search, Candidate, Trace, Evidence, Metrics and image paths to a new `%TEMP%` root; disable online Evidence, runtime image search and auto-accept.

Expected: localhost page responds and formal assets remain untouched.

- [ ] **Step 2: Run the Knowledge and hard-constraint search matrix**

Exercise Germany 7/14/21, Austria/Portugal/Greece/Netherlands 7/14, the two requested three-City searches, Germany-Austria and Spain-Portugal, all required multi-city/multi-country/fixed-order samples, and the one-day conflict.

Expected: new City/POI data is visibly consumed, longer trips add unique breadth/depth, exact sets/orders hold, and impossible constraints fail closed.

- [ ] **Step 3: Hold details for at least five seconds and inspect diagnostics**

Expected: stable detail content, Console errors/warnings `0`, external Evidence/image requests `0`, local image URLs only.

- [ ] **Step 4: Close the browser tab and stop the exact local server process**

Expected: test port released.

### Task 6: Recheck boundaries and create logical commits

**Files:**
- Stage: only files proven by Tasks 1-5

- [ ] **Step 1: Compare all protected snapshots**

Expected: every protected hash/count and every Batch 04 data snapshot is unchanged; stash is unchanged; formal Metrics absent.

- [ ] **Step 2: Determine whether two commits are independently runnable**

Prefer Knowledge commit `feat(route-v2): expand germany austria portugal greece netherlands knowledge` followed by constraint commit `fix(route-v2): preserve explicit multi-city and multi-country constraints`. Use one integrated commit only if a shared runtime or report file makes either intermediate commit false or non-runnable, and record the reason.

- [ ] **Step 3: Stage explicit paths and commit without amend/rebase/squash**

Expected: intended files only, both commits created when independently runnable, and stash untouched.

### Task 7: Push and open the Batch 04 PR

**Files:**
- Publish: current branch only

- [ ] **Step 1: Push normally with upstream tracking**

Run `git push -u origin codex/route-v2-knowledge-expansion-batch04`.

Expected: ordinary non-force push succeeds.

- [ ] **Step 2: Open a ready-for-review PR to `main`**

Use title `feat(route-v2): complete knowledge expansion batch 04` and describe Knowledge expansion, Route Engine root causes/fixes, browser acceptance, full regression, protected assets and commit split.

Expected: a new non-draft PR URL.

- [ ] **Step 3: Report final Git and asset state**

Expected: branch ahead of local `main` by the new commits, clean worktree, staged `0`, upstream synchronized, stash unchanged, no merge/deploy/tag.
