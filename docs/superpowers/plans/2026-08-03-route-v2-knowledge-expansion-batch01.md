# Route V2 Knowledge Expansion Batch 01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Country, ten Cities, thirty real POIs, twelve directed transport records, and bounded city-month risk evidence without changing Route V2 engine behavior.

**Architecture:** Reuse the existing versioned Knowledge Entity Layer assets, explicit published-asset registry, and Evidence seed schemas. Country/City/POI publication remains separate from transport and season evidence, and all browser/runtime verification writes to repository-external temporary directories.

**Tech Stack:** Node.js ESM, JSON/JSONL assets, Wikidata entity snapshots, official transport and government sources, existing Knowledge and Evidence verifiers.

---

### Task 1: Freeze scope and baselines

**Files:**
- Create: `docs/superpowers/plans/2026-08-03-route-v2-knowledge-expansion-batch01.md`
- Preserve: all pre-existing modified and untracked Route Engine files

- [ ] Record the current `git status`, Accepted hash, Immutable Cache aggregate, Runtime State snapshot, Knowledge file hashes, and Evidence seed hashes.
- [ ] Confirm the fixed entity scope: Iceland; Reykjavík, Vík í Mýrdal, Bangkok, Chiang Mai, Zürich, Lucerne, Auckland, Queenstown, Sydney, Melbourne.
- [ ] Confirm exactly three selected real POIs per City using the approved coverage-audit list.

### Task 2: Publish the Iceland Country and ten City Entities

**Files:**
- Create: `data/knowledge/raw/countries-p1a-batch04.wikidata.json`
- Create: `data/knowledge/batches/countries.p1a-batch04.json`
- Create: `data/knowledge/batches/provenance.p1a-batch04.json`
- Create: `data/knowledge/batches/conflicts.p1a-batch04.json`
- Create: `data/knowledge/batches/review-queue.p1a-batch04.json`
- Create: `data/knowledge/raw/cities-p1b-batch03.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch03.json`
- Create: `data/knowledge/batches/provenance.cities.p1b-batch03.json`
- Create: `data/knowledge/batches/conflicts.p1b-batch03.json`
- Create: `data/knowledge/batches/review-queue.p1b-batch03.json`

- [ ] Capture official Wikidata identifiers, multilingual names, aliases, coordinates, country relationships, and entity-type claims.
- [ ] Normalize with the existing entity schema and create deterministic typed entity IDs.
- [ ] Publish one Country and ten Cities with complete field provenance, zero duplicate QIDs, and zero orphan parents.

### Task 3: Publish thirty selected POIs

**Files:**
- Create: `data/knowledge/raw/pois-p1b-batch03-candidates.wikidata.json`
- Create: `data/knowledge/raw/pois-p1b-batch03-selection.json`
- Create: `data/knowledge/batches/pois.p1b-batch03.json`
- Create: `data/knowledge/batches/provenance.pois.p1b-batch03.json`

- [ ] Capture Wikidata identity and coordinates for the fixed three-POI selection under every new City.
- [ ] Reject generic regions, duplicate identities, missing coordinates, and parent-city mismatches.
- [ ] Publish exactly thirty POIs and keep candidate/selection provenance separate from canonical assets.

### Task 4: Register the new Knowledge assets

**Files:**
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Create: `scripts/verify-route-v2-knowledge-expansion-batch01.mjs`

- [ ] Add only the Batch04 Country, Batch03 City, and Batch03 POI files to the explicit published asset lists.
- [ ] Update expected totals to 51 Countries, 35 Cities, 105 POIs, 191 entities.
- [ ] Verify unique entity IDs/QIDs, valid parent references, deterministic ordering, defensive copies, zero network requests, and zero cache writes.

### Task 5: Add reusable transport and season evidence

**Files:**
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] Add both directions for Reykjavík–Vík, Bangkok–Chiang Mai, Zürich–Lucerne, Auckland–Queenstown, Sydney–Melbourne, and Seoul–Busan.
- [ ] Accept transport duration or feasibility only when an official source explicitly supports the field; keep unsupported transfer/frequency fields null or unknown.
- [ ] Add two operationally important month records per selected City only for documented closure, snow, flood, fire, heat, or transport risk; never add best-month or subjective suitability claims.
- [ ] Recompute deterministic evidence IDs, source IDs, content hashes, and the Evidence seed manifest.

### Task 6: Verify and audit coverage

**Files:**
- Create: `scripts/verify-route-v2-knowledge-expansion-batch01.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_COVERAGE_AUDIT_BATCH01.md`

- [ ] Run the Batch01 verifier and existing Country/City/POI, Entity Layer, Evidence, Runtime API, Planner, Search, Publication Gate, and Cache Baseline checks.
- [ ] Confirm Accepted, formal Cache, Runtime State, and all pre-existing Knowledge files remain byte-for-byte unchanged except the explicitly new Knowledge assets and Evidence seed files.
- [ ] Re-run the coverage audit and report which countries now have Country → City → POI → Route → Evidence coverage.

### Task 7: Real browser acceptance

**Files:**
- No production file changes.

- [ ] Start the application against repository-external temporary runtime stores.
- [ ] Search 日本14天、日本30天、冰岛7天、泰国10天、澳大利亚14天、新西兰14天 through the visible page.
- [ ] Record visible routes, destinations, POI depth, loading completion, Console errors/warnings, and external image/Evidence requests.
- [ ] Stop all test services and leave all Batch01 changes unstaged and uncommitted.
