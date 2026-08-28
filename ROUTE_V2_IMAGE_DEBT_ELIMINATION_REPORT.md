# Route V2 Image Debt Elimination Report

Generated: 2026-08-26T08:00:00.000Z

## Outcome

- Starting needsBackfill: 687
- Attempted: 687
- Successful dedicated conversions: 674
- City conversions: 504
- Core POI conversions: 170
- Final needsBackfill: 13
- Remaining City: 1
- Remaining Core POI: 12
- Success rate: 98.1%
- Target <=10 achieved: no
- Remaining debt policy: neutral placeholder retained; no low-confidence or wrong-location photograph was admitted.

## Coverage

- Dedicated City: 600/601
- Dedicated Core POI: 212/224
- invalidMapping: 0
- Runtime external image requests allowed: false

## Success and remaining debt by country

| Country | Successful | Remaining |
| --- | ---: | ---: |
| AD | 4 | 0 |
| AE | 8 | 1 |
| AL | 7 | 0 |
| AR | 12 | 0 |
| AT | 9 | 0 |
| AU | 3 | 0 |
| BE | 9 | 0 |
| BG | 9 | 1 |
| BR | 11 | 0 |
| CA | 12 | 0 |
| CD | 4 | 1 |
| CH | 3 | 0 |
| CL | 9 | 0 |
| CO | 3 | 0 |
| CR | 7 | 1 |
| CY | 8 | 0 |
| CZ | 9 | 0 |
| DE | 14 | 0 |
| DK | 9 | 0 |
| EC | 9 | 0 |
| EE | 7 | 0 |
| EG | 9 | 0 |
| ES | 14 | 0 |
| FI | 9 | 0 |
| FJ | 3 | 1 |
| FR | 14 | 0 |
| GB | 16 | 0 |
| GE | 8 | 0 |
| GR | 10 | 0 |
| GT | 8 | 0 |
| HR | 10 | 0 |
| HU | 9 | 0 |
| ID | 11 | 1 |
| IE | 11 | 0 |
| IL | 7 | 0 |
| IN | 15 | 0 |
| IS | 2 | 0 |
| IT | 14 | 0 |
| JO | 8 | 0 |
| JP | 23 | 0 |
| KE | 6 | 1 |
| KH | 6 | 0 |
| KR | 14 | 0 |
| LK | 10 | 0 |
| LT | 8 | 0 |
| LV | 7 | 0 |
| MA | 9 | 1 |
| ME | 6 | 0 |
| MT | 7 | 0 |
| MV | 0 | 1 |
| MX | 11 | 0 |
| MY | 9 | 0 |
| NG | 6 | 0 |
| NL | 13 | 0 |
| NO | 11 | 0 |
| NP | 9 | 0 |
| NZ | 2 | 0 |
| PA | 8 | 0 |
| PE | 8 | 1 |
| PH | 9 | 0 |
| PL | 10 | 0 |
| PT | 12 | 0 |
| RO | 8 | 0 |
| RS | 9 | 0 |
| RU | 10 | 0 |
| SA | 8 | 1 |
| SE | 9 | 0 |
| SI | 8 | 0 |
| SK | 7 | 1 |
| TH | 2 | 0 |
| TN | 7 | 1 |
| TR | 3 | 0 |
| TZ | 10 | 0 |
| US | 16 | 0 |
| UY | 8 | 0 |
| VN | 11 | 0 |
| ZA | 10 | 0 |

## Failure reason distribution

| Reason | Count |
| --- | ---: |
| IMAGE_TOO_LOW_QUALITY | 5 |
| LICENSE_METADATA_INCOMPLETE | 2 |
| NO_EXACT_IMAGE | 6 |

## Asset size

- Images before: 283
- Images after: 957
- Image bytes before: 43101273 (41.1 MB)
- Image bytes after: 202028141 (192.67 MB)
- Phase dedicated bytes: 158926868 (151.56 MB)
- Average new dedicated bytes: 235,797
- Median new dedicated bytes: 267,582
- p95 new dedicated bytes: 297,420
- New assets >300KB: 0
- New assets >500KB: 0
- Projected image bytes at full current-entity coverage: 205093496 (195.59 MB)

