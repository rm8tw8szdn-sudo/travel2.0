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

async function text(locator) {
  return (await locator.innerText()).replace(/\s+/g, " ").trim();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await page.goto(fileUrl("mobile.html"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.goto(`${fileUrl("city-oslo.html")}#SE-STO`);
  await page.getByRole("button", { name: "加入行程" }).click();
  await page.locator("[data-confirm-add-trip]").click();
  let state = await page.evaluate(() => {
    const current = window.TravelState.readTravelState();
    return {
      sweden: current.countriesById.SE.explorationStatus,
      stockholm: current.citiesById["SE-STO"].explorationStatus,
    };
  });
  assert.equal(state.sweden, "planned", "adding a city should mark its country planned");
  assert.equal(state.stockholm, "planned", "adding a city should mark the city planned");

  await page.goto(fileUrl("country-japan.html"));
  await page.locator("[data-add-to-trip]").click();
  await page.locator("[data-confirm-add-trip]").click();
  const countryAdded = await page.evaluate(() => {
    const current = window.TravelState.readTravelState();
    return current.trips.some((trip) => trip.status !== "completed" && trip.countryIds.includes("JP"));
  });
  assert.equal(countryAdded, true, "adding a country should append it to an upcoming trip");

  await page.goto(fileUrl("trips.html"));
  await page.getByRole("button", { name: "+ 新建行程" }).click();
  await page.locator("[data-trip-name-input]").fill("任务六闭环行程");
  await page.locator("[data-trip-start-input]").fill("2026.10.01");
  await page.locator("[data-trip-end-input]").fill("2026.10.08");
  await page.getByRole("button", { name: "下一步" }).click();
  while (await page.locator(".trip-selected-list [data-remove-place]").count()) {
    await page.locator(".trip-selected-list [data-remove-place]").first().click();
  }
  await page.locator("[data-place-search]").fill("希腊");
  await page.getByRole("button", { name: "+ 添加更多" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "创建行程" }).click();

  const createdTripId = await page.evaluate(() => {
    const current = window.TravelState.readTravelState();
    return current.trips.find((trip) => trip.name === "任务六闭环行程")?.id;
  });
  assert.ok(createdTripId, "new trip should be persisted");

  await page.locator("[data-trip-record-input]").fill("任务六全链路完成记录");
  await page.getByRole("button", { name: "完成旅程" }).click();
  state = await page.evaluate((tripId) => {
    const current = window.TravelState.readTravelState();
    return {
      tripStatus: current.trips.find((trip) => trip.id === tripId)?.status,
      greece: current.countriesById.GR.explorationStatus,
      completedTripCount: current.completedTripCount,
    };
  }, createdTripId);
  assert.equal(state.tripStatus, "completed", "created trip should complete");
  assert.equal(state.greece, "explored", "completed trip should mark country explored");
  assert.ok(state.completedTripCount >= 2, "completed count should include the new trip");

  await page.goto(fileUrl("mobile.html"));
  assert.ok((await text(page.locator(".home-screen"))).includes("任务六闭环行程"), "home should show the latest completed trip");

  await page.goto(fileUrl("atlas.html"));
  await page.locator("[data-atlas-search]").fill("希腊");
  assert.ok((await text(page.locator("[data-atlas-results]"))).includes("已探索"), "atlas should show completed country as explored");

  await page.goto(fileUrl("footprint.html"));
  assert.ok((await text(page.locator("[data-footprint-trip-list]"))).includes("希腊"), "footprint should list the completed trip destination");

  await page.goto(fileUrl("profile.html"));
  const profileCopy = await text(page.locator(".profile-screen"));
  assert.ok(profileCopy.includes("已点亮国家"), "profile stats should render from unified state");
  const profileStats = await page.evaluate(() => {
    const current = window.TravelState.readTravelState();
    return {
      exploredCountryCount: current.exploredCountryCount,
      notifications: window.TravelState.getNotifications(current).map((item) => item.type),
      achievements: window.TravelState.getAchievements(current).filter((item) => item.unlockedAt).length,
    };
  });
  assert.ok(profileStats.exploredCountryCount >= 12, "profile state should include completed trip stats");
  assert.ok(profileStats.notifications.includes("足迹事件"), "completion should generate a footprint notification");
  assert.ok(profileStats.achievements >= 1, "achievements should remain available");

  await page.goto(fileUrl("trips.html"));
  await page.getByRole("button", { name: "已完成" }).click();
  await page.locator(`[data-trip-open="${createdTripId}"]`).click();
  await page.getByRole("button", { name: "改回待出行" }).click();
  state = await page.evaluate((tripId) => {
    const current = window.TravelState.readTravelState();
    return {
      tripStatus: current.trips.find((trip) => trip.id === tripId)?.status,
      greece: current.countriesById.GR.explorationStatus,
    };
  }, createdTripId);
  assert.equal(state.tripStatus, "upcoming", "reopen should set trip upcoming");
  assert.equal(state.greece, "planned", "reopen should recalculate country as planned");

  await page.getByRole("button", { name: "删除行程" }).click();
  state = await page.evaluate((tripId) => {
    const current = window.TravelState.readTravelState();
    return {
      exists: current.trips.some((trip) => trip.id === tripId),
      greece: current.countriesById.GR.explorationStatus,
    };
  }, createdTripId);
  assert.equal(state.exists, false, "delete should remove the trip");
  assert.equal(state.greece, "unexplored", "delete should recalculate country status");
} finally {
  await browser.close();
}

console.log("Task 6 end-to-end flow verified.");
