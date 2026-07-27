# Route Generation V2 Permanent RouteIntent Invariants — Validation

Date: 2026-07-27
Starting HEAD: `b498f5119224e94bad4978e270295adf87e02892`
Branch: `codex/route-v2-knowledge-entity-layer-p1b-batch02`
Result: **PASS**

## 1. Audited RouteIntent path

The complete success path was audited and protected:

```text
free-text input
→ SearchIntent / normalized RouteIntent
→ Candidate Builder / Candidate Pool / Candidate Selection
→ Planner RouteRecord
→ DecisionTrace / EvidenceBundle
→ accepted or mature lookup / legacy fallback
→ Search cache write and replay
→ Ready Pool write and read
→ final Search / Planner response
→ Discovery Feed / Detail
→ route card / route detail UI
```

The audit found and closed these mutation or bypass points:

- candidate construction could add optional cities to an explicit city set;
- Planner and fallback paths carried partially different constraint structures;
- accepted, Ready Pool, cache and final Search responses did not share one final invariant gate;
- cache replay could not prove that the cached intent matched the current request;
- rejected results could reach later fallback layers without a single shared fail-closed check;
- Feed and Detail trusted persisted records without rechecking a bound RouteIntent;
- browser history did not preserve a free-text query, so Back could show the default Feed while retaining the old search text;
- EvidenceBundle normalization dropped a fingerprint that its builder had supplied;
- a multi-country display string such as `AT/SK/HU/CZ` could be misread as one synthetic country.

## 2. Unified RouteIntent and fingerprint

`route-intent-v1` separates:

- hard constraints: required cities, order mode, exact days, months, season, country/countries, region and route capacity;
- soft preferences: style, theme, transport, pace, budget, trip intent and exclusions;
- display metadata: original query and labels;
- evidence status: not requested, invalid or needs evidence.

Normalization preserves the difference between an omitted field and an explicitly empty field. Fixed city order remains order-sensitive; unordered sets are deterministically sorted. QIDs and ISO codes are canonicalized. Titles, summaries and UI copy are never correctness inputs.

`route-intent-fingerprint-v1` uses canonical JSON plus SHA-256. It contains no timestamp, random value, port, path or host field. The fingerprint is carried through Candidate, RouteRecord, DecisionTrace, EvidenceBundle, accepted/mature conversion, fallback, cache, Ready Pool and final Search/Planner responses. Existing unbound legacy routes remain readable through an explicit compatibility path; newly bound or tampered records fail closed.

## 3. Final invariant gate

The shared final gate checks:

- exact required city set with no deletion, substitution or silent addition;
- duplicate destinations;
- fixed relative order;
- exact duration;
- duration/city capacity;
- exact single-country or multi-country constraint;
- region constraint;
- month and season preservation, including evidence-pending semantics;
- fingerprint version, equality and envelope tampering;
- rejected/conflict results relabelled as success.

It runs at Candidate materialization, Planner success, accepted repository write/read, mature and legacy fallback conversion, cache write/replay, Ready Pool write/read, Search final response, Discovery Feed and Discovery Detail. Invalid results return a structured conflict/rejection and are not cached, published or rendered.

## 4. Independent Model Oracle and shadow validation

`route-intent-model-oracle.mjs` independently derives destination, order, days, capacity, country/countries, region, month and season violations from the normalized intent and structured route. It does not import or call the production gate or fallback validator. Differential tests fail whenever the production gate and Oracle disagree.

Shadow validation compares production and Oracle results and emits structured diagnostics without changing user output. Its feature flag defaults to off; the formal production gate cannot be disabled.

## 5. Generative, corpus and mutation results

Fixed seed: `0x5eedc0de`

| Suite | Cases | Assertions | Result |
| --- | ---: | ---: | --- |
| Property-based | 1,200 | 5,071 | PASS |
| Fuzz | 900 | 2,700 | PASS |
| Metamorphic | 300 | 1,137 | PASS |
| Differential | 560 | 560 | PASS |
| Permanent corpus | 14 | 25 | PASS |

Differential sources: Candidate, accepted, mature, legacy, fallback, cache and Ready Pool.

The permanent corpus includes the four-city/one-day conflict, exact Tokyo → Kyoto → Osaka seven-day success, month plus exact-days preservation, removed/added/reordered cities, changed days, lost month/season, changed country/region, cache fingerprint mismatch, incompatible Ready entry, rejected-to-success relabelling, legacy cache, Unicode and delimiter normalization.

Mutation score: **100%**

- total mutations: 11
- killed: 11
- survived: 0

Killed mutations include removing required-city, fixed-order, exact-days, month, season, cache-fingerprint, Ready Pool, fallback, rejected-state, Feed/Detail and fingerprint-field checks.

## 6. Real browser acceptance

The real local application was started with a unique isolated Accepted/Search/Evidence/Ready/image directory and localhost-only networking. No test data was written to the real repositories.

