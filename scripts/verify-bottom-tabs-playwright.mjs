import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const pages = [
  ["首页", "mobile.html"],
  ["图鉴", "atlas.html"],
  ["路线", "routes.html"],
  ["行程", "trips.html"],
  ["我的", "profile.html"],
];

function fileUrl(file) {
  return pathToFileURL(path.join(root, file)).href;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  await page.goto(fileUrl("mobile.html"));

  for (const [label, file] of pages) {
    if (!page.url().endsWith(`/${file}`)) {
      await page.getByRole("link", { name: label }).click();
      await page.waitForURL(fileUrl(file));
    }
    const activeText = (await page.locator(".home-tabbar a.active").innerText()).trim();
    assert.equal(activeText, label);
    assert.equal(await page.locator(`.home-tabbar a[href="${file}"]`).count(), 1);
  }
} finally {
  await browser.close();
}

console.log("Bottom tab Playwright navigation verified.");
