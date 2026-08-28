import crypto from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGE_ROOT = path.resolve(ROOT, "assets/route-v2-images");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const AUDIT_PATH = "data/route-v2/images/image-debt-visual-audit.json";
const WAVE_RESULTS_PATH = "data/route-v2/images/image-debt-wave-results.json";
const RECOVERY_RESULTS_PATH = "data/route-v2/images/image-debt-recovery-results.json";

const provenanceBytes = await readFile(path.join(ROOT, PROVENANCE_PATH));
const provenance = JSON.parse(provenanceBytes.toString("utf8"));
const audit = JSON.parse(await readFile(path.join(ROOT, AUDIT_PATH), "utf8"));
const existingAssets = new Map((provenance.assets || []).map((asset) => [asset.entityId, asset]));
const existingAttempts = new Map((provenance.attempts || []).map((attempt) => [attempt.entityId, attempt]));
const alreadyApplied = provenance.visualAuditPath === AUDIT_PATH
  && (provenance.assets || []).every((asset) => asset.status === "imageReady" && asset.visualAuditStatus === "passed")
  && (audit.decisions || []).every((decision) => decision.status === "passed"
    ? existingAssets.get(decision.entityId)?.visualAuditId === decision.auditId
    : existingAttempts.get(decision.entityId)?.visualAuditId === decision.auditId);
