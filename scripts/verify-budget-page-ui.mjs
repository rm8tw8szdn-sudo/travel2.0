import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";

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

function urlFor(file) {
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
  const context = await browser.newContext({ viewport: { width: 390, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(urlFor("trips.html"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.click("[data-trip-open='trip-nordic']");
  await page.locator("[data-trip-detail-modal]:not([hidden])").waitFor();
  await page.click("[data-trip-budget='trip-nordic']");
  const modal = page.locator("[data-trip-budget-modal]:not([hidden])");
  await modal.waitFor();

  assert.match(await text(modal.locator(".budget-page-head")), /北欧极光之旅/, "budget page should show route name in top bar");
  assert.equal(await modal.locator("[data-budget-hero]").count(), 1, "budget page should show the budget hero");
  assert.match(await text(modal.locator("[data-budget-hero]")), /预计预算 ¥16,000 合理规划预算，让旅行更安心/, "budget hero should show total and subtitle");

  assert.equal(await modal.locator("[data-calculate-budget-total]").count(), 1, "budget page should expose calculate total action");
  assert.equal(await modal.locator("[data-add-budget-row]").count(), 1, "budget page should expose add row action");
  assert.match(await text(modal.locator("[data-budget-total]")), /以上： 16000/, "budget total should render in the new summary line");

  const rows = modal.locator(".budget-row");
  assert.equal(await rows.count(), 5, "budget detail should keep the five existing budget rows");
  assert.deepEqual(
    await rows.locator("[data-budget-item-name]").evaluateAll((nodes) => nodes.map((node) => node.value)),
    ["机票", "酒店", "交通", "门票", "餐饮"],
    "budget rows should render editable item names",
  );
  assert.deepEqual(
    await rows.locator("[data-budget-item-amount]").evaluateAll((nodes) => nodes.map((node) => node.value)),
    ["5000", "6000", "1500", "1000", "2500"],
    "empty budget should use the visual example amounts",
  );

  await rows.nth(0).locator("[data-budget-item-amount]").fill("7000");
  assert.match(await text(modal.locator("[data-budget-total]")), /以上： 18000/, "budget total should update while editing amounts");

  await modal.locator("[data-add-budget-row]").click();
  assert.equal(await rows.count(), 6, "add row should append a new editable budget row");
  await rows.nth(5).locator("[data-budget-item-name]").fill("电话卡");
  await rows.nth(5).locator("[data-budget-item-amount]").fill("38.62");
  await modal.locator("[data-calculate-budget-total]").click();
  assert.match(await text(modal.locator("[data-budget-total]")), /以上： 18038.62/, "calculate total should include added rows");

  const saveButton = modal.locator(".budget-editor [data-save-budget-items]");
  assert.equal(await saveButton.innerText(), "保存预算", "save budget button should remain available");
  const saveBox = await saveButton.boundingBox();
  assert(saveBox && saveBox.height >= 54 && saveBox.height <= 60, "save budget button should match the large fixed bottom style");
  await saveButton.click();
  await page.locator("[data-back-trip-detail]").click();
  await page.locator("[data-trip-detail-modal]:not([hidden])").waitFor();
  assert.match(await text(page.locator("[data-trip-detail-modal]:not([hidden]) .trip-overview-grid")), /￥18038.62|￥18,038.62|￥18,039/, "trip overview budget should update from saved budget sheet");
} finally {
  await browser.close();
}

console.log("Budget page UI verified.");
