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
  await page.goto(fileUrl("atlas.html"));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("searchbox", { name: "搜索国家或城市" }).fill("日本");
  let results = await text(page.locator("[data-atlas-results]"));
  assert.ok(results.includes("日本"), "searching Japan should show Japan");
  assert.ok(results.includes("东京"), "searching Japan should show Tokyo");
  assert.ok(results.includes("京都"), "searching Japan should show Kyoto");
  assert.ok(results.includes("大阪"), "searching Japan should show Osaka");

  await page.getByRole("searchbox", { name: "搜索国家或城市" }).fill("东京");
  results = await text(page.locator("[data-atlas-results]"));
  assert.ok(results.includes("东京"), "searching Tokyo should show Tokyo");
  assert.ok(results.includes("日本"), "searching Tokyo should show parent country");

  await page.getByRole("searchbox", { name: "搜索国家或城市" }).fill("");
  await page.getByRole("button", { name: "待出行", exact: true }).click();
  results = await text(page.locator("[data-atlas-results]"));
  assert.ok(results.includes("挪威") || results.includes("奥斯陆"), "planned filter should show future-trip places");

  await page.getByRole("button", { name: "收藏" }).click();
  results = await text(page.locator("[data-atlas-results]"));
  assert.ok(results.includes("日本") || results.includes("东京"), "favorite filter should show favorites");

  await page.getByRole("button", { name: /日本.*国家/ }).first().click();
  await page.waitForURL(fileUrl("country-japan.html"));
  const countryText = await text(page.locator(".country-screen"));
  for (const forbidden of ["人口", "面积", "GDP", "货币", "时区", "首都", "语言", "km²"]) {
    assert.ok(!countryText.includes(forbidden), `country detail should hide ${forbidden}`);
  }
  assert.ok(countryText.includes("推荐天数"), "country detail should show recommended days");
  assert.ok(countryText.includes("代表景点"), "country detail should show spots");

  await page.getByRole("button", { name: /加入行程/ }).click();
  assert.ok((await text(page.locator("[data-add-trip-modal]"))).includes("加入行程"), "country add-to-trip modal should open");
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: /分享/ }).first().click();
  assert.ok((await text(page.locator("[data-share-card-modal]"))).includes("日本"), "country share card should open");
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: /东京/ }).click();
  await page.waitForURL(/city-oslo\.html#JP-TYO$/);
  const cityText = await text(page.locator("[data-city-detail]"));
  assert.ok(cityText.includes("东京"), "city detail should show selected city");
  assert.ok(cityText.includes("日本"), "city detail should show parent country");
  assert.ok(cityText.includes("代表景点"), "city detail should show spots");

  await page.getByRole("button", { name: /标记已探索|已探索/ }).click();
  await page.goto(fileUrl("atlas.html"));
  await page.getByRole("searchbox", { name: "搜索国家或城市" }).fill("东京");
  assert.ok((await text(page.locator("[data-atlas-results]"))).includes("已探索"), "manual city explore should sync back to atlas");
} finally {
  await browser.close();
}

console.log("Task 2 Playwright flows verified.");
