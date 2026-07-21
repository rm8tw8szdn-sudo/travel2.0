# Route V2 Feed Exhaustion Stable Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every strictly displayable Route V2 feed record reachable exactly once per session, terminate pagination with `hasMore=false` and `nextCursor=null`, and stop all frontend loading after exhaustion.

**Architecture:** Build one deterministic, complete feed permutation from the strict eligible pool for each `(sessionId, query/filter, routeType)` combination. Derive every record's stable order key only from `sessionId + routeId`, encode the last key plus ordering identity in a keyset cursor, and expose consistent returned/remaining counts. The browser requests six records per page, trusts the terminal response, disconnects its observer, and retains a two-empty-page fail-safe without changing image, Planner, Entity Layer, or accepted-route data behavior.

**Tech Stack:** Node.js ESM, existing accepted route repository and discovery service, browser JavaScript, Node assertion/verifier scripts, in-app browser for local pressure testing.

---

### Task 1: Lock the backend exhaustion contract with a failing verifier

**Files:**
- Create: `scripts/verify-route-v2-feed-exhaustion.mjs`
- Test: `src/lib/routes/accepted-repository.mjs`
- Test: `src/lib/routes/discovery.mjs`

- [ ] **Step 1: Build a 357-record strict-feed fixture and expected ID set**

Create accepted records with verified `onlineCoverAsset` metadata, cross-country route type, stable IDs, and deliberately repeated continent/country clusters. Keep the fixture in memory or in an automatically removed temporary directory; do not touch published accepted-route data.

```js
const ROUTE_COUNT = 357;
const PAGE_SIZE = 6;
const records = Array.from({ length: ROUTE_COUNT }, (_, index) =>
  createStrictFeedRecord(index, {
    countries: index % 3 === 0 ? ["NL", "BE"] : ["CZ", "PL"],
    onlineCoverAsset: verifiedCover(index),
  }));
const expectedIds = new Set(records.map((record) => record.id));
```

- [ ] **Step 2: Add complete-consumption assertions for two sessions**

Paginate by following only `nextCursor`. Assert 59 full six-record pages plus a final three-record page, 357 unique IDs, no empty page, and a terminal response with consistent counts.

```js
assert.equal(result.ids.length, 357);
assert.equal(new Set(result.ids).size, 357);
assert.deepEqual(new Set(result.ids), expectedIds);
assert.equal(result.pages.at(-1).records.length, 3);
assert.equal(result.pages.at(-1).returnedCount, 3);
assert.equal(result.pages.at(-1).remainingCount, 0);
assert.equal(result.pages.at(-1).hasMore, false);
assert.equal(result.pages.at(-1).nextCursor, null);
assert.equal(result.emptyPages, 0);
```

- [ ] **Step 3: Add deterministic-session and discovery propagation assertions**

Run the same session twice and compare exact order. Run a second session and require a normally different order while proving both sessions consume the same complete set. After the first page, mutate a later record's `acceptedAt`/media metadata and separately insert a new record; the original 357 IDs must still appear exactly once. Replay one cursor twice, and verify session/route-type mismatches fail closed. Stub `needsRefill=true` and assert discovery still reports repository exhaustion through `hasMore=false` and `nextCursor=null`; `pending` may independently describe refill work.

```js
assert.deepEqual(sessionAFirst.ids, sessionAReplay.ids);
assert.notDeepEqual(sessionAFirst.ids, sessionB.ids);
assert.deepEqual(new Set(sessionB.ids), expectedIds);
assert.equal(new Set(mutationContinuation.ids).size, 357);
assert.ok([...oldIdCounts.values()].every((count) => count === 1));
assert.deepEqual(replayPageA, replayPageB);
assert.equal(cursorMismatch.paginationStatus, "cursor-mismatch");
assert.equal(discoveryTerminal.hasMore, false);
assert.equal(discoveryTerminal.nextCursor, null);
```

- [ ] **Step 4: Run the verifier and confirm it fails for the current bug**

