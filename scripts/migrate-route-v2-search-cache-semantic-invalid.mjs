import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  authorizeSearchCacheSemanticMigrationDocument,
  discoverSearchCacheIntentViolations,
  SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION,
} from "../src/lib/routes/search-cache-semantic-migration-policy.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function has(name) {
  return process.argv.includes(name);
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function parseDocument(raw, source = "search-cache") {
  const document = JSON.parse(raw);
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`${source}:object-required`);
  }
  if (!document.items || typeof document.items !== "object" || Array.isArray(document.items)) {
    throw new Error(`${source}:items-object-required`);
  }
  return document;
}

function retainedEntriesAreIdentical(beforeItems, afterItems, removedKeys) {
  const removed = new Set(removedKeys);
  const before = Object.entries(beforeItems).filter(([key]) => !removed.has(key));
  const after = Object.entries(afterItems);
  if (before.length !== after.length) return false;
  return before.every(([key, value], index) => (
    after[index]?.[0] === key
    && JSON.stringify(after[index]?.[1]) === JSON.stringify(value)
  ));
}

function writeFileDurably(filePath, contents) {
  const handle = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(handle, contents, "utf8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function writeBackup({ backupRoot, raw, beforeSha256, beforeCount, diagnostics }) {
  const backupDirectory = path.join(backupRoot, safeTimestamp());
  fs.mkdirSync(backupDirectory, { recursive: false });
  const cacheBackupPath = path.join(backupDirectory, "search-cache.json");
  const manifestPath = path.join(backupDirectory, "migration-manifest.json");
  writeFileDurably(cacheBackupPath, raw);
  const manifest = {
    schemaVersion: SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    sourceFile: "search-cache.json",
    sourceSha256: beforeSha256,
    sourceRecordCount: beforeCount,
    isolatedRecords: diagnostics,
  };
  writeFileDurably(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.chmodSync(cacheBackupPath, 0o444);
  fs.chmodSync(manifestPath, 0o444);
  return { backupDirectory, cacheBackupPath, manifestPath };
}

const cachePath = path.resolve(argument(
  "--cache-path",
  path.join(projectRoot, ".route-v2-cache", "search-cache.json"),
));
const backupRoot = path.resolve(argument(
  "--backup-root",
  path.join(os.homedir(), "route-v2-cache-backups"),
));
const apply = has("--apply");
const verifyClean = has("--verify-clean");
const raw = fs.readFileSync(cachePath, "utf8");
const beforeSha256 = sha256(Buffer.from(raw));
const document = parseDocument(raw);
const beforeCount = Object.keys(document.items).length;

if (verifyClean) {
  const invalidReferences = discoverSearchCacheIntentViolations(document);
  const output = {
    status: invalidReferences.length ? "FAIL" : "PASS",
    mode: "verify-clean",
    cacheFile: path.basename(cachePath),
    recordCount: beforeCount,
    bytes: Buffer.byteLength(raw),
    sha256: beforeSha256,
    invalidReferences,
  };
  process[invalidReferences.length ? "stderr" : "stdout"].write(`${JSON.stringify(output, null, 2)}\n`);
  process.exit(invalidReferences.length ? 1 : 0);
}

const authorization = authorizeSearchCacheSemanticMigrationDocument(document);
if (!authorization.authorized) {
  process.stderr.write(`${JSON.stringify({
    status: "FAIL",
    mode: apply ? "apply-refused" : "dry-run-refused",
    cacheFile: path.basename(cachePath),
    reasonCode: authorization.reasonCode,
    migrationSchemaVersion: authorization.migrationSchemaVersion,
    expectedCount: authorization.expectedCount,
    actualCount: authorization.actualCount,
    missingStableKeys: authorization.missingStableKeys,
    unexpectedStableKeys: authorization.unexpectedStableKeys,
    changedStableKeys: authorization.changedStableKeys,
    unexpectedViolationCount: authorization.unexpectedViolationCount,
  }, null, 2)}\n`);
  process.exit(1);
}

const diagnostics = authorization.actualSignatures;
const removedKeys = diagnostics.map((entry) => entry.stableKey);
const migrated = structuredClone(document);
for (const key of removedKeys) delete migrated.items[key];
const afterCount = Object.keys(migrated.items).length;
if (afterCount !== beforeCount - authorization.expectedCount) {
  throw new Error("record-count-delta-invalid");
}
if (!retainedEntriesAreIdentical(document.items, migrated.items, removedKeys)) {
  throw new Error("retained-record-content-or-order-changed");
}
const migratedRaw = `${JSON.stringify(migrated, null, 2)}${raw.endsWith("\n") ? "\n" : ""}`;
const reparsed = parseDocument(migratedRaw, "migrated-search-cache");
if (!retainedEntriesAreIdentical(document.items, reparsed.items, removedKeys)) {
  throw new Error("serialized-retained-record-content-or-order-changed");
}
if (discoverSearchCacheIntentViolations(reparsed).length !== 0) {
  throw new Error("semantic-invalid-record-remains");
}

let backup = null;
if (apply) {
  fs.mkdirSync(backupRoot, { recursive: true });
  backup = writeBackup({
    backupRoot,
    raw,
    beforeSha256,
    beforeCount,
    diagnostics,
  });
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileDurably(temporaryPath, migratedRaw);
    const temporaryRaw = fs.readFileSync(temporaryPath, "utf8");
    parseDocument(temporaryRaw, "temporary-search-cache");
    if (sha256(Buffer.from(temporaryRaw)) !== sha256(Buffer.from(migratedRaw))) {
      throw new Error("temporary-search-cache-hash-mismatch");
    }
    fs.renameSync(temporaryPath, cachePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
  const writtenRaw = fs.readFileSync(cachePath, "utf8");
  const written = parseDocument(writtenRaw, "written-search-cache");
  if (Object.keys(written.items).length !== afterCount) throw new Error("written-record-count-mismatch");
  if (!retainedEntriesAreIdentical(document.items, written.items, removedKeys)) {
    throw new Error("written-retained-record-content-or-order-changed");
  }
  if (discoverSearchCacheIntentViolations(written).length !== 0) throw new Error("written-semantic-invalid-record-remains");
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  mode: apply ? "applied" : "dry-run",
  migrationSchemaVersion: authorization.migrationSchemaVersion,
  authorization: authorization.reasonCode,
  cacheFile: path.basename(cachePath),
  before: {
    recordCount: beforeCount,
    bytes: Buffer.byteLength(raw),
    sha256: beforeSha256,
  },
  after: {
    recordCount: afterCount,
    bytes: Buffer.byteLength(migratedRaw),
    sha256: sha256(Buffer.from(migratedRaw)),
  },
  removed: diagnostics,
  retainedRecordCount: afterCount,
  retainedRecordsIdentical: true,
  backup: backup ? {
    directoryName: path.basename(backup.backupDirectory),
    sourceSha256: beforeSha256,
    readOnly: true,
  } : null,
}, null, 2)}\n`);
