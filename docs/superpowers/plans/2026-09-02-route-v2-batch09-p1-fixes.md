# Route V2 Batch 09 P1 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Batch 09 POI semantic-admission false-pass and prevent later batches from rewriting sealed Batch 05–08 reports.

**Architecture:** Make POI admission require a specific visitor-facing type path: direct `building`, `architectural structure`, or `facility` roots are insufficient, and operational types require an independent visitor type or an exact reviewed allowance. Reconcile every currently published broad-only POI into a quarantine audit, then protect historical reports with canonical sealed hashes while keeping the Batch 09 report tied to current dynamic truth.

**Tech Stack:** Node.js ES modules, JSON Knowledge assets, Git-sealed Markdown snapshots, Route V2 mandatory verifier gate.

---

### Task 1: Centralize positive POI admission

**Files:**
- Create: `src/lib/routes/knowledge-poi-semantic-admission.mjs`
- Modify: `src/lib/routes/knowledge-semantic-gate.mjs`
- Modify: `scripts/import-knowledge-expansion-batch05-wave.mjs`
- Modify: `scripts/build-knowledge-semantic-type-policy.mjs`
- Test: `scripts/verify-knowledge-expansion-batch09-semantic-adversarial.mjs`

- [ ] **Step 1: Add failing semantic mutations**

Add production-path cases whose semantic facts use `Q40357` for prison/detention, direct `Q41176` for generic-building-only, and `Q33506` plus `Q41176` for a legitimate museum building. Assert the first three return `instance-type-not-allowed` and the museum case remains accepted.

- [ ] **Step 2: Run the mutation verifier and confirm the direct building case fails open**

Run: `node scripts/verify-knowledge-expansion-batch09-semantic-adversarial.mjs`

Expected before implementation: FAIL because a direct `Q41176` path is accepted.

- [ ] **Step 3: Implement the shared admission rule**

Export these reviewed families and one evaluator:

```js
export const BROAD_STRUCTURAL_POI_ROOT_QIDS = Object.freeze(["Q41176", "Q811979", "Q13226383"]);
export const OPERATIONAL_POI_TYPE_QIDS = Object.freeze(["Q1248784", "Q62447", "Q695850", "Q55488", "Q928830", "Q728937", "Q5503", "Q18325841", "Q2678338", "Q2516436", "Q15984860", "Q44782", "Q3918", "Q16917", "Q40357", "Q861951", "Q917182"]);

export function evaluatePoiTypePaths(paths = []) {
  const broadOnly = paths.length > 0 && paths.every((path) => path.length === 1 && BROAD_STRUCTURAL_POI_ROOT_QIDS.includes(path[0]));
  const operational = paths.some((path) => path.some((qid) => OPERATIONAL_POI_TYPE_QIDS.includes(qid)));
  const independentVisitorPath = paths.some((path) => !path.some((qid) => OPERATIONAL_POI_TYPE_QIDS.includes(qid))
    && !(path.length === 1 && BROAD_STRUCTURAL_POI_ROOT_QIDS.includes(path[0])));
  return { accepted: !broadOnly && (!operational || independentVisitorPath), broadOnly, operational, independentVisitorPath };
}
```

Use this evaluator both when the importer selects candidates and when the production Semantic Gate validates published POIs. Preserve the existing exact composite-allowance escape hatch for reviewed dual-purpose entities.

- [ ] **Step 4: Keep the policy generator from reintroducing broad-only classifications**

Filter generated POI paths through `evaluatePoiTypePaths([path])`; do not remove visitor roots such as museum, monument, attraction, place of worship, park, archaeological site, or heritage.

- [ ] **Step 5: Re-run semantic mutations**

Run: `node scripts/verify-knowledge-expansion-batch09-semantic-adversarial.mjs`

Expected: prison, detention, and generic-building-only are rejected; museum-building is accepted.

### Task 2: Reconcile every published broad-only POI

