import crypto from "node:crypto";
import fs from "node:fs";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  classifySourceError,
  commonsImageInfo,
  disallowedVisualPresentation,
  exactImageCandidates,
  exactStructuredDepictsCandidates,
  fetchResponse,
  fetchWikidataEntities,
} from "./lib/image-debt-source.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const INVENTORY_PATH = "data/route-v2/images/image-debt-inventory.json";
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const WAVE_RESULTS_PATH = "data/route-v2/images/image-debt-wave-results.json";
const BASELINE_PATH = "data/route-v2/images/image-asset-baseline.json";
const PRIOR_PROVENANCE_PATHS = [
  "data/route-v2/images/batch06-dedicated-image-provenance.json",
  "data/route-v2/images/batch07-dedicated-image-provenance.json",
];
const ACQUIRED_AT = "2026-08-24T08:00:00.000Z";
const WAVE_SIZE = 150;
const ALLOWED_FAILURE_REASONS = new Set([
  "NO_EXACT_IMAGE",
  "LICENSE_UNVERIFIED",
  "ENTITY_AMBIGUOUS",
  "IMAGE_TOO_LOW_QUALITY",
  "ONLY_WATERMARKED_SOURCE",
  "ONLY_DUPLICATE_SOURCE",
  "SOURCE_UNAVAILABLE",
  "SIZE_QUALITY_CONFLICT",
]);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hammingDistance = (left, right) => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
};

async function atomicWrite(relativePath, contents) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, contents);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readJson(relativePath, fallback) {
  return fs.existsSync(path.join(ROOT, relativePath))
    ? JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"))
    : fallback;
}

function chooseFailure(failures) {
  if (!failures.length) return { reasonCode: "NO_EXACT_IMAGE", reasonDetail: "No exact P18 or Commons P180 image candidate exists." };
  const order = ["ENTITY_AMBIGUOUS", "LICENSE_UNVERIFIED", "ONLY_WATERMARKED_SOURCE", "ONLY_DUPLICATE_SOURCE", "IMAGE_TOO_LOW_QUALITY", "SIZE_QUALITY_CONFLICT", "SOURCE_UNAVAILABLE", "NO_EXACT_IMAGE"];
  return [...failures].sort((left, right) => order.indexOf(left.reasonCode) - order.indexOf(right.reasonCode))[0];
}

