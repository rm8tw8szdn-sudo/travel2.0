# Route V2 Dedicated Reliability Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-formal, non-gating, fail-closed five-run qualification system that proves whether a dedicated Linux runner can reliably execute the unchanged Route V2 performance protocol.

**Architecture:** A dedicated self-hosted workflow runs trusted qualification orchestration against fixed current and baseline source trees. Every worker's raw samples are serialized and independently reconstructed, Linux preflight and before/after telemetry are retained, and an aggregator accepts only exactly five complete reliable runs. Structural verifiers reject hosted fallback, identity overrides, retries, evidence loss, protocol mutation, and any formal or Batch10-unblock path.

**Tech Stack:** GitHub Actions, Node.js 24.18.0, YAML 2.9.0, Linux `/proc` and CPUFreq telemetry, existing Route V2 worker and sealed reliability library.

---

### Task 1: Raw sample evidence and independent reconstruction

**Files:**
- Create: `scripts/lib/route-v2-performance-raw-evidence.mjs`
- Create: `scripts/verify-route-v2-performance-raw-evidence.mjs`
- Create: `scripts/run-route-v2-performance-reliability-qualification.mjs`

- [x] Serialize all six validated worker pairs with identity, order, multiplier, operation counts, p95, and both sample arrays.
- [x] Validate exact schemas, finite positive samples, fixed counts, p95 consistency, fixed balanced order, and operation counts before reconstruction.
- [x] Independently reconstruct aggregate p95, side CVs, ratios, median delta, spread, regressing-pair count, reliability, and regression verdict.
- [x] Add positive and fail-closed tests for missing samples, malformed samples, count mismatch, worker identity, operation counts, p95 mismatch, and aggregate reconstruction.
- [x] Keep qualification output separate from formal performance and Batch10 verdicts.

### Task 2: Dedicated environment preflight and telemetry

**Files:**
- Create: `scripts/collect-route-v2-dedicated-performance-environment.mjs`
- Create: `scripts/lib/route-v2-dedicated-performance-environment.mjs`
- Create: `scripts/verify-route-v2-dedicated-performance-environment.mjs`

- [x] Collect Linux/kernel, CPU model/topology, hypervisor, SMT, affinity, governor, frequency, load, `/proc/stat`, context switches, migrations, steal, memory, Node, lockfile, and fixed Git identities outside timed work.
- [x] Fail closed unless Linux x64, Node 24.18.0, fixed CPU affinity, performance governor, complete identity, and required telemetry are present.
- [x] Test complete, missing, malformed, wrong-platform, wrong-affinity, wrong-governor, and wrong-identity fixtures.

### Task 3: Exactly-five qualification aggregation

**Files:**
- Create: `scripts/lib/route-v2-dedicated-reliability-qualification.mjs`
- Create: `scripts/verify-route-v2-dedicated-reliability-qualification.mjs`

- [x] Accept exactly five distinct run records plus valid pre/post environment evidence.
- [x] Require every run to have valid raw reconstruction, normal reliability and spread, reliable 20% synthetic REGRESSION, and worker/admission invariants.
- [x] Return only `QUALIFICATION PASS` or `QUALIFICATION FAIL`; never emit formal or Batch10-unblock verdicts.
- [x] Test 5/5 success and fail-closed behavior for 4/5, 6/5, one failed run, missing evidence, malformed telemetry, and identity drift.

### Task 4: Dedicated workflow and structural contract

**Files:**
- Create: `.github/workflows/route-v2-performance-reliability-qualification.yml`
- Create: `scripts/verify-route-v2-performance-reliability-qualification-workflow.mjs`

- [x] Require manual-only dispatch on `[self-hosted, linux, x64, route-v2-performance-dedicated]`, fixed trusted identities, read-only permissions, Node 24.18.0, and locked installation.
- [x] Run preflight, exactly five sequential qualification executions under `taskset`, post telemetry, aggregation, unconditional evidence upload, and fail-closed enforcement.
- [x] Structurally reject hosted runners, missing labels, count changes, loops/retries, identity overrides, protocol mutation, missing telemetry/evidence, swallowed failure, and formal/Batch10 wording or publishing paths.
- [x] Preserve existing controlled-workflow spoof and security-override regressions.

### Task 5: Validate and document without execution

**Files:**
- Create: `ROUTE_V2_DEDICATED_RELIABILITY_QUALIFICATION_VALIDATION.md`
- Modify: `package.json`

- [x] Run raw-evidence, environment, aggregation, workflow, controlled-workflow, and PR #33 reliability logic verifiers.
- [x] Run syntax and whitespace checks and confirm no production or sealed asset diff.
- [x] Query runner availability without dispatching the workflow; record `NOT AVAILABLE` when no matching online dedicated runner exists.
- [x] Preserve formal run 34622976529 as `BLOCKED_INCONCLUSIVE`, formal execution count 1, browser artifacts, and stash.
- [x] Stop with uncommitted changes for targeted review; do not dispatch qualification or formal performance workflows.
