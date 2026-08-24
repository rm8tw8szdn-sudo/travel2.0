# Route V2 Knowledge Expansion Batch 06 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 17 existing Country-only catalog identities plus Cambodia, Romania, and Costa Rica into evidence-backed Plannable countries while adding truthful fixed local image coverage and paying down verified image debt without changing Route Engine behavior.

**Architecture:** Batch 06 follows the established four-wave Knowledge publication pipeline: an exact-title seed drives fail-closed Wikidata/Wikipedia import, positive semantic classification, quarantine, Evidence publication, and Route consumption verification. Image work extends Manifest v2 additively: generated Country graphic covers, neutral placeholders, and only P18/Commons assets whose entity identity, license, source, hash, dimensions, and byte budget can be verified. All reports are derived from published repositories, Evidence JSONL, the image manifest, and generated acceptance artifacts.

**Tech Stack:** Node.js ESM, Wikimedia/Wikidata Action APIs, Wikimedia Commons imageinfo/extmetadata, Route V2 Knowledge Entity Layer, Knowledge Semantic Gate, JSON/JSONL, local SVG/JPEG/WebP assets, browser E2E, Git.

---

### Task 1: Freeze the baseline and publish the candidate contract

**Files:**
- Create: `data/knowledge/seeds/knowledge-expansion-batch06-20-country.json`
- Create: `docs/superpowers/plans/2026-08-17-route-v2-knowledge-expansion-batch06.md`
- Create: `data/knowledge/reports/knowledge-expansion-batch06-baseline.json`
- Read: `.route-v2-cache/accepted-routes.json`
- Read: `.route-v2-cache/route-evidence.json`
- Read: `route-v2-cache-manifest-v2.json`

- [ ] **Step 1: Recompute the baseline from production repositories**

Run a Node ESM audit using `createPublishedKnowledgeEntityLayerRepository()`, `createKnowledgeCoverageSemantics()`, Evidence JSONL, and `image-coverage-manifest.json`.

Expected: 55 Catalog / 38 Plannable / 35 Evidence-backed / 306 City / 2,101 POI / 2,462 entities / 414 Transport / 156 Month Risk / 411 needsBackfill.

- [ ] **Step 2: Define the 20-country scope**

Encode AD/AE/AR/BR/CD/CL/UY/EG/FJ/IL/IN/KE/MA/NG/RU/SA/ZA plus KH/RO/CR. China remains Catalog-only because the existing Search V1 contract intentionally blocks China; Uruguay supplies the twentieth plannable target without changing Route Engine policy. Each country record must carry `tier`, `selectionReason`, `currentStatus`, `targetStatus`, exact Country QID, ISO metadata when the Country is new, and exact English Wikipedia City titles.

- [ ] **Step 3: Record the protected baseline**

Store Accepted `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, Formal Evidence `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, Immutable aggregate `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, Cache 331, Runtime State 329, Metrics absent, and the unchanged stash message.

### Task 2: Implement the Batch 06 fail-closed Knowledge importer

**Files:**
- Create: `scripts/import-knowledge-expansion-batch06-wave.mjs`
- Create: `data/knowledge/batches/countries.p1a-batch06.json`
- Create: `data/knowledge/batches/cities.p1b-batch18.json`
- Create: `data/knowledge/batches/cities.p1b-batch19.json`
- Create: `data/knowledge/batches/cities.p1b-batch20.json`
- Create: `data/knowledge/batches/cities.p1b-batch21.json`
- Create matching POI, selection, provenance, conflict, review-queue, and raw snapshot assets for Waves 1-4
- Modify: `.gitattributes`

- [ ] **Step 1: Fork only the proven Batch 05 importer contract**

Set Batch 06 paths, user agent, four wave numbers 18-21, new-country ISO facts for KH/RO/CR, and local-language Wikipedia fallbacks. Retain exact title resolution, exact P17, coordinates, maximum subclass depth 8, positive City/POI roots, operational-entity rejection, 40 km parent distance, duplicate QID rejection, and one genuine visitor POI publication floor.

- [ ] **Step 2: Add a pre-write global collision gate**

Before atomic writes, compare all new `entityId` and Wikidata IDs against every published entity and all earlier Batch 06 waves. A duplicate, wrong parent, unresolved City, unknown positive type chain, or missing coordinate must throw and leave the prior files intact.

- [ ] **Step 3: Preserve every non-published candidate in quarantine**

Review entries must include stable review ID, country, requested title, QID when available, exact reason codes, parent City, measured distance when available, and `quarantined-not-published` or `accepted-below-target-without-padding` disposition.

- [ ] **Step 4: Track raw snapshots through LFS**

Add only `data/knowledge/raw/knowledge-expansion-batch06-wave*.wikidata.json` to Git LFS; no product image is placed in LFS and no unbounded raw photograph is stored.

### Task 3: Import and validate four Knowledge waves

**Files:**
- Modify/Create: Batch 18 assets for AD/AE/AR/BR/CD
- Modify/Create: Batch 19 assets for CL/UY/EG/FJ/IL
- Modify/Create: Batch 20 assets for IN/KE/MA/NG/RU
- Modify/Create: Batch 21 assets for SA/ZA/KH/RO/CR
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/knowledge/semantic/knowledge-semantic-type-policy.json`

