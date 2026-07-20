# Knowledge Entity Layer Planner Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make route search and Planner consume the fixed P1B Country → City → POI Entity Layer while preserving the existing knowledge-graph fallback and legacy route behavior.

**Architecture:** Add one pure adapter that projects the published Entity Layer repository into the existing synchronous `queryDestinations()` contract and builds dynamic search-intent catalogs from the same repository. Inject both products at the existing discovery/search composition root, preserve Entity Layer identity and POIs in Planner records, and leave the cache-backed knowledge graph as a fallback for countries or cities outside the published layer.

**Tech Stack:** Node.js ESM, existing static Knowledge Entity Layer repository, existing Route V2 Planner/search services, assertion-based verifier scripts.

---

### Task 1: Define the Entity Layer Planner adapter contract

**Files:**
- Create: `src/lib/routes/knowledge-entity-layer-planner-adapter.mjs`
- Test: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

- [ ] **Step 1: Write the failing adapter assertions**

Create the verifier with assertions that instantiate `createPublishedKnowledgeEntityLayerRepository()` and then call the missing adapter APIs:

```js
const adapter = createKnowledgeEntityLayerPlannerAdapter({
  repository,
  fallbackKnowledgeGraph: { queryDestinations: () => [] },
});
const amsterdam = adapter.queryDestinations({ country: "NL", limit: 10 })
  .find((city) => city.canonicalNameEn === "Amsterdam");
assert.equal(amsterdam.entityId, "city-66a343aed16e37a4");
assert.equal(amsterdam.poiEntities.length, 3);
assert.deepEqual(amsterdam.poiEntities.map((poi) => poi.canonicalNameEn), [
  "Anne Frank House",
  "Rijksmuseum",
  "Van Gogh Museum",
]);

const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
assert.equal(catalogs.countries.length, 50);
assert.equal(catalogs.cities.length, 15);
```

- [ ] **Step 2: Run the verifier to confirm the module is missing**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `knowledge-entity-layer-planner-adapter.mjs`.

- [ ] **Step 3: Implement the pure adapter**

Implement these exports without filesystem, cache, or network access:

```js
export function createKnowledgeEntityLayerPlannerAdapter({
  repository,
  fallbackKnowledgeGraph = null,
} = {}) {
  if (!repository?.listCountries || !repository?.listCitiesByCountry || !repository?.listPoisByCity) {
    throw new Error("KNOWLEDGE_ENTITY_LAYER_REPOSITORY_REQUIRED");
  }

  return Object.freeze({
    queryDestinations(query = {}) {
      const limit = Math.max(1, Number(query.limit) || 120);
      const country = repository.listCountries()
        .find((item) => item.isoAlpha2 === String(query.country || "").trim().toUpperCase());
      const entityDestinations = country
        ? repository.listCitiesByCountry(country.entityId).map((city) => plannerDestination(country, city, repository))
        : [];
      const fallback = fallbackKnowledgeGraph?.queryDestinations?.(query) || [];
      return mergeDestinations(entityDestinations, fallback).slice(0, limit).map(clone);
    },
  });
}

export function createKnowledgeEntityLayerSearchIntentCatalog({ repository } = {}) {
  if (!repository?.listCountries || !repository?.listCities) {
    throw new Error("KNOWLEDGE_ENTITY_LAYER_REPOSITORY_REQUIRED");
  }
  return Object.freeze({
    countries: repository.listCountries().map(countryCatalogItem),
    cities: repository.listCities().map(cityCatalogItem),
  });
}
```

Project only public entity fields into Planner destinations: `entityId`, parent IDs, QID, ISO country code, canonical English/Chinese names, aliases, coordinates, and sanitized POIs. Merge Entity Layer entries before fallback entries, de-duplicate by entity ID/QID/normalized country-and-name key, preserve stable repository order, and return defensive clones.

- [ ] **Step 4: Run focused adapter assertions**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: the adapter-only section passes for totals `50/15/45/110`, Amsterdam/Bogotá/Prague/Tokyo each expose three POIs, fallback-only countries remain available, duplicate fallback destinations are removed, and returned values are isolated copies.

### Task 2: Make search intent use the repository-derived catalogs

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Test: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

- [ ] **Step 1: Add failing intent assertions**

Add assertions for exact, non-fuzzy repository-derived matching:

```js
const netherlands = parseSearchIntent("Netherlands Amsterdam 4 days", { catalogs });
assert.equal(netherlands.countryCode, "NL");
assert.deepEqual(netherlands.normalizedCities, ["amsterdam"]);
assert.equal(netherlands.canGenerate, true);

const colombia = parseSearchIntent("Colombia Bogotá", { catalogs });
assert.equal(colombia.countryCode, "CO");
assert.deepEqual(colombia.normalizedCities, ["bogota"]);
```

