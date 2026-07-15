# Route Generation V2 Knowledge Repository Expansion P1A Pilot

## Scope

This phase implements the Country Entity Baseline pilot for five countries only:

- AD: Andorra
- CD: Democratic Republic of the Congo
- FJ: Fiji
- JP: Japan
- MA: Morocco

The pilot validates the reusable import pipeline for the future 195-country baseline. It does not expand to all 195 countries, does not implement P1B destination coverage, and does not resume Phase 3C-3.

## Why Five Countries First

The five-country pilot covers different data shapes before global expansion:

- JP: high-coverage country with existing route/KG relevance.
- AD: small European microstate.
- FJ: island country with alternate Chinese labels.
- MA: non-English country already represented in search fallback data.
- CD: country where name and Congo-related ambiguity must not be silently merged.

## Data Sources

Country identity uses only approved country sources:

- ISO / P1A pilot seed: ISO alpha-2, ISO alpha-3, ISO numeric, subregion seed.
- `data/countries.zh.json`: Chinese canonical name and project region group.
- Wikidata SPARQL: QID, English label, aliases, capital, continent, representative coordinates.

The pipeline does not use:

- accepted routes
- RouteRecord
- plannerReason
- summary
- coverage placeholders
- search fallback entities
- route-record-derived evidence

## Raw Snapshot

Raw Wikidata snapshot:

- `data/knowledge/raw/countries-p1a-pilot.wikidata.json`

The first pilot run called Wikidata SPARQL and wrote the raw snapshot. Later normalize, validate, dedupe, audit, and verification can run from that snapshot without network access.

## Published Pilot Assets

Published pilot assets:

- `data/knowledge/countries.p1a-pilot.json`
- `data/knowledge/provenance.p1a-pilot.json`
- `data/knowledge/conflicts.p1a-pilot.json`
- `data/knowledge/review-queue.p1a-pilot.json`

The assets are sorted by ISO alpha-2 and contain no runtime random fields. `retrievedAt` is copied from the raw snapshot so repeated normalization of the same raw input remains stable.

## Schema

Each country entity contains:

- `entityId`
- `entityType: "country"`
- `isoAlpha2`
- `isoAlpha3`
- `isoNumeric`
- `wikidataId`
- `canonicalNameZh`
- `canonicalNameEn`
- `aliases`
- `continent`
- `region`
- `subregion`
- `capital`
- `coordinates`
- `entitySourceType`
- `provenance`
- `confidence`
- `retrievedAt`

`entityId` is generated from stable country identity fields and is not based on display names.

## Normalize

Normalization handles:

- ISO alpha-2 / alpha-3 uppercasing
- ISO numeric zero-padding
- QID validation
- alias de-duplication
- coordinate validation
- capital structure
- continent structure
- field-level provenance
- snapshot-level `retrievedAt`

Normalization does not infer QID from names, does not infer country from coordinates, and does not mark an entity as high-confidence only because most fields are present.

## Dedupe

Dedupe priority:

1. Wikidata QID
2. ISO alpha-2
3. ISO alpha-3
4. normalized name only as a secondary diagnostic signal

Coordinates are not used as the primary dedupe key. The pilot explicitly protects against accidentally merging the Democratic Republic of the Congo with the Republic of the Congo.

## Conflicts

Blocking conflicts:

- Total: 0
- Blocking: 0

Conflict output:

- `data/knowledge/conflicts.p1a-pilot.json`

## Review Queue

Review queue:

- Total: 1
- Type: `multiple-country-labels`
- Country: FJ

This item records multiple Wikidata Chinese label variants for Fiji. The published `canonicalNameZh` remains sourced from `data/countries.zh.json`.

## Data QA Follow-Up: Geographic Region Candidates

Final data QA found one pre-195-country risk: the normalizer could silently choose the first sorted Wikidata `P30` value when a country has multiple continent or geographic-region candidates.

Root cause:

- The initial pilot normalized `continent` from Wikidata `P30` by sorting available values and selecting the first candidate.
- That is acceptable only when there is one deduplicated candidate.
- For global expansion, Wikidata `P30` may represent a traditional continent, macro-region, or special geographic region, so multiple values must not be silently collapsed.

New rule:

- A single deduplicated `P30` candidate publishes normally and does not enter review.
- Duplicate identical `P30` candidates are deduped and do not enter review.
- Multiple distinct `P30` candidates create a `multiple-continent-candidates` review item.
- Missing `P30` creates a `continent-candidate-missing` review item and fails validation instead of being filled silently.
- If a curated override is present, the override can provide the canonical `continent` value, but all raw Wikidata candidates remain in provenance and a `multiple-continent-candidates-with-curated-override` review item is emitted.
- Country entity validation now requires both `continent.wikidataId` and `continent.canonicalNameEn`; an empty continent object is not accepted.

