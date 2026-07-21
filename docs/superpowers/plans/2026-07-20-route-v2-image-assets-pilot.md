# Route V2 Image Assets Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate a centralized stable image-key resolver with an optional remote asset base, local placeholders, and the existing six-card on-demand feed using exactly three City and three Route pilots.

**Architecture:** Add one browser/CommonJS-compatible image asset module as the only owner of `assetBaseUrl`, pilot keys, fallback selection, runtime-search opt-in, and the image delivery specification. Route feed, home preload, and City detail code consult that module for the six approved pilot records. Runtime image search is disabled by default for every record, while existing published cover URLs remain usable; missing covers degrade to existing local placeholders without a live gallery lookup.

**Tech Stack:** Browser JavaScript, CommonJS-compatible test exports, existing static HTML pages, Node.js assertion verifier, existing six-card infinite-scroll and City/Planner regression scripts.

---

### Task 1: Freeze the six-record pilot and resolver contract

**Files:**
- Create: `route-v2-image-assets.js`
- Create: `scripts/verify-route-v2-image-assets-pilot.mjs`

- [ ] **Step 1: Write the failing resolver assertions**

Require exactly these stable keys:

```js
const cityKeys = {
  "NL-AMS": "cities/amsterdam.webp",
  "CZ-PRG": "cities/prague.webp",
  "JP-TYO": "cities/tokyo.webp",
};

const routeKeys = {
  "gold-case-accepted-gold-c45-43-benelux-explorer": "routes/benelux-explorer.webp",
  "gold-case-accepted-gold-4-central-europe-hopper": "routes/central-europe-hopper.webp",
  "gold-case-accepted-gold-2-it-first-trip": "routes/italy-first-trip.webp",
};
```

The verifier must assert deterministic resolution, exact pilot counts, a default empty base, fallback to `assets/trip-cover-placeholder.svg` or `assets/route-city-oslo.svg`, path traversal rejection, and no URL for non-pilot records.

- [ ] **Step 2: Run the verifier before implementation**

Run: `node scripts/verify-route-v2-image-assets-pilot.mjs`

Expected: FAIL because `route-v2-image-assets.js` does not exist.

- [ ] **Step 3: Implement the pure centralized module**

Expose these functions without fetching, filesystem access, or cache access:

```js
resolveAssetUrl(coverImageKey, { assetBaseUrl, fallbackUrl })
pilotCityCoverKey(cityId)
pilotRouteCoverKey(routeId)
resolvePilotCityCover(cityId, options)
resolvePilotRouteCover(routeId, options)
isConfiguredAssetUrl(url)
isRuntimeImageSearchEnabled(options)
```

The module must read an optional single browser configuration object, `globalThis.RouteV2ImageAssetConfig`, whose `assetBaseUrl` defaults to an empty string. It must publish the image specification `WebP`, `16:10`, `800x500`, and `80-180KB`.

### Task 2: Wire the three Route pilots without changing batching

**Files:**
- Modify: `routes.html`
- Modify: `routes.js`
- Modify: `mobile.html`
- Modify: `route-feed-preload.js`

- [ ] **Step 1: Load the resolver before Route consumers**

Add `route-v2-image-assets.js` before `routes.js` in `routes.html` and before `route-feed-preload.js` in `mobile.html`.

- [ ] **Step 2: Prefer stable keys only for the three pilot routes**

For an approved pilot route, resolve its stable key before considering accepted-route URLs or `/api/routes/image-search`. If `assetBaseUrl` is empty, use the existing local trip placeholder. Non-pilot route discovery stays unchanged, but missing covers use the local fallback unless runtime image search is explicitly enabled.

- [ ] **Step 3: Disable runtime gallery search by default**

Expose `isRuntimeImageSearchEnabled()` from the centralized module. It returns `false` unless the single configuration object explicitly sets `allowRuntimeImageSearch: true`. Route feed and home preload must not call `/api/routes/image-search` in the default configuration; existing stable cover URLs and local placeholders remain available.

- [ ] **Step 4: Preserve six-card preparation semantics**

Keep these existing contracts unchanged:

```js
const BATCH_SIZE = 6;
const FEED_PAGE_SIZE = BATCH_SIZE;
rootMargin: "800px 0px";
```

Only the current batch and one prefetched batch may warm images. A timeout remains non-terminal; an explicit image error may mark the resolved remote URL bad and must switch only the image to the local placeholder.

- [ ] **Step 5: Keep home preload from searching for pilot covers**

When one of the three pilot routes appears in the first six records, `route-feed-preload.js` must use the stable resolver result. With the default configuration, all other records use an existing published cover or a local fallback without calling `/api/routes/image-search`.

### Task 3: Wire the three City pilots

**Files:**
- Modify: `city-oslo.html`
- Modify: `city-detail.js`

- [ ] **Step 1: Load the resolver before City detail code**

Add `route-v2-image-assets.js` before `city-detail.js`.

- [ ] **Step 2: Resolve City pilot covers by stable legacy City ID**

Use only `NL-AMS`, `CZ-PRG`, and `JP-TYO`. A configured base resolves to the stable WebP URL; an empty base uses `assets/route-city-oslo.svg`. Preserve `localOnly=1` behavior and the existing stable `${city.name}封面图` alt text.

### Task 4: Verify scope, regressions, and immutability

**Files:**
- Modify: `scripts/verify-route-v2-image-assets-pilot.mjs`

- [ ] **Step 1: Verify the pilot architecture**

Run: `node scripts/verify-route-v2-image-assets-pilot.mjs`

Expected: PASS with 3 City keys, 3 Route keys, deterministic configured URLs, local fallback when unconfigured, pilot image-search bypass, and no mutation of Knowledge Entity Layer or `.route-v2-cache` files.

- [ ] **Step 2: Run UI and feed regressions**

Run:

```text
node scripts/verify-route-v2-six-card-infinite-scroll.mjs
node scripts/verify-route-v2-planner-search-ui-visibility.mjs
node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch02.mjs
git diff --check
git diff --cached --check
```

Expected: all PASS. No test may open a remote URL, write `.route-v2-cache`, change knowledge assets, or alter the six-card constants and observer margin.

- [ ] **Step 3: Review without staging or committing**

Run:

```text
git status --short --branch
git diff --name-status
git diff --check
```

Expected: image pilot changes are limited to the central module, three HTML consumers, two frontend consumers, one verifier, and this plan. Leave every file unstaged and do not commit, push, create a PR, or create a tag.
