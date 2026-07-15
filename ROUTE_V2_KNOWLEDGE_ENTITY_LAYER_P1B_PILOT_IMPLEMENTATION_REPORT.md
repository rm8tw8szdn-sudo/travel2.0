# Route V2 Knowledge Entity Layer P1B Pilot Implementation Report

## 1. Executive summary

The P1B Pilot validates a three-level `Country → City → POI` Entity Layer for Japan, Türkiye, and Singapore. It uses 3 Pilot Countries from the 35-country P1A baseline, 5 Cities, and 15 POIs. The cumulative published issue set contains 0 blocking conflicts and 13 non-blocking manual reviews.

This is a Pilot, not completed global City or POI coverage. The Planner does not consume the Entity Layer, and no runtime loader or runtime online refresh path has been introduced.

## 2. Checkpoint history

| Commit | Checkpoint |
| --- | --- |
| `9185da9` | P1A Country Baseline 35/195 checkpoint |
| `f83140b` | P1B City Entity Foundation |
| `e7f51ee` | P1B POI Pilot |

Checkpoint 3 has not been committed, so this report does not assign it a commit SHA.

## 3. Architecture

```text
Country.entityId
  └─ City.parentCountryEntityId
       └─ POI.parentCityEntityId
```

- Country identity uses the existing Country identity contract; City and POI identities use entity type plus Wikidata QID.
- Parent identifiers do not participate in City or POI identity, so reparenting does not silently create a new identity.
- QID corrections require an explicit migration; parent references are not implicitly cascaded.
- No relationship publication file is required. The static in-memory repository derives the two parent edges from canonical entity records.
- KG pool, `RouteRecord`, accepted routes, coverage placeholders, and search fallback are not canonical Entity Layer sources.
- Explicit raw refresh is separated from deterministic offline publication. Checkpoint 3 performs no raw refresh.

## 4. Pilot data scope

### Pilot Countries

| ISO | entityId | QID | Parent | Coordinates |
| --- | --- | --- | --- | --- |
| JP | `country-a0509b9eab0ea9ce` | Q17 | — | 35, 136 |
| TR | `country-03919f1fd24fd3dc` | Q43 | — | 39, 36 |
| SG | `country-e0a550ef5a59c6f9` | Q334 | — | 1.3, 103.8 |

### Cities

| City | entityId | QID | Parent Country entityId | Coordinates |
| --- | --- | --- | --- | --- |
| Ankara | `city-d6f6bf7d2fca5cb4` | Q3640 | `country-03919f1fd24fd3dc` | 39.93576, 32.83869 |
| Istanbul | `city-fc91a9c6c7b389cf` | Q406 | `country-03919f1fd24fd3dc` | 41.01, 28.960277777778 |
| Kyoto | `city-8acaf08893e5abf1` | Q34600 | `country-a0509b9eab0ea9ce` | 35.01161111111111, 135.76811111111112 |
| Tokyo | `city-5a21732f861ff7f1` | Q1490 | `country-a0509b9eab0ea9ce` | 35.68944444444445, 139.69166666666666 |
| Singapore | `city-dde074f983b42cfd` | Q334 | `country-e0a550ef5a59c6f9` | 1.3, 103.8 |

### POIs