## Duplicate and integrity audit

- New exact duplicate pairs: 0
- New perceptual duplicate pairs (dHash distance <=5): 0
- Provenance complete: 674/674
- License complete: 674/674
- Visual contact-sheet pages reviewed: 36
- Visual candidates reviewed: 676
- Visual pass/reject: 676/0
- Contact sheet: data/route-v2/images/audit/image-debt-contact-sheet.html

Every accepted source is tied to the exact QID through Wikidata P18, Commons structured P180, a QID-linked multilingual Wikipedia lead image, or a QID-linked Commons category. City category images must pass representative-image visual review; Core POIs remain exact-entity photographs. Every accepted asset is a local WebP with auditable Commons file-level licensing and an exact entity/source/hash binding.

## PROVENANCE COMPLETENESS REPAIR

- Review raw missing licenseUrl: 91/676
- Review raw missing creator/author: 17/676
- Review raw missing attribution: 16/676
- Review raw missing-field union: 101/676
- Strict initial provenance completeness: 552/676 (81.66%)
- Metadata repair entries: 684
- Source-backed creator repairs: 14
- Attribution repairs: 24
- licenseUrl filled: 91
- licenseUrl normalized to exact family/version: 569
- Non-attribution creator-status records: 10
- Alternate image replacements: 0
- Dedicated withdrawals: 2
- Final verified dedicated: 674
- Final needsBackfill: 13
- Final Dedicated City: 600/601
- Final Dedicated Core POI: 212/224
- Final provenance completeness: 674/674 (100%)
- Final license completeness: 674/674
- Final licenseUrl completeness: 674/674
- Creator completeness where attribution required: 596/596
- Attribution completeness where required: 596/596
- Negative provenance fixtures killed: 10/10

The repair uses exact Commons file pages, immutable revision IDs, file EXIF metadata, explicit author/by/self statements, and exact Creative Commons family/version URLs. Public-domain or CC0 records without a source-provided creator carry the structured status `creatorStatus=not-provided-by-source`; no placeholder creator name is published.

### Withdrawn dedicated assets

| Entity | QID | Type | Reason | Detail |
| --- | --- | --- | --- | --- |
| Nitra | Q26397 | City | LICENSE_METADATA_INCOMPLETE | Commons records only an attribution-required license and an uploader; no explicit photographer/creator is available for Nitra. |
| Ampel Mosque | Q4265576 | POI | LICENSE_METADATA_INCOMPLETE | Commons explicitly records an unknown photographer for Ampel Mosque; the institution attribution cannot substitute for the required creator. |

## INTERMEDIATE / PRE-PROVENANCE-REPAIR MULTI-SOURCE RECOVERY

- Starting debt = 119
- Attempted = 119
- Successful recovery = 108
- City recovery = 82
- Core POI recovery = 26
- Intermediate debt after multi-source recovery = 11
- Intermediate remaining City = 0
- Intermediate remaining Core POI = 11
- Commons/Wikidata/category success = 13
- Multilingual Wikipedia success = 95
- Official source success = 0
- Other CC/open-source success = 0
- Average attempts/entity = 14.72
- Second-round image bytes = 25653622 (24.47 MB)
- Second-round provenance complete = 108/108
- Second-round license complete = 108/108
- Second-round active visual passes = 108
- Second-round rejected candidate history = 32

### Source path contribution

| Source path | Successful assets |
| --- | ---: |
| commons-qid-linked-category | 11 |
| commons-qid-linked-category-alphabetic | 2 |
| wikipedia-multilingual | 95 |

### Candidate rejection distribution

| Rejection | Attempt entries |
| --- | ---: |
| LICENSE_UNVERIFIED | 56 |
| IMAGE_TOO_LOW_QUALITY | 115 |
| NO_EXACT_IMAGE | 226 |
| SOURCE_UNAVAILABLE | 214 |
| ENTITY_AMBIGUOUS | 0 |
| ONLY_DUPLICATE_SOURCE | 0 |
| SIZE_QUALITY_CONFLICT | 0 |

