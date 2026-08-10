# Route V2 Knowledge Coverage Dashboard — Batch 04

## Scope and scoring

Batch 04 deepens Germany, Austria, Portugal, Greece and the Netherlands. It does not change RouteIntent, Search, Planner, Candidate, Publication, Runtime, Accepted routes, formal Cache or Runtime State. `Coverage %` is a deterministic knowledge-investment indicator, not a claim that a route is publishable.

The score retains the Batch 02/03 six-layer formula, with equal weight for:

1. Country entity present: `0` or `1`.
2. City depth: `min(city count / 10, 1)`.
3. POI depth: `min(POI count / 50, 1)`.
4. Directed transport connectivity: `min(directed Evidence / (2 × max(city count - 1, 1)), 1)`.
5. Risk-month depth: `min(month Evidence / (2 × city count), 1)`.
6. Existing Accepted/Feed inventory: `min(route count / 20, 1)`.

The six values are averaged and rounded to the nearest percentage point. Accepted routes are counted read-only; a cross-country route counts for every country it references. Evidence association rate is the percentage of typed City entities touched by at least one directed transport or risk-month record.

`Maximum reliable days` is a conservative knowledge-depth proxy: `min(30, floor(POI count / 3))`, provided the country has typed Cities, POIs and bidirectional transport Evidence. It does not override route validation or publication gates.

## Cumulative totals

| Layer | Before Batch 04 | After Batch 04 | Added |
| --- | ---: | ---: | ---: |
| Country | 51 | 51 | 0 |
| City | 99 | 144 | 45 |
| POI | 568 | 904 | 336 |
| Total entities | 718 | 1,099 | 381 |
| Directed RouteLegEvidence | 130 | 196 | 66 |
| Risk-only SeasonEvidence | 56 | 76 | 20 |

## Fifteen-country dashboard

| Country | Country entity | Cities | POIs | Directed transport | Risk months | Accepted/Feed routes | Evidence association | Maximum reliable days | Coverage | Main gap |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Japan | present | 22 | 153 | 38 | 14 | 97 | 100% | 30 | **87%** | More risk-month depth outside the nine covered cities |
| South Korea | present | 13 | 70 | 22 | 4 | 23 | 85% | 23 | **85%** | Jeju Island/Pyeongchang regional typing and additional month risks |
| Italy | present | 13 | 90 | 18 | 4 | 31 | 85% | 30 | **82%** | Regional entities and denser south/island transport evidence |
| France | present | 13 | 82 | 18 | 4 | 55 | 77% | 27 | **82%** | Loire/Provence regional typing and broader risk-month coverage |
| Spain | present | 13 | 98 | 16 | 4 | 31 | 77% | 30 | **80%** | Island entities and official air/ferry evidence for island routes |
| Germany | present | 12 | 91 | 16 | 4 | 135 | 83% | More risk-month depth and transport links for the two uncovered cities |
| Austria | present | 8 | 55 | 10 | 4 | 33 | 75% | Two more typed destinations and broader alpine risk/transport coverage |
| Portugal | present | 10 | 69 | 14 | 4 | 22 | 90% | Algarve regional typing and broader risk-month depth |
| Greece | present | 9 | 66 | 12 | 4 | 16 | 89% | Region/island types for Meteora, Crete, Rhodes and Corfu |
| Netherlands | present | 10 | 67 | 14 | 4 | 46 | 80% | Transport/risk association for the two uncovered cities |
| Iceland | present | 2 | 6 | 2 | 4 | 74 | 100% | 2 | **72%** | City and POI depth beyond Reykjavík/Vík |
| Thailand | present | 2 | 6 | 2 | 4 | 33 | 100% | 2 | **72%** | More destinations, POIs and intercity corridors |
| Switzerland | present | 2 | 6 | 2 | 4 | 52 | 100% | 2 | **72%** | More destinations and alpine transport/risk coverage |
| New Zealand | present | 2 | 6 | 2 | 4 | 23 | 100% | 2 | **72%** | More cities/regions and domestic transport depth |
| Australia | present | 2 | 6 | 2 | 4 | 27 | 100% | 2 | **72%** | More cities/regions and long-distance transport depth |

## Batch 04 coverage movement

| Country | Before Batch 04 | After Batch 04 | Change |
| --- | ---: | ---: | ---: |
| Germany | 72% | 82% | +10 pp |
| Austria | 33% | 79% | +46 pp |
| Portugal | 33% | 83% | +50 pp |
| Greece | 30% | 78% | +48 pp |
| Netherlands | 72% | 83% | +11 pp |

## Complete local knowledge chains

All fifteen dashboard countries have at least Country → City → POI → existing route inventory → bidirectional transport Evidence → objective risk-month Evidence. The depth is not equal: Japan, the four Batch 03 countries and the five Batch 04 countries support materially richer route composition, while Iceland, Thailand, Switzerland, New Zealand and Australia remain two-city pilots.

All SeasonEvidence records keep `suitabilityStatus=unknown`. They record objective risk only and do not claim a best month or recommended season. Transport duration, transfers and frequency remain `null`/`unknown` whenever the official source does not state a stable reusable fact.
