# Route V2 Knowledge Entity Layer P1B Batch01 POI Candidate Gap Report

## 1. Purpose and boundaries

This report is a read-only, offline review of the first P1B Batch01 POI candidate Evidence Gate. It does not change the fixed candidate raw, approve canonical POIs, freeze the final 30 primary + 10 backup set, or define classifier policy.

The candidate raw remains evidence-gate material only. It is not canonical publish input.

## 2. First-round Evidence Gate baseline

| Field | Value |
|---|---|
| Raw | `data/knowledge/raw/pois-p1b-batch01-candidates.wikidata.json` |
| retrievedAt | `2026-07-16T06:24:39.319Z` |
| SHA256 | `fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d` |
| Candidates | 40 |
| Selected QIDs | 26 |
| Unresolved identities | 14 |
| Usable (`pass` + `conditional-manual`) | 18 |
| Blocking | 22 |

### Status distribution

| Status | Count |
|---|---:|
| pass | 9 |
| conditional-manual | 9 |
| identity-ambiguous | 10 |
| parent-failed | 8 |
| country-failed | 1 |
| coordinate-failed | 3 |
| out-of-scope | 0 |
| duplicate | 0 |

## 3. P31 evidence scopes

The historical `numericP31PolicyEvidence` field in the raw is preserved unchanged. Offline inspection now distinguishes two scopes:

| Scope | Selected entities | Complete-key candidates | Unique complete P31 keys | Intended use |
|---|---:|---:|---:|---|
| `selectedEntityP31Evidence` | 26 | 26 | 25 | Blocking-type and identity-risk coverage, including failed candidates |
| `usableCandidateP31Evidence` | 18 | 18 | 17 | Future informational/manual rule candidates only |

All 25 selected-entity combinations remain `unresolved`; no classifier policy is inferred from labels, and no extra P31 QID is ignored.

## 4. Current 18 usable candidates

The recommendation column is planning guidance only and does not freeze primary or backup roles.

| Country | City | POI | Selected QID | Status | Parent level | P31 key | Identity type | Planning recommendation |
|---|---|---|---|---|---|---|---|---|
| CO | Bogotá | National Museum of Colombia | Q671264 | pass | direct | Q17431399\|Q33506 | institution/museum | primary-eligible |
| CO | Medellín | Museum of Antioquia | Q2377645 | pass | direct | Q33506 | institution/museum | primary-eligible |
| CO | Medellín | Medellín Museum of Modern Art | Q3329644 | pass | direct | Q207694\|Q33506 | institution/museum | primary-eligible |
| CO | Medellín | Metropolitan Cathedral of Medellín | Q1050597 | pass | direct | Q56242215 | physical building | primary-eligible |
| CO | Medellín | Rafael Uribe Uribe Palace of Culture | Q17086626 | conditional-manual | direct | Q811979 | historic building; type unclassified | high-risk-manual |
| CZ | Brno | Špilberk Castle | Q118256 | pass | location-path depth 3 | Q23413\|Q57831 | physical structure | primary-eligible |
| FI | Helsinki | National Museum of Finland | Q1418136 | conditional-manual | direct | Q17105874\|Q17431399\|Q24699794\|Q33506 | institution + building | high-risk-manual |
| FI | Turku | Turku Castle | Q136893 | conditional-manual | direct | Q23413\|Q33506 | institution + building | high-risk-manual |
| FI | Turku | Turku Cathedral | Q1187606 | conditional-manual | direct | Q16970\|Q2977\|Q56242235 | physical structure | backup-eligible |
| FI | Turku | Sibelius Museum | Q4306382 | pass | direct | Q17455058\|Q58632302 | institution/museum | primary-eligible |
| FI | Turku | Turku Art Museum | Q4502138 | conditional-manual | direct | Q207694\|Q24699794 | institution + building | high-risk-manual |
| NL | Amsterdam | Anne Frank House | Q165366 | conditional-manual | direct | Q2087181\|Q575759 | institution + building | high-risk-manual |
| NL | Rotterdam | Maritime Museum Rotterdam | Q2755458 | pass | direct | Q1863818 | institution/museum | primary-eligible |
| PL | Warsaw | Royal Castle in Warsaw | Q756098 | conditional-manual | direct | Q23413\|Q33506\|Q53536964\|Q811165 | institution + building | high-risk-manual |
| PL | Warsaw | Warsaw Uprising Museum | Q574328 | pass | direct | Q16735822\|Q2772772\|Q811979 | institution/museum | primary-eligible |
| PL | Warsaw | POLIN Museum of the History of Polish Jews | Q429069 | conditional-manual | direct | Q1307560\|Q24699794 | institution + building | high-risk-manual |
| PL | Kraków | Wawel Royal Castle | Q7975612 | conditional-manual | direct | Q33506 | institution/museum | high-risk-manual |
| PL | Kraków | National Museum in Kraków | Q195311 | pass | direct | Q17431399\|Q207694\|Q2772772 | institution/museum | primary-eligible |

Wawel Royal Castle must remain explicitly distinct from Wawel Hill, the wider Wawel complex, and Wawel Cathedral in any future identity decision.

## 5. Identity-ambiguous review (10)

### Search evidence and disposition

| Candidate | Search QID / label / description | Why no selected QID | Failure class | Next-round recommendation |
|---|---|---|---|---|
| Gold Museum, Bogotá | No results | Search produced no exact entities | no-search-result | Requery with official Spanish and English names |
| Botero Museum, Bogotá | No results | Search produced no exact entities | no-search-result | Requery with official Spanish and institution-qualified names |
| Municipal House, Prague | No results | Search produced no exact entities | no-search-result | Requery with Czech official name |
| St. Vitus Cathedral, Prague | No results | Search produced no exact entities | no-search-result | Requery with Czech full cathedral name |
| Cathedral of St. Peter and Paul, Brno | No results | Search produced no exact entities | no-search-result | Requery with Czech official name |
| Ateneum Art Museum, Helsinki | No results | Search produced no exact entities | no-search-result | Requery with Finnish/local and short official names |
| Euromast, Rotterdam | Q969215 / Euromast / observation tower in Rotterdam; Q100717811 / Euromast / tram stop in Rotterdam; Q2177257 / Het Park / public park; Q134647843 / Euromast / company in France; Q3060668 / Euromaster / vehicle-services network; Q1375090 / Euromasters / band; Q107741576 / Euromastpasserel / bridge; Q16544344 / Euromaster Chrobry Głogów / no description; Q131632679 / Euromaster France / no description | Q969215 and Q100717811 both passed the preliminary numeric gates and exactly matched the name; rank cannot resolve tower versus stop | multiple-viable-identities | Retain for manual QID review; do not auto-select Q969215 |
| Palace of Culture and Science, Warsaw | No results | Search produced no exact entities | no-search-result | Requery with Polish official name |
| St. Mary’s Basilica, Kraków | No results | Search produced no exact entities | no-search-result | Requery with Polish official name and building wording |
| Schindler’s Factory Museum, Kraków | No results | Search produced no exact entities | no-search-result | Requery with Polish and formal English names; replace if still unresolved |

