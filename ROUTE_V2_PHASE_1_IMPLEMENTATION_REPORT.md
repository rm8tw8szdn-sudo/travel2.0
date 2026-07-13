# Route V2 Phase 1 Implementation Report

Generated: 2026-07-13

Scope: Route Generation V2 Phase 1, DecisionTrace trace-only. No commit, push, merge, tag, Phase 2 work, route regeneration, accepted repository rewrite, cache cleanup, Feed behavior change, Search behavior change, Detail behavior change, or image-system change was performed.

## 1. Modified And Added Files

Added:

- `src/lib/routes/decision-trace-schema.mjs`
- `src/lib/routes/decision-trace-store.mjs`
- `scripts/verify-route-v2-phase1-trace.mjs`
- `ROUTE_V2_PHASE_1_IMPLEMENTATION_REPORT.md`

Modified:

- `src/lib/routes/route-composition-planner.mjs`
- `scripts/materialize-route-pool.mjs`
- `src/lib/routes/index.mjs`

## 2. DecisionTrace Schema

`decision-trace-schema.mjs` defines the Phase 1 trace-only schema and helpers:

- `traceId`
- `routeId`
- `candidateId`
- `intentId`
- `inputContext`
- `candidatePool`
- `selectedCandidate`
- `rejectedCandidates`
- `rejectionReasons`
- `decisionFactors`
- `strategyEffects`
- `dataSourcesUsed`
- `unknowns`
- `timestamp`
- `version`

Phase 1 does not claim to have a true Candidate Pool, EvidenceBundle, or ValidationResult. `candidatePool`, `rejectedCandidates`, and `rejectionReasons` are therefore allowed to be empty arrays. Missing proof is recorded in `unknowns` instead of being inferred from title, summary, plannerReason, or template text.

RouteIntent snapshot fields are kept inside `decision-trace-schema.mjs`; no standalone RouteIntent module was created.

## 3. Store Behavior

`decision-trace-store.mjs` implements append-only JSONL storage.

- Default path: `.route-v2-cache/decision-traces.jsonl`
- Override path: `ROUTE_V2_TRACE_PATH`
- Each trace is one JSON line.
- Parent directory is created only when trace writing is enabled.
- Corrupt or unparsable existing JSONL lines are isolated by `readAll()` and do not affect legacy generation.
- Trace storage is fully separate from `.route-v2-cache/accepted-routes.json`.

## 4. Feature Flag Behavior

Implemented flags:

- `ROUTE_V2_TRACE_ENABLED=false`
- `ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT=false`

Observed behavior:

- Flag off: no trace file is created, no trace is read, RouteRecord output is unchanged.
- Flag on: a sidecar trace is appended for newly generated planner/materialize routes.
- Trace write failure: returned as diagnostic on the candidate wrapper; legacy RouteRecord still returns.
- `ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT` remains false by default and does not alter legacy acceptance in Phase 1.

Other V2 flags remain unset / false by default.

## 5. Planner And Materialize Hook Locations

Planner hook:

- `src/lib/routes/route-composition-planner.mjs`
- New pipeline path: after validation and dedupe acceptance, before returning the accepted candidate wrapper.
- Legacy evidence-stitch path: after legacy candidate passes quality, composition, strategy, dedupe, and score gates.
- Trace result is attached to the returned candidate wrapper as `decisionTrace`.
- The `record` object is not modified.

Materialize hook:

- `scripts/materialize-route-pool.mjs`
- Cross and single materialization loops now keep the result of `makeRoute(...)` in a local `route` variable, preserving the original `serial++` timing.
- After `addCandidate(route, ...)` succeeds, a trace is appended when the trace flag is enabled.
- The materialized RouteRecord, output ordering, accepted write logic, and output structure are unchanged.

## 6. RouteRecord Unchanged Evidence

`node scripts/verify-route-v2-phase1-trace.mjs` ran a controlled planner generation twice:

- once with `ROUTE_V2_TRACE_ENABLED=false`
- once with `ROUTE_V2_TRACE_ENABLED=true`

The script fixes `Date` to a stable value and performs a deep equality comparison of the two returned `RouteRecord` objects.

Result:

- `routeRecordUnchanged: true`
- one trace line written only when enabled
- no trace file created when disabled

## 7. Trace Write Failure Degradation

The Phase 1 verification script points trace storage at a directory path to force append failure.

Result:

- Planner still returned one accepted legacy RouteRecord.
- `decisionTrace.written === false`
- `decisionTrace.reason === "trace-write-failed"`

