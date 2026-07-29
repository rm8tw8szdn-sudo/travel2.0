import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { normalizeRouteIntent } from "../src/lib/routes/route-intent-model.mjs";
import {
  AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES,
  authorizeSearchCacheSemanticMigrationDocument,
  authorizeSearchCacheSemanticMigrationSignatures,
} from "../src/lib/routes/search-cache-semantic-migration-policy.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationScript = path.join(projectRoot, "scripts", "migrate-route-v2-search-cache-semantic-invalid.mjs");
const formalCachePath = path.join(projectRoot, ".route-v2-cache", "search-cache.json");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-search-cache-semantic-migration-"));
const backupRoot = path.join(root, "backups");
const ORIGINAL_SOURCE_SHA256 = "b7aa2667d763832baf44cf867f7340cbd52662da2a59dd550be19ed87706464c";

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

function item(intentHash, normalizedIntent, fingerprint) {
  return {
    schemaVersion: 2,
    intentHash,
    intentKey: `intent-key-${intentHash}`,
    routeIntentFingerprintVersion: "route-intent-fingerprint-v1",
    routeIntentFingerprint: fingerprint,
    normalizedIntent,
    status: "needs-review",
    records: [{
      id: `record-${intentHash}`,
      routeIntentFingerprintVersion: "route-intent-fingerprint-v1",
      routeIntentFingerprint: fingerprint,
      normalizedRouteIntent: structuredClone(normalizedIntent),
    }],
  };
}

