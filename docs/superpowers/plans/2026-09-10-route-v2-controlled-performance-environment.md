# Route V2 Controlled Performance Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a pinned, isolated Linux CI environment that runs the sealed Route V2 reliability verifier once and preserves complete evidence for a formal performance decision.

**Architecture:** A manual GitHub Actions workflow runs only from the trusted `main` workflow revision, pins the Node and dependency environment, and treats a fixed ancestor commit as data-only benchmark input. It records runner metadata, validates both workflow and reliability invariants, and performs one sealed benchmark invocation. It uploads raw JSON, stderr, and environment evidence regardless of verdict, then propagates the verifier exit code without converting failure or inconclusive results into PASS.

**Tech Stack:** GitHub Actions, Ubuntu 24.04 hosted runner, Node.js 24.18.0, npm lockfile, existing Route V2 reliability verifier.

---

### Task 1: Add the controlled runner

**Files:**
- Create: `.github/workflows/route-v2-controlled-performance.yml`

- [x] Use manual dispatch only from `refs/heads/main`, with no dispatch inputs and fixed current/baseline SHAs.
- [x] Run the coordinator from the trusted workflow checkout; require the fixed current SHA to be an ancestor and archive only its `src` tree as benchmark data.
- [x] Pin Ubuntu, Node, action revisions, lockfile installation, full Git history, read-only permissions, and a non-cancelling singleton concurrency group.
- [x] Record OS, architecture, CPU, Node/npm, lockfile hash, current SHA, and sealed baseline SHA.
- [x] Run the logic verifier and exactly one complete sealed reliability invocation.
- [x] Upload raw result, stderr, and environment evidence on every outcome, then propagate the benchmark exit code.

### Task 2: Lock the workflow contract

**Files:**
- Create: `scripts/verify-route-v2-controlled-performance-workflow.mjs`

- [x] Parse YAML structurally and verify manual-only triggering, trusted checkout, fixed target lineage, pinned environment, locked install, one performance invocation, unconditional artifacts, and exit propagation.
- [x] Reject representative spoof attempts covering comments, triggers, checkout refs, duplicate invocations, artifact conditions, and swallowed verdicts.
- [x] Assert the sealed `0.25ms`, six-pair, 5,000-warmup, 40×250 protocol remains unchanged.

### Task 3: Validate without performance fishing

**Files:**
- Create: `ROUTE_V2_PERFORMANCE_CONTROLLED_ENVIRONMENT_VALIDATION.md`

- [x] Run workflow contract, reliability logic, syntax, and whitespace checks locally.
- [x] Confirm no production or sealed asset diff and preserve browser artifacts and stash.
- [x] Stop with uncommitted infrastructure for final review; do not run the performance experiment from the noisy Windows host.
