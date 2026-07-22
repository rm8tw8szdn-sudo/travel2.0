import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { buildLegacyDecisionTrace, validateDecisionTrace } from "../src/lib/routes/decision-trace-schema.mjs";
import { buildEvidenceBundleLifecycle, validateEvidenceBundleLifecycle } from "../src/lib/routes/evidence-bundle-schema.mjs";
import { createLocalEvidenceRepository } from "../src/lib/routes/local-evidence-repository.mjs";
import { createAcceptedRouteRepository } from "../src/lib/routes/accepted-repository.mjs";
import { createDecisionTraceStore } from "../src/lib/routes/decision-trace-store.mjs";
import { createEvidenceBundleStore } from "../src/lib/routes/evidence-bundle-store.mjs";
import { createEvidenceRepository } from "../src/lib/routes/evidence-repository.mjs";
import { createRouteLegEvidenceStore } from "../src/lib/routes/route-leg-evidence-store.mjs";
import { createRouteCandidatePoolStore, normalizeRouteCandidate } from "../src/lib/routes/route-candidate-pool.mjs";
import { validateRouteForUse } from "../src/lib/routes/route-candidate-evidence-validation.mjs";
import { selectRouteCandidatesWithEvidence } from "../src/lib/routes/route-candidate-selection.mjs";
import { createRouteCompositionPlanner } from "../src/lib/routes/route-composition-planner.mjs";
import { createRouteSearchService } from "../src/lib/routes/route-search-service.mjs";
import { buildRouteV2MissingEvidenceReport } from "../src/lib/routes/route-evidence-missing-report.mjs";
import {
  evaluateRouteV2Publication,
  isRouteV2PublicationGateEnabled,
} from "../src/lib/routes/route-publication-gate.mjs";
import { createRouteV2ReadyPool, isRouteV2ReadyPoolEnabled } from "../src/lib/routes/route-v2-ready-pool.mjs";

const fixedNow = "2026-07-22T00:00:00.000Z";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-publication-gate-"));
const formalSeedRoot = path.resolve("data", "route-v2", "evidence-seed");
const formalSeedManifest = JSON.parse(fs.readFileSync(path.join(formalSeedRoot, "evidence-seed-manifest.json"), "utf8"));
const enabledEnv = {
  ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
  ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "true",
  ROUTE_V2_PUBLICATION_GATE_ENABLED: "true",
  ROUTE_V2_READY_POOL_ENABLED: "true",
};
let externalRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalRequests += 1;
  throw new Error("NETWORK_FORBIDDEN_IN_PUBLICATION_GATE");
};

