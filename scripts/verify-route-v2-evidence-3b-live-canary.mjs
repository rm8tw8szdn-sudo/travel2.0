import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMissingRouteLegEvidence,
  collectOfflineEvidenceBatch,
  createLocalEvidenceRepository,
  createOfflineEvidenceEntityResolver,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteV2LiveEvidenceCanaryProvider,
  isRouteV2OfflineEvidenceCollectionEnabled,
  parseOfflineEvidenceCollectorArgs,
  routeLegEvidenceKey,
  routeV2OnlineEvidenceConfig,
} from "../src/lib/routes/index.mjs";
import {
  ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES,
  ROUTE_V2_LIVE_CANARY_STORAGE_ROOT,
  runRouteV2LocalEvidenceCollector,
} from "./collect-route-v2-local-evidence.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_NOW = "2026-07-21T14:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-evidence-3b-live-canary-"));
const realCanaryRoot = path.join(PROJECT_ROOT, ROUTE_V2_LIVE_CANARY_STORAGE_ROOT);

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolutePath) : [absolutePath];
  }).sort((left, right) => left.localeCompare(right, "en"));
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function treeSnapshot(root, { content = false } = {}) {
  const entries = filesUnder(root).map((absolutePath) => {
    const stat = fs.statSync(absolutePath);
    return {
      path: path.relative(root, absolutePath).replaceAll("\\", "/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ...(content ? { sha256: sha256File(absolutePath) } : {}),
    };
  });
  return {
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    hash: crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}

function protectedSnapshot() {
  return {
    accepted: sha256File(path.join(PROJECT_ROOT, ".route-v2-cache", "accepted-routes.json")),
    cache: treeSnapshot(path.join(PROJECT_ROOT, ".route-v2-cache")),
    knowledge: treeSnapshot(path.join(PROJECT_ROOT, "data", "knowledge"), { content: true }),
  };
}

function response({ status = 200, url, html = "", contentType = "text/html; charset=utf-8" } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: { get(name) { return name.toLocaleLowerCase("en-US") === "content-type" ? contentType : null; } },
    async text() { return html; },
  };
}

function discoveryProvider(results) {
  return {
    providerId: "controlled-discovery-contract",
    capabilities: { configured: true, evidenceSource: true, realtimeUserRequest: false, producesRouteRecord: false },
    async searchEvidence({ query }) {
      return {
        ok: true,
        configured: true,
        attempted: true,
        provider: "controlled-discovery-contract",
        query,
        results,
        failure: "",
        diagnostics: [],
        attempts: 1,
        retrievedAt: FIXED_NOW,
      };
    },
  };
}

const routeContext = {
  record: { fromEntityId: "Q1490", toEntityId: "Q34600", transportMode: "shinkansen" },
  from: { name: "Tokyo", canonicalNameEn: "Tokyo", canonicalNameZh: "东京都", aliases: [] },
  to: { name: "Kyoto", canonicalNameEn: "Kyoto", canonicalNameZh: "京都市", aliases: [] },
};
const officialRouteUrl = "https://global.jr-central.co.jp/en/onlinebooking/contents/kyoto/";
const officialRouteHtml = `<!doctype html><html><head><title>Kyoto by Shinkansen</title></head><body>
  <main><h1>Tokyo to Kyoto</h1><p>Tokyo to Kyoto by Tokaido Shinkansen takes about 130 minutes by direct train service.</p>
  <p>${"Operational source context. ".repeat(40)}</p><p>BODY_SENTINEL_MUST_NOT_BE_RETURNED</p></main></body></html>`;

const before = protectedSnapshot();
const realCanaryExistedBefore = fs.existsSync(realCanaryRoot);

assert.deepEqual(parseOfflineEvidenceCollectorArgs(["--canary"]), {
  limit: 20, type: "all", country: "", dryRun: false, resume: false, canary: true,
});
assert.equal(parseOfflineEvidenceCollectorArgs([]).canary, false);
assert.match(fs.readFileSync(path.join(PROJECT_ROOT, ".gitignore"), "utf8"), /^\.route-v2-local-evidence-canary\/$/mu);

let fetchCalls = 0;
const provider = createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider: discoveryProvider([
    { sourceUrl: officialRouteUrl, sourceTitle: "Discovery title", sourceSnippet: "Discovery snippet must not be persisted." },
    { sourceUrl: officialRouteUrl, sourceTitle: "Duplicate", sourceSnippet: "Duplicate" },
    { sourceUrl: "https://example.com/untrusted", sourceTitle: "Untrusted", sourceSnippet: "Untrusted" },
  ]),
  fetchImpl: async (url) => {
    fetchCalls += 1;
    return response({ status: 200, url, html: officialRouteHtml });
  },
  now: () => FIXED_NOW,
});
assert.equal(provider.capabilities.configured, true);
const success = await provider.searchEvidence({ query: "Tokyo to Kyoto official shinkansen", context: routeContext, timeoutMs: 500 });
assert.equal(success.ok, true);
assert.equal(success.attempts, 2, "one discovery request plus one deduplicated official-page fetch expected");
assert.equal(fetchCalls, 1, "duplicate official URLs must only be fetched once");
assert.equal(success.results.length, 1);
assert.equal(success.results[0].sourceHttpStatus, 200);
assert.match(success.results[0].sourceContentHash, /^[a-f0-9]{64}$/u);
assert(success.results[0].sourceSnippet.length <= 1_200);
assert.equal(success.results[0].sourceSnippet.includes("Discovery snippet must not be persisted"), false);
assert.equal(JSON.stringify(success).includes("BODY_SENTINEL_MUST_NOT_BE_RETURNED"), false, "full page body must not be returned");
assert.equal(success.results[0].sourceFactText, "", "a source without an explicit locator must not invent an exact fact text");
assert(success.results[0].sourceFactLocator.length <= 240);
assert.deepEqual(success.results[0].sourceDirection, { fromEntityId: "Q1490", toEntityId: "Q34600" });
assert.deepEqual(Object.keys(success.results[0]).sort(), [
  "retrievedAt", "sourceContentHash", "sourceDirection", "sourceFactLocator", "sourceFactText", "sourceHttpStatus", "sourcePublisher", "sourceSnippet", "sourceTitle", "sourceType", "sourceUrl",
].sort());