- [ ] **Step 1: Import Wave 1**

Run: `node scripts/import-knowledge-expansion-batch06-wave.mjs --wave=1`

Expected: all five countries have at least one publishable City and each published City has at least one positive, non-operational POI.

- [ ] **Step 2: Import Wave 2**

Run: `node scripts/import-knowledge-expansion-batch06-wave.mjs --wave=2`

Expected: Chile, Uruguay, Egypt, Fiji, and Israel publish without Region/Island entities masquerading as City.

- [ ] **Step 3: Import Wave 3**

Run: `node scripts/import-knowledge-expansion-batch06-wave.mjs --wave=3`

Expected: India, Kenya, Morocco, Nigeria, and Russia publish without airport/prison/police/military padding.

- [ ] **Step 4: Import Wave 4**

Run: `node scripts/import-knowledge-expansion-batch06-wave.mjs --wave=4`

Expected: Saudi Arabia, South Africa, Cambodia, Romania, and Costa Rica publish; KH/RO/CR Country provenance is complete.

- [ ] **Step 5: Rebuild the exact positive type policy**

Run: `node scripts/build-knowledge-semantic-type-policy.mjs`

Expected: all published entities pass their verified P31/P279 chains; no wildcard or unknown-type allowance is introduced.

### Task 4: Add directed transport and objective month-risk Evidence

**Files:**
- Create: `scripts/import-knowledge-expansion-batch06-evidence.mjs`
- Create: `data/knowledge/batches/knowledge-expansion-batch06-evidence-audit.json`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] **Step 1: Resolve seed endpoints to published City IDs**

Reject any Evidence pair whose City is not published, whose countries differ from the reviewed seed, or whose source definition lacks a stable official URL, locator, and factual excerpt.

- [ ] **Step 2: Emit independent directed transport records**

For each reviewed pair, create both directions with distinct IDs. Leave duration, frequency, transfer count, and schedule-dependent facts unknown unless explicitly stated by the source.

- [ ] **Step 3: Emit objective month-risk records**

Create four records per country from official meteorological/government sources. Set `suitabilityStatus` to `unknown` and prohibit best-month or recommendation language.

- [ ] **Step 4: Atomically validate and publish Evidence**

Run all source, schema, reverse-direction, duplicate-ID, and manifest-hash checks before replacing Evidence files.

### Task 5: Extend local image coverage without weakening the sealed baseline

**Files:**
- Create: `scripts/build-route-v2-image-coverage-batch06.mjs`
- Create: `scripts/import-route-v2-dedicated-images-batch06.mjs`
- Create: `data/route-v2/images/batch06-dedicated-image-provenance.json`
- Create: `assets/route-v2-images/countries/<new-country>.svg`
- Create: `assets/route-v2-images/cities/<entity-bound-file>` when verified
- Create: `assets/route-v2-images/pois/<entity-bound-file>` when verified
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `route-v2-image-coverage.js`
- Modify: `data/route-v2/images/image-asset-baseline.json`
- Modify: `ROUTE_V2_IMAGE_ASSET_BASELINE_REPORT.md`

- [ ] **Step 1: Add 20 deterministic Country graphic covers**

Generate the same non-photographic exact-country SVG contract used by Batch 05. Country covers remain Country-only and are never City/POI fallback.

- [ ] **Step 2: Resolve dedicated images only through exact entity P18**

For a City/POI QID, fetch P18, then Commons `imageinfo|extmetadata`. Require a stable Commons page, author when available, a recognized license/usage status, exact source identity, and a fixed local thumbnail. Reject missing or ambiguous identity and retain the neutral placeholder.

- [ ] **Step 3: Enforce the byte budget before publication**

Prefer a UI-sized Commons thumbnail; require ordinary additions to remain at or below 300 KB. Assets above 300 KB enter audit; assets above 500 KB fail unless an exact path+SHA-256+bytes+category+reason+approval exception exists; ordinary Git assets above 5 MB hard fail.

- [ ] **Step 4: Record complete provenance**

Each dedicated record must contain entityId, QID, source URL/identity, author when available, license/usage status, acquiredAt, processed path, source/processed hash, dimensions, bytes, format, and verificationStatus.

- [ ] **Step 5: Preserve neutral fallback semantics**

