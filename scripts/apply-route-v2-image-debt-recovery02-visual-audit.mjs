import crypto from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

import { meaningfulCreator } from "./lib/image-provenance-license.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGE_ROOT = path.resolve(ROOT, "assets/route-v2-images/recovery02");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-recovery02-provenance.json";
const AUDIT_PATH = "data/route-v2/images/image-debt-recovery02-visual-audit.json";
const RESULTS_PATH = "data/route-v2/images/image-debt-recovery02-results.json";

function canonicalAttribution(asset) {
  const attribution = String(asset.attribution || "").trim();
  if (!/^https?:\/\//iu.test(attribution)) return attribution;
  return `${String(asset.creator || asset.author).trim()} — ${asset.originalFilename || asset.canonicalNameEn} (${asset.license})`;
}

const provenanceBytes = await readFile(path.join(ROOT, PROVENANCE_PATH));
const provenance = JSON.parse(provenanceBytes.toString("utf8"));
const audit = JSON.parse(await readFile(path.join(ROOT, AUDIT_PATH), "utf8"));
if (audit.rounds?.length) throw new Error("round-audit-present: use explicit round promotion; historical apply must not rewrite preserved decisions or attempts");
const rejectedIds = new Set(audit.decisions.filter(record => record.status === "rejected").map(record => record.entityId));
const retainUnprovenExhaustion = record => rejectedIds.has(record.entityId) ? {
  ...record,
  exhausted: false,
  exhaustionReason: "Selected image rejected; alternative-source exhaustion has not been established.",
} : record;
const currentAssets = new Map((provenance.assets || []).map((record) => [record.entityId, record]));
const currentAttempts = new Map((provenance.attempts || []).map((record) => [record.entityId, record]));
const alreadyApplied = provenance.visualAuditPath === AUDIT_PATH
  && (audit.decisions || []).every((decision) => decision.status === "passed"
    ? currentAssets.get(decision.entityId)?.visualAuditId === decision.auditId
    : currentAttempts.get(decision.entityId)?.visualAuditId === decision.auditId);
if (alreadyApplied) {
  const normalized = {
    ...provenance,
    attempts: provenance.attempts.map(retainUnprovenExhaustion),
    visualAuditSourceProvenanceSha256: audit.provenanceSha256,
    assets: provenance.assets.map((asset) => {
      const creatorStatus = meaningfulCreator(asset.creator) ? null : "not-provided-by-source";
      const attribution = canonicalAttribution(asset);
      return { ...asset, attribution, creatorStatus, rights: { ...asset.rights, attribution, creatorStatus } };
    }),
    assetCount: provenance.assets.length,
    cityAssetCount: provenance.assets.filter((record) => record.entityType === "City").length,
    poiAssetCount: provenance.assets.filter((record) => record.entityType === "POI").length,
  };
  await writeFile(path.join(ROOT, PROVENANCE_PATH), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  const results = JSON.parse(await readFile(path.join(ROOT, RESULTS_PATH), "utf8"));
  await writeFile(path.join(ROOT, RESULTS_PATH), `${JSON.stringify({ ...results, records: results.records.map(retainUnprovenExhaustion) }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", idempotent: true, promoted: normalized.assetCount, rejected: audit.rejected }, null, 2));
  process.exit(0);
}
const expectedHash = crypto.createHash("sha256").update(provenanceBytes).digest("hex");
if (audit.provenanceSha256 !== expectedHash) throw new Error("visual-audit-stale-provenance-hash");
if (audit.totalReviewed !== (provenance.assets || []).length) throw new Error("visual-audit-coverage-incomplete");

const decisions = new Map(audit.decisions.map((record) => [record.entityId, record]));
if (decisions.size !== audit.decisions.length) throw new Error("visual-audit-duplicate-entity");
const attempts = new Map((provenance.attempts || []).map((record) => [record.entityId, record]));
const promoted = [];
const rejected = [];

for (const asset of provenance.assets || []) {
  const decision = decisions.get(asset.entityId);
  if (!decision) throw new Error(`visual-audit-decision-missing:${asset.entityId}`);
  if (decision.qid !== asset.wikidataId || decision.assetPath !== asset.assetPath || decision.processedHash !== asset.processedHash) {
    throw new Error(`visual-audit-binding-mismatch:${asset.entityId}`);
  }
  const localPath = path.resolve(ROOT, asset.assetPath);
  const relative = path.relative(IMAGE_ROOT, localPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`visual-audit-path-outside-recovery02:${asset.assetPath}`);

  if (decision.status === "rejected") {
    await rm(localPath, { force: true });
    const previousAttempt = attempts.get(asset.entityId);
    attempts.set(asset.entityId, {
      ...previousAttempt,
      status: "needsBackfill",
      reasonCode: decision.reasonCode,
      reasonDetail: decision.reasonDetail,
      visualAuditId: decision.auditId,
      recoveryAttempts: Math.max(1, Number(previousAttempt?.recoveryAttempts || 0)),
      lastAttemptSource: previousAttempt?.lastAttemptSource || asset.sourcePathType,
      exhausted: false,
    });
    rejected.push(asset.entityId);
    continue;
  }
  if (decision.status !== "passed") throw new Error(`visual-audit-status-invalid:${asset.entityId}`);
  if (!fs.existsSync(localPath)) throw new Error(`visual-audit-passed-asset-missing:${asset.assetPath}`);
  const bytes = fs.readFileSync(localPath);
  const localHash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (localHash !== asset.processedHash || bytes.length !== asset.bytes) throw new Error(`visual-audit-passed-asset-changed:${asset.entityId}`);
  const creatorStatus = meaningfulCreator(asset.creator) ? null : "not-provided-by-source";
  const attribution = canonicalAttribution(asset);
  promoted.push({
    ...asset,
    attribution,
    status: "imageReady",
    needsBackfill: false,
    creatorStatus,
    rights: { ...asset.rights, attribution, creatorStatus },
    visualTruthStatus: asset.entityType === "City" ? "verified-exact-city-photograph" : "verified-exact-poi-photograph",
    usageStatus: "approved-local-runtime",
    verificationStatus: "verified-exact-entity-source-license-size-and-visual-audit",
    visualAuditStatus: "passed",
    visualAuditId: decision.auditId,
    visualAuditPath: AUDIT_PATH,
  });
  const previousAttempt = attempts.get(asset.entityId);
  attempts.set(asset.entityId, {
    ...previousAttempt,
    status: "imageReady",
    reasonCode: null,
    reasonDetail: null,
    visualAuditId: decision.auditId,
    exhausted: false,
  });
}

// A rejected selected photograph is not proof that every alternate source is
// exhausted. Also normalize historical attempts on an idempotent second run.
for (const decision of decisions.values()) {
  if (decision.status !== "rejected") continue;
  const attempt = attempts.get(decision.entityId);
  if (attempt) attempts.set(decision.entityId, {
    ...attempt,
    exhausted: false,
    exhaustionReason: "Selected image rejected; alternative-source exhaustion has not been established.",
  });
}

const output = {
  ...provenance,
  visualAuditPath: AUDIT_PATH,
  visualAuditSourceProvenanceSha256: audit.provenanceSha256,
  assetCount: promoted.length,
  cityAssetCount: promoted.filter((record) => record.entityType === "City").length,
  poiAssetCount: promoted.filter((record) => record.entityType === "POI").length,
  assets: promoted.sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
  attempts: [...attempts.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
};
await writeFile(path.join(ROOT, PROVENANCE_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");

const results = JSON.parse(await readFile(path.join(ROOT, RESULTS_PATH), "utf8"));
const decisionById = decisions;
const promotedById = new Map(promoted.map((record) => [record.entityId, record]));
const records = results.records.map((record) => {
  const decision = decisionById.get(record.entityId);
  if (!decision) return record;
  if (promotedById.has(record.entityId)) {
    return { ...record, visualRejections: [], finalStatus: "imageReady", finalFailureReason: null, exhausted: false, retryRequested: false };
  }
  return {
    ...record,
    visualRejections: [{ auditId: decision.auditId, reasonCode: decision.reasonCode, reasonDetail: decision.reasonDetail }],
    finalStatus: "needsBackfill",
    finalFailureReason: decision.reasonCode,
    exhausted: false,
    exhaustionReason: "Selected image rejected; alternative-source exhaustion has not been established.",
    retryRequested: false,
  };
});
const successful = records.filter((record) => record.finalStatus === "imageReady");
await writeFile(path.join(ROOT, RESULTS_PATH), `${JSON.stringify({
  ...results,
  attempted: records.length,
  successfulRecovery: successful.length,
  cityRecovery: successful.filter((record) => record.entityType === "City").length,
  poiRecovery: successful.filter((record) => record.entityType === "POI").length,
  remaining: records.filter((record) => record.finalStatus === "needsBackfill").length,
  visualAudit: { reviewed: audit.totalReviewed, passed: audit.passed, rejected: audit.rejected },
  records,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: "PASS",
  reviewed: audit.totalReviewed,
  promoted: promoted.length,
  rejected: rejected.length,
  remaining: records.filter((record) => record.finalStatus === "needsBackfill").length,
}, null, 2));