const disabledProvider = createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider: { capabilities: { configured: false }, async searchEvidence() { throw new Error("disabled provider must not run"); } },
  fetchImpl: async () => { throw new Error("disabled provider must not fetch"); },
  now: () => FIXED_NOW,
});
assert.equal(disabledProvider.capabilities.configured, false);
assert.equal((await disabledProvider.searchEvidence({ query: "Tokyo to Kyoto", context: routeContext })).failure, "provider-not-configured");

const runtimeSecret = crypto.randomBytes(16).toString("hex");
const sensitiveUrlProvider = createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider: discoveryProvider([{ sourceUrl: `${officialRouteUrl}?api_key=${runtimeSecret}`, sourceTitle: "Sensitive", sourceSnippet: "Sensitive" }]),
  fetchImpl: async () => { throw new Error("sensitive source URL must not be fetched"); },
  now: () => FIXED_NOW,
});
const sensitiveUrlResult = await sensitiveUrlProvider.searchEvidence({ query: "Tokyo to Kyoto", context: routeContext });
assert.equal(sensitiveUrlResult.ok, false);
assert(sensitiveUrlResult.diagnostics.some((entry) => entry.reason === "source-url-sensitive-or-invalid"));
assert.equal(JSON.stringify(sensitiveUrlResult).includes(runtimeSecret), false, "source URL credentials must not enter diagnostics");

const seasonUrl = "https://www.kkr.mlit.go.jp/news/top/press/20260209-3tuukoudomezixtusizyoukyou.html";
const seasonProvider = createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider: discoveryProvider([{ sourceUrl: seasonUrl, sourceTitle: "Discovery", sourceSnippet: "Discovery" }]),
  fetchImpl: async (url) => response({
    status: 200,
    url,
    html: `<html><head><title>Kyoto winter transport notice</title></head><body><main><p>Kyoto transport notice for February 2026.</p><p>Heavy snow caused preventive road closures affecting Kyoto traffic.</p>${"Official operational notice. ".repeat(20)}</main></body></html>`,
  }),
  now: () => FIXED_NOW,
});
const seasonSuccess = await seasonProvider.searchEvidence({
  query: "Kyoto February official winter closure transport restriction",
  context: {
    record: { entityId: "Q34600", month: 2 },
    entity: { name: "Kyoto", canonicalNameEn: "Kyoto", canonicalNameZh: "京都市", aliases: [] },
  },
  timeoutMs: 500,
});
assert.equal(seasonSuccess.ok, true);
assert.equal(seasonSuccess.results.length, 1);
assert.match(seasonSuccess.results[0].sourceContentHash, /^[a-f0-9]{64}$/u);

