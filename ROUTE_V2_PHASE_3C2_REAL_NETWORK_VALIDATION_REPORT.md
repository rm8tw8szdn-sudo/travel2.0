# Route V2 Phase 3C-2 Real Network Validation Report

## Summary

- Date: 2026-07-14T03:55:31.738Z
- Provider: Tavily via Route V2 Provider Foundation
- Query count: 8
- Success: 8
- No result: 0
- Timeout: 0
- Rate limited: 0
- Provider error / other failure: 0
- Planner integration: not used
- EvidenceBundle Store write: not used
- Real project cache write: not used
- API key included in report: no

## Provider Configuration

- ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: true for this process only
- ROUTE_V2_EVIDENCE_ONLINE_ENABLED: true for this process only
- ROUTE_V2_TAVILY_EVIDENCE_ENABLED: true for this process only
- Tavily API key present: yes, redacted

## Query Results

### transport: Tokyo Kyoto train travel time

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 2780
- resultCount: 5
- hosts: japanrailpassnow.com, rail.ninja, abrummiehomeandabroad.com, instagram.com, reddit.com
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://www.japanrailpassnow.com/travel/how-to-travel/from-tokyo-kyoto","sourceTitle":"Tokyo To Kyoto - Japan Rail Pass Now USA","snippetLength":600,"rank":1},{"sourceUrl":"https://rail.ninja/route/tokyo-to-kyoto","sourceTitle":"Tokyo to Kyoto Trains | High-Speed Train Tickets","snippetLength":600,"rank":2},{"sourceUrl":"https://abrummiehomeandabroad.com/bullet-train-shinkansen-tokyo-and-kyoto","sourceTitle":"Biting the Bullet (Train): Riding the Shinkansen between Tokyo and Kyoto : A Brummie Home and Abroad","snippetLength":600,"rank":3}]

### transport: Kyoto Osaka train travel time

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 3060
- resultCount: 5
- hosts: rail.ninja, klook.com, rome2rio.com, insideosaka.com, reddit.com
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://rail.ninja/route/kyoto-to-osaka","sourceTitle":"Kyoto to Osaka Trains | High-Speed Train Tickets","snippetLength":600,"rank":1},{"sourceUrl":"https://www.klook.com/en-US/japan-rail/shinkansen/30-kyoto/29-osaka","sourceTitle":"Kyoto to Osaka Shinkansen Tickets & Schedule","snippetLength":159,"rank":2},{"sourceUrl":"https://www.rome2rio.com/s/Kyoto/Osaka","sourceTitle":"Kyoto to Osaka - 3 ways to travel via train, car, and taxi","snippetLength":165,"rank":3}]

### transport: Tokyo Paris train connection

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 1581
- resultCount: 5
- hosts: rail.cc, rome2rio.com, reddit.com, omio.co.uk
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://rail.cc/train/tokyo-to-paris","sourceTitle":"From Tokyo to Paris by Train from €486.00","snippetLength":147,"rank":1},{"sourceUrl":"https://www.rome2rio.com/s/Tokyo/Paris","sourceTitle":"Tokyo to Paris - 7 ways to travel via train, plane, and bus","snippetLength":160,"rank":2},{"sourceUrl":"https://www.reddit.com/r/slowtravel/comments/1noghdx/paristokyo_by_train","sourceTitle":"Paris-Tokyo by train : r/slowtravel","snippetLength":141,"rank":3}]

### seasonal: best time to visit Tokyo

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 1469
- resultCount: 5
- hosts: travel.usnews.com, airasia.com, trulytokyo.com, lonelyplanet.com, reddit.com
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://travel.usnews.com/Tokyo_Japan/When_To_Visit","sourceTitle":"Best Times to Visit Tokyo | U.S. News Travel","snippetLength":600,"rank":1},{"sourceUrl":"https://www.airasia.com/blog/japan/tokyo/best-time-to-visit-tokyo","sourceTitle":"Best Time to Visit Tokyo: Weather, Seasons & Travel Tips","snippetLength":600,"rank":2},{"sourceUrl":"https://trulytokyo.com/best-time-to-go-to-tokyo","sourceTitle":"The Best Time To Go To Tokyo","snippetLength":600,"rank":3}]

### seasonal: Kyoto cherry blossom season

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 1365
- resultCount: 5
- hosts: insidekyoto.com, travel.rakuten.com, kyoto.travel, travelyesplease.com, kyototourism.org
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://www.insidekyoto.com/when-do-cherry-blossoms-bloom-in-kyoto","sourceTitle":"When Is Cherry Blossom Season In Kyoto?","snippetLength":600,"rank":1},{"sourceUrl":"https://travel.rakuten.com/contents/usa/en-us/guide/cherry-blossom-kyoto","sourceTitle":"Best Places to see Cherry Blossoms (Sakura) in Kyoto 2026","snippetLength":161,"rank":2},{"sourceUrl":"https://kyoto.travel/en/seasonal-info/cherryblossom","sourceTitle":"Cherry Blossom Calendar 2026 | Kyoto Travel","snippetLength":600,"rank":3}]

