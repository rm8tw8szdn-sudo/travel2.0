import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  classifySourceError,
  commonsCategoryCandidates,
  commonsImageInfo,
  disallowedVisualPresentation,
  exactStructuredDepictsCandidates,
  fetchResponse,
  fetchWikidataRecoveryEntities,
  multilingualWikipediaLeadCandidates,
  officialSourceAttempts,
  openverseSourceAttempts,
  preferredP18,
  recoveryIdentityMetadata,
} from "./lib/image-debt-source.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RECOVERY_INVENTORY_PATH = "data/route-v2/images/image-debt-recovery-inventory.json";
const PROVENANCE_PATH = "data/route-v2/images/image-debt-elimination-provenance.json";
const RESULTS_PATH = "data/route-v2/images/image-debt-recovery-results.json";
const BASELINE_PATH = "data/route-v2/images/image-asset-baseline.json";
const RECOVERED_AT = "2026-08-24T13:00:00.000Z";
const ALLOWED_FAILURE_REASONS = new Set([
  "NO_EXACT_IMAGE", "LICENSE_UNVERIFIED", "ENTITY_AMBIGUOUS", "IMAGE_TOO_LOW_QUALITY",
  "ONLY_WATERMARKED_SOURCE", "ONLY_DUPLICATE_SOURCE", "SOURCE_UNAVAILABLE", "SIZE_QUALITY_CONFLICT",
]);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clean = (value) => String(value || "").normalize("NFKC").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const hammingDistance = (left, right) => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
};

async function readJson(relativePath, fallback = null) {
  return fs.existsSync(path.join(ROOT, relativePath)) ? JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")) : fallback;
}

