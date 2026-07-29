# Route V2 Japan Evidence Validation Pilot Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collect and validate a small, reproducible set of real Japanese route-leg and February season evidence from official sources, persist it only in an ignored pilot repository, and prove candidate validation consumes it without publishing V2 routes.

**Architecture:** Reuse the existing MissingEvidenceManifest, offline collector, live official-page fetcher, local evidence stores/index, and candidate evidence validator. Add a deterministic Japan pilot seed and a thin CLI orchestrator that creates the 21 directed/season tasks, maps each task to controlled official URLs, and then delegates all fetching, extraction, atomic persistence, status transitions, and indexing to the existing pipeline. Extend source metadata only enough to retain a bounded auditable fact locator/excerpt.

**Tech Stack:** Node.js ESM, built-in `fetch`, JSONL atomic stores, existing Route V2 repository/verifier modules.

---

### Task 1: Preserve auditable source facts

**Files:**
- Modify: `src/lib/routes/local-evidence-source-schema.mjs`
- Modify: `src/lib/routes/offline-evidence-fact-adapter.mjs`
- Modify: `src/lib/routes/live-evidence-canary-provider.mjs`
- Test: `scripts/verify-route-v2-japan-evidence-validation-pilot.mjs`

**Steps:**
1. Add optional bounded `factLocator` and `factExcerpt` fields without changing source IDs.
2. Preserve only the relevant excerpt returned by the official-page fetcher; never persist full page bodies.
3. Expand directed-page matching only for explicit grammatical direction patterns.
4. Verify untrusted, irrelevant, reverse-only, and overlong content remains rejected or truncated.

### Task 2: Seed the isolated Japan pilot

**Files:**
- Create: `src/lib/routes/japan-evidence-validation-pilot.mjs`
- Modify: `src/lib/routes/index.mjs`
- Create: `scripts/collect-route-v2-japan-evidence-pilot.mjs`
- Modify: `.gitignore`

**Steps:**
1. Define 14 directed route-leg targets and seven city-February targets using the runtime's stable entity IDs (canonical QIDs where available, otherwise `anchor:JP:*` IDs).
2. Associate only verified official HTTPS source URLs with each target; unsupported directions remain pending.
3. Seed missing route-leg/season records and manifest tasks idempotently in `.route-v2-local-evidence-japan-pilot`.
4. Add dry-run, bounded limit, resume, and explicit storage-root behavior while reusing `collectOfflineEvidenceBatch`.
5. Keep all runtime flags default false and ignore the generated pilot repository.

### Task 3: Verify collection, idempotency, faults, and validation

**Files:**
- Create: `scripts/verify-route-v2-japan-evidence-validation-pilot.mjs`

**Steps:**
1. Use deterministic temporary official responses to verify 21-target seeding, direction isolation, extraction, atomic writes, index refresh, and retry state transitions.
2. Combine the pilot verifier with the existing Live Canary, Offline Collector, and local-library regressions to cover 404, timeout, irrelevant/partial source, duplicate source, reverse mismatch, schema-invalid data, write failure, and index refresh failure.
3. Prove ready, needs-evidence, and rejected candidate outcomes and evidence-aware selection order.
4. Prove accepted repository writes remain zero and all feature flags are false by default.

### Task 4: Run the real Japan pilot and end-to-end acceptance

**Files:**
- Generated but ignored: `.route-v2-local-evidence-japan-pilot/`

**Steps:**
1. Capture Accepted, Cache, and Knowledge fingerprints.
2. Run dry-run with zero network/writes.
3. Run real official-source collection in bounded batches, stopping expansion if source validation failure is abnormal.
4. Re-run identical commands and verify resolved tasks/sources/content are not duplicated or rewritten.
5. Run six fixed search/Planner samples with the explicit pilot repository and evidence flags enabled; record three candidates, selected route, trace validation states, and publication gate.
6. Confirm normal Search/Planner/Feed do not invoke collection and all defaults remain off.

### Task 5: Review scope, regressions, and commit

**Files:**
- Review all changed implementation, verifier, plan, and ignore files.

**Steps:**
1. Run the directed verifier matrix requested for Evidence 3B, 3A-2, 3A-1, Time Intent, Candidate/Trace stabilization, acceptance gate, Planner pipeline, and candidate evidence validation.
2. Run `git diff --check`, stage only pilot implementation files, then run `git diff --cached --check` and inspect the full staged diff.
3. Confirm no generated pilot data, API key, page body, accepted/cache/knowledge data, Feed/UI changes, or absolute path is staged.
4. Create the single commit `feat(route-v2): add japan evidence validation pilot`.
