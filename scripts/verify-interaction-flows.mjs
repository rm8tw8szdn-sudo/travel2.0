import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function urlFor(file) {
  const [pathname, hash = ""] = file.split("#");
  return `${pathToFileURL(path.join(root, pathname)).href}${hash ? `#${hash}` : ""}`;
}

async function text(page, selector) {
  return (await page.locator(selector).innerText()).replace(/\s+/g, " ").trim();
}

async function resetStorage(page, file) {
  await page.goto(urlFor(file));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await resetStorage(page, "country-japan.html#GR");
  assert((await text(page, ".country-hero-copy h1")).includes("希腊"), "country detail should render by hash");
  assert((await text(page, "[data-explore-toggle]")).includes("未去"), "unvisited country should start unexplored");
  await page.click("[data-explore-toggle]");
  await page.locator("[data-explore-modal]").waitFor({ state: "visible" });
  await page.click("[data-save-explore]");
  assert((await text(page, "[data-explore-toggle]")).includes("已去"), "manual explore should mark country explored");

  await page.goto(urlFor("mobile.html"));
  await page.locator("[data-profile-home-link]").click();
  await page.waitForURL(urlFor("profile.html"));

  await page.goto(urlFor("mobile.html"));
  await page.locator(".home-stat-card").click();
  await page.waitForURL(urlFor("footprint.html"));

  await page.goto(urlFor("mobile.html"));
  await page.locator(".home-next-card").click();
  await page.waitForURL(/trips\.html#trip-nordic$/);
  await page.locator("[data-trip-detail-modal]:not([hidden])").waitFor();
  assert((await text(page, "[data-trip-detail-modal] h1")).includes("北欧极光之旅"), "home next target should open trip detail");

  await page.goto(urlFor("mobile.html"));
  await page.locator(".home-recent-card").click();
  await page.waitForURL(/trips\.html#trip-japan-kansai$/);
  await page.locator("[data-trip-detail-modal]:not([hidden])").waitFor();
  assert((await text(page, "[data-trip-detail-modal] h1")).includes("日本关西之旅"), "home recent trip should open trip detail");

  await page.goto(urlFor("trips.html"));
  await page.click("[data-new-trip]");
  await page.locator("[data-trip-step='1']").waitFor({ state: "visible" });
  await page.fill("[data-trip-name-input]", "");
  await page.click("[data-trip-next]");
  await page.locator("[data-trip-step='2']").waitFor({ state: "visible" });
  await page.click("[data-trip-step='2'] [data-trip-next]");
  await page.locator("[data-trip-step='3']").waitFor({ state: "visible" });
  const previewText = await text(page, "[data-trip-preview]");
  assert(previewText.includes("3国旅行计划"), "empty trip name should auto-name by selected countries");
  assert(previewText.includes("挪威 · 冰岛 · 芬兰"), "trip preview should carry selected places");
  const createdTripId = await page.evaluate(() => {
    document.querySelector("[data-create-trip]")?.click();
    const state = window.TravelState.readTravelState();
    return state.trips.at(-1).id;
  });
  await page.locator("[data-trip-detail-modal]:not([hidden])").waitFor();
  assert((await text(page, "[data-trip-detail-modal] h1")).includes("3国旅行计划"), "created trip should open its detail");
  const createdTrip = await page.evaluate((id) => {
    const state = window.TravelState.readTravelState();
    return state.trips.find((trip) => trip.id === id);
  }, createdTripId);
  assert.equal(createdTrip.status, "upcoming");
  assert.equal(createdTrip.budget, "", "budget should be optional and skippable");

  await page.click(`[data-complete-trip="${createdTripId}"]`);
  await page.locator("[data-trip-detail-modal] .trip-complete-callout").waitFor();
  const countryStatuses = await page.evaluate(() => {
    const state = window.TravelState.readTravelState();
    return ["NO", "IS", "FI"].map((id) => state.countriesById[id].explorationStatus);
  });
  assert.deepEqual(countryStatuses, ["explored", "explored", "explored"], "completed trip should light countries");

  await page.click(`[data-delete-trip="${createdTripId}"]`);
  const fallbackStatuses = await page.evaluate(() => {
    const state = window.TravelState.readTravelState();
    return ["NO", "IS", "FI"].map((id) => state.countriesById[id].explorationStatus);
  });
  assert.deepEqual(
    fallbackStatuses,
    ["planned", "explored", "planned"],
    "deleting completed trip should recalculate from upcoming trips while preserving manual explored marks",
  );
} finally {
  await browser.close();
}

console.log("Interaction flows verified.");
