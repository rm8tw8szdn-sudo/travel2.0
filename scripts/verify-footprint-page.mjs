import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function requirePlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    const bundledPackage = path.resolve(path.dirname(process.execPath), "..", "node_modules", "playwright", "package.json");
    if (!fs.existsSync(bundledPackage)) throw error;
    return createRequire(pathToFileURL(bundledPackage))("playwright");
  }
}

const { chromium } = requirePlaywright();

const html = fs.readFileSync(path.join(root, "footprint.html"), "utf8");
const css = fs.readFileSync(path.join(root, "mobile.css"), "utf8");
const js = fs.readFileSync(path.join(root, "footprint.js"), "utf8");

function fileUrl(file) {
  return pathToFileURL(path.join(root, file)).href;
}

async function compactText(locator) {
  return (await locator.innerText()).replace(/\s+/g, " ").trim();
}

function assertIncludes(source, markers, label) {
  const missing = markers.filter((marker) => !source.includes(marker));
  assert.deepEqual(missing, [], `${label} missing markers:\n${missing.join("\n")}`);
}

assertIncludes(html, [
  'class="home-screen footprint-screen"',
  'bottom-tab-bar active="我的"',
  'data-world-map data-world-map-mode="detail"',
  'data-footprint-progress',
  'data-footprint-country-count',
  'data-footprint-city-count',
  'data-footprint-trip-count',
  'data-footprint-trip-list',
  'data-footprint-achievement-list',
  'data-footprint-list="trips"',
  'data-footprint-list="achievements"',
], "footprint.html");

assertIncludes(css, [
  ".footprint-map-card",
  ".travel-world-map--footprint",
  ".footprint-progress-card",
  ".footprint-timeline-line",
  ".footprint-stats-card",
  ".footprint-achievement-grid",
  ".footprint-screen .home-tabbar",
], "mobile.css");

assertIncludes(js, [
  "function calculateFootprintStats",
  "function renderFootprintTrips",
  "function renderFootprintAchievements",
  "TravelState",
  "getTravelStats",
  "data-footprint-country-count",
  "data-footprint-city-count",
  "data-footprint-trip-count",
  "data-footprint-full-trips",
  "data-footprint-full-achievements",
  "from === \"home\" ? \"mobile.html\" : \"profile.html\"",
], "footprint.js");

for (const forbidden of [
  "data-footprint-map-asset",
  "data-footprint-pet-asset",
  "footprint-pet",
  "这里会在正式版本中展开对应列表",
  "占位入口",
]) {
  assert.equal(
    html.includes(forbidden) || css.includes(forbidden) || js.includes(forbidden),
    false,
    `Footprint page should not contain legacy/placeholder marker: ${forbidden}`,
  );
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await page.goto(fileUrl("footprint.html"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("[data-footprint-trip-list]");

  const runtime = await page.evaluate(() => {
    const state = window.TravelState.readTravelState();
    const stats = window.TravelState.getTravelStats(state);
    const completedTrips = (state.trips || [])
      .filter((trip) => trip.status === "completed")
      .sort((a, b) => String(b.end || b.endDate || "").localeCompare(String(a.end || a.endDate || "")));
    const latest = completedTrips[0];
    const latestCountryNames = (latest?.countryIds || []).map((id) => state.countriesById?.[id]?.name || id);
    return {
      countryCount: stats.exploredCountryCount,
      cityCount: stats.exploredCityCount,
      tripCount: stats.completedTripCount,
      latestTripName: latest?.name || "",
      latestCountryText: latestCountryNames.join(" · "),
    };
  });

  const countryTexts = await page.locator("[data-footprint-country-count]").allTextContents();
  const cityTexts = await page.locator("[data-footprint-city-count]").allTextContents();
  const tripTexts = await page.locator("[data-footprint-trip-count]").allTextContents();
  assert.ok(countryTexts.every((item) => item.trim() === String(runtime.countryCount)), "country count should match TravelState stats everywhere");
  assert.ok(cityTexts.every((item) => item.trim() === String(runtime.cityCount)), "city count should match TravelState stats everywhere");
  assert.ok(tripTexts.every((item) => item.trim() === String(runtime.tripCount)), "trip count should match TravelState stats everywhere");

  const progressText = await page.locator("[data-footprint-progress-percent]").innerText();
  assert.equal(progressText.trim(), `${Math.min(100, Math.max(0, runtime.countryCount / 195 * 100)).toFixed(1)}%`, "progress percent should be derived from country count");

  const tripListText = await compactText(page.locator("[data-footprint-trip-list]"));
  if (runtime.tripCount > 0) {
    assert.ok(
      tripListText.includes(runtime.latestTripName) || tripListText.includes(runtime.latestCountryText),
      "recent trip list should render the latest completed trip from TravelState",
    );
  } else {
    assert.ok(tripListText.includes("还没有已完成旅程"), "empty state should render when there are no completed trips");
  }

  const achievementCount = await page.locator("[data-footprint-achievement-list] [data-achievement]").count();
  assert.ok(achievementCount <= 3, "footprint page should only show a compact achievement preview");

  await page.goto(`${fileUrl("footprint.html")}?from=home`);
  await page.locator("[data-footprint-back]").click();
  await page.waitForURL(fileUrl("mobile.html"));

  await page.goto(fileUrl("footprint.html"));
  await page.locator("[data-footprint-back]").click();
  await page.waitForURL(fileUrl("profile.html"));
} finally {
  await browser.close();
}

console.log("Footprint page runtime verification passed.");
