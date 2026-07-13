import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStatesUnchanged, sha256IfExists, statesFor } from "./lib/route-v2-test-file-state.mjs";
import {
  buildOnlineEvidenceQueries,
  collectLocalEvidenceBundle,
  createAcceptedRouteRepository,
  createWebEvidenceCorroborator,
  createWebEvidenceExtractor,
  createWebSearchEvidenceProvider,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  enrichEvidenceBundleWithOnlineEvidence,
  isRouteV2EvidenceOnlineEnabled,
  isRouteV2TavilyEvidenceEnabled,
  isRouteV2WikivoyageEvidenceEnabled,
  validateEvidenceBundle,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-01-01T00:00:00.000Z";
const acceptedPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const realCandidatePoolPath = defaultRouteCandidatePoolPath();
const realDecisionTracePath = defaultDecisionTracePath();
const realEvidenceBundlePath = defaultRouteEvidenceBundlePath();
const protectedPaths = [
  acceptedPath,
  bootstrapPath,
  realCandidatePoolPath,
  realDecisionTracePath,
  realEvidenceBundlePath,
  path.resolve(projectRoot, "src/lib/routes/route-composition-planner.mjs"),
  path.resolve(projectRoot, "src/lib/routes/local-evidence-sidecar.mjs"),
  path.resolve(projectRoot, "src/lib/routes/local-evidence-collector.mjs"),
  path.resolve(projectRoot, "src/lib/routes/evidence-bundle.mjs"),
  path.resolve(projectRoot, "src/lib/routes/evidence-bundle-store.mjs"),
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-detail.js"),
];
const protectedBefore = statesFor(protectedPaths);

const envOff = {};
const envOnlineOnly = {
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "true",
};
const envTavily = {
  ...envOnlineOnly,
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "true",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
};

assert.equal(isRouteV2EvidenceOnlineEnabled(envOff), false, "online flag should default false");
assert.equal(isRouteV2TavilyEvidenceEnabled(envOff), false, "tavily flag should default false");
assert.equal(isRouteV2WikivoyageEvidenceEnabled(envOff), false, "wikivoyage flag should default false");
assert.equal(isRouteV2EvidenceOnlineEnabled({ ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false" }), false, "string false must stay false");
assert.equal(isRouteV2TavilyEvidenceEnabled({ ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false" }), false, "string false must stay false for tavily");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseCandidate = {
  candidateId: "rc-phase3c1-japan",
  intentId: "intent-phase3c1-japan",
  countries: ["JP"],
  destinations: [
    { id: "Q1490", wikidataId: "Q1490", name: "Tokyo", countryCode: "JP", latitude: 35.6762, longitude: 139.6503 },
    { id: "Q34600", wikidataId: "Q34600", name: "Kyoto", countryCode: "JP", latitude: 35.0116, longitude: 135.7681 },
    { id: "Q35765", wikidataId: "Q35765", name: "Osaka", countryCode: "JP", latitude: 34.6937, longitude: 135.5023 },
  ],
  proposedOrder: ["Q1490", "Q34600", "Q35765"],
  durationDays: 8,
  travelStyle: "classic-first-trip",
  generationSource: "route-v2-phase3c1-fixture",
  status: "generated",
};

const kgPool = deepClone(baseCandidate.destinations);
const baseBundle = collectLocalEvidenceBundle({
  candidate: baseCandidate,
  kgPool,
  now: () => fixedNow,
});
assert.equal(validateEvidenceBundle(baseBundle).accepted, true, "base bundle should validate");

const queries = buildOnlineEvidenceQueries({ candidate: baseCandidate });
const tokyoKyotoQuery = queries.find((item) => item.query.includes("Tokyo to Kyoto"))?.query;
const kyotoOsakaQuery = queries.find((item) => item.query.includes("Kyoto to Osaka"))?.query;
const tokyoSeasonQuery = queries.find((item) => item.query.includes("Tokyo best months"))?.query;
assert(tokyoKyotoQuery, "expected Tokyo-Kyoto transport query");
assert(kyotoOsakaQuery, "expected Kyoto-Osaka transport query");
assert(tokyoSeasonQuery, "expected Tokyo season query");
assert(queries.length <= 12, "query builder should cap per-candidate query count");
assert.equal(new Set(queries.map((item) => item.query)).size, queries.length, "queries should be deduped");

function transportResult(sourceUrl, extra = "") {
  return {
    sourceUrl,
    sourceTitle: "Tokyo Kyoto train official",
    sourceSnippet: `Tokyo and Kyoto are connected by train. The rail distance is 450 km and the trip takes 2 hours. ${extra}`,
  };
}

function seasonResult(sourceUrl, extra = "") {
  return {
    sourceUrl,
    sourceTitle: "Tokyo climate official",
    sourceSnippet: `Tokyo travel is best in March and April during spring. ${extra}`,
  };
}

function makeProvider(injectedResults, options = {}) {
  const { providerId = "tavily-fixture", throwFor = null, hangFor = null, emptyFor = null } = options;
  const calls = [];
  const provider = createWebSearchEvidenceProvider({
    mode: "injected",
    injectedResults,
    fetchImpl() {
      throw new Error("fetchImpl must not be called in Phase 3C-1 tests");
    },
    now: () => fixedNow,
  });
  return {
    providerId,
    capabilities: provider.capabilities,
    calls,
    async searchEvidence(request) {
      calls.push(request.query);
      if (hangFor && request.query.includes(hangFor)) return new Promise(() => {});
      if (throwFor && request.query.includes(throwFor)) throw new Error("injected provider error");
      if (emptyFor && request.query.includes(emptyFor)) return { query: request.query, retrievedAt: fixedNow, results: [] };
      return provider.searchEvidence(request);
    },
  };
}

function createHarness(overrides = {}) {
  return {
    candidate: deepClone(overrides.candidate || baseCandidate),
    baseBundle: deepClone(overrides.baseBundle || baseBundle),
    providers: overrides.providers || {},
    extractor: overrides.extractor || createWebEvidenceExtractor({ now: () => fixedNow }),
    corroborator: overrides.corroborator || createWebEvidenceCorroborator(),
    env: overrides.env || envTavily,
    now: () => fixedNow,
    timeoutMs: overrides.timeoutMs || 0,
  };
}

async function enrich(overrides = {}) {
  return enrichEvidenceBundleWithOnlineEvidence(createHarness(overrides));
}

function countItems(bundle, category, status) {
  return (bundle.items || []).filter((item) => (
    item.evidenceCategory === category && (!status || item.status === status)
  )).length;
}

function hasUnknown(bundle, field) {
  return (bundle.unknowns || []).some((entry) => entry.field === field);
}

function hasFailure(bundle, field, reason = "") {
  return (bundle.failures || []).some((entry) => entry.field === field && (!reason || entry.reason === reason));
}

function assertValidBundle(bundle, label) {
  const validation = validateEvidenceBundle(bundle);
  assert.equal(validation.accepted, true, `${label}: ${validation.reasons.join(",")}`);
}

function candidateVariant({ destinations, proposedOrder, candidateId = "rc-phase3c1-variant", intentId = "intent-phase3c1-variant" }) {
  return {
    ...deepClone(baseCandidate),
    candidateId,
    intentId,
    destinations: deepClone(destinations),
    countries: [...new Set(destinations.map((destination) => destination.countryCode).filter(Boolean))],
    proposedOrder,
  };
}

function directTransportEvidence({ subject, object, sourceUrl = "https://www.japan.travel/en/direct-transport" } = {}) {
  return {
    evidenceType: "transport-connection",
    evidenceId: `web:direct:${cleanForTest(subject)}:${cleanForTest(object)}:${sourceUrl}`,
    id: `web:direct:${cleanForTest(subject)}:${cleanForTest(object)}:${sourceUrl}`,
    subject: subject == null ? {} : { name: subject },
    object: object == null ? {} : { name: object },
    relation: "connected-to",
    value: ["rail"],
    confidence: 0.82,
    retrievedAt: fixedNow,
    provenance: { sourceUrl },
  };
}

function cleanForTest(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function enrichWithDirectEvidence({ candidate, evidence, query = null }) {
  const bundle = collectLocalEvidenceBundle({
    candidate,
    kgPool: candidate.destinations,
    now: () => fixedNow,
  });
  assertValidBundle(bundle, "direct alignment base bundle");
  const candidateQueries = buildOnlineEvidenceQueries({ candidate });
  const transportQuery = query || candidateQueries.find((item) => item.targetField === "transportFeasibility")?.query;
  const provider = makeProvider(transportQuery ? {
    [transportQuery]: [{ sourceUrl: "https://www.japan.travel/en/direct-placeholder", sourceTitle: "placeholder", sourceSnippet: "placeholder" }],
  } : {});
  const result = await enrichEvidenceBundleWithOnlineEvidence({
    candidate: deepClone(candidate),
    baseBundle: deepClone(bundle),
    providers: { tavily: provider },
    extractor: { extract() { return { evidence: Array.isArray(evidence) ? evidence : [evidence] }; } },
    corroborator: createWebEvidenceCorroborator(),
    env: envTavily,
    now: () => fixedNow,
  });
  return { result, transportQuery, provider };
}

const allBundles = [baseBundle];

const flagOffProvider = makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] });
const flagOff = await enrich({ env: envOff, providers: { tavily: flagOffProvider } });
assert.equal(flagOff.enabled, false, "all flags off should disable adapter");
assert.equal(flagOff.attempted, false, "all flags off should not attempt");
assert.deepEqual(flagOff.bundle, baseBundle, "all flags off should return base bundle");
assert.equal(flagOffProvider.calls.length, 0, "all flags off should not call provider");
assert.equal(flagOff.bundle.evidenceBundleId, baseBundle.evidenceBundleId, "base evidenceBundleId should be unchanged when disabled");

const providerFlagsOffProvider = makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] });
const providerFlagsOff = await enrich({ env: envOnlineOnly, providers: { tavily: providerFlagsOffProvider } });
assert.equal(providerFlagsOff.attempted, false, "online enabled but provider flags off should not attempt");
assert.equal(providerFlagsOffProvider.calls.length, 0, "provider flags off should not call provider");
assert(providerFlagsOff.diagnostics.some((item) => item.reason === "provider-not-configured"), "provider flags off should diagnose provider-not-configured");

const providerMissing = await enrich({ env: envTavily, providers: {} });
assert.equal(providerMissing.attempted, false, "missing provider should not attempt");
assert(providerMissing.diagnostics.some((item) => item.reason === "provider-not-configured"), "missing provider should diagnose provider-not-configured");

const singleTransportProvider = makeProvider({
  [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")],
});
const singleTransport = await enrich({ providers: { tavily: singleTransportProvider } });
allBundles.push(singleTransport.bundle);
assertValidBundle(singleTransport.bundle, "single source transport");
assert.equal(countItems(singleTransport.bundle, "transport-feasibility", "weak_signal") > 0, true, "single source transport should be weak_signal");
assert.equal(countItems(singleTransport.bundle, "transport-feasibility", "verified"), 0, "single source transport must not be verified");
assert.equal(hasUnknown(singleTransport.bundle, "transportFeasibility"), true, "transport unknown should remain with weak_signal");

const twoTransportProvider = makeProvider({
  [tokyoKyotoQuery]: [
    transportResult("https://www.japan.travel/en/rail/tokyo-kyoto"),
    transportResult("https://www.jr-central.co.jp/en/train/tokyo-kyoto"),
  ],
});
const twoTransport = await enrich({ providers: { tavily: twoTransportProvider } });
allBundles.push(twoTransport.bundle);
assertValidBundle(twoTransport.bundle, "two source transport");
assert.equal(countItems(twoTransport.bundle, "transport-feasibility", "verified") > 0, true, "two independent sources should verify transport");
assert.equal(hasUnknown(twoTransport.bundle, "transportFeasibility"), false, "transport unknown should be removed when verified");

const duplicateUrlTransportProvider = makeProvider({
  [tokyoKyotoQuery]: [
    transportResult("https://www.japan.travel/en/rail/tokyo-kyoto", "first"),
    transportResult("https://www.japan.travel/en/rail/tokyo-kyoto", "second"),
  ],
});
const duplicateUrlTransport = await enrich({ providers: { tavily: duplicateUrlTransportProvider } });
allBundles.push(duplicateUrlTransport.bundle);
assertValidBundle(duplicateUrlTransport.bundle, "duplicate URL transport");
assert.equal(countItems(duplicateUrlTransport.bundle, "transport-feasibility", "verified"), 0, "same URL must not upgrade to verified");
assert.equal(countItems(duplicateUrlTransport.bundle, "transport-feasibility", "weak_signal") > 0, true, "same URL should remain weak_signal");

const tokyoKyotoCandidate = candidateVariant({
  destinations: baseCandidate.destinations.slice(0, 2),
  proposedOrder: ["Q1490", "Q34600"],
  candidateId: "rc-phase3c1-align-tokyo-kyoto",
  intentId: "intent-phase3c1-align-tokyo-kyoto",
});
const alignedTokyoKyoto = await enrichWithDirectEvidence({
  candidate: tokyoKyotoCandidate,
  evidence: directTransportEvidence({ subject: "Tokyo", object: "Kyoto" }),
});
assert.equal(countItems(alignedTokyoKyoto.result.bundle, "transport-feasibility", "weak_signal"), 1, "Tokyo -> Kyoto should be accepted when both endpoints are adjacent candidate destinations");

const offRouteTokyoParis = await enrichWithDirectEvidence({
  candidate: tokyoKyotoCandidate,
  evidence: directTransportEvidence({ subject: "Tokyo", object: "Paris" }),
});
assert.equal(countItems(offRouteTokyoParis.result.bundle, "transport-feasibility"), 0, "Tokyo -> Paris must be rejected when Paris is not a candidate destination");

const parisOnlyCandidate = candidateVariant({
  destinations: [{ id: "Q90", wikidataId: "Q90", name: "Paris", countryCode: "FR", latitude: 48.8566, longitude: 2.3522 }],
  proposedOrder: ["Q90"],
  candidateId: "rc-phase3c1-align-paris-only",
  intentId: "intent-phase3c1-align-paris-only",
});
const parisOnlyQueries = buildOnlineEvidenceQueries({ candidate: parisOnlyCandidate });
assert.equal(parisOnlyQueries.some((item) => item.targetField === "transportFeasibility"), false, "single-destination Paris candidate should not generate transport queries");
const parisOnlyTokyoParis = await enrichWithDirectEvidence({
  candidate: parisOnlyCandidate,
  evidence: directTransportEvidence({ subject: "Tokyo", object: "Paris" }),
});
assert.equal(countItems(parisOnlyTokyoParis.result.bundle, "transport-feasibility"), 0, "Tokyo -> Paris must be rejected for a Paris-only candidate");

const tokyoOnlyCandidate = candidateVariant({
  destinations: [baseCandidate.destinations[0]],
  proposedOrder: ["Q1490"],
  candidateId: "rc-phase3c1-align-tokyo-only",
  intentId: "intent-phase3c1-align-tokyo-only",
});
const tokyoOnlyQueries = buildOnlineEvidenceQueries({ candidate: tokyoOnlyCandidate });
assert.equal(tokyoOnlyQueries.some((item) => item.targetField === "transportFeasibility"), false, "single-destination Tokyo candidate should not generate transport queries");
const tokyoOnlyTokyoParis = await enrichWithDirectEvidence({
  candidate: tokyoOnlyCandidate,
  evidence: directTransportEvidence({ subject: "Tokyo", object: "Paris" }),
});
assert.equal(countItems(tokyoOnlyTokyoParis.result.bundle, "transport-feasibility"), 0, "Tokyo -> Paris must be rejected for a Tokyo-only candidate");

const reverseKyotoTokyo = await enrichWithDirectEvidence({
  candidate: tokyoKyotoCandidate,
  evidence: directTransportEvidence({ subject: "Kyoto", object: "Tokyo" }),
});
assert.equal(countItems(reverseKyotoTokyo.result.bundle, "transport-feasibility", "weak_signal"), 1, "reverse adjacent segment is accepted as bidirectional connectivity evidence");

const missingObject = await enrichWithDirectEvidence({
  candidate: tokyoKyotoCandidate,
  evidence: directTransportEvidence({ subject: "Tokyo", object: null }),
});
assert.equal(countItems(missingObject.result.bundle, "transport-feasibility"), 0, "transport evidence missing object must be rejected");

const missingSubject = await enrichWithDirectEvidence({
  candidate: tokyoKyotoCandidate,
  evidence: directTransportEvidence({ subject: null, object: "Kyoto" }),
});
assert.equal(countItems(missingSubject.result.bundle, "transport-feasibility"), 0, "transport evidence missing subject must be rejected");

const partialStringTokyoBay = await enrichWithDirectEvidence({
  candidate: tokyoKyotoCandidate,
  evidence: directTransportEvidence({ subject: "Tokyo Bay", object: "Kyoto" }),
});
assert.equal(countItems(partialStringTokyoBay.result.bundle, "transport-feasibility"), 0, "partial strings such as Tokyo Bay must not match Tokyo");

const partialStringNewYork = await enrichWithDirectEvidence({
  candidate: candidateVariant({
    destinations: [
      { id: "Q60", wikidataId: "Q60", name: "New York", countryCode: "US", latitude: 40.7128, longitude: -74.006 },
      { id: "Q62", wikidataId: "Q62", name: "San Francisco", countryCode: "US", latitude: 37.7749, longitude: -122.4194 },
    ],
    proposedOrder: ["Q60", "Q62"],
    candidateId: "rc-phase3c1-align-new-york",
    intentId: "intent-phase3c1-align-new-york",
  }),
  evidence: directTransportEvidence({ subject: "York", object: "San Francisco" }),
});
assert.equal(countItems(partialStringNewYork.result.bundle, "transport-feasibility"), 0, "partial strings such as York must not match New York");

const singleSeasonProvider = makeProvider({
  [tokyoSeasonQuery]: [seasonResult("https://www.japan.travel/en/weather/tokyo")],
});
const singleSeason = await enrich({ providers: { tavily: singleSeasonProvider } });
allBundles.push(singleSeason.bundle);
assertValidBundle(singleSeason.bundle, "single source season");
assert.equal(countItems(singleSeason.bundle, "seasonal-fit", "weak_signal") > 0, true, "single source season should be weak_signal");
assert.equal(hasUnknown(singleSeason.bundle, "seasonalFit"), true, "season unknown should remain with weak_signal");

const twoSeasonProvider = makeProvider({
  [tokyoSeasonQuery]: [
    seasonResult("https://www.japan.travel/en/weather/tokyo"),
    seasonResult("https://www.wikipedia.org/wiki/Tokyo#Climate"),
  ],
});
const twoSeason = await enrich({ providers: { tavily: twoSeasonProvider } });
allBundles.push(twoSeason.bundle);
assertValidBundle(twoSeason.bundle, "two source season");
assert.equal(countItems(twoSeason.bundle, "seasonal-fit", "verified") > 0, true, "two independent sources should verify season");
assert.equal(hasUnknown(twoSeason.bundle, "seasonalFit"), false, "season unknown should be removed when verified");
assert.equal(hasUnknown(twoSeason.bundle, "budgetFit"), true, "budgetFit should remain unknown");
assert.equal(countItems(twoSeason.bundle, "budget-fit"), 0, "budget evidence must not be generated in Phase 3C-1");

const timeoutProvider = makeProvider({
  [tokyoSeasonQuery]: [
    seasonResult("https://www.japan.travel/en/weather/tokyo"),
    seasonResult("https://www.wikipedia.org/wiki/Tokyo#Climate"),
  ],
}, { hangFor: "Tokyo to Kyoto" });
const timeoutResult = await enrich({ providers: { tavily: timeoutProvider }, timeoutMs: 5 });
allBundles.push(timeoutResult.bundle);
assert(timeoutResult.diagnostics.some((item) => item.reason === "timeout"), "timeout should be diagnosed");
assert.equal(countItems(timeoutResult.bundle, "seasonal-fit", "verified") > 0, true, "other queries should continue after timeout");

const timeoutOneTransportOtherTransportSucceedsProvider = makeProvider({
  [kyotoOsakaQuery]: [
    {
      sourceUrl: "https://www.japan.travel/en/rail/kyoto-osaka",
      sourceTitle: "Kyoto Osaka train official",
      sourceSnippet: "Kyoto and Osaka are connected by train. The rail distance is 55 km and the trip takes 30 minutes.",
    },
    {
      sourceUrl: "https://www.jr-west.co.jp/en/train/kyoto-osaka",
      sourceTitle: "Kyoto Osaka train official",
      sourceSnippet: "Kyoto and Osaka are connected by train. The rail distance is 55 km and the trip takes 30 minutes.",
    },
  ],
}, { hangFor: "Tokyo to Kyoto" });
const transportTimeoutWithFallback = await enrich({ providers: { tavily: timeoutOneTransportOtherTransportSucceedsProvider }, timeoutMs: 5 });
assert(transportTimeoutWithFallback.diagnostics.some((item) => item.reason === "timeout"), "one transport query should timeout");
assert.equal(countItems(transportTimeoutWithFallback.bundle, "transport-feasibility", "verified") > 0, true, "another transport query should still verify transport");
assert.equal(hasUnknown(transportTimeoutWithFallback.bundle, "transportFeasibility"), false, "verified transport field should remove transport unknown even if another transport query timed out");
assert.equal(hasFailure(transportTimeoutWithFallback.bundle, "transportFeasibility"), false, "verified transport field should not also create a transport failure");

const emptyProvider = makeProvider({}, { emptyFor: "Tokyo to Kyoto" });
const emptyResult = await enrich({ providers: { tavily: emptyProvider } });
allBundles.push(emptyResult.bundle);
assert(emptyResult.diagnostics.some((item) => item.reason === "no-result"), "empty provider result should diagnose no-result");
assert.equal(hasFailure(emptyResult.bundle, "transportFeasibility", "no-result"), true, "no usable result should move transport unknown to failure");
assert.equal(hasUnknown(emptyResult.bundle, "transportFeasibility"), false, "failed transport field should not retain duplicate unknown");

const extractorThrow = await enrich({
  providers: { tavily: makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] }) },
  extractor: { extract() { throw new Error("extractor failed"); } },
});
assert(extractorThrow.diagnostics.some((item) => item.reason === "parse-failed"), "extractor throw should diagnose parse-failed");

