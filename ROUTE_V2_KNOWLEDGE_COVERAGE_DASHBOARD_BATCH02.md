# Route V2 Knowledge Coverage Dashboard — Batch 02

## Scope and interpretation

Batch 02 deepens Japan only. It does not change RouteIntent, Planner, Candidate, Runtime, Publication, Search, Accepted, Cache or Production Readiness. `Coverage %` is a planning indicator for knowledge investment, not a publication/readiness score.

The score gives equal weight to six observable layers:

1. Country entity present: `0` or `1`.
2. City depth: `min(city count / 10, 1)`.
3. POI depth: `min(POI count / 50, 1)`.
4. Directed transport connectivity: `min(directed evidence / (2 × max(city count - 1, 1)), 1)`.
5. Risk-month depth: `min(month evidence / (2 × city count), 1)`.
6. Existing route inventory: `min(route count / 20, 1)`.

The six components are averaged and rounded to the nearest percentage point. Routes are a read-only count from the unchanged Accepted repository; cross-country routes count for every country they reference. Evidence counts include records linked to the listed typed City entities.

## Batch 02 totals

| Layer | Before Batch 02 | After Batch 02 | Added |
| --- | ---: | ---: | ---: |
| Country | 51 | 51 | 0 |
| City | 35 | 55 | 20 |
| POI | 105 | 252 | 147 |
| Total entities | 191 | 358 | 167 |
| Directed RouteLegEvidence | 20 | 58 | 38 |
| Risk-only SeasonEvidence | 26 | 40 | 14 |

Japan now has 22 destination entities and 153 verified POIs. Tokyo and Kyoto each expose 19 POIs, Osaka 15, the ordinary tourism cities 4–8, and the smallest stops 3. Twenty-five unresolved QID candidates and three coordinate-incomplete candidates remain excluded in the review queue; none was guessed into the published layer.

## Priority-country dashboard

| Country | Country | City count | POI count | Directed transport Evidence | Risk-month Evidence | Existing routes | Coverage |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Japan (JP) | present | 22 | 153 | 38 | 14 | 97 | **87%** |
| Italy (IT) | present | 2 | 6 | 0 | 0 | 31 | **39%** |
| France (FR) | present | 2 | 6 | 0 | 0 | 55 | **39%** |
| South Korea (KR) | present | 2 | 6 | 2 | 0 | 23 | **55%** |
| Spain (ES) | present | 2 | 6 | 0 | 0 | 31 | **39%** |

## Japan depth by destination

| Destination | POIs | Depth band |
| --- | ---: | --- |
| Tokyo | 19 | world-city depth |
| Kyoto | 19 | world-city depth |
| Osaka | 15 | world-city depth |
| Nagoya | 8 | major-city depth |
| Nara | 8 | major tourism depth |
| Fukuoka | 7 | major-city depth |
| Hiroshima | 7 | major tourism depth |
| Sapporo | 7 | major-city depth |
| Kamakura | 6 | tourism-city depth |
| Kobe | 6 | tourism-city depth |
| Miyajima | 6 | tourism-city depth |
| Hakodate | 5 | tourism-city depth |
| Hakone | 5 | tourism-city depth |
| Kanazawa | 5 | tourism-city depth |
| Kumamoto | 5 | tourism-city depth |
| Naha | 5 | tourism-city depth |
| Fujikawaguchiko (Kawaguchiko) | 4 | regional depth |
| Takayama | 4 | regional depth |
| Beppu | 3 | small-destination depth |
| Okinawa City | 3 | small-destination depth |
| Otaru | 3 | small-destination depth |
| Yufuin (Yufu) | 3 | small-destination depth |

## Evidence boundary

The 38 new directed records form 19 bidirectional city pairs and touch all 22 Japan destinations. They preserve directionality and confirm only connections supported by official railway or tourism sources. Duration, transfer count and frequency remain unknown when the source does not provide a stable reusable fact.

The 14 new month records cover nine cities. They record only measurable high-temperature, heavy-rain, snow or typhoon disruption risk from official sources. Every record keeps `suitabilityStatus=unknown`; the batch makes no “best month” or “recommended season” claim.

## Complete local knowledge chains

Within the current published Knowledge Layer, these countries have at least one Country entity, multiple City entities, POIs, existing route inventory, reusable transport Evidence and risk-month Evidence:

- Australia
- Iceland
- Japan
- New Zealand
- Switzerland
- Thailand

South Korea has Country → City → POI → Route → bidirectional transport Evidence, but still lacks risk-month Evidence. Italy, France and Spain have Country → City → POI → Route but no reusable transport or risk-month Evidence in the current local seed.

## Batch 03 priority signal

The dashboard indicates a clear next-depth order among the requested comparison countries:

1. Italy and France: high route inventory, but only two Cities, six POIs and no reusable transport/month Evidence.
2. Spain: the same structural gap with a smaller route inventory.
3. South Korea: transport is present; City/POI depth and risk-month Evidence remain the primary gaps.

This is a planning recommendation only. Batch 03 is not started by this report.