No ambiguous candidate is upgraded on the basis of search rank.

## 6. Parent-failed review (8)

All eight passed Country and coordinate gates. “Clearly in target city” below is only a human-review hint based on the stored coordinates and location labels; it does not change the status.

| Candidate | Selected QID | Direct P131 | Direct P276 | Finite path result | Approved City | Coordinates | Human location hint | Structured gap | Classification |
|---|---|---|---|---|---|---|---|---|---|
| Prague Castle | Q193369 | Q744598 Hradčany, district of Prague | none | Queried; no path to Q1085 | Q1085 | 50.09, 14.4 | Clearly points to Prague | Broad complex is attached to a district not connected to the approved City entity within depth 3 | broad-complex-parent-gap |
| Villa Tugendhat | Q457453 | Q3565523 Černá Pole; Q3566096 Brno-sever | none | Queried; no path to Q14960 | Q14960 | 49.207222, 16.615833 | Clearly points to Brno | Cadastral-area/district chain does not reach the approved City entity | wikidata-parent-model-gap |
| Brno Ossuary | Q4971773 | Q12039338 Brno-město | none | Queried; no path to Q14960 | Q14960 | 49.19643, 16.60816 | Clearly points to Brno | Neighborhood chain does not reach approved City within fixed depth | wikidata-parent-model-gap |
| Rijksmuseum | Q190804 | Q9899 Amsterdam municipality | Q25861166 Rijksmuseum complex plus several API-only venue/building claims | Queried; no path to Q727 | Q727 | 52.36, 4.885278 | Clearly points to Amsterdam | Institution, building complex, municipality, and approved City use separate entities | institution-building-parent-split |
| Van Gogh Museum | Q224124 | Q9899 Amsterdam municipality | Q42296997 Rietveldgebouw; Q42297000 Kurokawa wing; Q63881336 unlabeled building | Queried; no path to Q727 | Q727 | 52.358333, 4.881111 | Clearly points to Amsterdam | Institution is linked to venue wings and municipality rather than approved City | institution-building-parent-split |
| Royal Palace of Amsterdam | Q1056152 | Q9899 Amsterdam municipality | Q478282 Amsterdam-Centrum | Queried; no path to Q727 | Q727 | 52.373167, 4.891361 | Clearly points to Amsterdam | Municipality/borough model does not reach approved City entity | wikidata-parent-model-gap |
| Kunsthal Rotterdam | Q1668856 | Q2680952 Rotterdam municipality | Q2729544 Rotterdam Centrum | Queried; no path to Q34370 | Q34370 | 51.910778, 4.473444 | Clearly points to Rotterdam | Institution/venue uses municipality and district entities instead of approved City | institution-building-parent-split |
| Erasmus Bridge | Q1348188 | Q2680952 Rotterdam municipality | Q1748087 Kop van Zuid | Queried; no path to Q34370 | Q34370 | 51.90864, 4.48654 | Clearly points to Rotterdam | Bridge is linked to municipality/neighborhood, not approved City entity | wikidata-parent-model-gap |

No candidate has a stored successful finite path; failed candidates retain empty `parentPathQids` and `transitiveQueryPerformed = true`.

## 7. Country and coordinate failure review

### Country-failed (1)

**Helsinki Cathedral**

- Search candidates:
  - Q738015 — Helsinki Cathedral — cathedral in Helsinki, Church of Finland; API/SPARQL P17 = Q33.
  - Q65234148 — Helsinki Cathedral Parish — Lutheran parish; API/SPARQL P17 = Q33, but it is not the exact building name and lacks coordinates.
  - Q3247489 — Helsinki Cathedral — Wikimedia disambiguation page; no P17 and no coordinates.
- Expected Country: Q33.
- There is no conflicting P17 on the building candidate Q738015. The aggregate `country-failed` status is caused by failure-priority ordering across exact-name candidates; Q738015 itself fails the coordinate gate.
- This is not an approved wrong-identity selection because no QID was selected.
- Recommendation: retain Q738015 for manual QID/evidence review and add replacement candidates; do not treat the disambiguation page as the POI.

### Coordinate-failed (3)

| Candidate | Candidate/search QIDs | Statements and ranks | Failure type | Can another identity solve it? | Recommendation |
|---|---|---|---|---|---|
| Quinta de Bolívar | Q7272369 | 0 statements | missing coordinate | No alternative identity was found | Replace for the 4-POI target; retain only as documented evidence |
| Charles Bridge | Q67804013, labelled “Charles Bridge Prague”, Czech company | 0 statements | wrong non-POI identity plus missing coordinate | Likely, but only through a new official/local-name search | Retain for requery; do not approve current QID |
| Temppeliaukio Church | Q1132809; Q139765648 organ | Q1132809 has two normal-rank coordinates: 60.1730052,24.925241 and 60.17298455,24.9252379 | multiple coordinates | No cleaner alternative building identity is currently established | Replace for current strict gate; retain Q1132809 for manual evidence review |

## 8. City gaps

The minimum remains four usable candidates, but a 5–6 candidate pool is preferred to absorb future failures.

| City | Current usable | Minimum missing | Existing reviewable failures | Recommended new candidates |
|---|---:|---:|---:|---:|
| Bogotá | 1 | 3 | 3 | 3 |
| Medellín | 4 | 0 | 0 | 0 |
| Prague | 0 | 4 | 4 | 4 |
| Brno | 1 | 3 | 3 | 3 |
| Helsinki | 1 | 3 | 3 | 3 |
| Turku | 4 | 0 | 0 | 0 |
| Amsterdam | 1 | 3 | 3 | 3 |
| Rotterdam | 1 | 3 | 3 | 3 |
| Warsaw | 3 | 1 | 1 | 2 |
| Kraków | 2 | 2 | 2 | 3 |

