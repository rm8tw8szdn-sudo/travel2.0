import assert from "node:assert/strict";
import crypto from "node:crypto";
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
  createLocalEvidenceRepository,
  createPublishedKnowledgeEntityLayerRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  createRouteV2ReadyPool,
  resolveRouteV2RuntimeDecision,
} from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-pr19-p1-closures-"));
const fixedNow = "2026-07-29T15:00:00.000Z";
const originalFetch = globalThis.fetch;
let externalFetchCalls = 0;

globalThis.fetch = async () => {
  externalFetchCalls += 1;
  throw new Error("NETWORK_DISABLED_FOR_PR19_P1_CLOSURES");
};

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function snapshotPath(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    const bytes = fs.readFileSync(targetPath);
    return { type: "file", bytes: bytes.length, sha256: sha256(bytes) };
  }
  return {
    type: "directory",
    entries: fs.readdirSync(targetPath, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolutePath = path.join(entry.parentPath || entry.path, entry.name);
        const bytes = fs.readFileSync(absolutePath);
        return {
          path: path.relative(targetPath, absolutePath).replace(/\\/gu, "/"),
          bytes: bytes.length,
          sha256: sha256(bytes),
        };
      })
      .sort((left, right) => left.path.localeCompare(right.path, "en")),
  };
}

function snapshotSidecars(paths) {
  return Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, snapshotPath(value)]));
}

function memorySearchCache() {
  const byIntent = new Map();
  return {
    get(intent) {
      return structuredClone(byIntent.get(intent.intentHash) || null);
    },
    put(item) {
      byIntent.set(item.intent.intentHash, structuredClone(item));
    },
    appendReviewCandidates() {},
    findRoute() {
      return null;
    },
  };
}

function runtimeEnv(root, {
  master = true,
  percentage = 100,
} = {}) {
  return {
    ROUTE_V2_RUNTIME_ENABLED: master ? "true" : "false",
    ROUTE_V2_CANARY_PERCENTAGE: String(percentage),
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "false",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "false",
    ROUTE_V2_PUBLICATION_GATE_ENABLED: "false",
    ROUTE_V2_READY_POOL_ENABLED: "true",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "30000",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: path.join(root, "candidate-pool.jsonl"),
    ROUTE_V2_TRACE_PATH: path.join(root, "decision-traces.jsonl"),
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(root, "evidence-bundles.jsonl"),
    ROUTE_V2_READY_POOL_PATH: path.join(root, "ready-pool.json"),
    ROUTE_V2_LOCAL_EVIDENCE_ROOT: path.join(root, "local-evidence"),
  };
}

function findSession(env, expectedIncluded) {
  for (let index = 0; index < 10_000; index += 1) {
    const sessionId = `pr19-p1-session-${index}`;
    const decision = resolveRouteV2RuntimeDecision({ env, sessionId }).decision;
    if (decision.included === expectedIncluded) return sessionId;
  }
  throw new Error(`Unable to find a ${expectedIncluded ? "included" : "excluded"} canary session.`);
}

function buildRealService(root, env, repository) {
  const paths = {
    candidate: env.ROUTE_V2_CANDIDATE_POOL_PATH,
    trace: env.ROUTE_V2_TRACE_PATH,
    evidence: env.ROUTE_V2_EVIDENCE_BUNDLE_PATH,
    ready: env.ROUTE_V2_READY_POOL_PATH,
    localEvidence: env.ROUTE_V2_LOCAL_EVIDENCE_ROOT,
  };
  const acceptedRepository = createAcceptedRouteRepository({
    storagePath: path.join(root, "accepted-routes.json"),
  });
  const candidatePoolStore = createRouteCandidatePoolStore({
    storagePath: paths.candidate,
    env,
    now: () => fixedNow,
  });
  const decisionTraceStore = createDecisionTraceStore({
    storagePath: paths.trace,
    env,
    now: () => fixedNow,
  });
  const evidenceBundleStore = createEvidenceBundleStore({
    storagePath: paths.evidence,
    env,
    now: () => fixedNow,
  });
  const localEvidenceRepository = createLocalEvidenceRepository({
    env,
    storageRoot: paths.localEvidence,
    seedRoot: path.join(root, "empty-evidence-seed"),
    now: () => fixedNow,
  });
  const readyPool = createRouteV2ReadyPool({
    storagePath: paths.ready,
    env,
    now: () => fixedNow,
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({
      storagePath: path.join(root, "legacy-evidence.json"),
    }),
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    readyPool,
    knowledgeGraph: createKnowledgeEntityLayerPlannerAdapter({ repository }),
    env,
  });
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache: memorySearchCache(),
    planner,
    intentCatalog: createKnowledgeEntityLayerSearchIntentCatalog({ repository }),
    env,
    now: () => Date.parse(fixedNow),
  });
  return { service, paths };
}

async function runSidecarScenario(repository, name, {
  master,
  percentage,
  included,
}) {
  const root = path.join(temporaryRoot, "sidecars", name);
  const env = runtimeEnv(root, { master, percentage });
  const sessionId = percentage === 50
    ? findSession(env, included)
    : `pr19-${name}`;
  const { service, paths } = buildRealService(root, env, repository);
  const before = snapshotSidecars(paths);
  const result = await service.search({
    query: "Japan seven days",
    sessionId,
    limit: 6,
  });
  const after = snapshotSidecars(paths);
  assert(result.records.length > 0, `${name}: legacy or V2 Search must remain usable`);
  assert.equal(result.diagnostics.routeV2Runtime.enabled, included, `${name}: runtime decision`);
  if (!included) {
    assert.deepEqual(after, before, `${name}: excluded requests must not write any V2 sidecar`);
    assert(result.records.every((record) => !String(record.generationVersion || "").startsWith("route-generation-v2-")));
  } else {
    assert(after.candidate || after.trace, `${name}: included requests must retain the V2 persistence path`);
  }
  return {
    name,
    sessionId,
    enabled: result.diagnostics.routeV2Runtime.enabled,
    records: result.records.length,
    changedSidecars: Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key])),
  };
}

