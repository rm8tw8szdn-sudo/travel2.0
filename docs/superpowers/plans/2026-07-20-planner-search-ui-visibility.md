# Planner Search UI Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newly generated Knowledge Entity Layer Planner routes visible in the current search session without changing public-feed acceptance rules.

**Architecture:** Keep the existing Discovery API, Planner status model, and route-card readiness gate. Validate a newly returned verified cover against a prospective record that already contains that cover asset, so country metadata is available before the asset is applied. Make active feed tabs apply only to the public feed, not to an explicit search query, then finish with a source-backed behavioral verifier and an offline browser run using an empty accepted repository.

**Tech Stack:** Browser JavaScript, Node.js verifiers, existing `server.js` runtime, Git.

---

### Task 1: Add the failing Planner search visibility verifier

**Files:**
- Create: `scripts/verify-route-v2-planner-search-ui-visibility.mjs`
- Inspect: `routes.js`

- [ ] **Step 1: Write a verifier that exercises the actual cover policy functions**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../routes.js", import.meta.url), "utf8");

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const context = vm.createContext({
  BAD_REMOTE_COVER_PATTERNS: [],
  ROUTE_IMAGE_COUNTRY_MISMATCH_RULES: [],
  badRuntimeImageUrls: new Set(),
});
for (const name of [
  "coverIdentity",
  "routeCountryCodes",
  "imageCountryCodesForUrl",
  "routeHasAnyCountry",
  "routeImageAllowed",
  "routeImageAllowedForAsset",
]) vm.runInContext(functionSource(name), context);

const record = {
  id: "planner-designed-test",
  countries: ["NL"],
  countryEntities: [{ countryCode: "NL" }],
  feedReady: false,
  searchStatus: "needs-review",
};
const image = {
  imageUrl: "http://127.0.0.1:4175/assets/profile-avatar-kuma-small.jpg",
  imageCountryCodes: ["NL"],
  semanticStatus: "verified",
};

assert.equal(context.routeImageAllowed(record, image.imageUrl), false);
assert.equal(context.routeImageAllowedForAsset(record, image), true);
const visibilityContext = vm.createContext({
  feedState: {
    records: [record],
    query: "Netherlands Amsterdam 7 days",
    activeTab: "cross",
    feedRouteType: "cross",
  },
  hasReadyRouteCover: () => true,
});
for (const name of ["routeKind", "visibleRecords"]) {
  vm.runInContext(functionSource(name), visibilityContext);
}
assert.deepEqual(
  Array.from(visibilityContext.visibleRecords(), (item) => item.id),
  [record.id],
);
assert.match(source, /if \(requested\.query\)[\s\S]*appendRecords\(pageRecords\.filter\(hasReadyRouteCover\)/u);
const searchBranch = source.slice(source.indexOf("if (requested.query)"), source.indexOf("} else {", source.indexOf("if (requested.query)")));
assert.doesNotMatch(searchBranch, /feedReady|searchStatus|needs-review/u);

console.log("PASS verify-route-v2-planner-search-ui-visibility");
```

- [ ] **Step 2: Run the verifier and confirm it fails before implementation**

Run: `node scripts/verify-route-v2-planner-search-ui-visibility.mjs`

Expected: non-zero exit because `routeImageAllowedForAsset` does not yet exist.

### Task 2: Apply and validate new route covers in the correct context

**Files:**
- Modify: `routes.js:711-723`
- Modify: `routes.js:955-970`
- Modify: `routes.js:1464-1477`
- Modify: `routes.js:1507-1517`

- [ ] **Step 1: Add one prospective-asset validation helper**

```js
function routeImageAllowedForAsset(record = {}, image = {}) {
  return Boolean(
    image?.imageUrl
      && routeImageAllowed({ ...record, onlineCoverAsset: image }, image.imageUrl),
  );
}
```

- [ ] **Step 2: Use the helper before applying every newly returned online cover**

Replace the three new-image checks with `routeImageAllowedForAsset(record, image)`. Keep `coverUrl()` and already-applied asset validation unchanged.

- [ ] **Step 3: Keep route-type tabs out of explicit searches**

```js
function visibleRecords() {
  const readyRecords = feedState.records.filter(hasReadyRouteCover);
  if (feedState.query || !feedState.feedRouteType) return readyRecords;
  return readyRecords.filter((record) => routeKind(record) === feedState.activeTab);
}
```

When a refresh starts, assign `feedRouteType: feedState.query ? "" : feedState.activeTab`. This preserves tab filtering for the public feed while allowing a single-country Planner result to appear even if the previously active feed tab was `cross`.

- [ ] **Step 4: Run the new verifier**

Run: `node scripts/verify-route-v2-planner-search-ui-visibility.mjs`

Expected: `PASS verify-route-v2-planner-search-ui-visibility`.

### Task 3: Run the focused regression matrix

**Files:**
- Verify only; no additional file changes expected.

- [ ] **Step 1: Run the new UI visibility verifier and existing UI contract**

```powershell
node scripts/verify-route-v2-planner-search-ui-visibility.mjs
node scripts/verify-route-v2-ui-contract.mjs
```

- [ ] **Step 2: Run Planner, runtime, and Entity Layer regressions**

```powershell
node scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-planner-route-coherence.mjs
node scripts/verify-planner-warmup-integration.mjs
```

- [ ] **Step 3: Run whitespace checks**

```powershell
git diff --check
git diff --cached --check
```

Expected: every command exits 0.

### Task 4: Perform an offline browser acceptance with Planner forced on

**Files:**
- Create temporarily under `%TEMP%`: isolated accepted-route, search-cache, review, analytics, and server log files.
- Do not modify: `.route-v2-cache`, knowledge data assets, or accepted-route production assets.

- [ ] **Step 1: Snapshot the formal cache**

Record the file count, total bytes, per-file SHA256/mtime manifest, and Git status.

- [ ] **Step 2: Start `server.js` with an empty accepted repository**

Use port 4174, temporary search persistence paths, disabled feed refill/LLM refine, and blank online-provider keys.

- [ ] **Step 3: Route browser traffic through a localhost-only proxy**

Forward application and Discovery requests to 4174. Substitute `/api/routes/image-search` with a verified localhost asset whose `imageCountryCodes` match the route, and forward `/api/routes/image-proxy` only to that localhost asset.

- [ ] **Step 4: Search using the real UI**

Search `Netherlands Amsterdam 7 days`, `Colombia Bogotá 7 days`, and `Czechia Prague 7 days`. Assert one visible Planner card per query, `plannerCalled=true`, the correct Entity Layer city and three POIs in the returned record, zero console errors, zero external-domain requests, and no public-feed acceptance mutation.

- [ ] **Step 5: Clean up and re-check invariants**

Stop the server and proxy, release ports, delete only the verified `%TEMP%` acceptance directory, close browser tabs, and confirm the formal cache manifest and Git data assets are unchanged.
