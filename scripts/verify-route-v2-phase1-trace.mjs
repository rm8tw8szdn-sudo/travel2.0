import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAcceptedRouteRepository,
  createDecisionTraceId,
  createDecisionTraceStore,
  createEvidenceRepository,
  createRouteCompositionPlanner,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-01-01T00:00:00.000Z";
const RealDate = Date;
globalThis.Date = class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length) return new RealDate(...args);
    return new RealDate(fixedNow);
  }

  static now() { return new RealDate(fixedNow).getTime(); }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase1-trace-"));

const JP_POOL = [
  { wikidataId: "Q1490", countryCode: "JP", name: "东京", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503, countryName: "日本" },
  { wikidataId: "Q39231", countryCode: "JP", name: "富士山", entityTypeName: "mountain", latitude: 35.3606, longitude: 138.7274, countryName: "日本" },
  { wikidataId: "Q34600", countryCode: "JP", name: "京都", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681, countryName: "日本" },
  { wikidataId: "Q169134", countryCode: "JP", name: "奈良", entityTypeName: "city", latitude: 34.6851, longitude: 135.8048, countryName: "日本" },
  { wikidataId: "Q35765", countryCode: "JP", name: "大阪", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023, countryName: "日本" },
];

const knowledgeGraph = {
  queryDestinations(query) {
    return query.country === "JP" ? JP_POOL.slice() : [];
  },
};

function createHarness(name, envOverrides = {}) {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const acceptedPath = path.join(dir, "accepted.json");
  const tracePath = path.join(dir, "decision-traces.jsonl");
  const env = {
    ROUTE_V2_TRACE_ENABLED: "false",
    ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT: "false",
    ROUTE_V2_TRACE_PATH: tracePath,
    ...envOverrides,
  };
  const acceptedRepository = createAcceptedRouteRepository({ storagePath: acceptedPath });
  const evidenceRepository = createEvidenceRepository({ storagePath: path.join(dir, "evidence.json") });
  const decisionTraceStore = createDecisionTraceStore({ storagePath: tracePath, env, now: () => fixedNow });
  const planner = createRouteCompositionPlanner({
    acceptedRepository,
    evidenceRepository,
    knowledgeGraph,
    decisionTraceStore,
    env,
  });
  return { dir, acceptedPath, tracePath, env, acceptedRepository, evidenceRepository, decisionTraceStore, planner };
}

async function buildOne(harness) {
  const result = await harness.planner.buildCandidates({
    limit: 1,
    context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
  });
  assert.equal(result.accepted.length, 1, `expected one accepted candidate, rejected=${JSON.stringify(result.rejected)}`);
  return result.accepted[0];
}

const offHarness = createHarness("flag-off", { ROUTE_V2_TRACE_ENABLED: "false" });
const offCandidate = await buildOne(offHarness);
assert.equal(fs.existsSync(offHarness.tracePath), false, "flag off must not create trace storage");
assert.equal(offCandidate.decisionTrace.reason, "trace-disabled", "flag off wrapper diagnostic should report trace-disabled");

const onHarness = createHarness("flag-on", { ROUTE_V2_TRACE_ENABLED: "true" });
const onCandidate = await buildOne(onHarness);
assert.deepEqual(onCandidate.record, offCandidate.record, "RouteRecord must be identical with trace enabled and disabled");
assert.equal(onCandidate.decisionTrace.written, true, "flag on should write one trace");
assert.equal(fs.existsSync(onHarness.tracePath), true, "trace JSONL should exist when enabled");

