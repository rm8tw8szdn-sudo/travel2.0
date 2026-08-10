# Route V2 Knowledge Expansion Multi-Country Batch 03 Audit

## Boundary

Batch 03 is additive Knowledge Layer work only. The frozen route engine, RouteIntent, Search, Planner, Candidate, Publication, Runtime and Production Readiness code is not changed by this batch. Accepted routes, formal Cache and Runtime State remain read-only.

The worktree was already mixed before Batch 03. Existing changes fall into these retained groups:

- Production Readiness / PR #19: route engine and verifier changes already present before Batch 03.
- Knowledge Expansion Batch 01: Iceland plus two-city pilots for Thailand, Switzerland, New Zealand and Australia, Evidence and reports.
- Knowledge Expansion Batch 02: Japan depth, Evidence, verifiers and dashboard.
- Prior UI/long-trip work: `routes.js`, `route-detail.js`, image mappings, capacity/UI verifiers and their plan.

Batch 03 owns only:

- `data/knowledge/seeds/knowledge-expansion-batch03-multi-country.json`
- raw Wikidata snapshots and batch05–08 City/POI/selection/provenance/conflict/review files
- `scripts/import-knowledge-expansion-batch03-country.mjs`
- `scripts/import-knowledge-expansion-batch03-evidence.mjs`
- `scripts/verify-knowledge-expansion-batch03-country.mjs`
- additive registry entries in `knowledge-entity-layer-published-assets.mjs`
- the official-source allowlist additions needed by the Evidence records
- cumulative verifier count updates required by the expanded registry
- the Batch 03 plan, dashboard and this audit
- Batch 03 records appended to the existing Evidence seed and manifest

No file is staged. No existing mixed-worktree change was restored, overwritten, stashed or deleted.

## Entity model boundary

The published schema supports Country, City and POI. It has no regional/island/county destination type. The following candidates are therefore isolated for review rather than misrepresented as Cities:

- Italy: Lake Como, Cinque Terre, Amalfi Coast, Dolomites
- France: Mont-Saint-Michel, Loire Valley, Provence
- Spain: Mallorca, Tenerife, Ibiza
- South Korea: Jeju Island, Pyeongchang County

Jeju City is published as a City and remains distinct from Jeju Island/province.

## Per-country outcome

| Sub-batch | Published Cities | Published POIs | New Cities | New POIs | New directed transport | New risk months | Conflicts | Orphans | Isolated candidates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 03A Italy | 13 | 90 | 11 | 84 | 18 | 4 | 0 | 0 | 4 |
| 03B France | 13 | 82 | 11 | 76 | 18 | 4 | 0 | 0 | 3 |
| 03C Spain | 13 | 98 | 11 | 92 | 16 | 4 | 0 | 0 | 3 |
| 03D South Korea | 13 | 70 | 11 | 64 | 20 | 4 | 0 | 0 | 2 |

The South Korea cumulative total is 22 directed records because the existing Seoul ↔ Busan pair is retained by stable ID; Batch 03 adds 20 rather than duplicating it.

## Data integrity and source policy

- Every published City and POI has a stable Wikidata QID and coordinates.
- Published duplicate entity IDs, duplicate City QIDs, duplicate POI QIDs, orphans and conflicting parents are zero.
- Failed or ambiguous title resolution is never replaced with fuzzy-search guesses.
- Transport records are directed; reverse directions use separate stable IDs.
- Sources are official operators or government/official tourism bodies. Search-result text, blogs and model output are not evidence.
- Duration, transfer and frequency fields remain unknown when the source does not explicitly support a stable reusable value.
- Month records contain objective heat, heavy-rain, snow or disruption facts only and keep suitability unknown.

## Validation and browser acceptance

### Automated matrix

The following passed:

- Batch 01 and Batch 02 preservation verifiers
- Batch 03A Italy, 03B France, 03C Spain and 03D South Korea country verifiers
- cumulative Entity Layer, Runtime API and Planner Entity Layer integration
- Evidence promotion and Candidate Evidence Validation
- Planner pipeline and Search V1
- City Detail UI, including Venice, Nice and Seville samples
- six-card infinite feed and image fallback pilot
- Cache Baseline V2, including three identical runs and destructive tests on a temporary copy
- `node --check` for all 31 changed/untracked JavaScript modules in the mixed worktree
- `git diff --check` and `git diff --cached --check`

### Isolated browser environment

The local server used a temporary root under `%TEMP%`. Accepted and immutable Evidence inputs were copied into that directory; Search Cache, analytics, Candidate, Trace, EvidenceBundle, local Evidence, Ready Pool, metrics and image cache writes all stayed there. Online Evidence providers and external image fetching remained disabled. The service was stopped after testing.

Twenty-five specified searches were executed through the visible page:

- Italy 7/14/21/30 days produced 4/6/8/8 visible destination entities. Titles progressed from classic first trip to extended/deep exploration; all generated results stayed in Italy and remained `needs-review`.
- France 7/14/21 days and Paris–Lyon–Nice 10 days returned France-only results; generated depth increased from 4 to 6 to 8 destinations.
- Spain 7/14/21 days and Madrid–Seville–Granada 10 days returned Spain-only generated results; generated depth increased from 4 to 6 to 8 destinations.
- South Korea 7/14/21 days and Seoul–Gyeongju–Busan 10 days stayed in South Korea; generated depth reached 6 and 8 destinations at 14/21 days.
- Rome–Florence–Venice, Paris–Lyon–Nice, Madrid–Seville–Granada and Seoul–Gyeongju–Busan preserved their explicit city sequence.
- Amalfi Coast, Dolomites, Provence and Alsace stopped with an explicit unrecognized-destination message because those regional entities are not published under the City-only schema.
- Jeju island vacation stopped with an explicit unsupported-theme message rather than fabricating independent theme evidence.
- Seoul–Busan 7 days returned a constraint-conflict message; no unrelated route was shown.

### Browser defects recorded, not repaired here

Two region/theme searches violate the requested country boundary in the frozen Search/fallback layer:

- `Andalusia road trip` returned South Africa, New Zealand and United States road-trip routes.
- `Mallorca island vacation` returned United States, Portugal and Philippines island routes.

These are not Knowledge entity integrity failures. The current schema intentionally excludes the regional/island entities, while the frozen engine falls back to theme-only Accepted routes. They remain blocking product-display defects for those queries and require a separate Route Engine decision after the current freeze.

The pre-existing generated-detail race also reproduced: Seoul–Gyeongju–Busan content rendered correctly, then the same page added `404 · 未找到路线` and `路线详情加载失败` after about 2.5 seconds. It is recorded as a blocking UI defect and is not changed in this Knowledge-only batch.

Console error and warning counts were both zero. Observed images were local, country-matched files or the unified travel placeholder; no external runtime Evidence/image resource was observed.

### Formal asset result

- Accepted SHA-256: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`
- Immutable Cache aggregate: `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`
- Immutable `route-evidence.json` SHA-256: `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`
- Formal Cache: 331 files, 1,274,833,546 bytes
- Runtime State: 329 files, 1,224,923,102 bytes
- Formal Knowledge: 51 files and no Git changes in the formal worktree

No Batch 03 change is staged or committed.
