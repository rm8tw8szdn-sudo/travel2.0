const REQUIRED_EVIDENCE = [
  ["transport", "transport-connection"],
  ["segmentMetric", "segment-metric"],
  ["region", "region-cluster"],
  ["destinationLevel", "destination-level"],
  ["season", "destination-season"],
  ["theme", "theme-fit"],
  ["image", "destination-image"],
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function evidenceName(key, type) {
  return key === "image" ? "destination-image" : type;
}

function sourceProvider(item) {
  return text(item?.provenance?.providerId || item?.provider || "unknown");
}

function countBy(items, getKey) {
  return items.reduce((bucket, item) => {
    const key = getKey(item) || "unknown";
    bucket[key] = (bucket[key] || 0) + 1;
    return bucket;
  }, {});
}

function byType(items, type) {
  return items.filter((item) => item.evidenceType === type || item.kind === type);
}

function coverageFor(items, type) {
  const covered = byType(items, type).length;
  return { evidenceType: type, covered, missing: covered ? 0 : 1 };
}

function corroborationCoverage(items) {
  const covered = items.filter((item) => item.qualifiers?.corroborated === true).length;
  return { evidenceType: "corroboration", covered, missing: covered ? 0 : 1 };
}

function topMissingEvidence(coverage) {
  const priority = new Map([
    ["segment-metric", 0],
    ["transport-connection", 1],
    ["region-cluster", 2],
    ["destination-image", 3],
    ["corroboration", 4],
  ]);
  return Object.entries(coverage)
    .map(([key, value]) => ({
      evidence: evidenceName(key, value.evidenceType),
      covered: value.covered,
      missing: value.missing,
    }))
    .filter((item) => item.missing > 0)
    .sort((left, right) => (
      right.missing - left.missing
      || (priority.get(left.evidence) ?? 20) - (priority.get(right.evidence) ?? 20)
      || left.evidence.localeCompare(right.evidence)
    ));
}

export function createEvidenceCoverageReport({ evidenceRepository } = {}) {
  const evidence = evidenceRepository?.list?.({ status: "verified" }) || [];
  const coverage = {};
  for (const [key, type] of REQUIRED_EVIDENCE) {
    coverage[key] = coverageFor(evidence, type);
  }
  coverage.corroboration = corroborationCoverage(evidence);
  const missing = topMissingEvidence(coverage);
  return {
    totalEvidence: evidence.length,
    coverage,
    sourceDistribution: countBy(evidence, sourceProvider),
    evidenceTypeDistribution: countBy(evidence, (item) => item.evidenceType),
    extractionMethodDistribution: countBy(evidence, (item) => item.provenance?.extractionMethod),
    topMissingEvidence: missing,
    gapReport: missing.map((item) => ({
      ...item,
      priority: item.evidence === "segment-metric" || item.evidence === "transport-connection" ? "high" : "normal",
    })),
  };
}