Medellín and Turku receive no new candidates in supplement01. High-risk manual items still remain: Rafael Uribe Uribe Palace of Culture in Medellín, and Turku Castle, Turku Cathedral, and Turku Art Museum in Turku.

## 9. Second-round new candidate design

These are names only. No unverified QID is supplied.

| Country | City | New candidate | Why more stable | Expected identity risk | Intended role |
|---|---|---|---|---|---|
| Colombia | Bogotá | Iglesia de San Francisco | Single church building with fixed location | Low; local-name variants | replacement-candidate |
| Colombia | Bogotá | Torre Colpatria | Single tower with fixed coordinates | Low; tower versus organization naming | replacement-candidate |
| Colombia | Bogotá | Teatro Colón | Single historic theatre building | Medium; venue versus operating institution | replacement-candidate |
| Czechia | Prague | Powder Tower | Single monument/tower | Low; translated-name variants | replacement-candidate |
| Czechia | Prague | Dancing House | Single named building | Low; building versus business occupants | replacement-candidate |
| Czechia | Prague | Church of Our Lady before Týn | Single church building | Low; local/English name variants | replacement-candidate |
| Czechia | Prague | Old Town Bridge Tower | Single tower | Low; avoid confusion with bridge | replacement-candidate |
| Czechia | Brno | Church of St. James | Single church building | Low; local-name variants | replacement-candidate |
| Czechia | Brno | Old Town Hall | Single historic building | Medium; building versus municipal institution | replacement-candidate |
| Czechia | Brno | Villa Löw-Beer | Single villa/museum venue | Medium; building versus museum institution | replacement-candidate |
| Finland | Helsinki | Uspenski Cathedral | Single cathedral building | Low; transliteration variants | replacement-candidate |
| Finland | Helsinki | Kiasma | Single museum venue | Medium; institution versus building | replacement-candidate |
| Finland | Helsinki | Sibelius Monument | Single fixed monument | Low | replacement-candidate |
| Netherlands | Amsterdam | Oude Kerk | Single church building | Low; local/English labels | replacement-candidate |
| Netherlands | Amsterdam | Westerkerk | Single church building | Low | replacement-candidate |
| Netherlands | Amsterdam | Rembrandt House Museum | Single museum venue in a defined building | Medium; museum versus historic house | replacement-candidate |
| Netherlands | Rotterdam | Grote of Sint-Laurenskerk | Single church building | Low; naming variants | replacement-candidate |
| Netherlands | Rotterdam | Depot Boijmans Van Beuningen | Single purpose-built venue | Medium; venue versus museum organization | replacement-candidate |
| Netherlands | Rotterdam | Rotterdam City Hall | Single civic building | Medium; building versus municipal organization | replacement-candidate |
| Poland | Warsaw | St. Anne’s Church | Single church building | Low; Polish/English names | replacement-candidate |
| Poland | Warsaw | Warsaw Barbican | Single defensive structure | Low; monument versus wider walls | additional-buffer |
| Poland | Kraków | Kraków Barbican | Single defensive structure | Low | replacement-candidate |
| Poland | Kraków | St. Florian’s Gate | Single gate/monument | Low | replacement-candidate |
| Poland | Kraków | MOCAK Museum of Contemporary Art in Kraków | Single museum venue | Medium; institution versus venue | additional-buffer |

## 10. Existing failed-candidate strategy

| Candidate | Current failure | Strategy | Rationale |
|---|---|---|---|
| Gold Museum | identity-ambiguous/no result | retain-for-requery | Official Spanish name should be tried |
| Botero Museum | identity-ambiguous/no result | retain-for-requery | Official Spanish/institution-qualified name should be tried |
| Municipal House | identity-ambiguous/no result | retain-for-requery | Czech official name likely improves exact search |
| St. Vitus Cathedral | identity-ambiguous/no result | retain-for-requery | Use full Czech cathedral name |
| Cathedral of St. Peter and Paul | identity-ambiguous/no result | retain-for-requery | Use Czech official name |
| Ateneum Art Museum | identity-ambiguous/no result | retain-for-requery | Use Ateneum and Finnish official variants |
| Euromast | multiple viable identities | retain-for-manual-qid-review | Tower and tram-stop entities must be explicitly separated |
| Palace of Culture and Science | identity-ambiguous/no result | retain-for-requery | Use Polish official name |
| St. Mary’s Basilica | identity-ambiguous/no result | retain-for-requery | Use Polish official name |
| Schindler’s Factory Museum | identity-ambiguous/no result | retain-for-requery | Use formal Polish and English names; replace if supplement still fails |
| Prague Castle | parent-failed | retain-for-manual-qid-review | Broad-complex risk; do not use as primary without approved structured evidence |
| Villa Tugendhat | parent-failed | retain-for-requery | District-chain model gap is suitable for targeted supplement evidence |
| Brno Ossuary | parent-failed | retain-for-requery | Neighborhood-chain model gap is suitable for targeted supplement evidence |
| Rijksmuseum | parent-failed | retain-for-requery | Institution/building/municipality split requires targeted evidence |
| Van Gogh Museum | parent-failed | retain-for-requery | Institution and venue-wing split requires targeted evidence |
| Royal Palace of Amsterdam | parent-failed | retain-for-requery | Municipality/borough versus City entity gap |
| Kunsthal Rotterdam | parent-failed | retain-for-requery | Identity is clear; likely institution/building parent split |
| Erasmus Bridge | parent-failed | retain-for-requery | Municipality/neighborhood versus City entity gap |
| Helsinki Cathedral | country-failed aggregate | retain-for-manual-qid-review | Q738015 has correct P17 but lacks a unique accepted coordinate |
| Quinta de Bolívar | coordinate-failed | replace | Only identified entity has no P625 |
| Charles Bridge | coordinate-failed | retain-for-requery | Current result is a company, not the bridge |
| Temppeliaukio Church | coordinate-failed | replace | Correct-looking entity has two normal-rank coordinates under the strict gate |

No failed candidate counts toward the current usable total.

## 11. Supplement01 scope and search design

If a later turn authorizes network access, create a separate evidence supplement rather than replacing the first raw:

`data/knowledge/raw/pois-p1b-batch01-candidates-supplement01.wikidata.json`

