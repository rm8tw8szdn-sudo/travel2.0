# Route V2 PR19 Final P1 Closures Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining PR #19 blockers by preventing mutable Accepted-route copies from self-certifying explicit themes and by proving excluded requests cannot perform delayed V2 sidecar writes.

**Architecture:** Theme compatibility will resolve accepted evidence from an immutable repository snapshot by stable route identity instead of reading mutable result metadata. Existing request-level V2 gating remains unchanged; its verifier gains immediate and delayed byte-level sidecar snapshots for excluded and included canary scenarios.

**Tech Stack:** Node.js ESM, filesystem-backed repositories, deterministic verifier scripts, Git/GitHub CLI.

---

### Task 1: Add failing theme-trust regression

**Files:**
- Create: `scripts/verify-route-v2-theme-evidence-trust.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`

**Step 1:** Build a temporary Accepted repository containing one classic route and one independently themed route.

**Step 2:** Assert that island, hiking, and honeymoon fields injected into the classic route copy cannot satisfy explicit themes.

**Step 3:** Assert that the original independently themed Accepted record still satisfies its theme.

**Step 4:** Run the verifier and confirm it fails against the current mutable-record implementation.

### Task 2: Resolve accepted theme evidence from immutable source records

**Files:**
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`

**Step 1:** Add an accepted-route resolver option to invariant validation.

**Step 2:** Ignore request/planner-derived theme metadata and canonicalize accepted evidence from the resolved original record only.

**Step 3:** Pass a defensive Accepted resolver through Search, mature/fallback, and Planner finalization paths.

**Step 4:** Run the new verifier and existing theme/fallback regressions.

### Task 3: Add delayed sidecar write detection

**Files:**
- Modify: `scripts/verify-route-v2-pr19-p1-closures.mjs`

**Step 1:** Snapshot all configured V2 sidecar locations before Search.

**Step 2:** Compare immediately after Search returns.

**Step 3:** Wait one event-loop turn plus a bounded delay, then compare again.

**Step 4:** Assert excluded requests remain byte-identical and included 50%/100% requests retain writes.

### Task 4: Validate production paths and assets

**Files:**
- Test only

**Step 1:** Run targeted P1, Search Intent, rollout, observability, Search V1, Planner, fallback, invariant, Cache V2, performance, and comprehensive verifiers.

**Step 2:** Run syntax and whitespace checks.

**Step 3:** Perform browser checks for Turkey island, Turkey road trip, Iceland loop, and Japan family.

**Step 4:** Compare Accepted, Immutable Cache, Knowledge, Evidence seed, Runtime State, and Metrics state before and after.

### Task 5: Review, commit, push, and update PR #19

**Files:**
- Review all changed files

**Step 1:** Confirm the diff contains only the two P1 fixes, permanent regressions, and this plan.

**Step 2:** Stage explicit files and run cached whitespace checks.

**Step 3:** Create one new commit without amending history.

**Step 4:** Push normally and update PR #19 with root cause, fix, and validation details.