const extractorInvalid = await enrich({
  providers: { tavily: makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] }) },
  extractor: { extract() { return { notEvidence: [] }; } },
});
assert(extractorInvalid.diagnostics.some((item) => item.reason === "parse-failed"), "invalid extractor payload should diagnose parse-failed");

const corroboratorThrow = await enrich({
  providers: { tavily: makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] }) },
  corroborator: { corroborate() { throw new Error("corroborator failed"); } },
});
assert(corroboratorThrow.diagnostics.some((item) => item.reason === "parse-failed"), "corroborator throw should diagnose parse-failed");

const providerError = await enrich({
  providers: { tavily: makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] }, { throwFor: "Tokyo to Kyoto" }) },
});
assert(providerError.diagnostics.some((item) => item.reason === "provider-error"), "provider throw should diagnose provider-error");

const idMismatchProvider = makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] });
const idMismatch = await enrich({
  baseBundle: { ...baseBundle, candidateId: "wrong-candidate-id" },
  providers: { tavily: idMismatchProvider },
});
assert.equal(idMismatchProvider.calls.length, 0, "candidate/base mismatch must not call provider");
assert(idMismatch.diagnostics.some((item) => item.reason === "candidate-bundle-id-mismatch"), "candidate/base mismatch should be diagnosed");