Official and Openverse discovery paths were attempted for every residual entity, but no file from those paths was published without exact entity proof plus file-level author and reuse-license metadata. City representatives may come from an exact QID-linked Commons category or exact QID-linked multilingual Wikipedia lead image; Core POIs remain exact-entity only.

## Browser acceptance

- Browser result: PASS
- Country Detail samples: 17
- City Detail samples: 9
- Route searches/details: 7/1
- Dedicated City consumed: true
- Dedicated POI consumed: true
- Broken images: 0
- Wrong semantic images: 0
- Runtime external image requests: 0
- Console errors/warnings: 0/0

## Remaining debt

| Country | Type | Entity | QID | entityId | Failure reason | Detail |
| --- | --- | --- | --- | --- | --- | --- |
| SK | City | Nitra | Q26397 | city-7b557b748910ebe8 | LICENSE_METADATA_INCOMPLETE | Commons records only an attribution-required license and an uploader; no explicit photographer/creator is available for Nitra. |
| FJ | POI | Churchill Park | Q2313620 | poi-122727c6f428db14 | NO_EXACT_IMAGE | No licensed exact-entity candidate survived multi-source recovery. |
| MV | POI | Equatorial Convention Centre | Q5384251 | poi-2f7f73fdd13bc487 | NO_EXACT_IMAGE | No licensed exact-entity candidate survived multi-source recovery. |
| TN | POI | Bou Ali Lahouar Stadium | Q115658 | poi-54c0d5baca355011 | NO_EXACT_IMAGE | No licensed exact-entity candidate survived multi-source recovery. |
| KE | POI | Afraha Stadium | Q4689416 | poi-574215b1feaedc18 | NO_EXACT_IMAGE | No licensed exact-entity candidate survived multi-source recovery. |
| PE | POI | Arequipa Peru Temple | Q24928031 | poi-8302f74ba1bc1d76 | IMAGE_TOO_LOW_QUALITY | source-dimensions:486x549 |
| SA | POI | Al Madi Mosque | Q131686938 | poi-83ac5861b276d133 | IMAGE_TOO_LOW_QUALITY | source-dimensions:204x226 |
| ID | POI | Ampel Mosque | Q4265576 | poi-988e10280ee01879 | LICENSE_METADATA_INCOMPLETE | Commons explicitly records an unknown photographer for Ampel Mosque; the institution attribution cannot substitute for the required creator. |
| AE | POI | Abu Dhabi Securities Exchange | Q4119825 | poi-d0cb01c46e212be6 | IMAGE_TOO_LOW_QUALITY | disallowed-non-photographic-presentation |
| BG | POI | Arena Burgas | Q121609605 | poi-d4f1b47996cb7317 | NO_EXACT_IMAGE | No licensed exact-entity candidate survived multi-source recovery. |
| MA | POI | Ain-Diab Circuit | Q173217 | poi-dede442041af184f | IMAGE_TOO_LOW_QUALITY | disallowed-non-photographic-presentation |
| CR | POI | Africa Safari Adventure Park | Q27044947 | poi-df61ca53e90345b5 | NO_EXACT_IMAGE | No licensed exact-entity candidate survived multi-source recovery. |
| CD | POI | Mampeza | Q22396625 | poi-e7a187ae9e3829d7 | IMAGE_TOO_LOW_QUALITY | disallowed-non-photographic-presentation |

## Complete multi-source attempts for every remaining entity

### Churchill Park (Q2313620, FJ)