### seasonal: Iceland northern lights season

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 1593
- resultCount: 5
- hosts: guidetoiceland.is, perlan.is, fiftydegreesnorth.com, aurora-expeditions.com, nordicvisitor.com
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://guidetoiceland.is/the-northern-lights/the-northern-lights-aurora-borealis-in-iceland","sourceTitle":"The Best Time to See the Northern Lights in Iceland | Guide to Iceland","snippetLength":600,"rank":1},{"sourceUrl":"https://perlan.is/articles/northern-lights-iceland-months","sourceTitle":"Northern Lights Month by Month | Aurora Borealis | Perlan","snippetLength":600,"rank":2},{"sourceUrl":"https://www.fiftydegreesnorth.com/us/article/best-time-for-northern-lights-in-iceland","sourceTitle":"Best time to see the Northern Lights in Iceland | Travel guide","snippetLength":600,"rank":3}]

### noisy: Tokyo Kyoto seasonal transport random forum vague advice

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 2435
- resultCount: 5
- hosts: forums.tauck.com, japan-guide.com, talk.collegeconfidential.com, community.ricksteves.com, reddit.com
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://forums.tauck.com/discussion/18292/transportation-options-from-kyoto-to-tokyo-for-flight-home","sourceTitle":"Transportation options from Kyoto to Tokyo for flight home","snippetLength":167,"rank":1},{"sourceUrl":"https://www.japan-guide.com/forum/quereadisplay.html?0+184097=","sourceTitle":"Hakone and Kyoto silver week - japan-guide.com forum","snippetLength":171,"rank":2},{"sourceUrl":"https://talk.collegeconfidential.com/t/another-travel-thread-any-tips-for-japan-tokyo-kyoto-especially/1704071","sourceTitle":"Another travel thread: Any tips for Japan (Tokyo, Kyoto ...","snippetLength":148,"rank":3}]

### edge: zzzxxy impossible route no known travel evidence 2026

- ok: true
- failure: none
- attempts: 1
- elapsedMs: 1606
- resultCount: 4
- hosts: instagram.com, mountainflyermagazine.com, jeremiahbishop.com, canyon.com
- duplicateUrls: none
- missingUrlCount: 0
- missingTitleCount: 0
- missingSnippetCount: 0
- diagnostics: [{"status":"resolved","reason":"ok","attempt":1,"retry":false,"httpStatus":200,"waitMs":0,"error":""}]
- sampleResults: [{"sourceUrl":"https://www.instagram.com/theimpossibleroute?hl=en","sourceTitle":"The Impossible Route ☠️💕 (@theimpossibleroute)","snippetLength":129,"rank":1},{"sourceUrl":"https://www.mountainflyermagazine.com/view.php/the-impossible-journey.html","sourceTitle":"The Impossible Route: 340 Miles and Three Days in Far- ...","snippetLength":184,"rank":2},{"sourceUrl":"https://www.jeremiahbishop.com/impossible-route-death-valley-arrival-in-yuma","sourceTitle":"Impossible Route: Death Valley – Team Arrives : JeremiahBishop.com","snippetLength":600,"rank":3}]


## Adapter Compatibility

- Base EvidenceBundle valid: true
- Enriched EvidenceBundle valid: true
- Enriched EvidenceBundle ID: eb-86e0a6fd7905269dd156
- Transport evidence items: 8
- Transport statuses: verified, weak_signal
- Seasonal evidence items: 17
- Seasonal statuses: weak_signal
- Budget evidence items: 0
- budgetFit remains unknown: true
- Adapter diagnostics count: 6
- Adapter provider mode: injected normalized live results, no additional network calls beyond the 8 fixed queries

## Observations

- Tavily successful responses matched the provider contract and normalized to sourceUrl/sourceTitle/sourceSnippet/rank.
- Total duplicate exact URLs across query result sets: 0
- No 429, timeout, or 5xx was observed unless listed in query diagnostics.
- Provider success did not by itself decide weak_signal or verified; Phase 3C-1 adapter/corroborator handled status upgrades.
- budgetFit stayed unknown.
- Future Phase 3C-3 should still consider URL canonicalization, domain-level corroboration, and source quality thresholds before Planner sidecar use.

## Baseline Protection

- accepted hash before: aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f
- accepted hash after: aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f
- bootstrap hash before: 9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef
- bootstrap hash after: 9f5e2b2557a9e547073da4d299f08b5b18b6eba38b3bd55fc995a16adf1cd9ef
- FeedReadyPoolCount before: {"all":851,"cross":357,"single":494}
- FeedReadyPoolCount after: {"all":851,"cross":357,"single":494}
- Protected files changed: none
- Phase 3B-1 golden expected unchanged: eb-c1d89ba2875b67289c97

## Recommendation

- No protected file or cache changes were detected.
- Real Tavily provider produced usable normalized results.
- Adapter compatibility produced a schema-valid enriched EvidenceBundle.
