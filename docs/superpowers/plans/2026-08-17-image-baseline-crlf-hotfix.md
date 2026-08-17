# Image Baseline CRLF Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Image Asset Baseline generated-artifact verification accept LF, CRLF, and CR representations of identical text while continuing to reject every real content change.

**Architecture:** Reuse the existing `normalizeKnowledgeBaselineText()` canonical-LF helper rather than add another line-ending implementation. Keep the comparison adapter local to the Image Asset Baseline verifier, because only that verifier performs the affected complete generated-artifact comparisons; add six regression fixtures beside the production assertions.

**Tech Stack:** Node.js ESM, `node:assert/strict`, existing Route V2 verifier scripts.

---

### Task 1: Confirm the defect and comparison scope

**Files:**
- Inspect: `scripts/verify-route-v2-image-asset-baseline.mjs`
- Inspect: `scripts/lib/knowledge-baseline-text.mjs`
- Inspect: `scripts/verify-knowledge-expansion-batch05-report-consistency.mjs`

- [ ] **Step 1: Run the existing verifier on the Windows checkout**

Run:

```powershell
node scripts/verify-route-v2-image-asset-baseline.mjs
```

Expected: FAIL with `image-asset-baseline.json:stale or manually edited` while normalized generated and checked-in text compare equal.

- [ ] **Step 2: Prove that only line endings differ**

Run a read-only comparison that reports both raw equality and `normalizeKnowledgeBaselineText()` equality for the JSON inventory and Markdown report.

Expected: raw equality is false and canonical equality is true for both artifacts. Stop if canonical equality is false.

- [ ] **Step 3: Audit sibling report comparisons**

Search the Image Baseline and Batch 05 report verifiers for complete-text raw equality.

Expected: only the two assertions in `verify-route-v2-image-asset-baseline.mjs` require production changes. The report-consistency verifier already normalizes CRLF before line-level semantic checks and does not compare a generated full document with raw equality.

### Task 2: Add strict canonical-text regression fixtures

**Files:**
- Modify: `scripts/verify-route-v2-image-asset-baseline.mjs`

- [ ] **Step 1: Import the existing canonical helper**

Add:

```js
import { normalizeKnowledgeBaselineText } from "./lib/knowledge-baseline-text.mjs";
```

- [ ] **Step 2: Add a comparison adapter without weakening content checks**

Add:

```js
function artifactTextMatches(generated, checkedIn) {
  return normalizeKnowledgeBaselineText(generated) === normalizeKnowledgeBaselineText(checkedIn);
}
```

This adapter changes only CRLF and lone CR to LF. It must not trim or ignore spaces, trailing characters, lines, or values.

- [ ] **Step 3: Add the six required fixtures**

Add assertions covering LF/LF, LF/CRLF, CRLF/LF as PASS and changed text, an added line, and a changed value as FAIL. Return a compact six-case result in verifier output so the mandatory gate proves the mutations ran.

- [ ] **Step 4: Run syntax and fixture checks**

Run:

```powershell
node --check scripts/verify-route-v2-image-asset-baseline.mjs
node scripts/verify-route-v2-image-asset-baseline.mjs
```

Expected: syntax PASS; the verifier remains blocked until the two production raw comparisons use the adapter.

### Task 3: Replace only the affected raw comparisons

**Files:**
- Modify: `scripts/verify-route-v2-image-asset-baseline.mjs`

- [ ] **Step 1: Canonicalize the inventory comparison**

Replace the raw equality assertion with:

```js
assert.equal(
  artifactTextMatches(stableBaselineJson(model), fs.readFileSync(inventoryPath, "utf8")),
  true,
  `${INVENTORY_PATH}:stale or manually edited`,
);
```

- [ ] **Step 2: Canonicalize the report comparison**

Replace the raw equality assertion with:

```js
assert.equal(
  artifactTextMatches(renderImageAssetBaselineReport(model), fs.readFileSync(reportPath, "utf8")),
  true,
  `${REPORT_PATH}:stale or manually edited`,
);
```

- [ ] **Step 3: Run the Windows verifier**

Run:

```powershell
node scripts/verify-route-v2-image-asset-baseline.mjs
```

Expected: PASS with all six canonical-text cases reported and all existing image-size mutations still killed.

### Task 4: Verify generators, release gates, and invariants

**Files:**
- Verify: `data/route-v2/images/image-asset-baseline.json`
- Verify: `ROUTE_V2_IMAGE_ASSET_BASELINE_AUDIT.md`
- Verify: `scripts/verify-route-v2-intent-performance.mjs`

- [ ] **Step 1: Run the Image Asset Baseline generator**

Run:

```powershell
node scripts/build-route-v2-image-asset-baseline.mjs
```

Expected: generated content remains semantically identical; no image rules or baseline counts change.

- [ ] **Step 2: Run the targeted verifier suite**

Run the Image Manifest, Image Quality, Image Baseline/Size, Country/City Detail, report consistency, and Trip/Footprint verifiers.

Expected: every verifier PASS, external image requests 0, invalid mappings 0, and the Image Baseline remains 105 images / 38 country covers / 411 backfill assignments.

- [ ] **Step 3: Run the release gate and failure propagation**

Run the comprehensive prelaunch verifier and mandatory-stage failure-propagation verifier.

Expected: 45/45 mandatory PASS, browser stage PASS, and injected mandatory failure produces a nonzero comprehensive exit.

- [ ] **Step 4: Run static checks**

Run:

```powershell
node --check scripts/verify-route-v2-image-asset-baseline.mjs
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Confirm protected state**

Verify the performance verifier is unchanged from `main`, the performance contract remains aggregate p95 `< 0.25ms`, the formal asset hashes/counts are unchanged, the working tree contains only this hotfix and plan, staged remains 0, and `stash@{0}` retains `pre-pr19-merge-local-work-2026-08-10`.

No commit, push, PR, merge, deployment, tag, release, stash operation, or Batch 06 work is permitted in this execution.
