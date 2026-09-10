# Route V2 Image Debt Recovery 02 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan task-by-task in the current session. The phase forbids commits, pushes, PRs, merges, deploys, tags, releases, stash operations, Batch 10 work, and changes to the RouteIntent performance contract.

**Goal:** Audit all 443 current City/Core POI image-debt entities, recover only exact, licensed, high-quality local images, and leave every unresolved entity on the neutral placeholder with an auditable terminal reason.

**Architecture:** Freeze the current manifest debt against the published/admitted Knowledge set, then run the existing bounded Wikidata/Commons/multilingual source pipeline under an independent Recovery 02 profile. Store new WebP files in a Recovery 02 LFS-only namespace, publish only assets that pass exact-identity, provenance, size, duplicate, and human visual review, and regenerate current manifests/reports without rewriting the historical debt snapshot of 13.

**Tech Stack:** Node.js 24 ESM, Wikidata and Wikimedia Commons APIs, Python/Pillow WebP processing, Git LFS, Route V2 Image Manifest v2, existing browser and comprehensive verifiers.

---

### Task 1: Freeze the dynamic 443-item debt set

**Files:**
- Create: `scripts/build-route-v2-image-debt-recovery02-inventory.mjs`
- Create: `data/route-v2/images/image-debt-recovery02-inventory.json`
- Test: `scripts/verify-route-v2-image-debt-recovery02.mjs`

- [ ] Read `image-coverage-manifest.json`, Published Knowledge, the canonical POI admission audit, quarantine records, and prior image attempts.
- [ ] Require exactly the dynamic relation `(833 - 600) + (342 - 132) = 443`, while deriving every value rather than hard-coding it.
- [ ] Emit deterministic rows containing entity/QID/country/parent/type/name, placeholder, priority, previous attempts, prior failure, current fallback, and admitted/quarantine status.
- [ ] Fail when an entity is absent from Published Knowledge, a POI is not canonically admitted/Core, any quarantined entity is selected, the fallback is non-neutral, or an entity already owns a dedicated image.
- [ ] Run the builder twice and require byte-identical output.

### Task 2: Add an isolated Recovery 02 acquisition profile

**Files:**
- Modify: `scripts/recover-route-v2-image-debt.mjs`
- Modify: `scripts/lib/image-debt-source.mjs`
- Create: `data/route-v2/images/image-debt-recovery02-provenance.json`
- Create: `data/route-v2/images/image-debt-recovery02-results.json`
- Create: `assets/route-v2-images/recovery02/cities/*.webp`
- Create: `assets/route-v2-images/recovery02/pois/*.webp`
- Modify: `.gitattributes`

- [ ] Preserve the current default profile byte-for-byte in behavior and add `--profile=recovery02` paths, schema names, timestamp, output namespace, and empty phase provenance.
- [ ] Attempt exact Wikidata P18, exact Commons P180, QID-linked multilingual Wikipedia, QID-linked Commons category, official source, and Openverse audit-only discovery for every inventory row.
- [ ] Accept only file-level Commons media with an approved canonical license URL, required creator/attribution, adequate dimensions, decodable image bytes, and exact entity proof; aggregated search results remain non-publishable.
- [ ] Process accepted files to WebP with preserved aspect ratio, target `<=300000` bytes, reject `>500000`, strip metadata, and never create a new size exception.
- [ ] Record every attempt and rejection; unresolved rows receive `failureReason`, `recoveryAttempts`, `lastAttemptSource`, and a justified `exhausted` value.
- [ ] Prevent exact/perceptual duplicate reuse against all existing assets and all new Recovery 02 candidates.
- [ ] Configure only `assets/route-v2-images/recovery02/**/*.webp` for Git LFS so historical image blobs are not retroactively reclassified.

### Task 3: Perform complete visual review and promotion

**Files:**
- Create: `scripts/build-route-v2-image-debt-recovery02-contact-sheet.mjs`
- Create: `scripts/apply-route-v2-image-debt-recovery02-visual-audit.mjs`
- Create: `data/route-v2/images/audit/image-debt-recovery02-contact-sheet.html`
- Create: `data/route-v2/images/image-debt-recovery02-visual-audit.json`

- [ ] Generate local-only contact sheets for 100% of acquired candidates, grouped Country → City → POI and labelled with entity/QID/source/license.
- [ ] Visually inspect every acquired candidate for exact place/POI identity, watermark/logo/UI/map/AI risk, blur, crop, distortion, and duplicate misuse.
- [ ] Bind each pass/reject decision to entityId, QID, path, SHA-256, and audit ID; rejected bytes are removed and the entity returns to a neutral placeholder with a structured reason.
- [ ] Promote only passed assets to `imageReady`; all others remain `needsBackfill=true` and never enter a consumer.

### Task 4: Overlay Recovery 02 without rewriting historical truth

