# Route Generation V2 Phase 2 Proposal

Generated: 2026-07-13

Scope: analysis and design only. Do not implement Phase 2 from this document without explicit user confirmation. This proposal is based on `ROUTE_GENERATION_V2_ARCHITECTURE.md`, `ROUTE_GENERATION_V2_MIGRATION_MATRIX.md`, `IMPLEMENTATION_CONTRACT.md`, `ROUTE_V2_PHASE_1_IMPLEMENTATION_REPORT.md`, and the current `main` code after Phase 1 merge.

## 1. Phase 2 Goal

Phase 2 should add a real `RouteCandidate` pool for one route-generation request.

The important boundary is:

- Generate multiple candidate route skeletons before the final `RouteRecord` exists.
- Record selected and rejected candidates as candidate data.
- Keep old final `RouteRecord` output unchanged.
- Do not connect Candidate Pool to Feed, Search, Detail, image generation, Review, Ready Pool, or accepted repository writes.

Phase 2 is therefore an observability and decision-shape upgrade, not a user-facing route-quality upgrade yet.

## 2. Current Route Generation Locations

Current project has two real route generation paths.

| Path | File | Current behavior | Phase 2 relevance |
| --- | --- | --- | --- |
| Planner pipeline | `src/lib/routes/route-composition-planner.mjs` | `buildCandidates()` with `context` calls `runPipeline()`, then `buildRouteConcept -> selectDestinationPool -> buildRouteSkeleton -> optional LLM refine -> evidenceCheck -> buildPlannerRecord -> validate -> dedupe -> accepted wrapper`. | Best Phase 2 insertion point. It already represents one route request and has concept/context/KG pool before final record. |
| Legacy evidence stitch | `src/lib/routes/route-composition-planner.mjs` | `buildCandidates()` without context groups evidence by source route and produces old evidence-composed candidates. | Keep unchanged in Phase 2, except optional trace/candidate diagnostics later. |
| Bulk materialization | `scripts/materialize-route-pool.mjs` | Reads KG pool and accepted routes, loops profiles/country plans, creates many materialized `RouteRecord`s, writes accepted repository. | Do not run or change behavior in Phase 2A. It is bulk data generation, not the target "one route request" path. |
| Search realtime planner | `src/lib/routes/route-search-service.mjs` plus discovery handler | Search may call planner fallback, but Search V1 remains separate from Feed. | Do not change in Phase 2. Candidate Pool must not appear in Search responses. |

## 3. Best Insertion Point

The safest insertion point is inside `runPipeline()` in `src/lib/routes/route-composition-planner.mjs`, after:

1. `buildRouteConcept(context)`
2. `selectDestinationPool(concept, context, knowledgeGraph)`

and before:

3. current `buildRouteSkeleton(pool, concept, context)`
4. `buildPlannerRecord(...)`

Reason:

- At that point the system has true inputs: context, concept, country constraints, duration/style/theme, and Knowledge Graph destination pool.
- Final title, summary, plannerReason, qualityScore, and `RouteRecord` do not exist yet.
- Multiple candidate skeletons can be generated from the same pool without changing the downstream record builder.
- One selected candidate can be converted back to the existing skeleton shape so the final `RouteRecord` remains byte-for-byte comparable where tests use fixed time/input.

Phase 2 should not attach Candidate Pool at `buildPlannerRecord()` because that would be too late and risks copying final output backward.

## 4. Minimal RouteCandidate Fields

Minimum viable `RouteCandidate` for Phase 2:

| Field | Required | Meaning |
| --- | --- | --- |
| `candidateId` | yes | Stable hash from `intentId`, countries, destination ids, proposed order, generation method, and schema version. |
| `intentId` | yes | From Phase 1 RouteIntent snapshot logic or context-derived normalized hash. |
| `countries` | yes | Country codes used by this candidate. |
| `destinations` | yes | Destination objects with `id/wikidataId`, `name`, `countryCode`, `latitude`, `longitude`, `entityTypeName`. |
| `proposedOrder` | yes | Ordered destination ids before final record rendering. |
| `generationSource` | yes | `knowledge-graph`, `knowledge-graph-anchor`, `knowledge-graph-distance`, `knowledge-graph-duration-fit`, etc. |
| `generationMethod` | yes | Specific candidate-builder name, such as `anchor-first`, `nearest-neighbor`, `distance-balanced`, `duration-fit`, `reverse-order-check`. |
| `initialReason` | yes | Short pre-record reason, based only on input constraints and KG pool. |
| `supportingSignals` | yes | Structured signals used before selection, for example anchor hits, distance span, destination count fit, country coverage. |
| `constraintSnapshot` | yes | Duration, style, theme, season, countries, exclusions at generation time. |
| `distanceSummary` | yes | `maxSegmentKm`, `spanKm`, `complete`, `missingCoordinates`. |
| `noveltyScore` | yes | Lightweight repository-relative score; can start as deterministic placeholder from duplicate/cluster distance, but must be computed before record creation. |
| `duplicateSignals` | yes | Similar title/skeleton/cluster risk based on destination/country fingerprints, not final title. |
| `status` | yes | `generated`, `selected`, `rejected`, `pending-evidence`, `invalid`. |
| `rejectionReasons` | yes | Empty for generated/selected; structured list for rejected candidates. |
| `createdAt` | yes | ISO timestamp, injectable in tests. |
| `version` | yes | Candidate schema version. |

