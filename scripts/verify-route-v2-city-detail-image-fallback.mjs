import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLACEHOLDER_PATH = "/travel-collection/assets/route-city-placeholder.svg";
const PLACEHOLDER_SOURCE = "assets/route-city-placeholder.svg";
const CITY_SHELL_PATH = path.join(ROOT, "city-oslo.html");
const CASES = Object.freeze([
  { id: "GB-LON", name: "London", scope: "batch05" },
  { id: "JP-NAR", name: "Nara", scope: "legacy" },
  { id: "DE-BER", name: "Berlin", scope: "historical" },
  { id: "NO-OSL", name: "Oslo", scope: "batch05" },
  { id: "JP-TYO", name: "Tokyo", scope: "legacy" },
]);

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu"));
  return match?.[1] ?? match?.[2] ?? "";
}

function verifyStaticCityShell() {
  const html = fs.readFileSync(CITY_SHELL_PATH, "utf8");
  const hero = html.match(/<img\b(?=[^>]*\bdata-city-cover\b)[^>]*>/iu)?.[0] || "";
  assert.ok(hero, "City Detail shell must contain one data-city-cover image");
  assert.equal(htmlAttribute(hero, "src"), PLACEHOLDER_SOURCE, "initial City hero must be the neutral placeholder");
  assert.equal(htmlAttribute(hero, "data-cover-source"), "neutral-placeholder", "initial City hero source must be explicit");
  assert.equal(htmlAttribute(hero, "alt"), "城市占位图", "initial City hero alt text must be generic");
  assert.doesNotMatch(htmlAttribute(hero, "src"), /(?:city-oslo-cover|\/countries\/)/iu, "initial City hero must not reference a specific City or Country asset");
  assert.doesNotMatch(html, /city-oslo-cover|奥斯陆|挪威|\bOslo\b|\bNorway\b/iu, "shared City Detail shell must not contain Oslo-specific initial semantics");
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']preload["'][^>]*\bas=["']image["']/iu, "City Detail shell must not preload a place-specific image");
  assert.doesNotMatch(html, /<noscript\b/iu, "City Detail shell must not provide an unverified noscript image fallback");
  return { heroSource: PLACEHOLDER_SOURCE, osloSpecificSemantics: 0 };
}

function requestPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || "");
  }
}

function assertNeutralInitialImageRequests(id, requests, verifiedDedicatedPath = "") {
  const paths = requests.map(requestPath);
  assert.ok(paths.length > 0, `${id}:navigation must request the City hero image`);
  assert.equal(paths[0], PLACEHOLDER_PATH, `${id}:first City hero image request must be the neutral placeholder`);
  assert.equal(paths.filter((candidate) => candidate === PLACEHOLDER_PATH).length, 1, `${id}:neutral City hero must load once`);
  assert.deepEqual(
    paths.filter((candidate) => candidate !== verifiedDedicatedPath
      && /(?:city-oslo-cover|\/countries\/|\/route-v2-images\/cities\/)/iu.test(candidate)),
    [],
    `${id}:navigation requested a specific City or Country image before verified identity resolution`,
  );
  return paths;
}

function browserCandidates() {
  const env = process.env;
  const values = [env.CHROME_EXECUTABLE_PATH, env.CHROMIUM_EXECUTABLE_PATH];
  if (process.platform === "win32") {
    values.push(
      path.join(env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    values.push(
      path.join("/Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      path.join("/Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
      path.join("/Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
    );
  } else {
    values.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }
  return [...new Set(values.filter(Boolean))];
}

function findBrowserExecutable() {
  const executable = browserCandidates().find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, "Chrome, Edge, or Chromium executable is required for the City Detail browser verifier");
  return executable;
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForPreview(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`preview-exited:${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/travel-collection/city-oslo.html`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The isolated preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("preview-start-timeout");
}

async function waitForDevtools(child) {
  let stderr = "";
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`browser-devtools-timeout:${stderr.slice(-1000)}`)), 15_000);
    const inspect = (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`browser-exited-before-devtools:${code}:${stderr.slice(-1000)}`));
    });
  });
}

