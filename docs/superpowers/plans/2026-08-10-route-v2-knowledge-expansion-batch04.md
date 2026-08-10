# Route V2 Knowledge Expansion Batch 04 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verified Country/City/POI, directed transport, objective month-risk, verifier, and deterministic coverage data for Germany, Austria, Portugal, Greece, and the Netherlands without changing the frozen Route V2 engine or formal runtime assets.

**Architecture:** Reuse the existing Country/City/POI Knowledge Entity Layer and local Evidence schemas. A Batch 04 country importer resolves curated English Wikipedia titles through Wikidata, reuses published entities by QID, emits one additive asset set per country, and isolates unsupported regional or island concepts; a separate Evidence importer appends official-source records with stable IDs and unknown timetable fields. Each country is published and verified in order, and processing stops immediately if its verifier fails.

**Tech Stack:** Node.js ESM, Wikidata Action API, JSON/JSONL assets, existing Knowledge Entity Layer and Evidence schemas, SHA-256 stable IDs, isolated local server and browser acceptance.

---

### Task 1: Preserve the stash and formal-asset boundary

**Files:**
- Read: `refs/stash`
- Read: `.route-v2-cache/accepted-routes.json`
- Read: `.route-v2-cache/route-evidence.json`
- Read: `route-v2-cache-manifest-v2.json`
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH04_AUDIT.md`

- [x] Audit all 14 tracked and 12 untracked stash files against `main`; classify byte-identical files as covered and inspect every stash-only line in differing files.
- [x] Confirm no independent effective stash content remains, leave `stash@{0}` untouched, and do not create `codex/recover-pre-pr19-local-work`.
- [x] Create `codex/route-v2-knowledge-expansion-batch04` at `17e28bba6eac61391ad04ba53cd6423d86387456`.
- [x] Record baseline Accepted SHA-256 `aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f`, immutable aggregate `61e243e0c0756d53513ab7205281f8c796eeb074317f484d08784cbc5fe9505c`, immutable Evidence SHA-256 `4bb9e7b702de1c9b981f0ed53a649632e2a7149bd7f2dabedfa120dcde13c376`, full Cache `331` files / `1,274,833,546` bytes, and Runtime State `329` files / `1,224,923,102` bytes / audit hash `9531bbcd1b9f88d099726ce39efb8f2da202a0487cb9ae211d7efdfe237a6bd7`.
- [ ] Keep Search, RouteIntent, Planner, Candidate, Runtime, Publication Gate, fallback, Production Readiness, Accepted, formal Cache, Runtime State, and formal Metrics read-only.

### Task 2: Define the Batch 04 importer and verifier contract

**Files:**
- Create: `data/knowledge/seeds/knowledge-expansion-batch04-multi-country.json`
- Create: `scripts/import-knowledge-expansion-batch04-country.mjs`
- Create: `scripts/import-knowledge-expansion-batch04-evidence.mjs`
- Create: `scripts/verify-knowledge-expansion-batch04-country.mjs`
- Modify: `src/lib/routes/local-evidence-source-schema.mjs`

- [ ] Add country sections `DE`, `AT`, `PT`, `GR`, and `NL` with batch numbers `09`–`13`, published Country entity IDs, curated City titles, exact POI targets, explicit QID overrides only when title resolution is ambiguous, and regional/island review candidates.
- [ ] Require every published City and POI to resolve to a stable `Q\d+` ID with coordinates; reject missing Cities, conflicting existing POI parents, duplicate selected QIDs, and fuzzy-search fallbacks.
- [ ] Emit raw snapshot, City, POI, selection, provenance, zero-conflict, and review assets atomically for exactly one `--country` argument.
- [ ] Add only the official operator, government, meteorological, or official tourism domains used by Batch 04 Evidence to the trusted-source registry.
- [ ] Make the country verifier enforce cumulative totals, duplicate Entity/City/POI IDs, parent integrity, exact country depth, target POI bands, zero conflicts/orphans, isolated candidate dispositions, directed reverse Evidence, objective risk-only month Evidence, and unchanged formal assets.
- [ ] Run `node --check` for all three Batch 04 scripts before importing data; expected result: all commands exit `0`.

### Task 3: Batch 04A Germany

**Files:**
- Create: `data/knowledge/raw/knowledge-expansion-batch04a-germany.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch09.json`
- Create: `data/knowledge/batches/pois.p1b-batch09.json`
- Create: `data/knowledge/batches/selection.p1b-batch09.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch04a-germany.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch04a-germany.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch04a-germany.json`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`

