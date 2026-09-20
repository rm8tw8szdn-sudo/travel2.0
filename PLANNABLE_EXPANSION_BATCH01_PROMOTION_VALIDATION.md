# Plannable Expansion Batch 01 — Promotion Gate Validation

## Outcome

The promotion gate evaluated the six sealed Evidence-ready candidates through the production readiness authority and the live Route V2 generation path. BB, RW, ZM, and ZW pass every static and runtime gate and are promoted. SC and SM remain Catalog-only because their real production queries do not pass all four required query forms.

| Country | Identity | Destination / POI | Transport | Season | Production route generation | Hard Country constraint | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB | PASS | 3 / 12 PASS | 4/4 PASS | 3/3 PASS | 4/4 PASS | PASS | PROMOTED |
| RW | PASS | 4 / 7 PASS | 6/6 PASS | 4/4 PASS | 4/4 PASS | PASS | PROMOTED |
| SC | PASS | 1 / 3 PASS | General single-Destination exemption PASS | 1/1 PASS | 0/4; `skeleton-too-short` | Fail-closed | CATALOG-ONLY |
| SM | PASS | 1 / 6 PASS | General single-Destination exemption PASS | 1/1 PASS | 3/4; month-only query is `unresolved-destination` | Fail-closed | CATALOG-ONLY |
| ZM | PASS | 3 / 5 PASS | 4/4 PASS | 3/3 PASS | 4/4 PASS | PASS | PROMOTED |
| ZW | PASS | 4 / 13 PASS | 6/6 PASS | 4/4 PASS | 4/4 PASS | PASS | PROMOTED |

The four query forms are Country only, Country plus days, Country plus month, and Country plus days and month. Runtime Evidence networking remained disabled and the probe observed zero external fetches. The single-Destination exemption is a general rule based on the admitted Destination count; it does not name SC or SM.

Theme Evidence remains zero. The production readiness contract does not require independent theme Evidence for general route generation, and this promotion does not claim that request-derived or planner-derived themes are independently verified.

## Authority and production truth

- Candidates: 6
- Promoted: 4 — BB, RW, ZM, ZW
- Promotion-blocked: 2 — SC, SM
- Evidence-phase blocked and not reconsidered: BZ, CV, DM, MN, TT, UG
- Country / City-Destination / POI / total entities: 195 / 866 / 4,071 / 5,132
- Plannable: 122
- Evidence-backed: 119
- Catalog-only: 73
- Candidate leakage: NONE

The promotion command derives decisions from published identities, Destination and POI ownership, reviewed transport and season evidence, and a live promotion-only production Route V2 evaluator. The evaluator extends planner eligibility only inside the evaluation service and does not write or temporarily grant readiness. It evaluates all six candidates before any readiness mutation.

The independently derived decision is persisted for audit in `data/knowledge/semantic/plannable-expansion-batch01-promotion-authority.json`. This file is audit-only and non-authoritative input. It records the exact sealed pre-promotion partition, static production-fact decisions, and all four live route-gate outcomes per candidate, but it cannot define membership or route truth.

On authoritative validation, a trusted derive-only coordinator reloads the exact pre-promotion policy from sealed main `4d03027731718ba4e355a69179a25a8e9982e43e`, owns the fixed Batch01 candidate scope, evaluates current production facts, and runs all 24 route cases through the production parser/planner. Only that newly derived in-memory decision defines expected membership. The serialized authority artifact and report are then checked against it and rejected if stale or tampered.

`validateKnowledgeReadinessAuthority()` reruns the trusted coordinator, reconstructs the exact expected post-promotion partition from its live decision, and compares exact membership across Plannable, Evidence-backed, Catalog-only, and Evidence-pending sets. Correct counts with substituted membership fail. The original BB-to-SC and BB-to-SM same-count substitutions now fail with `READINESS_AUTHORITY_DERIVED_PROMOTION_MEMBERSHIP_MISMATCH`.

The ordinary public route index exports only `createRouteSearchService`. It does not export a promotion evaluator or accept `candidateCountryCodes`, `promotionMode`, `skipReadiness`, `ignoreReadiness`, or `allowUnready`. The internal fixed-scope evaluator is imported directly by the trusted coordinator, accepts no candidate scope argument, does not write policy or global readiness, and is absent from the public barrel.

The Entity Foundation and Evidence Implementation reports remain immutable phase records at 118 / 115 / 77. Current coverage and readiness verifiers distinguish those historical phase facts from the promoted production state.

## Validation

- Promotion/readiness authority: PASS
- Production route queries for promoted Countries: 16/16 PASS
- Static prerequisite mutation cases: 5/5 PASS
- Production readiness/promotion authority mutation cases: 10/10 PASS
- BB to SC same-count substitution: REJECTED
- BB to SM same-count substitution: REJECTED
- Valid independently derived membership: PASS
- Audit artifact tamper mutations: 7/7 PASS
- Public readiness-bypass mutations: 3/3 PASS
- Generic/fixed promotion evaluator public exports: NONE
- Runtime external Evidence fetches: 0
- Country partition and coverage semantics: PASS — 122 / 119 / 73
- Candidate leakage: NONE
- Semantic Gate: 5,132/5,132 PASS
- Route regression: PASS
- Hard-constraint stress: PASS
- Promotion-focused browser/runtime: 20/20 searches and 5/5 focused constraints PASS
- Full mandatory browser suite: 33/33 PASS
- Repository Node tests: PASS
- Historical Git-anchored snapshots: PASS
- Image asset baseline: PASS
- Image quality: PASS
- Production image diff: NONE
- Syntax: PASS
- Whitespace: PASS

## Persistent performance state

- Dedicated runner: NOT AVAILABLE
- Real qualification executions: 0
- Formal experiment executions: 1
- Formal run 34622976529: BLOCKED_INCONCLUSIVE
- Performance clearance: NOT CLEARED
