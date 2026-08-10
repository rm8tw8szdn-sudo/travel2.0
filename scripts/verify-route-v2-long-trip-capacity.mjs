import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
} from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-long-trip-capacity-"));
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;

globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_LONG_TRIP_CAPACITY");
};

function memorySearchCache() {
  const entries = new Map();
  return {
    get(intent) {
      return structuredClone(entries.get(intent.intentHash) || null);
    },
    put(item) {
      entries.set(item.intent.intentHash, structuredClone(item));
    },
    appendReviewCandidates() {},
    findRoute() {
      return null;
    },
  };
}

function runtimeEnv(enabled) {
  return {
    ROUTE_V2_RUNTIME_ENABLED: enabled ? "true" : "false",
    ROUTE_V2_CANARY_PERCENTAGE: enabled ? "100" : "0",
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
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
}

function createService(root, enabled, repository) {
  const env = runtimeEnv(enabled);
  const acceptedRepository = createAcceptedRouteRepository({
    storagePath: path.join(root, "accepted", "accepted-routes.json"),
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({
      storagePath: path.join(root, "runtime", "legacy-evidence.json"),
    }),
    candidatePoolStore: createRouteCandidatePoolStore({
      storagePath: path.join(root, "runtime", "candidate-pool.jsonl"),
      env,
    }),
    decisionTraceStore: createDecisionTraceStore({
      storagePath: path.join(root, "runtime", "decision-traces.jsonl"),
      env,
    }),
    evidenceBundleStore: createEvidenceBundleStore({
      storagePath: path.join(root, "runtime", "evidence-bundles.jsonl"),
      env,
    }),
    knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository }),
    env,
  });
  return {
    acceptedRepository,
    service: createRouteSearchService({
      acceptedRepository,
      searchCache: memorySearchCache(),
      planner,
      intentCatalog: createKnowledgeEntityLayerSearchIntentCatalog({ repository }),
      env,
    }),
    runtimeRoot: path.join(root, "runtime"),
  };
}

function countries(record = {}) {
  return [...new Set((record.countryEntities || []).map((entry) => entry.countryCode).filter(Boolean))];
}

try {
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
  const enabled = createService(path.join(temporaryRoot, "enabled"), true, repository);
  const results = {};
  for (const [key, query] of Object.entries({
    japan7: "日本7天",
    japan14: "日本14天",
    japan30: "日本30天",
    japan100: "日本100天",
    europe100: "欧洲100天",
  })) {
    results[key] = await enabled.service.search({ query, limit: 6, sessionId: `long-trip-${key}` });
  }

  assert(results.japan7.records.length > 0, JSON.stringify(results.japan7.diagnostics));
  assert(results.japan7.records.every((record) => Number(record.durationDays) === 7));
  assert(results.japan7.records.every((record) => countries(record).every((code) => code === "JP")));
  assert.equal(results.japan7.intent.tripCapacity.mode, "curated");

  const japan14 = results.japan14.records[0];
  assert(japan14, JSON.stringify(results.japan14.diagnostics));
  assert.equal(results.japan14.intent.tripCapacity.mode, "extended");
  assert.equal(japan14.routeReferenceMode, "country-expansion");
  assert.equal(japan14.durationPolicy, "bounded-expansion");
  assert.equal(japan14.routeExpansion.mode, "extended");
  assert.equal(japan14.routeExpansion.requestedDays, 14);
  assert(japan14.routeExpansion.actualPoiCount >= 5);

  const japan30 = results.japan30.records[0];
  assert(japan30, JSON.stringify(results.japan30.diagnostics));
  assert.equal(results.japan30.intent.tripCapacity.mode, "deep-exploration");
  assert.equal(japan30.routeExpansion.mode, "deep-exploration");
  assert.equal(japan30.routeExpansion.requestedDays, 30);
  assert(japan30.routeExpansion.actualPoiCount > japan14.routeExpansion.actualPoiCount);
  assert(["target-covered", "knowledge-capacity-limited"].includes(japan30.routeExpansion.coverageStatus));
  if (japan30.routeExpansion.coverageStatus === "target-covered") {
    assert.equal(japan30.routeExpansion.actualPoiCount, japan30.routeExpansion.targetPoiCount);
  } else {
    assert(japan30.routeExpansion.actualPoiCount < japan30.routeExpansion.targetPoiCount);
  }

  for (const key of ["japan100", "europe100"]) {
    assert.equal(results[key].records.length, 0, key);
    assert.equal(results[key].intent.tripCapacity.supported, false, key);
    assert.equal(results[key].diagnostics.reason, "trip-duration-capacity-exceeded", key);
    assert.equal(results[key].diagnostics.plannerCalled, undefined, key);
  }

  const disabled = createService(path.join(temporaryRoot, "disabled"), false, repository);
  const disabledJapan7 = await disabled.service.search({
    query: "日本7天",
    limit: 6,
    sessionId: "long-trip-v2-disabled-japan7",
  });
  assert(disabledJapan7.records.length > 0, JSON.stringify(disabledJapan7.diagnostics));
  assert(disabledJapan7.records.every((record) => Number(record.durationDays) === 7));
  assert(disabledJapan7.records.every((record) => countries(record).every((code) => code === "JP")));
  assert.equal(disabledJapan7.diagnostics.routeV2Runtime.enabled, false);
  assert.equal(fs.existsSync(disabled.runtimeRoot), false, "disabled requests must not create V2 runtime sidecars");

  assert.equal(enabled.acceptedRepository.list({ limit: 100 }).records.length, 0);
  assert.equal(disabled.acceptedRepository.list({ limit: 100 }).records.length, 0);
  assert.equal(externalFetchCalls, 0);

  console.log(JSON.stringify({
    status: "PASS",
    japan7: { records: results.japan7.records.length, mode: results.japan7.intent.tripCapacity.mode },
    japan14: japan14.routeExpansion,
    japan30: japan30.routeExpansion,
    japan100: results.japan100.diagnostics.reason,
    europe100: results.europe100.diagnostics.reason,
    v2DisabledJapan7Records: disabledJapan7.records.length,
    externalFetchCalls,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
