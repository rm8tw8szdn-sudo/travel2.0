# Route V2 Production Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the production-facing gaps found in the handoff review: stable weighted feed ordering, image-license audit visibility, and a clear path for expanding Gold Cases beyond the current 11.

**Architecture:** Keep user-facing discovery repository-only. Put feed ranking inside `accepted-repository.mjs` so every feed/search caller gets the same deterministic order and cursor semantics. Add a read-only audit script for accepted-route cover licensing; do not mutate route caches during audit.

**Tech Stack:** Node.js ESM scripts, existing Route V2 repository modules, JSON cache files under `.route-v2-cache`.

---

### Task 1: Stable Weighted Feed Ranking

**Files:**
- Modify: `src/lib/routes/contracts.mjs`
- Modify: `src/lib/routes/accepted-repository.mjs`
- Modify: `scripts/verify-planner-warmup-integration.mjs`
- Create: `scripts/verify-feed-weighted-ranking.mjs`

- [ ] **Step 1: Preserve optional quality score**

In `normalizeDiscoveredRoute`, preserve `qualityScore` when provided:

```js
qualityScore: Number.isFinite(Number(value.qualityScore)) ? Number(value.qualityScore) : null,
```

- [ ] **Step 2: Add feed sort helpers**

In `accepted-repository.mjs`, add helpers that compute a deterministic sort key:

```js
function feedQualityScore(record) { ... }
function feedMediaRank(record) { ... }
function feedSourceRank(record) { ... }
function feedSortKey(record) { ... }
function compareFeedRecords(left, right) { ... }
function isAfterFeedAnchor(record, anchor) { ... }
```

Sort order must be: `qualityScore desc`, `mediaReady/licensed-cover desc`, `sourceType desc`, `acceptedAt desc`, `id asc`.

- [ ] **Step 3: Extend cursor payload**

Encode `qualityScore`, `mediaRank`, `sourceRank`, `acceptedAt`, and `id` in `nextCursor`. Decode both the new payload and old cursors safely; old cursors continue to work through the acceptedAt/id fallback.

- [ ] **Step 4: Verify ranking**

Add `scripts/verify-feed-weighted-ranking.mjs` with fixtures proving:

```js
high-quality older route sorts before low-quality newer route;
planner-designed sorts before source-original when quality/media tie;
pagination with a new better route inserted after page 1 does not drift page 2.
```

Run:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/verify-feed-weighted-ranking.mjs
```

Expected: `Feed weighted ranking verified.`

### Task 2: Accepted Route Image License Audit

**Files:**
- Create: `scripts/audit-accepted-route-media.mjs`
- Create: `scripts/verify-accepted-route-media-audit.mjs`

- [ ] **Step 1: Add read-only audit script**

The script reads `.route-v2-cache/accepted-routes.json` by default, groups issues by `sourceType`, and reports:

```js
total, missingCover, missingCoverLicense, invalidCoverDimensions, plannerDesignedMissingLicense
```

It exits `0` for audit visibility, not as a failing gate, unless `--fail-on-issues` is passed.

- [ ] **Step 2: Add regression test**

Create a temp accepted-routes JSON with one valid planner record and one legacy record missing `author/license`. Assert grouped counts are correct and `--fail-on-issues` exits non-zero.

- [ ] **Step 3: Run production audit**

Run:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/audit-accepted-route-media.mjs
```

Expected current finding: planner-designed has no missing cover license; source-original still has missing cover-license metadata.

### Task 3: Gold Case Expansion Path

**Files:**
- Inspect: `C:/Users/admin/Desktop/1.docx`
- Inspect: `src/lib/routes/route-gold-cases.mjs`
- Optional later modify: `src/lib/routes/route-gold-cases.mjs`

- [ ] **Step 1: Extract candidates**

Use Python `python-docx` to extract headings around `Gold Case` from `1.docx` and compare against the 11 registered IDs in `route-gold-cases.mjs`.

- [ ] **Step 2: Do not bulk-add 34 complex cases without fixtures**

Stop after producing the missing-case list unless each added case has destinations, duration, style, expected output, assertions, and rejection alternatives. Adding incomplete cases would weaken the matrix.

- [ ] **Step 3: Recommend next batch**

Recommend a 5-case batch that broadens style/country coverage and can be verified with strict destination overlap.

### Task 4: Full Verification

Run:

```powershell
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/verify-feed-weighted-ranking.mjs
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/verify-accepted-route-media-audit.mjs
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/verify-planner-warmup-integration.mjs
& 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/report-planner-coverage-matrix.mjs --table
```

Expected: all verification scripts pass; coverage remains 11/11 until Gold Case expansion is explicitly implemented.
