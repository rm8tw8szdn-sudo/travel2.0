# Route V2 Knowledge Entity Layer P1B Batch01 City Implementation Report

## 1. Executive summary

P1B Batch01 City publishes 10 canonical City entities under 5 existing P1A Countries: Colombia, Czechia, Finland, the Netherlands, and Poland. Each Country has exactly 2 Batch01 Cities. The checkpoint is an offline City-only expansion built from one fixed Wikidata API + SPARQL raw snapshot.

The published Batch01 result has 0 conflicts, 0 blocking conflicts, 43 non-blocking manual reviews, and 10/10 field-level provenance coverage with inline/sidecar equality. Cumulative Entity Layer scope is 50 Countries, 15 Cities, and 15 Pilot POIs, for 80 entities.

This report intentionally records no commit SHA because the checkpoint has not been committed.

## 2. Batch01 scope

| ISO | Country | City | Chinese name | QID | City entityId | Parent Country entityId |
| --- | --- | --- | --- | --- | --- | --- |
| CO | Colombia | Bogotá | 波哥大 | `Q2841` | `city-9250707178588c35` | `country-1f698d9652d363bd` |
| CO | Colombia | Medellín | 麦德林 | `Q48278` | `city-5766a6c5c46b184b` | `country-1f698d9652d363bd` |
| CZ | Czechia | Prague | 布拉格 | `Q1085` | `city-2c83bc499c1c4889` | `country-a43bbd8228ebbdea` |
| CZ | Czechia | Brno | 布尔诺 | `Q14960` | `city-498e80bf490697fd` | `country-a43bbd8228ebbdea` |
| FI | Finland | Helsinki | 赫尔辛基 | `Q1757` | `city-f8fd54cc84a22fd5` | `country-4521f3e0908e41e0` |
| FI | Finland | Turku | 图尔库 | `Q38511` | `city-51d172b9e24e3620` | `country-4521f3e0908e41e0` |
| NL | Netherlands | Amsterdam | 阿姆斯特丹 | `Q727` | `city-66a343aed16e37a4` | `country-febe99ab26ea41f0` |
| NL | Netherlands | Rotterdam | 鹿特丹 | `Q34370` | `city-bf507de627cbfc1e` | `country-febe99ab26ea41f0` |
| PL | Poland | Warsaw | 华沙 | `Q270` | `city-83414d1ae1a11ef2` | `country-5a2eabd86d1a1bb1` |
| PL | Poland | Kraków | 克拉科夫 | `Q31487` | `city-7c5e7e54c0cc73d4` | `country-5a2eabd86d1a1bb1` |

The Batch01 distribution is CO 2, CZ 2, FI 2, NL 2, and PL 2. The cumulative City distribution is JP 2, TR 2, SG 1, CO 2, CZ 2, FI 2, NL 2, and PL 2.

## 3. Source and identity anchors

- Raw source: fixed `wikidata-api+sparql` snapshot retrieved at `2026-07-15T10:01:50.248Z`.
- Raw snapshot SHA-256: `ccd066a2934d7a974870e1d0efbf3702c70f398ea0a72c86d535c553a84b11d7`.
- Refresh evidence: 2 HTTP requests, 0 retries, 10 API entity records, 69 SPARQL bindings, and 10 semantic records.
- The approved source scope contains exactly the 10 QIDs in the table, with no missing or extra QID.
- Every record must match the approved QID across the API response-map key, API entity ID, SPARQL entity ID, and the single SPARQL entity URI.
- City identity is derived from entity type plus the approved Wikidata QID. Parent Country identifiers do not participate in City identity.
- Every City points to its approved existing Country entity, and all City entity IDs are unique across the cumulative Country + City + POI repository.

## 4. Exact-QID semantic and projection policy

City eligibility is decided from exact P31 QIDs, not labels, descriptions, or keyword matching.

- At least one explicitly compatible City P31 QID is required.
- A metropolitan-area-only QID is blocking.
- A region-only QID is blocking.
- A City QID that also carries administrative or region semantics remains usable only when explicit City identity is present; the overlap becomes non-blocking review evidence.
- Unknown P31 QIDs never create City identity. Unknown plus explicit City identity is accepted with review; unknown-only evidence is blocking.
- API claims and SPARQL truthy claims are preserved as separate P17, P31, and P131 projections. Their deterministic union is used for gate evaluation.
- A projection difference is non-blocking when the approved QID, explicit City identity, and Country parent remain valid. The exact projections and their differences are retained in the review queue.
- P17 must retain the approved Country QID. A conflicting known Country in P131 is blocking.
- Human-readable labels are retained for audit output but do not control classification.

