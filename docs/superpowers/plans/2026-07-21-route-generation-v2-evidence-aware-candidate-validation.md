# Route Generation V2 Evidence-aware Candidate Validation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate each Route V2 candidate against the existing local route-leg and season evidence index, select a stable usable candidate, and preserve all current publication and legacy fallbacks.

**Architecture:** Add one unified deterministic validator that reads only the existing hot local-evidence index. Adapt the existing candidate selector to prefer `ready`, preserve `needs-evidence` as a non-publishable preview when necessary, and embed validation snapshots in the existing DecisionTrace instead of creating a separate Validation/Review subsystem.

**Tech Stack:** Node.js ES modules, JSONL local evidence stores, deterministic SHA-256 identifiers, existing Route V2 Planner/Candidate/DecisionTrace modules, standalone Node verifier scripts.

---

### Task 1: Add hot-index validation queries and diagnostics

**Files:**
- Modify: `src/lib/routes/local-evidence-store-primitives.mjs`
- Modify: `src/lib/routes/local-evidence-index.mjs`

- [ ] **Step 1: Add a snapshot read API to the existing atomic JSONL store**

Expose the existing validated snapshot as a defensive copy so the index can load records and diagnostics in one parse:

```js
function snapshot() {
  if (!isEnabled()) return { records: [], entries: [], diagnostics: [] };
  return clone(readSnapshot());
}
```

- [ ] **Step 2: Index directed endpoint pairs and scoped invalid records**

Build `routeLegByEndpoints`, route-leg diagnostics, and season diagnostics during `reload()`. Add read-only methods:

```js
getRouteLegsByEndpoints({ fromEntityId, toEntityId })
getRouteLegDiagnostics({ fromEntityId, toEntityId })
getSeasonDiagnostics({ entityId, month })
```

- [ ] **Step 3: Verify the hot index does not rescan JSONL on repeated lookup**

The verifier must assert that repeated endpoint/month queries keep store parse counts unchanged after the first index load.

### Task 2: Implement the unified evidence-aware validator

**Files:**
- Create: `src/lib/routes/route-candidate-evidence-validation.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Define the feature flag and deterministic result contract**

Use:

```js
export const ROUTE_V2_EVIDENCE_VALIDATION_FLAG = "ROUTE_V2_EVIDENCE_VALIDATION_ENABLED";
export const ROUTE_V2_EVIDENCE_VALIDATOR_VERSION = "route-v2-evidence-validation-mvp-v1";
```

The unified `validateRouteForUse(candidate, context, evidenceRepository)` result must contain `validationId`, `candidateId`, `status`, `reasonCodes`, `legResults`, `seasonResults`, `pacingResult`, missing/conflict/stale IDs, timestamp, and validator version.

- [ ] **Step 2: Validate every directed adjacent route leg**

For each ordered adjacent pair, query only that direction. Require schema-valid, non-expired evidence with explicit feasibility and duration before returning `ready`; classify explicit infeasibility as `rejected`, and missing/partial/stale/conflicting evidence as `needs-evidence` unless a hard conflict proves rejection.

- [ ] **Step 3: Apply deterministic pacing rules**

Reject duplicate destinations, destination counts over the duration capacity, impossible single legs, and total minimum travel beyond the duration capacity. Never estimate missing duration from geography.

- [ ] **Step 4: Apply normalized time intent**

Skip season lookup for unspecified time, query every destination/month for single month and month ranges, keep season-only as `needs-evidence`, and reject explicit hard seasonal shutdown evidence.

- [ ] **Step 5: Fail closed without throwing into legacy flow**

Repository/index errors return a diagnostic `needs-evidence` result. An injected validator exception is handled by the selection adapter so the Planner records a V2 failure and continues its legacy path.

### Task 3: Adapt stable candidate selection and Planner wiring

**Files:**
- Modify: `src/lib/routes/route-candidate-selection.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`

- [ ] **Step 1: Add evidence-aware selection behind the independent flag**

Validate exactly the same three stable candidates. Choose the first `ready` candidate in existing order. If none are ready, choose the first `needs-evidence` candidate only as an explicit non-publishable preview; never select a rejected candidate.

- [ ] **Step 2: Persist candidate lifecycle states consistently**

Persist the selected candidate as `selected`, validation-rejected candidates as `rejected`, and unselected evidence-incomplete candidates as `needs-evidence`. Preserve rejection/selection reasons and the original candidate order.

- [ ] **Step 3: Keep final RouteRecord tied to the selected candidate**

Reuse `skeletonFromSelectedCandidate`; add validation ID/status metadata only after evidence-aware selection. Keep `v2PublicationStatus=v2-not-publishable-yet` for every V2 result.

- [ ] **Step 4: Preserve flag-off behavior byte-for-byte at the selection boundary**

When the new flag is false, call the existing `selectRouteCandidates` path and do not read the local evidence repository.

### Task 4: Extend DecisionTrace with validation snapshots

**Files:**
- Modify: `src/lib/routes/decision-trace-schema.mjs`

- [ ] **Step 1: Persist all three validation results and selection mode**

Copy `candidateSelection.validationResults`, `selectionMode`, and selected validation metadata into successful traces.

- [ ] **Step 2: Validate trace consistency**

Require one validation per candidate, matching IDs, legal statuses, and selected validation consistency. Permit non-selected `needs-evidence` candidates only for evidence-aware traces while retaining legacy trace validation unchanged.

### Task 5: Add the complete MVP verifier

**Files:**
- Create: `scripts/verify-route-v2-candidate-evidence-validation.mjs`

- [ ] **Step 1: Build temp-only local evidence fixtures**

Use official-source-shaped records in a temporary directory; never touch `.route-v2-local-evidence` or canary storage.

- [ ] **Step 2: Cover the ten fixed acceptance scenarios**

Assert ready preference, missing/infeasible/ready classification, direction isolation, pacing rejection, season skipped, missing February evidence, hard February shutdown, season-only behavior, all-needs-evidence preview, and exact flag-off compatibility.

- [ ] **Step 3: Cover fault safety and immutability**

Test missing/empty stores, corrupt JSON, schema-invalid records, index load failure, missing evidence references, bundle order mismatch, null duration, conflicts, stale evidence, missing season data, and validator exceptions. Assert no candidate mutation and no accepted-repository writes.

- [ ] **Step 4: Record cold and warm performance**

Assert one candidate under 50 ms and three candidates under 150 ms in the normal fixture, while also reporting cold index load and warm lookup durations.

### Task 6: Run regression, scope review, and create the one requested commit

**Files:**
- Verify all files listed above

- [ ] **Step 1: Run the directed regression matrix**

Run the new verifier plus Evidence 3B Live Canary, offline collector, 3A-2, 3A-1, Time Intent, Candidate stabilization, Search acceptance gate, Planner pipeline, existing 3B1/3B2/3C scripts, and both whitespace checks.

- [ ] **Step 2: Recompute immutable asset fingerprints**

Require exact Accepted, Cache, and Knowledge equality; confirm no Search/Planner/Feed network request and no canary directory access.

- [ ] **Step 3: Stage only the MVP implementation**

Review `git diff --cached` for evidence data, keys, DeepSeek, CI, UI, Feed, image, accepted data, auto-publication, local paths, and temporary files.

- [ ] **Step 4: Create the only commit**

```bash
git commit -m "feat(route-v2): validate candidates with local evidence"
```

Do not push, open a PR, tag, amend, rebase, squash, or switch branches.
