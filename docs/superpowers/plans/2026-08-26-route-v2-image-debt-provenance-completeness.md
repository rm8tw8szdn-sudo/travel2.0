# Route V2 Image Debt Provenance Completeness Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every published Image Debt dedicated asset pass a fail-closed, license-aware provenance audit without inventing metadata.

**Architecture:** Centralize provenance normalization and validation in one library shared by repair, reporting, and verification. Re-query each asset's exact Wikimedia Commons file metadata, supplement attribution-required records only from canonical file-page data, and withdraw any asset whose required metadata remains unverifiable. Generate a reproducible audit artifact and derive report totals from the strict validator.

**Tech Stack:** Node.js ES modules, Wikimedia Commons MediaWiki API, JSON manifests, existing Route V2 image verifiers.

---

### Task 1: Define fail-closed provenance and license policy

**Files:**
- Create: `scripts/lib/image-provenance-license.mjs`
- Test: `scripts/verify-route-v2-image-provenance-completeness.mjs`

- [ ] **Step 1: Write failing policy fixtures**

Add fixtures covering missing/blank `licenseUrl`, missing creator and attribution under CC BY/CC BY-SA, placeholder creator values, wrong license versions, source URL reuse, missing processed hash, and incomplete verified dedicated records.

```js
assert.equal(auditImageProvenance({ ...ccBy, licenseUrl: "" }).valid, false);
assert.equal(auditImageProvenance({ ...ccBy, creator: "unknown" }).valid, false);
assert.equal(auditImageProvenance({ ...ccBySa, attribution: null }).valid, false);
assert.equal(auditImageProvenance({ ...ccBy, licenseUrl: ccBy.sourceUrl }).valid, false);
assert.equal(auditImageProvenance({ ...ccBy, processedHash: null }).valid, false);
```

- [ ] **Step 2: Run the verifier and confirm it fails against the current permissive implementation**

Run: `node scripts/verify-route-v2-image-provenance-completeness.mjs`

Expected: FAIL because the strict audit module is not implemented and current published records are incomplete.

- [ ] **Step 3: Implement strict normalization and validation**

Implement `auditImageProvenance(record)` with trimmed-value checks, forbidden placeholders, exact Creative Commons family/version URL normalization, exact Commons licensing-section support for public-domain status, and conditional creator/attribution requirements.

```js
export function auditImageProvenance(record) {
  const required = ["entityId", "wikidataId", "assetPath", "sourceUrl", "sourcePlatform", "license", "licenseUrl", "sourceHash", "processedHash", "verificationStatus"];
  const missing = required.filter((field) => !meaningful(record[field]));
  if (requiresAttribution(record.license)) {
    if (!meaningfulCreator(record.creator || record.author)) missing.push("creator");
    if (!meaningful(record.attribution)) missing.push("attribution");
  }
  return { valid: missing.length === 0 && licenseUrlMatches(record.license, record.licenseUrl, record.sourceUrl), missing };
}
```

- [ ] **Step 4: Run policy fixtures**

Run: `node scripts/verify-route-v2-image-provenance-completeness.mjs`

Expected: mutation fixtures are killed; the real dataset remains FAIL until Task 2 repairs or withdraws incomplete records.

### Task 2: Re-audit and repair all published dedicated provenance

**Files:**
- Create: `scripts/repair-route-v2-image-debt-provenance.mjs`
- Create: `data/route-v2/images/image-debt-provenance-completeness-audit.json`
- Modify: `data/route-v2/images/image-debt-elimination-provenance.json`
- Modify when withdrawal is necessary: `data/route-v2/images/image-coverage-manifest.json`
- Modify when withdrawal is necessary: `route-v2-image-coverage.js`
- Modify when withdrawal is necessary: `data/route-v2/images/image-asset-baseline.json`

- [ ] **Step 1: Recalculate the frozen inventory**

Read all `status=imageReady` and `visualAuditStatus=passed` assets, run the strict policy, and write before-repair counts for missing license URL, creator, attribution, and union.

- [ ] **Step 2: Fetch exact canonical Commons metadata**