| POI | entityId | QID | Parent City entityId | Coordinates |
| --- | --- | --- | --- | --- |
| Meiji Jingū | `poi-09f2974076dbfb55` | Q287165 | `city-5a21732f861ff7f1` | 35.676111111111, 139.69916666667 |
| Sensō-ji Temple | `poi-78c9ea631fbbb381` | Q615183 | `city-5a21732f861ff7f1` | 35.714555555556, 139.79663888889 |
| Tokyo Tower | `poi-1a67173097b2931a` | Q183536 | `city-5a21732f861ff7f1` | 35.658611111111114, 139.74555555555557 |
| Fushimi Inari-taisha | `poi-5d85a755073d8224` | Q714828 | `city-8acaf08893e5abf1` | 34.967202, 135.773386 |
| Kinkaku-ji Temple | `poi-4e6edb0d3a559ad5` | Q270983 | `city-8acaf08893e5abf1` | 35.0395, 135.7285 |
| Kiyomizu-dera Temple | `poi-d35c2b4470add6c2` | Q221716 | `city-8acaf08893e5abf1` | 34.994830555556, 135.78500277778 |
| Anıtkabir | `poi-85f5ccba3f115856` | Q615404 | `city-d6f6bf7d2fca5cb4` | 39.925, 32.83694444444444 |
| Ankara Castle | `poi-88530140534e7031` | Q206225 | `city-d6f6bf7d2fca5cb4` | 39.94166667, 32.865 |
| Museum of Anatolian Civilizations | `poi-0f7dce481508edf9` | Q754322 | `city-d6f6bf7d2fca5cb4` | 39.938333, 32.861944 |
| Gardens by the Bay | `poi-893318c8ec655c93` | Q630135 | `city-dde074f983b42cfd` | 1.283319, 103.86527 |
| Merlion Park | `poi-97b3fb8961728198` | Q6819812 | `city-dde074f983b42cfd` | 1.28683, 103.855 |
| National Museum of Singapore | `poi-9147c8702fa4b568` | Q632689 | `city-dde074f983b42cfd` | 1.29672, 103.84864 |
| Hagia Sophia | `poi-9a98993feb59f773` | Q12506 | `city-fc91a9c6c7b389cf` | 41.00833333333333, 28.98 |
| Sultan Ahmed Mosque | `poi-a8c1f0a18a8713de` | Q80541 | `city-fc91a9c6c7b389cf` | 41.0053851, 28.9768247 |
| Topkapı Palace | `poi-68a616f4d254dfe4` | Q170495 | `city-fc91a9c6c7b389cf` | 41.013, 28.984 |

The verified distribution is Tokyo 3, Kyoto 3, Istanbul 3, Ankara 3, and Singapore 3.

## 5. Verified capabilities

- Stable typed identity and global `entityId` uniqueness across Country, City, and POI.
- Strict `City → Country` and `POI → City` references with orphan and wrong-parent-type detection.
- All 15 POIs derive exactly one Country through their canonical City.
- Cross-type identity separation, including distinct Singapore Country and City entity IDs despite shared Q334.
- Singapore city-state handling without repository overwrite.
- Istanbul cross-continent metadata retained as a manual review rather than adding an unstable canonical continent field.
- Deterministic City and POI normalization and pure asset builders.
- Byte-identical offline reconstruction of City, POI, provenance, cumulative conflicts, and cumulative reviews.
- Field-level provenance with inline/sidecar equality and fixed raw-snapshot `retrievedAt` values.
- Separation of blocking conflicts from usable records requiring manual review.
- Stable repository enumeration, parent filtering, `getEntity()` support for all three types, and defensive copies.
- Cumulative cross-layer QA through production assertions and isolated in-memory synthetic fixtures.
- Regression isolation for P1A assets, Planner files, accepted repository state, bootstrap, and real caches.

## 6. Reviews and conflicts

The cumulative result has 0 blocking conflicts and 13 manual reviews:

- `review-c1b15455ffb7e1bf`: Singapore Country and City intentionally share Q334. Typed entity IDs keep them distinct; this is the only allowed Country/City QID overlap in the Pilot.
- `review-0c208bcb4a53b559`: Istanbul spans Europe and Asia. P1B does not force that metadata into the canonical City schema.
- 10 `multiple-wikidata-poi-types` reviews: the raw snapshots contain multiple active P31 values. Those values remain review metadata and do not create a canonical POI category in P1B.
- `review-958d06ddaa1adf82`: Wikidata's Q80541 `zh-hans` label is inconsistent with the entity; the canonical Chinese name is selected from a correct alias in the same fixed raw record.

A manual review does not mean the record is unusable. It records a real source ambiguity or modeling boundary while preserving a stable canonical identity. A blocking conflict means publication invariants fail, such as an orphan parent, wrong parent type, duplicate identity, or prohibited QID overlap.

## 7. Explicitly not implemented

