import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCandidatePoolStore,
  createRouteCompositionPlanner,
  validateRouteCandidate,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-01-01T00:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase2b2-sidecar-"));
const realAcceptedPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const realCandidatePoolPath = path.resolve(projectRoot, ".route-v2-cache", "route-candidate-pool.jsonl");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const protectedPaths = [
  realAcceptedPath,
  realCandidatePoolPath,
  bootstrapPath,
  path.resolve(projectRoot, "routes.js"),
  path.resolve(projectRoot, "route-detail.js"),
  path.resolve(projectRoot, "src/lib/routes/discovery.mjs"),
  path.resolve(projectRoot, "src/lib/routes/route-search-service.mjs"),
];

function routeCount(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed.length : Array.isArray(parsed.records) ? parsed.records.length : 0;
}

const protectedBefore = statesFor(protectedPaths);
const acceptedRouteCountBefore = routeCount(realAcceptedPath);

const JP_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503, countryName: "日本" },
  { wikidataId: "Q39231", countryCode: "JP", name: "富士山", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274, countryName: "日本" },
  { wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681, countryName: "日本" },
  { wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048, countryName: "日本" },
  { wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023, countryName: "日本" },
  { wikidataId: "Q19869", countryCode: "JP", name: "金泽", entityTypeName: "craft city", latitude: 36.5613, longitude: 136.6562, countryName: "日本" },
  { wikidataId: "Q200516", countryCode: "JP", name: "高山", entityTypeName: "town", latitude: 36.1461, longitude: 137.2522, countryName: "日本" },
  { wikidataId: "Q242666", countryCode: "JP", name: "松本", entityTypeName: "city", latitude: 36.238, longitude: 137.972, countryName: "日本" },
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
  const env = {
    ROUTE_V2_TRACE_ENABLED: "false",
    ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT: "false",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "false",
    ROUTE_V2_CANDIDATE_POOL_PATH: candidatePath,
    ...envOverrides,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(dir, "evidence.json") });
  const candidatePoolStore = extra.candidatePoolStore || createRouteCandidatePoolStore({
    storagePath: env.ROUTE_V2_CANDIDATE_POOL_PATH,
    env,
    now: () => fixedNow,
  });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository,
    knowledgeGraph: extra.knowledgeGraph || createKnowledgeGraph(),
    candidatePoolStore,
    routeCandidateBuilder: extra.routeCandidateBuilder,
    env,
  });
  return { dir, acceptedPath, candidatePath, env, acceptedRepository, evidenceRepository, candidatePoolStore, planner };
}

async function buildOne(harness) {
  const result = await harness.planner.buildCandidates({
    limit: 1,
    context: {
      durationDays: 8,
      country: "JP",
      countryName: "日本",
      travelStyle: "classic-first-trip",
      candidateSeed: "phase2b2-sidecar",
    },
  });
  assert.equal(result.accepted.length, 1, `expected one accepted candidate, rejected=${JSON.stringify(result.rejected)}`);
  return result.accepted[0];
}

const flagOffHarness = createHarness("flag-off", { ROUTE_V2_CANDIDATE_POOL_ENABLED: "false" }, {
  routeCandidateBuilder() {
    throw new Error("builder must not be called when ROUTE_V2_CANDIDATE_POOL_ENABLED=false");
  },
});
const flagOffCandidate = await buildOne(flagOffHarness);
assert.equal(fs.existsSync(flagOffHarness.candidatePath), false, "flag off must not write candidate pool storage");

