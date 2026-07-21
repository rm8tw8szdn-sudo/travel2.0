# Route Generation V2 Evidence 3A-2 Local Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable offline RouteLegEvidence and SeasonEvidence records, a deduplicated MissingEvidenceManifest, cached in-memory lookup indexes, and a best-effort Planner sidecar that links those stable IDs into EvidenceBundle without changing route selection or publication.

**Architecture:** Three focused schemas and stores share one atomic JSONL persistence primitive, while one combined lazy index loads each store once and refreshes only after store revision changes. A local-evidence repository coordinates placeholder evidence units and missing-manifest aggregation; the existing EvidenceBundle lifecycle sidecar invokes it only when both Evidence 3A-1 and the independent local-index flag are enabled.

**Tech Stack:** Node.js ES modules, built-in `fs`, deterministic `stableHash`, atomic JSONL replacement, `Map`-based in-memory indexes, repository verifier scripts.

---

### Task 1: Freeze the 3A-2 contract in a failing verifier

**Files:**
- Create: `scripts/verify-route-v2-evidence-3a2-local-library.mjs`
- Reference: `scripts/verify-route-v2-evidence-3a-foundation.mjs`

- [ ] **Step 1: Write schema assertions**

Assert stable directed leg IDs, stable city-month IDs, month normalization, unknown-only placeholder values, empty sources, invalid self-legs, and invalid months.

- [ ] **Step 2: Write store and index assertions**

Assert atomic upsert, unchanged-write skipping, createdAt preservation, corrupt/schema-invalid/duplicate filtering, defensive copies, lazy single-load indexes, revision refresh, reset/reload, and empty/disabled behavior.

- [ ] **Step 3: Write manifest and Planner assertions**

Assert missing-key aggregation across bundles, ordered EvidenceBundle refs, five fixed samples, no accepted writes, no network calls, and flag-off identity.

- [ ] **Step 4: Run the verifier before implementation**

Run: `node scripts/verify-route-v2-evidence-3a2-local-library.mjs`

Expected: FAIL because the new schema/store/index exports do not exist.

### Task 2: Add shared atomic local-evidence persistence

**Files:**
- Create: `src/lib/routes/local-evidence-store-primitives.mjs`

- [ ] **Step 1: Implement defensive JSONL loading**

Parse one file snapshot, validate each record, skip corrupt/schema-invalid/duplicate IDs, and retain diagnostics without throwing into Planner.

- [ ] **Step 2: Implement stable atomic upsert and upsertMany**

Use a sibling temporary file plus rename, preserve `createdAt`, update `updatedAt` only on material changes, sort by stable ID, and increment an in-process revision only after successful replacement.

- [ ] **Step 3: Implement disabled behavior**

Return skipped/empty results without reading, writing, or creating the default directory when `ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED=false`.

### Task 3: Implement RouteLegEvidence

**Files:**
- Create: `src/lib/routes/route-leg-evidence-schema.mjs`
- Create: `src/lib/routes/route-leg-evidence-store.mjs`

- [ ] **Step 1: Define deterministic directed identity**

Generate `legEvidenceId` from normalized `fromEntityId`, `toEntityId`, and `transportMode`; reject equal endpoints and preserve reverse direction as a different ID.

- [ ] **Step 2: Define offline placeholder schema**

Require `directed=true`, `sourceRefs=[]`, null durations/transfers/confidence/retrieval/expiry, and `unknown` or `needs-evidence` feasibility when no source exists.

- [ ] **Step 3: Wrap the shared store**

Expose enabled, upsert, upsertMany, list, diagnostics, and revision methods with the default isolated path `.route-v2-local-evidence/route-leg-evidence.jsonl`.

### Task 4: Implement SeasonEvidence

**Files:**
- Create: `src/lib/routes/season-evidence-schema.mjs`
- Create: `src/lib/routes/season-evidence-store.mjs`

- [ ] **Step 1: Normalize month without inference**

Accept explicit numeric months and explicit month strings such as `2月`/`February`, normalize to `1..12`, and reject missing or invalid values.

- [ ] **Step 2: Define city-month identity and placeholder schema**

Generate `seasonEvidenceId` from `entityId + month`; leave season, risks, buffer, confidence, retrieval, expiry, and sources unknown/empty when no source exists.

- [ ] **Step 3: Wrap the shared store**

