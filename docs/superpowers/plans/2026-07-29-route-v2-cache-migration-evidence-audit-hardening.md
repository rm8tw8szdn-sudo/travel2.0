# Route V2 Cache Migration and Evidence Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close PR #18's three release-gate gaps by identity-locking the one-time Search Cache migration, auditing the complete Candidate → DecisionTrace → EvidenceBundle → RouteRecord chain, and making every critical verifier mandatory in comprehensive prelaunch.

**Architecture:** Keep destructive migration authorization in a small pure policy module so the CLI and verifier share the exact same full-signature comparison. Extend Cache Baseline V2 with single-pass indexes over runtime and formal records, then validate every association without nested full scans or raw-query diagnostics. Centralize comprehensive child-process execution in a fail-closed runner that records command, exit code, stdout summary, and stderr while propagating any non-zero status.

**Tech Stack:** Node.js ESM, SHA-256, JSON/JSONL runtime stores, `Map` indexes, `spawnSync`, existing RouteIntent/Candidate/Trace/Evidence validators, temporary filesystem fixtures, Git and GitHub CLI.

---

## File map

- Create `src/lib/routes/search-cache-semantic-migration-policy.mjs`: immutable migration schema, two authorized historical signatures, signature derivation, and exact-set authorization.
- Modify `scripts/migrate-route-v2-search-cache-semantic-invalid.mjs`: use the policy, fail closed on clean/missing/changed/extra records, retain generic read-only `--verify-clean`, and atomically replace only an exactly authorized cache copy.
- Modify `scripts/verify-route-v2-search-cache-semantic-migration.mjs`: build fixtures from the original external backup signatures and cover every authorization bypass.
- Modify `src/lib/routes/cache-baseline-v2.mjs`: build Candidate, Trace, Bundle, and RouteRecord indexes and validate all cross-record associations.
- Modify `scripts/verify-route-v2-cache-semantic-integrity.mjs`: create a complete valid chain and mutate each association independently in a temporary cache.
- Create `src/lib/routes/prelaunch-verifier-gate.mjs`: one fail-closed child-verifier runner and the mandatory release-gate list.
- Modify `scripts/verify-route-v2-comprehensive-prelaunch.mjs`: execute the mandatory list through the shared runner and expose structured stage results.
- Create `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`: inject a non-zero child result into the production runner and prove the comprehensive gate rejects it.
- Modify `scripts/verify-route-v2-intent-mutations.mjs`: kill migration-authorization and association-audit bypass mutants.
- Modify `ROUTE_V2_SEARCH_CACHE_SEMANTIC_MIGRATION_2026-07-29.md`: document the versioned authorization signature without embedding an absolute backup path.
- Create this plan.

### Task 1: Lock the migration to the two historical identities

**Files:**
- Create: `src/lib/routes/search-cache-semantic-migration-policy.mjs`
- Modify: `scripts/migrate-route-v2-search-cache-semantic-invalid.mjs`
- Test: `scripts/verify-route-v2-search-cache-semantic-migration.mjs`

- [ ] **Step 1: Add failing full-signature migration fixtures**

Build two authorized fixtures from sanitized signature constants and assert exact success. Add reject cases for arbitrary records, a decoy, changed item hash, changed field path, missing target, a third same-type record, and an already-clean cache. Assert rejected runs leave file bytes and backup directory unchanged.

- [ ] **Step 2: Run the migration verifier and confirm the old count-based implementation fails**

Run:

```powershell
node scripts/verify-route-v2-search-cache-semantic-migration.mjs
```

Expected: FAIL because arbitrary same-type items are still accepted and the authorized historical fixture is not recognized by a full-signature policy.

- [ ] **Step 3: Implement the versioned full-signature policy**

The pure policy exports a frozen migration schema and two frozen signatures:

```js
export const SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA =
  "route-v2-search-cache-semantic-migration-authorization-v2";

export const AUTHORIZED_SEARCH_CACHE_INVALID_RECORDS = Object.freeze([
  Object.freeze({
    stableKey: "rif-v1-4c9d9d9e924247460776563f966f40d75d9356b45bf1e64a564bf3a11b38a207",
    intentHash: "b2fc20b07fe7aee60479d294",
    itemSha256: "e61b2ad7697da1cae8d5f80b342bc176d490bc9fc6b3707c91c4dc176927efff",
    reasonCode: "route-intent-semantic-invalid",
    fieldPath: "hardConstraints.season",
    routeIntentFingerprint:
      "rif-v1-4c9d9d9e924247460776563f966f40d75d9356b45bf1e64a564bf3a11b38a207",
    routeIntentFingerprintVersion: "route-intent-fingerprint-v1",
  }),
  Object.freeze({
    stableKey: "rif-v1-4a112c70660af13de649f33fbfba67a0dc7ef29fe427375c2f2f448d9a4f1a3e",
    intentHash: "35810b5c6e7e1d9fa6d85ae9",
    itemSha256: "4c965018978b117fa46758520283524389b63e503c3fa90bf73070f9aa0d8906",
    reasonCode: "route-intent-semantic-invalid",
    fieldPath: "hardConstraints.season",
    routeIntentFingerprint:
      "rif-v1-4a112c70660af13de649f33fbfba67a0dc7ef29fe427375c2f2f448d9a4f1a3e",
    routeIntentFingerprintVersion: "route-intent-fingerprint-v1",
  }),
]);
```

