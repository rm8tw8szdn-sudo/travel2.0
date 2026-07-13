import fs from "node:fs";

const source = fs.readFileSync(new URL("../legacy/mobile-app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../mobile.css", import.meta.url), "utf8");

const requiredJsMarkers = [
  "function normalizeGuideSentence",
  "function guideStatusLabel",
  "function renderMetricPill",
  "function renderEditableCityCard",
  "renderMetricPill(\"推荐天数\"",
  "renderMetricPill(\"最佳季节\"",
  "资料卡草稿",
];

const requiredCssMarkers = [
  ".detail-meta-grid",
  ".detail-meta-pill",
  ".detail-status-draft",
  ".city-guide-action",
];

const missing = [
  ...requiredJsMarkers.filter((marker) => !source.includes(marker)),
  ...requiredCssMarkers.filter((marker) => !css.includes(marker)),
];

if (missing.length) {
  console.error(`Missing detail format markers:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("Country detail format markers verified.");
