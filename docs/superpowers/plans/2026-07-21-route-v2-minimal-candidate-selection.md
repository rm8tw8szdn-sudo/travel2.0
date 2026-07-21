# Route V2 Contract Phase 1 Candidate Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement only the contract-defined RouteIntent snapshot, three-candidate Candidate Pool, deterministic selection record, and DecisionTrace sidecar while leaving the legacy Planner, Search, Feed, six-card UI, images, accepted repository, and knowledge assets unchanged.

**Architecture:** Keep the existing legacy Planner as the source of the user-visible route. When the contract flags are enabled, construct a RouteIntent snapshot, generate exactly three neutral candidates in the existing sidecar, persist each candidate with the same intent snapshot, and write the selected/rejected comparison only to DecisionTrace. Candidate and trace writes are best-effort and isolated from accepted routes; all flags default to false.

**Tech Stack:** Node.js ES modules, existing Route V2 Candidate Pool and DecisionTrace JSONL stores, `node:assert/strict` verifier scripts.

---

### Task 1: Freeze the contract with a failing verifier

**Files:**
- Modify: `scripts/verify-route-v2-minimal-candidate-selection.mjs`

- [ ] **Step 1: Add the contract flag assertions**

Assert that `ROUTE_V2_INTENT_ENABLED`, `ROUTE_V2_CANDIDATE_POOL_ENABLED`, and `ROUTE_V2_TRACE_ENABLED` all default to false. Do not introduce a feature flag that is absent from `IMPLEMENTATION_CONTRACT.md`.

- [ ] **Step 2: Add three independent test intents**

Use three stable fixtures such as:

```js
const TEST_INTENTS = [
  { intentId: "intent-jp-7d", durationDays: 7, country: "JP", travelStyle: "classic-first-trip", candidateSeed: "jp-7d" },
  { intentId: "intent-jp-8d", durationDays: 8, country: "JP", travelStyle: "classic-first-trip", candidateSeed: "jp-8d" },
  { intentId: "intent-jp-9d", durationDays: 9, country: "JP", travelStyle: "classic-first-trip", candidateSeed: "jp-9d" },
];
```

For every intent, assert exactly three Candidate Pool records, one selected trace candidate, two rejected candidates, stable ordering, unique candidate IDs, and a rejection reason for each rejected candidate.

- [ ] **Step 3: Require RouteIntent in both stores**

Assert every Candidate Pool record contains `inputIntentSnapshot`, and the matching DecisionTrace contains the same snapshot under both `inputContext` and `inputIntentSnapshot` semantics.

- [ ] **Step 4: Run the verifier and observe the contract failures**

Run:

```bash
node scripts/verify-route-v2-minimal-candidate-selection.mjs
```

Expected: FAIL before implementation because the contract RouteIntent flag is missing, the pool defaults to five candidates, or Candidate Pool records omit the intent snapshot.

### Task 2: Add the contract RouteIntent flag and snapshot

**Files:**
- Modify: `src/lib/routes/decision-trace-schema.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Add the exact contract flag**

Define and export:

```js
export const ROUTE_V2_INTENT_FLAG = "ROUTE_V2_INTENT_ENABLED";

