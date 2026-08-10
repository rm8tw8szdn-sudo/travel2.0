# Route V2 Knowledge Coverage Dashboard — Batch 03

## Scope and scoring

Batch 03 deepens Italy, France, Spain and South Korea. It does not change RouteIntent, Search, Planner, Candidate, Publication, Runtime, Accepted routes or formal Cache. `Coverage %` is a deterministic knowledge-investment indicator, not a claim that a route is publishable.

The score retains the Batch 02 six-layer formula, with equal weight for:

1. Country entity present: `0` or `1`.
2. City depth: `min(city count / 10, 1)`.
3. POI depth: `min(POI count / 50, 1)`.
4. Directed transport connectivity: `min(directed Evidence / (2 × max(city count - 1, 1)), 1)`.
5. Risk-month depth: `min(month Evidence / (2 × city count), 1)`.
6. Existing Accepted/Feed inventory: `min(route count / 20, 1)`.

The six values are averaged and rounded to the nearest percentage point. Accepted routes are counted read-only; a cross-country route counts for every country it references. Evidence association rate is the percentage of typed City entities touched by at least one directed transport or risk-month record.

`Maximum reliable days` is a conservative knowledge-depth proxy: `min(30, floor(POI count / 3))`, provided the country has typed Cities, POIs and bidirectional transport Evidence. It does not override route validation or publication gates.

## Cumulative totals

| Layer | Before Batch 03 | After Batch 03 | Added |
| --- | ---: | ---: | ---: |
| Country | 51 | 51 | 0 |
| City | 55 | 99 | 44 |
| POI | 252 | 568 | 316 |
| Total entities | 358 | 718 | 360 |
| Directed RouteLegEvidence | 58 | 130 | 72 |
| Risk-only SeasonEvidence | 40 | 56 | 16 |

## Ten-country dashboard

| Country | Country entity | Cities | POIs | Directed transport | Risk months | Accepted/Feed routes | Evidence association | Maximum reliable days | Coverage | Main gap |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Japan | present | 22 | 153 | 38 | 14 | 97 | 100% | 30 | **87%** | More risk-month depth outside the nine covered cities |
| Italy | present | 13 | 90 | 18 | 4 | 31 | 85% | 30 | **82%** | Regional entities and denser south/island transport evidence |
| France | present | 13 | 82 | 18 | 4 | 55 | 77% | 27 | **82%** | Loire/Provence regional typing and broader risk-month coverage |
| Spain | present | 13 | 98 | 16 | 4 | 31 | 77% | 30 | **80%** | Island entities and official air/ferry evidence for island routes |
| South Korea | present | 13 | 70 | 22 | 4 | 23 | 85% | 23 | **85%** | Jeju Island/Pyeongchang regional typing and additional month risks |
| Iceland | present | 2 | 6 | 2 | 4 | 74 | 100% | 2 | **72%** | City and POI depth beyond Reykjavík/Vík |
| Thailand | present | 2 | 6 | 2 | 4 | 33 | 100% | 2 | **72%** | More destinations, POIs and intercity corridors |
| Switzerland | present | 2 | 6 | 2 | 4 | 52 | 100% | 2 | **72%** | More destinations and alpine transport/risk coverage |
| New Zealand | present | 2 | 6 | 2 | 4 | 23 | 100% | 2 | **72%** | More cities/regions and domestic transport depth |
| Australia | present | 2 | 6 | 2 | 4 | 27 | 100% | 2 | **72%** | More cities/regions and long-distance transport depth |

## Batch 03 coverage movement

| Country | Batch 02 | Batch 03 | Change |
| --- | ---: | ---: | ---: |
| Italy | 39% | 82% | +43 pp |
| France | 39% | 82% | +43 pp |
| Spain | 39% | 80% | +41 pp |
| South Korea | 55% | 85% | +30 pp |

## Complete local knowledge chains

All ten dashboard countries now have at least Country → City → POI → existing route inventory → bidirectional transport Evidence → objective risk-month Evidence. The depth is not equal: Japan and the four Batch 03 countries can support materially richer route composition, while Iceland, Thailand, Switzerland, New Zealand and Australia remain two-city pilots.

All SeasonEvidence records keep `suitabilityStatus=unknown`. They record objective risk only and do not claim a best month or recommended season. Transport duration, transfers and frequency remain `null`/`unknown` whenever the official source does not state a stable reusable fact.