For each asset, query only its existing `commonsFileTitle` with `imageinfo/extmetadata` and canonical file-page revision data. Preserve exact description URL and raw machine-readable fields in the audit record.

```js
const api = new URL("https://commons.wikimedia.org/w/api.php");
api.search = new URLSearchParams({
  action: "query", format: "json", titles: `File:${asset.commonsFileTitle}`,
  prop: "imageinfo|revisions", iiprop: "url|extmetadata", rvprop: "content|ids|timestamp", rvslots: "main",
});
```

- [ ] **Step 3: Apply only source-backed repairs**

Use Commons `Artist`, `Credit`, `LicenseShortName`, `LicenseUrl`, `UsageTerms`, and `AttributionRequired`. If attribution-required creator data is absent from extmetadata, accept an author only when the exact file-page information template supplies an explicit author value; retain the canonical revision ID in the audit evidence.

- [ ] **Step 4: Handle non-attribution public-domain records**

Retain an absent creator only when Commons explicitly reports public-domain/CC0 status and `AttributionRequired=false`; record `creatorStatus="not-provided-by-source"`. Use the exact file page `#Licensing` as the auditable status URL when Commons supplies no reusable generic status URL.

- [ ] **Step 5: Withdraw unresolved attribution-required records**

For any remaining incomplete CC BY/CC BY-SA record, remove its dedicated publication binding, restore the neutral placeholder with `needsBackfill=true`, and record `LICENSE_METADATA_INCOMPLETE`. Do not delete audit history or fabricate creator data.

- [ ] **Step 6: Re-run strict audit**

Run: `node scripts/repair-route-v2-image-debt-provenance.mjs --check`

Expected: all remaining verified dedicated records are valid and the audit reports exact repaired/withdrawn counts.

### Task 3: Replace permissive report calculations and release verifier

**Files:**
- Modify: `scripts/lib/image-debt-report-data.mjs`
- Modify: `scripts/verify-route-v2-image-debt-elimination.mjs`
- Modify: `scripts/report-route-v2-image-debt-elimination.mjs`
- Modify: `ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Use the shared strict audit for all statistics**

Replace the field-presence arrays and ad hoc license checks with `auditImageProvenance()` results. Report completeness by category and assert `invalid.length === 0` for verified dedicated assets.

- [ ] **Step 2: Add mandatory provenance verifier wiring**

Add `verify-route-v2-image-provenance-completeness.mjs` to mandatory prelaunch and failure-propagation coverage. Gate success must depend on process exit status, not PASS text.

- [ ] **Step 3: Extend negative mutations**

Run all ten required mutations through the same production audit function and assert each is rejected.

- [ ] **Step 4: Regenerate the report**

Run: `node scripts/report-route-v2-image-debt-elimination.mjs`

Expected: the report includes original and recalculated missing counts, repair/withdrawal totals, final dedicated/needsBackfill counts, four 100% completeness ratios, and mutation results.

### Task 4: Verify image, browser, and release integrity

**Files:**
- Verify only unless Task 2 withdraws an asset.

- [ ] **Step 1: Run focused image gates**

Run the Image Debt, provenance, manifest, quality, size, exact/perceptual duplicate, report consistency, and failure-propagation verifiers.

- [ ] **Step 2: Run functional regression**

Run Route Consumption 97/97, Semantic Gate 4,718/4,718, Cache Baseline V2, and Trip/Footprint.

- [ ] **Step 3: Run targeted browser acceptance**

Inspect Kuching, Manta, Užice, Agra Fort, at least one repaired metadata record, every withdrawn record, and Route Detail exact-POI consumption. Require local assets/placeholders only, no broken images, and zero console errors/warnings.

- [ ] **Step 4: Run comprehensive checks**

Run comprehensive prelaunch once, preserving the unchanged `<0.25ms` performance contract and recording known Windows host jitter without retrying for an accidental pass. Run `node --check`, Python AST syntax checks, and `git diff --check`.

- [ ] **Step 5: Confirm protected assets and Git boundaries**

Verify Accepted, Formal Evidence, Immutable, Cache 331, Runtime State 329, Metrics 0, staged 0, and unchanged `stash@{0}`. Do not commit, push, open a PR, or start Batch 08.
