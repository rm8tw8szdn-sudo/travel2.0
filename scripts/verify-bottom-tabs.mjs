import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const componentSource = fs.readFileSync(new URL("home-components.js", root), "utf8");

const tabs = [
  ["首页", "mobile.html"],
  ["图鉴", "atlas.html"],
  ["路线", "routes.html"],
  ["行程", "trips.html"],
  ["我的", "profile.html"],
];

for (const [label, href] of tabs) {
  assert.ok(componentSource.includes(`label: "${label}"`), `bottom tab should include ${label}`);
  assert.ok(componentSource.includes(`href: "${href}"`), `bottom tab ${label} should link to ${href}`);
  assert.ok(fs.existsSync(new URL(href, root)), `${href} should exist`);
}

const activePages = [
  ["mobile.html", "<bottom-tab-bar></bottom-tab-bar>"],
  ["atlas.html", '<bottom-tab-bar active="图鉴"></bottom-tab-bar>'],
  ["routes.html", '<bottom-tab-bar active="路线"></bottom-tab-bar>'],
  ["trips.html", '<bottom-tab-bar active="行程"></bottom-tab-bar>'],
  ["profile.html", '<bottom-tab-bar active="我的"></bottom-tab-bar>'],
];

for (const [file, marker] of activePages) {
  const html = fs.readFileSync(new URL(file, root), "utf8");
  assert.ok(html.includes('src="travel-state.js"'), `${file} should load travel-state.js`);
  assert.ok(html.includes(marker), `${file} should declare the expected active tab`);
}

console.log("Bottom tab links verified.");