- Global City coverage
- Global POI coverage
- Region entities
- Destination entities
- Natural Area entities
- Multi-parent entities
- POIs outside a canonical City
- Cross-city POIs
- Planner integration
- Runtime filesystem loader
- Runtime online refresh
- User-facing Entity Layer search
- Route recommendation consumption

Cappadocia remains outside the Pilot because it requires Region/Destination semantics. Mount Fuji remains outside the Pilot because it is a natural object outside the current City-parent model.

## 8. Subsequent-stage options

The following is a recommended decision sequence, not an implementation decision made by Checkpoint 3:

1. Commit the P1B cumulative QA checkpoint after review.
2. Choose between resuming P1A Batch 03 and starting P1B Batch 01.
3. If P1B expansion is selected, add ordinary City/POI records before introducing Region semantics.
4. Define a review-noise policy before materially increasing entity volume.
5. Design a separate Entity Layer consumer contract before Planner integration.

## 9. Known limitations and stop conditions

- Country entity IDs depend on ISO identity plus Wikidata QID. A Country QID correction affects downstream parent references and requires explicit migration.
- City and POI entity IDs depend on entity type plus Wikidata QID.
- QID correction must never be implemented as an implicit cascade.
- Region-like objects must stop ingestion rather than being forced into City or POI schemas.
- Inline and sidecar provenance must remain deeply equal.
- Fixed raw snapshots should not be refreshed without a meaningful source-update reason.
- Review volume may rise as coverage expands; review count alone is not a reason to suppress real source evidence.
- Any orphan, prohibited cross-type QID overlap, nondeterministic rebuild, protected-asset diff, or required Planner/schema expansion is a stop condition for the current scope.

## 10. Validation evidence

Focused Checkpoint 3 validation completed without network calls, raw refresh, publication writes, cache writes, or golden updates:

| Command | Result |
| --- | --- |
| `node --check scripts/audit-knowledge-entity-layer-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-entity-layer-p1b-pilot.mjs` | PASS / exit 0 |
| `node --check scripts/verify-knowledge-entity-layer-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/verify-knowledge-entity-layer-p1b-pilot.mjs` | PASS / exit 0 |

Verified protected values:

```text
Accepted: aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f
Bootstrap: 9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef
Candidate: rc-5bd691815c0bfa25ad41
DecisionTrace: dt-3d1cfa5d81194500df25
EvidenceBundle: eb-c1d89ba2875b67289c97
```

The cumulative verifier directly validates the three-layer invariants. The following full regression was run after this report and the Checkpoint 3 scripts were present; every command completed with exit code 0:

| Command | Result |
| --- | --- |
| `node scripts/verify-knowledge-entity-layer-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-entity-layer-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/verify-knowledge-poi-baseline-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-poi-baseline-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/verify-knowledge-city-baseline-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-city-baseline-p1b-pilot.mjs` | PASS / exit 0 |
| `node scripts/verify-knowledge-country-baseline-p1a-pilot.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-country-baseline-pilot.mjs` | PASS / exit 0 |
| `node scripts/verify-knowledge-country-baseline-p1a-batch01.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-country-baseline-batch01.mjs` | PASS / exit 0 |
| `node scripts/verify-knowledge-country-baseline-p1a-batch02.mjs` | PASS / exit 0 |
| `node scripts/audit-knowledge-country-baseline-batch02.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-knowledge-repository-cleanup-p0.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase3b2-planner-evidence-sidecar.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase3b1-local-evidence-collector.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase3a-evidence-bundle.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-tooling-cleanup.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase2b2-planner-sidecar.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase2b1-candidate-builder.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase2a-candidate-pool.mjs` | PASS / exit 0 |
| `node scripts/verify-route-v2-phase1-trace.mjs` | PASS / exit 0 |
| `node scripts/verify-concept-taxonomy.mjs` | PASS / exit 0 |
| `node scripts/verify-gold-cases.mjs` | PASS / exit 0 |
| `node scripts/verify-route-content-quality.mjs` | PASS / exit 0 |
| `git diff --check` | PASS / exit 0 |

Real network calls were 0. No raw refresh, golden update, publication write, or real cache write was performed by Checkpoint 3 validation.