Unverified entities remain `neutral-placeholder + needsBackfill`. Do not classify Country covers, generated labels, or shared placeholders as dedicated City/POI images.

### Task 6: Verify real Route consumption and browser behavior

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch06-route-consumption.mjs`
- Create: `data/knowledge/reports/knowledge-expansion-batch06-route-consumption.json`
- Create: `data/knowledge/reports/knowledge-expansion-batch06-browser-acceptance.json`

- [ ] **Step 1: Exercise every country through production Search**

For all 20 countries run country-only, country+duration, and country+month/season queries. Require exact country preservation, positive City/POI depth, exact days, no stale Accepted placeholder takeover, and zero external Evidence/image fetch.

- [ ] **Step 2: Exercise representative compound constraints**

Run multi-city, fixed-order, theme, and mixed city-country cases across all four waves. Required City/Country loss or POI substitution for a Country must fail the verifier.

- [ ] **Step 3: Exercise Route to Footprint identity**

Promote representative results through Detail, Trip, completed state, and Footprint; require stable Knowledge entityId/QID and non-zero Country/City counts.

- [ ] **Step 4: Record browser acceptance**

Require stable Detail, Back/Forward, no broken image, no wrong semantic image, console error/warning 0, and runtime external image/Evidence requests 0.

### Task 7: Add dynamic reporting and mandatory release gates

**Files:**
- Create: `scripts/lib/knowledge-expansion-batch06-report-data.mjs`
- Create: `scripts/report-knowledge-expansion-batch06.mjs`
- Create: `scripts/verify-knowledge-expansion-batch06.mjs`
- Create: `scripts/verify-knowledge-expansion-batch06-report-consistency.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_REPORT.md`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_DASHBOARD.md`
- Create: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH06_AUDIT.md`
- Create: `ROUTE_V2_IMAGE_ASSET_SIZE_BATCH06_AUDIT.md`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`
- Modify: `scripts/verify-route-v2-verifier-lifecycle.mjs`

- [ ] **Step 1: Derive every statistic from live repositories**

Calculate Catalog/Plannable/Evidence-backed, Country/City/POI/entity totals, Evidence totals, quarantine, image coverage, image debt, byte distribution, and distance to approximately 195 countries. Do not embed expected report values in the generator.

- [ ] **Step 2: Verify data/report/manifest equality**

Compare all four reports with published Knowledge, Evidence JSONL, Route consumption artifacts, Manifest v2, and filesystem hashes. Mutating a Knowledge, Evidence, dedicated-image, debt, or byte statistic must fail.

- [ ] **Step 3: Add Batch 06 stages to mandatory prelaunch**

Add Knowledge, Route consumption, image/report consistency stages. Non-zero exit, signal, or spawn failure must fail comprehensive based on process status rather than PASS text.

### Task 8: Run the final protected regression matrix

**Files:**
- Verify all modified/new `.js` and `.mjs`

- [ ] **Step 1: Run focused gates**

Run Semantic Gate, Batch 06 Knowledge, Route consumption, Image Manifest, Image Quality, Image Asset Size, Country/City Detail, exact/perceptual duplicate, large binary, Trip/Footprint, report consistency, and Cache Baseline V2.

- [ ] **Step 2: Run comprehensive and failure propagation**

Run `node scripts/verify-route-v2-comprehensive-prelaunch.mjs` and `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`. All mandatory stages and the browser stage must pass.

- [ ] **Step 3: Preserve the performance contract**

Run `node scripts/verify-route-v2-intent-performance.mjs`; final invariant aggregate p95 must remain below 0.25 ms without threshold or aggregation changes.

- [ ] **Step 4: Run syntax and whitespace gates**

Run `node --check` for every changed/new JS/MJS file and `git diff --check`.

- [ ] **Step 5: Re-audit protected state**

Explain legitimate Knowledge/Evidence/image hash changes, confirm tests did not mutate Accepted/Immutable/Runtime State, confirm Metrics remains absent, and confirm `stash@{0}` retains `pre-pr19-merge-local-work-2026-08-10`.

- [ ] **Step 6: Stop with all work unstaged**

Leave staged=0 and do not commit, push, open a PR, merge, deploy, tag, release, or operate on the stash.

### Self-review

- [ ] The plan covers the 17 Catalog-only countries before three new regional-gap countries, four fail-closed waves, exact semantic classification, quarantine, directed Evidence, objective risk, Route consumption, Country covers, truthful dedicated images, remaining debt, byte budgets, duplicate gates, dynamic reports, mandatory release wiring, browser checks, protected assets, and the no-commit boundary.
- [ ] No SearchIntent, RouteIntent, Candidate, Planner core, final invariant, fallback, TravelState, server-security, or performance-contract implementation file is in the planned write set.
- [ ] No placeholder, Country graphic cover, generated text card, or unverified external image is counted as a dedicated City/POI image.