**Files:**
- Create: `scripts/reconcile-knowledge-poi-positive-admission.mjs`
- Create: `scripts/verify-knowledge-poi-positive-admission.mjs`
- Create: `data/knowledge/reports/knowledge-poi-positive-admission-audit.json`
- Modify: matching `data/knowledge/batches/pois.p1b-*.json` files
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`

- [ ] **Step 1: Implement a read-only 5,379-POI classifier**

Classify each published POI as `visitor-specific`, `broad-structural-only`, `operational-without-visitor-type`, or `identity-unsafe`. Record exact entity/QID/parent/source/type paths in the audit.

- [ ] **Step 2: Reconcile unsafe admissions**

Remove every `broad-structural-only`, `operational-without-visitor-type`, and `identity-unsafe` record from published POI arrays. Preserve it in the quarantine audit with its reason; do not substitute a different POI merely to retain counts.

- [ ] **Step 3: Verify the repaired publication set**

Run: `node scripts/verify-knowledge-poi-positive-admission.mjs`

Expected: all remaining published POIs have specific visitor-facing admission, every quarantined entity is absent from product consumption, and Q17624835 is classified `operational-in-name-and-broad-structural-only`.

- [ ] **Step 4: Recalculate totals and dependent image manifests**

Update `KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS`, run the existing Batch 09 image coverage builder, and retain the exact dynamically calculated Country/City/POI/entity/Core-POI/needsBackfill values.

### Task 3: Restore immutable Batch 05–08 history

**Files:**
- Restore from merge `8f63d1f`: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_REPORT.md`, `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_DASHBOARD.md`
- Restore from merge `034a40e`: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_REPORT.md`, `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH06_DASHBOARD.md`, `ROUTE_V2_IMAGE_ASSET_SIZE_BATCH06_AUDIT.md`
- Restore from merge `c2e7fb1`: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_REPORT.md`, `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH07_DASHBOARD.md`, `ROUTE_V2_IMAGE_ASSET_SIZE_BATCH07_AUDIT.md`, `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH07_AUDIT.md`
- Restore from merge `2a07997`: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_REPORT.md`, `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH08_DASHBOARD.md`, `ROUTE_V2_IMAGE_ASSET_SIZE_BATCH08_AUDIT.md`, `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_BATCH08_AUDIT.md`
- Create: `data/knowledge/reports/historical-sealed-report-baselines.json`
- Create: `scripts/verify-knowledge-historical-report-immutability.mjs`
- Modify: `scripts/verify-knowledge-expansion-batch05-report-consistency.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`

- [ ] **Step 1: Restore each report from its actual merge tree**

Use the four merge SHAs above as the source of truth. Preserve each sealed report's Knowledge, Evidence, route, image-debt, performance, asset-hash, and final-status values.

- [ ] **Step 2: Seal canonical hashes**

Store for each historical file its path, sealing commit, and SHA-256 after normalizing only CRLF/CR to LF. Do not trim or ignore any other text change.

- [ ] **Step 3: Implement the immutable gate**

The verifier reads the manifest, canonicalizes line endings, checks exact hashes, verifies `Batch N AFTER = Batch N+1 BEFORE` where structured baselines expose matching fields, and exits nonzero on any mismatch.

- [ ] **Step 4: Add report mutations**

Mutate in memory: Batch 08 Knowledge to Batch 09 totals, Batch 08 image debt `13` to `188`, one Batch 07 key count, and one Batch 06 Evidence value. All four must fail. A current Batch 09 total change with unmodified historical files must pass.

### Task 4: Regenerate truthful Batch 09 current reporting

**Files:**
- Modify: `scripts/lib/knowledge-expansion-batch09-report-data.mjs`
- Modify: `scripts/report-knowledge-expansion-batch09.mjs`
- Modify: `scripts/verify-knowledge-expansion-batch09-report-consistency.mjs`
- Modify: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_REPORT.md`
- Modify: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH09_DASHBOARD.md`
- Modify: `ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md`

- [ ] **Step 1: Separate the three debt concepts**

Expose `sealedImageDebt = 13`, `batchBeforeNeedsBackfill = 188`, and `batchAfterNeedsBackfill = current manifest value` as distinct named fields.

- [ ] **Step 2: Report semantic removals separately from additions**

Render Batch 09 additions, semantic quarantines, and net current totals independently so the equation `before + additions - quarantines = after` is explicit.

- [ ] **Step 3: Verify current truth without rewriting history**

Keep the Batch 09 report tied to the current repository/manifest, call the historical immutable verifier, and remove every requirement that old reports equal current totals.

### Task 5: Run the bounded release regression

**Files:**
- Verify only; do not commit, push, merge, deploy, or operate the stash.

- [ ] **Step 1: Run semantic and data checks**

Run the full Semantic Gate, Batch 09 semantic mutations, positive-admission scan, Batch 09 verifier, Route Consumption, hard-constraint stress, and Trip/Footprint.

- [ ] **Step 2: Run reports and image checks**

Run the historical immutable gate, Batch 05–09 report consistency, report mutations, Image Manifest, Image Debt freeze, and Cache Baseline V2.

- [ ] **Step 3: Run release wiring checks**

Run comprehensive once, record (without retrying) any environment-sensitive performance result, then run failure propagation, browser-focused regression, Node syntax checks, `git diff --check`, and `git lfs fsck`.

- [ ] **Step 4: Confirm protected state**

Confirm Accepted `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, Formal Evidence `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, Immutable `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, Cache 331, Runtime State 329, Metrics 0, staged 0, and unchanged `stash@{0}`.
