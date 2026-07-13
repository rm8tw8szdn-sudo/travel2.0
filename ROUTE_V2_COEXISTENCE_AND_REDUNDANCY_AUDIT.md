# Route Generation V2 Coexistence and Redundancy Audit

Generated on: 2026-07-13

Branch: `codex/route-v2-redundancy-audit`

Scope: static analysis only. No business code, route data, cache, tests, Planner behavior, Feed, Search, Detail, or image system was changed.

## Executive Summary

当前旧 Planner 与 V2 代码叠在一起，属于正常的渐进迁移结构。

截至 Phase 2B-2：

- DecisionTrace 已接入旧 Planner 和 materialize 路径，但默认关闭。
- RouteCandidate schema / store 已存在，但默认关闭。
- Candidate Builder 已作为纯函数存在。
- Planner Candidate Sidecar 已在 `selectDestinationPool()` 之后、`buildRouteSkeleton()` 之前旁路接入。
- 最终 `RouteRecord` 仍由旧链路的 `buildRouteSkeleton()`、可选 LLM refine、`buildPlannerRecord()`、validation、dedupe 决定。

本次审计未发现 Candidate Pool 与旧 Planner 同时影响最终路线的风险。候选池结果不会进入 `buildRouteSkeleton()`、`buildPlannerRecord()`、validation、dedupe、accepted/rejected 判断或 Feed/Search/Detail。

确实存在重复工具函数和重复测试脚手架，主要集中在：

- stable hash / stable JSON
- `cleanString` / `unique`
- JSONL append/read store
- Feature Flag 解析
- 测试临时目录、文件 hash、文件状态保护

这些重复大多是 Phase 1 到 Phase 2B-2 为了隔离风险而有意保留的。建议在 Phase 3 前只清理低风险工具层重复，不要动 Planner 主链路、RouteRecord 输出链路、验收脚本的独立断言。

## Current Call Relationship

### Main Planner Path

真实调用链如下：

```text
createRouteCompositionPlanner()
  -> buildCandidates({ context })
    -> runPipeline()
      -> buildRouteConcept()
      -> selectDestinationPool()
      -> writeCandidatePoolSidecarSafe()
           -> candidatePoolStore.enabled()
           -> buildRouteCandidatesFromPool() only when flag enabled
           -> candidatePoolStore.append() only when flag enabled
      -> buildRouteSkeleton()
      -> optional llmRefineProvider.refine()
      -> runAllDecisionTests()
      -> evidenceCheck()
      -> optional collectMissingSegmentEvidence()
      -> buildPlannerRecord()
      -> validatePlannerCandidate()
      -> duplicateDistance()
      -> writeLegacyDecisionTraceSafe()
      -> return accepted/rejected
```

Evidence:

- `src/lib/routes/route-composition-planner.mjs:969-979`
- `src/lib/routes/route-composition-planner.mjs:1064-1078`
- `src/lib/routes/route-composition-planner.mjs:1090-1125`

### DecisionTrace

DecisionTrace is written after a legacy route record already exists.

Current write locations:

- Planner context path: `src/lib/routes/route-composition-planner.mjs:1090-1111`
- Legacy evidence-stitch path: `src/lib/routes/route-composition-planner.mjs:1185-1197`
- Materialize path: `scripts/materialize-route-pool.mjs:383-407`

Default flag:

- `ROUTE_V2_TRACE_ENABLED=false`
- implemented in `src/lib/routes/decision-trace-store.mjs:11-13`

DecisionTrace does not feed back into route generation.

### RouteCandidate Schema / Store

RouteCandidate storage is independent from accepted repository:

- default path: `.route-v2-cache/route-candidate-pool.jsonl`
- implemented in `src/lib/routes/route-candidate-pool.mjs:168-223`

Default flag:

- `ROUTE_V2_CANDIDATE_POOL_ENABLED=false`
- implemented in `src/lib/routes/route-candidate-pool.mjs:164-178`

The store validates candidate shape and rejects final RouteRecord fields:

- `src/lib/routes/route-candidate-pool.mjs:113-162`

### Candidate Builder

Candidate Builder:

- reads `context`, `concept`, and the already selected KG destination pool.
- generates multiple stable candidate shapes.
- does not write files.
- does not call external services.
- does not select, reject, score, or rank.

Evidence:

- `src/lib/routes/route-candidate-builder.mjs:299-341`
- `scripts/verify-route-v2-phase2b1-candidate-builder.mjs:104-169`

