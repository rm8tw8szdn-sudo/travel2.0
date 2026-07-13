import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEvidenceRepository,
  generateRoutePhase2cReviewCandidates,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-phase2c-review-gate-"));
const evidenceRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });
const sourceUrl = "https://en.wikivoyage.org/wiki/Test_route";

function evidence(input) {
  return {
    evidenceId: input.evidenceId,
    evidenceType: input.evidenceType,
    kind: input.evidenceType,
    subject: input.subject,
    object: input.object || {},
    relation: input.relation,
    value: input.value,
    qualifiers: input.qualifiers || {},
    provenance: {
      providerId: "Wikivoyage",
      sourceUrl,
      sourceTitle: "Test route",
      extractionMethod: "source-derived",
    },
    sourceRouteId: input.sourceRouteId || "wikivoyage-test-route",
    confidence: input.confidence ?? 0.8,
    verifiedAt: "2026-06-29T00:00:00.000Z",
    status: "verified",
    verified: true,
  };
}

[
  evidence({
    evidenceId: "country:jp:test",
    evidenceType: "place-entity",
    subject: { entityId: "Q17", name: "日本", countryCode: "JP" },
    relation: "is-place",
    value: "country",
  }),
  evidence({
    evidenceId: "level:kyoto:test",
    evidenceType: "destination-level",
    subject: { entityId: "Q34600", name: "京都" },
    relation: "has-destination-level",
    value: "city",
  }),
  evidence({
    evidenceId: "level:osaka:test",
    evidenceType: "destination-level",
    subject: { entityId: "Q35765", name: "大阪" },
    relation: "has-destination-level",
    value: "city",
  }),
  evidence({
    evidenceId: "level:nara:test",
    evidenceType: "destination-level",
    subject: { entityId: "Q169134", name: "奈良" },
    relation: "has-destination-level",
    value: "city",
  }),
  evidence({
    evidenceId: "segment:kyoto-osaka:test",
    evidenceType: "transport-connection",
    subject: { entityId: "Q34600", name: "京都" },
    object: { entityId: "Q35765", name: "大阪" },
    relation: "connected-to",
    value: ["rail"],
  }),
  evidence({
    evidenceId: "metric:kyoto-osaka:test",
    evidenceType: "segment-metric",
    subject: { entityId: "Q34600", name: "京都" },
    object: { entityId: "Q35765", name: "大阪" },
    relation: "has-segment-metric",
    value: { distanceKm: 43, metricType: "straight-line" },
  }),
  evidence({
    evidenceId: "region:kansai:test",
    evidenceType: "region-cluster",
    subject: { entityId: "kansai", name: "关西" },
    relation: "groups-destinations",
    value: ["京都", "大阪", "奈良"],
  }),
  evidence({
    evidenceId: "season:kansai:test",
    evidenceType: "destination-season",
    subject: { entityId: "kansai", name: "关西" },
    relation: "has-season",
    value: ["3-5月", "10-11月"],
  }),
  evidence({
    evidenceId: "theme:kansai:test",
    evidenceType: "theme-fit",
    subject: { entityId: "kansai", name: "关西" },
    relation: "has-theme",
    value: "文化旅行",
  }),
  evidence({
    evidenceId: "image:kyoto:test",
    evidenceType: "destination-image",
    subject: { entityId: "Q34600", name: "京都" },
    relation: "has-destination-image",
    value: "kyoto.jpg",
  }),
].forEach((item) => assert.equal(evidenceRepository.upsert(item).accepted, true));

const report = generateRoutePhase2cReviewCandidates({ evidenceRepository, limit: 100 });
assert.equal(report.writesAcceptedRepository, false);
assert.equal(report.records.length, 1, "Route-level candidate generation should not split one source route into destination candidates");
assert.equal(report.records[0].candidateStatus, "weakCandidate", "corroboration=0 and partial images must not be marked ready");
assert.notEqual(report.records[0].candidateStatus, "accepted-ready");
assert(report.records[0].countries.includes("日本"));
assert.deepEqual(report.records[0].destinations, ["京都", "大阪", "奈良"]);
assert.equal(report.records[0].sourceFamilyId, "wikivoyage-test-route");
assert.equal(report.records[0].routeScope.type, "route-source");
assert.equal(report.records[0].destinationLevels.length, 3);
assert.equal(report.records[0].segmentMetrics.length, 1);
assert.equal(report.records[0].regionCluster.name, "关西");
assert.equal(report.records[0].imageReadiness.status, "partial");
assert.equal(report.records[0].corroborationCount, 0);
assert(report.records[0].downgradeReasons.includes("no-corroboration"));
assert.equal(report.records[0].durationBand, "4-6d");
assert.equal(report.records[0].recommendedDays, "5天");
assert.equal(report.records[0].travelStyle, "classic-first-trip");
assert.equal(report.records[0].paceLevel, "moderate");
assert.equal(report.records[0].tripIntent.intentType, "first-trip");
assert(report.records[0].whyThisDurationFits);
assert(report.records[0].whyNotShorter);
assert(report.records[0].whyNotLonger);
assert(report.records[0].targetTraveler);
assert(report.records[0].whoShouldAvoid);
assert.equal(report.records[0].routeConcept.durationBand, "4-6d");
assert(report.statusCounts.weakCandidate >= 1);