export function isRouteV2IntentEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_INTENT_FLAG, false);
}
```

- [ ] **Step 2: Reuse the existing RouteIntent snapshot schema**

Use `routeIntentSnapshot()` as the only input shape. It must retain `intentId`, strategy, target countries/cities, duration, season, theme, budget, novelty, coverage, exclusions, source, and timestamp fields already defined by the contract schema.

- [ ] **Step 3: Export the flag helpers from the Route V2 index**

Add `ROUTE_V2_INTENT_FLAG` and `isRouteV2IntentEnabled` to the existing DecisionTrace schema export block.

### Task 3: Persist RouteIntent with every neutral candidate

**Files:**
- Modify: `src/lib/routes/route-candidate-pool.mjs`

- [ ] **Step 1: Normalize the optional snapshot**

When `inputIntentSnapshot` exists, shallow-clone its object fields and arrays into the normalized Candidate Pool record. Existing legacy candidate fixtures without a snapshot must remain valid.

- [ ] **Step 2: Validate supplied snapshots**

If the field is supplied, require a non-empty `intentId` matching the candidate `intentId`. Reject mismatched snapshots without touching accepted storage.

- [ ] **Step 3: Keep candidate state neutral**

Candidate Pool records stay `generated`, `pending`, or `pending-evidence`. Selected/rejected states remain DecisionTrace-only in this phase.

### Task 4: Restrict the minimal selector to exactly three candidates

**Files:**
- Modify: `src/lib/routes/route-candidate-selection.mjs`

- [ ] **Step 1: Remove the non-contract selection flag**

Delete `ROUTE_V2_CANDIDATE_SELECTION_ENABLED`. The Planner enables this Phase 1 path only when both contract flags `ROUTE_V2_INTENT_ENABLED` and `ROUTE_V2_CANDIDATE_POOL_ENABLED` are true.

- [ ] **Step 2: Set the phase target to three**

Use one constant:

```js
export const ROUTE_CANDIDATE_SELECTION_TARGET = 3;
```

The selector consumes the first three valid candidates in stable builder order. Fewer than three returns `ready: false`; more than three is truncated to three.

- [ ] **Step 3: Build the snapshot through the schema helper**

Call `routeIntentSnapshot({ context, intentId, source: "planner-candidate-sidecar" })` rather than defining a competing RouteIntent shape.

- [ ] **Step 4: Keep selection deliberately minimal**

Select the first deterministic candidate. Mark the other two rejected with code `not-selected-by-minimal-stable-order`; record external evidence and quality ranking as unknown rather than pretending to score them.

### Task 5: Wire the Planner sidecar without changing the route

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `src/lib/routes/decision-trace-store.mjs`
- Modify: `src/lib/routes/decision-trace-schema.mjs`

- [ ] **Step 1: Gate the new path with contract flags**

The minimal path runs only when Candidate Pool storage is enabled and `isRouteV2IntentEnabled(env)` is true. Candidate Pool alone retains its existing legacy sidecar behavior.

- [ ] **Step 2: Build exactly three candidates**

Pass `targetCount: 3` to the existing deterministic candidate builder and truncate injected builders to three.

- [ ] **Step 3: Attach the same intent snapshot to all writes**

Create the selection snapshot before Candidate Pool append, then add `inputIntentSnapshot` to each neutral stored candidate.

- [ ] **Step 4: Keep persistence failures non-blocking**

Candidate write failure stops only the V2 sidecar persistence; the in-memory diagnostics and legacy Planner route continue. DecisionTrace append failure remains a returned diagnostic and cannot reject the legacy route.

- [ ] **Step 5: Keep the trace phase minimal**

For `minimal-candidate-selection`, store the input snapshot, three candidates, selected candidate, two rejected candidates, rejection reasons, and unknowns. Leave evidence, validation, Review, Ready Pool, and Feed fields empty or absent; do not call online providers.

### Task 6: Verify product protection and stop

**Files:**
- Test: `scripts/verify-route-v2-minimal-candidate-selection.mjs`
- Test: existing Planner, Search, Feed, six-card, image fallback, City UI, Candidate Pool, and DecisionTrace verifiers

- [ ] **Step 1: Run the focused verifier**

Run:

```bash
node scripts/verify-route-v2-minimal-candidate-selection.mjs
```

Expected: PASS for all three test intents, each with exactly three candidates, one selected candidate, and two explained rejections.

- [ ] **Step 2: Run adjacent data-layer regressions**

Run the existing Phase 1 Trace, Phase 2A Candidate Pool, Phase 2B candidate builder/Planner sidecar, Planner pipeline, Runtime API, Entity Layer, and City detail verifiers.

- [ ] **Step 3: Run page-protection regressions**

Run Search V1, Planner search visibility, six-card infinite feed, UI contract, online-only route normalization, and image asset/fallback verifiers that exist in the worktree. Confirm Candidate Pool and DecisionTrace imports are absent from `routes.js`, Feed bootstrap, discovery, Search service, and image modules.

- [ ] **Step 4: Compare immutable state**

Hash `.route-v2-cache`, accepted routes, `route-feed-bootstrap.js`, page files, and the pre-existing image pilot before and after verification. Expected: byte-for-byte unchanged.

- [ ] **Step 5: Check repository state and stop**

Run:

```bash
git diff --check
git diff --cached --check
git status --short --branch
```

Expected: whitespace checks pass, staged count remains zero, no knowledge assets or Feed files are added by this phase, and no commit is created. Stop after reporting Phase 1; do not start EvidenceBundle, Review, Ready Pool, Queue, Worker, or Feed work.
