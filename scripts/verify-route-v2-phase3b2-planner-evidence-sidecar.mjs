import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";
import {
  collectLocalEvidenceBundle,
  createAcceptedRouteRepository,
  createEvidenceBundleStore,
  createEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  validateEvidenceBundle,
  writeLocalEvidenceSidecarSafe,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-01-01T00:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase3b2-evidence-sidecar-"));
const realAcceptedPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const realCandidatePoolPath = defaultRouteCandidatePoolPath();
const realDecisionTracePath = defaultDecisionTracePath();
const realEvidenceBundlePath = defaultRouteEvidenceBundlePath();
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const protectedPaths = [
  realAcceptedPath,
  bootstrapPath,
  realCandidatePoolPath,
  realDecisionTracePath,
  realEvidenceBundlePath,
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-detail.js"),
  path.resolve(projectRoot, "src/lib/routes/discovery.mjs"),
  path.resolve(projectRoot, "src/lib/routes/route-search-service.mjs"),
];
const protectedBefore = statesFor(protectedPaths);

const JP_POOL = [
  { wikidataId: "Q1490", id: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503, countryName: "日本" },
  { wikidataId: "Q39231", id: "Q39231", countryCode: "JP", name: "富士山", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274, countryName: "日本" },
  { wikidataId: "Q34600", id: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "heritage city", latitude: 35.0116, longitude: 135.7681, countryName: "日本" },
  { wikidataId: "Q169134", id: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "heritage city", latitude: 34.6851, longitude: 135.8048, countryName: "日本" },
  { wikidataId: "Q35765", id: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "food city", latitude: 34.6937, longitude: 135.5023, countryName: "日本" },
  { wikidataId: "Q19869", id: "Q19869", countryCode: "JP", name: "金泽", entityTypeName: "craft city", latitude: 36.5613, longitude: 136.6562, countryName: "日本" },
  { wikidataId: "Q200516", id: "Q200516", countryCode: "JP", name: "高山", entityTypeName: "town", latitude: 36.1461, longitude: 137.2522, countryName: "日本" },
  { wikidataId: "Q242666", id: "Q242666", countryCode: "JP", name: "松本", entityTypeName: "castle city", latitude: 36.238, longitude: 137.972, countryName: "日本" },
];

function createKnowledgeGraph(pool = JP_POOL) {
  return {
    queryDestinations(query) {
      return query.country === "JP" ? pool.slice() : [];
    },
  };
}

function createHarness(name, envOverrides = {}, extra = {}) {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const acceptedPath = path.join(dir, "accepted.json");
  const candidatePath = path.join(dir, "route-candidate-pool.jsonl");
  const evidencePath = path.join(dir, "route-evidence-bundles.jsonl");
  const env = {
    ROUTE_V2_TRACE_ENABLED: "false",
    ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT: "false",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "false",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "false",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: evidencePath,
    ...envOverrides,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(dir, "evidence.json") });
  const candidatePoolStore = extra.candidatePoolStore || createRouteCandidatePoolStore({
    storagePath: candidatePath,
    env,
    now: () => fixedNow,
  });
  const evidenceBundleStore = extra.evidenceBundleStore || createEvidenceBundleStore({
    storagePath: evidencePath,
    env,
    now: () => fixedNow,
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository,
    knowledgeGraph: extra.knowledgeGraph || createKnowledgeGraph(),
    candidatePoolStore,
    evidenceBundleStore,
    routeCandidateBuilder: extra.routeCandidateBuilder,
    localEvidenceSidecar: extra.localEvidenceSidecar,
    localEvidenceCollector: extra.localEvidenceCollector,
    env,
  });
  return { dir, acceptedPath, candidatePath, evidencePath, env, acceptedRepository, evidenceRepository, candidatePoolStore, evidenceBundleStore, planner };
}

