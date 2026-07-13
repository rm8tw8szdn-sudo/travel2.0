import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAcceptedRouteRepository,
  createEvidenceRepository,
  createRouteCompositionPlanner,
  createRouteDesignStrategyRegistry,
} from "../src/lib/routes/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = createAcceptedRouteRepository({
  storagePath: process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "accepted-routes.json"),
});
const evidenceRepository = createEvidenceRepository({
  storagePath: process.env.ROUTE_EVIDENCE_REPOSITORY_PATH || path.join(root, ".route-v2-cache", "route-evidence.json"),
});
const limit = Number(process.env.ROUTE_AI_PRODUCTION_LIMIT || 3);

function distribution(values, key) {
  return values.reduce((bucket, item) => {
    const value = key(item);
    bucket[value] = (bucket[value] || 0) + 1;
    return bucket;
  }, {});
}

function repositoryRecords() {
  return repository.list({ limit: 100_000 }).records;
}

function segmentEvidence(record) {
  const destinations = record.destinationEntities || [];
  const segments = (record.provenance?.evidence || []).filter((item) => item.kind === "route-segment");
  return destinations.slice(0, -1).map((destination, index) => {
    const next = destinations[index + 1];
    const segment = segments.find((item) => {
      const from = item.fromEntityId || item.fromName;
      const to = item.toEntityId || item.toName;
      const left = destination.wikidataId || destination.name;
      const right = next.wikidataId || next.name;
      return (from === left && to === right) || (from === right && to === left);
    });
    return {
      from: destination.name,
      to: next.name,
      transportModes: segment?.transportModes || [],
      distanceKm: segment?.distanceKm ?? null,
      durationHours: segment?.durationHours ?? null,
      evidenceId: segment?.evidenceId || "",
      sourceUrl: segment?.sourceUrl || "",
    };
  });
}

const before = repository.status();
const beforeEvidence = evidenceRepository.status();
for (const record of repositoryRecords()) {
  evidenceRepository.ingestRouteRecord(record);
}
const strategyRegistry = createRouteDesignStrategyRegistry();
const planner = createRouteCompositionPlanner({ evidenceRepository, acceptedRepository: repository, strategyRegistry });
const result = await planner.buildCandidates({ limit });
const writes = [];
for (const candidate of result.accepted) {
  const write = repository.upsert(candidate.record);
  writes.push({
    routeId: candidate.record.id,
    title: candidate.record.name,
    accepted: write.accepted,
    merged: Boolean(write.merged),
    reasons: write.reasons || [],
    strategies: candidate.strategies,
    score: candidate.score,
    plannerReason: candidate.record.plannerReason,
    destinations: candidate.record.destinationEntities.map((item) => item.name),
    routeSegments: segmentEvidence(candidate.record),
  });
  if (write.accepted) evidenceRepository.ingestRouteRecord(write.record);
}

const acceptedWrites = writes.filter((item) => item.accepted);
const report = {
  startedAt: new Date().toISOString(),
  before,
  after: repository.status(),
  evidenceBefore: beforeEvidence,
  evidenceAfter: evidenceRepository.status(),
  acceptedCount: acceptedWrites.length,
  rejectedCount: result.rejected.length + writes.filter((item) => !item.accepted).length,
  strategyDistribution: distribution(acceptedWrites.flatMap((item) => item.strategies.map((strategy) => ({ strategy }))), (item) => item.strategy),
  scoreDistribution: acceptedWrites.map((item) => ({ routeId: item.routeId, score: item.score })),
  acceptedSamples: acceptedWrites.slice(0, 5),
  rejectedSamples: result.rejected.slice(0, 10).concat(writes.filter((item) => !item.accepted).map((item) => ({
    sourceRouteId: item.routeId,
    reason: item.reasons.join(",") || "repository-rejected",
  }))).slice(0, 10),
  poolDelta: {
    total: repository.status().total - before.total,
    single: repository.status().single - before.single,
    cross: repository.status().cross - before.cross,
  },
};

console.log(JSON.stringify(report, null, 2));
if (!acceptedWrites.length) process.exitCode = 1;