Derive each actual signature from the stable object key, item byte-equivalent JSON serialization, embedded route envelope, and canonical validator diagnostics. Compare sorted canonical signatures as an exact set. Return structured reason codes for missing, extra, or changed signatures without raw queries.

- [ ] **Step 4: Make `--apply` fail closed before any backup or write**

Only create a backup and sibling temporary file after exact-set authorization succeeds. A clean cache reports `already-migrated-or-not-authorized`; changed or decoy records report `migration-authorization-mismatch`; neither path removes data. Keep `--verify-clean` generic and read-only.

- [ ] **Step 5: Run the migration verifier**

Run:

```powershell
node scripts/verify-route-v2-search-cache-semantic-migration.mjs
```

Expected: PASS with all ten authorization cases, zero writes for dry-run/verify/rejected cases, and atomic replacement only for the exact two-record whitelist.

### Task 2: Audit the complete runtime evidence association graph

**Files:**
- Modify: `src/lib/routes/cache-baseline-v2.mjs`
- Modify: `scripts/verify-route-v2-cache-semantic-integrity.mjs`

- [ ] **Step 1: Extend the isolated clean fixture to a complete valid chain**

Write Candidate, DecisionTrace, EvidenceBundle, and a locatable RouteRecord into temporary runtime files. The clean audit must pass only when IDs, intent ID, fingerprint/version, canonical intent, selected order, and route association all agree.

- [ ] **Step 2: Add failing association cases**

Mutate one field at a time for missing `decisionTraceId`, Trace candidate mismatch, intent mismatch, fingerprint mismatch, version mismatch, nonexistent `routeRecordId`, RouteRecord candidate mismatch, and RouteRecord fingerprint mismatch. Recompute a structurally valid bundle ID for the `dt-nonexistent` case so the failure proves association validation rather than standalone schema rejection.

- [ ] **Step 3: Run the semantic-integrity verifier and confirm current gaps**

Run:

```powershell
node scripts/verify-route-v2-cache-semantic-integrity.mjs
```

Expected: FAIL because the current audit only checks Bundle → Candidate fingerprint/version.

- [ ] **Step 4: Build single-pass indexes and association checks**

Parse each relevant file once. Build:

```js
const candidatesById = new Map();
const tracesById = new Map();
const bundlesById = new Map();
const routeRecordsById = new Map();
```

Index RouteRecords from Search Cache, Ready Pool, Accepted, and supported runtime record containers. Validate Trace → Candidate, Bundle → Trace, Bundle → Candidate, and Bundle → RouteRecord. If a referenced RouteRecord cannot be located, emit an explicit `association-unverifiable` failure; never silently pass. Catch per-record exceptions and include only file, record index, reason code, and field path.

- [ ] **Step 5: Run Cache semantic integrity and Cache Baseline V2**

Run:

```powershell
node scripts/verify-route-v2-cache-semantic-integrity.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
```

Expected: PASS; the formal cache remains unchanged and every isolated broken association produces a structured audit failure.

### Task 3: Make critical release verifiers mandatory

