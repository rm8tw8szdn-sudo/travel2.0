import assert from "node:assert/strict";

import {
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  parseSearchIntent,
} from "../src/lib/routes/index.mjs";
import {
  createExplicitConstraintHarness,
  routeCountryCodes,
  routeDestinationIds,
} from "./lib/route-v2-explicit-constraint-harness.mjs";

function exactSet(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
}

const repository = createPublishedKnowledgeEntityLayerRepository();
const catalogs = createKnowledgeEntityLayerSearchIntentCatalog({ repository });

const parserCases = Object.freeze([
  Object.freeze({ query: "San Salvador El Salvador 7 days", cities: ["Q3110"], countries: ["SV"], explicitCountries: ["SV"] }),
  Object.freeze({ query: "San Salvador 7 days", cities: ["Q3110"], countries: ["SV"], explicitCountries: [] }),
  Object.freeze({ query: "Salvador Brazil 7 days", cities: ["Q36947"], countries: ["BR"], explicitCountries: ["BR"] }),
  Object.freeze({ query: "El Salvador 7 days", cities: [], countries: ["SV"], explicitCountries: ["SV"] }),
  Object.freeze({ query: "San Salvador Guatemala 14 days", cities: ["Q3110"], countries: ["GT", "SV"], explicitCountries: ["GT"] }),
  Object.freeze({ query: "Santiago de Chile Buenos Aires 14 days", cities: ["Q2887", "Q1486"], countries: ["AR", "CL"], explicitCountries: ["CL"] }),
  Object.freeze({ query: "Rio de Janeiro Brazil 7 days", cities: ["Q8678"], countries: ["BR"], explicitCountries: ["BR"] }),
]);

for (const testCase of parserCases) {
  const intent = parseSearchIntent(testCase.query, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.parseSuccess, true, `${testCase.query}: parser must resolve`);
  assert.deepEqual(intent.requiredDestinationIds, testCase.cities, `${testCase.query}: longest City spans`);
  exactSet(intent.countryCodes, testCase.countries, `${testCase.query}: Country set`);
  assert.deepEqual(intent.explicitCountryCodes, testCase.explicitCountries, `${testCase.query}: explicit Country spans`);
  assert.equal(intent.countryCodes.includes("GR"), false, `${testCase.query}: short alias el must not become Greece`);
  assert.equal(intent.countryCodes.includes("DE"), false, `${testCase.query}: preposition de must not become Germany`);
}

for (const query of ["Santiago 7 days", "Lagos 7 days", "Cordoba 7 days"]) {
  const intent = parseSearchIntent(query, { catalogs, timeIntentEnabled: true });
  assert.equal(intent.parseSuccess, false, `${query}: unqualified homonym must remain fail-closed`);
  assert(intent.destinationDiagnostics.some((entry) => entry.code === "ambiguous-city-alias"), `${query}: ambiguity diagnostic`);
}

const harness = createExplicitConstraintHarness("overlapping-entity-parser");
const productionCases = Object.freeze([
  Object.freeze({ label: "san-salvador-el-salvador", query: "San Salvador El Salvador 7 days", requiredCities: ["Q3110"], countries: ["SV"] }),
  Object.freeze({ label: "salvador-brazil", query: "Salvador Brazil 7 days", requiredCities: ["Q36947"], countries: ["BR"] }),
  Object.freeze({ label: "san-salvador-guatemala", query: "San Salvador Guatemala 14 days", requiredCities: ["Q3110"], countries: ["GT", "SV"] }),
]);

const production = [];
try {
  for (const testCase of productionCases) {
    const result = await harness.runQuery(testCase.query, testCase.label);
    assert.equal(result.parsedIntent.parseSuccess, true, `${testCase.query}: production parse`);
    assert(result.response.records.length > 0, `${testCase.query}: production route`);
    const record = result.response.records[0];
    for (const cityQid of testCase.requiredCities) {
      assert(routeDestinationIds(record).includes(cityQid), `${testCase.query}: required City ${cityQid}`);
    }
    exactSet(routeCountryCodes(record), testCase.countries, `${testCase.query}: production Country hard constraints`);
    assert.equal(routeCountryCodes(record).includes("GR"), false, `${testCase.query}: no spurious Greece`);
    assert.equal(routeCountryCodes(record).includes("DE"), false, `${testCase.query}: no spurious Germany`);
    production.push({
      query: testCase.query,
      cityQids: routeDestinationIds(record),
      countryCodes: routeCountryCodes(record),
    });
  }
  assert.equal(harness.externalFetchCalls(), 0, "overlap verifier must not make external requests");
} finally {
  harness.close();
}

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-overlapping-entity-parser",
  status: "PASS",
  parserCases: parserCases.length,
  ambiguousFailClosed: 3,
  productionCases: production,
}, null, 2)}\n`);