Fields that should not be in `RouteCandidate` during Phase 2:

- final route title
- final summary
- final plannerReason
- final cover/image fields
- `contentQualityStatus`
- accepted/repository/feed status

Those belong to `RouteRecord` or later Review/Ready Pool layers, not the candidate pool.

## 5. Candidate Count Per Request

Recommended default:

- Generate 8 candidates per route request.
- Allow a config range of 3 to 12.
- Stop early if the KG pool is too small.

Suggested environment variables:

| Flag | Default | Meaning |
| --- | ---: | --- |
| `ROUTE_V2_CANDIDATE_POOL_ENABLED` | `false` | Enables candidate generation and sidecar candidate pool writing. |
| `ROUTE_V2_CANDIDATE_POOL_SIZE` | `8` | Target generated candidate count per request. |
| `ROUTE_V2_CANDIDATE_POOL_MAX_SIZE` | `12` | Hard cap. |
| `ROUTE_V2_CANDIDATE_POOL_PATH` | `.route-v2-cache/route-candidate-pool.jsonl` | Local append-only storage path. |
| `ROUTE_V2_CANDIDATE_POOL_REQUIRED_FOR_TRACE` | `false` | If false, candidate write failure does not change legacy output. Keep false in Phase 2. |

Why not generate 20+ candidates now:

- Current KG pool and skeleton logic are deterministic and simple.
- Too many near-identical candidates would create noise before EvidenceBundle and strategy-specific validators exist.
- The goal is proving pre-record alternatives, not maximizing generation diversity yet.

## 6. Candidate Sources

Phase 2 should use existing data and logic only.

Primary source:

- `knowledgeGraph.queryDestinations()` via `selectDestinationPool()`.

Existing logic to reuse:

- `countryCodesForContext(context)`
- `anchorsForContext(concept, context)`
- `anchorIndex(...)`
- `coordinate(...)`
- `distanceKm(...)`
- `routeDistanceSummary(...)`
- `routeDistanceLimits(concept)`
- `routeWithinConceptLimits(...)`
- `maxDestinationsForConcept(concept)`
- `duplicateDistance(...)` or destination/country fingerprint helpers from `route-dedupe.mjs`

Candidate generation variants:

| Method | How it differs | Purpose |
| --- | --- | --- |
| `anchor-first` | Prioritize anchor-matching KG destinations, keep anchor order. | Preserve user/intent anchors such as Tokyo, Kyoto, Sahara. |
| `nearest-neighbor` | Current behavior: start from first eligible destination and greedily add nearest valid next point. | Legacy-compatible selected candidate. |
| `distance-balanced` | Try different starting points and keep routes within span/segment limits. | Avoid always selecting first KG item. |
| `duration-fit` | Adjust destination count to fit `durationDays` / `durationBand`. | Make duration a true candidate constraint. |
| `style-fit` | Prefer destination entity types that match travelStyle, e.g. city-break vs deep-dive vs transport journey. | Make style visible before title/summary. |
| `country-balanced` | For multi-country contexts, force at least one destination per country where possible. | Avoid one country dominating cross-country candidates. |
| `reverse-order-check` | Reverse a valid skeleton and compare distance/order constraints. | Create a real alternative without new data source. |
| `novelty-check` | Prefer lower-duplicate destination sets using existing repository fingerprints. | Start connecting coverage/novelty without changing Feed. |

No Tavily, Wikivoyage, LLM, image search, or route regeneration should be introduced in Phase 2.

## 7. How To Avoid Post-Hoc Candidate Copying

Candidate Pool is only meaningful if it exists before final `RouteRecord`.

Rules:

1. Candidate generation must run before `buildPlannerRecord(...)`.
2. Candidate objects must not read `record.name`, `record.summary`, `record.plannerReason`, `record.coverAsset`, or `record.contentQualityStatus`.
3. `selectedCandidate.candidateId` must be chosen before `buildPlannerRecord(...)`.
4. `buildPlannerRecord(...)` should receive the selected candidate's destination order as its skeleton input.
5. DecisionTrace should embed candidate summaries from the pool, not reconstruct them from the final route.
6. Tests must fail if candidatePool is created from final route fields.
7. The current legacy selected route should still be produced by choosing the `nearest-neighbor` candidate first when flags are enabled, so RouteRecord remains unchanged.

