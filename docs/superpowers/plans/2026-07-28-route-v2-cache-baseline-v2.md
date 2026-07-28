# Route V2 Cache Baseline V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreproducible whole-Cache historical hash with a deterministic immutable manifest and a separate structural audit for mutable runtime state, without modifying formal Cache contents.

**Architecture:** A focused library owns classification, cross-platform manifest hashing, and runtime-state schema validation. A CLI emits or verifies `cache-manifest-v2`; a verifier performs repeatability and destructive-copy tests; comprehensive prelaunch invokes the same library before and after isolated tests and compares immutable assets against a tracked baseline while asserting runtime state remains byte-identical.

**Tech Stack:** Node.js ESM, SHA-256, JSON/JSONL validation, Git-tracked JSON baseline, existing comprehensive prelaunch verifier, OS temporary directories.

---

### Task 1: Prove the Cache classification from code

**Files:**
- Read: `src/lib/routes/*.mjs`
- Read: `scripts/*.mjs`
- Read: `.route-v2-cache/**`
- Create: `ROUTE_V2_CACHE_BASELINE_V2.md`

- [ ] **Step 1: Inventory every Cache file and group it by producer/consumer**

Run:

```powershell
Get-ChildItem .route-v2-cache -Recurse -File
rg -n "\\.route-v2-cache|SEARCH_CACHE_PATH|SEARCH_ANALYTICS_PATH|ROUTE_IMAGE_CACHE_PATH|ROUTE_PROVIDER_SYNC_STATE_PATH" src scripts server.js
```

Expected: every file family has a documented producer, consumer, lifecycle, and immutable/runtime classification.

- [ ] **Step 2: Define the complete two-layer rules**

Document exact immutable include rules and runtime-state rules. Accepted remains an independent formal asset. Backups, logs, generated media caches, analytics, Candidate files, sync checkpoints, and user/request-derived files are runtime state rather than release-fixed immutable Cache.

### Task 2: Implement the manifest and runtime audit library

**Files:**
- Create: `src/lib/routes/route-v2-cache-baseline.mjs`
- Modify: `scripts/audit-route-v2-asset-manifest-forensics.mjs`

- [ ] **Step 1: Write deterministic manifest primitives**

Implement root-relative forward-slash paths, ordinal sorting, exact byte hashes, and the aggregate input:

```text
relativePath + NUL + byteLength + NUL + fileSha256 + LF
```

Do not include absolute paths or mtime and do not normalize JSON bytes.

- [ ] **Step 2: Implement runtime-state validators**

Validate each runtime file family by JSON/JSONL structure, size ceiling, truncation protection, forbidden temporary/profile/secret content, and per-file diagnostics. The five explicitly designated runtime files receive dedicated validators.

- [ ] **Step 3: Implement immutable integrity checks**

Read every included file, reject empty or malformed structured assets, reject temporary/localhost/profile/seed contamination, detect path conflicts, and verify the baseline file list, byte sizes, per-file hashes, and aggregate hash.

### Task 3: Add the CLI and tracked V2 baseline

**Files:**
- Create: `scripts/audit-route-v2-cache-baseline-v2.mjs`
- Create: `route-v2-cache-manifest-v2.json`

- [ ] **Step 1: Add generate and verify modes**

Run:

```powershell
node scripts/audit-route-v2-cache-baseline-v2.mjs --root .route-v2-cache
node scripts/audit-route-v2-cache-baseline-v2.mjs --root .route-v2-cache --baseline route-v2-cache-manifest-v2.json --verify
```

Expected: deterministic JSON output with immutable manifest, runtime audit, classification rules, and no absolute root path.

- [ ] **Step 2: Generate the baseline only after the current immutable set passes**

The tracked baseline must contain `schemaVersion`, `generatedBy`, algorithm text, include/exclude rules, immutable entries/count/bytes/hash, and runtime file names/count/bytes/structure types. It must not claim fixed runtime hashes.

### Task 4: Add repeatability and destructive-copy verification

**Files:**
- Create: `scripts/verify-route-v2-cache-baseline-v2.mjs`

- [ ] **Step 1: Verify three identical real-root runs**

Create three in-memory reports and assert byte-identical normalized output.

- [ ] **Step 2: Verify copied-root and mtime independence**

Copy Cache to an OS temporary directory, touch mtimes, change traversal order through a test option, and assert the immutable manifest remains unchanged.

- [ ] **Step 3: Verify immutable tamper detection**

Modify one immutable byte only in the temporary copy and assert the aggregate hash changes and baseline verification fails.

- [ ] **Step 4: Verify runtime isolation and failures**

Modify a runtime file and assert the immutable hash stays fixed while runtime audit changes; delete one of the five required runtime files and require a missing diagnostic; corrupt JSON and JSONL copies and require audit failure.

- [ ] **Step 5: Verify no formal writes**

Snapshot formal Cache before and after all tests and require identical path, bytes, and SHA-256 arrays.

### Task 5: Connect comprehensive prelaunch

**Files:**
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`

- [ ] **Step 1: Load and verify Cache Baseline V2 before tests**

Require the immutable set to match `route-v2-cache-manifest-v2.json` and the runtime audit to pass. Keep Accepted direct SHA-256 and Knowledge deterministic snapshots.

- [ ] **Step 2: Re-run the same checks after isolated tests**

Require identical runtime path/byte/hash snapshots before and after. Do not use the historical whole-Cache hash as a pass/fail input.

### Task 6: Document and verify

**Files:**
- Create: `ROUTE_V2_CACHE_BASELINE_V2.md`
- Modify: `docs/superpowers/plans/2026-07-28-route-v2-cache-baseline-v2.md`

- [ ] **Step 1: Document the historical decision and migration**

Explain why `056d3af...` is historical only, the five required runtime files, all additional runtime families, the algorithm, counts, bytes, hash, rerun command, and future classification procedure.

- [ ] **Step 2: Run the Cache verifier**

Run:

```powershell
node scripts/verify-route-v2-cache-baseline-v2.mjs
```

Expected: PASS for repeatability, copied-root, mtime, traversal, immutable tamper, runtime mutation, missing runtime, corrupt JSON/JSONL, and formal non-pollution.

- [ ] **Step 3: Run comprehensive and performance verification**

Run:

```powershell
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
node scripts/verify-route-v2-intent-performance.mjs
git diff --check
git diff --cached --check
```

Expected: all PASS, formal Accepted/Cache/Knowledge unchanged, and staged remains empty.

- [ ] **Step 4: Stop without committing**

Do not stage, commit, push, open a PR, tag, deploy, switch branches, or rewrite history.
