import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { normalizeRouteIntent } from "../src/lib/routes/route-intent-model.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationScript = path.join(projectRoot, "scripts", "migrate-route-v2-search-cache-semantic-invalid.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-search-cache-semantic-migration-"));
const cachePath = path.join(root, "search-cache.json");
const backupRoot = path.join(root, "backups");

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function validIntent() {
  return normalizeRouteIntent({
    intentMode: "specified-destination",
    countryCode: "JP",
    durationDays: 7,
  });
}

function invalidWinterIntent() {
  const intent = validIntent();
  intent.hardConstraints.season = { state: "provided", value: "winter" };
  return intent;
}

function item(intentHash, normalizedIntent) {
  return {
    schemaVersion: 2,
    intentHash,
    normalizedIntent,
    status: "needs-review",
    records: [{
      id: `record-${intentHash}`,
      normalizedRouteIntent: structuredClone(normalizedIntent),
    }],
  };
}

function run(...args) {
  return spawnSync(process.execPath, [migrationScript, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

const document = {
  schemaVersion: 2,
  items: {
    "stable-invalid-a": item("intent-invalid-a", invalidWinterIntent()),
    "stable-valid": item("intent-valid", validIntent()),
    "stable-invalid-b": item("intent-invalid-b", invalidWinterIntent()),
  },
};
const original = `${JSON.stringify(document, null, 2)}\n`;
fs.writeFileSync(cachePath, original, "utf8");
const originalHash = sha256(original);

const dryRun = run("--cache-path", cachePath, "--backup-root", backupRoot);
assert.equal(dryRun.status, 0, dryRun.stderr);
const dryRunReport = JSON.parse(dryRun.stdout);
assert.equal(dryRunReport.mode, "dry-run");
assert.equal(dryRunReport.before.recordCount, 3);
assert.equal(dryRunReport.after.recordCount, 1);
assert.equal(dryRunReport.removed.length, 2);
assert.equal(dryRunReport.retainedRecordsIdentical, true);
assert.equal(sha256(fs.readFileSync(cachePath, "utf8")), originalHash);
assert.equal(fs.existsSync(backupRoot), false, "dry-run must not create a backup or write runtime state");

const applied = run("--cache-path", cachePath, "--backup-root", backupRoot, "--apply");
assert.equal(applied.status, 0, applied.stderr);
const appliedReport = JSON.parse(applied.stdout);
assert.equal(appliedReport.mode, "applied");
assert.equal(appliedReport.before.recordCount, 3);
assert.equal(appliedReport.after.recordCount, 1);
assert.equal(appliedReport.retainedRecordsIdentical, true);
const migrated = JSON.parse(fs.readFileSync(cachePath, "utf8"));
assert.deepEqual(Object.keys(migrated.items), ["stable-valid"]);
assert.deepEqual(migrated.items["stable-valid"], document.items["stable-valid"]);
assert.equal(fs.existsSync(appliedReport.backup.directory), true);
const backup = fs.readFileSync(path.join(appliedReport.backup.directory, "search-cache.json"), "utf8");
assert.equal(sha256(backup), originalHash);
assert.equal(fs.statSync(path.join(appliedReport.backup.directory, "search-cache.json")).mode & 0o222, 0);
assert.equal(fs.readdirSync(path.dirname(cachePath)).some((name) => name.endsWith(".tmp")), false);

const cleanAudit = run("--cache-path", cachePath, "--verify-clean");
assert.equal(cleanAudit.status, 0, cleanAudit.stderr);
const cleanAuditReport = JSON.parse(cleanAudit.stdout);
assert.equal(cleanAuditReport.status, "PASS");
assert.equal(cleanAuditReport.invalidReferences.length, 0);

const repeated = run("--cache-path", cachePath, "--backup-root", backupRoot, "--apply");
assert.notEqual(repeated.status, 0, "an already migrated cache must fail closed instead of removing other records");
assert.match(repeated.stderr, /expected-2-invalid-items-found-0/u);
assert.deepEqual(JSON.parse(fs.readFileSync(cachePath, "utf8")), migrated);

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-search-cache-semantic-migration",
  status: "PASS",
  dryRunNoWrite: true,
  exactRemovalCount: 2,
  retainedRecordsIdentical: true,
  backupReadOnly: true,
  postMigrationSemanticAudit: "PASS",
  repeatedRunFailsClosed: true,
  formalCacheTouched: false,
}, null, 2)}\n`);
