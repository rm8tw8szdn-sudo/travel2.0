# Route V2 Image Debt Elimination Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current session. The phase explicitly forbids commits, pushes, PRs, merges, deploys, tags, releases, stash operations, and Batch 08 work.

**Goal:** Process every currently published City and Core POI image debt through an auditable, idempotent exact-entity acquisition pipeline while preserving neutral placeholders for every candidate that cannot be verified.

**Architecture:** Freeze the debt from the current Image Manifest v2, resolve only exact Wikidata P18 or exact Commons structured-data candidates, process accepted sources into bounded local WebP assets, and overlay the resulting provenance onto the unchanged manifest schema. A dedicated verifier and dynamically generated report make provenance, license, entity binding, size, duplicate, consumer, and remaining-debt reasons release-blocking.

**Tech Stack:** Node.js 24 ESM, Wikidata and Wikimedia Commons APIs, Python/Pillow for deterministic WebP processing, existing Route V2 Image Manifest v2 and image baseline libraries, local browser acceptance tooling.

---

### Task 1: Freeze and verify the 687-item debt inventory

**Files:**
- Create: `scripts/build-route-v2-image-debt-inventory.mjs`
- Create: `data/route-v2/images/image-debt-inventory.json`
- Test: `scripts/verify-route-v2-image-debt-elimination.mjs`

- [ ] Build inventory rows from manifest records where `needsBackfill === true`, preserving entityId, QID, type, country, parent, placeholder, priority, Core POI status, and prior failed-image history.
- [ ] Resolve every row against Published Knowledge and fail on missing entity, QID/country/parent mismatch, non-neutral placeholder, existing dedicated mapping, or manifest omission.
- [ ] Sort deterministically by priority, country, entity type, canonical name, and entityId; write a fixed phase timestamp rather than the wall clock.
- [ ] Run the inventory builder twice and require byte-identical output.

### Task 2: Implement exact-entity source acquisition

**Files:**
- Create: `scripts/lib/image-debt-source.mjs`
- Create: `scripts/process-route-v2-image.py`
- Create: `scripts/import-route-v2-image-debt.mjs`
- Test: `scripts/verify-route-v2-image-debt-elimination.mjs`

- [ ] Fetch Wikidata claims in bounded batches and accept an entity P18 only when the returned entity ID exactly equals the debt QID.
- [ ] For missing P18, query Commons structured data only for media with an exact `P180=<QID>` depicts statement; do not use filename, category, or free-text similarity as semantic proof.
- [ ] Require a Commons description URL, source file identity, image MIME type, usable dimensions, and an approved free license (`CC0`, Public Domain, `CC BY`, or `CC BY-SA`).
- [ ] Record structured rejection codes: `NO_EXACT_IMAGE`, `LICENSE_UNVERIFIED`, `ENTITY_AMBIGUOUS`, `IMAGE_TOO_LOW_QUALITY`, `ONLY_WATERMARKED_SOURCE`, `ONLY_DUPLICATE_SOURCE`, `SOURCE_UNAVAILABLE`, or `SIZE_QUALITY_CONFLICT`.
- [ ] Download only into an OS temporary directory, hash the downloaded source bytes, process to deterministic WebP with Pillow, strip metadata, retain aspect ratio, and target at most 300 KB without exceeding 500 KB.
- [ ] Reject identical or near-identical destination images already bound to another entity; the neutral placeholder is the only reusable geographic-image exception.

### Task 3: Run idempotent acquisition waves

**Files:**
- Create: `data/route-v2/images/image-debt-elimination-provenance.json`
- Create: `data/route-v2/images/image-debt-wave-results.json`
- Create: `assets/route-v2-images/cities/*.webp`
- Create: `assets/route-v2-images/pois/*.webp`

- [ ] Process deterministic waves of 150, 150, 150, 150, and the remainder without waiting for confirmation.
- [ ] Preserve already verified path/hash/provenance records on rerun and never download or rewrite an unchanged asset.
- [ ] Record attempted, succeeded, semantic reject, license reject, quality reject, duplicate reject, size reject, and source unavailable counts per wave.
- [ ] Run the importer a second time and require zero new downloads, zero changed hashes, and byte-identical provenance/results.

### Task 4: Overlay verified assets onto Image Manifest v2

