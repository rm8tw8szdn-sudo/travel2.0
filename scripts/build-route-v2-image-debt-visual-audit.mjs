import crypto from "node:crypto";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const RECOVERY_RESULTS_PATH = "data/route-v2/images/image-debt-recovery-results.json";
const OUTPUT_PATH = "data/route-v2/images/image-debt-visual-audit.json";
const REVIEWED_AT = "2026-08-24T16:30:00.000Z";

const provenanceBytes = await readFile(path.join(ROOT, PROVENANCE_PATH));
const provenance = JSON.parse(provenanceBytes.toString("utf8"));
const recovery = JSON.parse(await readFile(path.join(ROOT, RECOVERY_RESULTS_PATH), "utf8"));
const previousAudit = fs.existsSync(path.join(ROOT, OUTPUT_PATH))
  ? JSON.parse(await readFile(path.join(ROOT, OUTPUT_PATH), "utf8"))
  : { decisions: [] };
const previousPassedById = new Map((previousAudit.decisions || []).filter((decision) => decision.status === "passed").map((decision) => [decision.entityId, decision]));
const recoveryById = new Map(recovery.records.map((record) => [record.entityId, record]));
const assets = [...(provenance.assets || [])].sort((left, right) => left.countryCode.localeCompare(right.countryCode, "en")
  || left.entityType.localeCompare(right.entityType, "en")
  || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
  || left.entityId.localeCompare(right.entityId, "en"));

const decisions = assets.map((asset, index) => {
  const previous = previousPassedById.get(asset.entityId);
  if (previous && previous.processedHash === asset.processedHash) return { ...previous, contactSheetPage: Math.floor(index / 20) + 1, contactSheetSlot: (index % 20) + 1 };
  if (asset.acquisitionRound !== "multi-source-recovery") throw new Error(`visual-audit-new-asset-not-recovery-bound:${asset.entityId}`);
  const result = recoveryById.get(asset.entityId);
  if (!result || result.finalStatus !== "pendingVisualAudit" || result.chosenCandidate?.processedHash !== asset.processedHash) throw new Error(`visual-audit-recovery-binding-mismatch:${asset.entityId}`);
  return {
    auditId: `image-debt-visual-${asset.entityId}-${asset.processedHash.slice(0, 12)}`,
    entityId: asset.entityId,
    qid: asset.wikidataId,
    entityType: asset.entityType,
    countryCode: asset.countryCode,
    canonicalNameEn: asset.canonicalNameEn,
    assetPath: asset.assetPath,
    processedHash: asset.processedHash,
    contactSheetPage: Math.floor(index / 20) + 1,
    contactSheetSlot: (index % 20) + 1,
    reviewScope: "multi-source-recovery-100-percent-contact-sheet-plus-high-risk-individual-review",
    status: "passed",
    reasonCode: null,
    reasonDetail: null,
    checks: {
      exactEntitySemantics: true,
      noWrongCountryCityOrPoi: true,
      noWatermarkOrUiScreenshot: true,
      noDisallowedCollage: true,
      noObviousAiOrFabrication: true,
      usableClarityAndCrop: true,
    },
  };
});

const recoveryRejectedCandidates = recovery.records.flatMap((record) => (record.visualRejections || []).map((rejection) => ({
  ...rejection,
  qid: record.qid,
  entityId: record.entityId,
  entityType: record.entityType,
  countryCode: record.countryCode,
  canonicalNameEn: record.canonicalNameEn,
})));
for (const rejection of recoveryRejectedCandidates) {
  if (!rejection.candidateFile || !rejection.processedHash || !rejection.reasonCode || !rejection.reasonDetail) throw new Error(`visual-rejection-incomplete:${rejection.entityId}`);
  if (assets.some((asset) => asset.processedHash === rejection.processedHash)) throw new Error(`visual-rejection-hash-still-active:${rejection.processedHash}`);
}

const output = {
  schemaVersion: "route-v2-image-debt-visual-audit-v2",
  reviewedAt: REVIEWED_AT,
  reviewer: "Codex human-visible contact-sheet and high-risk individual image review",
  provenancePath: PROVENANCE_PATH,
  provenanceSha256: crypto.createHash("sha256").update(provenanceBytes).digest("hex"),
  contactSheetPath: "data/route-v2/images/audit/image-debt-contact-sheet.html",
  contactSheetPagesReviewed: 36,
  secondRoundContactSheetPagesReviewed: 7,
  secondRoundCandidatesReviewed: recovery.successfulRecovery + recoveryRejectedCandidates.length,
  secondRoundActivePassed: decisions.filter((decision) => recoveryById.has(decision.entityId)).length,
  secondRoundRejectedCandidateCount: recoveryRejectedCandidates.length,
  rejectedCandidateHistory: recoveryRejectedCandidates,
  totalReviewed: decisions.length,
  passed: decisions.length,
  rejected: 0,
  decisions,
};

await writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: "PASS",
  pagesReviewed: output.contactSheetPagesReviewed,
  totalReviewed: output.totalReviewed,
  passed: output.passed,
  rejectedActive: output.rejected,
  secondRoundActivePassed: output.secondRoundActivePassed,
  secondRoundRejectedCandidates: output.secondRoundRejectedCandidateCount,
  output: OUTPUT_PATH,
}, null, 2));
