# Batch 06 Homonymous City and Performance Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Batch 06's homonymous-city hard-constraint defect and determine whether the RouteIntent p95 failures are Batch 06-specific without weakening the existing performance contract.

**Architecture:** Resolve country aliases that are independent of candidate City spans first, then use explicit Country and Region scope to select among equal City alias matches before overlap elimination. Unqualified ambiguous aliases fail closed. A dedicated production-chain verifier scans all published City aliases, exercises real planner output plus invariant mutations, and becomes mandatory; performance comparison stays diagnostic and runs identical measurement code against the dirty Batch 06 tree and an archived clean `main` snapshot.

**Tech Stack:** Node.js ESM, Route V2 SearchIntent/RouteIntent pipeline, published Knowledge Entity Layer, existing explicit-constraint harness, Git archive, in-app browser.

---

### Task 1: Lock the current failures and collision inventory

**Files:**
- Create: `scripts/verify-route-v2-homonymous-city-disambiguation.mjs`
- Read: `src/lib/routes/search-intent-parser.mjs`
- Read: `scripts/lib/route-v2-explicit-constraint-harness.mjs`

- [ ] **Step 1: Add production-chain cases that currently fail**

Use `createExplicitConstraintHarness()` for these exact expectations:

```js
const qualifiedCases = [
  ["Santiago Chile 7 days", ["Q2887"], ["CL"]],
  ["Santiago de Chile Buenos Aires 14 days", ["Q2887", "Q1486"], ["CL", "AR"]],
  ["Lagos Nigeria 7 days", ["Q8673"], ["NG"]],
  ["Cordoba Spain 7 days", ["Q5818"], ["ES"]],
  ["Lagos Portugal 7 days", ["Q732548"], ["PT"]],
  ["Cordoba Argentina 7 days", ["Q44210"], ["AR"]],
];
```

Assert parser `requiredDestinationIds`, normalized required Cities/Countries, Candidate countries, final route City QIDs, and final route Country codes. Assert Accepted writes and external fetches stay zero.

- [ ] **Step 2: Add unqualified ambiguity cases**

```js
for (const query of ["Santiago 7 days", "Lagos 7 days", "Cordoba 7 days"]) {
  assert.equal(result.parsedIntent.parseSuccess, false);
  assert.equal(result.parsedIntent.failureReason, "unresolved-destination");
  assert.equal(result.response.records.length, 0);
}
```

- [ ] **Step 3: Build the collision inventory dynamically**

Canonicalize each published City alias with NFKD accent removal, lowercase conversion, punctuation-to-space conversion, and whitespace collapse. Group distinct QIDs by canonical alias and report exact, accent-folded, English, and CJK collision counts without writing Knowledge data.

- [ ] **Step 4: Run the verifier and prove it fails before implementation**

Run: `node scripts/verify-route-v2-homonymous-city-disambiguation.mjs`

Expected: FAIL on `Santiago Chile 7 days` because the current parser selects `Q14314`.

### Task 2: Resolve City aliases using explicit Country/Region scope

**Files:**
- Modify: `src/lib/routes/search-intent-parser.mjs:354-430`
- Modify: `src/lib/routes/search-intent-parser.mjs:505-552`
- Modify: `src/lib/routes/search-intent-parser.mjs:1020-1090`

- [ ] **Step 1: Reject lowercase two-letter Country-code aliases**

Treat a two-letter alias equal to an ISO country code as a code only when the original query token is uppercase:

```js
function countryAliasOccurrenceAllowed(query, country, alias, occurrence) {
  const normalizedAlias = clean(alias);
  const countryCode = clean(country?.code).toUpperCase();
  if (!/^[A-Za-z]{2}$/u.test(normalizedAlias) || normalizedAlias.toUpperCase() !== countryCode) return true;
  return query.slice(occurrence.index, occurrence.end) === countryCode;
}
```

Call it inside `extractCountryOccurrences()` before accepting an occurrence. This keeps explicit `DE` valid while preventing the preposition `de` from becoming Germany.

- [ ] **Step 2: Separate City occurrence collection from resolution**

Create `collectCityAliasOccurrences(query, cityCatalog)` that returns every exact alias candidate with its span, QID identity, City object, and raw alias. Use these raw spans only to prevent Country aliases embedded inside full City names from becoming countries.

- [ ] **Step 3: Resolve equal-span candidates before overlap filtering**

Group raw City occurrences by `index:end`. Process groups by start position and longest span first. For a group containing multiple City identities:

```js
const scoped = scopeCountryCodes.length
  ? group.filter((entry) => scopeCountryCodes.includes(clean(entry.city.countryCode).toUpperCase()))
  : [];
const identities = new Set(scoped.map((entry) => entry.identity));
if (identities.size === 1) return scoped[0];
return {
  diagnostic: {
    code: "ambiguous-city-alias",
    rawValue: group[0].rawValue,
    candidateDestinationIds: unique(group.map((entry) => entry.identity)),
    candidateCountryCodes: unique(group.map((entry) => clean(entry.city.countryCode).toUpperCase())),
  },
};
```

Never use QID order or import order to choose an ambiguous City.

- [ ] **Step 4: Parse scope before final City selection**

In `parseSearchIntent()`:

```js
const rawCityOccurrences = collectCityAliasOccurrences(rawQuery, cityCatalog);
const rawCityRanges = uniqueOccurrenceRanges(rawCityOccurrences);
const explicitCountryOccurrences = extractCountryOccurrences(rawQuery, countryCatalog, rawCityRanges);
const matchedRegion = firstCatalogMatchOutsideRanges(rawQuery, regionCatalog, rawCityRanges);
const scopeCountryCodes = unique([
  ...explicitCountryOccurrences.map((entry) => entry.country.code),
  ...(matchedRegion?.countryCodes || []),
  matchedRegion?.countryCode,
  matchedRegion?.parentCountryCode,
].map((value) => clean(value).toUpperCase()).filter(Boolean));
const extractedDestinations = extractRequiredDestinations(rawQuery, rawCityOccurrences, countryCatalog, scopeCountryCodes);
```

Preserve the existing required City order and Region filtering after resolution.

- [ ] **Step 5: Make ambiguity fail closed**

Treat both `unknown-city-token` and `ambiguous-city-alias` diagnostics as unresolved destinations when computing `intentMode`, `failureReason`, `parseSuccess`, and `unresolvedDestinationNames`.

- [ ] **Step 6: Run focused parser and production-chain tests**

Run: `node scripts/verify-route-v2-homonymous-city-disambiguation.mjs`

Expected: all qualified cases return only the intended QIDs/countries; all three unqualified aliases fail with `unresolved-destination`.

### Task 3: Kill Country-filter and final-result mutations

**Files:**
- Modify: `scripts/verify-route-v2-homonymous-city-disambiguation.mjs`

- [ ] **Step 1: Add a wrong-Country catalog mutation**

Clone the published catalog, change the intended same-name City's `countryCode`, parse the qualified query, and require rejection rather than fallback to a wrong same-name entity.

- [ ] **Step 2: Add final-route extra-Country mutation**

Clone a valid `Santiago Chile` route, append Santiago de Compostela (`Q14314`, `ES`) to `destinationEntities`, and assert both:

```js
assert.equal(validateRouteIntentInvariants(mutated, intent.normalizedRouteIntent, {
  source: "homonymous-extra-country-mutation",
  claimedSuccess: true,
}).matched, false);
assert.equal(evaluateRouteIntentOracle(intent.normalizedRouteIntent, mutated, {
  claimedSuccess: true,
}).matched, false);
```

- [ ] **Step 3: Report mutation results**

Expected verifier output: `countryFilterMutationKilled`, `wrongCountryMutationKilled`, and `extraCountryMutationKilled` are all `true`.

### Task 4: Make the verifier mandatory

**Files:**
- Modify: `src/lib/routes/prelaunch-verifier-gate.mjs`
- Modify: `scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

- [ ] **Step 1: Register the verifier immediately after multi-city constraints**

```js
Object.freeze({
  name: "homonymous-city-country-disambiguation",
  relativePath: "scripts/verify-route-v2-homonymous-city-disambiguation.mjs",
  phase: "static",
}),
```

- [ ] **Step 2: Extend failure propagation assertions**

Require the new stage to exist and inject a nonzero exit through the production runner. Comprehensive must return nonzero based on process status, not PASS text.

- [ ] **Step 3: Verify the new stage count**

Run: `node scripts/verify-route-v2-comprehensive-failure-propagation.mjs`

Expected: PASS with the mandatory count increased from 48 to 49.

### Task 5: Compare Batch 06 and main performance without changing the gate

**Files:**
- Do not modify: `scripts/verify-route-v2-intent-performance.mjs`
- Temporary only: `%TEMP%/route-v2-batch06-performance-comparison-*`

- [ ] **Step 1: Archive clean main without switching the dirty branch**

Run `git archive --format=zip --output=<temp>/main.zip main` and expand it below `%TEMP%`. Do not use `git worktree`, checkout, reset, or stash.

- [ ] **Step 2: Run identical diagnostic measurements five times per tree**

Use Node v24.18.0 and the performance verifier's exact warmups, samples, batch sizes, `summary()`, `measure()`, and `measureStable()` implementations. Record parser p50/p95/min/max and final-invariant p50/p95/min/max for Batch 06 and main.

- [ ] **Step 3: Run the unchanged production verifier five times per tree**

Run: `node scripts/verify-route-v2-intent-performance.mjs`

Record pass/fail and p95. Do not alter `<0.25ms`, aggregation, or assertions.

- [ ] **Step 4: Classify the result**

Batch 06 is a real regression only if its same-host distribution is stably slower than main. If both fluctuate similarly around the threshold, classify it as host jitter and retain the existing contract unchanged.

### Task 6: Final regression, browser, and asset protection

**Files:**
- Modify only if required by Tasks 1-4: parser, verifier, mandatory gate, failure propagation, this plan.

- [ ] **Step 1: Run focused and historical regression suites**

Run the homonymous-city verifier, Real User Search Intent, multi-city, multi-country, mixed city/country, single-city, Region/Island, fallback, Search V1, Planner, Semantic Gate, Batch 06 Route Consumption, Trip/Footprint, image gates, and Cache Baseline V2.

- [ ] **Step 2: Run real browser cases**

Search all six qualified Santiago/Lagos/Cordoba cases. Assert exact Country/QID identities, no extra countries, console error/warning zero, and no external Evidence/image requests.

- [ ] **Step 3: Run full release gates**

Run comprehensive prelaunch, failure propagation, `node --check` for every modified/new JS/MJS file, and `git diff --check`.

- [ ] **Step 4: Confirm protected state**

Recheck Accepted, Formal Evidence, Immutable aggregate, Cache 331, Runtime State 329, Metrics absent, staged zero, Knowledge/Evidence diff unchanged from the pre-fix snapshot, and the original `stash@{0}` message.

- [ ] **Step 5: Stop without committing**

Leave the verified fixes unstaged in the current Batch 06 working tree. Do not commit, push, create a PR, merge, deploy, tag, start Batch 07, or operate on stash.
