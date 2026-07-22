import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ROUTE_V2_JAPAN_EVIDENCE_PILOT_STORAGE_ROOT,
  ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES,
  ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS,
  SEARCH_KNOWLEDGE_GRAPH_FALLBACKS,
  createAcceptedRouteRepository,
  createDecisionTraceStore,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createLocalEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  createRouteSearchService,
  isRouteV2EvidenceValidationEnabled,
  isRouteV2LocalEvidenceIndexEnabled,
  normalizeRouteCandidate,
  selectRouteCandidatesWithEvidence,
  validateRouteForUse,
} from "../src/lib/routes/index.mjs";
import { runRouteV2JapanEvidencePilot as runPilot } from "./collect-route-v2-japan-evidence-pilot.mjs";

const fixedNow = "2026-07-21T13:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-japan-evidence-pilot-"));
const realPilotRoot = path.resolve(ROUTE_V2_JAPAN_EVIDENCE_PILOT_STORAGE_ROOT);
const env = {
  ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "true",
  ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
  ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "true",
  ROUTE_V2_TIME_INTENT_ENABLED: "true",
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
  SEARCH_AUTO_ACCEPT_GENERATED: "true",
  SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
  SEARCH_PLANNER_TIMEOUT_MS: "30000",
};

const CITY_NAMES = Object.freeze({
  Q1490: "Tokyo",
  Q34600: "Kyoto",
  Q35765: "Osaka",
  Q169134: "Nara",
  "anchor:JP:matsumoto": "Matsumoto",
  "anchor:JP:takayama": "Takayama",
  "anchor:JP:kanazawa": "Kanazawa",
});

