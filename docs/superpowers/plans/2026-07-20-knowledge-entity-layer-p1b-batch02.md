# Knowledge Entity Layer P1B Batch02 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish ten additional City entities and thirty directly usable POI entities for five existing P1A Countries, then register them in the fixed runtime repository so the cumulative Entity Layer reaches 50 Countries, 25 Cities, 75 POIs, and 150 total entities.

**Architecture:** Preserve the existing immutable Pilot and Batch01 checkpoints. Add a parallel Batch02 evidence and publication pipeline that reuses the shared City/POI schemas, normalizers, dedupers, review policy, typed IDs, and static repository. Split delivery into a City checkpoint, a frozen POI evidence/selection checkpoint, a formal POI publication checkpoint, and a final explicit runtime-loader update. Runtime code must consume only canonical published assets and must never scan candidate raws, review queues, conflicts, provenance, cache files, or the network.

**Tech Stack:** Node.js ESM, fixed Wikidata API + SPARQL snapshots, deterministic JSON serialization, existing Knowledge Entity Layer primitives/repository, assertion-based verifier and audit scripts.

**Execution status:** Implemented and verified on 2026-07-20. See `ROUTE_V2_KNOWLEDGE_ENTITY_LAYER_P1B_BATCH02_IMPLEMENTATION_REPORT.md` for hashes, results, and the three pre-existing Pilot CRLF verifier findings.

---

### Task 1: Freeze the Batch02 City scope and write failing City contracts

**Files:**
- Create: `scripts/verify-knowledge-city-baseline-p1b-batch02.mjs`
- Create: `scripts/audit-knowledge-city-baseline-p1b-batch02.mjs`
- Create: `scripts/import-knowledge-city-baseline-p1b-batch02.mjs`

- [ ] **Step 1: Define the exact City seed set**

Use these ten approved exact-QID anchors and existing P1A Country parents:

```js
export const CITY_BASELINE_P1B_BATCH02_SEEDS = Object.freeze([
  { isoAlpha2: "FR", wikidataId: "Q90", expectedNameEn: "Paris", expectedCountryWikidataId: "Q142", parentCountryEntityId: "country-a20e4bab95389730" },
  { isoAlpha2: "FR", wikidataId: "Q456", expectedNameEn: "Lyon", expectedCountryWikidataId: "Q142", parentCountryEntityId: "country-a20e4bab95389730" },
  { isoAlpha2: "DE", wikidataId: "Q64", expectedNameEn: "Berlin", expectedCountryWikidataId: "Q183", parentCountryEntityId: "country-9bef984affea20d8" },
  { isoAlpha2: "DE", wikidataId: "Q1726", expectedNameEn: "Munich", expectedCountryWikidataId: "Q183", parentCountryEntityId: "country-9bef984affea20d8" },
  { isoAlpha2: "IT", wikidataId: "Q220", expectedNameEn: "Rome", expectedCountryWikidataId: "Q38", parentCountryEntityId: "country-4df88b953a99e6a4" },
  { isoAlpha2: "IT", wikidataId: "Q2044", expectedNameEn: "Florence", expectedCountryWikidataId: "Q38", parentCountryEntityId: "country-4df88b953a99e6a4" },
  { isoAlpha2: "ES", wikidataId: "Q2807", expectedNameEn: "Madrid", expectedCountryWikidataId: "Q29", parentCountryEntityId: "country-ab252ee38e8cdf81" },
  { isoAlpha2: "ES", wikidataId: "Q1492", expectedNameEn: "Barcelona", expectedCountryWikidataId: "Q29", parentCountryEntityId: "country-ab252ee38e8cdf81" },
  { isoAlpha2: "KR", wikidataId: "Q8684", expectedNameEn: "Seoul", expectedCountryWikidataId: "Q884", parentCountryEntityId: "country-6d9a5fa9dc49e5f4" },
  { isoAlpha2: "KR", wikidataId: "Q16520", expectedNameEn: "Busan", expectedCountryWikidataId: "Q884", parentCountryEntityId: "country-6d9a5fa9dc49e5f4" },
]);
```

The verifier must assert 10 seeds, 5 Countries, 2 Cities per Country, no QID overlap with Pilot/Batch01 Cities, no unexpected Country/City QID overlap, and no Region/Destination/Natural Area publication.

- [ ] **Step 2: Add failing raw and publication assertions**

Require these missing paths:

```text
data/knowledge/raw/cities-p1b-batch02.wikidata.json
data/knowledge/batches/cities.p1b-batch02.json
data/knowledge/batches/provenance.cities.p1b-batch02.json
data/knowledge/batches/conflicts.p1b-batch02.json
data/knowledge/batches/review-queue.p1b-batch02.json
```