**Files:**
- Modify: `scripts/build-route-v2-image-coverage-batch05.mjs`
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `route-v2-image-coverage.js`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH07_AUDIT.md`

- [ ] Merge phase provenance after Batch 07 provenance by exact entityId, rejecting QID/type/country/parent conflicts and missing files.
- [ ] Keep schema `route-v2-image-coverage-v2`, fallback policy, Country records, and Country/City/POI consumer semantics unchanged.
- [ ] Recompute dedicated and needsBackfill counts from the merged manifest; never count placeholders as dedicated.
- [ ] Generate the runtime map and audits deterministically and require file ↔ provenance ↔ manifest ↔ entity ↔ consumer consistency.

### Task 5: Generate the phase report and contact sheet

**Files:**
- Create: `scripts/report-route-v2-image-debt-elimination.mjs`
- Create: `ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md`
- Create: `data/route-v2/images/audit/image-debt-contact-sheet.html`

- [ ] Compute all starting/final coverage, country, failure-reason, byte percentile, duplicate, provenance, and license figures from inventory, provenance, manifest, and baseline data.
- [ ] List every remaining debt row with its exact structured reason.
- [ ] Generate a local-only HTML contact sheet grouped Country → City → POI with entity name, QID, type, and local path; do not copy photography into the audit artifact.
- [ ] Calculate projected repository size at full coverage from the phase average without hard-coded totals.

### Task 6: Make image debt integrity release-blocking

**Files:**
- Complete: `scripts/verify-route-v2-image-debt-elimination.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] Require complete inventory traversal, exact provenance, approved license, valid local file, matching hashes/dimensions/bytes, no invalid mapping, no remote runtime URL, and a valid reason for every residual debt.
- [ ] Add negative fixtures for reverting a converted entity to placeholder, removing provenance, changing entity/QID/parent/country, remote fallback, wrong hash/bytes, duplicate binding, and size-gate bypass.
- [ ] Add the verifier as a mandatory prelaunch stage and prove its non-zero exit and signal propagate without relying on PASS text.

### Task 7: Perform automated image and regression gates

**Files:**
- Verify only; no additional product files expected.

- [ ] Run Image Manifest, Image Quality, Image Size, exact/perceptual duplicate, large-binary, Country Detail, City Detail, Route Detail, Trip/Footprint, report consistency, and Image Debt verifiers.
- [ ] Run Search, Route Consumption, homonymous-city, multi-city, multi-country, image fallback, Cache Baseline V2, comprehensive prelaunch, failure propagation, all changed JS/MJS through `node --check`, and `git diff --check`.
- [ ] Run the performance verifier once; preserve aggregate p95 `<0.25ms` and use same-host main/current A/B only if this host reproduces the known baseline-equivalent jitter.

### Task 8: Perform visual and browser acceptance

**Files:**
- Verify only; browser profiles and screenshots stay outside the repository.

- [ ] Inspect every new image through the grouped contact sheet, prioritizing all high-exposure Cities and a high proportion of Core POIs; reject wrong place, watermark, screenshot, AI-looking, duplicate misuse, bad crop, or low-quality assets.
- [ ] Exercise Home/Feed, Country Detail, City Detail, Route Card, Route Detail, POI, Trip, Footprint, and Profile using local assets only.
- [ ] Require broken image, wrong semantic image, runtime external image request, and Console error/warning counts all equal zero.

### Task 9: Confirm protected assets and leave an uncommitted review workspace

**Files:**
- Verify only.

- [ ] Confirm Accepted, Formal Evidence, and Immutable hashes; Cache 331; Runtime State 329; Metrics absent.
- [ ] Run `git lfs fsck`, verify no raw source photograph or oversized normal-Git binary remains, and confirm stash@{0} is unchanged.
- [ ] Leave all phase changes unstaged and uncommitted on `codex/route-v2-image-debt-elimination` for final review.

### Task 10: Freeze the 119-item multi-source recovery inventory

**Files:**
- Create: `scripts/build-route-v2-image-debt-recovery-inventory.mjs`
- Create: `data/route-v2/images/image-debt-recovery-inventory.json`
- Test: `scripts/verify-route-v2-image-debt-elimination.mjs`

