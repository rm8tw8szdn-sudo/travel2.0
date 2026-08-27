import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { calculateImageDebtReportData, comma, mb } from "./lib/image-debt-report-data.mjs";
import { runImageDebtFinalReportMutationFixtures, verifyImageDebtFinalReport } from "./lib/image-debt-report-consistency.mjs";
import { auditImageProvenance } from "./lib/image-provenance-license.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ALLOWED_FAILURE_REASONS = new Set([
  "NO_EXACT_IMAGE", "LICENSE_UNVERIFIED", "ENTITY_AMBIGUOUS", "IMAGE_TOO_LOW_QUALITY",
  "ONLY_WATERMARKED_SOURCE", "ONLY_DUPLICATE_SOURCE", "SOURCE_UNAVAILABLE", "SIZE_QUALITY_CONFLICT",
  "LICENSE_METADATA_INCOMPLETE",
]);
const APPROVED_LICENSE = /^(?:CC0(?: |$)|CC BY(?:-SA)?(?: |$)|Public domain(?: |$)|Public Domain Mark(?: |$))/iu;
const json = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const stats = calculateImageDebtReportData({ root: ROOT });
const reportPath = process.env.ROUTE_V2_IMAGE_DEBT_REPORT_PATH || path.join(ROOT, "ROUTE_V2_IMAGE_DEBT_ELIMINATION_REPORT.md");
const report = fs.readFileSync(reportPath, "utf8").replaceAll("\r\n", "\n");

