import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEvidenceCoverageReport,
  createEvidenceRepository,
} from "../src/lib/routes/index.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-knowledge-coverage-"));
const repository = createEvidenceRepository({ storagePath: path.join(tempDir, "evidence.json") });
const sourceUrl = "https://en.wikivoyage.org/wiki/Test_route";

function evidence(input) {
  return {
    evidenceId: input.evidenceId,
    evidenceType: input.evidenceType,
    kind: input.kind || input.evidenceType,
    subject: input.subject,
    object: input.object || {},
    relation: input.relation || "supports",
    value: input.value,
    qualifiers: input.qualifiers || {},
    provenance: {
      providerId: input.providerId || "Wikivoyage",
      sourceUrl,
      sourceTitle: "Test route",
      sourceSnippet: input.sourceSnippet || "",
      extractionMethod: input.extractionMethod || "source-derived",
      retrievedAt: input.retrievedAt || "",
    },
    evidenceHash: input.evidenceHash || "",
    sourceRouteId: input.sourceRouteId || "test-route",
    confidence: input.confidence ?? 0.8,
    verifiedAt: "2026-06-29T00:00:00.000Z",
    status: "verified",
    verified: true,
  };
}

[
  evidence({
    evidenceId: "destination:kyoto",
    evidenceType: "place-entity",
    kind: "destination",
    subject: { entityId: "Q34600", name: "京都" },
    value: "destination",
  }),
  evidence({
    evidenceId: "destination:osaka",
    evidenceType: "place-entity",
    kind: "destination",
    subject: { entityId: "Q35765", name: "大阪" },
    value: "destination",
  }),
  evidence({
    evidenceId: "level:kyoto",
    evidenceType: "destination-level",
    subject: { entityId: "Q34600", name: "京都" },
    value: "city",
  }),
  evidence({
    evidenceId: "transport:kyoto-osaka",
    evidenceType: "transport-connection",
    subject: { entityId: "Q34600", name: "京都" },
    object: { entityId: "Q35765", name: "大阪" },
    value: ["rail"],
    qualifiers: { corroborated: true },
  }),
  evidence({
    evidenceId: "season:kansai",
    evidenceType: "destination-season",
    subject: { entityId: "kansai", name: "关西" },
    value: ["3-5月", "10-11月"],
  }),
  evidence({
    evidenceId: "theme:kansai",
    evidenceType: "theme-fit",
    subject: { entityId: "kansai", name: "关西" },
    value: "文化旅行",
  }),
].forEach((item) => assert.equal(repository.upsert(item).accepted, true));

const report = createEvidenceCoverageReport({ evidenceRepository: repository });
assert.equal(report.totalEvidence, 6);
assert.equal(report.coverage.transport.covered, 1);
assert.equal(report.coverage.segmentMetric.covered, 0);
assert.equal(report.coverage.destinationLevel.covered, 1);
assert.equal(report.coverage.image.covered, 0);
assert.equal(report.coverage.corroboration.covered, 1);
assert.equal(report.sourceDistribution.Wikivoyage, 6);
assert.equal(report.topMissingEvidence[0].evidence, "segment-metric");
assert(report.gapReport.some((item) => item.evidence === "destination-image"));

console.log("Route Knowledge Coverage Audit verified.");
