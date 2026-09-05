# Route V2 Knowledge Expansion Batch 09 Dashboard

Generated: 2026-09-01T12:00:00.000Z

## Before / after / delta

| Metric | Before Batch 09 | After Batch 09 | Delta |
| --- | ---: | ---: | ---: |
| Country Entities | 99 | 119 | +20 |
| Plannable Countries | 98 | 118 | +20 |
| Cities | 718 | 833 | +115 |
| POIs | 4,766 | 3,963 | +-803 net |
| Entities | 5,583 | 4,915 | +-668 net |
| Directed Transport | 886 | 1036 | +150 |
| Month Risk | 394 | 474 | +80 |
| Image needsBackfill | 188 | 443 | +255 |

China remains Catalog-only. Catalog-only Country codes: CN. Country Entity count, Plannable Country count, and Route Knowledge Covered count are reported separately.

## Batch 09 country coverage

| Country | Tier | Previous status | Batch target | City | POI | Transport | Month Risk | Route tests | Dedicated City | Dedicated Core POI | needsBackfill |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Algeria (DZ) | T1 | not-cataloged | evidence-backed-plannable | 7 | 36 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Ghana (GH) | T1 | not-cataloged | evidence-backed-plannable | 7 | 29 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Senegal (SN) | T1 | not-cataloged | evidence-backed-plannable | 7 | 17 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Ethiopia (ET) | T1 | not-cataloged | evidence-backed-plannable | 7 | 23 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Namibia (NA) | T1 | not-cataloged | evidence-backed-plannable | 7 | 17 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Botswana (BW) | T1 | not-cataloged | evidence-backed-plannable | 5 | 9 | 8 | 4 | 7d/14d/21d | 0 | 0 | 8 |
| Madagascar (MG) | T1 | not-cataloged | evidence-backed-plannable | 4 | 10 | 6 | 4 | 7d/14d/21d | 0 | 0 | 7 |
| Mauritius (MU) | T2 | not-cataloged | evidence-backed-plannable | 6 | 27 | 8 | 4 | 7d/14d | 0 | 0 | 9 |
| Kazakhstan (KZ) | T1 | not-cataloged | evidence-backed-plannable | 7 | 22 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Uzbekistan (UZ) | T1 | not-cataloged | evidence-backed-plannable | 7 | 30 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Kyrgyzstan (KG) | T1 | not-cataloged | evidence-backed-plannable | 4 | 9 | 6 | 4 | 7d/14d/21d | 0 | 0 | 7 |
| Bangladesh (BD) | T1 | not-cataloged | evidence-backed-plannable | 7 | 34 | 8 | 4 | 7d/14d/21d | 0 | 0 | 10 |
| Bhutan (BT) | T2 | not-cataloged | evidence-backed-plannable | 4 | 13 | 6 | 4 | 7d/14d | 0 | 0 | 7 |
| Pakistan (PK) | T1 | not-cataloged | evidence-backed-plannable | 8 | 36 | 8 | 4 | 7d/14d/21d | 0 | 0 | 11 |
| Laos (LA) | T1 | not-cataloged | evidence-backed-plannable | 5 | 14 | 8 | 4 | 7d/14d/21d | 0 | 0 | 8 |
| Brunei (BN) | T2 | not-cataloged | evidence-backed-plannable | 4 | 19 | 6 | 4 | 7d/14d | 0 | 0 | 7 |
| Honduras (HN) | T1 | not-cataloged | evidence-backed-plannable | 4 | 14 | 6 | 4 | 7d/14d/21d | 0 | 0 | 7 |
| El Salvador (SV) | T1 | not-cataloged | evidence-backed-plannable | 5 | 20 | 8 | 4 | 7d/14d/21d | 0 | 0 | 8 |
| Samoa (WS) | T2 | not-cataloged | evidence-backed-plannable | 5 | 9 | 8 | 4 | 7d/14d | 0 | 0 | 8 |
| Vanuatu (VU) | T2 | not-cataloged | evidence-backed-plannable | 5 | 12 | 8 | 4 | 7d/14d | 0 | 0 | 8 |

## Image coverage

| Scope | Country Cover | Dedicated City | City Placeholder | Dedicated Core POI | POI Placeholder | needsBackfill | invalidMapping |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Historical Plannable Countries | 98/98 | 600/718 (83.6%) | 118 | 132/282 (46.8%) | 150 | 268 | 0 |
| Batch 09 Countries | 20/20 | 0/115 (0%) | 115 | 0/60 (0%) | 60 | 175 | 0 |
| Overall | 118/118 | 600/833 (72%) | 233 | 132/342 (38.6%) | 210 | 443 | 0 |

## Positive POI admission repair

- Original Batch 09 selected POI additions: 613
- Final Batch 09 published POI additions: 400
- Batch 09 POIs quarantined by the repair: 213
- Historical published POIs quarantined by the same rule: 1203
- Full scan: A 3963 / B 1151 / C 38 / D 227
- Reconciliation: 4766 + 613 - 1416 = 3963