const flagOnHarness = createHarness("flag-on", { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true" });
const flagOnCandidate = await buildOne(flagOnHarness);
assert.deepEqual(flagOnCandidate.record, flagOffCandidate.record, "RouteRecord must be identical with Candidate Pool enabled and disabled");
assert.equal(fs.existsSync(flagOnHarness.candidatePath), true, "flag on should write candidate pool JSONL");
const candidateLines = fs.readFileSync(flagOnHarness.candidatePath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
assert(candidateLines.length >= 2, "flag on should write multiple real candidates");
const parsedCandidates = candidateLines.map((line) => JSON.parse(line));
for (const candidate of parsedCandidates) {
  const validation = validateRouteCandidate(candidate);
  assert.equal(validation.accepted, true, `written candidate failed schema: ${validation.reasons.join(",")}`);
  assert.equal(candidate.status, "pending", "legacy sidecar mode must keep candidates pending until selection is enabled");
  assert.deepEqual(candidate.rejectionReasons, [], "sidecar must not invent rejection reasons");
  assert(!("selected" in candidate), "sidecar must not write selected");
  assert(!("rejected" in candidate), "sidecar must not write rejected");
  assert(candidate.supportingSignals.some((signal) => signal.type === "planner-sidecar-stage" && signal.value === "after-selectDestinationPool-before-buildRouteSkeleton"), "stage signal missing");
}

let skeletonCoordinateRead = false;
let appendBeforeSkeleton = null;
const instrumentedPool = JP_POOL.slice(0, 4).map((item) => {
  const clone = { ...item };
  Object.defineProperty(clone, "latitude", {
    enumerable: true,
    get() {
      skeletonCoordinateRead = true;
      return item.latitude;
    },
  });
  return clone;
});
const sidecarOrderHarness = createHarness("before-skeleton", { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true" }, {
  knowledgeGraph: createKnowledgeGraph(instrumentedPool),
  routeCandidateBuilder({ context, concept }) {
    return [{
      intentId: "intent-before-skeleton",
      countries: ["JP"],
      destinations: [
        { id: "Q1490", wikidataId: "Q1490", name: "Tokyo", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, entityTypeName: "city" },
        { id: "Q34600", wikidataId: "Q34600", name: "Kyoto", countryCode: "JP", latitude: 35.0116, longitude: 135.7681, entityTypeName: "city" },
      ],
      proposedOrder: ["Q1490", "Q34600"],
      durationDays: context.durationDays || concept.durationDays || 8,
      travelStyle: context.travelStyle || concept.travelStyle,
      generationSource: "phase2b2-order-test",
      supportingSignals: [],
      status: "generated",
      rejectionReasons: [],
      unknowns: [{ field: "test", reason: "order instrumentation candidate" }],
      createdAt: fixedNow,
      version: "route-generation-v2-phase2a-candidate-v1",
    }];
  },
  candidatePoolStore: {
    enabled: () => true,
    append(candidate) {
      appendBeforeSkeleton = !skeletonCoordinateRead;
      return { written: true, candidateId: candidate.candidateId || "test-candidate" };
    },
  },
});
await buildOne(sidecarOrderHarness);
assert.equal(appendBeforeSkeleton, true, "candidate sidecar append should happen before buildRouteSkeleton reads coordinates");

const failDir = path.join(tempRoot, "write-failure-target");
fs.mkdirSync(failDir, { recursive: true });
const writeFailureHarness = createHarness("write-failure", {
  ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
  ROUTE_V2_CANDIDATE_POOL_PATH: failDir,
});
const writeFailureCandidate = await buildOne(writeFailureHarness);
assert.deepEqual(writeFailureCandidate.record, flagOffCandidate.record, "candidate write failure must not change RouteRecord");
assert.equal(fs.statSync(failDir).isDirectory(), true, "write failure target should remain a directory");

assert.notEqual(flagOnHarness.candidatePath, flagOnHarness.acceptedPath, "candidate pool storage must be separate from accepted repository storage");
assert.equal(fs.existsSync(flagOnHarness.acceptedPath), false, "planner sidecar test should not write accepted repository");

const acceptedRouteCountAfter = routeCount(realAcceptedPath);
assert.equal(acceptedRouteCountAfter, acceptedRouteCountBefore, "real accepted route count changed");
assertStatesUnchanged(protectedBefore, statesFor(protectedPaths));

for (const file of [
  "src/lib/routes/discovery.mjs",
  "src/lib/routes/route-search-service.mjs",
  "routes.js",
  "route-detail.js",
]) {
  const text = fs.readFileSync(path.resolve(projectRoot, file), "utf8");
  assert.equal(/route-candidate-builder|route-candidate-pool/u.test(text), false, `${file} must not read Candidate Pool in Phase 2B-2`);
}

console.log(JSON.stringify({
  status: "PASS",
  tempRoot,
  routeRecordUnchanged: true,
  flagOffCreatedCandidateStorage: fs.existsSync(flagOffHarness.candidatePath),
  writtenCandidateCount: parsedCandidates.length,
  sidecarBeforeSkeleton: appendBeforeSkeleton,
  writeFailureDegraded: true,
  acceptedRepositoryUnchanged: true,
  bootstrapUnchanged: true,
  feedSearchDetailUnchanged: true,
  realCandidateCacheChanged: false,
}, null, 2));
