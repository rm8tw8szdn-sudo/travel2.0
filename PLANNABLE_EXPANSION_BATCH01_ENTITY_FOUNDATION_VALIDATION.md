# Plannable Expansion Batch 01 — Entity Foundation Validation

## Scope and authority

Phase A–C reviewed the existing 33 Destination and 140 POI candidates for BB, BZ, CV, DM, MN, RW, SC, SM, TT, UG, ZM, and ZW. It publishes 33 verified City/Destination entities and 108 verified POIs. Thirty-two low-value, operational, generic geographic, geological, whole-island, or otherwise unsuitable POI candidates remain outside production in a dedicated review queue with their original entity provenance.

No transport, season/month, theme, or route Evidence was added. All 12 Countries remain Catalog-only, Evidence-pending, Not Plannable, and Not Evidence-backed. Publishing entity depth does not grant readiness authority.

Readiness now comes from the single validated `country-route-readiness-policy` authority. Coverage semantics loads that authority internally, so callers cannot omit a permissive Catalog-only exclusion list. Route Search uses the same authority and refuses planner execution for an explicitly requested Catalog-only Country even when that Country has published Destination and POI depth. Missing or malformed readiness policy data fails closed. The policy is reconciled against the exact 195-code published Country registry: Plannable and Catalog-only form a disjoint, complete partition, Evidence-backed and Evidence-pending remain valid subsets, and same-count substitutions with unknown codes are rejected.

## Reviewed outcome

| Country | Destinations reviewed/admitted/rejected | POIs reviewed/admitted/rejected | Modeling result | Remaining Evidence work |
| --- | ---: | ---: | --- | --- |
| BB | 3 / 3 / 0 | 15 / 12 / 3 | Bridgetown, Holetown, and Speightstown retained as settlements; river/library/former-island records excluded | 4 directed segments; 3 season profiles; independent theme sources |
| BZ | 4 / 4 / 0 | 17 / 13 / 4 | Cities/towns retained; no district promoted as City | 6 directed segments; 4 season profiles; independent theme sources |
| CV | 2 / 2 / 0 | 12 / 10 / 2 | Praia and Mindelo retained; São Vicente is not promoted as a City-scoped POI; Cabo Verde remains canonical | 2 directed segments; 2 season profiles; independent theme sources |
| DM | 2 / 2 / 0 | 12 / 8 / 4 | Roseau and Portsmouth retained; generic watercourses excluded; Dominica identity remains separate from DO | 2 directed segments; 2 season profiles; independent theme sources |
| MN | 3 / 3 / 0 | 11 / 10 / 1 | Ulaanbaatar, Darkhan, and Erdenet retained; no aimag/province promoted | 4 directed segments; 3 season profiles; independent theme sources |
| RW | 4 / 4 / 0 | 9 / 7 / 2 | Four verified settlements retained; generic watercourses excluded | 6 directed segments; 4 season profiles; independent theme sources |
| SC | 1 / 1 / 0 | 7 / 3 / 4 | Victoria is the single Destination; islands remain outside the City-scoped POI layer | Single-destination adjudication; 1 season profile; independent theme sources |
| SM | 1 / 1 / 0 | 7 / 6 / 1 | San Marino settlement supports a single-Destination model; no duplicate Country-as-City was created | Single-destination adjudication; 1 season profile; independent theme sources |
| TT | 3 / 3 / 0 | 14 / 10 / 4 | Three settlements retained; islands/geological and generic river records are not promoted as Cities | 4 directed segments; 3 season profiles; independent theme sources |
| UG | 3 / 3 / 0 | 15 / 11 / 4 | Kampala, Jinja, and Entebbe retained; hotel/library/locality/low-value records excluded | 4 directed segments; 3 season profiles; independent theme sources |
| ZM | 3 / 3 / 0 | 6 / 5 / 1 | Lusaka, Livingstone, and Ndola retained; operational archive excluded | 4 directed segments; 3 season profiles; independent theme sources |
| ZW | 4 / 4 / 0 | 15 / 13 / 2 | Victoria Falls City remains distinct from its POIs; operational/low-value records excluded | 6 directed segments; 4 season profiles; independent theme sources |

## Production truth

- Country: 195
- City/Destination: 866
- POI: 4,071
- Total entities: 5,132
- Plannable: 118
- Evidence-backed: 115
- Catalog-only: 77
- Transport Evidence additions: 0
- Season/month Evidence additions: 0
- Theme Evidence additions: 0
- Readiness promotions: 0

## Next Evidence phase input

- Final production Destinations: 33 across the 12 Countries, recorded by stable QID in `data/knowledge/reports/plannable-expansion-batch01-entity-review.json`.
- Required directed transport segments: 42 for the ten multi-Destination Countries.
- Required season/month profiles: 33.
- Single-Destination route adjudication: SC and SM.
- Multi-Destination transport Evidence: BB, BZ, CV, DM, MN, RW, TT, UG, ZM, and ZW.
- Unresolved blockers: directed transport Evidence, objective season/month Evidence, and independent theme Evidence.

Historical reports and the 1,416-record historical quarantine remain unchanged. Production image assets and mappings remain unchanged. Formal run `34622976529` remains `BLOCKED_INCONCLUSIVE`; performance clearance remains `NOT_CLEARED`.