### Planner Candidate Sidecar

Sidecar call:

- `src/lib/routes/route-composition-planner.mjs:976`

The sidecar is before skeleton construction:

- `selectDestinationPool()` at `src/lib/routes/route-composition-planner.mjs:970`
- sidecar at `src/lib/routes/route-composition-planner.mjs:976`
- `buildRouteSkeleton()` at `src/lib/routes/route-composition-planner.mjs:979`

The sidecar uses the existing pool and does not call `knowledgeGraph.queryDestinations()` again.

## RouteRecord Risk Assessment

### Does flag off still execute V2 code?

Yes, but only minimally:

- `createRouteCompositionPlanner()` creates a candidate pool store object at `src/lib/routes/route-composition-planner.mjs:1144`.
- `runPipeline()` always calls `writeCandidatePoolSidecarSafe()` after `selectDestinationPool()`.
- `writeCandidatePoolSidecarSafe()` immediately checks `candidatePoolStore.enabled()` and returns when disabled.

No candidate generation or write occurs when the flag is off.

Evidence:

- `src/lib/routes/route-composition-planner.mjs:590-593`
- `scripts/verify-route-v2-phase2b2-planner-sidecar.mjs:122-128`

Risk level: Low.

### Does flag on duplicate KG pool or skeleton computation?

No.

- The sidecar receives the already selected `pool`.
- Candidate Builder normalizes and dedupes that pool internally, but does not call the KG.
- `buildRouteSkeleton()` still runs once after the sidecar.

Risk level: Low.

### Can Candidate Sidecar mutate context, concept, or pool?

No evidence of mutation.

- Candidate Builder creates normalized copies via `dedupeDestinations()` / `normalizeDestination()`.
- Sidecar appends an extra signal by spreading candidate objects.
- Phase 2B-1 verification checks input objects are unchanged.

Evidence:

- `src/lib/routes/route-candidate-builder.mjs:63-73`
- `src/lib/routes/route-composition-planner.mjs:603-610`
- `scripts/verify-route-v2-phase2b1-candidate-builder.mjs:105-108`

Risk level: Low.

### Can new and old logic both affect final RouteRecord?

No evidence.

Candidate results are not passed into:

- `buildRouteSkeleton()`
- LLM refine
- `runAllDecisionTests()`
- `evidenceCheck()`
- `buildPlannerRecord()`
- validation
- dedupe
- accepted/rejected result

Evidence:

- sidecar return value is ignored at `src/lib/routes/route-composition-planner.mjs:976`
- final record is built from `refinedSkeleton` at `src/lib/routes/route-composition-planner.mjs:1064-1068`
- Phase 2B-2 verification asserts deep equality at `scripts/verify-route-v2-phase2b2-planner-sidecar.mjs:132`

Risk level: Low.

## Redundancy Findings

