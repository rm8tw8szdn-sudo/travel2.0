# Feed Eligible Metric Definition

Generated: 2026-07-13

This document fixes the official Feed eligible metric for Route Generation V2 Phase 1-7. It is a metric definition only. It does not change Feed behavior, route data, cache, Planner, Search, Detail, or image logic.

## Why This Exists

Two existing reports used different counting shortcuts:

| Report | Recorded value | What it counted |
| --- | ---: | --- |
| `PLANNER_ROUTE_REPOSITORY_AUDIT.md` | 109 | A historical all-route strict Feed page output count, described as approximate `hasVerifiedFeedCover`. |
| `PHASE_0_BASELINE_REPORT.md` | 198 | A historical sum of strict page output counts by route type: cross 91 + single 107. |

These values are not directly comparable. They both used rendered/list output counts rather than the underlying strict Feed-ready pool size.

## Current Code Locations

| Concern | Location |
| --- | --- |
| Verified cover eligibility predicate | `<PROJECT_ROOT>/src/lib/routes/accepted-repository.mjs`, `hasVerifiedFeedCover` |
| Strict Feed mode switch | `<PROJECT_ROOT>/src/lib/routes/accepted-repository.mjs`, `strictFeed = !needle && limit < 100_000` |
| Strict Feed-ready pool construction | `<PROJECT_ROOT>/src/lib/routes/accepted-repository.mjs`, `feedReadyPool = strictFeed ? typedPool.filter(hasVerifiedFeedCover) : []` |
| Page output after ordering/diversity/cursor logic | `<PROJECT_ROOT>/src/lib/routes/accepted-repository.mjs`, `list()` result `records` |

## Current Predicate

A route is in the strict Feed-ready pool only when:

- strict Feed mode is active: no search keyword and `limit < 100000`;
- the route has `feedReady` and an `onlineCoverAsset`;
- the cover has an image URL;
- the cover does not match known bad image signals;
- the route has country codes;
- `onlineCoverAsset.imageCountryCodes` intersects the route country codes;
- the asset or route marks the cover as verified through `status`, `semanticStatus`, `coverStatus`, or `feedReady`.

## Why 109 And 198 Differ

The 109-style count and the 198-style count used different aggregation scopes:

- The 109-style count measured `records.length` from an all-route strict Feed query. This is not the raw eligible pool. It is the number of records returned after strict filtering plus ordering/diversity/page-output logic.
- The 198-style count measured type-specific `records.length` for cross and single separately, then added them together. Because diversity and page-output logic are scoped to each typed query, this can produce a different number from one all-route query.

The difference is therefore primarily a metric definition problem, not proof that route data changed.

The accepted repository hash recorded for this safety pass is unchanged from the Phase 0 baseline:

`AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F`

Current retest with the current code returned:

| Query | `records.length` | `total` |
| --- | ---: | ---: |
| strict all routes | 108 | 851 |
| strict cross | 89 | 357 |
| strict single | 83 | 494 |
| non-strict all routes | 4577 | 5500 |

The current `records.length` values differ from the historical Phase 0 numbers because `records.length` is a page/list output shaped by current repository code and diversity constraints. It is not a stable eligibility metric.

## Official Metric For Phase 1-7

The official Feed eligible metric is:

`FeedReadyPoolCount = repository.list({ limit: 99999, routeType? }).total`

Required query conditions:

- `q` or search keyword must be empty.
- `limit` must be below `100000` to activate strict Feed mode.
- Optional `routeType` may be `cross` or `single`.
- Use `total`, not `records.length`.

Official current baseline:

| Metric | Value |
| --- | ---: |
| FeedReadyPoolCount all | 851 |
| FeedReadyPoolCount cross | 357 |
| FeedReadyPoolCount single | 494 |

The typed values add up exactly to the all-route value:

`357 + 494 = 851`

## Secondary Metric

When measuring what one API call can actually return to the UI, use a separate metric:

`FeedPageOutputCount = repository.list(...).records.length`

This metric is allowed to vary by cursor, route type, session randomization, diversity rules, and page size. It must not be used as the official Feed eligible baseline.

## Rule Going Forward

Use `FeedReadyPoolCount` for architecture, migration, audit, and Phase 1-7 baseline comparisons.

Use `FeedPageOutputCount` only for UI behavior, infinite-scroll, and browser-flow checks.
