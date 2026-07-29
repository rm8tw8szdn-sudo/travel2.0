# Route V2 Readiness and Search Intent Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit, validate, separate, commit, and publish the already-implemented Production Readiness, Search Intent, and Knowledge Coverage documentation changes without altering formal assets.

**Architecture:** Preserve the current combined working tree through the full pre-commit regression, then create a branch from `main` and stage only reviewed files or hunks. Use a dependency-ordered commit sequence only where every intermediate commit imports successfully and passes its own verifier; otherwise collapse inseparable layers into one integrated commit.

**Tech Stack:** Git, Node.js ESM verifiers, local HTTP preview, GitHub CLI.

---

### Task 1: Audit the mixed working tree

**Files:**
- Inspect: every path returned by `git status --short`
- Create: `docs/superpowers/plans/2026-07-29-route-v2-readiness-search-intent-release.md`

- [ ] **Step 1: Record the exact baseline**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git diff --name-status
git diff --stat
git ls-files --others --exclude-standard
```

Expected: `main` at `73802aba6e12ed249c979ba32fd77252e2e359f3`, staged files 0.

- [ ] **Step 2: Classify every file and mixed hunk**

Assign each diff to exactly one of:

```text
Production Readiness Phase 1
Production Readiness Phase 2
Real User Search Intent Phase 1
Knowledge Coverage Audit Phase 1
temporary/unrelated
```

Mixed files must be reviewed with `git diff -- <path>` and split only if the resulting earlier commit still parses and passes its verifier.

### Task 2: Verify the combined working tree

**Files:**
- Test: all changed `.js` and `.mjs` files
- Test: the mandatory verifier matrix

- [ ] **Step 1: Check JavaScript syntax and whitespace**

Run `node --check` for every modified or untracked `.js`/`.mjs`, followed by:

```powershell
git diff --check
git diff --cached --check
```

Expected: exit code 0.

- [ ] **Step 2: Run phase and product regressions**

Run:

```powershell
node scripts/verify-route-v2-production-readiness-phase1.mjs
node scripts/verify-route-v2-production-readiness-phase2.mjs
node scripts/verify-route-v2-real-user-search-intent-regression.mjs
node scripts/verify-search-v1.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-intent-boundaries.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-route-v2-intent-performance.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
```

Expected: all mandatory stages PASS.

- [ ] **Step 3: Run an isolated browser probe**

Use temporary Accepted, Search Cache, metrics, Candidate, Trace, Evidence, and image-cache paths. Verify master-on V2 search, master-off legacy fallback, `Japan seven days`, `Jappan 7 days`, Europe region constraints, loading completion, and zero external Evidence/image requests.

### Task 3: Create the dependency-ordered commits

**Files:**
- Stage: only paths or hunks assigned during Task 1

- [ ] **Step 1: Create the branch after validation**

Run:

```powershell
git switch -c codex/route-v2-production-readiness-search-intent
```

Expected: the working tree is preserved on the new branch.

- [ ] **Step 2: Commit rollout controls**

Stage only Phase 1 rollout-control paths/hunks and run its verifier plus `git diff --cached --check`.

Commit:

```powershell
git commit -m "feat(route-v2): add production rollout controls"
```

- [ ] **Step 3: Commit anonymous observability**

Stage only Phase 2 runtime metrics, server integration, verifier, and documentation paths/hunks. Run Phase 1 and Phase 2 verifiers plus `git diff --cached --check`.

Commit:

```powershell
git commit -m "feat(route-v2): add anonymous runtime observability"
```

- [ ] **Step 4: Commit Search Intent hardening**

Stage only region taxonomy, parser/model/gate/planner/search/UI integration, corpus, verifier, audit, and directly required verifier updates. Run the 37-case/4-production-path verifier, Search V1, Planner, fallback, and `git diff --cached --check`.

Commit:

```powershell
git commit -m "fix(route-v2): harden real-user search intent"
```

- [ ] **Step 5: Commit Knowledge Coverage documentation**

Stage only the Knowledge Coverage audit, Expansion Batch 01 plan, and this release plan.

Commit:

```powershell
git commit -m "docs(route-v2): audit knowledge coverage"
```

If any earlier split creates an unresolved import or failing verifier, regroup the inseparable files into the nearest dependency commit and document the reason. Do not preserve a suggested split at the expense of a runnable intermediate state.

### Task 4: Revalidate and publish

**Files:**
- Inspect: complete branch diff against `main`

- [ ] **Step 1: Re-run mandatory validation**

Run the Phase 1, Phase 2, Search Intent, performance, Cache Baseline V2, and comprehensive prelaunch verifiers on the final commit sequence.

Expected: PASS; formal Accepted, Immutable Cache, Runtime State, Knowledge, and Evidence seed unchanged.

- [ ] **Step 2: Push without rewriting history**

Run:

```powershell
git push -u origin codex/route-v2-production-readiness-search-intent
```

- [ ] **Step 3: Create a ready-for-review PR**

Create a PR targeting `main`. The title must summarize rollout controls, anonymous observability, Search Intent hardening, and Knowledge coverage documentation. The body must include scope, dependency rationale, validation, asset isolation, and explicit non-goals.

### Task 5: Final integrity check

- [ ] **Step 1: Confirm repository state**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -5
git rev-parse HEAD
git rev-parse origin/main
```

Expected: clean working tree, branch tracking its remote, no merge, deploy, tag, amend, rebase, or force push.
