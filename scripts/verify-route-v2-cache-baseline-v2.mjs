import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_REPOSITORY_SHA256,
  auditRouteV2Cache,
  verifyCacheBaselineV2,
} from "../src/lib/routes/cache-baseline-v2.mjs";
import { createRouteSearchCache } from "../src/lib/routes/route-search-cache.mjs";
import { readKnowledgeGraphCache } from "../src/lib/routes/wikidata-sparql-knowledge-graph.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = path.join(projectRoot, ".route-v2-cache");
const baselinePath = path.join(projectRoot, "route-v2-cache-manifest-v2.json");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-cache-baseline-v2-"));
const copyRoot = path.join(temporaryRoot, "cache-copy");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function restore(relativePath) {
  fs.copyFileSync(path.join(cacheRoot, relativePath), path.join(copyRoot, relativePath));
}

const testResults = {};
let before = null;

try {
  assert(fs.existsSync(baselinePath), "versioned Cache Baseline V2 manifest must exist");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

  before = auditRouteV2Cache(cacheRoot);
  assert.equal(before.status, "PASS", before.errors.join("\n"));
  assert.equal(verifyCacheBaselineV2(before, baseline).ok, true, "current Cache must match Cache Baseline V2");
  assert.equal(before.externalFormal.files[0]?.sha256, ACCEPTED_REPOSITORY_SHA256);

  const repeated = [
    before,
    auditRouteV2Cache(cacheRoot),
    auditRouteV2Cache(cacheRoot),
  ];
  assert.equal(JSON.stringify(repeated[1]), JSON.stringify(repeated[0]), "second manifest run must be byte-identical");
  assert.equal(JSON.stringify(repeated[2]), JSON.stringify(repeated[0]), "third manifest run must be byte-identical");
  testResults.threeIdenticalRuns = true;

  fs.cpSync(cacheRoot, copyRoot, { recursive: true, preserveTimestamps: true });
  const copied = auditRouteV2Cache(copyRoot);
  assert.equal(JSON.stringify(copied), JSON.stringify(before), "repository-external Cache copy must produce the same manifest");
  testResults.externalCopyMatches = true;

  const immutablePath = path.join(copyRoot, "route-evidence.json");
  const immutableStat = fs.statSync(immutablePath);
  fs.utimesSync(immutablePath, new Date(immutableStat.atimeMs + 10_000), new Date(immutableStat.mtimeMs + 20_000));
  const changedMtime = auditRouteV2Cache(copyRoot);
  assert.equal(JSON.stringify(changedMtime), JSON.stringify(before), "mtime changes must not affect the manifest");
  testResults.mtimeIgnored = true;

  const reversed = auditRouteV2Cache(copyRoot, { enumerationOrder: "reverse" });
  assert.equal(JSON.stringify(reversed), JSON.stringify(before), "filesystem enumeration order must not affect the manifest");
  testResults.enumerationOrderIndependent = true;

  const immutableOriginal = fs.readFileSync(immutablePath);
  fs.writeFileSync(immutablePath, Buffer.concat([immutableOriginal, Buffer.from(" ", "utf8")]));
  const changedImmutable = auditRouteV2Cache(copyRoot);
  assert.notEqual(changedImmutable.immutable.aggregateSha256, before.immutable.aggregateSha256);
  assert.equal(verifyCacheBaselineV2(changedImmutable, baseline).ok, false);
  fs.writeFileSync(immutablePath, immutableOriginal);
  testResults.immutableByteChangeDetected = true;

  const runtimePath = path.join(copyRoot, "provider-sync-state.json");
  const runtimeOriginal = fs.readFileSync(runtimePath);
  const runtimePayload = JSON.parse(runtimeOriginal.toString("utf8"));
  const providerId = Object.keys(runtimePayload.providers)[0];
  runtimePayload.providers[providerId].retryAfter = Number(runtimePayload.providers[providerId].retryAfter || 0) + 1;
  fs.writeFileSync(runtimePath, `${JSON.stringify(runtimePayload, null, 2)}\n`, "utf8");
  const changedRuntime = auditRouteV2Cache(copyRoot);
  assert.equal(changedRuntime.status, "PASS", changedRuntime.errors.join("\n"));
  assert.equal(changedRuntime.immutable.aggregateSha256, before.immutable.aggregateSha256);
  assert.notEqual(changedRuntime.runtimeState.auditSha256, before.runtimeState.auditSha256);
  fs.writeFileSync(runtimePath, runtimeOriginal);
  testResults.runtimeChangeDoesNotChangeImmutable = true;

  fs.unlinkSync(runtimePath);
  const missingRuntime = auditRouteV2Cache(copyRoot);
  assert.equal(missingRuntime.status, "FAIL");
  assert(missingRuntime.errors.some((error) => error.includes("provider-sync-state.json:missing-required-runtime-state")));
  restore("provider-sync-state.json");
  testResults.missingRuntimeDetected = true;

  fs.writeFileSync(runtimePath, "{\"schemaVersion\":1,", "utf8");
  const brokenJson = auditRouteV2Cache(copyRoot);
  assert.equal(brokenJson.status, "FAIL");
  assert(brokenJson.errors.some((error) => error.includes("provider-sync-state.json:invalid-json")));
  restore("provider-sync-state.json");
  testResults.corruptJsonDetected = true;

  const analyticsPath = path.join(copyRoot, "search-analytics.jsonl");
  const analyticsOriginal = fs.readFileSync(analyticsPath);
  fs.writeFileSync(analyticsPath, Buffer.concat([analyticsOriginal, Buffer.from("{broken-jsonl\n", "utf8")]));
  const brokenJsonl = auditRouteV2Cache(copyRoot);
  assert.equal(brokenJsonl.status, "FAIL");
  assert(brokenJsonl.errors.some((error) => error.includes("search-analytics.jsonl:invalid-jsonl")));
  fs.writeFileSync(analyticsPath, analyticsOriginal);
  testResults.corruptJsonlDetected = true;

  const corruptSearchCachePath = path.join(temporaryRoot, "corrupt-search-cache.json");
  fs.writeFileSync(corruptSearchCachePath, "{broken", "utf8");
  const searchCache = createRouteSearchCache({
    storagePath: corruptSearchCachePath,
    reviewPath: path.join(temporaryRoot, "review.json"),
  });
  assert.equal(searchCache.findRoute("not-present"), null, "corrupt Search Cache must degrade to an empty cache");

  const corruptKnowledgePath = path.join(temporaryRoot, "corrupt-knowledge-pool.json");
  fs.writeFileSync(corruptKnowledgePath, "{broken", "utf8");
  assert.deepEqual(readKnowledgeGraphCache(corruptKnowledgePath), {}, "corrupt knowledge pool must degrade to an empty pool");
  testResults.runtimeCorruptionSafeFallback = true;

  const after = auditRouteV2Cache(cacheRoot);
  assert.equal(JSON.stringify(after), JSON.stringify(before), "formal Cache files changed during isolated destructive tests");
  assert.equal(sha256(path.join(cacheRoot, "accepted-routes.json")), ACCEPTED_REPOSITORY_SHA256);

  process.stdout.write(`${JSON.stringify({
    verifier: "route-v2-cache-baseline-v2",
    status: "PASS",
    immutable: {
      fileCount: before.immutable.fileCount,
      totalBytes: before.immutable.totalBytes,
      aggregateSha256: before.immutable.aggregateSha256,
      evidenceCount: before.immutable.integrity.evidenceCount,
    },
    runtimeState: {
      fileCount: before.runtimeState.fileCount,
      totalBytes: before.runtimeState.totalBytes,
      required: before.runtimeState.files.filter((entry) => entry.required).map((entry) => entry.path),
      structureAudit: true,
    },
    externalFormal: {
      acceptedSha256: ACCEPTED_REPOSITORY_SHA256,
    },
    tests: testResults,
    formalCacheUnchanged: true,
  }, null, 2)}\n`);
} finally {
  const normalizedTemporaryRoot = path.resolve(temporaryRoot);
  const normalizedOsTemp = path.resolve(os.tmpdir());
  assert(normalizedTemporaryRoot.startsWith(`${normalizedOsTemp}${path.sep}`), "temporary cleanup path must remain under the OS temp directory");
  fs.rmSync(normalizedTemporaryRoot, { recursive: true, force: true });
}
