import assert from "node:assert/strict";
import {
  validateFallbackRouteAgainstIntent,
} from "../src/lib/routes/route-fallback-constraint-validator.mjs";
import { createRouteSearchService } from "../src/lib/routes/route-search-service.mjs";

const CITY = {
  tokyo: { id: "Q1490", name: "东京" },
  kyoto: { id: "Q34600", name: "京都" },
  osaka: { id: "Q35765", name: "大阪" },
  nara: { id: "Q169134", name: "奈良" },
  kanazawa: { id: "anchor:JP:kanazawa", name: "金泽" },
};

function route(id, cities, overrides = {}) {
  return {
    id,
    name: `${cities.map((city) => city.name).join("到")}路线`,
    canonicalTitle: `${cities.map((city) => city.name).join("到")}路线`,
    summary: `依次串联${cities.map((city) => city.name).join("、")}。`,
    recommendationText: "保留用户明确指定的目的地、顺序和时长。",
    countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "日本" }],
    destinationEntities: cities.map((city) => ({ wikidataId: city.id, entityId: city.id, name: city.name, countryCode: "JP" })),
    countries: ["JP"],
    destinations: cities.map((city) => city.name),
    durationDays: 7,
    recommendedDays: "7天",
    bestMonths: [],
    themes: ["经典首访"],
    tags: ["单国路线"],
    source: { name: "Verifier", url: "" },
    sourceType: "planner-designed",
    destinationSource: "knowledge-graph",
    contentQualityStatus: "accepted",
    enrichmentStatus: "enriched",
    classification: "single",
    ...overrides,
  };
}

function intent(cities, overrides = {}) {
  return {
    intentMode: "specified-destination",
    countryCode: "JP",
    region: "",
    normalizedRegion: "",
    requiredDestinationIds: cities.map((city) => city.id),
    requiredDestinationNames: cities.map((city) => city.name),
    destinationOrderMode: "flexible",
    durationDays: 7,
    timeIntent: { type: "unspecified", months: [], season: null, rawText: "", diagnostics: [] },
    ...overrides,
  };
}

function countryRoute(id, countries, overrides = {}) {
  return {
    id,
    destinationEntities: countries.map((country, index) => ({
      wikidataId: `Q-country-${country}`,
      name: `${country}-city-${index + 1}`,
      countryCode: country,
    })),
    countryEntities: countries.map((countryCode) => ({ countryCode })),
    countries: [...countries],
    durationDays: 14,
    recommendedDays: "14天",
    searchStatus: "search-generated",
    ...overrides,
  };
}

