# Route V2 Sovereign Expansion Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the 18 countries assigned to sovereign expansion Wave 2 as Catalog-only countries while preserving their reviewed City/POI chains as unpublished candidates until independent Evidence exists.

**Architecture:** Extend the existing batch importer with Batch 11 metadata and four isolated candidate waves (batches 38–41). The explicit published registry receives only the Country shard; reports and verifiers enforce that candidate entities never gain production authority and that all 18 countries remain Catalog-only and Evidence-pending.

**Tech Stack:** Node.js 24 ESM, JSON knowledge assets, Wikidata/Wikipedia source snapshots, existing Route V2 schema and semantic validators, Playwright browser assertions.

---

### Task 1: Define Wave 2 seed and importer support

**Files:**
- Create: `data/knowledge/seeds/knowledge-expansion-batch11-18-country.json`
- Create: `scripts/import-sovereign-expansion-wave2.mjs`
- Modify: `scripts/import-knowledge-expansion-batch05-wave.mjs`

- [ ] Add the exact 18 Wave 2 countries from the sealed expansion plan with canonical Wikidata country identities, ISO metadata, and geographically valid destination titles.
- [ ] Assign four fixed candidate batches: 38, 39, 40, and 41.
- [ ] Add Batch 11 language, ISO, and country allowlist support without changing earlier batches.
- [ ] Run each importer wave once and require country/city/POI schema and semantic gates to pass.

### Task 2: Preserve candidate authority and publish Country only

**Files:**
- Create: `data/knowledge/batches/countries.p1a-batch11.json`
- Create: `data/knowledge/batches/cities.p1b-batch38.json` through `cities.p1b-batch41.json`
- Create: `data/knowledge/batches/pois.p1b-batch38.json` through `pois.p1b-batch41.json`
- Create: matching raw, provenance, selection, conflict, and review-queue assets
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`

- [ ] Publish only `countries.p1a-batch11.json`.
- [ ] Keep batches 38–41 absent from published City and POI asset arrays.
- [ ] Recalculate the production totals as 157 Country, 833 City, 3,963 POI, and 4,953 total entities.
- [ ] Verify every candidate entity ID is absent from the runtime repository.

### Task 3: Add Wave 2 reports and fail-closed verification

**Files:**
- Create: `scripts/report-sovereign-expansion-wave2.mjs`
- Create: `scripts/verify-sovereign-expansion-wave2.mjs`
- Create: `data/knowledge/reports/sovereign-expansion-wave2.json`
- Create: `ROUTE_V2_SOVEREIGN_EXPANSION_WAVE2_VALIDATION.md`
- Modify: `scripts/verify-knowledge-coverage-semantics.mjs`
- Modify: `tests/browser/routes.spec.cjs`

- [ ] Record each Wave 2 country as `wave2-catalog-only-evidence-pending`.
- [ ] Assert zero admitted Evidence, zero new Plannable countries, and zero new Evidence-backed countries.
- [ ] Assert exact production counts and candidate isolation.
- [ ] Reject any readiness label containing `plannable`, `route-ready`, or `evidence-backed`.
- [ ] Update coverage and browser count assertions without modifying production Route behavior.

### Task 4: Protect historical and image state

**Files:**
- Verify only: Wave 1 report, Batch09 reports, Git-anchored historical snapshots, image manifest/baseline

- [ ] Confirm Wave 1 remains 139/833/3,963/4,935 and its 20 countries remain Catalog-only.
- [ ] Confirm Batch09 remains 119/833/3,963/4,915 and historical quarantine remains 1,416.
- [ ] Confirm no production image file or image manifest changes.
- [ ] Keep the four excluded browser artifacts and protected stash untouched.

### Task 5: Run deterministic validation

**Files:**
- Test: Wave 2 verifier and existing semantic, parser, Route, stress, image, historical, repository, and browser suites

- [ ] Run the Wave 2 verifier and coverage semantics verifier.
- [ ] Run the semantic gate and POI admission guards.
- [ ] Run parser overlap and homonym regressions.
- [ ] Run Route consumption and hard-constraint stress tests.
- [ ] Run image and historical integrity verifiers.
- [ ] Run repository smoke and browser/runtime assertions once.
- [ ] Run syntax and whitespace checks.
- [ ] Confirm no qualification or formal performance execution occurred.
