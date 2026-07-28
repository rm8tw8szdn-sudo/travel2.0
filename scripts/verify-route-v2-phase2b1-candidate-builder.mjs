import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertStatesUnchanged, fileState } from "./lib/route-v2-test-file-state.mjs";
import {
  ROUTE_CANDIDATE_BUILDER_CREATED_AT,
  buildRouteCandidatesFromPool,
  candidateHasMeaningfulDifference,
  candidateShapeKey,
  validateRouteCandidate,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const acceptedRepositoryPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const realCandidatePoolPath = path.resolve(projectRoot, ".route-v2-cache", "route-candidate-pool.jsonl");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertUnchanged(label, before, after) {
  assertStatesUnchanged(before, after, `${label} changed`);
}

const kgPool = [
  { wikidataId: "Q1490", name: "Tokyo", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, entityTypeName: "city" },
  { wikidataId: "Q34600", name: "Kyoto", countryCode: "JP", latitude: 35.0116, longitude: 135.7681, entityTypeName: "heritage city" },
  { wikidataId: "Q35765", name: "Osaka", countryCode: "JP", latitude: 34.6937, longitude: 135.5023, entityTypeName: "food city" },
  { wikidataId: "Q16990", name: "Nara", countryCode: "JP", latitude: 34.6851, longitude: 135.8048, entityTypeName: "heritage city" },
  { wikidataId: "Q8643", name: "Mount Fuji", countryCode: "JP", latitude: 35.3606, longitude: 138.7274, entityTypeName: "mountain" },
  { wikidataId: "Q19869", name: "Kanazawa", countryCode: "JP", latitude: 36.5613, longitude: 136.6562, entityTypeName: "craft city" },
  { wikidataId: "Q8684", name: "Seoul", countryCode: "KR", latitude: 37.5665, longitude: 126.978, entityTypeName: "city" },
  { wikidataId: "Q16520", name: "Busan", countryCode: "KR", latitude: 35.1796, longitude: 129.0756, entityTypeName: "coastal city" },
  { wikidataId: "Q42056", name: "Gyeongju", countryCode: "KR", latitude: 35.8562, longitude: 129.2247, entityTypeName: "heritage city" },
  { wikidataId: "Q41164", name: "Jeju", countryCode: "KR", latitude: 33.4996, longitude: 126.5312, entityTypeName: "island" },
];

const context = {
  intentId: "intent-jp-kr-8d",
  countries: ["JP", "KR"],
  durationDays: 8,
  travelStyle: "classic-first-trip",
  theme: "city-and-heritage",
};

const concept = {
  durationDays: 8,
  durationBand: "7-10",
  travelStyle: "classic-first-trip",
};

const acceptedBefore = fileState(acceptedRepositoryPath);
const bootstrapBefore = fileState(bootstrapPath);
const candidatePoolBefore = fileState(realCandidatePoolPath);

const originalContext = deepClone(context);
const originalConcept = deepClone(concept);
const originalPool = deepClone(kgPool);

const originalRandom = Math.random;
Math.random = () => {
  throw new Error("Math.random must not be used by the Phase 2B-1 candidate builder");
};

let firstRun;
let secondRun;
try {
  firstRun = buildRouteCandidatesFromPool({
    context,
    concept,
    pool: kgPool,
    targetCount: 8,
    seed: "phase2b1-controlled-seed",
  });
  secondRun = buildRouteCandidatesFromPool({
    context,
    concept,
    pool: kgPool,
    targetCount: 8,
    seed: "phase2b1-controlled-seed",
  });
} finally {
  Math.random = originalRandom;
}

assert.equal(firstRun.length, 8, "controlled KG pool should produce 8 candidates");
assert.deepEqual(secondRun, firstRun, "same input should produce stable output");
assert.deepEqual(context, originalContext, "context input was mutated");
assert.deepEqual(concept, originalConcept, "concept input was mutated");
assert.deepEqual(kgPool, originalPool, "KG pool input was mutated");

const shapeKeys = new Set(firstRun.map(candidateShapeKey));
assert.equal(shapeKeys.size, firstRun.length, "duplicate candidate shape detected");
assert(firstRun.every((candidate) => candidate.createdAt === ROUTE_CANDIDATE_BUILDER_CREATED_AT), "builder should use a fixed default createdAt");

for (const candidate of firstRun) {
  const validation = validateRouteCandidate(candidate);
  assert.equal(validation.accepted, true, `candidate failed Phase 2A schema: ${validation.reasons.join(", ")}`);
  assert.equal(candidate.status, "pending", "Phase 2B-1 should emit the unified pending lifecycle state");
  assert.deepEqual(candidate.rejectionReasons, [], "Phase 2B-1 must not invent rejection reasons");
  assert(!("selected" in candidate), "Phase 2B-1 must not mark selected candidates");
  assert(!("rejected" in candidate), "Phase 2B-1 must not mark rejected candidates");
  assert(candidate.unknowns.length > 0, "unknowns should record unimplemented decision evidence");
  assert(candidate.supportingSignals.some((signal) => signal.type === "kg-destination-pool"), "KG pool signal missing");
}

for (let index = 0; index < firstRun.length; index += 1) {
  for (let nextIndex = index + 1; nextIndex < firstRun.length; nextIndex += 1) {
    assert(candidateHasMeaningfulDifference(firstRun[index], firstRun[nextIndex]), "candidates should differ beyond title text");
  }
}

const insufficientPool = kgPool.slice(0, 2);
const insufficientRun = buildRouteCandidatesFromPool({
  context: { ...context, intentId: "intent-insufficient" },
  concept,
  pool: insufficientPool,
  targetCount: 8,
  seed: "phase2b1-small-pool",
});
assert.equal(insufficientRun.length, 3, "two valid destinations should produce the three comparable Phase 2B candidate variants");
assert.equal(
  new Set(insufficientRun.map(candidateShapeKey)).size,
  insufficientRun.length,
  "two-destination candidate variants must keep distinct shapes",
);
for (let index = 0; index < insufficientRun.length; index += 1) {
  for (let nextIndex = index + 1; nextIndex < insufficientRun.length; nextIndex += 1) {
    assert(
      candidateHasMeaningfulDifference(insufficientRun[index], insufficientRun[nextIndex]),
      "two-destination candidate variants must remain meaningfully different",
    );
  }
}

const duplicateRun = buildRouteCandidatesFromPool({
  context: { ...context, intentId: "intent-dedupe" },
  concept,
  pool: [...kgPool.slice(0, 4), ...kgPool.slice(0, 4)],
  targetCount: 8,
  seed: "phase2b1-duplicate-pool",
});
assert(duplicateRun.length > 0, "duplicate-heavy pool should still produce controlled candidates");
assert.equal(new Set(duplicateRun.map(candidateShapeKey)).size, duplicateRun.length, "duplicate-heavy pool produced duplicate shapes");

const emptyRun = buildRouteCandidatesFromPool({ context, concept, pool: [], targetCount: 8 });
assert.deepEqual(emptyRun, [], "empty pool should return empty candidates");

const invalidRun = buildRouteCandidatesFromPool({
  context,
  concept,
  pool: [{ name: "No Country" }, { countryCode: "JP" }],
  targetCount: 8,
});
assert.deepEqual(invalidRun, [], "invalid pool should return empty candidates");

for (const candidate of firstRun) {
  assert(candidate.destinations.every((destination) => destination.id && destination.name && destination.countryCode), "candidate contains empty destination");
  assert(candidate.proposedOrder.every((id) => candidate.destinations.some((destination) => destination.id === id)), "proposedOrder is not self-consistent");
}

assertUnchanged("accepted repository", acceptedBefore, fileState(acceptedRepositoryPath));
assertUnchanged("route-feed-bootstrap.js", bootstrapBefore, fileState(bootstrapPath));
assertUnchanged("real candidate pool cache", candidatePoolBefore, fileState(realCandidatePoolPath));

const forbiddenDiff = execFileSync("git", [
  "diff",
  "--name-only",
  "--",
  "scripts/materialize-route-pool.mjs",
], { cwd: projectRoot, encoding: "utf8" }).trim();
assert.equal(forbiddenDiff, "", "materialize file changed");

console.log(JSON.stringify({
  ok: true,
  generatedCandidateCount: firstRun.length,
  insufficientPoolCandidateCount: insufficientRun.length,
  duplicatePoolCandidateCount: duplicateRun.length,
  stable: true,
  acceptedRepositoryUnchanged: true,
  bootstrapUnchanged: true,
  realCandidatePoolUnchanged: true,
}, null, 2));
