# Route V2 Knowledge Expansion Batch 09 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 20 evidence-backed sovereign countries to Route V2 while preserving Batch 08 hard constraints, protected assets, image-debt truth, and fail-closed behavior.

**Architecture:** Reuse the existing four-wave reviewed Knowledge importer, positive Semantic Gate, offline Evidence schemas, production Route Search service, Image Manifest v2, and mandatory prelaunch runner. Add a separate sovereign-state validation layer for coverage accounting; do not change Search, Planner, Candidate ranking, fallback, performance contracts, or runtime networking.

**Tech Stack:** Node.js ESM, JSON/JSONL Knowledge assets, Wikidata acquisition snapshots, local Evidence manifests, Route V2 production modules, browser acceptance verifier, Git LFS, Markdown reports.

---

## File map and selected portfolio

- Batch metadata and baseline: `data/knowledge/reports/knowledge-expansion-batch09-baseline.json`, `data/knowledge/seeds/knowledge-expansion-batch09-20-country.json`
- Four import waves: country batch 09 plus City/POI batches 30–33, raw snapshots, selection, provenance, conflict, and review-queue files
- Sovereignty policy: `data/knowledge/semantic/sovereign-country-policy.json`, `data/knowledge/fixtures/knowledge-expansion-batch09-sovereignty-negative-fixtures.json`
- Evidence: Batch 09 evidence seed/audit plus append-only formal route-leg and season seed files
- Images: 20 local Country covers, manifest/inventory/baseline/size-audit updates; no dedicated City/POI claim without verified imagery
- Verification: Batch 09 Knowledge, sovereignty, semantic adversarial, Route Consumption, hard-constraint stress, browser, and report-consistency verifiers
- Reporting: Batch 09 report-data wrapper, report generator, report, Dashboard, image backfill audit, and size audit
- Release wiring: comprehensive mandatory stages and failure-propagation fixtures

Selected target countries and four waves:

| Wave | Batch | Countries | Region | Planned cities | Planned POIs |
|---|---:|---|---|---:|---:|
| 1 | 30 | Algeria, Ghana, Senegal, Ethiopia, Namibia | Africa | 32–36 | 190–230 |
| 2 | 31 | Botswana, Madagascar, Mauritius, Kazakhstan, Uzbekistan | Africa/Central Asia | 30–35 | 180–220 |
| 3 | 32 | Kyrgyzstan, Bangladesh, Bhutan, Pakistan, Laos | Central/South/Southeast Asia | 31–36 | 190–230 |
| 4 | 33 | Brunei, Honduras, El Salvador, Samoa, Vanuatu | Southeast Asia/Central America/Pacific | 23–29 | 130–175 |

The target set is exactly `DZ, GH, SN, ET, NA, BW, MG, MU, KZ, UZ, KG, BD, BT, PK, LA, BN, HN, SV, WS, VU`. Expected total workload is 116–136 Cities, 690–855 POIs, roughly 140–170 directed Transport records, and exactly 80 Month Risk records. High-risk identity cases are island-country versus island entities (MU/WS/VU/MG), district/province versus City (BT/LA/BN), homonymous settlements (HN/SV/GH), and country/territory accounting. Uncertain records are quarantined rather than published.

### Task 1: Freeze dynamic baseline and country-gap selection

**Files:**
- Create: `data/knowledge/reports/knowledge-expansion-batch09-baseline.json`
- Create: `data/knowledge/seeds/knowledge-expansion-batch09-20-country.json`
- Create: `scripts/verify-knowledge-expansion-batch09.mjs`

- [ ] **Step 1: Write the failing Batch 09 verifier**

Assert main SHA `2a079974aae8864dba3ce828b2a97b322f49f2bb`, 99/718/4,766/5,583 BEFORE totals, 101 Route Consumption cases, image assets 977, debt 188, China catalog-only, 20 unique target codes/QIDs, and no overlap with published Countries.

- [ ] **Step 2: Run the verifier and confirm it fails only for missing Batch 09 assets**

Run: `node scripts/verify-knowledge-expansion-batch09.mjs`

Expected: non-zero exit naming missing Batch 09 seed/publication files; no baseline mismatch.