### Identity requery terms

| Candidate | Suggested official/local terms |
|---|---|
| Gold Museum | `Museo del Oro Bogotá`; `Museo del Oro Banco de la República` |
| Botero Museum | `Museo Botero Bogotá`; `Museo Botero Banco de la República` |
| Municipal House | `Obecní dům Praha`; `Municipal House Prague building` |
| St. Vitus Cathedral | `Katedrála svatého Víta`; full Czech cathedral name |
| Cathedral of St. Peter and Paul | `Katedrála svatých Petra a Pavla Brno` |
| Ateneum Art Museum | `Ateneum`; `Ateneumin taidemuseo` |
| Palace of Culture and Science | `Pałac Kultury i Nauki` |
| St. Mary’s Basilica | `Kościół Mariacki Kraków` |
| Schindler’s Factory Museum | `Fabryka Emalia Oskara Schindlera`; `Oskar Schindler's Enamel Factory` |
| Charles Bridge | `Karlův most`; `Charles Bridge` without company suffix |

### Manual identity review

- Euromast: compare Q969215 tower with Q100717811 tram stop; do not select by rank.
- Helsinki Cathedral: review Q738015 building evidence separately from Q3247489 disambiguation page and Q65234148 parish.
- Prague Castle: retain Q193369 only as a broad-complex manual review target.

### Parent-only supplement targets

Do not re-search stable QIDs for Villa Tugendhat, Brno Ossuary, Rijksmuseum, Van Gogh Museum, Royal Palace of Amsterdam, Kunsthal Rotterdam, or Erasmus Bridge. Supplement only the missing structured parent evidence for those selected QIDs.

### New candidates

Search only the 24 new replacement/additional-buffer names in section 9, using official local and English names. Do not auto-select the first result and do not use travel websites as canonical identity evidence.

Stable `pass` candidates are excluded from supplement searches.

## 12. Readiness decision

- Final 30 primary + 10 backup set: **not frozen**.
- Every City has at least four usable candidates: **no**; only Medellín and Turku do.
- Formal numeric classifier policy: **not implemented**.
- Supplement evidence refresh: **recommended**, but only after its fixed requery/new-candidate scope is explicitly approved.
- Canonical publish readiness: **no**.

## 13. Supplement01 implementation and preflight

Supplement01 was implemented as a separate evidence-gate round. It did not replace or modify the first-round raw snapshot.

- Institution/building evidence was split into two bounded stages:
  1. relation discovery returns only institution QID, property, and related-entity QID;
  2. exact entity and bounded `P131`/`P276` parent evidence is loaded only for discovered related entities.
- Institution relation discovery batches contain at most two institution QIDs.
- Related-entity parent batches contain at most two related-entity QIDs.
- No unbounded `P131*` or `P131+` path is used.
- Municipality, relation-discovery, related-entity exact, related-entity parent, and type-label request failures are recorded as candidate-level evidence issues instead of aborting unrelated candidates.
- Fatal core acquisition and raw-structure failures still prevent the atomic raw write.
- Institution/building discovery is limited to Rijksmuseum, Van Gogh Museum, and Kunsthal Rotterdam. Erasmus Bridge and Euromast are explicitly excluded from that query family.
- The fixed scope remains 44 candidates across eight cities; stable first-round candidates and Australia remain excluded.

Local preflight completed before the formal network refresh:

- `node --check`: pass
- self-test fixtures: 66 / 66 pass
- `git diff --check`: pass

## 14. Formal Supplement01 acquisition

Exactly one new formal Supplement01 refresh was run on 2026-07-16 with the approved timeout, retry, and throttle settings.

| Field | Result |
|---|---|
| Output | `data/knowledge/raw/pois-p1b-batch01-candidates-supplement01.wikidata.json` |
| Retrieved at | `2026-07-16T08:56:42.238Z` |
| Size | 2,634,399 bytes |
| SHA-256 | `6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd` |
| Base raw SHA-256 | `fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d` |
| Candidate count | 44 |
| First-round failed candidates retried | 20 |
| New candidates | 24 |
| Cities | 8 |
| Candidate-level evidence issues | 0 |
| Fatal errors | 0 |

Operation counts were 10 identity requery, 3 manual identity review, 7 parent-only requery, 6 replacement candidate, and 18 additional buffer.

### Request telemetry

| Metric | Result |
|---|---:|
| Attempted HTTP requests | 143 |
| Successful HTTP requests | 135 |
| HTTP 429 responses | 8 |
| Timeouts | 0 |
| Retries | 8 |
| Total throttle/retry wait | 459,000 ms |
| Search requests | 75 |
| Exact-entity requests / QIDs | 9 / 269 |
| Projection SPARQL requests | 3 |
| Core parent SPARQL requests | 5 |
| Municipality requests | 7 |
| Relation-discovery requests | 2 / 2 succeeded |
| Related-entity QIDs | 62 |
| Related-entity exact batches | 2 |
| Related-entity parent requests | 32 / 32 succeeded |
| Type-label requests / QIDs | 2 / 104 |

The eight HTTP 429 responses were recovered by the configured retries. No timeout or unrecovered candidate-level evidence failure occurred.

## 15. Supplement01 outcome

### Status distribution

| Status | Count |
|---|---:|
| pass | 4 |
| conditional-manual | 14 |
| identity-ambiguous | 14 |
| parent-failed | 9 |
| country-failed | 2 |
| coordinate-failed | 1 |
| out-of-scope | 0 |
| duplicate | 0 |

Twenty-eight candidates have a selected QID, 16 remain unresolved, 18 are usable under the current evidence gate, and 26 remain blocking. There are no internal duplicate QIDs, base overlaps, or cross-type overlaps.

### Notable recovered candidates