- [ ] Reuse Berlin and Munich; add Hamburg, Cologne, Frankfurt, Dresden, Nuremberg, Heidelberg, Rothenburg ob der Tauber, Füssen, Leipzig, and Stuttgart for `12` German Cities total.
- [ ] Publish exactly `91` German POIs: Berlin `15`, Munich `15`, Hamburg/Cologne/Frankfurt/Dresden/Nuremberg `8` each, Heidelberg/Leipzig/Stuttgart `5` each, and Rothenburg/Füssen `3` each. With six existing POIs, the expected addition is `85`.
- [ ] Add `16` directed records for Berlin↔Hamburg, Berlin↔Dresden, Berlin↔Munich, Munich↔Nuremberg, Munich↔Füssen, Frankfurt↔Cologne, Frankfurt↔Heidelberg, and Munich↔Stuttgart.
- [ ] Add `4` objective German month-risk records with `suitabilityStatus=unknown` and no recommendation language.
- [ ] Run `node scripts/verify-knowledge-expansion-batch04-country.mjs --country=DE`; expected result: `status: PASS`. Stop on failure.

### Task 4: Batch 04B Austria

**Files:**
- Create: `data/knowledge/raw/knowledge-expansion-batch04b-austria.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch10.json`
- Create: `data/knowledge/batches/pois.p1b-batch10.json`
- Create: `data/knowledge/batches/selection.p1b-batch10.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch04b-austria.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch04b-austria.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch04b-austria.json`

- [ ] Add Vienna, Salzburg, Innsbruck, Graz, Linz, Hallstatt, Zell am See, and Bregenz as `8` Austrian locality entities; do not change the schema.
- [ ] Publish exactly `55` Austrian POIs: Vienna `15`; Salzburg/Innsbruck/Graz `8` each; Linz/Bregenz `5` each; Hallstatt/Zell am See `3` each.
- [ ] Add `10` directed records for Vienna↔Salzburg, Vienna↔Graz, Salzburg↔Innsbruck, Salzburg↔Hallstatt, and Innsbruck↔Bregenz.
- [ ] Add `4` objective Austrian month-risk records, leaving unstable duration/frequency/transfer fields null or unknown.
- [ ] Run `node scripts/verify-knowledge-expansion-batch04-country.mjs --country=AT`; expected result: `status: PASS`. Stop on failure.

### Task 5: Batch 04C Portugal

**Files:**
- Create: `data/knowledge/raw/knowledge-expansion-batch04c-portugal.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch11.json`
- Create: `data/knowledge/batches/pois.p1b-batch11.json`
- Create: `data/knowledge/batches/selection.p1b-batch11.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch04c-portugal.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch04c-portugal.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch04c-portugal.json`

- [ ] Add Lisbon, Porto, Sintra, Coimbra, Braga, Évora, Faro, Lagos, Aveiro, and Guimarães as `10` Portuguese Cities; isolate Algarve as a region candidate.
- [ ] Publish exactly `69` Portuguese POIs: Lisbon `15`; Porto/Sintra/Coimbra `8` each; Braga/Évora/Faro/Lagos/Aveiro/Guimarães `5` each.
- [ ] Add `14` directed records for Lisbon↔Porto, Lisbon↔Sintra, Lisbon↔Évora, Porto↔Braga, Porto↔Guimarães, Lisbon↔Coimbra, and Faro↔Lagos.
- [ ] Add `4` objective Portuguese month-risk records from official sources.
- [ ] Run `node scripts/verify-knowledge-expansion-batch04-country.mjs --country=PT`; expected result: `status: PASS`. Stop on failure.

### Task 6: Batch 04D Greece

**Files:**
- Create: `data/knowledge/raw/knowledge-expansion-batch04d-greece.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch12.json`
- Create: `data/knowledge/batches/pois.p1b-batch12.json`
- Create: `data/knowledge/batches/selection.p1b-batch12.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch04d-greece.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch04d-greece.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch04d-greece.json`

