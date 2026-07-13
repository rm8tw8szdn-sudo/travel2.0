# Route Generation V2 Phase 3C-1 Implementation Report

## Summary

Phase 3C-1 adds a pure online evidence adapter. It converts injected web search results into enriched `EvidenceBundle` records through the existing provider, extractor, and corroborator interfaces.

This phase does not connect to Planner, does not write `EvidenceBundle` JSONL, does not call real network services, and does not change any user-visible route output.

## Added Files

- `src/lib/routes/evidence-bundle-online-adapter.mjs`
- `scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs`
- `ROUTE_V2_PHASE_3C1_IMPLEMENTATION_REPORT.md`

## Modified Files

- `src/lib/routes/index.mjs`

The `index.mjs` change is a minimal export-only change.

## Adapter API

The adapter exports:

- `ROUTE_V2_EVIDENCE_ONLINE_FLAG`
- `ROUTE_V2_TAVILY_EVIDENCE_FLAG`
- `ROUTE_V2_WIKIVOYAGE_EVIDENCE_FLAG`
- `isRouteV2EvidenceOnlineEnabled()`
- `isRouteV2TavilyEvidenceEnabled()`
- `isRouteV2WikivoyageEvidenceEnabled()`
- `buildOnlineEvidenceQueries()`
- `enrichEvidenceBundleWithOnlineEvidence()`

`enrichEvidenceBundleWithOnlineEvidence()` accepts:

- `candidate`
- `baseBundle`
- injected `providers`
- injected `extractor`
- injected `corroborator`
- `env`
- fixed `now`
- optional `timeoutMs`

It returns:

- `enabled`
- `attempted`
- `bundle`
- `resolvedFields`
- `diagnostics`

## Feature Flags

The new flags default to false:

- `ROUTE_V2_EVIDENCE_ONLINE_ENABLED=false`
- `ROUTE_V2_TAVILY_EVIDENCE_ENABLED=false`
- `ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED=false`

The adapter can attempt online evidence only when:

- `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED=true`
- `ROUTE_V2_EVIDENCE_ONLINE_ENABLED=true`
- at least one provider flag is enabled
- the matching injected provider is configured

The string `"false"` remains false through the shared `envFlag()` behavior.

## Evidence Rules

Phase 3C-1 handles only:

- `transportFeasibility`
- `seasonalFit`

Transport evidence types:

- `transport-connection`
- `segment-metric`
- `route-network`

These become:

- `evidenceCategory: "transport-feasibility"`
- `supportsWhichDecision: ["transport-feasibility", "route-order-feasibility"]`

Season evidence types:

- `destination-season`
- `climate-window`

These become:

- `evidenceCategory: "seasonal-fit"`
- `supportsWhichDecision: ["seasonal-fit"]`

`budgetFit` remains unknown in this phase. No budget parsing, amount extraction, or budget evidence is added.

## Trust Upgrade Rules

The adapter does not treat a search hit as verified evidence.

- One independent source creates `weak_signal`.
- Two or more different `sourceUrl` values supporting the same structured fact, with `corroborated=true`, create `verified`.
- Multiple results from the same `sourceUrl` remain a single source and cannot upgrade to `verified`.
- Results without `sourceUrl`, without structured facts, or without candidate destination alignment are rejected into diagnostics or failures.

## Unknown and Failure Handling

When verified online evidence exists:

- the matching unknown is removed.

When only weak online evidence exists:

- the evidence item is added as `weak_signal`;
- the matching unknown remains.

When the provider was attempted but no usable item exists:

- the matching unknown moves to `failures[]`;
- duplicate unknown and failure records for the same field are avoided.

Failure reasons are restricted to:

- `provider-not-configured`
- `timeout`
- `no-result`
- `parse-failed`
- `provider-error`

## EvidenceBundle ID Behavior

The adapter preserves:

- `candidateId`
- `intentId`
- `generationSource`
- existing local `items[]`
- existing unrelated `unknowns[]`
- existing `failures[]`

When online evidence changes the content, the adapter normalizes the enriched bundle and recomputes a new stable `evidenceBundleId`.

With fixed candidate, base bundle, provider results, extractor/corroborator, and `now`, repeated runs produce the same enriched bundle and same enriched ID.

## Boundaries

This phase does not:

- modify `route-composition-planner.mjs`
- connect to Planner or any sidecar
- write `EvidenceBundle` Store JSONL
- create real Candidate Pool, DecisionTrace, or EvidenceBundle cache files
- call Tavily, Wikivoyage, fetch, or any real network
- read any API key
- score, sort, reject, or select candidates
- modify Candidate status
- modify RouteRecord
- modify Feed, Search, Detail, or image systems
- modify accepted repository or bootstrap

## Verification Results

All focused and regression checks passed:

- `node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs`
- `node scripts/verify-route-v2-phase3b2-planner-evidence-sidecar.mjs`
- `node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs`
- `node scripts/verify-route-v2-phase3a-evidence-bundle.mjs`
- `node scripts/verify-route-v2-tooling-cleanup.mjs`
- `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`
- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs`
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`
- `node scripts/verify-route-v2-phase1-trace.mjs`
- `node scripts/verify-concept-taxonomy.mjs`
- `node scripts/verify-gold-cases.mjs`
- `node scripts/verify-route-content-quality.mjs`
- `git diff --check`

## Final Acceptance Finding and Fix

The read-only final acceptance found one transport alignment issue:

- A transport fact was accepted when only one endpoint matched the current Candidate.
- Example: `Tokyo -> Paris` could become `transport-feasibility weak_signal` for a Candidate that contained Tokyo but not Paris.

Root cause:

- The first implementation used an OR-style endpoint check:
  - subject matches Candidate, or
  - object matches Candidate.
- This was too loose for transport evidence because a connection has two route endpoints.

Fix rule:

- Transport evidence must have both `subject` and `object`.
- Both endpoints must map by exact Candidate destination aliases such as id, wikidataId, qid, name, or label.
- The endpoint pair must correspond to an adjacent segment in the Candidate `proposedOrder`.
- Reverse adjacent order is accepted as bidirectional connectivity evidence for Phase 3C-1.
- Partial substring matching is not used, so `Tokyo Bay` does not match `Tokyo`, and `York` does not match `New York`.
- Missing subject or object is rejected conservatively.

This fix does not change:

- source corroboration rules
- EvidenceBundle ID rules
- timeout behavior
- unknown/failure aggregation behavior
- budget handling
- schema/store behavior
- Planner or RouteRecord behavior

Additional adversarial tests now cover:

- Candidate contains Tokyo/Kyoto, fact `Tokyo -> Kyoto`: accepted.
- Candidate only contains Tokyo, fact `Tokyo -> Paris`: rejected.
- Candidate only contains Paris, fact `Tokyo -> Paris`: rejected.
- Candidate contains Tokyo/Kyoto, fact `Kyoto -> Tokyo`: accepted as reverse adjacent connectivity evidence.
- Missing subject: rejected.
- Missing object: rejected.
- `Tokyo Bay -> Kyoto`: rejected.
- `York -> San Francisco` with Candidate `New York -> San Francisco`: rejected.
- One transport query timeout while another transport query verifies the same field: no duplicate transport unknown/failure.
- Poison field checks include `routeId` and `canonicalTitle` in addition to `summary`, `plannerReason`, `recommendationText`, `coverUrl`, and `contentQualityStatus`.

Focused test results:

- Query count: 6
- Single-source transport: `weak_signal`
- Multi-source transport: `verified`
- Single-source season: `weak_signal`
- Multi-source season: `verified`
- Budget: remains `unknown`
- Real fetch calls: 0
- Base EvidenceBundle ID in Phase 3C-1 fixture: `eb-fb9e4da4361ca6ca8f51`
- Enriched transport EvidenceBundle ID in Phase 3C-1 fixture: `eb-341601ce0b1798fee9cd`

Baseline checks:

- accepted-routes hash unchanged: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- bootstrap hash unchanged: `9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef`
- FeedReadyPoolCount unchanged: all 851 / cross 357 / single 494
- Phase 3A golden unchanged: `eb-6d11e66892ed0f3b5662`
- Phase 3B-1 golden unchanged: `eb-c1d89ba2875b67289c97`
- Existing V2 golden IDs unchanged
- No real Candidate Pool, DecisionTrace, or EvidenceBundle cache was created or modified

## Interface Blockers

No blocking incompatibility was found. The adapter successfully reuses the existing web search provider, extractor, source scorer, and corroborator interfaces.

## Recommendation

Phase 3C-1 is ready for commit review. Phase 3C-2 should remain separate and should decide whether, when, and how to connect this adapter into the existing Planner sidecar flow.
