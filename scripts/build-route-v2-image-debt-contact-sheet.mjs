import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const OUTPUT_PATH = "data/route-v2/images/audit/image-debt-contact-sheet.html";

const html = (value) => String(value ?? "").replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
const provenance = JSON.parse(await readFile(path.join(ROOT, PROVENANCE_PATH), "utf8"));
const assets = [...(provenance.assets || [])].sort((left, right) => left.countryCode.localeCompare(right.countryCode, "en")
  || left.entityType.localeCompare(right.entityType, "en")
  || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
  || left.entityId.localeCompare(right.entityId, "en"));
const groups = new Map();
for (const asset of assets) {
  const key = `${asset.countryCode}|${asset.entityType}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(asset);
}
const sections = [...groups].map(([key, records]) => {
  const [countryCode, entityType] = key.split("|");
const cards = records.map((asset) => `<article class="card" data-entity-id="${html(asset.entityId)}" data-acquisition-round="${html(asset.acquisitionRound || "first-pass")}">
  <img src="${html(asset.assetPath)}" alt="${html(asset.canonicalNameEn)} visual audit candidate" loading="lazy">
  <div><strong>${html(asset.canonicalNameEn)}</strong></div>
  <div>${html(asset.wikidataId)} · ${html(asset.entityType)}</div>
  <div>${html(asset.semanticProof)} · ${html(asset.license)}</div>
  <code>${html(asset.assetPath)}</code>
</article>`).join("\n");
  return `<section><h2>${html(countryCode)} · ${html(entityType)} · ${records.length}</h2><div class="grid">${cards}</div></section>`;
}).join("\n");
const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="../../../../">
<title>Route V2 Image Debt Contact Sheet</title>
<style>body{font-family:system-ui,sans-serif;margin:20px;background:#f5f5f2;color:#181818}h1,h2{margin:24px 0 12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{background:#fff;border:1px solid #ccc;border-radius:8px;padding:8px;break-inside:avoid}.card img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover;background:#ddd}.card div,.card code{display:block;margin-top:5px;font-size:12px;overflow-wrap:anywhere}@media(max-width:800px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>
</head><body><h1>Route V2 Image Debt Contact Sheet</h1><p>${assets.length} exact-source candidates pending or completing visual audit. Grouped Country → City → POI. This file is audit-only and is not part of the runtime image consumer chain.</p>${sections}</body></html>\n`;
await mkdir(path.dirname(path.join(ROOT, OUTPUT_PATH)), { recursive: true });
await writeFile(path.join(ROOT, OUTPUT_PATH), document);
console.log(JSON.stringify({ status: "PASS", assets: assets.length, groups: groups.size, output: OUTPUT_PATH }, null, 2));
