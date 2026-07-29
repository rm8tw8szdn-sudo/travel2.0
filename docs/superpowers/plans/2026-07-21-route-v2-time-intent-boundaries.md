# Route V2 Time Intent And Destination Suggestion Implementation Plan

> **For agentic workers:** Implement this plan task-by-task and stop after the validation stage. Do not stage or commit.

**Goal:** Parse time and duration from the existing single free-text search input and allow a destination-less but otherwise useful request to enter a deterministic destination-suggestion Planner path.

**Architecture:** Extend the existing `search-intent-parser.mjs`; do not create a second query parser. A focused destination-suggestion helper consumes normalized RouteIntent, the current strict displayable route pool, and the Entity Layer search catalog. It produces a session-stable Planner context without mutating the user's original destination intent. Candidate, RouteRecord, DecisionTrace, EvidenceBundle, and SeasonEvidence continue through the existing V2 sidecar path and remain blocked from accepted routes and Feed.

**Tech Stack:** Node.js ES modules, existing SearchIntent/Planner/Entity Layer/accepted repository APIs, deterministic hashing, JSONL sidecar stores, Node `assert` verifier.

---

### Task 1: Freeze parser and product boundaries

**Files:**
- Modify: `scripts/verify-route-v2-time-intent-boundaries.mjs`
- Reference: `scripts/verify-search-v1.mjs`

- [ ] Add exact parser assertions for `日本7天`, `2月去日本7天`, `February Japan 7 days`, `Feb Japan 7 days`, `3月至4月去日本`, `冬天去日本`, `2月`, `2`, `2月 2天`, `冬天`, `7天`, `13月`, `0月`, `日本2天`, empty input, and unrecognized input.
- [ ] Assert `2月`, `2`, `2月 2天`, `冬天`, and `7天` use `intentMode=destination-suggestion` and are Planner-eligible.
- [ ] Assert bare `2` means two days and never February; explicit invalid month syntax never falls back to duration.
- [ ] Assert only empty or wholly unrecognized input uses `insufficient-intent`.
- [ ] Assert Feature Flag off preserves the exact legacy parser and Search behavior.

### Task 2: Normalize RouteIntent in the existing parser

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] Keep `ROUTE_V2_TIME_INTENT_ENABLED` default false.
- [ ] Add normalized `intentMode`: `specified-destination`, `destination-suggestion`, `invalid-time-intent`, or `insufficient-intent` only when the flag is enabled.
- [ ] Parse Chinese and English months, inclusive month ranges, vague seasons, explicit day units, and the product-specific bare-number-as-days rule.
- [ ] Treat `0月` and `13月` as invalid without correction or reinterpretation.
- [ ] Set Planner eligibility from any usable destination, time, season, or duration condition; never require destination alone.

### Task 3: Build a bounded destination-suggestion pool

**Files:**
- Create: `src/lib/routes/route-destination-suggestion.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] Read only strict displayable routes already exposed by the accepted repository and the existing Entity Layer intent catalog.
- [ ] Prefer mature route countries compatible with duration capacity; fall back to countries with enough known Entity Layer cities.
- [ ] Cap destination count using existing duration rules so two-day suggestions cannot become broad multi-city routes.
- [ ] Let explicit month data rank candidates only when existing structured metadata supports it; otherwise retain candidates with `needs-evidence` diagnostics rather than claiming suitability.
- [ ] Preserve `season-only` without inventing months.
- [ ] Deterministically rank with a seed derived from session ID plus normalized intent. The same session and intent must repeat; different sessions should normally differ.
- [ ] Return a defensive, duplicate-free suggestion object with source, country, city anchors, capacity, seed, and diagnostics.

### Task 4: Route destination suggestions through Search and Planner

**Files:**
- Modify: `src/lib/routes/route-search-service.mjs`
- Modify: `src/lib/routes/decision-trace-schema.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`

- [ ] Invoke Planner for valid destination-suggestion requests even when legacy search already has enough ranked records.
- [ ] Pass the suggestion as Planner context while preserving the original RouteIntent destination as unspecified.
- [ ] Use a session-specific V2 intent/candidate seed so repeated sessions cannot overwrite one another's sidecar attempt while retries inside one session remain idempotent.
- [ ] Snapshot `intentMode`, normalized time, and suggestion diagnostics in DecisionTrace.
- [ ] Keep V2 `v2-not-publishable-yet`; do not change Search auto-accept, accepted repository contents, Feed, or image behavior.
- [ ] If no eligible suggestion exists, return a clear non-success diagnostic without guessing blindly.

### Task 5: Let Evidence consume only normalized time

**Files:**
- Modify: `src/lib/routes/local-evidence-repository.mjs`
- Modify: `src/lib/routes/evidence-bundle-schema.mjs`

- [ ] Create SeasonEvidence references only for explicit normalized months.
- [ ] For month ranges, create every destination-by-month reference and deduplicated missing item.
- [ ] For unspecified time or a duration-only request, create no SeasonEvidence.
- [ ] For `season-only`, retain a season unknown/needs-review without fabricating a month.
- [ ] For invalid time, create no Candidate, RouteRecord, DecisionTrace, EvidenceBundle, or SeasonEvidence.
- [ ] Keep empty sources and null travel times; never write a claim that a destination is suitable for a month.

### Task 6: Verify real output and failure isolation

**Files:**
- Modify: `scripts/verify-route-v2-time-intent-boundaries.mjs`

- [ ] Run real V2 sidecar harnesses for `2月`, `2`, `2月 2天`, `冬天`, and `7天`; record all Candidate destinations and the final RouteRecord.
- [ ] Assert `2月` creates one month-2 reference or missing item per final destination and Evidence remains pending review.
- [ ] Assert `2` creates a two-day route within the existing destination-capacity limit and creates no SeasonEvidence.
- [ ] Assert `2月 2天` carries both constraints and obeys the same short-trip capacity.
- [ ] Assert same-session suggestions are identical and different-session suggestions normally differ.
- [ ] Assert invalid, empty, and unrecognized queries never call Planner or create sidecar records.
- [ ] Replace global fetch with a throwing stub and require external request count zero.

### Task 7: Run targeted regressions and immutable-asset checks

**Files:**
- Test: `scripts/verify-route-v2-time-intent-boundaries.mjs`

- [ ] Run Evidence 3A-2, Evidence 3A-1, Candidate/DecisionTrace stabilization, Planner pipeline, Search acceptance gate, and the Time Intent verifier.
- [ ] Run `git diff --check` and `git diff --cached --check`.
- [ ] Compare Accepted SHA-256, Cache content tree, and Knowledge content tree against the pre-change baselines.
- [ ] Confirm `.route-v2-local-evidence` remains absent from the real workspace and staged count remains zero.
- [ ] Stop and report; do not stage, commit, push, create a PR/tag, or begin Validation/Review/Ready Pool.
