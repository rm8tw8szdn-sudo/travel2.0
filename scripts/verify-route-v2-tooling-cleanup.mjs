import assert from "node:assert/strict";
import path from "node:path";
import { fileState } from "./lib/route-v2-test-file-state.mjs";
import {
  buildRouteCandidatesFromPool,
  candidateShapeKey,
  createDecisionTraceId,
  createRouteCandidateId,
  normalizeRouteCandidate,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const acceptedRepositoryPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");

const fixedNow = "2026-01-01T00:00:00.000Z";
const acceptedBefore = fileState(acceptedRepositoryPath);
const bootstrapBefore = fileState(bootstrapPath);

const routeCandidateFixture = {
  intentId: "intent-japan-8d-first-trip",
  countries: ["JP"],
  destinations: [
    { wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
    { wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
    { wikidataId: "Q35765", countryCode: "JP", name: "Osaka", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
  ],
  proposedOrder: ["Q1490", "Q34600", "Q35765"],
  durationDays: 8,
  travelStyle: "classic-first-trip",
  generationSource: "phase2a-test-knowledge-graph",
  supportingSignals: [
    { signal: "country-match", value: "JP" },
    { signal: "duration-fit", value: "8d" },
  ],
  status: "generated",
  rejectionReasons: [],
  unknowns: [{ field: "candidateComparison", reason: "Phase 2A does not compare candidates." }],
  createdAt: fixedNow,
};

const normalizedCandidate = normalizeRouteCandidate(routeCandidateFixture, { now: () => fixedNow });
const directCandidateId = createRouteCandidateId({
  intentId: normalizedCandidate.intentId,
  countries: normalizedCandidate.countries,
  destinations: normalizedCandidate.destinations,
  proposedOrder: normalizedCandidate.proposedOrder,
  durationDays: normalizedCandidate.durationDays,
  travelStyle: normalizedCandidate.travelStyle,
  generationSource: normalizedCandidate.generationSource,
});
assert.equal(normalizedCandidate.candidateId, "rc-5bd691815c0bfa25ad41", "normalized candidateId golden changed");
assert.equal(directCandidateId, "rc-5bd691815c0bfa25ad41", "direct candidateId golden changed");

const traceId = createDecisionTraceId({
  routeId: "route-japan-8d",
  candidateId: normalizedCandidate.candidateId,
  intentId: normalizedCandidate.intentId,
});
assert.equal(traceId, "dt-3d1cfa5d81194500df25", "traceId golden changed");

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

const builtCandidates = buildRouteCandidatesFromPool({
  context: {
    countries: ["JP", "KR"],
    durationDays: 8,
    travelStyle: "classic-first-trip",
    theme: "city-and-heritage",
  },
  concept: {
    durationDays: 8,
    durationBand: "7-10",
    travelStyle: "classic-first-trip",
  },
  pool: kgPool,
  targetCount: 8,
  seed: "phase2b1-controlled-seed",
});

assert.equal(builtCandidates.length, 8, "candidate builder count golden changed");
assert.equal(builtCandidates[0].intentId, "intent-07565bc6a9dd385b5cbb", "derived intentId golden changed");
assert.equal(builtCandidates[0].candidateId, "rc-1f609c7ee26ba57bdf26", "builder candidateId golden changed");
assert.equal(candidateShapeKey(builtCandidates[0]), "7243f30b017d3637ff3fe2be76d5a45c3b2b0ce7fe78f532adee302acd05e9b7", "candidate shape key golden changed");
assert.deepEqual(
  builtCandidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    method: candidate.supportingSignals.find((signal) => signal.type === "candidate-builder-method")?.value,
    order: candidate.proposedOrder,
  })),
  [
    { candidateId: "rc-1f609c7ee26ba57bdf26", method: "stable-pool-order", order: ["Q16520", "Q16990", "Q8684", "Q41164", "Q42056"] },
    { candidateId: "rc-55b4e6c73f69e794261c", method: "country-balanced-order", order: ["Q16990", "Q16520", "Q19869", "Q8684", "Q1490"] },
    { candidateId: "rc-d41d5202678d1ea0b58b", method: "seed-rotated-order-a", order: ["Q34600", "Q35765", "Q8643", "Q16520", "Q16990"] },
    { candidateId: "rc-4cd37845da53084fb49a", method: "seed-rotated-order-b", order: ["Q8643", "Q16520", "Q16990", "Q8684", "Q41164"] },
    { candidateId: "rc-8896f0a70e67fc7bb2cc", method: "entity-type-mix", order: ["Q1490", "Q8684", "Q16520", "Q19869", "Q35765"] },
    { candidateId: "rc-e192ed5013ea74c2b2df", method: "name-order", order: ["Q16520", "Q42056", "Q41164", "Q19869", "Q34600"] },
    { candidateId: "rc-22f3270201437fafe4b7", method: "short-structure", order: ["Q16520", "Q16990", "Q8684", "Q41164"] },
    { candidateId: "rc-26c5f92fa71d67784092", method: "extended-structure", order: ["Q16520", "Q16990", "Q8684", "Q41164", "Q42056", "Q19869"] },
  ],
  "candidate builder order golden changed",
);

assert.deepEqual(fileState(acceptedRepositoryPath), acceptedBefore, "accepted repository changed during tooling golden verification");
assert.deepEqual(fileState(bootstrapPath), bootstrapBefore, "route-feed-bootstrap.js changed during tooling golden verification");

console.log(JSON.stringify({
  status: "PASS",
  traceIdStable: true,
  candidateIdStable: true,
  intentIdStable: true,
  candidateShapeKeyStable: true,
  candidateCount: builtCandidates.length,
  acceptedRepositoryUnchanged: true,
  bootstrapUnchanged: true,
}, null, 2));
