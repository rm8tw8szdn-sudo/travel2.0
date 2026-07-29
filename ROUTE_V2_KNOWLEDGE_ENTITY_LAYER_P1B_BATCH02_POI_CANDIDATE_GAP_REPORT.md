# Route V2 Knowledge Entity Layer P1B Batch02 POI Candidate Gap Report

Date: 2026-07-20

## Outcome

- Base candidate snapshot: 30 candidates across 10 Cities
- Evidence-gate result: 30 pass, 0 blocking
- Frozen selection: 30 primary POIs, 0 backups
- Distribution: exactly 3 primary POIs per City
- Supplements: none required
- Remaining candidate gaps: none

## Frozen evidence

- Candidate raw SHA-256: `91e4297e07fa836dfc2c070f1105ee652a4024f665758bc36e416997889d7908`
- Selection SHA-256: `6e0918b3f84ece5770d74d9d4b7c3e9d26644e330fb6628f99c598b0ad956753`
- Selection policy: `p1b-batch02-poi-selection-v1`
- Selection rule: `three-primary-backup-optional`
- Official endpoints used during the one-time refresh: Wikidata API and Wikidata Query Service
- Offline publication network calls: 0

## Selection adjustments made before freezing

- Seoul uses Changdeokgung instead of Gyeongbokgung because the retrieved Gyeongbokgung entity did not provide the required English canonical label at the evidence gate.
- Madrid uses the Royal Palace of Madrid instead of Plaza Mayor because the retrieved canonical English label for Plaza Mayor was the generic `Main Square`.
- Busan uses Busan Museum, Diamond Tower, and Haedong Yonggungsa. Beach, market, and settlement-like candidates were excluded to avoid Natural Area, Destination, or settlement semantics in the POI layer.
- Rome keeps Colosseum under the same established description fallback policy already accepted by the Pilot pipeline.

No hard-coded replacement evidence, supplementary raw snapshot, or backup leakage was introduced.