| Category | Item | Files / Functions | Why Duplicate or Must Keep | Risk if Removed Now | Recommended Stage | Recommended Action | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Must keep | Legacy `buildRouteSkeleton()` | `route-composition-planner.mjs:629-663` | Still determines final `RouteRecord`; Candidate Builder is trace-only sidecar. | Final routes change immediately. | V2 controls final RouteRecord | Keep | High |
| Must keep | `buildPlannerRecord()` | `route-composition-planner.mjs:814-897` | Still creates final route fields for old path. | Feed/Search/Detail route shape may change. | V2 controls final RouteRecord | Keep | High |
| Must keep | Sidecar ignored return value | `route-composition-planner.mjs:976` | This is the core isolation contract. | Using it would start Phase 3/4 behavior accidentally. | Until candidate selection phase | Keep | High |
| Must keep | Candidate schema forbids final fields | `route-candidate-pool.mjs:138-146` | Prevents post-hoc copying of final RouteRecord into candidate pool. | Candidate Pool could become fake copy of output. | Until V2 route finalization is designed | Keep | High |
| Must keep | Independent Phase tests | `scripts/verify-route-v2-phase1-trace.mjs`, `verify-route-v2-phase2a-candidate-pool.mjs`, `verify-route-v2-phase2b1-candidate-builder.mjs`, `verify-route-v2-phase2b2-planner-sidecar.mjs` | Each phase protects a different migration boundary. | Shared helper refactor could accidentally weaken isolation checks. | Can extract helpers only with no assertion loss | Keep core assertions | Medium |
| Now safe to clean | `envFlag()` location | `decision-trace-store.mjs:5-9`, imported by `route-candidate-pool.mjs:4` | Candidate Pool depends on trace store only to reuse flag parsing. This is real coupling. | Low if moved to a neutral `route-v2-env.mjs`; risky if behavior changes. | Before Phase 3 | Extract shared flag helper | Low |
| Now safe to clean | Stable JSON/hash duplication | `decision-trace-schema.mjs:13-22`, `route-candidate-pool.mjs:17-26`, `route-candidate-builder.mjs:22-31` | Same SHA-256 stable JSON pattern repeated in three V2 modules. | Low if extracted with exact golden tests; candidate/trace IDs must remain stable. | Before Phase 3 | Extract shared `stableJson` / `stableHash` utility | Medium |
| Now safe to clean | `cleanString()` / `unique()` duplication | `decision-trace-schema.mjs:5-10`, `route-candidate-pool.mjs:9-14`, `route-candidate-builder.mjs:14-19`, plus legacy helpers | Same trim / set behavior repeated. | Low for V2-only extraction; medium if touching legacy Planner helper due mojibake-heavy file and route output risk. | Before Phase 3 for V2-only; later for legacy | Extract V2-only helper; leave legacy Planner alone | Low/Medium |
| Now safe to clean | Test `fileState` / `sha256IfExists` helpers | `verify-route-v2-phase2a-candidate-pool.mjs:20-28`, `verify-route-v2-phase2b1-candidate-builder.mjs:19-40`, `verify-route-v2-phase2b2-planner-sidecar.mjs:30-46` | Same file protection pattern repeated. | Low if shared helper preserves exact checks. | Before Phase 3 | Extract test-only helper | Low |
| Phase 3 after clean | JSONL append/read store duplication | `decision-trace-store.mjs:32-79`, `route-candidate-pool.mjs:181-217` | Same append-only JSONL shape, different validators and return payloads. | Medium: trace and candidate stores have different domain validation, reasons, and paths. | After EvidenceBundle design starts | Extract generic append/read primitive, keep domain stores | Medium |
| Phase 3 after clean | Diagnostics shape duplication | trace store, candidate store, sidecar safe wrapper | Repeated `{ written, skipped, reason, error }` and safe catch patterns. | Low/Medium: diagnostics are part of test expectations. | After Phase 3 report schema is known | Standardize diagnostics object | Medium |
| Phase 3 after clean | Candidate Builder exported test helpers | `candidateShapeKey`, `candidateHasMeaningfulDifference`, `clampCandidateTarget` in `index.mjs` | Mostly used by tests and builder; exported through public index for verification. | Low if kept direct-module only, but current scripts import through index. | After stable test helper policy | Consider narrower exports | Low |
| V2 final takeover after clean | Legacy materialized hash | `scripts/materialize-route-pool.mjs:70-77` | FNV-like numeric hash differs from V2 SHA stable hash. It is part of materialized IDs. | High: changing it changes route IDs. | After old materialized route retirement | Keep until retired | High |
| V2 final takeover after clean | Legacy materialize route templates | `scripts/materialize-route-pool.mjs:300-367` | Duplicates planner record concepts but currently powers existing accepted data generation. | High: changes accepted route content. | After V2 RouteRecord path accepted | Keep | High |
| High-risk issue | Mojibake in `route-composition-planner.mjs` comments and some strings | `route-composition-planner.mjs:531-548`, `814-897`, many comments/strings | Existing encoding damage makes future refactors dangerous; not newly introduced by this audit. | Accidental text edits could alter route output or comments unreadably. | Separate encoding-only audit, not this cleanup | Do not touch during Phase 3 feature work | High |
| High-risk issue | Sidecar wrapper always called even flag off | `route-composition-planner.mjs:976` | Only flag check runs, but strict readers may expect no V2 function call at all. | Low runtime risk; medium contract clarity risk. | Before Phase 3 if desired | Optional: guard call outside wrapper without changing behavior | Medium |

## Detailed Notes by Requested Area

### Stable Hash

True duplication exists:

- `decision-trace-schema.mjs` uses `stableDecisionTraceHash()` for trace IDs and legacy intent/candidate snapshots.
- `route-candidate-pool.mjs` uses local `stableHash()` for candidate IDs.
- `route-candidate-builder.mjs` uses local `stableHash()` for stable sorting, intent fallback, shape keys, and rotation offsets.

Recommendation:

