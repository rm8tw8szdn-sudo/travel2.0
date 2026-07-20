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
