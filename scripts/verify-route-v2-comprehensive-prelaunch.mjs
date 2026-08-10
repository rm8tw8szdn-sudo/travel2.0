import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_REPOSITORY_SHA256,
  auditRouteV2Cache,
  verifyCacheBaselineV2,
} from "../src/lib/routes/cache-baseline-v2.mjs";
import {
  MANDATORY_PRELAUNCH_VERIFIERS,
  publicVerifierStageResult,
  runMandatoryVerifierStage,
} from "../src/lib/routes/prelaunch-verifier-gate.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realAcceptedPath = path.join(projectRoot, ".route-v2-cache", "accepted-routes.json");
const realCacheRoot = path.join(projectRoot, ".route-v2-cache");
const realKnowledgeRoot = path.join(projectRoot, "data", "knowledge");
const cacheBaselineV2Path = path.join(projectRoot, "route-v2-cache-manifest-v2.json");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-prelaunch-"));
const isolation = {
  accepted: path.join(temporaryRoot, "accepted", "accepted-routes.json"),
  searchCache: path.join(temporaryRoot, "search", "search-cache.json"),
  searchReview: path.join(temporaryRoot, "search", "search-review.json"),
  searchAnalytics: path.join(temporaryRoot, "search", "search-analytics.jsonl"),
  routeImageCache: path.join(temporaryRoot, "images", "route-image-cache.json"),
  imageProxyCache: path.join(temporaryRoot, "images", "proxy"),
  candidatePool: path.join(temporaryRoot, "runtime", "candidate-pool.jsonl"),
  decisionTrace: path.join(temporaryRoot, "runtime", "decision-traces.jsonl"),
  evidenceBundle: path.join(temporaryRoot, "runtime", "evidence-bundles.jsonl"),
  localEvidenceRoot: path.join(temporaryRoot, "local-evidence"),
  routeLegEvidence: path.join(temporaryRoot, "local-evidence", "route-legs.jsonl"),
  seasonEvidence: path.join(temporaryRoot, "local-evidence", "season.jsonl"),
  missingEvidence: path.join(temporaryRoot, "local-evidence", "missing.jsonl"),
  readyPool: path.join(temporaryRoot, "ready", "ready-routes.json"),
  browserProfile: path.join(temporaryRoot, "browser", "profile"),
  screenshots: path.join(temporaryRoot, "browser", "screenshots"),
  performance: path.join(temporaryRoot, "browser", "performance"),
  runtimeMetrics: path.join(temporaryRoot, "runtime", "route-v2-runtime-metrics.json"),
};

let stage = "initialize";
let preview = null;
let port = null;
let serverOutput = "";
const verifierStages = [];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(root, entry.name);
      return entry.isDirectory() ? filesUnder(absolutePath) : [absolutePath];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function snapshot(root) {
  return filesUnder(root).map((absolutePath) => ({
    path: path.relative(root, absolutePath).replaceAll("\\", "/"),
    bytes: fs.statSync(absolutePath).size,
    sha256: sha256(absolutePath),
  }));
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const selected = typeof address === "object" && address ? address.port : null;
      probe.close((error) => (error ? reject(error) : resolve(selected)));
    });
  });
}

