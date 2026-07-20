# Route Repository Architecture Verifier Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stale repository architecture verifier accurately exercise current strict-feed and route-dedupe contracts without changing production behavior.

**Architecture:** Keep `createAcceptedRouteRepository()` and `isDuplicateRoute()` unchanged. Upgrade the verifier's route fixture with an explicit country-matched verified online cover so feed-focused assertions test an eligible record, and align the hidden duration-variant assertion with the current title/destination-skeleton identity rule.

**Tech Stack:** Node.js ES modules, built-in `assert`, existing Route V2 repository and dedupe modules, Git history inspection.

---

### Task 1: Capture the failing strict-feed contract

**Files:**
- Inspect: `scripts/verify-route-repository-architecture.mjs:22-79`
- Inspect: `src/lib/routes/accepted-repository.mjs:170-180`
- Inspect: `src/lib/routes/accepted-repository.mjs:481-523`

- [x] Run `node scripts/verify-route-repository-architecture.mjs` and confirm exit 1 at line 69 with `0 !== 1`.
- [x] Confirm `upsert(route()).accepted` is true, proving persistence succeeds before the feed query filters the record.
- [x] Confirm an empty-query list with `limit < 100_000` is a strict-feed boundary requiring `feedReady`, `onlineCoverAsset`, matching `imageCountryCodes`, and no bad-image signal.
- [x] Confirm `git blame` attributes both the strict-feed rule and stale fixture to baseline commit `d0b2fdc`.

### Task 2: Make the feed fixture explicitly eligible

**Files:**
- Modify: `scripts/verify-route-repository-architecture.mjs:22-64`
- Do not modify: `src/lib/routes/accepted-repository.mjs`

- [x] Add an immutable verified online-cover fixture derived from the existing licensed cover:

```js
const onlineCoverAsset = {
  ...coverAsset,
  title: "Kansai, Japan",
  imageCountryCodes: ["JP"],
  status: "verified",
  semanticStatus: "verified",
  coverStatus: "verified",
  matchEvidence: "JP",
  imageDedupeKey: "kansai-route.jpg",
  dedupeKey: "kansai-route.jpg",
  verifiedAt: "2026-07-20T00:00:00.000Z",
};
```

- [x] Add the current feed eligibility fields to `route(overrides)` while retaining override support:

```js
onlineCoverAsset: overrides.onlineCoverAsset === undefined ? onlineCoverAsset : overrides.onlineCoverAsset,
feedReady: overrides.feedReady ?? true,
feedReadyAt: overrides.feedReadyAt || "2026-07-20T00:00:00.000Z",
coverStatus: overrides.coverStatus || "verified",
```

- [x] Run `node scripts/verify-route-repository-architecture.mjs` and confirm the original line 69 and feed-buffer assertions now pass.

### Task 3: Align the hidden duration-variant assertion

**Files:**
- Modify: `scripts/verify-route-repository-architecture.mjs:137-146`
- Do not modify: `src/lib/routes/route-dedupe.mjs`

- [x] Confirm the two duration fixtures still share their canonical title and complete Country/Destination skeleton.
- [x] Rename `versions` to `durationVariants` and assert one surviving route:

```js
const durationVariants = dedupeRouteRecords([
  route({ id: "kansai-5", recommendedDays: "5-7天", sourceUrl: "https://example.org/kansai-5" }),
  route({ id: "kansai-10", recommendedDays: "10天", sourceUrl: "https://example.org/kansai-10" }),
]);
assert.equal(durationVariants.length, 1, "Routes with the same title and destination skeleton must collapse even when duration differs");
```

- [x] Run `node scripts/verify-route-repository-architecture.mjs` and expect `Route repository architecture invariants verified.` with exit 0.

### Task 4: Run related regressions

**Files:**
- Verify: `scripts/verify-route-v2-online-only.mjs`
- Verify: `scripts/verify-route-v2-ui-contract.mjs`
- Verify: `scripts/verify-route-v2-six-card-infinite-scroll.mjs`
- Verify: `scripts/verify-route-v2-planner-search-ui-visibility.mjs`
- Verify: `scripts/verify-route-online-standardizer.mjs`
- Verify: `scripts/verify-route-v2-foundation.mjs`

- [x] Run all six listed verifiers and confirm exit 0.
- [x] Run `node scripts/verify-planner-warmup-integration.mjs` and confirm strict-feed persistence/visibility coverage still passes.
- [x] Run `git diff --check` and `git diff --cached --check`; both must exit 0.

### Task 5: Verify scope and leave the maintenance uncommitted

**Files:**
- Modified: `scripts/verify-route-repository-architecture.mjs`
- Added: `docs/superpowers/plans/2026-07-20-route-repository-architecture-verifier-maintenance.md`

- [x] Confirm no production repository, dedupe, infinite-scroll, Entity Layer, Planner data, or knowledge asset file changed.
- [x] Confirm the earlier two verifier fixes remain intact.
- [x] Confirm staged files remain zero and no commit, push, PR, tag, amend, rebase, or squash operation occurred.