**Files:**
- Create: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`
- Create: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Add a failing release-gate coverage verifier**

Define the mandatory list with these direct production-path verifiers:

```js
[
  "scripts/verify-route-v2-semantic-intent-consistency.mjs",
  "scripts/verify-route-v2-malformed-route-intent.mjs",
  "scripts/verify-route-v2-cache-semantic-integrity.mjs",
  "scripts/verify-route-v2-candidate-snapshot-consistency.mjs",
  "scripts/verify-route-v2-publication-gate.mjs",
  "scripts/verify-route-v2-evidence-3a-foundation.mjs",
  "scripts/verify-route-v2-search-cache-semantic-migration.mjs",
  "scripts/verify-route-v2-cache-baseline-v2.mjs",
  "scripts/verify-route-v2-intent-performance.mjs",
]
```

The focused verifier supplies a fake child process returning exit code 17 and asserts the shared production runner throws a structured stage failure containing the command, exit code, stdout summary, and stderr summary.

- [ ] **Step 2: Run the failure-propagation verifier and confirm the runner is missing**

Run:

```powershell
node scripts/verify-route-v2-comprehensive-failure-propagation.mjs
```

Expected: FAIL because the shared runner and mandatory list do not exist.

- [ ] **Step 3: Implement the shared fail-closed runner**

`runMandatoryVerifierStage` calls `spawnSync`, records duration and bounded output summaries, and throws on timeout, signal, or non-zero exit. It never decides success by matching the string `PASS`.

- [ ] **Step 4: Wire comprehensive prelaunch to the mandatory list**

Run all mandatory static verifiers under isolated environment paths before the live browser probe. Keep performance attached to the running localhost preview while still reporting it as mandatory. Emit structured stage results:

```js
{
  name,
  command,
  exitCode,
  durationMs,
  stdoutSummary,
  stderrSummary,
}
```

Any child failure must set comprehensive status to FAIL and preserve the failing stage name.

- [ ] **Step 5: Run the gate verifier**

Run:

```powershell
node scripts/verify-route-v2-comprehensive-failure-propagation.mjs
```

Expected: PASS, proving a non-zero mandatory child cannot be swallowed.

### Task 4: Kill authorization and association bypass mutants

**Files:**
- Modify: `scripts/verify-route-v2-intent-mutations.mjs`

- [ ] **Step 1: Add migration policy mutants**

Use the pure authorization API to prove rejection when stable ID validation is removed, item hash validation is removed, only count is checked, a decoy is ignored, or a target is missing.

- [ ] **Step 2: Add association audit mutants**

Use temporary Cache copies to prove the audit rejects skipped Trace existence, skipped RouteRecord association, Candidate-only fingerprint comparison, missing Trace default-pass, and `association-unverifiable` default-pass behavior.

- [ ] **Step 3: Run mutation verification**

Run:

```powershell
node scripts/verify-route-v2-intent-mutations.mjs
```

Expected: PASS with every old and new mutant killed.

### Task 5: Document authorization and run all gates

**Files:**
- Modify: `ROUTE_V2_SEARCH_CACHE_SEMANTIC_MIGRATION_2026-07-29.md`
- Test: all changed `.mjs` files and release verifiers

- [ ] **Step 1: Document the migration authorization schema**

Add the migration schema version, fingerprint/version fields, exact-set rule, already-migrated behavior, and repository-external backup convention. Do not record an absolute local path or raw query.

- [ ] **Step 2: Run syntax and focused verifier matrix**

Run `node --check` for every changed/new `.mjs` file, then run migration, semantic consistency, malformed intent, cache semantic integrity, Candidate snapshot consistency, publication gate, Evidence 3A lifecycle, Cache V2, property/fuzz/metamorphic/differential/mutation, performance, and comprehensive verifiers.

Expected: all exit 0.

- [ ] **Step 3: Run comprehensive prelaunch as the single release command**

Run:

```powershell
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
```

Expected: PASS, structured child-stage results, localhost browser probe PASS, and formal assets unchanged.

- [ ] **Step 4: Perform real-page smoke checks**

Use the in-app browser against an isolated localhost server for Japan 7 days, February Japan 7 days, four cities in one day, Feed, and Detail. Confirm zero console errors/warnings and zero external image/evidence requests.

- [ ] **Step 5: Recheck asset and Git boundaries**

Confirm Search Cache remains 22 records with SHA-256 `941ddcbe9c252a9b826772a6c75fa68e93748254e2aee1a2b85d4703e94b2838`, Accepted remains `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, Immutable aggregate remains `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, Knowledge remains 51 unchanged files, full Cache remains 331 files, Runtime State remains 329 files, and no backup/temp/absolute path is staged.

### Task 6: Commit, post-commit verify, push, and update PR #18

**Files:**
- Stage only the files listed in this plan.

- [ ] **Step 1: Inspect unstaged and staged diffs**

Run:

```powershell
git diff --check
git diff --name-status
git diff --stat
git add <explicit paths>
git diff --cached --check
git diff --cached --name-status
git diff --cached --stat
git diff --cached
```

Expected: only migration authorization, association audit, comprehensive wiring, verifiers, mutation coverage, report, and this plan are staged.

- [ ] **Step 2: Create one independent commit**

Run:

```powershell
git commit -m "fix(route-v2): harden cache migration and evidence auditing"
```

Expected: one new commit with parent `eec92f3fb54c5aa307b694f681d3429a542ca800`.

- [ ] **Step 3: Run post-commit release checks**

Run migration verifier, Cache V2, comprehensive prelaunch, and mutation verifier again.

Expected: all PASS and working tree clean.

- [ ] **Step 4: Push normally and update PR #18**

Push the current branch without force, then update the existing PR body to describe identity-locked migration authorization, complete EvidenceBundle association audit, and mandatory release blockers in comprehensive prelaunch. Do not merge, deploy, tag, or rewrite history.

- [ ] **Step 5: Report the final state**

Report files, performance before/after, association counts, test matrix, formal asset fingerprints, commit SHA, push result, PR URL/status, and `PR UPDATED — READY FOR RE-REVIEW` only if every gate passed.
