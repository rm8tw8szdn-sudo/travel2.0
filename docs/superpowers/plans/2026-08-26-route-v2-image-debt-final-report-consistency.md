# Route V2 Image Debt Final Report Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Image Debt final report derive and validate its final baseline from live manifest/provenance data while preserving the 11-item multi-source result only as an explicitly intermediate checkpoint.

**Architecture:** Keep `calculateImageDebtReportData()` as the single runtime-truth collector. Add a focused report-consistency helper that builds the expected final summary, parses only the structured `FINAL STATE / FINAL BASELINE` section, validates arithmetic invariants, and exposes deterministic mutation tests. The report generator and both standalone and comprehensive verification paths will reuse this helper.

**Tech Stack:** Node.js ESM, `node:assert/strict`, Markdown reports, existing Route V2 manifest/provenance JSON.

---

### Task 1: Define the dynamic final-summary contract

**Files:**
- Modify: `scripts/lib/image-debt-report-data.mjs`
- Create: `scripts/lib/image-debt-report-consistency.mjs`

- [ ] **Step 1: Add country coverage to the existing dynamic `final` summary**

```js
countryCovers: manifest.coverage.overall.countryCoverCoverage.ready,
countryTotal: manifest.coverage.overall.countryCoverCoverage.total,
```

- [ ] **Step 2: Implement a final-summary builder sourced only from calculated report data**

```js
export function buildImageDebtFinalSummary(stats) {
  return {
    totalAssets: stats.final.assets,
    countryCovers: stats.final.countryCovers,
    countryTotal: stats.final.countryTotal,
    dedicatedCities: stats.final.dedicatedCities,
    cityTotal: stats.final.cityTotal,
    dedicatedCorePois: stats.final.dedicatedPois,
    corePoiTotal: stats.final.poiTotal,
    needsBackfill: stats.final.needsBackfill,
    remainingCities: stats.cityRemaining,
    remainingCorePois: stats.poiRemaining,
    verifiedDedicated: stats.provenanceRepairAudit.after.verifiedDedicated,
    withdrawn: stats.provenanceRepairAudit.repair.withdrawn,
    invalidMappings: stats.final.invalidMappings,
  };
}
```

- [ ] **Step 3: Parse only the `FINAL STATE / FINAL BASELINE` Markdown section**

```js
const section = source.match(/^## FINAL STATE \/ FINAL BASELINE\n\n([\s\S]*?)(?=\n## |$)/mu)?.[1];
assert(section, "image-debt-final-summary-missing");
```

- [ ] **Step 4: Validate exact values and arithmetic invariants**

```js
assert.equal(actual.dedicatedCities + actual.remainingCities, actual.cityTotal);
assert.equal(actual.dedicatedCorePois + actual.remainingCorePois, actual.corePoiTotal);
assert.equal(actual.remainingCities + actual.remainingCorePois, actual.needsBackfill);
assert.equal(actual.initialSuccessfulDedicated - actual.withdrawn, actual.verifiedDedicated);
```

### Task 2: Generate an unambiguous final report

**Files:**
- Modify: `scripts/report-route-v2-image-debt-elimination.mjs`
- Modify: `ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md`

- [ ] **Step 1: Render the structured final-summary section from the shared helper**

```markdown
## FINAL STATE / FINAL BASELINE

- Total assets: 957
- Country Cover: 78/78
- Dedicated City: 600/601
- Dedicated Core POI: 212/224
- Final needsBackfill: 13
- Remaining City: 1
- Remaining Core POI: 12
- Initial successful dedicated before provenance withdrawals: 676
- Withdrawn due provenance failure: 2
- Final verified dedicated: 674
- invalidMapping: 0
```

- [ ] **Step 2: Rename the old recovery result as an intermediate checkpoint**

```markdown
## INTERMEDIATE / PRE-PROVENANCE-REPAIR MULTI-SOURCE RECOVERY

- Intermediate debt after multi-source recovery = 11
- Intermediate remaining City = 0
- Intermediate remaining Core POI = 11
```

- [ ] **Step 3: Regenerate the report and confirm the final section remains 13 / 1 / 12**

Run: `node scripts/report-route-v2-image-debt-elimination.mjs`

Expected: generator reports `remaining: 13`; no unqualified `Final debt = 11` remains.

### Task 3: Replace substring verification with structured consistency checks

**Files:**
- Modify: `scripts/verify-route-v2-image-debt-elimination.mjs`
- Create: `scripts/verify-route-v2-image-debt-report-consistency.mjs`

- [ ] **Step 1: Remove the old `Final debt = recovery.remaining.length` token requirement**

- [ ] **Step 2: Call the shared final-summary verifier from the mandatory Image Debt verifier**

```js
const reportSummary = verifyImageDebtFinalReport({ source: report, stats });
```

- [ ] **Step 3: Keep intermediate recovery checks scoped to explicitly intermediate labels**

```js
assert(source.includes(`Intermediate debt after multi-source recovery = ${stats.recovery.remaining.length}`));
```

- [ ] **Step 4: Add a standalone verifier for focused release checks**

Run: `node scripts/verify-route-v2-image-debt-report-consistency.mjs`

Expected: PASS with the dynamic final summary and mutation count.

### Task 4: Kill stale-report mutations

**Files:**
- Modify: `scripts/lib/image-debt-report-consistency.mjs`
- Test: `scripts/verify-route-v2-image-debt-report-consistency.mjs`

- [ ] **Step 1: Add the ten required mutations**

Mutate final needsBackfill, remaining City, remaining Core POI, dedicated City, dedicated Core POI, verified dedicated, final/intermediate combinations, and inconsistent totals/splits.

- [ ] **Step 2: Assert nine invalid reports throw and the correct intermediate-11/final-13 report passes**

```js
assert.throws(() => verifyImageDebtFinalReport({ source: mutated, stats }), /image-debt-final-summary/u);
assert.doesNotThrow(() => verifyImageDebtFinalReport({ source: correctHistoricalCheckpoint, stats }));
```

- [ ] **Step 3: Run the focused verifier**

Run: `node scripts/verify-route-v2-image-debt-report-consistency.mjs`

Expected: `mutationCases: 10`, `mutationCasesKilled: 10`, status PASS.

### Task 5: Run the authorized regression set and protect formal assets

**Files:**
- Verify only; do not modify product assets or runtime state.

- [ ] **Step 1: Run Image Debt, report consistency, provenance, manifest, quality, Semantic Gate, Route Consumption, comprehensive, and failure-propagation verifiers**

- [ ] **Step 2: Run Node and Python syntax checks plus `git diff --check`**

- [ ] **Step 3: Confirm Accepted, Formal Evidence, immutable aggregate, Cache 331, Runtime State 329, Metrics 0, staged 0, and unchanged stash message**

- [ ] **Step 4: Stop without commit, push, PR, merge, Batch 08, or stash operations**
