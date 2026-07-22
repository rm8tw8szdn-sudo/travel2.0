import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { planEvidenceSeedPromotion, promoteEvidenceSeed } from "../src/lib/routes/evidence-seed-promotion.mjs";
import { normalizeMissingEvidenceManifestItem } from "../src/lib/routes/missing-evidence-manifest-schema.mjs";
import { routeLegEvidenceKey } from "../src/lib/routes/route-leg-evidence-schema.mjs";
import { seasonEvidenceKey } from "../src/lib/routes/season-evidence-schema.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-evidence-promotion-"));
const sourceRoot = path.join(root, "pilot");
const outputRoot = path.join(root, "seed");
const formalRoot = path.resolve("data", "route-v2", "evidence-seed");
fs.mkdirSync(sourceRoot, { recursive: true });

const legs = fs.readFileSync(path.join(formalRoot, "route-leg-evidence.jsonl"), "utf8").trim().split(/\r?\n/u).map(JSON.parse);
const seasons = fs.readFileSync(path.join(formalRoot, "season-evidence.jsonl"), "utf8").trim().split(/\r?\n/u).map(JSON.parse);
const fixedNow = "2026-07-22T00:00:00.000Z";
const manifest = [
  ...legs.map((record) => normalizeMissingEvidenceManifestItem({
    evidenceType: "route-leg",
    targetKey: routeLegEvidenceKey(record),
    legEvidenceId: record.legEvidenceId,
    priority: 80,
    reason: "Pilot record resolved from an official source.",
    requestedByBundleIds: ["eb-promotion-fixture"],
    firstSeenAt: fixedNow,
    lastSeenAt: fixedNow,
    attemptCount: 1,
    status: "resolved",
    diagnostics: [],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }, { now: () => fixedNow })),
  ...seasons.map((record) => normalizeMissingEvidenceManifestItem({
    evidenceType: "season",
    targetKey: seasonEvidenceKey(record),
    seasonEvidenceId: record.seasonEvidenceId,
    priority: 70,
    reason: "Pilot record resolved from an official source.",
    requestedByBundleIds: ["eb-promotion-fixture"],
    firstSeenAt: fixedNow,
    lastSeenAt: fixedNow,
    attemptCount: 1,
    status: "resolved",
    diagnostics: [],
    createdAt: fixedNow,
    updatedAt: fixedNow,
  }, { now: () => fixedNow })),
];
const rejected = normalizeMissingEvidenceManifestItem({
  evidenceType: "route-leg",
  targetKey: "Q34600>Q1490|rail",
  legEvidenceId: "rle-needs-review-fixture",
  priority: 80,
  reason: "Review remains open.",
  requestedByBundleIds: ["eb-promotion-review-fixture"],
  firstSeenAt: fixedNow,
  lastSeenAt: fixedNow,
  attemptCount: 1,
  status: "needs-review",
  diagnostics: [],
  createdAt: fixedNow,
  updatedAt: fixedNow,
}, { now: () => fixedNow });
manifest.push(rejected);
manifest.push(normalizeMissingEvidenceManifestItem({
  evidenceType: "season",
  targetKey: "anchor:JP:matsumoto|2",
  seasonEvidenceId: "se-pending-fixture",
  priority: 70,
  reason: "Collection remains pending.",
  requestedByBundleIds: ["eb-promotion-pending-fixture"],
  firstSeenAt: fixedNow,
  lastSeenAt: fixedNow,
  attemptCount: 0,
  status: "pending",
  diagnostics: [],
  createdAt: fixedNow,
  updatedAt: fixedNow,
}, { now: () => fixedNow }));