function verifyBindings({ inventory, provenance, audit, manifest }) {
  assert.equal(inventory.schemaVersion, "route-v2-image-debt-inventory-v1");
  assert.equal(inventory.startingNeedsBackfill, inventory.records.length);
  assert.equal(inventory.cityCount + inventory.corePoiCount, inventory.startingNeedsBackfill);
  assert.equal(Object.values(inventory.validation).every((value) => value === 0), true);
  assert.equal(new Set(inventory.records.map((record) => record.entityId)).size, inventory.records.length);
  const inventoryById = new Map(inventory.records.map((record) => [record.entityId, record]));
  const manifestRecords = [...manifest.cities, ...manifest.pois];
  const manifestById = new Map(manifestRecords.map((record) => [record.entityId, record]));
  const attemptsById = new Map(provenance.attempts.map((record) => [record.entityId, record]));
  const withdrawnById = new Map((provenance.withdrawnAssets || []).map((record) => [record.entityId, record]));
  const auditById = new Map(audit.decisions.map((record) => [record.entityId, record]));
  assert.equal(provenance.attempts.length, inventory.records.length);
  assert.equal(attemptsById.size, provenance.attempts.length);
  assert.equal(provenance.assetCount, provenance.assets.length);
  assert.equal(provenance.cityAssetCount + provenance.poiAssetCount, provenance.assets.length);
  assert.equal(audit.totalReviewed, audit.decisions.length);
  assert.equal(audit.passed + audit.rejected, audit.totalReviewed);
  assert.equal(auditById.size, audit.decisions.length);
  assert.equal(manifest.schemaVersion, "route-v2-image-coverage-v2");
  assert.equal(manifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);
  assert.doesNotMatch(manifest.fallbackPolicy.city, /^https?:/iu);
  assert.doesNotMatch(manifest.fallbackPolicy.poi, /^https?:/iu);
  assert.deepEqual(manifest.invalidMappings, []);

  for (const asset of provenance.assets) {
    const frozen = inventoryById.get(asset.entityId);
    const destination = manifestById.get(asset.entityId);
    const decision = auditById.get(asset.entityId);
    assert(frozen, `unfrozen dedicated entity:${asset.entityId}`);
    assert(destination, `dedicated manifest entity missing:${asset.entityId}`);
    assert(decision, `visual audit missing:${asset.entityId}`);
    assert.equal(asset.wikidataId, frozen.qid);
    assert.equal(asset.entityType, frozen.entityType);
    assert.equal(asset.countryCode, frozen.countryCode);
    assert.equal(asset.parentCityEntityId || null, frozen.parentCityEntityId || null);
    assert.equal(asset.status, "imageReady");
    assert.equal(asset.needsBackfill, false);
    assert.equal(asset.visualAuditStatus, "passed");
    assert.equal(asset.visualAuditId, decision.auditId);
    assert.equal(asset.usageStatus, "approved-local-runtime");
    assert.equal(auditImageProvenance(asset).valid, true, `provenance-incomplete:${asset.entityId}`);
    assert.equal(asset.verificationStatus, "verified-exact-entity-source-license-size-and-visual-audit");
    assert.match(asset.semanticProof, /^(?:wikidata-exact-entity-p18|commons-structured-data-exact-p180|commons-structured-data-exact-entity-p180|wikipedia-qid-linked-lead-image|commons-qid-linked-category-city-representative|commons-qid-linked-category-exact-poi)$/u);
    assert.match(asset.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
    assert.match(asset.license, APPROVED_LICENSE);
    assert.equal(asset.rights?.sourceUrl, asset.sourceUrl);
    assert.equal(asset.rights?.license, asset.license);
    assert.equal(asset.rights?.externalCopyrightMaterial, true);
    assert.equal(asset.format, "webp");
    assert(asset.width >= 640 && asset.height >= 360, `${asset.entityId}:source-derived output dimensions too small`);
    assert(asset.bytes > 0 && asset.bytes <= 300_000, `${asset.entityId}:new asset size budget`);
    assert.match(asset.sourceHash, /^[0-9a-f]{64}$/u);
    assert.match(asset.processedHash, /^[0-9a-f]{64}$/u);
    assert.match(asset.perceptualHash, /^[0-9a-f]{16}$/u);
    assert.equal(decision.status, "passed");
    assert.equal(Object.values(decision.checks).every(Boolean), true);
    assert.equal(decision.qid, asset.wikidataId);
    assert.equal(decision.assetPath, asset.assetPath);
    assert.equal(decision.processedHash, asset.processedHash);
    assert.equal(destination.status, "imageReady");
    assert.equal(destination.needsBackfill, false);
    assert.equal(destination.assetPath, asset.assetPath);
    assert.equal(destination.wikidataId, asset.wikidataId);
    assert.equal(destination.countryCode, asset.countryCode);
    assert.equal(destination.parentCityEntityId || null, asset.parentCityEntityId || null);
    assert.equal(destination.processedHash, asset.processedHash);
    assert.equal(destination.sourcePath, "data/route-v2/images/image-debt-elimination-provenance.json");
    assert.equal(destination.semanticScope, asset.entityType === "City" ? "exact-city" : "exact-poi");
    assert.equal(destination.assetKind, "verified-destination-image");
    assert.equal(destination.verificationStatus, asset.verificationStatus);
    assert.equal(attemptsById.get(asset.entityId)?.status, "imageReady");
  }

  for (const frozen of inventory.records) {
    const attempt = attemptsById.get(frozen.entityId);
    const destination = manifestById.get(frozen.entityId);
    assert(attempt, `attempt missing:${frozen.entityId}`);
    assert(destination, `manifest record missing:${frozen.entityId}`);
    if (attempt.status === "imageReady") continue;
    assert.equal(attempt.status, "needsBackfill");
    assert(ALLOWED_FAILURE_REASONS.has(attempt.reasonCode), `unknown failure reason:${attempt.reasonCode}`);
    assert.equal(typeof attempt.reasonDetail, "string");
    assert(attempt.reasonDetail.trim().length > 0);
    assert.doesNotMatch(attempt.reasonDetail, /^(?:unknown|todo|misc|other)$/iu);
    assert.equal(destination.status, "placeholder");
    assert.equal(destination.needsBackfill, true);
    assert.equal(destination.isDedicated, false);
    assert.equal(destination.assetPath, frozen.entityType === "City" ? manifest.fallbackPolicy.city : manifest.fallbackPolicy.poi);
    if (attempt.visualAuditId) {
      const decision = auditById.get(frozen.entityId);
      assert(decision, `visual-audit-history-missing:${frozen.entityId}`);
      assert.equal(decision.auditId, attempt.visualAuditId);
      if (attempt.reasonCode === "LICENSE_METADATA_INCOMPLETE") {
        const withdrawn = withdrawnById.get(frozen.entityId);
        assert(withdrawn, `withdrawn-provenance-history-missing:${frozen.entityId}`);
        assert.equal(withdrawn.status, "withdrawn");
        assert.equal(withdrawn.withdrawalReason, "LICENSE_METADATA_INCOMPLETE");
        assert.equal(decision?.status, "passed", `withdrawn asset must retain its historical visual PASS:${frozen.entityId}`);
        assert.equal(fs.existsSync(path.join(ROOT, withdrawn.assetPath)), false, `withdrawn incomplete asset retained:${withdrawn.assetPath}`);
      } else {
        assert.equal(decision?.status, "rejected");
        assert.equal(fs.existsSync(path.join(ROOT, decision.assetPath)), false, `rejected visual asset retained:${decision.assetPath}`);
      }
    }
  }
  assert.equal(provenance.assets.length + provenance.attempts.filter((record) => record.status === "needsBackfill").length, inventory.records.length);
  assert.equal(manifest.coverage.overall.needsBackfillCount, provenance.attempts.filter((record) => record.status === "needsBackfill").length);
}

verifyBindings({ inventory: stats.inventory, provenance: stats.provenance, audit: stats.visualAudit, manifest: stats.manifest });
assert.equal(stats.visualAudit.schemaVersion, "route-v2-image-debt-visual-audit-v2");
assert.equal(stats.recoveryInventory.schemaVersion, "route-v2-image-debt-recovery-inventory-v1");
assert.equal(stats.recoveryResults.schemaVersion, "route-v2-image-debt-multi-source-recovery-v1");
assert.equal(stats.recovery.startingDebt, 119);
assert.equal(stats.recovery.attempted, 119);
assert.equal(stats.recovery.successful.length + stats.recovery.remaining.length, 119);
assert.equal(stats.recovery.citySuccessful + stats.recovery.cityRemaining, 82);
assert.equal(stats.recovery.poiSuccessful + stats.recovery.poiRemaining, 37);
assert.equal(stats.recovery.provenanceComplete, stats.recovery.successful.length);
assert.equal(stats.recovery.licenseComplete, stats.recovery.successful.length);
assert.equal(stats.visualAudit.secondRoundActivePassed, stats.recovery.successful.length);
assert(stats.visualAudit.secondRoundRejectedCandidateCount > 0);
for (const record of stats.recoveryResults.records) {
  const paths = new Set(record.independentSourcePathsAttempted);
  assert(paths.has("wikidata-p18"), `recovery-path-wikidata-missing:${record.entityId}`);
  assert(paths.has("commons-structured-depicts"), `recovery-path-depicts-missing:${record.entityId}`);
  assert(paths.has("wikipedia-multilingual"), `recovery-path-wikipedia-missing:${record.entityId}`);
  assert(paths.has("official-source"), `recovery-path-official-missing:${record.entityId}`);
  assert(paths.has("openverse"), `recovery-path-openverse-missing:${record.entityId}`);
  assert(paths.size >= 5, `recovery-path-count:${record.entityId}`);
  assert(record.sourceAttempts.length >= paths.size, `recovery-attempt-log-incomplete:${record.entityId}`);
  if (record.finalStatus === "needsBackfill") {
    assert(record.finalFailureReason?.reasonCode && record.finalFailureReason?.reasonDetail, `recovery-final-reason-missing:${record.entityId}`);
    assert(paths.size >= 5, `recovery-remaining-not-exhaustive:${record.entityId}`);
  }
  for (const rejection of record.visualRejections || []) {
    assert.match(rejection.processedHash, /^[0-9a-f]{64}$/u);
    assert(rejection.candidateFile && rejection.reasonCode && rejection.reasonDetail);
    assert.notEqual(record.chosenCandidate?.processedHash, rejection.processedHash);
  }
}
for (const asset of stats.successful) {
  const bytes = fs.readFileSync(path.join(ROOT, asset.assetPath));
  assert.equal(bytes.length, asset.bytes);
  assert.equal(sha256(bytes), asset.processedHash);
  const baseline = stats.imageBaseline.inventory.find((record) => record.path === asset.assetPath);
  assert(baseline, `image baseline missing:${asset.assetPath}`);
  assert.equal(baseline.bytes, asset.bytes);
  assert.equal(baseline.sha256, asset.processedHash);
}
assert.equal(stats.successful.length + (stats.provenance.withdrawnAssets?.length || 0), stats.visualAudit.passed);
assert.equal(stats.remaining.length, stats.final.needsBackfill);
assert.equal(stats.exactDuplicatePairs.length, 0);
assert.equal(stats.perceptualDuplicatePairs.length, 0);
assert.equal(stats.largerThan300Kb, 0);
assert.equal(stats.largerThan500Kb, 0);
assert.equal(stats.provenanceComplete, stats.successful.length);
assert.equal(stats.licenseComplete, stats.successful.length);
assert.equal(stats.provenanceRepairAudit.after.provenanceComplete, stats.successful.length);
assert.equal(stats.provenanceRepairAudit.after.licenseUrlComplete, stats.successful.length);
assert.equal(stats.provenanceRepairAudit.after.creatorCompleteWhereRequired, stats.provenanceRepairAudit.after.attributionRequired);
assert.equal(stats.provenanceRepairAudit.after.attributionCompleteWhereRequired, stats.provenanceRepairAudit.after.attributionRequired);
assert.equal(stats.provenanceRepairAudit.mutationFixtures.killed, stats.provenanceRepairAudit.mutationFixtures.total);
assert.equal(stats.imageBaseline.references.blockingMissingLocalAssets.length, 0);
assert.equal(stats.imageBaseline.references.externalImageReferences.filter((record) => record.kind === "production").length, 0);
assert.equal(stats.imageBaseline.git.hardLimitViolations.length, 0);
assert.equal(stats.imageBaseline.git.sizePolicyViolations.length, 0);
assert.equal(stats.browserAcceptance.schemaVersion, "route-v2-image-debt-browser-acceptance-v1");
assert.equal(stats.browserAcceptance.result, "PASS");
assert(stats.browserAcceptance.samples.countryDetails.length >= 8);
assert(stats.browserAcceptance.samples.cityDetails.length >= 5);
assert(stats.browserAcceptance.samples.routeSearches.length >= 2);
assert.equal(stats.browserAcceptance.assertions.dedicatedCityConsumed, true);
assert.equal(stats.browserAcceptance.assertions.dedicatedPoiConsumed, true);
assert.equal(stats.browserAcceptance.assertions.safePlaceholderForRemainingDebt, true);
assert.equal(stats.browserAcceptance.assertions.countryCoverUsedOnlyForCountrySemantics, true);
assert.equal(stats.browserAcceptance.assertions.routeTripFootprintIdentityStable, true);
assert.equal(stats.browserAcceptance.assertions.brokenImages, 0);
assert.equal(stats.browserAcceptance.assertions.wrongSemanticImages, 0);
assert.equal(stats.browserAcceptance.assertions.runtimeExternalImageRequests, 0);
assert.equal(stats.browserAcceptance.assertions.consoleErrors, 0);
assert.equal(stats.browserAcceptance.assertions.consoleWarnings, 0);
assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "route-v2-image-coverage.js"), "utf8"), /https?:\/\//u);
assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "route-v2-image-assets.js"), "utf8"), /(?:fetch\(|XMLHttpRequest)/u);
const imageAssetConsumerSource = fs.readFileSync(path.join(ROOT, "route-v2-image-assets.js"), "utf8");
assert.match(imageAssetConsumerSource, /RouteV2ImageCoverage\?\.poiByEntityId\?\.\[entityId\]/u);
assert.match(imageAssetConsumerSource, /coverage\.semanticScope === "exact-poi"/u);

