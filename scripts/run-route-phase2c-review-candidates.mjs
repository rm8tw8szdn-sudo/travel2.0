import fs from "node:fs";
import path from "node:path";
import {
  createEvidenceRepository,
  generateRoutePhase2cReviewCandidates,
} from "../src/lib/routes/index.mjs";

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  if (value) return value.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const limit = Number(arg("limit", "100"));
const storagePath = arg("evidence-storage", path.resolve("travel-collection", ".route-v2-cache", "route-evidence.json"));
const outputDir = arg("output-dir", path.resolve("output"));
const repository = createEvidenceRepository({ storagePath });
const report = generateRoutePhase2cReviewCandidates({ evidenceRepository: repository, limit });

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "route-phase2c-review-candidates.json");
const markdownPath = path.join(outputDir, "route-phase2c-review-candidates.md");
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(markdownPath, [
  "# Route Phase 2C Review Candidates",
  "",
  `Generated: ${report.generatedCount}/${report.requestedLimit}`,
  `Writes Accepted Repository: ${report.writesAcceptedRepository}`,
  "",
  ...report.records.map((record, index) => [
    `## ${index + 1}. ${record.title}`,
    `- status: ${record.candidateStatus}`,
    `- country: ${record.countries.join(" · ") || "missing"}`,
    `- destinations: ${record.destinations.join(" · ")}`,
    `- durationBand: ${record.durationBand || "missing"}`,
    `- recommendedDays: ${record.recommendedDays || "missing"}`,
    `- tripIntent: ${record.tripIntent?.intentType || "missing"} / ${record.tripIntent?.primaryMotivation || "missing"}`,
    `- travelStyle: ${record.travelStyle || "missing"}`,
    `- paceLevel: ${record.paceLevel || "missing"}`,
    `- whyThisDurationFits: ${record.whyThisDurationFits || "missing"}`,
    `- whyNotShorter: ${record.whyNotShorter || "missing"}`,
    `- whyNotLonger: ${record.whyNotLonger || "missing"}`,
    `- targetTraveler: ${record.targetTraveler || "missing"}`,
    `- whoShouldAvoid: ${record.whoShouldAvoid || "missing"}`,
    `- sourceFamilyId: ${record.sourceFamilyId}`,
    `- routeScope: ${record.routeScope?.type || ""} / ${record.routeScope?.label || ""}`,
    `- strategies: ${record.designStrategies.join(" · ")}`,
    `- destinationLevels: ${record.destinationLevels.map((item) => `${item.destination}:${item.level}`).join(" · ") || "missing"}`,
    `- segmentMetrics: ${record.segmentMetrics.map((item) => `${item.from}->${item.to}:${item.distanceKm ?? "?"}km`).join(" · ") || "missing"}`,
    `- regionCluster: ${record.regionCluster?.name || "missing"}`,
    `- imageReadiness: ${record.imageReadiness?.status || "missing"}`,
    `- corroborationCount: ${record.corroborationCount}`,
    `- rejectReasons: ${record.rejectReasons.join(" · ") || "none"}`,
    `- downgradeReasons: ${record.downgradeReasons.join(" · ") || "none"}`,
  ].join("\n")),
].join("\n"));

console.log(JSON.stringify({
  generatedCount: report.generatedCount,
  requestedLimit: report.requestedLimit,
  writesAcceptedRepository: report.writesAcceptedRepository,
  statusCounts: report.statusCounts,
  reviewSummary: {
    highQualityReviewable: report.reviewSummary.goodExamples.length,
    weakCandidate: report.reviewSummary.weakExamples.length,
    rejectedBeforeReview: report.reviewSummary.weirdBadExamples.length,
    duplicateRisk: report.reviewSummary.duplicateRiskExamples.length,
  },
  shortageDiagnostics: report.shortageDiagnostics,
  output: { jsonPath, markdownPath },
}, null, 2));
