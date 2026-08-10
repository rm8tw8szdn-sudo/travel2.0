# Route V2 PR #19 P1 Targeted Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining PR #19 P1 gaps without changing formal route, cache, knowledge, or evidence assets.

**Architecture:** Replace the broad unknown-Latin-token heuristic with destination-slot and alias-similarity evidence, then make explicit-theme compatibility consume only independently sourced route evidence. Keep request-derived presentation metadata available for display but provenance-tagged and ineligible for constraint proof. Strengthen the existing real Planner verifier and comprehensive prelaunch gate rather than creating a parallel test system.

**Tech Stack:** Node.js ES modules, filesystem-isolated verifier fixtures, existing RouteIntent/Search/Planner pipeline, browser-local HTTP verification, GitHub CLI.

---

### Task 1: Lock failing real-user search cases

**Files:**
- Modify: `scripts/verify-route-v2-pr19-p1-closures.mjs`
- Modify: `scripts/verify-route-v2-real-user-search-intent-regression.mjs`
- Modify: `scripts/fixtures/route-v2-real-user-search-intent-matrix.json`

- [ ] Add the five normal English preference queries and assert they reach destination suggestion without unresolved-destination.
- [ ] Add typo and explicit destination-slot controls, including `travel to Xxxxx for seven days`, and assert they stop or request confirmation.
- [ ] Run both verifiers and confirm the new cases fail against the current parser.

### Task 2: Implement destination-slot-aware unresolved parsing

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs`

- [ ] Extract Latin destination-slot candidates from `to`, `in`, `visit`, and `travel to` forms plus the established leading-destination form.
- [ ] Retain generic edit-distance confirmation for unique aliases and safe failure for ambiguous/unknown slot candidates.
- [ ] Ensure already matched Country/City/Region entities suppress unrelated residual prose instead of invalidating the intent.
- [ ] Run the focused intent verifiers and confirm typo and natural-language controls pass without country-specific branches.

### Task 3: Introduce trusted theme-evidence provenance

**Files:**
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify only if required by the shared contract: `src/lib/routes/route-search-service.mjs`

- [ ] Mark Planner/request-generated titles, tags, styles, and themes as request-derived or planner-derived presentation metadata.
- [ ] Define the accepted independent provenance set (`accepted-asset`, `knowledge-entity`, `verified-evidence`) in the shared invariant gate.
- [ ] Make explicit-theme validation ignore untrusted presentation metadata.
- [ ] Require independent island/loop/road-trip structure evidence; fail closed when current data cannot prove it.
- [ ] Apply the same validator to Candidate, fallback, and final Result paths through the existing invariant entry point.

### Task 4: Close theme and side-effect test blind spots

**Files:**
- Modify: `scripts/verify-route-v2-pr19-p1-closures.mjs`
- Modify if the 48-case fixture expands: `scripts/fixtures/route-v2-real-user-search-intent-matrix.json`

- [ ] Add Turkey island, loop, and road-trip plus Iceland loop and Japan family/hiking/honeymoon production-path cases.
- [ ] Assert final destination structure, trusted evidence provenance, and safe failure—not just labels or absence of an error code.
- [ ] Enable Candidate, Trace, Local Evidence, Evidence Validation, EvidenceBundle, Publication, and Ready Pool in isolated side-effect tests.
- [ ] Assert master-off, 0%, and excluded 50% cases leave every isolated store absent or byte-identical, while included cases exercise the intended stores.

### Task 5: Run full verification and browser acceptance

**Files:**
- No production file changes expected.

- [ ] Run focused P1, Real User Search Intent, Production Readiness Phase 1/2, Search V1, Planner pipeline, RouteIntent, fallback, Cache V2, performance, and comprehensive prelaunch verifiers.
- [ ] Run `node --check` for every modified JS/MJS file and `git diff --check`.
- [ ] Start the server with all writes redirected to an external temporary directory and all external Evidence/image providers disabled.
- [ ] Exercise the nine required browser queries and record visible status, cards, console output, and network domains.
- [ ] Stop the server and confirm its port is released.

### Task 6: Protect assets and publish the targeted fix

**Files:**
- Modify: PR #19 description only after all local checks pass.

- [ ] Compare Accepted, Immutable Cache, Knowledge 51-file inventory, Evidence seed, Runtime State, and Metrics state with the pre-change snapshot.
- [ ] Review the complete diff for scope, local paths, debug output, generated state, or formal asset changes.
- [ ] Stage only the targeted implementation, permanent regressions, and this plan; run cached whitespace and staged-diff checks.
- [ ] Create one non-amended commit, push normally to the existing PR branch, and update PR #19 with the two root causes, fixes, and verification evidence.
- [ ] Confirm PR remains open, unmerged, and ready for final targeted re-review.
