const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.PW_PORT || 4287);
const temporaryRoot = fs.realpathSync(os.tmpdir());
const runtimeDirectory = fs.mkdtempSync(path.join(temporaryRoot, "travel-browser-"));
const ownershipFile = path.join(runtimeDirectory, ".browser-test-owner");
const ownershipToken = randomUUID();
fs.writeFileSync(ownershipFile, ownershipToken, { flag: "wx" });

// Relative persistence defaults belong to this run. Only source-root-bound
// server paths need overrides; clear inherited app flags before loading modules.
process.chdir(runtimeDirectory);
for (const name of Object.keys(process.env)) {
  if (/^(ROUTE_|SEARCH_|DEEPSEEK_|DASHSCOPE_)/iu.test(name)) delete process.env[name];
}
Object.assign(process.env, {
  HOST: "127.0.0.1", PORT: String(port),
  ROUTE_ACCEPTED_REPOSITORY_PATH: path.join(runtimeDirectory, "accepted-routes.json"),
  ROUTE_IMAGE_CACHE_PATH: path.join(runtimeDirectory, "route-image-cache.json"),
  ROUTE_IMAGE_PROXY_CACHE_DIR: path.join(runtimeDirectory, "proxied-images"),
  ROUTE_V2_RUNTIME_METRICS_PATH: path.join(runtimeDirectory, "runtime-metrics.json"),
  ROUTE_FEED_REFILL_ENABLED: "false",
  ROUTE_LLM_REFINE_ENABLED: "false",
  SEARCH_MAX_PLANNER_CALLS_PER_REQUEST: "0",
  ROUTE_V2_RUNTIME_ENABLED: "false",
});

let server;
let stopping = false;
function finish(code) {
  try {
    // Verify this run's resolved target and ownership before recursive removal.
    const target = fs.realpathSync(runtimeDirectory);
    if (target !== runtimeDirectory || path.dirname(target) !== temporaryRoot
      || fs.lstatSync(runtimeDirectory).isSymbolicLink()
      || fs.readFileSync(ownershipFile, "utf8") !== ownershipToken) {
      throw new Error("Refusing to remove unowned browser runtime: " + runtimeDirectory);
    }
    process.chdir(projectRoot);
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.error(error.message);
    code = 1;
  }
  process.exit(code);
}

function stop() {
  if (stopping) return;
  stopping = true;
  if (!server) return finish(0);
  server.close(error => finish(error ? 1 : 0));
  server.closeAllConnections();
}
process.on("message", message => { if (message?.type === "stop") stop(); });
process.on("disconnect", stop);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log("Browser test runtime: " + runtimeDirectory);
require(path.join(projectRoot, "server.js")).main().then(instance => {
  server = instance;
  if (process.connected) process.send({ type: "ready", port }, error => { if (error) stop(); });
}).catch(error => {
  console.error("Browser test server failed: " + error.message);
  finish(1);
});