async function failureProbe({ url, fetchImpl, expectedFailure, expectedDiagnostic }) {
  const probe = createRouteV2LiveEvidenceCanaryProvider({
    discoveryProvider: discoveryProvider([{ sourceUrl: url, sourceTitle: "Official result", sourceSnippet: "Discovery only" }]),
    fetchImpl,
    now: () => FIXED_NOW,
    timeoutMs: 250,
  });
  const result = await probe.searchEvidence({ query: "Tokyo to Kyoto official rail", context: routeContext, timeoutMs: 250 });
  assert.equal(result.ok, false);
  assert.equal(result.failure, expectedFailure);
  assert(result.diagnostics.some((entry) => entry.reason === expectedDiagnostic), `${expectedDiagnostic} diagnostic expected`);
  return result;
}

const failures = {};
failures.notFound = await failureProbe({
  url: "https://global.jr-central.co.jp/missing-canary-page",
  fetchImpl: async (url) => response({ status: 404, url }),
  expectedFailure: "no-result",
  expectedDiagnostic: "source-http-404",
});
failures.rateLimited = await failureProbe({
  url: "https://www.westjr.co.jp/rate-limited-canary",
  fetchImpl: async (url) => response({ status: 429, url }),
  expectedFailure: "rate-limited",
  expectedDiagnostic: "source-rate-limited",
});
failures.serverError = await failureProbe({
  url: "https://www.kkr.mlit.go.jp/server-error-canary",
  fetchImpl: async (url) => response({ status: 503, url }),
  expectedFailure: "provider-error",
  expectedDiagnostic: "source-http-5xx",
});
failures.empty = await failureProbe({
  url: "https://www.japan.travel/en/empty-canary",
  fetchImpl: async (url) => response({ status: 200, url, html: "" }),
  expectedFailure: "parse-failed",
  expectedDiagnostic: "source-empty-content",
});
failures.parse = await failureProbe({
  url: "https://kyoto.travel/en/short-canary",
  fetchImpl: async (url) => response({ status: 200, url, html: "<p>short</p>" }),
  expectedFailure: "parse-failed",
  expectedDiagnostic: "source-parse-failed",
});
failures.redirect = await failureProbe({
  url: "https://www.jreast.co.jp/redirect-canary",
  fetchImpl: async () => response({ status: 200, url: "https://example.com/redirected", html: officialRouteHtml }),
  expectedFailure: "no-result",
  expectedDiagnostic: "source-redirected-to-untrusted-domain",
});
failures.irrelevant = await failureProbe({
  url: "https://www.westjr.co.jp/irrelevant-canary",
  fetchImpl: async (url) => response({ status: 200, url, html: `<html><title>Official operations</title><body>${"Rail operations update. ".repeat(20)}</body></html>` }),
  expectedFailure: "no-result",
  expectedDiagnostic: "source-content-irrelevant",
});
failures.timeout = await failureProbe({
  url: "https://www.jr-central.co.jp/timeout-canary",
  fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("request timed out"), { name: "AbortError" })), { once: true });
  }),
  expectedFailure: "timeout",
  expectedDiagnostic: "source-timeout",
});

let partialFetches = 0;
const partialProvider = createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider: discoveryProvider([
    { sourceUrl: "https://www.westjr.co.jp/missing-partial", sourceTitle: "Missing", sourceSnippet: "Discovery" },
    { sourceUrl: officialRouteUrl, sourceTitle: "Official", sourceSnippet: "Discovery" },
  ]),
  fetchImpl: async (url) => {
    partialFetches += 1;
    return url.includes("missing-partial") ? response({ status: 404, url }) : response({ status: 200, url, html: officialRouteHtml });
  },
  now: () => FIXED_NOW,
});
const partial = await partialProvider.searchEvidence({ query: "Tokyo to Kyoto official rail", context: routeContext, timeoutMs: 500 });
assert.equal(partial.ok, true, "one source failure must not discard another qualified source");
assert.equal(partial.results.length, 1);
assert.equal(partialFetches, 2);
assert(partial.diagnostics.some((entry) => entry.reason === "source-http-404"));