Run: `node scripts/verify-route-v2-feed-exhaustion.mjs`

Expected: FAIL because the current cursor changes `feedCycle`, loses at least one route, repeats older routes, and never returns a terminal `hasMore=false` state.

### Task 2: Replace cyclic sampling with a stable per-session continuation cursor

**Files:**
- Modify: `src/lib/routes/accepted-repository.mjs:109-113,252-311,481-648`
- Test: `scripts/verify-route-v2-feed-exhaustion.mjs`

- [ ] **Step 1: Add a complete deterministic session ordering helper**

Use the existing stable hash as the session seed and generate one complete permutation without dropping records or reseeding between pages. Do not include mutable record fields such as `acceptedAt`, freshness, media status, or pool size in the order key.

```js
const FEED_ORDER_VERSION = 3;

function feedSessionSortKey(record, { sessionId = "" } = {}) {
  return {
    randomRank: stableHash(`${sessionId}:${record?.id || ""}`),
    id: String(record?.id || ""),
  };
}

function stableSessionFeedOrder(pool, { sessionId = "" } = {}) {
  return pool.slice().sort((left, right) => compareSessionFeedKeys(
    feedSessionSortKey(left, { sessionId }),
    feedSessionSortKey(right, { sessionId }),
  ));
}
```

- [ ] **Step 2: Define and validate the keyset cursor identity**

Bind the cursor to the feed order version, session, and filter/route type. The continuation key is the prior page's `randomRank + id`; a mismatched cursor fails closed instead of silently restarting at page one.

```js
const orderIdentity = {
  orderVersion: FEED_ORDER_VERSION,
  sessionHash: stableHash(sessionId),
  filterHash: stableHash(JSON.stringify({ query: needle, routeType: requestedKind, strictFeed })),
};
const cursorMatches = decodedCursor?.provider === "accepted-repository"
  && decodedCursor?.orderVersion === orderIdentity.orderVersion
  && decodedCursor?.sessionHash === orderIdentity.sessionHash
  && decodedCursor?.filterHash === orderIdentity.filterHash
  && Number.isFinite(Number(decodedCursor?.randomRank))
  && Boolean(decodedCursor?.id);
if (cursor && !cursorMatches) return cursorMismatchTerminalResult();
const anchorKey = cursorMatches
  ? { randomRank: Number(decodedCursor.randomRank), id: String(decodedCursor.id) }
  : null;
```

- [ ] **Step 3: Page by scanning forward once and compute true remaining count**

For randomized Feed calls, ignore dynamic cluster exclusions as a permanent filter because doing so can starve future records. Use `excludeIds` only as an already-displayed safety set and select records whose stable key is strictly greater than the anchor. This remains correct if mutable route fields change or a route is inserted during the session.

```js
const page = [];
let nextIndex = anchorKey
  ? orderedPool.findIndex((record) => compareSessionFeedKeys(
    feedSessionSortKey(record, { sessionId }),
    anchorKey,
  ) > 0)
  : 0;
if (nextIndex < 0) nextIndex = orderedPool.length;
while (nextIndex < orderedPool.length && page.length < limit) {
  const record = orderedPool[nextIndex];
  nextIndex += 1;
  if (excluded.has(record.id)) continue;
  page.push(record);
}
const remainingCount = orderedPool
  .slice(nextIndex)
  .filter((record) => !excluded.has(record.id)).length;
const hasMore = remainingCount > 0;
const last = page.at(-1) || null;
const nextCursor = hasMore
  ? encodeDiscoveryCursor({
    provider: "accepted-repository",
    ...orderIdentity,
    ...feedSessionSortKey(last, { sessionId }),
  })
  : null;
```

- [ ] **Step 4: Return internally consistent pagination metadata**

```js
return {
  records: page.map(publicFeedRecord),
  nextCursor,
  hasMore,
  returnedCount: page.length,
  remainingCount,
  total: orderedPool.length,
  repositoryVersion: version(),
};
```

- [ ] **Step 5: Preserve the existing non-session/search pagination path**

