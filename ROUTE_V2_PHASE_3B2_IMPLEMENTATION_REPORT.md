# Route Generation V2 Phase 3B-2 Implementation Report

## Summary

Phase 3B-2 adds Planner Local Evidence Sidecar Integration.

After the Phase 2B-2 Candidate Builder sidecar successfully writes RouteCandidates to the Candidate Pool, the Planner now optionally calls a local evidence sidecar to generate EvidenceBundles for those written candidates.

This is still sidecar-only:

- It does not change final RouteRecord.
- It does not use EvidenceBundle for scoring.
- It does not sort, reject, select, or rank candidates.
- It does not modify Feed, Search, Detail, image system, accepted repository, or bootstrap.
- It does not call Tavily, Wikivoyage, LLM, or network services.

## Modified Files

### `src/lib/routes/local-evidence-sidecar.mjs`

New sidecar module.

Responsibilities:

- Check all three required feature flags.
- Receive candidates already written by Candidate Pool sidecar.
- Receive the same KG destination pool snapshot used by Candidate Builder.
- Call `collectLocalEvidenceBundle()` for each written candidate.
- Validate each EvidenceBundle with `validateEvidenceBundle()`.
- Append valid bundles through EvidenceBundle Store.
- Return internal diagnostics with `candidateId`, `intentId`, `evidenceBundleId`, and write result.
- Catch per-candidate failures so one bad candidate does not stop the Planner or other candidates.

### `src/lib/routes/route-composition-planner.mjs`

Minimal Planner integration.

The integration point is:

1. `selectDestinationPool()`
2. Candidate Builder sidecar and Candidate Pool write
3. Local Evidence sidecar
4. `buildRouteSkeleton()`

The sidecar uses the candidate list returned by the Candidate Pool sidecar. It does not regenerate candidates and does not read final RouteRecord.

### `src/lib/routes/index.mjs`

Adds minimal exports:

- `ROUTE_V2_EVIDENCE_LOCAL_FLAG`
- `isRouteV2LocalEvidenceEnabled`
- `writeLocalEvidenceSidecarSafe`

### `scripts/verify-route-v2-phase3b2-planner-evidence-sidecar.mjs`

Adds isolated Phase 3B-2 verification.

## Feature Flags

New flag:

```text
ROUTE_V2_EVIDENCE_LOCAL_ENABLED=false
```

Local evidence collection runs only when all three flags are true:

```text
ROUTE_V2_CANDIDATE_POOL_ENABLED=true
ROUTE_V2_EVIDENCE_BUNDLE_ENABLED=true
ROUTE_V2_EVIDENCE_LOCAL_ENABLED=true
```

If any flag is false:

- Local Evidence Collector is not called.
- EvidenceBundle Store is not written.
- EvidenceBundle JSONL is not created.
- Legacy Planner behavior stays unchanged.

## Flag Combination Behavior

| Candidate Pool | EvidenceBundle Store | Local Evidence | Candidate write | EvidenceBundle write | Collector called |
| --- | --- | --- | --- | --- | --- |
| false | false | false | No | No | No |
| true | false | false | Yes | No | No |
| true | true | false | Yes | No | No |
| false | true | true | No | No | No |
| true | false | true | Yes | No | No |
| true | true | true | Yes | Yes | Yes |

## All-On Behavior

In the Phase 3B-2 verification fixture:

- Candidate Pool wrote 8 candidates.
- EvidenceBundle Store wrote 8 EvidenceBundles.
- EvidenceBundle count matched successfully written candidate count.
- Each bundle had matching `candidateId` and `intentId`.
- Each bundle passed `validateEvidenceBundle()`.

The first all-on EvidenceBundle ID in the integration fixture was:

```text
eb-d125489494d15b865cce
```

This is an integration fixture ID. It does not replace the Phase 3B-1 golden ID.

## Evidence Categories Verified

For written candidate bundles, the test confirms local evidence categories:

- `destination-identity`
- `country-match`
- `proposed-order-integrity`
- `coordinate`
- `segment-distance`
- `duration-fit`

