# Route V2 Knowledge Expansion Multi-Country Batch 03 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deepen Italy, France, Spain and South Korea with verified City, POI, directed transport and objective month-risk knowledge while leaving the frozen Route V2 engine and formal runtime assets untouched.

**Architecture:** Reuse the existing three-type Knowledge Entity Layer and local Evidence schemas. A shared deterministic importer resolves curated English Wikipedia titles through Wikidata, emits one additive asset set per country, isolates unsupported regional destinations and unresolved records, and stops after any failing country verifier. Evidence is appended through one country-scoped atomic importer using official operators or government sources only.

**Tech Stack:** Node.js ESM, Wikidata Action API, JSON/JSONL assets, existing Entity Layer and Evidence schemas, SHA-256 stable IDs, isolated local browser acceptance.

---

### Task 1: Freeze the mixed-worktree boundary

**Files:**
- Read: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Read: `data/route-v2/evidence-seed/evidence-seed-manifest.json`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH03_AUDIT.md`

- [x] Record all current modified and untracked paths and classify PR #19, Batch 01, Batch 02, prior UI and Batch 03 ownership.
- [x] Record Accepted, Immutable Cache, Runtime State and formal Knowledge baselines.
- [x] Confirm staged is zero and that RouteIntent, Search, Planner, Candidate, Publication, Runtime and Production Readiness files are read-only for Batch 03.
- [x] Record that the schema supports only Country, City and POI; route non-city regions to review rather than changing the schema.

### Task 2: Add the shared country-scoped importer and verifier

**Files:**
- Create: `data/knowledge/seeds/knowledge-expansion-batch03-multi-country.json`
- Create: `scripts/import-knowledge-expansion-batch03-country.mjs`
- Create: `scripts/import-knowledge-expansion-batch03-evidence.mjs`
- Create: `scripts/verify-knowledge-expansion-batch03-country.mjs`

- [x] Define `IT`, `FR`, `ES` and `KR` seed sections with country entity ID, deterministic output batch number, curated City titles, travel-value POI targets and explicit regional review candidates.
- [x] Resolve titles in batches with `wbgetentities`, require stable QIDs and coordinates, reuse existing entities by QID, and never publish fallback search guesses.
- [x] Atomically write raw, City, POI, provenance, conflict, review and selection files for exactly one `--country` argument.
- [x] Make the verifier reject duplicate IDs/QIDs, orphans, conflicting parents, unresolved published entities, undersized POI tiers, subjective season claims and missing reverse transport records.

### Task 3: Batch 03A Italy

**Files:**
- Create: `data/knowledge/batches/cities.p1b-batch05.json`
- Create: `data/knowledge/batches/pois.p1b-batch05.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch03a-italy.wikidata.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch03a.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch03a.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch03a.json`
- Create: `data/knowledge/batches/selection.p1b-batch05.json`
- Modify: `data/route-v2/evidence-seed/*.json*`

- [x] Reuse Rome and Florence; publish verified Venice, Milan, Naples, Bologna, Pisa, Verona, Turin, Siena, Como, Palermo and Catania City entities.
- [x] Isolate Lake Como, Cinque Terre, Amalfi Coast and Dolomites because the current schema cannot represent regions without pretending they are cities.
- [x] Publish real QID-backed POIs using minimum bands of 15 for Rome, 8 for major tourism cities and 5 for ordinary cities.
- [x] Add separate directed records for every supported reverse pair in the Italy backbone using official Trenitalia/Italo/local operator sources; leave unsupported durations and frequency unknown.
- [x] Add only official heat, flood, wildfire, snow or closure month facts with `suitabilityStatus=unknown`.
- [x] Run `node scripts/verify-knowledge-expansion-batch03-country.mjs --country IT`; stop on any failure.

### Task 4: Batch 03B France

**Files:**
- Create: `data/knowledge/batches/cities.p1b-batch06.json`
- Create: `data/knowledge/batches/pois.p1b-batch06.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch03b-france.wikidata.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch03b.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch03b.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch03b.json`
- Create: `data/knowledge/batches/selection.p1b-batch06.json`

- [x] Reuse Paris and Lyon; publish verified Nice, Marseille, Bordeaux, Strasbourg, Toulouse, Avignon, Annecy, Colmar, Cannes, Aix-en-Provence, Mont-Saint-Michel and Chamonix localities.
- [x] Isolate Loire Valley and Provence as unsupported regional entities.
- [x] Publish real QID-backed POIs with Paris at world-city depth and major tourism cities at 8 or more.
- [x] Add bidirectional official SNCF/local-operator corridor Evidence and objective M茅t茅o-France/official closure month risks.
- [x] Run `node scripts/verify-knowledge-expansion-batch03-country.mjs --country FR`; stop on any failure.

### Task 5: Batch 03C Spain

**Files:**
- Create: `data/knowledge/batches/cities.p1b-batch07.json`
- Create: `data/knowledge/batches/pois.p1b-batch07.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch03c-spain.wikidata.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch03c.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch03c.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch03c.json`
- Create: `data/knowledge/batches/selection.p1b-batch07.json`

- [x] Reuse Madrid and Barcelona; publish verified Seville, Granada, Valencia, M谩laga, C贸rdoba, Bilbao, San Sebasti谩n, Toledo, Salamanca, Santiago de Compostela and Ronda City entities.
- [x] Isolate Mallorca, Tenerife and Ibiza as island entities unsupported by the City schema.
- [x] Publish real QID-backed POIs with Madrid/Barcelona at world-city depth and Seville/Granada/Valencia at major-tourism depth.
- [x] Add bidirectional Renfe/local operator or official air/ferry Evidence and objective AEMET/official closure month risks.
- [x] Run `node scripts/verify-knowledge-expansion-batch03-country.mjs --country ES`; stop on any failure.

### Task 6: Batch 03D South Korea

**Files:**
- Create: `data/knowledge/batches/cities.p1b-batch08.json`
- Create: `data/knowledge/batches/pois.p1b-batch08.json`
- Create: `data/knowledge/raw/knowledge-expansion-batch03d-south-korea.wikidata.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch03d.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch03d.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch03d.json`
- Create: `data/knowledge/batches/selection.p1b-batch08.json`

- [x] Reuse Seoul and Busan; publish verified Jeju City, Gyeongju, Incheon, Suwon, Jeonju, Daegu, Gangneung, Sokcho, Andong, Yeosu and Tongyeong entities.
- [x] Isolate Pyeongchang county; keep Jeju City distinct from Jeju Island/province in aliases and review output.
- [x] Publish real QID-backed POIs with Seoul at world-city depth and Busan/Jeju/Gyeongju at major-tourism depth.
- [x] Reuse the existing Seoul鈫擝usan Evidence by stable ID and add only missing official Korail, ferry, airline or local-operator directed pairs.
- [x] Add objective KMA/government closure or disruption month facts only.
- [x] Run `node scripts/verify-knowledge-expansion-batch03-country.mjs --country KR`; stop on any failure.

### Task 7: Publish cumulative assets and update coverage

**Files:**
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-p1b-batch02.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`
- Modify: `scripts/verify-city-detail-knowledge-entity-layer-p1b-batch01.mjs`
- Modify: `scripts/verify-route-v2-evidence-promotion.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_COVERAGE_DASHBOARD_BATCH03.md`

- [x] Register only batches 05-08 and update exact cumulative totals after all four country verifiers pass.
- [x] Compute Country, City, POI, directed Evidence, risk-month Evidence, Accepted route inventory, Evidence link rate, maximum reliable duration and a documented deterministic coverage score for the ten requested countries.
- [x] Run cumulative Entity Layer, Runtime API, Planner integration, Evidence promotion, Candidate Evidence validation, Planner, Search V1, City UI and six-card feed tests.

### Task 8: Isolated browser acceptance and final boundary audit

**Files:**
- Update: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH03_AUDIT.md`

- [x] Start the local server with Search, Candidate, Trace, Evidence, Ready Pool and metrics redirected to a temporary directory.
- [x] Run all specified Italy, France, Spain and South Korea searches through the visible UI and record route status, country boundary, duration, City/POI depth, images and detail state.
- [x] Confirm console warnings/errors and external runtime Evidence/image requests are zero; record the frozen detail success-plus-404 defect as blocking display evidence if still present.
- [x] Run Cache Baseline V2, `node --check` on all Batch 03 JS/MJS, `git diff --check` and `git diff --cached --check`.
- [x] Recheck formal Accepted, Immutable Cache, Runtime State, Metrics and formal Knowledge; stop the local server.
- [x] Leave every change unstaged and uncommitted; do not push, create a PR, tag or deploy.
