import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const travelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(travelRoot, "..");
const outputDir = path.resolve(process.env.ROUTE_V2_SCREENSHOT_OUTPUT || path.join(travelRoot, "output", "playwright", "route-v2-real"));
const screenshotQuery = process.env.ROUTE_V2_SCREENSHOT_QUERY || "Across Australia by train";
const existingBaseUrl = String(process.env.ROUTE_V2_SCREENSHOT_BASE_URL || "").replace(/\/$/, "");
const chromePath = process.env.CHROME_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(outputDir, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function startPreviewServer() {
  if (existingBaseUrl) return { baseUrl: existingBaseUrl, stop: async () => {} };

  const port = Number(process.env.ROUTE_V2_SCREENSHOT_PORT || await freePort());
  const server = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr.on("data", (chunk) => logs.push(String(chunk)));
  const baseUrl = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) break;
    try {
      await requestJson(`${baseUrl}/api/health`);
      return {
        baseUrl,
        stop: async () => {
          if (server.exitCode !== null) return;
          server.kill("SIGINT");
          await new Promise((resolve) => server.once("exit", resolve));
        },
      };
    } catch {
      await wait(250);
    }
  }

  server.kill("SIGINT");
  throw new Error(`Route preview server did not start.\n${logs.slice(-8).join("")}`);
}

async function postDiscovery(baseUrl, body) {
  return requestJson(`${baseUrl}/api/routes/discovery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function selectAcceptedRecord(records) {
  return (records || []).find((record) =>
    record?.id
    && record?.contentQualityStatus === "accepted"
    && record?.coverAsset?.imageUrl
    && record?.source?.url
    && (record.sourceTitle === screenshotQuery || record.name || record.canonicalTitle)
  ) || null;
}

async function waitForAcceptedRoute(baseUrl) {
  const sessionId = `screenshot-${Date.now().toString(36)}`;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const payload = await postDiscovery(baseUrl, {
      mode: "feed",
      query: screenshotQuery,
      limit: 5,
      cursor: null,
      sessionId,
      excludeIds: [],
    });
    const record = selectAcceptedRecord(payload.records);
    if (record) {
      return { record, seedAttempts: attempt, cacheStatus: payload.cacheStatus, diagnostics: payload.diagnostics || {} };
    }
    await wait(attempt < 3 ? 12_000 : 18_000);
  }
  throw new Error(`No accepted RouteRecord became available for "${screenshotQuery}".`);
}

async function captureScreenshots(baseUrl, record) {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/travel-collection/routes.html`);
    await page.evaluate(() => localStorage.removeItem("travelCollectionState"));
    await page.locator(`[data-route-tab="${record.classification === "cross" ? "cross" : "single"}"]`).click();
    await page.locator("[data-route-search]").fill(screenshotQuery);
    await page.locator(`[data-route-card="${record.id}"]`).waitFor({ timeout: 20_000 });
    const feedTitle = await page.locator(`[data-route-card="${record.id}"] strong`).first().innerText();
    await page.waitForLoadState("networkidle").catch(() => {});
    const feedPath = path.join(outputDir, "route-feed-real.png");
    await page.screenshot({ path: feedPath, fullPage: true });

    await page.goto(`${baseUrl}/travel-collection/route-detail.html?id=${encodeURIComponent(record.id)}`);
    await page.locator("[data-route-detail-state='ready']").waitFor({ timeout: 20_000 });
    const detailTitle = await page.locator("[data-route-name]").innerText();
    assert.ok(detailTitle, "Detail must render the accepted RouteRecord title.");
    await page.waitForLoadState("networkidle").catch(() => {});
    const detailPath = path.join(outputDir, "route-detail-real.png");
    await page.screenshot({ path: detailPath, fullPage: true });

    await page.locator("[data-route-favorite]").click();
    const favoriteSnapshot = await page.evaluate((routeId) => {
      const state = window.TravelState.readTravelState();
      return window.TravelState.getFavoriteRouteSnapshot(state, routeId);
    }, record.id);
    assert.equal(favoriteSnapshot?.id, record.id, "Favorite must store a routeSnapshot for the accepted record.");

    await page.goto(`${baseUrl}/travel-collection/favorites.html`);
    await page.locator('[data-favorite-tab="routes"]').click();
    await page.locator(`[data-favorite-route-id="${record.id}"]`).waitFor({ timeout: 20_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const favoritePath = path.join(outputDir, "route-favorite-real.png");
    await page.screenshot({ path: favoritePath, fullPage: true });

    await page.goto(`${baseUrl}/travel-collection/route-detail.html?id=${encodeURIComponent(record.id)}`);
    await page.locator("[data-route-detail-state='ready']").waitFor({ timeout: 20_000 });
    await page.locator("[data-route-add-trip]").click();
    await page.waitForURL("**/travel-collection/trips.html", { timeout: 20_000 });
    await page.locator("[data-trip-open]").first().waitFor({ timeout: 20_000 });
    const tripSnapshot = await page.evaluate((routeId) => {
      const state = window.TravelState.readTravelState();
      return (state.trips || []).find((trip) => trip.routeSnapshot?.id === routeId)?.routeSnapshot || null;
    }, record.id);
    assert.equal(tripSnapshot?.id, record.id, "Trip must store a routeSnapshot for the accepted record.");
    const tripTitle = await page.locator("[data-trip-open] strong").first().innerText();
    const tripHasAurora = await page.evaluate(() => [...document.images].some((image) => /aurora/i.test(`${image.src} ${image.alt}`)));
    assert.equal(tripHasAurora, false, "Trip snapshot must not use an unrelated aurora cover.");
    await page.waitForLoadState("networkidle").catch(() => {});
    const tripPath = path.join(outputDir, "route-trip-real.png");
    await page.screenshot({ path: tripPath, fullPage: true });

    return {
      feed: feedPath,
      detail: detailPath,
      favorite: favoritePath,
      trip: tripPath,
      feedTitle,
      detailTitle,
      tripTitle,
      favoriteSnapshotId: favoriteSnapshot.id,
      tripSnapshotId: tripSnapshot.id,
    };
  } finally {
    await browser.close();
  }
}

const server = await startPreviewServer();
try {
  const seed = await waitForAcceptedRoute(server.baseUrl);
  const screenshots = await captureScreenshots(server.baseUrl, seed.record);
  console.log(JSON.stringify({
    ok: true,
    baseUrl: server.baseUrl,
    query: screenshotQuery,
    routeId: seed.record.id,
    routeName: seed.record.name,
    sourceUrl: seed.record.source.url,
    cacheStatus: seed.cacheStatus,
    seedAttempts: seed.seedAttempts,
    screenshots,
  }, null, 2));
} finally {
  await server.stop();
}
