# Route V2 Image Asset Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, reproducible image-asset baseline that explains every repository image, proves all production image mappings and fallbacks are safe, and blocks future regressions without expanding Knowledge or Route Engine behavior.

**Architecture:** Keep `data/route-v2/images/image-coverage-manifest.json` as the single runtime entity-image manifest. Add one audit-only inventory generated from tracked repository files plus reverse-scanned consumers, and one mandatory verifier that validates the generated inventory, report, oversized normal-Git binaries, exact/perceptual duplicates, manifest-consumer consistency, and zero unknown assets. Reuse the existing Image Manifest, Image Quality, City Detail, Trip/Footprint, comprehensive, and failure-propagation gates.

**Tech Stack:** Node.js ESM, Python 3 + Pillow for deterministic bitmap dHash, Git/Git LFS inspection, existing Route V2 browser verifiers, Markdown/JSON generated reports.

---

### Task 1: Establish the repository-wide inventory model

**Files:**
- Create: `scripts/lib/image-asset-baseline.mjs`
- Create: `scripts/lib/perceptual-image-hash.py`
- Test: `scripts/verify-route-v2-image-asset-baseline.mjs`

- [ ] **Step 1: Write the failing inventory assertions**

Create assertions that require every tracked `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`, `.bmp`, and `.ico` file to have a normalized path, format, byte count, dimensions when readable, SHA-256, perceptual hash for renderable bitmap/photo assets, Git/LFS status, category, provenance status, consumer references, production-consumption flag, and lifecycle classification. Require `unknownAssets.length === 0`.

- [ ] **Step 2: Run the verifier and confirm the baseline files are missing**

Run: `node scripts/verify-route-v2-image-asset-baseline.mjs`

Expected: non-zero exit because the audit inventory and report do not yet exist.

- [ ] **Step 3: Implement deterministic file and reference scanning**

Implement exported helpers that:

```js
export const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".bmp", ".ico"]);
export function collectTrackedImagePaths({ root }) { /* git ls-files, normalized and sorted */ }
export function collectImageReferences({ root, imagePaths }) { /* HTML/JS/JSON/MD/CSS reverse scan */ }
export function buildImageAssetBaseline({ root }) { /* inventory, mappings, duplicates, size statistics */ }
```

Exclude `.git` and `.route-v2-cache`; include production code, tests, manifests, Knowledge-adjacent reports, and audit references. Resolve literal local asset paths, record missing local targets, and separately detect runtime `http(s)` image references.

- [ ] **Step 4: Implement perceptual hashing**

The Python helper must read newline-delimited absolute paths, decode with Pillow, apply EXIF orientation, convert to grayscale, resize to 9×8, and emit a 64-bit dHash. It must report unsupported/corrupt images explicitly rather than silently inventing a hash.

- [ ] **Step 5: Run focused unit checks**

Run: `node --check scripts/lib/image-asset-baseline.mjs`

Expected: PASS.

Run: `python -m py_compile scripts/lib/perceptual-image-hash.py`

Expected: PASS without creating files inside the repository (use an isolated temporary bytecode directory).

### Task 2: Generate the audit inventory and dynamic report

**Files:**
- Create: `scripts/build-route-v2-image-asset-baseline.mjs`
- Create: `data/route-v2/images/image-asset-baseline.json`
- Create: `ROUTE_V2_IMAGE_ASSET_BASELINE_REPORT.md`

- [ ] **Step 1: Implement the generator**

Call `buildImageAssetBaseline({ root })`, serialize stable JSON, and render all report numbers from the returned model. The report must include total/category counts, Country/City/POI coverage, 411-debt verification, placeholder inventory, unused/legacy assets, exact and perceptual duplicate groups, byte statistics, normal-Git/LFS totals, threshold counts, top 20 assets, external references, invalid mappings, safe-delete candidates, directory policy, manifest policy, and Batch 06+ admission rules.

- [ ] **Step 2: Generate both artifacts**

Run: `node scripts/build-route-v2-image-asset-baseline.mjs`

Expected: JSON status `PASS`, zero unknown assets, zero missing production assets, and the generated JSON/Markdown paths.

- [ ] **Step 3: Check the 411 debt against published Knowledge**

Require every debt record to resolve to the published entity/QID, use the neutral placeholder, have the correct parent country/city, and have no verified dedicated image omitted by the manifest. Derive City, POI, country distribution, and priority counts from the manifest and Knowledge repository.

### Task 3: Validate and minimally clean the existing baseline

