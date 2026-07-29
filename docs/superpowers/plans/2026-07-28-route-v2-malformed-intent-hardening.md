# Route V2 Malformed Intent Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject malformed-but-parseable normalized RouteIntent data at every persistence and replay boundary without throwing, while preserving genuine legacy records and keeping PR #18 behavior and performance stable.

**Architecture:** Add one strict, non-throwing schema validator beside the canonical RouteIntent normalizer. Make the shared envelope reader expose the difference between a genuinely unbound legacy record and a claimed-but-invalid envelope, then reuse that result in invariant checks, cache replay, candidate/ready/accepted stores, trace/evidence validation, and Cache Baseline V2 auditing. Permanent mutation tests exercise the same validator and prove isolated invalid records cannot crash or contaminate valid results.

**Tech Stack:** Node.js ESM, SHA-256 fingerprints, JSON/JSONL file stores with atomic writes, existing Route V2 verifier scripts, local HTTP/browser validation, Git/GitHub CLI.

---

### Task 1: Lock the clean baseline and write the failing regression

**Files:**
- Create: `scripts/verify-route-v2-malformed-route-intent.mjs`
- Test: `scripts/verify-route-v2-intent-performance.mjs`

- [ ] Confirm the local branch and remote branch both point to `6c3c927adbfff46e04fc1def886411fe64283cfd`, with no staged, unstaged, or untracked files before this plan is created.
- [ ] Record same-host p95 values for parsing, normalization, fingerprinting, the invariant gate, cache replay, and Ready Pool reads.
- [ ] Capture Accepted, Cache, and Knowledge fingerprints before any implementation change.
- [ ] Reproduce `normalizedRouteIntent.hardConstraints.months.values = null` and assert the current cache replay path throws `TypeError`.
- [ ] Add table-driven malformed cases for null/object/string arrays, invalid months, unknown or missing states, invalid days, corrupt city/country/region constraints, missing soft preferences, unknown fields, excessive nesting, partial envelopes, invalid fingerprint fields, and valid adjacent records.

### Task 2: Implement one strict, non-throwing normalized RouteIntent validator

**Files:**
- Modify: `src/lib/routes/route-intent-model.mjs`
- Modify: `src/lib/routes/index.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`

- [ ] Export `validateNormalizedRouteIntent(input)` returning `{ valid, reasonCode, violations }` for every JavaScript value without throwing.
- [ ] Validate the exact schema version, allowed top-level keys, required objects, hard-constraint presence objects, state/value semantics, month range, positive integer days/capacity, stable destination/country/region identifiers, soft-preference shapes, display metadata, and evidence status.
- [ ] Keep diagnostics value-safe: include path, expected shape, actual type, and reason code, but never query text, local paths, or stack traces.
- [ ] Refuse to treat a claimed normalized object as authoritative unless the strict validator passes.
- [ ] Export the validator through the existing Route V2 index.

### Task 3: Make envelope and invariant validation safe and unambiguous

**Files:**
- Modify: `src/lib/routes/route-intent-model.mjs`
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `src/lib/routes/route-intent-model-oracle.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`
- Test: `scripts/verify-route-v2-route-intent-model.mjs`
- Test: `scripts/verify-route-v2-route-intent-oracle.mjs`

- [ ] Detect envelope markers independently from validity.
- [ ] Make `readRouteIntentEnvelope()` distinguish `legacy-unbound`, `schema-invalid`, and valid envelopes without throwing.
- [ ] Run fingerprint checks only after schema validation succeeds.
- [ ] Make `validateEmbeddedRouteIntent()` return a structured schema failure for partial or malformed claimed envelopes; only records with no envelope markers may remain `legacy-unbound`.
- [ ] Make final invariant validation and result finalization fail closed on malformed intent input without throwing.
- [ ] Preserve the oracle as a separately implemented semantic checker while teaching it to consume the safe envelope result.

### Task 4: Enforce the validator at persistence and replay boundaries

**Files:**
- Modify: `src/lib/routes/route-search-cache.mjs`
- Modify: `src/lib/routes/route-candidate-pool.mjs`
- Modify: `src/lib/routes/route-v2-ready-pool.mjs`
- Modify: `src/lib/routes/accepted-repository.mjs`
- Modify: `src/lib/routes/decision-trace-schema.mjs`
- Modify: `src/lib/routes/evidence-bundle-schema.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`

