import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const urlFor = (file) => `file://${path.join(root, file)}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function compactText(locator) {
  return (await locator.innerText()).replace(/\s+/g, " ").trim();
}

const expectedNames = [
  "第一次点亮国家",
  "完成第一趟旅程",
  "5国探索者",
  "10国探索者",
  "30国探索者",
  "50国探索者",
  "跨越三大洲",
  "极光追寻者",
  "古文明旅人",
  "海岛漫游者",
  "收藏家",
  "灵感收集者",
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(urlFor("profile.html"));
  await page.click("[data-profile-link='achievements']");
  await page.locator("[data-achievement-page]").waitFor({ state: "visible" });

  assert(await page.locator("[data-achievement-back]").isVisible(), "achievement page should include a back button");
  assert(await page.locator("[data-achievement-share]").isVisible(), "achievement page should include a share button");
  assert(await page.locator("[data-achievement-reference]").count() === 0, "achievement page should not use the whole reference screenshot as the UI");
  assert(await page.locator("[data-achievement-overview]").isVisible(), "achievement page should render a real overview card");
  assert(await page.locator("[data-achievement-kuma-art]").isVisible(), "overview should use cropped Kuma art");
  assert(await page.locator("[data-achievement-encourage]").isVisible(), "bottom encouragement card should render as a real component");

  const cards = page.locator("[data-achievement-card]");
  assert(await cards.count() === 12, "achievement page should render 12 real achievement cards");
  for (let index = 0; index < expectedNames.length; index += 1) {
    const card = cards.nth(index);
    const cardText = await compactText(card);
    assert(cardText.includes(String(index + 1)), `card ${index + 1} should show its sequence number`);
    assert(cardText.includes(expectedNames[index]), `card ${index + 1} should show ${expectedNames[index]}`);
    const src = await card.locator("img").getAttribute("src");
    assert(src?.includes("achievement-crop-"), `card ${index + 1} should use cropped reference badge art`);
  }
  assert(await page.locator("[data-achievement-card][data-achievement-state='unlocked']").count() > 0, "should show unlocked achievement cards");
  assert(await page.locator("[data-achievement-card][data-achievement-state='locked']").count() > 0, "should show locked achievement cards");
  assert(await page.locator("[data-achievement-page] bottom-tab-bar").count() === 0, "secondary achievement page should not include bottom tabs");

  await page.click("[data-achievement-back]");
  await page.locator("[data-achievement-page]").waitFor({ state: "hidden" });
} finally {
  await browser.close();
}

console.log("Achievement page UI verified.");
