import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-recovery02-provenance.json";
const AUDIT_PATH = "data/route-v2/images/image-debt-recovery02-visual-audit.json";

const rejectionByQid = new Map(Object.entries({
  Q39569: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: collage/montage is not an honest dedicated city photograph"],
  Q228811: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: collage/montage is not an honest dedicated city photograph"],
  Q234783: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: collage/montage is not an honest dedicated city photograph"],
  Q158903: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: collage/montage is not an honest dedicated city photograph"],
  Q1817541: ["ENTITY_AMBIGUOUS", "visual-audit: historic streetscape does not show the named cathedral as a clear primary subject"],
  Q2088687: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: map/satellite-style presentation is not a dedicated city photograph"],
  Q2740693: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: satellite presentation is not an acceptable dedicated POI photograph"],
  Q165422: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: map/satellite-style presentation is not a dedicated city photograph"],
  Q855634: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: map/satellite-style presentation is not a dedicated city photograph"],
  Q6115326: ["ENTITY_AMBIGUOUS", "visual-audit: aerial settlement view does not make the named river identifiable"],
  Q1266609: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: locator map is not an acceptable dedicated POI photograph"],
  Q59975: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: collage/montage is not an honest dedicated city photograph"],
  Q1150986: ["ENTITY_AMBIGUOUS", "visual-audit: frame does not make the named church identifiable"],
  Q515919: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: multi-panel collage is not an acceptable dedicated POI photograph"],
  Q47282: ["ENTITY_AMBIGUOUS", "visual-audit: food photograph does not represent the city entity"],
  Q980396: ["ENTITY_AMBIGUOUS", "visual-audit: animal enclosure does not represent the city entity"],
  Q26569: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: painting is not a verified contemporary dedicated city photograph"],
  Q4063561: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: route/locator map is not an acceptable dedicated POI photograph"],
  Q235: ["ENTITY_AMBIGUOUS", "visual-audit: recreational vehicle photograph does not represent the city entity"],
  Q384: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: collage/montage is not an honest dedicated city photograph"],
  Q3073702: ["ENTITY_AMBIGUOUS", "visual-audit: bird-on-container photograph does not represent the city entity"],
  Q160884: ["ENTITY_AMBIGUOUS", "visual-audit: airport terminal photograph is not an honest dedicated city view"],
  Q943270: ["ENTITY_AMBIGUOUS", "visual-audit: isolated industrial construction does not represent the city entity"],
  Q8537802: ["ENTITY_AMBIGUOUS", "visual-audit: foreground selfie dominates and the named natural feature is not a clear primary subject"],
  Q310893: ["ENTITY_AMBIGUOUS", "visual-audit: isolated boat photograph does not establish the city identity"],
  Q3861: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: satellite presentation is not an acceptable dedicated city photograph"],
  Q715174: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: satellite presentation is not an acceptable dedicated POI photograph"],
  Q672458: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: dark generic road scene does not provide a stable identifiable city view"],
  Q537817: ["IMAGE_TOO_LOW_QUALITY", "visual-audit: satellite presentation is not an acceptable dedicated POI photograph"],
}));

const provenanceBytes = await readFile(path.join(ROOT, PROVENANCE_PATH));
const provenance = JSON.parse(provenanceBytes.toString("utf8"));
if (provenance.visualAuditPath) {
  throw new Error("historical-audit-already-applied: use promote-route-v2-image-debt-recovery02-round.mjs with explicit file-bound decisions; never regenerate the historical QID rejection list");
}
const provenanceSha256 = crypto.createHash("sha256").update(provenanceBytes).digest("hex");
const assets = provenance.assets || [];
const assetQids = new Set(assets.map((asset) => asset.wikidataId));
for (const qid of rejectionByQid.keys()) {
  if (!assetQids.has(qid)) throw new Error(`visual-rejection-target-missing:${qid}`);
}

const decisions = assets
  .map((asset) => {
    const rejection = rejectionByQid.get(asset.wikidataId);
    return {
      auditId: `recovery02-visual-${asset.entityId}-${asset.processedHash.slice(0, 12)}`,
      entityId: asset.entityId,
      qid: asset.wikidataId,
      entityType: asset.entityType,
      assetPath: asset.assetPath,
      processedHash: asset.processedHash,
      status: rejection ? "rejected" : "passed",
      reasonCode: rejection?.[0] || null,
      reasonDetail: rejection?.[1] || null,
    };
  })
  .sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));

const rejected = decisions.filter((decision) => decision.status === "rejected").length;
const output = {
  schemaVersion: "route-v2-image-debt-recovery02-visual-audit/v1",
  auditedAt: "2026-09-06T02:00:00.000Z",
  method: "human-contact-sheet-and-original-file-visual-review",
  contactSheetPath: "data/route-v2/images/audit/image-debt-recovery02-contact-sheet.html",
  contactSheetPages: 21,
  provenancePath: PROVENANCE_PATH,
  provenanceSha256,
  totalReviewed: decisions.length,
  passed: decisions.length - rejected,
  rejected,
  decisions,
};

await writeFile(path.join(ROOT, AUDIT_PATH), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", reviewed: decisions.length, passed: output.passed, rejected }, null, 2));
