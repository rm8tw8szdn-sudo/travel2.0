# Route V2 Cross-Country and Citywalk Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit cross-country city searches use every requested country and add an open-ended single-city Citywalk reference that lists all currently published POIs without weakening route hard constraints.

**Architecture:** Enrich the existing single search-intent parser with canonical Entity Layer identifiers and a complete country-code list, then pass that normalized intent into the existing Planner. A narrow `citywalk` reference mode expands one required City into that City plus its published POIs, still uses Candidate → RouteRecord → DecisionTrace → EvidenceBundle, remains `needs-review`, and never enters the accepted Feed.

**Tech Stack:** Node.js ESM, existing Route V2 intent/candidate/planner modules, existing Knowledge Entity Layer repository, browser JavaScript UI.

---

### Task 1: Lock the regression contract

**Files:**
- Create: `scripts/verify-route-v2-cross-country-citywalk.mjs`

- [ ] **Step 1: Write parser assertions for canonical IDs and all country codes**

```js
const crossIntent = parseSearchIntent("阿姆斯特丹 巴黎 5天", {
  catalogs,
  timeIntentEnabled: true,
});
assert.deepEqual(crossIntent.requiredDestinationIds, ["Q727", "Q90"]);
assert.deepEqual(crossIntent.countryCodes, ["NL", "FR"]);

const italyIntent = parseSearchIntent("罗马 佛罗伦萨 4天", {
  catalogs,
  timeIntentEnabled: true,
});
assert.deepEqual(italyIntent.requiredDestinationIds, ["Q220", "Q2044"]);
```

- [ ] **Step 2: Write Planner-context assertions**

```js
assert.deepEqual(capturedCrossContext.countries, ["NL", "FR"]);
assert.equal(capturedCitywalkContext.routeReferenceMode, "citywalk");
assert.equal(capturedCitywalkContext.travelStyle, "deep-dive");
```

- [ ] **Step 3: Write end-to-end assertions**

```js
assert.deepEqual(
  crossResult.records[0].destinationEntities.map((item) => item.wikidataId),
  ["Q727", "Q90"],
);
assert.equal(citywalkResult.records[0].routeReferenceMode, "citywalk");
assert.equal(citywalkResult.records[0].recommendedDays, "不限天数");
assert.equal(citywalkResult.records[0].requestedDurationDays, 6);
assert.deepEqual(
  citywalkResult.records[0].destinationEntities.filter((item) => item.entityTypeName === "poi").map((item) => item.canonicalNameEn),
  ["Eiffel Tower", "Louvre Museum", "Musée d'Orsay"],
);
assert.equal(citywalkResult.records[0].searchStatus, "needs-review");
assert.equal(citywalkResult.records[0].v2PublicationStatus, "v2-not-publishable-yet");
```

- [ ] **Step 4: Run the verifier and confirm it fails before implementation**

Run: `node scripts/verify-route-v2-cross-country-citywalk.mjs`

Expected: FAIL because Paris/Rome use synthetic IDs, the Planner context has only one country, and Citywalk mode is absent.