- Extract V2-only stable serialization/hash to a neutral utility before Phase 3.
- Add golden tests proving existing trace IDs and candidate IDs do not change.
- Do not touch `scripts/materialize-route-pool.mjs` hash because it affects persisted route IDs.

### Normalize / Clean String / Unique

True duplication exists across V2 modules.

Recommendation:

- Extract V2-only `cleanString` / `uniqueStrings`.
- Do not fold legacy Planner `clean()` into the same helper yet because it sits inside a large, mojibake-heavy file and affects final `RouteRecord`.

### Feature Flag Parsing

Current issue:

- `route-candidate-pool.mjs` imports `envFlag` from `decision-trace-store.mjs`.

This is not a runtime bug, but it is poor module ownership: candidate infrastructure should not depend on trace storage just to parse booleans.

Recommendation:

- Move `envFlag` to a neutral V2 utility before Phase 3.

### JSONL Store

Trace store and Candidate Pool store are similar:

- both are append-only JSONL.
- both create parent directories.
- both parse line-by-line.
- both return structured parse errors.

They should not be merged immediately because:

- validation differs.
- return payload differs.
- candidate store has `listByIntent()`.
- trace store has `appendLegacyRouteTrace()`.

Recommendation:

- After Phase 3 begins, extract only low-level `appendJsonlLine()` / `readJsonlLines()` while keeping domain store wrappers separate.

### Diagnostics / Error Handling

Repeated safe-failure pattern exists in:

- DecisionTrace store
- Candidate Pool store
- `writeCandidatePoolSidecarSafe()`

This is acceptable during migration. Standardization is useful only after EvidenceBundle/ValidationResult decides the final diagnostics schema.

### Schema Validation

No harmful duplication found.

DecisionTrace schema and RouteCandidate schema validate different objects. They must remain separate.

### Intent ID / Candidate ID Generation

Current overlap:

- DecisionTrace creates `legacy-intent-*` and `legacy-candidate-*` snapshots.
- Candidate Builder creates fallback `intent-*`.
- Candidate Pool creates `rc-*`.

This is intentional because Phase 1 traces are snapshots of legacy output while Phase 2 candidates are pre-output objects.

Do not unify until V2 has one authoritative RouteIntent model.

### Testing Temporary Directories and Hash Checks

True duplication exists in tests, but most of it is useful because each phase independently protects:

- no writes when flags are off.
- temp path isolation.
- accepted repository unchanged.
- bootstrap unchanged.
- real Candidate Pool cache unchanged.
- RouteRecord unchanged.

Recommendation:

- Safe to extract file-state helper and temp harness helper if the assertions remain explicit in each phase test.
- Do not collapse phase tests into one large shared test.

## `route-composition-planner.mjs` Findings

### Flag off behavior

Flag off still executes:

- candidate store object construction.
- sidecar wrapper call.
- `candidatePoolStore.enabled()` check.

Flag off does not execute:

- Candidate Builder.
- Candidate Pool append.
- file writes.

This is acceptable but can be made cleaner with an outer guard later.

### Flag on behavior

Flag on:

- reuses the selected KG pool.
- generates candidate alternatives.
- writes candidate JSONL.
- ignores the result for final route generation.

No duplicate KG query or skeleton build was found.

### Mutation risk

No mutation found.

Candidate Builder normalizes into new objects and Phase 2B-1 tests assert inputs are unchanged.

### Failure degradation

`writeCandidatePoolSidecarSafe()` catches errors and returns diagnostics. The returned diagnostics are currently ignored, which preserves old Planner behavior.

Potential future issue:

- diagnostics are not persisted anywhere when sidecar fails, so failures may be invisible unless tests or logs capture them.

Recommended stage:

- Phase 3 or observability phase.

## `index.mjs` Findings

### Duplicate exports

No duplicate exports found.

### Unused or mostly test-only exports

Potentially test-only or future-facing V2 exports:

- `stableDecisionTraceHash`
- `routeIntentSnapshot`
- `selectedCandidateSnapshot`
- `defaultDecisionTracePath`
- `isRouteV2TraceRequiredForAccept`
- `isRouteV2CandidatePoolEnabled`
- `candidateShapeKey`
- `candidateHasMeaningfulDifference`
- `clampCandidateTarget`

These are not harmful. Because this project uses `index.mjs` as the public route library barrel and phase tests import through it, keeping them is acceptable.

Recommended action:

- Keep now.
- After Phase 3, consider moving test-only exports to direct module imports or a test support entry.

### Circular dependency risk

