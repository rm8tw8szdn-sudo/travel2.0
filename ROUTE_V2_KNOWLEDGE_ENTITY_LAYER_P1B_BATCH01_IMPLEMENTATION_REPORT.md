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

## 10. P1B Batch01 POI evidence and selection checkpoint

The POI implementation extends this City checkpoint without rewriting sections 1–9. Candidate evidence was acquired in four fixed historical rounds and is retained separately from canonical publication:

| Round | Candidate records | Frozen SHA-256 |
| --- | ---: | --- |
| Base | 40 | `fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d` |
| Supplement01 | 44 | `6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd` |
| Supplement02 | 12 | `57cb63ea4678380ef70ab522057207a9582bce28a80de8327d79419683c3480e` |
| Supplement03 | 9 | `ad3915efdcc09bcd09f245ee9200b02eca6d65d532b7f85a493b1b6d7049e9af` |

The four-round merged pool contains 85 unique candidate records and 44 usable candidates. Supplement acquisition is closed; Supplement04 was not created.

The final selection uses policy `p1b-batch01-poi-selection-v1` and rule `three-primary-backup-optional`. It freezes exactly three primary candidates per City, 30 total, plus eight optional operational backups. Brno and Prague legitimately have no backup. Backup capacity is not a publish gate, does not enter canonical POI assets, receives no formal provenance, and does not count toward cumulative POI totals.

Selection SHA-256: `40d7e91bddf065664a092153183c6a0a7cc9060397da3b40d0aa06af0ed3f118`.

## 11. Offline formal raw and canonical publication

The offline importer reconstructs a formal 30-record raw from the frozen selection plus the four source raws. It makes no HTTP request and has no refresh mode. Every record retains its candidate key, source round, selected QID, API entity, separate SPARQL truthy projections, Country evidence, approved City evidence, coordinates, complete P31 evidence, parent level, identity risk, selection rationale, raw path/index, source retrieval time, and selection policy.

Formal raw distribution is Base 15, Supplement01 9, Supplement02 3, and Supplement03 3. Parent evidence comprises 22 direct, four bounded location-path, and four structured municipality-to-City records. The raw contains no backup record.

Published City-to-POI scope:

| Country | City | Canonical POIs |
| --- | --- | --- |
| Colombia | Bogotá | Bogotá Primatial Cathedral; Botero Museum; National Museum of Colombia |
| Colombia | Medellín | Medellín Museum of Modern Art; Metropolitan Cathedral of Medellín; Museum of Antioquia |
| Finland | Helsinki | Finnish National Theatre; Helsinki Central Library Oodi; National Museum of Finland |
| Finland | Turku | Sibelius Museum; Turku Castle; Turku Cathedral |
| Poland | Kraków | National Museum in Kraków; St. Mary’s Basilica; Wawel Royal Castle |
| Poland | Warsaw | Palace of Culture and Science; Royal Castle in Warsaw; Warsaw Uprising Museum |
| Czechia | Brno | Cathedral of St. Peter and Paul; Mahen Theatre; Špilberk Castle |
| Czechia | Prague | Church of Our Lady before Týn; Old Town Hall with Astronomical Clock; Žižkov Television Tower |
| Netherlands | Amsterdam | Anne Frank House; Rijksmuseum; Van Gogh Museum |
| Netherlands | Rotterdam | Erasmus Bridge; Euromast; Maritime Museum Rotterdam |

All 30 entities pass the existing POI schema. Entity IDs use the existing typed entity + QID algorithm; entity IDs and QIDs are 30/30 unique. Every POI has one approved Batch01 City parent, valid coordinates, non-empty English and Chinese names, canonical aliases, and a source retrieval time inherited from its evidence round. Four entities whose frozen API evidence lacks a Chinese label use an explicit project-schema Chinese name with project-schema provenance; the original API evidence remains unchanged in the formal raw.

## 12. Review classifier policy

The formal pure classifier uses policy `p1b-batch01-poi-review-v1`. It has no filesystem, network, clock, or cache dependency. The rule order is:

1. exact blocking type QID;
2. illegal identity, parent, overlap, or backup publication evidence;
3. P31 projection difference;
4. exact complete informational key;
5. exact complete manual-review key;
6. unknown or unmatched complete key defaults to manual review.

P31 QIDs are deduplicated and sorted before the complete key is formed. No partial match, ignored extra QID, label substring, or search-rank decision is allowed.

Actual 30-primary classifier result:

| Disposition | Count |
| --- | ---: |
| informational | 18 |
| manual-review | 12 |
| blocking | 0 |

Classifier coverage is 30/30. None of the eight backups is classified for publication.

The existing normalizer remains unchanged. For Batch01 only, 23 generic `multiple-wikidata-poi-types` reviews are filtered after normalization and replaced by the exact numeric policy outcome. No other normalizer or deduper review was produced or discarded.