const invalidBaseProvider = makeProvider({ [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] });
const invalidBase = await enrich({
  baseBundle: { ...baseBundle, items: [{ status: "unknown" }], evidenceBundleId: "" },
  providers: { tavily: invalidBaseProvider },
});
assert.equal(invalidBaseProvider.calls.length, 0, "invalid base bundle must not call provider");
assert(invalidBase.diagnostics.some((item) => item.reason === "base-bundle-invalid"), "invalid base should be diagnosed");

const poisonedCandidate = {
  ...deepClone(baseCandidate),
  routeId: "route-poison",
  canonicalTitle: "Do not copy canonical title",
  title: "Do not copy title",
  summary: "Do not copy summary",
  plannerReason: "Do not copy planner reason",
  recommendationText: "Do not copy recommendation",
  coverUrl: "https://example.test/cover.jpg",
  acceptedAt: "2026-01-01",
  contentQualityStatus: "accepted",
};
const poisonResult = await enrich({
  candidate: poisonedCandidate,
  providers: { tavily: twoTransportProvider },
});
assertValidBundle(poisonResult.bundle, "poison candidate fields");
const poisonText = JSON.stringify(poisonResult.bundle);
for (const forbiddenValue of ["route-poison", "Do not copy canonical title", "Do not copy title", "Do not copy summary", "Do not copy planner reason", "Do not copy recommendation", "cover.jpg"]) {
  assert.equal(poisonText.includes(forbiddenValue), false, `poison field leaked into bundle: ${forbiddenValue}`);
}