This gives us a real candidate pool while preserving old output.

## 8. What Phase 2 Explicitly Does Not Do

Phase 2 must not:

- change final `RouteRecord` output
- write to `.route-v2-cache/accepted-routes.json`
- rewrite or regenerate accepted routes
- run bulk `scripts/materialize-route-pool.mjs`
- change `route-feed-bootstrap.js`
- change Feed API, Search API, Detail API, or frontend rendering
- change image selection, preloading, verification, or dedupe
- call Tavily, Wikivoyage, LLM, or external APIs
- add EvidenceBundle
- add ValidationResult
- add Review / Ready Pool behavior
- auto-accept V2 routes
- expose candidate state in user UI
- use candidate pool for Feed ranking or Search ranking
- require candidate write success for legacy generation

## 9. Feature Flag Design

Phase 2 should be fully off by default.

| Flag | Default | Behavior |
| --- | --- | --- |
| `ROUTE_V2_CANDIDATE_POOL_ENABLED` | `false` | When false, planner behavior is exactly Phase 1 behavior. No candidate pool file is created. |
| `ROUTE_V2_CANDIDATE_POOL_SIZE` | `8` | Target candidates per request when enabled. |
| `ROUTE_V2_CANDIDATE_POOL_MAX_SIZE` | `12` | Prevent accidental large candidate pools. |
| `ROUTE_V2_CANDIDATE_POOL_PATH` | `.route-v2-cache/route-candidate-pool.jsonl` | Sidecar JSONL path. Tests can override to temp dir. |
| `ROUTE_V2_CANDIDATE_POOL_REQUIRED_FOR_TRACE` | `false` | Keep false. Candidate write failure becomes diagnostic only. |
| `ROUTE_V2_TRACE_ENABLED` | existing default `false` | If also enabled, DecisionTrace may include candidatePool summaries. |

Flag interactions:

- Candidate Pool can be enabled without trace, writing only candidate JSONL diagnostics.
- Trace can be enabled without Candidate Pool, preserving Phase 1 behavior.
- If both are enabled, trace includes real candidatePool and rejectedCandidates instead of Phase 1 Unknown for those fields.
- No flag combination may change Feed/Search/Detail or accepted repository output in Phase 2.

## 10. Proposed Files To Add Or Modify

Expected additions:

| File | Purpose |
| --- | --- |
| `src/lib/routes/route-candidate-pool.mjs` | RouteCandidate schema helpers, candidate id/hash, JSONL store, validation, append/read helpers. |
| `scripts/verify-route-v2-phase2-candidate-pool.mjs` | Isolated verification script for flag behavior, candidate pool content, RouteRecord invariance, and no Feed/Search/Detail reads. |
| `ROUTE_V2_PHASE_2_IMPLEMENTATION_REPORT.md` | Created during implementation, not now. |

Expected modifications:

| File | Purpose |
| --- | --- |
| `src/lib/routes/route-composition-planner.mjs` | Add candidate-generation branch inside `runPipeline()` behind flag. Use selected candidate skeleton to preserve final record. |
| `src/lib/routes/decision-trace-schema.mjs` | Allow DecisionTrace to carry real candidate pool summaries when provided, without changing Phase 1 legacy trace behavior. |
| `src/lib/routes/decision-trace-store.mjs` | Optional helper to append trace with candidate pool; no read path for Feed/Search/Detail. |
| `src/lib/routes/index.mjs` | Export candidate pool helpers for tests. |

Files that should remain untouched in Phase 2:

- `.route-v2-cache/accepted-routes.json`
- `route-feed-bootstrap.js`
- `routes.js`
- `route-detail.js`
- `server.js` unless a test harness proves an import-only change is unavoidable; default plan says no.
- `src/lib/routes/discovery.mjs`
- `src/lib/routes/route-search-service.mjs`
- image/media modules
- `scripts/materialize-route-pool.mjs` in Phase 2A

## 11. Test And Acceptance Criteria

Required isolated test script:

`node scripts/verify-route-v2-phase2-candidate-pool.mjs`

It should verify:

1. Flag off: no candidate pool file is created.
2. Flag off: returned `RouteRecord` is identical to Phase 1 behavior.
3. Flag on: one controlled planner request writes one candidate pool JSONL record.
4. Candidate pool has more than one candidate when the KG pool has enough destinations.
5. Candidate objects are created before final record fields exist: no title, summary, plannerReason, cover, accepted status.
6. One candidate is marked `selected`.
7. At least one non-selected candidate is marked `rejected` or `generated` with clear status.
8. Every rejected candidate has a structured reason if it failed a rule.
9. Candidate IDs are stable for the same intent/order and differ for different orders.
10. Selected candidate's proposed order is the exact skeleton used to build the final RouteRecord.
11. With candidate pool enabled and disabled, the final RouteRecord deep comparison is identical for controlled input.
12. Candidate pool write failure does not block legacy RouteRecord generation.
13. Candidate pool storage is separate from accepted repository and decision trace storage.
14. Loading old accepted routes does not backfill candidates.
15. Feed/Search/Detail files do not import or read `route-candidate-pool.mjs`.

