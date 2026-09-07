# Runtime Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix reproducible job identity collisions and retained runtime resources, consolidate bounded stream reading, and provide an offline test entry point.

**Architecture:** Preserve the existing CommonJS server and ESM route service boundaries. Keep fixes in existing modules, share byte accumulation inside server-security.js, and add deterministic tests using injected clocks and streams. Do not change route generation, publication policy, or stored travel data.

**Tech Stack:** Node.js 24, native node:test and node:assert, npm/pnpm; no added dependencies.

---

### Task 1: Job identity and history

Files: modify `src/lib/routes/route-job-store.mjs`; create `tests/route-job-store.test.mjs`.

- [x] Reproduce field-position and delimiter collisions, same-millisecond history loss, diagnostic mutation, and duplicate explicit IDs with fixed `now: () => 100`.
- [x] Run `node --test tests/route-job-store.test.mjs`; expect regression failures.
- [x] Normalize fields once, use `JSON.stringify([type, providerId, evidenceHash, sourceIdentity, query])` for identity, append a store-local sequence to generated IDs, reject reused explicit IDs, and clone diagnostic input.
- [x] Run the same command; expect all tests to pass, including active-job reuse and expiration.

### Task 2: Bound cache growth

Files: modify `src/lib/routes/cache.mjs`; create `tests/cache.test.mjs`.

- [x] Test a capacity of two with `set('a', 1); set('b', 2); set('c', 3)`; require `get('a') === undefined`. Test replacement order, TTL boundary, invalid capacity, clear/delete, and default capacity under 2,000 writes.
- [x] Run `node --test tests/cache.test.mjs`; expect capacity failures.
- [x] Add positive-safe-integer `maxEntries = 1000`; move replacements to the end with `entries.delete(key)` before setting; evict the first Map key when capacity is exceeded. Keep get TTL semantics and the existing full purge in size. Insertion eviction remains O(1), without timers or per-write full scans.
- [x] Run the same command; expect all tests to pass.

### Task 3: Consolidate bounded reading and release image responses

Files: modify `server-security.js`; create `tests/server-security.test.mjs`.

- [x] Supply real `Readable` response bodies for rejected status, MIME, declared size, malformed redirects, and streamed overflow; assert rejection and `body.destroyed === true`.
- [x] Run `node --test tests/server-security.test.mjs`; expect cleanup failures.
- [x] Extract `collectBoundedBody(body, maxBytes, createLimitError)` for request and image streams, preserving byte-based limits and existing errors. Wrap each upstream response's validation/consumption in `try/finally { upstream?.body?.destroy?.(); }`.
- [x] Run new tests and `node scripts/verify-route-v2-server-security-boundaries.mjs`; expect PASS with zero external requests.

### Task 4: Test commands and review handoff

Files: create `package.json`, `docs/code-review-2026-09-07.md`; modify `README.md`, `DEV_SETUP.md`, `PROJECT_ENVIRONMENT.md`.

- [x] Add private CommonJS package metadata with `test: node --test tests/*.test.mjs`, `preview:travel: node server.js`, and explicit smoke verification for security boundaries and detail load stability.
- [x] Update setup docs to describe the new commands and distinguish unit checks from data-dependent verifiers.
- [x] Run `npm.cmd test`, `npm.cmd run test:smoke`, syntax checks for modified production files, and `git diff --check`.
- [x] Record severities, reproductions, fixed scope, residual large-module/resource risks, and actual validation limitations in the review report; commit the reviewed source and docs on the dedicated branch.

### Task 5: Image memory budget (review follow-up)

Files: create `image-response-cache.js`, `tests/image-response-cache.test.mjs`; modify `server.js`.

- [x] Test both byte and entry caps, overwrite accounting, clear/delete, and oversized bypass using Buffer payloads and small limits.
- [x] Extract a CommonJS `createImageResponseCache({ maxEntries = 200, maxBytes = 64 * 1024 * 1024 })` with shared `set` admission and oldest-entry eviction. Track `body.length` on every insertion/removal and return false for a single image exceeding the budget.
- [x] Use the cache for both disk hits and downloaded images; remove the download-only eviction branch.
- [x] Run `npm.cmd test`, server image proxy network-boundary verification, and syntax checks. State that the cap bounds retained payload bytes, not total process RSS.