Also construct `createRouteSearchService({ intentCatalog: catalogs, ... })` with a capturing Planner and assert its Planner context contains `countryCode: "NL"` and `cities: ["Amsterdam"]`.

- [ ] **Step 2: Run the verifier and confirm parsing fails**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: FAIL because `parseSearchIntent()` ignores the dynamic catalogs and the search service does not accept `intentCatalog`.

- [ ] **Step 3: Merge catalogs inside the existing parser**

Change the parser signature and derive local catalogs without mutating exported static catalogs:

```js
export function parseSearchIntent(query, { acceptedRoutes = [], catalogs = null } = {}) {
  const countryCatalog = mergeCatalog(COUNTRY_CATALOG, catalogs?.countries, (item) => item.code);
  const cityCatalog = mergeCatalog(CITY_CATALOG, catalogs?.cities, (item) => `${item.countryCode}:${item.normalizedLabel}`);
  // Use countryCatalog and cityCatalog for matching and inferred parent lookup.
}
```

The merge must preserve existing static entries first for backward compatibility, append repository-derived entries in stable order, and only match normalized canonical names/aliases; short Latin aliases such as ISO codes must match complete tokens. Do not add fuzzy similarity or hard-coded Entity Layer locations, and reject a matched City when its parent Country conflicts with an explicitly matched Country.

- [ ] **Step 4: Inject the catalog through the search service**

Extend the factory without changing callers that omit the option:

```js
export function createRouteSearchService({
  acceptedRepository,
  searchCache,
  analytics = null,
  planner = null,
  intentCatalog = null,
  now = () => Date.now(),
  env = process.env,
  rankingWeights = DEFAULT_RANKING_WEIGHTS,
} = {}) {
  // ...
  const intent = parseSearchIntent(request.query, {
    acceptedRoutes: acceptedSnapshot,
    catalogs: intentCatalog,
  });
}
```

Also pass defensive copies of `intent.cities` and `intent.normalizedCities` into `plannerContextFromIntent()` so the Planner can prioritize the exact requested City within its Country.

- [ ] **Step 5: Run the focused intent/search assertions**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: Netherlands/Amsterdam and Colombia/Bogotá parse successfully and the search service sends the resolved country/city context to Planner; legacy static catalog assertions remain unchanged.

### Task 3: Preserve Entity Layer identity through Planner records

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Test: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

- [ ] **Step 1: Add failing Planner record assertions**

Build a deterministic candidate with the adapter and assert:

```js
assert.equal(record.destinationSource, "knowledge-entity-layer");
assert.ok(record.destinationEntities.every((city) => city.entityId && city.parentCountryEntityId));
assert.ok(record.destinationEntities.every((city) => city.poiEntities.length === 3));
assert.equal(record.countryEntities[0].entityId, "country-febe99ab26ea41f0");
assert.equal(result.accepted[0].destinationSource, "knowledge-entity-layer");
assert.equal(record.provenance.sources[0].providerId, "knowledge-entity-layer");
```

Add a legacy graph-only assertion that still reports `knowledge-graph` and does not require Entity Layer fields.

- [ ] **Step 2: Run the verifier and confirm identity is dropped**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: FAIL because `buildPlannerRecord()` currently projects only QID, country code, name, type, and coordinates and hard-codes `knowledge-graph`.

- [ ] **Step 3: Preserve public identity and derive the source**

Project the additional fields from each skeleton destination:

```js
const destinationEntities = skeleton.map((destination) => ({
  entityId: clean(destination.entityId),
  parentCountryEntityId: clean(destination.parentCountryEntityId),
  wikidataId: clean(destination.wikidataId),
  countryCode: clean(destination.countryCode || context.countryCode),
  name: clean(destination.name),
  canonicalNameZh: clean(destination.canonicalNameZh),
  canonicalNameEn: clean(destination.canonicalNameEn),
  aliases: unique(destination.aliases || []),
  entityTypeName: clean(destination.entityTypeName || "city"),
  latitude: destination.latitude ?? null,
  longitude: destination.longitude ?? null,
  poiEntities: structuredClone(destination.poiEntities || []),
}));
```

Prefer embedded `countryEntity` values when constructing `countryEntities`, falling back to existing `COUNTRY_META` behavior. Derive `destinationSource` as `knowledge-entity-layer`, `knowledge-graph`, or `knowledge-entity-layer+knowledge-graph`, and use it consistently in the record, accepted result metadata, provenance, and decision trace data-source entries. Legacy graph-only output must remain byte-for-byte equivalent in the fields covered by existing verifiers.