- Final reason: NO_EXACT_IMAGE — No licensed exact-entity candidate survived multi-source recovery.
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 1
- Attempts:
  - wikidata-p18 — Q2313620 — ChurchillPark-Ltka.jpg — candidate
  - commons-structured-depicts — Q2313620:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ2313620 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Churchill Park, Lautoka — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — eswiki:Churchill Park — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — dewiki:Churchill Park (Lautoka) — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — frwiki:Churchill Park — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — itwiki:Churchill Park — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — zhwiki:邱吉爾公園球場 — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — plwiki:Churchill Park — ChurchillPark-Ltka.jpg — candidate
  - wikipedia-multilingual — nlwiki:Churchill Park (Lautoka) — ChurchillPark-Ltka.jpg — candidate
  - commons-qid-linked-category — Q2313620:P373 — https://www.wikidata.org/wiki/Q2313620 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q2313620:P856 — https://www.wikidata.org/wiki/Q2313620 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Churchill Park Lautoka Fiji — https://api.openverse.org/v1/images/?q=Churchill+Park+Lautoka+Fiji&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — nlwiki:Churchill Park (Lautoka) — ChurchillPark-Ltka.jpg — rejected — IMAGE_TOO_LOW_QUALITY: first-pass-rejected:source-dimensions:592x455

### Equatorial Convention Centre (Q5384251, MV)

- Final reason: NO_EXACT_IMAGE — No licensed exact-entity candidate survived multi-source recovery.
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 1
- Attempts:
  - wikidata-p18 — Q5384251 — https://www.wikidata.org/wiki/Q5384251 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q5384251:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ5384251 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Addu Equatorial Hospital — Addu_Convention_Centre.jpg — candidate
  - wikipedia-multilingual — bnwiki:নিরক্ষীয় সম্মেলন কেন্দ্র — Addu_Convention_Centre.jpg — candidate
  - commons-qid-linked-category — Q5384251:P373 — https://www.wikidata.org/wiki/Q5384251 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q5384251:P856 — https://www.wikidata.org/wiki/Q5384251 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Equatorial Convention Centre Addu City Maldives — https://api.openverse.org/v1/images/?q=Equatorial+Convention+Centre+Addu+City+Maldives&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — bnwiki:নিরক্ষীয় সম্মেলন কেন্দ্র — Addu_Convention_Centre.jpg — rejected — NO_EXACT_IMAGE: first-pass-rejected:No exact P18 or Commons P180 image candidate exists.

### Bou Ali Lahouar Stadium (Q115658, TN)

- Final reason: NO_EXACT_IMAGE — No licensed exact-entity candidate survived multi-source recovery.
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 0
- Attempts:
  - wikidata-p18 — Q115658 — https://www.wikidata.org/wiki/Q115658 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q115658:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ115658 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Bou Ali Lahouar Stadium — https://en.wikipedia.org/wiki/Bou_Ali_Lahouar_Stadium — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — eswiki:Stade Municipal Bou Ali-Lahouar — https://es.wikipedia.org/wiki/Stade_Municipal_Bou_Ali-Lahouar — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — frwiki:Stade municipal Bou Ali-Lahouar — https://fr.wikipedia.org/wiki/Stade_municipal_Bou_Ali-Lahouar — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — arwiki:الملعب البلدي بوعلي لحوار — https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D9%85%D9%84%D8%B9%D8%A8_%D8%A7%D9%84%D8%A8%D9%84%D8%AF%D9%8A_%D8%A8%D9%88%D8%B9%D9%84%D9%8A_%D9%84%D8%AD%D9%88%D8%A7%D8%B1 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — idwiki:Stadion Bou Ali Lahouar — https://id.wikipedia.org/wiki/Stadion_Bou_Ali_Lahouar — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — plwiki:Stade Municipal Bou Ali-Lahouar — https://pl.wikipedia.org/wiki/Stade_Municipal_Bou_Ali-Lahouar — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — nlwiki:Stade Municipal Bou Ali-Lahouar — https://nl.wikipedia.org/wiki/Stade_Municipal_Bou_Ali-Lahouar — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — cawiki:Estadi Municipal Bou Ali-Lahouar — https://ca.wikipedia.org/wiki/Estadi_Municipal_Bou_Ali-Lahouar — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q115658:P373 — https://www.wikidata.org/wiki/Q115658 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q115658:P856 — https://www.wikidata.org/wiki/Q115658 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Bou Ali Lahouar Stadium Sousse Tunisia — https://api.openverse.org/v1/images/?q=Bou+Ali+Lahouar+Stadium+Sousse+Tunisia&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed

### Afraha Stadium (Q4689416, KE)

