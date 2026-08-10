# Route Generation V2 Knowledge Expansion Batch 01 Audit

## Scope

This report reruns the Knowledge Coverage Audit after the bounded Batch 01 expansion. It does not treat the batch as a route-engine change and does not claim that any V2 route has passed publication review.

## Entity totals

| Layer | Before | After | Added | Growth |
| --- | ---: | ---: | ---: | ---: |
| Country | 50 | 51 | 1 | 2.0% |
| City | 25 | 35 | 10 | 40.0% |
| POI | 75 | 105 | 30 | 40.0% |
| Total entities | 150 | 191 | 41 | 27.3% |

Batch 01 publishes Iceland plus Reykjavík, Vík í Mýrdal, Bangkok, Chiang Mai, Zürich, Lucerne, Auckland, Queenstown, Sydney and Melbourne. Every new City has exactly three QID-backed POIs. Parent references, entity IDs and all new QIDs are unique; blocking conflicts and new orphan records are zero.

The historical Singapore Country/City pair continues to share Q334 across entity types. Batch 01 does not add a new cross-type QID overlap.

## Reusable evidence totals

| Evidence layer | Before | After | Added |
| --- | ---: | ---: | ---: |
| Directed RouteLegEvidence | 8 | 20 | 12 |
| Risk-only SeasonEvidence | 6 | 26 | 20 |
| Total promoted evidence | 14 | 46 | 32 |

The six requested city pairs have two separately identified directed records. Durations remain `null` where an official source confirms the connection but does not provide a stable reusable duration. Each new City has two official risk-only month records. All new season records keep `suitabilityStatus=unknown`; none asserts a best month or recommended season.

## Coverage chain

The following countries now have all five layers present in the local knowledge foundation:

`Country → at least two City entities → three POIs per City → existing route inventory → reusable transport Evidence`

- Iceland
- Thailand
- Switzerland
- New Zealand
- Australia
- South Korea
- Japan

Iceland, Thailand, Switzerland, New Zealand and Australia additionally have the Batch 01 two-month risk records for each newly published City. South Korea receives the requested Seoul ↔ Busan transport pair only; this batch does not add South Korea season records.

This is a knowledge-foundation chain, not a publication claim. The Accepted repository was not changed and existing Accepted routes were not retroactively linked to these new evidence records. Publication remains governed by the existing Evidence, Validation, Review and Publication gates.

## Existing route inventory, read-only observation

The unchanged Accepted repository already contains routes referencing the Batch 01 countries:

| Country code | Stored Accepted records referencing country |
| --- | ---: |
| IS | 74 |
| TH | 33 |
| CH | 52 |
| NZ | 23 |
| AU | 27 |
| KR | 23 |

These counts are non-exclusive because a cross-country route contributes to every country it references. No route record was added or rewritten by this batch.

## Isolated browser acceptance

The application was started with all generated Search, Candidate, Trace, EvidenceBundle and metrics files redirected to an isolated temporary directory. The formal Accepted repository remained read-only.

| Query | Visible result after Batch 01 |
| --- | --- |
| 日本14天 | One 14-day Japan `延展探索` preview; existing Kyoto/Tokyo knowledge only |
| 日本30天 | One 30-day Japan `深度探索` preview; existing Kyoto/Tokyo knowledge only |
| 冰岛7天 | Six single-country results; visible routes include Reykjavík and Vík |
| 泰国10天 | Four single-country results; the new preview uses Bangkok and Chiang Mai |
| 澳大利亚14天 | Two single-country results; the new preview uses Melbourne and Sydney |
| 新西兰14天 | One single-country preview using Auckland and Queenstown |

The New Zealand detail page visibly contains Auckland, Queenstown, Auckland Art Gallery, Auckland War Memorial Museum, Sky Tower, Lake Wakatipu and Queenstown Gardens. Generated routes remain marked `证据待验证`; no risk-only season record is presented as a recommendation. Browser console warnings/errors were zero, and the inspected page loaded only local application assets and a local country image.

## Remaining gaps

- Three POIs per City is a stable pilot depth, not broad destination completeness.
- The Thailand 10-day preview visibly uses Bangkok and Chiang Mai, but its current detail view does not surface the six available POIs; the POIs are present and queryable in the Entity Layer, so this is an existing route-detail selection limitation rather than missing Batch data.
- The promoted evidence library covers one core bidirectional pair per target country, not every itinerary leg.
- Season records preserve official hard-risk observations only and intentionally do not score destination suitability.
- Formal Accepted-to-Evidence association remains unchanged, so new evidence cannot by itself make an existing route publishable.