if (alreadyApplied) {
  const normalized = {
    ...provenance,
    assetCount: provenance.assets.length,
    cityAssetCount: provenance.assets.filter((record) => record.entityType === "City").length,
    poiAssetCount: provenance.assets.filter((record) => record.entityType === "POI").length,
  };
  if (JSON.stringify(normalized) !== JSON.stringify(provenance)) {
    await writeFile(path.join(ROOT, PROVENANCE_PATH), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({
    status: "PASS",
    idempotent: true,
    promoted: provenance.assets.length,
    removed: audit.rejected,
    remaining: provenance.attempts.filter((record) => record.status === "needsBackfill").length,
  }, null, 2));
  process.exit(0);
}
const expectedHash = crypto.createHash("sha256").update(provenanceBytes).digest("hex");
if (audit.provenanceSha256 !== expectedHash) throw new Error("visual-audit-stale-provenance-hash");
if (audit.totalReviewed !== provenance.assets.length) throw new Error("visual-audit-coverage-incomplete");

const decisions = new Map(audit.decisions.map((record) => [record.entityId, record]));
if (decisions.size !== audit.decisions.length) throw new Error("visual-audit-duplicate-entity");
const attempts = new Map((provenance.attempts || []).map((record) => [record.entityId, record]));
const promoted = [];
const removed = [];

for (const asset of provenance.assets || []) {
  const decision = decisions.get(asset.entityId);
  if (!decision) throw new Error(`visual-audit-decision-missing:${asset.entityId}`);
  if (decision.qid !== asset.wikidataId || decision.assetPath !== asset.assetPath || decision.processedHash !== asset.processedHash) {
    throw new Error(`visual-audit-binding-mismatch:${asset.entityId}`);
  }
  const localPath = path.resolve(ROOT, asset.assetPath);
  const relativeToImageRoot = path.relative(IMAGE_ROOT, localPath);
  if (!relativeToImageRoot || relativeToImageRoot.startsWith("..") || path.isAbsolute(relativeToImageRoot)) {
    throw new Error(`visual-audit-asset-outside-image-root:${asset.assetPath}`);
  }
  if (decision.status === "rejected") {
    await rm(localPath, { force: true });
    attempts.set(asset.entityId, {
      ...attempts.get(asset.entityId),
      status: "needsBackfill",
      reasonCode: decision.reasonCode,
      reasonDetail: decision.reasonDetail,
      visualAuditId: decision.auditId,
    });
    removed.push(asset.entityId);
    continue;
  }
  if (decision.status !== "passed") throw new Error(`visual-audit-status-invalid:${asset.entityId}`);
  if (!fs.existsSync(localPath)) throw new Error(`visual-audit-passed-asset-missing:${asset.assetPath}`);
  const bytes = fs.readFileSync(localPath);
  const localHash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (localHash !== asset.processedHash || bytes.length !== asset.bytes) throw new Error(`visual-audit-passed-asset-changed:${asset.entityId}`);
  promoted.push({
    ...asset,
    status: "imageReady",
    needsBackfill: false,
    visualTruthStatus: asset.entityType === "City" ? "verified-exact-city-photograph" : "verified-exact-poi-photograph",
    usageStatus: "approved-local-runtime",
    verificationStatus: "verified-exact-entity-source-license-size-and-visual-audit",
    visualAuditStatus: "passed",
    visualAuditId: decision.auditId,
    visualAuditPath: AUDIT_PATH,
  });
  attempts.set(asset.entityId, {
    ...attempts.get(asset.entityId),
    status: "imageReady",
    reasonCode: null,
    reasonDetail: null,
    visualAuditId: decision.auditId,
  });
}

const output = {
  ...provenance,
  visualAuditPath: AUDIT_PATH,
  assetCount: promoted.length,
  cityAssetCount: promoted.filter((record) => record.entityType === "City").length,
  poiAssetCount: promoted.filter((record) => record.entityType === "POI").length,
  assets: promoted.sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
  attempts: [...attempts.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
};
await writeFile(path.join(ROOT, PROVENANCE_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");

const waveResults = JSON.parse(await readFile(path.join(ROOT, WAVE_RESULTS_PATH), "utf8"));
const values = output.attempts;
const totals = {
  attempted: values.length,
  succeeded: values.filter((record) => record.status === "imageReady").length,
  remained: values.filter((record) => record.status === "needsBackfill").length,
  semanticReject: values.filter((record) => record.reasonCode === "NO_EXACT_IMAGE" || record.reasonCode === "ENTITY_AMBIGUOUS").length,
  licenseReject: values.filter((record) => record.reasonCode === "LICENSE_UNVERIFIED").length,
  qualityReject: values.filter((record) => ["IMAGE_TOO_LOW_QUALITY", "ONLY_WATERMARKED_SOURCE"].includes(record.reasonCode)).length,
  duplicateReject: values.filter((record) => record.reasonCode === "ONLY_DUPLICATE_SOURCE").length,
  sizeReject: values.filter((record) => record.reasonCode === "SIZE_QUALITY_CONFLICT").length,
  sourceUnavailable: values.filter((record) => record.reasonCode === "SOURCE_UNAVAILABLE").length,
};
await writeFile(path.join(ROOT, WAVE_RESULTS_PATH), `${JSON.stringify({ ...waveResults, totals, visualAudit: { reviewed: audit.totalReviewed, passed: audit.passed, rejected: audit.rejected } }, null, 2)}\n`, "utf8");

if (fs.existsSync(path.join(ROOT, RECOVERY_RESULTS_PATH))) {
  const recoveryResults = JSON.parse(await readFile(path.join(ROOT, RECOVERY_RESULTS_PATH), "utf8"));
  const promotedById = new Map(promoted.filter((record) => record.acquisitionRound === "multi-source-recovery").map((record) => [record.entityId, record]));
  const records = recoveryResults.records.map((record) => promotedById.has(record.entityId)
    ? { ...record, finalStatus: "imageReady", retryRequested: false }
    : record);
  const successful = records.filter((record) => record.finalStatus === "imageReady");
  await writeFile(path.join(ROOT, RECOVERY_RESULTS_PATH), `${JSON.stringify({
    ...recoveryResults,
    attempted: records.length,
    successfulRecovery: successful.length,
    cityRecovery: successful.filter((record) => record.entityType === "City").length,
    poiRecovery: successful.filter((record) => record.entityType === "POI").length,
    remaining: records.filter((record) => record.finalStatus === "needsBackfill").length,
    records,
  }, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ status: "PASS", promoted: promoted.length, removed: removed.length, remaining: totals.remained }, null, 2));
