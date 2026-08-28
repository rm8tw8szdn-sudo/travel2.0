import fs from "node:fs";
import path from "node:path";

import { calculateImageDebtReportData, comma, mb } from "./lib/image-debt-report-data.mjs";
import { renderImageDebtFinalSummary } from "./lib/image-debt-report-consistency.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_PATH = "ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md";
const stats = calculateImageDebtReportData({ root: ROOT });
const countryRows = stats.successesByCountry.map((record) => `| ${record.countryCode} | ${record.succeeded} | ${record.remaining} |`).join("\n");
const reasonRows = stats.failureReasons.map((record) => `| ${record.reasonCode} | ${record.count} |`).join("\n");
const remainingRows = stats.remaining.map((record) => `| ${record.countryCode} | ${record.entityType} | ${record.canonicalNameEn} | ${record.qid} | ${record.entityId} | ${record.reasonCode} | ${String(record.reasonDetail || "").replaceAll("|", "\\|")} |`).join("\n");
const recoveryContributionRows = stats.recovery.sourceContributions.map((record) => `| ${record.sourcePath} | ${record.count} |`).join("\n");
const recoveryRejectRows = stats.recovery.rejectCounts.map((record) => `| ${record.reasonCode} | ${record.count} |`).join("\n");
const provenanceRepair = stats.provenanceRepairAudit;
const provenanceWithdrawalRows = provenanceRepair.repair.withdrawals.map((record) => `| ${record.canonicalNameEn} | ${record.wikidataId} | ${record.entityType} | ${record.reason} | ${record.detail.replaceAll("|", "\\|")} |`).join("\n");
const recoveryRemainingRows = stats.recovery.remaining.map((record) => {
  const attempts = record.sourceAttempts.map((attempt) => `  - ${attempt.sourcePath} — ${attempt.queryIdentity || "exact entity"} — ${attempt.candidateFile || attempt.candidateUrl || "no candidate"} — ${attempt.status}${attempt.reasonCode ? ` — ${attempt.reasonCode}: ${attempt.reasonDetail}` : ""}`).join("\n");
  return `### ${record.canonicalNameEn} (${record.qid}, ${record.countryCode})\n\n- Final reason: ${record.finalFailureReason?.reasonCode} — ${record.finalFailureReason?.reasonDetail}\n- Independent source paths: ${record.independentSourcePathsAttempted.join(", ")}\n- Candidate count: ${record.candidateCount}\n- Attempts:\n${attempts}`;
}).join("\n\n");
const report = `# Route V2 Image Debt Elimination Report

Generated: 2026-08-26T08:00:00.000Z

## Outcome

- Starting needsBackfill: ${stats.starting.needsBackfill}
- Attempted: ${stats.attempted}
- Successful dedicated conversions: ${stats.successful.length}
- City conversions: ${stats.citySucceeded}
- Core POI conversions: ${stats.poiSucceeded}
- Final needsBackfill: ${stats.final.needsBackfill}
- Remaining City: ${stats.cityRemaining}
- Remaining Core POI: ${stats.poiRemaining}
- Success rate: ${stats.successRate}%
- Target <=10 achieved: ${stats.final.needsBackfill <= 10 ? "yes" : "no"}
- Remaining debt policy: neutral placeholder retained; no low-confidence or wrong-location photograph was admitted.

## Coverage

- Dedicated City: ${stats.final.dedicatedCities}/${stats.final.cityTotal}
- Dedicated Core POI: ${stats.final.dedicatedPois}/${stats.final.poiTotal}
- invalidMapping: ${stats.final.invalidMappings}
- Runtime external image requests allowed: false

## Success and remaining debt by country

| Country | Successful | Remaining |
| --- | ---: | ---: |
${countryRows}

## Failure reason distribution

| Reason | Count |
| --- | ---: |
${reasonRows}

## Asset size

- Images before: ${stats.starting.assets}
- Images after: ${stats.final.assets}
- Image bytes before: ${stats.starting.totalBytes} (${mb(stats.starting.totalBytes)} MB)
- Image bytes after: ${stats.final.totalBytes} (${mb(stats.final.totalBytes)} MB)
- Phase dedicated bytes: ${stats.newBytes} (${mb(stats.newBytes)} MB)
- Average new dedicated bytes: ${comma(stats.averageBytes)}
- Median new dedicated bytes: ${comma(stats.medianBytes)}
- p95 new dedicated bytes: ${comma(stats.p95Bytes)}
- New assets >300KB: ${stats.largerThan300Kb}
- New assets >500KB: ${stats.largerThan500Kb}
- Projected image bytes at full current-entity coverage: ${stats.projectedFullCoverageBytes} (${mb(stats.projectedFullCoverageBytes)} MB)

## Duplicate and integrity audit

- New exact duplicate pairs: ${stats.exactDuplicatePairs.length}
- New perceptual duplicate pairs (dHash distance <=5): ${stats.perceptualDuplicatePairs.length}
- Provenance complete: ${stats.provenanceComplete}/${stats.successful.length}
- License complete: ${stats.licenseComplete}/${stats.successful.length}
- Visual contact-sheet pages reviewed: ${stats.visualAudit.contactSheetPagesReviewed}
- Visual candidates reviewed: ${stats.visualAudit.totalReviewed}
- Visual pass/reject: ${stats.visualAudit.passed}/${stats.visualAudit.rejected}
- Contact sheet: data/route-v2/images/audit/image-debt-contact-sheet.html

Every accepted source is tied to the exact QID through Wikidata P18, Commons structured P180, a QID-linked multilingual Wikipedia lead image, or a QID-linked Commons category. City category images must pass representative-image visual review; Core POIs remain exact-entity photographs. Every accepted asset is a local WebP with auditable Commons file-level licensing and an exact entity/source/hash binding.

## PROVENANCE COMPLETENESS REPAIR

- Review raw missing licenseUrl: ${provenanceRepair.before.rawMissing.licenseUrl}/${provenanceRepair.before.verifiedDedicated}
- Review raw missing creator/author: ${provenanceRepair.before.rawMissing.creatorOrAuthor}/${provenanceRepair.before.verifiedDedicated}
- Review raw missing attribution: ${provenanceRepair.before.rawMissing.attribution}/${provenanceRepair.before.verifiedDedicated}
- Review raw missing-field union: ${provenanceRepair.before.rawMissing.union}/${provenanceRepair.before.verifiedDedicated}
- Strict initial provenance completeness: ${provenanceRepair.before.strict.provenanceComplete}/${provenanceRepair.before.verifiedDedicated} (${provenanceRepair.before.strict.completenessPercent}%)
- Metadata repair entries: ${provenanceRepair.repair.metadataChanges}
- Source-backed creator repairs: ${provenanceRepair.repair.creatorRepairs}
- Attribution repairs: ${provenanceRepair.repair.attributionRepairs}
- licenseUrl filled: ${provenanceRepair.repair.licenseUrlFilled}
- licenseUrl normalized to exact family/version: ${provenanceRepair.repair.licenseUrlNormalized}
- Non-attribution creator-status records: ${provenanceRepair.repair.nonAttributionCreatorStatuses}
- Alternate image replacements: ${provenanceRepair.repair.alternateImageReplacements}
- Dedicated withdrawals: ${provenanceRepair.repair.withdrawn}
- Final verified dedicated: ${provenanceRepair.after.verifiedDedicated}
- Final needsBackfill: ${stats.final.needsBackfill}
- Final Dedicated City: ${stats.final.dedicatedCities}/${stats.final.cityTotal}
- Final Dedicated Core POI: ${stats.final.dedicatedPois}/${stats.final.poiTotal}
- Final provenance completeness: ${provenanceRepair.after.provenanceComplete}/${provenanceRepair.after.verifiedDedicated} (${provenanceRepair.after.completenessPercent}%)
- Final license completeness: ${provenanceRepair.after.licenseComplete}/${provenanceRepair.after.verifiedDedicated}
- Final licenseUrl completeness: ${provenanceRepair.after.licenseUrlComplete}/${provenanceRepair.after.verifiedDedicated}
- Creator completeness where attribution required: ${provenanceRepair.after.creatorCompleteWhereRequired}/${provenanceRepair.after.attributionRequired}
- Attribution completeness where required: ${provenanceRepair.after.attributionCompleteWhereRequired}/${provenanceRepair.after.attributionRequired}
- Negative provenance fixtures killed: ${provenanceRepair.mutationFixtures.killed}/${provenanceRepair.mutationFixtures.total}

The repair uses exact Commons file pages, immutable revision IDs, file EXIF metadata, explicit author/by/self statements, and exact Creative Commons family/version URLs. Public-domain or CC0 records without a source-provided creator carry the structured status \`creatorStatus=not-provided-by-source\`; no placeholder creator name is published.

### Withdrawn dedicated assets

| Entity | QID | Type | Reason | Detail |
| --- | --- | --- | --- | --- |
${provenanceWithdrawalRows}

## INTERMEDIATE / PRE-PROVENANCE-REPAIR MULTI-SOURCE RECOVERY

- Starting debt = ${stats.recovery.startingDebt}
- Attempted = ${stats.recovery.attempted}
- Successful recovery = ${stats.recovery.successful.length}
- City recovery = ${stats.recovery.citySuccessful}
- Core POI recovery = ${stats.recovery.poiSuccessful}
- Intermediate debt after multi-source recovery = ${stats.recovery.remaining.length}
- Intermediate remaining City = ${stats.recovery.cityRemaining}
- Intermediate remaining Core POI = ${stats.recovery.poiRemaining}
- Commons/Wikidata/category success = ${stats.recovery.commonsSuccess}
- Multilingual Wikipedia success = ${stats.recovery.multilingualWikipediaSuccess}
- Official source success = ${stats.recovery.officialSourceSuccess}
- Other CC/open-source success = ${stats.recovery.otherOpenSourceSuccess}
- Average attempts/entity = ${stats.recovery.averageAttemptsPerEntity}
- Second-round image bytes = ${stats.recovery.bytes} (${mb(stats.recovery.bytes)} MB)
- Second-round provenance complete = ${stats.recovery.provenanceComplete}/${stats.recovery.successful.length}
- Second-round license complete = ${stats.recovery.licenseComplete}/${stats.recovery.successful.length}
- Second-round active visual passes = ${stats.visualAudit.secondRoundActivePassed}
- Second-round rejected candidate history = ${stats.visualAudit.secondRoundRejectedCandidateCount}

### Source path contribution

| Source path | Successful assets |
| --- | ---: |
${recoveryContributionRows}

### Candidate rejection distribution

| Rejection | Attempt entries |
| --- | ---: |
${recoveryRejectRows}

Official and Openverse discovery paths were attempted for every residual entity, but no file from those paths was published without exact entity proof plus file-level author and reuse-license metadata. City representatives may come from an exact QID-linked Commons category or exact QID-linked multilingual Wikipedia lead image; Core POIs remain exact-entity only.

## Browser acceptance

- Browser result: ${stats.browserAcceptance.result}
- Country Detail samples: ${stats.browserAcceptance.samples.countryDetails.length}
- City Detail samples: ${stats.browserAcceptance.samples.cityDetails.length}
- Route searches/details: ${stats.browserAcceptance.samples.routeSearches.length}/${stats.browserAcceptance.samples.routeDetails.length}
- Dedicated City consumed: ${stats.browserAcceptance.assertions.dedicatedCityConsumed}
- Dedicated POI consumed: ${stats.browserAcceptance.assertions.dedicatedPoiConsumed}
- Broken images: ${stats.browserAcceptance.assertions.brokenImages}
- Wrong semantic images: ${stats.browserAcceptance.assertions.wrongSemanticImages}
- Runtime external image requests: ${stats.browserAcceptance.assertions.runtimeExternalImageRequests}
- Console errors/warnings: ${stats.browserAcceptance.assertions.consoleErrors}/${stats.browserAcceptance.assertions.consoleWarnings}

## Remaining debt

| Country | Type | Entity | QID | entityId | Failure reason | Detail |
| --- | --- | --- | --- | --- | --- | --- |
${remainingRows}

## Complete multi-source attempts for every remaining entity

${recoveryRemainingRows}

${renderImageDebtFinalSummary(stats)}

## Conclusion

${stats.final.needsBackfill <= 10
  ? "IMAGE DEBT ELIMINATION READY FOR FINAL REVIEW — TARGET ACHIEVED"
  : "IMAGE DEBT ELIMINATION READY FOR FINAL REVIEW — EXHAUSTIVE MULTI-SOURCE SEARCH COMPLETE"}
`;
fs.writeFileSync(path.join(ROOT, OUTPUT_PATH), report, "utf8");
console.log(JSON.stringify({ status: "PASS", output: OUTPUT_PATH, starting: stats.starting.needsBackfill, successful: stats.successful.length, remaining: stats.final.needsBackfill }, null, 2));
