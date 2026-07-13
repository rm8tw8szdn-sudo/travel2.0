import fs from "node:fs";

const source = fs.readFileSync(new URL("../legacy/mobile-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile.css", import.meta.url), "utf8");

const requiredSource = [
  "function renderSpotCard",
  "function renderGuideEditorModal",
  "detailEditorModal",
  "data-guide-modal",
  "data-close-guide-modal",
  "data-save-guide-city",
  "data-save-guide-spot",
];

const forbiddenSource = [
  "function renderPresetSpot",
  "function renderUserSpot",
  "function renderSpotRow",
  "data-new-spot-name=\"${cityIndex}\"",
  "data-new-city-name=\"${place.code}\"",
  "data-spot-form",
];

const requiredCss = [
  ".guide-modal-overlay",
  ".guide-modal",
  ".guide-modal-form",
];

const missing = [
  ...requiredSource.filter((marker) => !source.includes(marker)),
  ...requiredCss.filter((marker) => !css.includes(marker)),
];
const forbidden = forbiddenSource.filter((marker) => source.includes(marker));

if (missing.length || forbidden.length) {
  if (missing.length) console.error(`Missing modal-flow markers:\n${missing.join("\n")}`);
  if (forbidden.length) console.error(`Forbidden inline/editor markers remain:\n${forbidden.join("\n")}`);
  process.exit(1);
}

console.log("Country detail modal flow verified.");
