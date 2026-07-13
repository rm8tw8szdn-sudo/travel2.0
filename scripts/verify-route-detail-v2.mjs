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
const detailHtmlPath = path.join(travelRoot, "route-detail.html");
const detailScriptPath = path.join(travelRoot, "route-detail.js");
const feedScriptPath = path.join(travelRoot, "routes.js");

assert.ok(fs.existsSync(detailHtmlPath), "route-detail.html should exist");
assert.ok(fs.existsSync(detailScriptPath), "route-detail.js should exist");
assert.match(fs.readFileSync(feedScriptPath, "utf8"), /route-detail\.html\?id=/, "Feed cards should link to route-detail.html by ID");
const detailHtml = fs.readFileSync(detailHtmlPath, "utf8");
const detailScript = fs.readFileSync(detailScriptPath, "utf8");
for (const field of ["summary", "recommended-days", "best-months", "source", "destination-grid"]) {
  assert.match(detailHtml, new RegExp(`data-route-${field}`), `detail page should expose ${field}`);
}
assert.match(detailHtml, /data-route-add-trip/, "detail page should expose the approved Add to Trip action");
assert.match(detailHtml, /data-route-cover/, "detail page should expose the Route cover image");
assert.match(detailScript, /coverAsset\.imageUrl/, "detail script should render the required route cover asset");

const contentTypes = new Map([[".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"], [".svg", "image/svg+xml"]]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const absolute = path.resolve(repoRoot, `.${pathname}`);
  if (!absolute.startsWith(repoRoot) || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentTypes.get(path.extname(absolute)) || "application/octet-stream" });
  fs.createReadStream(absolute).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const detailRecord = {
  id: "wikivoyage-101",
  name: "阿拉斯加公路线",
  canonicalTitle: "阿拉斯加公路线",
  summary: "从加拿大西部通往阿拉斯加的长距离公路路线。",
  recommendationText: "路线集中呈现北境公路、峡湾地貌与沿途城镇文化。",
  countries: ["加拿大", "美国"],
  countryEntities: [{ countryCode: "CA", name: "加拿大" }, { countryCode: "US", name: "美国" }],
  destinations: ["道森克里克", "白马市", "费尔班克斯"],
  destinationEntities: [{ wikidataId: "Q1", name: "道森克里克", countryCode: "CA" }, { wikidataId: "Q2", name: "白马市", countryCode: "CA" }, { wikidataId: "Q3", name: "费尔班克斯", countryCode: "US" }],
  recommendedDays: "10-14天",
  bestMonths: ["6月", "7月", "8月"],
  themes: ["公路自驾", "自然风光"],
  tags: ["live-discovery", "Wikivoyage"],
  highlights: ["北境自然景观", "长距离自驾体验", "跨越加拿大与美国"],
  coverAsset: { provider: "wikimedia-commons", assetId: "alaska-route", sourceUrl: "https://commons.wikimedia.org/wiki/File:alaska-route.jpg", imageUrl: "https://upload.wikimedia.org/alaska-route.jpg", author: "Author", license: "CC BY-SA 4.0", width: 1200, height: 720 },
  destinationAssets: ["Q1", "Q2", "Q3"].map((destinationId) => ({ provider: "wikimedia-commons", assetId: `place-${destinationId}`, sourceUrl: `https://commons.wikimedia.org/wiki/File:place-${destinationId}.jpg`, imageUrl: `https://upload.wikimedia.org/place-${destinationId}.jpg`, author: "Author", license: "CC BY-SA 4.0", width: 1200, height: 720, destinationId })),
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Alaska_Highway" },
  contentQualityStatus: "accepted",
  classification: "single",
};
const requests = [];
let partialMedia = false;
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("https://upload.wikimedia.org/**", (route) => route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }));
  await page.route("**/api/routes/discovery", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    requests.push(body);
    if (body.mode === "feed") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, records: [detailRecord], nextCursor: null, hasMore: false, cacheStatus: "MISS", requestId: "feed" }) });
      return;
    }
    if (body.routeId === detailRecord.id) {
      const record = partialMedia ? { ...detailRecord, destinationAssets: detailRecord.destinationAssets.slice(0, 2), enrichmentStatus: "enriched" } : detailRecord;
      const diagnostics = partialMedia ? { missingDestinations: [detailRecord.destinationEntities[2].name], rejected: [{ reason: "no-valid-image" }], partial: true } : { missingDestinations: [], rejected: [], partial: false };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record, diagnostics, cacheStatus: "MISS", requestId: "detail" }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." }, requestId: "missing" }) });
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/travel-collection/routes.html`);
  await page.locator(`[data-route-card='${detailRecord.id}']`).click();
  await page.waitForURL(`**/route-detail.html?id=${detailRecord.id}`);
  await page.locator("[data-route-detail-state='ready']").waitFor();
  assert.equal(requests.at(-1).mode, "detail");
  assert.equal(requests.at(-1).routeId, detailRecord.id);
  assert.equal(await page.locator("[data-route-name]").innerText(), detailRecord.name);
  assert.match(await page.locator("[data-route-summary]").innerText(), /北境公路/);
  assert.match(await page.locator("[data-route-places]").innerText(), /道森克里克.*费尔班克斯/);
  assert.equal(await page.locator("[data-route-destination]").count(), 3);
  assert.equal(await page.locator("[data-route-source]").getAttribute("href"), detailRecord.source.url);

  await page.evaluate(() => localStorage.clear());
  partialMedia = true;
  await page.reload();
  await page.locator("[data-route-detail-state='ready']").waitFor();
  assert.equal(await page.locator("[data-route-destination]").count(), 3, "missing destination media must not hide the destination");
  assert.equal(await page.locator("[data-route-destination-media='missing']").count(), 1);
  assert.equal(await page.locator("[data-route-destination-media='missing'] img").count(), 0, "missing media must not render a placeholder image");
  assert.match(await page.locator("[data-route-destination-grid]").getAttribute("data-missing-destinations"), /费尔班克斯/);

  await page.goto(`${origin}/travel-collection/route-detail.html?id=wikivoyage-999999`);
  await page.locator("[data-route-detail-state='not-found']").waitFor();
  const notFoundText = await page.locator("[data-route-detail-state='not-found']").innerText();
  assert.match(notFoundText, /404/);
  assert.match(notFoundText, /未找到/);
  assert.doesNotMatch(notFoundText, /阿拉斯加公路线/, "404 must not fall back to another route");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("Route Detail V2 verified: Feed navigation, partial destination media, exact fields, and no-fallback 404.");
