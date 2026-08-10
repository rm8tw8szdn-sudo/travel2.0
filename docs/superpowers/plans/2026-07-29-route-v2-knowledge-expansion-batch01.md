# Route V2 Knowledge Expansion Batch 01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, provenance-backed Country/City/POI and reusable Evidence batch for the highest-impact structural gaps without changing Planner, Feed, Accepted, or UI behavior.

**Architecture:** Reuse the existing P1A/P1B raw snapshot, normalizer, deduper, provenance, review, conflict, published-assets loader, and reusable Evidence seed promotion paths. Entity publication and Evidence promotion remain separate operations, and no route is auto-published as a consequence of this batch.

**Tech Stack:** Node.js ESM, JSON/JSONL published assets, Wikidata snapshot importers, existing Knowledge Entity Layer repository, RouteLegEvidence and SeasonEvidence schemas.

---

## File map

Country delta:

- Create: `data/knowledge/raw/countries-p1a-batch04.wikidata.json`
- Create: `data/knowledge/batches/countries.p1a-batch04.json`
- Create: `data/knowledge/batches/provenance.p1a-batch04.json`
- Create: `data/knowledge/batches/conflicts.p1a-batch04.json`
- Create: `data/knowledge/batches/review-queue.p1a-batch04.json`
- Create: `scripts/import-knowledge-country-baseline-p1a-batch04.mjs`
- Create: `scripts/verify-knowledge-country-baseline-p1a-batch04.mjs`

City and POI batch:

- Create: `data/knowledge/raw/cities-p1b-batch03.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch03.json`
- Create: `data/knowledge/batches/provenance.cities.p1b-batch03.json`
- Create: `data/knowledge/batches/conflicts.p1b-batch03.json`
- Create: `data/knowledge/batches/review-queue.p1b-batch03.json`
- Create: `data/knowledge/raw/pois-p1b-batch03-candidates.wikidata.json`
- Create: `data/knowledge/raw/pois-p1b-batch03-selection.json`
- Create: `data/knowledge/batches/pois.p1b-batch03.json`
- Create: `data/knowledge/batches/provenance.pois.p1b-batch03.json`
- Create: `scripts/import-knowledge-city-baseline-p1b-batch03.mjs`
- Create: `scripts/import-knowledge-poi-baseline-p1b-batch03.mjs`
- Create: `scripts/verify-knowledge-city-baseline-p1b-batch03.mjs`
- Create: `scripts/verify-knowledge-poi-baseline-p1b-batch03.mjs`

Repository and Evidence:

- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`
- Create: `scripts/verify-knowledge-entity-layer-p1b-batch03.mjs`
- Create: `scripts/verify-route-v2-knowledge-expansion-batch01.mjs`

## Task 1: Freeze the batch contract

- [ ] **Step 1: Record the immutable selection**

Use exactly these City targets:

```json
{
  "IS": ["Reykjavík", "Vík í Mýrdal"],
  "TH": ["Bangkok", "Chiang Mai"],
  "CH": ["Zürich", "Lucerne"],
  "NZ": ["Auckland", "Queenstown"],
  "AU": ["Sydney", "Melbourne"]
}
```

Use exactly three POIs per City as listed in `ROUTE_V2_KNOWLEDGE_COVERAGE_AUDIT_PHASE1.md`. Reject a candidate if its Wikidata identity, coordinates, parent country, or entity type cannot be verified.

- [ ] **Step 2: Capture the pre-change baselines**

Run:

```powershell
node scripts/verify-knowledge-entity-layer-p1b-batch02.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
git diff --check
```

Expected: 50 Countries, 25 Cities, 75 POIs, 150 total entities; Accepted and Cache baselines unchanged.

## Task 2: Add the Iceland Country delta

- [ ] **Step 1: Write the failing Country verifier**

The verifier must assert:

```js
assert.equal(repository.listCountries().length, 51);
assert.equal(repository.listCountries().filter((item) => item.isoAlpha2 === "IS").length, 1);
```

It must also assert a stable Country entity ID, valid Iceland Wikidata ID, ISO alpha-2/alpha-3/numeric values, English and Chinese canonical names, aliases, coordinates, continent, provenance, and zero blocking conflicts.

- [ ] **Step 2: Run the verifier before import**

Run:

```powershell
node scripts/verify-knowledge-country-baseline-p1a-batch04.mjs
```

Expected: FAIL because the Batch 04 Country asset does not exist.

- [ ] **Step 3: Import and publish only Iceland**

The raw snapshot must contain one selected Country. Reuse the existing Country normalizer and deduper. Write the canonical, provenance, conflicts, and review assets atomically.

- [ ] **Step 4: Verify Country publication**

Run:

```powershell
node scripts/verify-knowledge-country-baseline-p1a-batch04.mjs
```

Expected: PASS; Country count 51; blocking conflicts 0.

## Task 3: Add ten City Entities

- [ ] **Step 1: Write the failing City verifier**

Assert the exact Country-to-City mapping:

```js
const expected = {
  IS: ["Reykjavík", "Vík í Mýrdal"],
  TH: ["Bangkok", "Chiang Mai"],
  CH: ["Zürich", "Lucerne"],
  NZ: ["Auckland", "Queenstown"],
  AU: ["Sydney", "Melbourne"],
};
```

The verifier must assert 10 unique City entity IDs, 10 unique QIDs, valid coordinates, exact parent Country references, deterministic ordering, complete provenance, and zero orphan Cities.

- [ ] **Step 2: Run the verifier before import**

Run:

```powershell
node scripts/verify-knowledge-city-baseline-p1b-batch03.mjs
```

Expected: FAIL because the Batch 03 City asset does not exist.

- [ ] **Step 3: Import the fixed City snapshot**

Reuse the P1B Batch02 City import pattern and atomic publishing. Do not infer missing QIDs or coordinates. Any ambiguous City identity must enter review rather than canonical output.

- [ ] **Step 4: Verify City publication**

Run:

```powershell
node scripts/verify-knowledge-city-baseline-p1b-batch03.mjs
```

Expected: PASS; cumulative Cities 35; Batch03 Cities 10; orphan Cities 0.

## Task 4: Add thirty POIs

- [ ] **Step 1: Write the failing POI verifier**

Assert exactly three selected POIs under each of the ten new City entity IDs:

```js
assert.equal(batchPois.length, 30);
for (const city of batchCities) {
  assert.equal(batchPois.filter((poi) => poi.parentCityEntityId === city.entityId).length, 3);
}
```

Also assert unique entity IDs, unique QIDs, valid coordinates, complete provenance, deterministic selection, no backup POI in canonical output, and zero orphan POIs.

- [ ] **Step 2: Run the verifier before import**

Run:

```powershell
node scripts/verify-knowledge-poi-baseline-p1b-batch03.mjs
```

Expected: FAIL because the Batch 03 POI asset does not exist.

- [ ] **Step 3: Import candidates and apply the fixed selection**

Use the existing candidate-plus-selection flow. Canonical output must contain only the 30 approved POIs. Candidate and backup records must not enter provenance, review, or canonical output unless selected.

- [ ] **Step 4: Verify POI publication**

Run:

```powershell
node scripts/verify-knowledge-poi-baseline-p1b-batch03.mjs
```

Expected: PASS; cumulative POIs 105; orphan POIs 0.

## Task 5: Register the published assets

- [ ] **Step 1: Write the cumulative failing verifier**

Assert:

```js
assert.deepEqual(totals, {
  countries: 51,
  cities: 35,
  pois: 105,
  total: 191,
});
```

The verifier must also check global entity ID and QID uniqueness, parent validity, stable ordering, defensive copies, zero filesystem scanning by the repository, and no network/cache writes.

- [ ] **Step 2: Run before registration**

Run:

```powershell
node scripts/verify-knowledge-entity-layer-p1b-batch03.mjs
```

Expected: FAIL because the published-assets loader does not include the new files.

- [ ] **Step 3: Add explicit asset registration**

Append only the new Country, City, and POI published asset paths to `KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS`. Update totals to 51/35/105/191. Do not add directory scanning.

- [ ] **Step 4: Verify the repository**

Run:

```powershell
node scripts/verify-knowledge-entity-layer-p1b-batch03.mjs
```

Expected: PASS.

## Task 6: Collect reusable transport Evidence

- [ ] **Step 1: Create missing-evidence tasks in an isolated runtime directory**

Create both directions for:

```text
Reykjavík ↔ Vík í Mýrdal
Bangkok ↔ Chiang Mai
Zürich ↔ Lucerne
Auckland ↔ Queenstown
Sydney ↔ Melbourne
Seoul ↔ Busan
```

Expected total: 12 directed RouteLegEvidence targets.

- [ ] **Step 2: Run dry-run collection**

Run:

```powershell
$env:ROUTE_V2_LOCAL_EVIDENCE_ROOT = Join-Path $env:TEMP 'route-v2-knowledge-expansion-batch01-evidence'
node scripts/collect-route-v2-local-evidence.mjs --limit 12 --type route-leg --dry-run
```

Expected: 12 planned tasks; network requests 0; writes 0.

- [ ] **Step 3: Collect from official sources**

Accept only official transport operators, government transport agencies, or official tourism boards. Preserve unknown transfer counts and frequency when the source does not state them. Do not derive time from geographic distance.

- [ ] **Step 4: Promote only qualified evidence**

Promotion must require directed feasibility, a source-supported duration range, source metadata, content hash, freshness, confidence, and zero unresolved conflicts.

Expected promoted RouteLegEvidence: no more than 12; unresolved tasks remain pending or needs-review.

## Task 7: Collect hard seasonal Evidence

- [ ] **Step 1: Create the fixed city-month matrix**

Use:

```json
{
  "Iceland": [1, 7],
  "Thailand": [4, 9],
  "Switzerland": [1, 7],
  "New Zealand": [7, 12],
  "Australia": [1, 7],
  "South Korea": [1, 7]
}
```

Apply both months to both selected Cities in each country. Expected maximum: 24 SeasonEvidence targets.

- [ ] **Step 2: Collect risk-only facts**

Allow only official evidence for transport disruption, closures, snow/ice, flooding, heat, fire, or required buffers. Do not store “best month,” scenery rankings, or comfort scores.

- [ ] **Step 3: Promote qualified records**

Records without an official hard fact remain pending or needs-review. Suitability stays unknown unless the source explicitly supports a hard conclusion.

## Task 8: End-to-end verification

- [ ] **Step 1: Run the Batch 01 verifier**

Run:

```powershell
node scripts/verify-route-v2-knowledge-expansion-batch01.mjs
```

It must assert:

- 51 Countries / 35 Cities / 105 POIs / 191 entities;
- 10 new Cities and 30 new POIs;
- no orphan or duplicate entity;
- stable Search resolution for all selected Country and City names;
- Evidence references resolve or remain explicitly pending;
- no V2 route enters Accepted or Feed;
- external requests are zero during verifier execution.

- [ ] **Step 2: Run regression gates**

Run:

```powershell
node scripts/verify-route-v2-real-user-search-intent-regression.mjs
node scripts/verify-route-v2-candidate-selection-stabilization.mjs
node scripts/verify-route-v2-candidate-evidence-validation.mjs
node scripts/verify-route-v2-publication-gate.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
git diff --check
```

Expected: all mandatory stages PASS; Accepted and Immutable Cache hashes unchanged.

- [ ] **Step 3: Review the final scope before commit**

Stage only Batch 01 Country/City/POI assets, Evidence seed changes, explicit loader registration, verifiers, and this plan. Exclude runtime evidence directories, Cache, Accepted, screenshots, browser profiles, logs, API keys, and candidate backups.

## Stop condition

Stop after Batch 01 verification. Do not begin Batch 02, Region/Natural Area entities, route publication, Feed changes, image work, or global Knowledge expansion without a separate instruction.