- [ ] Add Athens, Thessaloniki, Nafplio, Kalabaka, Delphi, Heraklion, Chania, Rhodes Town, and Corfu Town as `9` City/locality entities. Publish Kalabaka as the city anchor; isolate Meteora, Crete, Rhodes island, and Corfu island as non-City review candidates.
- [ ] Publish exactly `66` Greek POIs: Athens `15`; Thessaloniki/Heraklion/Chania/Rhodes Town/Corfu Town `8` each; Nafplio `5`; Kalabaka/Delphi `3` each.
- [ ] Add `12` directed records for Athens↔Thessaloniki, Athens↔Nafplio, Athens↔Delphi, Athens↔Kalabaka, Athens↔Heraklion, and Heraklion↔Chania, using official rail/bus/air/ferry/government sources as applicable.
- [ ] Add `4` objective Greek month-risk records from official sources.
- [ ] Run `node scripts/verify-knowledge-expansion-batch04-country.mjs --country=GR`; expected result: `status: PASS`. Stop on failure.

### Task 7: Batch 04E Netherlands

**Files:**
- Create: `data/knowledge/raw/knowledge-expansion-batch04e-netherlands.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch13.json`
- Create: `data/knowledge/batches/pois.p1b-batch13.json`
- Create: `data/knowledge/batches/selection.p1b-batch13.json`
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch04e-netherlands.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch04e-netherlands.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch04e-netherlands.json`

- [ ] Reuse Amsterdam and Rotterdam; add The Hague, Utrecht, Haarlem, Delft, Leiden, Maastricht, Giethoorn, and Groningen for `10` Dutch Cities total.
- [ ] Publish exactly `67` Dutch POIs: Amsterdam `15`; Rotterdam/The Hague/Utrecht `8` each; Haarlem/Delft/Leiden/Maastricht/Groningen `5` each; Giethoorn `3`. With six existing POIs, the expected addition is `61`.
- [ ] Add `14` directed records for Amsterdam↔Rotterdam, Amsterdam↔The Hague, Amsterdam↔Utrecht, Amsterdam↔Haarlem, Rotterdam↔Delft, Amsterdam↔Leiden, and Amsterdam↔Maastricht.
- [ ] Add `4` objective Dutch month-risk records from official sources.
- [ ] Run `node scripts/verify-knowledge-expansion-batch04-country.mjs --country=NL`; expected result: `status: PASS`. Stop on failure.

### Task 8: Publish cumulative assets and update coverage

**Files:**
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-p1b-batch02.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-expansion-batch01.mjs`
- Modify: `scripts/verify-knowledge-expansion-batch02-japan-depth.mjs`
- Modify: `scripts/verify-knowledge-expansion-batch03-country.mjs`
- Create: `ROUTE_V2_KNOWLEDGE_COVERAGE_DASHBOARD_BATCH04.md`

- [ ] Register City/POI batches `09`–`13` only after all five country assets validate.
- [ ] Set cumulative published totals to Country `51`, City `144`, POI `904`, total entities `1,099`; set Evidence manifest counts to RouteLeg `196`, Season `76`, total `272`.
- [ ] Preserve the deterministic six-layer coverage formula: Country presence, `min(City/10,1)`, `min(POI/50,1)`, `min(directed Evidence/(2×max(City-1,1)),1)`, `min(risk months/(2×City),1)`, and `min(Accepted routes/20,1)`.
- [ ] Report all 15 requested countries with Country, City, POI, directed transport, risk month, Accepted route count, Evidence association, maximum reliable days, score, and main gap.
- [ ] Run cumulative Entity Layer, Runtime API, Planner Entity integration, Evidence promotion, Candidate Evidence Validation, Planner pipeline, Search V1, Region/Island constraints, City Detail UI, six-card feed, image fallback, Cache Baseline V2, and comprehensive prelaunch in isolated paths.

### Task 9: Isolated browser acceptance and final integrity audit

**Files:**
- Complete: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH04_AUDIT.md`

- [ ] Start the local server with Accepted input copied read-only and Search Cache, analytics, Candidate, Trace, EvidenceBundle, local Evidence, Ready Pool, metrics, browser profile, screenshots, performance, and image cache redirected to a temporary directory.
- [ ] Execute all 19 specified single-country queries and four cross-country queries through the visible browser; verify country constraints, day-depth progression, no repeated City/POI padding, stable detail for at least five seconds, Back/Forward, semantically safe local/fallback images, zero console warnings/errors, and zero external Evidence/image requests.
- [ ] Run `node --check` for every added or modified JS/MJS file, `git diff --check`, and `git diff --cached --check`; expected result: all exit `0`, staged diff empty.
- [ ] Recompute and compare Accepted SHA-256, immutable aggregate and file SHA-256, full Cache snapshot, Runtime State audit, and formal Metrics existence against Task 1.
- [ ] Leave all Batch 04 changes unstaged and uncommitted. Do not push, open a PR, merge, deploy, tag, drop/apply/pop the stash, or delete branches.
