# Route V2 Phase 2A Implementation Report

Generated: 2026-07-13

Scope: Route Generation V2 Phase 2A, RouteCandidate foundation only. No commit, push, merge, tag, Phase 2B work, planner hook, materialize hook, route regeneration, accepted repository rewrite, cache cleanup, Feed behavior change, Search behavior change, Detail behavior change, or image-system change was performed.

## 1. Modified And Added Files

Added:

- `src/lib/routes/route-candidate-pool.mjs`
- `scripts/verify-route-v2-phase2a-candidate-pool.mjs`
- `ROUTE_V2_PHASE_2A_IMPLEMENTATION_REPORT.md`

Modified:

- `src/lib/routes/index.mjs`

Carried forward as uncommitted planning document on this branch:

- `ROUTE_V2_PHASE_2_PROPOSAL.md`

## 2. RouteCandidate Schema

`route-candidate-pool.mjs` defines the Phase 2A candidate schema and helpers.

Required fields:

- `candidateId`
- `intentId`
- `countries`
- `destinations`
- `proposedOrder`
- `durationDays`
- `travelStyle`
- `generationSource`
- `supportingSignals`
- `status`
- `rejectionReasons`
- `unknowns`
- `createdAt`
- `version`

Schema version:

- `route-generation-v2-phase2a-candidate-v1`

Allowed neutral statuses in Phase 2A:

- `generated`
- `pending`
- `pending-evidence`

Phase 2A intentionally rejects `selected` and `rejected`, because this phase does not perform real candidate comparison.

The schema also rejects final `RouteRecord` display or acceptance fields, including:

- `name`
- `canonicalTitle`
- `summary`
- `recommendationText`
- `plannerReason`
- `coverAsset`
- `coverUrl`
- `contentQualityStatus`
- `repositoryStatus`
- `acceptedAt`
- `mediaReadyAt`

This prevents post-hoc copying from final route output into candidate records.

## 3. Candidate ID Behavior

`createRouteCandidateId()` creates a stable id from:

- `intentId`
- country codes
- destination ids
- `proposedOrder`
- `durationDays`
- `travelStyle`
- `generationSource`
- schema version

The Phase 2A verification confirms:

- same normalized input gives the same `candidateId`
- different proposed order gives a different `candidateId`

## 4. Candidate Pool Store Behavior

`createRouteCandidatePoolStore()` implements independent append-only JSONL storage.

Default path:

- `.route-v2-cache/route-candidate-pool.jsonl`

Override path:

- `ROUTE_V2_CANDIDATE_POOL_PATH`

Feature flag:

- `ROUTE_V2_CANDIDATE_POOL_ENABLED=false`

Observed behavior:

- Flag off: no file is created and append returns `candidate-pool-disabled`.
- Flag on: valid candidates are appended as one JSON object per line.
- Invalid candidates return `candidate-invalid` and are not written.
- Write failure returns `candidate-write-failed` and does not throw.
- `readAll()` parses each JSONL line independently.
- `listByIntent(intentId)` returns candidates for one intent.

Storage is fully separate from `.route-v2-cache/accepted-routes.json`.

## 5. Explicit Non-Changes

Phase 2A did not modify:

- `src/lib/routes/route-composition-planner.mjs`
- `scripts/materialize-route-pool.mjs`
- `src/lib/routes/discovery.mjs`
- `src/lib/routes/route-search-service.mjs`
- `routes.js`
- `route-detail.js`
- image/media modules
- `.route-v2-cache/accepted-routes.json`
- `route-feed-bootstrap.js`

No real route candidates were generated.

No existing RouteRecord output was changed.

No Feed, Search, Detail, image, accepted repository, Review, Ready Pool, EvidenceBundle, or ValidationResult behavior was changed.

## 6. Test Results

Required Phase 2A verification:

| Command | Result |
| --- | --- |
| `node scripts/verify-route-v2-phase2a-candidate-pool.mjs` | PASS |

Phase 2A verification covered:

- legal candidate can be saved and read
- invalid candidate is rejected
- `candidateId` is stable
- multiple candidates can belong to the same intent
- JSONL can be parsed line by line
- write failure is captured without throwing
- flag off does not write storage
- accepted repository is not modified
- real `.route-v2-cache/route-candidate-pool.jsonl` is not created
- Planner/materialize/Feed/Search/Detail do not read Candidate Pool

Required regression scripts:

| Command | Result |
| --- | --- |
| `node scripts/verify-route-v2-phase1-trace.mjs` | PASS |
| `node scripts/verify-concept-taxonomy.mjs` | PASS |
| `node scripts/verify-gold-cases.mjs` | PASS |
| `node scripts/verify-route-content-quality.mjs` | PASS |

## 7. Baseline Integrity

Accepted repository SHA-256:

- `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`

`route-feed-bootstrap.js` SHA-256:

- `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef`

Real candidate cache:

- `.route-v2-cache/route-candidate-pool.jsonl` does not exist after verification.

## 8. Known Unknowns And Not Implemented

Not implemented in Phase 2A:

- Planner integration
- materialize integration
- real candidate generation from Knowledge Graph
- candidate comparison
- selected candidate
- rejected candidate
- candidate pool in DecisionTrace
- EvidenceBundle
- ValidationResult
- Review
- Ready Pool
- Feed/Search/Detail/UI behavior

Unknowns intentionally preserved:

- which candidate would be selected for a real route request
- why a non-selected candidate would be rejected
- how EvidenceBundle will attach to candidateId
- how Phase 2B will preserve byte-for-byte RouteRecord equality once planner hook is added

## 9. Rollback Method

No data rollback is needed because accepted routes, bootstrap, Feed, Search, Detail, images, and real cache files were not changed.

Code rollback options:

1. Turn off `ROUTE_V2_CANDIDATE_POOL_ENABLED`.
2. Ignore or delete any future `.route-v2-cache/route-candidate-pool.jsonl` if a manual future run creates it.
3. Revert the Phase 2A branch changes.

## 10. Commit Review Recommendation

Recommendation: suitable for commit review after user review.

Reasons:

- Phase 2A verification passes.
- Required Phase 1 and baseline regression scripts pass.
- Candidate Pool is disabled by default.
- Candidate Pool storage is separate from accepted repository.
- No real candidate cache was created.
- Planner and materialize were not touched.
- Feed, Search, Detail, image system, accepted routes, and bootstrap were not changed.
