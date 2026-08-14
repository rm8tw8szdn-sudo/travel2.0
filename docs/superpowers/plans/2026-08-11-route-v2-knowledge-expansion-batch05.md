# Route V2 Knowledge Expansion Batch 05 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish plannable, semantically validated Country/City/POI and local Evidence depth for the 20 requested countries in four independently verified waves without changing the frozen Route Engine.

**Architecture:** A Batch 05 seed defines the exact country and city scope, city size tiers, regional exclusions, evidence skeletons, and official sources. A wave importer resolves exact English Wikipedia titles to Wikidata, rejects unresolved or semantically invalid entities before publication, discovers nearby Wikipedia-backed POIs in bulk, validates P17/P31/P279/coordinates/distance, and writes wave-scoped assets plus auditable review queues. Separate evidence and verification scripts append only validated directed transport and objective month-risk records, update the semantic type policy and coverage dashboard, and run every test against isolated runtime paths.

**Tech Stack:** Node.js ESM, Wikimedia/Wikidata Action APIs, existing Route V2 Knowledge Entity Layer schemas, Knowledge Semantic Gate, JSON/JSONL, local official-source Evidence schemas, browser E2E, Git.

---

### Task 1: Freeze the baseline and define the 20-country contract

**Files:**
- Create: `data/knowledge/seeds/knowledge-expansion-batch05-20-country.json`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_AUDIT.md`
- Read: `.route-v2-cache/accepted-routes.json`
- Read: `.route-v2-cache/route-evidence.json`
- Read: `route-v2-cache-manifest-v2.json`

- [ ] Record branch `codex/route-v2-knowledge-expansion-batch05`, base `05ba9a48b13b9bc913cf04a24e437cf0163813e4`, Accepted SHA-256 `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, immutable aggregate `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, formal Evidence SHA-256 `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, Cache `331`, Runtime State `329`, Metrics absent, and unchanged `stash@{0}` message.
- [ ] Encode all 20 countries, the 168 requested city titles, city tiers (`world=20`, `core=12`, `standard=6`, `town=4` POI targets), non-City regional exclusions, six or more transport backbone pairs per country, four objective month-risk facts per country, and the requested cross-border links.
- [ ] Mark existing City QIDs only when already present in the published repository; resolve all other City IDs from exact Wikipedia titles and never use fuzzy search.

### Task 2: Implement fail-closed bulk candidate production

**Files:**
- Create: `scripts/import-knowledge-expansion-batch05-wave.mjs`
- Create: `data/knowledge/batches/countries.p1a-batch05.json`
- Create per wave: `data/knowledge/batches/cities.p1b-batch14.json` through `cities.p1b-batch17.json`
- Create per wave: `data/knowledge/batches/pois.p1b-batch14.json` through `pois.p1b-batch17.json`
- Create per wave: `selection`, `provenance`, `conflicts`, and `review-queue` Batch 05 JSON assets
- Create per country: `data/knowledge/raw/knowledge-expansion-batch05-<iso>.wikidata.json`

- [ ] Resolve City titles through `wbgetentities`, require coordinates, exact P17, and a P31/P279 path to the two approved settlement roots within depth 8; reject Region, Island, National Park, or unknown chains.
- [ ] Discover POIs through Wikipedia geosearch around each approved City, require an English Wikipedia-backed QID, coordinates, exact P17, a positive POI P31/P279 path within depth 8, no City path, no duplicate QID, and parent distance within the configured city radius.
- [ ] Rank eligible POIs by Wikipedia/Wikidata sitelink breadth and distance, publish at most the tier target, and record unresolved titles, missing P17/P31/coordinates, wrong-country, wrong-type, excessive-distance, and surplus eligible candidates in the wave review queue.
- [ ] Build the four missing Country entities (HU/HR/SE/SI) from exact Wikidata and ISO facts with complete provenance, while reusing the other 16 published Country identities.
- [ ] Write a wave atomically only after candidate Country/City/POI schemas, parent references, duplicate checks, and pre-publication semantic type checks pass.

### Task 3: Publish and validate Wave 1

**Files:**
- Create/modify: Batch `14` assets and Batch 05 metadata for GB/IE/CZ/HU/HR
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/knowledge/semantic/knowledge-semantic-type-policy.json`

- [ ] Run `node scripts/import-knowledge-expansion-batch05-wave.mjs --wave=1` and require all five countries to produce non-empty City and POI sets.
- [ ] Run the Batch 05 verifier for Wave 1, the Knowledge Semantic Gate, cumulative Entity Layer, Runtime API, Planner integration, Evidence validation, Search samples, and isolated browser 7/14-day samples.
- [ ] Stop only for P0/P1, unexplained large-scale Semantic Gate failure, or formal-asset mutation; otherwise record quarantined candidates and continue.

### Task 4: Publish and validate Wave 2

**Files:**
- Create/modify: Batch `15` assets and Batch 05 metadata for NO/SE/FI/DK/BE
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/knowledge/semantic/knowledge-semantic-type-policy.json`

