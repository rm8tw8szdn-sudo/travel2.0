# Route V2 Production Integrity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed Route V2 identity, single-city, Knowledge semantic, server-boundary, placeholder, coverage-reporting, and verifier-integrity defects without expanding Knowledge coverage or route features.

**Architecture:** Preserve the existing Route V2 planning pipeline and add one stable Knowledge-city identity adapter shared by Route snapshots and TravelState. Treat one-destination routes as a supported planner shape when and only when the user explicitly requires one city. Validate published Knowledge offline against a checked-in semantic reference snapshot, and isolate live refresh from the release gate. Harden only the existing Node server boundaries and reuse the current deterministic verifier framework.

**Tech Stack:** Browser JavaScript, Node.js ESM, JSON/JSONL Knowledge assets, Wikidata semantic snapshots, deterministic Route V2 planner and invariant gates, isolated Node HTTP integration tests.

---

### Task 1: Freeze protected state and failing regressions

**Files:**
- Create: `scripts/verify-route-v2-trip-footprint-knowledge-city-identity.mjs`
- Create: `scripts/verify-route-v2-single-city-hard-constraints.mjs`
- Create: `scripts/verify-route-v2-server-security-boundaries.mjs`
- Create: `scripts/verify-route-v2-neutral-city-placeholder.mjs`

- [ ] **Step 1: Snapshot Accepted, Cache Baseline V2, Evidence, Knowledge, Git, and stash**

Run the existing cache verifier and record SHA-256 values before any test that starts the server. Every server test must set all writable paths to an OS temporary directory.

- [ ] **Step 2: Add a failing Trip/Footprint identity regression**

Load `travel-state.js` in an isolated VM, create a Route V2 snapshot containing Knowledge city objects with `entityId`, `wikidataId`, `countryCode`, and names, call `createTripFromRoute`, mark the trip complete, and assert the city identities survive and are counted once.

```js
assert.deepEqual(trip.cityIds, ["city-de-fussen", "city-at-innsbruck"]);
assert.deepEqual(trip.cityQids, ["Q262684", "Q1735"]);
assert.equal(completed.stats.exploredCityCount, 2);
```

- [ ] **Step 3: Add a failing single-city production-path regression**

Use the same isolated discovery harness as the multi-city verifier and assert `Paris 7 days`, `Tokyo 7 days`, `Berlin 7 days`, `Linz 7 days`, and `Nara 7 days` return exactly one required city, while month/theme constraints remain enforced and an invalid one-day/time combination fails closed.

- [ ] **Step 4: Add failing server and placeholder regressions**

Export pure static-path and proxy-target validators from `server.js` without starting a server on import. Assert traversal and private-address targets fail. Assert the default city placeholder is neutral and contains no city/country label.

### Task 2: Unify Knowledge city identities in TravelState

**Files:**
- Modify: `travel-state.js`
- Modify: `trips.js`
- Modify: `scripts/verify-travel-state.mjs`
- Test: `scripts/verify-route-v2-trip-footprint-knowledge-city-identity.mjs`

- [ ] **Step 1: Normalize Route snapshot city identities**

Add a `cityIdentities` field derived from `destinationEntities`, retaining stable `entityId`, QID, country code, and display name. Legacy `cities` and `destinations` remain readable.

```js
{
  entityId: String(city.entityId),
  wikidataId: String(city.wikidataId),
  countryCode: String(city.countryCode).toUpperCase(),
  name: String(city.name || city.canonicalNameZh || city.canonicalNameEn),
}
```

- [ ] **Step 2: Store Knowledge identities in Trip main data**

`createTripFromRoute` must populate `cityIds`, `cityQids`, and `cityIdentities` directly from the snapshot. Only use legacy `citiesById` lookup when a stable Knowledge identity is unavailable.

- [ ] **Step 3: Recalculate planned/explored cities from both identity systems**

Deduplicate by `entityId`, then QID, then legacy ID. Preserve current completed/planned/cancelled/deleted rules and expose Knowledge cities to trip cards, detail, and Footprint counts.

- [ ] **Step 4: Run focused identity tests**

Run `node scripts/verify-travel-state.mjs` and the new end-to-end identity verifier. Expected: Route V2 and legacy cases pass; removing/completing trips recalculates counts correctly.

### Task 3: Support explicit single-city route shapes

**Files:**
- Modify: `src/lib/routes/route-candidate-builder.mjs`
- Modify: `src/lib/routes/route-candidate-pool.mjs`
- Modify: `src/lib/routes/route-composition-planner.mjs`
- Modify: `src/lib/routes/evidence-bundle-schema.mjs`
- Modify: `src/lib/routes/decision-trace-schema.mjs`
- Modify: `src/lib/routes/search-generated-route-builder.mjs`
- Modify: `src/lib/routes/route-intent-invariant-gate.mjs`
- Modify: `src/lib/routes/route-intent-model-oracle.mjs`
- Modify: `src/lib/routes/route-fallback-constraint-validator.mjs`
- Test: `scripts/verify-route-v2-single-city-hard-constraints.mjs`

