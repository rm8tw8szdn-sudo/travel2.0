# Route V2 Batch 05 Final Review Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan inline, task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Country-cover fallback from City Detail and make every Batch 05 report claim derive from published data and the image manifest.

**Architecture:** City Detail will resolve only an exact verified City image from `RouteV2ImageCoverage`, otherwise the shared neutral City placeholder. A shared read-only report-data module will calculate Knowledge, Evidence, and image totals; the report generator and consistency verifier will consume that same contract. Two new mandatory release stages will exercise real Chromium City Detail rendering and report mutation rejection.

**Tech Stack:** Browser JavaScript, Node.js ESM, Chrome DevTools Protocol, Markdown reports, existing Route V2 verifier gate.

---

### Task 1: Close City Detail image fallback

**Files:**
- Modify: `city-detail.js`
- Create: `scripts/verify-route-v2-city-detail-image-fallback.mjs`

- [ ] **Step 1: Add the failing browser assertion**

Launch an isolated preview and headless Chromium, load `GB-LON`, `JP-NAR`, `DE-BER`, `NO-OSL`, and `JP-TYO`, then require every rendered cover to equal `assets/route-city-placeholder.svg`, have positive natural dimensions, produce no console error/warning, and issue no external request.

- [ ] **Step 2: Verify the current Country fallback fails**

Run: `node scripts/verify-route-v2-city-detail-image-fallback.mjs`

Expected: non-zero because London/Nara resolve `assets/route-v2-images/countries/*.svg`.

- [ ] **Step 3: Implement manifest-only City cover selection**

Use this contract in `city-detail.js`:

```js
const coverage = globalThis.RouteV2ImageCoverage?.cityByEntityId?.[entityId];
const cover = coverage?.status === "imageReady"
  && coverage.assetKind === "verified-destination-image"
  && coverage.semanticScope === "exact-city"
  ? coverage.assetPath
  : globalThis.RouteV2ImageCoverage?.fallbackPolicy?.city || "assets/route-city-placeholder.svg";
```

Never consult `country.cover`, legacy City photos, POI images, or external URLs. Reapply the same rule after the Knowledge API resolves the published City entityId.

- [ ] **Step 4: Run the City Detail verifier**

Run: `node scripts/verify-route-v2-city-detail-image-fallback.mjs`

Expected: PASS for all five Cities, zero broken images, external requests, errors, and warnings.

### Task 2: Derive the Batch 05 report from source assets

**Files:**
- Create: `scripts/lib/knowledge-expansion-batch05-report-data.mjs`
- Modify: `scripts/report-knowledge-expansion-batch05.mjs`
- Modify: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md`
- Modify: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_DASHBOARD.md`

- [ ] **Step 1: Add a shared calculation contract**

Read published Knowledge, Batch 05 wave assets, Evidence records, cross-border audit, route-consumption/browser reports, and the image manifest. Return totals, additions, Evidence counts, Country/City/POI image counts, placeholders, debt, invalid mappings, and Batch 05 trusted local-image count.

- [ ] **Step 2: Replace report literals with calculated values**

Render the report using the shared values, explicitly stating zero dedicated City and POI images and that London uses the neutral placeholder. Treat Country label cards only as Country graphics.

- [ ] **Step 3: Regenerate both Markdown outputs**

Run: `node scripts/report-knowledge-expansion-batch05.mjs`

Expected: 55/306/2101/2462 totals, 4/162/1197 additions, 218/80 Evidence, 38 Country graphics, 0/306 City dedicated, 0/105 POI dedicated, and 411 debt.

### Task 3: Enforce report consistency in the release gate

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch05-report-consistency.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Compare all published report surfaces**

Require the main report, Dashboard, and Image Backfill Audit to contain the exact calculated Knowledge, Evidence, coverage, placeholder, debt, and invalid-mapping values. Reject obsolete dedicated-image claims.

- [ ] **Step 2: Add real mutation propagation**

Create temporary copies with the report POI count and dedicated-City count changed, run the registered report verifier through `runMandatoryVerifierStage`, and require a non-zero comprehensive-stage result for both mutations.

- [ ] **Step 3: Register both mandatory stages**

Register the City Detail browser verifier and report consistency verifier as static stages. Expected mandatory count: 44; total comprehensive scripts including live prelaunch: 45.

### Task 4: Final verification and browser acceptance

**Files:**
- Verify only; do not stage or commit.

- [ ] **Step 1: Run targeted gates**

Run the City Detail, image manifest, image quality, report consistency, Batch 05, route consumption, Semantic Gate, Trip/Footprint, Cache Baseline, and failure-propagation verifiers. Every command must exit zero.

- [ ] **Step 2: Run comprehensive and static checks**

Run `node scripts/verify-route-v2-comprehensive-prelaunch.mjs`, `node --check` for every changed/new JS/MJS file, and `git diff --check`. Expected: 44/44 mandatory and 45 total scripts.

- [ ] **Step 3: Perform real browser acceptance**

Inspect London, Nara, one Batch 05 City, Route Card, Route Detail, Trip, and Footprint. Require neutral City placeholders, no broken images, zero external image requests, zero console errors/warnings, and Germany/Austria Footprint 2 Countries / 6 Cities.

- [ ] **Step 4: Re-audit protected assets and Git**

Confirm Accepted, Immutable Cache, Formal Evidence, Cache/Runtime counts, Metrics absence, stash message, staged zero, and no commit/push/PR/deploy/tag.
