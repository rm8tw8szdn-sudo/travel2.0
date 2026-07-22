# Route V2 Evidence Persistence and Publication Gate MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote only verified Japan Pilot evidence into deployable seed files, consume it through the existing local evidence index, and allow only fully validated V2 routes into an isolated ready-for-display pool.

**Architecture:** Reuse the existing RouteLegEvidence, SeasonEvidence, atomic JSONL stores, Local Evidence Repository, Candidate Validator, DecisionTrace, EvidenceBundle, Planner, and Search metadata path. Add a deterministic promotion boundary, a read-only seed overlay beneath mutable runtime evidence, one publication gate, and one independent atomic ready pool; all runtime behavior remains behind default-off flags.

**Tech Stack:** Node.js ESM, built-in `fs`/`crypto`, atomic JSON/JSONL persistence, existing Route V2 schema validators and verifier scripts.

---

### Task 1: Promote reviewed Pilot evidence

**Files:**
- Create: `src/lib/routes/evidence-seed-promotion.mjs`
- Create: `scripts/promote-route-v2-evidence.mjs`
- Create: `scripts/verify-route-v2-evidence-promotion.mjs`
- Create: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Create: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Create: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] **Step 1: Write promotion verifier cases**

```js
assert.equal(dryRun.stats.written, 0);
assert.equal(result.stats.promoted, 12);
assert.equal(result.stats.rejected, 9);
assert.equal(repeat.stats.changed, 0);
```

- [ ] **Step 2: Implement strict promotion eligibility**

```js
const eligible = manifest.status === "resolved"
  && schemaValidation.accepted
  && record.sources.length > 0
  && record.conflicts.length === 0;
```

- [ ] **Step 3: Write all seed outputs through temporary files and stable ID sorting**

```js
records.sort((left, right) => left[idField].localeCompare(right[idField], "en"));
fs.writeFileSync(tempPath, payload, "utf8");
fs.renameSync(tempPath, targetPath);
```

- [ ] **Step 4: Run dry-run, real promotion, and no-diff repeat**

Run: `node scripts/promote-route-v2-evidence.mjs --source .route-v2-local-evidence-japan-pilot --country JP --dry-run`

Expected: 12 promotable records, zero writes.

Run: `node scripts/promote-route-v2-evidence.mjs --source .route-v2-local-evidence-japan-pilot --country JP --type all`

Expected: six directed route-leg records and six February season records written; needs-review/pending records excluded.

### Task 2: Overlay deployable seed and mutable runtime evidence

**Files:**
- Create: `src/lib/routes/local-evidence-seed-overlay.mjs`
- Modify: `src/lib/routes/local-evidence-repository.mjs`
- Modify: `src/lib/routes/index.mjs`
- Test: `scripts/verify-route-v2-evidence-promotion.mjs`

- [ ] **Step 1: Test missing, corrupt, invalid, duplicate, and older-runtime inputs**

```js
assert.equal(missingSeed.index.getRouteLeg(sample), null);
assert.equal(corruptSeed.index.stats().routeLegDiagnosticCount > 0, true);
assert.equal(olderRuntime.index.getRouteLeg(sample).contentHash, seedHash);
```

- [ ] **Step 2: Build one merged store adapter per evidence type**

```js
const records = mergeByStableId(seedSnapshot.records, runtimeSnapshot.records, {
  preferRuntime: (seed, runtime) => isNewerAndNotLowerQuality(seed, runtime),
});
```

- [ ] **Step 3: Point the existing Local Evidence Index at the merged read adapters**

```js
const evidenceIndex = createLocalEvidenceIndex({
  routeLegStore: mergedLegs,
  seasonStore: mergedSeasons,
  missingEvidenceStore: runtimeMissing,
});
```

- [ ] **Step 4: Verify one cold parse and stable hot queries**

Run: `node scripts/verify-route-v2-evidence-promotion.mjs`

Expected: seed records load once; repeated index reads do not increase parse counts.

### Task 3: Add one publication gate and an isolated ready pool

**Files:**
- Create: `src/lib/routes/route-publication-gate.mjs`
- Create: `src/lib/routes/route-v2-ready-pool.mjs`
- Create: `src/lib/routes/route-evidence-missing-report.mjs`
- Create: `scripts/verify-route-v2-publication-gate.mjs`
- Modify: `.gitignore`
- Modify: `src/lib/routes/index.mjs`