- [ ] **Step 3: Record the baseline and target seed**

Use four waves with batch numbers `30`, `31`, `32`, `33`; store exact ISO alpha-2/alpha-3/numeric values, sovereign QID, region/subregion, tier, city titles, selection reason, and expected city depth for all 20 targets.

- [ ] **Step 4: Run the verifier to the first expected publication failure**

Run: `node scripts/verify-knowledge-expansion-batch09.mjs`

Expected: baseline and target selection pass; missing imported publications fail.

### Task 2: Import four reviewed Knowledge waves

**Files:**
- Modify: `scripts/import-knowledge-expansion-batch05-wave.mjs`
- Create: `scripts/import-knowledge-expansion-batch09-wave.mjs`
- Create: `data/knowledge/batches/countries.p1a-batch09.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch09-wave1.wikidata.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch09-wave2.wikidata.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch09-wave3.wikidata.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch09-wave4.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch30.json` through `cities.p1b-batch33.json`
- Create: `data/knowledge/batches/pois.p1b-batch30.json` through `pois.p1b-batch33.json`
- Create: `data/knowledge/batches/selection.p1b-batch30.json` through `selection.p1b-batch33.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch09-wave1.json` through wave 4
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch09-wave1.json` through wave 4
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch09-wave1.json` through wave 4

- [ ] **Step 1: Add the minimal Batch 09 wrapper**

```js
if (!process.argv.some((value) => value.startsWith("--batch="))) {
  process.argv.push("--batch=09");
}

await import("./import-knowledge-expansion-batch05-wave.mjs");
```

- [ ] **Step 2: Extend only the importer batch/ISO/local-language configuration**

Keep entity IDs deterministic. Require exact English Wikipedia title resolution, positive P31/P279 City or POI type, P17 country match, coordinates, parent-distance limits, visitor suitability, and duplicate-QID rejection.

- [ ] **Step 3: Run waves 1–4 and retain raw snapshots**

Run once per wave: `node scripts/import-knowledge-expansion-batch09-wave.mjs --wave=N` for `N=1..4`.

Expected: each wave writes only its raw/import/review files; ambiguous entities appear only in review queues.

- [ ] **Step 4: Audit quarantine output**

Reject Country/Region/Island-as-City, Country/City-as-POI, airports without visitor value, prisons, police/military/medical operations, distant POIs, duplicate QIDs, and wrong-country parents. Every published City must have at least one safe POI.

### Task 3: Add sovereign-state and semantic fail-closed gates

**Files:**
- Create: `data/knowledge/semantic/sovereign-country-policy.json`
- Create: `data/knowledge/fixtures/knowledge-expansion-batch09-sovereignty-negative-fixtures.json`
- Create: `data/knowledge/fixtures/knowledge-expansion-batch09-semantic-negative-fixtures.json`
- Create: `scripts/verify-knowledge-expansion-batch09-sovereignty.mjs`
- Create: `scripts/verify-knowledge-expansion-batch09-semantic-adversarial.mjs`
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`

- [ ] **Step 1: Define explicit sovereignty accounting**

The policy records the 195-state reference set, exact ISO/QID identity, `sovereign`, `catalogOnly`, and `plannable` flags. Territories, dependencies, autonomous regions, disputed regions, and constituent countries never increment sovereign coverage.

- [ ] **Step 2: Add sovereignty mutations**

Cover territory-as-country, region-as-country, constituent-country-as-sovereign, duplicate sovereign QID, changed ISO code, and changed QID. Every mutation must exit non-zero.

- [ ] **Step 3: Add the 12 required semantic mutations**

Cover Country-as-POI, City-as-POI, Region-as-City, Island-as-City, wrong-country City, cross-country homonym, duplicate QID, territory-as-sovereign, wrong POI parent, quarantined publication, alias duplicate, and invalid geography.

- [ ] **Step 4: Publish batches 09 and 30–33 and update totals from files**

Register the new assets only after the four imported sets pass schema and parent-reference validation.

- [ ] **Step 5: Run semantic and sovereignty gates**

Run: `node scripts/verify-knowledge-expansion-batch09-sovereignty.mjs`, `node scripts/verify-knowledge-expansion-batch09-semantic-adversarial.mjs`, and `node scripts/verify-knowledge-semantic-gate.mjs`.

Expected: all published entities pass; all negative fixtures fail for the intended reason.

### Task 4: Add directed Transport and Month/Season Evidence

**Files:**
- Modify: `scripts/import-knowledge-expansion-batch06-evidence.mjs`
- Create: `scripts/import-knowledge-expansion-batch09-evidence.mjs`
- Create: `data/knowledge/seeds/knowledge-expansion-batch09-evidence.json`
- Create: `data/knowledge/batches/knowledge-expansion-batch09-evidence-audit.json`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] **Step 1: Add the Batch 09 evidence wrapper**

```js
if (!process.argv.some((value) => value.startsWith("--batch="))) {
  process.argv.push("--batch=09");
}

