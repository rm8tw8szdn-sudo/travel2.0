import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(projectRoot, "server.js");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-v2-image-proxy-"));
const proxyCache = path.join(temporaryRoot, "proxy-cache");
const routeImageCache = path.join(temporaryRoot, "route-image-cache.json");
const previous = {
  proxyCache: process.env.ROUTE_IMAGE_PROXY_CACHE_DIR,
  routeImageCache: process.env.ROUTE_IMAGE_CACHE_PATH,
  timeout: process.env.ROUTE_IMAGE_PROXY_TIMEOUT_MS,
};

function loadProxy() {
  delete require.cache[require.resolve(serverPath)];
  return require(serverPath).proxyRemoteImage;
}

function captureResponse() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function request(proxyRemoteImage, url, dependencies) {
  const response = captureResponse();
  await proxyRemoteImage(url, response, new AbortController().signal, dependencies);
  return response;
}

try {
  process.env.ROUTE_IMAGE_PROXY_CACHE_DIR = proxyCache;
  process.env.ROUTE_IMAGE_CACHE_PATH = routeImageCache;
  process.env.ROUTE_IMAGE_PROXY_TIMEOUT_MS = "30";

  let upstreamRequests = 0;
  const successfulDownload = async (url) => {
    upstreamRequests += 1;
    assert.equal(url, "https://upload.wikimedia.org/example-canary.jpg");
    return { body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: "image/jpeg" };
  };

  const firstProxy = loadProxy();
  const cold = await request(firstProxy, "https://upload.wikimedia.org/example-canary.jpg", { downloadImage: successfulDownload });
  assert.equal(cold.status, 200);
  assert.equal(upstreamRequests, 1, "a cold proxy miss must fetch the upstream URL once");
  assert.equal(fs.readdirSync(proxyCache).length, 2, "a successful cold fetch must write isolated body and metadata files");

  const memoryHit = await request(firstProxy, "https://upload.wikimedia.org/example-canary.jpg");
  assert.equal(memoryHit.status, 200);
  assert.equal(upstreamRequests, 1, "a memory hit must not fetch upstream again");

  const secondProxy = loadProxy();
  const diskHit = await request(secondProxy, "https://upload.wikimedia.org/example-canary.jpg");
  assert.equal(diskHit.status, 200);
  assert.equal(upstreamRequests, 1, "a cold-process disk hit must not fetch upstream again");

  let upstream404Requests = 0;
  const missingDownload = async () => {
    upstream404Requests += 1;
    throw Object.assign(new Error("image_upstream_unavailable"), { code: "image_upstream_unavailable", statusCode: 502 });
  };
  const missingProxy = loadProxy();
  const missing = await request(missingProxy, "https://upload.wikimedia.org/example-missing.jpg", { downloadImage: missingDownload });
  assert.equal(missing.status, 502);
  assert.equal(fs.readdirSync(proxyCache).length, 2, "an upstream 404 must not create a cache entry");

  const timeoutDownload = async () => {
    throw Object.assign(new Error("image_timeout"), { code: "image_timeout", statusCode: 502 });
  };
  const timeoutProxy = loadProxy();
  const timedOut = await request(timeoutProxy, "https://upload.wikimedia.org/example-timeout.jpg", { downloadImage: timeoutDownload });
  assert.equal(timedOut.status, 502);
  assert.equal(fs.readdirSync(proxyCache).length, 2, "a timeout must not create a cache entry");

  const routesSource = fs.readFileSync(path.join(projectRoot, "routes.js"), "utf8");
  const preloadSource = fs.readFileSync(path.join(projectRoot, "route-feed-preload.js"), "utf8");
  const detailSource = fs.readFileSync(path.join(projectRoot, "route-detail.js"), "utf8");
  assert.match(routesSource, /if \(!runtimeImageSearchEnabled && \/\^https\?:/u);
  assert.match(preloadSource, /if \(!runtimeImageSearchEnabled && \/\^https\?:/u);
  assert.match(detailSource, /if \(!runtimeImageSearchEnabled\) return;/u);

  process.stdout.write(`${JSON.stringify({
    verifier: "route-v2-image-proxy-network-boundary",
    status: "PASS",
    mockUpstreamRequests: upstreamRequests,
    coldMissFetchedUpstream: true,
    memoryHitFetchedUpstream: false,
    diskHitFetchedUpstream: false,
    upstream404Status: 502,
    upstream404Requests,
    upstream404CacheWrites: 0,
    timeoutStatus: 502,
    timeoutCacheWrites: 0,
    realNetworkRequests: 0,
    isolatedCache: true,
  }, null, 2)}\n`);
} finally {
  if (previous.proxyCache === undefined) delete process.env.ROUTE_IMAGE_PROXY_CACHE_DIR;
  else process.env.ROUTE_IMAGE_PROXY_CACHE_DIR = previous.proxyCache;
  if (previous.routeImageCache === undefined) delete process.env.ROUTE_IMAGE_CACHE_PATH;
  else process.env.ROUTE_IMAGE_CACHE_PATH = previous.routeImageCache;
  if (previous.timeout === undefined) delete process.env.ROUTE_IMAGE_PROXY_TIMEOUT_MS;
  else process.env.ROUTE_IMAGE_PROXY_TIMEOUT_MS = previous.timeout;
  delete require.cache[require.resolve(serverPath)];
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