**Files:**
- Modify: `scripts/build-route-v2-image-coverage-batch05.mjs`
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `route-v2-image-coverage.js`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH09_AUDIT.md`

- [ ] Merge Recovery 02 provenance by exact entityId/QID/type/country/parent after all sealed provenance sources.
- [ ] Reject duplicate bindings, missing files, mismatched hashes/bytes, non-admitted POIs, and any historical/current provenance collision.
- [ ] Recompute City, Core POI, placeholder, needsBackfill, and invalidMapping counts dynamically.
- [ ] Preserve the historical sealed image debt value 13 as a labelled historical snapshot distinct from current dynamic debt.

### Task 5: Make Recovery 02 integrity release-blocking

**Files:**
- Create: `scripts/verify-route-v2-image-debt-recovery02.mjs`
- Create: `scripts/report-route-v2-image-debt-recovery02.mjs`
- Create: `ROUTE_V2_IMAGE_DEBT_RECOVERY_02_REPORT.md`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] Compare inventory, results, provenance, visual audit, manifest, files, and consumers using exact dynamic counts.
- [ ] Require 443/443 attempted, zero quarantined targets, complete provenance/license/licenseUrl/creator/attribution, exact hashes/bytes/dimensions, zero invalid mappings, and neutral fallback for every unresolved row.
- [ ] Add negative mutations for missing attempt, quarantined target, wrong entity/QID/parent/country, missing license URL, placeholder creator, duplicate path/hash, oversized asset, untracked formal image, stale report count, and historical debt overwrite.
- [ ] Add the verifier to the mandatory chain and prove non-zero propagation without relying on PASS text.
- [ ] Generate reason, exhausted, size percentile, source-path, recovered City/POI, and remaining-debt summaries from live data only.

### Task 6: Seal the manifest against real Git/LFS truth

**Files:**
- Modify: `data/route-v2/images/image-asset-baseline.json`
- Modify: `ROUTE_V2_IMAGE_ASSET_BASELINE.md`

- [ ] Add Recovery 02 WebP files to the index only after visual approval so the baseline generator sees genuine Git/LFS-tracked assets; do not commit.
- [ ] Regenerate Image Manifest v2 and the image baseline after tracking, then require tracked/hash/bytes/missing/unexpected mismatch counts all equal zero.
- [ ] Require every new WebP to use the Recovery 02 LFS rule, `git lfs fsck` to pass, and no pending/missing LFS object.

### Task 7: Run product, regression, and protected-asset acceptance

**Files:**
- Verify only; browser profiles, screenshots, downloaded originals, and runtime caches remain outside the repository.

- [ ] Run Image Manifest, provenance, quality, size, large-binary, exact/perceptual duplicate, Recovery 02, City Detail, Country Detail, Route Detail, Search card, Trip/Footprint, and report-consistency checks.
- [ ] Browser-check representative recovered Cities, recovered Core POIs, unresolved placeholders, Batch09 locations, and one multi-country route; require wrong image, broken image, external runtime image, external Evidence, and Console error/warning all zero.
- [ ] Run Semantic Gate `4915/4915`, Route Consumption `106/106`, hard stress `331/331`, Trip/Footprint, Batch09 mixed-type, financial-market, San Salvador overlap, historical Git anchor, comprehensive, failure propagation, Node/Python syntax, and `git diff --check`.
- [ ] Record the performance stage once if comprehensive invokes it; preserve the existing `<0.25ms` contract and do not rerun for a more favorable number.
- [ ] Confirm Accepted, Formal Evidence, Immutable aggregate, Cache 331, Runtime State 329, Metrics 0, unchanged historical debt 13, and untouched `stash@{0}`.

### Task 8: Leave a reviewable uncommitted workspace

**Files:**
- Verify only.

- [ ] Report before/audited/recovered/remaining counts, reason breakdown, exhausted count, new file/byte percentiles, provenance completeness, duplicate/quality results, manifest/browser/regression results, formal assets, Git/LFS state, and stash state.
- [ ] Leave all phase changes uncommitted and do not push or open a PR.
- [ ] Stop at `IMAGE DEBT RECOVERY 02 COMPLETE — READY FOR FINAL REVIEW`; do not start Batch 10.

## Execution checkpoint — 2026-09-08

The checklist above is the original implementation plan. Final executed scope and evidence are recorded here and in `ROUTE_V2_IMAGE_DEBT_RECOVERY_02_VALIDATION.md`; this checkpoint supersedes the plan's proposed artifact names and provisional assumptions.

- [x] Tasks 1–3: froze and audited all 443 debt targets; visually checked 416 candidates; accepted 387 (210 City + 177 Core POI), rejected 29. Acquisition remains separate from product runtime.
- [x] Task 4: current coverage is 1,384 assets / Country 118/118 / City 810/833 / Core POI 309/342 / debt 56 / invalid 0. Historical debt 13 and all four Batch09 sealed reports remain unchanged.
- [x] Task 5: dynamic final report and summary agree; ten binding mutations and three report mutations are rejected; Recovery 02 is mandatory and failure propagation is proven.
- [x] Task 6: 387 WebP plus the LFS rule are staged, not committed; final tracked/hash/bytes/missing/unexpected mismatches are zero. LFS objects exist locally. Remote upload is intentionally not performed.
- [x] Task 7: Semantic 4,915/4,915; Consumption 106/106; hard stress 331/331; four Batch09 P1 regressions; real browser Trip/Footprint 2 Country / 6 City / duplicates 0; Image gates; failure propagation; Node 22/22; Python AST; diff checks passed. Formal hashes and Cache331/Runtime329/Metrics0 unchanged.
- [x] Performance was measured once by comprehensive: 0.266090ms, FAIL against unchanged <0.25ms. All 72 static mandatory stages and live prelaunch passed; the interrupted cache stage passed separately. This is 73 non-performance stages PASS, not comprehensive 74/74 PASS. No performance rerun or contract change.
- [x] Task 8: final reports preserve uncommitted reviewable changes. Remaining 56 targets use neutral placeholders. Exhausted count is 0: rejection of one candidate does not establish exhaustion of all alternative sources.
- [x] No commit/push/PR/merge/deploy/tag/release, stash operation, or Batch10 work. Stop for final review with the performance caveat disclosed.
