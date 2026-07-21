import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../routes.js", import.meta.url), "utf8");

function functionSource(name) {
  const plainMarker = `function ${name}(`;
  const asyncMarker = `async function ${name}(`;
  const asyncStart = source.indexOf(asyncMarker);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(plainMarker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf(") {", start) + 2;
  assert.ok(bodyStart > 1, `${name} body must exist`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

assert.match(source, /const BATCH_SIZE = 6;/u, "Feed and search must share a six-card batch size");
assert.match(source, /const FEED_PAGE_SIZE = BATCH_SIZE;/u);
assert.match(source, /const SEARCH_PAGE_SIZE = BATCH_SIZE;/u);
assert.doesNotMatch(source, /FEED_PAGE_CADENCE_MS|waitForFeedPageCadence/u, "No fixed per-batch cadence may delay ready cards");
const requestSource = functionSource("requestDiscoveryPage");
assert.match(
  requestSource,
  /limit:\s*isSearch \? SEARCH_PAGE_SIZE : FEED_PAGE_SIZE/u,
  "Feed discovery must request exactly the next six records",
);
assert.doesNotMatch(requestSource, /FEED_PAGE_SIZE \* 20/u, "Feed discovery must not request a 120-record candidate window");
assert.match(source, /rootMargin:\s*"800px 0px"/u, "Sentinel should preload roughly 800px before the bottom");
assert.match(source, /feedState\.status === "loading"/u, "A loading guard must prevent concurrent batch tasks");
assert.match(source, /let routeFeedBatchTriggerConsumed = false;/u);
assert.match(functionSource("triggerNextFeedBatch"), /routeFeedBatchTriggerConsumed = true;[\s\S]*loadFeed/u, "One sentinel entry must be consumed before loading");

const visibleSource = functionSource("visibleRecords");
assert.doesNotMatch(visibleSource, /hasReadyRouteCover/u, "Image readiness must not decide route existence");

const selectSource = functionSource("selectAppendableRecords");
assert.doesNotMatch(selectSource, /hasReadyRouteCover|knownImageKeys/u, "Selection must not require or deduplicate by cover readiness");
assert.match(selectSource, /stableRouteBatch/u);

const loadSource = functionSource("loadFeed");
assert.doesNotMatch(loadSource, /filter\(hasReadyRouteCover\)/u, "Slow images must not be filtered out before insertion");
assert.doesNotMatch(loadSource, /insertedRecords\.length > 0 && insertedRecords\.length < FEED_PAGE_SIZE/u, "A final partial batch must not be removed");
assert.match(loadSource, /prepareRouteImageBatch/u, "Each selected batch must prepare images in parallel before insertion");
assert.doesNotMatch(loadSource, /FEED_BACKFILL_HOP_LIMIT|tabPoolExhausted/u, "The browser must trust the stable server page instead of hopping across pools");
assert.match(loadSource, /resolveFeedContinuation/u, "Feed terminal state must be applied through one continuation decision");
assert.match(loadSource, /serverHasMore:\s*payload\.hasMore === true/u, "The server terminal state must be authoritative");
assert.doesNotMatch(loadSource, /payload\.pending/u, "Background refill status must not reopen exhausted pagination");
assert.doesNotMatch(loadSource, /console\.warn/u, "The empty-page fail-safe must stay in diagnostics instead of warning the console");

const prefetchSource = functionSource("prefetchNextFeedPage");
assert.doesNotMatch(prefetchSource, /if \(!pageRecords\.length\) return/u, "Prefetch must retain empty terminal metadata");
assert.match(prefetchSource, /feedState\.pendingMore/u, "An inconsistent empty page must wait for one foreground confirmation");
assert.doesNotMatch(loadSource, /prefetchedFeedPage\.pageRecords\.length > 0/u, "A prefetched terminal page must be consumable without another request");

const continuationContext = vm.createContext({});
vm.runInContext(functionSource("resolveFeedContinuation"), continuationContext);
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.deepEqual(plain(continuationContext.resolveFeedContinuation({
  insertedCount: 0,
  serverHasMore: false,
  nextCursor: null,
  previousEmptyCount: 0,
})), {
  hasMore: false,
  cursor: null,
  consecutiveEmptyPages: 0,
  retry: false,
  reason: "exhausted",
}, "A terminal server response must immediately stop the Feed");

assert.deepEqual(plain(continuationContext.resolveFeedContinuation({
  insertedCount: 0,
  serverHasMore: true,
  nextCursor: null,
  previousEmptyCount: 0,
})), {
  hasMore: false,
  cursor: null,
  consecutiveEmptyPages: 0,
  retry: false,
  reason: "exhausted",
}, "A missing continuation cursor must fail closed even if hasMore is inconsistent");

const firstEmpty = plain(continuationContext.resolveFeedContinuation({
  insertedCount: 0,
  serverHasMore: true,
  nextCursor: "cursor-2",
  previousEmptyCount: 0,
}));
assert.deepEqual(firstEmpty, {
  hasMore: true,
  cursor: "cursor-2",
  consecutiveEmptyPages: 1,
  retry: true,
  reason: "empty-page-confirmation",
}, "One inconsistent empty page may be confirmed once");

assert.deepEqual(plain(continuationContext.resolveFeedContinuation({
  insertedCount: 0,
  serverHasMore: true,
  nextCursor: "cursor-3",
  previousEmptyCount: firstEmpty.consecutiveEmptyPages,
})), {
  hasMore: false,
  cursor: null,
  consecutiveEmptyPages: 2,
  retry: false,
  reason: "empty-page-guard",
}, "A second inconsistent empty page must fail closed");

assert.deepEqual(plain(continuationContext.resolveFeedContinuation({
  insertedCount: 6,
  serverHasMore: true,
  nextCursor: "cursor-4",
  previousEmptyCount: 1,
})), {
  hasMore: true,
  cursor: "cursor-4",
  consecutiveEmptyPages: 0,
  retry: false,
  reason: "continue",
}, "A non-empty page must reset the empty-page guard");

assert.deepEqual(plain(continuationContext.resolveFeedContinuation({
  insertedCount: 3,
  serverHasMore: false,
  nextCursor: null,
  previousEmptyCount: 0,
})), {
  hasMore: false,
  cursor: null,
  consecutiveEmptyPages: 0,
  retry: false,
  reason: "exhausted",
}, "The final partial batch must be inserted before terminal state");

const cursorContext = vm.createContext({
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  TextDecoder,
  Uint8Array,
});
vm.runInContext(functionSource("isStableFeedCursor"), cursorContext);
const encodeCursor = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const legacyFeedCycleCursor = encodeCursor({
  version: 1,
  provider: "accepted-repository",
  feedCycle: 0,
  acceptedAt: "2026-07-08T03:27:45.685Z",
  id: "legacy-route",
});
const v2OffsetCursor = encodeCursor({
  version: 1,
  provider: "accepted-repository",
  orderVersion: 2,
  offset: 6,
  sessionHash: 123,
  filterHash: 456,
  poolFingerprint: "357:789",
});
const stableKeysetPayload = {
  version: 1,
  provider: "accepted-repository",
  orderVersion: 3,
  sessionHash: 123,
  filterHash: 456,
  randomRank: 4_294_967_295,
  id: "route-keyset-6",
};
const stableKeysetCursor = encodeCursor(stableKeysetPayload);
assert.equal(cursorContext.isStableFeedCursor(legacyFeedCycleCursor), false, "A legacy feedCycle cursor must not resume the v3 Feed");
assert.equal(cursorContext.isStableFeedCursor(v2OffsetCursor), false, "A v2 offset cursor must not resume the v3 keyset Feed");
assert.equal(cursorContext.isStableFeedCursor(stableKeysetCursor), true, "A complete v3 keyset cursor must be accepted");
assert.equal(cursorContext.isStableFeedCursor(encodeCursor({ ...stableKeysetPayload, provider: "other" })), false);
for (const missingField of ["provider", "sessionHash", "filterHash", "randomRank", "id"]) {
  const incomplete = { ...stableKeysetPayload };
  delete incomplete[missingField];
  assert.equal(cursorContext.isStableFeedCursor(encodeCursor(incomplete)), false, `${missingField} identity is required`);
}
for (const invalidIdentity of [
  { sessionHash: -1 },
  { sessionHash: 1.5 },
  { filterHash: -1 },
  { filterHash: 1.5 },
  { randomRank: -1 },
  { randomRank: 1.5 },
  { randomRank: 4_294_967_296 },
  { id: "" },
  { id: "   " },
]) {
  assert.equal(cursorContext.isStableFeedCursor(encodeCursor({ ...stableKeysetPayload, ...invalidIdentity })), false);
}
assert.equal(cursorContext.isStableFeedCursor("not-base64url"), false);

assert.match(functionSource("readPreloadedRouteFeed"), /isStableFeedCursor\(payload\.nextCursor\)/u, "Session preload must reject a legacy cursor");
assert.match(functionSource("normalizeBootstrappedFeed"), /isStableFeedCursor\(payload\.nextCursor\)/u, "Checked-in bootstrap data must reject a legacy cursor");

const preloadRecords = Array.from({ length: 6 }, (_, index) => ({
  id: `preload-${index + 1}`,
  coverAsset: { imageUrl: `cover-${index + 1}.jpg` },
}));
let storedPreload = null;
Object.assign(cursorContext, {
  ROUTE_FEED_PRELOAD_KEY: "route-feed-preload",
  ROUTE_FEED_PRELOAD_TTL_MS: 300_000,
  FEED_PAGE_SIZE: 6,
  sessionStorage: { getItem: () => JSON.stringify(storedPreload) },
  displayCoverUrl: (record) => record.coverAsset?.imageUrl || "",
  markRouteCoverReady: () => {},
});
vm.runInContext(functionSource("readPreloadedRouteFeed"), cursorContext);
vm.runInContext(functionSource("normalizeBootstrappedFeed"), cursorContext);

storedPreload = {
  cacheVersion: "route-preload-v2",
  imagesReady: true,
  createdAt: Date.now(),
  records: preloadRecords,
  hasMore: true,
  nextCursor: legacyFeedCycleCursor,
};
assert.equal(cursorContext.readPreloadedRouteFeed(), null, "Session preload must fall back when its cursor uses feedCycle");
storedPreload.nextCursor = stableKeysetCursor;
assert.equal(cursorContext.readPreloadedRouteFeed()?.nextCursor, stableKeysetCursor, "Session preload must accept the v3 keyset cursor");

const legacyBootstrap = {
  cacheVersion: "route-bootstrap-v1",
  records: preloadRecords,
  hasMore: true,
  nextCursor: legacyFeedCycleCursor,
};
assert.equal(cursorContext.normalizeBootstrappedFeed(legacyBootstrap), null, "Checked-in bootstrap must fall back when its cursor uses feedCycle");
assert.equal(
  cursorContext.normalizeBootstrappedFeed({ ...legacyBootstrap, nextCursor: stableKeysetCursor })?.nextCursor,
  stableKeysetCursor,
  "Bootstrap normalization must accept the v3 keyset cursor",
);

const renderSource = functionSource("renderFeed");
assert.match(renderSource, /insertAdjacentHTML\("beforeend"/u, "Later batches must append without rerendering prior cards");
assert.match(functionSource("routeCardImageMarkup"), /FALLBACK_ROUTE_COVER/u, "Every route card needs a placeholder cover");
assert.doesNotMatch(source, /discardAwaitingImageBatch\(/u, "Image timeout/error must never delete a route batch");
assert.doesNotMatch(source, /removeUnavailableRouteCard\(record, card\)/u, "Image events must never delete route cards");

const stateSource = functionSource("stateMarkup");
assert.match(stateSource, /正在加载更多路线…/u);
assert.match(stateSource, /已经到底了/u);
assert.doesNotMatch(stateSource, /data-route-feed-more>继续搜索/u, "Infinite scroll must not expose a pagination button");

const summarySource = functionSource("renderSearchSummary");
assert.match(summarySource, /feedState\.searchResolved/u, "Search completion must be independent from batch image loading");

const observerSource = functionSource("updateRouteFeedObserver");
assert.match(observerSource, /disconnect/u, "Observer must stop when all data is loaded");

const batchContext = vm.createContext({ BATCH_SIZE: 6 });
vm.runInContext(functionSource("stableRouteBatch"), batchContext);
const existing = [{ id: "route-0", name: "Existing" }];
const candidates = [
  { id: "route-1", name: "One" },
  { id: "route-2", name: "Two" },
  { id: "route-2", name: "Two duplicate" },
  { id: "route-3", name: "Three" },
  { id: "route-4", name: "Four" },
  { id: "route-5", name: "Five" },
  { id: "route-6", name: "Six" },
  { id: "route-7", name: "Seven" },
];
assert.deepEqual(
  Array.from(batchContext.stableRouteBatch(candidates, existing), (record) => record.id),
  ["route-1", "route-2", "route-3", "route-4", "route-5", "route-6"],
  "The first batch must contain six stable, ordered, unique IDs",
);
assert.deepEqual(
  Array.from(batchContext.stableRouteBatch(candidates.slice(0, 4), existing), (record) => record.id),
  ["route-1", "route-2", "route-3"],
  "The final partial batch must keep all remaining unique records",
);

let activeBatchImages = 0;
let maxActiveBatchImages = 0;
const batchOutcomes = new Map([
  ["cover-1.jpg", { delay: 18, status: "ready" }],
  ["cover-2.jpg", { delay: 4, status: "ready" }],
  ["cover-3.jpg", { delay: 12, status: "timeout" }],
  ["cover-4.jpg", { delay: 2, status: "ready" }],
  ["cover-5.jpg", { delay: 8, status: "error" }],
  ["cover-6.jpg", { delay: 6, status: "ready" }],
]);
const permanentlyBadBatchImages = new Set();
const prepareContext = vm.createContext({
  BATCH_SIZE: 6,
  FEED_DEDUPE_WINDOW: 50,
  FEED_COVER_PREPARE_DEADLINE_MS: 2_000,
  badRuntimeImageUrls: permanentlyBadBatchImages,
  displayCoverUrl: (record) => record.cover,
  routeImageDedupeKey: (record) => record.cover,
  coverIdentity: (value) => String(value || "").toLowerCase(),
  routeImageAllowed: () => true,
  hasReadyRouteCover: () => false,
  applyRouteImageOutcome: (record, imageUrl, outcome) => {
    record._coverLoadStatus = outcome.status;
    if (outcome.status === "error") permanentlyBadBatchImages.add(imageUrl);
  },
  warmProxiedImage: async (imageUrl) => {
    activeBatchImages += 1;
    maxActiveBatchImages = Math.max(maxActiveBatchImages, activeBatchImages);
    const planned = batchOutcomes.get(imageUrl);
    await new Promise((resolve) => setTimeout(resolve, planned.delay));
    activeBatchImages -= 1;
    return { status: planned.status, imageUrl };
  },
});
vm.runInContext(functionSource("prepareRouteImageBatch"), prepareContext);
const preparedRecords = Array.from({ length: 6 }, (_, index) => ({
  id: `prepared-${index + 1}`,
  cover: `cover-${index + 1}.jpg`,
}));
const preparedBatch = await prepareContext.prepareRouteImageBatch(preparedRecords, [], null, 50);
assert.equal(maxActiveBatchImages, 6, "All six images must start in parallel");
assert.deepEqual(
  Array.from(preparedBatch.records, (record) => record.id),
  preparedRecords.map((record) => record.id),
  "Image completion order must never reorder route cards",
);
assert.equal(preparedBatch.ready, 4);
assert.equal(preparedBatch.placeholders, 2, "A slow and a failed image should become placeholders without dropping cards");
assert.deepEqual(Array.from(permanentlyBadBatchImages), ["cover-5.jpg"], "Only the explicit error may become permanently bad");

const imageScenarios = [];
class FakeImage {
  constructor() {
    this.naturalWidth = 0;
    this.onload = null;
    this.onerror = null;
  }

  set src(_value) {
    const scenario = imageScenarios.shift() || { type: "never" };
    if (scenario.type === "load") {
      setTimeout(() => {
        this.naturalWidth = 960;
        this.onload?.();
      }, scenario.delay || 0);
    } else if (scenario.type === "error") {
      setTimeout(() => this.onerror?.(new Error("explicit image failure")), scenario.delay || 0);
    }
  }
}

const imageContext = vm.createContext({
  Image: FakeImage,
  setTimeout,
  clearTimeout,
  proxiedRouteImageUrl: (value) => value,
});
vm.runInContext(functionSource("warmProxiedImage"), imageContext);
vm.runInContext(functionSource("shouldPermanentlyRejectRouteImage"), imageContext);

imageScenarios.push({ type: "load", delay: 0 });
assert.equal((await imageContext.warmProxiedImage("fast.jpg", null, 40)).status, "ready");

let lateStatus = "";
imageScenarios.push({ type: "load", delay: 24 });
const lateInitial = await imageContext.warmProxiedImage("late.jpg", null, 5, (outcome) => {
  lateStatus = outcome.status;
});
assert.equal(lateInitial.status, "timeout");
await new Promise((resolve) => setTimeout(resolve, 35));
assert.equal(lateStatus, "ready", "A late image should be able to replace the placeholder");

imageScenarios.push({ type: "never" });
assert.equal((await imageContext.warmProxiedImage("never.jpg", null, 5)).status, "timeout");
assert.equal(imageContext.shouldPermanentlyRejectRouteImage({ status: "timeout" }), false);

imageScenarios.push({ type: "error", delay: 0 });
const failed = await imageContext.warmProxiedImage("failed.jpg", null, 40);
assert.equal(failed.status, "error");
assert.equal(imageContext.shouldPermanentlyRejectRouteImage(failed), true);

assert.match(functionSource("prepareRouteImageBatch"), /Promise\.all/u, "Six covers must preload concurrently");
assert.match(source, /_coverLoadStatus/u, "Cover completion order must be stored independently from route order");
assert.match(source, /data-route-cover-state/u, "Rendered placeholders and ready images must be distinguishable");

console.log("PASS verify-route-v2-six-card-infinite-scroll");