- Direct `pass`: Botero Museum (`Q3329100`), Cathedral of St. Peter and Paul (`Q45033`), Palace of Culture and Science (`Q167566`), and Church of Our Lady before Tyn (`Q1453427`).
- `conditional-manual`: St. Mary's Basilica (`Q1143171`), Schindler's Factory Museum (`Q286522`), Euromast (`Q969215`), Torre Colpatria (`Q3120855`), Sibelius Monument (`Q2584017`), Rijksmuseum (`Q190804`), Van Gogh Museum (`Q224124`), Royal Palace of Amsterdam (`Q1056152`), Erasmus Bridge (`Q1348188`), Oude Kerk (`Q110541187`), Rembrandt House Museum (`Q277316`), Depot Boijmans Van Beuningen (`Q41061028`), Rotterdam City Hall (`Q1481214`), and Krakow Barbican (`Q807309`).
- Helsinki Cathedral remains `coordinate-failed`: its parent and country evidence are accepted, but its coordinate gate is not.
- Prague Castle, Villa Tugendhat, Brno Ossuary, Kunsthal Rotterdam, Powder Tower, Dancing House, Old Town Bridge Tower, St. Florian's Gate, and the selected St. Vitus Cathedral entity remain `parent-failed`.
- Gold Museum, Municipal House, Charles Bridge, Ateneum, Kiasma, and several added buffers remain identity-ambiguous. Uspenski Cathedral and Warsaw Barbican remain country-failed.

## 16. Institution/building evidence result

The lightweight institution stages completed without candidate-level issues:

- Rijksmuseum: relation discovery succeeded; 85 relation records were retained. Independent municipality-to-Amsterdam evidence accepted the parent, so the candidate is `conditional-manual`. Relation evidence did not silently promote it to `pass`.
- Van Gogh Museum: relation discovery succeeded; 10 relation records were retained. Independent municipality-to-Amsterdam evidence accepted the parent, so the candidate is `conditional-manual`.
- Kunsthal Rotterdam: relation discovery succeeded and found three relation records, but no related-entity parent path met the acceptance rule. It correctly remains `parent-failed` with `institution-building-unconfirmed` evidence.
- Erasmus Bridge: institution discovery was not run; municipality evidence produced `conditional-manual`.
- Euromast: institution discovery was not run; the explicitly selected tower identity remains `conditional-manual`.

This confirms that supplemental institution evidence is recoverable at candidate level while the strict Kunsthal guard remains effective.

## 17. Merged P31 evidence

| Scope | Entities | Complete P31 | Unique type QIDs |
|---|---:|---:|---:|
| Selected merged evidence | 46 | 46 | 42 |
| Usable merged evidence | 36 | 36 | 33 |

P31 coverage is complete for both selected and usable merged evidence. The formal numeric classifier remains intentionally unimplemented, so this completeness does not authorize canonical publishing.

## 18. Merged city readiness after Supplement01

| City | Base usable | Recovered | New usable | Merged usable | Blocking | Shortfall to 4 |
|---|---:|---:|---:|---:|---:|---:|
| Amsterdam | 1 | 3 | 2 | 6 | 1 | 0 |
| Bogota | 1 | 1 | 1 | 3 | 4 | 1 |
| Brno | 1 | 1 | 0 | 2 | 5 | 2 |
| Helsinki | 1 | 0 | 1 | 2 | 5 | 2 |
| Krakow | 2 | 2 | 1 | 5 | 2 | 0 |
| Medellin | 4 | 0 | 0 | 4 | 0 | 0 |
| Prague | 0 | 0 | 1 | 1 | 7 | 3 |
| Rotterdam | 1 | 2 | 2 | 5 | 2 | 0 |
| Turku | 4 | 0 | 0 | 4 | 0 | 0 |
| Warsaw | 3 | 1 | 0 | 4 | 2 | 0 |

Readiness decision after Supplement01:

- Cities at or above four usable candidates: Amsterdam, Krakow, Medellin, Rotterdam, Turku, and Warsaw.
- Cities still below four: Bogota by 1, Brno by 2, Helsinki by 2, and Prague by 3.
- Every City has at least four usable candidates: **no**.
- Final 30 primary + 10 backup set: **not frozen**.
- Formal numeric classifier policy: **not implemented**.
- Canonical publish readiness: **no**.
- A third evidence round is not started by this report.

## 19. Supplement02 fixed scope

Supplement02 was limited to 12 new `additional-buffer` candidates in the four cities that remained below four usable candidates after Supplement01. No Base or Supplement01 candidate was searched again.

| City | Fixed candidates |
|---|---|
| Bogotá | Santuario de Monserrate; Museo de Arte Colonial |
| Brno | Capuchin Crypt in Brno; Church of St. Thomas in Brno; Mahen Theatre |
| Helsinki | Finnish National Theatre; Helsinki Central Library Oodi; House of the Estates |
| Prague | National Theatre Prague; Clementinum; Rudolfinum; Church of St. Nicholas, Old Town |

All 12 candidate keys are unique, use `sourceRound=supplement02`, use `operation=additional-buffer`, exclude Australia, and have no normalized name or candidate-key overlap with either historical round.

## 20. Supplement02 formal acquisition

Exactly one formal Supplement02 refresh was run on 2026-07-16. It completed successfully and wrote the raw atomically.

| Field | Result |
|---|---|
| Output | `data/knowledge/raw/pois-p1b-batch01-candidates-supplement02.wikidata.json` |
| Retrieved at | `2026-07-16T09:20:17.105Z` |
| Size | 283,602 bytes |
| SHA-256 | `57cb63ea4678380ef70ab522057207a9582bce28a80de8327d79419683c3480e` |
| Base raw SHA-256 | `fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d` |
| Supplement01 raw SHA-256 | `6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd` |
| Candidate-level evidence issues | 0 |
| Fatal errors | 0 |

### Request telemetry

| Metric | Result |
|---|---:|
| Attempted HTTP requests | 33 |
| Successful HTTP requests | 31 |
| HTTP 429 responses | 2 |
| Timeouts | 0 |
| Retries | 2 |
| Total throttle/retry wait | 85,000 ms |
| Search requests | 24 |
| Exact-entity requests / QIDs | 2 / 25 |
| Projection SPARQL requests | 1 |
| Parent SPARQL requests | 1 |
| Municipality requests | 2 |
| Type-label requests / QIDs | 1 / 16 |
| Institution-building requests | 0 |

Both HTTP 429 responses were recovered by the configured retry policy. No institution-building discovery was needed for the fixed candidates.

## 21. Supplement02 candidate results

