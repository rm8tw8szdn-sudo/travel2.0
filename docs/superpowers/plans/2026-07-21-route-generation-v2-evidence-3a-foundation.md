# Route Generation V2 Evidence 3A Foundation Implementation Plan

> **For Codex:** Execute this plan one bounded step at a time. Stop after Evidence 3A verification; do not start online evidence, validation, review, ready-pool, or Feed work.

**Goal:** Add an offline, pending-only EvidenceBundle lifecycle for a successfully selected Route V2 candidate without changing candidate selection, the final route, Search ranking, accepted routes, Feed, images, or legacy Planner behavior.

**Architecture:** Preserve the existing Phase 3A/3B/3C source-item EvidenceBundle APIs for compatibility. Add a separate lifecycle schema and atomic idempotent store API, then invoke it as a best-effort Planner sidecar only after Candidate persistence, selected-candidate materialization, RouteRecord validation, and durable DecisionTrace persistence have all succeeded and agree on IDs and destination order.

**Tech Stack:** Node.js ES modules, built-in `fs`, deterministic `stableHash`, JSONL atomic replacement, repository verifier scripts.

---

### Task 1: Freeze the offline lifecycle contract in a verifier

**Files:**
- Create: `scripts/verify-route-v2-evidence-3a-foundation.mjs`
- Reference: `IMPLEMENTATION_CONTRACT.md`
- Reference: `scripts/verify-route-v2-candidate-selection-stabilization.mjs`

**Step 1:** Add fixed-schema assertions for required IDs, lifecycle status, legs, empty sources, unknown durations, and stable IDs.

**Step 2:** Add store assertions for disabled behavior, atomic upsert, retries, duplicate/corrupt/schema-invalid reads, defensive copies, and write failures.

**Step 3:** Add Planner assertions for the five fixed Japan samples and all required failure injections.

**Step 4:** Run the verifier and confirm it fails before implementation for the intended missing APIs only.

### Task 2: Implement EvidenceBundle lifecycle schema and builder

**Files:**
- Create: `src/lib/routes/evidence-bundle-schema.mjs`
- Modify: `src/lib/routes/index.mjs`

**Step 1:** Define the lifecycle schema version and statuses: `pending`, `collecting`, `complete`, `needs-review`, and `failed`.

**Step 2:** Build stable `evidenceBundleId` values from intent, selected candidate, DecisionTrace, and RouteRecord identity.

**Step 3:** Build one unknown/needs-evidence leg for every adjacent destination pair without inventing duration or sources.

**Step 4:** Validate required fields, ID consistency, status constraints, empty/offline sources, and candidate/route/leg ordering.

**Step 5:** Represent seasonal hard constraints as explicit missing season evidence and `needs-review`; represent identity/order mismatches as `failed` with a precise failure reason.

### Task 3: Add atomic idempotent lifecycle storage

**Files:**
- Modify: `src/lib/routes/evidence-bundle-store.mjs`

**Step 1:** Keep the legacy `append`/`listByCandidate` surface intact for Phase 3B/3C compatibility.

**Step 2:** Add lifecycle `upsert`, `get`, `list`, and diagnostic APIs guarded by `ROUTE_V2_EVIDENCE_BUNDLE_ENABLED`.

**Step 3:** Parse JSONL defensively, skip corrupt/schema-invalid records, and de-duplicate by stable EvidenceBundle ID.

**Step 4:** Replace the complete validated snapshot through a temporary file and atomic rename; remove the temporary file on all outcomes.

**Step 5:** Return defensive copies and preserve the original `createdAt` while updating `updatedAt` only for material changes.

### Task 4: Add the Planner sidecar after durable trace persistence

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`

**Step 1:** Add a best-effort helper that checks the Evidence flag without enabling any other flag.

**Step 2:** Require persisted selected Candidate state, selected-candidate/RouteRecord equality, and durable DecisionTrace identity before building the bundle.

**Step 3:** Persist a `pending` or seasonal `needs-review` bundle via lifecycle upsert; on success add `evidenceBundleId` and `evidenceStatus` to the in-memory RouteRecord.

**Step 4:** On store, validation, ID, or order failure, return diagnostics only; do not change selection, RouteRecord skeleton, Search, Feed, accepted storage, or legacy fallback availability.

### Task 5: Verify scope, faults, regression, and immutable assets

**Files:**
- Verify only; no production data edits.

**Step 1:** Run the Evidence 3A foundation verifier and the existing Phase 3A/3B/3C Evidence verifiers.

**Step 2:** Run Candidate/DecisionTrace stabilization, Planner/Search, acceptance gate, Feed exhaustion, six-card infinite scroll, image pilot, City UI, Runtime API, Entity Layer, and Phase 3C-1/3C-2 verifiers.

**Step 3:** Run `git diff --check` and `git diff --cached --check`.

**Step 4:** Recompute Accepted, Cache, and Knowledge fingerprints and require exact equality with the pre-change snapshot.

**Step 5:** Confirm no staged files, no runtime Candidate/Trace/Evidence file in `.route-v2-cache`, and report all unstaged implementation files.
