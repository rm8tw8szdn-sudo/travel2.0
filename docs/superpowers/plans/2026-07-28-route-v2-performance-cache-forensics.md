# Route V2 Performance and Cache Forensics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a repeatable same-host performance comparison, explain cold-search latency, and determine whether the historical Route V2 Cache manifest can be reproduced without modifying formal assets.

**Architecture:** Build three repository-external code states from the current commit and worktree, run one deterministic benchmark harness against each state for at least ten rounds, and collect structured stage timings from isolated Search/Planner stores. Perform Cache manifest archaeology independently through Git history, tracked reports, deterministic manifest candidates, and per-file runtime-state classification.

**Tech Stack:** Node.js ESM, PowerShell, Git plumbing commands, existing Route V2 verifier modules, isolated temporary directories, JSON reports.

---

### Task 1: Capture the immutable experiment envelope

**Files:**
- Create: `docs/superpowers/plans/2026-07-28-route-v2-performance-cache-forensics.md`
- Read: `scripts/verify-route-v2-intent-performance.mjs`
- Read: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`

- [ ] **Step 1: Confirm the authorized worktree state**

Run:

```powershell
git branch --show-current
git rev-parse HEAD
git diff --name-only
git ls-files --others --exclude-standard
git diff --cached --name-only
```

Expected: branch `codex/route-v2-knowledge-entity-layer-p1b-batch02`, HEAD `739a2a8537c8ea63adb693653483d81217ed28dc`, 24 unstaged tracked files, 9 initial untracked files, and no staged files.

- [ ] **Step 2: Record the host without changing it**

Run read-only PowerShell and Node probes for Node version, OS build, CPU model, memory, battery/power status when available, and the highest-CPU processes. Do not stop processes or alter power settings.

- [ ] **Step 3: Snapshot formal assets**

Calculate deterministic path-sorted inventories for Accepted, `.route-v2-cache`, and Knowledge. Store experiment reports below an OS temporary directory, never below formal asset directories.

### Task 2: Reconstruct comparable A/B/C code states

**Files:**
- Read: `.git`
- Read: the 24 tracked worktree diffs
- Read: the 9 initial untracked files

- [ ] **Step 1: Build state A**

Use:

```powershell
git archive --format=tar 739a2a8537c8ea63adb693653483d81217ed28dc
```

Extract it to an OS temporary directory. Copy only the read-only data inputs required by the benchmark when they are not tracked by the archive.

- [ ] **Step 2: Build state B**

Copy the current working tree to a second OS temporary directory while excluding `.git`, `.route-v2-cache`, browser profiles, and runtime outputs. Preserve the exact current source content.

- [ ] **Step 3: Build state C**

Start from state A and apply only the previously audited Japan single-country, Candidate identity, fixed-order parsing, route-summary implementation, and direct regression-test hunks. Do not apply runtime-environment, Citywalk, image, Feed, Entity Layer, or unrelated UI hunks.

- [ ] **Step 4: Verify state identity**

Write path-sorted SHA-256 inventories for source files in A/B/C. Assert that A matches the commit, B matches the current source worktree, and C differs from A only in the explicit minimal file/hunk allowlist.

### Task 3: Make the benchmark statistically repeatable

**Files:**
- Modify only if measurements prove the existing harness unstable: `scripts/verify-route-v2-intent-performance.mjs`
- Create if required: `scripts/benchmark-route-v2-performance-forensics.mjs`

- [ ] **Step 1: Measure pure operations in batches**

For SearchIntent parsing, RouteIntent normalization, fingerprint generation, and final invariant validation, use fixed inputs, warm up each operation, measure batches large enough to exceed timer-resolution noise, and run ten independent rounds.

- [ ] **Step 2: Emit full statistics**

For every metric emit the ten raw round summaries plus sample count, warm-up count, batch size, p50, p95, p99, max, mean, sample standard deviation, coefficient of variation, and first-round comparison.

- [ ] **Step 3: Detect harness instability**

If within-state p95 variation exceeds 10%, isolate import/initialization, increase operation batch size, and record GC/JIT outliers. Do not change the product assertion until the harness is stable.

### Task 4: Attribute cold-search latency

**Files:**
- Read: `src/lib/routes/route-search-service.mjs`
- Read: `src/lib/routes/route-composition-planner.mjs`
- Modify only if required for non-user-visible diagnostics: the benchmark harness

- [ ] **Step 1: Run isolated live services**

Start A, B, and C one at a time on dynamic localhost ports with unique temporary Accepted, Search cache, Candidate, Trace, Evidence, Ready Pool, and image-cache paths. Disable all external evidence and image providers.

- [ ] **Step 2: Measure user-path categories**

For each state run at least ten rounds for service cold start, first uncached query, later distinct uncached queries, exact-query cache replay, equivalent-text query, different-hard-constraint query, Feed first page, and Detail.

- [ ] **Step 3: Record pipeline stages**

Measure SearchIntent parse, destination suggestion, Candidate build, Candidate persistence, selection, validation, Planner composition, DecisionTrace/EvidenceBundle, cache lookup/write, route-summary generation, and final response assembly. Diagnostics must remain in the benchmark process or structured test output and must not enter page responses.

- [ ] **Step 4: Attribute regressions**

Compare B/A and C/A using same-host p95 and mean deltas. Treat a stable delta above 10% as a regression requiring a minimal code fix and a permanent performance regression assertion.

### Task 5: Reconstruct the historical Cache manifest

**Files:**
- Read: Git history
- Read: `ROUTE_V2_PERMANENT_INTENT_INVARIANTS_VALIDATION.md`
- Read: `ROUTE_V2_PRELAUNCH_UX_PERFORMANCE_VALIDATION.md`
- Read: `docs/superpowers/plans/*`
- Create only if justified: `scripts/audit-route-v2-asset-manifests.mjs`

- [ ] **Step 1: Locate the first historical occurrence**

Use Git pickaxe and tracked-file history to identify the first commit/report containing `056d3af349b05cc7ae59620c23be26e11e91dd1d0c37a8bf2b153362834568cb`.

- [ ] **Step 2: Enumerate candidate algorithms**

Test deterministic candidates covering content-only concatenation, relative-path plus content, per-file hashes, JSON canonicalization, inclusion/exclusion of JSONL and runtime-state files, and path sorting. Never include mtime in the recommended algorithm.

- [ ] **Step 3: Classify the five late-written files**

For `provider-sync-state.json`, `knowledge-graph-pool.json`, `search-analytics.jsonl`, `search-cache.json`, and `search-review-candidates.json`, document producer, consumer, mutability, whether it is a user/runtime state file, and whether the historical manifest intended to include it.

- [ ] **Step 4: Choose one evidence-backed conclusion**

Report either reproducible historical manifest, a verified versioned immutable/mutable split without promoting current data to gold, or a manual-decision block naming the exact files requiring recovery.

### Task 6: Verify non-pollution and report

**Files:**
- Create or modify only task-specific benchmark/manifest scripts and this plan

- [ ] **Step 1: Recalculate formal assets**

Re-run the exact pre-experiment inventories and compare file count, total bytes, per-file SHA-256, and aggregate manifest.

- [ ] **Step 2: Inspect Git state**

Run:

```powershell
git diff --check
git diff --cached --check
git status --short --branch
```

Expected: staged remains empty; no Accepted, Cache, Knowledge, product feature, Entity Layer, Feed, image, or UI asset is modified by this task.

- [ ] **Step 3: Stop without committing**

Do not stage, commit, push, open a PR, deploy, tag, switch branches, or rewrite history. Report the A/B/C construction, ten-round raw data and statistics, threshold provenance, latency attribution, Cache forensics, asset before/after state, and one of the four authorized final conclusions.