function run(cachePath, ...args) {
  return spawnSync(process.execPath, [
    migrationScript,
    "--cache-path",
    cachePath,
    "--backup-root",
    backupRoot,
    ...args,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

function writeDocument(name, document) {
  const target = path.join(root, `${name}.json`);
  fs.writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return target;
}

function assertRefusedWithoutWrite(label, document, expectedReason = /migration-authorization-mismatch/u) {
  const cachePath = writeDocument(label, document);
  const before = fs.readFileSync(cachePath);
  const beforeBackups = fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot) : [];
  const result = run(cachePath, "--apply");
  assert.notEqual(result.status, 0, `${label}: apply must fail closed`);
  assert.match(result.stderr, expectedReason, `${label}: structured refusal reason is required`);
  assert.deepEqual(fs.readFileSync(cachePath), before, `${label}: rejected apply must not write`);
  const afterBackups = fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot) : [];
  assert.deepEqual(afterBackups, beforeBackups, `${label}: rejected apply must not create backup`);
}

function locateOriginalBackup() {
  const configured = String(process.env.ROUTE_V2_SEARCH_CACHE_MIGRATION_ORIGINAL_PATH || "").trim();
  if (configured && fs.existsSync(configured)) return configured;
  const rootPath = path.join(os.homedir(), "route-v2-cache-backups");
  if (!fs.existsSync(rootPath)) return "";
  for (const directory of fs.readdirSync(rootPath).sort().reverse()) {
    const cachePath = path.join(rootPath, directory, "search-cache.json");
    const manifestPath = path.join(rootPath, directory, "migration-manifest.json");
    if (!fs.existsSync(cachePath) || !fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (String(manifest.sourceSha256 || "") === ORIGINAL_SOURCE_SHA256
        && sha256(fs.readFileSync(cachePath)) === ORIGINAL_SOURCE_SHA256) return cachePath;
    } catch {
      // A corrupt external backup is never selected as an authorization fixture.
    }
  }
  return "";
}

try {
  const exactSignatureAuthorization = authorizeSearchCacheSemanticMigrationSignatures(
    AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES,
  );
  assert.equal(exactSignatureAuthorization.authorized, true);

  const arbitraryDocument = {
    schemaVersion: 2,
    items: {
      "stable-invalid-a": item("intent-invalid-a", invalidWinterIntent(), `rif-v1-${"a".repeat(64)}`),
      "stable-valid": item("intent-valid", validIntent(), `rif-v1-${"c".repeat(64)}`),
      "stable-invalid-b": item("intent-invalid-b", invalidWinterIntent(), `rif-v1-${"b".repeat(64)}`),
    },
  };
  const arbitraryAuthorization = authorizeSearchCacheSemanticMigrationDocument(arbitraryDocument);
  assert.equal(arbitraryAuthorization.authorized, false);
  assertRefusedWithoutWrite("arbitrary-two", arbitraryDocument);

  const oneTargetAndDecoy = structuredClone(arbitraryDocument);
  delete oneTargetAndDecoy.items["stable-invalid-b"];
  oneTargetAndDecoy.items["stable-decoy"] = item(
    "intent-decoy",
    invalidWinterIntent(),
    `rif-v1-${"d".repeat(64)}`,
  );
  assertRefusedWithoutWrite("target-and-decoy", oneTargetAndDecoy);
  const oneAuthorizedSignatureAndDecoy = [
    structuredClone(AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES[0]),
    {
      ...structuredClone(AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES[1]),
      stableKey: `rif-v1-${"d".repeat(64)}`,
    },
  ];
  assert.equal(
    authorizeSearchCacheSemanticMigrationSignatures(oneAuthorizedSignatureAndDecoy).authorized,
    false,
  );

  const changedHash = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES.map((signature) => ({ ...signature }));
  changedHash[0].itemSha256 = `${"0".repeat(63)}1`;
  assert.equal(authorizeSearchCacheSemanticMigrationSignatures(changedHash).authorized, false);

  const changedPath = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES.map((signature) => ({ ...signature }));
  changedPath[0].fieldPath = "hardConstraints.months";
  assert.equal(authorizeSearchCacheSemanticMigrationSignatures(changedPath).authorized, false);

  const missingTarget = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES.slice(0, 1);
  assert.equal(authorizeSearchCacheSemanticMigrationSignatures(missingTarget).authorized, false);

  const thirdSameType = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES.concat({
    ...AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES[0],
    stableKey: `rif-v1-${"f".repeat(64)}`,
  });
  assert.equal(authorizeSearchCacheSemanticMigrationSignatures(thirdSameType).authorized, false);

  const cleanCopy = path.join(root, "already-migrated.json");
  fs.copyFileSync(formalCachePath, cleanCopy);
  const cleanBefore = fs.readFileSync(cleanCopy);
  const repeated = run(cleanCopy, "--apply");
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /migration-already-applied-or-no-authorized-records/u);
  assert.deepEqual(fs.readFileSync(cleanCopy), cleanBefore);

  const verifyClean = run(cleanCopy, "--verify-clean");
  assert.equal(verifyClean.status, 0, verifyClean.stderr);
  assert.deepEqual(fs.readFileSync(cleanCopy), cleanBefore);

  const arbitraryDryRunPath = writeDocument("arbitrary-dry-run", arbitraryDocument);
  const arbitraryDryRunBefore = fs.readFileSync(arbitraryDryRunPath);
  const arbitraryDryRun = run(arbitraryDryRunPath);
  assert.notEqual(arbitraryDryRun.status, 0);
  assert.deepEqual(fs.readFileSync(arbitraryDryRunPath), arbitraryDryRunBefore);

  const originalBackupPath = locateOriginalBackup();
  let exactAtomicApply = "not-available";
  if (originalBackupPath) {
    const exactCachePath = path.join(root, "authorized-original.json");
    fs.copyFileSync(originalBackupPath, exactCachePath);
    fs.chmodSync(exactCachePath, 0o600);
    const exactBeforeRaw = fs.readFileSync(exactCachePath);
    const exactBeforeDocument = JSON.parse(exactBeforeRaw);
    const exactAuthorization = authorizeSearchCacheSemanticMigrationDocument(exactBeforeDocument);
    assert.equal(exactAuthorization.authorized, true);

    const dryRun = run(exactCachePath);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(JSON.parse(dryRun.stdout).authorization, "migration-authorized-exact-signature-set");
    assert.deepEqual(fs.readFileSync(exactCachePath), exactBeforeRaw);

    const applied = run(exactCachePath, "--apply");
    assert.equal(applied.status, 0, applied.stderr);
    const appliedReport = JSON.parse(applied.stdout);
    assert.equal(appliedReport.mode, "applied");
    assert.equal(appliedReport.before.recordCount - appliedReport.after.recordCount, 2);
    assert.equal(appliedReport.retainedRecordsIdentical, true);
    assert.equal(fs.readdirSync(path.dirname(exactCachePath)).some((name) => name.endsWith(".tmp")), false);
    const migrated = JSON.parse(fs.readFileSync(exactCachePath, "utf8"));
    for (const signature of AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES) {
      assert.equal(Object.hasOwn(migrated.items, signature.stableKey), false);
    }
    const backupDirectory = path.join(backupRoot, appliedReport.backup.directoryName);
    assert.equal(fs.existsSync(path.join(backupDirectory, "search-cache.json")), true);
    assert.equal(fs.statSync(path.join(backupDirectory, "search-cache.json")).mode & 0o222, 0);
    exactAtomicApply = "PASS";
  }

  process.stdout.write(`${JSON.stringify({
    verifier: "route-v2-search-cache-semantic-migration",
    status: "PASS",
    authorizationSchema: exactSignatureAuthorization.migrationSchemaVersion,
    authorizedSignatureCount: exactSignatureAuthorization.actualCount,
    exactSignatureSet: true,
    arbitrarySameTypeRejected: true,
    decoyRejected: true,
    changedItemHashRejected: true,
    changedFieldPathRejected: true,
    missingTargetRejected: true,
    thirdSameTypeRejected: true,
    cleanReapplyDeletesNone: true,
    dryRunAndVerifyWriteNothing: true,
    atomicReplacementOnlyAfterExactAuthorization: true,
    exactHistoricalAtomicApply: exactAtomicApply,
    formalCacheTouched: false,
  }, null, 2)}\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
