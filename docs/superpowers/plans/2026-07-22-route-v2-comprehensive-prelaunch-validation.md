# Route V2 Comprehensive Prelaunch Validation Plan

> **Execution note:** Run each section from the repository root. The automated verifier owns its temporary directory and must leave the repository unchanged.

**Goal:** Re-run the Route V2 release checks without writing real Accepted, Cache, Knowledge, Evidence, Ready Pool, browser-profile, screenshot, or performance artifacts.

**Runtime:** This repository has no package manifest or production-build command. Its checked-in equivalent preview is `node server.js`; the comprehensive verifier starts that preview on a dynamically selected localhost port and stops it before exiting.

## 1. Protect and inspect the baseline

Run:

```bash
git status --short --branch
git log -3 --oneline
git diff --check
```

Stop if unrelated changes are present. Record per-file SHA-256 manifests for:

- `.route-v2-cache/accepted-routes.json`
- `.route-v2-cache`
- `data/knowledge`

Do not clean, restore, or rewrite user-owned changes.

## 2. Run the isolated comprehensive verifier

Run twice:

```bash
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
```

Expected on both runs:

- `status: PASS`
- a dynamically selected preview port is released
- one unique temporary root is used and removed
- Search cache, image-search cache, image-proxy cache, Candidate, Trace, Evidence, local Evidence, Ready Pool, browser profile, screenshots, and performance output are redirected below that temporary root
- real Accepted, Cache, and Knowledge manifests are unchanged
- no external evidence provider is enabled

The verifier delegates business assertions to existing verifier entry points instead of copying their implementation.

## 3. Run the directed regression matrix

Run:

```bash
node scripts/verify-route-v2-prelaunch-browser.mjs
node scripts/verify-route-v2-route-summary-quality.mjs
node scripts/verify-route-v2-fallback-constraint-preservation.mjs
node scripts/verify-route-v2-time-intent-boundaries.mjs
node scripts/verify-route-v2-multi-city-intent.mjs
node scripts/verify-route-v2-search-acceptance-gate.mjs
node scripts/verify-planner-pipeline.mjs
node scripts/verify-route-v2-feed-exhaustion.mjs
node scripts/verify-route-v2-six-card-infinite-scroll.mjs
node scripts/verify-route-v2-image-assets-pilot.mjs
node scripts/verify-route-v2-image-proxy-network-boundary.mjs
node scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
git diff --check
git diff --cached --check
```

Use the comprehensive verifier for the live localhost probe because it supplies isolated storage paths and a dynamic port. The standalone prelaunch-browser invocation above performs its static contract checks when no base URL is supplied.

## 4. Perform real browser acceptance in an isolated session

Start `node server.js` with the same isolation variables used by `scripts/verify-route-v2-comprehensive-prelaunch.mjs`. Use an available localhost port and a disposable browser profile outside the repository.

Verify:

1. Route Feed initially shows six cards.
2. At least five additional batches append without removing or duplicating cards.
3. Searches settle for:
   - `东京京都大阪7天`
   - `东京→京都→大阪7天`
   - `东京京都大阪奈良1天`
   - `2月去日本2天`
4. The impossible one-day four-city request shows the constraint-conflict state instead of a relaxed route.
5. A route detail page renders its route and destination images from configured or local assets.
6. At 390px and 360px, the route title uses at most two lines and the introduction uses at most three lines, without horizontal overflow.
7. A failed image falls back locally and does not remove its card.
8. Blocking external image domains does not delay the first or subsequent feed batches.
9. Console errors and warnings caused by Route V2 are zero.

Record browser-request hosts separately from any server-side upstream hosts. Route V2's default Feed, Search, and Detail chain must not request `/api/routes/image-search`, `/api/routes/image-proxy`, Wikimedia, Unsplash, or another external image host.

Stop the preview and confirm its port can be rebound. Remove the disposable browser profile and any screenshot or performance directory.

## 5. Review image behavior

The default image priority is:

1. configured stable route asset;
2. checked-in route asset;
3. first destination's checked-in city asset;
4. first country's checked-in asset;
5. checked-in placeholder.

Online image search and proxy support may remain available only behind explicit configuration. A default Route V2 user request must not wait for or populate the proxy cache.

## 6. Final integrity and scope review

Recreate the Accepted, Cache, and Knowledge manifests and compare them byte-for-byte with the baseline. Confirm the repository contains no runtime Evidence, Ready Pool, browser profile, screenshot, performance output, absolute local path, API key, or external image file.

Run:

```bash
git status --short
git diff --name-status
git diff --stat
git diff --check
git diff
```

Stage only the intended validation, local-image fallback, and narrow mobile style files. Review the complete staged diff, then run:

```bash
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Do not push, deploy, tag, amend, rebase, squash, or switch branches as part of this validation plan.
