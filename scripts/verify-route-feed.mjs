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
const htmlPath = path.join(travelRoot, "routes.html");
const scriptPath = path.join(travelRoot, "routes.js");

const html = fs.readFileSync(htmlPath, "utf8");
const feedScript = fs.readFileSync(scriptPath, "utf8");
assert.match(html, /data-route-feed/, "routes.html should expose the Route Feed root");
assert.match(html, /data-route-feed-sentinel/, "routes.html should expose an infinite-feed sentinel");
assert.match(html, /<script src="routes\.js\?v=[^"]+" defer><\/script>/, "routes.html should load routes.js");
assert.ok(fs.existsSync(scriptPath), "routes.js should exist");
assert.match(feedScript, /route-inspiration-card/, "Route Feed cards should use the frozen legacy card layout");
assert.match(feedScript, /data-route-open/, "Route Feed cards should open detail from the legacy card body");
assert.match(feedScript, /travel\.routeFeedVerified\.v4/, "Route Feed must use the content-quality cache schema");
assert.doesNotMatch(feedScript, /travel\.routeFeedVerified\.v[123]/, "Route Feed must not reuse pre-quality pagination caches");
assert.match(feedScript, /PAGINATION_COVER_MIN_MS = 700/, "pagination should reserve a visible cover warm-up interval");
assert.match(feedScript, /PAGINATION_COVER_CONCURRENCY = 4/, "pagination cover preloading must use bounded concurrency");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);
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
const { port } = server.address();

function routeRecord(index) {
  return {
    id: `wikivoyage-online-route-${index}`,
    name: `联网路线 ${index}`,
    canonicalTitle: `联网路线 ${index}`,
    summary: `这是一条由联网发现返回的中文路线 ${index}。`,
    recommendationText: `沿铁路串联日韩城市文化与沿途街区体验 ${index}。`,
    countries: ["日本", "韩国"],
    countryEntities: [{ countryCode: "JP", name: "日本" }, { countryCode: "KR", name: "韩国" }],
    destinations: [`东京 ${index}`, `首尔 ${index}`, `釜山 ${index}`],
    destinationEntities: [{ wikidataId: `Q${index}01`, name: `东京 ${index}`, countryCode: "JP" }, { wikidataId: `Q${index}02`, name: `首尔 ${index}`, countryCode: "KR" }, { wikidataId: `Q${index}03`, name: `釜山 ${index}`, countryCode: "KR" }],
    durationDays: 5 + (index % 7),
    recommendedDays: "7-10天",
    bestMonths: ["3-5月", "10-11月"],
    themes: ["铁路旅行"],
    tags: ["live-discovery", "Wikivoyage"],
    coverAsset: { provider: "wikivoyage-pageimage", assetId: `cover-${index}`, sourceUrl: `https://commons.wikimedia.org/wiki/File:cover-${index}.jpg`, imageUrl: `https://upload.wikimedia.org/cover-${index}.jpg`, author: "", license: "", width: 1200, height: 720, discoveredVia: "route-pageimage" },
    source: { name: "Wikivoyage", url: `https://en.wikivoyage.org/wiki/Online_route_${index}` },
    contentQualityStatus: "accepted",
    classification: "cross",
  };
}

