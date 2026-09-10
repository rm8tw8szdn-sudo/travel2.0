import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "data/route-v2/images/audit/hard42-20260909");
const load = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const git = args => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

assert.equal(git(["branch", "--show-current"]), "codex/route-v2-image-debt-recovery-02");
assert.equal(git(["rev-parse", "HEAD"]), "826439f41523500ad805d0bcb9966a630e90b859");
assert.equal(git(["rev-parse", "refs/stash"]), "2a874aa32df41285a150e79d6a8981cee2f032db");

const results = load("data/route-v2/images/image-debt-recovery02-results.json");
const manifest = load("data/route-v2/images/image-coverage-manifest.json");
const provenance = load("data/route-v2/images/image-debt-recovery02-provenance.json");
const inventory = load("data/route-v2/images/image-debt-recovery02-inventory.json");
assert.equal(provenance.assets.length, 401);
for (const asset of provenance.assets) {
  assert.equal(hash(fs.readFileSync(path.join(ROOT, asset.assetPath))), asset.processedHash,
    `accepted-byte-mismatch:${asset.entityId}`);
}

const remaining = results.records.filter(record => record.finalStatus === "needsBackfill");
assert.equal(remaining.length, 42);
assert.equal(remaining.filter(record => record.entityType === "City").length, 12);
assert.equal(remaining.filter(record => record.entityType === "POI").length, 30);
const manifestRecords = [...manifest.cities, ...manifest.pois];
const inventoryById = new Map(inventory.records.map(record => [record.entityId, record]));

function classify(record) {
  const attempts = record.sourceAttempts || [];
  const codes = new Set(attempts.map(attempt => attempt.reasonCode).filter(Boolean));
  const reason = typeof record.finalFailureReason === "string"
    ? record.finalFailureReason : record.finalFailureReason?.reasonCode;
  if (reason === "LICENSE_UNVERIFIED" || [...codes].some(code => /LICENSE|ATTRIBUTION/u.test(code)))
    return { group: "A", label: "exact image exists, license problem" };
  if (reason === "ENTITY_AMBIGUOUS") return { group: "B", label: "exact image exists, identity uncertain" };
  if (reason === "IMAGE_TOO_LOW_QUALITY" && record.chosenCandidate)
    return { group: "C", label: "exact image exists, quality too low" };
  if (reason === "NO_EXACT_IMAGE") return { group: "D", label: "Commons/Wikipedia no direct image" };
  if (reason === "IMAGE_TOO_LOW_QUALITY") return { group: "E", label: "QID/category exists but no usable file" };
  if (reason === "SOURCE_UNAVAILABLE" || attempts.some(attempt => /429|rate.?limit|temporar/iu.test(attempt.reasonDetail || "")))
    return { group: "F", label: "source temporarily unavailable/rate-limited" };
  if (reason === "ONLY_DUPLICATE_SOURCE") return { group: "G", label: "likely no public exact photo" };
  if (reason === "ENTITY_AMBIGUOUS") return { group: "H", label: "naming/entity ambiguity" };
  return { group: "I", label: "other" };
}

const records = remaining.map(record => {
  const source = inventoryById.get(record.entityId);
  const published = manifestRecords.find(item => item.entityId === record.entityId);
  assert(source && published, `published-record-missing:${record.entityId}`);
  const attempts = record.sourceAttempts || [];
  const finalReason = typeof record.finalFailureReason === "string"
    ? record.finalFailureReason : record.finalFailureReason?.reasonCode;
  return {
    entityId: record.entityId,
    qid: record.qid,
    canonicalNameEn: record.canonicalNameEn,
    countryCode: record.countryCode,
    countryNameEn: record.countryNameEn,
    parentCityEntityId: record.parentCityEntityId || null,
    parentCityQid: record.parentCityQid || null,
    parentCityNameEn: record.parentCityNameEn || null,
    entityType: record.entityType,
    debtType: record.entityType === "City" ? "City" : "Core POI",
    currentPlaceholder: published.imagePath || published.cover || published.currentFallback || source.currentFallback,
    previousAttempts: attempts.length,
    previousFailureReason: finalReason,
    sourceHistory: attempts,
    rateLimited: attempts.some(attempt => /429|rate.?limit/iu.test(attempt.reasonDetail || "")),
    identityAmbiguous: finalReason === "ENTITY_AMBIGUOUS" || attempts.some(attempt => attempt.reasonCode === "ENTITY_AMBIGUOUS"),
    licenseBlocked: finalReason === "LICENSE_UNVERIFIED" || attempts.some(attempt => /LICENSE|ATTRIBUTION/u.test(attempt.reasonCode || "")),
    lowResolutionOnly: attempts.some(attempt => /source-dimensions|too-small|min-width|min-height/iu.test(attempt.reasonDetail || "")),
    classification: classify(record),
  };
}).sort((a, b) => (a.entityType === b.entityType ? a.canonicalNameEn.localeCompare(b.canonicalNameEn, "en")
  : a.entityType === "POI" ? -1 : 1));

const counts = Object.fromEntries("ABCDEFGHI".split("").map(group => [group, records.filter(r => r.classification.group === group).length]));
const snapshot = {
  schemaVersion: "route-v2-image-debt-recovery02-hard42-inventory/v1",
  frozenAt: new Date().toISOString(),
  branch: git(["branch", "--show-current"]),
  head: git(["rev-parse", "HEAD"]),
  stash: git(["rev-parse", "refs/stash"]),
  acceptedAtEntry: provenance.assets.length,
  total: records.length,
  city: records.filter(r => r.entityType === "City").length,
  corePoi: records.filter(r => r.entityType === "POI").length,
  records,
};
fs.mkdirSync(OUTPUT, { recursive: true });
fs.writeFileSync(path.join(OUTPUT, "frozen-inventory.json"), `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
fs.writeFileSync(path.join(OUTPUT, "classification.json"), `${JSON.stringify({ classifiedAt: snapshot.frozenAt, counts,
  groups: Object.fromEntries("ABCDEFGHI".split("").map(group => [group, records.filter(r => r.classification.group === group).map(r => ({ entityId: r.entityId, qid: r.qid, name: r.canonicalNameEn }))])) }, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: "PASS", total: records.length, city: snapshot.city, corePoi: snapshot.corePoi, counts }));