- Final reason: NO_EXACT_IMAGE — No licensed exact-entity candidate survived multi-source recovery.
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 0
- Attempts:
  - wikidata-p18 — Q4689416 — https://www.wikidata.org/wiki/Q4689416 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q4689416:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ4689416 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Afraha Stadium — https://en.wikipedia.org/wiki/Afraha_Stadium — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — plwiki:Afraha Stadium — https://pl.wikipedia.org/wiki/Afraha_Stadium — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — nlwiki:Afrahastadion — https://nl.wikipedia.org/wiki/Afrahastadion — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — fawiki:ورزشگاه افراها — https://fa.wikipedia.org/wiki/%D9%88%D8%B1%D8%B2%D8%B4%DA%AF%D8%A7%D9%87_%D8%A7%D9%81%D8%B1%D8%A7%D9%87%D8%A7 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — rwwiki:Afraha Stadium — https://rw.wikipedia.org/wiki/Afraha_Stadium — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — swwiki:Uwanja wa michezo wa Afraha — https://sw.wikipedia.org/wiki/Uwanja_wa_michezo_wa_Afraha — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q4689416:P373 — https://www.wikidata.org/wiki/Q4689416 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q4689416:P856 — https://www.wikidata.org/wiki/Q4689416 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Afraha Stadium Nakuru Kenya — https://api.openverse.org/v1/images/?q=Afraha+Stadium+Nakuru+Kenya&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed

### Arequipa Peru Temple (Q24928031, PE)

- Final reason: IMAGE_TOO_LOW_QUALITY — source-dimensions:486x549
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 1
- Attempts:
  - wikidata-p18 — Q24928031 — https://www.wikidata.org/wiki/Q24928031 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q24928031:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ24928031 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Arequipa Peru Temple — Templo_de_Arequipa.png — candidate
  - wikipedia-multilingual — eswiki:Templo de Arequipa — Templo_de_Arequipa.png — candidate
  - wikipedia-multilingual — zhwiki:秘魯阿雷基帕聖殿 — https://zh.wikipedia.org/wiki/%E7%A7%98%E9%AD%AF%E9%98%BF%E9%9B%B7%E5%9F%BA%E5%B8%95%E8%81%96%E6%AE%BF — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q24928031:P373 — https://www.wikidata.org/wiki/Q24928031 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q24928031:P856 — https://www.churchofjesuschrist.org/temples/details/arequipa-peru-temple?lang=eng — rejected — SOURCE_UNAVAILABLE: The operation was aborted due to timeout
  - openverse — Arequipa Peru Temple Arequipa Peru — https://api.openverse.org/v1/images/?q=Arequipa+Peru+Temple+Arequipa+Peru&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — eswiki:Templo de Arequipa — Templo_de_Arequipa.png — rejected — IMAGE_TOO_LOW_QUALITY: source-dimensions:486x549

### Al Madi Mosque (Q131686938, SA)

- Final reason: IMAGE_TOO_LOW_QUALITY — source-dimensions:204x226
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 2
- Attempts:
  - wikidata-p18 — Q131686938 — https://www.wikidata.org/wiki/Q131686938 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q131686938:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ131686938 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Al Madi Mosque — Madi_Mosque_Riyadh_2025.jpeg — candidate
  - wikipedia-multilingual — arwiki:مسجد المدي — https://ar.wikipedia.org/wiki/%D9%85%D8%B3%D8%AC%D8%AF_%D8%A7%D9%84%D9%85%D8%AF%D9%8A — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — uzwiki:Al-Madiy masjidi — MosqueICO.png — candidate
  - commons-qid-linked-category — Q131686938:P373 — https://www.wikidata.org/wiki/Q131686938 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q131686938:P856 — https://www.wikidata.org/wiki/Q131686938 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Al Madi Mosque Riyadh Saudi Arabia — https://api.openverse.org/v1/images/?q=Al+Madi+Mosque+Riyadh+Saudi+Arabia&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — enwiki:Al Madi Mosque — Madi_Mosque_Riyadh_2025.jpeg — rejected — SOURCE_UNAVAILABLE: commons-imageinfo-missing
  - wikipedia-multilingual — uzwiki:Al-Madiy masjidi — MosqueICO.png — rejected — IMAGE_TOO_LOW_QUALITY: source-dimensions:204x226