const stableProviderResults = {
  [tokyoKyotoQuery]: [
    transportResult("https://www.japan.travel/en/rail/tokyo-kyoto"),
    transportResult("https://www.jr-central.co.jp/en/train/tokyo-kyoto"),
  ],
  [tokyoSeasonQuery]: [
    seasonResult("https://www.japan.travel/en/weather/tokyo"),
    seasonResult("https://www.wikipedia.org/wiki/Tokyo#Climate"),
  ],
};
const stableProviderA = makeProvider(stableProviderResults);
const stableProviderB = makeProvider(stableProviderResults);
const stableA = await enrich({ providers: { tavily: stableProviderA } });
const stableB = await enrich({ providers: { tavily: stableProviderB } });
assert.equal(stableA.bundle.evidenceBundleId, stableB.bundle.evidenceBundleId, "fixed inputs should produce stable enriched evidenceBundleId");
assert.deepEqual(stableA.bundle, stableB.bundle, "fixed inputs should produce stable enriched bundle");

const immutableCandidate = deepClone(baseCandidate);
const immutableBundle = deepClone(baseBundle);
const immutableResults = { [tokyoKyotoQuery]: [transportResult("https://www.japan.travel/en/rail/tokyo-kyoto")] };
const immutableResultsBefore = deepClone(immutableResults);
await enrich({
  candidate: immutableCandidate,
  baseBundle: immutableBundle,
  providers: { tavily: makeProvider(immutableResults) },
});
assert.deepEqual(immutableCandidate, baseCandidate, "adapter must not mutate candidate input");
assert.deepEqual(immutableBundle, baseBundle, "adapter must not mutate baseBundle input");
assert.deepEqual(immutableResults, immutableResultsBefore, "adapter must not mutate provider result fixtures");

