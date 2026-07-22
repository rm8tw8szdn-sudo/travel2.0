# Route V2 Required Cities and Japan Ready Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve explicit multi-city requirements through RouteIntent, Candidate generation, validation, DecisionTrace, and publication, then promote the minimum real Japanese official evidence needed to publish one genuine multi-city route in an isolated Ready Pool.

**Architecture:** Extend the existing single search-intent parser with exact catalog-backed city occurrence extraction and order classification. Carry those fields through the existing Candidate Builder and validator, use the existing Japan Pilot collector and promotion command for evidence, and keep Publication Gate plus Ready Pool as the only publication path.

**Tech Stack:** Node.js ES modules, JSONL evidence stores, deterministic hashing, existing Route V2 verifiers and CLI tools.

---

### Task 1: Lock the baseline and write failing multi-city tests

**Files:**
- Create: `scripts/verify-route-v2-multi-city-intent.mjs`
- Inspect: `src/lib/routes/search-intent-parser.mjs`
- Inspect: `src/lib/routes/route-candidate-builder.mjs`
- Inspect: `src/lib/routes/route-candidate-evidence-validation.mjs`

- [ ] **Step 1: Assert the clean baseline**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
```

Expected: branch `codex/route-v2-knowledge-entity-layer-p1b-batch02`, HEAD `3259afc8243032ac413ab21925152dce260ca163`, and no pre-existing changes.

- [ ] **Step 2: Add parser assertions for all required formats**

The verifier must call the existing `parseSearchIntent()` with the published Entity Layer city catalog and assert:

```js
assert.deepEqual(parse("东京京都大阪7天").requiredDestinationIds, ["Q1490", "Q34600", "Q35765"]);
assert.equal(parse("东京京都大阪7天").destinationOrderMode, "flexible");
assert.equal(parse("东京→京都→大阪7天").destinationOrderMode, "fixed");
assert.deepEqual(parse("Tokyo to Kyoto then Osaka 7 days").requiredDestinationIds, ["Q1490", "Q34600", "Q35765"]);
```

Also cover Chinese punctuation, spaces, order words, duplicates, partial unknowns, and the one-day five-city conflict.

- [ ] **Step 3: Run the new verifier and confirm it fails before implementation**

Run:

```powershell
node scripts/verify-route-v2-multi-city-intent.mjs
```

Expected: FAIL because required destination fields and fixed/flexible classification do not yet exist.

### Task 2: Extend the existing RouteIntent parser

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`
- Test: `scripts/verify-route-v2-multi-city-intent.mjs`

- [ ] **Step 1: Extract exact city occurrences from the existing catalog**

Add one helper beside the catalog matching helpers that searches exact normalized aliases, records source positions, deduplicates by stable city/entity identity while preserving first occurrence, and returns recognized plus unrecognized explicit tokens. Do not use fuzzy similarity.

- [ ] **Step 2: Classify explicit order syntax**

Return `fixed` only when the text contains an ordered connector sequence such as `→`, `到…再去`, `先…然后…最后`, or English `to…then`; otherwise return `flexible` when two or more cities are explicitly present, and `unspecified` for fewer than two.

- [ ] **Step 3: Add RouteIntent fields and stable hashing**

Populate:

```js
requiredDestinationIds
requiredDestinationNames
requiredDestinationRaw
destinationOrderMode
destinationDiagnostics
```

Include the normalized constraint fields in `normalizeIntentKey()` so equal requests remain stable and fixed/flexible requests do not collide.

- [ ] **Step 4: Rerun parser tests**

Run the new verifier. Expected: parsing assertions PASS while Candidate assertions still FAIL.

### Task 3: Enforce required cities in all three Candidates

**Files:**
- Modify: `src/lib/routes/route-candidate-builder.mjs`
- Modify: `src/lib/routes/route-candidate-evidence-validation.mjs`
- Modify if required: `src/lib/routes/route-composition-planner.mjs`
- Modify if required: `src/lib/routes/route-candidate-pool.mjs`
- Test: `scripts/verify-route-v2-multi-city-intent.mjs`

- [ ] **Step 1: Resolve required IDs against the existing candidate pool**

Before generating candidate sequences, build a required destination list from `context.requiredDestinationIds`. If an ID is absent from the pool, return a diagnostic Candidate failure rather than silently dropping it.

- [ ] **Step 2: Generate flexible and fixed candidate shapes**

For `fixed`, every candidate starts with exactly the required order and may only append optional capacity-safe destinations after it. For `flexible`, every candidate contains the same required set; variants may reorder it using deterministic candidate strategies and may add capacity-safe destinations.

- [ ] **Step 3: Preserve constraints in Candidate snapshots**

Copy the required IDs, names, raw text, diagnostics, and order mode into the existing input-intent snapshot and Candidate supporting signals so DecisionTrace receives the same immutable constraint.

- [ ] **Step 4: Reject omissions, reorderings, and duration conflicts**

In Candidate Validation, add exact reason codes:

```text
required-destination-missing
required-destination-order-mismatch
duration-capacity-conflict
```

The one-day five-city request must keep all five requested IDs and be rejected; it must not be shrunk into a successful route.

- [ ] **Step 5: Run multi-city verifier**

Expected: six input formats pass; all three candidates preserve required cities; fixed order stays exact; the extreme request is rejected.

### Task 4: Collect the minimum official Japan evidence

**Files:**
- Runtime only: `.route-v2-local-evidence-japan-pilot/`
- Reuse: `scripts/collect-route-v2-japan-evidence-pilot.mjs`
- Reuse: `scripts/promote-route-v2-evidence.mjs`

