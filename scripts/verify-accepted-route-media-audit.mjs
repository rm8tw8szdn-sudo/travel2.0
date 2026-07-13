import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditAcceptedRouteMediaPayload } from "./audit-accepted-route-media.mjs";

const validCover = {
  provider: "wikimedia-commons",
  assetId: "valid.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:valid.jpg",
  imageUrl: "https://upload.wikimedia.org/valid.jpg",
  author: "Author",
  license: "CC BY-SA 4.0",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};

const payload = {
  records: [
    { id: "planner-ok", sourceType: "planner-designed", coverAsset: validCover },
    { id: "legacy-missing-license", sourceType: "source-original", coverAsset: { ...validCover, author: "", license: "" } },
    { id: "legacy-bad-size", sourceType: "source-original", coverAsset: { ...validCover, assetId: "bad.jpg", width: 300, height: 200 } },
    { id: "evidence-missing-cover", sourceType: "evidence-composed", coverAsset: null },
  ],
};

const summary = auditAcceptedRouteMediaPayload(payload);
assert.equal(summary.total, 4);
assert.equal(summary.missingCover, 1);
assert.equal(summary.missingCoverLicense, 1);
assert.equal(summary.invalidCoverDimensions, 1);
assert.equal(summary.plannerDesignedMissingLicense, 0);
assert.equal(summary.bySourceType["planner-designed"].total, 1);
assert.equal(summary.bySourceType["source-original"].missingCoverLicense, 1);
assert.equal(summary.bySourceType["source-original"].invalidCoverDimensions, 1);
assert.equal(summary.bySourceType["evidence-composed"].missingCover, 1);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-media-audit-"));
const inputPath = path.join(tempDir, "accepted-routes.json");
fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2));

const ok = spawnSync(process.execPath, ["scripts/audit-accepted-route-media.mjs", `--input=${inputPath}`, "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(ok.status, 0, ok.stderr || ok.stdout);
assert.equal(JSON.parse(ok.stdout).issueCount, 3);

const fail = spawnSync(process.execPath, ["scripts/audit-accepted-route-media.mjs", `--input=${inputPath}`, "--fail-on-issues"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(fail.status, 1, "audit should fail when --fail-on-issues is passed and issues exist");

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("Accepted route media audit verified.");
