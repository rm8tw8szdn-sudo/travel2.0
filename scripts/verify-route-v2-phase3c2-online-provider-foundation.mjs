import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildOnlineEvidenceQueries,
  collectLocalEvidenceBundle,
  createAcceptedRouteRepository,
  createRouteV2TavilyEvidenceProvider,
  createRouteV2WikivoyageEvidenceProvider,
  createWebEvidenceCorroborator,
  createWebEvidenceExtractor,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  enrichEvidenceBundleWithOnlineEvidence,
  routeV2OnlineEvidenceConfig,
  searchRouteV2OnlineEvidence,
  validateEvidenceBundle,
} from "../src/lib/routes/index.mjs";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-01-01T00:00:00.000Z";
const acceptedPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const protectedPaths = [
  acceptedPath,
  bootstrapPath,
  defaultRouteCandidatePoolPath(),
  defaultDecisionTracePath(),
  defaultRouteEvidenceBundlePath(),
  path.resolve(projectRoot, ".route-v2-cache", "route-evidence.json"),
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-detail.js"),
  path.resolve(projectRoot, "src/lib/routes/discovery.mjs"),
  path.resolve(projectRoot, "src/lib/routes/route-search-service.mjs"),
];
const protectedBefore = statesFor(protectedPaths);
const providerContractFields = ["ok", "configured", "attempted", "provider", "query", "results", "failure", "diagnostics", "attempts", "retrievedAt"];

const baseEnv = {
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "true",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "true",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
  ROUTE_WEB_SEARCH_API_URL: "https://mocked-tavily.invalid/search",
  ROUTE_WEB_SEARCH_API_KEY: "test-key",
  ROUTE_V2_EVIDENCE_ONLINE_TIMEOUT_MS: "25",
  ROUTE_V2_EVIDENCE_ONLINE_MAX_RETRIES: "0",
};

const candidate = {
  candidateId: "rc-phase3c2-japan",
  intentId: "intent-phase3c2-japan",
  countries: ["JP"],
  destinations: [
    { id: "tokyo", wikidataId: "Q1490", qid: "Q1490", name: "Tokyo", countryCode: "JP", latitude: 35.6762, longitude: 139.6503 },
    { id: "kyoto", wikidataId: "Q34600", qid: "Q34600", name: "Kyoto", countryCode: "JP", latitude: 35.0116, longitude: 135.7681 },
    { id: "osaka", wikidataId: "Q35765", qid: "Q35765", name: "Osaka", countryCode: "JP", latitude: 34.6937, longitude: 135.5023 },
  ],
  proposedOrder: ["tokyo", "kyoto", "osaka"],
  durationDays: 8,
  travelStyle: "rail-journey",
  generationSource: "phase3c2-test",
  supportingSignals: [],
  status: "generated",
};

const kgPool = candidate.destinations.map((destination) => ({ ...destination }));
const baseBundle = collectLocalEvidenceBundle({ candidate, kgPool, now: () => fixedNow });
assert.equal(validateEvidenceBundle(baseBundle).accepted, true, "base bundle should validate");

function makeResponse({ status = 200, payload = null, jsonThrows = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "retry-after" ? "0" : "";
      },
    },
    async json() {
      if (jsonThrows) throw new Error("bad json");
      return payload ?? { results: [] };
    },
  };
}

function makeFetch(sequence = []) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = sequence[Math.min(calls.length - 1, sequence.length - 1)];
    if (typeof next === "function") return next(url, options, calls.length);
    if (next instanceof Error) throw next;
    return next || makeResponse();
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function assertProviderContract(result, label, expected = {}) {
  for (const field of providerContractFields) {
    assert(Object.hasOwn(result, field), `${label} should include ${field}`);
  }
  assert.equal(Array.isArray(result.results), true, `${label} results should be an array`);
  assert.equal(Array.isArray(result.diagnostics), true, `${label} diagnostics should be an array`);
  assert.equal(typeof result.retrievedAt, "string", `${label} retrievedAt should be a string`);
  assert(result.retrievedAt.length > 0, `${label} retrievedAt should be present`);
  if (Object.hasOwn(expected, "attempts")) assert.equal(result.attempts, expected.attempts, `${label} attempts`);
  if (Object.hasOwn(expected, "failure")) assert.equal(result.failure, expected.failure, `${label} failure`);
  if (Object.hasOwn(expected, "attempted")) assert.equal(result.attempted, expected.attempted, `${label} attempted`);
  if (Object.hasOwn(expected, "ok")) assert.equal(result.ok, expected.ok, `${label} ok`);
  if (Object.hasOwn(expected, "retrievedAt")) assert.equal(result.retrievedAt, expected.retrievedAt, `${label} retrievedAt`);
}