This verifies that trace write failure does not block legacy generation.

## 8. Test Results

Required Phase 1 verification:

| Command | Result |
| --- | --- |
| `node scripts/verify-route-v2-phase1-trace.mjs` | PASS |

Regression scripts:

| Command | Result |
| --- | --- |
| `node scripts/verify-concept-taxonomy.mjs` | PASS |
| `node scripts/verify-gold-cases.mjs` | PASS |
| `node scripts/verify-route-content-quality.mjs` | PASS |

Code checks:

| Command | Result |
| --- | --- |
| `git diff --check` | PASS, exit code 0 |
| sensitive / absolute path scan on changed files | PASS, no hits |
| trace-read scan in Feed/Search/Detail files | PASS, no hits |

## 9. Accepted Repository And Bootstrap Hash Comparison

Before implementation:

| Item | Value |
| --- | --- |
| accepted repository SHA-256 | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` |
| `route-feed-bootstrap.js` SHA-256 | `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef` |
| raw accepted route count | 5,500 |
| effective route count | 4,577 |

After implementation:

| Item | Value |
| --- | --- |
| accepted repository SHA-256 | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` |
| `route-feed-bootstrap.js` SHA-256 | `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef` |
| raw accepted route count | 5,500 |
| effective route count | 4,577 |
| real `.route-v2-cache/decision-traces.jsonl` created | NO |

Conclusion: accepted repository and bootstrap are unchanged.

## 10. FeedReadyPoolCount Comparison

Official metric from `FEED_ELIGIBLE_METRIC_DEFINITION.md`: `repository.list({ limit: 99999, routeType? }).total`.

Before implementation:

| Metric | Value |
| --- | ---: |
| all | 851 |
| cross | 357 |
| single | 494 |

After implementation:

| Metric | Value |
| --- | ---: |
| all | 851 |
| cross | 357 |
| single | 494 |

Conclusion: FeedReadyPoolCount is unchanged.

## 11. Feed / Search / Detail Smoke Results

Both smoke runs used a temporary directory for Search writable files.

Before implementation:

| Check | Result |
| --- | --- |
| home page | HTTP 200 |
| routes page | HTTP 200 |
| Feed API | ok, 6 records, `cacheStatus=REPOSITORY` |
| Detail API | ok, `cacheStatus=REPOSITORY`, record present |
| Search API | ok, 0 records, 8 suggestions, `cacheStatus=EMPTY` |

After implementation:

| Check | Result |
| --- | --- |
| home page | HTTP 200 |
| routes page | HTTP 200 |
| Feed API | ok, 6 records, `cacheStatus=REPOSITORY` |
| Detail API | ok, `cacheStatus=REPOSITORY`, record present |
| Search API | ok, 0 records, 8 suggestions, `cacheStatus=EMPTY` |
| trace file with flag off | not created |

Conclusion: Feed, Search, and Detail smoke behavior is unchanged.

## 12. Known Unknowns And Not Implemented

Known Unknowns intentionally preserved:

- true pre-generation candidate pool
- rejected candidate list
- per-candidate rejection reasons
- full LLM comparison trace
- per-route Tavily / Wikivoyage contribution trace
- ValidationResult
- EvidenceBundle
- Candidate Pool
- Review / Ready Pool changes

Not implemented in Phase 1:

- no Candidate Pool storage
- no EvidenceBundle storage
- no ValidationResult storage
- no V2 Review
- no Feed gating
- no Search V2 lifecycle change
- no accepted route migration
- no retroactive trace backfill for existing 5,500 accepted routes

## 13. Rollback Method

No data rollback is needed because accepted routes, bootstrap, Feed, Search, Detail, images, and real cache files were not changed.

Code rollback options:

1. Turn off `ROUTE_V2_TRACE_ENABLED` to disable all trace writing.
2. Delete or ignore `.route-v2-cache/decision-traces.jsonl` if a future trace run creates it.
3. Revert the Phase 1 branch changes before commit, or reset the branch to `main`.
4. The `pre-route-v2` tag remains available as the pre-V2 rollback point.

## 14. Commit Review Recommendation

Recommendation: suitable for commit review after user review.

Reasons:

- Phase 1 verification passes.
- Required regression scripts pass.
- RouteRecord output is unchanged in controlled deep comparison.
- accepted repository hash is unchanged.
- bootstrap hash is unchanged.
- FeedReadyPoolCount is unchanged.
- Feed/Search/Detail smoke behavior is unchanged.
- trace write failure degrades safely.
- no sensitive keys or absolute local paths were detected in changed files.