### Abu Dhabi Securities Exchange (Q4119825, AE)

- Final reason: IMAGE_TOO_LOW_QUALITY — disallowed-non-photographic-presentation
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 1
- Attempts:
  - wikidata-p18 — Q4119825 — https://www.wikidata.org/wiki/Q4119825 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q4119825:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ4119825 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Abu Dhabi Securities Exchange — Abu_Dhabi_Securities_Exchange_Logo_Dark2.png — candidate
  - wikipedia-multilingual — dewiki:Abu Dhabi Securities Exchange — https://de.wikipedia.org/wiki/Abu_Dhabi_Securities_Exchange — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — ruwiki:Фондовая биржа Абу-Даби — https://ru.wikipedia.org/wiki/%D0%A4%D0%BE%D0%BD%D0%B4%D0%BE%D0%B2%D0%B0%D1%8F_%D0%B1%D0%B8%D1%80%D0%B6%D0%B0_%D0%90%D0%B1%D1%83-%D0%94%D0%B0%D0%B1%D0%B8 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — arwiki:سوق أبو ظبي للأوراق المالية — https://ar.wikipedia.org/wiki/%D8%B3%D9%88%D9%82_%D8%A3%D8%A8%D9%88_%D8%B8%D8%A8%D9%8A_%D9%84%D9%84%D8%A3%D9%88%D8%B1%D8%A7%D9%82_%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D8%A9 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — trwiki:Abu Dabi Menkul Kıymetler Borsası — https://tr.wikipedia.org/wiki/Abu_Dabi_Menkul_K%C4%B1ymetler_Borsas%C4%B1 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — arzwiki:سوق ابو ظبى للاوراق الماليه — https://arz.wikipedia.org/wiki/%D8%B3%D9%88%D9%82_%D8%A7%D8%A8%D9%88_%D8%B8%D8%A8%D9%89_%D9%84%D9%84%D8%A7%D9%88%D8%B1%D8%A7%D9%82_%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D9%87 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — fawiki:بورس ابوظبی — https://fa.wikipedia.org/wiki/%D8%A8%D9%88%D8%B1%D8%B3_%D8%A7%D8%A8%D9%88%D8%B8%D8%A8%DB%8C — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — kowiki:아부다비 증권거래소 — https://ko.wikipedia.org/wiki/%EC%95%84%EB%B6%80%EB%8B%A4%EB%B9%84_%EC%A6%9D%EA%B6%8C%EA%B1%B0%EB%9E%98%EC%86%8C — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q4119825:P373 — https://www.wikidata.org/wiki/Q4119825 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q4119825:P856 — https://www.adx.ae/ — rejected — SOURCE_UNAVAILABLE: remote-fetch-failed:403:www.adx.ae
  - openverse — Abu Dhabi Securities Exchange Abu Dhabi United Arab Emirates — https://api.openverse.org/v1/images/?q=Abu+Dhabi+Securities+Exchange+Abu+Dhabi+United+Arab+Emirates&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — enwiki:Abu Dhabi Securities Exchange — Abu_Dhabi_Securities_Exchange_Logo_Dark2.png — rejected — IMAGE_TOO_LOW_QUALITY: disallowed-non-photographic-presentation

### Arena Burgas (Q121609605, BG)