- [ ] Run `node scripts/import-knowledge-expansion-batch05-wave.mjs --wave=2`.
- [ ] Apply the same pre-publication semantic, duplicate/orphan, Runtime API, Planner, Evidence, Search, and browser gates for Norway, Sweden, Finland, Denmark, and Belgium.
- [ ] Preserve Lofoten and Geiranger as review-only regional concepts rather than City entities.

### Task 5: Publish and validate Wave 3

**Files:**
- Create/modify: Batch `16` assets and Batch 05 metadata for PL/SI/VN/MY/ID
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/knowledge/semantic/knowledge-semantic-type-policy.json`

- [ ] Run `node scripts/import-knowledge-expansion-batch05-wave.mjs --wave=3`.
- [ ] Apply the same gates and keep Lake Bled, Ha Long Bay, Langkawi, and Bali out of the City collection.
- [ ] Verify objective tropical risk records retain `suitabilityStatus=unknown` and contain no recommendation language.

### Task 6: Publish and validate Wave 4

**Files:**
- Create/modify: Batch `17` assets and Batch 05 metadata for PH/CA/US/MX/PE
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `data/knowledge/semantic/knowledge-semantic-type-policy.json`

- [ ] Run `node scripts/import-knowledge-expansion-batch05-wave.mjs --wave=4`.
- [ ] Apply the same gates and keep Palawan, Boracay, Yosemite, Yellowstone, Grand Canyon, and Machu Picchu out of the City collection.
- [ ] Confirm Banff and Jasper resolve to settlement/municipality entities rather than their National Parks.

### Task 7: Add official transport and month-risk Evidence

**Files:**
- Create: `scripts/import-knowledge-expansion-batch05-evidence.mjs`
- Modify: `src/lib/routes/local-evidence-source-schema.mjs`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] Add only verified official rail, ferry, airline, transport-agency, tourism-board, or meteorological domains used by the seed.
- [ ] Emit independent directed IDs for both directions of each supported country backbone and cross-border pair; keep duration, transfer, and frequency unknown unless the official source provides stable reusable facts.
- [ ] Emit four objective month-risk records per country with official sources, `suitabilityStatus=unknown`, no best-month language, and no inferred recommendation.
- [ ] Validate every source, route-leg record, season record, reverse pair, manifest ID, and content hash before atomically replacing the three Evidence seed files.

### Task 8: Add the Batch 05 release verifier and coverage dashboard

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch05.mjs`
- Create: `scripts/report-knowledge-expansion-batch05.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_COVERAGE_DASHBOARD_BATCH05.md`
- Modify: cumulative Entity Layer, Runtime API, and Planner integration verifier expectations

- [ ] Verify all 20 Country identities, per-country City/POI counts, P31/P17 facts, parent distance, duplicate Entity/City/POI IDs, zero orphans/conflicts, review dispositions, official directed Evidence, objective risk Evidence, and unchanged protected assets.
- [ ] Report Catalog, Plannable, and Evidence-backed status independently with City/POI/Evidence counts, route consumption, Evidence-backed route ratio, reliable maximum duration, coverage score, and primary gaps.
- [ ] Generate deterministic totals from published assets rather than hard-coding dashboard percentages.

### Task 9: Run full regression and isolated browser acceptance

**Files:**
- Complete: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH05_AUDIT.md`

- [ ] Run the 20-country verifier, cumulative Entity Layer, Knowledge Semantic Gate and mutations, Runtime API, Planner Entity integration, Evidence validation, multi-city, multi-country, mixed constraints, Region/Island, single-city, Search V1, Planner, fallback, Cache Baseline V2, comprehensive prelaunch, performance, `node --check`, and `git diff --check`.
- [ ] Start an isolated local server and execute every specified 7/14-day query, the five requested 21-day high-frequency queries, and six cross-country samples; verify full countries, City/POI depth, no duplicate padding, stable Detail, console errors/warnings 0, and external Evidence/image requests 0.
- [ ] Recompute protected hashes/counts and confirm Accepted, Immutable Cache, Formal Evidence, Cache 331, Runtime State 329, Metrics absence, and stash message remain unchanged.
- [ ] Leave all Batch 05 changes unstaged and uncommitted; do not push, open or merge a PR, deploy, tag, release, or operate on the stash.

### Self-review

- [ ] Confirm the plan covers all 20 countries, all four Waves, pre-publication semantic rejection, transport/month-risk Evidence, browser queries, the expanded dashboard, full regressions, formal-asset protection, and the no-commit boundary.
- [ ] Confirm no SearchIntent, RouteIntent, Candidate, Planner core, invariant, fallback, Production Readiness, TravelState, server-security, Accepted, or Runtime Cache implementation file is in the planned write set.
