# Route V2 Knowledge Expansion Batch 08 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add 20 evidence-backed sovereign countries to the Route V2 Knowledge pipeline while preserving all existing hard constraints, protected assets, image-debt truth, and release contracts.

**Architecture:** Reuse the existing four-wave Knowledge importer, positive Semantic Gate, local Evidence schemas, production Route Search service, Image Manifest v2, and mandatory prelaunch runner. Batch 08 adds only reviewed seeds, imported entities, offline evidence records, route-consumption coverage, image-safe country/placeholder assignments, dynamic reports, and release-gate wiring; it does not re-architect Search, Planner, Candidate generation, fallback, or image delivery.

**Tech Stack:** Node.js ESM, JSON/JSONL Knowledge assets, Wikidata/Wikipedia acquisition snapshots, Route V2 production modules, local browser acceptance verifier, Git LFS audit, Markdown reports.

---

## Task 1: Freeze the Batch 08 baseline and target portfolio

**Files:**
- Create: `data/knowledge/reports/knowledge-expansion-batch08-baseline.json`
- Create: `data/knowledge/seeds/knowledge-expansion-batch08-20-country.json`
- Test: `scripts/verify-knowledge-expansion-batch08.mjs`

- [ ] Record the dynamic BEFORE totals: 79 Countries, 601 Cities, 4,038 POIs, 4,718 entities, 740 directed Transport records, 316 Month Risk records, and Image Manifest/Image Baseline counts.
- [ ] Encode four waves using city/POI publication batches 26–29 for AM/AZ/BA/MK/MD, LU/MC/LI/OM/QA, BH/KW/LB/DO/JM, and CU/BS/BO/PY/NI.
- [ ] Give each target an exact Country QID, ISO metadata, tier, selection reason, expected city depth, and exact English Wikipedia city titles.
- [ ] Assert the 20 codes do not overlap existing Country entities, China is not targeted, the target list has no duplicate code/QID, and all targets are sovereign-country entities.
- [ ] Run `node scripts/verify-knowledge-expansion-batch08.mjs` and confirm the initial test fails only because Batch 08 publication assets do not yet exist.

## Task 2: Extend the reviewed four-wave Knowledge importer

**Files:**
- Modify: `scripts/import-knowledge-expansion-batch05-wave.mjs`
- Create: `scripts/import-knowledge-expansion-batch08-wave.mjs`
- Create: `data/knowledge/batches/countries.p1a-batch08.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch08-wave1.wikidata.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch08-wave2.wikidata.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch08-wave3.wikidata.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch08-wave4.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch26.json`
- Create: `data/knowledge/batches/cities.p1b-batch27.json`
- Create: `data/knowledge/batches/cities.p1b-batch28.json`
- Create: `data/knowledge/batches/cities.p1b-batch29.json`
- Create: `data/knowledge/batches/pois.p1b-batch26.json`
- Create: `data/knowledge/batches/pois.p1b-batch27.json`
- Create: `data/knowledge/batches/pois.p1b-batch28.json`
- Create: `data/knowledge/batches/pois.p1b-batch29.json`
- Create: `data/knowledge/batches/selection.p1b-batch26.json`
- Create: `data/knowledge/batches/selection.p1b-batch27.json`
- Create: `data/knowledge/batches/selection.p1b-batch28.json`
- Create: `data/knowledge/batches/selection.p1b-batch29.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch08-wave1.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch08-wave2.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch08-wave3.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch08-wave4.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch08-wave1.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch08-wave2.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch08-wave3.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch08-wave4.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch08-wave1.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch08-wave2.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch08-wave3.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch08-wave4.json`

- [ ] Add Batch 08 to the importer allowlist, ISO table, country-output policy, and local-language map without changing Batch 05–07 behavior.
- [ ] Resolve every city by exact English Wikipedia title, then require a positive City/settlement P31/P279 path, exact P17 country match, and coordinates.
- [ ] Build POI candidates by geosearch, then require a positive POI P31/P279 path, exact P17, coordinates, parent distance, visitor suitability, and uniqueness.
- [ ] Quarantine Country-as-POI, Region/Island-as-City, airports, stations without independent visitor value, prisons, police facilities, military schools, hospitals, and uncertain entities.
- [ ] Run the four importer waves, keep their raw response snapshots and review queues, and confirm each published City has at least one safe POI without padding.