Assert exact API/SPARQL QID identity, approved P17 Country evidence, non-conflicting P131 Country projection, explicit City P31 evidence, one coordinate, deterministic output, inline/sidecar provenance equality, stable ordering, zero blocking conflicts, and cumulative City totals `50/25/45/120` before Batch02 POIs are registered.

- [ ] **Step 3: Run the verifier and confirm the checkpoint is absent**

Run: `node scripts/verify-knowledge-city-baseline-p1b-batch02.mjs`

Expected: FAIL because the Batch02 raw and canonical assets do not exist.

### Task 2: Acquire and publish the fixed Batch02 City snapshot

**Files:**
- Create: `data/knowledge/raw/cities-p1b-batch02.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch02.json`
- Create: `data/knowledge/batches/provenance.cities.p1b-batch02.json`
- Create: `data/knowledge/batches/conflicts.cities.p1b-batch02.json`
- Create: `data/knowledge/batches/review-queue.cities.p1b-batch02.json`
- Modify: `scripts/import-knowledge-city-baseline-p1b-batch02.mjs`
- Modify: `scripts/verify-knowledge-city-baseline-p1b-batch02.mjs`
- Modify: `scripts/audit-knowledge-city-baseline-p1b-batch02.mjs`

- [ ] **Step 1: Implement the Batch02 City importer using the Batch01 gate**

Keep Batch01 files unchanged. The Batch02 importer must expose the same pure stages as Batch01 with Batch02 constants, include `fr`, `de`, `it`, `es`, `ko`, `zh-hans`, `zh`, and `en` label/alias languages, and validate isolation against both prior City assets:

```js
const PRIOR_CITY_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
]);
```

The exact-QID type policy may add only P31 QIDs actually present in the fixed ten-City snapshot. Unknown P31 values with explicit City identity become review evidence; unknown-only identity remains blocking.

- [ ] **Step 2: Refresh the raw snapshot once from official Wikidata**

Run: `node scripts/import-knowledge-city-baseline-p1b-batch02.mjs --refresh --timeout-ms=60000 --retries=2`

Expected: `RAW_REFRESHED`, 10 matched QIDs, 10 accepted City records, exactly two official endpoints, and no asset publication during refresh.

- [ ] **Step 3: Publish deterministic City assets offline**

Run: `node scripts/import-knowledge-city-baseline-p1b-batch02.mjs`

Expected: `PASS`, `calledWikidata: false`, 10 Cities, 0 blocking conflicts, and four published City assets.

- [ ] **Step 4: Verify and audit the City checkpoint**

Run:

```text
node scripts/verify-knowledge-city-baseline-p1b-batch02.mjs
node scripts/audit-knowledge-city-baseline-p1b-batch02.mjs
node scripts/verify-knowledge-city-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-city-baseline-p1b-pilot.mjs
```

Expected: all PASS; importer rebuild is byte-identical; prior assets and hashes remain unchanged; orphan City count is 0; only Singapore `Q334` remains the allowed Country/City QID overlap.

### Task 3: Collect and freeze Batch02 POI evidence

**Files:**
- Create: `scripts/inspect-knowledge-poi-baseline-p1b-batch02-evidence.mjs`
- Create: `data/knowledge/raw/pois-p1b-batch02-candidates.wikidata.json`
- Create: `data/knowledge/raw/pois-p1b-batch02-selection.json`
- Create if needed: `data/knowledge/raw/pois-p1b-batch02-candidates-supplement01.wikidata.json`
- Create: `ROUTE_V2_KNOWLEDGE_ENTITY_LAYER_P1B_BATCH02_POI_CANDIDATE_GAP_REPORT.md`

- [ ] **Step 1: Define the intended three-primary candidate catalog**

Collect exact evidence for these 30 product-facing candidates, in City order; a name is not publishable until the evidence gate selects one exact QID:

```text
Paris: Eiffel Tower; Louvre Museum; Musée d'Orsay
Lyon: Basilica of Notre-Dame de Fourvière; Musée des Confluences; Museum of Fine Arts of Lyon
Berlin: Museum Island; Brandenburg Gate; East Side Gallery
Munich: Marienplatz; Englischer Garten; Nymphenburg Palace
Rome: Colosseum; Pantheon; Trevi Fountain
Florence: Uffizi Gallery; Florence Cathedral; Piazzale Michelangelo
Madrid: Museo del Prado; Royal Palace of Madrid; El Retiro Park
Barcelona: Sagrada Família; Park Güell; Casa Batlló
Seoul: Changdeokgung; National Museum of Korea; Namsan Seoul Tower
Busan: Busan Museum; Diamond Tower; Haedong Yonggungsa
```

For each candidate, preserve search evidence, exact entity data, separate API/SPARQL P17/P31/P131/P276 projections, coordinate evidence, bounded parent path to its approved City, and exact P31 type key. Reject City, Country, Region, metropolitan area, island, mountain, lake, and natural-area identities.

