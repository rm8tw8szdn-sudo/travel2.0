# Route Generation V2 Knowledge Repository Cleanup Plan

Generated: 2026-07-14

## Recommendation

Pause Phase 3C-3 Planner Online Evidence Sidecar until the Knowledge Repository cleanup path is explicit. Phase 3C-3 can run later as a sidecar, but it should write evidence against clean Candidate and Entity identifiers, not against RouteRecord-derived data.

## Target Layers

### 1. Entity Layer

Stores countries, cities, attractions and route anchors.

Required fields:

- `entityId`
- `entityType`
- `entitySourceType`
- `countryCode`
- `name`
- `canonicalName`
- `aliases`
- `coordinates`
- `provenance`
- `confidence`

RouteRecord output must not write directly into this layer.

### 2. Fact Layer

Stores facts such as transport, season, budget, distance and opening-state facts.

Required fields:

- `factId`
- `subjectEntityId`
- `predicate`
- `object`
- `source`
- `confidence`
- `observedAt`
- `supportsWhichDecision`

### 3. Relationship Layer

Stores structured relationships:

- `belongsTo`
- `near`
- `connectedTo`
- `routeSegment`
- `thematicRelation`

### 4. Derived Layer

Stores generated artifacts:

- `RouteCandidate`
- `EvidenceBundle`
- `DecisionTrace`
- `RouteRecord`

Derived artifacts may reference Entity/Fact/Relationship IDs, but must not be used to fabricate them.

## P0 Cleanup

Status: implemented in this branch.

Scope:

- Add minimal schema and source classification.
- Preserve source classification in candidates.
- Split local evidence into fact-verified and structure-only identity.
- Add a read-only repository audit script.
- Keep all user-facing route behavior unchanged.

## P1 Cleanup

Recommended next cleanup before Phase 3C-3 grows:

1. Add explicit provenance to the 348 KG pool records.
2. Split manual anchors from Wikidata QID entities in storage.
3. Create a reviewed promotion path from accepted-route placeholders to Entity Layer records.
4. Add alias tables for multilingual names and known spelling variants.
5. Add country-level Wikidata IDs to `data/countries.zh.json`.
6. Add duplicate review reports for the 4 KG duplicate name/country pairs and 1443 accepted-derived duplicate IDs.

## P2 Cleanup

Longer-term improvements:

1. Add relationship facts for nearby and transport-connected places.
2. Add source freshness and confidence decay.
3. Add online evidence canonical URL handling.
4. Add domain-level corroboration rules after Phase 3C-3.
5. Add region and subregion normalization.

## P0 / P1 / P2 Issue List

| Priority | Issue | Impact | Suggested Action | Needs Network | Needs Human Review |
| --- | --- | --- | --- | --- | --- |
| P0 | RouteRecord-derived data can look like KG data | Wrong verified evidence | Classify as `route-record-derived` | No | No |
| P0 | Coverage placeholders can become identity evidence | False confidence in candidates | Mark as structure-only | No | No |
| P0 | Search fallback anchors can become identity evidence | False verified destinations | Mark as structure-only | No | No |
| P0 | Legacy evidence lacks candidate linkage | Cannot explain decisions | Isolate from V2 evidence | No | No |
| P1 | KG records lack explicit provenance | Hard to audit fact trust | Add provenance fields | Maybe | Yes |
| P1 | Country catalog lacks QIDs | Weak country identity | Add QIDs and source metadata | Maybe | Yes |
| P1 | Accepted-derived placeholders are broad but unverified | Candidate quality risk | Build promotion workflow | Maybe | Yes |
| P2 | No Fact Layer repository yet | Hard to compare candidates | Add fact store after entity cleanup | Maybe | Yes |

## Files To Keep Out Of Cleanup

Do not modify these in P0/P1 unless a later phase explicitly authorizes it:

- `.route-v2-cache/accepted-routes.json`
- `route-feed-bootstrap.js`
- Feed / Search / Detail code paths
- Planner route selection logic
- RouteRecord rendering logic

## Phase 3C-3 Gate

Before implementing Planner Online Evidence Sidecar, confirm:

- Candidate destinations carry stable source classifications.
- EvidenceBundle can distinguish fact-verified vs structure-only data.
- Online evidence cannot write verified facts based on RouteRecord text.
- Evidence store writes remain sidecar-only and flag-gated.
