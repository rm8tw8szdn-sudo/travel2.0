# Route V2 Candidate Selection Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the persisted selected RouteCandidate the sole skeleton source for a successful Route Generation V2 RouteRecord, while recording failures safely and preventing V2 promotion into the accepted repository.

**Architecture:** Keep the legacy Planner path as the fallback. The V2 sidecar first atomically persists exactly three pending candidates, selects one, atomically persists final selected/rejected states, and then builds the V2 RouteRecord from that selected order. Candidate and DecisionTrace stores use validated idempotent upserts; failure traces are separate from success traces; Search identifies V2 records through an explicit generation marker and blocks their auto-accept until Review and Validation exist.

**Tech Stack:** Node.js ESM, synchronous filesystem JSONL sidecars with atomic replacement, existing Planner/Search repositories, deterministic verifiers.

---

### Task 1: Define failing stabilization coverage

**Files:**
- Modify: `scripts/verify-route-v2-minimal-candidate-selection.mjs`
- Modify: `scripts/verify-route-v2-phase1-trace.mjs`
- Modify: `scripts/verify-route-v2-phase2a-candidate-pool.mjs`
- Create: `scripts/verify-route-v2-search-acceptance-gate.mjs`

- [ ] Add five fixed intents: classic Japan 7 days, rail Japan 9 days, cultural Japan 6 days, impossible 1-day/8-destination request, and February snow-rail constraints.
- [ ] Assert every successful V2 record has the same candidate ID, countries, destination IDs, and order as the selected Candidate and success DecisionTrace.
- [ ] Assert empty pools, persistence failure, selected-candidate materialization failure, validator rejection, and schema failure create failure traces without a success selection.
- [ ] Assert rerunning the same intent in one store leaves exactly three physical Candidate records and one matching Trace record.
- [ ] Assert parseable schema-invalid and corrupt JSONL lines are excluded with diagnostics.
- [ ] Assert `SEARCH_AUTO_ACCEPT_GENERATED=true` preserves legacy behavior but returns `v2-not-publishable-yet` and performs no accepted-repository write for V2 records.

### Task 2: Make Candidate lifecycle validated and idempotent

**Files:**
- Modify: `src/lib/routes/route-candidate-pool.mjs`
- Modify: `src/lib/routes/route-candidate-builder.mjs`
- Modify: `src/lib/routes/route-candidate-selection.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] Replace neutral `generated` state with the allowed lifecycle states `pending`, `selected`, `rejected`, `needs-evidence`, and `failed`.
- [ ] Make selection return one selected Candidate and two rejected Candidates in the same final-state candidatePool, with a rejection reason on every rejected item.
- [ ] Add an atomic `replaceForIntent()` operation that validates the complete batch before writing and keeps one physical record per candidateId.
- [ ] Make repeated identical writes return an idempotent persisted result; make state updates replace the existing record instead of appending duplicates.
- [ ] Validate records during read, skip corrupt/schema-invalid/duplicate entries, expose diagnostics, retain stable order, and deep-clone public results.

### Task 3: Add success/failure DecisionTrace schemas and idempotent storage

**Files:**
- Modify: `src/lib/routes/decision-trace-schema.mjs`
- Modify: `src/lib/routes/decision-trace-store.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] Add explicit `outcome`, route snapshot, failure stage/reason, and legacy-fallback fields.
- [ ] Require success traces to contain exactly one selected Candidate, matching top-level candidateId and RouteRecord destination order.
- [ ] Add a failure-trace builder with no successful selectedCandidate and a deterministic traceId for the same intent/stage/reason retry.
- [ ] Make Trace append an idempotent upsert so the same traceId occupies one physical JSONL record.
- [ ] Validate during read, skip invalid/corrupt/duplicate records with diagnostics, deep-clone results, and catch synchronous/asynchronous injected-store failures.

### Task 4: Drive RouteRecord from the persisted selected Candidate

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`

- [ ] Persist exactly three pending candidates atomically before selection; fail closed when the batch is incomplete.
- [ ] Persist the final selected/rejected batch atomically before treating V2 selection as ready.
- [ ] Resolve selectedCandidate.proposedOrder back to the original destination pool and use only that ordered skeleton for successful V2 record construction.
- [ ] Skip independent `buildRouteSkeleton()` and destination reordering for a ready V2 selection; attach generationVersion, intentId, selectedCandidateId, and publication status to the resulting RouteRecord.
- [ ] Verify the final RouteRecord destination order against the selected Candidate before writing a success Trace.
- [ ] Route every V2 early failure through a failure-Trace helper, update Candidate status to failed where persistence is available, then continue the legacy Planner fallback without claiming V2 success.

### Task 5: Add the accepted-repository hard gate

**Files:**
- Modify: `src/lib/routes/route-search-service.mjs`

- [ ] Detect V2 records only through their explicit generationVersion marker.
- [ ] Keep `SEARCH_AUTO_ACCEPT_GENERATED` behavior unchanged for legacy generated routes.
- [ ] Force every current V2 generated route to `needs-review` with `v2PublicationStatus: v2-not-publishable-yet`, regardless of `SEARCH_AUTO_ACCEPT_GENERATED`.
- [ ] Skip acceptedRepository.upsert for V2 records while still preserving Search Cache and review-candidate output.
- [ ] Ensure cached V2 records cannot replay as accepted.

### Task 6: Run protected regressions and stop

**Files:**
- Verify only; do not stage or commit.

- [ ] Run Candidate/Trace/Search focused verifiers and display all five fixed sample summaries.
- [ ] Run Planner pipeline, Planner/Search visibility, Entity Layer Planner, Runtime API, City detail UI, image pilot, six-card infinite scroll, Feed exhaustion, Phase 3C-1, and Phase 3C-2 verifiers.
- [ ] Snapshot accepted repository and `.route-v2-cache` metadata before and after; require no change.
- [ ] Run `git diff --check` and `git diff --cached --check`.
- [ ] Confirm Candidate/Trace flags default false and no Feed, image, City UI, Entity Layer, knowledge asset, queue, worker, Review, ValidationResult, Ready Pool, stage, commit, or remote operation occurred.
