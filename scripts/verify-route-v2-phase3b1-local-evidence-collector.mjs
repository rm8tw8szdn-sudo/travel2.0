import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertStatesUnchanged, statesFor } from "./lib/route-v2-test-file-state.mjs";
import {
  collectLocalEvidenceBundle,
  createAcceptedRouteRepository,
  createDecisionTraceId,
  createRouteCandidateId,
  defaultDecisionTracePath,
  defaultRouteCandidatePoolPath,
  defaultRouteEvidenceBundlePath,
  validateEvidenceBundle,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const fixedNow = "2026-01-01T00:00:00.000Z";

const acceptedRepositoryPath = path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json");
const bootstrapPath = path.resolve(projectRoot, "route-feed-bootstrap.js");
const realCandidatePoolPath = defaultRouteCandidatePoolPath();
const realDecisionTracePath = defaultDecisionTracePath();
const realEvidenceBundlePath = defaultRouteEvidenceBundlePath();
const protectedPaths = [
  acceptedRepositoryPath,
  bootstrapPath,
  realCandidatePoolPath,
  realDecisionTracePath,
  realEvidenceBundlePath,
];
const protectedBefore = statesFor(protectedPaths);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return fixedNow;
}

const jpKgPool = [
  { wikidataId: "Q1490", id: "Q1490", countryCode: "JP", name: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
  { wikidataId: "Q34600", id: "Q34600", countryCode: "JP", name: "Kyoto", entityTypeName: "heritage city", latitude: 35.0116, longitude: 135.7681 },
  { wikidataId: "Q35765", id: "Q35765", countryCode: "JP", name: "Osaka", entityTypeName: "food city", latitude: 34.6937, longitude: 135.5023 },
  { wikidataId: "Q8684", id: "Q8684", countryCode: "KR", name: "Seoul", entityTypeName: "city", latitude: 37.5665, longitude: 126.978 },
  { wikidataId: "Q16520", id: "Q16520", countryCode: "KR", name: "Busan", entityTypeName: "coastal city", latitude: 35.1796, longitude: 129.0756 },
];

function candidate(overrides = {}) {
  return {
    candidateId: "rc-local-evidence-jp",
    intentId: "intent-local-evidence-jp",
    countries: ["JP"],
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
    proposedOrder: ["Q1490", "Q34600", "Q35765"],
    durationDays: 8,
    travelStyle: "classic-first-trip",
    generationSource: "route-v2-phase2b1-kg-pool-builder",
    supportingSignals: [],
    status: "generated",
    rejectionReasons: [],
    unknowns: [],
    createdAt: fixedNow,
    version: "route-generation-v2-phase2a-candidate-v1",
    ...overrides,
  };
}

function collect(inputCandidate, pool = jpKgPool) {
  return collectLocalEvidenceBundle({ candidate: inputCandidate, kgPool: pool, now });
}

function assertValid(bundle, label) {
  const validation = validateEvidenceBundle(bundle);
  assert.equal(validation.accepted, true, `${label} should produce a valid EvidenceBundle: ${validation.reasons.join(",")}`);
}

function countByCategory(bundle, category, status = null) {
  return bundle.items.filter((item) => item.evidenceCategory === category && (!status || item.status === status)).length;
}

function unknownFields(bundle) {
  return new Set(bundle.unknowns.map((item) => item.field));
}

function failureReasons(bundle) {
  return bundle.failures.map((item) => item.reason).join(" | ");
}

const originalRandom = Math.random;
Math.random = () => {
  throw new Error("Math.random must not be used by the local evidence collector");
};

let allMatched;
let crossCountry;
let missingKg;
let kgContradiction;
let nameOnlyIdentity;
let duplicateNameIdentity;
let countryMismatch;
let missingOrder;
let duplicateOrder;
let missingCoordinate;
let blankLatitudeCoordinate;
let blankLongitudeCoordinate;
let nonNumericCoordinate;
let zeroCoordinate;
let invalidCoordinate;
let shortTrip;
let defaultNowA;
let defaultNowB;
try {
  const baseCandidate = candidate();
  const originalCandidate = deepClone(baseCandidate);
  const originalPool = deepClone(jpKgPool);
  allMatched = collect(baseCandidate);
  assert.deepEqual(baseCandidate, originalCandidate, "collector must not mutate candidate input");
  assert.deepEqual(jpKgPool, originalPool, "collector must not mutate KG pool input");
  assertValid(allMatched, "all-matched single-country scenario");
  assert.equal(countByCategory(allMatched, "destination-identity", "verified"), 3, "all destinations should match KG identity");
  assert.equal(countByCategory(allMatched, "country-match", "verified"), 3, "all destinations should match candidate countries");
  assert.equal(countByCategory(allMatched, "proposed-order-integrity", "verified"), 1, "complete order should be verified");
  assert.equal(countByCategory(allMatched, "coordinate", "verified"), 3, "all coordinates should be verified");
  assert.equal(countByCategory(allMatched, "segment-distance", "verified"), 2, "two adjacent distances should be calculated");
  assert.equal(countByCategory(allMatched, "duration-fit", "weak_signal"), 1, "duration fit must be weak_signal");
  assert(unknownFields(allMatched).has("transportFeasibility"));
  assert(unknownFields(allMatched).has("seasonalFit"));
  assert(unknownFields(allMatched).has("budgetFit"));

  crossCountry = collect(candidate({
    candidateId: "rc-local-evidence-cross",
    intentId: "intent-local-evidence-cross",
    countries: ["JP", "KR"],
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q8684", wikidataId: "Q8684", countryCode: "KR", name: "Seoul", latitude: 37.5665, longitude: 126.978 },
      { id: "Q16520", wikidataId: "Q16520", countryCode: "KR", name: "Busan", latitude: 35.1796, longitude: 129.0756 },
    ],
    proposedOrder: ["Q1490", "Q8684", "Q16520"],
  }));
  assertValid(crossCountry, "cross-country scenario");
  assert.equal(countByCategory(crossCountry, "country-match", "verified"), 3, "cross-country destinations should match route countries");
  assert.equal(countByCategory(crossCountry, "segment-distance", "verified"), 2, "cross-country adjacent distances should be calculated");

  missingKg = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q999999", wikidataId: "Q999999", countryCode: "JP", name: "Missing Place", latitude: 35.1, longitude: 136.1 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
    proposedOrder: ["Q1490", "Q999999", "Q35765"],
  }));
  assertValid(missingKg, "missing KG destination scenario");
  assert([...unknownFields(missingKg)].some((field) => field.includes("destinationIdentity:Q999999")), "missing KG destination should be unknown");
  assert(missingKg.unknowns.some((entry) => entry.reason === "stable-destination-id-not-found-in-kg-pool"));

  nameOnlyIdentity = collect(candidate({
    destinations: [
      { name: "Tokyo", countryCode: "JP", latitude: 35.6762, longitude: 139.6503 },
      { name: "Kyoto", countryCode: "JP", latitude: 35.0116, longitude: 135.7681 },
      { name: "Osaka", countryCode: "JP", latitude: 34.6937, longitude: 135.5023 },
    ],
    proposedOrder: ["Tokyo", "Kyoto", "Osaka"],
  }));
  assertValid(nameOnlyIdentity, "name-only identity scenario");
  assert.equal(countByCategory(nameOnlyIdentity, "destination-identity", "verified"), 0, "name-only destinations must not become verified identity");
  assert(nameOnlyIdentity.unknowns.every((entry) => !entry.reason.includes("name-matched")), "name must not prove destination identity");
  assert(nameOnlyIdentity.unknowns.some((entry) => entry.reason === "stable-destination-id-missing"));

  duplicateNameIdentity = collect(candidate({
    countries: ["JP"],
    destinations: [
      { name: "Springfield", countryCode: "JP", latitude: 1, longitude: 1 },
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
    ],
    proposedOrder: ["Springfield", "Q1490"],
  }), [
    { id: "Q111", wikidataId: "Q111", countryCode: "JP", name: "Springfield", latitude: 1, longitude: 1 },
    { id: "Q222", wikidataId: "Q222", countryCode: "US", name: "Springfield", latitude: 2, longitude: 2 },
    ...jpKgPool,
  ]);
  assertValid(duplicateNameIdentity, "duplicate KG name scenario");
  assert.equal(countByCategory(duplicateNameIdentity, "destination-identity", "verified"), 1, "duplicate names must not choose the first KG identity by name");
  assert(duplicateNameIdentity.unknowns.some((entry) => entry.reason === "stable-destination-id-missing"));

  kgContradiction = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Wrong Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(kgContradiction, "KG contradiction scenario");
  assert(failureReasons(kgContradiction).includes("name-mismatch"), "KG field contradiction should become failure");

  countryMismatch = collect(candidate({
    countries: ["JP"],
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q8684", wikidataId: "Q8684", countryCode: "KR", name: "Seoul", latitude: 37.5665, longitude: 126.978 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
    proposedOrder: ["Q1490", "Q8684", "Q35765"],
  }));
  assertValid(countryMismatch, "country mismatch scenario");
  assert(failureReasons(countryMismatch).includes("destination-country-not-in-candidate-countries"));

  missingOrder = collect(candidate({
    proposedOrder: ["Q1490", "Q34600"],
  }));
  assertValid(missingOrder, "missing proposedOrder destination scenario");
  assert(failureReasons(missingOrder).includes("destination-missing-from-proposedOrder:Q35765"));

  duplicateOrder = collect(candidate({
    proposedOrder: ["Q1490", "Q34600", "Q34600", "Q35765"],
  }));
  assertValid(duplicateOrder, "duplicate proposedOrder scenario");
  assert(failureReasons(duplicateOrder).includes("proposedOrder-duplicate-id:Q34600"));

  missingCoordinate = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto" },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(missingCoordinate, "missing coordinate scenario");
  assert([...unknownFields(missingCoordinate)].some((field) => field.includes("coordinate:Q34600")));
  assert([...unknownFields(missingCoordinate)].some((field) => field.includes("segmentDistance:Q1490:Q34600")));

  blankLatitudeCoordinate = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: "", longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(blankLatitudeCoordinate, "blank latitude scenario");
  assert([...unknownFields(blankLatitudeCoordinate)].some((field) => field.includes("coordinate:Q1490")), "blank latitude should be unknown");
  assert.equal(blankLatitudeCoordinate.items.some((item) => item.evidenceCategory === "coordinate" && item.sourceId === "Q1490" && item.extractedFacts.latitude === 0), false, "blank latitude must not become 0");

  blankLongitudeCoordinate = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: "   " },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(blankLongitudeCoordinate, "blank longitude scenario");
  assert([...unknownFields(blankLongitudeCoordinate)].some((field) => field.includes("coordinate:Q1490")), "blank longitude should be unknown");
  assert.equal(blankLongitudeCoordinate.items.some((item) => item.evidenceCategory === "coordinate" && item.sourceId === "Q1490" && item.extractedFacts.longitude === 0), false, "blank longitude must not become 0");

  nonNumericCoordinate = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: "not-a-number", longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(nonNumericCoordinate, "non-numeric coordinate scenario");
  assert(failureReasons(nonNumericCoordinate).includes("coordinate-invalid-or-out-of-range"), "non-numeric coordinate should be failure");

  zeroCoordinate = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 0, longitude: 0 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(zeroCoordinate, "zero coordinate scenario");
  assert(zeroCoordinate.items.some((item) => item.evidenceCategory === "coordinate" && item.sourceId === "Q1490" && item.extractedFacts.latitude === 0 && item.extractedFacts.longitude === 0), "real 0 latitude/longitude should be verified");

  invalidCoordinate = collect(candidate({
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 190, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
    ],
  }));
  assertValid(invalidCoordinate, "invalid coordinate scenario");
  assert(failureReasons(invalidCoordinate).includes("coordinate-invalid-or-out-of-range"));

  shortTrip = collect(candidate({
    durationDays: 2,
    destinations: [
      { id: "Q1490", wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { id: "Q34600", wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { id: "Q35765", wikidataId: "Q35765", countryCode: "JP", name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
      { id: "Q16990", wikidataId: "Q16990", countryCode: "JP", name: "Nara", latitude: 34.6851, longitude: 135.8048 },
    ],
    proposedOrder: ["Q1490", "Q34600", "Q35765", "Q16990"],
  }), [...jpKgPool, { wikidataId: "Q16990", id: "Q16990", countryCode: "JP", name: "Nara", latitude: 34.6851, longitude: 135.8048 }]);
  assertValid(shortTrip, "short trip scenario");
  const durationItem = shortTrip.items.find((item) => item.evidenceCategory === "duration-fit");
  assert.equal(durationItem.status, "weak_signal", "duration fit must not be verified");
  assert.equal(durationItem.extractedFacts.pace, "compressed", "short trip with many destinations should be classified as compressed");

  const stableA = collect(candidate());
  const stableB = collect(candidate());
  assert.deepEqual(stableB, stableA, "same input and fixed now should produce stable output");

  defaultNowA = collectLocalEvidenceBundle({ candidate: candidate(), kgPool: jpKgPool });
  defaultNowB = collectLocalEvidenceBundle({ candidate: candidate(), kgPool: jpKgPool });
  assert.deepEqual(defaultNowB, defaultNowA, "default now must be fixed and stable");
} finally {
  Math.random = originalRandom;
}

for (const bundle of [
  allMatched,
  crossCountry,
  missingKg,
  nameOnlyIdentity,
  duplicateNameIdentity,
  kgContradiction,
  countryMismatch,
  missingOrder,
  duplicateOrder,
  missingCoordinate,
  blankLatitudeCoordinate,
  blankLongitudeCoordinate,
  nonNumericCoordinate,
  zeroCoordinate,
  invalidCoordinate,
  shortTrip,
  defaultNowA,
]) {
  assertValid(bundle, "scenario bundle");
  const serialized = JSON.stringify(bundle);
  for (const forbidden of ["title", "summary text", "plannerReason", "routeId", "coverUrl", "recommendationText"]) {
    assert.equal(serialized.includes(forbidden), false, `collector output contains forbidden route field/text: ${forbidden}`);
  }
  assert.equal(bundle.items.some((item) => item.status === "unknown" || item.status === "failed"), false, "unknown/failed must not be stored in items[]");
}

const acceptedCopyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase3b1-accepted-copy-")), "accepted-routes-copy.json");
fs.copyFileSync(acceptedRepositoryPath, acceptedCopyPath);
const repository = createAcceptedRouteRepository({ storagePath: acceptedCopyPath });
const feedCounts = {
  all: repository.list({ limit: 99999 }).total,
  cross: repository.list({ limit: 99999, routeType: "cross" }).total,
  single: repository.list({ limit: 99999, routeType: "single" }).total,
};
assert.deepEqual(feedCounts, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline changed");

const stableCandidateId = createRouteCandidateId({
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
});
assert.equal(stableCandidateId, "rc-5bd691815c0bfa25ad41", "candidateId golden changed");
assert.equal(createDecisionTraceId({
  routeId: "route-japan-8d",
  candidateId: stableCandidateId,
  intentId: "intent-japan-8d-first-trip",
}), "dt-3d1cfa5d81194500df25", "traceId golden changed");

assertStatesUnchanged(protectedBefore, statesFor(protectedPaths), "real route/cache files changed during Phase 3B-1 verification");

console.log(JSON.stringify({
  status: "PASS",
  evidenceBundleId: allMatched.evidenceBundleId,
  allMatchedSummary: allMatched.summary,
  crossCountrySegmentDistances: countByCategory(crossCountry, "segment-distance", "verified"),
  missingKgUnknowns: missingKg.unknowns.length,
  countryMismatchFailures: countryMismatch.failures.length,
  proposedOrderFailures: {
    missing: missingOrder.failures.length,
    duplicate: duplicateOrder.failures.length,
  },
  coordinateCases: {
    missingUnknowns: missingCoordinate.unknowns.length,
    invalidFailures: invalidCoordinate.failures.length,
  },
  durationFitStatus: shortTrip.items.find((item) => item.evidenceCategory === "duration-fit")?.status,
  stableOutput: true,
  feedReadyPoolCount: feedCounts,
  realCachesUnchanged: true,
  acceptedRepositoryUnchanged: true,
  bootstrapUnchanged: true,
}, null, 2));
