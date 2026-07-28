import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function numericOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1));
}

function stats(values) {
  const average = mean(values);
  const deviation = standardDeviation(values);
  return {
    samples: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    p99Ms: Number(percentile(values, 0.99).toFixed(3)),
    maxMs: Number(Math.max(...values, 0).toFixed(3)),
    meanMs: Number(average.toFixed(3)),
    standardDeviationMs: Number(deviation.toFixed(3)),
    coefficientOfVariation: Number((average ? deviation / average : 0).toFixed(6)),
  };
}

async function availablePort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  assert(Number.isInteger(port) && port > 0);
  return port;
}

async function waitForServer(child, baseUrl, output, timeoutMs = 30_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`server exited ${child.exitCode}\n${output.text}`);
    }
    try {
      const response = await fetch(new URL("/travel-collection/routes.html?localOnly=1", baseUrl), {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) {
        await response.arrayBuffer();
        return performance.now() - startedAt;
      }
    } catch {
      // Import and repository initialization may still be running.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`server readiness timeout\n${output.text}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 4_000))]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

async function assertPortReleased(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function isolatedEnvironment(runRoot, port) {
  const env = {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    ROUTE_ACCEPTED_REPOSITORY_PATH: path.join(runRoot, "accepted", "accepted-routes.json"),
    SEARCH_CACHE_PATH: path.join(runRoot, "search", "search-cache.json"),
    SEARCH_REVIEW_CANDIDATES_PATH: path.join(runRoot, "search", "search-review.json"),
    SEARCH_ANALYTICS_PATH: path.join(runRoot, "search", "search-analytics.jsonl"),
    ROUTE_IMAGE_CACHE_PATH: path.join(runRoot, "images", "route-image-cache.json"),
    ROUTE_IMAGE_PROXY_CACHE_DIR: path.join(runRoot, "images", "proxy"),
    ROUTE_PROVIDER_SYNC_STATE_PATH: path.join(runRoot, "runtime", "provider-sync-state.json"),
    ROUTE_KNOWLEDGE_GRAPH_POOL_PATH: path.join(runRoot, "runtime", "knowledge-graph-pool.json"),
    ROUTE_V2_CANDIDATE_POOL_PATH: path.join(runRoot, "runtime", "candidate-pool.jsonl"),
    ROUTE_V2_TRACE_PATH: path.join(runRoot, "runtime", "decision-traces.jsonl"),
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: path.join(runRoot, "runtime", "evidence-bundles.jsonl"),
    ROUTE_V2_LOCAL_EVIDENCE_ROOT: path.join(runRoot, "local-evidence"),
    ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH: path.join(runRoot, "local-evidence", "route-legs.jsonl"),
    ROUTE_V2_SEASON_EVIDENCE_PATH: path.join(runRoot, "local-evidence", "seasons.jsonl"),
    ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH: path.join(runRoot, "local-evidence", "missing.jsonl"),
    ROUTE_V2_READY_POOL_PATH: path.join(runRoot, "ready", "ready-routes.json"),
    ROUTE_V2_RUNTIME_ENABLED: "true",
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
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "1",
    SEARCH_PLANNER_TIMEOUT_MS: "2000",
  };
  delete env.ROUTE_WEB_SEARCH_API_KEY;
  delete env.SEARCH_PROVIDER_API_KEY;
  return env;
}

function prepareRunRoot(stateRoot, runRoot) {
  const directories = [
    "accepted",
    "search",
    "images/proxy",
    "runtime",
    "local-evidence",
    "ready",
  ];
  for (const directory of directories) fs.mkdirSync(path.join(runRoot, directory), { recursive: true });
  fs.copyFileSync(
    path.join(stateRoot, ".route-v2-cache", "accepted-routes.json"),
    path.join(runRoot, "accepted", "accepted-routes.json"),
  );
}

async function startServer(stateRoot, runRoot) {
  const port = await availablePort();
  prepareRunRoot(stateRoot, runRoot);
  const output = { text: "" };
  const child = spawn(process.execPath, ["server.js"], {
    cwd: stateRoot,
    env: isolatedEnvironment(runRoot, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output.text += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output.text += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const readyMs = await waitForServer(child, baseUrl, output);
  return { child, port, baseUrl, readyMs, output };
}

async function postSearch(baseUrl, query, sessionId) {
  const startedAt = performance.now();
  const response = await fetch(new URL("/api/routes/discovery", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "search",
      query,
      limit: 6,
      cursor: null,
      sessionId,
      excludeIds: [],
      excludeClusters: [],
      routeType: "",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return {
    durationMs: performance.now() - startedAt,
    serverDurationMs: Number(payload?.diagnostics?.durationMs) || null,
    records: payload.records?.length || 0,
    plannerCalled: payload?.diagnostics?.plannerCalled ?? null,
    cacheHit: payload?.diagnostics?.cacheHit ?? null,
    cacheStatus: payload.cacheStatus || "",
    failureReason: payload?.diagnostics?.reason || "",
  };
}

async function runChild(command, args, options) {
  const child = spawn(command, args, options);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const exitCode = await new Promise((resolve) => child.once("exit", resolve));
  if (exitCode !== 0) throw new Error(`child exited ${exitCode}\n${stdout}${stderr}`);
  return { stdout, stderr };
}

const stateRoot = path.resolve(option("state-root"));
const experimentRoot = path.resolve(option("experiment-root"));
const label = option("label", path.basename(stateRoot));
const rounds = numericOption("rounds", 10);
assert(fs.existsSync(path.join(stateRoot, "server.js")), "state root must contain server.js");
assert(experimentRoot, "--experiment-root is required");

const stateReportRoot = path.join(experimentRoot, `live-${label}`);
fs.mkdirSync(stateReportRoot, { recursive: true });
const freshRounds = [];

for (let round = 0; round < rounds; round += 1) {
  const runRoot = path.join(stateReportRoot, `fresh-${String(round + 1).padStart(2, "0")}`);
  const server = await startServer(stateRoot, runRoot);
  try {
    const search = await postSearch(server.baseUrl, "东京→京都→大阪7天", `fresh-${label}-${round}`);
    freshRounds.push({
      round: round + 1,
      readyMs: Number(server.readyMs.toFixed(3)),
      ...Object.fromEntries(Object.entries(search).map(([key, value]) => (
        typeof value === "number" ? [key, Number(value.toFixed(3))] : [key, value]
      ))),
    });
  } finally {
    await stopServer(server.child);
    await assertPortReleased(server.port);
  }
}

const persistentRoot = path.join(stateReportRoot, "persistent");
const persistentServer = await startServer(stateRoot, persistentRoot);
let liveReport;
try {
  const outputPath = path.join(stateReportRoot, "persistent-benchmark.json");
  await runChild(process.execPath, [
    "--expose-gc",
    "scripts/benchmark-route-v2-performance-forensics.mjs",
    "--label",
    `${label}-persistent`,
    "--rounds",
    String(rounds),
    "--base-url",
    persistentServer.baseUrl,
    "--live-only",
    "--output",
    outputPath,
  ], {
    cwd: stateRoot,
    env: isolatedEnvironment(persistentRoot, persistentServer.port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  liveReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));
} finally {
  await stopServer(persistentServer.child);
  await assertPortReleased(persistentServer.port);
}

const report = {
  benchmark: "route-v2-live-state",
  label,
  stateRoot,
  rounds,
  freshProcess: {
    rounds: freshRounds,
    ready: stats(freshRounds.map((round) => round.readyMs)),
    firstSearch: stats(freshRounds.map((round) => round.durationMs)),
    firstSearchServer: stats(freshRounds.map((round) => round.serverDurationMs).filter(Number.isFinite)),
  },
  persistentProcess: {
    readyMs: Number(persistentServer.readyMs.toFixed(3)),
    live: liveReport.live,
  },
  isolation: {
    uniquePerFreshProcess: true,
    persistentProcessSeparate: true,
    externalEvidenceEnabled: false,
    externalImageEndpointCalled: false,
    formalAssetsWritten: false,
  },
};

const reportPath = path.join(experimentRoot, `${label}-live-summary.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
