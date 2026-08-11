# Route V2 Final Adversarial Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently challenge the complete uncommitted Production Integrity Hardening diff and either close every reproducible P0/P1 integrity defect or return BLOCKED with evidence.

**Architecture:** Review from trust boundaries inward: first freeze Git and formal-asset baselines, then attack parser/intent/cardinality, state identity, Knowledge semantics, and server boundaries with production-path probes. Finish by requiring browser-visible behavior, mandatory-gate failure propagation, complete regression, performance bounds, and byte-level asset preservation.

**Tech Stack:** Node.js ESM/CommonJS, browser JavaScript, Git, JSON Knowledge assets, PowerShell orchestration, in-app Browser runtime.

---

### Task 1: Freeze review boundaries

**Files:**
- Inspect: repository Git metadata
- Inspect: `.route-v2-cache/accepted-routes.json`
- Inspect: `.route-v2-cache/route-evidence.json`

- [ ] **Step 1: Confirm branch, HEAD, staged state, and stash**

Run:
```powershell
git status --short --branch
git rev-parse HEAD
git diff --cached --name-only
git stash list -n 1
```

Expected: branch `codex/route-v2-pr20-adversarial-hardening`, HEAD `202d2a2d8f0b8854bcf0ce2e9831f67845c3cc69`, no staged paths, protected stash message unchanged.

- [ ] **Step 2: Capture formal asset baselines**

Run:
```powershell
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-knowledge-expansion-batch04-country.mjs --country=DE
```

Expected: Accepted SHA-256 `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, immutable Cache aggregate `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, formal Evidence SHA-256 `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, runtime file count 329.

### Task 2: Attack explicit-route hard constraints

**Files:**
- Inspect: `src/lib/routes/search-intent-parser.mjs`
- Inspect: `src/lib/routes/route-intent-model.mjs`
- Inspect: `src/lib/routes/route-candidate-builder.mjs`
- Inspect: `src/lib/routes/route-intent-invariant-gate.mjs`
- Inspect: `src/lib/routes/route-intent-model-oracle.mjs`
- Test: `scripts/verify-route-v2-single-city-hard-constraint.mjs`
- Test: `scripts/verify-route-v2-multi-city-hard-constraints.mjs`
- Test: `scripts/verify-route-v2-multi-country-hard-constraints.mjs`

- [ ] **Step 1: Run production-path constraint verifiers**

Run:
```powershell
node scripts/verify-route-v2-single-city-hard-constraint.mjs
node scripts/verify-route-v2-multi-city-hard-constraints.mjs
node scripts/verify-route-v2-multi-country-hard-constraints.mjs
```

Expected: every required city/country survives Candidate, Planner, fallback, final gate, and Oracle; fixed-order cases preserve order; impossible one-day cases fail closed.

- [ ] **Step 2: Probe delimiter and substring collisions**

Run:
```powershell
node scripts/verify-route-v2-real-user-search-intent-regression.mjs
node scripts/verify-route-v2-region-island-constraints.mjs
```

Expected: month words do not trigger short aliases, `Aix-en-Provence` remains a city, unknown spellings fail closed, and Region/Island tokens cannot erase explicit cities.

### Task 3: Attack Trip and Footprint identity continuity

**Files:**
- Inspect: `travel-state.js`
- Test: `scripts/verify-travel-state.mjs`
- Test: `scripts/verify-route-v2-cross-country-citywalk.mjs`

- [ ] **Step 1: Run stable-identity state transitions**

Run:
```powershell
node scripts/verify-travel-state.mjs
node scripts/verify-route-v2-cross-country-citywalk.mjs
```

Expected: Route V2 entity IDs and QIDs survive route snapshot, Trip main data, completion, deletion/recalculation, and Footprint deduplication; legacy city IDs remain compatible.

- [ ] **Step 2: Inspect state joins for display-name keys**

Run:
```powershell
rg -n "cityIds|cityQids|cityIdentities|canonicalName" travel-state.js
```

Expected: display names are presentation fields only; stable entity ID is primary and QID is retained for cross-layer verification.

### Task 4: Attack Knowledge semantic trust

**Files:**
- Inspect: `src/lib/routes/knowledge-semantic-gate.mjs`
- Inspect: `src/lib/routes/knowledge-stable-identity-migrations.mjs`
- Inspect: `data/knowledge/semantic/knowledge-semantic-exceptions.json`
- Test: `scripts/verify-knowledge-semantic-gate.mjs`
- Test: `scripts/verify-knowledge-entity-layer-p1b-batch02.mjs`

- [ ] **Step 1: Run semantic and cumulative gates**

Run:
```powershell
node scripts/verify-knowledge-semantic-gate.mjs
node scripts/verify-knowledge-entity-layer-p1b-batch02.mjs
```

Expected: all 1,099 entities pass; nonexistent QID, wrong name/country/type/coordinates/parent distance, exception-scope abuse, and random internal-ID drift all fail.

- [ ] **Step 2: Audit exception and migration scope**

Run:
```powershell
Get-Content data/knowledge/semantic/knowledge-semantic-exceptions.json
Get-Content src/lib/routes/knowledge-stable-identity-migrations.mjs
```

Expected: five semantic exceptions are bound to exact QID, entity ID, kind, and error code; only the four audited identity migrations bypass deterministic QID-derived IDs.

### Task 5: Attack server and media boundaries

**Files:**
- Inspect: `server-security.js`
- Inspect: `server.js`
- Inspect: `assets/route-city-placeholder.svg`
- Test: `scripts/verify-route-v2-server-security-boundaries.mjs`
- Test: `scripts/verify-route-v2-image-proxy-network-boundary.mjs`

- [ ] **Step 1: Run SSRF, path, body, and error tests**

Run:
```powershell
node scripts/verify-route-v2-server-security-boundaries.mjs
node scripts/verify-route-v2-image-proxy-network-boundary.mjs
```

Expected: private/loopback/link-local/metadata endpoints, redirect escapes, DNS-rebinding forms, non-image and oversized payloads fail closed; traversal and oversized request bodies return bounded 4xx errors without stacks.

- [ ] **Step 2: Verify neutral fallback media**

Run:
```powershell
node scripts/verify-route-v2-neutral-city-placeholder.mjs
```

Expected: unknown cities use a geography-neutral local placeholder and perform zero external image requests.

### Task 6: Verify real browser behavior

**Files:**
- Exercise: `routes.html`
- Exercise: `route-detail.html`
- Exercise: `trips.html`
- Exercise: `profile.html`

- [ ] **Step 1: Complete Route to Footprint flow**

Operate `Germany Austria 14 days`, add the result to a Trip, mark it completed, then open My Footprint.

Expected: two countries and six Knowledge cities remain visible and illuminated.

- [ ] **Step 2: Exercise adversarial searches**

Operate `Nara 7 days`, `Miyajima 7 days`, `Linz 7 days`, `Tokyo 7 days`, `Berlin Munich 7 days in December`, `Lake Como 7 days`, `Jappann 7 days`, and `Turkey island vacation 7 days`.

Expected: valid requests render correct entities; invalid or unsupported constraints fail closed; detail stays stable for five seconds; console errors/warnings and external Evidence/image requests remain zero.

### Task 7: Enforce the final release gate and preservation checks

**Files:**
- Test: `scripts/verify-route-v2-comprehensive-prelaunch.mjs`
- Test: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`
- Inspect: every modified/new `.js` and `.mjs`