let fetchCalls = 0;
const injectedNoFetchProvider = createWebSearchEvidenceProvider({
  mode: "injected",
  injectedResults: stableProviderResults,
  fetchImpl() {
    fetchCalls += 1;
    throw new Error("real fetch must not be used");
  },
  now: () => fixedNow,
});
const noFetch = await enrich({ providers: { tavily: injectedNoFetchProvider } });
assertValidBundle(noFetch.bundle, "injected provider no fetch");
assert.equal(fetchCalls, 0, "injected online evidence adapter must not call fetchImpl");

for (const bundle of allBundles) {
  assertValidBundle(bundle, `tracked bundle ${bundle.evidenceBundleId}`);
}
assert.notEqual(twoTransport.bundle.evidenceBundleId, baseBundle.evidenceBundleId, "enriched content should receive a new EvidenceBundle ID");

const acceptedHash = sha256IfExists(acceptedPath);
const bootstrapHash = sha256IfExists(bootstrapPath);
assert.equal(acceptedHash, "AEA28BCC03EAF6CCCE5FD7453F88ECE4F0060789F135EAF837B568D9C43E7E3F".toLowerCase(), "accepted-routes hash changed");
assert.equal(bootstrapHash, "9F5E2B2557A9E547073DA4D299F08B5B18B6EBA38B3BD55FC995A16ADF1CD9EF".toLowerCase(), "bootstrap hash changed");
const acceptedCopyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase3c1-accepted-copy-")), "accepted-routes-copy.json");
fs.copyFileSync(acceptedPath, acceptedCopyPath);
const repository = createAcceptedRouteRepository({ storagePath: acceptedCopyPath });
const feedCounts = {
  all: repository.list({ limit: 99999 }).total,
  cross: repository.list({ limit: 99999, routeType: "cross" }).total,
  single: repository.list({ limit: 99999, routeType: "single" }).total,
};
assert.deepEqual(feedCounts, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline changed");

assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "protected files or real caches changed during Phase 3C-1 verification");

console.log(JSON.stringify({
  status: "PASS",
  queryCount: queries.length,
  baseEvidenceBundleId: baseBundle.evidenceBundleId,
  enrichedTransportEvidenceBundleId: twoTransport.bundle.evidenceBundleId,
  singleSourceTransportStatus: "weak_signal",
  multiSourceTransportStatus: "verified",
  singleSourceSeasonStatus: "weak_signal",
  multiSourceSeasonStatus: "verified",
  budgetFit: "unknown",
  diagnosticsCovered: ["provider-not-configured", "timeout", "no-result", "parse-failed", "provider-error"],
  fetchCalls,
  acceptedHash,
  bootstrapHash,
  feedReadyPoolCount: feedCounts,
  realCachesUnchanged: true,
}, null, 2));
