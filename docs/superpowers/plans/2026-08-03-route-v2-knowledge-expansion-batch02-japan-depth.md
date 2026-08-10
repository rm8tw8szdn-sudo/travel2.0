# Route V2 Knowledge Expansion Batch 02 Japan Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen Japan coverage from two cities and six POIs to a travel-value-weighted network of 22 destination entities, 153 verified POIs, reusable inter-city transport evidence, and risk-only month evidence without changing Route V2 production logic.

**Architecture:** Publish one additive City batch and one additive POI batch through the existing Entity Layer asset registry. Extend the existing local Evidence seed with directed transport facts and city-month hard-risk observations from official sources. Keep every runtime and route-generation module frozen; validate the new data through repository, Runtime API, Planner integration and isolated browser acceptance only.

**Tech Stack:** Node.js ESM, JSON/JSONL knowledge assets, Wikidata Action API, existing Entity Layer schemas, existing local Evidence schemas, deterministic SHA-256/stable IDs, browser acceptance against the local Route V2 server.

---

### Task 1: Freeze boundaries and record the starting baseline

**Files:**
- Read: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`
- Read: `data/route-v2/evidence-seed/evidence-seed-manifest.json`
- Create: `ROUTE_V2_KNOWLEDGE_COVERAGE_DASHBOARD_BATCH02.md`

- [x] Record the current published totals `51 Country / 35 City / 105 POI / 191 entities`.
- [x] Record Japan's current two City entities (`Tokyo`, `Kyoto`) and three POIs per City.
- [x] Record the Accepted and Cache Baseline V2 hashes before any write.
- [x] Confirm all RouteIntent, Planner, Candidate, Runtime, Search, Publication and Production Readiness files remain outside the Batch 02 edit list.

### Task 2: Build the Japan destination catalog and failing verifier

**Files:**
- Create: `scripts/verify-knowledge-expansion-batch02-japan-depth.mjs`
- Create: `scripts/import-knowledge-expansion-batch02-japan-depth.mjs`
- Create: `data/knowledge/raw/knowledge-expansion-batch02-japan.wikidata.json`
- Create: `data/knowledge/batches/cities.p1b-batch04.json`
- Create: `data/knowledge/batches/pois.p1b-batch04.json`

- [x] Define 22 destination entities: the existing Tokyo and Kyoto plus Osaka, Nara, Kobe, Nagoya, Hakone, Kamakura, Fujikawaguchiko/Kawaguchiko, Takayama, Kanazawa, Hiroshima, Miyajima, Fukuoka, Yufuin, Beppu, Kumamoto, Sapporo, Otaru, Hakodate, Okinawa City and Naha.
- [x] Define travel-value tiers with exact accepted POI targets: Tokyo 19, Kyoto 19, Osaka 15; ordinary tourism cities 4-8; compact destinations 2-5.
- [x] Make the verifier fail until the accepted batch has unique QIDs, valid parents, stable aliases, coordinates and at least the declared minimum tier count for every destination.
- [x] Fetch every selected QID through `wbgetentities`; reject missing coordinates, missing labels, unexpected QIDs or duplicate QIDs.

### Task 3: Publish additive City and POI assets

**Files:**
- Create: `data/knowledge/batches/provenance.knowledge-expansion-batch02.json`
- Create: `data/knowledge/batches/conflicts.knowledge-expansion-batch02.json`
- Create: `data/knowledge/batches/review-queue.knowledge-expansion-batch02.json`
- Create: `data/knowledge/batches/selection.p1b-batch04.json`
- Modify: `src/lib/routes/knowledge-entity-layer-published-assets.mjs`

- [x] Reuse the existing Tokyo and Kyoto entity IDs; do not duplicate them in the new City asset.
- [x] Add 20 new City/destination entities and 147 new POIs, producing cumulative totals `51 / 55 / 252 / 358`.
- [x] Register only the new City and POI assets in the published asset arrays.
- [x] Require zero new conflicts, zero orphans, globally unique entity IDs and no new cross-type QID overlap beyond historical Singapore Q334.

### Task 4: Add reusable Japan transport and risk-only month evidence

**Files:**
- Create: `scripts/import-knowledge-expansion-batch02-japan-evidence.mjs`
- Modify: `data/route-v2/evidence-seed/route-leg-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/season-evidence.jsonl`
- Modify: `data/route-v2/evidence-seed/evidence-seed-manifest.json`
- Modify: `src/lib/routes/local-evidence-source-schema.mjs`

- [x] Add official JMA domains and only the minimum additional official Japanese transport domains required by the selected route legs.
- [x] Add separately identified directed evidence for the main Tokyo-Kansai, Kansai, Chubu/Hokuriku, Chugoku, Kyushu and Hokkaido corridors.
- [x] Add hard-risk month records only where official observations or warnings support them; keep `suitabilityStatus=unknown`, `season=null` and `recommendedBufferMinutes=null`, and leave unsupported city-months unknown.
- [x] Never infer a best season, recommended month or subjective desirability.
- [x] Upsert atomically and preserve all Batch 01 and earlier evidence byte-for-byte at the record level.

### Task 5: Coverage dashboard and integration regression

**Files:**
- Create: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH02_AUDIT.md`
- Modify: `scripts/verify-knowledge-entity-layer-p1b-batch02.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-planner-integration-p1b-batch01.mjs`
- Modify: `scripts/verify-knowledge-entity-layer-runtime-api-p1b-batch01.mjs`
- Modify: `scripts/verify-route-v2-evidence-promotion.mjs`

- [x] Report Japan's Country, City, POI, directed transport Evidence, month Evidence, unchanged Route inventory and coverage percentage.
- [x] Report the same current coverage dimensions for Italy, France, South Korea and Spain to determine Batch 03 priority.
- [x] Run the Batch verifier, cumulative Entity Layer verifier, Runtime API, Planner integration, Evidence promotion, Candidate Evidence validation, Planner pipeline, Search V1, City UI and six-card feed regression.
- [x] Run `node --check` on every new script and `git diff --check`; staged must remain zero.

### Task 6: Isolated browser acceptance

**Files:**
- Update: `ROUTE_V2_KNOWLEDGE_EXPANSION_BATCH02_AUDIT.md`

- [x] Start the local server with Search, Candidate, Trace, Evidence and metrics paths redirected to a temporary directory.
- [x] Search `日本7天`, `日本14天`, `日本21天`, and `日本30天` through the visible UI.
- [x] Record City and POI counts from each visible result/detail page and verify monotonic growth as duration increases.
- [x] Fail acceptance if 14-day and 30-day routes have materially identical City/POI coverage.
- [x] Confirm console warnings/errors and external runtime Evidence/image requests are zero.
- [x] Stop the server and verify Accepted, Immutable Cache and formal Runtime State match their starting hashes and sizes.

### Task 7: Stop for review without version-control operations

- [x] Confirm no files are staged.
- [x] List Batch 02 files separately from Batch 01 and pre-existing dirty-worktree files.
- [x] Do not commit, push, create a PR, deploy, tag, amend, rebase or squash.