Keep the legacy sorted/anchor path for calls without a feed `sessionId`, including internal `limit >= 100_000` snapshots. Do not change accepted-route records, validation rules, image metadata, or repository persistence.

- [ ] **Step 6: Run the exhaustion verifier**

Run: `node scripts/verify-route-v2-feed-exhaustion.mjs`

Expected: PASS for 357/357 complete consumption, two-session stability, unique IDs, last batch of three, and terminal false/null state.

### Task 3: Make discovery preserve the repository terminal state

**Files:**
- Modify: `src/lib/routes/discovery.mjs:151-173,374-381`
- Test: `scripts/verify-route-v2-feed-exhaustion.mjs`

- [ ] **Step 1: Propagate returned and remaining counts**

```js
returnedCount: Number.isFinite(result.returnedCount)
  ? result.returnedCount
  : (result.records || []).length,
remainingCount: Number.isFinite(result.remainingCount)
  ? result.remainingCount
  : null,
```

- [ ] **Step 2: Stop converting refill demand into pagination availability**

`needsRefill` may enqueue work and set `pending`, but it must not claim that already accepted records remain.

```js
return response({
  records: page.records,
  nextCursor: page.hasMore ? page.nextCursor : null,
  hasMore: Boolean(page.hasMore),
  returnedCount: page.returnedCount,
  remainingCount: page.remainingCount,
  pending,
  pendingSearchJobId,
  diagnostics,
}, page.records.length ? "REPOSITORY" : "EMPTY", id);
```

- [ ] **Step 3: Re-run the backend verifier**

Run: `node scripts/verify-route-v2-feed-exhaustion.mjs`

Expected: PASS, including the `needsRefill=true` exhaustion case.

### Task 4: Lock the frontend terminal state and empty-page guard with failing tests

**Files:**
- Modify: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`
- Test: `routes.js`

- [ ] **Step 1: Add source contract assertions**

Assert Feed requests exactly six records, no 120-record candidate request or eight-hop backfill remains, a terminal response is authoritative, and the existing complete-state/observer logic stays present.

```js
assert.match(requestSource, /limit:\s*isSearch \? SEARCH_PAGE_SIZE : FEED_PAGE_SIZE/u);
assert.doesNotMatch(loadSource, /FEED_BACKFILL_HOP_LIMIT|tabPoolExhausted/u);
assert.match(stateSource, /已经到底了/u);
assert.match(observerSource, /disconnect/u);
```

- [ ] **Step 2: Add a pure continuation-state verifier**

Extract and execute a small `resolveFeedContinuation` function in the VM. Cover immediate exhaustion, one inconsistent empty confirmation, a second inconsistent empty response that fails closed, and reset after a non-empty page.

```js
assert.deepEqual(resolveFeedContinuation({ insertedCount: 0, serverHasMore: false, previousEmptyCount: 0 }), {
  hasMore: false, cursor: null, consecutiveEmptyPages: 0, retry: false, reason: "exhausted",
});
assert.equal(firstEmpty.retry, true);
assert.equal(secondEmpty.hasMore, false);
assert.equal(secondEmpty.reason, "empty-page-guard");
```

- [ ] **Step 3: Run the frontend verifier and confirm it fails before implementation**

Run: `node scripts/verify-route-v2-six-card-infinite-scroll.mjs`

Expected: FAIL because current Feed requests 120 records, performs repeated backfill, and contains no two-empty-page guard.

### Task 5: Make the browser consume six records and stop after exhaustion

**Files:**
- Modify: `routes.js:14-23,415-442,1364-1380,1597-1645,1998-2167,2288-2357`
- Test: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`

- [ ] **Step 1: Request only the next six Feed records**

```js
limit: isSearch ? SEARCH_PAGE_SIZE : FEED_PAGE_SIZE,
```

Remove `FEED_CANDIDATE_PAGE_SIZE` and `FEED_BACKFILL_HOP_LIMIT` only if no remaining non-pagination code uses them. Preserve `BATCH_SIZE=6`, image parallelism, image deadlines, and placeholder behavior.

