import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  buildRouteCandidatesFromPool,
  buildRouteDestinationSuggestion,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  parseSearchIntent,
  validateRouteForUse,
} from "../src/lib/routes/index.mjs";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function numericOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1));
}

function stats(values) {
  const average = mean(values);
  const deviation = standardDeviation(values);
  return {
    samples: values.length,
    rawMs: values.map((value) => Number(value.toFixed(3))),
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    p99Ms: Number(percentile(values, 0.99).toFixed(3)),
    maxMs: Number(Math.max(...values, 0).toFixed(3)),
    meanMs: Number(average.toFixed(3)),
    standardDeviationMs: Number(deviation.toFixed(3)),
    coefficientOfVariation: Number((average ? deviation / average : 0).toFixed(6)),
  };
}

function addTiming(timings, name, durationMs) {
  timings[name] = (timings[name] || 0) + durationMs;
}

function timedFunction(name, timings, operation) {
  return (...args) => {
    const startedAt = performance.now();
    try {
      const result = operation(...args);
      if (result && typeof result.then === "function") {
        return result.finally(() => addTiming(timings, name, performance.now() - startedAt));
      }
      addTiming(timings, name, performance.now() - startedAt);
      return result;
    } catch (error) {
      addTiming(timings, name, performance.now() - startedAt);
      throw error;
    }
  };
}

function timedMethods(target, timings, mapping) {
  return new Proxy(target, {
    get(current, property, receiver) {
      const value = Reflect.get(current, property, receiver);
      const stage = mapping[property];
      if (!stage || typeof value !== "function") return value;
      return timedFunction(stage, timings, (...args) => Reflect.apply(value, current, args));
    },
  });
}

function memorySearchCache(timings) {
  const byIntent = new Map();
  const byRoute = new Map();
  return {
    get: timedFunction("cacheLookup", timings, (intent) => structuredClone(byIntent.get(intent.intentHash) || null)),
    put: timedFunction("cacheWrite", timings, (item) => {
      byIntent.set(item.intent.intentHash, structuredClone(item));
      for (const record of item.records || []) byRoute.set(record.id, structuredClone(record));
    }),
    appendReviewCandidates: timedFunction("cacheWrite", timings, () => {}),
    findRoute: timedFunction("cacheLookup", timings, (routeId) => {
      const record = byRoute.get(routeId);
      return record ? { record: structuredClone(record) } : null;
    }),
  };
}