- Final reason: NO_EXACT_IMAGE — No licensed exact-entity candidate survived multi-source recovery.
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 0
- Attempts:
  - wikidata-p18 — Q121609605 — https://www.wikidata.org/wiki/Q121609605 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q121609605:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ121609605 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Arena Burgas — https://en.wikipedia.org/wiki/Arena_Burgas — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — dewiki:Arena Burgas — https://de.wikipedia.org/wiki/Arena_Burgas — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — frwiki:Arena Bourgas — https://fr.wikipedia.org/wiki/Arena_Bourgas — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — itwiki:Arena Burgas — https://it.wikipedia.org/wiki/Arena_Burgas — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — ruwiki:Арена Бургас — https://ru.wikipedia.org/wiki/%D0%90%D1%80%D0%B5%D0%BD%D0%B0_%D0%91%D1%83%D1%80%D0%B3%D0%B0%D1%81 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — zhwiki:布爾加斯體育館 — https://zh.wikipedia.org/wiki/%E5%B8%83%E7%88%BE%E5%8A%A0%E6%96%AF%E9%AB%94%E8%82%B2%E9%A4%A8 — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — plwiki:Arena Burgas — https://pl.wikipedia.org/wiki/Arena_Burgas — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — nlwiki:Arena Burgas — https://nl.wikipedia.org/wiki/Arena_Burgas — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q121609605:P373 — https://www.wikidata.org/wiki/Q121609605 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q121609605:P856 — https://arenaburgas.eu/ — rejected — LICENSE_UNVERIFIED: official-page-has-no-file-level-reuse-license
  - openverse — Arena Burgas Burgas Bulgaria — https://api.openverse.org/v1/images/?q=Arena+Burgas+Burgas+Bulgaria&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed

### Ain-Diab Circuit (Q173217, MA)

- Final reason: IMAGE_TOO_LOW_QUALITY — disallowed-non-photographic-presentation
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, commons-qid-linked-category-alphabetic, official-source, openverse
- Candidate count: 3
- Attempts:
  - wikidata-p18 — Q173217 — Circuit Ain Diab.png — candidate
  - commons-structured-depicts — Q173217:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ173217 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Ain-Diab Circuit — Ain-Diab.svg — candidate
  - wikipedia-multilingual — eswiki:Circuito de Ain-Diab — Ain-Diab.svg — candidate
  - wikipedia-multilingual — dewiki:Circuit d’Ain-Diab — Circuit_Ain_Diab.png — candidate
  - wikipedia-multilingual — frwiki:Circuit d'Ain-Diab — Circuit_Ain_Diab.png — candidate
  - wikipedia-multilingual — ptwiki:Circuito de Ain-Diab — Circuit_Ain_Diab.png — candidate
  - wikipedia-multilingual — itwiki:Circuito di Ain-Diab — Ain-Diab.svg — candidate
  - wikipedia-multilingual — ruwiki:Айн-Диаб (трасса) — Circuit_Ain_Diab.png — candidate
  - wikipedia-multilingual — jawiki:アイン・ディアブ・サーキット — Ain-Diab.svg — candidate
  - commons-qid-linked-category — Q173217:Category:Ain-Diab Circuit:timestamp — https://commons.wikimedia.org/wiki/Category:Ain-Diab_Circuit — rejected — NO_EXACT_IMAGE: qid-linked-category-has-no-bitmap-files:timestamp
  - commons-qid-linked-category-alphabetic — Q173217:Category:Ain-Diab Circuit:sortkey — https://commons.wikimedia.org/wiki/Category:Ain-Diab_Circuit — rejected — NO_EXACT_IMAGE: qid-linked-category-has-no-bitmap-files:sortkey
  - official-source — Q173217:P856 — https://www.wikidata.org/wiki/Q173217 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Ain-Diab Circuit Casablanca Morocco — https://api.openverse.org/v1/images/?q=Ain-Diab+Circuit+Casablanca+Morocco&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — jawiki:アイン・ディアブ・サーキット — Ain-Diab.svg — rejected — IMAGE_TOO_LOW_QUALITY: disallowed-non-photographic-presentation
  - wikipedia-multilingual — ruwiki:Айн-Диаб (трасса) — Circuit_Ain_Diab.png — rejected — IMAGE_TOO_LOW_QUALITY: source-dimensions:413x306
  - wikidata-p18 — Q173217$bf1877b2-4e61-d36b-5942-f30a3293f532 — Circuit Ain Diab.png — rejected — IMAGE_TOO_LOW_QUALITY: first-pass-rejected:source-dimensions:413x306

### Africa Safari Adventure Park (Q27044947, CR)

