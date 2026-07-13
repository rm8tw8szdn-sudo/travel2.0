# Route Generation V2 Phase 2B Proposal

Generated: 2026-07-13

Scope: analysis and design only. Do not implement Phase 2B from this document without explicit user confirmation. Do not create a branch, change code, or start Phase 2B implementation from this proposal.

## 1. Phase 2B Goal

Phase 2B connects the Phase 2A Candidate Pool foundation to the current planner pipeline so that one route request can produce real `RouteCandidate` records before the final `RouteRecord` is built.

The key rule is:

> Candidate Pool observes real pre-record alternatives, but it does not choose the final route yet.

Phase 2B must preserve the existing planner output. The current `RouteRecord` path should still use the existing `buildRouteSkeleton()` result. Candidate generation runs beside it, writes sidecar candidate records when enabled, and cannot affect validation, dedupe, accepted output, Feed, Search, Detail, or images.

## 2. Candidate Sources

Candidates should come only from data and logic that already exist before `buildPlannerRecord()`.

Existing inputs:

- `context` passed into `createRouteCompositionPlanner().buildCandidates({ context })`
- `concept` from `buildRouteConcept(...)`
- `pool` from `selectDestinationPool(concept, context, knowledgeGraph)`
- `countryCodesForContext(context)`
- anchors from `anchorsForContext(concept, context)`
- destination coordinates through `coordinate(...)`
- distance helpers: `distanceKm(...)`, `routeDistanceSummary(...)`, `routeWithinConceptLimits(...)`, `routeDistanceLimits(...)`
- `maxDestinationsForConcept(concept)`
- duplicate/fingerprint helpers already available in `route-dedupe.mjs`

Candidate records must not read:

- final `record`
- `record.name`
- `record.summary`
- `record.plannerReason`
- `record.coverAsset`
- `record.contentQualityStatus`
- final accepted/repository/media fields

No Tavily, Wikivoyage, LLM, image search, or external API is allowed in Phase 2B.

## 3. Exact runPipeline Insertion Point

Current `runPipeline()` order in `src/lib/routes/route-composition-planner.mjs` is:

1. Build `concept`.
2. Query initial KG sample.
3. Apply explicit duration/style overrides.
4. Build `pool` with `selectDestinationPool(...)`.
5. Build final `skeleton` with `buildRouteSkeleton(...)`.
6. Optional LLM refine.
7. Decision tests.
8. Evidence check.
9. `buildPlannerRecord(...)`.
10. Validate.
11. Dedupe.
12. Phase 1 DecisionTrace sidecar.

Phase 2B should insert candidate generation immediately after step 4:

```text
const pool = selectDestinationPool(concept, context, knowledgeGraph);
if (!pool.length) { ... legacy return ... }

// Phase 2B sidecar starts here:
// build real RouteCandidate objects from context + concept + pool
// append to candidate pool store if enabled
// capture write diagnostics only
// do not change pool, skeleton, context, concept, or return value

const skeleton = buildRouteSkeleton(pool, concept, context);
```

This position proves candidates are generated before final `RouteRecord` fields exist.

Do not insert candidate generation after `buildPlannerRecord()`.

Do not replace the legacy `skeleton` in Phase 2B.

## 4. How To Keep RouteRecord Completely Unchanged

Phase 2B should run candidate generation as a pure side effect:

- It receives `context`, `concept`, and `pool`.
- It returns `{ candidates, appendResults, diagnostics }`.
- `runPipeline()` does not use these values to set `skeleton`.
- The line `const skeleton = buildRouteSkeleton(pool, concept, context);` remains the only source of final RouteRecord skeleton.
- No final candidate is marked `selected`.
- No candidate is marked `rejected`.
- No score is used for the existing route path.
- Candidate write failure is stored as diagnostics only.

The proof should be a controlled test:

1. Build one route with `ROUTE_V2_CANDIDATE_POOL_ENABLED=false`.
2. Build the same route with `ROUTE_V2_CANDIDATE_POOL_ENABLED=true`.
3. Freeze time.
4. Use the same mock KG pool and same context.
5. Deep-compare the returned `record`.
6. Assert equality.

If `record` differs in any field, Phase 2B fails.

## 5. Candidate Count

Default target:

- 8 candidates per request.

Allowed behavior:

- Produce fewer than 8 if the KG pool cannot support genuinely different candidates.
- Do not duplicate or trivially reorder the same route just to reach 8.
- Hard cap should remain 12 if a future env var is added.

Recommended env:

| Name | Default | Meaning |
| --- | ---: | --- |
| `ROUTE_V2_CANDIDATE_POOL_ENABLED` | `false` | Enables sidecar candidate generation and write. |
| `ROUTE_V2_CANDIDATE_POOL_SIZE` | `8` | Target candidate count. |
| `ROUTE_V2_CANDIDATE_POOL_MAX_SIZE` | `12` | Hard cap. |
| `ROUTE_V2_CANDIDATE_POOL_PATH` | `.route-v2-cache/route-candidate-pool.jsonl` | Candidate JSONL path; tests must override to temp dir. |

No new "required for accept" flag should affect legacy acceptance in Phase 2B.

## 6. How To Make Candidates Genuinely Different

Candidates must differ in at least one meaningful route dimension:

- country set
- destination set
- destination order
- route structure
- destination count
- anchor usage
- entity type mix
- cross-country balance

Do not count as meaningful:

- only changing `generationSource`
- only changing `supportingSignals`
- only changing `createdAt`
- only changing internal candidate id
- same destination set in same order with different labels
- same route after removing or adding one duplicate-equivalent destination

Recommended uniqueness key:

```text
candidateShapeKey =
  countries.sort().join("|")
  + "::"
  + proposedOrder.join(">")
```

Candidate generation should skip any candidate whose shape key already exists.

Additional diversity guard:

- If two candidates have the same destination set but different order, keep both only when the order changes segment structure meaningfully. Example: max segment, span, or first/last city changes.
- If all generated candidates use the same first city, try alternate starts from the KG pool before stopping.

## 7. Candidate Generation Methods

Phase 2B should generate neutral candidates from the selected KG pool.

All candidates use status:

- `generated`

All candidates use:

- `rejectionReasons: []`

Unknowns can explain Phase 2B limits:

- no comparison yet
- no evidence bundle yet
- not selected/rejected yet

Suggested generation methods:

### 7.1 legacy-skeleton-shadow

Use the current `buildRouteSkeleton(pool, concept, context)` output.

Purpose:

- Captures the route that legacy logic would currently use.
- Helps compare candidate pool against final RouteRecord.

Important:

- Status remains `generated`, not `selected`.
- The final planner still independently calls `buildRouteSkeleton(...)` as today.

### 7.2 alternate-start-nearest

Run nearest-neighbor style skeleton generation from different starting points in `pool`.

Purpose:

- Produces different first city and often different destination order.
- Uses same KG and distance logic.

### 7.3 anchor-first-window

When anchors exist, build candidates from anchor-matching destinations plus nearby or next-ranked KG items.

Purpose:

- Preserves specific intent anchors without final rendering.

### 7.4 duration-fit-short

Use fewer destinations when duration is short or when route span gets too large.

Purpose:

- Makes duration affect candidate shape before title text.

### 7.5 duration-fit-full

Use max destination count allowed by `maxDestinationsForConcept(concept)` when distance limits allow.

Purpose:

- Provides a fuller route alternative.

### 7.6 country-balanced

For multi-country contexts, force at least one destination from each route country where possible.

Purpose:

- Avoids a cross-country request producing candidates dominated by one country.

### 7.7 reverse-structure

Reverse a valid skeleton only if first/last and segment structure meaningfully differ and route limits still pass.

Purpose:

- Gives an order alternative without external data.

### 7.8 entity-type-mix

Prefer a different mix of cities, mountains, natural places, cultural stops, or anchor-like entities.

