import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { auditImageProvenance, meaningfulCreator } from "./lib/image-provenance-license.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PREFIX = "data/route-v2/images/image-debt-recovery02-";
const AUDIT = `${PREFIX}visual-audit.json`;
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const json = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const git = args => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const sort = records => records.sort((a, b) => a.entityId.localeCompare(b.entityId, "en"));

// No QID blacklist: each decision belongs to one exact file and canonical source.
export function assertRoundBinding(candidate, decision) {
  const a = candidate.asset;
  assert.equal(decision.entityId, a.entityId);
  assert.equal(decision.qid, a.wikidataId);
  assert.equal(decision.entityType, a.entityType);
  assert.equal(decision.assetPath, a.assetPath);
  assert.equal(decision.processedHash, a.processedHash);
  assert.equal(decision.sourceHash, a.sourceHash);
  assert.equal(decision.sourceUrl, a.sourceUrl);
  assert.equal(decision.originalFilename, a.originalFilename);
  assert.equal(path.resolve(decision.reviewedFilePath), path.resolve(candidate.localPath));
  assert(["passed", "rejected"].includes(decision.status));
  assert(decision.observation?.trim());
  if (decision.status === "rejected") assert(decision.reasonCode && decision.reasonDetail);
}

async function main() {
  const input = process.argv.find(v => v.startsWith("--round="))?.slice(8);
  assert(input && path.isAbsolute(input), "absolute --round file required");
  const bytes = fs.readFileSync(input);
  const round = JSON.parse(bytes);
  assert.equal(round.schemaVersion, "route-v2-image-debt-recovery02-round/v1");
  assert(/^[a-z0-9-]+$/u.test(round.roundId));
  assert.equal(git(["branch", "--show-current"]), "codex/route-v2-image-debt-recovery-02");
  assert.equal(git(["rev-parse", "HEAD"]), "826439f41523500ad805d0bcb9966a630e90b859");
  assert.equal(git(["rev-parse", "refs/stash"]), "2a874aa32df41285a150e79d6a8981cee2f032db");
  const provenance = json(`${PREFIX}provenance.json`);
  const results = json(`${PREFIX}results.json`);
  const oldAudit = json(AUDIT);
  assert(!oldAudit.rounds?.some(r => r.roundId === round.roundId), "round-already-promoted");
  assert.equal(provenance.assets.length, round.startingAccepted);
  const debtIds = results.records.filter(r => r.finalStatus === "needsBackfill").map(r => r.entityId).sort();
  assert.equal(debtIds.length, round.startingDebt);
  assert.deepEqual(round.records.map(r => r.entityId).sort(), debtIds);
  assert.equal(new Set(round.records.map(r => r.entityId)).size, round.records.length);
  const acceptedIds = new Set(provenance.assets.map(a => a.entityId));
  const inventory = new Map(json(`${PREFIX}inventory.json`).records.map(r => [r.entityId, r]));
  const candidateByAudit = new Map();
  assert.equal(round.candidates.length, round.decisions.length);
  for (const [index, candidate] of round.candidates.entries()) {
    const a = candidate.asset, d = round.decisions[index], target = inventory.get(a.entityId);
    assertRoundBinding(candidate, d);
    assert(!acceptedIds.has(a.entityId), "accepted-asset-cannot-be-reviewed-or-replaced");
    assert(debtIds.includes(a.entityId));
    assert(target && target.qid === a.wikidataId && target.entityType === a.entityType);
    assert.equal(target.countryCode, a.countryCode);
    assert.equal(target.parentCityEntityId || null, a.parentCityEntityId || null);
    assert.match(a.assetPath, /^assets\/route-v2-images\/recovery02\/(?:cities\/city|pois\/poi)-q\d+\.webp$/u);
    const local = fs.readFileSync(candidate.localPath);
    assert.equal(hash(local), a.processedHash);
    assert.equal(local.length, a.bytes);
    assert(!candidateByAudit.has(d.auditId), "duplicate-audit-id");
    candidateByAudit.set(d.auditId, candidate);
    if (d.status === "passed") {
      assert(a.width >= 640 && a.height >= 360 && a.bytes <= 300000 && a.format === "webp");
      assert(auditImageProvenance({ ...a, status: "imageReady", visualAuditStatus: "passed", usageStatus: "approved-local-runtime" }).valid, `invalid-provenance:${a.entityId}`);
      assert(!fs.existsSync(path.join(ROOT, a.assetPath)), "destination-exists-no-overwrite");
    }
  }
  const passed = round.decisions.filter(d => d.status === "passed");
  assert.equal(new Set(passed.map(d => d.entityId)).size, passed.length, "multiple-passed-images-for-entity");
  const otherAssets = fs.readdirSync(path.join(ROOT, "data/route-v2/images"))
    .filter(name => /^(?:batch\d{2}-dedicated-image-provenance|image-debt-(?:elimination|recovery02)-provenance)\.json$/u.test(name))
    .flatMap(name => json(`data/route-v2/images/${name}`).assets || []);
  for (const d of passed) {
    const a = candidateByAudit.get(d.auditId).asset;
    for (const b of otherAssets.filter(b => b.entityId !== a.entityId)) {
      assert.notEqual(a.processedHash, b.processedHash, "exact-duplicate");
      if (/^[0-9a-f]{16}$/u.test(a.perceptualHash) && /^[0-9a-f]{16}$/u.test(b.perceptualHash)) {
        let bits = BigInt(`0x${a.perceptualHash}`) ^ BigInt(`0x${b.perceptualHash}`), distance = 0;
        while (bits) { distance += Number(bits & 1n); bits >>= 1n; }
        assert(distance > 5, `perceptual-duplicate:${a.entityId}:${b.entityId}`);
      }
    }
    otherAssets.push(a);
  }
  for (const a of provenance.assets) assert.equal(hash(fs.readFileSync(path.join(ROOT, a.assetPath))), a.processedHash);
  const archive = `data/route-v2/images/audit/${round.roundId}`;
  const roundPath = `${archive}/round.json`, historyPath = `${archive}/previous-visual-audit.json`;
  assert(!fs.existsSync(path.join(ROOT, archive)), "history-directory-exists");
  const byId = new Map(provenance.assets.map(a => [a.entityId, a]));
  const decisions = new Map(oldAudit.decisions.map(d => [d.entityId, d]));
  const attempts = new Map(provenance.attempts.map(r => [r.entityId, r]));
  const recordMap = new Map(results.records.map(r => [r.entityId, r]));
  for (const r of round.records) {
    const events = round.decisions.filter(d => d.entityId === r.entityId);
    const decision = events.find(d => d.status === "passed") || events.at(-1);
    const additions = round.downloadAttempts.filter(d => {
      const qid = d.qid || ({ dilijan: "Q39569", osh: "Q47282", francistown: "Q165422", "francistown-backup": "Q165422" })[d.key];
      assert(qid && [...inventory.values()].some(t => t.qid === qid && debtIds.includes(t.entityId)), "download-entity-identity-required");
      return qid === r.qid;
    }).map(d => ({ sourcePath: d.sourcePath || "commons-user-supplied-exact-file", queryIdentity: r.qid,
      candidateFile: d.title.slice(5), candidateUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(d.title.replaceAll(" ", "_"))}`,
      status: d.error ? "rejected" : "downloaded-awaiting-visual-decision", reasonCode: d.error ? "SOURCE_UNAVAILABLE" : null,
      reasonDetail: d.error || "Original SHA1 matched file metadata; decoded and processed locally.", attempt: d.attempt || 1 }));
    const next = { ...r, sourceAttempts: [...r.sourceAttempts, ...additions], exhausted: Boolean(r.exhausted), retryRequested: false,
      exhaustionReason: r.exhaustionReason || "Bounded candidate review completed; alternative-source exhaustion not established.",
      visualRejections: [...(r.visualRejections || []), ...events.filter(d => d.status === "rejected")],
      visualReviewHistory: [...(r.visualReviewHistory || []), ...events], roundAuditPath: roundPath };
    next.recoveryAttempts = next.sourceAttempts.length;
    next.independentSourcePathsAttempted = [...new Set(next.sourceAttempts.map(a => a.sourcePath))];
    const previousAttempt = round.attempts.find(a => a.entityId === r.entityId);
    let finalReason = typeof r.finalFailureReason === "string" ? r.finalFailureReason : r.finalFailureReason?.reasonCode;
    if (decision) {
      decisions.set(r.entityId, decision);
      const a = candidateByAudit.get(decision.auditId).asset;
      next.chosenCandidate = { sourcePath: a.sourcePathType, semanticProof: a.semanticProof, candidateFile: a.originalFilename,
        sourceUrl: a.sourceUrl, license: a.license, licenseUrl: a.licenseUrl, creator: a.creator, processedHash: a.processedHash,
        bytes: a.bytes, width: a.width, height: a.height };
      finalReason = decision.status === "passed" ? null : decision.reasonCode;
      if (decision.status === "passed") byId.set(r.entityId, { ...a, status: "imageReady", needsBackfill: false,
        creatorStatus: meaningfulCreator(a.creator) ? null : "not-provided-by-source",
        usageStatus: "approved-local-runtime", verificationStatus: "verified-exact-entity-source-license-size-and-visual-audit",
        visualTruthStatus: a.entityType === "City" ? "verified-exact-city-photograph" : "verified-exact-poi-photograph",
        visualAuditStatus: "passed", visualAuditId: decision.auditId, visualAuditPath: AUDIT, roundAuditPath: roundPath });
    } else {
      const priorDecision = decisions.get(r.entityId);
      assert(next.chosenCandidate == null || (priorDecision && priorDecision.processedHash === next.chosenCandidate.processedHash), "candidate-without-review");
    }
    next.finalStatus = byId.has(r.entityId) ? "imageReady" : "needsBackfill";
    next.finalFailureReason = finalReason;
    assert(next.finalStatus === "imageReady" || finalReason, "unresolved-reason-missing");
    recordMap.set(r.entityId, next);
    attempts.set(r.entityId, { ...previousAttempt, status: next.finalStatus, reasonCode: finalReason,
      reasonDetail: decision?.reasonDetail || previousAttempt.reasonDetail, recoveryFinalFailureReason: finalReason,
      recoveryAttempts: next.recoveryAttempts, recoveryAttemptCount: next.recoveryAttempts,
      recoveryIndependentSourcePaths: next.independentSourcePathsAttempted, exhausted: next.exhausted,
      exhaustionReason: next.exhaustionReason, visualAuditId: decision?.auditId || previousAttempt.visualAuditId || null, roundAuditPath: roundPath });
  }
  const current = sort([...decisions.values()]);
  const audit = { ...oldAudit, auditedAt: round.auditedAt, method: "agent-visual-review-with-preserved-file-bound-history",
    provenanceSha256: hash(bytes), sourceSnapshotPath: roundPath, totalReviewed: current.length,
    passed: current.filter(d => d.status === "passed").length, rejected: current.filter(d => d.status === "rejected").length,
    decisions: current, rounds: [...(oldAudit.rounds || []), { roundId: round.roundId, path: roundPath, sha256: hash(bytes),
      previousAuditPath: historyPath, previousAuditSha256: hash(fs.readFileSync(path.join(ROOT, AUDIT))),
      reviewed: round.decisions.length, passed: passed.length, rejected: round.decisions.length - passed.length,
      contactSheetPages: round.contactSheetPages ?? 0, additionalOriginalFiles: round.additionalOriginalFiles ?? round.candidates.length }],
    countMeaning: "decisions are current selected candidates; round files preserve all superseded and rejected review events" };
  const assets = sort([...byId.values()]), records = sort([...recordMap.values()]);
  const nextProvenance = { ...provenance, assets, attempts: sort([...attempts.values()]), assetCount: assets.length,
    cityAssetCount: assets.filter(a => a.entityType === "City").length, poiAssetCount: assets.filter(a => a.entityType === "POI").length,
    visualAuditSourceProvenanceSha256: audit.provenanceSha256, latestRoundPath: roundPath };
  const nextResults = { ...results, records, successfulRecovery: assets.length, cityRecovery: nextProvenance.cityAssetCount,
    poiRecovery: nextProvenance.poiAssetCount, remaining: records.filter(r => r.finalStatus === "needsBackfill").length,
    visualAudit: { reviewed: audit.totalReviewed, passed: audit.passed, rejected: audit.rejected } };
  const result = { status: "PASS", newPassed: passed.length, recovered: assets.length, remaining: nextResults.remaining };
  if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ ...result, dryRun: true })); return; }
  fs.mkdirSync(path.join(ROOT, archive), { recursive: true });
  fs.writeFileSync(path.join(ROOT, roundPath), bytes, { flag: "wx" });
  fs.copyFileSync(path.join(ROOT, AUDIT), path.join(ROOT, historyPath), fs.constants.COPYFILE_EXCL);
  for (const d of passed) fs.copyFileSync(candidateByAudit.get(d.auditId).localPath, path.join(ROOT, d.assetPath), fs.constants.COPYFILE_EXCL);
  for (const [file, data] of [[AUDIT, audit], [`${PREFIX}provenance.json`, nextProvenance], [`${PREFIX}results.json`, nextResults]])
    fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main();
