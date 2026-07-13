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

async function text(page, selector) {
  return (await page.locator(selector).innerText()).replace(/\s+/g, " ").trim();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const context = await browser.newContext({ viewport: { width: 275, height: 515 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(urlFor("country-japan.html"));
  await page.click("[data-share]");
  await page.locator("[data-share-card-modal]").waitFor({ state: "visible" });
  const countryShare = await text(page, "[data-share-card-modal]");
  assert(countryShare.includes("国家"), "country share card should show type");
  assert(countryShare.includes("日本"), "country share card should show name");
  assert(countryShare.includes("来自 我的旅行足迹"), "share card should show app attribution");
  assert(await page.locator("[data-qr-placeholder]").isVisible(), "share card should include QR placeholder");

  await page.goto(urlFor("country-japan.html"));
  await page.click("[data-city='东京']");
  await page.locator("[data-share-card-modal]").waitFor({ state: "visible" });
  assert((await text(page, "[data-share-card-modal]")).includes("城市"), "city share card should open from city item");

  await page.goto(urlFor("trips.html"));
  await page.click("[data-trip-name='北欧极光之旅']");
  await page.locator("[data-share-card-modal]").waitFor({ state: "visible" });
  assert((await text(page, "[data-share-card-modal]")).includes("行程"), "trip share card should open from trip item");

  await page.goto(urlFor("atlas.html"));
  await page.click("[data-filter='收藏']");
  const atlasText = await text(page, ".atlas-popular");
  assert(atlasText.includes("日本") && atlasText.includes("冰岛"), "atlas favorite filter should show favorite countries");
  assert(!atlasText.includes("意大利"), "atlas favorite filter should hide non-favorites");

  await page.goto(urlFor("profile.html"));
  await page.click("[data-favorites-entry]");
  await page.locator("[data-favorites-modal]").waitFor({ state: "visible" });
  const favoritesText = await text(page, "[data-favorites-modal]");
  assert(favoritesText.includes("国家") && favoritesText.includes("城市"), "favorites modal should group destination content");

  await page.goto(urlFor("mobile.html"));
  assert((await text(page, "[data-notification-badge]")).includes("3"), "notification bell should show unread badge");
  await page.click("[data-notification-bell]");
  await page.locator("[data-notification-list]").waitFor({ state: "visible" });
  const notificationText = await text(page, "[data-notification-list]");
  assert(notificationText.includes("行程提醒"), "notification list should include trip reminder");
  assert(notificationText.includes("成就解锁"), "notification list should include achievement unlock");
  assert(notificationText.includes("足迹更新"), "notification list should include footprint update");
  assert(!notificationText.includes("私信") && !notificationText.includes("评论"), "notification list should not include social messages");
} finally {
  await browser.close();
}

console.log("Auxiliary modules verified.");
