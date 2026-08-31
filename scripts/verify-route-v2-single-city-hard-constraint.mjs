import assert from "node:assert/strict";

import {
  createExplicitConstraintHarness,
  routeDestinationIds,
} from "./lib/route-v2-explicit-constraint-harness.mjs";

const cases = [
  { query: "Linz 7 days", requiredId: "Q41329" },
  { query: "Nara 7 days", requiredId: "Q169134" },
  { query: "Miyajima 7 days", requiredId: "Q736897" },
  { query: "Paris 7 days", requiredId: "Q90" },
  { query: "Tokyo 7 days", requiredId: "Q1490" },
  { query: "Berlin 7 days", requiredId: "Q64" },
  { query: "Nara 7 days in December", requiredId: "Q169134", month: 12 },
];

const harness = createExplicitConstraintHarness("single-city-hard-constraint");

try {
  for (const [index, testCase] of cases.entries()) {
    const result = await harness.runQuery(testCase.query, `${testCase.requiredId.toLowerCase()}-${index}`);
    assert.equal(result.parsedIntent.parseSuccess, true, `${testCase.query}: parser`);
    assert.deepEqual(
      result.parsedIntent.requiredDestinationIds,
      [testCase.requiredId],
      `${testCase.query}: canonical required city`,
    );
    assert.deepEqual(
      result.parsedIntent.normalizedRouteIntent.hardConstraints.requiredCities.values.map((entry) => entry.id),
      [testCase.requiredId],
      `${testCase.query}: RouteIntent hard constraint`,
    );
    assert.notEqual(result.response.diagnostics.reason, "constraint-conflict", `${testCase.query}: false conflict`);
    assert.equal(result.response.records.length, 1, `${testCase.query}: one legal route expected`);
    const record = result.response.records[0];
    assert.deepEqual(routeDestinationIds(record), [testCase.requiredId], `${testCase.query}: exact city set`);
    assert.equal(record.destinationEntities.filter((entry) => entry.entityTypeName === "poi").length, 0, `${testCase.query}: POIs must not become route stops`);
    assert(record.destinationEntities[0].poiEntities.length > 0, `${testCase.query}: published POI depth must remain nested under the city`);
    assert.equal(record.durationDays, 7, `${testCase.query}: exact duration hard constraint`);
    if (testCase.month) {
      assert.deepEqual(record.timeIntent.months, [testCase.month], `${testCase.query}: explicit month preserved`);
      assert.deepEqual(record.bestMonths, [], `${testCase.query}: no unsupported best-month claim`);
    }
    assert.equal(result.candidates.length, 3, `${testCase.query}: three deterministic alternatives expected`);
    for (const candidate of result.candidates) {
      assert.deepEqual(candidate.proposedOrder, [testCase.requiredId], `${testCase.query}: Candidate preserves the city`);
    }
    assert.equal(result.acceptedWrites, 0, `${testCase.query}: verifier must not write Accepted`);
  }

  const unknown = await harness.runQuery("Atlantis 7 days", "unknown");
  assert.equal(unknown.parsedIntent.parseSuccess, false, "unknown single city must fail closed");
  assert.equal(unknown.response.records.length, 0, "unknown single city must not degrade to a recommendation");

  const incompatibleTheme = await harness.runQuery("Nara island vacation 7 days", "incompatible-theme");
  assert.equal(incompatibleTheme.parsedIntent.normalizedRouteIntent.softPreferences.theme, "islandvacation", "explicit theme must remain a hard constraint");
  assert.equal(incompatibleTheme.parsedIntent.normalizedRouteIntent.softPreferences.themeConstraintMode, "explicit");
  assert.equal(incompatibleTheme.response.records.length, 0, "incompatible single-city theme must fail closed");
  assert.equal(incompatibleTheme.response.diagnostics.reason, "constraint-conflict");
  assert(incompatibleTheme.response.diagnostics.constraintConflict.reasonCodes.includes("explicit-theme-mismatch"));
  assert.equal(harness.externalFetchCalls(), 0, "single-city verifier must not use external Evidence or images");

  const cityStateCapacity = await harness.runQuery("Monaco 46 days", "city-state-capacity");
  assert.equal(cityStateCapacity.parsedIntent.tripCapacity.scope, "single-city");
  assert.equal(cityStateCapacity.parsedIntent.tripCapacity.maxSupportedDays, 45, "a Country/City identity overlap must retain the single-Country cap");
  assert.equal(cityStateCapacity.parsedIntent.tripCapacity.supported, false);
  assert.equal(cityStateCapacity.response.records.length, 0, "a city-state must not bypass the explicit Country duration cap");
  assert.equal(cityStateCapacity.response.diagnostics.reason, "trip-duration-capacity-exceeded");

  const ordinaryCityDepth = await harness.runQuery("Tokyo 60 days", "ordinary-city-depth");
  assert.equal(ordinaryCityDepth.parsedIntent.tripCapacity.scope, "single-city");
  assert.equal(ordinaryCityDepth.parsedIntent.tripCapacity.maxSupportedDays, null, "ordinary explicit City depth remains open-ended");
  assert.equal(ordinaryCityDepth.response.records.length, 1);

  console.log(JSON.stringify({
    verifier: "route-v2-single-city-hard-constraint",
    passed: true,
    cases: cases.map((item) => item.query),
    externalFetchCalls: harness.externalFetchCalls(),
    acceptedWrites: 0,
  }, null, 2));
} finally {
  harness.close();
}
