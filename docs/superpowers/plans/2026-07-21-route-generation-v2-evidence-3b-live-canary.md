# Route Generation V2 Evidence 3B Live Canary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded live-canary mode that discovers evidence with the existing provider, fetches the linked official pages, extracts only source-supported snippets, and writes exclusively to an ignored canary evidence directory.

**Architecture:** Keep `collectOfflineEvidenceBatch()` as the only collector. Wrap the existing Tavily discovery provider with a live official-page fetch adapter; the wrapper accepts the existing provider result contract, validates allowlisted HTTPS URLs, fetches source pages with timeouts, extracts a small relevant snippet and content hash, and returns the same normalized result shape. Add `--canary` only as a storage isolation switch and never enable feature/provider flags implicitly.

**Tech Stack:** Node.js ESM, built-in `fetch`, AbortController, existing Evidence 3A stores/indexes, existing 3B collector/provider contracts, JSONL atomic stores, Node assertion verifiers.

---

### Task 1: Lock the canary storage and CLI contract

**Files:**
- Modify: `.gitignore`
- Modify: `src/lib/routes/offline-evidence-collector.mjs`
- Modify: `scripts/collect-route-v2-local-evidence.mjs`
- Test: `scripts/verify-route-v2-evidence-3b-live-canary.mjs`

- [ ] **Step 1: Write failing CLI boundary assertions**

Assert that `--canary` is parsed, defaults to false, chooses `.route-v2-local-evidence-canary`, and does not enable collection or provider flags.

- [ ] **Step 2: Run the verifier and confirm it fails before implementation**

Run: `node scripts/verify-route-v2-evidence-3b-live-canary.mjs`

Expected: FAIL because the live-canary verifier or CLI option does not exist.

- [ ] **Step 3: Add the isolated mode**

Add `canary: false` to the argument result, accept `--canary`, resolve only the fixed ignored canary directory, and pass task/context metadata to the provider without changing existing provider behavior.

- [ ] **Step 4: Verify dry-run isolation**

Run: `node scripts/collect-route-v2-local-evidence.mjs --limit 10 --type all --country JP --dry-run --canary`

Expected: zero network requests, zero writes, and no directory creation when no manifest exists.

### Task 2: Fetch and validate official source pages

**Files:**
- Create: `src/lib/routes/live-evidence-canary-provider.mjs`
- Modify: `src/lib/routes/local-evidence-source-schema.mjs`
- Modify: `src/lib/routes/offline-evidence-fact-adapter.mjs`
- Modify: `src/lib/routes/index.mjs`
- Test: `scripts/verify-route-v2-evidence-3b-live-canary.mjs`

- [ ] **Step 1: Add failing provider-contract cases**

Cover official 200 responses, duplicate URLs, redirects to an untrusted domain, 404, 429, 5xx, timeout, empty body, unparseable body, irrelevant body, and partial successful batches.

- [ ] **Step 2: Implement the provider wrapper**

Reuse `createRouteV2TavilyEvidenceProvider()` for URL discovery. Validate the discovered and final URLs with `classifyLocalEvidenceSource()`, fetch at most three unique official pages per task with bounded concurrency and timeout, and return only URL, title, a bounded relevant snippet, publisher metadata, HTTP status, retrieval timestamp, and a SHA-256 content hash.

- [ ] **Step 3: Keep complete page content out of records and logs**

Never return or persist the full body. Sanitize errors, cap extracted text, and ensure API key values are absent from diagnostics and verifier output.

- [ ] **Step 4: Make fact adapters consume verified page hashes**

Prefer `sourceContentHash` produced from the fetched page over hashing discovery text. Continue to reject untrusted sources and facts that do not mention the target route direction or target city/month.

### Task 3: Preserve granular failure diagnostics

**Files:**
- Modify: `src/lib/routes/missing-evidence-manifest-store.mjs`
- Modify: `src/lib/routes/offline-evidence-collector.mjs`
- Test: `scripts/verify-route-v2-evidence-3b-live-canary.mjs`

- [ ] **Step 1: Add failing diagnostic assertions**

Assert that source HTTP/timeout/empty/parse diagnostics are retained without secrets and that the aggregate task status remains pending or needs-review as required.

- [ ] **Step 2: Extend collection-state updates**

Allow a bounded array of sanitized diagnostics in one atomic manifest transition while retaining existing single-diagnostic compatibility and deduplication.

- [ ] **Step 3: Verify failure isolation**

Confirm one source or task failure does not terminate the batch, does not truncate evidence files, and does not mark the task resolved.

### Task 4: Run the live-canary verifier and conditional real execution

**Files:**
- Create: `scripts/verify-route-v2-evidence-3b-live-canary.mjs`

- [ ] **Step 1: Run deterministic contract tests in temporary directories**

Run: `node scripts/verify-route-v2-evidence-3b-live-canary.mjs`

Expected: PASS for provider, parsing, isolation, status, idempotency, and secret-redaction contracts. Output must separately state whether a real external canary was executed.

- [ ] **Step 2: Inspect real prerequisites without printing secrets**

Require a configured provider credential, explicit Evidence/provider flags, and an existing canary MissingEvidenceManifest. If any prerequisite is absent, stop the real run and report the exact missing prerequisite.

- [ ] **Step 3: Run real canary only when prerequisites exist**

Run dry-run limit 10, then live limit 5, then the identical rerun. Run live limit 10 only when the first run has no abnormal failure rate or source-validation failure.

- [ ] **Step 4: Record fingerprints and canary statistics**

Record claimed/resolved/needs-review/retryable/permanent counts, source domains, total real network requests, duration, evidence file hashes, and Git-ignore status without committing canary data.

### Task 5: Targeted regression and commit

**Files:**
- Test: all files above

- [ ] **Step 1: Run the targeted matrix**

Run the Live Canary verifier, Evidence 3B collector, Evidence 3A-2, Evidence 3A-1, Time Intent, Candidate stabilization, Search acceptance gate, Planner pipeline, `git diff --check`, and `git diff --cached --check`.

- [ ] **Step 2: Confirm protected assets are unchanged**

Verify accepted, cache, and knowledge fingerprints; ensure Search, Planner, Feed, Candidate selection, Review, Ready Pool, DeepSeek, UI, and tracked data files are untouched.

- [ ] **Step 3: Stage only canary implementation files**

Inspect the complete staged diff for API keys, full page bodies, local absolute paths, canary data, debug logging, and default-enabled flags.

- [ ] **Step 4: Create the single requested commit**

Run: `git commit -m "feat(route-v2): validate live evidence collection canary"`

Expected: one commit with the canary adapter and verification support only.
