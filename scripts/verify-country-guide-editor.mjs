import fs from "node:fs";

const source = fs.readFileSync(new URL("../legacy/mobile-app.js", import.meta.url), "utf8");

const requiredMarkers = [
  "function ensureEditableCountryGuide",
  "function addCityToCountryGuide",
  "function addSpotToCountryCity",
  "data-save-guide-city",
  "data-save-guide-spot",
  "data-modal-city-name",
  "data-modal-spot-name",
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));

if (missing.length) {
  console.error(`Missing country guide editor markers:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("Country guide editor markers verified.");
