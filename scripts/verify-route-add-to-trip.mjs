import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const travelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(travelRoot, "..");

assert.match(fs.readFileSync(path.join(travelRoot, "route-detail.html"), "utf8"), /data-route-add-trip/);
assert.match(fs.readFileSync(path.join(travelRoot, "route-detail.js"), "utf8"), /createTripFromRoute/);

const types = new Map([[".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"], [".svg", "image/svg+xml"], [".jpg", "image/jpeg"], [".png", "image/png"]]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const absolute = path.resolve(repoRoot, `.${pathname}`);
  if (!absolute.startsWith(repoRoot) || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": types.get(path.extname(absolute)) || "application/octet-stream" });
  fs.createReadStream(absolute).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const liveRoute = {
  id: "wikivoyage-live-alaska-highway",
  name: "阿拉斯加公路线",
  canonicalTitle: "阿拉斯加公路线",
  summary: "一条穿越加拿大与阿拉斯加的联网路线。",
  recommendationText: "路线集中呈现北境公路、峡湾地貌与沿途城镇文化。",
  countries: ["加拿大", "美国"],
  countryEntities: [{ countryCode: "CA", name: "加拿大" }, { countryCode: "US", name: "美国" }],
  cities: [],
  destinations: ["道森克里克", "白马市", "费尔班克斯"],
  destinationEntities: [{ wikidataId: "Q1", name: "道森克里克", countryCode: "CA" }, { wikidataId: "Q2", name: "白马市", countryCode: "CA" }, { wikidataId: "Q3", name: "费尔班克斯", countryCode: "US" }],
  durationDays: 12,
  recommendedDays: "10-14天",
  bestMonths: ["6月", "7月", "8月"],
  themes: ["公路自驾", "自然风光"],
  tags: ["live-discovery", "Wikivoyage"],
  highlights: ["北境自然景观", "长距离自驾体验", "跨国路线"],
  coverAsset: { provider: "wikimedia-commons", assetId: "alaska-route", sourceUrl: "https://commons.wikimedia.org/wiki/File:alaska-route.jpg", imageUrl: "https://upload.wikimedia.org/alaska-route.jpg", author: "Author", license: "CC BY-SA 4.0", width: 1200, height: 720 },
  destinationAssets: ["Q1", "Q2", "Q3"].map((destinationId) => ({ provider: "wikimedia-commons", assetId: `place-${destinationId}`, sourceUrl: `https://commons.wikimedia.org/wiki/File:place-${destinationId}.jpg`, imageUrl: `https://upload.wikimedia.org/place-${destinationId}.jpg`, author: "Author", license: "CC BY-SA 4.0", width: 1200, height: 720, destinationId })),
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Alaska_Highway" },
  contentQualityStatus: "accepted",
  classification: "single",
};

let sourceUnavailable = false;
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("https://upload.wikimedia.org/**", (route) => route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }));
  await page.route("**/api/routes/discovery", async (route) => {
    if (sourceUnavailable) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record: liveRoute }) });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/travel-collection/route-detail.html?id=${liveRoute.id}&reset=empty`);
  await page.locator("[data-route-detail-state='ready']").waitFor();
  await page.click("[data-route-add-trip]");
  await page.waitForURL("**/travel-collection/trips.html");

  const card = page.locator("[data-trip-list='upcoming'] [data-trip-open]").filter({ hasText: liveRoute.name });
  await card.waitFor();
  assert.match(await card.innerText(), /加拿大/);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem("travelCollectionState") || "{}"));
  assert.equal(state.trips.length, 1);
  assert.equal(state.trips[0].status, "planned");
  assert.equal(state.trips[0].planStatus, "规划中");
  assert.deepEqual(state.trips[0].countryIds.sort(), ["CA", "US"]);
  assert.equal(state.trips[0].routeSnapshot.id, liveRoute.id);
  assert.equal(state.trips[0].routeSnapshot.name, liveRoute.name);
  assert.deepEqual(state.trips[0].routeSnapshot.destinations, liveRoute.destinations);
  assert.equal(state.trips[0].routeSnapshot.coverAsset.assetId, liveRoute.coverAsset.assetId);
  assert.deepEqual(state.favoriteRouteEntries, [], "Add to Trip must not Favorite");
  assert.equal(state.countries.find((item) => item.id === "CA").explorationStatus, "planned");

  sourceUnavailable = true;
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("travelCollectionState") || "{}");
    stored.trips[0].countryIds = [];
    stored.trips[0].cityIds = [];
    localStorage.setItem("travelCollectionState", JSON.stringify(stored));
  });
  await page.reload();
  await card.waitFor();
  assert.match(await card.innerText(), /阿拉斯加公路线/);
  assert.match(await card.innerText(), /加拿大/, "Trip card should fall back to routeSnapshot when canonical place fields are unavailable");
  await card.click();
  await page.locator("[data-trip-detail-modal]:not([hidden])").waitFor();
  const overviewText = await page.locator("[data-trip-detail-modal] .trip-overview-grid").innerText();
  assert.match(overviewText, /加拿大/, "Trip detail should fall back to routeSnapshot countries");
  assert.match(overviewText, /道森克里克/, "Trip detail should fall back to routeSnapshot destinations");
  const routeSource = page.locator("[data-trip-detail-modal] [data-trip-route-source]");
  await routeSource.waitFor();
  assert.match(await routeSource.innerText(), /来源路线.*阿拉斯加公路线.*Wikivoyage/s, "Trip detail should present its stored routeSnapshot source");
  state = await page.evaluate(() => JSON.parse(localStorage.getItem("travelCollectionState") || "{}"));
  assert.equal(state.trips[0].routeSnapshot.summary, liveRoute.summary);
  assert.deepEqual(state.favoriteRouteEntries, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("Route Add to Trip verified: live detail import, offline snapshot display, and Favorite independence.");
