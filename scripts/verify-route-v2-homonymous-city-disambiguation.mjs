import assert from "node:assert/strict";

import {
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  evaluateRouteIntentOracle,
  parseSearchIntent,
  validateRouteIntentInvariants,
} from "../src/lib/routes/index.mjs";
import {
  createExplicitConstraintHarness,
  routeCountryCodes,
  routeDestinationCountryCodes,
  routeDestinationIds,
} from "./lib/route-v2-explicit-constraint-harness.mjs";

function clean(value) {
  return String(value || "").trim().replace(/\s+/gu, " ");
}

function unique(values = []) {
  return [...new Set(values)];
}

function assertExactSet(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function exactAliasKey(value) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("en-US");
}

function accentFoldedAliasKey(value) {
  return exactAliasKey(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function collisionGroups(cities = [], keyForAlias) {
  const aliases = new Map();
  for (const city of cities) {
    const cityId = clean(city.wikidataId || city.entityId);
    for (const alias of unique([city.label, city.normalizedLabel, ...(city.aliases || [])])) {
      const key = keyForAlias(alias);
      if (!key) continue;
      const entries = aliases.get(key) || new Map();
      entries.set(cityId, {
        cityId,
        countryCode: clean(city.countryCode).toUpperCase(),
        name: clean(city.normalizedLabel || city.label),
      });
      aliases.set(key, entries);
    }
  }
  return [...aliases.entries()]
    .map(([alias, entries]) => ({ alias, cities: [...entries.values()] }))
    .filter((entry) => entry.cities.length > 1)
    .sort((left, right) => left.alias.localeCompare(right.alias, "en"));
}

const repository = createPublishedKnowledgeEntityLayerRepository();
const intentCatalog = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
const exactCollisions = collisionGroups(intentCatalog.cities, exactAliasKey);
const accentFoldedCollisions = collisionGroups(intentCatalog.cities, accentFoldedAliasKey);
const englishCollisions = accentFoldedCollisions.filter((entry) => /^[a-z0-9 ]+$/u.test(entry.alias));
const cjkCollisions = accentFoldedCollisions.filter((entry) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(entry.alias));
const countryAliasKeys = new Set(intentCatalog.countries.flatMap((country) => (
  [country.label, country.normalizedLabel, ...(country.aliases || [])].map(accentFoldedAliasKey)
)));
const unqualifiedCollisionGroups = accentFoldedCollisions.filter((entry) => !countryAliasKeys.has(entry.alias));

assert(exactCollisions.length > 0, "published City aliases must expose the known collision inventory");
assert(accentFoldedCollisions.some((entry) => entry.alias === "santiago"), "Santiago collision must be inventoried");
assert(accentFoldedCollisions.some((entry) => entry.alias === "lagos"), "Lagos collision must be inventoried");
assert(accentFoldedCollisions.some((entry) => entry.alias === "cordoba"), "Cordoba collision must be inventoried after accent folding");

const qualifiedCases = [
  { id: "fez-morocco-legacy-identity", query: "Fez Morocco 7 days", requiredIds: ["Q80985"], countryCodes: ["MA"] },
  { id: "marrakesh-morocco-legacy-identity", query: "Marrakesh Morocco 7 days", requiredIds: ["Q101625"], countryCodes: ["MA"] },
  { id: "santiago-chile", query: "Santiago Chile 7 days", requiredIds: ["Q2887"], countryCodes: ["CL"] },
  { id: "santiago-chile-buenos-aires", query: "Santiago de Chile Buenos Aires 14 days", requiredIds: ["Q2887", "Q1486"], countryCodes: ["CL", "AR"] },
  { id: "lagos-nigeria", query: "Lagos Nigeria 7 days", requiredIds: ["Q8673"], countryCodes: ["NG"] },
  { id: "cordoba-spain", query: "Cordoba Spain 7 days", requiredIds: ["Q5818"], countryCodes: ["ES"] },
  { id: "lagos-portugal", query: "Lagos Portugal 7 days", requiredIds: ["Q732548"], countryCodes: ["PT"] },
  { id: "cordoba-argentina", query: "Cordoba Argentina 7 days", requiredIds: ["Q44210"], countryCodes: ["AR"] },
  { id: "rabat-malta", query: "Rabat Malta 7 days", requiredIds: ["Q44381"], countryCodes: ["MT"] },
  { id: "rabat-morocco", query: "Rabat Morocco 7 days", requiredIds: ["Q3551"], countryCodes: ["MA"] },
  { id: "colon-panama", query: "Colón Panama 7 days", requiredIds: ["Q12825018"], countryCodes: ["PA"] },
  { id: "cologne-germany", query: "Cologne Germany 7 days", requiredIds: ["Q365"], countryCodes: ["DE"] },
];
const unqualifiedCases = ["Santiago 7 days", "Lagos 7 days", "Cordoba 7 days", "Rabat 7 days", "杜林 7 days", "科隆 7 days"];
const harness = createExplicitConstraintHarness("homonymous-city-disambiguation");
const results = [];
let countryFilterMutationKilled = false;
let wrongCountryMutationKilled = false;
let extraCountryMutationKilled = false;

try {
  for (const collision of unqualifiedCollisionGroups) {
    const ambiguousIntent = parseSearchIntent(`${collision.alias} 7 days`, {
      catalogs: intentCatalog,
      timeIntentEnabled: true,
    });
    assert.equal(ambiguousIntent.parseSuccess, false, `${collision.alias}: every unqualified collision must fail closed`);
    assert(
      ambiguousIntent.destinationDiagnostics.some((entry) => entry.code === "ambiguous-city-alias"),
      `${collision.alias}: collision must retain its ambiguity diagnostic`,
    );
  }

  for (const collision of accentFoldedCollisions) {
    for (const city of collision.cities) {
      const country = intentCatalog.countries.find((entry) => clean(entry.code).toUpperCase() === city.countryCode);
      assert(country, `${collision.alias}/${city.countryCode}: Country catalog entry is required`);
      const qualifiedIntent = parseSearchIntent(`${collision.alias} ${country.label} 7 days`, {
        catalogs: intentCatalog,
        timeIntentEnabled: true,
      });
      assert.equal(qualifiedIntent.parseSuccess, true, `${collision.alias}/${city.countryCode}: Country-qualified collision must resolve`);
      assert.deepEqual(
        qualifiedIntent.requiredDestinationIds,
        [city.cityId],
        `${collision.alias}/${city.countryCode}: Country-qualified collision must select the exact City`,
      );
    }
  }

  for (const testCase of qualifiedCases) {
    const result = await harness.runQuery(testCase.query, testCase.id);
    const intent = result.parsedIntent;
    assert.equal(intent.parseSuccess, true, `${testCase.query}: parser must resolve the qualified City`);
    assert.deepEqual(intent.requiredDestinationIds, testCase.requiredIds, `${testCase.query}: exact required City QIDs`);
    assertExactSet(
      intent.normalizedRouteIntent.hardConstraints.countries.values,
      testCase.countryCodes,
      `${testCase.query}: normalized Country constraints`,
    );
    assert(result.response.records.length > 0, `${testCase.query}: production route expected`);
    const record = result.response.records[0];
    assertExactSet(routeDestinationIds(record), testCase.requiredIds, `${testCase.query}: final route City QIDs`);
    assertExactSet(routeDestinationCountryCodes(record), testCase.countryCodes, `${testCase.query}: destination countries`);
    assertExactSet(routeCountryCodes(record), testCase.countryCodes, `${testCase.query}: route countries`);
    for (const candidate of result.candidates) {
      assertExactSet(candidate.proposedOrder, testCase.requiredIds, `${testCase.query}: Candidate City QIDs`);
      assertExactSet(candidate.countries, testCase.countryCodes, `${testCase.query}: Candidate countries`);
    }
    assert.equal(result.acceptedWrites, 0, `${testCase.query}: Accepted must remain unchanged`);

    if (testCase.id === "santiago-chile") {
      countryFilterMutationKilled = intent.requiredDestinationIds[0] === "Q2887";
      const mutated = structuredClone(record);
      mutated.destinationEntities.push({
        entityId: "city-7cc50855c97464fe",
        wikidataId: "Q14314",
        countryCode: "ES",
        name: "Santiago de Compostela",
        canonicalNameEn: "Santiago de Compostela",
        entityTypeName: "city",
      });
      mutated.destinations = [...(mutated.destinations || []), "Santiago de Compostela"];
      mutated.cities = [...(mutated.cities || []), "Santiago de Compostela"];
      mutated.countryCodes = unique([...(mutated.countryCodes || []), "ES"]);
      mutated.countries = unique([...(mutated.countries || []), "ES"]);
      mutated.countryEntities = [
        ...(mutated.countryEntities || []),
        { countryCode: "ES", name: "Spain", wikidataId: "Q29" },
      ];
      const gate = validateRouteIntentInvariants(mutated, intent.normalizedRouteIntent, {
        source: "homonymous-extra-country-mutation",
        claimedSuccess: true,
      });
      const oracle = evaluateRouteIntentOracle(intent.normalizedRouteIntent, mutated, { claimedSuccess: true });
      assert.equal(gate.matched, false, "Production gate must reject an extra same-name City country");
      assert.equal(oracle.matched, false, "Oracle must reject an extra same-name City country");
      extraCountryMutationKilled = true;
    }

    results.push({
      query: testCase.query,
      requiredIds: intent.requiredDestinationIds,
      countryCodes: routeCountryCodes(record),
    });
  }

  for (const query of unqualifiedCases) {
    const result = await harness.runQuery(query, `unqualified-${query.split(" ")[0].toLocaleLowerCase("en-US")}`);
    assert.equal(result.parsedIntent.parseSuccess, false, `${query}: ambiguous City must fail closed`);
    assert(
      ["unresolved-destination", "destination-confirmation-required"].includes(result.parsedIntent.failureReason),
      `${query}: ambiguity failure reason`,
    );
    assert(
      result.parsedIntent.destinationDiagnostics.some((entry) => entry.code === "ambiguous-city-alias"),
      `${query}: ambiguity diagnostic`,
    );
    assert.equal(result.response.records.length, 0, `${query}: no arbitrary route may be returned`);
  }

  const mutatedCatalog = {
    ...intentCatalog,
    cities: intentCatalog.cities.map((city) => (
      city.wikidataId === "Q2887" ? { ...city, countryCode: "ES" } : city
    )),
  };
  const wrongCountryIntent = parseSearchIntent("Santiago Chile 7 days", {
    catalogs: mutatedCatalog,
    timeIntentEnabled: true,
  });
  assert.equal(wrongCountryIntent.parseSuccess, false, "wrong-Country same-name mutation must fail closed");
  assert.equal(wrongCountryIntent.failureReason, "unresolved-destination");
  wrongCountryMutationKilled = true;

  assert.equal(countryFilterMutationKilled, true, "deleting Country filtering must be killed");
  assert.equal(wrongCountryMutationKilled, true, "wrong-Country City mutation must be killed");
  assert.equal(extraCountryMutationKilled, true, "extra-Country final result mutation must be killed");
  assert.equal(harness.externalFetchCalls(), 0, "verifier must not use external Evidence or images");

  console.log(JSON.stringify({
    verifier: "route-v2-homonymous-city-disambiguation",
    status: "PASS",
    collisions: {
      exact: exactCollisions.length,
      accentFolded: accentFoldedCollisions.length,
      english: englishCollisions.length,
      cjk: cjkCollisions.length,
      unqualified: unqualifiedCollisionGroups.length,
      inventory: accentFoldedCollisions.map((entry) => ({
        alias: entry.alias,
        cities: entry.cities.map((city) => ({ cityId: city.cityId, countryCode: city.countryCode })),
      })),
    },
    results,
    unqualifiedFailClosed: unqualifiedCases,
    mutations: {
      countryFilterMutationKilled,
      wrongCountryMutationKilled,
      extraCountryMutationKilled,
    },
    externalFetchCalls: harness.externalFetchCalls(),
    acceptedWrites: 0,
  }, null, 2));
} finally {
  harness.close();
}