- [x] Select exactly the 119 first-pass `needsBackfill` attempts, preserving the first-pass reason and candidate titles as immutable history.
- [x] Add deterministic search keys from QID, canonical English name, aliases, local labels, country, and exact parent City without changing Published Knowledge.
- [x] Fail if the recovery inventory includes an already-published dedicated entity or omits a first-pass residual entity.
- [x] Build twice and require byte-identical recovery inventory output.

### Task 11: Add bounded multi-source discovery and auditable attempt logs

**Files:**
- Modify: `scripts/lib/image-debt-source.mjs`
- Create: `scripts/recover-route-v2-image-debt.mjs`
- Create: `data/route-v2/images/image-debt-recovery-results.json`
- Modify: `data/route-v2/images/image-debt-elimination-provenance.json`
- Test: `scripts/verify-route-v2-image-debt-elimination.mjs`

- [x] Query exact Wikidata P18, Commons structured depicts, Commons category/search, and multilingual Wikipedia page images with QID/country/parent disambiguation; cap every remote query and candidate list.
- [x] Record every source path, exact query identity, candidate URL, candidate file, acceptance status, and structured rejection reason before choosing an image.
- [x] Require Commons file-level author, exact approved license and license URL for every published candidate; never infer reuse rights from a Wikipedia or search result page.
- [x] Score only candidates that already pass identity and license hard gates, preferring adequate resolution, recognizable composition, crop suitability, size efficiency, and low duplicate risk.
- [x] Attempt an additional official/open-source path for every unresolved entity and record it as unresolved when no file-level reusable asset can be verified.

### Task 12: Process, visually audit, and publish second-round assets

**Files:**
- Create: `assets/route-v2-images/cities/*.webp`
- Create: `assets/route-v2-images/pois/*.webp`
- Modify: `scripts/build-route-v2-image-debt-contact-sheet.mjs`
- Modify: `scripts/build-route-v2-image-debt-visual-audit.mjs`
- Modify: `scripts/apply-route-v2-image-debt-visual-audit.mjs`
- Modify: `data/route-v2/images/image-debt-visual-audit.json`

- [x] Download candidates to an OS temporary directory and process bounded WebP files without retaining originals or using AI upscaling.
- [x] Reject files over 500 KB and prefer at most 300 KB while preserving readable subject detail and aspect ratio.
- [x] Run exact and perceptual duplicate checks against the complete baseline and both recovery rounds before publication.
- [x] Generate contact sheets for 100% of second-round assets and manually review 100% of same-name, small POI, local-language, and non-P18 candidates.

### Task 13: Regenerate manifests and the exhaustive recovery report

**Files:**
- Modify: `scripts/build-route-v2-image-coverage-batch05.mjs`
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `route-v2-image-coverage.js`
- Modify: `scripts/lib/image-debt-report-data.mjs`
- Modify: `scripts/report-route-v2-image-debt-elimination.mjs`
- Modify: `ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md`

- [x] Overlay only visually approved second-round assets using exact entity/QID/type/country/parent bindings while retaining every first-round audit record.
- [x] Add a `MULTI-SOURCE RECOVERY` report section computed from the recovery inventory, attempt log, provenance, manifest, and image baseline.
- [x] Report source-path contributions, successful City/POI recovery, final debt, attempts per entity, license/quality/exact/source rejects, and the complete per-path history for every residual entity.
- [x] Require every remaining row to contain Commons/Wikidata, multilingual Wikipedia, and at least one other legitimate source-path attempt; require four paths for high-priority City/Core POI rows.

### Task 14: Run browser, release, and protected-asset acceptance

**Files:**
- Modify: `data/route-v2/images/image-debt-browser-acceptance.json`
- Verify only for all other files.

- [x] Exercise City Detail, Country Detail, Route Detail, POI, Trip, and Footprint across regions and recovery source types with isolated runtime/cache paths.
- [x] Require wrong semantic image, broken image, runtime external image request, and Console error/warning counts all equal zero.
- [x] Run Route Consumption 97/97, Semantic Gate 4,718/4,718, Trip/Footprint, homonymous City, Search, multi-city, multi-country, all image gates, duplicate gates, report consistency, Cache Baseline, comprehensive, failure propagation, syntax, and diff checks.
- [x] Run performance once without changing its aggregate p95 `<0.25ms` contract; confirm Accepted, Formal Evidence, Immutable Cache, Cache 331, Runtime State 329, Metrics absent, Git LFS, branch state, and untouched stash.