const requiredFour = [CITY.tokyo, CITY.kyoto, CITY.osaka, CITY.nara];
const pureCases = {
  flexibleComplete: validateFallbackRouteAgainstIntent(
    route("flexible-complete", [CITY.osaka, CITY.tokyo, CITY.nara, CITY.kyoto]),
    intent(requiredFour),
  ),
  missingCity: validateFallbackRouteAgainstIntent(
    route("missing-city", [CITY.tokyo, CITY.kyoto, CITY.osaka]),
    intent(requiredFour),
  ),
  fixedOrder: validateFallbackRouteAgainstIntent(
    route("fixed-order", requiredFour),
    intent(requiredFour, { destinationOrderMode: "fixed" }),
  ),
  fixedOrderMismatch: validateFallbackRouteAgainstIntent(
    route("fixed-order-mismatch", [CITY.tokyo, CITY.osaka, CITY.kyoto, CITY.nara]),
    intent(requiredFour, { destinationOrderMode: "fixed" }),
  ),
  durationMismatch: validateFallbackRouteAgainstIntent(
    route("duration-mismatch", requiredFour, { durationDays: 8, recommendedDays: "8天" }),
    intent(requiredFour),
  ),
  capacityConflict: validateFallbackRouteAgainstIntent(
    route("capacity-conflict", requiredFour, { durationDays: 1, recommendedDays: "1天" }),
    intent(requiredFour, { durationDays: 1 }),
  ),
  monthCompatible: validateFallbackRouteAgainstIntent(
    route("month-compatible", [CITY.tokyo, CITY.kyoto], {
      durationDays: 2,
      recommendedDays: "2天",
      bestMonths: ["1-3月"],
      timeIntent: { type: "single-month", months: [2], season: null },
      evidenceValidationStatus: "ready",
    }),
    intent([], { durationDays: 2, timeIntent: { type: "single-month", months: [2], season: null } }),
  ),
  monthConflict: validateFallbackRouteAgainstIntent(
    route("month-conflict", [CITY.tokyo, CITY.kyoto], {
      durationDays: 2,
      recommendedDays: "2天",
      bestMonths: ["10-11月"],
      timeIntent: { type: "single-month", months: [10], season: null },
    }),
    intent([], { durationDays: 2, timeIntent: { type: "single-month", months: [2], season: null } }),
  ),
  monthNeedsEvidence: validateFallbackRouteAgainstIntent(
    route("month-needs-evidence", [CITY.tokyo, CITY.kyoto], { durationDays: 2, recommendedDays: "2天", bestMonths: [] }),
    intent([], { durationDays: 2, timeIntent: { type: "single-month", months: [2], season: null } }),
  ),
  seasonConflict: validateFallbackRouteAgainstIntent(
    route("season-conflict", [CITY.tokyo, CITY.kyoto], {
      name: "日本秋季红叶路线",
      seasons: ["autumn"],
      durationDays: 2,
      recommendedDays: "2天",
    }),
    intent([], { durationDays: 2, timeIntent: { type: "season-only", months: [], season: "winter" } }),
  ),
  countryConflict: validateFallbackRouteAgainstIntent(
    route("country-conflict", [CITY.tokyo, CITY.kyoto], {
      countryEntities: [{ wikidataId: "Q55", countryCode: "NL", name: "荷兰" }],
      countries: ["NL"],
      destinationEntities: [CITY.tokyo, CITY.kyoto]
        .map((city) => ({ wikidataId: city.id, entityId: city.id, name: city.name, countryCode: "NL" })),
    }),
    intent([CITY.tokyo, CITY.kyoto]),
  ),
  multiCountryComplete: validateFallbackRouteAgainstIntent(
    countryRoute("multi-country-complete", ["DE", "AT"]),
    intent([], {
      countryCode: "DE",
      countryCodes: ["DE", "AT"],
      requiredCountryCodes: ["DE", "AT"],
      durationDays: 14,
    }),
  ),
  multiCountryMissing: validateFallbackRouteAgainstIntent(
    countryRoute("multi-country-missing", ["DE"], {
      countryEntities: ["DE", "AT"].map((countryCode) => ({ countryCode })),
    }),
    intent([], {
      countryCode: "DE",
      countryCodes: ["DE", "AT"],
      requiredCountryCodes: ["DE", "AT"],
      durationDays: 14,
    }),
  ),
  fixedCountryOrderMismatch: validateFallbackRouteAgainstIntent(
    countryRoute("fixed-country-order-mismatch", ["AT", "DE"]),
    intent([], {
      countryCode: "DE",
      countryCodes: ["DE", "AT"],
      requiredCountryCodes: ["DE", "AT"],
      destinationOrderMode: "fixed",
      durationDays: 14,
    }),
  ),
};

assert.equal(pureCases.flexibleComplete.matched, true);
assert.equal(pureCases.missingCity.matched, false);
assert.deepEqual(pureCases.missingCity.missingRequiredDestinationIds, [CITY.nara.id]);
assert.equal(pureCases.fixedOrder.matched, true);
assert.equal(pureCases.fixedOrderMismatch.orderMismatch, true);
assert.equal(pureCases.durationMismatch.durationConflict, true);
assert.equal(pureCases.capacityConflict.capacityConflict, true);
assert(pureCases.capacityConflict.reasonCodes.includes("duration-capacity-conflict"));
assert.equal(pureCases.monthCompatible.matched, true);
assert.equal(pureCases.monthCompatible.requiresEvidence, false);
assert.equal(pureCases.monthConflict.timeConstraintConflict, true);
assert.equal(pureCases.monthNeedsEvidence.matched, true);
assert.equal(pureCases.monthNeedsEvidence.requiresEvidence, true);
assert.equal(pureCases.seasonConflict.timeConstraintConflict, true);
assert.equal(pureCases.countryConflict.countryConflict, true);
assert.equal(pureCases.multiCountryComplete.matched, true);
assert.equal(pureCases.multiCountryMissing.countryConflict, true);
assert.equal(pureCases.fixedCountryOrderMismatch.countryConflict, true);
assert.equal(pureCases.fixedCountryOrderMismatch.orderMismatch, true);

function searchCache() {
  const state = { puts: 0, reviews: 0, records: [] };
  return {
    get() { return null; },
    put(entry) { state.puts += 1; state.records = structuredClone(entry.records || []); return entry; },
    appendReviewCandidates(entry) { state.reviews += 1; return entry; },
    findRoute() { return null; },
    state,
  };
}