const integrationRoot = path.join(tempRoot, "collector-integration");
const env = {
  ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "true",
  ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
};
const now = () => FIXED_NOW;
const repository = createLocalEvidenceRepository({ env, storageRoot: integrationRoot, now });
const entityRepository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: PROJECT_ROOT });
const entityResolver = createOfflineEvidenceEntityResolver({
  repository: entityRepository,
  fallbacks: { JP: ROUTE_V2_EVIDENCE_3B_JAPAN_PILOT_ENTITIES },
});

for (const [fromEntityId, toEntityId, label] of [["Q1490", "Q34600", "forward"], ["Q34600", "Q1490", "reverse"]]) {
  const built = buildMissingRouteLegEvidence({ fromEntityId, toEntityId, transportMode: "shinkansen" }, { now });
  assert.equal(built.created, true);
  assert.equal(repository.routeLegStore.upsert(built.record).persisted, true);
  assert.equal(repository.missingEvidenceStore.aggregate({
    evidenceType: "route-leg",
    targetKey: routeLegEvidenceKey(built.record),
    legEvidenceId: built.record.legEvidenceId,
    requestedByBundleIds: [`live-canary-${label}`],
    selectedCandidate: true,
    critical: true,
  }).persisted, true);
}

let integrationFetches = 0;
const integrationProvider = createRouteV2LiveEvidenceCanaryProvider({
  discoveryProvider: discoveryProvider([{ sourceUrl: officialRouteUrl, sourceTitle: "Official", sourceSnippet: "Discovery" }]),
  fetchImpl: async (url) => {
    integrationFetches += 1;
    return response({ status: 200, url, html: officialRouteHtml });
  },
  now,
});
const integrationRun = await collectOfflineEvidenceBatch({
  repository,
  provider: integrationProvider,
  entityResolver,
  env,
  limit: 5,
  type: "route-leg",
  country: "JP",
  maxAttempts: 1,
  now,
});
assert.equal(integrationRun.stats.claimed, 2);
assert.equal(integrationRun.stats.resolved, 1);
assert.equal(integrationRun.stats.retryableFailures, 1);
assert.equal(integrationRun.stats.networkRequests, 4, "two discovery calls and two official-page fetches expected");
assert.equal(integrationFetches, 2);
const forward = repository.routeLegStore.list().find((record) => record.fromEntityId === "Q1490");
const reverse = repository.routeLegStore.list().find((record) => record.fromEntityId === "Q34600");
assert.equal(repository.index.getRouteLegById(forward.legEvidenceId).durationMinMinutes, 130);
assert.equal(repository.index.getRouteLegById(reverse.legEvidenceId).durationMinMinutes, null);
const reverseTask = repository.missingEvidenceStore.list().find((task) => task.legEvidenceId === reverse.legEvidenceId);
assert.equal(reverseTask.status, "pending");
assert(reverseTask.diagnostics.some((entry) => entry.code === "source-content-irrelevant"), "granular live-source diagnostics must reach the manifest");

const evidencePath = path.join(integrationRoot, "route-leg-evidence.jsonl");
const firstEvidenceHash = sha256File(evidencePath);
const rerun = await collectOfflineEvidenceBatch({
  repository,
  provider: integrationProvider,
  entityResolver,
  env,
  limit: 5,
  type: "route-leg",
  country: "JP",
  maxAttempts: 1,
  now,
});
assert.equal(rerun.stats.claimed, 0);
assert.equal(rerun.stats.networkRequests, 0);
assert.equal(sha256File(evidencePath), firstEvidenceHash, "identical rerun must not rewrite evidence");

const providerEnv = process.env.ROUTE_WEB_SEARCH_API_KEY || !process.env.SEARCH_PROVIDER_API_KEY
  ? process.env
  : { ...process.env, ROUTE_WEB_SEARCH_API_KEY: process.env.SEARCH_PROVIDER_API_KEY };
