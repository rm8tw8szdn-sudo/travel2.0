import fs from "node:fs";

const source = fs.readFileSync(new URL("../legacy/mobile-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile.css", import.meta.url), "utf8");

const requiredMarkers = [
  "detailEditorModal",
  "data-open-city-form",
  "data-close-guide-modal",
  "data-guide-modal",
  "class=\"city-guide-card city-card\"",
  "class=\"spot-row spot-card\"",
  "class=\"tag-pill\"",
  "class=\"primary-button",
];

const requiredCss = [
  ".city-card",
  ".spot-card",
  ".spot-copy",
  ".tag-pill",
  ".primary-button",
];

const missing = [
  ...requiredMarkers.filter((marker) => !source.includes(marker)),
  ...requiredCss.filter((marker) => !css.includes(marker)),
];

if (missing.length) {
  console.error(`Missing edit-state markers:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("Country detail edit-state markers verified.");