Field semantics:

- `continent` currently reflects Wikidata `P30` or an explicitly curated override.
- It should be treated as a broad geographic-region field for P1A, not as a guaranteed traditional seven-continent label.

Current Fiji result:

- Fiji still has one deduplicated Wikidata `P30` candidate in the pilot data.
- It does not create a continent review item.
- Its existing review item remains `multiple-country-labels`.

Additional tests cover:

- single continent candidate
- duplicate same-continent candidates
- multiple distinct continent candidates
- curated override with raw candidate preservation
- missing continent candidate
- current Fiji data behavior

Review output:

- `data/knowledge/review-queue.p1a-pilot.json`

## Provenance

Provenance coverage:

- 5 / 5 countries
- No unknown source
- No coverage-placeholder source
- No search-fallback source
- No route-record-derived source

Every required country field has field-level provenance.

## Pilot Results

Published countries:

| ISO | Entity | QID | Chinese Name | English Name |
| --- | --- | --- | --- | --- |
| AD | country | Q228 | 安道尔 | Andorra |
| CD | country | Q974 | 刚果（金） | Democratic Republic of the Congo |
| FJ | country | Q712 | 斐济 | Fiji |
| JP | country | Q17 | 日本 | Japan |
| MA | country | Q1028 | 摩洛哥 | Morocco |

Coverage:

- Country count: 5
- ISO alpha-2 coverage: 5 / 5
- ISO alpha-3 coverage: 5 / 5
- QID coverage: 5 / 5
- Chinese name coverage: 5 / 5
- English name coverage: 5 / 5
- Capital coverage: 5 / 5
- Coordinate coverage: 5 / 5
- Provenance coverage: 5 / 5

## Tests

Focused checks run:

- `node scripts/verify-knowledge-country-baseline-p1a-pilot.mjs`
- `node scripts/audit-knowledge-country-baseline-pilot.mjs`

Focused result:

- PASS
- Country set: AD / CD / FJ / JP / MA
- Blocking conflicts: 0
- Review queue: 1
- Deterministic normalization: true
- FeedReadyPoolCount: all 851 / cross 357 / single 494

Full regression run:

- `node scripts/verify-knowledge-country-baseline-p1a-pilot.mjs`: PASS
- `node scripts/verify-route-v2-knowledge-repository-cleanup-p0.mjs`: PASS
- `node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs`: PASS
- `node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs`: PASS
- `node scripts/verify-route-v2-phase3b2-planner-evidence-sidecar.mjs`: PASS
- `node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs`: PASS
- `node scripts/verify-route-v2-phase3a-evidence-bundle.mjs`: PASS
- `node scripts/verify-route-v2-tooling-cleanup.mjs`: PASS
- `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs`: PASS
- `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs`: PASS
- `node scripts/verify-route-v2-phase2a-candidate-pool.mjs`: PASS
- `node scripts/verify-route-v2-phase1-trace.mjs`: PASS
- `node scripts/verify-concept-taxonomy.mjs`: PASS
- `node scripts/verify-gold-cases.mjs`: PASS
- `node scripts/verify-route-content-quality.mjs`: PASS
- `git diff --check`: PASS

`git diff --check` printed only an existing line-ending warning for `src/lib/routes/index.mjs`; it did not report whitespace errors.

## Project Invariance

The P1A pilot does not modify:

- Planner
- Candidate generation behavior
- RouteRecord
- Feed
- Search
- Detail
- image system
- accepted repository
- `route-feed-bootstrap.js`
- `.route-v2-cache` as a formal knowledge asset

The published assets are versioned static pilot data under `data/knowledge`.

## Not Implemented

This pilot has not:

- expanded to all 195 countries
- implemented P1B minimum destination coverage
- changed the route planner
- restored Phase 3C-3
- used accepted routes as country facts
- used RouteRecord as country facts

## Next Gate

The pilot is ready for final read-only validation once the complete regression suite passes. The 195-country expansion should continue on the same branch only after user approval, reusing this schema, normalizer, deduper, importer, audit, and verification flow.

## Batch 01 Expansion

After the pilot passed final read-only validation, Batch 01 imported 15 additional countries on the same branch using the same schema, normalizer, validator, deduper, provenance rules, conflict rules, review queue rules, and raw snapshot to normalize to publish flow.

Batch 01 countries:

- AR: Argentina
- AU: Australia
- BR: Brazil
- CA: Canada
- DE: Germany
- EG: Egypt
- ES: Spain
- FR: France
- GB: United Kingdom
- IT: Italy
- MX: Mexico
- NZ: New Zealand
- TR: Turkey
- US: United States of America
- ZA: South Africa