- [ ] **Step 2: Run one base evidence acquisition**

Run: `node scripts/inspect-knowledge-poi-baseline-p1b-batch02-evidence.mjs --refresh --timeout-ms=60000 --retries=3`

Expected: a fixed candidate raw with 30 input records and an audit summary grouped by usable, parent-failed, identity-failed, coordinate-failed, and duplicate-QID outcomes.

- [ ] **Step 3: Close only demonstrated gaps**

If fewer than three usable unique candidates exist for a City, add only that City's replacement candidates to Supplement01 and record the failed gate plus replacement rationale in the gap report. Do not create Supplement02 unless Supplement01 still leaves a demonstrated quota gap. No supplement is allowed after all ten Cities have three passing primaries.

- [ ] **Step 4: Freeze selection**

Write `pois-p1b-batch02-selection.json` with policy `p1b-batch02-poi-selection-v1`, rule `three-primary-backup-optional`, exact hashes for every source raw, exactly 30 unique primaries, three per City, and optional backups. Backups must never enter canonical POIs, provenance, reviews, or totals.

Run: `node scripts/inspect-knowledge-poi-baseline-p1b-batch02-evidence.mjs --verify-selection`

Expected: PASS with 30 selected primary QIDs, no Country/POI or City/POI overlap, and no duplicate QID.

### Task 4: Publish Batch02 POIs offline

**Files:**
- Create: `scripts/import-knowledge-poi-baseline-p1b-batch02.mjs`
- Create: `scripts/verify-knowledge-poi-baseline-p1b-batch02.mjs`
- Create: `scripts/audit-knowledge-poi-baseline-p1b-batch02.mjs`
- Create: `data/knowledge/raw/pois-p1b-batch02.wikidata.json`
- Create: `data/knowledge/batches/pois.p1b-batch02.json`
- Create: `data/knowledge/batches/provenance.pois.p1b-batch02.json`
- Create: `data/knowledge/batches/conflicts.p1b-batch02.json`
- Create: `data/knowledge/batches/review-queue.p1b-batch02.json`

- [ ] **Step 1: Write failing formal-publication assertions**

Assert 30 canonical POIs, exactly three per Batch02 City, exact selection/source hashes, complete evidence, deterministic formal raw, 30/30 provenance, zero orphan POIs, zero blocking conflicts, no backup leakage, no Country/POI or City/POI overlap, and cumulative totals `50/25/75/150` when all three City layers and all three POI layers are composed.

- [ ] **Step 2: Implement the offline formal importer**

Reuse `normalizeKnowledgePoiBaseline`, `dedupeKnowledgePoiEntities`, `classifyKnowledgePoiReviewEvidence`, and the existing P1B review policy. The importer must have no refresh mode and no network capability. It must reconstruct formal raw only from frozen candidate raws plus the frozen selection and must preserve prior City/POI review objects while appending Batch02 reviews deterministically.

- [ ] **Step 3: Publish and verify**

Run:

```text
node scripts/import-knowledge-poi-baseline-p1b-batch02.mjs
node scripts/verify-knowledge-poi-baseline-p1b-batch02.mjs
node scripts/audit-knowledge-poi-baseline-p1b-batch02.mjs
```

Expected: all PASS; 30 POIs; three per City; provenance 30/30; conflicts 0; blocking 0; deterministic rebuild; no network or cache access.

### Task 5: Register Batch02 in the static runtime repository

**Files:**
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Create: `scripts/verify-knowledge-entity-layer-p1b-batch02.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`
- Modify: `scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs`

- [ ] **Step 1: Add failing cumulative runtime assertions**

Require:

```js
assert.deepEqual(KNOWLEDGE_ENTITY_LAYER_PUBLISHED_TOTALS, {
  countries: 50,
  cities: 25,
  pois: 75,
  total: 150,
});
```

Assert every Batch02 City returns exactly three POIs, repository ordering is stable, responses are defensive copies, all parents validate, orphan counts are zero, all entity IDs are globally unique, all City/POI QIDs are unique, and Singapore `Q334` remains the only Country/City QID overlap.

- [ ] **Step 2: Explicitly register the two new canonical assets**

Append only:

```text
data/knowledge/batches/cities.p1b-batch02.json
data/knowledge/batches/pois.p1b-batch02.json
```

to the fixed published-assets manifest. Do not register raw, selection, provenance, reviews, or conflicts.

- [ ] **Step 3: Verify API, Planner, and City UI consumption**

Update cumulative expectations without changing API shapes or Planner/City UI architecture. Verify at least Paris, Berlin, Rome, Madrid, and Seoul through the repository/API; verify one Batch02 Country + City through Planner search; verify one Batch02 legacy City detail page can resolve by Country + City and display its three POIs; retain legacy fallback behavior.

