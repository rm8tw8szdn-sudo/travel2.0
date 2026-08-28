import assert from "node:assert/strict";

const FINAL_HEADING = "## FINAL STATE / FINAL BASELINE";

const FIELD_DEFINITIONS = Object.freeze([
  ["totalAssets", "Total assets", "count"],
  ["countryCovers", "Country Cover", "coverage", "countryTotal"],
  ["dedicatedCities", "Dedicated City", "coverage", "cityTotal"],
  ["dedicatedCorePois", "Dedicated Core POI", "coverage", "corePoiTotal"],
  ["needsBackfill", "Final needsBackfill", "count"],
  ["remainingCities", "Remaining City", "count"],
  ["remainingCorePois", "Remaining Core POI", "count"],
  ["initialSuccessfulDedicated", "Initial successful dedicated before provenance withdrawals", "count"],
  ["withdrawn", "Withdrawn due provenance failure", "count"],
  ["verifiedDedicated", "Verified dedicated added", "count"],
  ["provenanceComplete", "Final provenance completeness", "coverage", "provenanceTotal"],
  ["licenseComplete", "Final license completeness", "coverage", "licenseTotal"],
  ["licenseUrlComplete", "Final licenseUrl completeness", "coverage", "licenseUrlTotal"],
  ["creatorCompleteWhereRequired", "CC creator completeness", "coverage", "creatorRequired"],
  ["attributionCompleteWhereRequired", "CC attribution completeness", "coverage", "attributionRequired"],
  ["invalidMappings", "invalidMapping", "count"],
]);