function requireReport(source) {
  const tokens = [
    `Starting needsBackfill: ${stats.starting.needsBackfill}`,
    `Attempted: ${stats.attempted}`,
    `Successful dedicated conversions: ${stats.successful.length}`,
    `City conversions: ${stats.citySucceeded}`,
    `Core POI conversions: ${stats.poiSucceeded}`,
    `Images before: ${stats.starting.assets}`,
    `Images after: ${stats.final.assets}`,
    `Phase dedicated bytes: ${stats.newBytes} (${mb(stats.newBytes)} MB)`,
    `Average new dedicated bytes: ${comma(stats.averageBytes)}`,
    `Median new dedicated bytes: ${comma(stats.medianBytes)}`,
    `p95 new dedicated bytes: ${comma(stats.p95Bytes)}`,
    `New exact duplicate pairs: ${stats.exactDuplicatePairs.length}`,
    `New perceptual duplicate pairs (dHash distance <=5): ${stats.perceptualDuplicatePairs.length}`,
    `Provenance complete: ${stats.provenanceComplete}/${stats.successful.length}`,
    `License complete: ${stats.licenseComplete}/${stats.successful.length}`,
    `Strict initial provenance completeness: ${stats.provenanceRepairAudit.before.strict.provenanceComplete}/${stats.provenanceRepairAudit.before.verifiedDedicated} (${stats.provenanceRepairAudit.before.strict.completenessPercent}%)`,
    `Dedicated withdrawals: ${stats.provenanceRepairAudit.repair.withdrawn}`,
    `Final licenseUrl completeness: ${stats.provenanceRepairAudit.after.licenseUrlComplete}/${stats.provenanceRepairAudit.after.verifiedDedicated}`,
    `Creator completeness where attribution required: ${stats.provenanceRepairAudit.after.creatorCompleteWhereRequired}/${stats.provenanceRepairAudit.after.attributionRequired}`,
    `Attribution completeness where required: ${stats.provenanceRepairAudit.after.attributionCompleteWhereRequired}/${stats.provenanceRepairAudit.after.attributionRequired}`,
    `Negative provenance fixtures killed: ${stats.provenanceRepairAudit.mutationFixtures.killed}/${stats.provenanceRepairAudit.mutationFixtures.total}`,
    `Browser result: ${stats.browserAcceptance.result}`,
    `Dedicated POI consumed: ${stats.browserAcceptance.assertions.dedicatedPoiConsumed}`,
    `Runtime external image requests: ${stats.browserAcceptance.assertions.runtimeExternalImageRequests}`,
    `Starting debt = ${stats.recovery.startingDebt}`,
    `Attempted = ${stats.recovery.attempted}`,
    `Successful recovery = ${stats.recovery.successful.length}`,
    `City recovery = ${stats.recovery.citySuccessful}`,
    `Core POI recovery = ${stats.recovery.poiSuccessful}`,
    `Intermediate debt after multi-source recovery = ${stats.recovery.remaining.length}`,
    `Intermediate remaining City = ${stats.recovery.cityRemaining}`,
    `Intermediate remaining Core POI = ${stats.recovery.poiRemaining}`,
    `Average attempts/entity = ${stats.recovery.averageAttemptsPerEntity}`,
    `Second-round image bytes = ${stats.recovery.bytes} (${mb(stats.recovery.bytes)} MB)`,
  ];
  for (const token of tokens) assert(source.includes(token), `image-debt-report-missing-or-stale:${token}`);
  for (const reason of stats.failureReasons) assert(source.includes(`| ${reason.reasonCode} | ${reason.count} |`), `image-debt-report-reason-stale:${reason.reasonCode}`);
  for (const record of stats.remaining) assert(source.includes(`| ${record.countryCode} | ${record.entityType} | ${record.canonicalNameEn} | ${record.qid} | ${record.entityId} | ${record.reasonCode} |`), `image-debt-report-debt-missing:${record.entityId}`);
}
requireReport(report);
const finalReportSummary = verifyImageDebtFinalReport({ source: report, stats });
const reportConsistencyMutations = runImageDebtFinalReportMutationFixtures({ source: report, stats });
for (const record of stats.recovery.remaining) {
  assert(report.includes(`### ${record.canonicalNameEn} (${record.qid}, ${record.countryCode})`), `recovery-report-remaining-attempts-missing:${record.entityId}`);
  for (const sourcePath of record.independentSourcePathsAttempted) assert(report.includes(`${sourcePath} —`), `recovery-report-path-missing:${record.entityId}:${sourcePath}`);
}
assert(report.includes(stats.final.needsBackfill <= 10
  ? "IMAGE DEBT ELIMINATION READY FOR FINAL REVIEW — TARGET ACHIEVED"
  : "IMAGE DEBT ELIMINATION READY FOR FINAL REVIEW — EXHAUSTIVE MULTI-SOURCE SEARCH COMPLETE"));

