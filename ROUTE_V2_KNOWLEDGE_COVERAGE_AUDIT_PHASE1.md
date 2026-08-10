# Route Generation V2 Knowledge Coverage Audit — Phase 1

## 1. Scope and method

This audit is read-only. It uses the current published Knowledge Entity Layer loader, an isolated copy of the Accepted repository, the strict Feed repository path, the legacy Evidence store, and the promoted V2 Evidence seed.

The audited chain is:

`Search Intent → Entity resolution → Planner / Accepted fallback → strict displayable route → Evidence association`

No Knowledge, Cache, Accepted, route, or Evidence asset was modified. Search probes used temporary storage, disabled external requests, and deleted their temporary runtime files after execution.

For this report, “fully covered” means all of the following are present:

1. Country Entity;
2. at least two useful City Entities;
3. three POIs for every included City;
4. a user-visible route result;
5. reusable transport and seasonal Evidence sufficient to support the relevant hard claims.

This definition deliberately does not treat a generic fallback route or an unlinked legacy evidence item as complete coverage.

## 2. Current coverage totals

| Layer | Current total | Audit finding |
| --- | ---: | --- |
| Countries | 50 | 13 have City Entities; 37 have no City Entity |
| Cities | 25 | All 25 have POIs |
| POIs | 75 | Exactly 3 POIs per City |
| Total Knowledge Entities | 150 | Parent references are valid |
| Accepted routes | 5,500 | 4,659 single-country; 841 cross-country |
| Accepted routes marked media-ready | 5,425 | Repository metadata, not the same as strict Feed eligibility |
| Strict displayable Feed routes | 851 | 494 single-country; 357 cross-country |

Only 32 of the 50 Country Entities currently have at least one strict displayable route. Eighteen have no strict displayable route. China is the only Country Entity with neither an Accepted route nor a City Entity; it is also subject to the existing product-level China block and is not treated as a Knowledge Expansion Batch 01 target.

## 3. Evidence coverage

### 3.1 Legacy route evidence

The legacy Evidence store contains 2,865 verified items:

| Evidence type | Count |
| --- | ---: |
| place-entity | 402 |
| theme-fit | 563 |
| destination-season | 504 |
| duration | 76 |
| route-cover-candidate | 67 |
| destination-image | 19 |
| transport-mode | 97 |
| transport-connection | 319 |
| destination-level | 295 |
| containment | 295 |
| region-cluster | 112 |
| route-network | 24 |
| segment-metric | 92 |

Source distribution:

- Wikivoyage: 2,550
- web-search: 315

These records reference 71 distinct source route IDs. Only 67 of 5,500 Accepted routes can be matched to them by route/source identity. Within the strict 851-route Feed, only 25 routes have such a match: 2.94%.

This means the 2,865 figure must not be interpreted as “2,865 routes are verified.”

### 3.2 Promoted V2 public evidence

The promoted V2 Evidence seed contains 14 records, all for Japan:

- 8 directed RouteLegEvidence records;
- 6 February SeasonEvidence records;
- 0 fabricated “best month” conclusions;
- transport durations are present only where an official source supports them;
- season records describe hard winter risks and keep suitability unknown.

The current seed covers selected links or seasonal risks around Tokyo, Kyoto, Osaka, Nara, Kanazawa, Matsumoto, and Takayama. Some of those destinations are still anchor identities rather than published City Entities.

There is no default `.route-v2-local-evidence` runtime directory in the repository, and none was created during this audit.

### 3.3 Accepted/V2 association

Current Accepted routes contain:

- EvidenceBundle IDs: 0
- V2 Evidence status fields: 0
- published Route Generation V2 records: 0

This is consistent with the publication hard gate: V2 work remains separated from the legacy Accepted repository. It also means no popular destination can yet be described as fully covered end to end.

## 4. Coverage classification

### Fully covered

None under the end-to-end definition above.

Japan is the nearest to full coverage, but only two City Entities are published and the public V2 Evidence seed covers a limited set of route legs and February risks.

