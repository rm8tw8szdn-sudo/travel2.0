# Route Generation V2 Evidence 3B Offline Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, manual-only CLI that resolves MissingEvidenceManifest tasks into reusable RouteLegEvidence or SeasonEvidence without introducing network calls into Search, Planner, Feed, or page loads.

**Architecture:** Reuse the Phase 3C online provider contract for discovery, the existing web evidence extractor for conservative fact candidates, and the Phase 3A-2 atomic stores/index for persistence. A new offline collector owns task selection, trusted-source validation, fact extraction, status transitions, retry isolation, and batch statistics. Full source metadata is embedded in each reusable evidence record so facts remain auditable without a second evidence database.

**Tech Stack:** Node.js ES modules, existing Route V2 provider contract, deterministic SHA-256 identifiers, atomic JSONL stores, Node `assert` verifier.

---

### Task 1: Freeze CLI and safety boundaries

**Files:**
- Create: `scripts/verify-route-v2-evidence-3b-offline-collector.mjs`
- Create: `docs/superpowers/plans/2026-07-21-route-generation-v2-evidence-3b-offline-collector.md`

- [ ] **Step 1: Assert parser defaults and hard limits**

```js
assert.equal(parseOfflineEvidenceCollectorArgs([]).limit, 20);
assert.throws(() => parseOfflineEvidenceCollectorArgs(["--limit", "31"]), /limit/i);
assert.equal(isRouteV2OfflineEvidenceCollectionEnabled({}), false);
```

- [ ] **Step 2: Assert dry-run isolation**

Run a 20-task temporary Japanese manifest with `dryRun: true`; assert provider calls, evidence writes, task writes, and network request statistics are all zero.

- [ ] **Step 3: Run the failing verifier**

Run: `node scripts/verify-route-v2-evidence-3b-offline-collector.mjs`

Expected: FAIL because the collector modules and CLI do not exist.

### Task 2: Persist complete source metadata

**Files:**
- Create: `src/lib/routes/local-evidence-source-schema.mjs`
- Modify: `src/lib/routes/route-leg-evidence-schema.mjs`
- Modify: `src/lib/routes/season-evidence-schema.mjs`

- [ ] **Step 1: Define stable source records**

```js
{
  sourceId,
  sourceType,
  url,
  publisher,
  retrievedAt,
  supports,
  confidence,
  contentHash,
}
```

- [ ] **Step 2: Require HTTPS, trusted publisher classification, bounded confidence, non-empty supports, and a SHA-256 content hash**

- [ ] **Step 3: Add deduplicated `sources` arrays to RouteLegEvidence and SeasonEvidence while preserving source-free placeholder rules**

- [ ] **Step 4: Validate source references**

Every `sourceRefs` entry must identify one embedded source, and every claimed duration/risk must have at least one valid source.

### Task 3: Add conservative source and fact adaptation

**Files:**
- Create: `src/lib/routes/offline-evidence-fact-adapter.mjs`

- [ ] **Step 1: Reuse the current web extractor**

Use `createWebEvidenceExtractor()` for transport candidates, then apply stricter endpoint direction, official-domain, and source-snippet checks before accepting a fact.

- [ ] **Step 2: Extract route-leg facts**

Only set `feasibilityStatus=feasible` when an official source snippet names the directed endpoints and explicitly supports a transport connection. Parse source-backed duration ranges; leave transfer and frequency fields null/unknown when absent.

- [ ] **Step 3: Extract season hard risks**

Only record explicit snow, closure, suspension, seasonal restriction, or additional-buffer facts. Keep `suitabilityStatus=unknown`; never infer a best month.

- [ ] **Step 4: Detect conflicts**

If qualified sources disagree on feasibility, availability, or non-overlapping duration ranges, retain both sources, clear disputed values, and return `needs-review`.

### Task 4: Add manifest status transitions

**Files:**
- Modify: `src/lib/routes/missing-evidence-manifest-store.mjs`

- [ ] **Step 1: Add atomic `updateCollectionState()`**

```js
store.updateCollectionState(missingEvidenceId, {
  status: "collecting",
  attempted: true,
  diagnostic: { code: "collection-started", message: "Offline evidence collection started." },
});
```

- [ ] **Step 2: Preserve firstSeenAt/createdAt, increment attemptCount only for real attempts, update lastSeenAt, deduplicate diagnostics, and validate every transition**

- [ ] **Step 3: Keep resolved tasks immutable to normal claims**

### Task 5: Implement the bounded offline collector

**Files:**
- Create: `src/lib/routes/offline-evidence-collector.mjs`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Select deterministic tasks**

Filter by `route-leg|season|all`, country/entity context, status, retry mode, and max attempts; sort by descending priority then stable ID; clamp batches to 1–30 with a default of 20.

- [ ] **Step 2: Fail safely when disabled or unconfigured**

Provider absence must return `provider-not-configured` before task mutation. Dry-run must work without calling the provider or stores.

- [ ] **Step 3: Process tasks independently**

Use bounded concurrency, per-provider timeout/retry settings, atomic evidence upsert, immediate index refresh through store revisions, and final manifest status mapping.

- [ ] **Step 4: Return batch statistics**

Return claimed, resolved, needs-review, retryable failure, permanent failure, route-leg write, season write, duplicate skip, provider attempt, and elapsed-time counts without secrets.

### Task 6: Add the manual CLI

**Files:**
- Create: `scripts/collect-route-v2-local-evidence.mjs`

- [ ] **Step 1: Parse supported arguments**

```text
--limit <1..30>
--type route-leg|season|all
--country <country code, country entity ID, or name>
--dry-run
--resume
```

- [ ] **Step 2: Explicitly load existing stores and provider**

Require `ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED=true` and `ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED=true`. Reuse `createRouteV2TavilyEvidenceProvider()`; never enable evidence or provider flags implicitly.

- [ ] **Step 3: Build the entity resolver from the published Entity Layer plus existing Planner fallback destinations**

- [ ] **Step 4: Emit one JSON summary with no API key or local absolute storage path**

### Task 7: Verify the Japanese pilot and regressions

**Files:**
- Test: `scripts/verify-route-v2-evidence-3b-offline-collector.mjs`

- [ ] **Step 1: Build 20 temporary Japanese tasks**

Include Tokyo, Osaka, Kyoto, Nara, Kanazawa, Takayama, and Matsumoto; include a directed reverse leg, a duplicated request, February season tasks, no-result, timeout, conflict, and write-failure cases.

- [ ] **Step 2: Use injected provider responses backed by verified official JR Central, JR West, JNTO, and MLIT URLs**

- [ ] **Step 3: Assert all 15 collector acceptance rules, idempotent reruns, immediate index visibility, and unchanged production assets**

- [ ] **Step 4: Run targeted regressions**

Run Evidence 3A-2, 3A-1, Time Intent, Candidate stabilization, Search acceptance gate, Planner pipeline, existing 3B1/3B2/3C1/3C2, `git diff --check`, and `git diff --cached --check`.

- [ ] **Step 5: Commit only the reviewed Evidence 3B files**

```bash
git commit -m "feat(route-v2): add offline evidence collection pilot"
```