**Files:**
- Modify only files proven by the generated inventory to contain a production mapping/reference defect.
- Delete only files classified `safe-to-delete` with zero code, HTML, JSON, test, manifest, audit, provenance, or compatibility references.

- [ ] **Step 1: Review every `unknown`, `missing`, `invalidMapping`, and remote-runtime record**

Run: `node scripts/build-route-v2-image-asset-baseline.mjs --strict`

Expected: any unresolved record causes a non-zero exit and names the exact path/reference.

- [ ] **Step 2: Retain compatible/audit assets deliberately**

Classify repository reference screenshots as `audit-source`, generic route/UI art as `route-generic` or `ui-decorative`, retired location-specific assets as `legacy-unused`, and generated Country cards as `country-cover`. Do not count legacy location art as dedicated City/POI coverage.

- [ ] **Step 3: Remove only proven safe files**

If and only if the generated `safeToDelete` list is non-empty, delete those exact listed paths after confirming the verifier has no reference to them. Do not move directories unless the audit proves a runtime maintenance benefit and every reference can be updated atomically.

- [ ] **Step 4: Regenerate and confirm zero unknown assets**

Run: `node scripts/build-route-v2-image-asset-baseline.mjs --strict`

Expected: PASS with `unknownAssets: 0`, `invalidMappings: 0`, and no wrong-semantic image in the production chain.

### Task 4: Add one mandatory Image Baseline gate

**Files:**
- Create: `scripts/verify-route-v2-image-asset-baseline.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Implement the consolidated verifier**

The verifier must rebuild the model in memory and compare it with both generated artifacts. It must fail on stale reports, missing files, manifest omissions, remote runtime images, Country→City/POI fallback, unexpected exact/perceptual duplicates, unknown classifications, normal-Git oversized image binaries, invalid LFS pointers, and dedicated/placeholder accounting drift.

- [ ] **Step 2: Register the mandatory stage**

Add exactly one stage:

```js
Object.freeze({
  name: "route-v2-image-asset-baseline",
  relativePath: "scripts/verify-route-v2-image-asset-baseline.mjs",
  phase: "static",
})
```

- [ ] **Step 3: Prove failure propagation**

Extend the existing failure-propagation verifier to assert the stage is registered and that injected non-zero exit, signal, and spawn error are rejected based on process state rather than PASS text.

- [ ] **Step 4: Run the focused gates**

Run: `node scripts/verify-route-v2-image-asset-baseline.mjs`

Expected: PASS and report the dynamic total, category counts, duplicate counts, normal-Git thresholds, LFS status, and zero unknowns.

Run: `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

Expected: PASS with the updated mandatory stage count.

### Task 5: Browser and regression acceptance

**Files:**
- Reuse: `scripts/verify-route-v2-city-detail-image-fallback.mjs`
- Reuse existing Image Manifest, Image Quality, Trip/Footprint, report-consistency, and comprehensive verifiers.

- [ ] **Step 1: Run image and identity gates**

Run the Image Manifest, Image Quality, City Detail, Trip/Footprint, Batch 05 report consistency, and new baseline verifier. Every command must exit zero.

- [ ] **Step 2: Perform real browser checks**

Inspect Country, Feed/Route Card, Route Detail, City Detail, Trip, and Footprint flows for Japan, United Kingdom, United States, Germany, Austria, France, and one Batch 05 country. Record image requests from navigation start and require no wrong image, broken image, external image request, Oslo leakage, Country→City fallback, or console error/warning.

- [ ] **Step 3: Run comprehensive prelaunch**

Run: `node scripts/verify-route-v2-comprehensive-prelaunch.mjs`

Expected: all mandatory stages, including `route-v2-image-asset-baseline`, execute and PASS.

- [ ] **Step 4: Run syntax and whitespace checks**

Run `node --check` for every modified/added JS/MJS file and `git diff --check`.

Expected: PASS.

### Task 6: Seal the uncommitted review workspace

**Files:**
- Verify only; do not commit, push, merge, deploy, tag, release, or touch stash.

- [ ] **Step 1: Verify protected formal assets**

