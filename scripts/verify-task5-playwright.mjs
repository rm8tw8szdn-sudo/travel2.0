import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function fileUrl(file) {
  return pathToFileURL(path.join(root, file)).href;
}

async function compactText(locator) {
  return (await locator.innerText()).replace(/\s+/g, " ").trim();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await page.goto(fileUrl("profile.html"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const profileText = await compactText(page.locator(".profile-screen"));
  assert.ok(profileText.includes("Ruby"), "profile should show nickname from state");
  assert.ok(profileText.includes("收藏数量"), "profile should show favorite count stat");

  await page.getByRole("button", { name: /我的收藏/ }).click();
  await page.waitForURL(fileUrl("favorites.html"));
  assert.ok((await compactText(page.locator("[data-favorite-grid]"))).includes("日本"), "favorites should render favorite countries from state");
  await page.locator("[data-favorite-search]").fill("冰岛");
  assert.ok((await compactText(page.locator("[data-favorite-grid]"))).includes("冰岛"), "favorites search should match countries");
  await page.getByRole("button", { name: "城市" }).click();
  assert.ok((await compactText(page.locator("[data-favorite-grid]"))).includes("东京"), "city tab should render favorite cities");
  await page.locator("[data-remove-favorite]").first().click();
  const afterUnfavorite = await page.evaluate(() => {
    const state = window.TravelState.readTravelState();
    return {
      norwayStatus: state.countriesById.NO.explorationStatus,
    };
  });
  assert.equal(afterUnfavorite.norwayStatus, "planned", "cancel favorite should not affect exploration status");

  await page.goto(fileUrl("profile.html"));
  await page.getByRole("button", { name: /查看时间轴/ }).click();
  await page.waitForURL(fileUrl("footprint.html"));
  const footprintText = await compactText(page.locator(".footprint-screen"));
  assert.ok(footprintText.includes("日本关西之旅") || footprintText.includes("日本"), "footprint should render completed trip data");
  await page.locator("[data-achievement]").first().click();
  assert.ok((await compactText(page.locator(".footprint-notice"))).includes("成就详情"), "achievement detail modal should open");

  await page.goto(fileUrl("profile.html"));
  await page.getByRole("button", { name: /通知中心/ }).click();
  assert.ok((await compactText(page.locator("[data-notification-list]"))).includes("通知"), "notification center should open");
  const unreadBefore = await page.evaluate(() => window.TravelState.getNotifications(window.TravelState.readTravelState()).filter((item) => !item.read).length);
  await page.locator("[data-mark-notification-read]").first().click();
  const unreadAfter = await page.evaluate(() => window.TravelState.getNotifications(window.TravelState.readTravelState()).filter((item) => !item.read).length);
  assert.equal(unreadAfter, unreadBefore - 1, "mark read should update notification state");
} finally {
  await browser.close();
}

console.log("Task 5 Playwright flows verified.");
