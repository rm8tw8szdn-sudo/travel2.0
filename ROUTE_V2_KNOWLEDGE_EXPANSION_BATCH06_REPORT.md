# Route V2 Knowledge Expansion Batch 06 Report

Generated: 2026-08-17T11:00:00.000Z

## Scope and outcome

- Countries expanded: 20 in 4 waves (Tier 1: 9; Tier 2: 8; Tier 3: 3)
- Published additions: 4 Countries / 156 Cities / 1,029 POIs
- Published totals: 79 Countries / 601 Cities / 4,038 POIs / 4,718 entities
- Directed Transport Evidence added: 172
- Objective Month Risk added: 80
- Route consumption: 56/56 PASS across 20 target countries; external calls: 0
- Duplicate Entity ID: 0; duplicate City QID: 0; duplicate POI QID: 0; orphan: 0; published conflict: 0
- Quarantined review items: 8,528; quarantined Cities: 1; accepted below editorial POI target without padding: 23

## Portfolio semantics

- Country Entities (Catalog): 79
- Plannable Countries: 78
- Route Knowledge Covered Countries: 78
- Evidence-backed Countries: 75
- Catalog-only: CN

China was retained as Catalog-only because Search V1 intentionally blocks it. Uruguay replaces it in the 20-country Route coverage matrix; no Route Engine policy was relaxed.

## Image expansion and debt payment

- Historical image debt before Batch 06: 411
- Historical dedicated destination images added: 47
- Historical needsBackfill after Batch 06: 531
- Batch 06 Country Covers: 20/20
- Batch 06 verified dedicated destination images: 49
- Country Cover coverage: 78/78
- Dedicated City coverage: 96/601 (16%)
- Dedicated Core POI coverage: 42/224 (18.8%)
- Neutral placeholders: 687 (505 City + 182 Core POI)
- Remaining needsBackfill: 687
- invalidMapping: 0
- Runtime external image requests allowed: false

Dedicated imagery is accepted only when bound to the exact entity QID through Wikidata P18, downloaded to a fixed local asset, and accompanied by auditable Commons source and license metadata. Missing or unconfirmed imagery stays neutral and remains debt.

## Real browser acceptance

- Route V2 country searches: 20/20 at 7 days
- Tier 1 long-trip searches: 18/18 at 14/21 days
- Hard-constraint and historical regression searches: 12/12
- Route → Detail → Trip → Footprint: 2 Countries / 6 Cities; duplicate City: 0
- Dedicated images visually inspected: 96; wrong semantic image: 0; broken image: 0
- Console errors/warnings: 0/0; runtime external image/Evidence requests: 0/0

## Asset size and duplicate audit

- Local image assets: 283
- Total bytes: 43101273
- >300KB: 18; >500KB: 9; >1MB: 1; >5MB: 0
- Exact duplicate groups: 2; perceptual duplicate groups: 9

## Evidence discipline

Every transport direction has an independent ID. Unknown duration, frequency and transfers remain unknown. Month Risk contains objective hazards only. Candidate Cities/POIs that failed exact identity, type, country, coordinate, distance or route-eligibility checks remain quarantined and are not published.