- [ ] **Step 4: Run focused Planner assertions**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: PASS for Entity Layer IDs, parents, POIs, source/provenance, and the legacy knowledge-graph branch.

### Task 4: Register the adapter at the discovery composition root

**Files:**
- Modify: `src/lib/routes/discovery.mjs`
- Modify: `src/lib/routes/index.mjs`
- Modify: `server.js`
- Test: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

- [ ] **Step 1: Add a failing default-wiring assertion**

Add a source-level assertion that `discovery.mjs` constructs one published Entity Layer repository, wraps the cache graph with `createKnowledgeEntityLayerPlannerAdapter`, and passes `createKnowledgeEntityLayerSearchIntentCatalog` into `createRouteSearchService`. Also assert the public barrel exports both adapter factories.

- [ ] **Step 2: Run the verifier and confirm wiring is absent**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: FAIL on default registration/export assertions.

- [ ] **Step 3: Build one default Entity Layer context**

At discovery construction, reuse the server's already-created published repository when it is injected; keep a default loader for standalone `createRouteDiscovery()` callers. Share the repository-derived graph adapter and intent catalog:

```js
function createDefaultSearchPlannerContext(acceptedRepository, {
  includePlanner = true,
  knowledgeEntityLayerRepository = null,
} = {}) {
  const repository = knowledgeEntityLayerRepository || createPublishedKnowledgeEntityLayerRepository();
  const fallbackKnowledgeGraph = createCacheBackedKnowledgeGraph({
    pool: mergeSearchKnowledgeGraphFallbacks(readKnowledgeGraphCache(path.join(process.cwd(), ".route-v2-cache", "knowledge-graph-pool.json"))),
  });
  const knowledgeGraph = createKnowledgeEntityLayerPlannerAdapter({ repository, fallbackKnowledgeGraph });
  if (!includePlanner) return { planner: null, intentCatalog };
  return {
    planner: createRouteCompositionPlanner({ evidenceRepository, acceptedRepository, knowledgeGraph, llmRefineProvider }),
    intentCatalog: createKnowledgeEntityLayerSearchIntentCatalog({ repository }),
  };
}
```

Create this context only when the caller has not injected a complete `searchService`. Pass an injected `searchPlanner` through unchanged, while still using the published intent catalog for default parsing. Preserve the existing failure behavior by returning a null Planner and null catalog if default construction fails.

Pass the singleton created in `server.js` into `createRouteDiscovery({ knowledgeEntityLayerRepository })`, so the server does not construct a second copy of the published repository.

- [ ] **Step 4: Export the adapter factories**

Add to `src/lib/routes/index.mjs`:

```js
export {
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
} from "./knowledge-entity-layer-planner-adapter.mjs";
```

- [ ] **Step 5: Run the complete integration verifier**

Run: `node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`

Expected: PASS with a summary showing `50 countries / 15 cities / 45 POIs / 110 total`, four representative countries, exact three-POI city results, dynamic intent parsing, Planner identity retention, fallback compatibility, no orphans, no cache/data writes, and no network calls.

### Task 5: Run offline regression and scope checks

**Files:**
- Verify only: `.route-v2-cache/**`
- Verify only: `data/knowledge/**`
- Verify only: Planner/search/runtime scripts

- [ ] **Step 1: Run existing Planner and search verifiers**

Run:

```powershell
node scripts/verify-planner-pipeline.mjs
node scripts/verify-planner-route-coherence.mjs
node scripts/verify-planner-warmup-integration.mjs
node scripts/verify-search-v1.mjs
node scripts/verify-data-search.mjs
```

Expected: all commands exit `0`; no verifier invokes an online refresh.

- [ ] **Step 2: Run Entity Layer and runtime regressions**

Run:

```powershell
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-city-baseline-p1b-batch01.mjs
```

Expected: all commands exit `0`, totals remain `50/15/45/110`, City/POI reviews and provenance remain unchanged, and no data asset is regenerated.

- [ ] **Step 3: Verify cache, data, and Git scope**

Run:

```powershell
git diff --check
git diff --cached --check
git status --short --branch
git diff --name-status
```

Expected: whitespace checks exit `0`; staged changes remain empty; only the plan, adapter, verifier, and the explicitly listed Planner/search/discovery/barrel files are modified; `.route-v2-cache`, all `data/knowledge` assets, Planner data fixtures, UI files, and server APIs are unchanged.

- [ ] **Step 4: Review without committing**

Inspect `git diff --stat` and `git diff -- src/lib/routes scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`. Keep the working tree uncommitted so the user can review the integration checkpoint before authorizing commits, push, PR, or any remote action.