- [ ] **Step 1: Define the narrow eligibility predicate**

Permit a one-destination candidate only when normalized hard constraints contain exactly one required city and no required second country/region conflict. Open-ended citywalk requests retain existing behavior.

```js
const explicitSingleCity = hard.requiredCities?.state === "provided"
  && hard.requiredCities.values.length === 1
  && (hard.countries?.values?.length || 0) <= 1;
```

- [ ] **Step 2: Replace unconditional minimum-two checks**

Use a shared minimum-destination helper in Candidate Builder, Candidate Pool, Planner skeleton validation, decision trace, generated-route fallback, and Evidence bundle validation. Do not add a synthetic city.

- [ ] **Step 3: Build one-city content depth**

Keep the single destination in `proposedOrder`; use existing POI entities and exact duration metadata to produce depth/stay content. Evidence may contain zero route legs, but must still validate requested month/theme evidence.

- [ ] **Step 4: Align production gate, Oracle, and fallback**

The invariant and Oracle must accept the same legal one-city result and reject missing required city, wrong country, wrong exact days, month/theme conflict, or any fallback that drops the city.

- [ ] **Step 5: Run single-, multi-city, multi-country, mixed, capacity, and mutation suites**

Expected: all existing multi-constraint behavior remains unchanged and the new one-city matrix passes.

### Task 4: Correct the three published Knowledge defects

**Files:**
- Modify: `data/knowledge/seeds/knowledge-expansion-batch02-japan.json`
- Modify: `data/knowledge/raw/knowledge-expansion-batch02-japan.wikidata.json`
- Modify: `data/knowledge/batches/cities.p1b-batch04.json`
- Modify: `data/knowledge/batches/pois.p1b-batch04.json`
- Modify: `data/knowledge/batches/selection.p1b-batch04.json`
- Modify: `data/knowledge/batches/provenance.knowledge-expansion-batch02.json`
- Modify: `data/knowledge/batches/pois.p1b-batch10.json`
- Modify: `data/knowledge/batches/selection.p1b-batch10.json`
- Modify: `data/knowledge/batches/provenance.knowledge-expansion-batch04b-austria.json`
- Modify: applicable review/conflict/report assets generated by the existing importers

- [ ] **Step 1: Replace Nara with verified Q169134**

Refresh the actual Wikidata entity, regenerate city coordinates/aliases/provenance, preserve the stable project city `entityId`, and keep all eight POIs attached to that stable city identity.

- [ ] **Step 2: Quarantine Miyajima as a City**

Remove Q875301 from published City selection. Reattach its POIs only to a verified legal city parent supported by current schema; if no honest city parent exists, exclude the island group from published City/POI assets and record the reason in review output.

- [ ] **Step 3: Remove the German Linz Castle POI**

Delete Q1012988 from Austria selection/published/provenance assets unless an independently verified Austrian replacement is available from the existing raw candidate set. Do not invent a QID or rewrite coordinates.

- [ ] **Step 4: Re-run Batch 01-04 import/verifier chain**

Expected: entity totals may decrease only for quarantined invalid entities; there are no duplicates/orphans and all reports agree with published assets.

### Task 5: Add an offline Knowledge Semantic Gate

**Files:**
- Create: `src/lib/routes/knowledge-semantic-gate.mjs`
- Create: `data/knowledge/semantic/knowledge-semantic-snapshot.json`
- Create: `data/knowledge/semantic/knowledge-semantic-exceptions.json`
- Create: `scripts/verify-knowledge-semantic-gate.mjs`
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Define deterministic semantic facts**

Store checked-in QID facts required by published entities: P17 country, P31 types, coordinates, and canonical labels/aliases. The release gate uses this snapshot and never depends on live network access.

- [ ] **Step 2: Validate countries, cities, POIs, and parent closure**

Fail on missing QID, prohibited City P31, country mismatch, excessive parent distance, or no normalized label/alias overlap. Use a small explicit exception file for Vatican/city-state/cross-border records.

- [ ] **Step 3: Add negative mutations**

Mutate a Japan city to France, an Austria POI to Germany, a City to island, a valid-looking wrong QID, coordinates across countries, and unrelated names. Every mutation must fail with a stable reason code.

- [ ] **Step 4: Register the gate as mandatory**

Add `knowledge-semantic-gate` to the comprehensive static stages and failure-propagation assertions.

### Task 6: Harden the existing Node server boundaries

**Files:**
- Modify: `server.js`
- Test: `scripts/verify-route-v2-server-security-boundaries.mjs`

