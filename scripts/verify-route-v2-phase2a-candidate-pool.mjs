import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ROUTE_CANDIDATE_SCHEMA_VERSION,
  createRouteCandidateId,
  createRouteCandidatePoolStore,
  defaultRouteCandidatePoolPath,
  normalizeRouteCandidate,
  validateRouteCandidate,
} from "../src/lib/routes/index.mjs";

const fixedNow = "2026-01-01T00:00:00.000Z";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-phase2a-candidate-"));
const realCandidatePath = defaultRouteCandidatePoolPath();
const realAcceptedPath = path.resolve(".route-v2-cache", "accepted-routes.json");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function fileState(file) {
  if (!fs.existsSync(file)) return { exists: false, size: 0, mtimeMs: 0, hash: "" };
  const stat = fs.statSync(file);
  return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs, hash: sha256(file) };
}

const realCandidateBefore = fileState(realCandidatePath);
const acceptedBefore = fileState(realAcceptedPath);

const baseDestinations = [
  { wikidataId: "Q1490", countryCode: "JP", name: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
  { wikidataId: "Q34600", countryCode: "JP", name: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 },
  { wikidataId: "Q35765", countryCode: "JP", name: "Osaka", entityTypeName: "city", latitude: 34.6937, longitude: 135.5023 },
];

const candidateInput = {
  intentId: "intent-japan-8d-first-trip",
  countries: ["JP"],
  destinations: baseDestinations,
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

const candidate = normalizeRouteCandidate(candidateInput, { now: () => fixedNow });
assert.equal(candidate.version, ROUTE_CANDIDATE_SCHEMA_VERSION);
assert.equal(validateRouteCandidate(candidate).accepted, true, "valid candidate should pass schema validation");

const sameId = createRouteCandidateId({
  intentId: candidate.intentId,
  countries: candidate.countries,
  destinations: candidate.destinations,
  proposedOrder: candidate.proposedOrder,
  durationDays: candidate.durationDays,
  travelStyle: candidate.travelStyle,
  generationSource: candidate.generationSource,
});
assert.equal(candidate.candidateId, sameId, "candidateId should be stable for normalized inputs");

const reorderedId = createRouteCandidateId({
  intentId: candidate.intentId,
  countries: candidate.countries,
  destinations: candidate.destinations,
  proposedOrder: [...candidate.proposedOrder].reverse(),
  durationDays: candidate.durationDays,
  travelStyle: candidate.travelStyle,
  generationSource: candidate.generationSource,
});
assert.notEqual(candidate.candidateId, reorderedId, "different proposed order should produce a different candidateId");

const invalidMissingIntent = normalizeRouteCandidate({ ...candidateInput, intentId: "" }, { now: () => fixedNow });
assert.equal(validateRouteCandidate(invalidMissingIntent).accepted, false, "missing intentId should be invalid");

const invalidFinalFields = { ...candidate, summary: "post-hoc summary", coverAsset: { imageUrl: "https://example.invalid/a.jpg" } };
const finalFieldValidation = validateRouteCandidate(invalidFinalFields);
assert.equal(finalFieldValidation.accepted, false, "candidate schema should reject final RouteRecord fields");
assert.ok(finalFieldValidation.reasons.some((reason) => reason.startsWith("forbidden-final-field:")));

const invalidSelected = { ...candidate, status: "selected" };
assert.equal(validateRouteCandidate(invalidSelected).accepted, false, "Phase 2A should not allow selected status without real comparison");

const disabledPath = path.join(tempRoot, "disabled", "route-candidate-pool.jsonl");
const disabledStore = createRouteCandidatePoolStore({
  storagePath: disabledPath,
  env: { ROUTE_V2_CANDIDATE_POOL_ENABLED: "false" },
  now: () => fixedNow,
});
const disabledWrite = disabledStore.append(candidate);
assert.equal(disabledWrite.reason, "candidate-pool-disabled");
assert.equal(fs.existsSync(disabledPath), false, "flag off must not create candidate pool storage");

const enabledPath = path.join(tempRoot, "enabled", "route-candidate-pool.jsonl");
const enabledStore = createRouteCandidatePoolStore({
  storagePath: enabledPath,
  env: { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true" },
  now: () => fixedNow,
});
const firstWrite = enabledStore.append(candidate);
assert.equal(firstWrite.written, true, "valid candidate should be written when flag is enabled");

const secondCandidate = normalizeRouteCandidate({
  ...candidateInput,
  proposedOrder: ["Q1490", "Q35765", "Q34600"],
  supportingSignals: [{ signal: "alternate-order", value: "osaka-before-kyoto" }],
}, { now: () => fixedNow });
assert.equal(secondCandidate.intentId, candidate.intentId);
assert.notEqual(secondCandidate.candidateId, candidate.candidateId);
const secondWrite = enabledStore.append(secondCandidate);
assert.equal(secondWrite.written, true, "second candidate for same intent should be written");

const lines = fs.readFileSync(enabledPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
assert.equal(lines.length, 2, "JSONL should contain one candidate per line");
for (const line of lines) {
  const parsed = JSON.parse(line);
  assert.equal(validateRouteCandidate(parsed).accepted, true, "each JSONL candidate line should validate");
}
const readRecords = enabledStore.readAll();
assert.equal(readRecords.length, 2);
assert.equal(readRecords.every((record) => record.ok && record.validation.accepted), true);
assert.equal(enabledStore.listByIntent(candidate.intentId).length, 2, "multiple candidates should belong to the same intent");

const invalidWrite = enabledStore.append({ ...candidate, destinations: [] });
assert.equal(invalidWrite.written, false, "invalid candidate should not be written");
assert.equal(invalidWrite.reason, "candidate-invalid");

const failureDir = path.join(tempRoot, "write-failure");
fs.mkdirSync(failureDir, { recursive: true });
const failureStore = createRouteCandidatePoolStore({
  storagePath: failureDir,
  env: { ROUTE_V2_CANDIDATE_POOL_ENABLED: "true" },
  now: () => fixedNow,
});
const failureWrite = failureStore.append(candidate);
assert.equal(failureWrite.written, false, "write failure should be captured");
assert.equal(failureWrite.reason, "candidate-write-failed");

for (const file of [
  "scripts/materialize-route-pool.mjs",
  "src/lib/routes/accepted-repository.mjs",
  "src/lib/routes/discovery.mjs",
  "src/lib/routes/route-search-service.mjs",
  "routes.js",
  "route-detail.js",
]) {
  const text = fs.readFileSync(file, "utf8");
  assert.equal(/route-candidate-pool/u.test(text), false, `${file} must not read Candidate Pool outside Planner sidecar phases`);
}

const realCandidateAfter = fileState(realCandidatePath);
assert.deepEqual(realCandidateAfter, realCandidateBefore, "verification must not create or modify the real candidate cache");
const acceptedAfter = fileState(realAcceptedPath);
assert.deepEqual(acceptedAfter, acceptedBefore, "verification must not read-write or modify accepted repository");

console.log(JSON.stringify({
  status: "PASS",
  tempRoot,
  validCandidateAccepted: true,
  invalidCandidateRejected: true,
  candidateIdStable: true,
  sameIntentCandidates: enabledStore.listByIntent(candidate.intentId).length,
  jsonlLines: lines.length,
  writeFailureDegraded: true,
  flagOffCreatedStorage: fs.existsSync(disabledPath),
  realCandidateCacheChanged: false,
  acceptedRepositoryChanged: false,
}, null, 2));
