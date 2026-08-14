# Route V2 Batch 05 Adversarial Final Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently challenge Batch 05 Knowledge, Route, image semantics, and release integrity, repair only reproducible defects, and leave the uncommitted review workspace ready for final review.

**Architecture:** The audit separates source-data semantics, Route hard constraints, visual asset truthfulness, and browser consumption so one verifier cannot self-certify its own output. Permanent adversarial checks derive expectations from published entities and raw Wikidata evidence, while browser inspection verifies actual rendering and network behavior. Formal Accepted, immutable Cache/Evidence, Runtime State, and stash remain read-only.

**Tech Stack:** Node.js ES modules, Route V2 Knowledge repositories and gates, local JSON/JSONL evidence, SVG assets, in-app browser automation, Git read-only checks.

---

### Task 1: Freeze the review baseline

**Files:**
- Read: `.route-v2-cache/accepted-routes.json`
- Read: `.route-v2-cache/route-evidence.json`
- Read: `data/knowledge/batches/*.json`
- Read: `data/route-v2/images/image-coverage-manifest.json`

- [ ] Record SHA-256 for Accepted, immutable Evidence, formal Evidence, and the Cache Baseline V2 aggregate.
- [ ] Record current branch, HEAD, staged count, tracked/untracked counts, and `stash@{0}` message.
- [ ] Confirm no repository server or browser process is writing to `.route-v2-cache`.

### Task 2: Challenge Batch 05 Knowledge semantics independently

**Files:**
- Create if a coverage gap is confirmed: `scripts/verify-knowledge-expansion-batch05-adversarial.mjs`
- Read: `data/knowledge/batches/cities.p1b-batch14.json` through `cities.p1b-batch17.json`
- Read: `data/knowledge/batches/pois.p1b-batch14.json` through `pois.p1b-batch17.json`
- Read: `data/knowledge/raw/knowledge-expansion-batch05-wave*.wikidata.json`
- Read: `data/knowledge/semantic/knowledge-semantic-type-policy.json`

- [ ] Recompute unique entity/QID, parent-country, parent-city, coordinate bounds, and POI distance invariants from published files rather than generated reports.
- [ ] Cross-check every Batch 05 City and POI QID against the raw Wikidata P31/P17/coordinate snapshot and positive subclass path.
- [ ] Query the official Wikidata API in bounded batches for a current sample covering every country and every accepted P31 family; fail closed on changed country/type semantics.
- [ ] Inject negative objects for region-as-city, island-as-city, attraction-as-city, wrong-country city, wrong-parent POI, distant POI, borrowed exception, and unknown subclass chain; require every mutation to fail.

### Task 3: Challenge Evidence and Route constraints

**Files:**
- Create if a coverage gap is confirmed: `scripts/verify-knowledge-expansion-batch05-route-adversarial.mjs`
- Read: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Read: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Read: `src/lib/routes/search-intent-parser.mjs`
- Read: `src/lib/routes/route-intent-invariant-gate.mjs`
- Read: `src/lib/routes/route-fallback-constraint-validator.mjs`

- [ ] Verify both directions of each Batch 05 transport pair have distinct IDs, correct endpoint countries/cities, trusted sources, and no invented duration/frequency/transfer values.
- [ ] Generate adversarial single-country, single-city, multi-city, multi-country, mixed city/country, fixed-order, region/island, month, season, and long-trip searches from the published catalog.
- [ ] Mutate successful results by deleting/reordering required cities or countries, replacing a City with a POI/Region, changing exact days/month/season, and routing through fallback; require production gate and independent Oracle to reject consistently.
- [ ] Verify Route to Detail to Trip to completed Footprint preserves entityId/QID and country/city counts.

### Task 4: Audit actual image content and duplicate behavior

**Files:**
- Modify: `scripts/build-route-v2-image-coverage-batch05.mjs`
- Modify: `scripts/verify-route-v2-image-coverage-batch05.mjs`
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `route-v2-image-coverage.js`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md`
- Create: `ROUTE_V2_BATCH05_ADVERSARIAL_AUDIT.md`

- [ ] Render and inspect all 20 Batch 05 Country covers, all 60 Batch 05 City cards, all 105 POI cards, historical newly generated cards, and the neutral placeholder in contact sheets.
- [ ] Compute exact hashes and normalized SVG-structure hashes; report byte-identical and template-identical groups separately.
- [ ] Reject any asset with mismatched entity text, corrupt text, external URL, embedded raster, watermark/logo, geographic claim not supported by the bound entity, or misleading dedicated-photo classification.
- [ ] Reclassify generated abstract City/POI text cards as backfill debt and route missing City imagery to the shared neutral placeholder; do not count them as dedicated destination imagery.
- [ ] Keep exact local Country graphic covers only with explicit `assetKind` metadata so graphic coverage cannot be confused with verified destination photography.
- [ ] Derive `invalidMappingCount`, duplicate counts, and coverage totals from audited records instead of hard-coding zero.

### Task 5: Perform real browser acceptance

**Files:**
- Read: `routes.html`
- Read: `route-detail.html`
- Read: `mobile.html`
- Read: `city-oslo.html`

- [ ] Start the existing local server with Accepted, cache, metrics, evidence, and browser state redirected to one isolated temporary directory.
- [ ] Inspect country cards, route cards, Route Detail, City Detail, POI rendering, Trip, and Footprint for representative Batch 05 and historical entities.
- [ ] Hold detail pages for at least five seconds, test Back/Forward, inspect image box dimensions and object-fit behavior, and verify no broken or misleading image is displayed.
- [ ] Require Console errors/warnings = 0 and external Evidence/image requests = 0.
- [ ] Stop the server and remove only the isolated test directory from the repository boundary.

### Task 6: Re-run release gates and seal the audit

**Files:**
- Modify: `ROUTE_V2_BATCH05_ADVERSARIAL_AUDIT.md`

- [ ] Run the new adversarial Knowledge/Route/image checks plus Semantic Gate, mutation suite, RouteIntent Oracle, fallback, Trip/Footprint, Batch 05 integrity/consumption, and Cache Baseline V2.
- [ ] Run every modified/new JS/MJS file with `node --check` and run `git diff --check`.
- [ ] Run `node scripts/verify-route-v2-comprehensive-prelaunch.mjs`; require all stages to exit zero.
- [ ] Compare all protected hashes and file counts to Task 1.
- [ ] Report Country Entity count, Plannable Country count, Route Knowledge-complete count, image error/fix counts, dedicated/placeholder/backfill counts by country, visual sample count, Git state, and stash state.
- [ ] Do not stage, commit, push, create a PR, merge, deploy, tag, release, start Batch 06, or operate on stash.
