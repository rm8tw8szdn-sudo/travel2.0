import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TravelState = require("../travel-state.js");

function recalculate(patch = {}) {
  return TravelState.recalculateTravelState({
    ...TravelState.createEmptyTravelState(),
    ...patch,
  });
}

function achievement(state, id) {
  return state.achievements.find((item) => item.id === id);
}

function explored(countryIds, patch = {}) {
  return recalculate({
    ...patch,
    manualVisitRecords: countryIds.map((countryId) => ({
      id: `visit-${countryId}`,
      countryId,
      date: "2026.01.01",
    })),
  });
}

function completedTrip(countryIds) {
  return recalculate({
    trips: [{
      id: "trip-test",
      name: "测试旅程",
      status: "completed",
      start: "2026.01.01",
      end: "2026.01.02",
      countryIds,
      cityIds: [],
    }],
  });
}

function allCountryIds() {
  return TravelState.recalculateTravelState(TravelState.createEmptyTravelState()).countries.map((country) => country.id);
}

const empty = recalculate();
assert.equal(empty.achievements.length, 11, "achievement page should expose exactly 11 achievements after route cleanup");
assert.equal(empty.achievements.filter((item) => item.unlocked).length, 0, "empty user should unlock 0 / 11");

assert.equal(achievement(explored(["JP"]), "first_country").unlocked, true, "1 explored country unlocks first_country");
assert.equal(achievement(completedTrip(["JP"]), "first_trip").unlocked, true, "1 completed trip unlocks first_trip");
assert.equal(achievement(explored(allCountryIds().slice(0, 5)), "explore_5_countries").unlocked, true, "5 countries unlocks explore_5_countries");
assert.equal(achievement(explored(allCountryIds().slice(0, 10)), "explore_10_countries").unlocked, true, "10 countries unlocks explore_10_countries");
assert.equal(achievement(explored(allCountryIds().slice(0, 30)), "explore_30_countries").unlocked, true, "30 countries unlocks explore_30_countries");
assert.equal(achievement(explored(allCountryIds().slice(0, 50)), "explore_50_countries").unlocked, true, "50 countries unlocks explore_50_countries");
assert.equal(achievement(explored(["JP", "FR", "EG"]), "three_continents").unlocked, true, "3 continents unlocks three_continents");
assert.equal(achievement(explored(["IS"]), "aurora_chaser").unlocked, true, "Iceland unlocks aurora_chaser");
assert.equal(achievement(explored(["EG", "GR"]), "ancient_civilization").unlocked, true, "Egypt and Greece unlock ancient_civilization");
assert.equal(achievement(explored(["JP", "TH", "MY"]), "island_wanderer").unlocked, true, "3 island whitelist countries unlock island_wanderer");

const favoriteBase = recalculate();
const favoriteCountries = favoriteBase.countries.slice(0, 10).map((country) => country.id);
const favoriteCities = favoriteBase.cities.slice(0, 10).map((city) => city.id);
assert.equal(achievement(recalculate({ favoriteCountryIds: favoriteCountries, favoriteCityIds: favoriteCities }), "collector").unlocked, true, "20 destination favorites unlock collector");

const tenCountryState = explored(allCountryIds().slice(0, 10));
const droppedToEight = explored(allCountryIds().slice(0, 8), { achievements: tenCountryState.achievements });
assert.equal(achievement(droppedToEight, "explore_10_countries").unlocked, true, "unlocked achievements stay unlocked after progress drops");
assert.equal(achievement(droppedToEight, "explore_10_countries").currentValue, 8, "currentValue reflects latest data after progress drops");

const refreshed = TravelState.recalculateTravelState(JSON.parse(JSON.stringify(tenCountryState)));
assert.equal(achievement(refreshed, "explore_10_countries").unlocked, true, "refresh preserves unlocked achievements");
assert.equal(achievement(refreshed, "explore_10_countries").unlockedAt, achievement(tenCountryState, "explore_10_countries").unlockedAt, "refresh preserves unlockedAt");

console.log("Achievement logic verified.");
