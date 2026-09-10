# Route V2 Performance Benchmark Reliability Validation

Date: 2026-09-10
Current source: `a3980b083687ca08226c1e16f71d97ac6911da77` plus performance-only working-tree changes
Sealed comparison baseline: `826439f41523500ad805d0bcb9966a630e90b859`

## Protocol

- Six fixed pairs, alternating `baseline → current` and `current → baseline`.
- Each side runs in the same child process with Node v24.18.0, a 5,000-operation warmup, 40 measured batches, and 250 logical operations per batch.
- Both revisions receive the same Tokyo–Kyoto–Osaka seven-day fixture and execute `validateRouteIntentInvariants()`.
- Every measured batch is retained. There is no outlier removal and no result-selected rerun.
- The absolute contract remains aggregate p95 `< 0.25ms`.
- Reliability requires baseline and current pair-p95 coefficient of variation at or below 15%, plus paired ratio range at or below 10%. The paired range is deliberately below the required 20% synthetic signal; the synthetic detector verifies that this host can separate that signal from residual noise.
- A reliable regression requires median ratio at least 1.10 and at least five of six pair ratios at or above 1.05. An unreliable run is `INCONCLUSIVE`, never PASS.

## Same-host sealed baseline comparison

| Pair | Order | Baseline p95 (ms) | Current p95 (ms) | Current / baseline | Delta |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | baseline-current | 0.186164 | 0.182608 | 0.980899 | -1.9101% |
| 2 | current-baseline | 0.175921 | 0.186881 | 1.062298 | +6.2298% |
| 3 | baseline-current | 0.165374 | 0.164488 | 0.994638 | -0.5362% |
| 4 | current-baseline | 0.206979 | 0.171555 | 0.828850 | -17.1150% |
| 5 | baseline-current | 0.174049 | 0.173936 | 0.999352 | -0.0648% |
| 6 | current-baseline | 0.173207 | 0.174296 | 1.006288 | +0.6288% |

- Baseline aggregate p95: `0.185710ms`.
- Current aggregate p95: `0.177747ms`.
- Absolute: `PASS` for this single run (`0.177747ms < 0.25ms`).
- Median paired delta: `-0.3005%` (computed from the retained pair ratios).
- Baseline pair-p95 CV: `8.1428%`; current pair-p95 CV: `4.5600%`.
- Paired ratio range: `23.3448%`, above the fixed 10% reliability limit.
- Regression verdict: `INCONCLUSIVE`.
- Combined gate: `BLOCKED_INCONCLUSIVE`.

The earlier main result remains historical evidence: `0.340223ms > 0.25ms`, absolute FAIL. This one fixed run does not rewrite that result.

## Synthetic detector validation

The synthetic workload changes only the number of fixture invocations and does not modify production Route code.

### 10% synthetic workload

Pair ratios: `1.022134`, `1.079558`, `1.072360`, `1.131449`, `1.077957`, `1.162127`. Median delta was `+7.8758%`; ratio range was `13.9993%`. The result was `INCONCLUSIVE`, which is allowed for the approximately 10% diagnostic and is not represented as PASS.

### 20% synthetic workload

Pair ratios: `1.185050`, `1.171275`, `1.202404`, `1.200579`, `1.152255`, `1.240871`. Median delta was `+19.2814%`; all six pairs exceeded the 5% floor; ratio range was `8.8616%`. Baseline/current CVs were `2.3639%` and `3.1715%`. The result was reliable `REGRESSION`.

The required 20% regression detector passed. The reliability implementation is ready for review, while Batch10 remains blocked because the normal same-host comparison was `INCONCLUSIVE`.

## Malformed-input fail-safe closure

The evaluator now rejects missing, non-numeric, non-finite, zero, or negative p95/sample values; empty or wrong-sized sample arrays; insufficient or malformed pairs; invalid order; invalid ratios; and a reported p95 that does not match the retained samples. Invalid input returns absolute `FAIL`, reliability `false`, regression `INCONCLUSIVE`, and combined `BLOCKED_INCONCLUSIVE`.

The original `samplesMs: [null]` reproduction now returns `FAIL / false / INCONCLUSIVE / BLOCKED_INCONCLUSIVE`. The deterministic logic verifier covers null, undefined, NaN, positive and negative Infinity, strings, empty samples, insufficient pairs, malformed pair/worker records, missing ratio input, and non-positive baseline values. This validation changes no protocol constant or prior measured result.

The coordinator additionally validates the complete worker envelope before aggregation: exact worker identity, expected balanced order, expected synthetic multiplier, both measurement identities, and their nested samples/p95. Missing or invalid JSON, process failure, error envelopes, and explicit `valid=false` or `success=false` markers remain outside statistics and resolve to the same blocked semantics.