const CITY = Object.freeze({
  tokyo: { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
  kyoto: { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
  osaka: { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
  nara: { id: "Q169134", wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048 },
});

function timeIntent(months = []) {
  return months.length
    ? { type: months.length === 1 ? "single-month" : "month-range", months, season: null, rawText: `${months.join("-")}月`, diagnostics: [] }
    : { type: "unspecified", months: [], season: null, rawText: "", diagnostics: [] };
}

function candidate(intentId, destinations, { durationDays = 7, months = [] } = {}) {
  return normalizeRouteCandidate({
    intentId,
    countries: ["JP"],
    destinations,
    proposedOrder: destinations.map((destination) => destination.id),
    durationDays,
    travelStyle: "city-break",
    generationSource: "publication-gate-japan-seed-fixture",
    supportingSignals: [],
    status: "pending",
    rejectionReasons: [],
    unknowns: [],
    inputIntentSnapshot: { intentId, durationDays, country: "JP", timeIntent: timeIntent(months) },
    createdAt: fixedNow,
  }, { now: () => fixedNow });
}

function candidatesFor(intentId, { durationDays = 7, months = [], preferred = "tokyo-kyoto" } = {}) {
  const pairs = {
    "tokyo-kyoto": [CITY.tokyo, CITY.kyoto],
    "osaka-nara": [CITY.osaka, CITY.nara],
    "kyoto-osaka": [CITY.kyoto, CITY.osaka],
  };
  const order = [preferred, ...Object.keys(pairs).filter((key) => key !== preferred)];
  return order.map((key) => candidate(intentId, pairs[key], { durationDays, months }));
}

function routeFor(selectedCandidate, validation, suffix) {
  const destinationEntities = selectedCandidate.destinations.map((destination) => structuredClone(destination));
  return {
    id: `v2-publication-${suffix}`,
    name: `${destinationEntities.map((entry) => entry.name).join("与")}文化漫游`,
    canonicalTitle: `${destinationEntities.map((entry) => entry.name).join("与")}文化漫游`,
    summary: "城市脉络与文化体验构成清晰、可执行的短途旅行。",
    recommendationText: "交通证据、路线节奏与展示信息均经过结构化检查。",
    countries: ["JP"],
    destinations: destinationEntities.map((entry) => entry.name),
    countryEntities: [{ countryCode: "JP", name: "日本", wikidataId: "Q17" }],
    destinationEntities,
    durationDays: selectedCandidate.durationDays,
    recommendedDays: `${selectedCandidate.durationDays}天`,
    bestMonths: ["3-5月"],
    highlights: ["城市文化", "铁路体验", "历史街区"],
    travelStyle: "city-break",
    sourceType: "planner-designed",
    coverAsset: { imageUrl: "/assets/route-v2/placeholder-route.svg" },
    generationVersion: "route-generation-v2-phase1",
    intentId: selectedCandidate.intentId,
    selectedCandidateId: selectedCandidate.candidateId,
    evidenceValidationId: validation.validationId,
    evidenceValidationStatus: validation.status,
    v2PublicationStatus: "v2-not-publishable-yet",
  };
}

function buildArtifacts({ label, query, durationDays = 7, months = [], preferred = "tokyo-kyoto", repository }) {
  const intentId = `intent-${label}`;
  const context = {
    intentId,
    country: "JP",
    durationDays,
    travelStyle: "city-break",
    transportPreference: ["rail"],
    timeIntent: timeIntent(months),
  };
  const candidates = candidatesFor(intentId, { durationDays, months, preferred });
  const selection = selectRouteCandidatesWithEvidence({ candidates, context, intentId, evidenceRepository: repository, now: () => fixedNow });
  assert.equal(selection.ready, true);
  const validation = selection.validationResults.find((item) => item.candidateId === selection.selectedCandidate.candidateId);
  const routeRecord = routeFor(selection.selectedCandidate, validation, label);
  const decisionTrace = buildLegacyDecisionTrace({
    route: routeRecord,
    context,
    source: "publication-gate-verifier",
    candidateSelection: selection,
    timestamp: fixedNow,
  });
  const traceValidation = validateDecisionTrace(decisionTrace);
  assert.equal(traceValidation.accepted, true, JSON.stringify(traceValidation.missing));
  routeRecord.decisionTraceId = decisionTrace.traceId;
  const builtBundle = buildEvidenceBundleLifecycle({ selectedCandidate: selection.selectedCandidate, routeRecord, decisionTrace, context, now: () => fixedNow });
  assert.equal(builtBundle.created, true);
  const evidenceBundle = {
    ...builtBundle.bundle,
    evidenceReferenceMode: "public-evidence-references",
    legEvidenceRefs: validation.legResults.map((result) => result.evidenceId).filter(Boolean),
    seasonEvidenceRefs: validation.seasonResults.map((result) => result.evidenceId).filter(Boolean),
    missingEvidenceRefs: validation.criticalMissingEvidenceIds,
  };
  assert.equal(validateEvidenceBundleLifecycle(evidenceBundle, { selectedCandidate: selection.selectedCandidate, routeRecord, decisionTrace }).accepted, true);
  routeRecord.evidenceBundleId = evidenceBundle.evidenceBundleId;
  routeRecord.evidenceStatus = evidenceBundle.status;
  const publicationGate = evaluateRouteV2Publication({
    routeRecord,
    selectedCandidate: selection.selectedCandidate,
    decisionTrace,
    validation,
    evidenceBundle,
  }, { now: () => fixedNow });
  routeRecord.v2PublicationStatus = publicationGate.status;
  return { label, query, candidates, selection, validation, routeRecord, decisionTrace, evidenceBundle, publicationGate };
}

assert.equal(isRouteV2PublicationGateEnabled({}), false);
assert.equal(isRouteV2ReadyPoolEnabled({}), false);
const repository = createLocalEvidenceRepository({
  env: enabledEnv,
  storageRoot: path.join(root, "runtime"),
  seedRoot: formalSeedRoot,
  now: () => fixedNow,
});
const coldStart = performance.now();
const firstSeedLeg = repository.index.getRouteLegsByEndpoints({ fromEntityId: "Q1490", toEntityId: "Q34600" });
const coldMs = performance.now() - coldStart;
assert.equal(firstSeedLeg.length, 1);
assert.equal(firstSeedLeg[0].durationMinMinutes, 120);
assert.equal(repository.index.getRouteLegsByEndpoints({ fromEntityId: "Q34600", toEntityId: "Q1490" }).length, 0, "reverse evidence must remain independent");
const loadedStats = repository.index.stats();
const hotStart = performance.now();
for (let count = 0; count < 100; count += 1) repository.index.getRouteLegsByEndpoints({ fromEntityId: "Q1490", toEntityId: "Q34600" });
const hotMs = performance.now() - hotStart;
const hotStats = repository.index.stats();
assert.equal(hotStats.loadCount, loadedStats.loadCount, "hot lookups must not reload the index");
assert.deepEqual(hotStats.storeParseCounts, loadedStats.storeParseCounts, "hot lookups must not rescan evidence files");

const sampleSpecs = [
  { label: "japan-7d", query: "日本7天", durationDays: 7 },
  { label: "feb-japan-7d", query: "2月去日本7天", durationDays: 7, months: [2] },
  { label: "japan-2d", query: "日本2天", durationDays: 2 },
  { label: "tokyo-kyoto", query: "东京→京都", durationDays: 2 },
  { label: "osaka-nara-direct", query: "正式证据直连样本：大阪→奈良", durationDays: 2, preferred: "osaka-nara" },
];
const validationStart = performance.now();
const samples = sampleSpecs.map((spec) => buildArtifacts({ ...spec, repository }));
const validationAndGateMs = performance.now() - validationStart;
for (const sample of samples) assert.equal(sample.candidates.length, 3);
assert.equal(samples[0].publicationGate.status, "ready-for-display");
assert.equal(samples[1].publicationGate.status, "blocked-needs-evidence");
assert.equal(samples[2].publicationGate.status, "ready-for-display");
assert.equal(samples[3].publicationGate.status, "ready-for-display");
assert.equal(samples[4].publicationGate.status, "ready-for-display");
assert.equal(samples[1].validation.seasonResults.length, 2);
assert(samples[1].validation.seasonResults.every((result) => result.status === "needs-evidence"));

const integrationRoot = path.join(root, "planner-integration");
const integrationEnv = {
  ...enabledEnv,
  ROUTE_V2_INTENT_ENABLED: "true",
  ROUTE_V2_TIME_INTENT_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_TRACE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
  ROUTE_V2_CANDIDATE_POOL_PATH: path.join(integrationRoot, "candidates.jsonl"),
  ROUTE_V2_TRACE_PATH: path.join(integrationRoot, "traces.jsonl"),
  ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(integrationRoot, "bundles.jsonl"),
  ROUTE_V2_READY_POOL_PATH: path.join(integrationRoot, "ready.json"),
  SEARCH_AUTO_ACCEPT_GENERATED: "true",
  SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
  SEARCH_PLANNER_TIMEOUT_MS: "30000",
};
const integrationAcceptedPath = path.join(integrationRoot, "accepted.json");
const integrationAccepted = createAcceptedRouteRepository({ storagePath: integrationAcceptedPath });
const integrationCandidates = createRouteCandidatePoolStore({ storagePath: integrationEnv.ROUTE_V2_CANDIDATE_POOL_PATH, env: integrationEnv, now: () => fixedNow });
const integrationTraces = createDecisionTraceStore({ storagePath: integrationEnv.ROUTE_V2_TRACE_PATH, env: integrationEnv, now: () => fixedNow });
const integrationBundles = createEvidenceBundleStore({ storagePath: integrationEnv.ROUTE_V2_EVIDENCE_BUNDLE_PATH, env: integrationEnv, now: () => fixedNow });
const integrationEvidence = createLocalEvidenceRepository({ env: integrationEnv, seedRoot: formalSeedRoot, storageRoot: path.join(integrationRoot, "runtime"), now: () => fixedNow });
const integrationReadyPool = createRouteV2ReadyPool({ env: integrationEnv, storagePath: integrationEnv.ROUTE_V2_READY_POOL_PATH, now: () => fixedNow });
const planner = createRouteCompositionPlanner({
  acceptedRepository: integrationAccepted,
  evidenceRepository: createEvidenceRepository({ storagePath: path.join(integrationRoot, "legacy-evidence.json") }),
  candidatePoolStore: integrationCandidates,
  decisionTraceStore: integrationTraces,
  evidenceBundleStore: integrationBundles,
  localEvidenceRepository: integrationEvidence,
  readyPool: integrationReadyPool,
  knowledgeGraph: { queryDestinations() { return Object.values(CITY).map((entry) => structuredClone(entry)); } },
  routeCandidateBuilder: ({ context }) => candidatesFor(context.intentId, { durationDays: context.durationDays || 2 }),
  env: integrationEnv,
});
const plannerResult = await planner.buildCandidates({
  limit: 1,
  context: {
    intentId: "intent-publication-planner-integration",
    country: "JP",
    countryName: "日本",
    durationDays: 2,
    travelStyle: "city-break",
    transportPreference: ["rail"],
    timeIntent: timeIntent([]),
    candidateSeed: "publication-planner-integration",
  },
});
assert.equal(plannerResult.accepted.length, 1, JSON.stringify(plannerResult.rejected));
assert.equal(plannerResult.accepted[0].publicationGate.status, "ready-for-display", JSON.stringify({ gate: plannerResult.accepted[0].publicationGate, coverAsset: plannerResult.accepted[0].record.coverAsset, coverImageUrl: plannerResult.accepted[0].record.coverImageUrl, imageUrl: plannerResult.accepted[0].record.imageUrl }));
assert.equal(plannerResult.accepted[0].record.v2PublicationStatus, "ready-for-display");
assert.equal(plannerResult.accepted[0].readyPoolWrite.persisted, true);
assert.equal(integrationReadyPool.list().length, 1);
const plannerSidecarReadyPoolPublished = integrationReadyPool.list().length;
assert.equal(fs.existsSync(integrationAcceptedPath), false, "Planner publication must never write the legacy accepted repository");
const searchEntries = new Map();
const searchService = createRouteSearchService({
  acceptedRepository: integrationAccepted,
  searchCache: {
    get(key) { return searchEntries.get(key) ? structuredClone(searchEntries.get(key)) : null; },
    put({ intent, records = [], status = "search-generated" } = {}) {
      const entry = { intentHash: intent.intentHash, records: structuredClone(records), status };
      searchEntries.set(intent.intentHash, entry);
      return structuredClone(entry);
    },
    appendReviewCandidates() { return { persisted: true }; },
    findRoute() { return null; },
  },
  planner: { async buildCandidates() { return plannerResult; } },
  now: () => Date.parse(fixedNow),
  env: integrationEnv,
});
const searchResult = await searchService.search({ query: "日本2天", limit: 6, sessionId: "publication-gate-search" }, { requestId: "publication-gate-search" });
assert(searchResult.records.length > 0, JSON.stringify(searchResult));
assert.equal(searchResult.records[0].v2PublicationStatus, "ready-for-display");
assert.equal(searchResult.records[0].searchStatus, "ready-for-display");
assert.equal(fs.existsSync(integrationAcceptedPath), false, "ready V2 Search results must remain outside legacy accepted storage");

const actualSearchValidations = [];
async function runActualSearchSample(query, label) {
  const sampleRoot = path.join(root, `actual-search-${label}`);
  const sampleEnv = {
    ...integrationEnv,
    ROUTE_V2_CANDIDATE_POOL_PATH: path.join(sampleRoot, "candidates.jsonl"),
    ROUTE_V2_TRACE_PATH: path.join(sampleRoot, "traces.jsonl"),
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(sampleRoot, "bundles.jsonl"),
    ROUTE_V2_READY_POOL_PATH: path.join(sampleRoot, "ready.json"),
  };
  const acceptedPath = path.join(sampleRoot, "accepted.json");
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const candidatePoolStore = createRouteCandidatePoolStore({ storagePath: sampleEnv.ROUTE_V2_CANDIDATE_POOL_PATH, env: sampleEnv, now: () => fixedNow });
  const traceStore = createDecisionTraceStore({ storagePath: sampleEnv.ROUTE_V2_TRACE_PATH, env: sampleEnv, now: () => fixedNow });
  const bundleStore = createEvidenceBundleStore({ storagePath: sampleEnv.ROUTE_V2_EVIDENCE_BUNDLE_PATH, env: sampleEnv, now: () => fixedNow });
  const localRepository = createLocalEvidenceRepository({ env: sampleEnv, seedRoot: formalSeedRoot, storageRoot: path.join(sampleRoot, "runtime"), now: () => fixedNow });
  const sampleReadyPool = createRouteV2ReadyPool({ env: sampleEnv, storagePath: sampleEnv.ROUTE_V2_READY_POOL_PATH, now: () => fixedNow });
  const samplePlanner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository: createEvidenceRepository({ storagePath: path.join(sampleRoot, "legacy-evidence.json") }),
    candidatePoolStore,
    decisionTraceStore: traceStore,
    evidenceBundleStore: bundleStore,
    localEvidenceRepository: localRepository,
    readyPool: sampleReadyPool,
    knowledgeGraph: { queryDestinations() { return Object.values(CITY).map((entry) => structuredClone(entry)); } },
    env: sampleEnv,
  });
  let plannerOutput = null;
  const entries = new Map();
  const service = createRouteSearchService({
    acceptedRepository,
    searchCache: {
      get(key) { return entries.get(key) ? structuredClone(entries.get(key)) : null; },
      put({ intent, records = [], status = "search-generated" } = {}) {
        const entry = { intentHash: intent.intentHash, records: structuredClone(records), status };
        entries.set(intent.intentHash, entry);
        return structuredClone(entry);
      },
      appendReviewCandidates() { return { persisted: true }; },
      findRoute() { return null; },
    },
    planner: { async buildCandidates(input) { plannerOutput = await samplePlanner.buildCandidates(input); return plannerOutput; } },
    now: () => Date.parse(fixedNow),
    env: sampleEnv,
  });
  const response = await service.search({ query, limit: 6, sessionId: `publication-${label}` }, { requestId: `publication-${label}` });
  const trace = traceStore.list()[0] || null;
  const candidates = trace ? candidatePoolStore.listByIntent(trace.intentId) : [];
  const item = plannerOutput?.accepted?.[0] || null;
  assert.equal(candidates.length, 3, `${query}: actual Planner must retain three Candidates`);
  assert.equal(fs.existsSync(acceptedPath), false, `${query}: actual Search must not write accepted routes`);
  actualSearchValidations.push(...trace.candidateValidations);
  return {
    query,
    candidates: trace.candidateValidations.map((validation) => ({ candidateId: validation.candidateId, status: validation.status })),
    selectedCandidateId: trace.candidateId,
    selectedOrder: trace.selectedCandidate.proposedOrder,
    publicationStatus: item?.publicationGate?.status || item?.record?.v2PublicationStatus || "no-v2-route",
    readyPoolCount: sampleReadyPool.list().length,
    reasonCodes: item?.publicationGate?.reasonCodes || [],
    acceptedRepositoryWrites: 0,
    searchRecords: response.records.length,
    searchDisposition: response.records[0]?.v2PublicationStatus === "ready-for-display"
      ? "isolated-v2-ready-pool"
      : response.records.length ? "needs-evidence-preview-or-mature-route-fallback" : "no-result",
  };
}

const actualSearchSamples = [];
for (const [index, query] of ["日本7天", "2月去日本7天", "日本2天", "东京京都大阪7天"].entries()) {
  actualSearchSamples.push(await runActualSearchSample(query, String(index + 1)));
}

const readyFixture = samples[3];
const gateStart = performance.now();
for (let count = 0; count < 100; count += 1) evaluateRouteV2Publication({
  routeRecord: readyFixture.routeRecord,
  selectedCandidate: readyFixture.selection.selectedCandidate,
  decisionTrace: readyFixture.decisionTrace,
  validation: readyFixture.validation,
  evidenceBundle: readyFixture.evidenceBundle,
}, { now: () => fixedNow });
const gateAverageMs = (performance.now() - gateStart) / 100;
assert(gateAverageMs < 50);
assert(validationAndGateMs < 200);

const missingTrace = evaluateRouteV2Publication({ ...readyFixture, selectedCandidate: readyFixture.selection.selectedCandidate, decisionTrace: null });
assert.equal(missingTrace.status, "blocked-incomplete");
const mismatchedRoute = { ...readyFixture.routeRecord, destinationEntities: [...readyFixture.routeRecord.destinationEntities].reverse() };
assert.equal(evaluateRouteV2Publication({ ...readyFixture, routeRecord: mismatchedRoute, selectedCandidate: readyFixture.selection.selectedCandidate }).status, "blocked-incomplete");
const expiredValidation = { ...readyFixture.validation, status: "needs-evidence", staleEvidenceIds: [readyFixture.validation.legResults[0].evidenceId] };
assert.equal(evaluateRouteV2Publication({ ...readyFixture, selectedCandidate: readyFixture.selection.selectedCandidate, validation: expiredValidation }).status, "blocked-needs-evidence");
const noImageRoute = { ...readyFixture.routeRecord, coverAsset: null };
assert.equal(evaluateRouteV2Publication({ ...readyFixture, routeRecord: noImageRoute, selectedCandidate: readyFixture.selection.selectedCandidate }).status, "blocked-incomplete");
const thrown = evaluateRouteV2Publication({ ...readyFixture, selectedCandidate: readyFixture.selection.selectedCandidate }, { routeContentValidator: () => { throw new Error("fixture-gate-failure"); } });
assert.equal(thrown.status, "blocked-system-error");

const readyPoolPath = path.join(root, "ready-pool", "routes.json");
const readyPool = createRouteV2ReadyPool({ env: enabledEnv, storagePath: readyPoolPath, now: () => fixedNow });
const published = readyPool.applyEvaluation({ routeRecord: readyFixture.routeRecord, publicationGate: readyFixture.publicationGate });
assert.equal(published.persisted, true);
assert.equal(readyPool.list().length, 1);
const beforeDuplicate = fs.readFileSync(readyPoolPath, "utf8");
const duplicate = readyPool.applyEvaluation({ routeRecord: readyFixture.routeRecord, publicationGate: readyFixture.publicationGate });
assert.equal(duplicate.skipped, true);
assert.equal(fs.readFileSync(readyPoolPath, "utf8"), beforeDuplicate);
const demoted = readyPool.applyEvaluation({ routeRecord: readyFixture.routeRecord, publicationGate: expiredValidation.status === "needs-evidence" ? { ...readyFixture.publicationGate, status: "blocked-needs-evidence", publishable: false } : null });
assert.equal(demoted.demoted, true);
assert.equal(readyPool.list().length, 0);

readyPool.applyEvaluation({ routeRecord: readyFixture.routeRecord, publicationGate: readyFixture.publicationGate });
const failingFs = new Proxy(fs, { get(target, property) { return property === "renameSync" ? () => { throw new Error("fixture-atomic-rename-failed"); } : target[property]; } });
const failingPool = createRouteV2ReadyPool({ env: enabledEnv, storagePath: readyPoolPath, fileSystem: failingFs, now: () => "2026-07-22T00:01:00.000Z" });
const modifiedRoute = { ...readyFixture.routeRecord, summary: `${readyFixture.routeRecord.summary} 保留原子写保护。` };
const beforeAtomicFailure = fs.readFileSync(readyPoolPath, "utf8");
assert.equal(failingPool.applyEvaluation({ routeRecord: modifiedRoute, publicationGate: readyFixture.publicationGate }).persisted, false);
assert.equal(fs.readFileSync(readyPoolPath, "utf8"), beforeAtomicFailure, "failed atomic replacement must preserve the existing pool");

const oldRuntimeRecord = { ...firstSeedLeg[0], confidence: 0.1, retrievedAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-07-22T00:02:00.000Z" };
const runtimeStore = createRouteLegEvidenceStore({ storagePath: path.join(root, "old-runtime", "route-leg-evidence.jsonl"), env: enabledEnv, now: () => fixedNow });
assert.equal(runtimeStore.upsert(oldRuntimeRecord).persisted, true);
const overlayRepository = createLocalEvidenceRepository({
  env: enabledEnv,
  seedRoot: formalSeedRoot,
  storageRoot: path.join(root, "old-runtime"),
  routeLegStore: runtimeStore,
  now: () => fixedNow,
});
assert.equal(overlayRepository.index.getRouteLegsByEndpoints({ fromEntityId: "Q1490", toEntityId: "Q34600" })[0].confidence, 0.9);
assert(overlayRepository.mergedRouteLegStore.diagnostics().some((item) => item.type === "route-leg-evidence-runtime-override-rejected"));

const missingSeedRepository = createLocalEvidenceRepository({ env: enabledEnv, seedRoot: path.join(root, "missing-seed"), storageRoot: path.join(root, "empty-runtime") });
assert.equal(missingSeedRepository.index.getRouteLegsByEndpoints({ fromEntityId: "Q1490", toEntityId: "Q34600" }).length, 0);
const corruptSeed = path.join(root, "corrupt-seed");
fs.mkdirSync(corruptSeed, { recursive: true });
fs.writeFileSync(path.join(corruptSeed, "route-leg-evidence.jsonl"), `${JSON.stringify(firstSeedLeg[0])}\n{broken\n${JSON.stringify(firstSeedLeg[0])}\n`, "utf8");
fs.writeFileSync(path.join(corruptSeed, "season-evidence.jsonl"), `${JSON.stringify({ invalid: true })}\n`, "utf8");
const corruptRepository = createLocalEvidenceRepository({ env: enabledEnv, seedRoot: corruptSeed, storageRoot: path.join(root, "corrupt-runtime") });
corruptRepository.index.getRouteLegsByEndpoints({ fromEntityId: "Q1490", toEntityId: "Q34600" });
const corruptStats = corruptRepository.index.stats();
assert(corruptStats.routeLegDiagnosticCount >= 2);
assert(corruptStats.seasonDiagnosticCount >= 1);

const missingReport = buildRouteV2MissingEvidenceReport([
  ...samples.flatMap((sample) => sample.selection.validationResults),
  ...actualSearchValidations,
]);
assert(missingReport.length > 0);
assert(missingReport.every((entry, index, list) => index === 0 || list[index - 1].requestCount >= entry.requestCount));
assert(missingReport.some((entry) => entry.targetKey === "Q34600>Q35765|rail"));
assert(!missingReport.some((entry) => entry.targetKey === "Q35765>Q34600|rail"), "directed missing evidence must not be reversed or merged");
assert.equal(externalRequests, 0);

const sampleReport = samples.map((sample) => ({
  query: sample.query,
  candidates: sample.selection.validationResults.map((validation) => ({ candidateId: validation.candidateId, status: validation.status })),
  selectedCandidateId: sample.selection.selectedCandidate.candidateId,
  selectedOrder: sample.selection.selectedCandidate.proposedOrder,
  publicationStatus: sample.publicationGate.status,
  readyPoolEligible: sample.publicationGate.status === "ready-for-display",
  reasonCodes: sample.publicationGate.reasons,
  acceptedRepositoryWrites: 0,
  searchDisposition: sample.publicationGate.status === "ready-for-display" ? "isolated-v2-ready-pool" : "needs-evidence-preview-or-mature-route-fallback",
}));

globalThis.fetch = originalFetch;
fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({
  verifier: "route-v2-publication-gate",
  passed: true,
  flagsDefaultOff: true,
  seedCounts: formalSeedManifest.counts,
  samples: sampleReport,
  actualSearchSamples,
  readyPoolPublished: 1,
  plannerSidecarReadyPoolPublished,
  isolatedSearchPublicationStatus: searchResult.records[0].v2PublicationStatus,
  duplicatePublicationRewrites: 0,
  demotionPassed: true,
  faultTests: {
    missingSeed: "safe-empty",
    corruptAndDuplicateSeed: "diagnosed-and-skipped",
    reverseDirection: "independent",
    olderRuntimeOverride: "rejected",
    missingTrace: missingTrace.status,
    routeMismatch: "blocked-incomplete",
    expiredEvidence: "blocked-needs-evidence",
    missingImage: "blocked-incomplete",
    gateException: thrown.status,
    readyPoolAtomicFailure: "existing-content-preserved",
  },
  missingEvidenceTop: missingReport.slice(0, 5),
  performance: {
    coldSeedLoadMs: Number(coldMs.toFixed(3)),
    hotQueries100Ms: Number(hotMs.toFixed(3)),
    gateAverageMs: Number(gateAverageMs.toFixed(3)),
    fiveSamplesValidationAndGateMs: Number(validationAndGateMs.toFixed(3)),
  },
  externalRequests,
}, null, 2));
