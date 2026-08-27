import fs from "node:fs";
import path from "node:path";

import { auditImageProvenance, auditProvenanceCollection } from "./image-provenance-license.mjs";

const json = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const percentile = (values, fraction) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] : 0;
const hammingDistance = (left, right) => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
};

export function calculateImageDebtReportData({ root } = {}) {
  const projectRoot = path.resolve(root || path.join(import.meta.dirname, "..", ".."));
  const inventory = json(projectRoot, "data/route-v2/images/image-debt-inventory.json");
  const phaseBaseline = json(projectRoot, "data/route-v2/images/image-debt-phase-baseline.json");
  const provenance = json(projectRoot, "data/route-v2/images/image-debt-elimination-provenance.json");
  const visualAudit = json(projectRoot, "data/route-v2/images/image-debt-visual-audit.json");
  const waveResults = json(projectRoot, "data/route-v2/images/image-debt-wave-results.json");
  const manifest = json(projectRoot, "data/route-v2/images/image-coverage-manifest.json");
  const imageBaseline = json(projectRoot, "data/route-v2/images/image-asset-baseline.json");
  const browserAcceptance = json(projectRoot, "data/route-v2/images/image-debt-browser-acceptance.json");
  const recoveryInventory = json(projectRoot, "data/route-v2/images/image-debt-recovery-inventory.json");
  const recoveryResults = json(projectRoot, "data/route-v2/images/image-debt-recovery-results.json");
  const provenanceRepairAudit = json(projectRoot, "data/route-v2/images/image-debt-provenance-completeness-audit.json");
  const successful = provenance.assets.filter((record) => record.status === "imageReady" && record.visualAuditStatus === "passed");
  const remaining = provenance.attempts.filter((record) => record.status === "needsBackfill");
  const sizes = successful.map((record) => record.bytes);
  const successesByCountry = [...new Set(inventory.records.map((record) => record.countryCode))].sort().map((countryCode) => ({
    countryCode,
    succeeded: successful.filter((record) => record.countryCode === countryCode).length,
    remaining: remaining.filter((record) => record.countryCode === countryCode).length,
  }));
  const failureReasons = [...new Set(remaining.map((record) => record.reasonCode))].sort().map((reasonCode) => ({
    reasonCode,
    count: remaining.filter((record) => record.reasonCode === reasonCode).length,
  }));
  const exactDuplicatePairs = [];
  const perceptualDuplicatePairs = [];
  for (let index = 0; index < successful.length; index += 1) {
    for (let other = index + 1; other < successful.length; other += 1) {
      if (successful[index].processedHash === successful[other].processedHash) exactDuplicatePairs.push([successful[index].entityId, successful[other].entityId]);
      if (hammingDistance(successful[index].perceptualHash, successful[other].perceptualHash) <= 5) perceptualDuplicatePairs.push([successful[index].entityId, successful[other].entityId]);
    }
  }
  const provenanceAudit = auditProvenanceCollection(successful);
  const provenanceComplete = provenanceAudit.valid;
  const licenseComplete = successful.filter((record) => auditImageProvenance(record).valid).length;
  const licenseUrlComplete = successful.filter((record) => typeof record.licenseUrl === "string" && record.licenseUrl.trim().length > 0).length;
  const attributionRequiredRecords = successful.filter((record) => /^CC BY(?:-SA)?(?: |$)/iu.test(String(record.license || "")));
  const creatorCompleteWhereRequired = attributionRequiredRecords.filter((record) => String(record.creator || record.author || record.rights?.creator || "").trim().length > 0).length;
  const attributionCompleteWhereRequired = attributionRequiredRecords.filter((record) => String(record.attribution || record.rights?.attribution || "").trim().length > 0).length;
  const recoverySuccessful = successful.filter((record) => record.acquisitionRound === "multi-source-recovery");
  const recoveryRemaining = recoveryResults.records.filter((record) => record.finalStatus === "needsBackfill");
  const recoverySourceContributions = [...new Set(recoveryResults.records.map((record) => record.chosenCandidate?.sourcePath).filter(Boolean))].sort().map((sourcePath) => ({
    sourcePath,
    count: recoveryResults.records.filter((record) => record.chosenCandidate?.sourcePath === sourcePath).length,
  }));
  const recoveryRejectCounts = ["LICENSE_UNVERIFIED", "IMAGE_TOO_LOW_QUALITY", "NO_EXACT_IMAGE", "SOURCE_UNAVAILABLE", "ENTITY_AMBIGUOUS", "ONLY_DUPLICATE_SOURCE", "SIZE_QUALITY_CONFLICT"].map((reasonCode) => ({
    reasonCode,
    count: recoveryResults.records.flatMap((record) => record.sourceAttempts || []).filter((attempt) => attempt.reasonCode === reasonCode).length,
  }));
  const recoveryAttemptEntries = recoveryResults.records.reduce((sum, record) => sum + (record.sourceAttempts || []).length, 0);
  return {
    projectRoot, inventory, phaseBaseline, provenance, visualAudit, waveResults, manifest, imageBaseline, browserAcceptance, recoveryInventory, recoveryResults, provenanceRepairAudit,
    starting: phaseBaseline.images,
    final: {
      assets: imageBaseline.summary.totalImages,
      totalBytes: imageBaseline.summary.totalBytes,
      countryCovers: manifest.coverage.overall.countryCoverCoverage.ready,
      countryTotal: manifest.coverage.overall.countryCoverCoverage.total,
      dedicatedCities: manifest.coverage.overall.cityDedicatedImageCoverage.ready,
      cityTotal: manifest.coverage.overall.cityDedicatedImageCoverage.total,
      dedicatedPois: manifest.coverage.overall.corePoiImageCoverage.ready,
      poiTotal: manifest.coverage.overall.corePoiImageCoverage.total,
      needsBackfill: manifest.coverage.overall.needsBackfillCount,
      invalidMappings: manifest.invalidMappings.length,
    },
    attempted: provenance.attempts.length,
    successful,
    remaining,
    successesByCountry,
    failureReasons,
    citySucceeded: successful.filter((record) => record.entityType === "City").length,
    poiSucceeded: successful.filter((record) => record.entityType === "POI").length,
    cityRemaining: remaining.filter((record) => record.entityType === "City").length,
    poiRemaining: remaining.filter((record) => record.entityType === "POI").length,
    successRate: Number((successful.length / provenance.attempts.length * 100).toFixed(1)),
    newBytes: sizes.reduce((sum, value) => sum + value, 0),
    averageBytes: sizes.length ? Math.round(sizes.reduce((sum, value) => sum + value, 0) / sizes.length) : 0,
    medianBytes: percentile(sizes, 0.5),
    p95Bytes: percentile(sizes, 0.95),
    largerThan300Kb: sizes.filter((value) => value > 300_000).length,
    largerThan500Kb: sizes.filter((value) => value > 500_000).length,
    exactDuplicatePairs,
    perceptualDuplicatePairs,
    provenanceComplete,
    licenseComplete,
    licenseUrlComplete,
    attributionRequired: attributionRequiredRecords.length,
    creatorCompleteWhereRequired,
    attributionCompleteWhereRequired,
    provenanceAudit,
    projectedFullCoverageBytes: imageBaseline.summary.totalBytes + Math.round((sizes.length ? sizes.reduce((sum, value) => sum + value, 0) / sizes.length : 0) * remaining.length),
    recovery: {
      startingDebt: recoveryInventory.startingNeedsBackfill,
      attempted: recoveryResults.attempted,
      successful: recoverySuccessful,
      citySuccessful: recoverySuccessful.filter((record) => record.entityType === "City").length,
      poiSuccessful: recoverySuccessful.filter((record) => record.entityType === "POI").length,
      remaining: recoveryRemaining,
      cityRemaining: recoveryRemaining.filter((record) => record.entityType === "City").length,
      poiRemaining: recoveryRemaining.filter((record) => record.entityType === "POI").length,
      sourceContributions: recoverySourceContributions,
      commonsSuccess: recoveryResults.records.filter((record) => ["commons-structured-depicts", "commons-qid-linked-category", "commons-qid-linked-category-alphabetic", "wikidata-p18"].includes(record.chosenCandidate?.sourcePath)).length,
      multilingualWikipediaSuccess: recoveryResults.records.filter((record) => record.chosenCandidate?.sourcePath === "wikipedia-multilingual").length,
      officialSourceSuccess: recoveryResults.records.filter((record) => record.chosenCandidate?.sourcePath === "official-source").length,
      otherOpenSourceSuccess: recoveryResults.records.filter((record) => record.chosenCandidate?.sourcePath === "openverse").length,
      rejectCounts: recoveryRejectCounts,
      attemptEntries: recoveryAttemptEntries,
      averageAttemptsPerEntity: Number((recoveryAttemptEntries / recoveryResults.records.length).toFixed(2)),
      bytes: recoverySuccessful.reduce((sum, record) => sum + record.bytes, 0),
      provenanceComplete: auditProvenanceCollection(recoverySuccessful).valid,
      licenseComplete: recoverySuccessful.filter((record) => auditImageProvenance(record).valid).length,
    },
  };
}

export const comma = (value) => Number(value).toLocaleString("en-US");
export const mb = (value) => Number((Number(value) / 1024 / 1024).toFixed(2));