function tavilyPayload(results = []) {
  return { results };
}

const transportResults = [
  {
    url: "https://www.japan.travel/en/destinations/kansai/",
    title: "Tokyo Kyoto Osaka rail travel",
    content: "Tokyo and Kyoto are connected by frequent train services. Kyoto and Osaka are linked by rail and are best visited in spring.",
  },
  {
    url: "https://en.wikivoyage.org/wiki/Kyoto",
    title: "Kyoto - Wikivoyage",
    content: "Kyoto and Osaka are connected by frequent train services. Spring and autumn are common travel seasons for Kyoto.",
  },
];

function assertNoRouteRecordShape(payload, label) {
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["RouteRecord", "destinationEntities", "recommendedDays", "contentQualityStatus", "plannerReason"]) {
    assert.equal(serialized.includes(forbidden), false, `${label} must not contain RouteRecord-shaped data: ${forbidden}`);
  }
}

function feedReadyCounts() {
  const repo = createAcceptedRouteRepository({ storagePath: acceptedPath });
  return {
    all: repo.list({ limit: 10_000, sessionId: "phase3c2-count" }).total,
    cross: repo.list({ limit: 10_000, routeType: "cross", sessionId: "phase3c2-count" }).total,
    single: repo.list({ limit: 10_000, routeType: "single", sessionId: "phase3c2-count" }).total,
  };
}

const countsBefore = feedReadyCounts();
assert.deepEqual(countsBefore, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline mismatch");

for (const env of [
  {},
  { ...baseEnv, ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false" },
  { ...baseEnv, ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false" },
  { ...baseEnv, ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false" },
  { ...baseEnv, ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "yes", ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "yes", ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "yes" },
]) {
  const fetchImpl = makeFetch([makeResponse({ payload: tavilyPayload(transportResults) })]);
  const result = await searchRouteV2OnlineEvidence({
    query: "Tokyo Kyoto train official",
    env,
    fetchImpl,
    apiUrl: "https://mocked-tavily.invalid/search",
    apiKey: "test-key",
    now: () => fixedNow,
  });
  assertProviderContract(result, "disabled provider", {
    failure: "provider-not-configured",
    attempts: 0,
    attempted: false,
    ok: false,
    retrievedAt: fixedNow,
  });
  assert.equal(result.configured, false, "disabled or non-true flags should leave provider unconfigured");
  assert.equal(result.attempted, false, "disabled or non-true flags should not attempt provider");
  assert.equal(result.failure, "provider-not-configured");
  assert.equal(fetchImpl.calls.length, 0, "disabled provider must not call fetch");
}

const missingKeyFetch = makeFetch([makeResponse({ payload: tavilyPayload(transportResults) })]);
const missingKey = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: { ...baseEnv, ROUTE_WEB_SEARCH_API_KEY: "" },
  fetchImpl: missingKeyFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "",
  now: () => fixedNow,
});
assertProviderContract(missingKey, "missing key", { failure: "provider-not-configured", attempts: 0, attempted: false, ok: false, retrievedAt: fixedNow });
assert.equal(missingKey.failure, "provider-not-configured");
assert.equal(missingKeyFetch.calls.length, 0, "missing config must not call fetch");

const successFetch = makeFetch([makeResponse({ payload: tavilyPayload(transportResults) })]);
const success = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: successFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  now: () => fixedNow,
});
assertProviderContract(success, "success", { failure: "", attempts: 1, attempted: true, ok: true, retrievedAt: fixedNow });
assert.equal(success.ok, true, "mocked Tavily should succeed");
assert.equal(success.results.length, 2);
assert.equal(success.failure, "");
assert.equal(success.attempts, 1);
assert.equal(successFetch.calls.length, 1);
assert.equal(successFetch.calls[0].options.signal instanceof AbortSignal, true, "fetch should receive AbortSignal");
assert.equal(JSON.parse(successFetch.calls[0].options.body).query, "Tokyo Kyoto train official");
assertNoRouteRecordShape(success, "provider success output");