### Task 6: Run the full offline regression matrix and document the checkpoint

**Files:**
- Create: `ROUTE_V2_KNOWLEDGE_ENTITY_LAYER_P1B_BATCH02_IMPLEMENTATION_REPORT.md`

- [ ] **Step 1: Record immutable before-state hashes**

Hash all Pilot, Batch01, P1A, Planner golden, accepted/bootstrap, and `.route-v2-cache` files before the final matrix. The report must list the exact new raw hashes, selection hash, canonical output hashes, City/POI review counts, and cumulative totals.

- [ ] **Step 2: Run Batch02 and prior-layer verifiers**

Run:

```text
node scripts/verify-knowledge-city-baseline-p1b-batch02.mjs
node scripts/audit-knowledge-city-baseline-p1b-batch02.mjs
node scripts/verify-knowledge-poi-baseline-p1b-batch02.mjs
node scripts/audit-knowledge-poi-baseline-p1b-batch02.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch02.mjs
node scripts/verify-knowledge-city-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-city-baseline-p1b-pilot.mjs
node scripts/verify-knowledge-poi-baseline-p1b-pilot.mjs
node scripts/verify-knowledge-entity-layer-p1b-pilot.mjs
node scripts/verify-knowledge-country-baseline-p1a-pilot.mjs
node scripts/verify-knowledge-country-baseline-p1a-batch01.mjs
node scripts/verify-knowledge-country-baseline-p1a-batch02.mjs
node scripts/verify-knowledge-country-baseline-batch03.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run runtime/product regressions**

Run:

```text
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs
node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs
git diff --check
git diff --cached --check
```

Expected: all PASS, external requests 0, cache unchanged, stable runtime totals `50/25/75/150`, and no data or UI behavior outside explicit Batch02 consumption changes.

- [ ] **Step 4: Review scope without committing**

Run:

```text
git status --short --branch
git diff --name-status
git diff --stat
git diff --check
```

Expected: only the plan, Batch02 scripts/assets/report, the static published-assets manifest, and directly affected cumulative verifiers are changed. Leave all files unstaged and uncommitted for checkpoint review.

### Task 7: Harden City publication and create the isolated Batch02 checkpoint

**Files:**
- Modify: `scripts/verify-knowledge-city-baseline-p1b-batch02.mjs`
- Modify: `scripts/import-knowledge-city-baseline-p1b-batch02.mjs`

- [ ] **Step 1: Add the failing atomic-publication assertion**

Extract `writePublishedAssets` from the importer source and require it to call the existing `writeTextAtomic` helper for every path. Reject direct `writeFile(targetPath, ...)` calls inside that function:

```js
const writePublishedAssetsSource = extractFunction(importerSource, "writePublishedAssets");
assert.match(writePublishedAssetsSource, /await writeTextAtomic\(targetPath, serialized\[key\]\)/u);
assert.doesNotMatch(writePublishedAssetsSource, /writeFile\(targetPath/u);
```

- [ ] **Step 2: Run the City verifier and confirm the new assertion fails**

Run: `node scripts/verify-knowledge-city-baseline-p1b-batch02.mjs`

Expected: FAIL because `writePublishedAssets` still calls `writeFile(targetPath, ...)`.

- [ ] **Step 3: Route all four published assets through the existing atomic helper**

Keep the existing object-entry order and serialized contents unchanged. Replace only the direct write inside `writePublishedAssets`:

```js
await writeTextAtomic(targetPath, serialized[key]);
```

- [ ] **Step 4: Run the isolated Batch02 and runtime regression matrix**

Run the Batch02 City/POI/audit/cumulative verifiers, Runtime API, Planner Entity Layer, City detail UI, Planner pipeline, Phase 3C-1, Phase 3C-2, `git diff --check`, and `git diff --cached --check`. Confirm `50/25/75/150`, zero orphan/conflict/duplicate QID, complete provenance, and unchanged cache metadata.

- [ ] **Step 5: Stage only the Batch02 checkpoint files**

Use an explicit file list. Exclude `route-v2-image-assets.js`, `routes.js`, `route-feed-preload.js`, `city-detail.js`, `routes.html`, `mobile.html`, `city-oslo.html`, the image-pilot verifier, and the image-pilot plan. Inspect `git diff --cached --name-status`, `git diff --cached --stat`, and `git diff --cached --check` before committing.

- [ ] **Step 6: Create the single Batch02 checkpoint commit**

Run:

```text
git commit -m "feat(route-v2): add p1b batch02 city and poi layer"
```

Expected: one commit containing only Batch02 assets, import/audit/verify tooling, published-assets registration, cumulative verifier expectations, reports, this plan, and the atomic publication hardening. Image-pilot changes remain unstaged in the working tree.