Purpose:

- Creates route-structure differences, not just reordered cities.

## 8. Candidate Object Mapping

For each generated skeleton:

- `intentId`: derive from context/concept using Phase 1 route intent snapshot style, or a deterministic context hash.
- `countries`: from skeleton destination country codes plus context countries.
- `destinations`: normalized KG destination objects.
- `proposedOrder`: destination ids in skeleton order.
- `durationDays`: `context.durationDays` or `concept.durationDays`.
- `travelStyle`: `context.travelStyle` or `concept.travelStyle`.
- `generationSource`: use method-specific value, for example `planner-kg:alternate-start-nearest`.
- `supportingSignals`: include real pre-record signals:
  - method
  - source pool size
  - anchor hit count
  - destination count
  - country count
  - distance summary
  - duration band
  - travel style
- `status`: `generated`
- `rejectionReasons`: `[]`
- `unknowns`: include "Phase 2B does not compare, select, reject, score, or validate candidates."

If a generated skeleton is invalid for schema or too short, skip it. Do not write it as `rejected` in Phase 2B.

## 9. Feature Flag Control

Phase 2B should reuse Phase 2A flags and add only count parsing logic if needed.

Behavior when disabled:

- No candidate generation.
- No candidate store is created.
- `runPipeline()` behaves exactly like current main.

Behavior when enabled:

- Generate up to target count from pre-record KG pool.
- Append each candidate to Candidate Pool store.
- Store append diagnostics on the accepted wrapper if useful, e.g. `candidatePoolWrite`.
- Do not change `record`.
- Do not change `accepted` / `rejected` result semantics.

Write failure:

- Catch and return diagnostics.
- Continue legacy route generation.
- Do not throw.
- Do not mark route rejected.

## 10. Files To Modify

Expected modifications:

| File | Reason |
| --- | --- |
| `src/lib/routes/route-composition-planner.mjs` | Add sidecar candidate generation after KG pool selection and before `buildRouteSkeleton()`. Inject/create candidate store from env. |
| `src/lib/routes/route-candidate-pool.mjs` | Add helper functions for building candidate objects from KG skeletons, count parsing, shape dedupe, and safe append-many. |
| `scripts/verify-route-v2-phase2b-candidate-planner.mjs` | New isolated planner integration verification script. |
| `ROUTE_V2_PHASE_2B_IMPLEMENTATION_REPORT.md` | Implementation report after coding. |

Possible minimal modification:

| File | Reason |
| --- | --- |
| `src/lib/routes/index.mjs` | Only if new helpers need to be exported for the verification script. |

Files that must not be modified:

- `scripts/materialize-route-pool.mjs`
- `.route-v2-cache/accepted-routes.json`
- `route-feed-bootstrap.js`
- `src/lib/routes/discovery.mjs`
- `src/lib/routes/route-search-service.mjs`
- `routes.js`
- `route-detail.js`
- `server.js`
- image/media modules

## 11. Testing Plan

Create:

```text
scripts/verify-route-v2-phase2b-candidate-planner.mjs
```

The script should use a temp directory for:

- accepted repository
- evidence repository
- decision trace path
- candidate pool path

Required checks:

1. Flag off: no candidate file is created.
2. Flag on: candidate file is created in temp directory only.
3. Real `.route-v2-cache/route-candidate-pool.jsonl` does not exist or remains unchanged.
4. Candidate generation happens before final record fields exist by asserting candidates contain no title/summary/plannerReason/cover/status fields.
5. Candidate count is greater than 1 when mock KG pool supports it.
6. Candidate count is at most target count.
7. Candidates are unique by shape key.
8. At least two candidates differ in destination order, destination set, country mix, or destination count.
9. All candidate statuses are neutral `generated` or `pending` / `pending-evidence`; no `selected` and no `rejected`.
10. All `rejectionReasons` are empty arrays.
11. RouteRecord with flag on deep-equals RouteRecord with flag off.
12. Candidate write failure still returns the same RouteRecord.
13. Planner/materialize legacy paths outside context mode remain unchanged.
14. Feed/Search/Detail files do not import or read candidate pool.
15. accepted repository hash unchanged.
16. `route-feed-bootstrap.js` hash unchanged.