let successSignalAborted = false;
const fastFetch = makeFetch([(_url, options) => {
  options.signal.addEventListener("abort", () => {
    successSignalAborted = true;
  });
  return makeResponse({ payload: tavilyPayload(transportResults) });
}]);
await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: fastFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  timeoutMs: 5,
  now: () => fixedNow,
});
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(successSignalAborted, false, "timeout timer should be cleared after successful fetch");

let timeoutAborted = false;
const timeoutFetch = makeFetch([(_url, options) => new Promise((resolve, reject) => {
  options.signal.addEventListener("abort", () => {
    timeoutAborted = true;
    reject(Object.assign(new Error("aborted by signal"), { name: "AbortError" }));
  });
})]);
const timeoutResult = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: timeoutFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  timeoutMs: 5,
  maxRetries: 0,
  now: () => fixedNow,
});
assertProviderContract(timeoutResult, "timeout", { failure: "timeout", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(timeoutResult.failure, "timeout");
assert.equal(timeoutAborted, true, "timeout should abort fetch signal");

const controller = new AbortController();
controller.abort();
const preAbortedFetch = makeFetch([makeResponse({ payload: tavilyPayload(transportResults) })]);
const preAborted = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: preAbortedFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  signal: controller.signal,
  now: () => fixedNow,
});
assertProviderContract(preAborted, "pre-aborted", { failure: "aborted", attempts: 0, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(preAborted.failure, "aborted");
assert.equal(preAbortedFetch.calls.length, 0, "pre-aborted signal should not call fetch");

const waits = [];
const rateLimitFetch = makeFetch([
  makeResponse({ status: 429, payload: {} }),
  makeResponse({ payload: tavilyPayload(transportResults) }),
]);
const rateLimitedThenOk = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: rateLimitFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 1,
  now: () => fixedNow,
  wait: async (ms) => { waits.push(ms); },
});
assertProviderContract(rateLimitedThenOk, "rate-limited then ok", { failure: "", attempts: 2, attempted: true, ok: true, retrievedAt: fixedNow });
assert.equal(rateLimitedThenOk.ok, true);
assert.equal(rateLimitedThenOk.attempts, 2);
assert.equal(rateLimitFetch.calls.length, 2);
assert.equal(rateLimitedThenOk.diagnostics[0].reason, "rate-limited");
assert.equal(rateLimitedThenOk.diagnostics[0].retry, true);
assert(waits.length === 1 && waits[0] >= 0, "rate-limit retry should use injected wait");

const rateLimitFinalFetch = makeFetch([
  makeResponse({ status: 429, payload: {} }),
  makeResponse({ status: 429, payload: {} }),
]);
const rateLimitedFinal = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: rateLimitFinalFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 1,
  now: () => fixedNow,
  wait: async () => {},
});
assertProviderContract(rateLimitedFinal, "rate-limited final", { failure: "rate-limited", attempts: 2, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(rateLimitedFinal.failure, "rate-limited");
assert.equal(rateLimitedFinal.attempts, 2);

const rateLimitMaxRetryFetch = makeFetch([
  makeResponse({ status: 429, payload: {} }),
  makeResponse({ status: 429, payload: {} }),
  makeResponse({ status: 429, payload: {} }),
  makeResponse({ status: 429, payload: {} }),
]);
const rateLimitedMaxRetry = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: rateLimitMaxRetryFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 3,
  now: () => fixedNow,
  wait: async () => {},
});
assertProviderContract(rateLimitedMaxRetry, "rate-limited max retry", { failure: "rate-limited", attempts: 4, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(rateLimitMaxRetryFetch.calls.length, 4, "maxRetries=3 should make four total attempts");

const serverErrorFetch = makeFetch([
  makeResponse({ status: 500, payload: {} }),
  makeResponse({ payload: tavilyPayload(transportResults) }),
]);
const serverErrorThenOk = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: serverErrorFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 1,
  now: () => fixedNow,
  wait: async () => {},
});
assertProviderContract(serverErrorThenOk, "server error then ok", { failure: "", attempts: 2, attempted: true, ok: true, retrievedAt: fixedNow });
assert.equal(serverErrorThenOk.ok, true);
assert.equal(serverErrorThenOk.attempts, 2);