## Task 3: Publish and semantically validate Batch 08

**Files:**
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `scripts/verify-knowledge-semantic-gate.mjs`
- Create: `scripts/verify-knowledge-expansion-batch08-semantic-adversarial.mjs`
- Create: `data/knowledge/fixtures/knowledge-expansion-batch08-semantic-negative-fixtures.json`

- [ ] Register country batch 08 and city/POI batches 26–29, then update totals only from imported data.
- [ ] Add negative fixtures for Country→POI, island/region→City, wrong P17, wrong parent country, wrong parent city, distant POI, duplicate QID, unsafe operational entity, and a valid-but-non-travel entity.
- [ ] Assert every Batch 08 City and POI passes the existing positive semantic type policy and that the full published set passes fail-closed.
- [ ] Run `node scripts/verify-knowledge-expansion-batch08-semantic-adversarial.mjs` and `node scripts/verify-knowledge-semantic-gate.mjs`.

## Task 4: Add directed Transport and objective Month Risk evidence

**Files:**
- Modify: `scripts/import-knowledge-expansion-batch06-evidence.mjs`
- Create: `scripts/import-knowledge-expansion-batch08-evidence.mjs`
- Create: `data/knowledge/seeds/knowledge-expansion-batch08-evidence.json`
- Create: `data/knowledge/batches/knowledge-expansion-batch08-evidence-audit.json`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] Use official operator or transport-authority sources for each direction pair and official meteorological sources for objective hazards.
- [ ] Create independent IDs for both directions; do not infer symmetry.
- [ ] Leave duration, frequency, transfers, and suitability unknown unless directly supported.
- [ ] Add four Month Risk records per country and validate all Evidence through production schemas.
- [ ] Run the importer for all 20 countries and verify the Batch 08 audit exactly matches the resulting records.

## Task 5: Preserve image semantics while extending Country coverage

**Files:**
- Create: `assets/route-v2-images/countries/country-am.svg`
- Create: `assets/route-v2-images/countries/country-az.svg`
- Create: `assets/route-v2-images/countries/country-ba.svg`
- Create: `assets/route-v2-images/countries/country-mk.svg`
- Create: `assets/route-v2-images/countries/country-md.svg`
- Create: `assets/route-v2-images/countries/country-lu.svg`
- Create: `assets/route-v2-images/countries/country-mc.svg`
- Create: `assets/route-v2-images/countries/country-li.svg`
- Create: `assets/route-v2-images/countries/country-om.svg`
- Create: `assets/route-v2-images/countries/country-qa.svg`
- Create: `assets/route-v2-images/countries/country-bh.svg`
- Create: `assets/route-v2-images/countries/country-kw.svg`
- Create: `assets/route-v2-images/countries/country-lb.svg`
- Create: `assets/route-v2-images/countries/country-do.svg`
- Create: `assets/route-v2-images/countries/country-jm.svg`
- Create: `assets/route-v2-images/countries/country-cu.svg`
- Create: `assets/route-v2-images/countries/country-bs.svg`
- Create: `assets/route-v2-images/countries/country-bo.svg`
- Create: `assets/route-v2-images/countries/country-py.svg`
- Create: `assets/route-v2-images/countries/country-ni.svg`
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `data/route-v2/images/image-debt-inventory.json`
- Modify: `data/route-v2/images/image-asset-baseline.json`
- Modify: `data/route-v2/images/image-asset-size-audit.json`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md`
- Modify: `ROUTE_V2_IMAGE_ASSET_BASELINE_AUDIT.md`

- [ ] Add only non-photographic Country-semantic covers; assign every new City/Core POI without verified imagery to the existing neutral placeholder and `needsBackfill`.
- [ ] Preserve the pre-existing 13 image-debt records unchanged and report new debt separately.
- [ ] Do not add runtime image networking or count placeholders as dedicated images.
- [ ] Regenerate the image inventory, asset baseline, size audit, and reports; require invalidMapping, broken image, wrong semantic image, and runtime external image requests to remain zero.

## Task 6: Verify production Route consumption and hard constraints

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch08-route-consumption.mjs`
- Create: `scripts/verify-route-v2-batch08-adversarial.mjs`
- Create: `data/knowledge/reports/knowledge-expansion-batch08-route-consumption.json`

