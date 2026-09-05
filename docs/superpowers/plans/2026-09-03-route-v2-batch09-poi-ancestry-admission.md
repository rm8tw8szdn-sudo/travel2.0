# Route V2 Batch 09 POI Ancestry Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the POI semantic admission subclass-chain bypass without changing Knowledge scope, Route Engine behavior, image policy, performance policy, or sealed Batch 05–08 reports.

**Architecture:** One canonical module classifies normalized ancestry paths as travel-positive, broad-structural-only, operational/unsuitable, or unresolved. Import, publication audit, Semantic Gate, verification, and Core POI selection consume that same decision; reporting remains derived from the resulting published set.

**Tech Stack:** Node.js ES modules, JSON Knowledge manifests, repository verifiers, Git read-only validation.

---

### Task 1: Reproduce the subclass-chain bypass

**Files:**
- Test: `scripts/verify-knowledge-poi-ancestry-admission.mjs`

- [ ] **Step 1: Add production-style mutations**

```js
const cases = [
  ["building-subclass", [["Q900001", "Q41176"]], false],
  ["facility-subclass", [["Q900002", "Q13226383"]], false],
  ["building-multi-hop", [["Q900003", "Q900004", "Q41176"]], false],
  ["facility-multi-hop", [["Q900005", "Q900006", "Q13226383"]], false],
  ["museum-building", [["Q33506", "Q41176"]], true],
  ["monument-structure-building", [["Q4989906", "Q811979", "Q41176"]], true],
  ["broad-plus-attraction", [["Q900007", "Q41176"], ["Q570116"]], true],
];
```

- [ ] **Step 2: Run the verifier before implementation**

Run: `node scripts/verify-knowledge-poi-ancestry-admission.mjs`

Expected: non-zero exit because subclass-to-building and subclass-to-facility currently pass.

### Task 2: Implement the canonical ancestry evaluator

**Files:**
- Modify: `src/lib/routes/knowledge-poi-semantic-admission.mjs`

- [ ] **Step 1: Normalize paths deterministically and fail closed on malformed, cyclic, or over-depth paths**

```js
export function normalizePoiTypePaths(paths, { maximumDepth = 8 } = {}) {
  const valid = [];
  const invalid = [];
  for (const input of paths || []) {
    const path = Array.isArray(input) ? input.map(normalizeQid).filter(Boolean) : [];
    const repeated = new Set(path).size !== path.length;
    if (!path.length || repeated || path.length - 1 > maximumDepth) invalid.push(path);
    else valid.push(path);
  }
  return { valid, invalid };
}
```

- [ ] **Step 2: Classify every full ancestry path**

```js
function classifyPoiPath(path) {
  const travelPositive = path.some((qid) => travelPositiveTypes.has(qid));
  const operational = path.some((qid) => operationalTypes.has(qid));
  const broadStructural = path.some((qid) => broadStructuralRoots.has(qid));
  if (travelPositive) return "travel-positive";
  if (operational) return "operational-unsuitable";
  if (broadStructural) return "broad-structural-only";
  return "unresolved";
}
```

- [ ] **Step 3: Merge all paths with travel-positive semantics taking precedence**

```js
const accepted = pathClassifications.includes("travel-positive");
const classification = accepted
  ? "travel-positive"
  : pathClassifications.includes("operational-unsuitable")
    ? "operational-unsuitable"
    : pathClassifications.length > 0 && pathClassifications.every((value) => value === "broad-structural-only")
      ? "broad-structural-only"
      : "unsafe-unresolved";
```

- [ ] **Step 4: Export a policy adapter used by every consumer**

```js
export function evaluatePoiTypeIdsFromPolicy(instanceOfIds, typePolicy) {
  const paths = [...new Set(instanceOfIds || [])]
    .map((qid) => typePolicy.typeClassifications?.[normalizeQid(qid)]?.allowedKinds?.poi)
    .filter(Array.isArray);
  return evaluatePoiTypePaths(paths, { maximumDepth: typePolicy.maximumSubclassDepth });
}
```

### Task 3: Remove importer policy drift

**Files:**
- Modify: `scripts/import-knowledge-expansion-batch05-wave.mjs`

- [ ] **Step 1: Remove importer-owned POI operational and visitor root sets**

Delete `OPERATIONAL_POI_ROOTS`, `VISITOR_POI_ROOTS`, and `routePoiEligibility()`.

- [ ] **Step 2: Route POI production decisions through the canonical policy adapter**

```js
const poiAdmission = evaluatePoiTypeIdsFromPolicy(qids(entity, "P31"), productionTypePolicy);
if (!poiAdmission.accepted) reasons.push("production-poi-type-unconfirmed");
```

- [ ] **Step 3: Preserve city classification and non-semantic importer validation**

Run: `node --check scripts/import-knowledge-expansion-batch05-wave.mjs`

Expected: PASS without fetching or rewriting Knowledge.

### Task 4: Reconcile the complete POI candidate universe

**Files:**
- Modify: `scripts/reconcile-knowledge-poi-positive-admission.mjs`
- Modify: `data/knowledge/reports/knowledge-poi-positive-admission-audit.json`
- Modify only dynamically affected published POI, selection, provenance, image manifest, and Batch 09 report files.