async function atomicWrite(relativePath, contents) {
  const target = path.join(ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try { await writeFile(temporary, contents); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
}

function runProcessor(sourcePath, targetPath) {
  const args = [path.join(ROOT, "scripts/process-route-v2-image.py"), "--source", sourcePath, "--target", targetPath];
  let result = spawnSync(process.env.PYTHON || "python", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status === null) result = spawnSync("python3", args, { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const line = String(result.stdout || "").trim().split(/\r?\n/u).at(-1);
  try { return line ? JSON.parse(line) : { status: "FAIL", reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: "processor-no-output" }; }
  catch { return { status: "FAIL", reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: String(result.stderr || result.error?.message || "processor-invalid-output") }; }
}

function chooseFailure(failures) {
  if (!failures.length) return { reasonCode: "NO_EXACT_IMAGE", reasonDetail: "No licensed exact-entity candidate survived multi-source recovery." };
  const order = ["ENTITY_AMBIGUOUS", "LICENSE_UNVERIFIED", "ONLY_WATERMARKED_SOURCE", "ONLY_DUPLICATE_SOURCE", "IMAGE_TOO_LOW_QUALITY", "SIZE_QUALITY_CONFLICT", "SOURCE_UNAVAILABLE", "NO_EXACT_IMAGE"];
  return [...failures].sort((left, right) => order.indexOf(left.reasonCode) - order.indexOf(right.reasonCode))[0];
}

function candidatePriority(candidate) {
  return ({
    "commons-structured-data-exact-p180": 130,
    "wikipedia-qid-linked-lead-image": 120,
    "commons-qid-linked-category-exact-poi": 110,
    "commons-qid-linked-category-city-representative": 100,
    "wikidata-exact-entity-p18": 90,
  })[candidate.semanticProof] || 0;
}

function candidateKey(candidate) {
  return clean(candidate.fileTitle).toLocaleLowerCase("en-US");
}

function candidateRelevance(record, candidate) {
  const title = clean(candidate.fileTitle).normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en-US");
  const name = clean(record.canonicalNameEn).normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en-US");
  let score = name && title.includes(name) ? 30 : 0;
  if (/(panorama|panoramic|skyline|cityscape|downtown|city cent(?:er|re)|plaza|malec[oó]n|waterfront|aerial|historic cent(?:er|re))/iu.test(title)) score += 20;
  if (/(concert|meeting|visit|ceremony|portrait|interview|conference|lunch|almorzando)/iu.test(title)) score -= 30;
  return score;
}

function cityRepresentativeProblem(record, candidate, info) {
  if (record.entityType !== "City") return null;
  const text = clean(`${candidate.fileTitle} ${info.objectName || ""} ${info.description || ""}`);
  if (/(?:secretary of|president .* tours|official visit|defense\.gov photo essay|air base|media day|addresses members of .* media|u\.s\. navy|dod photo|commander of)/iu.test(text)) return "city-candidate-is-official-or-military-media-event";
  if (/(?:^|[^a-z])(hotel|hosteria|hostería|resort room|private lodging)(?:[^a-z]|$)/iu.test(text)) return "city-candidate-is-private-lodging";
  return null;
}

async function main() {
  const forcedRetryQids = new Set((process.argv.find((value) => value.startsWith("--retry="))?.slice("--retry=".length) || "").split(",").filter(Boolean));
  const inventory = await readJson(RECOVERY_INVENTORY_PATH);
  const provenance = await readJson(PROVENANCE_PATH);
  if (inventory?.schemaVersion !== "route-v2-image-debt-recovery-inventory-v1") throw new Error("recovery-inventory-missing-or-invalid");
  if (provenance?.schemaVersion !== "route-v2-image-debt-elimination-provenance-v1") throw new Error("image-debt-provenance-missing-or-invalid");
  if (sha256(await readFile(path.join(ROOT, PROVENANCE_PATH))) !== inventory.firstPassProvenanceSha256) {
    const existingResults = await readJson(RESULTS_PATH, null);
    if (!existingResults) throw new Error("first-pass-provenance-changed-before-recovery");
  }

  const results = await readJson(RESULTS_PATH, {
    schemaVersion: "route-v2-image-debt-multi-source-recovery-v1",
    recoveredAt: RECOVERED_AT,
    recoveryInventorySha256: sha256(await readFile(path.join(ROOT, RECOVERY_INVENTORY_PATH))),
    startingNeedsBackfill: inventory.startingNeedsBackfill,
    records: [],
  });
  if (results.recoveryInventorySha256 !== sha256(await readFile(path.join(ROOT, RECOVERY_INVENTORY_PATH)))) throw new Error("recovery-inventory-hash-changed");

  const resultById = new Map(results.records.map((record) => [record.entityId, record]));
  const assetById = new Map(provenance.assets.map((record) => [record.entityId, record]));
  const attemptById = new Map(provenance.attempts.map((record) => [record.entityId, record]));
  const pending = inventory.records.filter((record) => !resultById.has(record.entityId)
    || resultById.get(record.entityId)?.retryRequested === true
    || forcedRetryQids.has(record.qid));
  const entities = pending.length ? await fetchWikidataRecoveryEntities(pending.map((record) => record.qid)) : {};
  const baseline = await readJson(BASELINE_PATH, { inventory: [] });
  const boundFiles = new Map(provenance.assets.filter((record) => record.commonsFileTitle).map((record) => [candidateKey(record), record.entityId]));
  const boundHashes = new Map(provenance.assets.filter((record) => record.processedHash).map((record) => [record.processedHash, record.entityId]));
  const perceptual = (baseline.inventory || []).filter((record) => record.perceptualHash?.dhash64).map((record) => ({ hash: record.perceptualHash.dhash64, entityId: record.entityIds?.[0] || null, path: record.path }));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "route-v2-image-debt-recovery-"));

  async function checkpoint() {
    const orderedResults = [...resultById.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
    const recovered = orderedResults.filter((record) => record.finalStatus === "pendingVisualAudit" || record.finalStatus === "imageReady");
    const outputResults = {
      ...results,
      attempted: orderedResults.length,
      successfulRecovery: recovered.length,
      cityRecovery: recovered.filter((record) => record.entityType === "City").length,
      poiRecovery: recovered.filter((record) => record.entityType === "POI").length,
      remaining: orderedResults.filter((record) => record.finalStatus === "needsBackfill").length,
      records: orderedResults,
    };
    await atomicWrite(RESULTS_PATH, `${JSON.stringify(outputResults, null, 2)}\n`);
    const assets = [...assetById.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
    const attempts = [...attemptById.values()].sort((left, right) => left.entityId.localeCompare(right.entityId, "en"));
    await atomicWrite(PROVENANCE_PATH, `${JSON.stringify({
      ...provenance,
      sourcePolicy: "exact Wikidata/Commons/Wikipedia-linked entity media; QID-linked Commons category representatives; approved file-level free license; local deterministic WebP; visual audit required before publication",
      recoveryResultsPath: RESULTS_PATH,
      assetCount: assets.length,
      cityAssetCount: assets.filter((record) => record.entityType === "City").length,
      poiAssetCount: assets.filter((record) => record.entityType === "POI").length,
      assets,
      attempts,
    }, null, 2)}\n`);
  }

  try {
    let completed = inventory.records.length - pending.length;
    for (const record of pending) {
      const previousRecovery = resultById.get(record.entityId) || null;
      const wikidataEntity = entities[record.qid];
      const identity = recoveryIdentityMetadata(wikidataEntity);
      const sourceAttempts = [];
      const failures = [];
      const candidates = [];
      const rejectedFirstPassTitles = new Set([
        ...(record.firstPass.candidateTitles || []),
        ...((previousRecovery?.visualRejections || []).map((entry) => entry.candidateFile)),
      ].map((title) => clean(title).toLocaleLowerCase("en-US")));

      const p18 = preferredP18(wikidataEntity, record.qid);
      if (p18) {
        p18.sourcePath = "wikidata-p18";
        candidates.push(p18);
        sourceAttempts.push({ sourcePath: "wikidata-p18", queryIdentity: record.qid, candidateUrl: `https://www.wikidata.org/wiki/${record.qid}`, candidateFile: p18.fileTitle, status: "candidate", reasonCode: null, reasonDetail: "exact-entity-P18" });
      } else sourceAttempts.push({ sourcePath: "wikidata-p18", queryIdentity: record.qid, candidateUrl: `https://www.wikidata.org/wiki/${record.qid}`, candidateFile: null, status: "rejected", reasonCode: "NO_EXACT_IMAGE", reasonDetail: "exact-entity-has-no-P18" });

      const [depictsResult, wikipedia, categories, officialAttempts, openverseAttempts] = await Promise.all([
        exactStructuredDepictsCandidates(record.qid).then((value) => ({ value, error: null })).catch((error) => ({ value: [], error })),
        multilingualWikipediaLeadCandidates({ qid: record.qid, wikidataEntity, limit: 8 }),
        commonsCategoryCandidates({ qid: record.qid, wikidataEntity, entityType: record.entityType, limitPerCategory: (previousRecovery?.visualRejections || []).length >= 5 || forcedRetryQids.has(record.qid) ? 100 : 18 }),
        officialSourceAttempts({ qid: record.qid, wikidataEntity }),
        openverseSourceAttempts({ record }),
      ]);
      if (!depictsResult.error) {
        const depicts = depictsResult.value;
        sourceAttempts.push({ sourcePath: "commons-structured-depicts", queryIdentity: `${record.qid}:P180`, candidateUrl: `https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3D${record.qid}`, candidateFile: depicts[0]?.fileTitle || null, candidateCount: depicts.length, status: depicts.length ? "candidate-set" : "rejected", reasonCode: depicts.length ? null : "NO_EXACT_IMAGE", reasonDetail: depicts.length ? "exact-P180-candidates" : "no-exact-P180-candidate" });
        candidates.push(...depicts.map((candidate) => ({ ...candidate, sourcePath: "commons-structured-depicts" })));
      } else {
        const failure = classifySourceError(depictsResult.error); failures.push(failure);
        sourceAttempts.push({ sourcePath: "commons-structured-depicts", queryIdentity: `${record.qid}:P180`, candidateUrl: `https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3D${record.qid}`, candidateFile: null, status: "rejected", ...failure });
      }
      sourceAttempts.push(...wikipedia.attempts);
      candidates.push(...wikipedia.candidates);
      sourceAttempts.push(...categories.attempts);
      candidates.push(...categories.candidates);
      sourceAttempts.push(...officialAttempts);
      sourceAttempts.push(...openverseAttempts);

      const labels = [...new Set([...identity.labels, ...identity.aliases, ...record.searchKeys])];
      const uniqueCandidates = [...new Map(candidates.filter((candidate) => candidate.fileTitle).map((candidate) => [candidateKey(candidate), candidate])).values()]
        .sort((left, right) => candidatePriority(right) - candidatePriority(left)
          || candidateRelevance(record, right) - candidateRelevance(record, left)
          || left.fileTitle.localeCompare(right.fileTitle, "en"));
      let chosen = null;
      for (const candidate of uniqueCandidates) {
        const candidateTitleKey = candidateKey(candidate);
        if (rejectedFirstPassTitles.has(candidateTitleKey)) {
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: candidate.identityUrl || null, candidateFile: candidate.fileTitle, status: "rejected", reasonCode: record.firstPass.reasonCode, reasonDetail: `first-pass-rejected:${record.firstPass.reasonDetail}` });
          continue;
        }
        const titleProblem = disallowedVisualPresentation({ fileTitle: candidate.fileTitle });
        if (titleProblem) {
          const failure = { reasonCode: "IMAGE_TOO_LOW_QUALITY", reasonDetail: titleProblem }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: candidate.identityUrl || null, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        const otherEntity = boundFiles.get(candidateTitleKey);
        if (otherEntity && otherEntity !== record.entityId) {
          const failure = { reasonCode: "ONLY_DUPLICATE_SOURCE", reasonDetail: `commons-file-bound:${otherEntity}` }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: candidate.identityUrl || null, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        let info;
        try { info = await commonsImageInfo(candidate.fileTitle); }
        catch (error) { info = { accepted: false, ...classifySourceError(error) }; }
        if (!info.accepted) {
          const failure = { reasonCode: info.reasonCode, reasonDetail: info.reasonDetail }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: candidate.identityUrl || null, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        const representativeProblem = cityRepresentativeProblem(record, candidate, info);
        if (representativeProblem) {
          const failure = { reasonCode: "ENTITY_AMBIGUOUS", reasonDetail: representativeProblem }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: info.sourceUrl, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        let sourceResponse;
        try { sourceResponse = await fetchResponse(info.downloadUrl); }
        catch (error) {
          const failure = classifySourceError(error); failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: info.sourceUrl, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        const contentType = clean(sourceResponse.headers.get("content-type")).toLocaleLowerCase("en-US");
        if (!contentType.startsWith("image/")) {
          const failure = { reasonCode: "SOURCE_UNAVAILABLE", reasonDetail: `download-content-type:${contentType || "missing"}` }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: info.sourceUrl, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
        const sourcePath = path.join(temporaryRoot, `${record.qid}-${sha256(Buffer.from(candidate.fileTitle)).slice(0, 10)}-source`);
        const processedPath = path.join(temporaryRoot, `${record.qid}-${sha256(Buffer.from(candidate.fileTitle)).slice(0, 10)}.webp`);
        await writeFile(sourcePath, sourceBuffer);
        const processed = runProcessor(sourcePath, processedPath);
        if (processed.status !== "PASS") {
          const failure = { reasonCode: ALLOWED_FAILURE_REASONS.has(processed.reasonCode) ? processed.reasonCode : "IMAGE_TOO_LOW_QUALITY", reasonDetail: processed.reasonDetail || "processor-rejected" }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: info.sourceUrl, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        const duplicateEntity = boundHashes.get(processed.processedHash);
        const perceptualDuplicate = perceptual.find((entry) => entry.entityId !== record.entityId && hammingDistance(entry.hash, processed.perceptualHash) <= 5);
        if ((duplicateEntity && duplicateEntity !== record.entityId) || perceptualDuplicate) {
          const failure = { reasonCode: "ONLY_DUPLICATE_SOURCE", reasonDetail: duplicateEntity ? `processed-hash-bound:${duplicateEntity}` : `perceptual-duplicate:${perceptualDuplicate.entityId || "unknown"}:${perceptualDuplicate.path}` }; failures.push(failure);
          sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: info.sourceUrl, candidateFile: candidate.fileTitle, status: "rejected", ...failure });
          continue;
        }
        const kind = record.entityType === "City" ? "cities" : "pois";
        const prefix = record.entityType === "City" ? "city" : "poi";
        const assetPath = `assets/route-v2-images/${kind}/${prefix}-${record.qid.toLocaleLowerCase("en-US")}.webp`;
        await atomicWrite(assetPath, await readFile(processedPath));
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
          acquisitionRound: "multi-source-recovery",
          recoveryGeneration: (previousRecovery?.visualRejections || []).length + 1,
          assetKind: "verified-destination-image",
          assetType: "dedicated-destination-image",
          semanticScope: record.entityType === "City" ? "exact-city" : "exact-poi",
          visualTruthStatus: "pending-human-visual-audit",
          semanticProof: candidate.semanticProof,
          semanticStatementId: candidate.semanticStatementId,
          mediaInfoId: candidate.mediaInfoId || null,
          sourceIdentity: `${record.qid}:${candidate.semanticStatementId || candidate.fileTitle}`,
          sourcePathType: candidate.sourcePath,
          sourceLanguage: candidate.sourceLanguage || null,
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
          rights: { sourceType: candidate.semanticProof, sourceUrl: info.sourceUrl, author: info.author, attribution: info.attribution, license: info.license, licenseUrl: info.licenseUrl, externalCopyrightMaterial: true },
          usageStatus: "pending-visual-audit",
          acquisitionDate: RECOVERED_AT,
          acquiredAt: RECOVERED_AT,
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
          recoverySearchLabels: labels,
        };
        assetById.set(record.entityId, asset);
        boundFiles.set(candidateTitleKey, record.entityId);
        boundHashes.set(processed.processedHash, record.entityId);
        perceptual.push({ hash: processed.perceptualHash, entityId: record.entityId, path: assetPath });
        sourceAttempts.push({ sourcePath: candidate.sourcePath, queryIdentity: candidate.semanticStatementId, candidateUrl: info.sourceUrl, candidateFile: candidate.fileTitle, status: "chosen", reasonCode: null, reasonDetail: "identity-license-quality-size-and-duplicate-gates-passed" });
        chosen = { sourcePath: candidate.sourcePath, semanticProof: candidate.semanticProof, candidateFile: candidate.fileTitle, sourceUrl: info.sourceUrl, license: info.license, licenseUrl: info.licenseUrl, creator: info.creator, processedHash: processed.processedHash, bytes: processed.bytes, width: processed.width, height: processed.height };
        break;
      }

      const failure = chosen ? null : chooseFailure(failures);
      const recoveryRecord = {
        entityId: record.entityId,
        qid: record.qid,
        entityType: record.entityType,
        canonicalNameEn: record.canonicalNameEn,
        countryCode: record.countryCode,
        parentCityQid: record.parentCityQid,
        firstPass: record.firstPass,
        identity: { labels, sitelinks: identity.sitelinks.map((entry) => ({ site: entry.site, language: entry.language, title: entry.title })), commonsCategories: identity.commonsCategories, officialWebsites: identity.officialWebsites },
        sourceAttempts,
        independentSourcePathsAttempted: [...new Set(sourceAttempts.map((attempt) => attempt.sourcePath))],
        candidateCount: uniqueCandidates.length,
        chosenCandidate: chosen,
        visualRejections: previousRecovery?.visualRejections || [],
        finalStatus: chosen ? "pendingVisualAudit" : "needsBackfill",
        finalFailureReason: failure,
        retryRequested: false,
      };
      resultById.set(record.entityId, recoveryRecord);
      attemptById.set(record.entityId, {
        ...attemptById.get(record.entityId),
        status: chosen ? "pendingVisualAudit" : "needsBackfill",
        reasonCode: chosen ? null : failure.reasonCode,
        reasonDetail: chosen ? null : failure.reasonDetail,
        recoveryAttemptCount: sourceAttempts.length,
        recoveryIndependentSourcePaths: recoveryRecord.independentSourcePathsAttempted,
        recoveryFinalFailureReason: failure,
      });
      completed += 1;
      await checkpoint();
      console.log(JSON.stringify({ progress: `${completed}/${inventory.records.length}`, entity: `${record.entityType}:${record.canonicalNameEn}:${record.qid}`, result: recoveryRecord.finalStatus, candidates: uniqueCandidates.length, paths: recoveryRecord.independentSourcePathsAttempted.length }));
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  await checkpoint();
  const finalResults = await readJson(RESULTS_PATH);
  console.log(JSON.stringify({ status: "PASS", attempted: finalResults.attempted, successfulRecovery: finalResults.successfulRecovery, cityRecovery: finalResults.cityRecovery, poiRecovery: finalResults.poiRecovery, remaining: finalResults.remaining, outputs: [RESULTS_PATH, PROVENANCE_PATH] }, null, 2));
}

await main();
