import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assertStatesUnchanged, fileState, statesFor } from "./lib/route-v2-test-file-state.mjs";
import { auditRouteKnowledgeRepository } from "./audit-route-knowledge-repository.mjs";
import {
  classifyKnowledgeEntitySource,
  collectLocalEvidenceBundle,
  createAcceptedRouteRepository,
  createDecisionTraceId,
  createEvidenceBundleId,
  createRouteCandidateId,
  buildRouteCandidatesFromPool,
  candidateShapeKey,
  normalizeKnowledgeEntity,
  normalizeKnowledgeFact,
  normalizeKnowledgeRelationship,
  validateEvidenceBundle,
  validateKnowledgeEntity,
  validateKnowledgeFact,
  validateKnowledgeRelationship,
} from "../src/lib/routes/index.mjs";

const projectRoot = process.cwd();
const protectedFiles = [
  path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json"),
  path.resolve(projectRoot, ".route-v2-cache", "route-candidate-pool.jsonl"),
  path.resolve(projectRoot, ".route-v2-cache", "decision-traces.jsonl"),
  path.resolve(projectRoot, ".route-v2-cache", "route-evidence-bundles.jsonl"),
  path.resolve(projectRoot, "route-feed-bootstrap.js"),
];
const before = statesFor(protectedFiles);

assert.equal(classifyKnowledgeEntitySource({ wikidataId: "Q1490", name: "Tokyo", latitude: 1, longitude: 1 }), "wikidata");
assert.equal(classifyKnowledgeEntitySource({ wikidataId: "anchor:JP:tokyo", name: "Tokyo", latitude: 1, longitude: 1 }), "manual-anchor");
assert.equal(classifyKnowledgeEntitySource({ wikidataId: "coverage:JP:gateway", name: "Japan gateway", latitude: 1, longitude: 1 }), "coverage-placeholder");
assert.equal(classifyKnowledgeEntitySource({ wikidataId: "search-is-golden-circle", name: "Golden Circle", latitude: 1, longitude: 1 }), "search-fallback");
assert.equal(classifyKnowledgeEntitySource({ name: "Route record city", sourceRouteId: "route-1", latitude: 1, longitude: 1 }), "route-record-derived");
assert.equal(classifyKnowledgeEntitySource({ name: "Coordinate only", latitude: 1, longitude: 1 }), "unknown");

const trustedEntity = normalizeKnowledgeEntity({
  entityId: "Q1490",
  entityType: "city",
  canonicalName: "Tokyo",
  countryCode: "JP",
  coordinates: { latitude: 35.6762, longitude: 139.6503 },
  entitySourceType: "wikidata",
  provenance: { providerId: "wikidata" },
  confidence: 0.95,
});
assert.equal(validateKnowledgeEntity(trustedEntity).accepted, true, "trusted entity schema should accept a normalized Wikidata entity");
assert.equal(validateKnowledgeFact(normalizeKnowledgeFact({
  subjectEntityId: "Q1490",
  predicate: "belongsTo",
  object: "JP",
  source: { providerId: "wikidata" },
  confidence: 0.9,
  supportsWhichDecision: ["destination-inclusion"],
})).accepted, true, "fact schema should accept minimal provenance-bearing facts");
assert.equal(validateKnowledgeRelationship(normalizeKnowledgeRelationship({
  relationshipType: "belongsTo",
  subjectEntityId: "Q1490",
  objectEntityId: "Q17",
  confidence: 0.9,
})).accepted, true, "relationship schema should accept supported relationship types");

const kgPool = [
  { wikidataId: "Q1490", name: "Tokyo", countryCode: "JP", latitude: 35.6762, longitude: 139.6503, entityTypeName: "city" },
  { wikidataId: "Q34600", name: "Kyoto", countryCode: "JP", latitude: 35.0116, longitude: 135.7681, entityTypeName: "city" },
  { wikidataId: "coverage:JP:gateway", name: "Japan gateway", countryCode: "JP", latitude: 35, longitude: 139, entityTypeName: "coverage-route-anchor" },
  { wikidataId: "search-is-golden-circle", name: "Golden Circle", countryCode: "IS", latitude: 64.2559, longitude: -20.4475, entityTypeName: "search-fallback-anchor" },
];

const candidates = buildRouteCandidatesFromPool({
  context: { intentId: "intent-knowledge-p0", countries: ["JP", "IS"], durationDays: 8, travelStyle: "classic-first-trip" },
  concept: { durationDays: 8, travelStyle: "classic-first-trip" },
  pool: kgPool,
  targetCount: 3,
  seed: "knowledge-p0",
});
assert(candidates.length > 0, "candidate builder should still produce candidates");
const candidateWithCoverage = candidates.find((candidate) => candidate.destinations.some((destination) => destination.entitySourceType === "coverage-placeholder"));
assert(candidateWithCoverage, "candidate should preserve coverage-placeholder source markers");
assert(candidateWithCoverage.destinations.some((destination) => destination.entitySourceType === "search-fallback"), "candidate should preserve search-fallback source markers");
assert(candidateWithCoverage.supportingSignals.some((signal) => signal.type === "entity-source-types"), "candidate should expose entity source type diagnostics");
assert.equal(new Set(candidates.map(candidateShapeKey)).size, candidates.length, "candidate shape keys should remain stable and unique");