- [ ] **Step 1: Build the candidate universe as a union**

```js
const candidates = new Map();
for (const entity of currentlyPublished) candidates.set(entity.entityId, entity);
for (const entity of previousAudit.quarantined || []) candidates.set(entity.entityId, entity);
for (const { entity } of recoveredBatch09) candidates.set(entity.entityId, entity);
```

- [ ] **Step 2: Reclassify every candidate with `evaluatePoiTypeIdsFromPolicy()`**

The audit must report total, travel-positive, broad-structural-only, operational/unsuitable, unresolved, published, and quarantined counts, including the multi-level broad-root subset.

- [ ] **Step 3: Remove every newly quarantined POI from published assets, selection, and provenance**

Run: `node scripts/reconcile-knowledge-poi-positive-admission.mjs`

Expected: PASS, with dynamic counts and `Q17624835` quarantined.

### Task 5: Align Semantic Gate and Core POI image selection

**Files:**
- Modify: `src/lib/routes/knowledge-semantic-gate.mjs`
- Modify: `scripts/build-route-v2-image-coverage-batch05.mjs`
- Modify: `scripts/verify-route-v2-image-debt-elimination.mjs`

- [ ] **Step 1: Replace Semantic Gate path assembly with `evaluatePoiTypeIdsFromPolicy()`**

```js
const poiAdmission = evaluatePoiTypeIdsFromPolicy(instanceOfIds, denormalizedTypePolicy);
```

- [ ] **Step 2: Restrict Core POI selection to the canonical admitted published set**

Before choosing each Core POI, evaluate its semantic type IDs through the shared policy adapter; quarantined or unresolved POIs must never enter `manifest.pois`.

- [ ] **Step 3: Rebuild image coverage dynamically only if the published POI set changes**

Run: `node scripts/verify-route-v2-image-debt-elimination.mjs`

Expected: PASS with zero quarantined Core POI references and `invalidMapping = 0`.

### Task 6: Add ancestry and cross-consumer release gates

**Files:**
- Create: `scripts/verify-knowledge-poi-ancestry-admission.mjs`
- Create: `scripts/verify-knowledge-poi-policy-consistency.mjs`
- Modify: `scripts/verify-knowledge-poi-positive-admission.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Test the eight required ancestry mutations**

Also assert cyclic paths fail closed and do not loop.

- [ ] **Step 2: Audit all multi-level paths ending at structural roots**

The verifier derives the set from `knowledge-semantic-type-policy.json` and checks every path with the canonical evaluator; no fixed expected total is hard-coded.

- [ ] **Step 3: Compare importer, Semantic Gate, audit, verifier, and Core POI decisions**

Each adapter must return the same `accepted` value and classification for the seven required policy-drift cases.

- [ ] **Step 4: Register both new verifiers as mandatory static stages**

```js
{ name: "knowledge-poi-ancestry-admission", relativePath: "scripts/verify-knowledge-poi-ancestry-admission.mjs", phase: "static" }
{ name: "knowledge-poi-policy-consistency", relativePath: "scripts/verify-knowledge-poi-policy-consistency.mjs", phase: "static" }
```

- [ ] **Step 5: Inject non-zero exits for both stages in failure propagation**

Run: `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

Expected: PASS, proving both new stages block comprehensive.

### Task 7: Run bounded final validation

**Files:**
- Verify only; do not commit, push, merge, deploy, tag, release, or operate on stash.

- [ ] **Step 1: Run semantic and policy gates**

Run:

```text
node scripts/verify-knowledge-poi-ancestry-admission.mjs
node scripts/verify-knowledge-poi-policy-consistency.mjs
node scripts/verify-knowledge-poi-positive-admission.mjs
node scripts/verify-knowledge-coverage-semantics.mjs
node scripts/verify-knowledge-expansion-batch09-semantic-adversarial.mjs
```

Expected: PASS with dynamic published/quarantine counts.

- [ ] **Step 2: Run consumption and image linkage**

Run:

```text
node scripts/verify-knowledge-expansion-batch09-route-consumption.mjs
node scripts/verify-route-v2-image-debt-elimination.mjs
node scripts/verify-route-v2-image-coverage-batch05.mjs
```

Expected: all Batch 09 countries remain consumable, quarantined references are zero, and image counts match the admitted set.

- [ ] **Step 3: Run report and sealed-history regression**

Run:

```text
node scripts/verify-historical-knowledge-reports-immutable.mjs
node scripts/verify-knowledge-expansion-batch09-report-consistency.mjs
```

Expected: Batch 05–08 hashes and four historical mutations remain protected; Batch 09 report stays dynamic.

- [ ] **Step 4: Run release wiring and syntax checks**

Run:

```text
node scripts/verify-route-v2-comprehensive-failure-propagation.mjs
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
node --check <each changed .mjs file>
git diff --check
git lfs fsck
```

Expected: all functional mandatory stages pass; performance is recorded once without changing its `<0.25ms` contract.

- [ ] **Step 5: Confirm protected state**

Verify Accepted, Formal Evidence, Immutable aggregate, Cache 331, Runtime State 329, Metrics 0, staged 0, and unchanged `stash@{0}` message.