Regression scripts to rerun:

- `node scripts/verify-route-v2-phase1-trace.mjs`
- `node scripts/verify-concept-taxonomy.mjs`
- `node scripts/verify-gold-cases.mjs`
- `node scripts/verify-route-content-quality.mjs`
- `git diff --check`

Baseline checks:

- accepted repository SHA-256 unchanged
- `route-feed-bootstrap.js` SHA-256 unchanged
- raw accepted route count unchanged
- official FeedReadyPoolCount unchanged: all/cross/single
- Feed/Search/Detail smoke responses unchanged
- real `.route-v2-cache/route-candidate-pool.jsonl` not created unless explicitly enabled, and tests must redirect to temp storage

## 12. Recommended Phase 2 Split

Yes, Phase 2 should be split into 2A and 2B.

### Phase 2A: Candidate Schema And Store Only

Goal:

- Add `RouteCandidate` schema helpers and append-only candidate pool store.
- Add isolated tests using synthetic candidate objects.
- Do not modify planner generation yet.

Why:

- Low risk.
- Establishes stable ids, validation, storage, and flag behavior.
- Makes later planner hook easier to review.

Acceptance:

- Store is disabled by default.
- JSONL is valid.
- Corrupt records do not break reads.
- Candidate validation rejects post-hoc fields like final title/summary/cover.
- No business code reads the store.

### Phase 2B: Planner Hook For Real Candidate Pool

Goal:

- Hook candidate generation into `runPipeline()` after KG pool selection and before `buildPlannerRecord()`.
- Generate 3-8 real pre-record candidates from KG pool.
- Select the legacy-compatible candidate so final RouteRecord remains unchanged.
- If trace is enabled, DecisionTrace includes real candidate pool summaries.

Why:

- This is where behavior risk exists.
- It needs RouteRecord deep comparison, hash checks, and Feed/Search/Detail smoke tests.

Acceptance:

- RouteRecord unchanged.
- Candidate pool proves multiple alternatives existed before final route rendering.
- No Feed/Search/Detail/accepted repository/image impact.

## 13. Biggest Risks

1. Accidentally changing final route output.

The current selected skeleton is produced by `buildRouteSkeleton()`. If Phase 2 candidate selection picks a different skeleton, final title, destinations, id, summary, dedupe, and validation can change. Mitigation: include the current `buildRouteSkeleton()` result as the first `nearest-neighbor` candidate and select it by default in Phase 2.

2. Creating fake candidates that are just variants of the final route.

If candidates are built after `buildPlannerRecord()`, Phase 2 becomes another fake trace layer. Mitigation: schema must reject final display fields, and tests must assert candidate generation happens from KG pool/concept before record rendering.

3. Candidate pool noise and near-duplicates.

Current KG and distance rules may produce many similar candidates. Mitigation: cap at 8 by default, dedupe by destination set/order, and keep rejected/generated reasons explicit.

4. Storage or flag mistakes affecting real cache.

Candidate pool JSONL must be sidecar storage and tests must use temp paths. Mitigation: default flag false, explicit `ROUTE_V2_CANDIDATE_POOL_PATH`, and baseline hash checks.

5. Phase boundary creep.

It is tempting to add EvidenceBundle, validation, or smarter strategy logic. That belongs to later phases. Phase 2 should only prove pre-record alternatives.

## 14. Suggested Implementation Order For Future Work

Do not execute now. When the user approves Phase 2 implementation, use this order:

1. Create a Phase 2 branch from `main`.
2. Implement Phase 2A schema/store and isolated tests.
3. Run regression scripts and review diff.
4. Commit Phase 2A if clean.
5. Implement Phase 2B planner hook behind flags.
6. Add controlled planner tests comparing RouteRecord on/off.
7. Run baseline hash, FeedReadyPoolCount, and Feed/Search/Detail smoke checks.
8. Write `ROUTE_V2_PHASE_2_IMPLEMENTATION_REPORT.md`.
9. Stop for review before commit/push/PR.

## 15. Recommendation

Recommendation: split Phase 2 into 2A and 2B.

Phase 2A should be accepted only when the schema/store is safe and inert. Phase 2B should be accepted only when a real planner request produces multiple pre-record candidates while final `RouteRecord`, accepted repository, bootstrap, Feed, Search, Detail, and image behavior all remain unchanged.
