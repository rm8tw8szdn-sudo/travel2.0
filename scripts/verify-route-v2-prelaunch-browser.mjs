import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(projectRoot, "routes.html"), "utf8");
const routesSource = fs.readFileSync(path.join(projectRoot, "routes.js"), "utf8");
const css = fs.readFileSync(path.join(projectRoot, "mobile.css"), "utf8");
const searchServiceSource = fs.readFileSync(path.join(projectRoot, "src", "lib", "routes", "route-search-service.mjs"), "utf8");
const candidateBuilderSource = fs.readFileSync(path.join(projectRoot, "src", "lib", "routes", "route-candidate-builder.mjs"), "utf8");
const compositionPlannerSource = fs.readFileSync(path.join(projectRoot, "src", "lib", "routes", "route-composition-planner.mjs"), "utf8");

function occurrenceCount(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

assert.equal(occurrenceCount(html, /data-route-search(?:\s|>)/gu), 1, "the route page needs one search input");
assert.equal(occurrenceCount(html, /data-route-feed(?:\s|>)/gu), 1, "the route page needs one live feed");
assert.equal(occurrenceCount(html, /data-route-feed-sentinel(?:\s|>)/gu), 1, "the route page needs one feed sentinel");
for (const script of ["route-v2-image-assets.js", "route-feed-bootstrap.js", "travel-state.js", "routes.js"]) {
  assert(html.includes(script), `${script} must be loaded by routes.html`);
}
assert.match(html, /name="viewport"[^>]*width=device-width/u);

assert.match(routesSource, /const BATCH_SIZE = 6;/u);
assert.match(routesSource, /const FEED_PAGE_SIZE = BATCH_SIZE;/u);
assert.match(routesSource, /new IntersectionObserver\([\s\S]*rootMargin: "800px 0px"/u);
assert.match(routesSource, /else if \(!feedState\.hasMore && routeFeedObserverActive\) \{[\s\S]*routeFeedObserver\.disconnect\(\)/u);
assert.match(routesSource, /if \(!visible\.length\)[\s\S]*if \(!feedState\.hasMore\) return `<div[^`]+已经到底了/u);
assert.match(routesSource, /consecutiveEmptyPages >= 2[\s\S]*reason: "empty-page-guard"/u);
assert.match(routesSource, /if \(!feedState\.hasMore\) return false;/u);
assert.match(routesSource, /insertedRecords = appendRecords\(appendableFeedRecords\)/u);
assert.match(routesSource, /prepareRouteImageBatch\([\s\S]*FEED_COVER_PREPARE_DEADLINE_MS/u);
assert.match(routesSource, /if \(outcome\.status === "timeout" \|\| outcome\.status === "aborted"\) return false;/u);
assert.match(routesSource, /event\.target\.src = FALLBACK_ROUTE_COVER/u);
assert.match(routesSource, /<small>\$\{escapeHtml\(routeFeatureIntroV2\(record\)\)\}<\/small>/u);
assert.match(css, /\.route-copy small:last-child\s*\{[\s\S]*-webkit-line-clamp: 2/u);
assert.match(css, /@media \(max-width: 430px\)\s*\{[\s\S]*\.route-copy small:last-child\s*\{[\s\S]*-webkit-line-clamp: 3/u);
assert.match(css, /\.route-card img\s*\{[\s\S]*width: 104px;[\s\S]*height: 86px;/u);
assert.match(searchServiceSource, /const ownersByKey = new Map\(\);/u);
assert.match(searchServiceSource, /const duplicateIndex = duplicateIndexFor\(keys\);/u);
assert.doesNotMatch(searchServiceSource, /accepted\.findIndex\(\(existing\) => isStrongSearchDuplicate/u);
assert.match(searchServiceSource, /function hasCompatibleDuration\(intent, record\)/u);
assert.match(searchServiceSource, /function requiredDestinationMatches\(intent, record\)/u);
assert.match(searchServiceSource, /\.filter\(\(record\) => hasCompatibleDuration\(intent, record\)\)/u);
assert.match(searchServiceSource, /\.filter\(\(record\) => requiredDestinationMatches\(intent, record\)\)/u);
assert.match(searchServiceSource, /clean\(record\.v2PublicationStatus\) === "ready-for-display" \? "ready-for-display" : "needs-review"/u);
assert.match(candidateBuilderSource, /preferredEvidenceBridgeInsertions/u);
assert.match(compositionPlannerSource, /function preferredEvidenceBridgeInsertions\(/u);
assert.match(compositionPlannerSource, /preferredEvidenceBridgeInsertions: evidenceBridgeInsertions/u);

let liveProbe = null;
const configuredBaseUrl = String(process.env.ROUTE_V2_PRELAUNCH_BASE_URL || "").trim();
if (configuredBaseUrl) {
  const baseUrl = new URL(configuredBaseUrl);
  assert(["127.0.0.1", "localhost"].includes(baseUrl.hostname), "live prelaunch probes may target localhost only");
  const routePageUrl = new URL("/travel-collection/routes.html", baseUrl);
  const discoveryUrl = new URL("/api/routes/discovery", baseUrl);
  const pageStartedAt = performance.now();
  const pageResponse = await fetch(routePageUrl);
  const pageText = await pageResponse.text();
  const pageMs = performance.now() - pageStartedAt;
  assert.equal(pageResponse.status, 200);
  assert.match(pageText, /data-route-feed/u);

  const discoveryStartedAt = performance.now();
  const discoveryResponse = await fetch(discoveryUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "feed",
      query: "",
      limit: 6,
      cursor: null,
      sessionId: "prelaunch-browser-verifier",
      excludeIds: [],
      excludeClusters: [],
      routeType: "cross",
    }),
  });
  const payload = await discoveryResponse.json();
  const discoveryMs = performance.now() - discoveryStartedAt;
  assert.equal(discoveryResponse.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.records.length, 6);
  assert.equal(payload.returnedCount, 6);
  assert.equal(payload.hasMore, true);
  assert(payload.nextCursor);
  assert.equal(new Set(payload.records.map((record) => record.id)).size, 6);

  const postSearch = async (query, sessionId) => {
    const startedAt = performance.now();
    const response = await fetch(discoveryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "search",
        query,
        limit: 6,
        cursor: null,
        sessionId,
        excludeIds: [],
        excludeClusters: [],
        routeType: "",
      }),
    });
    const result = await response.json();
    return { response, result, durationMs: performance.now() - startedAt };
  };

  const broadSearch = await postSearch("7天", "prelaunch-browser-verifier");
  const broadSearchPayload = broadSearch.result;
  const broadSearchMs = broadSearch.durationMs;
  assert.equal(broadSearch.response.status, 200);
  assert.equal(broadSearchPayload.ok, true);
  assert(Array.isArray(broadSearchPayload.records));
  assert(broadSearchMs < 5_000, `broad local search must settle within 5 seconds; received ${broadSearchMs.toFixed(1)}ms`);

  const shortSearch = await postSearch("日本2天", "prelaunch-short-trip");
  assert.equal(shortSearch.response.status, 200);
  assert.equal(shortSearch.result.ok, true);
  assert(shortSearch.result.records.length > 0, "a valid short-trip request must return a readable result");
  assert(shortSearch.result.records.every((record) => Number(record.durationDays) >= 1 && Number(record.durationDays) <= 3), "a two-day request must not be filled with long accepted routes");

  const fixedSearch = await postSearch("东京→京都→奈良→大阪7天", "prelaunch-fixed-cities");
  assert.equal(fixedSearch.response.status, 200);
  assert.equal(fixedSearch.result.ok, true);
  assert(fixedSearch.result.records.length > 0, "a valid fixed multi-city request must return a readable result");
  const requiredCities = ["东京", "京都", "奈良", "大阪"];
  for (const record of fixedSearch.result.records) {
    const destinations = (record.destinations || []).map((value) => String(value));
    let previousIndex = -1;
    for (const requiredCity of requiredCities) {
      const index = destinations.findIndex((destination, candidateIndex) => candidateIndex > previousIndex && (destination.includes(requiredCity) || requiredCity.includes(destination)));
      assert(index > previousIndex, `fixed destination ${requiredCity} must remain present and ordered`);
      previousIndex = index;
    }
  }
  liveProbe = {
    routePageStatus: pageResponse.status,
    routePageMs: Number(pageMs.toFixed(3)),
    discoveryStatus: discoveryResponse.status,
    discoveryMs: Number(discoveryMs.toFixed(3)),
    records: payload.records.length,
    remainingCount: payload.remainingCount,
    broadSearchStatus: broadSearch.response.status,
    broadSearchMs: Number(broadSearchMs.toFixed(3)),
    broadSearchRecords: broadSearchPayload.records.length,
    shortSearchMs: Number(shortSearch.durationMs.toFixed(3)),
    shortSearchRecords: shortSearch.result.records.length,
    fixedSearchMs: Number(fixedSearch.durationMs.toFixed(3)),
    fixedSearchRecords: fixedSearch.result.records.length,
  };
}

console.log(JSON.stringify({
  verifier: "route-v2-prelaunch-browser",
  passed: true,
  searchInputs: 1,
  feedContainers: 1,
  sentinels: 1,
  batchSize: 6,
  observerRootMargin: "800px 0px",
  emptyBatchGuard: 2,
  summaryLineClamp: 2,
  mobileSummaryLineClamp: 3,
  imageBox: "104x86",
  indexedSearchDedupe: true,
  structuredAcceptedCompatibility: true,
  evidenceBackedBridgeInsertion: true,
  readyStatusPreserved: true,
  liveProbe,
}, null, 2));
