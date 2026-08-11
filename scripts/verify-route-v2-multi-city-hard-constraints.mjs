import assert from "node:assert/strict";

import {
  createExplicitConstraintHarness,
  routeDestinationIds,
} from "./lib/route-v2-explicit-constraint-harness.mjs";

const cases = [
  { id: "berlin-munich", query: "Berlin Munich 7 days", fixedQuery: "Berlin → Munich 7 days", requiredIds: ["Q64", "Q1726"] },
  { id: "lisbon-porto", query: "Lisbon Porto 7 days", fixedQuery: "Lisbon → Porto 7 days", requiredIds: ["Q597", "Q36433"] },
  { id: "athens-thessaloniki", query: "Athens Thessaloniki 10 days", fixedQuery: "Athens → Thessaloniki 10 days", requiredIds: ["Q1524", "Q17151"] },
  { id: "rome-florence", query: "Rome Florence 7 days", fixedQuery: "Rome → Florence 7 days", requiredIds: ["Q220", "Q2044"] },
  { id: "madrid-barcelona", query: "Madrid Barcelona 7 days", fixedQuery: "Madrid → Barcelona 7 days", requiredIds: ["Q2807", "Q1492"] },
  { id: "seoul-busan", query: "Seoul Busan 7 days", fixedQuery: "Seoul → Busan 7 days", requiredIds: ["Q8684", "Q16520"] },
];

function assertExactSet(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: must not add or remove a city`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label}: required city set`);
}

const harness = createExplicitConstraintHarness("multi-city-hard-constraints");
const results = [];

try {
  for (const testCase of cases) {
    for (const [mode, query] of [["flexible", testCase.query], ["fixed", testCase.fixedQuery]]) {
      const label = `${testCase.id}-${mode}`;
      const result = await harness.runQuery(query, label);
      const intent = result.parsedIntent;
      assert.equal(intent.parseSuccess, true, `${query}: parser`);
      assert.deepEqual(intent.requiredDestinationIds, testCase.requiredIds, `${query}: requiredDestinationIds`);
      assert.equal(intent.destinationOrderMode, mode, `${query}: order mode`);
      assert.deepEqual(
        intent.normalizedRouteIntent.hardConstraints.requiredCities.values.map((entry) => entry.id),
        testCase.requiredIds,
        `${query}: normalized required cities`,
      );
      assert.notEqual(result.response.diagnostics.reason, "constraint-conflict", `${query}: false conflict`);
      assert(result.response.records.length > 0, `${query}: expected a legal two-city route; ${JSON.stringify(result.response.diagnostics)}`);
      const routeOrder = routeDestinationIds(result.response.records[0]);
      assertExactSet(routeOrder, testCase.requiredIds, query);
      if (mode === "fixed") assert.deepEqual(routeOrder, testCase.requiredIds, `${query}: fixed route order`);
      assert.equal(result.candidates.length, 3, `${query}: Candidate builder must retain three alternatives`);
      for (const candidate of result.candidates) {
        assertExactSet(candidate.proposedOrder, testCase.requiredIds, `${query}: ${candidate.candidateId}`);
        if (mode === "fixed") {
          assert.deepEqual(candidate.proposedOrder, testCase.requiredIds, `${query}: fixed Candidate order`);
        }
      }
      assert.equal(result.acceptedWrites, 0, `${query}: verifier must not write Accepted`);
      results.push({ query, mode, routeOrder, candidateCount: result.candidates.length });
    }
  }

  const decemberQuery = "Berlin Munich 7 days in December";
  const december = await harness.runQuery(decemberQuery, "berlin-munich-december");
  assert.deepEqual(december.parsedIntent.requiredDestinationIds, ["Q64", "Q1726"], `${decemberQuery}: required cities`);
  assert.deepEqual(december.parsedIntent.timeIntent.months, [12], `${decemberQuery}: parsed month`);
  assert.deepEqual(
    december.parsedIntent.normalizedRouteIntent.hardConstraints.months.values,
    [12],
    `${decemberQuery}: normalized month`,
  );
  assert.equal(december.parsedIntent.normalizedRouteIntent.hardConstraints.exactDays.value, 7, `${decemberQuery}: exact days`);
  assert.notEqual(december.response.diagnostics.reason, "constraint-conflict", `${decemberQuery}: false conflict`);
  assert(december.response.records.length > 0, `${decemberQuery}: route expected`);
  assertExactSet(routeDestinationIds(december.response.records[0]), ["Q64", "Q1726"], decemberQuery);
  for (const candidate of december.candidates) {
    assertExactSet(candidate.proposedOrder, ["Q64", "Q1726"], `${decemberQuery}: ${candidate.candidateId}`);
  }
  results.push({
    query: decemberQuery,
    mode: "flexible+month",
    routeOrder: routeDestinationIds(december.response.records[0]),
    candidateCount: december.candidates.length,
  });

  const unknownQuery = "Berlin Atlantis Munich 7 days";
  const unknown = await harness.runQuery(unknownQuery, "berlin-unknown-munich");
  assert.equal(unknown.parsedIntent.parseSuccess, false, `${unknownQuery}: unknown city must fail closed`);
  assert(
    unknown.parsedIntent.unresolvedDestinationNames.includes("Atlantis"),
    `${unknownQuery}: unknown city diagnostic must be preserved`,
  );
  assert.equal(unknown.response.records.length, 0, `${unknownQuery}: no weakened route may be returned`);

  assert.equal(harness.externalFetchCalls(), 0, "multi-city verifier must not use external Evidence or images");
  console.log(JSON.stringify({
    verifier: "route-v2-multi-city-hard-constraints",
    passed: true,
    cases: results,
    externalFetchCalls: harness.externalFetchCalls(),
    acceptedWrites: 0,
  }, null, 2));
} finally {
  harness.close();
}
