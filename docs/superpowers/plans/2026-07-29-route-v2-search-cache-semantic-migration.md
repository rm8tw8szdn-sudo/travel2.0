# Route V2 Search Cache Semantic Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove exactly two previously confirmed semantically invalid Search Cache runtime records without changing immutable or formal route assets, then validate and publish the semantic-intent consistency fix to PR #18.

**Architecture:** Treat `.route-v2-cache/search-cache.json` as mutable runtime state, identify records by stable content-derived identity plus the canonical RouteIntent diagnostic, and create a timestamped repository-external backup before an atomic rewrite. Keep the code fix and runtime migration record in separate commits; do not commit the ignored cache file unless repository tracking proves that it is a versioned asset.

**Tech Stack:** Node.js ESM, JSON runtime state, SHA-256, atomic filesystem replacement, Git, GitHub CLI, local browser verification.

---

### Task 1: Capture the exact pre-migration baseline

**Files:**
- Read: `.route-v2-cache/search-cache.json`
- Read: `.route-v2-cache/accepted-routes.json`
- Read: `route-v2-cache-manifest-v2.json`
- Read: `data/knowledge/**`

- [ ] **Step 1: Confirm branch, HEAD, upstream synchronization, staged state, and the existing semantic-intent worktree.**
- [ ] **Step 2: Compute the Search Cache byte length, SHA-256, record count, stable record identities, and diagnostic paths without printing full queries.**
- [ ] **Step 3: Capture Accepted, Immutable Cache, Runtime State, Knowledge, complete Cache file-count, and byte-count baselines.**

### Task 2: Back up and atomically isolate the two invalid records

**Files:**
- Modify runtime state only: `.route-v2-cache/search-cache.json`
- Create outside repository: timestamped backup directory containing the original JSON and a diagnostic manifest

- [ ] **Step 1: Create a timestamped repository-external backup and mark the copied JSON read-only.**
- [ ] **Step 2: Revalidate the two stable identities with `route-intent-semantic-invalid` at `hardConstraints.season`; abort if either identity or diagnostic differs.**
- [ ] **Step 3: Build the new Search Cache by filtering only those identities, preserving all other records and order.**
- [ ] **Step 4: Write to a sibling temporary file, parse and compare the full result, then atomically replace the formal runtime file.**
- [ ] **Step 5: Confirm exactly two records were removed, every retained record is byte-equivalent after JSON parsing, and no temporary file remains.**

### Task 3: Record the authorized runtime migration

**Files:**
- Create: `ROUTE_V2_SEARCH_CACHE_SEMANTIC_MIGRATION_2026-07-29.md`

- [ ] **Step 1: Record before/after Search Cache hashes, sizes and counts, stable identities, reason code, migration date and authorization boundary.**
- [ ] **Step 2: Record that the runtime content hash is informational, while the Immutable manifest and Accepted/Knowledge baselines remain unchanged.**
- [ ] **Step 3: Confirm the report contains no raw query, absolute path, sensitive value, or complete runtime record.**

### Task 4: Run isolated and formal validation

**Files:**
- Test: `scripts/verify-route-v2-cache-baseline-v2.mjs`
- Test: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`
- Test: `scripts/verify-route-v2-semantic-intent-consistency.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`
- Test: `scripts/verify-route-v2-publication-gate.mjs`
- Test: `scripts/verify-route-v2-minimal-candidate-selection.mjs`
- Test: `scripts/verify-route-v2-evidence-3a-foundation.mjs`
- Test: `scripts/verify-route-v2-evidence-3a2-local-library.mjs`
- Test: `scripts/verify-route-v2-intent-mutations.mjs`
- Test: `scripts/verify-route-v2-intent-performance.mjs`

- [ ] **Step 1: Run Search Cache semantic integrity and safe-miss/regeneration tests only against temporary storage.**
- [ ] **Step 2: Run Cache Baseline V2 and comprehensive prelaunch against the formal read-only assets.**
- [ ] **Step 3: Run semantic, malformed, Candidate, Evidence, publication, mutation and performance verifiers.**
- [ ] **Step 4: Recompute Accepted, Cache, Immutable and Knowledge state; only the authorized Search Cache byte content may differ.**
- [ ] **Step 5: Run `node --check`, `git diff --check`, and staged whitespace checks.**

### Task 5: Perform isolated real-browser behavior verification

**Files:**
- Read only: application pages and local API
- Write only: repository-external temporary Candidate, Trace, Evidence, Ready Pool and Search Cache paths

- [ ] **Step 1: Start the server with every writable Route V2 path redirected outside the repository.**
- [ ] **Step 2: Verify 日本7天, 2月去日本7天, 冬天去日本7天, and the four-city one-day conflict.**
- [ ] **Step 3: Re-run the two removed intent shapes and verify regenerated cache records pass canonical semantic validation.**
- [ ] **Step 4: Confirm Feed and Detail remain usable, console error/warning count is zero, and all requests are local.**
- [ ] **Step 5: Stop the server and confirm the port and formal runtime files are unchanged after browser tests.**

### Task 6: Commit, push, and update PR #18

**Files:**
- Stage only the semantic-intent code, permanent verifiers, plans, and migration report
- Do not stage ignored `.route-v2-cache/search-cache.json` unless Git proves it is tracked and repository policy treats it as versioned runtime state

- [ ] **Step 1: Stage and review the semantic-intent code commit; create `fix(route-v2): enforce semantic intent consistency`.**
- [ ] **Step 2: If appropriate, stage only the migration report/tooling and create `chore(route-v2): remove invalid search cache records`; otherwise document why the runtime file is not committed.**
- [ ] **Step 3: Re-run key checks after commits and ensure no unintended files remain.**
- [ ] **Step 4: Push the current branch without force and update PR #18’s body with the three blocker fixes and authorized runtime isolation.**
- [ ] **Step 5: Confirm no merge, deployment, tag, history rewrite, or branch switch occurred.**
