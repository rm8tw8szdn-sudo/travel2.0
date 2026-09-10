# Route V2 Performance Benchmark Reliability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed same-host paired performance gate that preserves the `p95 < 0.25ms` absolute contract and distinguishes stable regression, no regression, and inconclusive noisy runs.

**Architecture:** A focused worker loads the sealed baseline and current Route modules, measures `validateRouteIntentInvariants()` with identical fixtures and a balanced order, and returns raw samples. A coordinator owns the fixed protocol, aggregates every pair without filtering, assesses dispersion, reports the absolute and relative gates separately, and proves sensitivity with isolated 10% and 20% synthetic workload injections.

**Tech Stack:** Node.js ESM, built-in `perf_hooks`, `child_process`, `assert`, Git archive, JSON diagnostics.

---

### Task 1: Define the statistics and verdict contract

**Files:**
- Create: `scripts/lib/route-v2-performance-reliability.mjs`
- Create: `scripts/verify-route-v2-performance-reliability-logic.mjs`

- [x] Implement percentile, median, dispersion, paired-ratio aggregation, and the three-state regression verdict without deleting or filtering samples.
- [x] Fix and document the reliability limits and sustained-regression rule in exported protocol constants.
- [x] Add deterministic tests for absolute PASS/FAIL, NO REGRESSION, REGRESSION, INCONCLUSIVE, and raw-sample preservation.
- [x] Run `node scripts/verify-route-v2-performance-reliability-logic.mjs`; expect PASS.

### Task 2: Build the isolated paired benchmark worker

**Files:**
- Create: `scripts/benchmark-route-v2-invariant-pair-worker.mjs`

- [x] Dynamically load baseline and current Route modules from explicit roots and construct the same normalized intent and route fixture for each revision.
- [x] Use the fixed warmup, sample count, and batch size for both sides; alternate baseline/current order according to the coordinator.
- [x] Implement synthetic slowdown only as extra fixture invocations in the current measurement, leaving production Route code unchanged.
- [x] Emit every per-batch duration and p95 as JSON; run syntax validation.

### Task 3: Implement the fixed paired coordinator

**Files:**
- Create: `scripts/verify-route-v2-performance-reliability.mjs`

- [x] Pin baseline `826439f41523500ad805d0bcb9966a630e90b859` and archive its `src` tree to an isolated temporary directory.
- [x] Run exactly six pairs in balanced alternating order with identical Node executable, inputs, warmup, batch, and sample settings.
- [x] Report baseline/current absolute p95, every pair ratio and delta, median delta, spread/dispersion, absolute result, reliability result, and regression verdict.
- [x] Run separate fixed six-pair synthetic diagnostics at 10% and 20%; require the 20% case to return reliable REGRESSION.
- [x] Exit nonzero when the absolute contract fails, the normal regression verdict blocks, or the 20% detector fails, while writing the complete JSON result first.

### Task 4: Attach the reliable result to the existing performance verifier

**Files:**
- Modify: `scripts/verify-route-v2-intent-performance.mjs`

- [x] Preserve the existing `0.25ms` threshold and p95 calculation.
- [x] Ensure an absolute failure remains an explicit failure and is never converted to PASS by a paired NO REGRESSION result.
- [x] Include the paired verifier's two-layer output in the final performance report without changing Route, parser, Knowledge, image, Evidence, planner, or search production code.

### Task 5: Validate and record the fixed protocol

**Files:**
- Create: `ROUTE_V2_PERFORMANCE_BENCHMARK_RELIABILITY_VALIDATION.md`

- [x] Run syntax checks, the deterministic logic verifier, and `git diff --check`.
- [x] Run the coordinator exactly once against the sealed baseline and current main; do not add runs after seeing results.
- [x] Record all six normal pairs, dispersion, absolute and regression verdicts, plus the fixed 10% and 20% synthetic outcomes.
- [x] Confirm no production Route/Knowledge/image/Evidence/formal files changed, the four browser artifacts remain untracked, staged is empty, and stash SHA is unchanged.
- [x] Leave all changes uncommitted and stop before Batch10.
