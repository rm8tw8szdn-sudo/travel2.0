import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(root, "..", "output/playwright/task6");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function fileUrl(file) {
  return pathToFileURL(path.join(root, file)).href;
}

async function clickIfVisible(page, selector) {
  const locator = page.locator(selector).first();
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    await page.waitForTimeout(200);
    return true;
  }
  return false;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
}

async function resetState(page) {
  await page.goto(fileUrl("mobile.html"));
  await page.evaluate(() => localStorage.clear());
}

async function createCompletedScreenshotTrip(page) {
  await page.goto(fileUrl("trips.html"));
  await page.getByRole("button", { name: "+ 新建行程" }).click();
  await page.locator("[data-trip-name-input]").fill("任务六截图行程");
  await page.locator("[data-trip-start-input]").fill("2026.11.03");
  await page.locator("[data-trip-end-input]").fill("2026.11.09");
  await page.getByRole("button", { name: "下一步" }).click();
  while (await page.locator(".trip-selected-list [data-remove-place]").count()) {
    await page.locator(".trip-selected-list [data-remove-place]").first().click();
  }
  await page.locator("[data-place-search]").fill("希腊");
  await page.getByRole("button", { name: "+ 添加更多" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "创建行程" }).click();
  await page.locator("[data-trip-record-input]").fill("截图验证完成记录");
  await page.getByRole("button", { name: "完成旅程" }).click();
  return page.evaluate(() => window.TravelState.readTravelState().trips.find((trip) => trip.name === "任务六截图行程")?.id);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await resetState(page);

  const pages = [
    ["mobile.html", "home"],
    ["atlas.html", "atlas"],
    ["routes.html", "routes"],
    ["trips.html", "trips"],
    ["profile.html", "profile"],
    ["favorites.html", "favorites"],
    ["footprint.html", "footprint"],
    ["country-japan.html", "country-detail"],
    ["city-oslo.html#SE-STO", "city-detail"],
  ];

  for (const [file, name] of pages) {
    const [pageFile, hash = ""] = file.split("#");
    await page.goto(`${fileUrl(pageFile)}${hash ? `#${hash}` : ""}`);
    await page.waitForTimeout(250);
    await screenshot(page, name);
  }

  await page.goto(fileUrl("country-japan.html"));
  await page.locator("[data-share]").first().click();
  await page.waitForTimeout(250);
  await screenshot(page, "share-card");

  await page.goto(fileUrl("country-japan.html"));
  await page.locator("[data-add-to-trip]").click();
  await page.waitForTimeout(250);
  await screenshot(page, "add-trip-modal");

  const screenshotTripId = await createCompletedScreenshotTrip(page);
  await screenshot(page, "trip-detail");
  await clickIfVisible(page, `[data-trip-budget="${screenshotTripId}"]`);
  await screenshot(page, "budget");

  await page.goto(fileUrl("atlas.html"));
  await page.locator("[data-atlas-search]").fill("希腊");
  await page.waitForTimeout(250);
  await screenshot(page, "state-changed-atlas");

  await page.goto(fileUrl("footprint.html"));
  await clickIfVisible(page, "[data-achievement]");
  await screenshot(page, "achievement-detail");

  await page.goto(fileUrl("profile.html"));
  await clickIfVisible(page, "[data-profile-notifications]");
  await screenshot(page, "notification-center");
} finally {
  await browser.close();
}

const files = fs.readdirSync(outputDir).filter((file) => file.endsWith(".png")).sort();
console.log(`Task 6 screenshots saved: ${files.length}`);
files.forEach((file) => console.log(path.join(outputDir, file)));
