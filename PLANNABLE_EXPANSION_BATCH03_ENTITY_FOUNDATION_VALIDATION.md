# Batch03 Entity Foundation Validation

Status: IMPLEMENTED / READY FOR FINAL REVIEW

## Scope and accounting

The selected cohort is LC, VC, ST, SB, TG, TM, TO, AG, CG, GD, GM, KN, BI, and GN. The explicit per-country POI counts total 116, and independent enumeration of the candidate shards also returns exactly 116. The earlier prose total of 130 was an arithmetic error of 14.

- Destination disposition: 21 reviewed, 21 admitted, 0 reused, 0 quarantined, 0 rejected, 0 unaccounted, 0 multi-disposition.
- POI disposition: 116 reviewed, 116 admitted, 0 reused, 0 quarantined, 0 rejected, 0 unaccounted, 0 multi-disposition.
- Candidate and quarantine leakage: NONE.
- Artifact mutation regressions: 15/15 rejected; valid reviewed Destination and POI sets pass.

## Independent admission authority

Candidate shards, generated reports, and caller input grant no admission authority. The generator rebuilds semantic facts from the repository's raw Wikidata snapshots and integrity corrections, then runs the shared production Semantic Gate with the reviewed type policy. This independently checks canonical identity, raw coordinates, P31 ancestry, Country claims, admitted Destination binding, geographic distance, cycle/depth limits, duplicate identities, and visitor-facing POI semantics before publication.

Fourteen generator-path controls use structurally valid candidate records and the same production authority function. Region, Island, administrative entity, operational/non-visitable POI, generic feature, candidate-only injection, cross-Country binding, cross-Destination binding, same-count replacement, authority QID mismatch, missing authority, ancestry cycle, ancestry depth overflow, and invalid ancestor are rejected. Positive controls traverse the same path.

## Authority and production

Entity Foundation adds 21 Destination and 116 POI entities. It grants no Evidence or Promotion authority. Production becomes 195 Country, 911 Destination, 4,275 POI, and 5,381 total entities. Readiness remains 122 Plannable, 119 Evidence-backed, and 73 Catalog-only, with zero accidental promotions. All 14 countries remain Catalog-only and Evidence-pending.

The future Evidence worklist is derived from admitted production Destinations. Single-Destination countries require no directed inter-Destination transport and one season profile. Two-Destination countries require both directions and two season profiles. No new Evidence was researched or admitted.

## Deterministic validation

- Batch03 Entity Foundation verifier: PASS.
- Generator-path semantic authority regressions: 14/14 PASS.
- Disposition, identity, schema, ancestry, Country/Destination binding, candidate boundary, and same-count substitution guards: PASS.
- Coverage semantics: PASS (195 / 122 / 119 / 73).
- Semantic Gate: 5,381/5,381 PASS.
- Parser overlap and homonym regressions: PASS.
- Route consumption: 106/106 PASS.
- Hard-constraint stress: 331/331 PASS.
- Browser suite: 33/33 PASS.
- Node tests: 40/40 PASS.
- Repository smoke: PASS.
- Historical Git-anchored snapshots: 26/26 PASS.
- Batch02 Promotion verifier: PASS; sealed decisions unchanged and current additive membership checked separately.
- Batch02 Evidence verifier: PASS; sealed Evidence content unchanged and current additive membership checked separately.
- Image asset baseline: 1,401 PASS.
- Image quality: PASS; invalid mappings 0.
- Syntax and whitespace: PASS.

Batch01 and Batch02 reports and evidence artifacts remain unchanged. Their verifiers distinguish immutable historical entity totals from the current additive production registry.

## Persistent performance state

- Dedicated runner: NOT AVAILABLE.
- Real qualification executions: 0.
- Formal experiment executions: 1.
- Formal run 34622976529: BLOCKED_INCONCLUSIVE.
- Performance clearance: NOT CLEARED.

No qualification or formal performance experiment was run.
