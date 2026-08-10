import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
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
} from "../../src/lib/routes/index.mjs";

function clean(value) {
  return String(value || "").trim();
}

function memorySearchCache() {
  const byIntent = new Map();
  const byRoute = new Map();
  return {
    get(intent) {
      return structuredClone(byIntent.get(intent.intentHash) || null);
    },
    put(item) {
      byIntent.set(item.intent.intentHash, structuredClone(item));
      for (const record of item.records || []) byRoute.set(record.id, structuredClone(record));
    },
    appendReviewCandidates() {},
    findRoute(routeId) {
      const record = byRoute.get(routeId);
      return record ? { record: structuredClone(record) } : null;
    },
  };
}

export function routeDestinationIds(record = {}) {
  return (Array.isArray(record.destinationEntities) ? record.destinationEntities : [])
    .filter((entry) => clean(entry?.entityTypeName || "city") !== "poi")
    .map((entry) => clean(entry?.wikidataId || entry?.entityId || entry?.id || entry?.name))
    .filter(Boolean);
}

export function routeCountryCodes(record = {}) {
  const authoritative = Array.isArray(record.countryEntities) && record.countryEntities.length
    ? record.countryEntities.map((entry) => entry?.countryCode || entry?.entityId)
    : Array.isArray(record.countryCodes) && record.countryCodes.length
      ? record.countryCodes
      : Array.isArray(record.countries) && record.countries.some((entry) => /^[a-z]{2}$/iu.test(clean(entry)))
        ? record.countries
        : (record.destinationEntities || []).map((entry) => entry?.countryCode);
  return [...new Set(authoritative
    .map((value) => clean(value).toUpperCase())
    .filter((value) => /^[A-Z]{2}$/u.test(value)))];
}

export function routeDestinationCountryCodes(record = {}) {
  return [...new Set((Array.isArray(record.destinationEntities) ? record.destinationEntities : [])
    .filter((entry) => clean(entry?.entityTypeName || "city") !== "poi")
    .map((entry) => clean(entry?.countryCode).toUpperCase())
    .filter((value) => /^[A-Z]{2}$/u.test(value)))];
}

export function createExplicitConstraintHarness(name) {
  const fixedNow = "2026-08-10T06:00:00.000Z";
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `route-v2-${name}-`));
  const repository = createPublishedKnowledgeEntityLayerRepository();
  const intentCatalog = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
  const originalFetch = globalThis.fetch;
  let externalFetchCalls = 0;

  globalThis.fetch = async () => {
    externalFetchCalls += 1;
    throw new Error(`NETWORK_DISABLED_FOR_${name.toUpperCase().replace(/[^A-Z0-9]+/gu, "_")}`);
  };

  async function runQuery(query, label) {
    const queryRoot = path.join(tempRoot, label);
    const env = {
      ROUTE_V2_RUNTIME_ENABLED: "true",
      ROUTE_V2_CANARY_PERCENTAGE: "100",
      ROUTE_V2_INTENT_ENABLED: "true",
      ROUTE_V2_TIME_INTENT_ENABLED: "true",
      ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
      ROUTE_V2_TRACE_ENABLED: "true",
      ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
      ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
      ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "false",
      ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
      ROUTE_V2_READY_POOL_ENABLED: "false",
      ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
      ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
      ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
      ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "false",
      SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
      SEARCH_PLANNER_TIMEOUT_MS: "30000",
      SEARCH_AUTO_ACCEPT_GENERATED: "false",
      ROUTE_V2_CANDIDATE_POOL_PATH: path.join(queryRoot, "candidate-pool.jsonl"),
      ROUTE_V2_TRACE_PATH: path.join(queryRoot, "decision-traces.jsonl"),
      ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(queryRoot, "evidence-bundles.jsonl"),
    };
    const acceptedRepository = createAcceptedRouteRepository({
      storagePath: path.join(queryRoot, "accepted-routes.json"),
    });
    const candidatePoolStore = createRouteCandidatePoolStore({
      storagePath: env.ROUTE_V2_CANDIDATE_POOL_PATH,
      env,
      now: () => fixedNow,
    });
    const decisionTraceStore = createDecisionTraceStore({
      storagePath: env.ROUTE_V2_TRACE_PATH,
      env,
      now: () => fixedNow,
    });
    const planner = createRouteCompositionPlanner({
      acceptedRepository,
      evidenceRepository: createEvidenceRepository({
        storagePath: path.join(queryRoot, "legacy-evidence.json"),
      }),
      candidatePoolStore,
      decisionTraceStore,
      evidenceBundleStore: createEvidenceBundleStore({
        storagePath: env.ROUTE_V2_EVIDENCE_BUNDLE_PATH,
        env,
        now: () => fixedNow,
      }),
      knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository }),
      env,
    });
    const service = createRouteSearchService({
      acceptedRepository,
      searchCache: memorySearchCache(),
      planner,
      intentCatalog,
      env,
      now: () => Date.parse(fixedNow),
    });
    const parsedIntent = parseSearchIntent(query, {
      catalogs: intentCatalog,
      timeIntentEnabled: true,
    });
    const response = await service.search({
      query,
      limit: 6,
      sessionId: `${name}-${label}`,
    }, { requestId: `${name}-${label}` });
    return {
      parsedIntent,
      response,
      candidates: candidatePoolStore.readAll().filter((entry) => entry.ok).map((entry) => entry.candidate),
      traces: decisionTraceStore.list(),
      acceptedWrites: acceptedRepository.list({ limit: 10_000 }).records.length,
    };
  }

  function close() {
    globalThis.fetch = originalFetch;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return {
    runQuery,
    close,
    externalFetchCalls: () => externalFetchCalls,
  };
}
