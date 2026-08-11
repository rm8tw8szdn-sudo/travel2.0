import assert from "node:assert/strict";

import {
  createRouteIntentFingerprint,
  evaluateRouteIntentOracle,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";
import {
  createExplicitConstraintHarness,
  routeCountryCodes,
  routeDestinationIds,
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

const mixedCases = [
  {
    id: "berlin-austria",
    query: "Berlin Austria 14 days",
    requiredCityIds: ["Q64"],
    explicitCountryCodes: ["AT"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    id: "germany-vienna",
    query: "Germany Vienna 14 days",
    requiredCityIds: ["Q1741"],
    explicitCountryCodes: ["DE"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    id: "berlin-munich-austria",
    query: "Berlin Munich Austria 14 days",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    id: "germany-vienna-salzburg",
    query: "Germany Vienna Salzburg 14 days",
    requiredCityIds: ["Q1741", "Q34713"],
    explicitCountryCodes: ["DE"],
    requiredRouteCountries: ["AT", "DE"],
  },
  {
    id: "austria-to-germany-berlin",
    query: "Austria → Germany Berlin 14 days",
    requiredCityIds: ["Q64"],
    explicitCountryCodes: ["AT", "DE"],
    requiredRouteCountries: ["AT", "DE"],
    expectedDestinationOrderMode: "unspecified",
    expectedCountryOrderMode: "fixed",
    expectedCountryOrder: ["AT", "DE"],
  },
  {
    id: "germany-to-austria-berlin",
    query: "Germany → Austria Berlin 14 days",
    requiredCityIds: ["Q64"],
    explicitCountryCodes: ["DE", "AT"],
    requiredRouteCountries: ["DE", "AT"],
    expectedDestinationOrderMode: "unspecified",
    expectedCountryOrderMode: "fixed",
    expectedCountryOrder: ["DE", "AT"],
  },
  {
    id: "berlin-to-munich-austria",
    query: "Berlin → Munich Austria 14 days",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT"],
    requiredRouteCountries: ["AT", "DE"],
    expectedDestinationOrderMode: "fixed",
    expectedCountryOrderMode: "unspecified",
    expectedCityOrder: ["Q64", "Q1726"],
  },
  {
    id: "country-arrow-does-not-fix-cities",
    query: "Austria → Germany Berlin Munich 14 days",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT", "DE"],
    requiredRouteCountries: ["AT", "DE"],
    expectedDestinationOrderMode: "flexible",
    expectedCountryOrderMode: "fixed",
    expectedCountryOrder: ["AT", "DE"],
  },
  {
    id: "city-arrow-does-not-fix-countries",
    query: "Austria Germany Berlin → Munich 14 days",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT", "DE"],
    requiredRouteCountries: ["AT", "DE"],
    expectedDestinationOrderMode: "fixed",
    expectedCountryOrderMode: "flexible",
    expectedCityOrder: ["Q64", "Q1726"],
  },
  {
    id: "zh-country-arrow-does-not-fix-cities",
    query: "奥地利 → 德国 柏林 慕尼黑 14天",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT", "DE"],
    requiredRouteCountries: ["AT", "DE"],
    expectedDestinationOrderMode: "flexible",
    expectedCountryOrderMode: "fixed",
    expectedCountryOrder: ["AT", "DE"],
  },
  {
    id: "zh-city-arrow-does-not-fix-countries",
    query: "奥地利 德国 柏林 → 慕尼黑 14天",
    requiredCityIds: ["Q64", "Q1726"],
    explicitCountryCodes: ["AT", "DE"],
    requiredRouteCountries: ["AT", "DE"],
    expectedDestinationOrderMode: "fixed",
    expectedCountryOrderMode: "flexible",
    expectedCityOrder: ["Q64", "Q1726"],
  },
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
    assert.equal(intent.countryOrderMode, testCase.mode, `${testCase.query}: country order mode`);
    assert.equal(intent.destinationOrderMode, "unspecified", `${testCase.query}: country syntax must not set city order`);
    assertExactSet(
      intent.normalizedRouteIntent.hardConstraints.countries.values,
      testCase.requiredCodes,
      `${testCase.query}: RouteIntent countries`,
    );
    assert.equal(
      intent.normalizedRouteIntent.hardConstraints.countryOrderMode.value,
      testCase.mode,
      `${testCase.query}: RouteIntent country order mode`,
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

  for (const testCase of mixedCases) {
    const result = await harness.runQuery(testCase.query, testCase.id);
    const intent = result.parsedIntent;
    assert.equal(intent.parseSuccess, true, `${testCase.query}: parser`);
    assert.deepEqual(intent.requiredDestinationIds, testCase.requiredCityIds, `${testCase.query}: required cities`);
    assert.deepEqual(intent.requiredCountryCodes, testCase.explicitCountryCodes, `${testCase.query}: explicit countries`);
    if (testCase.expectedDestinationOrderMode) {
      assert.equal(intent.destinationOrderMode, testCase.expectedDestinationOrderMode, `${testCase.query}: city order mode`);
    }
    if (testCase.expectedCountryOrderMode) {
      assert.equal(intent.countryOrderMode, testCase.expectedCountryOrderMode, `${testCase.query}: country order mode`);
    }
    assertExactSet(
      intent.normalizedRouteIntent.hardConstraints.countries.values,
      testCase.requiredRouteCountries,
      `${testCase.query}: normalized countries`,
    );
    const normalizedCountryOrderMode = intent.normalizedRouteIntent.hardConstraints.countryOrderMode;
    if (testCase.expectedCountryOrderMode === "fixed" || testCase.expectedCountryOrderMode === "flexible") {
      assert.equal(normalizedCountryOrderMode?.value, testCase.expectedCountryOrderMode, `${testCase.query}: normalized country order mode`);
    } else if (testCase.expectedCountryOrderMode === "unspecified") {
      assert.equal(normalizedCountryOrderMode, undefined, `${testCase.query}: must not invent country order`);
    }
    const mixedFingerprint = createRouteIntentFingerprint(intent.normalizedRouteIntent);
    assert.equal(mixedFingerprint.valid, true, `${testCase.query}: mixed fingerprint schema`);
    assert.notEqual(result.response.diagnostics.reason, "constraint-conflict", `${testCase.query}: false conflict`);
    assert(result.response.records.length > 0, `${testCase.query}: expected a legal mixed-constraint route`);
    const record = result.response.records[0];
    const routeIds = routeDestinationIds(record);
    for (const cityId of testCase.requiredCityIds) {
      assert(routeIds.includes(cityId), `${testCase.query}: missing required city ${cityId}`);
    }
    assertExactSet(
      routeDestinationCountryCodes(record),
      testCase.requiredRouteCountries,
      `${testCase.query}: route countries`,
    );
    if (testCase.expectedCountryOrder) {
      assert.deepEqual(routeDestinationCountryCodes(record), testCase.expectedCountryOrder, `${testCase.query}: fixed country order`);
    }
    if (testCase.expectedCityOrder) {
      const positions = testCase.expectedCityOrder.map((cityId) => routeIds.indexOf(cityId));
      assert(positions.every((position, index) => index === 0 || positions[index - 1] < position), `${testCase.query}: fixed city order`);
    }
    assert.equal(result.candidates.length, 3, `${testCase.query}: Candidate count`);
    for (const candidate of result.candidates) {
      for (const cityId of testCase.requiredCityIds) {
        assert(candidate.proposedOrder.includes(cityId), `${testCase.query}: Candidate missing ${cityId}`);
      }
      assertExactSet(candidate.countries, testCase.requiredRouteCountries, `${testCase.query}: Candidate countries`);
      const candidateCountryOrder = [...new Set(candidate.destinations.map((entry) => entry.countryCode))];
      if (testCase.expectedCountryOrder) {
        assert.deepEqual(candidateCountryOrder, testCase.expectedCountryOrder, `${testCase.query}: Candidate fixed country order`);
      }
      if (testCase.expectedCityOrder) {
        const positions = testCase.expectedCityOrder.map((cityId) => candidate.proposedOrder.indexOf(cityId));
        assert(positions.every((position, index) => index === 0 || positions[index - 1] < position), `${testCase.query}: Candidate fixed city order`);
      }
    }
    assert.equal(result.acceptedWrites, 0, `${testCase.query}: verifier must not write Accepted`);
    if (testCase.id === "berlin-austria") {
      const withoutAustria = structuredClone(record);
      const retainedIndexes = withoutAustria.destinationEntities
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.countryCode !== "AT")
        .map(({ index }) => index);
      withoutAustria.destinationEntities = retainedIndexes.map((index) => withoutAustria.destinationEntities[index]);
      withoutAustria.destinations = retainedIndexes.map((index) => withoutAustria.destinations[index]);
      const missingCountryGate = validateRouteIntentInvariants(withoutAustria, intent.normalizedRouteIntent, {
        source: "mixed-required-country-mutation",
        claimedSuccess: true,
      });
      const missingCountryOracle = evaluateRouteIntentOracle(intent.normalizedRouteIntent, withoutAustria, {
        claimedSuccess: true,
      });
      assert.equal(missingCountryGate.matched, false, `${testCase.query}: production gate must kill required-country deletion`);
      assert.equal(missingCountryOracle.matched, false, `${testCase.query}: Oracle must kill required-country deletion`);

      const withExtraGermanCity = structuredClone(record);
      withExtraGermanCity.destinationEntities.push({
        ...structuredClone(withExtraGermanCity.destinationEntities.find((entry) => entry.countryCode === "DE")),
        wikidataId: "mutation:unexpected-de-city",
        entityId: "mutation:unexpected-de-city",
        name: "Unexpected German City",
      });
      withExtraGermanCity.destinations.push("Unexpected German City");
      const extraCityGate = validateRouteIntentInvariants(withExtraGermanCity, intent.normalizedRouteIntent, {
        source: "mixed-unexpected-city-mutation",
        claimedSuccess: true,
      });
      const extraCityOracle = evaluateRouteIntentOracle(intent.normalizedRouteIntent, withExtraGermanCity, {
        claimedSuccess: true,
      });
      assert(extraCityGate.reasonCodes.includes("unexpected-city-added"), `${testCase.query}: production gate must kill extra same-country city`);
      assert(extraCityOracle.violationCodes.includes("unexpected-city-added"), `${testCase.query}: Oracle must kill extra same-country city`);
    }
    if (testCase.id === "austria-to-germany-berlin") {
      const reversedCountries = structuredClone(record);
      reversedCountries.destinationEntities.reverse();
      reversedCountries.destinations.reverse();
      const reversedCountryGate = validateRouteIntentInvariants(reversedCountries, intent.normalizedRouteIntent, {
        source: "mixed-fixed-country-mutation",
        claimedSuccess: true,
      });
      const reversedCountryOracle = evaluateRouteIntentOracle(intent.normalizedRouteIntent, reversedCountries, {
        claimedSuccess: true,
      });
      assert(reversedCountryGate.reasonCodes.includes("fixed-country-order-mismatch"), `${testCase.query}: production gate must kill reversed country order`);
      assert(reversedCountryOracle.violationCodes.includes("fixed-country-order-mismatch"), `${testCase.query}: Oracle must kill reversed country order`);
    }
    if (testCase.id === "berlin-to-munich-austria") {
      const reversedCities = structuredClone(record);
      [reversedCities.destinationEntities[0], reversedCities.destinationEntities[1]] = [
        reversedCities.destinationEntities[1],
        reversedCities.destinationEntities[0],
      ];
      [reversedCities.destinations[0], reversedCities.destinations[1]] = [
        reversedCities.destinations[1],
        reversedCities.destinations[0],
      ];
      const reversedCityGate = validateRouteIntentInvariants(reversedCities, intent.normalizedRouteIntent, {
        source: "mixed-fixed-city-mutation",
        claimedSuccess: true,
      });
      const reversedCityOracle = evaluateRouteIntentOracle(intent.normalizedRouteIntent, reversedCities, {
        claimedSuccess: true,
      });
      assert(reversedCityGate.reasonCodes.includes("fixed-order-mismatch"), `${testCase.query}: production gate must kill reversed city order`);
      assert(reversedCityOracle.violationCodes.includes("fixed-order-mismatch"), `${testCase.query}: Oracle must kill reversed city order`);
    }
    results.push({
      query: testCase.query,
      mode: "mixed-explicit",
      routeCountryCodes: routeCountryCodes(record),
      destinationCountryCodes: routeDestinationCountryCodes(record),
      requiredCityIds: testCase.requiredCityIds,
      fingerprint: mixedFingerprint.value,
    });
  }

  assert.notEqual(
    results.find((entry) => entry.query === "Austria → Germany Berlin 14 days")?.fingerprint,
    results.find((entry) => entry.query === "Germany → Austria Berlin 14 days")?.fingerprint,
    "opposite fixed country orders must have different fingerprints",
  );

  const impossibleMixedQuery = "Berlin Austria 1 day";
  const impossibleMixed = await harness.runQuery(impossibleMixedQuery, "berlin-austria-one-day-conflict");
  assert.deepEqual(impossibleMixed.parsedIntent.requiredDestinationIds, ["Q64"], `${impossibleMixedQuery}: required city`);
  assert.deepEqual(impossibleMixed.parsedIntent.requiredCountryCodes, ["AT"], `${impossibleMixedQuery}: explicit country`);
  assertExactSet(
    impossibleMixed.parsedIntent.normalizedRouteIntent.hardConstraints.countries.values,
    ["AT", "DE"],
    `${impossibleMixedQuery}: normalized countries`,
  );
  assert.equal(impossibleMixed.response.records.length, 0, `${impossibleMixedQuery}: must not weaken constraints`);
  assert.equal(impossibleMixed.response.diagnostics.reason, "constraint-conflict", `${impossibleMixedQuery}: must fail closed`);
  assert.equal(impossibleMixed.acceptedWrites, 0, `${impossibleMixedQuery}: verifier must not write Accepted`);
  results.push({
    query: impossibleMixedQuery,
    mode: "mixed-explicit-conflict",
    routeCountryCodes: [],
    destinationCountryCodes: [],
    requiredCityIds: ["Q64"],
  });

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
    mixedConstraintMutationsKilled: 8,
  }, null, 2));
} finally {
  harness.close();
}