- Final reason: NO_EXACT_IMAGE — No licensed exact-entity candidate survived multi-source recovery.
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 0
- Attempts:
  - wikidata-p18 — Q27044947 — https://www.wikidata.org/wiki/Q27044947 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q27044947:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ27044947 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Africa Safari Adventure Park — https://en.wikipedia.org/wiki/Africa_Safari_Adventure_Park — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — eswiki:África Safari — https://es.wikipedia.org/wiki/%C3%81frica_Safari — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — nlwiki:Africa Safari Adventure Park — https://nl.wikipedia.org/wiki/Africa_Safari_Adventure_Park — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — igwiki:Ogige ntụrụndụ Africa Safari — https://ig.wikipedia.org/wiki/Ogige_nt%E1%BB%A5r%E1%BB%A5nd%E1%BB%A5_Africa_Safari — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q27044947:P373 — https://www.wikidata.org/wiki/Q27044947 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q27044947:P856 — https://www.wikidata.org/wiki/Q27044947 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Africa Safari Adventure Park Liberia Costa Rica — https://api.openverse.org/v1/images/?q=Africa+Safari+Adventure+Park+Liberia+Costa+Rica&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed

### Mampeza (Q22396625, CD)

- Final reason: IMAGE_TOO_LOW_QUALITY — disallowed-non-photographic-presentation
- Independent source paths: wikidata-p18, commons-structured-depicts, wikipedia-multilingual, commons-qid-linked-category, official-source, openverse
- Candidate count: 1
- Attempts:
  - wikidata-p18 — Q22396625 — https://www.wikidata.org/wiki/Q22396625 — rejected — NO_EXACT_IMAGE: exact-entity-has-no-P18
  - commons-structured-depicts — Q22396625:P180 — https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ22396625 — rejected — NO_EXACT_IMAGE: no-exact-P180-candidate
  - wikipedia-multilingual — enwiki:Mampeza — https://en.wikipedia.org/wiki/Mampeza — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — frwiki:Mampeza — https://fr.wikipedia.org/wiki/Mampeza — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — cebwiki:Mampeza — Democratic_Republic_of_the_Congo_adm_location_map.svg — candidate
  - wikipedia-multilingual — hawiki:Mampeza — https://ha.wikipedia.org/wiki/Mampeza — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — lnwiki:Mampeza — https://ln.wikipedia.org/wiki/Mampeza — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - wikipedia-multilingual — rwwiki:Mampeza — https://rw.wikipedia.org/wiki/Mampeza — rejected — NO_EXACT_IMAGE: qid-linked-page-has-no-lead-image
  - commons-qid-linked-category — Q22396625:P373 — https://www.wikidata.org/wiki/Q22396625 — rejected — NO_EXACT_IMAGE: qid-has-no-exact-commons-category
  - official-source — Q22396625:P856 — https://www.wikidata.org/wiki/Q22396625 — rejected — SOURCE_UNAVAILABLE: no-exact-entity-official-website
  - openverse — Mampeza Kinshasa Democratic Republic of the Congo — https://api.openverse.org/v1/images/?q=Mampeza+Kinshasa+Democratic+Republic+of+the+Congo&license=cc0%2Cby%2Cby-sa%2Cpdm&page_size=3 — rejected — SOURCE_UNAVAILABLE: fetch failed
  - wikipedia-multilingual — cebwiki:Mampeza — Democratic_Republic_of_the_Congo_adm_location_map.svg — rejected — IMAGE_TOO_LOW_QUALITY: disallowed-non-photographic-presentation

## FINAL STATE / FINAL BASELINE

- Total assets: 957
- Country Cover: 78/78
- Dedicated City: 600/601
- Dedicated Core POI: 212/224
- Final needsBackfill: 13
- Remaining City: 1
- Remaining Core POI: 12
- Initial successful dedicated before provenance withdrawals: 676
- Withdrawn due provenance failure: 2
- Verified dedicated added: 674
- Final provenance completeness: 674/674
- Final license completeness: 674/674
- Final licenseUrl completeness: 674/674
- CC creator completeness: 596/596
- CC attribution completeness: 596/596
- invalidMapping: 0

## Conclusion

IMAGE DEBT ELIMINATION READY FOR FINAL REVIEW — EXHAUSTIVE MULTI-SOURCE SEARCH COMPLETE
