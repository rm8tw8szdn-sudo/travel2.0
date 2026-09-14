# Route V2 Sovereign Special Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Publish VA, PS, and KP as reviewed Catalog-only Countries while preserving their identity distinctions, non-plannable status, and parser safety.

**Architecture:** A dedicated reviewed seed and deterministic publisher create one Country-only batch and finalize the current expansion plan. A semantic identity-policy file records relationships and rejected aliases that cannot be represented safely as ordinary Country aliases. One verifier exercises production registry, parser, authority, counts, history, and policy invariants.

**Tech Stack:** Node.js ES modules, JSON Knowledge Entity Layer assets, deterministic assertion scripts.

---

### Task 1: Lock reviewed identities and policy

**Files:**
- Create: `data/knowledge/seeds/sovereign-special-review-3-country.json`
- Create: `data/knowledge/semantic/sovereign-special-country-identity-policy.json`

- [x] Record VA as Vatican City/Q237/VA and Holy See/Q159583 only as a related identity.
- [x] Record PS as State of Palestine/Q219060/PS in Western Asia and exclude territory names from Country aliases.
- [x] Record KP as North Korea/Q423/KP with reviewed full-name aliases and exclude `Korea`.

### Task 2: Publish only Country entities

**Files:**
- Create: `scripts/publish-sovereign-special-review.mjs`
- Create: `data/knowledge/batches/countries.p1a-batch14.json`
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/knowledge/reports/sovereign-country-expansion-plan.json`
- Create: `data/knowledge/reports/sovereign-special-review.json`

- [x] Generate the three Country entities with required provenance and stable identities.
- [x] Add only the Country batch to the production registry.
- [x] Finalize special review as resolved with Catalog-only/Evidence-pending readiness.
- [x] Assert 195 Country, 833 City, 3,963 POI, and 4,991 total entities.

### Task 3: Add authoritative regressions

**Files:**
- Create: `scripts/verify-sovereign-special-review.mjs`
- Modify: `tests/browser/routes.spec.cjs`

- [x] Verify VA related identity is not an ordinary alias.
- [x] Verify PS territory labels do not grant Country authority.
- [x] Verify the full DPRK names win over the contained KR alias through the existing longest-span algorithm.
- [x] Verify lowercase ISO-derived aliases remain excluded.
- [x] Verify the three Countries have no production City, POI, Evidence, Plannable, or Evidence-backed authority.

### Task 4: Validate and document

**Files:**
- Create: `ROUTE_V2_SOVEREIGN_SPECIAL_REVIEW_VALIDATION.md`

- [x] Run the special-review verifier and semantic/count checks.
- [x] Run parser, Route, stress, smoke, browser, image, and historical deterministic validation.
- [x] Run syntax and whitespace checks.
- [x] Record the unchanged performance and protected-local-state facts.
