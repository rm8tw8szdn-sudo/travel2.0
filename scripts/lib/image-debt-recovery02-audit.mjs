import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createPublishedKnowledgeEntityLayerRepository } from "../../src/lib/routes/index.mjs";
import { buildImageAssetBaseline } from "./image-asset-baseline.mjs";
import { auditImageProvenance, auditProvenanceCollection } from "./image-provenance-license.mjs";

export const RECOVERY02_REPORT_PATH = "ROUTE_V2_IMAGE_DEBT_RECOVERY_02_FINAL_REPORT.md";
export const RECOVERY02_SUMMARY_PATH = "data/route-v2/images/image-debt-recovery02-final-summary.json";
export const RECOVERY02_PROVENANCE_PATH = "data/route-v2/images/image-debt-recovery02-provenance.json";
export const RECOVERY02_RESULTS_PATH = "data/route-v2/images/image-debt-recovery02-results.json";
export const RECOVERY02_INVENTORY_PATH = "data/route-v2/images/image-debt-recovery02-inventory.json";
export const RECOVERY02_VISUAL_AUDIT_PATH = "data/route-v2/images/image-debt-recovery02-visual-audit.json";
export const RECOVERY02_MANIFEST_PATH = "data/route-v2/images/image-coverage-manifest.json";
export const RECOVERY02_SOURCE_MAIN = "826439f41523500ad805d0bcb9966a630e90b859";

const json = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const percentile = (values, quantile) => values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)] : 0;
const hamming64 = (left, right) => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
};

export function recovery02BindingErrors({ inventory, asset, destination, decision, published, countryCode }) {
  const errors = [];
  const check = (ok, reason) => { if (!ok) errors.push(reason); };
  check(!!published && published.entityId === inventory.entityId && published.wikidataId === inventory.qid, "published-identity");
  check(countryCode === inventory.countryCode, "published-country");
  check((published?.parentCityEntityId || null) === (inventory.parentCityEntityId || null), "published-parent");
  for (const value of [asset, destination, decision]) {
    check(value?.entityId === inventory.entityId, "entity-binding");
    check((value?.wikidataId || value?.qid) === inventory.qid, "qid-binding");
  }
  for (const value of [asset, destination]) {
    check(value?.entityType === inventory.entityType, "type-binding");
    check(value?.countryCode === inventory.countryCode, "country-binding");
    check((value?.parentCityEntityId || null) === (inventory.parentCityEntityId || null), "parent-binding");
    check(value?.status === "imageReady" && value.needsBackfill === false, "publication-status");
    check(value?.assetPath === asset?.assetPath && value?.processedHash === asset?.processedHash, "asset-binding");
  }
  check(decision?.status === "passed" && decision.assetPath === asset?.assetPath && decision.processedHash === asset?.processedHash, "visual-binding");
  check(asset?.width >= 640 && asset?.height >= 360 && asset?.bytes > 0 && asset.bytes <= 300000 && asset.format === "webp", "quality-size");
  check(auditImageProvenance(asset || {}).valid, "provenance");
  return errors;
}

function allImageProvenance(root) {
  const directory = path.join(root, "data/route-v2/images");
  return fs.readdirSync(directory)
    .filter((name) => /^(?:batch\d{2}-dedicated-image-provenance|image-debt-(?:elimination|recovery02)-provenance)\.json$/u.test(name))
    .flatMap((name) => (json(root, `data/route-v2/images/${name}`).assets || []).map((record) => ({ ...record, provenanceFile: name })));
}