for (const status of [400, 401, 403]) {
  const fetchImpl = makeFetch([makeResponse({ status, payload: {} })]);
  const result = await searchRouteV2OnlineEvidence({
    query: "Tokyo Kyoto train official",
    env: baseEnv,
    fetchImpl,
    apiUrl: "https://mocked-tavily.invalid/search",
    apiKey: "test-key",
    maxRetries: 3,
    now: () => fixedNow,
  });
  assertProviderContract(result, `${status} provider error`, { failure: "provider-error", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });
  assert.equal(result.failure, "provider-error", `${status} should be provider-error`);
  assert.equal(result.attempts, 1, `${status} should not retry`);
}

const noResultFetch = makeFetch([makeResponse({ payload: tavilyPayload([]) })]);
const noResult = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: noResultFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 3,
  now: () => fixedNow,
});
assertProviderContract(noResult, "no result", { failure: "no-result", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(noResult.failure, "no-result");
assert.equal(noResult.attempts, 1);

const parseFailedFetch = makeFetch([makeResponse({ jsonThrows: true })]);
const parseFailed = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: parseFailedFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 3,
  now: () => fixedNow,
});
assertProviderContract(parseFailed, "parse failed", { failure: "parse-failed", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(parseFailed.failure, "parse-failed");
assert.equal(parseFailed.attempts, 1);

const malformedPayloads = [
  tavilyPayload([{}]),
  tavilyPayload([{ url: "", title: "", content: "" }]),
  tavilyPayload([{ url: "not-a-url", title: "", content: "" }]),
  tavilyPayload([{ url: null, title: null, content: null }]),
];
for (const [index, payload] of malformedPayloads.entries()) {
  const malformedFetch = makeFetch([makeResponse({ payload })]);
  const malformed = await searchRouteV2OnlineEvidence({
    query: "Tokyo Kyoto train official",
    env: baseEnv,
    fetchImpl: malformedFetch,
    apiUrl: "https://mocked-tavily.invalid/search",
    apiKey: "test-key",
    now: () => fixedNow,
  });
  assertProviderContract(malformed, `malformed result ${index}`, { failure: "no-result", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });
  assert.deepEqual(malformed.results, [], `malformed result ${index} should be filtered out`);
}

const mixedResultFetch = makeFetch([makeResponse({ payload: tavilyPayload([
  {},
  { url: "not-a-url", title: "", content: "" },
  transportResults[0],
]) })]);
const mixedResult = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: mixedResultFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  now: () => fixedNow,
});
assertProviderContract(mixedResult, "mixed malformed and valid results", { failure: "", attempts: 1, attempted: true, ok: true, retrievedAt: fixedNow });
assert.equal(mixedResult.results.length, 1, "mixed result should keep only valid records");
assert(mixedResult.results[0].sourceUrl, "valid mixed result should keep sourceUrl");
assert(mixedResult.results[0].sourceTitle || mixedResult.results[0].sourceSnippet, "valid mixed result should keep meaningful text");

const unexpectedPayloadFetch = makeFetch([makeResponse({ payload: { answer: "not a results container" } })]);
const unexpectedPayload = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: unexpectedPayloadFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  now: () => fixedNow,
});
assertProviderContract(unexpectedPayload, "unexpected payload", { failure: "parse-failed", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });

const providerErrorFetch = makeFetch([new Error("network down")]);
const providerError = await searchRouteV2OnlineEvidence({
  query: "Tokyo Kyoto train official",
  env: baseEnv,
  fetchImpl: providerErrorFetch,
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  maxRetries: 0,
  now: () => fixedNow,
});
assertProviderContract(providerError, "provider error", { failure: "provider-error", attempts: 1, attempted: true, ok: false, retrievedAt: fixedNow });
assert.equal(providerError.failure, "provider-error");

const provider = createRouteV2TavilyEvidenceProvider({
  env: baseEnv,
  fetchImpl: makeFetch([makeResponse({ payload: tavilyPayload(transportResults) })]),
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  now: () => fixedNow,
});
assert.equal(provider.capabilities.configured, true, "Tavily provider should be configured with explicit fake config");
const providerSearch = await provider.searchEvidence({ query: "Tokyo Kyoto train official", limit: 5 });
assertProviderContract(providerSearch, "provider search", { failure: "", attempts: 1, attempted: true, ok: true, retrievedAt: fixedNow });
assert.equal(providerSearch.ok, true);

