# Route V2 Default Runtime User-Path Fixes Implementation Plan

> **For Codex:** Execute this plan task by task, preserving the existing accepted-route, knowledge, cache, feed-cursor, and image-asset boundaries.

**Goal:** Make the real default server path honor the completed Route V2 intent/constraint pipeline, keep constraint-only destination suggestions usable, preserve search context through route details, and restore the existing local image fallback chain.

**Architecture:** Add a server-only runtime environment preset that enables completed offline Route V2 stages without changing module-level feature-flag defaults. Pass that environment explicitly through discovery, planner, and search. Keep online evidence and auto-accept disabled. Fix the existing destination-suggestion capacity handoff, route-detail query propagation, and local image fallback precedence without changing Feed pagination, Entity Layer data, Planner schemas, or knowledge assets.

**Tech Stack:** Node.js ES modules, existing Route V2 repository/planner/search services, browser JavaScript, project verifier scripts.

---

### Task 1: Add explicit default runtime configuration

**Files:**
- Create: `src/lib/routes/route-v2-runtime-environment.mjs`
- Modify: `src/lib/routes/index.mjs`
- Modify: `src/lib/routes/discovery.mjs`
- Modify: `server.js`
- Test: `scripts/verify-route-v2-default-runtime-user-paths.mjs`

**Steps:**
1. Add a failing verifier proving the default server runtime enables completed offline V2 stages while online evidence and generated-route auto-accept remain disabled.
2. Add a server-only runtime environment builder with explicit per-flag overrides and a master opt-out.
3. Pass the resulting environment explicitly through server, discovery, planner, and search construction.
4. Verify module-level feature-flag defaults remain unchanged when modules are used outside the server runtime.

### Task 2: Preserve short constraint-only destination suggestions

**Files:**
- Modify: `src/lib/routes/route-destination-suggestion.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs` only if required by the failing integration case
- Test: `scripts/verify-route-v2-default-runtime-user-paths.mjs`

**Steps:**
1. Add integration cases for `2`, `2月 2天`, `冬天`, and `7天`.
2. Ensure destination-suggestion candidate IDs, anchors, and route capacity use the same duration-aware limit.
3. Confirm two-day results do not expand into high-pressure multi-city routes and do not create month evidence for a bare number.
4. Keep invalid explicit months fail-closed and keep all V2 drafts outside accepted routes and Feed.

### Task 3: Preserve search context through route details

**Files:**
- Modify: `routes.js`
- Modify: `route-detail.js`
- Modify: `route-detail.html`
- Test: `scripts/verify-route-v2-default-runtime-user-paths.mjs`

**Steps:**
1. Add a failing verifier for detail URLs preserving `q` and `localOnly`.
2. Include the active search query in route-card detail links.
3. Build both detail-page return links from the preserved context.
4. Confirm returning from a detail page restores the same search instead of the default Feed.

### Task 4: Restore local image fallback precedence

**Files:**
- Modify: `routes.js`
- Test: `scripts/verify-route-v2-default-runtime-user-paths.mjs`

**Steps:**
1. Add a failing verifier showing a generic placeholder from the pilot resolver must not suppress an existing route, theme, or country fallback image.
2. Prefer a non-placeholder pilot mapping, then existing route/theme/country local mappings, then the shared placeholder.
3. Keep image failure independent from card insertion and preserve the six-card batching behavior.
4. Confirm no new external image provider is enabled and no knowledge/image datasets are expanded.

### Task 5: Run targeted and real-browser regression

**Files:**
- Modify: `scripts/verify-route-v2-prelaunch-comprehensive.mjs` only if its explicit test environment masks the real default-runtime path

**Steps:**
1. Run the new default-runtime user-path verifier.
2. Run Time Intent, Candidate/DecisionTrace, publication gate, Planner/Search, six-card Feed, Feed exhaustion, image, City UI, Runtime API, and Phase 3C regressions.
3. Start the project with the plain documented command and no V2-enabling environment overrides.
4. Exercise Amsterdam/Rotterdam, Bogotá/Medellín, Prague/Brno, Warsaw/Kraków, constraint-only queries, impossible constraints, route-detail return, and three Feed batches.
5. Record load/search timings, image/placeholder counts, duplicate/lost-card counts, loading completion, console output, and external requests.
6. Stop the server, confirm the port is released, and confirm accepted, cache, knowledge, and Git state have no unintended changes.