| City | Candidate | Status | Selected QID | Parent result |
|---|---|---|---|---|
| Bogotá | Santuario de Monserrate | country-failed | none | not evaluated after country gate |
| Bogotá | Museo de Arte Colonial | identity-ambiguous | none | no exact entity selected |
| Brno | Capuchin Crypt in Brno | identity-ambiguous | none | no exact entity selected |
| Brno | Church of St. Thomas in Brno | identity-ambiguous | none | no exact entity selected |
| Brno | Mahen Theatre | pass | Q1138893 | direct |
| Helsinki | Finnish National Theatre | pass | Q1200969 | direct |
| Helsinki | Helsinki Central Library Oodi | pass | Q18659999 | direct |
| Helsinki | House of the Estates | conditional-manual | Q3279961 | direct |
| Prague | National Theatre Prague | identity-ambiguous | none | no exact entity selected |
| Prague | Clementinum | parent-failed | Q1100429 | no approved City path within the fixed depth |
| Prague | Rudolfinum | identity-ambiguous | none | no exact entity selected |
| Prague | Church of St. Nicholas, Old Town | identity-ambiguous | none | no exact entity selected |

Status distribution: 3 pass, 1 conditional-manual, 6 identity-ambiguous, 1 parent-failed, 1 country-failed, and zero coordinate-failed, out-of-scope, or duplicate candidates. Five candidates have a selected QID; seven remain unresolved. Four candidates are usable and eight remain blocking.

No Supplement02 internal selected-QID duplicate, Base selected-QID overlap, Supplement01 selected-QID overlap, Pilot POI overlap, Country/City overlap, or cross-type overlap was found.

## 22. Three-round merged readiness

| City | Base usable | Supplement01 recovered | Supplement01 new | Supplement02 usable | Total usable | Blocking / unresolved |
|---|---:|---:|---:|---:|---:|---:|
| Amsterdam | 1 | 3 | 2 | 0 | 6 | 1 |
| Bogotá | 1 | 1 | 1 | 0 | 3 | 6 |
| Brno | 1 | 1 | 0 | 1 | 3 | 7 |
| Helsinki | 1 | 0 | 1 | 3 | 5 | 5 |
| Kraków | 2 | 2 | 1 | 0 | 5 | 2 |
| Medellín | 4 | 0 | 0 | 0 | 4 | 0 |
| Prague | 0 | 0 | 1 | 0 | 1 | 11 |
| Rotterdam | 1 | 2 | 2 | 0 | 5 | 2 |
| Turku | 4 | 0 | 0 | 0 | 4 | 0 |
| Warsaw | 3 | 1 | 0 | 0 | 4 | 2 |

The merged pool contains 76 unique candidate keys. Bogotá remains short by one, Brno remains short by one, and Prague remains short by three. Helsinki now exceeds the minimum with five usable candidates.

## 23. Three-round P31 evidence and decision

| Scope | Selected entities | Complete P31 | Unique complete keys |
|---|---:|---:|---:|
| Selected merged evidence | 51 | 51 | 47 |
| Usable merged evidence | 40 | 40 | 37 |

P31 evidence remains complete in both merged scopes. The stored combinations retain sorted complete keys, counts, examples, source rounds, and the existing four candidate dispositions. No classifier was implemented.

Readiness decision after Supplement02:

- Every City has at least four usable candidates: **no**.
- Prerequisite to freeze the final 30 primary + 10 backup set: **not met**.
- Final set frozen: **no**.
- Canonical publish readiness: **no**.
- Supplement03: **not started**.

## 24. Supplement03 fixed scope

Supplement03 was the final automatic evidence supplement. It was limited to nine new `additional-buffer` candidates in Bogotá, Brno, and Prague. No candidate from Base, Supplement01, or Supplement02 was searched again.

| City | Fixed candidates |
|---|---|
| Bogotá | Bogotá Primatial Cathedral; Planetarium of Bogotá |
| Brno | Brno Observatory and Planetarium; Janáček Theatre |
| Prague | Old Town Hall with Astronomical Clock; Spanish Synagogue; Church of St. Ludmila; Žižkov Television Tower; National Museum main building |

All nine candidate keys are unique, use `sourceRound=supplement03`, use `operation=additional-buffer`, exclude Australia, and have no normalized name or candidate-key overlap with the three historical rounds.

## 25. Supplement03 formal acquisition

Exactly one formal Supplement03 refresh was run on 2026-07-16. It completed successfully and wrote the raw atomically.

| Field | Result |
|---|---|
| Output | `data/knowledge/raw/pois-p1b-batch01-candidates-supplement03.wikidata.json` |
| Retrieved at | `2026-07-16T09:50:10.683Z` |
| Size | 363,787 bytes |
| SHA-256 | `ad3915efdcc09bcd09f245ee9200b02eca6d65d532b7f85a493b1b6d7049e9af` |
| Base raw SHA-256 | `fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d` |
| Supplement01 raw SHA-256 | `6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd` |
| Supplement02 raw SHA-256 | `57cb63ea4678380ef70ab522057207a9582bce28a80de8327d79419683c3480e` |
| Candidate-level evidence issues | 0 |
| Fatal errors | 0 |

### Request telemetry

| Metric | Result |
|---|---:|
| Attempted HTTP requests | 30 |
| Successful HTTP requests | 28 |
| HTTP 429 responses | 2 |
| Timeouts | 0 |
| Retries | 2 |
| Total throttle/retry wait | 114,000 ms |
| Search requests | 21 |
| Exact-entity requests / QIDs | 2 / 41 |
| Projection SPARQL requests | 1 |
| Parent SPARQL requests | 2 |
| Municipality requests | 1 |
| Type-label requests / QIDs | 1 / 18 |
| Institution-building requests | 0 |

Both HTTP 429 responses were recovered by the configured retry policy. No institution-building discovery was needed.

## 26. Supplement03 candidate results

| City | Candidate | Status | Selected QID | Parent result |
|---|---|---|---|---|
| Bogotá | Bogotá Primatial Cathedral | pass | Q2942872 | direct |
| Bogotá | Planetarium of Bogotá | pass | Q6077641 | direct |
| Brno | Brno Observatory and Planetarium | parent-failed | Q12021065 | no approved City path within fixed depth |
| Brno | Janáček Theatre | parent-failed | Q3511873 | no approved City path within fixed depth |
| Prague | Old Town Hall with Astronomical Clock | conditional-manual | Q2332231 | bounded location path |
| Prague | Spanish Synagogue | parent-failed | Q990003 | no approved City path within fixed depth |
| Prague | Church of St. Ludmila | identity-ambiguous | none | no exact entity selected |
| Prague | Žižkov Television Tower | pass | Q1413217 | bounded location path |
| Prague | National Museum main building | parent-failed | Q43755714 | no approved City path within fixed depth |

