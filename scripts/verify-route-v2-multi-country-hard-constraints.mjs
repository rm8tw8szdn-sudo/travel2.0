import assert from "node:assert/strict";

import { createRouteIntentFingerprint } from "../src/lib/routes/index.mjs";
import {
  createExplicitConstraintHarness,
  routeCountryCodes,
  routeDestinationCountryCodes,
} from "./lib/route-v2-explicit-constraint-harness.mjs";

const cases = [
  { id: "germany-austria", query: "Germany Austria 14 days", requiredCodes: ["DE", "AT"] },
  { id: "france-germany", query: "France Germany 14 days", requiredCodes: ["FR", "DE"] },
  { id: "spain-portugal", query: "Spain Portugal 14 days", requiredCodes: ["ES", "PT"] },
  { id: "italy-austria", query: "Italy Austria 14 days", requiredCodes: ["IT", "AT"] },
  { id: "france-spain", query: "France Spain 14 days", requiredCodes: ["FR", "ES"] },
  { id: "austria-germany", query: "Austria Germany 14 days", requiredCodes: ["AT", "DE"] },
  {
    id: "germany-austria-summer",
    query: "Germany Austria 14 days in summer",
    requiredCodes: ["DE", "AT"],
    expectedSeason: "summer",
  },
  {
    id: "spain-portugal-road-trip",
    query: "Spain Portugal road trip 14 days",
    requiredCodes: ["ES", "PT"],
    expectedTheme: "selfdrive",
    expectedConflictReason: "explicit-theme-mismatch",
  },
];

const fixedCases = [
  { id: "germany-to-austria", query: "Germany → Austria 14 days", requiredCodes: ["DE", "AT"] },
  { id: "france-then-germany-zh", query: "先法国再德国14天", requiredCodes: ["FR", "DE"] },
  { id: "france-to-germany", query: "France → Germany 14 days", requiredCodes: ["FR", "DE"] },
];

function assertExactSet(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: must not add or remove a country`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label}: required country coverage`);
}

const harness = createExplicitConstraintHarness("multi-country-hard-constraints");
const results = [];

