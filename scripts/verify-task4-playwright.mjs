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
  await page.goto(fileUrl("trips.html"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  assert.equal(await page.locator("[data-trip-tab]").count(), 2, "trip page should use upcoming/completed tabs only");
  assert.ok(await page.locator("[data-trip-list='upcoming'] [data-trip-open]").count() >= 1, "upcoming list should render from state");

  await page.getByRole("button", { name: "+ 新建行程" }).click();
  await page.locator("[data-trip-name-input]").fill("任务四测试行程");
  await page.locator("[data-trip-start-input]").fill("2026.09.01");
  await page.locator("[data-trip-end-input]").fill("2026.09.08");
  await page.getByRole("button", { name: "下一步" }).click();
  while (await page.locator(".trip-selected-list [data-remove-place]").count()) {
    await page.locator(".trip-selected-list [data-remove-place]").first().click();
  }
  await page.locator("[data-place-search]").fill("瑞典");
  await page.getByRole("button", { name: "+ 添加更多" }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  assert.ok((await text(page.locator("[data-trip-preview]"))).includes("任务四测试行程"), "step 3 should preview new trip");
  await page.getByRole("button", { name: "创建行程" }).click();

  assert.ok((await text(page.locator("[data-trip-detail-modal]"))).includes("任务四测试行程"), "created trip should jump to detail");
  let stateSnapshot = await page.evaluate(() => {
    const state = window.TravelState.readTravelState();
    const trip = state.trips.find((item) => item.name === "任务四测试行程");
    return {
      tripId: trip?.id,
      status: trip?.status,
      sweden: state.countriesById.SE.explorationStatus,
    };
  });
  assert.equal(stateSnapshot.status, "upcoming", "created trip should be upcoming");
  assert.equal(stateSnapshot.sweden, "planned", "created upcoming trip should mark Sweden planned");
  const createdTripId = stateSnapshot.tripId;

  await page.locator("[data-trip-record-input]").fill("任务四完成记录");
  await page.getByRole("button", { name: "完成旅程" }).click();
  assert.ok((await text(page.locator("[data-trip-detail-modal]"))).includes("已完成"), "completed detail should stay open");
  assert.ok((await text(page.locator("[data-trip-detail-modal]"))).includes("预算"), "completed detail should expose budget entry");

  stateSnapshot = await page.evaluate((tripId) => {
    const state = window.TravelState.readTravelState();
    const trip = state.trips.find((item) => item.id === tripId);
    return {
      status: trip?.status,
      sweden: state.countriesById.SE.explorationStatus,
      memory: trip?.memory,
    };
  }, createdTripId);
  assert.equal(stateSnapshot.status, "completed", "complete action should update trip status");
  assert.equal(stateSnapshot.sweden, "explored", "complete action should recalculate explored status");
  assert.equal(stateSnapshot.memory, "任务四完成记录", "complete action should save record");

  await page.getByRole("button", { name: "预算" }).click();
  assert.ok((await text(page.locator("[data-trip-budget-modal]"))).includes("任务四测试行程"), "budget page should open for selected trip");
  await page.locator("[data-budget-name]").fill("测试交通");
  await page.locator("[data-budget-amount]").fill("321");
  await page.locator("[data-add-budget-item]").click();
  const budgetSnapshot = await page.evaluate((tripId) => {
    const state = window.TravelState.readTravelState();
    const otherTrip = state.trips.find((trip) => trip.id !== tripId);
    return {
      current: window.TravelState.getTripBudgetItems(state, tripId).map((item) => item.name),
      other: window.TravelState.getTripBudgetItems(state, otherTrip?.id).map((item) => item.name),
    };
  }, createdTripId);
  assert.deepEqual(budgetSnapshot.current, ["测试交通"], "budget item should belong to current trip");
  assert.deepEqual(budgetSnapshot.other, [], "budget item should not leak to another trip");

  await page.getByLabel("返回行程详情").click();
  await page.getByRole("button", { name: "改回待出行" }).click();
  const reopened = await page.evaluate((tripId) => {
    const state = window.TravelState.readTravelState();
    return {
      status: state.trips.find((trip) => trip.id === tripId)?.status,
      sweden: state.countriesById.SE.explorationStatus,
    };
  }, createdTripId);
  assert.equal(reopened.status, "upcoming", "reopen action should set trip upcoming");
  assert.equal(reopened.sweden, "planned", "reopen action should recalculate planned status");

  await page.getByRole("button", { name: "完成旅程" }).click();
  await page.getByRole("button", { name: "分享" }).click();
  assert.ok((await text(page.locator("[data-share-card-modal]"))).includes("任务四测试行程"), "share should open trip share card");
} finally {
  await browser.close();
}

console.log("Task 4 Playwright flows verified.");
