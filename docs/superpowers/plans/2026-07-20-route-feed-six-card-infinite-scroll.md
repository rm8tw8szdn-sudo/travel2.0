# Route Feed Six-Card Infinite Scroll Implementation Plan

> **For Codex:** Execute this plan inline. Preserve the existing Planner-search visibility changes and do not stage or commit any files.

**Goal:** Render route results in stable six-card batches, preloading each batch's covers in parallel while ensuring slow or failed images never suppress route text or leave loading states stuck.

**Architecture:** Keep the existing route feed state and API contracts. Add a small batch-image state machine inside `routes.js`, make record selection independent of image readiness, and let the existing list append path insert a prepared batch atomically. An `IntersectionObserver` sentinel with an 800px root margin starts one guarded batch task at a time; explicit image errors may enter the runtime bad-image set, while timeouts remain retryable and can replace placeholders later without reinserting cards.

**Tech Stack:** Browser JavaScript, DOM `IntersectionObserver`, existing Node server and verifier scripts.

---

### Task 1: Lock the behavior with a dedicated verifier

**Files:**
- Create: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`
- Test: `routes.js`

**Step 1: Write failing structural and behavioral checks**

Cover `BATCH_SIZE = 6`, the 800px sentinel margin, stable ID selection, a single in-flight load guard, atomic batch insertion, no 850ms insertion cadence, final partial batches, observer shutdown, and independent Planner-search completion.

**Step 2: Add fake-image timing tests**

Extract the image-preload helper into a VM and simulate immediate load, late load after the ideal window, permanent timeout, and explicit error. Assert that only explicit error is permanently bad and that late success updates one existing card instead of inserting another.

**Step 3: Run the verifier and confirm it fails for the current implementation**

Run: `node scripts/verify-route-v2-six-card-infinite-scroll.mjs`

Expected: FAIL because search still requests 20, image readiness filters records, cards are removed on image timeout/error, and the sentinel margin is 240px.

### Task 2: Separate route existence from image readiness

**Files:**
- Modify: `routes.js`
- Test: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`

**Step 1: Introduce six-card batch constants**

Use a shared `BATCH_SIZE = 6` for feed and Planner search. Remove the fixed 850ms insertion wait and use a bounded parallel image-preparation deadline near 2 seconds.

**Step 2: Select records before preparing images**

Make `visibleRecords()` and `selectAppendableRecords()` operate on valid stable route IDs rather than `hasReadyRouteCover()`. Preserve input order and deduplicate against already rendered stable IDs/titles without requiring unique image URLs.

**Step 3: Keep cards when covers are unavailable**

Always render the route card and its text. Render `assets/trip-cover-placeholder.svg` while a cover is pending, timed out, missing, or explicitly failed. Remove image-error paths that delete an individual card or an entire batch.

### Task 3: Implement bounded parallel cover preparation

**Files:**
- Modify: `routes.js`
- Test: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`

**Step 1: Return typed image outcomes**

Change the image warmer to return `ready`, `timeout`, `error`, or `aborted`. Only `error` may add a URL to `badRuntimeImageUrls`; `timeout` keeps the URL retryable.

**Step 2: Prepare all six covers concurrently**

Determine the next stable batch first, then call the preloader for every cover in parallel. Insert when all settle or at the maximum wait deadline. Store per-record cover state so the original route order does not depend on completion order.

**Step 3: Support late success without reinsertion**

If an image finishes after the deadline, update only the existing card's image element by stable route ID. Do not append or rerender the card list.

### Task 4: Convert feed and Planner results to infinite six-card batches

**Files:**
- Modify: `routes.js`
- Modify: `mobile.css` only if placeholder presentation needs a minimal style adjustment
- Test: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`

**Step 1: Make both query and non-query branches append one batch**

Planner search must end its search loading state as soon as results are available, then insert at most six text cards independent of cover readiness. Subsequent query pages follow the same sentinel flow.

**Step 2: Guard one load task**

Retain the existing `loading` guard and add an explicit shared promise if needed so repeated observer/scroll callbacks cannot start duplicate requests or insert duplicate IDs.

**Step 3: Configure and stop the sentinel**

Observe with `rootMargin: "800px 0px"`. Disconnect when `hasMore` becomes false and render a lightweight bottom completion state. Keep retry UI only for real data-load errors; do not add pagination controls.

**Step 4: Preserve incremental DOM**

Append the batch once with `insertAdjacentHTML`; do not replace previously rendered nodes. Show `正在加载更多路线…` only at the bottom and clear it in success, error, timeout, and abort paths.

### Task 5: Run automated regression checks

**Files:**
- Verify only; do not stage or commit

**Step 1: Run the dedicated verifier**

Run: `node scripts/verify-route-v2-six-card-infinite-scroll.mjs`

Expected: PASS for all requested infinite-scroll and image-state scenarios.

**Step 2: Run directly related existing verifiers**

Run the Planner search visibility verifier, route UI/runtime verifier(s) discovered in `scripts/`, and the project test command if configured. Record unrelated pre-existing failures without changing their baselines.

**Step 3: Check whitespace and scope**

Run: `git diff --check`

Confirm no backend API, Entity Layer, Planner data structure, knowledge asset, cache, or staged changes.

### Task 6: Perform cold- and warm-cache browser acceptance

**Files:**
- Verify only

**Step 1: Snapshot cache and start the existing local server**

Record `.route-v2-cache` file inventory, total size, hashes, and mtimes without deleting it. Start the configured server on an unused localhost port.

**Step 2: Cold run**

Open the relevant route/Planner page locally, record time to first six cards, trigger the sentinel, record trigger-to-insert time, ready-cover and placeholder counts, duplicate/missing IDs, and completion of both search and batch loading states.

**Step 3: Warm run**

Repeat the same flow in the same browser session and record the same metrics. Confirm existing cards retain their DOM identity while the next six are appended.

**Step 4: Cleanup**

Stop the server, release the port, finalize browser tabs, compare the cache snapshot, and report the final unstaged/untracked Git status. Do not stage, commit, push, open a PR, or create a tag.