| Viewport / path | Result |
| --- | --- |
| Desktop 1280×800 Feed | first batch 6; next batches 12 and 18; 18 unique IDs; no missing or duplicate card |
| Desktop fixed route | `东京→京都→大阪7天` returned exactly Tokyo, Kyoto, Osaka in that order and exactly 7 days |
| Desktop Detail | direct detail, refresh and Forward preserved all three cities and 7 days |
| Browser Back | restored `q=东京→京都→大阪7天`, one matching card and a completed loading state |
| 360×800 conflict | `东京→京都→大阪→奈良1天` returned zero cards and a clear constraint-conflict state |
| 390×844 month | `2月去日本2天` retained February and two days; returned review-only output |
| 390×844 season | `冬天去日本7天` retained the season and seven days; returned review-only output |
| Cache replay | repeated winter query returned the same constrained card |

Observed browser assets: 10 total, all from `127.0.0.1`; external image domains: **0**. Console errors/warnings: **0**. No internal Candidate, DecisionTrace, EvidenceBundle, review or provenance data appeared in the UI.

## 7. Performance

Environment: Windows x64, Node v24.18.0, Intel i7-13700. Every metric used a fixed warm-up before the recorded samples.

| Metric | Samples | p50 | p95 | max | Cache state |
| --- | ---: | ---: | ---: | ---: | --- |
| parse SearchIntent | 40 × 1,000 | 0.565 ms | 0.637 ms | 0.652 ms | in-process |
| normalize RouteIntent | 40 × 1,000 | 0.011 ms | 0.016 ms | 0.021 ms | in-process |
| fingerprint | 40 × 500 | 0.020 ms | 0.025 ms | 0.027 ms | in-process |
| final invariant gate | 40 × 1,000 | 0.080 ms | 0.107 ms | 0.123 ms | in-process |
| cache replay | 30 | 0.936 ms | 1.338 ms | 1.388 ms | hot local |
| Ready Pool read | 50 | 0.340 ms | 0.473 ms | 0.530 ms | hot local |
| route page | 10 | 14.942 ms | 23.783 ms | 23.783 ms | hot local HTTP |
| first Feed page | 20 | 15.222 ms | 16.770 ms | 24.219 ms | hot Accepted |
| Detail | 20 | 15.527 ms | 18.331 ms | 18.847 ms | hot Accepted |
| Planner search | 5 | 1,383.891 ms | 1,429.369 ms | 1,429.369 ms | cold by fingerprint |
| cached Search replay | 12 | 1,108.315 ms | 1,175.159 ms | 1,175.159 ms | hot Search cache |
| generative suite | 3 | 1,015.315 ms | 1,020.792 ms | 1,020.792 ms | isolated temp |

Starting-HEAD parse p95 was 0.601 ms; the final parse p95 was 0.637 ms, a 5.9% delta. The old narrow fallback validator p95 was 0.0085 ms; the full gate is intentionally more expensive because it performs complete normalization, versioned SHA-256 verification, tamper detection and every hard-constraint check. Its measured p95 is 0.107 ms per route, below the 0.25 ms target, so the larger relative delta has no material user-path impact. No unexplained performance risk remains.

## 8. Fixed assets

The comprehensive verifier compared exact relative path, byte size and SHA-256 snapshots before and after all isolated tests.

| Asset | Before | After |
| --- | --- | --- |
| Accepted repository | `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f` | identical |
| `.route-v2-cache` | 331 files; manifest `056d3af349b05cc7ae59620c23be26e11e91dd1d0c37a8bf2b153362834568cb` | identical |
| `data/knowledge` | 51 files; manifest `0fe85be00846386265718b1f3949d2e8ebcb220f124357ded9d68db5f2814d4b` | identical |

Post-browser local counts remained 331 cache files and 51 knowledge files. Accepted SHA-256 remained the value above.

## 9. Executed verification

Authoritative commands and results:

- `node --check` for all 38 changed/new JavaScript modules: PASS.
- 40 Route V2 verifiers excluding the separately executed comprehensive/performance and the staged-scope P0 check: 40/40 PASS.
- `node scripts/verify-route-v2-comprehensive-prelaunch.mjs`: PASS; dynamic port released; isolated assets unchanged.
- `node scripts/verify-route-v2-intent-performance.mjs` through comprehensive: PASS.
- `node scripts/verify-search-v1.mjs`: PASS.
- Planner pipeline, coverage, Phase 6 strategy and route coherence: PASS.
- Planner Entity Layer, runtime API, City UI and Entity Layer Batch02: PASS.
- `git diff --check`: PASS.
- `git diff --cached --check`: required again immediately before commit.
- `verify-route-v2-knowledge-repository-cleanup-p0.mjs`: required after staging because the verifier intentionally rejects an unstaged Planner diff.

The repository has no `package.json`, lock file, production build command, typecheck command or lint command. The production-equivalent local runtime is `node server.js`; it was exercised by comprehensive verification and the real browser run.

Exploratory legacy scripts outside the Route V2 gate were not used as release authorities: the old generic Feed/Detail Playwright scripts require a non-repository Playwright installation and contain a macOS Chrome absolute path, while an older weighted-ranking fixture is not strict-feed eligible. Their applicable behavior is covered by the current six-card, Feed-exhaustion, comprehensive and real-browser tests above. No product implementation was weakened to satisfy those stale fixtures.

## 10. Final decision

All known constraint-mutation paths are fail-closed, the production gate and independent Oracle agree, all core mutations are killed, the permanent corpus and real UI pass, performance is bounded, and fixed assets are unchanged.

**Final result: PASS**