- [ ] Exercise every target at 7 days and Tier 1 targets at 14/21 days through the real Route Search service.
- [ ] Add multi-country, fixed-order, explicit multi-city, month, season, theme, destination-less month/season, bare-number duration, and unknown-destination cases.
- [ ] Assert complete Country/City hard-constraint coverage, exact order only for fixed-order syntax, no stale Accepted replacement, no cross-country leakage, and no request-derived theme self-evidence.
- [ ] Generate hundreds of deterministic mutation/stress cases across the 20 targets and kill required-country/city deletion, Country→POI substitution, fallback constraint loss, and short-alias collisions including `de`.
- [ ] Run all historical single-city, multi-city, multi-country, mixed city/country, homonymous-city, Region/Island, theme, fallback, Search V1, Planner, and long-trip verifiers.

## Task 7: Prove Route → Detail → Trip → Footprint and browser behavior

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch08-browser.mjs`
- Create: `data/knowledge/reports/knowledge-expansion-batch08-browser-acceptance.json`

- [ ] Start the local server in an isolated test directory and run target-country search/route/detail acceptance without altering production Runtime State.
- [ ] Complete at least one cross-country Batch 08 route through Add Trip, Complete, and Footprint.
- [ ] Assert Route/Trip/Footprint city counts, entityId/QID identity, and country/city stats remain consistent and duplicate-free.
- [ ] Assert Console errors/warnings, broken images, wrong semantic images, external Evidence requests, and runtime external image requests are all zero.

## Task 8: Generate dynamic Batch 08 reports and wire mandatory gates

**Files:**
- Create: `scripts/lib/knowledge-expansion-batch08-report-data.mjs`
- Create: `scripts/report-knowledge-expansion-batch08.mjs`
- Create: `scripts/verify-knowledge-expansion-batch08-report-consistency.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md`
- Modify: `ROUTE_V2_KNOWLEDGE_COVERAGE_DASHBOARD.md`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] Compute all totals, deltas, per-country coverage, Evidence counts, image coverage/debt, quarantines, and route/browser results from repository assets and manifests.
- [ ] Reject stale report totals, swapped current/addition labels, China-as-Plannable, placeholder-as-dedicated, or any mismatch between report, Dashboard, manifests, and raw assets.
- [ ] Add Batch 08 Knowledge, Semantic adversarial, Route Consumption, stress, report consistency, and browser verifiers to the release gate.
- [ ] Add failure propagation fixtures that inject non-zero exits into each new mandatory stage and require comprehensive failure.

## Task 9: Final regression, asset integrity, and handoff

**Files:**
- Verify: all files modified or created above

- [ ] Run Batch 08 verifier, full Semantic Gate, Evidence validators, Route Consumption, adversarial stress, Trip/Footprint, image manifest/quality/size/baseline, report consistency, Cache Baseline V2, comprehensive prelaunch, and failure propagation.
- [ ] Run `node --check` for every modified/new JS/MJS file, Python syntax checks for modified/new Python files, and `git diff --check`.
- [ ] Run same-host main/Batch 08 performance A/B once; preserve `aggregate p95 < 0.25ms`, report environment-equivalent jitter honestly, and do not rerun until accidental PASS.
- [ ] Recalculate Accepted, Formal Evidence, and Immutable hashes plus Cache/Runtime/Metrics counts before and after tests; require exact preservation of the protected baseline.
- [ ] Confirm `stash@{0}` still carries `pre-pr19-merge-local-work-2026-08-10`, staged remains zero, and no Batch 08 commit/push/PR/merge/deploy/tag/release has occurred.
- [ ] Report the final BEFORE/AFTER totals, deltas, 20-country result, image debt delta with the prior 13 preserved, all validation results, and either `BATCH 08 READY FOR FINAL REVIEW` or `BLOCKED`.