The following remain `unknown`, as required:

- `transportFeasibility`
- `seasonalFit`
- `budgetFit`

## Failure Degradation

Each per-candidate sidecar diagnostic record now has explicit terminal state fields:

- `written: boolean`
- `skipped: boolean`
- `failed: boolean`
- `reason: string`
- `error: string`

For a single record, `written`, `skipped`, and `failed` are mutually exclusive. Exactly one is true for each processed candidate record.

Failure reasons are separated by source:

| Failure source | Diagnostic reason |
| --- | --- |
| `collectLocalEvidenceBundle()` throws | `local-evidence-collector-failed` |
| `evidenceBundleValidator()` throws | `local-evidence-validation-failed` |
| Validator returns `accepted=false` | `local-evidence-invalid` |
| EvidenceBundle Store `append()` throws | `evidence-bundle-store-write-failed` |
| EvidenceBundle Store returns `written=false` and `skipped=false` with no reason | `evidence-bundle-store-write-failed` |

If EvidenceBundle Store returns `skipped=true`, the record is marked skipped and not failed. If it returns `written=true`, the record is marked written and not failed.

EvidenceBundle Store write failure:

- Planner still returns the old RouteRecord.
- Candidate Pool writes still occur.
- Evidence write failure is contained inside sidecar diagnostics.

Collector failure or invalid bundle:

- The failed candidate records a sidecar failure internally.
- Other candidates continue.
- Valid bundles for other candidates are still written.
- Planner does not fail.
- RouteRecord remains unchanged.

Validation failure:

- A thrown validator error is separated from an invalid bundle result.
- An invalid bundle keeps `validation.reasons` in the record.
- Later candidates continue.

## Explicit Non-Goals

This phase does not:

- Score candidates.
- Sort candidates.
- Reject candidates.
- Select a best candidate.
- Change Candidate status to selected or rejected.
- Modify `buildRouteSkeleton()` output.
- Modify `buildPlannerRecord()` output.
- Modify DecisionTrace.
- Modify Feed / Search / Detail / image system.
- Modify accepted repository or bootstrap.
- Call online evidence providers.
- Start Phase 3C.

## Verification Results

Ran:

```text
node scripts/verify-route-v2-phase3b2-planner-evidence-sidecar.mjs
node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs
node scripts/verify-route-v2-phase3a-evidence-bundle.mjs
node scripts/verify-route-v2-tooling-cleanup.mjs
node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs
node scripts/verify-route-v2-phase2b1-candidate-builder.mjs
node scripts/verify-route-v2-phase2a-candidate-pool.mjs
node scripts/verify-route-v2-phase1-trace.mjs
node scripts/verify-concept-taxonomy.mjs
node scripts/verify-gold-cases.mjs
node scripts/verify-route-content-quality.mjs
git diff --check
```

Result: all PASS.

## Baseline Integrity

| Item | Result |
| --- | --- |
| accepted-routes hash | `AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F` |
| route-feed-bootstrap hash | `9F5E2B2557A9E547073DA4D299F08B5B18B6EBA38B3BD55FC995A16ADF1CD9EF` |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |
| Phase 3A golden | unchanged |
| Phase 3B-1 golden | `eb-c1d89ba2875b67289c97` |
| real Candidate Pool cache | not created or modified |
| real DecisionTrace cache | not created or modified |
| real EvidenceBundle cache | not created or modified |

## User Impact

No user-visible impact.

Reason:

- Final RouteRecord is still produced by legacy `buildRouteSkeleton()` and `buildPlannerRecord()` flow.
- Local Evidence sidecar output is not read by Feed, Search, Detail, image system, or accepted repository.
- EvidenceBundle sidecar diagnostics are not written into RouteRecord.

## Recommendation

Recommend entering commit review.

Phase 3B-2 is now ready for review because:

- All flag combinations behave as intended.
- Full-on mode writes EvidenceBundles only for successfully written Candidate Pool entries.
- RouteRecord stays deepEqual with sidecars disabled and enabled.
- Failure degradation works.
- All regression tests pass.
