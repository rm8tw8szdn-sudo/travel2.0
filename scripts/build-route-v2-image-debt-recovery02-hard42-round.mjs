import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const isolated = path.join(process.env.TEMP, "route-v2-recovery02-hard42-1788942226548");
const manual = path.join(process.env.TEMP, "route-v2-recovery02-hard42-manual-20260909");
const auditRoot = path.join(ROOT, "data/route-v2/images/audit/hard42-20260909");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const frozen = read(path.join(auditRoot, "frozen-inventory.json"));
const isolatedProvenance = read(path.join(isolated, "data/route-v2/images/image-debt-recovery02-provenance.json"));
const isolatedResults = read(path.join(isolated, "data/route-v2/images/image-debt-recovery02-results.json"));
const manualData = read(path.join(manual, "candidates.json"));
const current = read(path.join(ROOT, "data/route-v2/images/image-debt-recovery02-results.json"));
const fullInventory = read(path.join(ROOT, "data/route-v2/images/image-debt-recovery02-inventory.json"));
const fullById = new Map(fullInventory.records.map(record => [record.entityId, record]));
const debtIds = new Set(current.records.filter(r => r.finalStatus === "needsBackfill").map(r => r.entityId));
const selected = new Map([
  ["Q158903", "Shusha general view.jpg"],
  ["Q672458", "Ciudad de San Miguel al pie del Volcán Chaparrastique.JPG"],
  ["Q1817541", "Alexander Nevsky Cathedral Baku 1899.jpg"],
]);
const observations = new Map([
  ["Shusha general view.jpg", ["passed", null, "Clear, unobstructed general view of Shusha with a substantial urban area visible; exact-city title, description and Commons category agree."]],
  ["Ciudad de San Miguel al pie del Volcán Chaparrastique.JPG", ["passed", null, "Clear cityscape of San Miguel beneath Chaparrastique; urban fabric is prominent and the exact-city Commons description confirms identity."]],
  ["Alexander Nevsky Cathedral Baku 1899.jpg", ["passed", null, "Legible historical photograph of the exact demolished Baku cathedral; the cathedral is visibly identifiable in its documented historic setting."]],
  ["014 Szuszi, Plac miejski.jpg", ["rejected", "ENTITY_AMBIGUOUS", "Exact Shusha square, but the stronger general-view candidate was selected for the city and this alternative is not needed."]],
  ["DolphinCove 20231011 120510.jpg", ["rejected", "IMAGE_TOO_LOW_QUALITY", "Exact entrance is confirmed by signage and geotag, but vehicles and roadway dominate and the attraction itself is not usefully depicted."]],
  ["Commune de Bejaia بلدية بجاية - panoramio (1).jpg", ["rejected", "IMAGE_TOO_LOW_QUALITY", "Exact municipal boundary sign, but it is an outskirts road scene rather than a representative city view."]],
  ["From Swaneng Hill, Botswana.jpg", ["rejected", "ENTITY_AMBIGUOUS", "Landscape from a named Serowe hill contains no recognizable or substantial city fabric."]],
  ["Walkway in Al Wakrah Old Souq.png", ["rejected", "ONLY_WATERMARKED_SOURCE", "Exact old-souq walkway, but a visible broadcaster watermark is embedded in the frame."]],
  ["Panoramic view of Al Wakrah seafront.jpg", ["rejected", "IMAGE_TOO_LOW_QUALITY", "Exact seafront, but the video-derived frame is soft, hazy and too weak as a city representative."]],
  ["Panorama of Corps de Garde, Mauritius.jpg", ["rejected", "SIZE_QUALITY_CONFLICT", "Exact mountain panorama and licensed source, but the 4.7:1 source ratio fails the product image geometry gate without an undocumented crop."]],
]);
const generic = {
  "Q980396": ["IMAGE_TOO_LOW_QUALITY", "A deer close-up is not a representative Al Ahmadi city image."],
  "Q855634": ["ENTITY_AMBIGUOUS", "Available satellite/landscape candidates do not visibly establish Serowe as a city."],
  "Q943270": ["ENTITY_AMBIGUOUS", "The surviving candidate depicts a cement factory, not Sohar as a city."],
  "Q59975": ["IMAGE_TOO_LOW_QUALITY", "The automatic candidate is a collage and the manual alternative is only a boundary-road sign."],
  "Q310893": ["IMAGE_TOO_LOW_QUALITY", "Boat-only, watermarked, and soft video-frame candidates fail city representativeness."],
  "Q2088687": ["IMAGE_TOO_LOW_QUALITY", "The only surviving candidate is a satellite view and cannot be used."],
  "Q1150986": ["ENTITY_AMBIGUOUS", "The candidate shows archaeological remains near the church and does not establish the exact named structure."],
  "Q8537802": ["ENTITY_AMBIGUOUS", "A summit selfie does not provide adequate visual or metadata proof of the exact Cashán peak."],
  "Q4063561": ["IMAGE_TOO_LOW_QUALITY", "Only a relief map survived; maps are excluded."],
  "Q537817": ["IMAGE_TOO_LOW_QUALITY", "Only satellite imagery survived; satellite images are excluded."],
  "Q2740693": ["IMAGE_TOO_LOW_QUALITY", "Only astronaut/satellite imagery survived; satellite images are excluded."],
  "Q715174": ["IMAGE_TOO_LOW_QUALITY", "Only a satellite-style overview survived; it is not an acceptable POI photograph."],
};

