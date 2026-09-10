# Image Debt Recovery 02 — Validation Record

Date: 2026-09-08. Platform: Windows; Node v24.18.0.

Scope: Image Debt Recovery 02 only, based on main `826439f41523500ad805d0bcb9966a630e90b859`. No Knowledge, Evidence, RouteIntent, Planner, Search, or performance-contract changes. This record accompanies the dynamically generated final report; it is not a claim that comprehensive passed.

## Final recovery truth

| Measure | Before | After |
| --- | ---: | ---: |
| Local image assets | 997 | 1,384 |
| Country covers | 118/118 | 118/118 |
| Dedicated City | 600/833 | 810/833 |
| Dedicated Core POI | 132/342 | 309/342 |
| Current needsBackfill | 443 | 56 |

- Audited: 443/443; recovered: 387, comprising 210 City and 177 Core POI.
- Remaining: 23 City and 33 Core POI. All retain neutral placeholders.
- Remaining reasons: ambiguous identity 11; insufficient quality 34; unverified license 1; no exact image 8; duplicate-only source 1; unavailable source 1.
- Exhausted: 0. Rejecting a selected candidate does not prove that every alternative source has been exhausted. Unverified alternatives remain eligible for future recovery.
- Visual inspection: 416 candidates on 21 contact-sheet pages; 387 accepted and 29 rejected. This was agent visual inspection, not a claim of human approval.
- Historical sealed image debt remains 13; it is distinct from current debt 56.
- Published Knowledge remains 119 Country / 833 City / 3,963 POI / 4,915 entities. Quarantined POI remain 1,416, with zero Recovery 02 formal image targets. China remains catalog-only.

## Asset, provenance, and baseline checks

- New files: 387 WebP; 83,653,924 bytes total. Average 216,160; median 251,978; p95 298,018 bytes. Above 300 KB: 0; above 500 KB: 0. No new size exception.
- Provenance/license/license URL: 387/387 complete. Attribution-required CC creator/attribution: 344/344 complete.
- New exact duplicate groups: 0; unsafe perceptual duplicate pairs involving new assets: 0. The existing two exact and nine perceptual historical audit groups remain unchanged.
- Current Image Manifest and Image Quality checks: PASS; invalid mappings, missing images, and quarantined targets: 0.
- Image Asset Baseline: PASS for 1,384 assets. Tracked-state, hash, byte-size, missing, and unexpected mismatches: all 0. Unknown assets: 0.
- Tracked-state regression fixtures: 7/7 expected outcomes. Size-policy and canonical-line-ending fixtures: PASS, including rejection of real content changes.
- Recovery 02 binding mutations: 10/10 rejected. Three stale-report mutations rejected; equivalent CRLF report accepted. Final Summary and final report exactly match live inventory, manifest, provenance, and asset truth.
- A final queue-metadata clarification changed audit-reference line numbers. The strict baseline was regenerated and reverified; no image bytes, entity mappings, or validation rules were relaxed. The final report label was also corrected from “Human visual audit” to “Visual audit.”

## Browser and consumer acceptance

The existing Edge/CDP verifier exercised local Country/City detail pages, neutral initial shells, network request recording, and blocked City initialization. Dedicated City resolution and unresolved placeholders passed without Country-to-City fallback.

Actual product flow: `Oman Qatar 14 days` search -> Route Detail -> Add Trip -> Complete -> Footprint. Result: 2 Country / 6 City / duplicate City 0; Knowledge entityId/QID retained. Detail remained stable for at least five seconds.

`Bishkek 7 days` verified a Batch09 recovered City and an exact recovered Core POI in the rendered detail. Combined product checks consumed six newly recovered City images and one newly recovered POI image. Dilijan exercised unresolved neutral fallback.

- Wrong semantic images: 0; broken images: 0; runtime external image requests: 0; Console error/warning: 0.
- Product Route V2 flow used isolated local runtime state with online Evidence disabled. The Country-card fixture locally intercepts its legacy Wikivoyage request; that fixture is not evidence that the legacy provider performs no network attempt when unmocked.
- Detailed actual browser results are preserved in `data/route-v2/images/image-debt-recovery02-browser-acceptance.json`.

## Regression and comprehensive result

One comprehensive run started at 2026-09-08T02:03:24Z and ended at 02:36:42Z. It executed all 72 static mandatory stages successfully and the additional live prelaunch stage successfully. It then exited non-zero at the unchanged performance stage. The one post-performance Cache Baseline V2 stage was subsequently run separately and passed.

**Actual comprehensive result: FAIL at performance. Do not describe this run as 74/74 PASS.** Across the comprehensive execution and the separate cache completion, all 73 non-performance mandatory stages passed; browser checks passed. Final metadata/report/baseline changes received their affected standalone rechecks afterward.

| Required regression | Result |
| --- | --- |
| Semantic Gate | 4,915/4,915; 26 negative fixtures rejected |
| Batch09 Route Consumption | 106/106; 20/20 countries; external fetch calls 0 |
| Batch09 hard constraints | 331/331 |
| Trip/Footprint | PASS; duplicate City 0 |
| Mixed-type admission | 9 cases across six canonical consumers PASS |
| Financial-market admission | 7 cases PASS; eight exchanges quarantined; consumer references 0 |
| Overlapping/homonymous parser | PASS; existing San Salvador constraint regression retained |
| Historical Git anchor | 26 protected files PASS; 10 tamper mutations rejected |
| Batch09 sealed reports | Four documents match the sealed Git blobs; report consistency PASS |
| Cache Baseline V2 | PASS in isolated copies; formal cache unchanged |
| Mandatory failure propagation | PASS; 74 registered stages; Recovery 02 failure, non-zero exits, signals and spawn errors propagate; output PASS text is not trusted |
| Modified/new JS/MJS syntax | 22/22 PASS |
| Modified Python syntax | AST parsing PASS; no generated bytecode |
| Working/index diff checks | PASS |

Performance: a single comprehensive measurement was **0.266090 ms**, above the unchanged **aggregate p95 <0.25 ms** contract. This is a failed measurement, not PASS. No benchmark fishing or threshold/statistics change was performed. The performance verifier and production invariant/parser/model hot path have no phase diff. Prior host sensitivity is known, but this run is not a new controlled A/B attribution study and does not establish a phase-specific stable regression.

## Formal assets and Git

- Accepted: `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`.
- Formal Evidence: `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`.
- Immutable aggregate: `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`.
- Cache: 331 files; Runtime State: 329 files; Metrics: 0. Tests used isolated temporary directories. Formal data remained unchanged.
- Branch: `codex/route-v2-image-debt-recovery-02`; HEAD remains `826439f41523500ad805d0bcb9966a630e90b859`.
- Staged: 387 new WebP files plus the narrow LFS rule (388 entries), solely to establish genuine tracked-state truth before baseline generation. Code, manifests, and reports remain uncommitted.
- Git LFS fsck: PASS. All 387 new index pointers and corresponding local LFS objects were checked against actual asset hashes/bytes. No missing local objects. New objects have **not** been uploaded, because commit/push are outside this phase's authorization.
- Stash object remains `2a874aa32df41285a150e79d6a8981cee2f032db`; message remains `pre-pr19-merge-local-work-2026-08-10`. No stash operation.
- No commit, push, PR, merge, deploy, tag, release, or Batch10 work.

Outcome: image recovery work is complete and ready for final review, with the performance failure explicitly disclosed rather than waived or relabeled.
