# Route V2 Knowledge Expansion Batch 02 Audit

## Result

Batch 02 deepens Japan without changing RouteIntent, Planner, Candidate, Runtime, Publication, Search, Accepted, Cache or Production Readiness. The published Entity Layer now contains 51 Countries, 55 Cities, 252 POIs and 358 entities. Japan accounts for 22 destination entities and 153 POIs.

The batch remains uncommitted and unstaged for review.

## Published Japan depth

| Destination | POIs |
| --- | ---: |
| Tokyo | 19 |
| Kyoto | 19 |
| Osaka | 15 |
| Nagoya | 8 |
| Nara | 8 |
| Fukuoka | 7 |
| Hiroshima | 7 |
| Sapporo | 7 |
| Kamakura | 6 |
| Kobe | 6 |
| Miyajima | 6 |
| Hakodate | 5 |
| Hakone | 5 |
| Kanazawa | 5 |
| Kumamoto | 5 |
| Naha | 5 |
| Fujikawaguchiko (Kawaguchiko) | 4 |
| Takayama | 4 |
| Beppu | 3 |
| Okinawa City | 3 |
| Otaru | 3 |
| Yufuin (Yufu) | 3 |

All 153 published POIs have a unique stable Wikidata QID, coordinates and a valid City parent. The importer excluded 25 unresolved QIDs and three coordinate-incomplete candidates; no fallback title or guessed entity was published. New conflicts and orphans are both zero.

## Evidence

The seed contains 38 new directed RouteLegEvidence records: 19 bidirectional pairs covering all 22 Japan destinations. A forward and reverse direction always have separate stable IDs. Duration, transfers and frequency remain `null` or `unknown` when the official source does not provide a stable reusable fact.

The seed contains 14 new risk-only month records across nine cities. They record supported heat, heavy-rain, snow or typhoon-disruption risks only. Every record keeps `season=null`, `suitabilityStatus=unknown` and `recommendedBufferMinutes=null`; the batch makes no best-month or recommended-season claim.

Transport sources are official railway/operator or national tourism sources: JR Central, JR West, JR Kyushu, JR Hokkaido and JNTO. Month-risk records use JMA climate normals and JNTO's Okinawa disruption guidance.

## Browser acceptance

The local server used an isolated temporary root for Search, Candidate, Trace, Evidence, Ready Pool and metrics. Formal Accepted, Cache and Runtime State were not writable from the browser run.

| Visible search | Result status | Cities shown | Classic places shown in detail | Assessment |
| --- | --- | ---: | ---: | --- |
| 日本7天 | needs-review | 4 | 0 | compact route |
| 日本14天 | needs-review | 6 | 5 | extended route |
| 日本21天 | needs-review | 8 | 17 | deep exploration |
| 日本30天 | needs-review | 8 | 24 | city capacity reached; POI depth continues growing |

The 14-day and 30-day results are materially different: city coverage rises from 6 to 8 and visible classic-place coverage rises from 5 to 24. The 21-day and 30-day routes share the current eight-city capacity ceiling, but 30 days still expands place coverage from 17 to 24.

Browser console warnings and errors were both zero. All observed image URLs were served from `127.0.0.1`; external runtime Evidence and image requests were zero.

One frozen-UI issue remains visible: generated route detail pages render the successful route content and then also append a `404 / route detail loading failed` panel. Batch 02 does not modify Route Engine or UI, so this was recorded rather than fixed.

## Verification

Passed:

- Knowledge Expansion Batch 02 Japan depth verifier
- cumulative Knowledge Entity Layer verifier
- Runtime API verifier
- Planner Entity Layer integration verifier
- Evidence promotion verifier
- Candidate Evidence validation verifier
- Planner pipeline
- Search V1
- City detail Entity Layer UI verifier after updating its POI-count baseline for Tokyo and Osaka
- six-card infinite feed verifier
- Evidence 3A foundation
- image asset pilot
- `node --check` for every Batch 02 JavaScript module and updated verifier
- `git diff --check`

Three broader legacy checks remain outside this Batch 02 scope:

- Evidence 3A-2 local-library expects its old pre-master-switch feature environment and fails before its first store write.
- Phase 3C-1 expects the old provider-disabled diagnostic contract.
- Phase 3C-2 expects an Accepted fixture at the release worktree's default path; this worktree intentionally has no formal `.route-v2-cache`, so its baseline count is zero instead of 851.

The directly affected Evidence promotion, Candidate Evidence validation, Planner, Search and Entity Layer paths all pass. The three unrelated failures were not modified to avoid crossing the frozen Route Engine/Runtime boundary.

## Formal asset isolation

Post-test formal state:

- Accepted: 45,562,416 bytes; SHA-256 `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`.
- Immutable Cache: one file, 4,348,028 bytes; aggregate SHA-256 `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`.
- Full Cache: 331 files, 1,274,833,546 bytes.
- Runtime State: 329 files, 1,224,923,102 bytes; audit SHA-256 `9531bbcd1b9f88d099726ce39efb8f2da202a0487cb9ae211d7efdfe237a6bd7`.
- Formal Knowledge: 51 files, unchanged.

The formal Cache Baseline V2 audit passes. No commit, staging, push, PR, tag or deployment was performed.
