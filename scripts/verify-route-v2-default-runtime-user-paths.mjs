import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildRouteCandidatesFromPool,
  buildRouteDestinationSuggestion,
  createRouteV2RuntimeEnvironment,
} from "../src/lib/routes/index.mjs";

const defaultRuntime = createRouteV2RuntimeEnvironment({});
for (const flag of [
  "ROUTE_V2_INTENT_ENABLED",
  "ROUTE_V2_TIME_INTENT_ENABLED",
  "ROUTE_V2_CANDIDATE_POOL_ENABLED",
  "ROUTE_V2_TRACE_ENABLED",
  "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED",
]) {
  assert.equal(defaultRuntime[flag], "true", `${flag} must be enabled by the server runtime preset`);
}
for (const flag of [
  "ROUTE_V2_EVIDENCE_ONLINE_ENABLED",
  "ROUTE_V2_TAVILY_EVIDENCE_ENABLED",
  "ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED",
  "SEARCH_AUTO_ACCEPT_GENERATED",
]) {
  assert.equal(defaultRuntime[flag], "false", `${flag} must remain disabled in the default server runtime`);
}

const explicitlyDisabled = createRouteV2RuntimeEnvironment({
  ROUTE_V2_TIME_INTENT_ENABLED: "false",
});
assert.equal(explicitlyDisabled.ROUTE_V2_TIME_INTENT_ENABLED, "false", "an explicit per-feature opt-out must win");

const masterDisabled = createRouteV2RuntimeEnvironment({
  ROUTE_V2_RUNTIME_ENABLED: "false",
});
assert.equal(masterDisabled.ROUTE_V2_INTENT_ENABLED, undefined);
assert.equal(masterDisabled.ROUTE_V2_TIME_INTENT_ENABLED, undefined);
assert.equal(masterDisabled.SEARCH_AUTO_ACCEPT_GENERATED, "false");

const twoCityPool = [
  { wikidataId: "Q1085", name: "Prague", countryCode: "CZ", latitude: 50.0875, longitude: 14.4214, entityTypeName: "city" },
  { wikidataId: "Q14960", name: "Brno", countryCode: "CZ", latitude: 49.1953, longitude: 16.6083, entityTypeName: "city" },
];
const twoCityCandidates = buildRouteCandidatesFromPool({
  context: { intentId: "two-city-default-runtime", durationDays: 4 },
  concept: { durationDays: 4, travelStyle: "city-break" },
  pool: twoCityPool,
  targetCount: 3,
  seed: "two-city-default-runtime",
});
assert.equal(twoCityCandidates.length, 3, "two structured cities must still produce three selectable route variants");
assert.equal(new Set(twoCityCandidates.map((candidate) => candidate.candidateId)).size, 3);
assert(twoCityCandidates.every((candidate) => candidate.destinations.length === 2));
assert.deepEqual(
  new Set(twoCityCandidates.map((candidate) => candidate.candidateVariant)),
  new Set(["balanced", "low-transfer", "depth"]),
);

const groundedShortSuggestion = buildRouteDestinationSuggestion({
  intent: {
    intentMode: "destination-suggestion",
    canGenerate: true,
    intentHash: "grounded-short-suggestion",
    durationDays: 2,
    timeIntent: { type: "unspecified", months: [] },
  },
  sessionId: "grounded-short-session",
  acceptedRoutes: [
    { id: "route-nl-2d", countries: ["NL"], durationDays: 2, destinations: ["Amsterdam", "Rotterdam"] },
    { id: "route-ma-2d", countries: ["MA"], durationDays: 2, destinations: ["Casablanca", "Marrakesh"] },
  ],
  intentCatalog: {
    countries: [
      { code: "NL", label: "Netherlands" },
      { code: "MA", label: "Morocco" },
    ],
    cities: [
      { entityId: "city-amsterdam", wikidataId: "Q727", countryCode: "NL", label: "Amsterdam", latitude: 52.37, longitude: 4.90 },
      { entityId: "city-rotterdam", wikidataId: "Q34370", countryCode: "NL", label: "Rotterdam", latitude: 51.92, longitude: 4.48 },
    ],
  },
});
assert.equal(groundedShortSuggestion.ready, true);
assert.equal(groundedShortSuggestion.suggestion.countryCode, "NL", "short-trip suggestions must prefer nearby structured local cities");