- [ ] **Step 2: Track empty confirmations and centralize continuation decisions**

```js
function resolveFeedContinuation({ insertedCount, serverHasMore, nextCursor, previousEmptyCount }) {
  if (insertedCount > 0) return {
    hasMore: Boolean(serverHasMore && nextCursor), cursor: serverHasMore ? nextCursor : null,
    consecutiveEmptyPages: 0, retry: false, reason: serverHasMore ? "continue" : "exhausted",
  };
  if (!serverHasMore || !nextCursor) return {
    hasMore: false, cursor: null, consecutiveEmptyPages: 0, retry: false, reason: "exhausted",
  };
  const count = previousEmptyCount + 1;
  if (count >= 2) return {
    hasMore: false, cursor: null, consecutiveEmptyPages: count, retry: false, reason: "empty-page-guard",
  };
  return {
    hasMore: true, cursor: nextCursor, consecutiveEmptyPages: count, retry: true, reason: "empty-page-confirmation",
  };
}
```

- [ ] **Step 3: Remove route-type fallback and multi-hop backfill**

Select at most six records from the single server page, prepare those images in parallel, append them once in server order, and apply `resolveFeedContinuation`. Never clear `feedRouteType` to fall through to a different pool after exhaustion.

```js
const batchRecords = selectAppendableRecords(pageRecords, FEED_PAGE_SIZE, previousRecords);
if (!prefetched) imageBatch = await prepareRouteImageBatch(batchRecords, previousRecords, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
insertedRecords = appendRecords(batchRecords);
const continuation = resolveFeedContinuation({
  insertedCount: insertedRecords.length,
  serverHasMore: payload.hasMore === true,
  nextCursor: payload.nextCursor || null,
  previousEmptyCount: feedState.consecutiveEmptyPages,
});
Object.assign(feedState, {
  cursor: continuation.cursor,
  hasMore: continuation.hasMore,
  consecutiveEmptyPages: continuation.consecutiveEmptyPages,
  pendingMore: continuation.retry,
  pendingRetryAt: continuation.retry ? Date.now() + 1_500 : 0,
});
```

- [ ] **Step 4: Reject legacy bootstrap and preload cursors**

Decode the base64url cursor before adopting checked-in bootstrap or session preload data. Accept only the complete v3 keyset identity (`version`, provider, order version, session/filter hashes, random rank, and non-empty route ID); otherwise return `null` and fetch a fresh first page from the live API. Do not regenerate or modify `route-feed-bootstrap.js`.

```js
return payload?.version === 1
  && payload?.provider === "accepted-repository"
  && payload?.orderVersion === 3
  && Number.isSafeInteger(payload.sessionHash)
  && Number.isSafeInteger(payload.filterHash)
  && Number.isInteger(payload.randomRank)
  && payload.randomRank >= 0
  && payload.randomRank <= 0xffff_ffff
  && Boolean(String(payload.id || "").trim());
```

- [ ] **Step 5: Preserve prefetched terminal metadata even for an empty page**

Remove the early return for `pageRecords.length === 0` in prefetch and accept any cached `pageRecords` array in `loadFeed`. This lets a prefetched terminal result be consumed without issuing the same network request again.

- [ ] **Step 6: Stop observer, loading, retry timers, and future requests at terminal state**

On false/null or the guard terminal state, clear `pendingMore`, `pendingRetryAt`, and stale prefetch state, then render. The existing `updateRouteFeedObserver()` disconnect and `stateMarkup()` complete text become active; all wheel/scroll/poller paths remain gated by `canRequestMoreFeed()`.

- [ ] **Step 7: Record diagnostics without console warnings**

Add `paginationReason`, `returnedCount`, `remainingCount`, and `consecutiveEmptyPages` to `feedState.lastLoadDebug`. Do not emit a warning for the fail-safe, so a controlled server inconsistency does not create noisy browser console output.

- [ ] **Step 8: Run the frontend verifier**