- [ ] **Step 1: Run the complete mandatory gate**

Run:
```powershell
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
node scripts/verify-route-v2-comprehensive-failure-propagation.mjs
```

Expected: all 36 mandatory stages pass, injected nonzero stages block the aggregate, performance remains within configured bounds, and tests report isolated storage.

- [ ] **Step 2: Run syntax and diff checks**

Run `node --check` for every modified/new `.js` and `.mjs`, then:
```powershell
git diff --check
```

Expected: every syntax check and diff check passes.

- [ ] **Step 3: Reconfirm formal assets and Git boundary**

Run:
```powershell
git status --short --branch
git diff --cached --name-only
git stash list -n 1
```

Expected: staged count 0, no formal Metrics file, formal hashes/counts unchanged, protected stash unchanged, and all hardening work remains uncommitted on the current branch.

### Task 8: Seal the reviewed workspace into logical commits

**Files:**
- Commit 1: `travel-state.js`, `scripts/verify-travel-state.mjs`
- Commit 2: single-city/cardinality production files and focused verifiers
- Commit 3: Knowledge corrections, semantic gate, exact exceptions, identity migrations, and Knowledge verifiers
- Commit 4: `server.js`, `server-security.js`, and server/image-proxy boundary verifiers
- Commit 5: mixed city/country parser, intent, Candidate, invariant, Oracle, performance, and production-path verifier changes
- Commit 6: neutral placeholder assets and media verifiers
- Commit 7: verifier lifecycle, coverage semantics, prelaunch wiring, reports, and review plans

- [ ] **Step 1: Confirm every changed path belongs to categories A-I**

Run:
```powershell
git status --short
git diff --numstat
git ls-files --others --exclude-standard
```

Expected: 44 tracked paths and 18 untracked files, with no source-unknown or unrelated category J path.

- [ ] **Step 2: Run the defined pre-commit gate and browser smoke**

Run the Trip/Footprint, single-city, semantic Knowledge, server security, mixed/multi constraints, Region/Island, theme, fallback, Search V1, Planner, mutation, Cache Baseline V2, comprehensive 36-stage, syntax, and diff checks. Exercise the five user-specified browser paths against isolated writable storage.

Expected: every gate exits zero; browser console warnings/errors and external Evidence/image requests remain zero; formal assets and stash remain unchanged.

- [ ] **Step 3: Create dependency-safe commits**

Stage only the exact paths or hunks assigned to each commit. After every commit run `git diff --check` and the smallest verifier protecting that commit. Do not amend, rebase, squash, reset, clean, or touch stash state.

- [ ] **Step 4: Re-run final aggregate verification**

Run:
```powershell
node scripts/verify-route-v2-comprehensive-prelaunch.mjs
node scripts/verify-route-v2-cache-baseline-v2.mjs
node scripts/verify-travel-state.mjs
node scripts/verify-route-v2-single-city-hard-constraint.mjs
node scripts/verify-route-v2-multi-country-hard-constraints.mjs
```

Expected: 36/36 mandatory stages and all focused E2E checks pass with formal assets unchanged.

- [ ] **Step 5: Publish a ready-for-review pull request**

Push `codex/route-v2-pr20-adversarial-hardening` normally to `origin`, then create a non-draft PR targeting `main` titled `fix(route-v2): harden production integrity and knowledge semantics`. Confirm the PR head equals the final local commit and stop without merge, deploy, tag, release, or Batch 05 work.