Batch 01 raw snapshot:

- `data/knowledge/raw/countries-p1a-batch01.wikidata.json`
- Provider: Wikidata SPARQL
- Retrieved at: `2026-07-14T09:50:27.742Z`
- Country count: 15
- Row count: 144
- Size: 333346 bytes

Batch 01 published assets:

- `data/knowledge/batches/countries.p1a-batch01.json`
- `data/knowledge/batches/provenance.p1a-batch01.json`
- `data/knowledge/batches/conflicts.p1a-batch01.json`
- `data/knowledge/batches/review-queue.p1a-batch01.json`

The pilot assets remain unchanged in their original paths. Batch 01 assets are independent and do not publish the final `countries.v1.json`.

## Batch 01 Results

Batch 01 coverage:

- Country count: 15 / 15
- ISO alpha-2 coverage: 15 / 15
- ISO alpha-3 coverage: 15 / 15
- QID coverage: 15 / 15
- Chinese canonical name coverage: 15 / 15
- English canonical name coverage: 15 / 15
- Capital coverage: 15 / 15
- Coordinate coverage: 15 / 15
- Provenance coverage: 15 / 15

Batch 01 conflicts:

- Total: 0
- Blocking: 0

Batch 01 review queue:

- Total: 5
- `DE`: `multiple-country-labels`
- `FR`: `multiple-country-labels`
- `TR`: `multiple-continent-candidates`
- `US`: `multiple-country-labels`
- `ZA`: `multiple-capital-candidates`

Special handling:

- Turkey keeps both Wikidata P30 candidates, Europe `Q46` and Asia `Q48`, in review. The selected canonical value is deterministic, but the alternate candidate is not discarded.
- South Africa keeps all three capital candidates in review: Bloemfontein `Q37701`, Pretoria `Q3926`, and Cape Town `Q5465`. The selected capital aliases no longer mix aliases from the other capital candidates.
- United Kingdom is published as `Q145` / United Kingdom. England and Great Britain are not published as country entities.
- United States is published as `Q30`, with Washington, D.C. `Q61` as capital. It is not merged with territories.
- Australia keeps Wikidata geographic-region provenance even though country and region naming can overlap.
- Egypt currently has a single Wikidata P30 candidate, Africa `Q15`, so it does not enter the multiple-continent review queue.

## Merge Compatibility

Pilot + Batch 01 in-memory merge verification:

- Merged country count: 20
- ISO alpha-2 unique: true
- ISO alpha-3 unique: true
- QID unique: true
- Shared deduper conflicts: 0
- Provenance remains one-to-one: 20 / 20
- Sort order remains stable by ISO alpha-2
- Conflicts and review queues can be merged without overwriting each other

Current P1A coverage:

- 20 / 195 countries
- Later batches have not started
- Final `countries.v1.json` has not been published

## Batch 01 Tests

Additional focused checks run:

- `node scripts/verify-knowledge-country-baseline-p1a-batch01.mjs`: PASS
- `node scripts/audit-knowledge-country-baseline-batch01.mjs`: PASS

Batch 01 verification covers:

- exact 15-country batch membership
- Pilot + Batch 01 merged count of 20
- ISO alpha-2 / alpha-3 / QID uniqueness
- 100% provenance
- zero blocking conflicts
- Turkey multiple continent review
- South Africa multiple capital review
- United Kingdom identity not collapsed into England or Great Britain
- United States capital and identity checks
- offline deterministic normalization
- no accepted route, RouteRecord, or old evidence source use

The full regression suite passed after Batch 01. User-facing systems remain unchanged.

## Batch 02 Expansion

Batch 02 imported 15 additional countries on the same branch using the same schema, normalizer, validator, deduper, provenance rules, conflict rules, review queue rules, and raw snapshot to normalize to publish flow.

Batch 02 countries:

- AE: United Arab Emirates
- CH: Switzerland
- CN: China
- GR: Greece
- ID: Indonesia
- IN: India
- KE: Kenya
- KR: South Korea
- MY: Malaysia
- NG: Nigeria
- RU: Russia
- SA: Saudi Arabia
- SG: Singapore
- TH: Thailand
- VN: Vietnam

Batch 02 raw snapshot:

- `data/knowledge/raw/countries-p1a-batch02.wikidata.json`
- Provider: Wikidata SPARQL
- Retrieved at: `2026-07-14T11:11:02.686Z`
- Country count: 15
- Row count: 132
- Size: 312310 bytes

