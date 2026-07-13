import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDefaultTravelState, recalculateTravelState } = require("../travel-state.js");
const root = new URL("../", import.meta.url);

const state = recalculateTravelState(createDefaultTravelState());
const japan = state.countriesById.JP;
const japanCities = state.cities.filter((city) => city.countryId === "JP");

assert.equal(japan.name, "日本");
assert.ok(japan.tags?.length >= 3, "Japan should expose lightweight tags");
assert.ok(japan.recommendedDays, "Japan should expose recommended days");
assert.ok(japan.bestSeason, "Japan should expose best season");
assert.ok(japan.budgetLevel, "Japan should expose budget level");
assert.ok(japan.spots?.length >= 3, "Japan should expose representative spots");
assert.ok(japanCities.some((city) => city.name === "东京"), "Japan search data should include Tokyo");
assert.ok(japanCities.some((city) => city.name === "京都"), "Japan search data should include Kyoto");
assert.ok(japanCities.some((city) => city.name === "大阪"), "Japan search data should include Osaka");

const atlasHtml = fs.readFileSync(new URL("atlas.html", root), "utf8");
const atlasJs = fs.readFileSync(new URL("atlas.js", root), "utf8");
const countryHtml = fs.readFileSync(new URL("country-japan.html", root), "utf8");
const countryJs = fs.readFileSync(new URL("country-detail.js", root), "utf8");
const cityHtml = fs.readFileSync(new URL("city-oslo.html", root), "utf8");

for (const marker of ["data-atlas-results", "data-filter=\"待出行\"", "data-filter=\"收藏\""]) {
  assert.ok(atlasHtml.includes(marker), `atlas should include ${marker}`);
}

for (const marker of ["buildAtlasItems", "matchesAtlasKeyword", "renderAtlasResults", "city-oslo.html#"]) {
  assert.ok(atlasJs.includes(marker), `atlas.js should include ${marker}`);
}

for (const forbidden of ["人口", "面积", "GDP", "货币", "时区", "首都", "语言", "km²"]) {
  assert.ok(!countryHtml.includes(forbidden), `country detail should not include encyclopedia field: ${forbidden}`);
}

for (const marker of [
  "data-country-tags",
  "data-country-trip-meta",
  "data-country-spots",
  "data-add-to-trip",
  "推荐天数",
  "最佳季节",
  "预算",
]) {
  assert.ok(countryHtml.includes(marker), `country detail should include ${marker}`);
}

for (const marker of ["data-city-detail", "data-city-cover", "data-city-country", "data-city-tags", "data-city-spots", "data-city-favorite", "data-city-add-trip", "data-city-mark-explored", "data-city-share"]) {
  assert.ok(cityHtml.includes(marker), `city detail should include ${marker}`);
}

assert.ok(countryJs.includes("openAddToTripModal"), "country detail should open add-to-trip modal");
assert.ok(countryJs.includes("data-city-id"), "country detail should navigate city cards by id");

console.log("Task 2 structure verified.");
