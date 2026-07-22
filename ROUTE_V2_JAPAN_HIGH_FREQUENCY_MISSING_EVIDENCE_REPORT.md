# Route V2 Japan high-frequency missing evidence report

Generated: 2026-07-22

Scope: the current directed Candidate Validation results for the fixed Japanese regression inputs. Rejected duration-capacity conflicts are excluded before aggregation. Route-leg and season requirements remain separate, and reverse directions are never merged.

Resolved in this batch:

- `Q34600>Q169134|rail` (Kyoto to Nara): removed from the missing list.
- `Q169134>Q35765|rail` (Nara to Osaka): removed from the missing list.

Current top missing evidence:

| Rank | Type | Directed target | Requests | Current result |
| ---: | --- | --- | ---: | --- |
| 1 | route-leg | `anchor:JP:kanazawa>Q35765|unknown` | 3 | missing |
| 2 | route-leg | `Q34600>Q35765|unknown` | 3 | missing |
| 3 | route-leg | `Q35765>anchor:JP:matsumoto|unknown` | 3 | missing |
| 4 | season | `Q35765|2` | 3 | needs review; suitability is not proven |
| 5 | route-leg | `anchor:JP:matsumoto>anchor:JP:kanazawa|unknown` | 2 | missing |
| 6 | route-leg | `anchor:JP:matsumoto>Q34600|unknown` | 2 | missing |
| 7 | season | `anchor:JP:kanazawa|2` | 2 | needs review; suitability is not proven |
| 8 | season | `Q169134|2` | 2 | needs review; suitability is not proven |
| 9 | season | `Q34600|2` | 2 | needs review; suitability is not proven |
| 10 | route-leg | `anchor:JP:takayama>anchor:JP:matsumoto|unknown` | 1 | missing |

Notes:

- The explicit flexible input `东京京都大阪7天` now has one ready route: Tokyo to Kyoto to Nara to Osaka.
- The fixed input `东京→京都→大阪7天` remains blocked because the directed Kyoto to Osaka fact is still missing.
- February evidence remains non-publishable where it only documents risk and does not establish suitability.