- [ ] **Step 1: Test each blocking gate condition**

```js
assert.equal(evaluate(validInput).publicationStatus, "ready-for-display");
assert.equal(evaluate({ ...validInput, decisionTrace: null }).publicationStatus, "blocked-incomplete");
assert.equal(evaluate({ ...validInput, validation: staleValidation }).publicationStatus, "blocked-needs-evidence");
```

- [ ] **Step 2: Implement fail-closed publication evaluation**

```js
if (validation.status !== "ready") return blockedStatus(validation.status);
if (!sameOrder(candidateOrder, routeOrder)) reasons.push("selected-candidate-route-order-mismatch");
if (!traceValidation.accepted) reasons.push("decision-trace-invalid");
```

- [ ] **Step 3: Implement atomic ready-pool publish, idempotency, and demotion**

```js
if (gate.publicationStatus !== "ready-for-display") return demote(routeRecord.id, gate.reasonCodes);
if (existing.publicationFingerprint === fingerprint) return { persisted: true, skipped: true };
```

- [ ] **Step 4: Aggregate high-frequency missing targets without using rejected routes**

```js
const acceptedValidations = validations.filter((item) => item.status !== "rejected");
return aggregateMissingTargets(acceptedValidations).sort(byCountThenTargetKey);
```

### Task 4: Attach the gate to the existing Planner/Search sidecar path

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `src/lib/routes/route-search-service.mjs`
- Test: `scripts/verify-route-v2-publication-gate.mjs`

- [ ] **Step 1: Add default-off flags and inject the existing sidecars**

```js
ROUTE_V2_PUBLICATION_GATE_ENABLED=false
ROUTE_V2_READY_POOL_ENABLED=false
```

- [ ] **Step 2: Evaluate only after Candidate, RouteRecord, Trace, and EvidenceBundle persistence agree**

```js
const gate = evaluateRouteForPublication({ routeRecord, selectedCandidate, decisionTrace, validation, evidenceBundle });
const readyPoolWrite = readyPool.applyEvaluation({ routeRecord, publication: gate });
```

- [ ] **Step 3: Preserve ready metadata in Search without writing accepted routes**

```js
const status = record.v2PublicationStatus === "ready-for-display"
  ? "ready-for-display"
  : "needs-review";
```

- [ ] **Step 4: Prove flag-off behavior is byte-for-byte compatible at the public record boundary**

Run: `node scripts/verify-route-v2-search-acceptance-gate.mjs`

Expected: legacy acceptance unchanged and V2 accepted writes remain zero.

### Task 5: Run Japan acceptance, faults, performance, regressions, and commit

**Files:**
- Test: `scripts/verify-route-v2-evidence-promotion.mjs`
- Test: `scripts/verify-route-v2-publication-gate.mjs`
- Review: every changed seed, implementation, verifier, plan, and export file.

- [ ] **Step 1: Run fixed Japan samples and report all three Candidate states**

```text
日本7天
2月去日本7天
日本2天
东京→京都
```

Expected: only complete, traceable, evidence-ready routes may enter the isolated ready pool; all others retain explicit block reasons.

- [ ] **Step 2: Run directed regression matrix**

Run all requested Evidence, Time Intent, Candidate/Trace, Search gate, Planner pipeline, Feed exhaustion smoke, and diff checks.

Expected: every in-scope verifier exits 0; Search/Planner/Feed network calls remain zero.

- [ ] **Step 3: Compare protected fingerprints**

```text
accepted repository hash unchanged
.route-v2-cache content fingerprint unchanged
data/knowledge content fingerprint unchanged
```

- [ ] **Step 4: Stage exact files and inspect the full staged diff**

Run: `git diff --cached --check`

Expected: no Pilot/canary directory, pending evidence, API key, full page body, accepted/cache/knowledge change, or unrelated UI/Feed rewrite.

- [ ] **Step 5: Create the single commit**

Run: `git commit -m "feat(route-v2): persist verified evidence and gate publication"`

Expected: exactly one new commit on the existing branch; no remote or history-rewriting operation.