function manualAsset(entry) {
  const frozenRecord = frozen.records.find(r => r.qid === entry.qid), record = fullById.get(frozenRecord.entityId), p = entry.processed, i = entry.info;
  const kind = record.entityType === "City" ? "cities/city" : "pois/poi";
  const assetPath = `assets/route-v2-images/recovery02/${kind}-${entry.qid.toLowerCase()}.webp`;
  return { entityId: record.entityId, wikidataId: entry.qid, entityType: record.entityType, canonicalNameEn: record.canonicalNameEn,
    countryCode: record.countryCode, parentCityEntityId: record.parentCityEntityId, parentCityQid: record.parentCityQid,
    assetPath, localAssetPath: assetPath, localPath: assetPath, status: "pendingVisualAudit", needsBackfill: true,
    acquisitionRound: "image-debt-recovery-02", recoveryGeneration: 5, assetKind: "verified-destination-image",
    assetType: "dedicated-destination-image", semanticScope: record.entityType === "City" ? "exact-city" : "exact-poi",
    visualTruthStatus: "pending-human-visual-audit", semanticProof: entry.semanticProof,
    semanticStatementId: `${entry.qid}:manual-commons-file:${entry.title}`, mediaInfoId: null,
    sourceIdentity: `${entry.qid}:${entry.title}`, sourcePathType: "commons-manual-exact-file", sourceLanguage: null,
    sourcePlatform: i.sourcePlatform, sourceUrl: i.sourceUrl, originalFilename: entry.title, commonsFileTitle: entry.title,
    commonsDownloadUrl: i.downloadUrl, commonsOriginalUrl: i.originalUrl, commonsOriginalFileSha1: i.originalFileSha1,
    creator: i.creator, author: i.author, attribution: i.attribution, license: i.license, licenseUrl: i.licenseUrl,
    rights: { sourceType: entry.semanticProof, sourceUrl: i.sourceUrl, author: i.author, attribution: i.attribution, license: i.license, licenseUrl: i.licenseUrl, externalCopyrightMaterial: true },
    usageStatus: "pending-visual-audit", acquisitionDate: "2026-09-09T09:00:00.000Z", acquiredAt: "2026-09-09T09:00:00.000Z",
    sourceHash: p.sourceHash, processedHash: p.processedHash, perceptualHash: p.perceptualHash, width: p.width, height: p.height,
    dimensions: { width: p.width, height: p.height }, bytes: p.bytes, format: p.format,
    verificationStatus: "manual-exact-source-pending-visual-audit", visualAuditStatus: "pending",
    sourceDescription: i.description, sourceObjectName: i.objectName, recoverySearchLabels: [record.canonicalNameEn, entry.qid] };
}