await import("./import-knowledge-expansion-batch06-evidence.mjs");
```

- [ ] **Step 2: Record official route sources and objective climate sources**

Each directed leg has independent identity, direction, mode, source, and only source-supported duration/range. Unknown duration, frequency, transfer count, and suitability remain null/unknown. Each country receives four objective Month Risk records covering locally relevant monsoon, wet/dry, heat, cyclone, altitude, or access hazards.

- [ ] **Step 3: Import evidence in one isolated run**

Run: `node scripts/import-knowledge-expansion-batch09-evidence.mjs`.

Expected: the audit matches exact appended record counts and no duplicate evidence IDs exist.

### Task 5: Extend safe local Country imagery and freeze historical debt

**Files:**
- Create: `assets/route-v2-images/countries/country-{dz,gh,sn,et,na,bw,mg,mu,kz,uz,kg,bd,bt,pk,la,bn,hn,sv,ws,vu}.svg`
- Modify: `data/route-v2/images/image-coverage-manifest.json`
- Modify: `data/route-v2/images/image-debt-inventory.json`
- Modify: `data/route-v2/images/image-asset-baseline.json`
- Modify: `data/route-v2/images/image-asset-size-audit.json`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md`
- Modify: `ROUTE_V2_IMAGE_ASSET_BASELINE_AUDIT.md`

- [ ] **Step 1: Add 20 non-photographic Country-semantic covers**

Use the existing local Country template system. Do not count Country covers or neutral placeholders as dedicated City/POI assets.

- [ ] **Step 2: Assign missing imagery to neutral placeholders**

For each new City/Core POI without verified imagery, write `needsBackfill=true`, an entity-bound debt record, and a concrete failure reason. Keep the historical 13 debt records byte-for-byte semantically unchanged.

- [ ] **Step 3: Regenerate image baseline and audits**

Run existing manifest, quality, debt-freeze, size, large-binary, and duplicate verifiers.

Expected: invalidMapping, external runtime image requests, broken images, and wrong semantic images remain zero; size rules remain unchanged.

### Task 6: Add production Route Consumption and constraint stress

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch09-route-consumption.mjs`
- Create: `scripts/verify-knowledge-expansion-batch09-hard-constraint-stress.mjs`
- Create: `scripts/verify-route-v2-batch09-adversarial.mjs`
- Create: `data/knowledge/reports/knowledge-expansion-batch09-route-consumption.json`
- Create: `data/knowledge/reports/knowledge-expansion-batch09-hard-constraint-stress.json`

- [ ] **Step 1: Write failing production-consumption cases**

Include every target at 7 days, Tier 1 at 14/21 days, explicit multi-city, fixed order, month/season, representative themes, destination-less month/season, bare `2`, and unknown destinations. Assert identities, POI/evidence use, and hard constraints—not merely non-empty results.

- [ ] **Step 2: Add realistic multi-country cases**

Use Kazakhstan→Uzbekistan, Ghana→Senegal only when evidence supports the chosen endpoints, and Honduras→El Salvador. Require all explicit countries, no duplicate City/Country, and stable Trip identities.

- [ ] **Step 3: Generate deterministic stress cases**

Cover tropical months, remote/island countries, single-city capacity, explicit country lists, missing cross-border evidence, homonyms, territory ambiguity, impossible duration, insufficient POI capacity, and missing evidence. Enforce single-country 45/8/24 and multi-country 60/6/12/36 limits.

- [ ] **Step 4: Run production and historical constraint suites**

Expected: feasible queries preserve all hard constraints; impossible or unsupported requests fail closed without Accepted/fallback weakening.

### Task 7: Prove Route → Detail → Trip → Footprint and browser safety

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch09-browser.mjs`
- Create: `data/knowledge/reports/knowledge-expansion-batch09-browser-acceptance.json`