## 5. Published assets

The offline importer reads the fixed raw snapshot and publishes four deterministic assets:

- `data/knowledge/batches/cities.p1b-batch01.json`
- `data/knowledge/batches/provenance.cities.p1b-batch01.json`
- `data/knowledge/batches/conflicts.p1b-batch01.json`
- `data/knowledge/batches/review-queue.p1b-batch01.json`

The importer reports `calledWikidata: false`. A verifier rerun reconstructs these assets byte-for-byte without changing the raw snapshot. Provenance covers all 10 Cities, and every inline provenance object is deeply equal to its sidecar record.

## 6. Reviews and conflicts

The final Batch01 City publication has 0 conflicts and 0 blocking conflicts. It has 43 non-blocking reviews derived directly from raw semantic-gate evidence:

| Review type | Count |
| --- | ---: |
| `multiple-city-type-candidates` | 10 |
| `city-administrative-entity-overlap` | 9 |
| `city-administrative-region-overlap` | 1 |
| `p17-source-projection-difference` | 8 |
| `p31-source-projection-difference` | 2 |
| `p131-source-projection-difference` | 7 |
| `unclassified-city-type-qids` | 6 |

Each review has a deterministic unique ID, a unique City/type pair, the approved City QID, P31 and P131 evidence, gate classification, relevant source projection, and retained unclassified QIDs. Projection differences remain manual-review metadata rather than blocking conflicts.

Prague and Brno pass the exact-QID City gate despite administrative semantics; Prague contributes the single City + region overlap review. Warsaw and Kraków pass with explicit City identity and retain their complete P31/P131 evidence. Netherlands Country-level review information is not propagated into Amsterdam or Rotterdam City provenance or reviews.

## 7. Cumulative Entity Layer result

| Entity type | Count |
| --- | ---: |
| Countries | 50 |
| Cities | 15 |
| Pilot POIs | 15 |
| Total entities | 80 |

Repository validation confirms unique global entity IDs, 15 unique City QIDs, valid City-to-Country and Pilot POI-to-City parents, stable ordering, and defensive copies. The only allowed Country/City QID overlap remains the existing Singapore Q334 Pilot case, separated by typed entity IDs.

All P1B Pilot raw snapshots, published assets, cumulative conflicts/reviews, and the Pilot implementation report remain immutable in this checkpoint. The 15 existing POIs retain their original 5 Pilot City parents.

## 8. Explicitly not implemented

- P1B Batch01 POI raw data, schemas, importers, assets, tests, or repository changes
- A POI review classifier for Batch01
- Metropolitan Area entities
- Region entities
- Natural Area entities
- Destination entities
- Planner integration or route recommendation consumption
- Runtime filesystem scanning
- Runtime online refresh or network access
- Cache creation or modification
- P1A Country data changes

## 9. Validation evidence

Focused validation confirms:

- Raw snapshot SHA, fixed retrieval metadata, exact 10-QID scope, and complete API/SPARQL evidence
- 10 accepted City records, 5 Country parents with 2 Cities each, and no orphan
- Deterministic normalization, pure asset building, stable review IDs, and byte-identical offline importer rerun
- Exact-QID blocking behavior for wrong QID, wrong P17/P131 Country, metropolitan-area-only, region-only, and unknown-only fixtures
- Non-blocking behavior for valid source-projection differences, P31 supersets, City + region overlap, and unknown + explicit City fixtures
- Label-independent classification, Netherlands review isolation, Pilot overlap protection, and repository defensive copies
- 10/10 provenance coverage with inline/sidecar equality
- 0 conflicts and 43 traceable non-blocking reviews
- Cumulative 50 Country / 15 City / 15 POI / 80 entity repository validation
- P1B Pilot assets, P1A assets, Planner files, accepted/bootstrap state, and route-v2 golden outputs unchanged
- 0 network calls after the completed raw refresh

The full required regression suite passed with exit code 0 for every command before this uncommitted checkpoint was handed off for review.
