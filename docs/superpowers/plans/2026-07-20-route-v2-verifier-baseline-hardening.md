# Route V2 Verifier Baseline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the five known Route V2 baseline verifier failures pass without changing runtime behavior, knowledge data assets, cache files, or golden outputs.

**Architecture:** Treat checked-in JSON as canonical LF text when hashing or comparing deterministic rebuilds, while leaving parsed data and published bytes untouched when content differs only by line endings. Update two stale verifier expectations to reflect the current strict-feed and discovery-contract behavior rather than weakening production validation.

**Tech Stack:** Node.js ES modules, `node:crypto`, `node:fs/promises`, Git, existing Route V2 verifier scripts.

---

### Task 1: Add canonical text semantics for frozen knowledge assets

**Files:**
- Create: `scripts/lib/knowledge-baseline-text.mjs`
- Modify: `scripts/import-knowledge-poi-baseline-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs`

- [ ] **Step 1: Confirm the POI verifier fails before implementation**

Run:

```bash
node scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs
```

Expected: exit 1 with `selection-sha256-mismatch` on a CRLF checkout.

- [ ] **Step 2: Add a narrowly scoped canonical-text helper**

Create `scripts/lib/knowledge-baseline-text.mjs` with:

```js
import crypto from "node:crypto";

export function normalizeKnowledgeBaselineText(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

export function sha256KnowledgeBaselineText(value) {
  return crypto.createHash("sha256").update(normalizeKnowledgeBaselineText(value)).digest("hex");
}
```

- [ ] **Step 3: Make POI frozen-input hashes line-ending stable**

In `scripts/import-knowledge-poi-baseline-p1b-batch01.mjs`, import both helper functions. Replace raw text SHA-256 calls for the selection and four candidate snapshots with `sha256KnowledgeBaselineText(contents)`. Preserve the canonical hash in `sourceRaws[round].sha256`.

- [ ] **Step 4: Avoid rewriting published assets for line-ending-only differences**

Before the atomic write in `writeTextAtomic`, read the existing file when present and return early when:

```js
normalizeKnowledgeBaselineText(existingContents) === normalizeKnowledgeBaselineText(contents)
```

Only ignore `ENOENT`; rethrow every other read error. This keeps data bytes and mtimes unchanged during an equivalent offline rebuild.

- [ ] **Step 5: Align the POI verifier with canonical hashes**

In `scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs`, replace `sha256Text` with the shared `sha256KnowledgeBaselineText` helper for the selection and candidate raw assertions. Compare the rebuilt formal raw and four published assets after `normalizeKnowledgeBaselineText`, then keep the existing before/after output comparison and protected-file checks intact.

- [ ] **Step 6: Verify the POI importer and verifier**

Run:

```bash
node scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs
git status --short
```

Expected: verifier PASS; no Country, City, POI, candidate, selection, review, conflict, provenance, cache, or golden asset appears in `git status`.

### Task 2: Apply canonical comparisons to City and Country rebuild verifiers

**Files:**
- Modify: `scripts/verify-knowledge-city-baseline-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-country-baseline-p1a-batch03.mjs`

- [ ] **Step 1: Confirm both verifiers fail before implementation**

Run:

```bash
node scripts/verify-knowledge-city-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-country-baseline-p1a-batch03.mjs
```

Expected: City exits 1 with raw SHA mismatch; Country exits 1 because LF serialization is compared directly with CRLF working-tree text.

- [ ] **Step 2: Canonicalize the City raw hash and deterministic serialized comparison**

Import `normalizeKnowledgeBaselineText` and `sha256KnowledgeBaselineText` into the City verifier. Use the SHA helper for `EXPECTED_RAW_HASH`, and compare canonicalized serialized output to canonicalized checked-in text:

```js
assert.equal(
  normalizeKnowledgeBaselineText(serialized[key]),
  normalizeKnowledgeBaselineText(readText(relativePath)),
  `${key} serialized rebuild should be canonical-text-identical`,
);
```

- [ ] **Step 3: Canonicalize the Country deterministic serialized comparison**

Import `normalizeKnowledgeBaselineText` into the Country Batch03 verifier and apply the same canonical-text comparison to its four rebuilt assets. Preserve the existing object-level determinism, no-network, and protected-state assertions.

- [ ] **Step 4: Verify City and Country baselines**

Run:

```bash
node scripts/verify-knowledge-city-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-country-baseline-p1a-batch03.mjs
git diff --check
```

Expected: both PASS and whitespace check exits 0.

- [ ] **Step 5: Commit line-ending portability changes**

Stage only the plan, helper, POI importer/verifier, City verifier, and Country verifier, then commit:

```bash
git commit -m "fix(route-v2): make knowledge verifier hashes line-ending stable"
```

### Task 3: Align the warmup verifier with strict-feed semantics

**Files:**
- Modify: `scripts/verify-planner-warmup-integration.mjs`

- [ ] **Step 1: Confirm the warmup verifier fails before implementation**

Run:

```bash
node scripts/verify-planner-warmup-integration.mjs
```

Expected: exit 1 at `repository must contain a planner-designed record` because `list({ limit: 100 })` invokes strict-feed filtering.

- [ ] **Step 2: Separate repository persistence from strict-feed visibility**

Read the stored record with the repository inspection boundary:

```js
const all = repo.list({ limit: 100_000 });
```

Then retain all existing planner-record assertions and add a strict-feed assertion using `repo.list({ limit: 100 })` that confirms the record without a verified `onlineCoverAsset` is excluded. Use the inspection boundary for the degrade-path persistence assertion too. Update the feed-focused synthetic fixtures with explicit verified `onlineCoverAsset` metadata so their feed assertions continue to test current production eligibility rules. Update nearby comments and the final summary so they claim repository persistence plus strict-feed protection, not unconditional feed visibility.

- [ ] **Step 3: Run the warmup verifier**

Run:

```bash
node scripts/verify-planner-warmup-integration.mjs
```

Expected: all six sections PASS, with planner persistence verified and the strict-feed rule retained.

### Task 4: Align the foundation verifier with the current discovery contract

**Files:**
- Modify: `scripts/verify-route-v2-foundation.mjs`

- [ ] **Step 1: Confirm the foundation verifier fails before implementation**

Run:

```bash
node scripts/verify-route-v2-foundation.mjs
```

Expected: exit 1 showing actual `limit: 60` versus expected `limit: 20`, plus the current `excludeClusters: []` field.

- [ ] **Step 2: Update only the stale expected request object**

Change the expected normalized request to:

```js
{
  mode: "feed",
  query: "日本",
  locale: "zh-CN",
  limit: 60,
  cursor: null,
  sessionId: null,
  excludeIds: ["one"],
  excludeClusters: [],
  routeType: "single",
}
```

Do not change `src/lib/routes/contracts.mjs` or its `MAX_LIMIT`.

The foundation feed fixture must also declare a verified `onlineCoverAsset` with matching `imageCountryCodes`, because the fixture explicitly expects the route to be returned by strict feed. Feed pagination fixtures and the search-built fixture must use distinct destination sets so the current repository deduper keeps them as separate routes. These changes affect test setup only, not repository behavior.

- [ ] **Step 3: Run the foundation verifier**

Run:

```bash
node scripts/verify-route-v2-foundation.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit stale verifier expectation fixes**

Stage only the warmup and foundation verifiers, then commit:

```bash
git commit -m "fix(route-v2): align legacy verifier expectations"
```

### Task 5: Run the regression matrix and audit final scope

**Files:**
- Verify only; no additional files should change.

- [ ] **Step 1: Run the five repaired verifiers**

```bash
node scripts/verify-planner-warmup-integration.mjs
node scripts/verify-knowledge-poi-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-city-baseline-p1b-batch01.mjs
node scripts/verify-knowledge-country-baseline-p1a-batch03.mjs
node scripts/verify-route-v2-foundation.mjs
```

Expected: 5/5 PASS.

- [ ] **Step 2: Run directly related cumulative regressions**

```bash
node scripts/verify-knowledge-entity-layer-p1b-batch01.mjs
node scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs
node scripts/verify-route-v2-phase3c2-online-provider-foundation.mjs
node scripts/verify-route-v2-phase3c1-online-evidence-adapter.mjs
```

Expected: all PASS with no external requests and no cache writes.

- [ ] **Step 3: Verify Git scope and commit history**

```bash
git diff --check
git diff --cached --check
git status --short --branch
git log -3 --oneline
```

Expected: clean working tree; exactly two new commits after `5dd69c8`; no data asset, cache, golden, Planner integration, or UI file changes.
