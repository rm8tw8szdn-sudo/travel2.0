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
const outputRootArgument = process.argv.find((value) => value.startsWith("--output-root="))?.slice("--output-root=".length);
const OUTPUT_ROOT = outputRootArgument ? path.resolve(outputRootArgument) : ROOT;
if (outputRootArgument && (!path.isAbsolute(outputRootArgument) || OUTPUT_ROOT === ROOT || !path.relative(ROOT, OUTPUT_ROOT).startsWith(".."))) {
  throw new Error("isolated-output-root-must-be-absolute-and-outside-project");
}
const PROFILE_NAME = process.argv.find((value) => value.startsWith("--profile="))?.slice("--profile=".length) || "legacy";
const PROFILES = Object.freeze({
  legacy: Object.freeze({
    inventoryPath: "data/route-v2/images/image-debt-recovery-inventory.json",
    provenancePath: "data/route-v2/images/image-debt-elimination-provenance.json",
    resultsPath: "data/route-v2/images/image-debt-recovery-results.json",
    inventorySchema: "route-v2-image-debt-recovery-inventory-v1",
    provenanceSchema: "route-v2-image-debt-elimination-provenance-v1",
    resultsSchema: "route-v2-image-debt-multi-source-recovery-v1",
    recoveredAt: "2026-08-24T13:00:00.000Z",
    acquisitionRound: "multi-source-recovery",
    assetRoot: "assets/route-v2-images",
  }),
  recovery02: Object.freeze({
    inventoryPath: "data/route-v2/images/image-debt-recovery02-inventory.json",
    provenancePath: "data/route-v2/images/image-debt-recovery02-provenance.json",
    resultsPath: "data/route-v2/images/image-debt-recovery02-results.json",
    inventorySchema: "route-v2-image-debt-recovery02-inventory-v1",
    provenanceSchema: "route-v2-image-debt-recovery02-provenance-v1",
    resultsSchema: "route-v2-image-debt-recovery02-results-v1",
    recoveredAt: "2026-09-06T01:00:00.000Z",
    acquisitionRound: "image-debt-recovery-02",
    assetRoot: "assets/route-v2-images/recovery02",
  }),
});
const PROFILE = PROFILES[PROFILE_NAME];
if (!PROFILE) throw new Error(`image-recovery-profile-invalid:${PROFILE_NAME}`);
const RECOVERY_INVENTORY_PATH = PROFILE.inventoryPath;
const PROVENANCE_PATH = PROFILE.provenancePath;
const RESULTS_PATH = PROFILE.resultsPath;
const BASELINE_PATH = "data/route-v2/images/image-asset-baseline.json";
const RECOVERED_AT = PROFILE.recoveredAt;
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
  const isolatedState = [PROVENANCE_PATH, RESULTS_PATH].includes(relativePath) && fs.existsSync(path.join(OUTPUT_ROOT, relativePath));
  const source = path.join(isolatedState ? OUTPUT_ROOT : ROOT, relativePath);
  return fs.existsSync(source) ? JSON.parse(await readFile(source, "utf8")) : fallback;
}

