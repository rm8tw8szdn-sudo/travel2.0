# Route Generation V2 Knowledge Repository Cleanup P0 Implementation Report

Generated: 2026-07-14

## Stage Goal

Knowledge Repository Cleanup P0 isolates unsafe knowledge sources before Phase 3C-3. It does not clean or rewrite repository data. It adds explicit source classification, schema helpers, a read-only audit script and verification around Candidate Builder and Local Evidence behavior.

## Actual Files

New:

- `src/lib/routes/knowledge-repository-schema.mjs`
- `src/lib/routes/knowledge-entity-normalizer.mjs`
- `scripts/audit-route-knowledge-repository.mjs`
- `scripts/verify-route-v2-knowledge-repository-cleanup-p0.mjs`
- `ROUTE_V2_KNOWLEDGE_REPOSITORY_AUDIT_REPORT.md`
- `ROUTE_V2_KNOWLEDGE_REPOSITORY_CLEANUP_PLAN.md`
- `ROUTE_V2_KNOWLEDGE_REPOSITORY_CLEANUP_P0_IMPLEMENTATION_REPORT.md`

Modified:

- `src/lib/routes/route-candidate-builder.mjs`
- `src/lib/routes/route-candidate-pool.mjs`
- `src/lib/routes/local-evidence-collector.mjs`
- `src/lib/routes/index.mjs`

## Schema Added

P0 adds minimal V2 schema helpers:

- `KnowledgeEntity`
- `KnowledgeFact`
- `KnowledgeRelationship`

The schema is intentionally lightweight and non-persistent. It validates entity shape, source classification, provenance, coordinate fields and source-safe fact metadata.

## Source Classification

Supported classifications:

- `wikidata`
- `manual-anchor`
- `coverage-placeholder`
- `search-fallback`
- `route-record-derived`
- `unknown`

Only schema-valid Wikidata/QID entities are allowed to support fact-verified local identity. Manual anchors, coverage placeholders, search fallbacks and RouteRecord-derived entities can support structure diagnostics only.

## Candidate Builder Behavior

Candidate Builder now preserves source metadata on generated candidate destinations:

- `entitySourceType`
- `provenance`
- `confidence`
- `trustedForFact`

Candidate generation, count, order, IDs and RouteRecord output remain unchanged.

## Local Evidence Behavior

Local Evidence Collector now separates:

- `destination-identity`: verified local identity evidence.
- `destination-identity-structure`: weak structure signal for non-fact sources.

Coverage placeholders and search fallbacks no longer become fact-verified identity evidence. They produce structure evidence and keep a `destinationIdentity:*` unknown explaining that the source is not fact-verified.

## Legacy Evidence Isolation

The read-only audit confirms:

- legacy evidence records: 2865
- route-record-derived legacy records: 2550
- missing V2 `candidateId`: 2865
- missing V2 `supportsWhichDecision`: 2865

P0 does not migrate or rewrite legacy evidence.

## Knowledge Graph Baseline

Read-only audit baseline:

- accepted routes: 5500
- FeedReadyPoolCount: all 851 / cross 357 / single 494
- KG entities: 348
- KG countries: 14
- KG QID identifiers: 320
- KG source classifications: 315 `wikidata`, 32 `manual-anchor`, 1 `search-fallback`
- accepted-derived destination entities: 21913
- accepted-derived coverage placeholders: 18356

## Protected Invariants

Verified by `scripts/verify-route-v2-knowledge-repository-cleanup-p0.mjs`:

- accepted repository hash unchanged
- bootstrap hash unchanged
- FeedReadyPoolCount unchanged
- Phase 3B-1 golden remains `eb-c1d89ba2875b67289c97`
- old trace/candidate golden IDs unchanged
- no true network calls
- no real Candidate Pool / DecisionTrace / EvidenceBundle cache writes
- no selected/rejected/scoring logic added

## Regression Status

All focused and regression checks passed:

- `node scripts/verify-route-v2-knowledge-repository-cleanup-p0.mjs`
- `node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs`
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

`git diff --check` only reported the existing Windows LF/CRLF warning and no whitespace errors.

## User-Facing Impact

No user-facing behavior changes. P0 does not modify Planner route selection, RouteRecord output, Feed, Search, Detail, image logic, accepted routes or bootstrap.

## Next Recommended Step

Run read-only final acceptance for P0. After P0 is reviewed, decide whether to implement P1 provenance cleanup before resuming Phase 3C-3.