Expose the same atomic APIs with default isolated path `.route-v2-local-evidence/season-evidence.jsonl`.

### Task 5: Implement MissingEvidenceManifest

**Files:**
- Create: `src/lib/routes/missing-evidence-manifest-schema.mjs`
- Create: `src/lib/routes/missing-evidence-manifest-store.mjs`

- [ ] **Step 1: Define stable missing identity**

Generate `missingEvidenceId` from `evidenceType + targetKey`, support `route-leg` and `season`, and validate the matching leg/season reference.

- [ ] **Step 2: Implement deterministic priority and aggregation**

Merge `requestedByBundleIds`, preserve firstSeenAt, update lastSeenAt only when a new bundle is added, keep attemptCount at zero, and never mark a 3A-2 item resolved.

- [ ] **Step 3: Wrap the shared store**

Expose aggregate/upsert/list/diagnostic/revision APIs with default isolated path `.route-v2-local-evidence/missing-evidence-manifest.jsonl`.

### Task 6: Add the reusable in-memory index

**Files:**
- Create: `src/lib/routes/local-evidence-index.mjs`

- [ ] **Step 1: Build lazy maps**

Index leg IDs, normalized directed leg keys, season IDs, entity-month keys, and missing IDs after the first query.

- [ ] **Step 2: Reuse and invalidate correctly**

Reuse maps while store revisions are unchanged; rebuild the affected map after writes and expose reset/reload plus load counters for audit.

- [ ] **Step 3: Protect cached objects**

Clone every returned record and verify caller mutations cannot alter cached records.

### Task 7: Link public evidence into EvidenceBundle

**Files:**
- Create: `src/lib/routes/local-evidence-repository.mjs`
- Modify: `src/lib/routes/evidence-bundle-schema.mjs`
- Modify: `src/lib/routes/evidence-bundle-lifecycle-sidecar.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Extend EvidenceBundle references**

Normalize and validate `legEvidenceRefs`, `seasonEvidenceRefs`, and `missingEvidenceRefs`; require non-empty leg refs to match adjacent route-leg order and keep embedded legacy fields for compatibility.

- [ ] **Step 2: Build the local repository coordinator**

For each adjacent route destination, create/reuse an unknown RouteLegEvidence record, create/reuse explicit-month SeasonEvidence records, aggregate missing items, and return ordered stable references without network access.

- [ ] **Step 3: Add the independent feature flag**

Implement `ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED` with default false and ensure disabled calls do not initialize stores, load indexes, or create directories.

- [ ] **Step 4: Invoke after durable EvidenceBundle creation**

Call the coordinator only after Candidate, RouteRecord, DecisionTrace, and EvidenceBundle persistence succeed; upsert the referenced bundle, preserve pending/needs-review, and treat all local failures as non-blocking diagnostics.

- [ ] **Step 5: Construct repository once per Planner**

Create one reusable local repository in `createRouteCompositionPlanner`, inject it into the sidecar, and do not alter Candidate selection, RouteRecord destination order, Search, Feed, images, or accepted persistence.

### Task 8: Verify performance, faults, regressions, and immutable assets

**Files:**
- Test: `scripts/verify-route-v2-evidence-3a2-local-library.mjs`

- [ ] **Step 1: Run fixed samples and fault matrix**

Run the five Japan samples plus self-leg, duplicate destination, reverse leg, unknown mode, invalid month, order mismatch, read/write/index failure, duplicate/corrupt/schema-invalid, repeated upsert, flag-off, empty stores, aggregation, and mutation isolation cases.

- [ ] **Step 2: Run local performance audit**

Load at least 1,000 synthetic temporary records in one batch; record cold load, first route aggregation, hot repeated aggregation average, record counts, and parse/load counters without fragile hard timing thresholds.

- [ ] **Step 3: Run the complete regression matrix**

Run Evidence 3A-1, legacy Phase 3A/3B1/3B2/3C1/3C2, Candidate/Trace stabilization, Search gate, Planner, Entity Layer integration, Feed exhaustion, six-card infinite scroll, image pilot, City UI, Runtime API, Entity Layer Batch02, Planner Search UI, `git diff --check`, and `git diff --cached --check`.

- [ ] **Step 4: Recheck immutable fingerprints and stop**

Require exact Accepted, Cache, and Knowledge fingerprint equality; confirm `.route-v2-local-evidence` was not created, staged remains zero, and report the final unstaged files without committing.