const mutations = [
  // Production binding mutations.
  (documents) => { documents.provenance.assets.pop(); },
  (documents) => { documents.manifest.cities.find((record) => record.sourcePath === "data/route-v2/images/image-debt-elimination-provenance.json").status = "placeholder"; },
  (documents) => { documents.provenance.assets[0].wikidataId = "Q1"; },
  (documents) => { documents.manifest.fallbackPolicy.city = "https://example.com/random.jpg"; },
  (documents) => { documents.provenance.assets[0].bytes = 300_001; },
];
for (const mutate of mutations) {
  const documents = {
    inventory: structuredClone(stats.inventory),
    provenance: structuredClone(stats.provenance),
    audit: structuredClone(stats.visualAudit),
    manifest: structuredClone(stats.manifest),
  };
  mutate(documents);
  assert.throws(() => verifyBindings(documents), /./u);
}

const recoveryMutations = [
  (document) => { document.records[0].independentSourcePathsAttempted = ["wikidata-p18"]; },
  (document) => { const record = document.records.find((entry) => entry.visualRejections?.length); record.visualRejections[0].processedHash = record.chosenCandidate.processedHash; },
];
function verifyRecoveryMutation(document) {
  for (const record of document.records) {
    const paths = new Set(record.independentSourcePathsAttempted);
    assert(paths.size >= 5);
    for (const rejection of record.visualRejections || []) assert.notEqual(record.chosenCandidate?.processedHash, rejection.processedHash);
  }
}
for (const mutate of recoveryMutations) {
  const document = structuredClone(stats.recoveryResults);
  mutate(document);
  assert.throws(() => verifyRecoveryMutation(document), /./u);
}

console.log(JSON.stringify({
  verifier: "route-v2-image-debt-elimination",
  status: "PASS",
  startingNeedsBackfill: stats.starting.needsBackfill,
  attempted: stats.attempted,
  successful: stats.successful.length,
  citySuccessful: stats.citySucceeded,
  poiSuccessful: stats.poiSucceeded,
  remainingNeedsBackfill: stats.final.needsBackfill,
  visualAudit: { pages: stats.visualAudit.contactSheetPagesReviewed, passed: stats.visualAudit.passed, rejected: stats.visualAudit.rejected },
  newBytes: stats.newBytes,
  exactDuplicates: stats.exactDuplicatePairs.length,
  perceptualDuplicates: stats.perceptualDuplicatePairs.length,
  mutationCasesKilled: mutations.length + recoveryMutations.length,
  finalReportSummary,
  reportConsistencyMutations,
  invalidMappings: stats.final.invalidMappings,
  runtimeExternalImages: 0,
}, null, 2));
