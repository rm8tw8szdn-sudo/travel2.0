import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { commonsImageInfo, fetchResponse } from "./lib/image-debt-source.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(process.env.TEMP, "route-v2-recovery02-hard42-manual-20260909");
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, "data/route-v2/images/audit/hard42-20260909/frozen-inventory.json"), "utf8"));
const byQid = new Map(inventory.records.map(record => [record.qid, record]));
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const candidates = [
  ["Q5289616", "DolphinCove 20231011 120510.jpg", "commons-exact-name-and-geotag"],
  ["Q59975", "Commune de Bejaia بلدية بجاية - panoramio (1).jpg", "commons-exact-city-geotag"],
  ["Q158903", "Shusha general view.jpg", "commons-exact-city-general-view"],
  ["Q158903", "014 Szuszi, Plac miejski.jpg", "commons-exact-city-square"],
  ["Q855634", "From Swaneng Hill, Botswana.jpg", "commons-exact-city-view"],
  ["Q310893", "Walkway in Al Wakrah Old Souq.png", "commons-exact-city-old-town"],
  ["Q310893", "Panoramic view of Al Wakrah seafront.jpg", "commons-exact-city-seafront"],
  ["Q2997727", "Panorama of Corps de Garde, Mauritius.jpg", "commons-exact-poi-panorama"],
  ["Q672458", "Vista desde el valle de la ciudad de San Miguel.jpg", "commons-exact-city-view"],
  ["Q672458", "Ciudad de San Miguel al pie del Volcán Chaparrastique.JPG", "commons-exact-city-view"],
];

fs.mkdirSync(OUTPUT, { recursive: true });
const results = [];
for (const [qid, title, semanticProof] of candidates) {
  const record = byQid.get(qid);
  try {
    const info = await commonsImageInfo(title);
    if (!info.accepted) { results.push({ qid, title, semanticProof, status: "rejected", ...info }); continue; }
    const response = await fetchResponse(info.downloadUrl);
    const source = Buffer.from(await response.arrayBuffer());
    const stem = `${qid.toLowerCase()}-${sha256(Buffer.from(title)).slice(0, 10)}`;
    const sourcePath = path.join(OUTPUT, `${stem}-source`);
    const localPath = path.join(OUTPUT, `${stem}.webp`);
    fs.writeFileSync(sourcePath, source);
    let processed = spawnSync(process.env.PYTHON || "python", [path.join(ROOT, "scripts/process-route-v2-image.py"), "--source", sourcePath, "--target", localPath], { cwd: ROOT, encoding: "utf8", windowsHide: true });
    const line = String(processed.stdout || "").trim().split(/\r?\n/u).at(-1);
    const output = line ? JSON.parse(line) : { status: "FAIL", reasonDetail: String(processed.stderr || "processor-no-output") };
    results.push({ qid, entityId: record.entityId, entityType: record.entityType, canonicalNameEn: record.canonicalNameEn, title, semanticProof,
      status: output.status === "PASS" ? "pendingVisualAudit" : "rejected", sourcePath, localPath, info, processed: output });
  } catch (error) { results.push({ qid, title, semanticProof, status: "rejected", reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: String(error.message || error) }); }
}
fs.writeFileSync(path.join(OUTPUT, "candidates.json"), `${JSON.stringify({ schemaVersion: "route-v2-image-debt-recovery02-hard42-manual-candidates/v1", acquiredAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify({ output: OUTPUT, pending: results.filter(r => r.status === "pendingVisualAudit").length, rejected: results.filter(r => r.status === "rejected").length }));
