# Route V2 Plannable Expansion Batch 02 Evidence Validation

## Scope and authority boundary

Baseline: `56c9efc8002e4e73cd4e270914815774919a2629`.

Countries: `AO BJ BY BZ CI CM CV DM MN MZ SZ TL TT UG`.

This phase is evidence implementation and audit only. It does not change the production entity foundation, readiness membership, route behavior, images, historical sealed reports, or performance state. Reports are audit records and cannot create production evidence or readiness authority.

## Independent worklist reconstruction

- Production entities: 195 Country / 890 Destination / 4,159 POI / 5,244 total.
- Readiness: 122 Plannable / 119 Evidence-backed / 73 Catalog-only.
- Directed transport requirements: 54; duplicates 0; self-loops 0; unaccounted 0.
- Season/profile requirements: 41; unaccounted 0.
- Candidate or quarantined entity references: 0.
- Single-destination transport exemptions: 0.

The production-derived worklist exactly matches the sealed Batch 02 Entity Foundation scope.

## Evidence adjudication

Transport: 8 reported existing units were independently reviewed. Five retain exact production evidence plus independently owned reviewed-claim/source authority. Three were returned to the substantive research set. Across all 49 unresolved directions, two Camrail directions (Yaoundé↔Douala) and four CityLink directions (Nampula↔Beira and Beira↔Maputo) satisfied the complete source fact -> independently owned Batch 02 reviewed claim -> exact direction -> production evidence chain. Final transport accounting is 11 admitted + 43 blocked = 54.

Season: 12 reported existing profiles were independently reviewed and retained. Twenty-nine missing profiles were researched; none was admitted without the complete source fact -> reviewed seasonal claim -> exact destination/profile -> production evidence chain. Final season accounting is 12 admitted + 29 blocked = 41.

All 78 unresolved units have explicit research records. The 40 records previously inferred as `SOURCE_NOT_FOUND` were independently searched and now carry static reviewed attempt records with executed queries, inspected references, review outcomes, unit-specific adjudications, and review time. Final outcomes are: 70 `SOURCE_FOUND_BUT_FACT_INSUFFICIENT`, 6 `SOURCE_FOUND_AND_ELIGIBLE_FOR_REVIEWED_CLAIM`, and 2 `OTHER_EXPLICIT_BLOCKER`; `SOURCE_NOT_FOUND`, `SOURCE_FOUND_BUT_WRONG_DIRECTION_OR_GEOGRAPHY`, and `SOURCE_FOUND_AND_FACT_SUFFICIENT_BUT_NO_REVIEWED_CLAIM_PATH` are zero. The two explicit blockers are the Manzini↔Mbabane records, whose timetable-like page lacks independently verifiable operator authority under the reviewed-source policy. Unclassified is zero. A URL, search attempt, or research record alone is not production evidence; only the static production-owned reviewed-claim catalog and offline importer can admit a claim.

## Evidence readiness

Evidence-ready countries: none.

Evidence-blocked countries: `AO BJ BY BZ CI CM CV DM MN MZ SZ TL TT UG`.

| Country | Destinations | Transport required/admitted/blocked | Season required/admitted/blocked | Ready |
| --- | ---: | ---: | ---: | --- |
| AO | 3 | 4 / 0 / 4 | 3 / 0 / 3 | No |
| BJ | 3 | 4 / 0 / 4 | 3 / 0 / 3 | No |
| BY | 3 | 4 / 0 / 4 | 3 / 0 / 3 | No |
| BZ | 4 | 6 / 0 / 6 | 4 / 4 / 0 | No |
| CI | 3 | 4 / 0 / 4 | 3 / 0 / 3 | No |
| CM | 3 | 4 / 2 / 2 | 3 / 0 / 3 | No |
| CV | 2 | 2 / 0 / 2 | 2 / 2 / 0 | No |
| DM | 2 | 2 / 2 / 0 | 2 / 0 / 2 | No |
| MN | 3 | 4 / 2 / 2 | 3 / 0 / 3 | No |
| MZ | 4 | 6 / 4 / 2 | 4 / 0 / 4 | No |
| SZ | 3 | 4 / 0 / 4 | 3 / 0 / 3 | No |
| TL | 2 | 2 / 0 / 2 | 2 / 0 / 2 | No |
| TT | 3 | 4 / 1 / 3 | 3 / 3 / 0 | No |
| UG | 3 | 4 / 0 / 4 | 3 / 3 / 0 | No |

Exact per-unit source, claim, evidence, status, and blocker records are preserved in `data/knowledge/batches/plannable-expansion-batch02-evidence-audit.json`; the deterministic coverage view is in `data/knowledge/reports/plannable-expansion-batch02-evidence.json`.

## Adversarial validation

- Transport authority: 10/10 cases, including reverse direction, unknown/caller-created claims, entity/source mismatch, report-only truth, candidate entity rejection, and valid exact direction.
- Season authority: 9/9 cases, including wrong geography/profile, nearby substitution, caller/report/planner truth rejection, and valid exact reviewed profile.
- Evidence-readiness and boundary: 8/8 cases, including missing evidence, same-count substitution, report/live disagreement, caller readiness, and exact live-derived membership.
- Search-attempt authority: 9/9 cases. Generated-query-only, source-map-miss-only, unexecuted/null attempts, unknown outcomes, missing references/facts, and generic adjudications reject; genuine executed no-result and inspected source-found attempts pass.
- Search-attempt audit: 40/40 previously unsupported units now have reviewed attempts; missing attempts 0; generated-query-only records 0.
- Caller-controlled evidence truth: none.
- Report authority: none.
- Batch 01 catalog: immutable and compatible.
- Batch 02 catalog: independently owned and statically registered.
- Offline Batch 02 importer: present; two reviewed route-leg records imported.
- Theme evidence added: 0.
- Accidental promotions: 0.

## Phase state

- Batch 01 overall: SEALED.
- Batch 02 Entity Foundation: SEALED.
- Batch 02 Evidence: IMPLEMENTED / NOT YET SEALED.
- Batch 02 Promotion: NOT STARTED.
- Batch 02 overall: NOT SEALED.
- Performance clearance: NOT CLEARED.