const normalizeText = (value) => String(value || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");

function finalSectionRange(source) {
  const lines = normalizeText(source).split("\n");
  const headings = lines.reduce((indices, line, index) => {
    if (line.trim() === FINAL_HEADING) indices.push(index);
    return indices;
  }, []);
  assert.equal(headings.length, 1, `image-debt-final-summary-heading-count:${headings.length}`);
  const start = headings[0] + 1;
  const nextHeading = lines.findIndex((line, index) => index >= start && /^##\s+/u.test(line));
  return { lines, start, end: nextHeading === -1 ? lines.length : nextHeading };
}

export function buildImageDebtFinalSummary(stats) {
  const withdrawn = (stats.provenance.withdrawnAssets || []).length;
  return {
    totalAssets: stats.final.assets,
    countryCovers: stats.final.countryCovers,
    countryTotal: stats.final.countryTotal,
    dedicatedCities: stats.final.dedicatedCities,
    cityTotal: stats.final.cityTotal,
    dedicatedCorePois: stats.final.dedicatedPois,
    corePoiTotal: stats.final.poiTotal,
    needsBackfill: stats.final.needsBackfill,
    remainingCities: stats.cityRemaining,
    remainingCorePois: stats.poiRemaining,
    initialSuccessfulDedicated: stats.visualAudit.passed,
    withdrawn,
    verifiedDedicated: stats.successful.length,
    provenanceComplete: stats.provenanceComplete,
    provenanceTotal: stats.successful.length,
    licenseComplete: stats.licenseComplete,
    licenseTotal: stats.successful.length,
    licenseUrlComplete: stats.licenseUrlComplete,
    licenseUrlTotal: stats.successful.length,
    creatorCompleteWhereRequired: stats.creatorCompleteWhereRequired,
    creatorRequired: stats.attributionRequired,
    attributionCompleteWhereRequired: stats.attributionCompleteWhereRequired,
    attributionRequired: stats.attributionRequired,
    invalidMappings: stats.final.invalidMappings,
  };
}

export function renderImageDebtFinalSummary(stats) {
  const summary = buildImageDebtFinalSummary(stats);
  return `${FINAL_HEADING}

- Total assets: ${summary.totalAssets}
- Country Cover: ${summary.countryCovers}/${summary.countryTotal}
- Dedicated City: ${summary.dedicatedCities}/${summary.cityTotal}
- Dedicated Core POI: ${summary.dedicatedCorePois}/${summary.corePoiTotal}
- Final needsBackfill: ${summary.needsBackfill}
- Remaining City: ${summary.remainingCities}
- Remaining Core POI: ${summary.remainingCorePois}
- Initial successful dedicated before provenance withdrawals: ${summary.initialSuccessfulDedicated}
- Withdrawn due provenance failure: ${summary.withdrawn}
- Verified dedicated added: ${summary.verifiedDedicated}
- Final provenance completeness: ${summary.provenanceComplete}/${summary.provenanceTotal}
- Final license completeness: ${summary.licenseComplete}/${summary.licenseTotal}
- Final licenseUrl completeness: ${summary.licenseUrlComplete}/${summary.licenseUrlTotal}
- CC creator completeness: ${summary.creatorCompleteWhereRequired}/${summary.creatorRequired}
- CC attribution completeness: ${summary.attributionCompleteWhereRequired}/${summary.attributionRequired}
- invalidMapping: ${summary.invalidMappings}`;
}

export function parseImageDebtFinalSummary(source) {
  const { lines, start, end } = finalSectionRange(source);
  const sectionLines = lines.slice(start, end).filter((line) => line.trim().length > 0);
  const parsed = {};
  for (const [key, label, kind, totalKey] of FIELD_DEFINITIONS) {
    const matches = sectionLines.filter((line) => line.startsWith(`- ${label}:`));
    assert.equal(matches.length, 1, `image-debt-final-summary-field-count:${label}:${matches.length}`);
    const value = matches[0].slice(`- ${label}:`.length).trim();
    if (kind === "count") {
      assert.match(value, /^\d+$/u, `image-debt-final-summary-invalid-count:${label}`);
      parsed[key] = Number(value);
      continue;
    }
    const coverage = value.match(/^(\d+)\/(\d+)$/u);
    assert(coverage, `image-debt-final-summary-invalid-coverage:${label}`);
    parsed[key] = Number(coverage[1]);
    parsed[totalKey] = Number(coverage[2]);
  }
  assert.equal(sectionLines.length, FIELD_DEFINITIONS.length, "image-debt-final-summary-unrecognized-fields");
  return parsed;
}

export function verifyImageDebtFinalSummaryRelationships(summary) {
  assert.equal(summary.dedicatedCities + summary.remainingCities, summary.cityTotal, "image-debt-final-summary-city-balance");
  assert.equal(summary.dedicatedCorePois + summary.remainingCorePois, summary.corePoiTotal, "image-debt-final-summary-poi-balance");
  assert.equal(summary.remainingCities + summary.remainingCorePois, summary.needsBackfill, "image-debt-final-summary-debt-balance");
  assert.equal(summary.initialSuccessfulDedicated - summary.withdrawn, summary.verifiedDedicated, "image-debt-final-summary-withdrawal-balance");
  assert.equal(summary.provenanceComplete, summary.verifiedDedicated, "image-debt-final-summary-provenance-balance");
  assert.equal(summary.provenanceTotal, summary.verifiedDedicated, "image-debt-final-summary-provenance-total");
  assert.equal(summary.licenseComplete, summary.verifiedDedicated, "image-debt-final-summary-license-balance");
  assert.equal(summary.licenseTotal, summary.verifiedDedicated, "image-debt-final-summary-license-total");
  assert.equal(summary.licenseUrlComplete, summary.verifiedDedicated, "image-debt-final-summary-license-url-balance");
  assert.equal(summary.licenseUrlTotal, summary.verifiedDedicated, "image-debt-final-summary-license-url-total");
  assert.equal(summary.creatorCompleteWhereRequired, summary.creatorRequired, "image-debt-final-summary-creator-balance");
  assert.equal(summary.attributionCompleteWhereRequired, summary.attributionRequired, "image-debt-final-summary-attribution-balance");
}

export function verifyImageDebtFinalReport({ source, stats }) {
  const expected = buildImageDebtFinalSummary(stats);
  const actual = parseImageDebtFinalSummary(source);
  const audit = stats.provenanceRepairAudit;
  assert.equal(audit.repair.withdrawn, expected.withdrawn, "image-debt-final-summary-withdrawal-audit-mismatch");
  assert.equal(audit.after.verifiedDedicated, expected.verifiedDedicated, "image-debt-final-summary-verified-audit-mismatch");
  assert.equal(audit.after.provenanceComplete, expected.provenanceComplete, "image-debt-final-summary-provenance-audit-mismatch");
  assert.equal(audit.after.licenseComplete, expected.licenseComplete, "image-debt-final-summary-license-audit-mismatch");
  assert.equal(audit.after.licenseUrlComplete, expected.licenseUrlComplete, "image-debt-final-summary-license-url-audit-mismatch");
  assert.equal(audit.after.creatorCompleteWhereRequired, expected.creatorCompleteWhereRequired, "image-debt-final-summary-creator-audit-mismatch");
  assert.equal(audit.after.attributionCompleteWhereRequired, expected.attributionCompleteWhereRequired, "image-debt-final-summary-attribution-audit-mismatch");
  verifyImageDebtFinalSummaryRelationships(expected);
  verifyImageDebtFinalSummaryRelationships(actual);
  assert.deepEqual(actual, expected, "image-debt-final-summary-runtime-mismatch");
  return actual;
}

function mutateFinalField(source, label, replacementValue) {
  const { lines, start, end } = finalSectionRange(source);
  const indices = [];
  for (let index = start; index < end; index += 1) {
    if (lines[index].startsWith(`- ${label}:`)) indices.push(index);
  }
  assert.equal(indices.length, 1, `image-debt-final-summary-mutation-field-count:${label}:${indices.length}`);
  lines[indices[0]] = `- ${label}: ${replacementValue}`;
  return lines.join("\n");
}

export function runImageDebtFinalReportMutationFixtures({ source, stats }) {
  const expected = buildImageDebtFinalSummary(stats);
  const intermediateMarker = `- Intermediate debt after multi-source recovery = ${stats.recovery.remaining.length}`;
  assert(source.includes(intermediateMarker), "image-debt-intermediate-recovery-marker-missing");
  const withoutIntermediate = source.replace(/\n## INTERMEDIATE \/ PRE-PROVENANCE-REPAIR MULTI-SOURCE RECOVERY[\s\S]*?(?=\n## )/u, "");
  const cases = [
    { name: "final-needsBackfill-stale", shouldPass: false, source: mutateFinalField(withoutIntermediate, "Final needsBackfill", Math.max(0, expected.needsBackfill - 2)) },
    { name: "remaining-city-stale", shouldPass: false, source: mutateFinalField(source, "Remaining City", Math.max(0, expected.remainingCities - 1)) },
    { name: "remaining-core-poi-stale", shouldPass: false, source: mutateFinalField(source, "Remaining Core POI", Math.max(0, expected.remainingCorePois - 1)) },
    { name: "dedicated-city-stale", shouldPass: false, source: mutateFinalField(source, "Dedicated City", `${expected.dedicatedCities + 1}/${expected.cityTotal}`) },
    { name: "dedicated-core-poi-stale", shouldPass: false, source: mutateFinalField(source, "Dedicated Core POI", `${expected.dedicatedCorePois + 1}/${expected.corePoiTotal}`) },
    { name: "verified-dedicated-stale", shouldPass: false, source: mutateFinalField(source, "Verified dedicated added", expected.verifiedDedicated + expected.withdrawn) },
    { name: "intermediate-old-final-current", shouldPass: true, source },
    { name: "intermediate-old-final-stale", shouldPass: false, source: mutateFinalField(source, "Final needsBackfill", stats.recovery.remaining.length) },
    { name: "correct-total-wrong-split", shouldPass: false, source: mutateFinalField(mutateFinalField(source, "Remaining City", expected.remainingCities + 1), "Remaining Core POI", expected.remainingCorePois - 1) },
    { name: "correct-split-wrong-total", shouldPass: false, source: mutateFinalField(source, "Final needsBackfill", expected.needsBackfill + 1) },
  ];
  const results = cases.map((fixture) => {
    let passed = true;
    try {
      verifyImageDebtFinalReport({ source: fixture.source, stats });
    } catch {
      passed = false;
    }
    assert.equal(passed, fixture.shouldPass, `image-debt-report-mutation-unexpected:${fixture.name}`);
    return { name: fixture.name, expected: fixture.shouldPass ? "PASS" : "FAIL", actual: passed ? "PASS" : "FAIL" };
  });
  return {
    total: results.length,
    matchedExpectation: results.length,
    rejected: results.filter((record) => record.actual === "FAIL").length,
    accepted: results.filter((record) => record.actual === "PASS").length,
    results,
  };
}