Status distribution: 3 pass, 1 conditional-manual, 1 identity-ambiguous, 4 parent-failed, and zero country-failed, coordinate-failed, out-of-scope, or duplicate candidates. Eight candidates have a selected QID; one remains unresolved. Four candidates are usable and five remain blocking.

No selected-QID duplicate was found inside Supplement03 or against Base, Supplement01, or Supplement02. One explicit cross-type search-result overlap was retained: the Janáček Theatre search evidence also returned Q1138893, which is the Supplement02 Mahen Theatre identity. The Supplement03 candidate selected Q3511873 instead, so no entity was overwritten or silently reused.

## 27. Four-round merged readiness

| City | Base usable | Supplement01 usable | Supplement02 usable | Supplement03 usable | Total usable | Blocking / unresolved |
|---|---:|---:|---:|---:|---:|---:|
| Amsterdam | 1 | 5 | 0 | 0 | 6 | 1 |
| Bogotá | 1 | 2 | 0 | 2 | 5 | 6 |
| Brno | 1 | 1 | 1 | 0 | 3 | 9 |
| Helsinki | 1 | 1 | 3 | 0 | 5 | 5 |
| Kraków | 2 | 3 | 0 | 0 | 5 | 2 |
| Medellín | 4 | 0 | 0 | 0 | 4 | 0 |
| Prague | 0 | 1 | 0 | 2 | 3 | 14 |
| Rotterdam | 1 | 4 | 0 | 0 | 5 | 2 |
| Turku | 4 | 0 | 0 | 0 | 4 | 0 |
| Warsaw | 3 | 1 | 0 | 0 | 4 | 2 |

The merged pool contains 85 records and 85 unique candidate keys. Bogotá now exceeds the minimum with five usable candidates. Brno and Prague each remain short by one.

## 28. Final P31 evidence and decision

| Scope | Selected entities | Complete P31 | Unique complete keys |
|---|---:|---:|---:|
| Selected four-round evidence | 59 | 59 | 54 |
| Usable four-round evidence | 44 | 44 | 41 |

P31 evidence remains complete in both scopes. Stored combinations retain sorted complete keys, counts, examples, source rounds, and the existing candidate dispositions. No classifier was implemented.

Final evidence-supplement decision:

- Bogotá at least four usable candidates: **yes (5)**.
- Brno at least four usable candidates: **no (3; short by 1)**.
- Prague at least four usable candidates: **no (3; short by 1)**.
- Every City has at least four usable candidates: **no**.
- Prerequisite to freeze the final 30 primary + 10 backup set: **not met**.
- Final set frozen: **no**.
- Supplement04: **not started and must not be started automatically**.
- Recommended next decision: revisit Batch01 scale or the strict 3+1 rule instead of adding another automatic supplement.

## 29. Evidence-supplement closure and quota decision

The automatic evidence-supplement phase is now formally closed. Supplement04 will not be created.

The historical hard requirement of three primary candidates plus one mandatory backup per City is superseded for the frozen selection by this rule:

- every City must have exactly three primary candidates;
- every City may have at most one backup candidate;
- backup is optional and does not participate in publish readiness;
- canonical publishing still requires exactly three POIs per City;
- a backup is an operational reserve only, will not enter the canonical asset, will not receive formal provenance in this selection step, and does not count toward the cumulative POI total.

This change does not lower the formal POI evidence gate. Every primary and backup must still be `pass` or `conditional-manual`, retain a selected QID, and have complete Country, coordinate, parent, and P31 evidence. It only changes backup capacity from a blocking prerequisite into a non-blocking operational reserve.

## 30. Frozen primary selection

Selection policy version: `p1b-batch01-poi-selection-v1`
Selection rule: `three-primary-backup-optional`

| City QID | Primary candidate | Selected QID | Status | Source round | Parent level | Complete P31 key |
|---|---|---|---|---|---|---|
| Q2841 | National Museum of Colombia | Q671264 | pass | base | direct | Q17431399\|Q33506 |
| Q2841 | Botero Museum | Q3329100 | pass | supplement01 | direct | Q207694\|Q33506 |
| Q2841 | Bogotá Primatial Cathedral | Q2942872 | pass | supplement03 | direct | Q16970\|Q2977 |
| Q48278 | Museum of Antioquia | Q2377645 | pass | base | direct | Q33506 |
| Q48278 | Medellín Museum of Modern Art | Q3329644 | pass | base | direct | Q207694\|Q33506 |
| Q48278 | Metropolitan Cathedral of Medellín | Q1050597 | pass | base | direct | Q56242215 |
| Q1085 | Church of Our Lady before Týn | Q1453427 | pass | supplement01 | direct | Q16970 |
| Q1085 | Old Town Hall with Astronomical Clock | Q2332231 | conditional-manual | supplement03 | location-path | Q33506\|Q543654 |
| Q1085 | Žižkov Television Tower | Q1413217 | pass | supplement03 | location-path | Q11166728\|Q1440300 |
| Q14960 | Špilberk Castle | Q118256 | pass | base | location-path | Q23413\|Q57831 |
| Q14960 | Cathedral of St. Peter and Paul | Q45033 | pass | supplement01 | location-path | Q16970\|Q2977\|Q56242215 |
| Q14960 | Mahen Theatre | Q1138893 | pass | supplement02 | direct | Q153562\|Q24354 |
| Q1757 | Finnish National Theatre | Q1200969 | pass | supplement02 | direct | Q24354 |
| Q1757 | Helsinki Central Library Oodi | Q18659999 | pass | supplement02 | direct | Q28564\|Q856584 |
| Q1757 | National Museum of Finland | Q1418136 | conditional-manual | base | direct | Q17105874\|Q17431399\|Q24699794\|Q33506 |
| Q38511 | Sibelius Museum | Q4306382 | pass | base | direct | Q17455058\|Q58632302 |
| Q38511 | Turku Castle | Q136893 | conditional-manual | base | direct | Q23413\|Q33506 |
| Q38511 | Turku Cathedral | Q1187606 | conditional-manual | base | direct | Q16970\|Q2977\|Q56242235 |
| Q727 | Anne Frank House | Q165366 | conditional-manual | base | direct | Q2087181\|Q575759 |
| Q727 | Rijksmuseum | Q190804 | conditional-manual | supplement01 | municipality-city-structured-relationship | Q11396960\|Q1172284\|Q16735822\|Q17431399\|Q207694 |
| Q727 | Van Gogh Museum | Q224124 | conditional-manual | supplement01 | municipality-city-structured-relationship | Q207694\|Q3152824\|Q33506 |
| Q34370 | Maritime Museum Rotterdam | Q2755458 | pass | base | direct | Q1863818 |
| Q34370 | Euromast | Q969215 | conditional-manual | supplement01 | municipality-city-structured-relationship | Q1440300 |
| Q34370 | Erasmus Bridge | Q1348188 | conditional-manual | supplement01 | municipality-city-structured-relationship | Q537127\|Q79007\|Q911663 |
| Q270 | Warsaw Uprising Museum | Q574328 | pass | base | direct | Q16735822\|Q2772772\|Q811979 |
| Q270 | Palace of Culture and Science | Q167566 | pass | supplement01 | direct | Q11303\|Q16560\|Q2319498\|Q5061188\|Q811165 |
| Q270 | Royal Castle in Warsaw | Q756098 | conditional-manual | base | direct | Q23413\|Q33506\|Q53536964\|Q811165 |
| Q31487 | National Museum in Kraków | Q195311 | pass | base | direct | Q17431399\|Q207694\|Q2772772 |
| Q31487 | Wawel Royal Castle | Q7975612 | conditional-manual | base | direct | Q33506 |
| Q31487 | St. Mary’s Basilica | Q1143171 | conditional-manual | supplement01 | direct | Q120560\|Q16970\|Q811165 |