Run: `node scripts/verify-route-v2-six-card-infinite-scroll.mjs`

Expected: PASS for six-record requests, partial final page, terminal state, observer disconnect contract, one-confirmation empty-page guard, no card deletion, and unchanged image behavior.

### Task 6: Run focused and regression verification

**Files:**
- Verify only; do not modify unrelated files.

- [ ] **Step 1: Run the focused verifiers**

Run:

```powershell
node scripts/verify-route-v2-feed-exhaustion.mjs
node scripts/verify-route-v2-six-card-infinite-scroll.mjs
```

Expected: both PASS.

- [ ] **Step 2: Run Planner, Search, image, City UI, and Route V2 regressions**

Run:

```powershell
node scripts/verify-route-v2-planner-search-ui-visibility.mjs
node scripts/verify-search-v1.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-image-assets-pilot.mjs
node scripts/verify-route-wikimedia-images.mjs
node scripts/verify-route-v2-online-only.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs
node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs
```

Expected: all directly related verifiers PASS. Record any pre-existing unrelated baseline failure without repairing it.

- [ ] **Step 3: Check whitespace and protected areas**

Run:

```powershell
git diff --check
git diff --name-status
git status --short --branch
```

Expected: no whitespace errors; no changes to Planner data structures, Entity Layer data, Country/City/POI assets, accepted-route data, image loading logic, cache, or staged files.

### Task 7: Run the real local 100-scroll pressure test

**Files:**
- Verify only; temporary browser instrumentation must not be saved in the repository.

- [ ] **Step 1: Snapshot cache and accepted-route assets**

Record `.route-v2-cache` file count, total bytes, manifest/hash/mtime, and the accepted-route repository hash without opening preload/image/discovery paths outside the local server.

- [ ] **Step 2: Start the real service on an unused local port**

Run:

```powershell
$env:PORT=4174
node server.js
```

Expected: service starts without compile/runtime errors. Do not open the homepage; navigate directly to the Route V2 page.

- [ ] **Step 3: Block external traffic and perform at least 100 scroll attempts**

Use the in-app browser. Allow only `127.0.0.1`/`localhost`; fulfill image-search/image-proxy requests locally or let the existing placeholder path handle them. Count Discovery requests, card IDs, batch insertions, empty pages, timings, console messages, and the final feed data attributes.

- [ ] **Step 4: Assert the real exhaustion standard**

Expected:

```text
strict eligible routes = 357
displayed cards = 357
unique route IDs = 357
last batch = 3
empty batches = 0
hasMore = false
cursor = null
complete text = 已经到底了
requests after exhaustion = 0
duplicate cards = 0
blank cards = 0
lost cards = 0
console errors/warnings = 0
```

Record first-page timing, per-batch average and maximum duration, image-ready/placeholder counts, and exact total Discovery request count.

- [ ] **Step 5: Stop the service and prove no side effects**

Stop the service normally, confirm the port is released, compare cache and accepted-route snapshots, and verify the worktree contains only the planned source/verifier/plan changes plus the pre-existing user changes.

### Task 8: Final scope audit without staging or committing

**Files:**
- Inspect: `src/lib/routes/accepted-repository.mjs`
- Inspect: `src/lib/routes/discovery.mjs`
- Inspect: `routes.js`
- Inspect: `scripts/verify-route-v2-feed-exhaustion.mjs`
- Inspect: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`
- Inspect: `docs/superpowers/plans/2026-07-21-route-v2-feed-exhaustion-stable-cursor.md`

- [ ] **Step 1: Confirm no prohibited Git operation occurred**

Run: `git diff --cached --name-status`

Expected: no staged files. Do not run commit, push, PR, tag, amend, rebase, squash, or branch commands.

- [ ] **Step 2: Report exact results and remaining risks**

Report the root cause, true remaining-count calculation, session-stable cursor identity, why the last route cannot starve, observer/empty-page termination, modified files, complete pressure-test metrics, cache/asset invariance, and final dirty worktree separation.