## 13. Reviews, conflicts, and provenance

The original 43 City review objects and review IDs are preserved byte-for-byte at object level. The POI classifier contributes 12 deterministic `poi-p31-policy-manual-review` records. The cumulative review total is therefore derived as 43 City + 12 POI + 0 additional POI = 55; the verifier does not hardcode 55 as an independent invariant.

Every POI manual review retains its complete P31 key, classifier rule, rationale, candidate key, source round, raw path/index, and selection policy. Informational classifications and backups do not enter the review queue.

Conflicts are 0 and blocking conflicts are 0. Any future classifier blocking result prevents publication before any asset write.

Provenance coverage is 30/30 with 30/30 inline-to-sidecar equality. The sidecar adds per-entity traceability for source round, candidate key, selected QID, selection policy, classifier policy, complete P31 key, and classifier disposition. There is no orphan provenance and no backup provenance.

## 14. Determinism and output hashes

The classifier, per-record normalizer adapter, formal raw builder, canonical asset builder, review IDs, ordering, and serialization are deterministic. An actual importer rerun produced byte-identical raw, canonical, provenance, conflicts, and review assets.

| Output | SHA-256 |
| --- | --- |
| `data/knowledge/raw/pois-p1b-batch01.wikidata.json` | `b3af659dff4ebc788dcbbdfd472cee057ce193993ba39eceaef9b37b85c87734` |
| `data/knowledge/batches/pois.p1b-batch01.json` | `19bdac49327592b7fc90665e7825806347a10a7f2da4bbbac95ecc1ac7fe1348` |
| `data/knowledge/batches/provenance.pois.p1b-batch01.json` | `2671c3095aa1e0ad0f84b368081531252c7ec7401183352e25a6a0185a0a841c` |
| `data/knowledge/batches/conflicts.p1b-batch01.json` | `b062e2eb3a71606ca71bfec062f0dc876a4926887c8c9be905b7a22a7f058455` |
| `data/knowledge/batches/review-queue.p1b-batch01.json` | `8a50d249b5db52471bf1bc452b4358e2e1ea132142da6ea27c995a3baa88df37` |

## 15. Cumulative Entity Layer result after POI Batch01

| Entity type | Count |
| --- | ---: |
| Countries | 50 |
| Cities | 15 |
| Pilot POIs | 15 |
| Batch01 POIs | 30 |
| POIs total | 45 |
| Total entities | 110 |

The existing repository is used through explicit in-memory injection and was not modified. It returns 15 Cities and 45 POIs with stable ordering, defensive copies, and valid parents. Orphan Cities and POIs are both zero. Entity IDs are globally unique; all 45 POI QIDs are unique. Singapore Q334 remains the only allowed Country/City QID overlap, while Country/POI and City/POI overlap counts are zero. Pilot POI parents remain unchanged.

## 16. Boundaries and focused validation

The POI verifier passes all 16 required synthetic fixture groups: exact informational, informational plus extra QID, exact manual, unknown QID, blocking priority, City/region/metropolitan/natural-area blocking, Pilot duplicate, Batch duplicate, Country/City overlap, wrong parent, orphan parent, backup publication, classifier determinism, review-ID determinism, Pilot review immutability, and defensive copies.

Focused importer, verifier, audit, and cumulative Entity Layer checks pass. Source candidate raws, selection, Country assets, City assets, Pilot assets/reviews/report, POI schema/normalizer/deduper, repository, index, route goldens, and cache state remain protected.

Planner is not connected. Region, Destination, Natural Area, and Metropolitan Area entities remain unsupported. No commit SHA is recorded because this complete POI layer remains uncommitted.

## 17. Complete POI Layer QA

The complete required QA matrix passed with exit code 0 for every listed command. This includes the Batch01 POI importer, POI verifier, POI audit, cumulative Entity Layer verifier, all three Batch01 City compatibility checks, City and POI Pilot verification/audit, Country Batch03 and P1A Pilot/Batch01/Batch02 verification, and the full route-v2 regression chain from repository cleanup through route content quality. `git diff --check` also passed.

The legacy Batch01 City audit defines its pre-POI checkpoint by requiring the four final POI publication artifacts to be absent. For that compatibility-only run, those four files were temporarily held under verified same-repository paths, the exact unmodified City commands passed, and the files were restored before the POI importer rebuilt and reverified the final state. No compatibility hold file remains.

Final protected-state checks confirm no network or refresh action, no cache mutation, no source-candidate or selection mutation, no Country/City/Pilot/Planner/schema/normalizer/deduper/repository/index/golden change, and no Supplement04, P1A Batch04, Region, Destination, Natural Area, or Planner implementation.
