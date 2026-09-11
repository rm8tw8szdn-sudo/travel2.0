# Route V2 Dedicated Reliability Qualification Validation

Date: 2026-09-12

## Classification and preserved formal truth

This infrastructure is `NON-FORMAL`, `NON-GATING`, and `DEVELOPMENT QUALIFICATION` only. It cannot clear the performance blocker or unblock Batch10. Formal run `34622976529` remains the only formal execution and remains `BLOCKED_INCONCLUSIVE`.

## Raw evidence and reconstruction

Each qualification protocol stores all six worker records with exact worker identity, schema, balanced order, multiplier, logical and actual operation counts, calculated p95, and 40 baseline plus 40 current samples per pair. The independent reconstruction validates the complete raw schema and recalculates aggregate p95, side coefficient of variation, pair ratios, median paired delta, spread, regressing-pair count, reliability, and regression verdict.

Missing samples, non-finite samples, sample-count mismatch, worker mismatch, p95 mismatch, operation-count mismatch, order mismatch, multiplier mismatch, unknown fields, and pair-count mismatch fail closed. The qualification runner compares independently reconstructed results against the unchanged sealed evaluator before accepting a run record.

## Dedicated environment contract

The workflow requires exactly `[self-hosted, linux, x64, route-v2-performance-dedicated]`; no GitHub-hosted fallback exists. The repository currently exposes zero self-hosted runners, so the qualification is `DEDICATED RUNNER NOT AVAILABLE / QUALIFICATION NOT EXECUTED`.

The dedicated host contract pins Node.js 24.18.0, locked dependencies, CPU 0 affinity inherited by every worker, and the Linux `performance` governor. Preflight and post-run evidence record kernel, model/topology, hypervisor, SMT, affinity, governor, frequency limits/current frequency when exposed, load average, full `/proc/stat`, context switches, process migrations, steal ticks, memory state, Node, lockfile hash, coordinator SHA, current SHA, and baseline SHA. Telemetry executes outside timed worker sections.

## Exactly-five and isolation contract

One manual dispatch performs exactly five sequential qualification executions. Every result and exit code is retained; the loop has no retry, replacement, early-success, or hosted fallback path. Qualification passes only when all five executions have valid raw reconstruction, reliable normal results with spread at or below 0.10, reliable 20% synthetic `REGRESSION`, successful environment preflight, fixed identities, and zero execution errors.

The aggregator emits only `QUALIFICATION PASS` or `QUALIFICATION FAIL`. The structural verifier rejects formal performance-pass, blocker-cleared, or Batch10-unblock wording and paths. It also rejects any workflow-, job-, or step-level `continue-on-error` declaration regardless of value, including expressions, so final enforcement failures cannot be tolerated. Qualification results cannot replace formal run `34622976529`.

## Automated validation

- Raw evidence verifier: PASS; independent reconstruction PASS; 10 fail-closed cases.
- Dedicated environment verifier: PASS; 7 fail-closed cases.
- Exactly-five aggregator verifier: PASS; 9 fail-closed cases.
- Qualification workflow structural verifier: PASS; 15 spoof/security cases, including four `continue-on-error` scope and expression regressions.
- Existing controlled workflow verifier: required to remain PASS.
- Existing reliability logic verifier and PR #33 protections: required to remain PASS.
- Sealed protocol: unchanged at 0.25ms, 6 pairs, 5,000 warmups, and 40 × 250 operations.

No qualification workflow or formal performance workflow was dispatched during development.