const JP_POOL = ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES;

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function responseForUrl(url) {
  const matchingTargets = ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS.filter((target) => target.sources.some((source) => source.sourceUrl === url));
  if (url.includes("the-kansai-trio-kyoto-nara-and-osaka")) {
    return new Response(`<html><head><title>Official Japan pilot source</title></head><body>${matchingTargets.map((target) => (
      target.sources.find((source) => source.sourceUrl === url)?.sourceLocator?.text || ""
    )).join(" ")}</body></html>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  const body = matchingTargets.map((target) => {
    const locator = target.sources.find((source) => source.sourceUrl === url)?.sourceLocator?.text || "";
    if (target.evidenceType === "route-leg") {
      return `${CITY_NAMES[target.fromEntityId]} to ${CITY_NAMES[target.toEntityId]} official transport. ${locator}`;
    }
    const city = CITY_NAMES[target.entityId];
    const hardRisk = target.entityId === "anchor:JP:matsumoto"
      ? `${city} February monthly temperature table; no transport closure is stated.`
      : `Heavy snow or snowy conditions can affect ${city} in February.`;
    return `${city} February official season information. ${locator}. ${hardRisk}`;
  }).join(" ");
  return new Response(`<html><head><title>Official Japan pilot source</title></head><body>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

let fixtureNetworkRequests = 0;
async function fixtureFetch(url) {
  fixtureNetworkRequests += 1;
  return responseForUrl(String(url));
}

const dryRoot = path.join(tempRoot, "dry-run");
let dryFetches = 0;
const dryRun = await runPilot({
  args: ["--limit", "23", "--type", "all", "--country", "JP", "--dry-run"],
  env,
  storageRoot: dryRoot,
  fetchImpl: async () => { dryFetches += 1; throw new Error("DRY_RUN_NETWORK_FORBIDDEN"); },
});
assert.equal(dryRun.ok, true);
assert.equal(dryRun.tasks.length, 23);
assert.equal(dryRun.stats.networkRequests, 0);
assert.equal(dryFetches, 0);
assert.equal(fs.existsSync(dryRoot), false, "dry-run must not create a storage root");

const targets = ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS;
assert.equal(targets.length, 23);
assert.equal(targets.filter((target) => target.evidenceType === "route-leg").length, 16);
assert.equal(targets.filter((target) => target.evidenceType === "season").length, 7);
const forwardIds = new Set(targets.filter((target) => target.evidenceType === "route-leg").map((target) => target.pilotTargetId));
for (const target of targets.filter((item) => item.evidenceType === "route-leg")) {
  assert(forwardIds.has(`leg:${target.toEntityId}>${target.fromEntityId}:${target.transportMode}`), `${target.pilotTargetId}: reverse target required`);
}

const fixtureRoot = path.join(tempRoot, "fixture-pilot");
const first = await runPilot({
  args: ["--limit", "23", "--type", "all", "--country", "JP"],
  env,
  storageRoot: fixtureRoot,
  fetchImpl: fixtureFetch,
  now: () => fixedNow,
  clock: (() => { let value = 1_000; return () => (value += 10); })(),
});
assert.equal(first.ok, true);
assert.equal(first.seeded.targetCount, 23);
assert.equal(first.stats.claimed, 23);
assert.equal(first.stats.permanentFailures, 0);
assert.equal(first.repository.manifestCount, 23);
assert(first.repository.routeLegCount >= 8);
assert(first.repository.seasonCount >= 5);
assert(first.repository.statusCounts.resolved >= 13);
assert(first.repository.statusCounts.pending >= 7);
assert.equal(fixtureNetworkRequests, 16, "only targets with an official seed URL may fetch");

const evidenceFiles = {
  legs: path.join(fixtureRoot, "route-leg-evidence.jsonl"),
  seasons: path.join(fixtureRoot, "season-evidence.jsonl"),
};
const firstHashes = { legs: sha256File(evidenceFiles.legs), seasons: sha256File(evidenceFiles.seasons) };
await runPilot({
  args: ["--limit", "23", "--type", "all", "--country", "JP", "--resume"],
  env,
  storageRoot: fixtureRoot,
  fetchImpl: fixtureFetch,
  now: () => fixedNow,
});
await runPilot({
  args: ["--limit", "23", "--type", "all", "--country", "JP", "--resume"],
  env,
  storageRoot: fixtureRoot,
  fetchImpl: fixtureFetch,
  now: () => fixedNow,
});
const noWorkRetry = await runPilot({
  args: ["--limit", "23", "--type", "all", "--country", "JP", "--resume"],
  env,
  storageRoot: fixtureRoot,
  fetchImpl: fixtureFetch,
  now: () => fixedNow,
});
assert.equal(noWorkRetry.stats.claimed, 0);
assert.equal(noWorkRetry.stats.networkRequests, 0);
assert.equal(sha256File(evidenceFiles.legs), firstHashes.legs);
assert.equal(sha256File(evidenceFiles.seasons), firstHashes.seasons);

const fixtureRepository = createLocalEvidenceRepository({ env, storageRoot: fixtureRoot, now: () => fixedNow });
for (const record of [...fixtureRepository.routeLegStore.list(), ...fixtureRepository.seasonStore.list()]) {
  for (const source of record.sources || []) {
    assert(source.factLocator.length > 0 && source.factLocator.length <= 240);
    assert(source.factExcerpt.length > 0 && source.factExcerpt.length <= 600);
    assert.equal(source.contentHash.length, 64);
    assert.equal(source.url.startsWith("https://"), true);
  }
}
const forwardTokyoKyoto = fixtureRepository.index.getRouteLeg({ fromEntityId: "Q1490", toEntityId: "Q34600", transportMode: "rail" });
const reverseKyotoTokyo = fixtureRepository.index.getRouteLeg({ fromEntityId: "Q34600", toEntityId: "Q1490", transportMode: "rail" });
assert.equal(forwardTokyoKyoto.durationMinMinutes, 120);
assert.equal(reverseKyotoTokyo.durationMinMinutes, null, "directed evidence must not leak to reverse target");
assert.equal(fixtureRepository.index.getRouteLeg({ fromEntityId: "Q34600", toEntityId: "Q169134", transportMode: "rail" }).durationMinMinutes, 64);
assert.equal(fixtureRepository.index.getRouteLeg({ fromEntityId: "Q169134", toEntityId: "Q35765", transportMode: "rail" }).durationMinMinutes, 63);
assert.equal(fixtureRepository.index.getRouteLeg({ fromEntityId: "Q169134", toEntityId: "Q34600", transportMode: "rail" }).durationMinMinutes, null, "Kyoto -> Nara must not populate the reverse direction");
assert.equal(fixtureRepository.index.getSeason({ entityId: "Q200516", month: 2 }), null, "Japan pilot evidence must not bind to Iceland Vík's QID");

function candidate(intentId, order, durationDays = 7) {
  return normalizeRouteCandidate({
    intentId,
    countries: ["JP"],
    destinations: order.map((id) => ({ id, wikidataId: id, countryCode: "JP", name: CITY_NAMES[id] || id, entityTypeName: "city" })),
    proposedOrder: order,
    durationDays,
    travelStyle: "rail-journey",
    generationSource: "japan-evidence-pilot-verifier",
    supportingSignals: [],
    status: "pending",
    rejectionReasons: [],
    unknowns: [],
    createdAt: fixedNow,
  }, { now: () => fixedNow });
}

const readyCandidate = candidate("intent-ready", ["Q1490", "Q34600"]);
const needsCandidate = candidate("intent-needs", ["Q34600", "Q1490"]);
const rejectedCandidate = candidate("intent-rejected", ["Q1490", "Q34600", "Q35765", "Q169134", "anchor:JP:matsumoto"], 1);
const readyValidation = validateRouteForUse(readyCandidate, { timeIntent: { type: "unspecified", months: [] } }, fixtureRepository, { now: () => fixedNow });
const needsValidation = validateRouteForUse(needsCandidate, { timeIntent: { type: "unspecified", months: [] } }, fixtureRepository, { now: () => fixedNow });
const rejectedValidation = validateRouteForUse(rejectedCandidate, { timeIntent: { type: "unspecified", months: [] } }, fixtureRepository, { now: () => fixedNow });
assert.equal(readyValidation.status, "ready");
assert.equal(needsValidation.status, "needs-evidence");
assert.equal(rejectedValidation.status, "rejected");
const selected = selectRouteCandidatesWithEvidence({
  candidates: [needsCandidate, readyCandidate, rejectedCandidate],
  context: { timeIntent: { type: "unspecified", months: [] } },
  intentId: "intent-selection",
  evidenceRepository: fixtureRepository,
  now: () => fixedNow,
});
assert.equal(selected.selectedCandidate.candidateId, readyCandidate.candidateId);
assert.equal(selected.selectionMode, "evidence-ready");

function memorySearchCache() {
  const entries = new Map();
  return {
    get(key) { return entries.get(key) ? structuredClone(entries.get(key)) : null; },
    put({ intent, records = [], status = "search-generated" } = {}) {
      const item = { intentHash: intent.intentHash, records: structuredClone(records), status };
      entries.set(intent.intentHash, item);
      return structuredClone(item);
    },
    appendReviewCandidates() { return { persisted: true }; },
    findRoute() { return null; },
  };
}

function copyEvidenceRoot(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const sourceRoot = fs.existsSync(realPilotRoot) ? realPilotRoot : fixtureRoot;
  for (const name of ["route-leg-evidence.jsonl", "season-evidence.jsonl", "missing-evidence-manifest.jsonl"]) {
    fs.copyFileSync(path.join(sourceRoot, name), path.join(destination, name));
  }
  return fs.existsSync(realPilotRoot) ? "real-isolated-pilot" : "deterministic-fixture";
}

async function executeSearchSample(query, label) {
  const root = path.join(tempRoot, `search-${label}`);
  const localRoot = path.join(root, "local-evidence");
  const evidenceMode = copyEvidenceRoot(localRoot);
  const sampleEnv = {
    ...env,
    ROUTE_V2_CANDIDATE_POOL_PATH: path.join(root, "candidate-pool.jsonl"),
    ROUTE_V2_TRACE_PATH: path.join(root, "decision-traces.jsonl"),
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(root, "evidence-bundles.jsonl"),
  };
  const acceptedPath = path.join(root, "accepted-routes.json");
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: sampleEnv.ROUTE_V2_CANDIDATE_POOL_PATH, env: sampleEnv, now: () => fixedNow });
  const decisionTraceStore = createDecisionTraceStore({ storagePath: sampleEnv.ROUTE_V2_TRACE_PATH, env: sampleEnv, now: () => fixedNow });
  const evidenceBundleStore = createEvidenceBundleStore({ storagePath: sampleEnv.ROUTE_V2_EVIDENCE_BUNDLE_PATH, env: sampleEnv, now: () => fixedNow });
  const localEvidenceRepository = createLocalEvidenceRepository({ env: sampleEnv, storageRoot: localRoot, now: () => fixedNow });
  const pools = {
    ...Object.fromEntries(Object.entries(SEARCH_KNOWLEDGE_GRAPH_FALLBACKS).map(([code, destinations]) => [code, destinations.map((item) => structuredClone(item))])),
    JP: JP_POOL.map((item) => structuredClone(item)),
  };
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({ storagePath: path.join(root, "legacy-evidence.json") }),
    candidatePoolStore,
    decisionTraceStore,
    evidenceBundleStore,
    localEvidenceRepository,
    knowledgeGraph: { queryDestinations({ country }) { return (pools[country] || []).map((item) => structuredClone(item)); } },
    env: sampleEnv,
  });
  let lastPlannerResult = null;
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache: memorySearchCache(),
    planner: { async buildCandidates(input) { lastPlannerResult = await planner.buildCandidates(input); return lastPlannerResult; } },
    now: () => Date.parse(fixedNow),
    env: sampleEnv,
  });
  const result = await service.search({ query, limit: 6, sessionId: `japan-pilot-${label}` }, { requestId: `japan-pilot-${label}` });
  const trace = decisionTraceStore.list().at(0) || null;
  const candidates = candidatePoolStore.listByIntent(trace?.intentId);
  const selectedCandidate = candidates.find((item) => item.status === "selected") || null;
  const finalRoute = lastPlannerResult?.accepted?.[0]?.record || null;
  assert.equal(candidates.length, 3, `${query}: expected exactly three Candidates`);
  assert.equal(selectedCandidate?.candidateId, finalRoute?.selectedCandidateId, `${query}: selected Candidate must drive RouteRecord`);
  assert.equal(trace?.candidateValidations?.length, 3, `${query}: trace must retain all validation results`);
  assert.equal(fs.existsSync(acceptedPath), false, `${query}: V2 must not auto-accept`);
  return {
    query,
    evidenceMode,
    candidates: candidates.map((item) => ({ candidateId: item.candidateId, status: item.status, order: item.proposedOrder })),
    selectedCandidateId: selectedCandidate.candidateId,
    selectedOrder: selectedCandidate.proposedOrder,
    finalRouteId: finalRoute.id,
    finalOrder: (finalRoute.destinationEntities || []).map((item) => item.wikidataId || item.entityId || item.id),
    validationStatuses: trace.candidateValidations.map((item) => ({ candidateId: item.candidateId, status: item.status, reasonCodes: item.reasonCodes })),
    publicationStatus: finalRoute.v2PublicationStatus,
    searchRecords: result.records.length,
    acceptedWrites: 0,
  };
}

const searchSamples = [];
for (const [index, query] of ["日本7天", "2月去日本7天", "日本2天", "东京京都大阪7天", "2月", "7天"].entries()) {
  searchSamples.push(await executeSearchSample(query, String(index + 1)));
}

assert.equal(isRouteV2EvidenceValidationEnabled({}), false, "evidence validation must remain disabled by default");
assert.equal(isRouteV2LocalEvidenceIndexEnabled({}), false, "local evidence must remain disabled by default");

console.log(JSON.stringify({
  status: "PASS",
  targetCount: targets.length,
  routeLegTargets: targets.filter((target) => target.evidenceType === "route-leg").length,
  seasonTargets: 7,
  fixtureCollection: first.stats,
  idempotent: {
    evidenceHashesStable: true,
    noWorkRetry: noWorkRetry.stats,
  },
  validationStates: {
    ready: readyValidation,
    needsEvidence: needsValidation,
    rejected: rejectedValidation,
    selectedCandidateId: selected.selectedCandidate.candidateId,
  },
  searchSamples,
  externalRuntimeRequests: 0,
  acceptedWrites: 0,
  tempRoot,
}, null, 2));

fs.rmSync(tempRoot, { recursive: true, force: true });
