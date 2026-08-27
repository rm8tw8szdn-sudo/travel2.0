import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INVENTORY_PATH = "data/route-v2/images/image-debt-inventory.json";
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const OUTPUT_PATH = "data/route-v2/images/image-debt-recovery-inventory.json";
const FROZEN_AT = "2026-08-24T12:00:00.000Z";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const normalizeKey = (value) => String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const unaccent = (value) => normalizeKey(value).normalize("NFKD").replace(/\p{M}+/gu, "");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function unique(values) {
  return [...new Set(values.map(normalizeKey).filter(Boolean))];
}

const inventory = readJson(INVENTORY_PATH);
const provenance = readJson(PROVENANCE_PATH);
const frozenById = new Map(inventory.records.map((record) => [record.entityId, record]));
const publishedAssetIds = new Set(provenance.assets.map((record) => record.entityId));
const residual = provenance.attempts.filter((record) => record.status === "needsBackfill");

const records = residual.map((attempt) => {
  const frozen = frozenById.get(attempt.entityId);
  if (!frozen) throw new Error(`recovery-entity-not-in-phase-inventory:${attempt.entityId}`);
  if (publishedAssetIds.has(attempt.entityId)) throw new Error(`recovery-entity-already-dedicated:${attempt.entityId}`);
  const identityParts = frozen.entityType === "City"
    ? [frozen.canonicalNameEn, frozen.countryNameEn]
    : [frozen.canonicalNameEn, frozen.parentCityNameEn, frozen.countryNameEn];
  const canonicalQuery = normalizeKey(identityParts.filter(Boolean).join(" "));
  return {
    entityId: frozen.entityId,
    qid: frozen.qid,
    entityType: frozen.entityType,
    canonicalNameEn: frozen.canonicalNameEn,
    countryCode: frozen.countryCode,
    countryNameEn: frozen.countryNameEn,
    parentCityEntityId: frozen.parentCityEntityId,
    parentCityQid: frozen.parentCityQid,
    parentCityNameEn: frozen.parentCityNameEn,
    priority: frozen.priority,
    routeExposure: frozen.routeExposure,
    isCorePoi: frozen.isCorePoi,
    firstPass: {
      reasonCode: attempt.reasonCode,
      reasonDetail: attempt.reasonDetail,
      candidateTitles: [...(attempt.candidateTitles || [])],
      visualAuditId: attempt.visualAuditId || null,
    },
    searchKeys: unique([
      frozen.qid,
      frozen.canonicalNameEn,
      unaccent(frozen.canonicalNameEn),
      canonicalQuery,
      unaccent(canonicalQuery),
    ]),
  };
}).sort((left, right) => left.entityType.localeCompare(right.entityType, "en")
  || left.countryCode.localeCompare(right.countryCode, "en")
  || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
  || left.entityId.localeCompare(right.entityId, "en"));

if (new Set(records.map((record) => record.entityId)).size !== records.length) throw new Error("recovery-inventory-duplicate-entity");
if (records.length !== residual.length) throw new Error("recovery-inventory-residual-count-mismatch");

const sourceBytes = Buffer.from(`${JSON.stringify({
  inventorySha256: sha256(fs.readFileSync(path.join(ROOT, INVENTORY_PATH))),
  provenanceSha256: sha256(fs.readFileSync(path.join(ROOT, PROVENANCE_PATH))),
}, null, 2)}\n`, "utf8");
const document = {
  schemaVersion: "route-v2-image-debt-recovery-inventory-v1",
  frozenAt: FROZEN_AT,
  firstPassInventorySha256: sha256(fs.readFileSync(path.join(ROOT, INVENTORY_PATH))),
  firstPassProvenanceSha256: sha256(fs.readFileSync(path.join(ROOT, PROVENANCE_PATH))),
  sourceFingerprint: sha256(sourceBytes),
  startingNeedsBackfill: records.length,
  cityCount: records.filter((record) => record.entityType === "City").length,
  corePoiCount: records.filter((record) => record.entityType === "POI").length,
  records,
};

fs.writeFileSync(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(document, null, 2)}\n`);
console.log(JSON.stringify({
  status: "PASS",
  output: OUTPUT_PATH,
  startingNeedsBackfill: document.startingNeedsBackfill,
  cityCount: document.cityCount,
  corePoiCount: document.corePoiCount,
  sourceFingerprint: document.sourceFingerprint,
}, null, 2));