function repository(records) {
  const state = { upserts: 0 };
  return {
    list() { return { records: structuredClone(records) }; },
    upsert() { state.upserts += 1; return { accepted: true }; },
    state,
  };
}

function planner(result = { accepted: [], rejected: [{ reason: "duration-capacity-conflict" }] }) {
  const state = { calls: 0 };
  return {
    async buildCandidates() { state.calls += 1; return structuredClone(result); },
    state,
  };
}

async function searchScenario({ name, query, accepted = [], plannerResult, sessionId = name }) {
  const acceptedRepository = repository(accepted);
  const cache = searchCache();
  const routePlanner = planner(plannerResult);
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache: cache,
    planner: routePlanner,
    env: {
      ROUTE_V2_RUNTIME_ENABLED: "true",
      ROUTE_V2_CANARY_PERCENTAGE: "100",
      ROUTE_V2_TIME_INTENT_ENABLED: "true",
      SEARCH_AUTO_ACCEPT_GENERATED: "true",
      SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
      SEARCH_PLANNER_TIMEOUT_MS: "2000",
    },
  });
  const result = await service.search({ query, limit: 6, sessionId });
  return { result, acceptedRepository, cache, routePlanner };
}

const validMature = route("mature-valid", [CITY.tokyo, CITY.kyoto, CITY.osaka], { durationDays: 7, recommendedDays: "7天" });
const missingMature = route("mature-missing", [CITY.tokyo, CITY.kyoto], { durationDays: 7, recommendedDays: "7天" });
const validFallback = await searchScenario({
  name: "valid-mature-fallback",
  query: "东京京都大阪7天",
  accepted: [validMature],
});
assert.equal(validFallback.result.records.length, 1);
assert.deepEqual(validFallback.result.records[0].destinations, ["东京", "京都", "大阪"]);

const impossibleFour = await searchScenario({
  name: "impossible-four-one-day",
  query: "东京京都大阪奈良1天",
  accepted: [route("mature-deletes-cities", [CITY.tokyo, CITY.kyoto], { durationDays: 1, recommendedDays: "1天" })],
});
assert.equal(impossibleFour.result.records.length, 0);
assert.equal(impossibleFour.result.diagnostics.reason, "constraint-conflict");
assert(impossibleFour.result.diagnostics.constraintConflict.reasonCodes.includes("duration-capacity-conflict"));
assert.equal(impossibleFour.result.hasMore, false);
assert.equal(impossibleFour.result.nextCursor, null);
assert.equal(impossibleFour.acceptedRepository.state.upserts, 0);
assert.equal(impossibleFour.cache.state.puts, 0);

const impossibleFive = await searchScenario({
  name: "impossible-five-one-day",
  query: "东京京都大阪奈良金泽1天",
  accepted: [route("mature-deletes-three-cities", [CITY.tokyo, CITY.kyoto], { durationDays: 1, recommendedDays: "1天" })],
});
assert.equal(impossibleFive.result.records.length, 0);
assert.equal(impossibleFive.result.diagnostics.reason, "constraint-conflict");
assert(impossibleFive.result.diagnostics.constraintConflict.reasonCodes.includes("duration-capacity-conflict"));
assert.equal(impossibleFive.acceptedRepository.state.upserts, 0);
assert.equal(impossibleFive.cache.state.puts, 0);

const fixedImpossible = await searchScenario({
  name: "fixed-three-one-day",
  query: "东京→京都→大阪1天",
  accepted: [route("mature-fixed-deletes-osaka", [CITY.tokyo, CITY.kyoto], { durationDays: 1, recommendedDays: "1天" })],
});
assert.equal(fixedImpossible.result.records.length, 0);
assert.equal(fixedImpossible.result.diagnostics.reason, "constraint-conflict");
assert.equal(fixedImpossible.result.diagnostics.constraintConflict.capacityConflict, true);

const missingFallback = await searchScenario({
  name: "missing-one-required-city",
  query: "东京京都大阪7天",
  accepted: [missingMature],
  plannerResult: { accepted: [], rejected: [{ reason: "planner-rejected" }] },
});
assert.equal(missingFallback.result.records.length, 0);
assert.equal(missingFallback.result.diagnostics.reason, "constraint-conflict");
assert(missingFallback.result.diagnostics.constraintConflict.missingRequiredDestinationIds.includes(CITY.osaka.id));
assert.equal(missingFallback.routePlanner.state.calls, 1, "all mismatching fallbacks must terminate after one Planner attempt");
assert.equal(missingFallback.result.hasMore, false);
assert.equal(missingFallback.result.nextCursor, null);