### Task 2: Preserve canonical entity IDs and multi-country intent

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`

- [ ] **Step 1: Enrich duplicate catalog entries instead of discarding Entity Layer IDs**

```js
function mergeCatalog(base = [], additions = [], identity) {
  const merged = new Map();
  for (const item of [...base, ...(Array.isArray(additions) ? additions : [])]) {
    if (!item || typeof item !== "object") continue;
    const key = clean(identity(item));
    if (!key) continue;
    const current = merged.get(key);
    merged.set(key, current
      ? {
          ...item,
          ...current,
          entityId: clean(item.entityId || current.entityId),
          wikidataId: clean(item.wikidataId || current.wikidataId),
          aliases: unique([...(current.aliases || []), ...(item.aliases || [])]),
        }
      : item);
  }
  return [...merged.values()];
}
```

- [ ] **Step 2: Add every matched city country to RouteIntent**

```js
const countryCodes = unique([
  ...(matchedCountry?.code ? [matchedCountry.code] : []),
  ...matchedCities.map((item) => item.countryCode),
]);
```

Store `countryCodes` on the intent before creating its fingerprint.

- [ ] **Step 3: Pass all countries into the existing Planner context**

```js
countries: [...(intent.countryCodes || [countryCode]).filter(Boolean)],
countryCodes: [...(intent.countryCodes || [countryCode]).filter(Boolean)],
```

- [ ] **Step 4: Re-run parser and context assertions**

Run: `node scripts/verify-route-v2-cross-country-citywalk.mjs`

Expected: Cross-country and canonical-ID assertions pass; Citywalk assertions still fail.

### Task 3: Add one-city open-ended Citywalk mode

**Files:**
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `src/lib/routes/route-candidate-builder.mjs`
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `src/lib/routes/contracts.mjs`

- [ ] **Step 1: Detect the narrow Citywalk case**

Use Citywalk only when one required City is explicitly present and `durationDays >= 3`. Set:

```js
routeReferenceMode: "citywalk",
travelStyle: "deep-dive",
```

Do not activate it for multi-city requests or destination-suggestion mode.

- [ ] **Step 2: Expand the selected City into published POIs**

In the Planner destination-pool step, resolve the required City and map its nested `poiEntities` into Planner destinations with the same country code and `entityTypeName: "poi"`. Keep the City first and include every unique published POI.

- [ ] **Step 3: Generate three deterministic Candidate variants**

For `routeReferenceMode=citywalk`, create `balanced`, `low-transfer`, and `depth` candidates containing the same complete City + POI set with deterministic orders. Do not truncate POIs using inter-city day capacity.

- [ ] **Step 4: Decorate the selected final record without changing its skeleton**

```js
{
  routeReferenceMode: "citywalk",
  durationPolicy: "open-ended",
  requestedDurationDays: context.durationDays,
  recommendedDays: "不限天数",
  canonicalTitle: `${cityName}城市漫游｜景点总览`,
  searchStatus: "needs-review",
  v2PublicationStatus: "v2-not-publishable-yet",
}
```

Keep the selected Candidate order unchanged so RouteRecord, DecisionTrace, and EvidenceBundle remain aligned.

- [ ] **Step 5: Count only cities for inter-city capacity validation**

Preserve `entityTypeName` in the intent invariant’s destination projection. For `routeReferenceMode=citywalk`, count non-POI destinations for the day-capacity check while continuing to validate the exact requested duration through `durationDays`.

- [ ] **Step 6: Preserve Citywalk metadata through API normalization**

Add `routeReferenceMode`, `durationPolicy`, and `requestedDurationDays` to `normalizeDiscoveredRoute`.

- [ ] **Step 7: Re-run the end-to-end verifier**

Run: `node scripts/verify-route-v2-cross-country-citywalk.mjs`

Expected: PASS; V2 records remain blocked from accepted publication.

### Task 4: Present Citywalk as an open-ended reference

**Files:**
- Modify: `routes.js`
- Modify: `route-detail.js`
- Test: `scripts/verify-route-v2-cross-country-citywalk.mjs`

- [ ] **Step 1: Keep the card introduction free of a fixed-day promise**

For `routeReferenceMode=citywalk`, render:

```js
return `以${cityName}为中心，汇总${poiCount}个现有景点；可按兴趣自由拆分，不设天数上限。`;
```

- [ ] **Step 2: Label POIs clearly on the detail page**

Keep using the existing destination grid, but set Citywalk copy to explain that the first item is the City anchor and the remaining items are published POIs. Do not add maps, images, or external requests.

- [ ] **Step 3: Add source assertions**

Assert the UI contains a Citywalk-specific branch, “不限天数”, and no external image/search call is introduced.

### Task 5: Regression and browser acceptance

**Files:**
- Test: `scripts/verify-route-v2-cross-country-citywalk.mjs`
- Test: existing Route V2 verifier scripts

- [ ] **Step 1: Run directed verifiers**

Run:

```powershell
node scripts/verify-route-v2-cross-country-citywalk.mjs
node scripts/verify-route-v2-default-runtime-user-paths.mjs
node scripts/verify-route-v2-time-intent-boundaries.mjs
node scripts/verify-route-v2-candidate-selection-stabilization.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs
node scripts/verify-route-v2-six-card-infinite-scroll.mjs
node scripts/verify-route-v2-feed-exhaustion.mjs
node scripts/verify-route-v2-image-assets-pilot.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
git diff --check
git diff --cached --check
```

Expected: all exit 0.

- [ ] **Step 2: Restart the local server with isolated sidecars**

Use port `4174` and temporary Candidate, Trace, Evidence, and Search Cache paths. Do not modify `.route-v2-cache`.

- [ ] **Step 3: Verify real browser searches**

Check:

- `罗马 佛罗伦萨 4天`
- `阿姆斯特丹 巴黎 5天`
- `巴黎 柏林 6天`
- `首尔 东京 6天`
- `巴黎 3天`
- `巴黎 6天`
- `巴黎 30天`
- `东京 京都 大阪 奈良 1天`

Expected: valid cross-country and Italy requests return the exact Cities; every Paris duration returns the same open-ended Citywalk title and all published POIs; the impossible one-day four-city request remains a constraint conflict.

- [ ] **Step 4: Confirm safety boundaries**

Verify:

- Candidate → RouteRecord → DecisionTrace → EvidenceBundle IDs and order agree.
- Citywalk and cross-country V2 records remain `needs-review` / `v2-not-publishable-yet`.
- accepted routes, `.route-v2-cache`, and knowledge assets are unchanged.
- no external domain requests occur.
- the existing dirty working tree is preserved and no file is staged or committed.