- [ ] Treat one malformed Search Cache record as a cache miss, expose a sanitized diagnostic, and continue normal Planner/V2/legacy generation without mutating the cache.
- [ ] Reject malformed Candidate writes and skip malformed Candidate reads while retaining valid neighboring records.
- [ ] Reject malformed Ready Pool writes and skip malformed Ready Pool reads.
- [ ] Skip malformed claimed envelopes in Accepted/mature reads so they cannot enter fallback, Feed, or Detail.
- [ ] Validate any embedded normalized intent in DecisionTrace and EvidenceBundle records before accepting them.
- [ ] Prove genuine legacy records without any envelope markers remain compatible.

### Task 5: Deepen Cache Baseline V2 runtime-state auditing

**Files:**
- Modify: `scripts/audit-route-v2-cache-baseline-v2.mjs`
- Modify: `scripts/verify-route-v2-cache-baseline-v2.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`

- [ ] Apply the shared strict validator to every embedded RouteIntent found in search cache, candidate/ready pools, search-review candidates, and trace/evidence sidecars.
- [ ] Report file, record index, reason code, and field path without logging raw queries or sensitive values.
- [ ] Continue auditing neighboring records after one invalid record and return a deterministic failure instead of an uncaught exception.
- [ ] Run corruption, missing-field, JSON, and JSONL tests only in repository-external temporary copies.
- [ ] Prove formal Cache, Accepted, and Knowledge files are byte-for-byte unchanged.

### Task 6: Strengthen generative, mutation, and performance verification

**Files:**
- Modify: `scripts/verify-route-v2-intent-generative.mjs`
- Modify: `scripts/verify-route-v2-intent-mutations.mjs`
- Modify: `scripts/verify-route-v2-intent-performance.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`

- [ ] Add malformed-but-parseable mutations: null arrays, object-for-array, string numbers, deleted nested fields, unknown enum values, extra fields, deeply nested values, and partially valid envelopes.
- [ ] Add directed mutations proving schema checks, exception handling, cache replay checks, Candidate rejection, and deep Cache V2 validation are all required to pass.
- [ ] Benchmark the schema validator and candidate read path without repeated unnecessary serialization.
- [ ] Clearly report whether a supplied same-host relative baseline is enabled and enforce the 10% regression ceiling.
- [ ] Make cold Planner samples assert nonempty, semantically correct routes rather than only measuring elapsed time.

### Task 7: Run automated and real-browser acceptance

**Files:**
- Test: all changed and new `.mjs`/`.js` files

- [ ] Run the malformed-intent, model, oracle, intent-boundary, generative, mutation, fallback, Search gate, publication gate, real-world Search, Search V1, Planner pipeline, six-card Feed, Feed exhaustion, comprehensive prelaunch, Cache V2, and performance verifiers.
- [ ] Run `node --check` on every changed/new JavaScript module and `git diff --check`.
- [ ] Start the application with isolated cache/runtime directories and validate normal cache hits, a single corrupt cache record safely missing, Japan 7 days, February Japan 7 days, four-city one-day conflict, Feed, Detail, and 360/390/desktop viewports.
- [ ] Confirm zero console errors/warnings and zero external requests.
- [ ] Re-run performance with `ROUTE_V2_PARSE_BASELINE_P95_MS=1.301614`; require no stable same-host regression above 10%.
- [ ] Reconfirm Accepted, Cache, and Knowledge fingerprints are unchanged.

### Task 8: Review, commit, push, and correct PR #18 metadata

**Files:**
- Modify: PR #18 title and description only after the code commit is pushed

- [ ] Review the complete staged diff for scope, debug output, local paths, secrets, temporary files, and unrelated changes.
- [ ] Create one commit: `fix(route-v2): reject malformed embedded route intents`.
- [ ] Re-run the key gate after commit, then push the current branch without force.
- [ ] Update PR #18 title to `feat(route-v2): deliver validated route generation v2 foundation`.
- [ ] Replace the misleading scope statement with the real integrated RouteIntent, Search/Planner/fallback/cache/Ready, publication, Feed/Detail/image fallback, Cache V2, Knowledge Entity Layer Batch02, Evidence 3A/3B, candidate validation, performance/browser, documentation, and verifier scope.
- [ ] State exclusions explicitly and explain why the continuous dependency stack remains one PR without rewriting history.
- [ ] Confirm PR base/head, current commit/file counts, mergeability, local cleanliness, and that no merge, deploy, tag, release, or history rewrite occurred.