const wikivoyageProvider = createRouteV2WikivoyageEvidenceProvider({ env: {
  ...baseEnv,
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "true",
} });
assert.equal(wikivoyageProvider.capabilities.configured, false, "Wikivoyage evidence provider should remain a placeholder in Phase 3C-2");
const wikivoyageSearch = await wikivoyageProvider.searchEvidence({ query: "Kyoto season" });
assertProviderContract(wikivoyageSearch, "wikivoyage placeholder", { failure: "provider-not-configured", attempts: 0, attempted: false, ok: false });
assert.equal(wikivoyageSearch.failure, "provider-not-configured");

const injectedProvider = {
  providerId: "tavily",
  capabilities: { configured: true },
  async searchEvidence({ query }) {
    return {
      ok: true,
      configured: true,
      attempted: true,
      provider: "tavily",
      query,
      retrievedAt: fixedNow,
      results: transportResults.map((item, index) => ({
        sourceUrl: item.url,
        sourceTitle: item.title,
        sourceSnippet: item.content,
        rank: index + 1,
      })),
      diagnostics: [],
    };
  },
};
const realLikeProvider = createRouteV2TavilyEvidenceProvider({
  env: baseEnv,
  fetchImpl: makeFetch([makeResponse({ payload: tavilyPayload(transportResults) })]),
  apiUrl: "https://mocked-tavily.invalid/search",
  apiKey: "test-key",
  now: () => fixedNow,
});
const extractor = createWebEvidenceExtractor({ now: () => fixedNow });
const corroborator = createWebEvidenceCorroborator();
const adapterEnv = {
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "true",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "true",
};
const injectedAdapter = await enrichEvidenceBundleWithOnlineEvidence({
  candidate,
  baseBundle,
  providers: { tavily: injectedProvider },
  extractor,
  corroborator,
  env: adapterEnv,
  now: () => fixedNow,
});
const realAdapter = await enrichEvidenceBundleWithOnlineEvidence({
  candidate,
  baseBundle,
  providers: { tavily: realLikeProvider },
  extractor,
  corroborator,
  env: adapterEnv,
  now: () => fixedNow,
});
assert.equal(validateEvidenceBundle(injectedAdapter.bundle).accepted, true, "injected adapter bundle should validate");
assert.equal(validateEvidenceBundle(realAdapter.bundle).accepted, true, "real-like provider adapter bundle should validate");
assert.deepEqual(realAdapter.bundle.items, injectedAdapter.bundle.items, "mocked real provider and injected provider should produce equivalent enriched items");
assert.deepEqual(realAdapter.bundle.unknowns, injectedAdapter.bundle.unknowns, "mocked real provider and injected provider should produce equivalent unknowns");
assert.deepEqual(realAdapter.bundle.failures, injectedAdapter.bundle.failures, "mocked real provider and injected provider should produce equivalent failures");
assert.equal(realAdapter.bundle.evidenceBundleId, injectedAdapter.bundle.evidenceBundleId, "mocked real provider and injected provider should produce same enriched ID");
assert.equal(realAdapter.bundle.items.some((item) => item.status === "verified" && item.evidenceCategory === "transport-feasibility"), true, "multi-source transport should be verified through adapter");
assert.equal(realAdapter.bundle.items.some((item) => item.evidenceCategory === "budget-fit"), false, "budget evidence must not be generated");
assert(realAdapter.bundle.unknowns.some((entry) => entry.field === "budgetFit"), "budgetFit should remain unknown");

const queryPlan = buildOnlineEvidenceQueries({ candidate });
assert(queryPlan.length <= 12, "adapter query plan should remain bounded");

const config = routeV2OnlineEvidenceConfig({ env: baseEnv, apiUrl: "https://mocked-tavily.invalid/search", apiKey: "test-key" });
assert.equal(config.configured, true);
assert.equal(config.maxRetries, 0);

assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "protected route/cache files changed during Phase 3C-2 verification");
const countsAfter = feedReadyCounts();
assert.deepEqual(countsAfter, countsBefore, "FeedReadyPoolCount changed during Phase 3C-2 verification");

console.log(JSON.stringify({
  status: "PASS",
  providerContract: providerContractFields,
  failureReasonsCovered: ["provider-not-configured", "timeout", "no-result", "parse-failed", "provider-error", "rate-limited", "aborted"],
  fetchCallsDisabled: 0,
  mockedRealProviderCalls: 1,
  adapterCompatibility: true,
  baseEvidenceBundleId: baseBundle.evidenceBundleId,
  phase3b1GoldenVerifiedByRegression: "eb-c1d89ba2875b67289c97",
  feedReadyPoolCount: countsAfter,
}, null, 2));
