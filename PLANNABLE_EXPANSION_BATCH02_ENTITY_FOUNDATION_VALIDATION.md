# Plannable Expansion Batch 02 — Entity Foundation Validation

## Scope and authority

- Sealed baseline: `eddf46512863c115b7f39e29d5f6c448d1ce6251`
- Phase: discovery, deterministic selection, Entity Foundation, and Evidence worklist only
- No transport, season/month, or theme Evidence was added.
- No readiness authority was changed. The selected countries remain Catalog-only and Evidence-pending.
- The generated discovery and review reports are audit records, not readiness or promotion authority.

## Discovery and deterministic selection

The production readiness policy partitions all 195 Countries into 122 Plannable and 73 Catalog-only Countries. The 73 Catalog-only Countries are exhaustively classified into disjoint tiers:

- Tier A: 15
- Tier B: 31
- Tier C: 11
- Tier D: 16

The deterministic ranking initially selected `AO BJ BY BZ CI CM CV DM MN MZ PG SZ TT UG`. Per-destination POI review rejected PG because its usable pool was insufficient after Region and generic-watercourse candidates were excluded. TL was the next eligible reviewed country and replaced PG. The final Batch02 set is:

`AO BJ BY BZ CI CM CV DM MN MZ SZ TL TT UG`

`BZ CV DM MN TT UG` reuse existing production Entity Foundations. `AO BJ BY CI CM MZ SZ TL` add reviewed production Entity Foundations.

## Entity review

- Candidate Destinations reviewed: 24
- Destinations admitted: 24
- Destination rejections: 0
- Candidate POIs reviewed: 121
- POIs admitted: 88
- Existing production reused: 0
- POIs quarantined/rejected: 33
- POIs unaccounted: 0
- Multi-disposition candidates: 0
- Published totals after admission: 195 Country / 890 City / 4,159 POI / 5,244 total
- Candidate leakage: none

Every reviewed POI has exactly one audited disposition: `121 = 88 admitted + 0 reused + 33 quarantined/rejected`. The review queue retains source provenance and explicit rejection reasons. Rejections cover operational archives/libraries, generic watercourses, generic islands/geographic or geological features, and a Region that cannot inherit travel-positive POI authority. Grand Imperial Hotel (`Q5594671`) and Amansi and Mapeera monument (`Q122933018`) are independently admitted after passing identity, type, Country/Destination binding, uniqueness, coordinate, and distance checks. Historical Batch01 artifacts remain Git-anchored and immutable; later additive production Entity growth no longer requires the current live entity counts to equal the historical snapshot. Published POIs retain full type admission, destination binding, unique stable identity, finite coordinates, and the reviewed 25 km destination-distance boundary.

The disposition verifier reconstructs the 121-candidate review universe independently from pre-Batch02 shards. It rejects missing or duplicate dispositions, false reuse identity, admitted/report production mismatches, quarantine leakage, and correct-count but incorrect-membership disposition sets.

## Sealed history and current production authority

The previous readiness validator compared the entire live re-derived Batch01 promotion report with its historical file. Because the report embeds per-Country City/POI counts, this incorrectly made the historical Entity membership a permanent ceiling for later production growth. The authority boundary now verifies the Batch01 promotion authority and report byte-equivalent JSON against their sealed merge commit, while independently re-deriving and matching the stable promotion membership, partitions, and route-gate decisions from current production state. Current additive Entity growth may therefore pass normal admission without rewriting Batch01 history or granting readiness.

Targeted mutations confirm that historical report edits, promotion artifact edits, forged membership, BB-to-SC/SM same-count substitutions, missing required promotions, caller-controlled readiness, candidate-only leakage, quarantine injection, and incorrect disposition membership remain fail-closed. The two admitted UG POIs demonstrate legitimate current production growth with unchanged readiness; the same authority boundary no longer freezes later normally admitted Destination growth.

## Evidence worklist

No Evidence was written. The next phase has an explicit audit-only worklist derived from unique production Destination identities and the actual route model:

- Directed transport segment units: 54
- Existing reusable transport records: 8
- Missing directed transport units: 46
- Season/month profile units: 41
- Existing reusable season records: 12
- Missing season/month units: 29
- Theme Evidence added: 0

The worklist contains no self-loop, duplicate segment, or duplicate Destination season unit. It cannot grant readiness.

## Production and readiness result

- Country: 195
- City: 890
- POI: 4,159
- Total entities: 5,244
- Plannable: 122
- Evidence-backed: 119
- Catalog-only: 73
- Readiness promotions: 0
- Accidental promotions: 0

All 14 selected Countries remain Catalog-only, Evidence-pending, Not Plannable, and Not Evidence-backed. Normal Route search does not invoke the planner for the newly completed Entity Foundations without Evidence/readiness authority.

## Validation

- Batch02 Entity Foundation verifier: PASS
- Coverage semantics: PASS (195 / 122 / 119 / 73)
- Semantic Gate: PASS (5,244 / 5,244)
- POI positive, mixed-type, and ancestry admission guards: PASS
- Route consumption: PASS (106 / 106)
- Hard-constraint stress: PASS (331 / 331)
- Image asset baseline: PASS (1,401 assets, zero hash/byte/mapping mismatch)
- Image quality: PASS
- Repository unit tests: PASS (40 / 40)
- Repository smoke: PASS
- Browser/runtime: PASS (33 / 33)
- Historical Git-anchored snapshots: PASS (26 / 26)
- Syntax and whitespace: PASS

## Protected state

- Batch01 remains sealed and unchanged.
- Protected stash `2a874aa32df41285a150e79d6a8981cee2f032db` remains untouched.
- Four pre-existing browser artifacts remain untracked and untouched.
- Dedicated runner: NOT AVAILABLE
- Real qualification executions: 0
- Formal experiment executions: 1
- Formal run `34622976529`: BLOCKED_INCONCLUSIVE
- Performance clearance: NOT CLEARED