class CdpClient {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.code}:${message.error.message}`));
        else resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.webSocket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return { socket, client: new CdpClient(socket) };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const staticShell = verifyStaticCityShell();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-city-detail-image-"));
const acceptedCopy = path.join(temporaryRoot, "accepted-routes.json");
fs.copyFileSync(path.join(ROOT, ".route-v2-cache", "accepted-routes.json"), acceptedCopy);
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const isolatedEnv = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: String(port),
  ROUTE_ACCEPTED_REPOSITORY_PATH: acceptedCopy,
  SEARCH_CACHE_PATH: path.join(temporaryRoot, "search-cache.json"),
  ROUTE_SEARCH_CACHE_PATH: path.join(temporaryRoot, "search-cache.json"),
  SEARCH_REVIEW_CANDIDATES_PATH: path.join(temporaryRoot, "search-review.json"),
  SEARCH_ANALYTICS_PATH: path.join(temporaryRoot, "search-analytics.jsonl"),
  ROUTE_IMAGE_CACHE_PATH: path.join(temporaryRoot, "route-image-cache.json"),
  ROUTE_IMAGE_PROXY_CACHE_DIR: path.join(temporaryRoot, "image-proxy-cache"),
  ROUTE_V2_LOCAL_EVIDENCE_ROOT: path.join(temporaryRoot, "local-evidence"),
  ROUTE_V2_RUNTIME_METRICS_PATH: path.join(temporaryRoot, "runtime-metrics.json"),
  ROUTE_V2_EVIDENCE_ONLINE_ENABLED: "false",
  ROUTE_V2_TAVILY_EVIDENCE_ENABLED: "false",
  ROUTE_V2_WIKIVOYAGE_EVIDENCE_ENABLED: "false",
  SEARCH_AUTO_ACCEPT_GENERATED: "false",
};
delete isolatedEnv.ROUTE_WEB_SEARCH_API_KEY;
delete isolatedEnv.SEARCH_PROVIDER_API_KEY;

const preview = spawn(process.execPath, ["server.js"], {
  cwd: ROOT,
  env: isolatedEnv,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const browserExecutable = findBrowserExecutable();
let chromium = null;
let socket = null;

try {
  await waitForPreview(baseUrl, preview);
  chromium = spawn(browserExecutable, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=OptimizationHints,MediaRouter",
    "--disable-gpu",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${path.join(temporaryRoot, "browser-profile")}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  const webSocketUrl = await waitForDevtools(chromium);
  const connection = await connectCdp(webSocketUrl);
  socket = connection.socket;
  const { client } = connection;
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Log.enable", {}, sessionId);
  await client.send("Network.enable", {}, sessionId);
  await client.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);

  const consoleProblems = [];
  const simulatedFailureConsoleProblems = [];
  const externalRequests = [];
  let navigationMode = "normal";
  let imageRequests = [];
  let blockedCityDetailScriptRequests = 0;
  let blockedCityDetailScriptFailures = 0;
  const blockedCityDetailRequestIds = new Set();
  const removeListener = client.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    const activeConsoleProblems = navigationMode === "script-failure"
      ? simulatedFailureConsoleProblems
      : consoleProblems;
    if (message.method === "Runtime.exceptionThrown") activeConsoleProblems.push("runtime-exception");
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params?.type)) {
      activeConsoleProblems.push(`console-${message.params.type}`);
    }
    if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params?.entry?.level)) {
      activeConsoleProblems.push(`log-${message.params.entry.level}:${message.params.entry.text || ""}`);
    }
    if (message.method === "Network.requestWillBeSent") {
      const url = String(message.params?.request?.url || "");
      if (/^https?:/iu.test(url) && !url.startsWith(baseUrl)) externalRequests.push(url);
      if (message.params?.type === "Image") imageRequests.push(url);
      if (navigationMode === "script-failure" && /\/city-detail\.js(?:\?|$)/u.test(url)) {
        blockedCityDetailScriptRequests += 1;
        blockedCityDetailRequestIds.add(message.params.requestId);
      }
    }
    if (message.method === "Network.loadingFailed"
      && navigationMode === "script-failure"
      && blockedCityDetailRequestIds.has(message.params?.requestId)
      && message.params?.blockedReason) {
      blockedCityDetailScriptFailures += 1;
    }
  });

  const results = [];
  for (const fixture of CASES) {
    navigationMode = "normal";
    imageRequests = [];
    const url = `${baseUrl}/travel-collection/city-oslo.html?localOnly=1&cityImageVerifier=${encodeURIComponent(fixture.id)}#${encodeURIComponent(fixture.id)}`;
    await client.send("Page.navigate", { url }, sessionId);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const evaluation = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const image = document.querySelector("[data-city-cover]");
        return {
          cityName: document.querySelector("[data-city-name]")?.textContent || "",
          src: image?.currentSrc || image?.src || "",
          path: image ? new URL(image.currentSrc || image.src, location.href).pathname : "",
          complete: image?.complete === true,
          naturalWidth: image?.naturalWidth || 0,
          naturalHeight: image?.naturalHeight || 0,
          coverSource: image?.dataset.coverSource || "",
          verifiedDedicatedPath: (() => {
            const entityId = document.querySelector("[data-knowledge-city-id]")?.getAttribute("data-knowledge-city-id") || "";
            const coverage = window.RouteV2ImageCoverage?.cityByEntityId?.[entityId];
            const verified = coverage?.status === "imageReady"
              && coverage.assetKind === "verified-destination-image"
              && coverage.semanticScope === "exact-city";
            return verified ? new URL(coverage.assetPath, location.href).pathname : "";
          })(),
          localOnly: document.documentElement.dataset.cityDetailLocalOnlyDiagnostics || "",
        };
      })()`,
      returnByValue: true,
    }, sessionId);
    const rendered = evaluation.result?.value || {};
    assert.equal(rendered.path, rendered.verifiedDedicatedPath || PLACEHOLDER_PATH, `${fixture.id}:City Detail must use only a manifest-verified City image or the neutral placeholder`);
    assert.doesNotMatch(rendered.path, /\/countries\//u, `${fixture.id}:Country cover must not render as a City cover`);
    assert.equal(rendered.complete, true, `${fixture.id}:City cover must finish loading`);
    assert.ok(rendered.naturalWidth > 0 && rendered.naturalHeight > 0, `${fixture.id}:City cover must not be broken`);
    assert.equal(rendered.coverSource, rendered.verifiedDedicatedPath ? "verified-city-image" : "neutral-placeholder", `${fixture.id}:City cover source must be explicit`);
    const localOnly = rendered.localOnly ? JSON.parse(rendered.localOnly) : {};
    assert.deepEqual(localOnly.blockedRequests || [], [], `${fixture.id}:City Detail attempted a blocked request`);
    const requestedImagePaths = assertNeutralInitialImageRequests(fixture.id, imageRequests, rendered.verifiedDedicatedPath);
    results.push({ ...fixture, renderedCityName: rendered.cityName, coverPath: rendered.path, requestedImagePaths });
  }

  navigationMode = "script-failure";
  imageRequests = [];
  await client.send("Network.setBlockedURLs", { urls: ["*city-detail.js*"] }, sessionId);
  const failureUrl = `${baseUrl}/travel-collection/city-oslo.html?localOnly=1&cityImageVerifier=script-failure#GB-LON`;
  await client.send("Page.navigate", { url: failureUrl }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const failureEvaluation = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const image = document.querySelector("[data-city-cover]");
      return {
        path: image ? new URL(image.currentSrc || image.src, location.href).pathname : "",
        complete: image?.complete === true,
        naturalWidth: image?.naturalWidth || 0,
        naturalHeight: image?.naturalHeight || 0,
        coverSource: image?.dataset.coverSource || "",
        cityDetailInitialized: typeof window.CityDetailLocalOnlyDiagnostics !== "undefined",
      };
    })()`,
    returnByValue: true,
  }, sessionId);
  const failureRendered = failureEvaluation.result?.value || {};
  const failureImagePaths = assertNeutralInitialImageRequests("script-failure", imageRequests);
  assert.equal(blockedCityDetailScriptRequests, 1, "script-failure:city-detail.js must be requested exactly once");
  assert.ok(blockedCityDetailScriptFailures >= 1, "script-failure:city-detail.js request must fail before initialization");
  assert.equal(failureRendered.cityDetailInitialized, false, "script-failure:City Detail initialization must not execute");
  assert.equal(failureRendered.path, PLACEHOLDER_PATH, "script-failure:static City hero must remain neutral");
  assert.equal(failureRendered.coverSource, "neutral-placeholder", "script-failure:static City hero source must remain explicit");
  assert.equal(failureRendered.complete, true, "script-failure:static City hero must finish loading");
  assert.ok(failureRendered.naturalWidth > 0 && failureRendered.naturalHeight > 0, "script-failure:static City hero must not be broken");
  await client.send("Network.setBlockedURLs", { urls: [] }, sessionId);

  removeListener();
  assert.deepEqual(consoleProblems, [], `City Detail console error/warning:${consoleProblems.join("|")}`);
  assert.deepEqual(externalRequests, [], `City Detail external requests:${externalRequests.join("|")}`);
  await client.send("Target.closeTarget", { targetId });

  console.log(JSON.stringify({
    verifier: "route-v2-city-detail-image-fallback",
    status: "PASS",
    browser: path.basename(browserExecutable),
    staticShell,
    cases: results,
    scriptFailure: {
      blockedScriptRequests: blockedCityDetailScriptRequests,
      blockedScriptFailures: blockedCityDetailScriptFailures,
      coverPath: failureRendered.path,
      requestedImagePaths: failureImagePaths,
      brokenImages: 0,
      expectedConsoleProblems: simulatedFailureConsoleProblems.length,
    },
    neutralPlaceholder: PLACEHOLDER_PATH,
    brokenImages: 0,
    externalRequests: 0,
    consoleErrorWarningCount: 0,
    isolatedStorage: true,
  }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  await stopChild(chromium);
  await stopChild(preview);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