let phase = "feed";
let requestBodies = [];
let retryFailures = 0;
let activeImageRequests = 0;
let maxActiveImageRequests = 0;
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("https://upload.wikimedia.org/**", async (route) => {
    activeImageRequests += 1;
    maxActiveImageRequests = Math.max(maxActiveImageRequests, activeImageRequests);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
    activeImageRequests -= 1;
  });
  await page.route("**/api/routes/discovery", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    requestBodies.push(body);
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (phase === "error") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "offline" } }) });
      return;
    }
    const isSecondPage = body.cursor === "page-two";
    const isThirdPage = body.cursor === "page-three";
    const isFourthPage = body.cursor === "page-four";
    const isFifthPage = body.cursor === "page-five";
    const isSixthPage = body.cursor === "page-six";
    const stressPage = phase === "stress" ? Number(String(body.cursor || "stress-0").replace("stress-", "")) : null;
    if (phase === "retry" && isFourthPage && retryFailures++ === 0) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "retry" } }) });
      return;
    }
    const pageLength = phase === "stress" ? 2 : phase === "small-first" ? 5 : body.limit;
    const records = phase === "empty" || (phase === "empty-window" && isFifthPage)
      ? []
      : Array.from({ length: pageLength }, (_, offset) => routeRecord((phase === "stress" ? 1000 + stressPage * 2 : isSixthPage ? 33 : isFourthPage ? 25 : isThirdPage ? 17 : isSecondPage ? 9 : 1) + offset));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        records,
        nextCursor: phase === "stress" ? (stressPage < 50 ? `stress-${stressPage + 1}` : null) : isSecondPage ? "page-three" : isThirdPage ? "page-four" : isFourthPage ? "page-five" : isFifthPage ? "page-six" : (!isSixthPage && records.length ? "page-two" : null),
        hasMore: phase === "stress" ? stressPage < 50 : !isSixthPage && (records.length > 0 || isFifthPage),
        cacheStatus: "MISS",
        requestId: "browser-test",
        repositoryVersion: "test-repository-v1",
      }),
    });
  });

  const url = `http://127.0.0.1:${port}/travel-collection/routes.html`;
  const navigation = page.goto(url);
  await page.locator("[data-route-feed-state='loading']").waitFor({ state: "visible" });
  await navigation;
  await page.locator("[data-route-card]").nth(7).waitFor();
  assert.equal(await page.locator("[data-route-card]").count(), 8, "initial feed should render exactly 8 records");
  const firstGeography = await page.locator("[data-route-card]").first().locator("em").innerText();
  assert.match(firstGeography, /日本.*韩国/, "Feed geography must display countries");
  assert.match(firstGeography, /东京 1.*首尔 1/, "Feed geography must display principal destinations");
  assert.equal(requestBodies[0].mode, "feed");
  assert.equal(requestBodies[0].limit, 8);
  assert.equal(requestBodies[0].routeType, "cross");
  assert.equal(requestBodies[0].cursor, null);
  assert.ok(requestBodies[0].sessionId, "feed requests should include a sessionId");
  while (activeImageRequests) await new Promise((resolve) => setTimeout(resolve, 20));
  maxActiveImageRequests = 0;
  await page.evaluate(() => { window.__routeFeedFirstImage = document.querySelector("[data-route-card] img"); });

  await page.mouse.wheel(0, 5000);
  await page.locator("[data-route-card]").nth(15).waitFor();
  assert.equal(await page.locator("[data-route-card]").count(), 16, "scrolling to the sentinel should append the next page");
  assert.equal(await page.evaluate(() => window.__routeFeedFirstImage === document.querySelector("[data-route-card] img")), true, "pagination must preserve existing image elements");
  assert.ok(maxActiveImageRequests <= 8, `cover loading must remain bounded to one page after repeated pagination (observed ${maxActiveImageRequests})`);
  const appendedImages = page.locator("[data-route-card]").nth(8).locator("img");
  assert.equal(await appendedImages.getAttribute("loading"), "eager", "new page covers should decode eagerly after preloading");
  await page.waitForFunction(() => document.querySelectorAll("[data-route-card]")[8]?.querySelector("img")?.naturalWidth > 0);
  assert.equal(requestBodies[1].cursor, "page-two");
  assert.equal(requestBodies[1].excludeIds.length, 8);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.wheel(0, 5000);
  await page.locator("[data-route-card]").nth(23).waitFor();
  assert.equal(await page.locator("[data-route-card]").count(), 24, "a second sentinel intersection should append a third page");
  assert.equal(requestBodies[2].cursor, "page-three");
  assert.equal(requestBodies[2].excludeIds.length, 16);
  const ids = await page.locator("[data-route-card]").evaluateAll?.((cards) => cards.map((card) => card.dataset.routeCard));
  if (ids) assert.equal(new Set(ids).size, ids.length, "three feed pages must not repeat route IDs");
  const titles = await page.locator("[data-route-card] strong").allTextContents();
  assert.equal(new Set(titles).size, titles.length, "three feed pages must not repeat Chinese titles");
  phase = "retry";
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.wheel(0, 5000);
  await page.locator("[data-route-card]").nth(31).waitFor();
  const retryRequests = requestBodies.filter((body) => body.cursor === "page-four");
  assert.equal(retryRequests.length, 2, "pagination should retry one transient failure");
  assert.equal(retryRequests[0].cursor, retryRequests[1].cursor, "pagination retry must reuse the same cursor");
  assert.equal(await page.locator("[data-route-card]").count(), 32, "retry should append records without clearing prior pages");
  phase = "empty-window";
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.wheel(0, 5000);
  await page.locator("[data-route-card]").nth(39).waitFor();
  const fifthPageIndex = requestBodies.findIndex((body) => body.cursor === "page-five");
  assert.ok(fifthPageIndex >= 0, "the browser must request the empty candidate window");
  assert.equal(requestBodies[fifthPageIndex + 1].cursor, "page-six", "the browser must advance past an empty candidate window");
  assert.equal(await page.locator("[data-route-card]").count(), 40, "a later qualified window should append without manual retry");
  const verifiedCacheBeforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem("travel.routeFeedVerified.v4") || "{}"));
  assert.ok(Object.keys(verifiedCacheBeforeReload).length >= 4, "successful online pages must be written to verified cache");
  assert.ok(Object.values(verifiedCacheBeforeReload).every((entry) => entry.schemaVersion && Array.isArray(entry.routeIds) && !("records" in entry)), "verified feed cache must store page metadata, not RouteRecord content");

  phase = "error";
  requestBodies = [];
  await page.reload();
  await page.locator("[data-route-feed-state='error']").waitFor();
  assert.equal(await page.locator("[data-route-card]").count(), 0, "localStorage page metadata must not render cards without Repository validation");

  await page.evaluate(() => localStorage.removeItem("travel.routeFeedVerified.v4"));
  await page.reload();
  await page.locator("[data-route-feed-state='error']").waitFor();
  assert.match(await page.locator("[data-route-feed-state='error']").innerText(), /重新加载/);

  phase = "feed";
  await page.click("[data-route-feed-refresh]");
  await page.locator("[data-route-card]").nth(7).waitFor();
  assert.equal(await page.locator("[data-route-card]").count(), 8, "refresh should recover from an error");

  phase = "empty";
  await page.evaluate(() => localStorage.removeItem("travel.routeFeedVerified.v4"));
  await page.reload();
  await page.locator("[data-route-feed-state='empty']").waitFor();
  assert.match(await page.locator("[data-route-feed-state='empty']").innerText(), /暂时没有发现路线/);

  phase = "feed";
  await page.evaluate(() => localStorage.removeItem("travel.routeFeedVerified.v4"));
  await page.reload();
  await page.locator("[data-route-card]").nth(7).waitFor();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.ok(await page.evaluate(() => window.scrollY > 0), "test setup must leave the previous feed at the bottom");

  phase = "small-first";
  requestBodies = [];
  await page.evaluate(() => localStorage.removeItem("travel.routeFeedVerified.v4"));
  await page.reload();
  await page.locator("[data-route-card]").nth(4).waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.scrollY), 0, "a reloaded Route Feed must start at the top and wait for a new user scroll");
  assert.equal(requestBodies.length, 1, "a short first page must wait for a real scroll before requesting page two");
  const pageTwoStartedAt = Date.now();
  await page.mouse.wheel(0, 5000);
  await page.locator("[data-route-feed-state='loading']").waitFor();
  await page.waitForTimeout(200);
  assert.equal(await page.locator("[data-route-card]").count(), 5, "page two should not append before its covers have a short warm-up window");
  assert.equal(await page.locator("[data-route-feed-state='loading']").count(), 1, "pagination loading feedback must remain visible during cover warm-up");
  await page.locator("[data-route-card]").nth(9).waitFor();
  assert.ok(Date.now() - pageTwoStartedAt >= 650, "page two should reserve enough time for cover images to warm before append");

  phase = "stress";
  requestBodies = [];
  await page.evaluate(() => localStorage.removeItem("travel.routeFeedVerified.v4"));
  await page.reload();
  await page.locator("[data-route-card]").nth(1).waitFor();
  await page.evaluate(() => { window.__stressFirstImage = document.querySelector("[data-route-card] img"); });
  for (let pageIndex = 1; pageIndex <= 50; pageIndex += 1) {
    await page.mouse.wheel(0, 5000);
    await page.locator("[data-route-card]").nth(1 + pageIndex * 2).waitFor();
  }
  assert.equal(await page.locator("[data-route-card]").count(), 102, "fifty pagination cycles should append exactly one page each");
  assert.equal(await page.evaluate(() => window.__stressFirstImage === document.querySelector("[data-route-card] img")), true, "fifty pages must preserve the first image element");
  const stressImages = await page.locator("[data-route-card] img").evaluateAll((images) => images.map((image) => ({ complete: image.complete, width: image.naturalWidth })));
  assert.equal(stressImages.filter((image) => !image.complete || !image.width).length, 0, "all covers should be ready after fifty pagination cycles");
  const stressIds = await page.locator("[data-route-card]").evaluateAll((cards) => cards.map((card) => card.dataset.routeCard));
  assert.equal(new Set(stressIds).size, stressIds.length, "fifty pagination cycles must not duplicate routes");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log("Route Feed verified: three-page sentinel loading, cursor append, error refresh, and empty state.");