### Country exists, City missing

Globally: 37 of 50 Country Entities.

Among the requested popular destinations:

- Thailand
- Switzerland
- New Zealand
- Australia

Iceland is a more severe variant: Search and Accepted routes know Iceland, but Iceland has no published Country Entity or City Entity.

### City exists, POI missing

None in the published Entity Layer. Every one of the 25 City Entities has exactly three POIs.

However, many Accepted route destination names are not published City Entities at all. Examples include Milan, Naples, Bordeaux, Lucerne, Interlaken, Queenstown, and many Japanese regional stops. These are missing City coverage rather than City-without-POI coverage.

### Route exists, Evidence insufficient

All eleven audited popular destinations fall into this category.

Legacy evidence is sparse or unlinked, and promoted public V2 evidence exists only for Japan. South Korea, Iceland, Turkey, and New Zealand have zero legacy evidence items under their country codes. Their current route results therefore must not be presented as evidence-verified.

### Search understands, but reliable route generation is unavailable

All eleven country queries were parsed successfully and returned at least one isolated Search result. There was no hard-empty result in this selected sample.

The important distinction is reliability:

- New Zealand and Australia have zero strict displayable Feed routes, despite having 23 and 27 stored Accepted routes.
- South Korea, Thailand, Switzerland, New Zealand, and Australia returned generic “regional scenic area / historic district / gateway city” fallback records in the seven-day probe.
- Iceland returned meaningful existing routes, but does so through the static Search/Accepted layer without a Country or City Entity foundation.

These cases are technically non-empty, but they are not yet reliable Entity-backed route generation.

## 5. Popular destination audit

Per-country route counts are non-exclusive because a cross-country route contributes to every country it contains.

| Destination | Entity coverage | Stored / strict routes | Legacy evidence / strict linked routes | Public V2 evidence | Isolated seven-day Search | Priority |
| --- | --- | ---: | ---: | --- | --- | --- |
| Japan | Country; Tokyo and Kyoto; 6 POIs | 97 / 32 | 62 / 1 | 8 legs + 6 season records, partial | 1 Japan-only seven-day route | P1 |
| South Korea | Country; Seoul and Busan; 6 POIs | 23 / 6 | 0 / 0 | none | 5 results, but generic regional placeholders appeared | P0 |
| Thailand | Country only | 33 / 26 | 33 / 3 | none | 1 generic regional route | P0 |
| Italy | Country; Rome and Florence; 6 POIs | 31 / 26 | 9 / 1 | none | 1 Entity-backed city route | P1 |
| France | Country; Paris and Lyon; 6 POIs | 55 / 43 | 39 / 2 | none | 3 routes; only part of destination breadth is Entity-backed | P1 |
| Spain | Country; Madrid and Barcelona; 6 POIs | 31 / 11 | 209 / 5 | none | 3 routes; mixed Entity-backed and generic coverage | P1 |
| Switzerland | Country only | 52 / 25 | 6 / 1 | none | 3 generic regional routes | P0 |
| Iceland | No Country/City/POI Entity | 74 / 8 | 0 / 0 | none | 6 meaningful legacy routes; no Entity foundation | P0 |
| Turkey | Country; Istanbul and Ankara; 6 POIs | 64 / 18 | 0 / 0 | none | 6 meaningful legacy routes | P1 |
| New Zealand | Country only | 23 / 0 | 0 / 0 | none | 2 generic regional routes; no strict Feed route | P0 |
| Australia | Country only | 27 / 0 | 155 / 0 | none | 6 generic regional routes; no strict Feed route | P0 |

All probes preserved the requested country and seven-day duration. External requests were zero.

## 6. Priority model

### P0 — high-probability searches without reliable grounded results

1. Iceland: Search/Accepted support exists but the Entity Layer starts at zero.
2. New Zealand: no Cities, no POIs, no strict displayable route, and no country evidence.
3. Australia: no Cities or POIs and no strict displayable route.
4. Thailand: routes exist, but there are no City or POI entities.
5. Switzerland: routes exist, but there are no City or POI entities.
6. South Korea: core City/POI entities exist, but Evidence is zero and generic fallback records still dominate some searches.