The frozen primary set contains 18 `pass` and 12 `conditional-manual` candidates. Each selection records its candidate key, selected QID, source round, parent level, complete P31 key, identity risk, selection rationale, and exact raw reference. Selection order is fixed by City and then by the evidence-quality decision recorded in the selection input.

## 31. Optional operational reserves

| City | Backup | Selected QID | Status | Source round | Parent level |
|---|---|---|---|---|---|
| Bogotá | Planetarium of Bogotá | Q6077641 | pass | supplement03 | direct |
| Medellín | Rafael Uribe Uribe Palace of Culture | Q17086626 | conditional-manual | base | direct |
| Helsinki | House of the Estates | Q3279961 | conditional-manual | supplement02 | direct |
| Turku | Turku Art Museum | Q4502138 | conditional-manual | base | direct |
| Amsterdam | Royal Palace of Amsterdam | Q1056152 | conditional-manual | supplement01 | municipality-city-structured-relationship |
| Rotterdam | Depot Boijmans Van Beuningen | Q41061028 | conditional-manual | supplement01 | municipality-city-structured-relationship |
| Warsaw | POLIN Museum of the History of Polish Jews | Q429069 | conditional-manual | base | direct |
| Kraków | Kraków Barbican | Q807309 | conditional-manual | supplement01 | direct |

Brno and Prague have `backup = null` with reason `no-fourth-usable-candidate`. This is an allowed, non-blocking state and creates no conflict or review by itself.

## 32. Frozen selection artifact

| Field | Value |
|---|---|
| File | `data/knowledge/raw/pois-p1b-batch01-selection.json` |
| Policy version | `p1b-batch01-poi-selection-v1` |
| Rule | `three-primary-backup-optional` |
| Size | 79,982 bytes |
| SHA-256 | `40d7e91bddf065664a092153183c6a0a7cc9060397da3b40d0aa06af0ed3f118` |
| Primary | 30 |
| Backup | 8 |
| Excluded merged records | 47 |
| Runtime timestamp | omitted |

The artifact is an implementation input list, not a canonical POI asset. All 30 primary QIDs are unique, all eight backup QIDs are unique, and the two sets are disjoint. Every selected entry resolves back to one of the four frozen raw files by raw path, one-based candidate index, and candidate key.

The four source SHA-256 values remain:

- Base: `fe39f0f9ad4bebe31f0cbe64390744b1c3343f484968838d204d8ae431e80c1d`
- Supplement01: `6de7b51427a4370d2042701dc4c78d3496046c89e556caa9c32ba3abbbceb2fd`
- Supplement02: `57cb63ea4678380ef70ab522057207a9582bce28a80de8327d79419683c3480e`
- Supplement03: `ad3915efdcc09bcd09f245ee9200b02eca6d65d532b7f85a493b1b6d7049e9af`

## 33. Numeric P31 policy evidence design

The selection freezes policy evidence only. The formal/runtime classifier remains unimplemented.

- Classification uses the complete sorted numeric P31 key; labels never drive the decision.
- A blocking type QID has priority over every other disposition.
- Informational applies only when the complete key exactly matches the frozen allowlist.
- Partial matching and ignoring an additional QID are forbidden.
- An unknown P31 QID, API/SPARQL projection difference, or key absent from the allowlist defaults to manual review.
- Institution/building, museum/historic-building, castle/palace/museum/complex, municipality-parent, and venue-identity boundaries remain manual-review concerns.

Frozen evidence counts:

| Field | Count |
|---|---:|
| Known primary type QIDs with stored labels | 39 |
| Informational exact keys | 16 |
| Manual-review exact keys | 12 |
| Blocking exact keys observed among primaries | 0 |
| Unresolved primary type QIDs | 0 |
| Primary candidates classified informational by numeric key | 18 |
| Primary candidates classified manual-review by numeric key | 12 |
| Primary candidates classified blocking by numeric key | 0 |

The frozen blocking QID set covers exact numeric identifiers for country, city, settlement, district, region, metropolitan area, administrative territorial entity, protected area, nature reserve, mountain, island, lake, and broad historical region. None occurs in a selected primary P31 key.

## 34. Offline validation and current readiness

- `node --check`: pass.
- Self-test: 126 / 126 fixtures pass, including all 20 selection-specific fixtures.
- `--freeze-selection`: pass; `calledWikidata = false`.
- `--analyze-selection`: pass; `calledWikidata = false`.
- Rebuilt selection bytes exactly match the stored file.
- `git diff --check`: pass before the freeze.
- Primary QID uniqueness, backup QID uniqueness, cross-set disjointness, raw traceability, P31 completeness, protected Pilot/Country/City QID separation, and deterministic ordering all pass.

The frozen set now satisfies the candidate-selection prerequisite for a later formal POI implementation turn. It does not publish POIs, create formal provenance, conflicts, or review queues, or make Planner/frontend behavior available.