function runProcessor(sourcePath, targetPath) {
  const args = [path.join(ROOT, "scripts/process-route-v2-image.py"), "--source", sourcePath, "--target", targetPath];
  let result = spawnSync(process.env.PYTHON || "python", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status === null) result = spawnSync("python3", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const line = String(result.stdout || "").trim().split(/\r?\n/u).at(-1);
  const parsed = line ? JSON.parse(line) : { status: "FAIL", reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: String(result.stderr || result.error?.message || "processor-failed") };
  return parsed;
}

function waveNumber(index) {
  return Math.floor(index / WAVE_SIZE) + 1;
}

function counters(attempts) {
  const values = [...attempts.values()];
  return {
    attempted: values.length,
    succeeded: values.filter((record) => record.status === "pendingVisualAudit" || record.status === "imageReady").length,
    remained: values.filter((record) => record.status === "needsBackfill").length,
    semanticReject: values.filter((record) => ["NO_EXACT_IMAGE", "ENTITY_AMBIGUOUS"].includes(record.reasonCode)).length,
    licenseReject: values.filter((record) => record.reasonCode === "LICENSE_UNVERIFIED").length,
    qualityReject: values.filter((record) => ["IMAGE_TOO_LOW_QUALITY", "ONLY_WATERMARKED_SOURCE"].includes(record.reasonCode)).length,
    duplicateReject: values.filter((record) => record.reasonCode === "ONLY_DUPLICATE_SOURCE").length,
    sizeReject: values.filter((record) => record.reasonCode === "SIZE_QUALITY_CONFLICT").length,
    sourceUnavailable: values.filter((record) => record.reasonCode === "SOURCE_UNAVAILABLE").length,
  };
}

async function main() {
  const waveArgument = process.argv.find((value) => value.startsWith("--wave="))?.split("=")[1] || "all";
  const selectedWave = waveArgument === "all" ? null : Number(waveArgument);
  const retryDisallowed = process.argv.includes("--retry-disallowed");
  if (selectedWave !== null && (!Number.isInteger(selectedWave) || selectedWave < 1 || selectedWave > 5)) throw new Error("wave-argument-invalid:--wave=1..5|all");
  const inventory = await readJson(INVENTORY_PATH, null);
  if (!inventory || inventory.schemaVersion !== "route-v2-image-debt-inventory-v1") throw new Error("image-debt-inventory-missing-or-invalid");
  const inventoryHash = sha256(Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`, "utf8"));
  const provenance = await readJson(PROVENANCE_PATH, {
    schemaVersion: "route-v2-image-debt-elimination-provenance-v1",
    acquiredAt: ACQUIRED_AT,
    sourcePolicy: "exact Wikidata P18 or exact Commons structured-data P180, approved free license, local deterministic WebP, visual audit required before publication",
    inventorySha256: inventoryHash,
    assets: [],
    attempts: [],
  });
  if (provenance.inventorySha256 !== inventoryHash) throw new Error("image-debt-inventory-hash-changed");
  const assets = new Map((provenance.assets || []).map((record) => [record.entityId, record]));
  const attempts = new Map((provenance.attempts || []).map((record) => [record.entityId, record]));
  if (retryDisallowed) {
    for (const [entityId, asset] of [...assets]) {
      if (!disallowedVisualPresentation({ fileTitle: asset.originalFilename, objectName: asset.sourceObjectName, description: asset.sourceDescription })) continue;
      const absolutePath = path.resolve(ROOT, asset.assetPath);
      const relativeToImageRoot = path.relative(path.resolve(ROOT, "assets/route-v2-images"), absolutePath);
      if (!relativeToImageRoot || relativeToImageRoot.startsWith("..") || path.isAbsolute(relativeToImageRoot)) throw new Error(`refuse-delete-outside-image-root:${asset.assetPath}`);
      await rm(absolutePath, { force: true });
      assets.delete(entityId);
      attempts.delete(entityId);
    }
  }
  const records = inventory.records.filter((record, index) => selectedWave === null || waveNumber(index) === selectedWave);
  const pending = records.filter((record) => !attempts.has(record.entityId));
  const entities = pending.length ? await fetchWikidataEntities(pending.map((record) => record.qid)) : {};
  const priorAssets = [];
  for (const relativePath of PRIOR_PROVENANCE_PATHS) {
    const document = await readJson(relativePath, { assets: [] });
    priorAssets.push(...(document.assets || []));
  }
  const baseline = await readJson(BASELINE_PATH, { inventory: [] });
  const boundCommonsFiles = new Map(priorAssets.concat([...assets.values()]).filter((record) => record.commonsFileTitle).map((record) => [record.commonsFileTitle, record.entityId]));
  const boundHashes = new Map(priorAssets.concat([...assets.values()]).filter((record) => record.processedHash).map((record) => [record.processedHash, record.entityId]));
  const perceptual = [];
  for (const asset of baseline.inventory || []) {
    if (!["dedicated-city", "dedicated-poi"].includes(asset.category) || !asset.perceptualHash?.dhash64) continue;
    perceptual.push({ hash: asset.perceptualHash.dhash64, entityId: asset.entityIds?.[0] || null, path: asset.path });
  }
  for (const asset of assets.values()) {
    if (asset.perceptualHash) perceptual.push({ hash: asset.perceptualHash, entityId: asset.entityId, path: asset.assetPath });
  }
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "route-v2-image-debt-"));

  async function saveCheckpoint() {
    const document = {
      ...provenance,
      assetCount: assets.size,
      cityAssetCount: [...assets.values()].filter((record) => record.entityType === "City").length,
      poiAssetCount: [...assets.values()].filter((record) => record.entityType === "POI").length,
      assets: [...assets.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
      attempts: [...attempts.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en")),
    };
    await atomicWrite(PROVENANCE_PATH, Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8"));
  }

  try {
    for (const record of pending) {
      const failures = [];
      let candidates = [];
      try {
        candidates = await exactImageCandidates({ qid: record.qid, wikidataEntity: entities[record.qid] });
      } catch (error) {
        failures.push(classifySourceError(error));
      }
      let accepted = false;
      const seenTitles = new Set();
      const tryCandidate = async (candidate) => {
        if (!candidate?.fileTitle || seenTitles.has(candidate.fileTitle)) return false;
        seenTitles.add(candidate.fileTitle);
        const otherEntity = boundCommonsFiles.get(candidate.fileTitle);
        if (otherEntity && otherEntity !== record.entityId) {
          failures.push({ reasonCode: "ONLY_DUPLICATE_SOURCE", reasonDetail: `commons-file-bound:${candidate.fileTitle}:${otherEntity}` });
          return false;
        }
        let info;
        try {
          info = await commonsImageInfo(candidate.fileTitle);
        } catch (error) {
          failures.push(classifySourceError(error));
          return false;
        }
        if (!info.accepted) {
          failures.push({ reasonCode: info.reasonCode, reasonDetail: info.reasonDetail });
          return false;
        }
        let sourceResponse;
        try {
          sourceResponse = await fetchResponse(info.downloadUrl);
        } catch (error) {
          failures.push(classifySourceError(error));
          return false;
        }
        const contentType = String(sourceResponse.headers.get("content-type") || "").toLocaleLowerCase("en-US");
        if (!contentType.startsWith("image/")) {
          failures.push({ reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: `thumbnail-content-type:${contentType || "missing"}` });
          return false;
        }
        const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
        const sourcePath = path.join(temporaryRoot, `${record.qid}-source`);
        const processedPath = path.join(temporaryRoot, `${record.qid}.webp`);
        await writeFile(sourcePath, sourceBuffer);
        const processed = runProcessor(sourcePath, processedPath);
        if (processed.status !== "PASS") {
          failures.push({ reasonCode: ALLOWED_FAILURE_REASONS.has(processed.reasonCode) ? processed.reasonCode : "IMAGE_TOO_LOW_QUALITY", reasonDetail: processed.reasonDetail || "processor-rejected" });
          return false;
        }
        const duplicateEntity = boundHashes.get(processed.processedHash);
        if (duplicateEntity && duplicateEntity !== record.entityId) {
          failures.push({ reasonCode: "ONLY_DUPLICATE_SOURCE", reasonDetail: `processed-hash-bound:${duplicateEntity}` });
          return false;
        }
        const perceptualDuplicate = perceptual.find((entry) => entry.entityId !== record.entityId && hammingDistance(entry.hash, processed.perceptualHash) <= 5);
        if (perceptualDuplicate) {
          failures.push({ reasonCode: "ONLY_DUPLICATE_SOURCE", reasonDetail: `perceptual-duplicate:${perceptualDuplicate.entityId || "unknown"}:${perceptualDuplicate.path}` });
          return false;
        }
        const kind = record.entityType === "City" ? "cities" : "pois";
        const prefix = record.entityType === "City" ? "city" : "poi";
        const assetPath = `assets/route-v2-images/${kind}/${prefix}-${record.qid.toLocaleLowerCase("en-US")}.webp`;
        const processedBuffer = await readFile(processedPath);
        await atomicWrite(assetPath, processedBuffer);
        const asset = {
          entityId: record.entityId,
          wikidataId: record.qid,
          entityType: record.entityType,
          canonicalNameEn: record.canonicalNameEn,
          countryCode: record.countryCode,
          parentCityEntityId: record.parentCityEntityId,
          parentCityQid: record.parentCityQid,
          assetPath,
          localAssetPath: assetPath,
          localPath: assetPath,
          status: "pendingVisualAudit",
          needsBackfill: true,
          assetKind: "verified-destination-image",
          assetType: "dedicated-destination-image",
          semanticScope: record.entityType === "City" ? "exact-city" : "exact-poi",
          visualTruthStatus: "pending-human-visual-audit",
          semanticProof: candidate.semanticProof,
          semanticStatementId: candidate.semanticStatementId,
          mediaInfoId: candidate.mediaInfoId || null,
          sourceIdentity: `${record.qid}:${candidate.semanticStatementId || candidate.fileTitle}`,
          sourcePlatform: info.sourcePlatform,
          sourceUrl: info.sourceUrl,
          originalFilename: candidate.fileTitle,
          commonsFileTitle: candidate.fileTitle,
          commonsDownloadUrl: info.downloadUrl,
          commonsOriginalUrl: info.originalUrl,
          commonsOriginalFileSha1: info.originalFileSha1,
          creator: info.creator,
          author: info.author,
          attribution: info.attribution,
          license: info.license,
          licenseUrl: info.licenseUrl,
          rights: {
            sourceType: candidate.semanticProof,
            sourceUrl: info.sourceUrl,
            author: info.author,
            attribution: info.attribution,
            license: info.license,
            licenseUrl: info.licenseUrl,
            externalCopyrightMaterial: true,
          },
          usageStatus: "pending-visual-audit",
          acquisitionDate: ACQUIRED_AT,
          acquiredAt: ACQUIRED_AT,
          sourceHash: processed.sourceHash,
          processedHash: processed.processedHash,
          perceptualHash: processed.perceptualHash,
          width: processed.width,
          height: processed.height,
          dimensions: { width: processed.width, height: processed.height },
          bytes: processed.bytes,
          format: processed.format,
          verificationStatus: "automated-exact-source-pending-visual-audit",
          visualAuditStatus: "pending",
          sourceDescription: info.description,
          sourceObjectName: info.objectName,
        };
        assets.set(record.entityId, asset);
        attempts.set(record.entityId, { ...record, wave: waveNumber(inventory.records.findIndex((candidateRecord) => candidateRecord.entityId === record.entityId)), status: "pendingVisualAudit", reasonCode: null, reasonDetail: null, commonsFileTitle: candidate.fileTitle });
        boundCommonsFiles.set(candidate.fileTitle, record.entityId);
        boundHashes.set(processed.processedHash, record.entityId);
        perceptual.push({ hash: processed.perceptualHash, entityId: record.entityId, path: assetPath });
        return true;
      };
      for (const candidate of candidates) {
        if (await tryCandidate(candidate)) { accepted = true; break; }
      }
      if (!accepted && preferredCandidateWasPresent(candidates)) {
        try {
          const fallbacks = await exactStructuredDepictsCandidates(record.qid);
          for (const candidate of fallbacks) {
            if (await tryCandidate(candidate)) { accepted = true; break; }
          }
        } catch (error) {
          failures.push(classifySourceError(error));
        }
      }
      if (!accepted) {
        const failure = chooseFailure(failures);
        attempts.set(record.entityId, { ...record, wave: waveNumber(inventory.records.findIndex((candidateRecord) => candidateRecord.entityId === record.entityId)), status: "needsBackfill", ...failure, candidateTitles: [...seenTitles] });
      }
      await saveCheckpoint();
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const waveResults = await readJson(WAVE_RESULTS_PATH, { schemaVersion: "route-v2-image-debt-wave-results-v1", acquiredAt: ACQUIRED_AT, waves: [] });
  const waves = new Map((waveResults.waves || []).map((record) => [record.wave, record]));
  const selectedWaves = selectedWave === null ? [1, 2, 3, 4, 5] : [selectedWave];
  for (const wave of selectedWaves) {
    const ids = new Set(inventory.records.filter((_, index) => waveNumber(index) === wave).map((record) => record.entityId));
    const waveAttempts = new Map([...attempts].filter(([entityId]) => ids.has(entityId)));
    waves.set(wave, { wave, inventoryCount: ids.size, ...counters(waveAttempts) });
  }
  await atomicWrite(WAVE_RESULTS_PATH, `${JSON.stringify({ ...waveResults, inventorySha256: inventoryHash, waves: [...waves.values()].sort((left, right) => left.wave - right.wave), totals: counters(attempts) }, null, 2)}\n`);
  await saveCheckpoint();
  console.log(JSON.stringify({ status: "PASS", selectedWave: selectedWave || "all", pendingBefore: pending.length, assets: assets.size, totals: counters(attempts), outputs: [PROVENANCE_PATH, WAVE_RESULTS_PATH] }, null, 2));
}

function preferredCandidateWasPresent(candidates) {
  return candidates.some((candidate) => candidate.semanticProof === "wikidata-exact-entity-p18");
}

await main();