async function atomicWrite(relativePath, contents) {
  const target = path.join(OUTPUT_ROOT, relativePath);
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

function recoveryRecordExhausted(sourceAttempts, transientSourceFailure) {
  if (transientSourceFailure) return false;
  const paths = new Set(sourceAttempts.map((attempt) => attempt.sourcePath));
  return [
    "wikidata-p18",
    "commons-structured-depicts",
    "wikipedia-multilingual",
    "official-source",
    "openverse",
  ].every((sourcePath) => paths.has(sourcePath))
    && [...paths].some((sourcePath) => sourcePath.startsWith("commons-qid-linked-category"));
}

async function main() {
  const forcedRetryQids = new Set((process.argv.find((value) => value.startsWith("--retry="))?.slice("--retry=".length) || "").split(",").filter(Boolean));
  const inventory = await readJson(RECOVERY_INVENTORY_PATH);
  if (inventory?.schemaVersion !== PROFILE.inventorySchema) throw new Error("recovery-inventory-missing-or-invalid");
  const inventorySha256 = sha256(await readFile(path.join(ROOT, RECOVERY_INVENTORY_PATH)));
  let provenance = await readJson(PROVENANCE_PATH);
  if (!provenance && PROFILE_NAME === "recovery02") {
    provenance = {
      schemaVersion: PROFILE.provenanceSchema,
      acquiredAt: RECOVERED_AT,
      sourcePolicy: "exact entity-bound Wikidata/Commons/Wikipedia sources; canonical file-level open license; local WebP; visual audit required before publication",
      inventoryPath: RECOVERY_INVENTORY_PATH,
      inventorySha256,
      assets: [],
      attempts: inventory.records.map((record) => ({
        entityId: record.entityId,
        qid: record.qid,
        entityType: record.entityType,
        canonicalNameEn: record.canonicalNameEn,
        countryCode: record.countryCode,
        countryNameEn: record.countryNameEn,
        parentCityEntityId: record.parentCityEntityId,
        parentCityQid: record.parentCityQid,
        parentCityNameEn: record.parentCityNameEn,
        currentPlaceholder: record.currentFallback,
        priority: record.priority,
        routeExposure: record.routeExposure,
        isCorePoi: record.isCorePoi,
        status: "needsBackfill",
        reasonCode: record.failureReason?.reasonCode || "NOT_ATTEMPTED_IN_CURRENT_SCOPE",
        reasonDetail: record.failureReason?.reasonDetail || "Pending Recovery 02 multi-source audit.",
        previousAttemptCount: record.previousAttemptCount,
        exhausted: false,
      })),
      assetCount: 0,
      cityAssetCount: 0,
      poiAssetCount: 0,
    };
    await atomicWrite(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`);
  }
  if (provenance?.schemaVersion !== PROFILE.provenanceSchema) throw new Error("image-debt-provenance-missing-or-invalid");
  if (PROFILE_NAME === "recovery02" && provenance.inventorySha256 !== inventorySha256) {
    throw new Error("recovery02-provenance-inventory-hash-mismatch");
  }
  if (PROFILE_NAME === "legacy" && sha256(await readFile(path.join(ROOT, PROVENANCE_PATH))) !== inventory.firstPassProvenanceSha256) {
    const existingResults = await readJson(RESULTS_PATH, null);
    if (!existingResults) throw new Error("first-pass-provenance-changed-before-recovery");
  }

  const results = await readJson(RESULTS_PATH, {
    schemaVersion: PROFILE.resultsSchema,
    recoveredAt: RECOVERED_AT,
    recoveryInventorySha256: sha256(await readFile(path.join(ROOT, RECOVERY_INVENTORY_PATH))),
    startingNeedsBackfill: inventory.startingNeedsBackfill,
    records: [],
  });
  if (results.schemaVersion !== PROFILE.resultsSchema) throw new Error("recovery-results-schema-invalid");
  if (results.recoveryInventorySha256 !== inventorySha256) throw new Error("recovery-inventory-hash-changed");

  const resultById = new Map(results.records.map((record) => [record.entityId, record]));
  const assetById = new Map(provenance.assets.map((record) => [record.entityId, record]));
  const attemptById = new Map(provenance.attempts.map((record) => [record.entityId, record]));
  const pending = inventory.records.filter((record) => !resultById.has(record.entityId)
    || resultById.get(record.entityId)?.retryRequested === true
    || forcedRetryQids.has(record.qid));
  if (outputRootArgument && pending.some((record) => assetById.get(record.entityId)?.status === "imageReady")) {
    throw new Error("isolated-retry-cannot-replace-already-approved-image");
  }
  const previouslyRejectedTitles = (record) => {
    const previous = resultById.get(record.entityId);
    return [...new Set([
      ...(record.firstPass.candidateTitles || []),
      ...(previous?.visualRejections || []).map((entry) => entry.candidateFile),
      ...((previous?.visualRejections?.length && previous.finalStatus === "needsBackfill") ? [previous.chosenCandidate?.candidateFile] : []),
    ].filter(Boolean).map((title) => clean(title).replaceAll("_", " ").toLocaleLowerCase("en-US")))];
  };
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ profile: PROFILE_NAME, outputRoot: OUTPUT_ROOT, count: pending.length,
      pending: pending.map(record => ({ qid: record.qid, entityId: record.entityId, rejectedTitles: previouslyRejectedTitles(record) })) }, null, 2));
    return;
  }
  const entities = pending.length ? await fetchWikidataRecoveryEntities(pending.map((record) => record.qid)) : {};
  const baseline = await readJson(BASELINE_PATH, { inventory: [] });
  const historicalProvenancePaths = [
    "data/route-v2/images/batch06-dedicated-image-provenance.json",
    "data/route-v2/images/batch07-dedicated-image-provenance.json",
    "data/route-v2/images/batch08-dedicated-image-provenance.json",
    "data/route-v2/images/batch09-dedicated-image-provenance.json",
    "data/route-v2/images/image-debt-elimination-provenance.json",
  ];
  const historicalAssets = historicalProvenancePaths
    .filter((relativePath) => fs.existsSync(path.join(ROOT, relativePath)))
    .flatMap((relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")).assets || []);
  const boundFiles = new Map([...historicalAssets, ...provenance.assets].filter((record) => record.commonsFileTitle).map((record) => [candidateKey(record), record.entityId]));
  const boundHashes = new Map((baseline.inventory || []).filter((record) => record.sha256).map((record) => [record.sha256, record.entityIds?.[0] || record.path]));
  for (const record of provenance.assets.filter((record) => record.processedHash)) boundHashes.set(record.processedHash, record.entityId);
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
      const rejectedFirstPassTitles = new Set(previouslyRejectedTitles(record));

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
      const candidateInfoByKey = new Map();
      const candidateInfoConcurrency = 6;
      let chosen = null;
      for (let candidateIndex = 0; candidateIndex < uniqueCandidates.length; candidateIndex += 1) {
        const candidate = uniqueCandidates[candidateIndex];
        const candidateTitleKey = candidateKey(candidate);
        if (rejectedFirstPassTitles.has(candidateTitleKey.replaceAll("_", " "))) {
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
        if (!candidateInfoByKey.has(candidateTitleKey)) {
          const batch = uniqueCandidates.slice(candidateIndex, candidateIndex + candidateInfoConcurrency);
          const resolved = await Promise.all(batch.map(async (batchCandidate) => {
            try { return [candidateKey(batchCandidate), await commonsImageInfo(batchCandidate.fileTitle)]; }
            catch (error) { return [candidateKey(batchCandidate), { accepted: false, ...classifySourceError(error) }]; }
          }));
          for (const [key, candidateInfo] of resolved) candidateInfoByKey.set(key, candidateInfo);
        }
        const info = candidateInfoByKey.get(candidateTitleKey);
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
        const assetPath = `${PROFILE.assetRoot}/${kind}/${prefix}-${record.qid.toLocaleLowerCase("en-US")}.webp`;
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
          acquisitionRound: PROFILE.acquisitionRound,
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
      const transientSourceFailure = sourceAttempts.some((attempt) => attempt.reasonCode === "SOURCE_UNAVAILABLE"
        && /(?:fetch failed|remote-fetch-failed|timeout|network|ECONN|ENOTFOUND)/iu.test(attempt.reasonDetail || ""));
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
        ...(outputRootArgument ? { retryHistory: [...(previousRecovery?.retryHistory || []), {
          recordedAt: new Date().toISOString(), sourceAttempts: previousRecovery?.sourceAttempts || [],
          chosenCandidate: previousRecovery?.chosenCandidate || null, finalStatus: previousRecovery?.finalStatus || null,
          finalFailureReason: previousRecovery?.finalFailureReason || null,
        }] } : {}),
        visualRejections: previousRecovery?.visualRejections || [],
        finalStatus: chosen ? "pendingVisualAudit" : "needsBackfill",
        finalFailureReason: failure,
        recoveryAttempts: sourceAttempts.length,
        lastAttemptSource: sourceAttempts.at(-1)?.sourcePath || null,
        exhausted: chosen ? false : recoveryRecordExhausted(sourceAttempts, transientSourceFailure),
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
        lastAttemptSource: recoveryRecord.lastAttemptSource,
        exhausted: recoveryRecord.exhausted,
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