const hopperRepository = createEvidenceRepository({ storagePath: path.join(tempDir, "hopper-evidence.json") });
const hopperUrl = "https://en.wikivoyage.org/wiki/Central_Europe_fast_trip";
function hopperEvidence(input) {
  return {
    ...evidence(input),
    provenance: {
      providerId: "Wikivoyage",
      sourceUrl: hopperUrl,
      sourceTitle: "Central Europe fast trip",
      extractionMethod: "source-derived",
    },
    sourceRouteId: "wikivoyage-central-europe-fast-trip",
  };
}

[
  ["AT", "奥地利", "Q40", "维也纳", "Q1741"],
  ["HU", "匈牙利", "Q28", "布达佩斯", "Q1781"],
  ["CZ", "捷克", "Q213", "布拉格", "Q1085"],
  ["SK", "斯洛伐克", "Q214", "布拉迪斯拉发", "Q1780"],
].forEach(([countryCode, countryName, countryId, cityName, cityId]) => {
  assert.equal(hopperRepository.upsert(hopperEvidence({
    evidenceId: `country:${countryCode}:hopper`,
    evidenceType: "place-entity",
    subject: { entityId: countryId, name: countryName, countryCode },
    relation: "is-place",
    value: "country",
  })).accepted, true);
  assert.equal(hopperRepository.upsert(hopperEvidence({
    evidenceId: `level:${cityId}:hopper`,
    evidenceType: "destination-level",
    subject: { entityId: cityId, name: cityName },
    relation: "has-destination-level",
    value: "city",
  })).accepted, true);
  assert.equal(hopperRepository.upsert(hopperEvidence({
    evidenceId: `image:${cityId}:hopper`,
    evidenceType: "destination-image",
    subject: { entityId: cityId, name: cityName },
    relation: "has-destination-image",
    value: `${cityId}.jpg`,
  })).accepted, true);
});

[
  ["Q1741", "维也纳", "Q1780", "布拉迪斯拉发", 55],
  ["Q1780", "布拉迪斯拉发", "Q1781", "布达佩斯", 161],
  ["Q1781", "布达佩斯", "Q1085", "布拉格", 444],
].forEach(([fromId, fromName, toId, toName, distanceKm]) => {
  assert.equal(hopperRepository.upsert(hopperEvidence({
    evidenceId: `connection:${fromId}-${toId}:hopper`,
    evidenceType: "transport-connection",
    subject: { entityId: fromId, name: fromName },
    object: { entityId: toId, name: toName },
    relation: "connected-to",
    value: ["rail"],
    qualifiers: { corroborated: true },
  })).accepted, true);
  assert.equal(hopperRepository.upsert(hopperEvidence({
    evidenceId: `metric:${fromId}-${toId}:hopper`,
    evidenceType: "segment-metric",
    subject: { entityId: fromId, name: fromName },
    object: { entityId: toId, name: toName },
    relation: "has-segment-metric",
    value: { distanceKm, metricType: "straight-line" },
    qualifiers: { distanceKm, corroborated: true },
  })).accepted, true);
});

[
  ["theme:central-europe:hopper", "theme-fit", { entityId: "central-europe", name: "中欧" }, "城市文化"],
  ["season:central-europe:hopper", "destination-season", { entityId: "central-europe", name: "中欧" }, ["4-6月", "9-10月"]],
  ["region:central-europe:hopper", "region-cluster", { entityId: "central-europe", name: "中欧" }, ["维也纳", "布拉迪斯拉发", "布达佩斯", "布拉格"]],
].forEach(([evidenceId, evidenceType, subject, value]) => {
  assert.equal(hopperRepository.upsert(hopperEvidence({
    evidenceId,
    evidenceType,
    subject,
    relation: "supports-route-concept",
    value,
    qualifiers: { corroborated: true, memberNames: Array.isArray(value) ? value : [] },
  })).accepted, true);
});

const hopperReport = generateRoutePhase2cReviewCandidates({ evidenceRepository: hopperRepository, limit: 10 });
assert.equal(hopperReport.records.length, 1);
assert.equal(hopperReport.records[0].durationBand, "4-6d");
assert.equal(hopperReport.records[0].travelStyle, "country-hopper");
assert.equal(hopperReport.records[0].paceLevel, "intensive");
assert(hopperReport.records[0].targetTraveler.includes("打卡"));
assert(hopperReport.records[0].whoShouldAvoid.includes("慢游"));
assert(!hopperReport.records[0].rejectReasons.includes("too-many-countries-for-classic-first-trip"));

console.log("Route Phase 2C review gate verified.");