const traceLines = fs.readFileSync(onHarness.tracePath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
assert.equal(traceLines.length, 1, "one generated route should append one trace line");
const parsedTrace = JSON.parse(traceLines[0]);
assert.equal(parsedTrace.routeId, onCandidate.record.id, "trace should reference generated routeId");
assert.equal(parsedTrace.version, "route-generation-v2-phase1-trace-v1");
assert.ok(Array.isArray(parsedTrace.unknowns) && parsedTrace.unknowns.length >= 1, "trace must allow explicit Unknown entries");
assert.equal(Array.isArray(parsedTrace.candidatePool), true, "Phase 1 candidatePool can be an empty array");
assert.equal(Array.isArray(parsedTrace.rejectedCandidates), true, "Phase 1 rejectedCandidates can be an empty array");

const parsedRecords = onHarness.decisionTraceStore.readAll();
assert.equal(parsedRecords.length, 1, "readAll should return one parsed JSONL record");
assert.equal(parsedRecords[0].ok, true, "JSONL line must parse");

const stableA = createDecisionTraceId({ routeId: "route-a", candidateId: "candidate-a", intentId: "intent-a" });
const stableB = createDecisionTraceId({ routeId: "route-a", candidateId: "candidate-a", intentId: "intent-a" });
const stableC = createDecisionTraceId({ routeId: "route-b", candidateId: "candidate-b", intentId: "intent-b" });
assert.equal(stableA, stableB, "traceId should be stable for the same inputs");
assert.notEqual(stableA, stableC, "traceId should not obviously collide for different inputs");

const failDir = path.join(tempRoot, "write-failure");
fs.mkdirSync(failDir, { recursive: true });
const failStore = createDecisionTraceStore({
  storagePath: failDir,
  env: { ROUTE_V2_TRACE_ENABLED: "true", ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT: "false" },
  now: () => fixedNow,
});
const failHarness = createHarness("write-failure-harness", { ROUTE_V2_TRACE_ENABLED: "true" });
const failPlanner = createRouteCompositionPlanner({
  acceptedRepository: failHarness.acceptedRepository,
  evidenceRepository: failHarness.evidenceRepository,
  knowledgeGraph,
  decisionTraceStore: failStore,
  env: failHarness.env,
});
const failResult = await failPlanner.buildCandidates({
  limit: 1,
  context: { durationDays: 8, country: "JP", countryName: "日本", travelStyle: "classic-first-trip" },
});
assert.equal(failResult.accepted.length, 1, "trace write failure must not block legacy RouteRecord generation");
assert.equal(failResult.accepted[0].decisionTrace.written, false, "write failure should be captured as diagnostic");
assert.equal(failResult.accepted[0].decisionTrace.reason, "trace-write-failed");
assert.ok(failResult.accepted[0].record.id, "legacy RouteRecord should still be returned on trace write failure");

const oldAcceptedDir = path.join(tempRoot, "old-accepted");
fs.mkdirSync(oldAcceptedDir, { recursive: true });
const oldAcceptedPath = path.join(oldAcceptedDir, "accepted.json");
fs.writeFileSync(oldAcceptedPath, JSON.stringify({ schemaVersion: 2, records: [onCandidate.record] }, null, 2));
const oldTracePath = path.join(oldAcceptedDir, "decision-traces.jsonl");
createAcceptedRouteRepository({ storagePath: oldAcceptedPath });
createDecisionTraceStore({
  storagePath: oldTracePath,
  env: { ROUTE_V2_TRACE_ENABLED: "true", ROUTE_V2_TRACE_REQUIRED_FOR_ACCEPT: "false" },
  now: () => fixedNow,
});
assert.equal(fs.existsSync(oldTracePath), false, "loading old accepted routes must not auto-backfill trace");
assert.notEqual(onHarness.tracePath, onHarness.acceptedPath, "trace storage must be separate from accepted repository storage");

for (const file of [
  "src/lib/routes/accepted-repository.mjs",
  "src/lib/routes/discovery.mjs",
  "src/lib/routes/route-search-service.mjs",
  "routes.js",
  "route-detail.js",
]) {
  const text = fs.readFileSync(file, "utf8");
  assert.equal(/decision-trace-store|decision-trace-schema/u.test(text), false, `${file} must not read DecisionTrace in Phase 1`);
}

console.log(JSON.stringify({
  status: "PASS",
  tempRoot,
  routeRecordUnchanged: true,
  tracePath: onHarness.tracePath,
  traceLines: traceLines.length,
  writeFailureDegraded: true,
  oldAcceptedAutoBackfill: false,
  feedSearchDetailTraceReads: false,
}, null, 2));