const liveRunRequested = /^(1|true|yes|on)$/iu.test(String(process.env.ROUTE_V2_LIVE_CANARY_RUN || ""));
const providerConfig = routeV2OnlineEvidenceConfig({ provider: "tavily", env: providerEnv });
const realManifestPath = path.join(realCanaryRoot, "missing-evidence-manifest.jsonl");
const blockers = [];
if (!liveRunRequested) blockers.push("live-run-not-explicitly-enabled");
if (!isRouteV2OfflineEvidenceCollectionEnabled(process.env)) blockers.push("offline-collector-flag-disabled");
if (!providerConfig.configured) blockers.push("search-provider-not-configured");
if (!fs.existsSync(realManifestPath)) blockers.push("canary-manifest-missing");

let realCanary = {
  executed: false,
  blockers,
  dryRun: null,
  limit5: null,
  rerun: null,
  limit10: null,
  expanded: false,
  externalNetworkRequests: 0,
  durationMs: 0,
};
if (blockers.length === 0) {
  const startedAt = Date.now();
  const dryRun = await runRouteV2LocalEvidenceCollector({ args: ["--canary", "--limit", "10", "--type", "all", "--country", "JP", "--dry-run"], env: providerEnv });
  const limit5 = await runRouteV2LocalEvidenceCollector({ args: ["--canary", "--limit", "5", "--type", "all", "--country", "JP"], env: providerEnv });
  const rerunLive = await runRouteV2LocalEvidenceCollector({ args: ["--canary", "--limit", "5", "--type", "all", "--country", "JP"], env: providerEnv });
  const acceptable = limit5.stats.claimed > 0
    && limit5.stats.permanentFailures === 0
    && limit5.stats.retryableFailures <= Math.ceil(limit5.stats.claimed / 2)
    && limit5.stats.resolved + limit5.stats.needsReview > 0;
  const limit10 = acceptable
    ? await runRouteV2LocalEvidenceCollector({ args: ["--canary", "--limit", "10", "--type", "all", "--country", "JP", "--resume"], env: providerEnv })
    : null;
  realCanary = {
    executed: true,
    blockers: [],
    dryRun,
    limit5,
    rerun: rerunLive,
    limit10,
    expanded: Boolean(limit10),
    externalNetworkRequests: limit5.stats.networkRequests + rerunLive.stats.networkRequests + (limit10?.stats.networkRequests || 0),
    durationMs: Date.now() - startedAt,
  };
}

const routeSearchSource = fs.readFileSync(path.join(PROJECT_ROOT, "src", "lib", "routes", "route-search-service.mjs"), "utf8");
const plannerSource = fs.readFileSync(path.join(PROJECT_ROOT, "src", "lib", "routes", "route-composition-planner.mjs"), "utf8");
assert.equal(routeSearchSource.includes("live-evidence-canary-provider"), false);
assert.equal(plannerSource.includes("live-evidence-canary-provider"), false);
assert.equal(`${routeSearchSource}\n${plannerSource}`.includes("DeepSeek"), false);
assert.deepEqual(protectedSnapshot(), before);
assert.equal(fs.existsSync(realCanaryRoot), realCanaryExistedBefore, "contract verifier must not create the real canary directory");

console.log(JSON.stringify({
  status: "PASS",
  canaryModeDefault: false,
  featureFlagDefault: isRouteV2OfflineEvidenceCollectionEnabled({}),
  providerContract: {
    discoveryRequests: 1,
    officialPageFetches: fetchCalls,
    duplicateUrlsFetchedOnce: true,
    fullBodyReturned: false,
    contentHashStored: true,
    seasonHardRiskPageSupported: true,
    unconfiguredProviderFailsSafely: true,
    sourceUrlCredentialsRedacted: true,
    partialFailureIsolation: true,
  },
  failureClasses: Object.fromEntries(Object.entries(failures).map(([name, result]) => [name, result.failure])),
  isolatedCollector: {
    ...integrationRun.stats,
    resolvedForward: true,
    reverseDirectionPending: true,
    evidenceHashStableOnRerun: true,
  },
  realCanary,
  protectedAssets: before,
  tempRoot,
}, null, 2));