### P1 — useful foundation exists but breadth or evidence is materially incomplete

1. Japan: strongest V2 evidence foundation, but only Tokyo/Kyoto are published City Entities.
2. Italy: Rome/Florence are covered; Milan, Venice, Naples, Bologna and other common route stops are not.
3. France: Paris/Lyon are covered; major route destinations remain outside the Entity Layer.
4. Spain: Madrid/Barcelona are covered; evidence is mostly legacy and only five strict routes are linked.
5. Turkey: Istanbul/Ankara are covered, but public V2 transport and season evidence are absent.

### P2 — long-term breadth

- Remaining Country Entities without Cities;
- secondary cities and natural areas;
- POI depth beyond three canonical landmarks;
- bidirectional transport evidence beyond the main gateway pair;
- hard seasonal risk coverage across additional months;
- Natural Area / Region / Destination entity types after the City/POI layer is stable.

## 7. Recommended Knowledge Expansion Batch 01

Batch 01 should remain bounded:

- 1 new Country Entity: Iceland;
- 10 new City Entities across five structurally incomplete countries;
- 30 POIs, exactly three per new City;
- 12 directed core transport legs, including South Korea;
- up to 24 city-month season records, promoted only when official hard facts exist.

Recommended Entity scope:

| Country | Proposed Cities | Three POIs per City |
| --- | --- | --- |
| Iceland | Reykjavík; Vík í Mýrdal | Hallgrímskirkja, Harpa, National Museum of Iceland; Reynisfjara, Dyrhólaey, Vík Church |
| Thailand | Bangkok; Chiang Mai | Grand Palace, Wat Arun, Wat Pho; Wat Phra Singh, Wat Chedi Luang, Wat Phra That Doi Suthep |
| Switzerland | Zürich; Lucerne | Swiss National Museum, Grossmünster, Kunsthaus Zürich; Chapel Bridge, Lion Monument, Swiss Museum of Transport |
| New Zealand | Auckland; Queenstown | Auckland War Memorial Museum, Sky Tower, Auckland Art Gallery; Skyline Queenstown, Queenstown Gardens, Kiwi Park |
| Australia | Sydney; Melbourne | Sydney Opera House, Sydney Harbour Bridge, Royal Botanic Garden Sydney; National Gallery of Victoria, Royal Exhibition Building, Melbourne Museum |

The names above are selection targets, not authoritative identifiers. Wikidata IDs, coordinates, aliases, administrative type, and parent relationships must be verified through the existing raw snapshot and provenance process before publication.

Core directed Evidence pairs:

- Reykjavík ↔ Vík í Mýrdal
- Bangkok ↔ Chiang Mai
- Zürich ↔ Lucerne
- Auckland ↔ Queenstown
- Sydney ↔ Melbourne
- Seoul ↔ Busan

Season Evidence should cover two operationally important months per City, with risk-only semantics:

- Iceland: January and July
- Thailand: April and September
- Switzerland: January and July
- New Zealand: July and December
- Australia: January and July
- South Korea: January and July

If an official source does not establish a hard transport, weather, closure, or buffer fact, the item must remain pending or needs-review. The batch must not infer “best month” suitability.

Expected Entity totals after this bounded batch:

- Countries: 51
- Cities: 35
- POIs: 105
- Total entities: 191

This batch does not promise Feed publication. Route publication remains gated by validation, review, evidence association, and media readiness.

## 8. Conclusion

The Knowledge Layer is structurally consistent but shallow: every published City has POIs, while most countries have no City at all. The highest-value next step is a bounded Entity and Evidence batch focused on Iceland, Thailand, Switzerland, New Zealand, Australia, plus a South Korea evidence patch.

The project is ready to plan this expansion, but implementation should not start in the current mixed working tree until the previous Production Readiness and Search Intent changes are separated and reviewed.