fs.writeFileSync(path.join(sourceRoot, "route-leg-evidence.jsonl"), `${legs.map(JSON.stringify).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(sourceRoot, "season-evidence.jsonl"), `${seasons.map(JSON.stringify).join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(sourceRoot, "missing-evidence-manifest.jsonl"), `${manifest.map(JSON.stringify).join("\n")}\n`, "utf8");

const dryRun = promoteEvidenceSeed({ sourceRoot, outputRoot, country: "JP", type: "all", dryRun: true });
assert.equal(dryRun.ok, true);
assert.equal(dryRun.stats.promoted, 12);
assert.equal(dryRun.stats.rejected, 2);
assert.equal(fs.existsSync(outputRoot), false, "dry-run must not write the seed directory");
assert.deepEqual(dryRun.rejected.map((item) => item.reason).sort(), ["manifest-status-needs-review", "manifest-status-pending"]);
assert.equal(planEvidenceSeedPromotion({ sourceRoot, outputRoot, country: "JP", type: "route-leg" }).stats.routeLeg, 6);
assert.equal(planEvidenceSeedPromotion({ sourceRoot, outputRoot, country: "JP", type: "season" }).stats.season, 6);
assert.equal(planEvidenceSeedPromotion({ sourceRoot, outputRoot, country: "US", type: "all" }).stats.promoted, 0);

const first = promoteEvidenceSeed({ sourceRoot, outputRoot, country: "JP", type: "all" });
assert.equal(first.written, true);
assert.deepEqual(first.manifest.counts, { routeLeg: 6, season: 6, total: 12 });
const hashes = new Map(fs.readdirSync(outputRoot).map((name) => [name, fs.readFileSync(path.join(outputRoot, name), "utf8")]));
const second = promoteEvidenceSeed({ sourceRoot, outputRoot, country: "JP", type: "all" });
assert.equal(second.written, false);
assert.equal(second.unchanged, true);
assert.deepEqual(new Map(fs.readdirSync(outputRoot).map((name) => [name, fs.readFileSync(path.join(outputRoot, name), "utf8")])), hashes);

const changedLegs = legs.map((record, index) => index === 0 ? { ...record, confidence: 0.91 } : record);
fs.writeFileSync(path.join(sourceRoot, "route-leg-evidence.jsonl"), `${changedLegs.map(JSON.stringify).join("\n")}\n`, "utf8");
const changed = planEvidenceSeedPromotion({ sourceRoot, outputRoot, country: "JP", type: "all" });
assert(changed.conflicts.length > 0, "changed promoted content must be reported instead of overwritten");
assert.equal(promoteEvidenceSeed({ sourceRoot, outputRoot, country: "JP", type: "all" }).written, false);
assert.deepEqual(new Map(fs.readdirSync(outputRoot).map((name) => [name, fs.readFileSync(path.join(outputRoot, name), "utf8")])), hashes);
fs.writeFileSync(path.join(sourceRoot, "route-leg-evidence.jsonl"), `${legs.map(JSON.stringify).join("\n")}\n`, "utf8");

fs.appendFileSync(path.join(sourceRoot, "route-leg-evidence.jsonl"), `{corrupt\n${JSON.stringify(legs[0])}\n${JSON.stringify({ legEvidenceId: "invalid" })}\n`, "utf8");
const corrupt = planEvidenceSeedPromotion({ sourceRoot, outputRoot: path.join(root, "corrupt-output"), country: "JP", type: "all" });
assert.equal(corrupt.ok, false);
assert(corrupt.diagnostics.some((item) => item.code === "source-json-corrupt"));
assert(corrupt.diagnostics.some((item) => item.code === "source-duplicate-id"));
assert(corrupt.diagnostics.some((item) => item.code === "source-schema-invalid"));

const formalManifest = JSON.parse(fs.readFileSync(path.join(formalRoot, "evidence-seed-manifest.json"), "utf8"));
assert.deepEqual(formalManifest.counts, { routeLeg: 6, season: 6, total: 12 });
assert.equal(new Set(formalManifest.routeLegEvidenceIds).size, 6);
assert.equal(new Set(formalManifest.seasonEvidenceIds).size, 6);
assert(legs.every((record) => record.directed === true && record.feasibilityStatus === "feasible"));
assert(legs.every((record) => record.sources.length > 0 && record.sources.every((source) => /^https:\/\//u.test(source.url))));
assert(seasons.every((record) => record.sources.length > 0 && record.conflicts.length === 0));

fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({
  verifier: "route-v2-evidence-promotion",
  passed: true,
  dryRunWrites: 0,
  promoted: first.stats.promoted,
  routeLeg: first.stats.routeLeg,
  season: first.stats.season,
  rejectedNeedsReviewOrPending: first.stats.rejected,
  idempotentRewrite: second.written,
  formalSeedHash: formalManifest.promotedEvidenceHash,
}, null, 2));
