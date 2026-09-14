# Route V2 Sovereign Expansion Wave 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the 17 normal sovereign countries remaining in sealed Wave 4 while keeping three special-review entities and all unevidenced City/POI records outside production authority.

**Architecture:** Extend the existing reviewed-seed importer as Batch13 with four deterministic processing shards. Publish only the Country batch, retain City/POI and rejected records as candidate audit data, then lock counts, identity, readiness, special-review isolation, image authority, and historical truth in one Wave 4 verifier.

**Tech Stack:** Node.js 24 ESM scripts, JSON knowledge shards, existing Route V2 entity schemas and deterministic verifiers.

---

### Task 1: Seal the remaining-country split

**Files:**
- Create: `data/knowledge/seeds/knowledge-expansion-batch13-17-country.json`
- Create: `scripts/verify-sovereign-expansion-wave4.mjs`

- [ ] Assert the repository plan, sovereign policy, and production registry yield 17 normal Wave 4 codes and three special-review codes.
- [ ] Assert 175 published plus 20 remaining equals the declared universe of 195.
- [ ] Reject overlap, duplicate identities, and any special-review publication.

### Task 2: Generate reviewed candidate data

**Files:**
- Modify: `scripts/import-knowledge-expansion-batch05-wave.mjs`
- Create: `scripts/import-sovereign-expansion-wave4.mjs`
- Create: `data/knowledge/raw/knowledge-expansion-batch13-wave1.wikidata.json` through `wave4.wikidata.json`
- Create: corresponding Batch13 provenance, selection, conflicts, review queues, City, and POI candidate shards.

- [ ] Add Batch13 language and ISO metadata without changing previous batch semantics.
- [ ] Run each of the four fixed import waves exactly once through the existing fail-closed admission chain.
- [ ] Preserve genuine City/locality entities and leave Tuvalu Country-only rather than promoting an atoll or island.

### Task 3: Publish only Country authority

**Files:**
- Create: `data/knowledge/batches/countries.p1a-batch13.json`
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `scripts/verify-knowledge-coverage-semantics.mjs`
- Modify: `tests/browser/routes.spec.cjs`

- [ ] Add only the Batch13 Country file to production assets.
- [ ] Keep Batch46–49 City/POI shards absent from production lists.
- [ ] Assert 192 Country, 833 City, 3,963 POI, and 4,988 total entities with 74 Catalog-only countries.

### Task 4: Record readiness and validation

**Files:**
- Create: `scripts/report-sovereign-expansion-wave4.mjs`
- Create: `data/knowledge/reports/sovereign-expansion-wave4.json`
- Modify: `data/knowledge/reports/sovereign-country-expansion-plan.json`
- Create: `ROUTE_V2_SOVEREIGN_EXPANSION_WAVE4_VALIDATION.md`

- [ ] Set all 17 normal entries to `wave4-catalog-only-evidence-pending` with zero Evidence, Plannable, and Evidence-backed additions.
- [ ] Keep VA, PS, and KP in special review with no production or candidate authority.
- [ ] Record exact candidate, quarantine, image, historical, and persistent performance state.

### Task 5: Run deterministic validation

**Files:**
- Test: `scripts/verify-sovereign-expansion-wave4.mjs`

- [ ] Run Wave 4, coverage, semantic, POI admission, parser, Route, stress, image, historical, smoke, browser, syntax, and whitespace checks.
- [ ] Confirm production/manifest image references remain sealed and candidate/raw image metadata remains audit-only.
- [ ] Confirm no qualification or formal performance experiment is executed.