const label = option("label", "state");
const rounds = numericOption("rounds", 10);
const outputPath = option("output");
const query = option("query", "日本7天");
const acceptedSource = path.resolve(option(
  "accepted-source",
  path.join(process.cwd(), ".route-v2-cache", "accepted-routes.json"),
));
const fixedNow = "2026-07-28T09:00:00.000Z";
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `route-v2-stage-${label}-`));
process.once("exit", () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
const originalFetch = globalThis.fetch;
let externalRequests = 0;

globalThis.fetch = async () => {
  externalRequests += 1;
  throw new Error("NETWORK_DISABLED_FOR_ROUTE_V2_STAGE_BENCHMARK");
};

const entityRepository = createPublishedKnowledgeEntityLayerRepository();
const intentCatalog = createKnowledgeEntityLayerSearchIntentCatalog({ repository: entityRepository });
const knowledgeGraph = createKnowledgeEntityLayerPlannerAdapter({ repository: entityRepository });
const envBase = {
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_TIME_INTENT_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
  ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "true",
  ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
  ROUTE_V2_READY_POOL_ENABLED: "false",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
  SEARCH_AUTO_ACCEPT_GENERATED: "false",
  SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
  SEARCH_PLANNER_TIMEOUT_MS: "30000",
};

const rows = [];
assert(fs.existsSync(acceptedSource), `accepted route source does not exist: ${acceptedSource}`);
try {
  for (let round = 0; round < rounds; round += 1) {
    const root = path.join(temporaryRoot, `round-${String(round + 1).padStart(2, "0")}`);
    fs.mkdirSync(root, { recursive: true });
    const acceptedStoragePath = path.join(root, "accepted-routes.json");
    fs.copyFileSync(acceptedSource, acceptedStoragePath);
    const timings = {};
    const env = {
      ...envBase,
      ROUTE_V2_LOCAL_EVIDENCE_ROOT: path.join(root, "local-evidence"),
      ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH: path.join(root, "local-evidence", "route-legs.jsonl"),
      ROUTE_V2_SEASON_EVIDENCE_PATH: path.join(root, "local-evidence", "seasons.jsonl"),
      ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH: path.join(root, "local-evidence", "missing.jsonl"),
      ROUTE_V2_READY_POOL_PATH: path.join(root, "ready", "ready-routes.json"),
    };
    const acceptedRepository = timedMethods(createAcceptedRouteRepository({
      storagePath: acceptedStoragePath,
    }), timings, {
      list: "acceptedRepositoryRead",
      upsert: "acceptedRepositoryWrite",
    });
    const candidatePoolStore = timedMethods(createRouteCandidatePoolStore({
      storagePath: path.join(root, "candidate-pool.jsonl"),
      env,
      now: () => fixedNow,
    }), timings, {
      replaceForIntent: "candidatePersistence",
      append: "candidatePersistence",
      listByIntent: "candidatePersistenceRead",
    });
    const decisionTraceStore = timedMethods(createDecisionTraceStore({
      storagePath: path.join(root, "decision-traces.jsonl"),
      env,
      now: () => fixedNow,
    }), timings, {
      appendLegacyRouteTrace: "decisionTracePersistence",
      appendFailureTrace: "decisionTracePersistence",
      append: "decisionTracePersistence",
      list: "decisionTraceRead",
    });
    const evidenceBundleStore = timedMethods(createEvidenceBundleStore({
      storagePath: path.join(root, "evidence-bundles.jsonl"),
      env,
      now: () => fixedNow,
    }), timings, {
      append: "evidenceBundlePersistence",
      upsert: "evidenceBundlePersistence",
      upsertLifecycle: "evidenceBundlePersistence",
      list: "evidenceBundleRead",
      listLifecycle: "evidenceBundleRead",
      getLifecycle: "evidenceBundleRead",
      getLifecycleByCandidate: "evidenceBundleRead",
    });
    const evidenceRepository = createEvidenceRepository({
      storagePath: path.join(root, "legacy-route-evidence.json"),
    });
    const routeCandidateBuilder = timedFunction(
      "candidateBuild",
      timings,
      (input) => buildRouteCandidatesFromPool(input),
    );
    const candidateEvidenceValidator = timedFunction(
      "candidateValidation",
      timings,
      (input) => validateRouteForUse(input),
    );
    const localEvidenceSidecar = timedFunction("localEvidenceSidecar", timings, async () => ({
      enabled: false,
      persisted: false,
      skipped: true,
      reason: "stage-benchmark-disabled",
    }));
    const planner = createRouteCompositionPlanner({
      acceptedRepository,
      evidenceRepository,
      candidatePoolStore,
      decisionTraceStore,
      evidenceBundleStore,
      knowledgeGraph,
      routeCandidateBuilder,
      candidateEvidenceValidator,
      localEvidenceSidecar,
      env,
    });
    const timedPlanner = {
      buildCandidates: timedFunction(
        "plannerTotal",
        timings,
        (request) => planner.buildCandidates(request),
      ),
    };
    const service = createRouteSearchService({
      acceptedRepository,
      searchCache: memorySearchCache(timings),
      planner: timedPlanner,
      intentCatalog,
      now: () => Date.parse(fixedNow),
      env,
    });

    const parseStartedAt = performance.now();
    const directIntent = parseSearchIntent(query, {
      catalogs: intentCatalog,
      timeIntentEnabled: true,
    });
    timings.searchIntentParseReference = performance.now() - parseStartedAt;
    const acceptedForSuggestion = acceptedRepository.list({
      limit: 99_999,
      sessionId: `stage-${label}-${round}`,
      routeType: "",
    }).records;
    const suggestionStartedAt = performance.now();
    buildRouteDestinationSuggestion({
      intent: directIntent,
      sessionId: `stage-${label}-${round}`,
      acceptedRoutes: acceptedForSuggestion,
      intentCatalog,
    });
    timings.destinationSuggestionReference = performance.now() - suggestionStartedAt;
    // The reference measurements above must not be charged to the actual Search request.
    timings.acceptedRepositoryRead = 0;

    const startedAt = performance.now();
    const result = await service.search({
      query,
      limit: 6,
      sessionId: `stage-${label}-${round}`,
    });
    timings.searchTotal = performance.now() - startedAt;
    assert.equal(result.records.length, 1, JSON.stringify(result.diagnostics));
    assert.equal(result.diagnostics.plannerCalled, true, JSON.stringify(result.diagnostics));

    const knownPlannerSubstages = [
      "candidateBuild",
      "candidatePersistence",
      "candidatePersistenceRead",
      "candidateValidation",
      "decisionTracePersistence",
      "decisionTraceRead",
      "evidenceBundlePersistence",
      "evidenceBundleRead",
      "localEvidenceSidecar",
    ].reduce((sum, name) => sum + (timings[name] || 0), 0);
    const knownSearchSubstages = [
      "plannerTotal",
      "cacheLookup",
      "cacheWrite",
      "acceptedRepositoryRead",
      "acceptedRepositoryWrite",
    ].reduce((sum, name) => sum + (timings[name] || 0), 0);
    timings.plannerSelectionCompositionValidationResidual = Math.max(
      0,
      (timings.plannerTotal || 0) - knownPlannerSubstages,
    );
    timings.searchRankingFinalAssemblyResidual = Math.max(
      0,
      timings.searchTotal - knownSearchSubstages,
    );
    rows.push({
      round: round + 1,
      routeId: result.records[0].id,
      candidateCount: candidatePoolStore.listByIntent(result.records[0].intentId).length,
      timings: Object.fromEntries(
        Object.entries(timings).map(([name, durationMs]) => [name, Number(durationMs.toFixed(3))]),
      ),
    });
  }
} finally {
  globalThis.fetch = originalFetch;
}

const stageNames = [...new Set(rows.flatMap((row) => Object.keys(row.timings)))].sort();
const report = {
  schemaVersion: "route-v2-search-stage-attribution-v1",
  label,
  query,
  acceptedSource,
  rounds,
  externalRequests,
  measurementBoundary: {
    searchTotal: "Fresh in-process Search service with fresh file stores; module/server startup excluded.",
    referenceStages: "Parser and destination-suggestion references are measured separately with the same input.",
    residuals: "Residual stages are elapsed totals minus timed dependency calls; they include internal selection, skeleton, route-copy generation, validation, ranking, and response assembly.",
  },
  rows,
  stages: Object.fromEntries(stageNames.map((name) => [
    name,
    stats(rows.map((row) => row.timings[name] || 0)),
  ])),
};

assert.equal(externalRequests, 0);
if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