const localBundle = collectLocalEvidenceBundle({
  candidate: {
    ...candidateWithCoverage,
    candidateId: "rc-knowledge-p0",
    proposedOrder: candidateWithCoverage.destinations.map((destination) => destination.id),
  },
  kgPool,
});
const validation = validateEvidenceBundle(localBundle);
assert.equal(validation.accepted, true, `P0 local bundle must remain schema-valid: ${validation.reasons.join(", ")}`);
const factIdentity = localBundle.items.filter((item) => item.evidenceCategory === "destination-identity");
const structureIdentity = localBundle.items.filter((item) => item.evidenceCategory === "destination-identity-structure");
assert(factIdentity.some((item) => item.extractedFacts.wikidataId === "Q1490" || item.extractedFacts.wikidataId === "Q34600"), "QID entity should still produce fact-verified identity");
assert(structureIdentity.some((item) => item.extractedFacts.entitySourceType === "coverage-placeholder"), "coverage entity should only produce structure identity evidence");
assert(structureIdentity.some((item) => item.extractedFacts.entitySourceType === "search-fallback"), "search fallback should only produce structure identity evidence");
assert(localBundle.unknowns.some((item) => /entity-source-not-fact-verified:coverage-placeholder/u.test(item.reason)), "coverage fact identity should remain unknown");
assert(localBundle.unknowns.some((item) => /entity-source-not-fact-verified:search-fallback/u.test(item.reason)), "search fallback fact identity should remain unknown");

const audit = auditRouteKnowledgeRepository();
assert.equal(audit.acceptedRoutes.total, 5500, "accepted route count baseline changed");
assert.equal(audit.knowledgeGraph.total, 348, "KG pool entity count baseline changed");
assert.equal(audit.knowledgeGraph.byEntitySourceType.wikidata, 315, "KG Wikidata source classification baseline changed");
assert.equal(audit.knowledgeGraph.byEntitySourceType["manual-anchor"], 32, "KG manual-anchor source classification baseline changed");
assert.equal(audit.knowledgeGraph.qid, 320, "KG QID identifier count baseline changed");
assert.equal(audit.knowledgeGraph.anchor, 27, "KG anchor identifier count baseline changed");
assert.equal(audit.acceptedDestinationEntities.byEntitySourceType["route-record-derived"], 21913, "accepted derived destination isolation baseline changed");
assert.equal(audit.acceptedDestinationEntities.coverage, 18356, "accepted coverage placeholder count baseline changed");
assert.equal(audit.legacyEvidence.routeRecordDerived, 2550, "legacy route-record-derived evidence baseline changed");
assert.equal(audit.legacyEvidence.missingCandidateId, 2865, "legacy evidence candidateId baseline changed");
assert.equal(audit.legacyEvidence.missingSupportsWhichDecision, 2865, "legacy evidence supportsWhichDecision baseline changed");
assert(audit.acceptedRoutes.kgMissingCountries.length > 150, "KG missing country baseline should expose broad coverage gaps");

const acceptedCopyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-knowledge-p0-")), "accepted-routes-copy.json");
fs.copyFileSync(path.resolve(projectRoot, ".route-v2-cache", "accepted-routes.json"), acceptedCopyPath);
const repository = createAcceptedRouteRepository({ storagePath: acceptedCopyPath });
const feedCounts = {
  all: repository.list({ limit: 99999 }).total,
  cross: repository.list({ limit: 99999, routeType: "cross" }).total,
  single: repository.list({ limit: 99999, routeType: "single" }).total,
};
assert.deepEqual(feedCounts, { all: 851, cross: 357, single: 494 }, "FeedReadyPoolCount baseline changed");

const stableTraceId = createDecisionTraceId({
  routeId: "route-japan-8d",
  candidateId: "rc-5bd691815c0bfa25ad41",
  intentId: "intent-japan-8d-first-trip",
});
assert.equal(stableTraceId, "dt-3d1cfa5d81194500df25", "old traceId golden changed");

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
assert.equal(stableCandidateId, "rc-5bd691815c0bfa25ad41", "old candidateId golden changed");

const phase3b1Golden = createEvidenceBundleId(collectLocalEvidenceBundle({
  candidate: {
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
  },
  kgPool: [
    { wikidataId: "Q1490", id: "Q1490", countryCode: "JP", name: "Tokyo", entityTypeName: "city", latitude: 35.6762, longitude: 139.6503 },
    { wikidataId: "Q34600", id: "Q34600", countryCode: "JP", name: "Kyoto", entityTypeName: "heritage city", latitude: 35.0116, longitude: 135.7681 },
    { wikidataId: "Q35765", id: "Q35765", countryCode: "JP", name: "Osaka", entityTypeName: "food city", latitude: 34.6937, longitude: 135.5023 },
  ],
  now: () => "2026-01-01T00:00:00.000Z",
}));
assert.equal(phase3b1Golden, "eb-c1d89ba2875b67289c97", "Phase 3B-1 golden changed");

const forbiddenDiff = execFileSync("git", [
  "diff",
  "--name-only",
  "--",
  "src/lib/routes/route-composition-planner.mjs",
  "route-feed-bootstrap.js",
], { cwd: projectRoot, encoding: "utf8" }).trim();
assert.equal(forbiddenDiff, "", "Planner or route-feed-bootstrap changed during P0");

assertStatesUnchanged(before, statesFor(protectedFiles), "protected cache or repository files changed");

console.log(JSON.stringify({
  ok: true,
  audit: {
    acceptedRoutes: audit.acceptedRoutes.total,
    knowledgeGraphEntities: audit.knowledgeGraph.total,
    kgCountries: Object.keys(audit.knowledgeGraph.countryCoverage).length,
    acceptedCoveragePlaceholders: audit.acceptedDestinationEntities.coverage,
    legacyRouteRecordDerivedEvidence: audit.legacyEvidence.routeRecordDerived,
  },
  feedReadyPoolCount: feedCounts,
  phase3b1Golden,
  realNetworkCalls: 0,
  protectedFilesUnchanged: true,
}, null, 2));