No active cycle found in the V2 path:

```text
route-composition-planner
  -> decision-trace-store
      -> decision-trace-schema
  -> route-candidate-builder
      -> route-candidate-pool
          -> decision-trace-store (envFlag only)
  -> route-candidate-pool
```

The candidate pool dependency on `decision-trace-store` for `envFlag` is awkward but not a cycle today.

Recommended action:

- Extract `envFlag` to a neutral module before Phase 3.

## Verification Script Findings

### Necessary independent duplication

Keep these independent checks:

- Phase 1: trace off/on, trace write failure, no auto-backfill, Feed/Search/Detail do not read trace.
- Phase 2A: candidate schema, stable ID, flag off, JSONL parsing, write failure, accepted repo untouched.
- Phase 2B-1: pure builder, no mutation, stable output, no real cache writes.
- Phase 2B-2: sidecar order before skeleton, RouteRecord deep equality, write failure degradation.

### Future shared test utilities

Could extract later:

- `sha256IfExists`
- `fileState`
- `statesFor`
- `assertStatesUnchanged`
- `mkdtempSync` harness wrapper
- protected path snapshots

Do not extract if it makes phase tests less explicit.

## Classification Summary

### Must Keep

- `buildRouteSkeleton()`
- `buildPlannerRecord()`
- ignored sidecar return value
- candidate schema final-field rejection
- independent phase tests
- legacy materialize route ID hash
- legacy materialized route templates

### Safe To Clean Now

Count: 4 items.

1. Move `envFlag()` to a neutral V2 env utility.
2. Extract V2-only stable JSON/hash utility with golden tests.
3. Extract V2-only `cleanString` / `uniqueStrings`.
4. Extract test-only file state/hash/temp helpers while preserving all phase assertions.

### Clean After Phase 3

1. Extract generic JSONL append/read primitives.
2. Standardize diagnostics shape.
3. Narrow public `index.mjs` test-only/future exports if Phase 3 stabilizes import boundaries.
4. Persist sidecar failure diagnostics if observability requires it.

### Clean After V2 Controls Final RouteRecord

1. Retire legacy `buildRouteSkeleton()` only after V2 selection and validation produce final routes.
2. Retire or quarantine `buildPlannerRecord()` only after `RouteRecord` rendering is separated from decision evidence.
3. Retire materialized route generator templates only after old materialized routes are no longer required.
4. Revisit materialized route hash only after old IDs are not part of user-facing state.

### High-Risk Issues

Count: 2.

1. Mojibake in `route-composition-planner.mjs` comments and some strings makes future edits risky. This should be handled as a separate encoding-only audit, not mixed with Phase 3 behavior changes.
2. Sidecar wrapper is called even when flag is off. Runtime risk is low, but contract clarity risk is medium. If desired, add an outer guard before Phase 3.

## Direct Answers

### Is the current old/new overlap a normal transition structure?

Yes.

The code matches the intended trace-only and sidecar-only migration shape: V2 records DecisionTrace and Candidate Pool data beside the legacy output path, without taking over final route decisions.

### Is there a current risk that user results are affected by both old and new logic?

No evidence of that risk.

Final user-visible routes still come from legacy skeleton + record generation. Candidate Pool output is not consumed by Feed, Search, Detail, images, validation, dedupe, or `RouteRecord` assembly.

### Should cleanup happen before Phase 3?

Yes, but only a small utility cleanup.

Recommended before Phase 3:

- extract `envFlag`
- extract V2-only stable hash helpers
- extract V2-only clean/unique helpers
- optionally extract test file-state helpers

Do not clean Planner main chain before Phase 3.

### What absolutely should not be cleaned now?

Do not clean or refactor:

- `buildRouteSkeleton()`
- `buildPlannerRecord()`
- materialized route generation
- accepted repository logic
- Feed/Search/Detail paths
- image system
- independent phase tests
- candidate schema restrictions
- trace/candidate storage separation
- any persisted route ID hash

## Recommended Next Step

Before Phase 3, run a very small cleanup PR limited to neutral V2 utilities:

1. `src/lib/routes/route-v2-utils.mjs`
2. no behavior changes
3. golden tests proving existing trace IDs and candidate IDs remain identical
4. no Planner main-chain refactor

If time is tight, skip cleanup and proceed to Phase 3. The current duplication is not blocking, but the `envFlag` coupling and repeated stable hash code will become more annoying as EvidenceBundle and ValidationResult are added.