try {
  for (const testCase of [
    ...cases.map((entry) => ({ ...entry, mode: "flexible" })),
    ...fixedCases.map((entry) => ({ ...entry, mode: "fixed" })),
  ]) {
    const result = await harness.runQuery(testCase.query, testCase.id);
    const intent = result.parsedIntent;
    assert.equal(intent.parseSuccess, true, `${testCase.query}: parser`);
    assert.deepEqual(intent.explicitCountryCodes, testCase.requiredCodes, `${testCase.query}: explicitCountryCodes`);
    assert.deepEqual(intent.requiredCountryCodes, testCase.requiredCodes, `${testCase.query}: requiredCountryCodes`);
    assertExactSet(intent.countryCodes, testCase.requiredCodes, `${testCase.query}: SearchIntent.countryCodes`);
    assert.equal(intent.destinationOrderMode, testCase.mode, `${testCase.query}: country order mode`);
    assertExactSet(
      intent.normalizedRouteIntent.hardConstraints.countries.values,
      testCase.requiredCodes,
      `${testCase.query}: RouteIntent countries`,
    );
    if (testCase.mode === "fixed") {
      assert.deepEqual(
        intent.normalizedRouteIntent.hardConstraints.countries.values,
        testCase.requiredCodes,
        `${testCase.query}: fixed normalized country order`,
      );
    }
    if (testCase.expectedSeason) {
      assert.equal(intent.timeIntent.season, testCase.expectedSeason, `${testCase.query}: parsed season`);
      assert.equal(
        intent.normalizedRouteIntent.hardConstraints.season.value,
        testCase.expectedSeason,
        `${testCase.query}: normalized season`,
      );
    }
    if (testCase.expectedTheme) {
      assert.equal(
        intent.normalizedRouteIntent.softPreferences.theme,
        testCase.expectedTheme,
        `${testCase.query}: normalized explicit theme`,
      );
      assert.equal(
        intent.normalizedRouteIntent.softPreferences.themeConstraintMode,
        "explicit",
        `${testCase.query}: explicit theme trust mode`,
      );
    }
    const fingerprint = createRouteIntentFingerprint(intent.normalizedRouteIntent);
    assert.equal(fingerprint.valid, true, `${testCase.query}: fingerprint schema`);
    for (const code of testCase.requiredCodes) {
      assert(fingerprint.canonical.includes(`\"${code}\"`), `${testCase.query}: fingerprint must include ${code}`);
    }

    if (testCase.expectedConflictReason) {
      assert.equal(result.response.records.length, 0, `${testCase.query}: untrusted explicit theme must fail closed`);
      assert.equal(result.response.diagnostics.reason, "constraint-conflict", `${testCase.query}: conflict expected`);
      assert(
        result.response.diagnostics.constraintConflict.reasonCodes.includes(testCase.expectedConflictReason),
        `${testCase.query}: ${testCase.expectedConflictReason}`,
      );
      for (const candidate of result.candidates) {
        assertExactSet(candidate.countries, testCase.requiredCodes, `${testCase.query}: ${candidate.candidateId}`);
      }
      results.push({
        query: testCase.query,
        mode: `${testCase.mode}+explicit-theme-conflict`,
        routeCountryCodes: [],
        destinationCountryCodes: [],
        candidateCountries: result.candidates.map((candidate) => candidate.countries),
        fingerprint: fingerprint.value,
      });
      continue;
    }

    assert.notEqual(result.response.diagnostics.reason, "constraint-conflict", `${testCase.query}: false conflict`);
    assert(result.response.records.length > 0, `${testCase.query}: route; ${JSON.stringify(result.response.diagnostics)}`);
    const record = result.response.records[0];
    const routeCodes = routeCountryCodes(record);
    const destinationCountryCodes = routeDestinationCountryCodes(record);
    assertExactSet(routeCodes, testCase.requiredCodes, `${testCase.query}: record countries`);
    assertExactSet(destinationCountryCodes, testCase.requiredCodes, `${testCase.query}: destination countries`);
    if (testCase.mode === "fixed") {
      assert.deepEqual(destinationCountryCodes, testCase.requiredCodes, `${testCase.query}: fixed route country order`);
    }
    assert.equal(result.candidates.length, 3, `${testCase.query}: Candidate count`);
    for (const candidate of result.candidates) {
      assertExactSet(candidate.countries, testCase.requiredCodes, `${testCase.query}: ${candidate.candidateId}`);
      const candidateOrder = [...new Set(candidate.destinations.map((entry) => entry.countryCode))];
      if (testCase.mode === "fixed") {
        assert.deepEqual(candidateOrder, testCase.requiredCodes, `${testCase.query}: fixed Candidate country order`);
      }
    }
    assert.equal(result.acceptedWrites, 0, `${testCase.query}: verifier must not write Accepted`);
    results.push({
      query: testCase.query,
      mode: testCase.mode,
      routeCountryCodes: routeCodes,
      destinationCountryCodes,
      candidateCountries: result.candidates.map((candidate) => candidate.countries),
      fingerprint: fingerprint.value,
    });
  }

  const impossibleQuery = "Germany Austria 1 day";
  const impossible = await harness.runQuery(impossibleQuery, "germany-austria-one-day-conflict");
  assert.deepEqual(impossible.parsedIntent.requiredCountryCodes, ["DE", "AT"], `${impossibleQuery}: required countries`);
  assert.equal(impossible.parsedIntent.normalizedRouteIntent.hardConstraints.exactDays.value, 1, `${impossibleQuery}: exact days`);
  assert.equal(impossible.response.records.length, 0, `${impossibleQuery}: must not return a weakened route`);
  assert.equal(impossible.response.diagnostics.reason, "constraint-conflict", `${impossibleQuery}: must fail closed`);
  assert.equal(impossible.acceptedWrites, 0, `${impossibleQuery}: verifier must not write Accepted`);
  results.push({
    query: impossibleQuery,
    mode: "conflict",
    routeCountryCodes: [],
    destinationCountryCodes: [],
    candidateCountries: impossible.candidates.map((candidate) => candidate.countries),
  });

  assert.equal(harness.externalFetchCalls(), 0, "multi-country verifier must not use external Evidence or images");
  console.log(JSON.stringify({
    verifier: "route-v2-multi-country-hard-constraints",
    passed: true,
    cases: results,
    externalFetchCalls: harness.externalFetchCalls(),
    acceptedWrites: 0,
  }, null, 2));
} finally {
  harness.close();
}