const fixedMismatch = await searchScenario({
  name: "fixed-order-mismatch",
  query: "东京→京都→大阪7天",
  accepted: [route("mature-reordered", [CITY.tokyo, CITY.osaka, CITY.kyoto])],
  plannerResult: { accepted: [], rejected: [{ reason: "planner-rejected" }] },
});
assert.equal(fixedMismatch.result.records.length, 0);
assert.equal(fixedMismatch.result.diagnostics.constraintConflict.orderMismatch, true);

const fixedValid = await searchScenario({
  name: "fixed-valid-seven-days",
  query: "东京→京都→大阪7天",
  accepted: [validMature],
});
assert.equal(fixedValid.result.records.length, 1);
assert.deepEqual(fixedValid.result.records[0].destinations, ["东京", "京都", "大阪"]);

const februaryTwoDays = await searchScenario({
  name: "february-two-days",
  query: "2月去日本2天",
  accepted: [
    route("february-needs-evidence", [CITY.tokyo, CITY.kyoto], {
      durationDays: 2,
      recommendedDays: "2天",
      bestMonths: [],
    }),
    route("autumn-conflict", [CITY.tokyo, CITY.kyoto], {
      name: "日本秋季红叶路线",
      durationDays: 2,
      recommendedDays: "2天",
      bestMonths: ["10-11月"],
      timeIntent: { type: "month-range", months: [10, 11], season: null },
    }),
  ],
});
assert.equal(februaryTwoDays.result.records.length, 1);
assert.equal(februaryTwoDays.result.records[0].id, "february-needs-evidence");
assert.equal(februaryTwoDays.result.records[0].durationDays, 2);
assert.equal(februaryTwoDays.result.records[0].searchStatus, "needs-review");
assert.deepEqual(februaryTwoDays.result.intent.timeIntent.months, [2]);
assert.equal(februaryTwoDays.acceptedRepository.state.upserts, 0);

const bareTwo = await searchScenario({
  name: "bare-two-days",
  query: "2",
  accepted: [route("short-mature", [CITY.tokyo], { durationDays: 2, recommendedDays: "2天" })],
});
assert.equal(bareTwo.result.intent.intentMode, "destination-suggestion");
assert.equal(bareTwo.result.intent.durationDays, 2);
assert.equal(bareTwo.result.intent.timeIntent.type, "unspecified");
assert(bareTwo.routePlanner.state.calls > 0);
assert(bareTwo.result.records.every((record) => Number(record.durationDays) === 2));

const bareFebruary = await searchScenario({
  name: "bare-february",
  query: "2月",
  accepted: [route("february-suggestion", [CITY.tokyo, CITY.kyoto], {
    durationDays: 7,
    recommendedDays: "7天",
    bestMonths: [],
  })],
  plannerResult: {
    accepted: [{ record: route("planner-february-suggestion", [CITY.tokyo, CITY.kyoto], {
      durationDays: 7,
      recommendedDays: "7天",
      bestMonths: [],
    }) }],
    rejected: [],
  },
});
assert.equal(bareFebruary.result.intent.intentMode, "destination-suggestion");
assert.equal(bareFebruary.result.intent.timeIntent.type, "single-month");
assert.deepEqual(bareFebruary.result.intent.timeIntent.months, [2]);
assert(bareFebruary.routePlanner.state.calls > 0);
assert(bareFebruary.result.records.length > 0);
assert(bareFebruary.result.records.every((record) => record.searchStatus === "needs-review"));

console.log(JSON.stringify({
  verifier: "route-v2-fallback-constraint-preservation",
  passed: true,
  pureCases: Object.fromEntries(Object.entries(pureCases).map(([key, value]) => [key, {
    matched: value.matched,
    reasonCodes: value.reasonCodes,
    requiresEvidence: value.requiresEvidence,
  }])),
  serviceCases: {
    validMature: validFallback.result.records.length,
    impossibleFour: impossibleFour.result.records.length,
    impossibleFive: impossibleFive.result.records.length,
    fixedImpossible: fixedImpossible.result.records.length,
    missingFallback: missingFallback.result.records.length,
    fixedMismatch: fixedMismatch.result.records.length,
    fixedValid: fixedValid.result.records.length,
    februaryTwoDays: februaryTwoDays.result.records.length,
    bareTwoDays: bareTwo.result.records.length,
    bareFebruary: bareFebruary.result.records.length,
  },
  acceptedWrites: impossibleFour.acceptedRepository.state.upserts,
}, null, 2));
