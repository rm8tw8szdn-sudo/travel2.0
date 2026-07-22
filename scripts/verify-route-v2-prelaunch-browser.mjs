import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(projectRoot, "routes.html"), "utf8");
const routesSource = fs.readFileSync(path.join(projectRoot, "routes.js"), "utf8");
const css = fs.readFileSync(path.join(projectRoot, "mobile.css"), "utf8");
const imageAssetsSource = fs.readFileSync(path.join(projectRoot, "route-v2-image-assets.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(projectRoot, "route-feed-preload.js"), "utf8");
const detailHtml = fs.readFileSync(path.join(projectRoot, "route-detail.html"), "utf8");
const detailSource = fs.readFileSync(path.join(projectRoot, "route-detail.js"), "utf8");
const discoverySource = fs.readFileSync(path.join(projectRoot, "src/lib/routes/discovery.mjs"), "utf8");
const localEvidenceSource = fs.readFileSync(path.join(projectRoot, "src/lib/routes/local-evidence-repository.mjs"), "utf8");
const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");
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
assert.match(routesSource, /record\.searchStatus === "needs-review"[\s\S]*"证据待验证"/u);
assert.match(css, /\.route-copy small:last-child\s*\{[\s\S]*-webkit-line-clamp: 2/u);
assert.match(css, /@media \(max-width: 430px\)\s*\{[\s\S]*\.route-copy small:last-child\s*\{[\s\S]*-webkit-line-clamp: 3/u);
assert.match(css, /\.route-copy strong\s*\{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/u);
assert.match(css, /@media \(max-width: 430px\)\s*\{\s*\.route-copy strong\s*\{[^}]*-webkit-line-clamp: 2;[^}]*white-space: normal;/u);
assert.match(css, /\.route-card img\s*\{[\s\S]*width: 104px;[\s\S]*height: 86px;/u);
assert.doesNotMatch(imageAssetsSource, /fetch\(|XMLHttpRequest/u);
assert.match(routesSource, /if \(!runtimeImageSearchEnabled && \/\^https\?:/u);
assert.match(preloadSource, /if \(!runtimeImageSearchEnabled && \/\^https\?:/u);
assert.ok(detailHtml.indexOf("route-v2-image-assets.js") < detailHtml.indexOf("route-detail.js"));
assert.match(detailSource, /if \(!runtimeImageSearchEnabled\) return;/u);
assert.match(detailSource, /resolveLocalRouteCover/u);
assert.match(detailSource, /resolveLocalDestinationCover/u);
assert.doesNotMatch(discoverySource, /if \(!record\.coverAsset\?\.imageUrl\) throw new RouteDiscoveryError\("ROUTE_MEDIA_INCOMPLETE"/u);
assert.match(serverSource, /process\.env\.ROUTE_IMAGE_CACHE_PATH/u);
assert.match(serverSource, /process\.env\.ROUTE_IMAGE_PROXY_CACHE_DIR/u);
assert.match(serverSource, /const acceptedRoutesPath = process\.env\.ROUTE_ACCEPTED_REPOSITORY_PATH/u);
assert.match(localEvidenceSource, /env\.ROUTE_V2_LOCAL_EVIDENCE_ROOT/u);
assert.match(searchServiceSource, /const ownersByKey = new Map\(\);/u);
assert.match(searchServiceSource, /const duplicateIndex = duplicateIndexFor\(keys\);/u);
assert.doesNotMatch(searchServiceSource, /accepted\.findIndex\(\(existing\) => isStrongSearchDuplicate/u);
assert.match(searchServiceSource, /validateFallbackRouteAgainstIntent/u);
assert.match(searchServiceSource, /constrainRecords\(generatedRecords, "generated-final-gate"\)/u);
assert.match(searchServiceSource, /validateRecord\(item\.record, "final-search-response"\)/u);
assert.match(routesSource, /data-route-feed-state="constraint-conflict"[\s\S]*请增加行程天数或减少城市/u);
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

  const februarySearch = await postSearch("2月去日本2天", "prelaunch-february-trip");
  assert.equal(februarySearch.response.status, 200);
  assert.equal(februarySearch.result.ok, true);
  assert.deepEqual(februarySearch.result.intent?.timeIntent?.months, [2]);
  assert(februarySearch.result.records.length > 0, "a February two-day request must keep a readable review-only result");
  assert(februarySearch.result.records.every((record) => Number(record.durationDays) === 2));
  assert(februarySearch.result.records.every((record) => record.searchStatus === "needs-review"));
  assert.equal(
    februarySearch.result.records.some((record) => record.id === "gold-case-accepted-gold-7-jp-autumn-seasonal"),
    false,
    "an explicitly autumn route must not be presented for a February request",
  );

  const flexibleSearch = await postSearch("东京京都大阪7天", "prelaunch-flexible-cities");
  assert.equal(flexibleSearch.response.status, 200);
  assert.equal(flexibleSearch.result.ok, true);
  assert(flexibleSearch.result.records.length > 0, "a valid flexible multi-city request must return a readable result");
  assert(flexibleSearch.result.records.every((record) => ["东京", "京都", "大阪"].every((city) => (
    (record.destinations || []).some((destination) => String(destination).includes(city) || city.includes(String(destination)))
  ))));
  const flexibleDetailResponse = await fetch(discoveryUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "search-detail",
      routeId: flexibleSearch.result.records[0].id,
      source: "search",
      searchSessionId: "prelaunch-flexible-cities",
      queryId: flexibleSearch.result.queryId,
    }),
  });
  const flexibleDetailPayload = await flexibleDetailResponse.json();
  assert.equal(flexibleDetailResponse.status, 200, "a generated route without remote cover media must remain openable through the local fallback chain");
  assert.equal(flexibleDetailPayload.ok, true);
  assert.equal(flexibleDetailPayload.record?.id, flexibleSearch.result.records[0].id);

  const fixedThreeSearch = await postSearch("东京→京都→大阪7天", "prelaunch-fixed-three-cities");
  assert.equal(fixedThreeSearch.response.status, 200);
  assert.equal(fixedThreeSearch.result.ok, true);
  assert(fixedThreeSearch.result.records.length > 0, "a valid fixed three-city request must return a readable result");
  for (const record of fixedThreeSearch.result.records) {
    const destinations = (record.destinations || []).map((value) => String(value));
    let previousIndex = -1;
    for (const requiredCity of ["东京", "京都", "大阪"]) {
      const index = destinations.findIndex((destination, candidateIndex) => candidateIndex > previousIndex && (destination.includes(requiredCity) || requiredCity.includes(destination)));
      assert(index > previousIndex, `fixed destination ${requiredCity} must remain present and ordered`);
      previousIndex = index;
    }
  }

  const fixedSearch = await postSearch("东京→京都→奈良→大阪7天", "prelaunch-fixed-cities");
  assert.equal(fixedSearch.response.status, 200);
  assert.equal(fixedSearch.result.ok, true);
  assert(fixedSearch.result.records.length > 0, `a valid fixed multi-city request must return a readable result; diagnostics=${JSON.stringify(fixedSearch.result.diagnostics)} intent=${JSON.stringify(fixedSearch.result.intent)}`);
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
  const impossibleFourSearch = await postSearch("东京京都大阪奈良1天", "prelaunch-impossible-four-capacity");
  assert.equal(impossibleFourSearch.response.status, 200);
  assert.equal(impossibleFourSearch.result.ok, true);
  assert.equal(impossibleFourSearch.result.records.length, 0);
  assert.equal(impossibleFourSearch.result.hasMore, false);
  assert.equal(impossibleFourSearch.result.nextCursor, null);
  assert.equal(impossibleFourSearch.result.diagnostics?.reason, "constraint-conflict");

  const impossibleFixedSearch = await postSearch("东京→京都→大阪1天", "prelaunch-impossible-fixed-capacity");
  assert.equal(impossibleFixedSearch.response.status, 200);
  assert.equal(impossibleFixedSearch.result.ok, true);
  assert.equal(impossibleFixedSearch.result.records.length, 0);
  assert.equal(impossibleFixedSearch.result.hasMore, false);
  assert.equal(impossibleFixedSearch.result.nextCursor, null);
  assert.equal(impossibleFixedSearch.result.diagnostics?.reason, "constraint-conflict");

  const impossibleSearch = await postSearch("东京京都大阪奈良金泽1天", "prelaunch-impossible-capacity");
  assert.equal(impossibleSearch.response.status, 200);
  assert.equal(impossibleSearch.result.ok, true);
  assert.equal(impossibleSearch.result.records.length, 0, "an impossible one-day multi-city request must fail closed instead of deleting required cities");
  assert.equal(impossibleSearch.result.hasMore, false);
  assert.equal(impossibleSearch.result.nextCursor, null);
  assert.equal(impossibleSearch.result.diagnostics?.reason, "constraint-conflict");
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
    februarySearchMs: Number(februarySearch.durationMs.toFixed(3)),
    februarySearchRecords: februarySearch.result.records.length,
    flexibleSearchMs: Number(flexibleSearch.durationMs.toFixed(3)),
    flexibleSearchRecords: flexibleSearch.result.records.length,
    flexibleDetailStatus: flexibleDetailResponse.status,
    fixedThreeSearchMs: Number(fixedThreeSearch.durationMs.toFixed(3)),
    fixedThreeSearchRecords: fixedThreeSearch.result.records.length,
    fixedSearchMs: Number(fixedSearch.durationMs.toFixed(3)),
    fixedSearchRecords: fixedSearch.result.records.length,
    impossibleFourSearchMs: Number(impossibleFourSearch.durationMs.toFixed(3)),
    impossibleFourSearchRecords: impossibleFourSearch.result.records.length,
    impossibleFixedSearchMs: Number(impossibleFixedSearch.durationMs.toFixed(3)),
    impossibleFixedSearchRecords: impossibleFixedSearch.result.records.length,
    impossibleSearchMs: Number(impossibleSearch.durationMs.toFixed(3)),
    impossibleSearchRecords: impossibleSearch.result.records.length,
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
  mobileTitleLineClamp: 2,
  imageBox: "104x86",
  defaultRouteImagesLocalOnly: true,
  indexedSearchDedupe: true,
  structuredAcceptedCompatibility: true,
  evidenceBackedBridgeInsertion: true,
  readyStatusPreserved: true,
  liveProbe,
}, null, 2));