export function collectImageDebtRecovery02Audit({ root }) {
  const sourceBaselineBytes = execFileSync("git", ["show", `${RECOVERY02_SOURCE_MAIN}:data/route-v2/images/image-asset-baseline.json`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const sourceManifestBytes = execFileSync("git", ["show", `${RECOVERY02_SOURCE_MAIN}:${RECOVERY02_MANIFEST_PATH}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const sourceBaseline = JSON.parse(sourceBaselineBytes.toString("utf8"));
  const sourceManifest = JSON.parse(sourceManifestBytes.toString("utf8"));
  const inventory = json(root, RECOVERY02_INVENTORY_PATH);
  const provenance = json(root, RECOVERY02_PROVENANCE_PATH);
  const results = json(root, RECOVERY02_RESULTS_PATH);
  const visualAudit = json(root, RECOVERY02_VISUAL_AUDIT_PATH);
  const manifest = json(root, RECOVERY02_MANIFEST_PATH);
  const baseline = buildImageAssetBaseline({ root });
  const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: root });
  const publishedById = new Map([...repository.listCities(), ...repository.listPois()].map(entity => [entity.entityId, entity]));
  const countryById = new Map(repository.listCountries().map(entity => [entity.entityId, entity.isoAlpha2]));
  const errors = [];
  const issue = (condition, code) => { if (!condition) errors.push(code); };

  const inventoryById = new Map(inventory.records.map((record) => [record.entityId, record]));
  const resultById = new Map(results.records.map((record) => [record.entityId, record]));
  const provenanceById = new Map(provenance.assets.map((record) => [record.entityId, record]));
  const attemptById = new Map(provenance.attempts.map((record) => [record.entityId, record]));
  const manifestById = new Map([...manifest.cities, ...manifest.pois].map((record) => [record.entityId, record]));
  const decisionById = new Map(visualAudit.decisions.map((record) => [record.entityId, record]));
  issue(inventoryById.size === inventory.records.length, "inventory-duplicate-entity");
  issue(resultById.size === results.records.length, "results-duplicate-entity");
  issue(provenanceById.size === provenance.assets.length, "provenance-duplicate-entity");
  issue(attemptById.size === provenance.attempts.length, "attempt-duplicate-entity");
  issue(decisionById.size === visualAudit.decisions.length, "visual-audit-duplicate-entity");
  issue(inventory.startingNeedsBackfill === inventory.records.length, "inventory-start-count-mismatch");
  const sealedDebtIds = [...sourceManifest.cities, ...sourceManifest.pois].filter(record => record.needsBackfill).map(record => record.entityId).sort();
  issue(JSON.stringify([...inventoryById.keys()].sort()) === JSON.stringify(sealedDebtIds), "inventory-set-not-git-anchored");
  const sourceManifestCrLfBytes = Buffer.from(sourceManifestBytes.toString("utf8").replace(/\n/gu, "\r\n"), "utf8");
  issue([sha256(sourceManifestBytes), sha256(sourceManifestCrLfBytes)].includes(inventory.sourceHashes[RECOVERY02_MANIFEST_PATH]), "inventory-source-manifest-not-git-anchored");
  issue(inventory.cityCount + inventory.corePoiCount === inventory.startingNeedsBackfill, "inventory-type-count-mismatch");
  issue(inventory.quarantinedTargets === 0, "quarantined-image-target-present");
  issue(results.records.length === inventory.records.length, "results-coverage-incomplete");
  issue(provenance.attempts.length === inventory.records.length, "attempt-coverage-incomplete");
  issue(visualAudit.totalReviewed === visualAudit.decisions.length, "visual-audit-count-mismatch");
  issue(visualAudit.passed + visualAudit.rejected === visualAudit.totalReviewed, "visual-audit-math-mismatch");
  issue(visualAudit.totalReviewed + results.records.filter((record) => record.chosenCandidate == null).length === inventory.records.length, "visual-audit-candidate-coverage-mismatch");
  issue(provenance.visualAuditSourceProvenanceSha256 === visualAudit.provenanceSha256, "visual-audit-source-hash-not-sealed");
  const roundStats = [];
  for (const round of visualAudit.rounds || []) {
    const roundBytes = fs.readFileSync(path.join(root, round.path));
    const previousBytes = fs.readFileSync(path.join(root, round.previousAuditPath));
    issue(sha256(roundBytes) === round.sha256, "round-history-hash-mismatch");
    issue(sha256(previousBytes) === round.previousAuditSha256, "previous-audit-history-hash-mismatch");
    const snapshot = JSON.parse(roundBytes);
    const previous = JSON.parse(previousBytes);
    issue(snapshot.decisions.length === round.reviewed, "round-review-count-mismatch");
    issue(snapshot.decisions.filter(d => d.status === "passed").length === round.passed, "round-pass-count-mismatch");
    for (const d of previous.decisions.filter(d => d.status === "passed")) {
      issue(JSON.stringify(decisionById.get(d.entityId)) === JSON.stringify(d), `prior-passed-decision-changed:${d.entityId}`);
    }
    for (const d of snapshot.decisions.filter(d => d.status === "passed")) {
      const currentDecision = decisionById.get(d.entityId);
      const asset = provenanceById.get(d.entityId);
      issue(currentDecision?.processedHash === d.processedHash && currentDecision?.sourceUrl === d.sourceUrl,
        `round-current-decision-binding:${d.entityId}`);
      issue(asset?.sourceUrl === d.sourceUrl && asset?.sourceHash === d.sourceHash,
        `round-current-source-binding:${d.entityId}`);
    }
    roundStats.push({ roundId: round.roundId, reviewed: round.reviewed, passed: round.passed, rejected: round.rejected,
      previousReviewed: previous.totalReviewed, previousPassed: previous.passed, previousRejected: previous.rejected });
  }
  if (visualAudit.sourceSnapshotPath) {
    issue(sha256(fs.readFileSync(path.join(root, visualAudit.sourceSnapshotPath))) === visualAudit.provenanceSha256,
      "current-round-source-snapshot-not-sealed");
  }

  for (const record of inventory.records) {
    const result = resultById.get(record.entityId);
    const attempt = attemptById.get(record.entityId);
    const destination = manifestById.get(record.entityId);
    issue(Boolean(result), `result-missing:${record.entityId}`);
    issue(Boolean(attempt), `attempt-missing:${record.entityId}`);
    issue(Boolean(destination), `manifest-target-missing:${record.entityId}`);
    if (!result || !attempt || !destination) continue;
    issue(result.recoveryAttempts === result.sourceAttempts.length, `attempt-count-mismatch:${record.entityId}`);
    issue(result.independentSourcePathsAttempted.length >= 4, `multi-source-audit-incomplete:${record.entityId}`);
    if (result.finalStatus === "imageReady") {
      const asset = provenanceById.get(record.entityId);
      const decision = decisionById.get(record.entityId);
      issue(Boolean(asset), `recovered-provenance-missing:${record.entityId}`);
      issue(decision?.status === "passed", `recovered-visual-audit-missing:${record.entityId}`);
      issue(destination.status === "imageReady" && destination.needsBackfill === false, `recovered-manifest-not-ready:${record.entityId}`);
      issue(destination.sourcePath === RECOVERY02_PROVENANCE_PATH, `recovered-manifest-provenance-mismatch:${record.entityId}`);
      if (asset && decision) {
        const published = publishedById.get(record.entityId);
        const parent = published?.parentCityEntityId ? publishedById.get(published.parentCityEntityId) : published;
        const bindingErrors = recovery02BindingErrors({ inventory: record, asset, destination, decision, published, countryCode: countryById.get(parent?.parentCountryEntityId) });
        for (const error of bindingErrors) errors.push(`${error}:${record.entityId}`);
        issue(asset.wikidataId === record.qid && asset.assetPath === destination.assetPath, `recovered-identity-binding-mismatch:${record.entityId}`);
        issue(asset.processedHash === decision.processedHash && asset.processedHash === destination.processedHash, `recovered-hash-binding-mismatch:${record.entityId}`);
        const absolutePath = path.join(root, asset.assetPath);
        issue(fs.existsSync(absolutePath), `recovered-file-missing:${record.entityId}`);
        if (fs.existsSync(absolutePath)) {
          const bytes = fs.readFileSync(absolutePath);
          issue(sha256(bytes) === asset.processedHash, `recovered-file-hash-mismatch:${record.entityId}`);
          issue(bytes.length === asset.bytes, `recovered-file-bytes-mismatch:${record.entityId}`);
        }
      }
    } else {
      issue(!provenanceById.has(record.entityId), `remaining-debt-has-dedicated-provenance:${record.entityId}`);
      issue(destination.status === "placeholder" && destination.needsBackfill === true, `remaining-debt-not-placeholder:${record.entityId}`);
      issue(destination.assetPath === manifest.fallbackPolicy.city, `remaining-debt-fallback-not-neutral:${record.entityId}`);
      issue(typeof destination.failureReason === "string" && destination.recoveryAttempts > 0, `remaining-debt-audit-metadata-missing:${record.entityId}`);
    }
  }

  const provenanceAudit = auditProvenanceCollection(provenance.assets);
  issue(provenanceAudit.invalid.length === 0, `provenance-invalid:${provenanceAudit.invalid.length}`);
  const allProvenance = allImageProvenance(root);
  const allDedicatedByHash = new Map();
  for (const record of allProvenance.filter((entry) => entry.status === "imageReady" && entry.visualAuditStatus === "passed")) {
    if (!allDedicatedByHash.has(record.processedHash)) allDedicatedByHash.set(record.processedHash, []);
    allDedicatedByHash.get(record.processedHash).push(record);
  }
  const exactDuplicateGroups = [...allDedicatedByHash.values()].filter((group) => group.length > 1 && group.some((record) => record.provenanceFile === path.basename(RECOVERY02_PROVENANCE_PATH)));
  const recoveryPerceptual = provenance.assets.filter((record) => /^[0-9a-f]{16}$/u.test(record.perceptualHash || ""));
  const otherPerceptual = allProvenance.filter((record) => record.provenanceFile !== path.basename(RECOVERY02_PROVENANCE_PATH) && /^[0-9a-f]{16}$/u.test(record.perceptualHash || ""));
  const unsafeVisualDuplicates = [];
  for (let index = 0; index < recoveryPerceptual.length; index += 1) {
    const left = recoveryPerceptual[index];
    for (const right of [...recoveryPerceptual.slice(index + 1), ...otherPerceptual]) {
      if (left.entityId !== right.entityId && hamming64(left.perceptualHash, right.perceptualHash) <= 5) {
        unsafeVisualDuplicates.push({ left: left.entityId, right: right.entityId });
      }
    }
  }
  issue(exactDuplicateGroups.length === 0, `recovery-exact-duplicate:${exactDuplicateGroups.length}`);
  issue(unsafeVisualDuplicates.length === 0, `recovery-perceptual-duplicate:${unsafeVisualDuplicates.length}`);

  const successful = results.records.filter((record) => record.finalStatus === "imageReady");
  const remaining = results.records.filter((record) => record.finalStatus === "needsBackfill");
  const reasonBreakdown = {};
  for (const record of remaining) {
    const reason = typeof record.finalFailureReason === "string"
      ? record.finalFailureReason
      : record.finalFailureReason?.reasonCode || attemptById.get(record.entityId)?.reasonCode || "UNKNOWN";
    reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
  }
  const sizes = provenance.assets.map((record) => record.bytes).sort((left, right) => left - right);
  const currentCoverage = manifest.coverage.overall;
  const published = {
    countries: repository.listCountries().length,
    cities: repository.listCities().length,
    pois: repository.listPois().length,
  };
  published.entities = published.countries + published.cities + published.pois;
  issue(published.countries === inventory.publishedTruth.countries && published.cities === inventory.publishedTruth.cities && published.pois === inventory.publishedTruth.pois, "published-truth-drift");
  issue(currentCoverage.needsBackfillCount === remaining.length, "manifest-debt-count-mismatch");
  issue(currentCoverage.cityDedicatedImageCoverage.ready === sourceManifest.coverage.overall.cityDedicatedImageCoverage.ready + successful.filter((record) => record.entityType === "City").length, "city-coverage-recovery-mismatch");
  issue(currentCoverage.corePoiImageCoverage.ready === sourceManifest.coverage.overall.corePoiImageCoverage.ready + successful.filter((record) => record.entityType === "POI").length, "poi-coverage-recovery-mismatch");
  issue(currentCoverage.invalidMappingCount === 0 && manifest.invalidMappings.length === 0, "invalid-mapping-present");

  return {
    schemaVersion: "route-v2-image-debt-recovery02-final-summary/v1",
    generatedAt: visualAudit.auditedAt,
    errors,
    publishedTruth: { ...published, quarantinedPois: inventory.publishedTruth.quarantinedPois },
    before: {
      sourceMain: RECOVERY02_SOURCE_MAIN,
      assets: sourceBaseline.summary.totalImages,
      dedicatedCity: sourceManifest.coverage.overall.cityDedicatedImageCoverage.ready,
      dedicatedCorePoi: sourceManifest.coverage.overall.corePoiImageCoverage.ready,
      needsBackfill: inventory.startingNeedsBackfill,
      cityDebt: inventory.cityCount,
      corePoiDebt: inventory.corePoiCount,
    },
    auditedDebt: inventory.records.length,
    recovered: {
      total: successful.length,
      city: successful.filter((record) => record.entityType === "City").length,
      corePoi: successful.filter((record) => record.entityType === "POI").length,
    },
    remaining: {
      total: remaining.length,
      city: remaining.filter((record) => record.entityType === "City").length,
      corePoi: remaining.filter((record) => record.entityType === "POI").length,
      reasonBreakdown: Object.fromEntries(Object.entries(reasonBreakdown).sort(([left], [right]) => left.localeCompare(right, "en"))),
      exhausted: remaining.filter((record) => record.exhausted === true).length,
    },
    visualAudit: { reviewed: visualAudit.totalReviewed, passed: visualAudit.passed, rejected: visualAudit.rejected, pages: visualAudit.contactSheetPages, rounds: roundStats },
    current: {
      assets: baseline.summary.totalImages,
      countryCover: `${currentCoverage.countryCoverCoverage.ready}/${currentCoverage.countryCoverCoverage.total}`,
      dedicatedCity: `${currentCoverage.cityDedicatedImageCoverage.ready}/${currentCoverage.cityDedicatedImageCoverage.total}`,
      dedicatedCorePoi: `${currentCoverage.corePoiImageCoverage.ready}/${currentCoverage.corePoiImageCoverage.total}`,
      needsBackfill: currentCoverage.needsBackfillCount,
      invalidMapping: currentCoverage.invalidMappingCount,
    },
    newAssets: {
      files: provenance.assets.length,
      bytes: sizes.reduce((sum, value) => sum + value, 0),
      averageBytes: sizes.length ? Math.round(sizes.reduce((sum, value) => sum + value, 0) / sizes.length) : 0,
      medianBytes: percentile(sizes, 0.5),
      p95Bytes: percentile(sizes, 0.95),
      largerThan300Kb: sizes.filter((value) => value > 300_000).length,
      largerThan500Kb: sizes.filter((value) => value > 500_000).length,
    },
    provenance: {
      total: provenanceAudit.total,
      complete: provenanceAudit.valid,
      licenseComplete: provenanceAudit.valid,
      licenseUrlComplete: provenanceAudit.licenseUrlComplete,
      attributionRequired: provenanceAudit.attributionRequired,
      creatorCompleteWhereRequired: provenanceAudit.creatorCompleteWhereRequired,
      attributionCompleteWhereRequired: provenanceAudit.attributionCompleteWhereRequired,
    },
    quality: {
      exactDuplicateGroups: exactDuplicateGroups.length,
      unsafeVisualDuplicatePairs: unsafeVisualDuplicates.length,
      missingFiles: errors.filter((value) => value.startsWith("recovered-file-missing:")).length,
      invalidMappings: manifest.invalidMappings.length,
      quarantinedTargets: inventory.quarantinedTargets,
    },
    hardRecovery: fs.existsSync(path.join(root, "data/route-v2/images/audit/hard42-20260909/source-research.json"))
      ? JSON.parse(fs.readFileSync(path.join(root, "data/route-v2/images/audit/hard42-20260909/source-research.json"), "utf8")).scope.map(entry => ({
        qid: entry.qid, name: entry.canonicalNameEn, type: entry.debtType, conclusion: entry.conclusion,
        reason: entry.exhaustionReason || "Accepted after exact-entity, license, source-file and visual review.",
      })) : [],
  };
}

export function renderImageDebtRecovery02Report(model) {
  const reasons = Object.entries(model.remaining.reasonBreakdown).map(([reason, count]) => `- ${reason}: ${count}`).join("\n");
  const hardRows = model.hardRecovery.map(entry => `| ${entry.type} | ${entry.qid} | ${entry.name.replaceAll("|", "\\|")} | ${entry.conclusion} | ${entry.reason.replaceAll("|", "\\|")} |`).join("\n");
  return `# HARD IMAGE DEBT RECOVERY COMPLETE — READY FOR FINAL REVIEW\n\n`+
    `Route V2 Image Debt Recovery 02 final report.\n\n`+
    `Generated from the recovery inventory, final manifest, provenance, visual-audit decisions, and current image asset inventory.\n\n`+
    `## Before\n\n- Assets: ${model.before.assets}\n- Dedicated City: ${model.before.dedicatedCity}\n- Dedicated Core POI: ${model.before.dedicatedCorePoi}\n- needsBackfill: ${model.before.needsBackfill} (${model.before.cityDebt} City + ${model.before.corePoiDebt} Core POI)\n\n`+
    `## Recovery result\n\n- Audited debt: ${model.auditedDebt}/${model.before.needsBackfill}\n- Recovered: ${model.recovered.total} (${model.recovered.city} City + ${model.recovered.corePoi} Core POI)\n- Remaining: ${model.remaining.total} (${model.remaining.city} City + ${model.remaining.corePoi} Core POI)\n- Exhausted: ${model.remaining.exhausted}\n- Current selected-candidate decisions: ${model.visualAudit.reviewed} total / ${model.visualAudit.passed} passed / ${model.visualAudit.rejected} rejected\n\n`+
    (model.visualAudit.rounds.length ? `### Resumed visual review\n\n${model.visualAudit.rounds.map(r => `- ${r.roundId}: ${r.reviewed} actual candidate files reviewed; ${r.passed} newly accepted; ${r.rejected} rejected. Previous ${r.previousReviewed} decisions (${r.previousPassed} passed / ${r.previousRejected} rejected) remain sealed in history.`).join("\n")}\n- The current decision count above describes selected candidates, not cumulative review events. The original 21 contact-sheet pages are historical; per-round archives record subsequent sheets and individually reviewed files.\n- All superseded rejections and source/download attempts remain in the round archive and results history.\n\n` : "")+
    `### Remaining reason breakdown\n\n${reasons}\n\n`+
    (hardRows ? `### Hard42 per-entity conclusions\n\n| Type | QID | Entity | Conclusion | Evidence-based reason |\n| --- | --- | --- | --- | --- |\n${hardRows}\n\n` : "")+
    `## Current coverage\n\n- Assets: ${model.current.assets}\n- Country Cover: ${model.current.countryCover}\n- Dedicated City: ${model.current.dedicatedCity}\n- Dedicated Core POI: ${model.current.dedicatedCorePoi}\n- needsBackfill: ${model.current.needsBackfill}\n- invalidMapping: ${model.current.invalidMapping}\n- Historical sealed image debt: 13 (historical snapshot only; not overwritten by this current dynamic debt)\n\n`+
    `## New local assets\n\n- Files: ${model.newAssets.files}\n- Bytes: ${model.newAssets.bytes}\n- Average bytes: ${model.newAssets.averageBytes}\n- Median bytes: ${model.newAssets.medianBytes}\n- p95 bytes: ${model.newAssets.p95Bytes}\n- >300 KB: ${model.newAssets.largerThan300Kb}\n- >500 KB: ${model.newAssets.largerThan500Kb}\n\n`+
    `## Provenance and quality\n\n- Provenance/license/license URL complete: ${model.provenance.complete}/${model.provenance.total}\n- Attribution-required creator/attribution complete: ${model.provenance.creatorCompleteWhereRequired}/${model.provenance.attributionRequired}\n- Exact duplicate groups involving Recovery 02: ${model.quality.exactDuplicateGroups}\n- Unsafe perceptual duplicate pairs involving Recovery 02: ${model.quality.unsafeVisualDuplicatePairs}\n- Missing files: ${model.quality.missingFiles}\n- Invalid mappings: ${model.quality.invalidMappings}\n- Quarantined image targets: ${model.quality.quarantinedTargets}\n\n`+
    `## Published semantic lock\n\n- ${model.publishedTruth.countries} Country / ${model.publishedTruth.cities} City / ${model.publishedTruth.pois} POI / ${model.publishedTruth.entities} entities\n- Quarantined POI: ${model.publishedTruth.quarantinedPois}; formal Recovery 02 image targets: ${model.quality.quarantinedTargets}\n`;
}