- [ ] **Step 1: Replace static path prefix checks**

Resolve the path, calculate `path.relative(root, resolved)`, and reject empty-root escapes, `..` segments, absolute results, encoded traversal, separators, sibling-prefix paths, and Windows case-boundary escapes.

- [ ] **Step 2: Add bounded request-body reading**

Track bytes as chunks arrive, stop at the endpoint limit, raise a typed 413 error, and convert malformed JSON to a stable 400 response without a stack trace. Preserve the 160-character search-query gate.

- [ ] **Step 3: Add SSRF-safe proxy resolution**

Allow only configured Wikimedia/Unsplash image hosts already used by the product. Resolve DNS immediately before each request, reject loopback/private/link-local/metadata addresses for IPv4 and IPv6, use manual redirects, revalidate every hop, cap redirects and response bytes, and accept only explicit raster image content types.

- [ ] **Step 4: Run isolated security mutations**

Expected: localhost, private ranges, metadata, private redirect, DNS rebinding simulation, oversized body/image, invalid content type, and traversal all fail closed.

### Task 7: Use a neutral placeholder and honest coverage metrics

**Files:**
- Create: `assets/route-city-placeholder.svg`
- Modify: `route-v2-image-assets.js`
- Modify: Knowledge Dashboard/report files found by `report-planner-coverage-matrix.mjs`
- Modify: `scripts/verify-route-knowledge-coverage-audit.mjs`
- Test: `scripts/verify-route-v2-neutral-city-placeholder.mjs`

- [ ] **Step 1: Replace the Oslo default**

Create a generic abstract city/travel illustration with no country, city, landmark, flag, or geographic label, and point `DEFAULT_CITY_PLACEHOLDER` to it.

- [ ] **Step 2: Separate coverage meanings**

Report `catalogCountries`, `plannableCountries`, `evidenceBackedCountries`, and percentages without changing Knowledge counts. Norway remains fail-closed.

- [ ] **Step 3: Verify local-only media behavior**

Assert generated detail uses only local neutral fallback assets and makes zero external Evidence/image requests.

### Task 8: Repair or retire legacy verifiers

**Files:**
- Modify: active Playwright verifier launch helpers/scripts
- Modify: legacy Knowledge byte-hash verifiers
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Create or modify: verifier lifecycle manifest/documentation

- [ ] **Step 1: Classify active versus retired scripts**

Keep only scripts that still protect a production contract. Mark replaced scripts as retired and ensure comprehensive excludes them.

- [ ] **Step 2: Make active browser checks cross-platform**

Use `CHROME_EXECUTABLE_PATH` when provided and Playwright's bundled Chromium otherwise. Never hardcode the macOS executable.

- [ ] **Step 3: Canonicalize text hashes**

Normalize CRLF/CR to LF before hashing text fixtures while retaining byte hashes for binary files.

- [ ] **Step 4: Run active verifiers on Windows**

Expected: no failure from missing repository-local Playwright or a macOS-only path.

### Task 9: Full isolated acceptance and handoff

**Files:**
- Test only; do not stage or commit

- [ ] **Step 1: Run the focused validation matrix**

Run Trip/Footprint identity, single-city, semantic Knowledge, server security, placeholder, multi-city, multi-country, mixed, Region/Island, theme trust, RouteIntent/invariant/Oracle, mutation, Search V1, Planner, fallback, Cache Baseline V2, and Production Readiness verifiers.

- [ ] **Step 2: Run comprehensive prelaunch once**

Expected: every mandatory stage exits zero, real assets remain unchanged, and all test writes are under isolated temporary paths.

- [ ] **Step 3: Run real in-app browser acceptance**

Verify Germany/Austria Route-to-Trip-to-completed-Footprint counts, Nara/Linz/Tokyo single-city searches, repaired Knowledge presentation, historical parser/Region cases, five-second detail stability, zero console warnings/errors, and zero external Evidence/image requests.

- [ ] **Step 4: Record performance**

Record SearchIntent p95, final gate p95, Planner cold p95, cache replay p95, and semantic-gate duration. Do not reduce candidate quality to improve numbers.

- [ ] **Step 5: Recheck assets and Git**

Accepted, Immutable Cache, Formal Evidence, runtime cache/state, Metrics absence, stash message, staged count, `node --check`, and `git diff --check` must match the protected boundary. Leave every authorized change unstaged.

---

Plan self-review: every requirement in the attached hardening specification maps to a task; no Batch 05, deployment, database, monitoring, or new route capability is included. The plan intentionally uses an offline semantic snapshot for deterministic release checks and reserves live Wikidata access for controlled refresh/audit. User Git restrictions override the skill's normal commit checkpoints: this execution creates no stage, commit, push, PR, merge, deploy, tag, or stash operation.