Regression scripts:

- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`
- `node scripts/verify-route-v2-phase1-trace.mjs`
- `node scripts/verify-concept-taxonomy.mjs`
- `node scripts/verify-gold-cases.mjs`
- `node scripts/verify-route-content-quality.mjs`
- `git diff --check`

Optional smoke, if implementation touches only planner module:

- Feed/Search/Detail smoke can be recorded in report, but Phase 2B should not require server changes.

## 12. Failure Degradation Proof

The verification script should force candidate store failure by setting `ROUTE_V2_CANDIDATE_POOL_PATH` to a directory path.

Expected:

- candidate append result is `candidate-write-failed`
- planner still returns one accepted legacy candidate
- returned `record` deep-equals the flag-off `record`
- no real cache file is created

This proves Candidate Pool remains sidecar-only.

## 13. How To Prove No Feed/Search/Detail Impact

Use three checks:

1. Git diff check:
   - No diff in Feed/Search/Detail files.

2. Static import scan:
   - `routes.js`, `route-detail.js`, `server.js`, `discovery.mjs`, `route-search-service.mjs`, and `accepted-repository.mjs` must not import or reference `route-candidate-pool`.

3. Baseline hash check:
   - accepted repository hash unchanged.
   - `route-feed-bootstrap.js` hash unchanged.

## 14. Biggest Risks

### Risk 1: Accidentally changing final RouteRecord

If implementation reuses generated candidate output to set final skeleton, the final route can change. Avoid this by keeping the existing `buildRouteSkeleton(pool, concept, context)` call as the only final skeleton source.

### Risk 2: Candidate pool becomes fake or too similar

If all candidates share the same country, destinations, order, and structure, Phase 2B does not prove anything. Avoid this with shape-key dedupe and a hard rule that candidates must differ in meaningful route structure.

### Risk 3: Phase 2B quietly becomes Phase 3

Do not add evidence, LLM comparison, selected/rejected, scoring, or validation. Those are later phases.

### Risk 4: Storage pollution

Tests must always override `ROUTE_V2_CANDIDATE_POOL_PATH` to temp directories and assert real cache was not created.

### Risk 5: Existing Phase 2A schema is too strict for future fields

Phase 2B should not expand candidate schema with final fields. If more metadata is needed, put it inside `supportingSignals` or `unknowns`, not top-level display fields.

## 15. Should Phase 2B Be Split Again?

Recommendation: yes, split Phase 2B into two small implementation steps if the user wants maximum safety.

### Phase 2B-1: Candidate Builders Only

Add pure helper functions in `route-candidate-pool.mjs`:

- build candidates from a KG pool
- dedupe by shape key
- enforce target count
- verify meaningful difference

No planner import yet.

Acceptance:

- Unit-style script proves multiple distinct candidates from mock KG pool.
- No `route-composition-planner.mjs` change.

### Phase 2B-2: Planner Sidecar Hook

Add the `runPipeline()` hook:

- generate candidates after `selectDestinationPool()`
- append to temp/sidecar store when enabled
- keep final RouteRecord unchanged

Acceptance:

- Deep RouteRecord equality on/off.
- Candidate write failure degrades.
- No Feed/Search/Detail/accepted impact.

If speed matters, these can be one PR, but the implementation should still be structured internally as builder first, hook second.

## 16. Final Recommendation

Proceed with Phase 2B only after explicit approval.

Recommended implementation shape:

- Default off.
- Builder functions first.
- Hook after KG pool selection and before `buildRouteSkeleton()`.
- Do not choose best candidate.
- Do not write selected/rejected.
- Do not modify final skeleton.
- Prove by deep equality that RouteRecord remains unchanged.