Confirm Accepted SHA-256 `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, Formal Evidence SHA-256 `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, Immutable aggregate `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, Cache 331 files, Runtime State 329 files, and no formal Metrics file.

- [ ] **Step 2: Verify Git and stash boundaries**

Confirm the branch is `codex/route-v2-image-asset-baseline`, staged count is zero, all intended changes remain unstaged, and `stash@{0}` still reads `pre-pr19-merge-local-work-2026-08-10`.

- [ ] **Step 3: Deliver the final 22-item report**

Report dynamic asset totals/categories, dedicated coverage, debt, unused/safe-delete/invalid/duplicate counts, sizes and thresholds, largest asset, manifest/consumer findings, cleanup, browser/comprehensive results, protected assets, Git, and stash. Output `IMAGE ASSET BASELINE READY FOR FINAL REVIEW` only when no P0/P1, unknown asset, or wrong-semantic production image remains; otherwise output `BLOCKED`.

**Execution note:** The user explicitly requires this phase to remain uncommitted, so the usual plan-skill commit steps are intentionally omitted. Execution proceeds inline in the current task because the request already authorizes implementation and verification.

### Task 7: Close the three final-review P1s

**Files:**
- Modify: `country-detail.js:110-124`
- Modify: `scripts/verify-route-v2-city-detail-image-fallback.mjs`
- Modify: `scripts/lib/image-asset-baseline.mjs`
- Modify: `scripts/verify-route-v2-image-asset-baseline.mjs`
- Regenerate: `data/route-v2/images/image-asset-baseline.json`
- Regenerate: `ROUTE_V2_IMAGE_ASSET_BASELINE_REPORT.md`
- Restore from main: `scripts/verify-route-v2-intent-performance.mjs`

- [ ] **Step 1: Add a failing Country Detail City-card browser assertion**

Extend the existing CDP verifier to navigate UK/York, Japan, Germany, Vietnam, and one unresolved City reference. Record every image request from navigation start and reject any City-card image whose path matches `/route-v2-images/countries/*.svg` or another non-neutral fallback. Add a source mutation assertion that replacing the neutral fallback with `country.cover` is rejected.

- [ ] **Step 2: Run the focused verifier and confirm York fails**

Run: `node scripts/verify-route-v2-city-detail-image-fallback.mjs`

Expected before implementation: FAIL naming York and `assets/route-v2-images/countries/gb.svg`.

- [ ] **Step 3: Make every unresolved or image-less City card neutral**

Use one constant neutral source for both resolved and unresolved City cards:

```js
const NEUTRAL_CITY_COVER = "assets/route-city-placeholder.svg";
const cities = cityRefs.map((id) => state.citiesById?.[id] || {
  id: "",
  name: id,
  cover: NEUTRAL_CITY_COVER,
  explorationStatus: "unexplored",
  isNameOnly: true,
});
// Render only a verified exact-City image; otherwise NEUTRAL_CITY_COVER.
```

The renderer must never consult `country.cover`, POI data, remote URLs, or another City when selecting a City-card image.

- [ ] **Step 4: Add size-policy negative fixtures before changing the threshold**

Export a pure policy evaluator and assert these exact cases through production policy code: 400KB changed image audits and passes; 600KB and 900KB changed images fail; an exact 600KB exception passes; the same exception with a different hash fails; copying the approved `home-map-p2.png` bytes to a new path fails; and a changed product image above 5MB hard-fails.

- [ ] **Step 5: Implement exact size exceptions and the 500KB boundary**

Use constants `300_000`, `500_000`, and `5_000_000`. Bind the existing production exception to exact path, SHA-256, bytes, category, reason, and approval/baseline status:

```js
{
  path: "assets/home-map-p2.png",
  expectedSha256: "b63667f43faf98619407229dc14e1a384eb114a02ca8aaa8363272ad4a8e474e",
  expectedBytes: 2_052_937,
  maximumApprovedBytes: 2_052_937,
  assetCategory: "ui-decorative",
  approvalStatus: "baseline-approved",
  baselineStatus: "historical-production-exception",
  reason: "Pre-existing home map UI asset retained by the Image Asset Baseline phase.",
}
```

Unchanged historical assets above 500KB may remain reported, but any added or modified normal-Git image above 500KB must fail without an exact exception. Any changed normal-Git product image above 5MB must hard-fail.

- [ ] **Step 6: Regenerate and verify the baseline artifacts**

Run: `node scripts/build-route-v2-image-asset-baseline.mjs`

Expected: report rules say `>300KB audit`, `>500KB default reject/exact exception`, and `>5MB hard reject`; totals remain derived from the repository.

- [ ] **Step 7: Restore the RouteIntent performance contract byte-for-byte from main**

Restore only `scripts/verify-route-v2-intent-performance.mjs` to `8f63d1f814df050c577a0c0bc6286ccb74618f65`, then assert its diff against main is empty and its final invariant gate remains aggregate `p95Ms < 0.25` with the original measurement semantics.

- [ ] **Step 8: Scan for other out-of-scope release-contract changes**

Review all modified JS/MJS outside image consumers, image verifiers, image reports, and image release wiring. Compare RouteIntent, Planner, Candidate, Search, and Route Engine files with main. Any unrelated behavioral or threshold change must be restored to main behavior.

- [ ] **Step 9: Run focused and comprehensive verification**

Run the City/Country image browser verifier, Image Manifest, Image Quality, Image Baseline, Trip/Footprint, report consistency, RouteIntent performance multiple times, failure propagation, Cache Baseline V2, comprehensive prelaunch, `node --check` for every modified/added JS/MJS, and `git diff --check`. Use isolated temporary state for all tests.

- [ ] **Step 10: Perform final real-browser and protected-asset checks**

Inspect Home, Route, Route Detail, Country Detail, City Detail, Trip, Footprint, and Profile for UK, JP, US, DE, AT, FR, and VN. Require zero broken/external/wrong images, zero Country-to-City fallback, and zero console error/warning. Reconfirm formal hashes/counts, staged zero, and unchanged `stash@{0}`.

### Task 8: Seal and publish the reviewed phase

**Files:**
- Stage only files classified as Image Manifest/metadata, safe historical-image deletions, image consumers, image verifiers, browser fail-safes, reports/audits, and mandatory release-gate wiring.
- Exclude any RouteIntent, Planner, Search, Candidate, Route Engine, Knowledge, Evidence, cache, runtime-state, metrics, secret, profile, or temporary file.

- [ ] **Step 1: Prove the workspace contains no stage-external file**

Run `git diff --name-status`, `git ls-files --others --exclude-standard`, and focused diffs for `src/lib/routes`, RouteIntent performance, Knowledge, and Evidence. Require the only `src/lib/routes` change to be the Image Baseline mandatory-stage registration, the performance verifier object hash to equal `8f63d1f814df050c577a0c0bc6286ccb74618f65`, and Knowledge/Evidence diffs to be empty.

- [ ] **Step 2: Create the asset-baseline commit**

Stage the 116 reviewed image deletions, Image Manifest v2, image coverage/runtime mapping normalization, baseline inventory/generator, and baseline report/audit. Commit with:

```text
chore(route-v2): clean and normalize image asset baseline
```

Run `git diff --check HEAD^ HEAD`, `node scripts/verify-route-v2-image-asset-baseline.mjs`, and `node scripts/verify-route-v2-image-coverage-batch05.mjs`; require zero exit.

The generated baseline must derive deletion provenance from the fixed phase source HEAD `8f63d1f814df050c577a0c0bc6286ccb74618f65` plus any remaining working-tree deletions. It must not derive the 116-deletion audit solely from `git diff HEAD`, because that becomes empty immediately after the cleanup commit and makes a clean checkout unreproducible.

- [ ] **Step 3: Create the safe-consumer and budget commit**

Stage Country/City/POI/Trip/Footprint/feed image consumers, neutral fallbacks, external-image removal, exact size policy, duplicate checks, and focused image verifiers. Commit with:

```text
fix(route-v2): enforce safe image fallback and asset budgets
```

Run `git diff --check HEAD^ HEAD`, `node scripts/verify-route-v2-city-detail-image-fallback.mjs`, `node scripts/verify-route-v2-image-quality-adversarial.mjs`, and `node scripts/verify-travel-state.mjs`; require zero exit.

- [ ] **Step 4: Create the release-gate commit**

Stage the remaining browser assertions, comprehensive mandatory registration, failure propagation, and phase plan/report wiring. Commit with:

```text
test(route-v2): add image baseline release gates
```

Run `git diff --check HEAD^ HEAD`, `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`, and the relevant browser verifier; require zero exit.

- [ ] **Step 5: Run the full post-commit release suite**

Run the Image Manifest, Image Quality, Country/City Detail, Image Baseline/size/duplicate, Trip/Footprint, report consistency, original RouteIntent performance, comprehensive prelaunch, failure propagation, `node --check` for every modified/added JS/MJS, and `git diff --check`. Require 45/45 mandatory stages plus the live browser stage to pass, zero external/broken/wrong-semantic images, and unchanged protected hashes/counts.

- [ ] **Step 6: Push and create the ready-for-review PR**

Push `codex/route-v2-image-asset-baseline` normally to `origin`, verify ahead/behind `0/0`, then create a non-draft PR targeting `main` titled `chore(route-v2): establish clean image asset baseline`. The PR body must report 221 to 105 images, 116 safe deletions, honest dedicated/debt counts, exact size policy, duplicate auditing, 45 mandatory stages plus browser, no Route Engine behavior change, and unchanged protected assets/stash.