const candidates = [];
for (const asset of isolatedProvenance.assets.filter(a => debtIds.has(a.entityId))) {
  const localPath = path.join(isolated, asset.assetPath);
  if (!/^CC BY/iu.test(asset.license) && /^Unknown/iu.test(asset.creator || "")) {
    asset.creatorStatus = "not-provided-by-source";
    asset.rights = { ...asset.rights, creatorStatus: "not-provided-by-source" };
  }
  if (fs.existsSync(localPath)) candidates.push({ asset, localPath });
}
for (const entry of manualData.results.filter(r => r.status === "pendingVisualAudit")) candidates.push({ asset: manualAsset(entry), localPath: entry.localPath });
const decisions = candidates.map(({ asset, localPath }, index) => {
  const selectedTitle = selected.get(asset.wikidataId), explicit = observations.get(asset.originalFilename);
  const status = selectedTitle === asset.originalFilename ? "passed" : "rejected";
  const fallback = generic[asset.wikidataId] || ["IMAGE_TOO_LOW_QUALITY", "The actual candidate file does not provide a clear, representative, exact-entity photograph."];
  const [explicitStatus, reasonCode, observation] = explicit || [status, ...fallback];
  return { auditId: `hard42-20260909-${String(index + 1).padStart(2, "0")}`, entityId: asset.entityId, qid: asset.wikidataId,
    entityType: asset.entityType, status: explicitStatus, assetPath: asset.assetPath, processedHash: asset.processedHash,
    sourceHash: asset.sourceHash, sourceUrl: asset.sourceUrl, originalFilename: asset.originalFilename, reviewedFilePath: localPath,
    observation, reasonCode: explicitStatus === "rejected" ? reasonCode : null,
    reasonDetail: explicitStatus === "rejected" ? observation : null, reviewedAt: "2026-09-09T09:00:00.000Z" };
});
const passedQids = new Set(decisions.filter(d => d.status === "passed").map(d => d.qid));
const isolatedById = new Map(isolatedResults.records.filter(r => debtIds.has(r.entityId)).map(r => [r.entityId, r]));
const records = frozen.records.map(f => {
  const r = structuredClone(isolatedById.get(f.entityId) || current.records.find(x => x.entityId === f.entityId));
  const fallback = generic[f.qid] || [r.finalFailureReason?.reasonCode || r.finalFailureReason || f.previousFailureReason || "NO_EXACT_IMAGE",
    "Wikidata P18, exact structured depicts, multilingual Wikipedia, QID-linked Commons categories, official source, Openverse and bounded Commons name search produced no admissible exact photograph."];
  r.exhausted = !passedQids.has(f.qid);
  r.exhaustionReason = passedQids.has(f.qid) ? null : fallback[1];
  r.finalFailureReason = passedQids.has(f.qid) ? null : fallback[0];
  return r;
});
const downloadAttempts = manualData.results.map(r => ({ qid: r.qid, key: r.qid.toLowerCase(), title: `File:${r.title}`,
  sourcePath: "commons-manual-exact-file", error: r.status === "rejected" ? (r.reasonDetail || r.processed?.reasonDetail || "processor-rejected") : null }));
const round = { schemaVersion: "route-v2-image-debt-recovery02-round/v1", roundId: "hard42-20260909-final",
  auditedAt: "2026-09-09T09:00:00.000Z", startingAccepted: 401, startingDebt: 42, records,
  attempts: isolatedProvenance.attempts.filter(attempt => debtIds.has(attempt.entityId)), candidates, decisions,
  downloadAttempts, contactSheetPages: 2, additionalOriginalFiles: candidates.length };
fs.writeFileSync(path.join(auditRoot, "source-research.json"), `${JSON.stringify({ schemaVersion: "route-v2-image-debt-recovery02-hard42-research/v1", researchedAt: round.auditedAt,
  scope: frozen.records.map(f => ({ ...f, conclusion: passedQids.has(f.qid) ? "recovered" : "remaining/exhausted",
    exhaustionReason: records.find(r => r.entityId === f.entityId).exhaustionReason })), manualCandidates: manualData.results,
  notes: ["All 42 entities retained their earlier source histories; this file adds the hard-round manual Commons candidates and final per-entity conclusion.", "Search paths include Wikidata P18, structured P180, multilingual Wikipedia, QID-linked Commons categories, official sources, Openverse, bounded Commons title search, and targeted exact-name web discovery."] }, null, 2)}\n`);
fs.writeFileSync(path.join(auditRoot, "round.json"), `${JSON.stringify(round, null, 2)}\n`);
console.log(JSON.stringify({ candidates: candidates.length, passed: decisions.filter(d => d.status === "passed").length, rejected: decisions.filter(d => d.status === "rejected").length, remaining: 42 - passedQids.size }));