- [ ] **Step 1: Inspect the current missing-evidence report and Pilot manifest**

Confirm the highest-impact unresolved directed leg for `东京→京都→大阪` is `Q34600>Q35765`, and do not hard-code historical request counts into production code.

- [ ] **Step 2: Run the Japan Pilot collector only for the smallest necessary batch**

Use the existing offline command with country `JP`, type `route-leg`, resume mode, and a bounded limit. Real network access is allowed only in this explicit step.

- [ ] **Step 3: Verify the official source**

Accept `Q34600>Q35765` only if an official operator, government, or official tourism page explicitly supports Kyoto-to-Osaka direction and a duration. Preserve URL, publisher, retrieved/expires timestamps, content hash, supports, confidence, unknowns, and conflicts. Otherwise leave it pending or needs-review.

- [ ] **Step 4: Dry-run promotion**

Run:

```powershell
node scripts/promote-route-v2-evidence.mjs --source .route-v2-local-evidence-japan-pilot --country JP --type all --dry-run
```

Expected: only resolved schema-valid official records are proposed; pending and needs-review records remain rejected.

- [ ] **Step 5: Promote through the existing command and confirm idempotence**

Run the same promotion without `--dry-run`, then rerun it. Expected: first run writes the expanded deterministic seed; second run produces no diff.

### Task 5: Verify the first real multi-city publication

**Files:**
- Create: `scripts/verify-route-v2-japan-multi-city-ready.mjs`
- Modify if required: `scripts/verify-route-v2-publication-gate.mjs`

- [ ] **Step 1: Enable flags only in an isolated temp environment**

Set the five requested flags to true in the verifier-injected environment while leaving process defaults false. Use temporary Candidate, Trace, Evidence, runtime evidence, and Ready Pool paths.

- [ ] **Step 2: Run the required input matrix**

Assert real outcomes for `东京京都大阪7天`, `东京→京都→大阪7天`, `日本7天`, `2月去日本7天`, `日本2天`, and the one-day five-city conflict.

- [ ] **Step 3: Prove publication lifecycle**

At least one genuine three-city Japanese route must have Candidate Validation `ready`, Gate `ready-for-display`, and exactly one Ready Pool entry. Repeating publication must not rewrite or duplicate; expiring one required evidence item must remove the route. Accepted repository writes must remain zero.

- [ ] **Step 4: Regenerate the read-only missing report**

Use `buildRouteV2MissingEvidenceReport()` on current non-rejected validation results and output a stable top list with direction, type, and request counts separated.

### Task 6: Run faults, performance, regressions, and scope review

**Files:**
- Modify: `docs/superpowers/plans/2026-07-22-route-v2-required-cities-japan-ready-route.md`

- [ ] **Step 1: Run fault cases**

Cover continuous Chinese names, separators, ordered connectors, English names, duplicates, partial unknowns, missing required destination, fixed-order mismatch, duration conflict, reverse-only evidence, needs-review promotion rejection, promotion conflict, missing Trace, Ready Pool duplicate and demotion.

- [ ] **Step 2: Measure performance and network boundaries**

Record parser timing and three-candidate validation plus Gate timing. Assert Search/Planner/Feed network calls are zero and only the explicit collector made real network requests.

- [ ] **Step 3: Run the directed regression matrix**

Run every verifier listed in the user request, plus `git diff --check`. Expected: all directly related verifiers PASS and accepted/cache/knowledge fingerprints remain unchanged.

- [ ] **Step 4: Review the full diff**

Confirm no API key, full webpage, Pilot/canary directory, runtime Ready Pool, accepted/cache/knowledge data, GitHub Actions, DeepSeek, Feed refactor, or absolute local path is included.

### Task 7: Create the one requested commit

**Files:**
- Stage only the reviewed implementation, formal seed, verifiers, and this plan.

- [ ] **Step 1: Run staged checks**

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Expected: only in-scope files, no deletions, no whitespace errors.

- [ ] **Step 2: Commit once**

```powershell
git commit -m "feat(route-v2): honor required cities and expand japan ready coverage"
```

- [ ] **Step 3: Confirm final state**

Run HEAD/parent/show/status commands. Expected: parent `3259afc`, one new commit, clean worktree, same branch, and no push, PR, tag, amend, rebase, or squash.

## Implementation outcome

- The parser uses exact catalog aliases and preserves explicit city occurrence order.
- Flexible Candidate generation keeps all required cities and offers deterministic nearby insertion variants; fixed Candidates keep the required sequence as an exact prefix.
- The minimum publishable evidence path uses the official JNTO Kansai itinerary for directed `Kyoto -> Nara` (64 minutes) and `Nara -> Osaka` (63 minutes). It does not infer `Kyoto -> Osaka` or either reverse direction.
- Existing formal seeds can only be replaced after promotion reports the content conflict and an operator explicitly supplies `--accept-update`; a repeated promotion is unchanged.
- Formal evidence now contains 8 directed route legs and 6 season records, with promoted evidence hash `dc117b379108d4e33a26468c40654e817a5a883405175fd242de00d86e3b26cf`.
- `scripts/verify-route-v2-japan-multi-city-ready-route.mjs` proves the real flexible route `Tokyo -> Kyoto -> Nara -> Osaka` is ready for display in an isolated Ready Pool, while fixed `Tokyo -> Kyoto -> Osaka` remains blocked by the missing directed leg.
