# Route V2 Semantic Intent Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three PR #18 hard-constraint bypasses without changing Route V2 product behavior or formal assets.

**Architecture:** Keep `validateNormalizedRouteIntent()` as the only canonical RouteIntent validator, add one Candidate-to-snapshot consistency check around that canonical model, and make the publication gate read only the validated Candidate RouteIntent. EvidenceBundle standalone validation will require a supported RouteIntent fingerprint/version, while Cache Baseline V2 will continue to reuse production validators against isolated cache copies.

**Tech Stack:** Node.js ESM, deterministic SHA-256 RouteIntent fingerprints, JSON/JSONL sidecar stores, assertion-based verifier scripts.

---

### Task 1: Lock the semantic RouteIntent state machine

**Files:**
- Modify: `src/lib/routes/route-intent-model.mjs`
- Test: `scripts/verify-route-v2-route-intent-model.mjs`
- Test: `scripts/verify-route-v2-malformed-route-intent.mjs`

- [ ] **Step 1: Add failing semantic consistency cases**

Add cases that clone a valid normalized RouteIntent and assert structured rejection for:

```js
[
  ["single-month-empty", { timeType: "single-month", months: { state: "unspecified", values: [] } }],
  ["single-month-multiple", { timeType: "single-month", months: { state: "provided", values: [2, 3] } }],
  ["season-only-empty", { timeType: "season-only", season: { state: "explicit-empty", value: "" } }],
  ["unspecified-with-month", { timeType: "unspecified", months: { state: "provided", values: [2] } }],
]
```

Each case must return `valid=false`, `reasonCode="route-intent-schema-invalid"`, a violation with `code="route-intent-semantic-invalid"`, and a non-empty field path without throwing.

- [ ] **Step 2: Run the focused verifiers and confirm failure**

Run:

```bash
node scripts/verify-route-v2-route-intent-model.mjs
node scripts/verify-route-v2-malformed-route-intent.mjs
```

Expected before implementation: at least one semantic contradiction is accepted.

- [ ] **Step 3: Implement the semantic state machine in the canonical validator**

Add a helper used only from `validateNormalizedRouteIntent()`:

```js
function semanticViolation(path, expected, value) {
  return schemaViolation(path, expected, value, "route-intent-semantic-invalid");
}
```

Validate these canonical relationships:

```text
single-month => months.state=provided, one unique month, no season
month-range  => months.state=provided, at least two unique months, no season
season-only  => season.state=provided with a non-empty value, no months
unspecified  => no months, no season, evidenceStatus.time=not-requested
invalid      => invalidTime=true, evidenceStatus.time=invalid, and a structurally invalid/empty time condition
```

Also reject `invalid-time-intent` when time is otherwise a valid request, and reject `insufficient-intent` when a destination, duration, valid month, or season condition is available.

- [ ] **Step 4: Re-run focused verifiers**

Expected: both scripts PASS and every semantic contradiction reports `route-intent-semantic-invalid`.

### Task 2: Make the normalized Candidate RouteIntent authoritative

**Files:**
- Modify: `src/lib/routes/route-candidate-pool.mjs`
- Modify: `src/lib/routes/route-publication-gate.mjs`
- Test: `scripts/verify-route-v2-minimal-candidate-selection.mjs`
- Test: `scripts/verify-route-v2-publication-gate.mjs`

- [ ] **Step 1: Add a failing Candidate snapshot tamper test**

Build a valid February Candidate, then replace only:

```js
tampered.inputIntentSnapshot.timeIntent = {
  type: "unspecified",
  months: [],
  season: null,
};
```

Assert that Candidate validation fails and that the publication gate remains blocked even when all other evidence fixtures are ready.

- [ ] **Step 2: Run Candidate and publication verifiers and confirm failure**

Run:

```bash
node scripts/verify-route-v2-minimal-candidate-selection.mjs
node scripts/verify-route-v2-publication-gate.mjs
```

- [ ] **Step 3: Validate the Candidate snapshot against the canonical intent**

For V2 Candidates with a RouteIntent envelope:

```js
const snapshotIntent = candidate.inputIntentSnapshot?.normalizedRouteIntent;
const snapshotValidation = validateNormalizedRouteIntent(snapshotIntent);
const snapshotFingerprint = snapshotValidation.valid
  ? createRouteIntentFingerprint(snapshotIntent)
  : null;
```

Require snapshot schema validity, supported fingerprint version, recomputed fingerprint equality, and equality with `candidate.normalizedRouteIntent`. Treat a claimed-but-damaged snapshot as invalid rather than legacy.

- [ ] **Step 4: Make publication read the canonical hard constraints**

At the start of `evaluateRouteV2Publication()`, require `validateRouteCandidate(selectedCandidate).accepted === true`. Then read:

```js
const hardConstraints = selectedCandidate.normalizedRouteIntent.hardConstraints;
const requestedMonths = hardConstraints.months.state === "provided"
  ? hardConstraints.months.values
  : [];
```

Do not read publication constraints from `inputIntentSnapshot`.

- [ ] **Step 5: Re-run Candidate and publication verifiers**

Expected: tampered snapshots are rejected; legal Candidate fixtures and publication outcomes remain unchanged.

### Task 3: Require standalone EvidenceBundle RouteIntent linkage

**Files:**
- Modify: `src/lib/routes/evidence-bundle-schema.mjs`
- Test: `scripts/verify-route-v2-evidence-3a-foundation.mjs`
- Test: `scripts/verify-route-v2-publication-gate.mjs`

- [ ] **Step 1: Add failing standalone and expected-context tests**

Assert rejection for empty, null, malformed, and unsupported fingerprint/version values, plus a Candidate fingerprint mismatch.

- [ ] **Step 2: Run Evidence verifiers and confirm failure**

Run:

```bash
node scripts/verify-route-v2-evidence-3a-foundation.mjs
node scripts/verify-route-v2-publication-gate.mjs
```

- [ ] **Step 3: Implement standalone linkage validation**

Require:

```js
bundle.routeIntentFingerprintVersion === ROUTE_INTENT_FINGERPRINT_VERSION
/^rif-v1-[a-f0-9]{64}$/u.test(bundle.routeIntentFingerprint)
```

When an expected Candidate/route/trace is supplied, require exact version, fingerprint, Candidate ID, route ID, and trace ID equality.

- [ ] **Step 4: Re-run Evidence verifiers**

Expected: all malformed associations fail; all existing valid lifecycle fixtures pass.

### Task 4: Deepen Cache Baseline V2 and generative tests

**Files:**
- Modify: `src/lib/routes/cache-baseline-v2.mjs`
- Modify: `scripts/verify-route-v2-cache-baseline-v2.mjs`
- Modify: `scripts/verify-route-v2-intent-generative.mjs`
- Modify: `scripts/verify-route-v2-intent-mutations.mjs`

- [ ] **Step 1: Add isolated Cache corruption fixtures**

Use only the OS temporary cache copy to inject:

```text
RouteIntent semantic contradiction
Candidate snapshot/canonical mismatch
EvidenceBundle empty or unsupported fingerprint/version
EvidenceBundle/Candidate fingerprint mismatch where both records exist
```

Assert deterministic errors contain the file, record index, reason code, and field path.

- [ ] **Step 2: Add property/fuzz cross-field mutations**

Generate type-correct but semantically invalid RouteIntents, Candidate snapshot divergence, and truncated Evidence associations. Assert validators never throw and always reject.

- [ ] **Step 3: Add six mutation sentinels**

Add named kills for single-month cardinality, unspecified-with-month, publication snapshot source, snapshot consistency, empty Evidence fingerprint, and missing expected-independent fingerprint version. Require 100% mutation score.

- [ ] **Step 4: Run the four focused verifiers**

Expected: all PASS, formal cache unchanged.

### Task 5: Compatibility, performance, browser, and asset verification

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run syntax and complete requested verifier matrix**

Run `node --check` for every modified JS/MJS file, all focused RouteIntent/Candidate/Evidence/Cache tests, fallback/Search/Planner/Feed/Detail tests, comprehensive prelaunch, performance verifier, and `git diff --check`.

- [ ] **Step 2: Verify assets before and after**

Record Accepted SHA-256, Cache file count/bytes/immutable/runtime audit, and Knowledge file count/bytes. Assert byte-for-byte equality before and after.

- [ ] **Step 3: Run local-only browser checks**

Verify Japan 7 days, February Japan 7 days, winter Japan 7 days, four-city one-day conflict, Feed, and Detail. Require zero console errors/warnings and zero external requests.

### Task 6: Review, commit, push, and update PR #18

**Files:**
- Modify only the production modules, permanent verifiers, and this implementation plan.

- [ ] **Step 1: Review the complete diff and whitespace**

Confirm no formal assets, cache data, knowledge data, absolute paths, secrets, debug logs, unrelated features, or generated test data are present.

- [ ] **Step 2: Stage explicit files and verify staged diff**

Run:

```bash
git diff --cached --check
git diff --cached --name-status
git diff --cached --stat
```

- [ ] **Step 3: Create one commit**

```bash
git commit -m "fix(route-v2): enforce semantic intent consistency"
```

- [ ] **Step 4: Re-run key verifiers and push normally**

Run the focused semantic, Candidate, publication, Evidence, Cache, mutation, comprehensive, and performance verifiers, then:

```bash
git push origin codex/route-v2-knowledge-entity-layer-p1b-batch02
```

- [ ] **Step 5: Update PR #18 body**

Append a section describing the three closed blockers and the validation evidence. Do not merge, deploy, tag, force-push, or rewrite history.