async function buildOne(harness) {
  const result = await harness.planner.buildCandidates({
    limit: 1,
    context: {
      durationDays: 8,
      country: "JP",
      countryName: "日本",
      travelStyle: "classic-first-trip",
      candidateSeed: "phase3b2-evidence-sidecar",
    },
  });
  assert.equal(result.accepted.length, 1, `expected one accepted route, rejected=${JSON.stringify(result.rejected)}`);
  return result.accepted[0];
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function evidenceCategories(bundle) {
  return new Set((bundle.items || []).map((item) => item.evidenceCategory));
}

const flagOffHarness = createHarness("all-flags-off", {}, {
  routeCandidateBuilder() {
    throw new Error("Candidate Builder must not run when ROUTE_V2_CANDIDATE_POOL_ENABLED=false");
  },
  localEvidenceCollector() {
    throw new Error("Local Evidence Collector must not run when flags are disabled");
  },
});
const flagOffRoute = await buildOne(flagOffHarness);
assert.equal(fs.existsSync(flagOffHarness.candidatePath), false, "all flags off must not write Candidate Pool");
assert.equal(fs.existsSync(flagOffHarness.evidencePath), false, "all flags off must not write EvidenceBundle");

const candidateOnlyHarness = createHarness("candidate-only", {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
}, {
  localEvidenceCollector() {
    throw new Error("Local Evidence Collector must not run with only Candidate Pool enabled");
  },
});
const candidateOnlyRoute = await buildOne(candidateOnlyHarness);
assert.deepEqual(candidateOnlyRoute.record, flagOffRoute.record, "Candidate-only sidecar must not change RouteRecord");
assert.equal(readJsonl(candidateOnlyHarness.candidatePath).length > 0, true, "Candidate Pool should write when candidate flag is enabled");
assert.equal(fs.existsSync(candidateOnlyHarness.evidencePath), false, "EvidenceBundle must not write when evidence flags are disabled");

const localOffHarness = createHarness("candidate-and-bundle-local-off", {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
}, {
  localEvidenceCollector() {
    throw new Error("Local Evidence Collector must not run when local flag is disabled");
  },
});
const localOffRoute = await buildOne(localOffHarness);
assert.deepEqual(localOffRoute.record, flagOffRoute.record, "Evidence local off must not change RouteRecord");
assert.equal(readJsonl(localOffHarness.candidatePath).length > 0, true, "Candidate Pool should still write");
assert.equal(fs.existsSync(localOffHarness.evidencePath), false, "EvidenceBundle must not write when local flag is disabled");

for (const [name, overrides] of [
  ["local-only", { ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true" }],
  ["bundle-local-only", { ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true", ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true" }],
  ["candidate-local-only", { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true", ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true" }],
]) {
  const harness = createHarness(name, overrides, {
    localEvidenceCollector() {
      throw new Error(`Local Evidence Collector must not run for incomplete flags: ${name}`);
    },
  });
  const route = await buildOne(harness);
  assert.deepEqual(route.record, flagOffRoute.record, `${name} must not change RouteRecord`);
  assert.equal(fs.existsSync(harness.evidencePath), false, `${name} must not write EvidenceBundle`);
}

const allOnHarness = createHarness("all-flags-on", {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true",
});
const allOnRoute = await buildOne(allOnHarness);
assert.deepEqual(allOnRoute.record, flagOffRoute.record, "all sidecars enabled must not change RouteRecord");
const writtenCandidates = readJsonl(allOnHarness.candidatePath);
const writtenBundles = readJsonl(allOnHarness.evidencePath);
assert.equal(writtenCandidates.length, 8, "expected 8 written candidates from the planner sidecar");
assert.equal(writtenBundles.length, writtenCandidates.length, "EvidenceBundle count should match successfully written candidates");
for (const [index, bundle] of writtenBundles.entries()) {
  const validation = validateEvidenceBundle(bundle);
  assert.equal(validation.accepted, true, `EvidenceBundle ${index} failed schema: ${validation.reasons.join(",")}`);
  assert.equal(bundle.candidateId, writtenCandidates[index].candidateId, "EvidenceBundle candidateId should match written candidate");
  assert.equal(bundle.intentId, writtenCandidates[index].intentId, "EvidenceBundle intentId should match written candidate");
  const categories = evidenceCategories(bundle);
  for (const category of ["destination-identity", "country-match", "proposed-order-integrity", "coordinate", "segment-distance", "duration-fit"]) {
    assert(categories.has(category), `EvidenceBundle missing local evidence category: ${category}`);
  }
  assert(bundle.unknowns.some((entry) => entry.field === "transportFeasibility"), "transport evidence should remain unknown");
  assert(bundle.unknowns.some((entry) => entry.field === "seasonalFit"), "seasonal evidence should remain unknown");
  assert(bundle.unknowns.some((entry) => entry.field === "budgetFit"), "budget evidence should remain unknown");
  const serialized = JSON.stringify(bundle);
  for (const forbidden of ["selected", "rejected", "qualityScore", "compositionScore", "bestCandidate"]) {
    assert.equal(serialized.includes(forbidden), false, `EvidenceBundle must not contain scoring or selection field: ${forbidden}`);
  }
}

let directCollectorCalls = 0;
const directSidecarSkipped = await writeLocalEvidenceSidecarSafe({
  candidates: writtenCandidates,
  kgPool: JP_POOL,
  candidatePoolStore: { enabled: () => true },
  evidenceBundleStore: { enabled: () => true, append: () => ({ written: true }) },
  env: {
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "false",
  },
  localEvidenceCollector() {
    directCollectorCalls += 1;
    return {};
  },
});
assert.equal(directSidecarSkipped.reason, "local-evidence-disabled", "direct sidecar should report local flag skip");
assert.equal(directCollectorCalls, 0, "direct sidecar must not call collector unless all three flags are true");

const writeFailureHarness = createHarness("evidence-write-failure", {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true",
}, {
  evidenceBundleStore: {
    enabled: () => true,
    append() {
      throw new Error("forced evidence write failure");
    },
  },
});
const writeFailureRoute = await buildOne(writeFailureHarness);
assert.deepEqual(writeFailureRoute.record, flagOffRoute.record, "EvidenceBundle write failure must not change RouteRecord");
assert.equal(fs.existsSync(writeFailureHarness.evidencePath), false, "write failure harness should not create evidence file");

let collectorCallCount = 0;
const collectorFailureHarness = createHarness("collector-failure", {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
  ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true",
}, {
  localEvidenceCollector(args) {
    collectorCallCount += 1;
    if (collectorCallCount === 1) throw new Error("forced collector failure");
    if (collectorCallCount === 2) return { candidateId: args.candidate?.candidateId, intentId: args.candidate?.intentId, items: [], unknowns: [], failures: [] };
    return collectLocalEvidenceBundle(args);
  },
});
const collectorFailureRoute = await buildOne(collectorFailureHarness);
assert.deepEqual(collectorFailureRoute.record, flagOffRoute.record, "collector failure must not change RouteRecord");
const collectorFailureCandidates = readJsonl(collectorFailureHarness.candidatePath);
const collectorFailureBundles = readJsonl(collectorFailureHarness.evidencePath);
assert.equal(collectorFailureCandidates.length, 8, "collector failure should not stop Candidate Pool writes");
assert.equal(collectorFailureBundles.length, collectorFailureCandidates.length - 2, "collector throw and invalid bundle should fail only their candidates");
for (const bundle of collectorFailureBundles) {
  assert.equal(validateEvidenceBundle(bundle).accepted, true, "remaining candidates should still write valid EvidenceBundles");
}

assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "real route/cache files changed during Phase 3B-2 verification");

for (const file of [
  "src/lib/routes/discovery.mjs",
  "src/lib/routes/route-search-service.mjs",
  "routes.js",
  "route-detail.js",
]) {
  const text = fs.readFileSync(path.resolve(projectRoot, file), "utf8");
  assert.equal(/local-evidence-sidecar|route-evidence-bundles|EvidenceBundle Store/u.test(text), false, `${file} must not read EvidenceBundle sidecar in Phase 3B-2`);
}

console.log(JSON.stringify({
  status: "PASS",
  tempRoot,
  routeRecordUnchanged: true,
  flagOff: {
    candidateFileExists: fs.existsSync(flagOffHarness.candidatePath),
    evidenceFileExists: fs.existsSync(flagOffHarness.evidencePath),
  },
  candidateOnly: {
    candidates: readJsonl(candidateOnlyHarness.candidatePath).length,
    evidenceFileExists: fs.existsSync(candidateOnlyHarness.evidencePath),
  },
  allOn: {
    candidates: writtenCandidates.length,
    evidenceBundles: writtenBundles.length,
    firstEvidenceBundleId: writtenBundles[0]?.evidenceBundleId,
  },
  writeFailureDegraded: true,
  collectorFailureDegraded: true,
  acceptedRepositoryUnchanged: true,
  bootstrapUnchanged: true,
  realCachesUnchanged: true,
}, null, 2));
