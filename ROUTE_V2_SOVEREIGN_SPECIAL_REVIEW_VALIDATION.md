# Route V2 Sovereign Special Review Validation

## Scope

This batch publishes only the VA, PS, and KP Country entities. It creates no City, POI, route Evidence, image, qualification, or formal-performance artifact.

## Authority and readiness

- Production totals: 195 Country, 833 City, 3,963 POI, 4,991 total entities.
- Plannable remains 118 and Evidence-backed remains 115.
- Catalog-only becomes 77.
- VA, PS, and KP are `special-review-catalog-only-evidence-pending`, Not Plannable, and Not Evidence-backed.
- The normal and special-review sovereign gaps are both zero.

## Identity decisions

- VA publishes Vatican City / Q237 / VA. Holy See / Q159583 is a related identity and is excluded from ordinary Country aliases.
- PS publishes State of Palestine / Q219060 / PS in Western Asia. West Bank, Gaza, and Gaza Strip have no PS Country alias authority.
- KP publishes North Korea / Q423 / KP. The complete official name and DPRK resolve to KP; `Korea` remains excluded and the contained `Republic of Korea` alias no longer captures the longer KP identity.
- Lowercase ISO-derived strings do not gain natural-language Country alias authority.

## Validation record

The post-change deterministic results are:

- Sovereign special-review verifier: PASS.
- Sovereign universe arithmetic and Country identity: PASS.
- Knowledge coverage semantics: PASS with 195 Catalog, 118 Plannable, 115 Evidence-backed, and 77 Country-only entries.
- Semantic Gate: 4,991/4,991 PASS.
- Parser identity and KP/KR longest-span regressions: PASS.
- Route consumption: 106/106 PASS.
- Hard-constraint stress: 331/331 PASS.
- Repository smoke: PASS.
- Browser/runtime: 21/21 PASS.
- Node tests: 40/40 PASS.
- Image asset baseline and image quality: PASS; no production image change.
- Git-anchored historical snapshots: 26/26 PASS; Batch09 and Waves 1–4 remain unchanged.
- Syntax and whitespace: PASS.

Performance status remains independent and unresolved: the dedicated runner is unavailable, real qualification executions remain zero, formal experiment executions remain one, formal run 34622976529 remains `BLOCKED_INCONCLUSIVE`, and performance clearance remains `NOT_CLEARED`.