function reasonCodes(result) {
  return result.diagnostics?.constraintConflict?.reasonCodes || [];
}

try {
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot });
  const sidecarScenarios = [];
  sidecarScenarios.push(await runSidecarScenario(repository, "master-off", {
    master: false,
    percentage: 100,
    included: false,
  }));
  sidecarScenarios.push(await runSidecarScenario(repository, "canary-zero", {
    master: true,
    percentage: 0,
    included: false,
  }));
  sidecarScenarios.push(await runSidecarScenario(repository, "canary-half-excluded", {
    master: true,
    percentage: 50,
    included: false,
  }));
  sidecarScenarios.push(await runSidecarScenario(repository, "canary-half-included", {
    master: true,
    percentage: 50,
    included: true,
  }));
  sidecarScenarios.push(await runSidecarScenario(repository, "canary-full", {
    master: true,
    percentage: 100,
    included: true,
  }));

  const searchRoot = path.join(temporaryRoot, "search");
  const searchEnv = runtimeEnv(searchRoot, { master: true, percentage: 100 });
  const { service } = buildRealService(searchRoot, searchEnv, repository);

  const highConfidence = await service.search({
    query: "Jappan 7 days",
    sessionId: "pr19-high-confidence-typo",
    limit: 6,
  });
  assert.equal(highConfidence.records.length, 0);
  assert.equal(highConfidence.diagnostics.reason, "destination-confirmation-required");

  const unresolvedQueries = [
    "Jappann 7 days",
    "Italyyy 7 days",
    "Thailannd 10 days",
    "Jappan Italyy 7 days",
    "Japan Italyyy 7 days",
    "Atlantiss 7 days",
  ];
  const unresolvedResults = [];
  for (const query of unresolvedQueries) {
    const result = await service.search({
      query,
      sessionId: `pr19-unresolved-${unresolvedResults.length}`,
      limit: 6,
    });
    assert.equal(result.records.length, 0, `${query}: must not return an unrelated route`);
    assert(
      ["unresolved-destination", "destination-confirmation-required"].includes(result.diagnostics.reason),
      `${query}: must stop or request an explicit destination confirmation`,
    );
    assert.equal(result.diagnostics.plannerCalled, undefined, query);
    unresolvedResults.push({ query, reason: result.diagnostics.reason });
  }

  const genericQueries = [
    "where should I travel for seven days",
    "family trip for seven days",
    "summer trip in Europe",
  ];
  for (const query of genericQueries) {
    const result = await service.search({
      query,
      sessionId: `pr19-generic-${genericQueries.indexOf(query)}`,
      limit: 6,
    });
    assert.notEqual(result.intent.failureReason, "unresolved-destination", query);
    assert.equal(result.intent.parseSuccess, true, query);
  }

  const unsupportedThemes = [
    "Japan family 7 days",
    "Japan hiking 7 days",
    "Japan honeymoon 7 days",
  ];
  const themeResults = [];
  for (const query of unsupportedThemes) {
    const result = await service.search({
      query,
      sessionId: `pr19-theme-${themeResults.length}`,
      limit: 6,
    });
    assert.equal(result.records.length, 0, `${query}: generic routes must not be presented as theme matches`);
    assert.equal(result.intent.normalizedRouteIntent.softPreferences.themeConstraintMode, "explicit", query);
    assert.equal(result.diagnostics.reason, "constraint-conflict", query);
    assert(
      reasonCodes(result).includes("explicit-theme-mismatch"),
      `${query}: ${JSON.stringify(result.diagnostics.constraintConflict)}`,
    );
    themeResults.push({ query, reasonCodes: reasonCodes(result) });
  }

  const structuralThemes = [
    "Iceland loop 7 days",
    "weekend trip",
    "island vacation",
  ];
  for (const query of structuralThemes) {
    const result = await service.search({
      query,
      sessionId: `pr19-structural-${structuralThemes.indexOf(query)}`,
      limit: 6,
    });
    if (result.records.length === 0) {
      assert(
        ["constraint-conflict", "no-valid-route"].includes(result.diagnostics.reason),
        `${query}: unsupported structural themes must fail safely: ${JSON.stringify(result.diagnostics)}`,
      );
    } else {
      assert(!reasonCodes(result).includes("explicit-theme-mismatch"), query);
    }
  }

  const routesSource = fs.readFileSync(path.join(projectRoot, "routes.js"), "utf8");
  assert(routesSource.includes('searchFailureCodes.includes("explicit-theme-mismatch")'));
  assert(routesSource.includes("暂时没有符合这个旅行主题的可靠路线"));
  assert.equal(externalFetchCalls, 0);

  console.log(JSON.stringify({
    verifier: "route-v2-pr19-p1-closures",
    status: "PASS",
    sidecarScenarios,
    unresolvedResults,
    themeResults,
    genericQueries,
    structuralThemes,
    externalFetchCalls,
    temporaryStorage: true,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