The first two Batch 02 refresh attempts used the default 20-second timeout and aborted. The importer now accepts explicit `--timeout-ms` and `--retries` options so large but bounded country batches can be fetched without changing schema or normalization behavior. The successful refresh used the same fixed 15-country Batch 02 set with `--timeout-ms=60000 --retries=1`.

Batch 02 published assets:

- `data/knowledge/batches/countries.p1a-batch02.json`
- `data/knowledge/batches/provenance.p1a-batch02.json`
- `data/knowledge/batches/conflicts.p1a-batch02.json`
- `data/knowledge/batches/review-queue.p1a-batch02.json`

The pilot and Batch 01 assets remain unchanged. Batch 02 assets are independent and do not publish the final `countries.v1.json`.

## Batch 02 Results

Batch 02 coverage:

- Country count: 15 / 15
- ISO alpha-2 coverage: 15 / 15
- ISO alpha-3 coverage: 15 / 15
- QID coverage: 15 / 15
- Chinese canonical name coverage: 15 / 15
- English canonical name coverage: 15 / 15
- Capital coverage: 15 / 15
- Coordinate coverage: 15 / 15
- Provenance coverage: 15 / 15

Batch 02 conflicts:

- Total: 0
- Blocking: 0

Batch 02 review queue:

- Total: 5
- `MY`: `multiple-country-labels`
- `NG`: `capital-curated-override`
- `NG`: `multiple-country-labels`
- `RU`: `multiple-continent-candidates`
- `TH`: `multiple-country-labels`

Special handling:

- China is published as `Q148` / China. Historical regimes, cities, and regional entities are not published as Batch 02 country entities.
- South Korea is published as `Q884` / South Korea. North Korea `Q423` is not published in this batch.
- Singapore is published as country `Q334` and keeps `entityType: "country"` even though country and city names overlap.
- Russia keeps all Wikidata P30 candidates in review: Europe `Q46`, Asia `Q48`, and Eurasia `Q5401`. The selected canonical value is deterministic, but no alternate candidate is discarded.
- Indonesia currently has one Wikidata P36 capital candidate, Jakarta `Q3630`; no alternate capital was returned by this snapshot, so no multiple-capital review was emitted.
- Malaysia currently has one Wikidata P36 capital candidate, Kuala Lumpur `Q1865`; no alternate administrative-capital candidate was returned by this snapshot, so no multiple-capital review was emitted.
- Nigeria's Wikidata snapshot returned capital Q3787 with Chinese labels but no English `rdfs:label`. A generic `capitalOverride` path records an explicit curated English label, `Abuja`, with manual-override provenance and a `capital-curated-override` review item. Raw Wikidata P36 candidates remain preserved in provenance.
- United Arab Emirates is published as `Q878` with Abu Dhabi `Q1519` as capital; emirates are not published as separate country aliases.
- Saudi Arabia is published as `Q851`; aliases and canonical names remain attached to the country entity.
- Switzerland's multilingual labels remain aliases. No high-priority review is emitted unless Wikidata returns conflicting country identity data.
- Kenya and Nigeria use representative country coordinates from Wikidata P625 and do not use capital coordinates as a silent replacement.

## Batch 02 Merge Compatibility

Pilot + Batch 01 + Batch 02 in-memory merge verification:

- Merged country count: 35
- ISO alpha-2 unique: true
- ISO alpha-3 unique: true
- QID unique: true
- entityId unique: true
- Shared deduper conflicts: 0
- Provenance remains one-to-one: 35 / 35
- Sort order remains stable by ISO alpha-2
- Conflicts and review queues can be merged without overwriting each other

Current P1A coverage:

- 35 / 195 countries
- 160 countries remain outside the current P1A checkpoint
- Batch 03 has not started
- P1B destination coverage has not started
- Country-to-city-to-POI Entity Layer relationships have not been validated in this checkpoint
- Final `countries.v1.json` has not been published

## Batch 02 Tests

Additional focused checks run:

- `node scripts/verify-knowledge-country-baseline-p1a-batch02.mjs`: PASS
- `node scripts/audit-knowledge-country-baseline-batch02.mjs`: PASS

Batch 02 verification covers:

- exact 15-country batch membership
- Pilot + Batch 01 + Batch 02 merged count of 35
- ISO alpha-2 / alpha-3 / QID / entityId uniqueness
- 100% provenance
- zero blocking conflicts
- China identity as `Q148`
- South Korea identity as `Q884` and no North Korea publish
- Singapore country/city name overlap without entityType demotion
- Russia multiple continent review
- Nigeria capital curated override provenance and review item
- Indonesia and Malaysia capital candidates are not silently swallowed if multiple candidates appear
- offline deterministic normalization
- no accepted route, RouteRecord, or old evidence source use

The full regression suite passed after Batch 02. User-facing systems remain unchanged.