- [ ] **Step 1: Run the 20-country browser matrix**

Exercise Search, Country Detail, City Detail, Route Detail, Trip, and Footprint for all 20 targets plus five targeted constraint queries, one multi-country route, one compact/single-city route, and one placeholder entity.

- [ ] **Step 2: Verify Trip/Footprint identity**

Complete Kazakhstan→Uzbekistan or Honduras→El Salvador. Assert stable country/city entityId and QID, identical route/trip city counts, no repeated accumulation, and consistent delete/regenerate behavior.

- [ ] **Step 3: Enforce browser safety counters**

Require console errors/warnings, broken images, wrong semantic images, external Evidence requests, and runtime external image requests to equal zero.

### Task 8: Generate dynamic reports and mandatory release wiring

**Files:**
- Create: `scripts/lib/knowledge-expansion-batch09-report-data.mjs`
- Create: `scripts/report-knowledge-expansion-batch09.mjs`
- Create: `scripts/verify-knowledge-expansion-batch09-report-consistency.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_REPORT.md`
- Modify: `ROUTE_V2_KNOWLEDGE_COVERAGE_DASHBOARD.md`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Add the report-data wrapper**

```js
import { calculateKnowledgeExpansionReportData, comma, percent } from "./knowledge-expansion-batch07-report-data.mjs";

export function calculateBatch09ReportData({ root } = {}) {
  return calculateKnowledgeExpansionReportData({ root, batchNumber: 9 });
}

export { comma, percent };
```

- [ ] **Step 2: Generate BEFORE/AFTER and per-country truth dynamically**

Report Country/City/POI/entities, Transport, Month Risk, Route Consumption, image debt, Batch 09 deltas, sovereign coverage, quarantine counts, and China catalog-only from manifests and published assets.

- [ ] **Step 3: Add report mutations**

Wrong totals, swapped cumulative/addition values, territory counted sovereign, China counted plannable, placeholder counted dedicated, historical debt rewritten, or stale Route/Browser results must fail.

- [ ] **Step 4: Wire all Batch 09 gates as mandatory**

Add Knowledge, sovereignty, semantic adversarial, Route Consumption, hard stress, browser, and report consistency. Failure propagation must inject non-zero, signal, and spawn failures and require comprehensive to exit non-zero without parsing PASS text.

### Task 9: Final regression and protected-asset audit

**Files:**
- Verify: every file listed above

- [ ] **Step 1: Run Batch 09 and cumulative gates**

Run Batch 09 verifier, sovereignty, full Semantic Gate, Evidence validation, Route Consumption, hard stress, Trip/Footprint, all image gates, report consistency, Cache Baseline V2, comprehensive, and failure propagation.

- [ ] **Step 2: Run syntax and whitespace checks**

Run `node --check` for every changed/new JS/MJS file, Python syntax checks for changed/new Python files, and `git diff --check`.

- [ ] **Step 3: Run one same-host performance comparison**

Keep `aggregate p95 < 0.25ms` and its aggregation semantics unchanged. If Windows jitter affects both baseline and Batch 09, record the one-run A/B result without repeated reruns for an accidental PASS.

- [ ] **Step 4: Recheck protected assets and Git state**

Require Accepted `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, Formal Evidence `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, Immutable `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, Cache 331, Runtime State 329, Metrics 0, staged 0, and unchanged `stash@{0}`.

- [ ] **Step 5: Deliver the phase result without committing**

Report exact BEFORE/AFTER totals, sovereign/plannable counts, additions, evidence, route/stress/browser results, image debt delta with the historical 13 frozen, protected assets, and Git state. End with `BATCH 09 READY FOR FINAL REVIEW` only if no P0/P1 remains; otherwise end with `BLOCKED`.
