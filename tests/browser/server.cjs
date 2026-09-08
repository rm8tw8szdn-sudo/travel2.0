const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.PW_PORT || 4287);
const temporaryRoot = fs.realpathSync(os.tmpdir());
const directoryPrefix = "travel-browser-";
const runtimeDirectory = fs.mkdtempSync(path.join(temporaryRoot, directoryPrefix));
const ownershipFile = path.join(runtimeDirectory, ".browser-test-owner");
const ownershipToken = randomUUID();
fs.writeFileSync(ownershipFile, ownershipToken, { flag: "wx" });

function cleanRuntimeDirectory() {
  if (!fs.existsSync(runtimeDirectory)) return;
  const resolvedDirectory = fs.realpathSync(runtimeDirectory);
  const directoryStat = fs.lstatSync(runtimeDirectory);
  // Check the resolved target and this run's marker before any recursive removal,
  // including on Windows where the system temporary path may use a junction.
  if (
    path.relative(runtimeDirectory, resolvedDirectory) !== ""
    || path.relative(temporaryRoot, path.dirname(resolvedDirectory)) !== ""
    || !path.basename(resolvedDirectory).startsWith(directoryPrefix)
    || !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || fs.readFileSync(ownershipFile, "utf8") !== ownershipToken
  ) {
    throw new Error(`Refusing to remove unowned browser runtime: ${runtimeDirectory}`);
  }
  fs.rmSync(resolvedDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

function createServerEnvironment() {
  // Ignore shell-specific application settings and provider credentials so the
  // same test command cannot accidentally enable generation or use live caches.
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
    !/^(ROUTE_|SEARCH_|DEEPSEEK_|DASHSCOPE_)/iu.test(name)
  )));
  const cacheDirectory = path.join(runtimeDirectory, ".route-v2-cache");
  const evidenceDirectory = path.join(runtimeDirectory, ".route-v2-local-evidence");
  const cachePath = (name) => path.join(cacheDirectory, name);
  return {
    ...environment,
    HOST: "127.0.0.1",
    PORT: String(port),
    ROUTE_ACCEPTED_REPOSITORY_PATH: cachePath("accepted-routes.json"),
    ROUTE_IMAGE_CACHE_PATH: cachePath("route-image-cache.json"),
    ROUTE_IMAGE_PROXY_CACHE_DIR: cachePath("proxied-images"),
    SEARCH_CACHE_PATH: cachePath("search-cache.json"),
    SEARCH_REVIEW_CANDIDATES_PATH: cachePath("search-review-candidates.json"),
    SEARCH_ANALYTICS_PATH: cachePath("search-analytics.jsonl"),
    ROUTE_SEARCH_CACHE_PATH: cachePath("search-cache.json"),
    ROUTE_EVIDENCE_REPOSITORY_PATH: cachePath("route-evidence.json"),
    ROUTE_PROVIDER_SYNC_STATE_PATH: cachePath("provider-sync-state.json"),
    ROUTE_KNOWLEDGE_GRAPH_POOL_PATH: cachePath("knowledge-graph-pool.json"),
    ROUTE_V2_RUNTIME_METRICS_PATH: cachePath("route-v2-runtime-metrics.json"),
    ROUTE_V2_TRACE_PATH: cachePath("decision-traces.jsonl"),
    ROUTE_V2_CANDIDATE_POOL_PATH: cachePath("route-candidate-pool.jsonl"),
    ROUTE_V2_EVIDENCE_BUNDLE_PATH: cachePath("route-evidence-bundles.jsonl"),
    ROUTE_V2_LOCAL_EVIDENCE_ROOT: evidenceDirectory,
    ROUTE_V2_EVIDENCE_SEED_ROOT: path.join(evidenceDirectory, "evidence-seed"),
    ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH: path.join(evidenceDirectory, "route-leg-evidence.jsonl"),
    ROUTE_V2_SEASON_EVIDENCE_PATH: path.join(evidenceDirectory, "season-evidence.jsonl"),
    ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH: path.join(evidenceDirectory, "missing-evidence-manifest.jsonl"),
    ROUTE_V2_READY_POOL_PATH: path.join(runtimeDirectory, ".route-v2-ready-pool", "ready-routes.json"),
    ROUTE_FEED_REFILL_ENABLED: "false",
    ROUTE_FEED_REFILL_PLANNER_ENABLED: "false",
    ROUTE_PLANNER_ENABLED: "false",
    ROUTE_LLM_REFINE_ENABLED: "false",
    SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "0",
    SEARCH_AUTO_ACCEPT_GENERATED: "false",
    ROUTE_V2_RUNTIME_ENABLED: "false",
    ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
    ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
    ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
    ROUTE_V2_OFFLINE_EVIDENCE_COLLECTION_ENABLED: "false",
  };
}

let child;
let stopping = false;
let finished = false;
let shutdownTimer;

function finish(exitCode) {
  if (finished) return;
  finished = true;
  clearTimeout(shutdownTimer);
  try {
    cleanRuntimeDirectory();
  } catch (error) {
    console.error(error.message);
    exitCode = 1;
  }
  process.exitCode = exitCode;
  if (process.connected) process.disconnect();
}

function stop(signal) {
  if (finished) return;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (stopping) {
    child.kill("SIGKILL");
    return;
  }
  stopping = true;
  child.kill(signal);
  shutdownTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
  shutdownTimer.unref();
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
// IPC shutdown also works on Windows, where forcibly killing the wrapper would
// bypass its cleanup handlers. Losing the Playwright parent stops the server.
process.on("message", (message) => {
  if (message?.type === "stop") stop("SIGTERM");
});
process.on("disconnect", () => stop("SIGTERM"));

try {
  // Static assets and published knowledge are read from server.js's __dirname.
  // Remaining relative persistence defaults are contained by the temporary cwd.
  child = spawn(process.execPath, [path.join(projectRoot, "server.js")], {
    cwd: runtimeDirectory,
    env: createServerEnvironment(),
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });
  console.log(`Browser test runtime: ${runtimeDirectory}`);
  let startupOutput = "";
  let ready = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (ready) return;
    startupOutput = (startupOutput + chunk).slice(-8192);
    if (!startupOutput.includes(`Travel Collection preview: http://127.0.0.1:${port}/travel-collection/`)) return;
    ready = true;
    if (process.connected) {
      process.send({ type: "ready", port }, (error) => {
        if (error) stop("SIGTERM");
      });
    }
  });
  child.on("error", (error) => {
    console.error(`Browser test server failed: ${error.message}`);
  });
  // Wait until the child closes before deleting its data. SIGKILL or an external
  // Windows process-tree termination cannot run JavaScript cleanup handlers.
  child.on("close", (code) => finish(stopping ? 0 : (code ?? 1)));
} catch (error) {
  console.error(`Browser test server failed: ${error.message}`);
  finish(1);
}
