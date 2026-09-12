# Route V2 Dedicated Reliability Qualification Validation

Date: 2026-09-12

## Classification and preserved formal truth

This infrastructure is `NON-FORMAL`, `NON-GATING`, and `DEVELOPMENT QUALIFICATION` only. It cannot clear the performance blocker or unblock Batch10. Formal run `34622976529` remains the only formal execution and remains `BLOCKED_INCONCLUSIVE`.

## Raw evidence and reconstruction

Each qualification execution creates one UUID `qualificationRunId`. Every actual worker spawn creates a separate UUID occurrence, and its raw pair envelope binds that occurrence to the run ID, protocol label, one-based pair index, balanced order, multiplier, worker identity, logical and actual operation counts, calculated p95, and 40 baseline plus 40 current samples. The independent reconstruction validates the complete raw schema and recalculates aggregate p95, side coefficient of variation, pair ratios, median paired delta, spread, regressing-pair count, reliability, and regression verdict.

Missing samples, non-finite samples, sample-count mismatch, worker mismatch, p95 mismatch, operation-count mismatch, order mismatch, multiplier mismatch, unknown fields, pair-count mismatch, duplicate pair occurrence, and mixed-run identity fail closed. Pair occurrence UUIDs must be unique within and across all five runs. The qualification runner compares independently reconstructed results against the unchanged sealed evaluator before accepting a run record.

## Dedicated environment contract

The workflow requires exactly `[self-hosted, linux, x64, route-v2-performance-dedicated]`; no GitHub-hosted fallback exists. The repository currently exposes zero self-hosted runners, so the qualification is `DEDICATED RUNNER NOT AVAILABLE / QUALIFICATION NOT EXECUTED`.

The dedicated host contract pins Node.js 24.18.0, locked dependencies, CPU 0 affinity inherited by every worker, and the Linux `performance` governor. Preflight and post-run evidence record kernel, model/topology, hypervisor, SMT, affinity, governor, frequency limits/current frequency when exposed, load average, full `/proc/stat`, context switches, process migrations, steal ticks, memory state, Node, lockfile hash, coordinator SHA, current SHA, and baseline SHA. Telemetry executes outside timed worker sections.

## Exactly-five and isolation contract

One manual dispatch starts one trusted Node coordinator. The coordinator creates an in-memory session secret and execution plan, performs exactly five sequential child qualification executions, compares every returned pair against the expected occurrence held in memory, reconstructs the raw evidence, and only then emits the authoritative runtime `QUALIFICATION PASS` or `QUALIFICATION FAIL`. The secret is zeroed before exit and is never written to evidence, logs, workflow output, or JSON.

The production coordinator accepts no serialized run collection or artifact input. It owns the five-attempt loop and has no sixth-run, retry, or replacement interface. Qualification passes only when all five live attempts exit successfully, match their in-memory provenance plans, and produce an `AUDIT VALID` result with successful environment preflight.

Serialized evidence is deliberately non-authoritative. `auditDedicatedReliabilityQualificationEvidence()` can reconstruct statistics and return only `AUDIT VALID` or `AUDIT INVALID`; it has no `qualificationVerdict` or legacy `verdict` output. Rewriting UUIDs in cloned artifacts may leave a statistically valid audit record, but cannot create a new authoritative qualification result or affect workflow success.

Only the live coordinator emits `QUALIFICATION PASS` or `QUALIFICATION FAIL`. The structural verifier rejects formal performance-pass, blocker-cleared, or Batch10-unblock wording and paths. It also rejects any workflow-, job-, or step-level `continue-on-error` declaration regardless of value, including expressions, so final enforcement failures cannot be tolerated. Qualification results cannot replace formal run `34622976529`.

## Automated validation

- Raw evidence verifier: PASS; independent reconstruction PASS; 17 fail-closed cases.
- Dedicated environment verifier: PASS; 7 fail-closed cases.
- Exactly-five aggregator verifier: PASS; 17 fail-closed cases.
- Trusted coordinator verifier: PASS; live execution is the only authoritative input, exact attempts 5, retry absent, secret serialization absent.
- Qualification workflow structural verifier: PASS; 15 spoof/security cases, including four `continue-on-error` scope and expression regressions.
- Existing controlled workflow verifier: required to remain PASS.
- Existing reliability logic verifier and PR #33 protections: required to remain PASS.
- Sealed protocol: unchanged at 0.25ms, 6 pairs, 5,000 warmups, and 40 × 250 operations.

No qualification workflow or formal performance workflow was dispatched during development.
