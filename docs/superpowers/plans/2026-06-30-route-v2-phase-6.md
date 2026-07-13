# Route V2 Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Phase 6 by adding the remaining planner context strategies, dynamic country-code QID resolution, and regression coverage without changing the frontend repository-only contract.

**Architecture:** Keep `runPlannerPhase` as the stable orchestration seam. Add strategy factories in `repository-warmup-runner.mjs`, register them through `resolvePlannerStrategy`, and keep context selection pure and testable. Extend `wikidata-sparql-knowledge-graph.mjs` with a small `fetchCountryQid` resolver that falls back to the existing static table.

**Tech Stack:** Node.js ESM, local JSON repositories, Wikidata SPARQL, built-in `node:assert/strict` verification scripts.

---

### Task 1: Stabilize Warmup Integration Verification

**Files:**
- Modify: `scripts/verify-planner-warmup-integration.mjs`

- [ ] **Step 1: Add group progress logs**

Add a small `console.log("[n/6] starting ...")` line before each top-level verification block so timeout location is visible.

- [ ] **Step 2: Run the integration script**

Run: `C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-planner-warmup-integration.mjs`

Expected: either PASS, or a visible last-started group that identifies the hang.

- [ ] **Step 3: Fix only the hanging test harness if needed**

If the script hangs inside a mock fetch path, update the mock to return a complete empty response for all Wikimedia `action=query` branches:

```js
return { ok: true, status: 200, json: async () => ({ query: { pages: [] } }), headers: new Map() };
```

- [ ] **Step 4: Re-run the integration script**

Run: `C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-planner-warmup-integration.mjs`

Expected: exit code 0 with all six groups printed.

### Task 2: Add Phase 6 Context Strategies

**Files:**
- Modify: `src/lib/routes/repository-warmup-runner.mjs`
- Create: `scripts/verify-planner-phase6-strategies.mjs`

- [ ] **Step 1: Write strategy regression tests**

Create `scripts/verify-planner-phase6-strategies.mjs` to assert these string strategy ids are registered and produce contexts when the needed signals are present:

```js
const ids = ["coverage-matrix", "search-miss", "operator", "seasonal", "popular", "newest"];
```

The test should use `runRouteRepositoryWarmup` with `batchSize: 0`, mocked SPARQL/image fetches, a stub text provider, and temp repositories.

- [ ] **Step 2: Implement helper utilities**

Add small helpers in `repository-warmup-runner.mjs`:

```js
function countryMeta(country) {
  return { countryName: COUNTRY_META[country]?.countryName || country, countryCode: country, countryWikidataId: COUNTRY_META[country]?.countryWikidataId || "" };
}

function contextKey(ctx) {
  return `${ctx.country}:${ctx.travelStyle}:${ctx.theme || ""}:${ctx.durationDays}`;
}
```

- [ ] **Step 3: Implement the six strategy factories**

Add:

```js
createCoverageMatrixStrategy()
createSearchMissStrategy()
createOperatorStrategy()
createSeasonalStrategy()
createPopularCountriesStrategy()
createNewestCountryStrategy()
```

Each `select()` returns complete planner contexts and filters out countries whose pool has fewer than four destinations.

- [ ] **Step 4: Register strategy ids**

Update `resolvePlannerStrategy` so the six ids map to their factories:

```js
if (strategyOrId === "coverage-matrix") return createCoverageMatrixStrategy();
if (strategyOrId === "search-miss") return createSearchMissStrategy();
if (strategyOrId === "operator") return createOperatorStrategy();
if (strategyOrId === "seasonal") return createSeasonalStrategy();
if (strategyOrId === "popular") return createPopularCountriesStrategy();
if (strategyOrId === "newest") return createNewestCountryStrategy();
```

- [ ] **Step 5: Run strategy tests**

Run: `C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-planner-phase6-strategies.mjs`

Expected: exit code 0 and a summary showing all six strategy ids.

### Task 3: Add Dynamic Country QID Resolution

**Files:**
- Modify: `src/lib/routes/wikidata-sparql-knowledge-graph.mjs`
- Modify: `src/lib/routes/index.mjs`
- Create: `scripts/verify-dynamic-country-qid.mjs`

- [ ] **Step 1: Write resolver test**

Create `scripts/verify-dynamic-country-qid.mjs` with a mocked SPARQL response for `wdt:P297 "CH"` returning `Q39`, then assert `buildKnowledgeGraphPool({ countryCodes:["CH"] })` calls destination SPARQL with `wd:Q39`.

- [ ] **Step 2: Implement `fetchCountryQid`**

Add:

```js
export async function fetchCountryQid(countryCode, fetchImpl = globalThis.fetch, deadlineAt = 0) {
  const code = clean(countryCode).toUpperCase();
  if (!code) return "";
  if (COUNTRY_CODE_TO_QID[code]) return COUNTRY_CODE_TO_QID[code];
  // SPARQL wdt:P297 lookup, return QID or "".
}
```

- [ ] **Step 3: Use dynamic resolver in `buildKnowledgeGraphPool`**

Replace direct table lookup with `await fetchCountryQid(upper, fetchImpl, deadlineAt)`, preserving per-country failure isolation.

- [ ] **Step 4: Export the resolver**

Add `fetchCountryQid` to `src/lib/routes/index.mjs`.

- [ ] **Step 5: Run QID tests**

Run: `C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-dynamic-country-qid.mjs`

Expected: exit code 0.

### Task 4: Full Regression

**Files:**
- Test only.

- [ ] **Step 1: Run planner and Phase 6 tests from `travel-collection`**

Run:

```powershell
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-planner-warmup-integration.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-planner-phase6-strategies.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-dynamic-country-qid.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-planner-pipeline.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-llm-node.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-evidence-collection.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-route-repository-architecture.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe scripts\verify-route-v2-foundation.mjs
```

- [ ] **Step 2: Run root-sensitive tests from parent project**

Run from `C:\Users\admin\route-v2\xiaohe-claude-windows-workspace\New project`:

```powershell
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe travel-collection\scripts\verify-route-ai-production-phase2a.mjs
C:\Users\admin\node-v24\node-v24.18.0-win-x64\node.exe travel-collection\scripts\verify-route-phase2b-travel-knowledge.mjs
```

Expected: all listed scripts exit 0.

---

## Self-Review

Spec coverage: the plan covers the six Phase 6 strategies, dynamic QID resolution, warmup integration verification, and full regression. It intentionally leaves broader production scale work such as 45+ route generation and real API-key runs as a later operator step after the code surface is stable.

Placeholder scan: no implementation step depends on an undefined placeholder.

Type consistency: all planned strategy contexts match the existing `{ country, countryName, countryCode, countryWikidataId, travelStyle, durationDays }` shape.
