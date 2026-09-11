# Route V2 Performance Controlled Environment Validation

Date: 2026-09-10

## Existing capability assessment

The repository had no GitHub Actions workflows or dedicated performance runner. It had a committed `package-lock.json`, while `package.json` allowed any Node version at or above 24. The current Windows desktop validation remained inconclusive, so it was not reused as the formal environment.

## Controlled environment specification

- Manual GitHub Actions dispatch only from `refs/heads/main`, with no caller-controlled inputs and no push, pull-request, scheduled, matrix, or concurrent benchmark runs.
- GitHub-hosted `ubuntu-24.04`, with runner architecture, name, kernel, and `lscpu` output captured at execution time.
- Node.js `24.18.0`, exact `yaml` 2.9.0 structural-parser dependency, and locked `npm ci --ignore-scripts` installation.
- The workflow and coordinator are checked out from the trusted workflow `GITHUB_SHA`. The fixed current target is `1a9234f14e11aebe63eb043c78eeb73040ab7452`; it must exist and be an ancestor of that trusted main revision. Only its `src` tree is archived as data for the benchmark. The sealed baseline remains `826439f41523500ad805d0bcb9966a630e90b859`.
- Actions are pinned by commit SHA: checkout v7.0.1, setup-node v7.0.0, and upload-artifact v7.0.1.
- Read-only repository permission, one non-cancelling concurrency group, and no browser or broad test-suite jobs competing inside the workflow.

## Execution and evidence contract

The workflow first runs the reliability logic verifier and the YAML-structure workflow verifier, then invokes `node scripts/verify-route-v2-performance-reliability.mjs --current-ref 1a9234f14e11aebe63eb043c78eeb73040ab7452` exactly once. That sealed invocation contains the normal six-pair run plus the existing 10% and 20% synthetic qualifications. No sample, threshold, pair count, warmup, ordering, reliability rule, or regression rule changes.

The workflow verifier parses YAML with unique-key enforcement and checks the actual job graph and step fields. Eight negative fixtures prove that misleading comments, a floating Node version, a changed baseline, a second benchmark invocation, an added push trigger, a caller-controlled checkout ref, conditional artifact loss, and a swallowed exit verdict all fail verification.

Security-sensitive effective configuration is fail-closed. Job-level permission overrides are forbidden, and `CONTROLLED_CURRENT_SHA` plus `SEALED_BASELINE_SHA` may be declared only in the exact top-level environment contract. Seven additional negative fixtures reject job-level write permissions, current/baseline overrides at job or step scope, an unrelated-step current override, and even a same-value duplicate declaration.

Spoof fixture mutation normalizes only CRLF and standalone CR to LF before matching. Every fixture asserts that its target exists and that the mutation changes the source before invoking the structural verifier, so Windows and Linux checkouts exercise identical mutations and fixture drift fails explicitly.

Every dispatch retains:

- `environment.txt`: OS, architecture, runner and CPU information, Node/npm versions, lockfile SHA-256, trusted workflow SHA, requested fixed current SHA, resolved current SHA, and baseline SHA.
- `result.json`: complete all-samples-retained benchmark output.
- `stderr.log`: verifier diagnostics.

Artifacts upload even for failure or inconclusive results. A final step propagates the sealed verifier exit code, so an unreliable environment, absolute failure, regression, or failed 20% detector cannot appear as a successful workflow.

## Formal execution decision

No performance measurement is run during infrastructure development. After final review and merge, dispatch the workflow once from `main`; the workflow uses fixed current commit `1a9234f14e11aebe63eb043c78eeb73040ab7452`. Treat the environment as qualified only when normal reliability is `true` and the 20% synthetic verdict is reliable `REGRESSION`. Batch10 is unblocked only if that qualification passes, current absolute p95 is below `0.25ms`, and the normal regression verdict is `NO REGRESSION`.