async function waitForPreview(baseUrl, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (preview?.exitCode != null) throw new Error(`preview exited early (${preview.exitCode})\n${serverOutput}`);
    try {
      const response = await fetch(new URL("/travel-collection/routes.html", baseUrl), { signal: AbortSignal.timeout(750) });
      if (response.status === 200) return;
    } catch {
      // The preview may still be loading the repository.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`preview did not become ready within ${timeoutMs}ms\n${serverOutput}`);
}

async function stopPreview() {
  if (!preview || preview.exitCode != null) return;
  const exited = new Promise((resolve) => preview.once("exit", resolve));
  preview.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))]);
  if (preview.exitCode == null) {
    preview.kill("SIGKILL");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

async function assertPortReleased(selectedPort) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(selectedPort, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
}

try {
  stage = "prepare-isolation";
  assert(fs.existsSync(realAcceptedPath), "accepted route baseline is required");
  for (const target of Object.values(isolation)) fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const directory of [isolation.browserProfile, isolation.screenshots, isolation.performance, isolation.imageProxyCache]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.copyFileSync(realAcceptedPath, isolation.accepted);

  stage = "snapshot-real-assets";
  assert.equal(sha256(realAcceptedPath), ACCEPTED_REPOSITORY_SHA256, "Accepted repository baseline hash mismatch");
  assert(fs.existsSync(cacheBaselineV2Path), "Cache Baseline V2 manifest is required");
  const cacheBaselineV2 = JSON.parse(fs.readFileSync(cacheBaselineV2Path, "utf8"));
  const cacheAuditBefore = auditRouteV2Cache(realCacheRoot);
  const cacheVerificationBefore = verifyCacheBaselineV2(cacheAuditBefore, cacheBaselineV2);
  assert.equal(cacheVerificationBefore.ok, true, cacheVerificationBefore.errors.join("\n"));
  const assetsBefore = {
    accepted: sha256(realAcceptedPath),
    cache: snapshot(realCacheRoot),
    knowledge: snapshot(realKnowledgeRoot),
  };

  const isolatedEnv = {
    ...process.env,
    HOST: "127.0.0.1",
    ROUTE_ACCEPTED_REPOSITORY_PATH: isolation.accepted,
    SEARCH_CACHE_PATH: isolation.searchCache,
    SEARCH_REVIEW_CANDIDATES_PATH: isolation.searchReview,
    SEARCH_ANALYTICS_PATH: isolation.searchAnalytics,
    ROUTE_IMAGE_CACHE_PATH: isolation.routeImageCache,
    ROUTE_IMAGE_PROXY_CACHE_DIR: isolation.imageProxyCache,
    ROUTE_V2_CANDIDATE_POOL_PATH: isolation.candidatePool,
    ROUTE_V2_TRACE_PATH: isolation.decisionTrace,
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: isolation.evidenceBundle,
    ROUTE_V2_LOCAL_EVIDENCE_ROOT: isolation.localEvidenceRoot,
    ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH: isolation.routeLegEvidence,
    ROUTE_V2_SEASON_EVIDENCE_PATH: isolation.seasonEvidence,
    ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH: isolation.missingEvidence,
    ROUTE_V2_READY_POOL_PATH: isolation.readyPool,
    ROUTE_V2_BROWSER_PROFILE_DIR: isolation.browserProfile,
    ROUTE_V2_SCREENSHOT_DIR: isolation.screenshots,
    ROUTE_V2_PERFORMANCE_DIR: isolation.performance,
    ROUTE_V2_RUNTIME_METRICS_PATH: isolation.runtimeMetrics,
    ROUTE_V2_RUNTIME_ENABLED: "true",
    ROUTE_V2_CANARY_PERCENTAGE: "100",
    ROUTE_V2_INTENT_ENABLED: "true",
    ROUTE_V2_TIME_INTENT_ENABLED: "true",
    ROUTE_V2_CANDIDATE_POOL_ENABLED: "true",
    ROUTE_V2_TRACE_ENABLED: "true",
    ROUTE_V2_EVIDENCE_BUNDLE_ENABLED: "true",
    ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED: "true",
    ROUTE_V2_EVIDENCE_LOCAL_ENABLED: "true",
    ROUTE_V2_EVIDENCE_VALIDATION_ENABLED: "true",
    ROUTE_V2_PUBLICATION_GATE_ENABLED: "true",
    ROUTE_V2_READY_POOL_ENABLED: "true",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
  };
  delete isolatedEnv.ROUTE_WEB_SEARCH_API_KEY;
  delete isolatedEnv.SEARCH_PROVIDER_API_KEY;

  stage = "static-verifiers";
  const staticVerifiers = MANDATORY_PRELAUNCH_VERIFIERS
    .filter((verifier) => verifier.phase === "static")
    .map((verifier) => {
      const result = runMandatoryVerifierStage({
        stage: verifier,
        projectRoot,
        env: isolatedEnv,
      });
      verifierStages.push(result);
      return result;
    });

  stage = "start-preview";
  port = await availablePort();
  assert(Number.isInteger(port) && port > 0, "a dynamic preview port is required");
  const baseUrl = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: { ...isolatedEnv, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  preview.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  preview.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
  await waitForPreview(baseUrl);

  stage = "live-prelaunch-verifier";
  const liveStage = runMandatoryVerifierStage({
    stage: {
      name: "live-prelaunch-browser",
      relativePath: "scripts/verify-route-v2-prelaunch-browser.mjs",
    },
    projectRoot,
    env: {
      ...isolatedEnv,
      ROUTE_V2_PRELAUNCH_BASE_URL: baseUrl,
    },
  });
  verifierStages.push(liveStage);

  stage = "performance-verifier";
  const performanceVerifier = MANDATORY_PRELAUNCH_VERIFIERS
    .find((verifier) => verifier.phase === "performance");
  assert(performanceVerifier, "mandatory performance verifier is required");
  const performanceStage = runMandatoryVerifierStage({
    stage: performanceVerifier,
    projectRoot,
    env: {
      ...isolatedEnv,
      ROUTE_V2_PERFORMANCE_BASE_URL: baseUrl,
    },
  });
  verifierStages.push(performanceStage);

  stage = "stop-preview";
  await stopPreview();
  await assertPortReleased(port);

  stage = "post-performance-verifiers";
  const postPerformanceVerifiers = MANDATORY_PRELAUNCH_VERIFIERS
    .filter((verifier) => verifier.phase === "post-performance")
    .map((verifier) => {
      const result = runMandatoryVerifierStage({
        stage: verifier,
        projectRoot,
        env: isolatedEnv,
      });
      verifierStages.push(result);
      return result;
    });

  stage = "verify-real-assets";
  const assetsAfter = {
    accepted: sha256(realAcceptedPath),
    cache: snapshot(realCacheRoot),
    knowledge: snapshot(realKnowledgeRoot),
  };
  assert.deepEqual(assetsAfter, assetsBefore, "real Accepted, Cache, or Knowledge assets changed");
  const cacheAuditAfter = auditRouteV2Cache(realCacheRoot);
  const cacheVerificationAfter = verifyCacheBaselineV2(cacheAuditAfter, cacheBaselineV2);
  assert.equal(cacheVerificationAfter.ok, true, cacheVerificationAfter.errors.join("\n"));
  assert.deepEqual(cacheAuditAfter, cacheAuditBefore, "Cache Runtime State changed during isolated prelaunch verification");

  const isolatedFiles = snapshot(temporaryRoot);
  process.stdout.write(`${JSON.stringify({
    verifier: "route-v2-comprehensive-prelaunch",
    status: "PASS",
    stage: "complete",
    preview: { dynamicPort: true, portReleased: true },
    isolation: {
      uniqueTemporaryRoot: true,
      acceptedCopy: true,
      searchCache: true,
      imageProxyCache: true,
      localEvidence: true,
      readyPool: true,
      browserProfile: true,
      screenshots: true,
      performance: true,
      filesCreated: isolatedFiles.length,
    },
    verifiers: staticVerifiers.map(({ relativePath }) => relativePath).concat(
      "scripts/verify-route-v2-prelaunch-browser.mjs",
      "scripts/verify-route-v2-intent-performance.mjs",
      postPerformanceVerifiers.map(({ relativePath }) => relativePath),
    ),
    verifierStages: verifierStages.map(publicVerifierStageResult),
    liveProbe: JSON.parse(liveStage.stdout),
    performance: JSON.parse(performanceStage.stdout),
    realAssetsUnchanged: true,
    assetBaselines: {
      accepted: {
        sha256: assetsAfter.accepted,
        matched: assetsAfter.accepted === ACCEPTED_REPOSITORY_SHA256,
      },
      cacheV2: {
        schemaVersion: cacheAuditAfter.schemaVersion,
        immutableFileCount: cacheAuditAfter.immutable.fileCount,
        immutableTotalBytes: cacheAuditAfter.immutable.totalBytes,
        immutableAggregateSha256: cacheAuditAfter.immutable.aggregateSha256,
        runtimeFileCount: cacheAuditAfter.runtimeState.fileCount,
        runtimeTotalBytes: cacheAuditAfter.runtimeState.totalBytes,
        runtimeStructureAudit: cacheAuditAfter.status === "PASS",
        runtimeUnchangedDuringTest: true,
        historicalWholeCacheHashEnforced: false,
      },
      knowledge: {
        fileCount: assetsAfter.knowledge.length,
        unchangedDuringTest: true,
      },
    },
    buildContract: {
      packageManifest: fs.existsSync(path.join(projectRoot, "package.json")),
      productionBuildDefined: false,
      equivalentPreview: "node server.js",
    },
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    verifier: "route-v2-comprehensive-prelaunch",
    status: "FAIL",
    stage,
    error: error?.message || String(error),
    ...(error?.stageResult ? { failingVerifier: publicVerifierStageResult(error.stageResult) } : {}),
    completedVerifierStages: verifierStages.map(publicVerifierStageResult),
  }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await stopPreview().catch(() => null);
  if (port) await assertPortReleased(port).catch(() => null);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
