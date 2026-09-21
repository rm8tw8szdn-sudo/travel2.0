# Plannable Expansion Batch02 Entity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit all 73 Catalog-only Countries, deterministically select 12–16 mature candidates, admit only reviewed Destination and POI entities, and prepare a non-authoritative Evidence worklist without changing readiness.

**Architecture:** A single preparation coordinator derives discovery facts from published assets, candidate shards, readiness policy, Evidence seeds, and the image manifest. It applies fixed tier and selection rules, performs exact identity and binding checks, emits Batch02 production shards plus audit reports, and leaves the readiness policy untouched. A separate verifier reconstructs the authority boundary from production data and kills negative fixtures.

**Tech Stack:** Node.js ESM, JSON/JSONL knowledge assets, Route V2 published-asset registry, deterministic assertion-based verifiers.

---

### Task 1: Discovery inventory and deterministic selection

**Files:**
- Create: `scripts/prepare-plannable-expansion-batch02-entity-foundation.mjs`
- Create: `data/knowledge/reports/plannable-expansion-batch02-discovery.json`

- [ ] Read the exact Catalog-only partition from production readiness authority.
- [ ] Inventory published/candidate Destination and POI counts, quarantine, Evidence, risks, and image availability for all 73 Countries.
- [ ] Assign deterministic A/B/C/D tiers and compute the ranked initial selection.
- [ ] Apply the documented PG-to-TL replacement after per-Destination POI sufficiency review.

### Task 2: Entity admission and quarantine

**Files:**
- Create: `data/knowledge/batches/cities.p1b-batch51.json`
- Create: `data/knowledge/batches/pois.p1b-batch51.json`
- Create: `data/knowledge/batches/review-queue.plannable-expansion-batch02.json`
- Create: `data/knowledge/reports/plannable-expansion-batch02-entity-review.json`
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`

- [ ] Admit the reviewed City/Destination identities for the eight selected Countries without existing production depth.
- [ ] Admit travel-compatible POIs and retain every rejected candidate with its source entity and reason.
- [ ] Reject duplicate QIDs/entity IDs and invalid Country/Destination bindings before writing production shards.
- [ ] Generate directed segment and season-profile work units without creating Evidence.

### Task 3: Fail-closed verifier

**Files:**
- Create: `scripts/verify-plannable-expansion-batch02-entity-foundation.mjs`
- Modify: `tests/browser/routes.spec.cjs`
- Modify: `scripts/verify-sovereign-special-review.mjs`

- [ ] Reconstruct the selection and exact production counts independently of the report.
- [ ] Assert all selected Countries remain Catalog-only, Evidence-pending, non-Plannable, and non-Evidence-backed.
- [ ] Exercise negative fixtures for candidate leakage, quarantine leakage, wrong Country binding, duplicate identity, type confusion, homonym ambiguity, and caller/report promotion attempts.
- [ ] Verify the runtime registry includes only admitted Batch02 entities.

### Task 4: Validation and report

**Files:**
- Create: `PLANNABLE_EXPANSION_BATCH02_ENTITY_FOUNDATION_VALIDATION.md`

- [ ] Run Batch02, semantic, Route, stress, browser, Node, repository, historical, image, syntax, and whitespace validation.
- [ ] Record exact discovery tiers, selection replacement, admissions, quarantine, Evidence work units, and unchanged performance/protected state.
- [ ] Confirm no image baseline, Evidence, readiness, Batch01 sealed report, or performance asset changed.
