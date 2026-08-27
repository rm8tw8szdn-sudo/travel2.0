import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const RESULTS_PATH = "data/route-v2/images/image-debt-recovery-results.json";
const REJECTIONS_PATH = process.argv.find((value) => value.startsWith("--input="))?.slice("--input=".length)
  || "data/route-v2/images/image-debt-recovery-visual-rejections.json";
const IMAGE_ROOT = path.resolve(ROOT, "assets/route-v2-images");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const writeJson = (relativePath, value) => fs.writeFileSync(path.join(ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);

const provenance = readJson(PROVENANCE_PATH);
const results = readJson(RESULTS_PATH);
const rejectionDocument = readJson(REJECTIONS_PATH);
const assets = new Map(provenance.assets.map((record) => [record.wikidataId, record]));
const attempts = new Map(provenance.attempts.map((record) => [record.qid, record]));
const recovery = new Map(results.records.map((record) => [record.qid, record]));
const removed = [];

for (const rejection of rejectionDocument.rejections) {
  const asset = assets.get(rejection.qid);
  const result = recovery.get(rejection.qid);
  if (!asset || asset.acquisitionRound !== "multi-source-recovery") throw new Error(`recovery-visual-rejection-asset-missing:${rejection.qid}`);
  if (!result?.chosenCandidate || result.chosenCandidate.processedHash !== asset.processedHash) throw new Error(`recovery-visual-rejection-binding-mismatch:${rejection.qid}`);
  if (rejection.candidateFile && rejection.candidateFile !== asset.commonsFileTitle) throw new Error(`recovery-visual-rejection-file-mismatch:${rejection.qid}`);
  if (rejection.processedHash && rejection.processedHash !== asset.processedHash) throw new Error(`recovery-visual-rejection-hash-mismatch:${rejection.qid}`);
  const absolutePath = path.resolve(ROOT, asset.assetPath);
  const relative = path.relative(IMAGE_ROOT, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`refuse-delete-outside-image-root:${asset.assetPath}`);
  fs.rmSync(absolutePath, { force: true });
  assets.delete(rejection.qid);
  const visualRejection = {
    ...rejection,
    entityId: asset.entityId,
    candidateFile: asset.commonsFileTitle,
    sourceUrl: asset.sourceUrl,
    processedHash: asset.processedHash,
  };
  recovery.set(rejection.qid, {
    ...result,
    visualRejections: [...(result.visualRejections || []), visualRejection],
    chosenCandidate: null,
    finalStatus: "needsBackfill",
    finalFailureReason: { reasonCode: rejection.reasonCode, reasonDetail: rejection.reasonDetail },
    retryRequested: true,
  });
  attempts.set(rejection.qid, {
    ...attempts.get(rejection.qid),
    status: "needsBackfill",
    reasonCode: rejection.reasonCode,
    reasonDetail: rejection.reasonDetail,
  });
  removed.push(rejection.qid);
}

const finalAssets = [...assets.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
const finalAttempts = [...attempts.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
writeJson(PROVENANCE_PATH, {
  ...provenance,
  assetCount: finalAssets.length,
  cityAssetCount: finalAssets.filter((record) => record.entityType === "City").length,
  poiAssetCount: finalAssets.filter((record) => record.entityType === "POI").length,
  assets: finalAssets,
  attempts: finalAttempts,
});
const finalRecords = [...recovery.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
const recovered = finalRecords.filter((record) => ["pendingVisualAudit", "imageReady"].includes(record.finalStatus));
writeJson(RESULTS_PATH, {
  ...results,
  attempted: finalRecords.length,
  successfulRecovery: recovered.length,
  cityRecovery: recovered.filter((record) => record.entityType === "City").length,
  poiRecovery: recovered.filter((record) => record.entityType === "POI").length,
  remaining: finalRecords.filter((record) => record.finalStatus === "needsBackfill").length,
  records: finalRecords,
});
console.log(JSON.stringify({ status: "PASS", removed: removed.length, qids: removed, retryRequested: removed.length }, null, 2));