const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const discoverySource = fs.readFileSync(new URL("../src/lib/routes/discovery.mjs", import.meta.url), "utf8");
const routesSource = fs.readFileSync(new URL("../routes.js", import.meta.url), "utf8");
const routesHtml = fs.readFileSync(new URL("../routes.html", import.meta.url), "utf8");
const detailSource = fs.readFileSync(new URL("../route-detail.js", import.meta.url), "utf8");
const detailHtml = fs.readFileSync(new URL("../route-detail.html", import.meta.url), "utf8");
assert.match(serverSource, /createRouteV2RuntimeEnvironment/);
assert.match(serverSource, /env:\s*routeV2RuntimeEnv/);
assert.match(discoverySource, /env\s*=\s*process\.env/);
assert.match(discoverySource, /createConfiguredLlmRefineProvider\(env\)/);
assert.match(discoverySource, /createRouteSearchService\(\{[\s\S]*?\benv,/);
assert.match(discoverySource, /createRouteCompositionPlanner\(\{[\s\S]*?\benv,/);
assert.match(routesSource, /detailParams\.set\("q",\s*feedState\.query\)/);
assert.match(routesSource, /detailParams\.set\("localOnly",\s*"1"\)/);
assert.match(routesSource, /detailParams\.set\("routeType",\s*feedState\.activeTab\)/);
assert.match(routesSource, /activeTab:\s*readRouteTypeFromUrl\(\)/);
assert.match(routesSource, /feedRouteType:\s*readRouteTypeFromUrl\(\)/);
assert.match(routesSource, /readBootstrappedRouteFeed\(feedState\.feedRouteType\)/);
assert.match(routesSource, /activateRouteTab\(feedState\.activeTab\)/);
assert.match(routesSource, /activeTab:\s*payload\.routeType\s*\|\|\s*feedState\.activeTab/);
assert.match(detailHtml, /data-route-back/);
assert.match(detailSource, /const routeReturnUrl = new URL\("routes\.html", window\.location\.href\)/);
assert.match(detailSource, /routeReturnUrl\.searchParams\.set\("q", routeReturnQuery\)/);
assert.match(detailSource, /routeReturnUrl\.searchParams\.set\("routeType", routeReturnType\)/);
assert.match(detailSource, /document\.querySelectorAll\("\[data-route-back\]"\)/);
const searchServiceSource = fs.readFileSync(new URL("../src/lib/routes/route-search-service.mjs", import.meta.url), "utf8");
assert.match(searchServiceSource, /const cityBreakByExplicitPair = !suggested/);

const localCoverFunction = routesSource.match(/function localCoverForRoute\(record = \{\}\) \{[\s\S]*?\n\}/u)?.[0] || "";
const pilotReturnIndex = localCoverFunction.indexOf("!resolved.isFallback");
const routeFallbackIndex = localCoverFunction.indexOf("LOCAL_COVER_BY_ROUTE_ID");
assert(pilotReturnIndex >= 0, "local route covers must only short-circuit for a non-placeholder resolver result");
assert(routeFallbackIndex > pilotReturnIndex, "legacy route/theme/country fallbacks must run after a pilot placeholder");
assert.match(routesSource, /source:\s*"local-route-fallback"/);
assert.match(routesSource, /const LOCAL_COVER_BY_CONTINENT = \{/);
assert.match(routesSource, /LOCAL_COVER_BY_CONTINENT\[continentForCountryCode\(code\)\]/);
assert.match(routesSource, /function isReusableLocalCover\(/);
assert.match(routesSource, /usedImages\.has\(imageKey\) && !reusableLocalCover/);
assert.match(routesSource, /used\.has\(key\) && !isReusableLocalCover\(record, displayCoverUrl\(record\)\)/);
assert.match(routesSource, /const safeLocalCover = Boolean\(/);
assert.match(routesSource, /fixedCoverKey\.startsWith\("local:"\)/);
assert.match(routesSource, /const source = safeLocalCover\s*\?\s*fixedCover\.url/);
assert.match(routesHtml, /routes\.js\?v=default-runtime-user-path-fixes-20260728b/);
assert.match(detailHtml, /route-detail\.js\?v=default-runtime-user-path-fixes-20260728/);

console.log(JSON.stringify({
  status: "PASS",
  defaultRuntime: {
    intent: defaultRuntime.ROUTE_V2_INTENT_ENABLED,
    timeIntent: defaultRuntime.ROUTE_V2_TIME_INTENT_ENABLED,
    candidatePool: defaultRuntime.ROUTE_V2_CANDIDATE_POOL_ENABLED,
    decisionTrace: defaultRuntime.ROUTE_V2_TRACE_ENABLED,
    evidenceBundle: defaultRuntime.ROUTE_V2_EVIDENCE_BUNDLE_ENABLED,
    onlineEvidence: defaultRuntime.ROUTE_V2_EVIDENCE_ONLINE_ENABLED,
    autoAcceptGenerated: defaultRuntime.SEARCH_AUTO_ACCEPT_GENERATED,
  },
}, null, 2));
