# Plannable Expansion Batch 01 — Evidence Implementation Validation

## Scope

Evidence implementation covers BB, BZ, CV, DM, MN, RW, SC, SM, TT, UG, ZM, and ZW. It adds no Country, City, POI, theme, image, or readiness authority.

## Evidence outcome

- Required directed transport segments: 42
- Admitted directed transport segments: 28
- Blocked directed transport segments: 14
- Required/admitted/blocked objective season/month profiles: 33/28/5
- Independently admitted theme evidence: 0
- Evidence-ready candidate countries: 6
- Transport-blocked countries: BZ, UG
- Single-destination transport rule: `SINGLE_DESTINATION_TRANSPORT_NOT_REQUIRED` for any country with exactly one production Destination; applies to SC and SM
- Conflicts admitted: 0
- Readiness promotions: 0
- Result authority: `EVIDENCE READY CANDIDATE`

BZ remains blocked for six directed segments because the official material found establishes terminals and regulated transport but does not establish all exact endpoint pairs in both directions. UG remains blocked for four directed segments because official route material establishes Kampala road corridors but not the exact Kampala–Entebbe and Kampala–Jinja intercity services in both directions. No reverse service was inferred.

## Authority boundary

- Production entities: 195 Country / 866 City-Destination / 4,071 POI / 5,132 total
- Readiness: 118 Plannable / 115 Evidence-backed / 77 Catalog-only
- Added Plannable: 0
- Added Evidence-backed: 0
- Candidate leakage: NONE
- Request-derived, planner-derived, fabricated, generic-ancestor, and historical-report self-certification sources: 0
- Runtime external evidence lookup: none

## Deterministic verification

- Batch 01 evidence verifier: PASS
- Batch 01 report/audit consistency: PASS
- Directed claim and endpoint identity binding: PASS
- Source provenance and claim binding: PASS
- Season identity and source binding: PASS
- Single-destination general rule: PASS
- Readiness promotion mutation rejection: PASS
- Batch-specific mutation regressions: 28/28 PASS
- Theme evidence trust: PASS
- Candidate evidence fail-closed verifier: PASS (10 fixed scenarios, 13 fault scenarios)
- Evidence 3a foundation: PASS
- Entity foundation: PASS
- Coverage semantics: PASS
- Semantic Gate: 5,132/5,132 PASS
- Route consumption regression: PASS
- Hard-constraint stress regression: PASS
- Browser/runtime assertions: 20/20 country searches and 5/5 focused constraints PASS
- Repository Node tests: 40/40 PASS
- Repository smoke: PASS
- Historical Git-anchored snapshots: 26/26 PASS
- Image asset baseline: PASS
- Image quality: PASS; invalid mappings 0
- Syntax: PASS
- Whitespace: PASS

The legacy `verify-route-v2-evidence-3a2-local-library.mjs` script still fails on sealed main because its fixture enables `ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED` without the repository's current `ROUTE_V2_RUNTIME_ENABLED` master gate. The failure occurs before reading Batch 01 data and is not caused by this implementation. The current foundation, schema, source, batch contract, Node, Route, browser, historical, and image checks above pass.

## Promotion review input

Ready evidence candidates: BB, RW, SC, SM, ZM, ZW.

Blocked countries: BZ, CV, DM, MN, TT, UG. BZ/CV/TT/UG lack complete transport authority; DM/MN lack exact month-bound season authority.

This input does not grant Plannable or Evidence-backed status. A separate promotion review must evaluate complete evidence coverage and authority before changing readiness.

## Persistent performance state

- Dedicated runner: NOT AVAILABLE
- Real qualification executions: 0
- Formal experiment executions: 1
- Formal run 34622976529: BLOCKED_INCONCLUSIVE
- Performance clearance: NOT CLEARED


## Transport authority P1 correction

Transport claims are now reviewed, source-bound, and directional. The importer no longer creates `supports` authority from a target segment and no longer expands an undirected pair into two directions. The canonical payload hash covers the exact URL, publisher, page identity, reviewed fact, endpoint identities, directionality, mode, retrieval time, and declared supports. All 32 previously admitted directions were re-adjudicated: 28 remain admitted and four are blocked.

TT no longer uses `/from/pos/` for Chaguanas–San Fernando. `Port of Spain -> Chaguanas` is bound to the Port of Spain archive and `Chaguanas -> San Fernando` to the Chaguanas archive. Their reverse directions remain blocked. CV's destinations page does not establish the exact Praia–Mindelo service directions, so both are blocked.

The shared production authority gate rejects unsupported reverse direction, untrusted URL, trusted-domain wrong page, forged claim, endpoint mutation, direction mutation, and same-domain source-page mutation. An explicit reviewed bidirectional claim admits both directed records.

## Season authority correction

All 33 prior profiles were re-adjudicated through the shared production season authority gate. Twenty-eight are admitted and five are blocked: Roseau, Portsmouth, Ulaanbaatar, Darkhan, and Erdenet. The Dominica warning guide does not bind its hazards to September, and the Mongolia dangerous-weather archive does not bind its winter hazards to January.

Each admitted claim seals the exact page, publisher, reviewed fact, country and Destination identities, geographic scope and reviewed applicability, supported month range, admitted month, fact type, factual risks/conditions, supports, and retrieval time. The importer validates and serializes these claims; it no longer manufactures season supports.

Season mutations for wrong page, forged claim, Destination, month, geographic scope, source page, and untrusted source are rejected through the production authority gate. A valid reviewed claim passes.

## Image reference authority boundary

Production Evidence source URLs are classified semantically as `evidence-source`, including image-like URL suffixes. They remain visible to Evidence auditing but stay outside the production image-reference seal. Production and manifest image references remain sealed; the baseline was not regenerated.

## Independent reviewed claim catalog

Production authority no longer accepts caller-supplied expected claims. The versioned catalog at `data/knowledge/reviewed-claims/plannable-expansion-batch01-reviewed-claims.json` is loaded by the module-owned catalog resolver. Transport and season validators resolve authority by stable `claimId`, reject unknown IDs, compare the candidate canonical payload and catalog-sealed hash against the resolved catalog record, and then apply source/page/identity/direction/month rules. Hash creation alone cannot grant membership, and no registration API exists.

Production-pattern regressions reject TT and BB trusted-domain wrong-page claims after caller hash recomputation, arbitrary new IDs, and arbitrary caller-created sealed claims. Valid catalog members continue to pass.
