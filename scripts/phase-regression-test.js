const assert = require("assert");

global.TravelData = require("../travel-data.js");
const TravelState = require("../travel-state.js");

function createTrip(overrides = {}) {
  return {
    id: "trip-phase-japan",
    name: "日本之旅",
    status: "upcoming",
    start: "2026.07.18",
    end: "2026.07.25",
    countryIds: ["JP"],
    cityIds: ["JP-TYO", "JP-KYO"],
    ...overrides,
  };
}

const empty = TravelState.recalculateTravelState(TravelState.createEmptyTravelState());
assert.strictEqual(empty.trips.length, 0, "empty state starts without trips");
assert.strictEqual(empty.exploredCountryCount, 0, "empty state starts with 0 explored countries");
assert.strictEqual(empty.exploredCityCount, 0, "empty state starts with 0 explored cities");
assert.strictEqual(empty.nextTrip, null, "empty state has no next trip");
assert.strictEqual(empty.recentTrip, null, "empty state has no recent trip");

const planned = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  trips: [createTrip()],
});
assert.strictEqual(planned.exploredCountryCount, 0, "planned trip should not explore countries");
assert.strictEqual(planned.plannedCountryCount, 1, "planned trip marks Japan planned");
assert.strictEqual(planned.plannedCityCount, 2, "planned trip marks Tokyo and Kyoto planned");
assert.strictEqual(planned.nextTrip.name, "日本之旅", "planned trip becomes next trip");

const completed = TravelState.setTripStatus(planned, "trip-phase-japan", "completed");
assert.strictEqual(completed.exploredCountryCount, 1, "completed trip explores Japan");
assert.strictEqual(completed.exploredCityCount, 2, "completed trip explores Tokyo and Kyoto");
assert.strictEqual(completed.completedTripCount, 1, "completed trip count updates");
assert.strictEqual(completed.countriesById.JP.explorationStatus, "explored", "Japan is explored");
assert.strictEqual(completed.citiesById["JP-TYO"].explorationStatus, "explored", "Tokyo is explored");
assert.strictEqual(completed.citiesById["JP-KYO"].explorationStatus, "explored", "Kyoto is explored");
assert.ok(completed.countriesById.JP.cityIds.includes("JP-TYO"), "Tokyo remains under Japan detail cities");
assert.ok(completed.countriesById.JP.cityIds.includes("JP-KYO"), "Kyoto remains under Japan detail cities");
assert.strictEqual(completed.nextTrip, null, "completed-only state has no next trip");
assert.strictEqual(completed.recentTrip.name, "日本之旅", "completed trip becomes recent trip");

const deleted = TravelState.removeTrip(completed, "trip-phase-japan");
assert.strictEqual(deleted.exploredCountryCount, 0, "deleting completed trip recalculates Japan to unexplored");
assert.strictEqual(deleted.exploredCityCount, 0, "deleting completed trip recalculates cities to unexplored");
assert.strictEqual(deleted.countriesById.JP.explorationStatus, "unexplored", "Japan returns unexplored");
assert.strictEqual(deleted.citiesById["JP-TYO"].explorationStatus, "unexplored", "Tokyo returns unexplored");
assert.strictEqual(deleted.citiesById["JP-KYO"].explorationStatus, "unexplored", "Kyoto returns unexplored");

const favorited = TravelState.setFavorite(empty, "countries", "JP", true);
const exploredFavorite = TravelState.setTripStatus({
  ...favorited,
  trips: [createTrip()],
}, "trip-phase-japan", "completed");
assert.strictEqual(exploredFavorite.countriesById.JP.explorationStatus, "explored", "favorited Japan can also be explored");
assert.strictEqual(exploredFavorite.countriesById.JP.isFavorite, true, "favorite flag is preserved");

const manualKenya = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  trips: [{
    id: "trip-kenya-manual",
    name: "肯尼亚之旅",
    status: "planned",
    countryIds: ["KE"],
    cityIds: ["KE-NBO"],
  }],
});
const kenyaTrip = manualKenya.trips.find((trip) => trip.id === "trip-kenya-manual");
assert.deepStrictEqual(kenyaTrip.countryIds, ["KE"], "manual Kenya trip only keeps explicitly selected country");
assert.deepStrictEqual(kenyaTrip.cityIds, ["KE-NBO"], "manual Kenya trip only keeps explicitly selected city");
assert.ok(!kenyaTrip.countryIds.some((id) => ["NO", "SE", "FI", "IS"].includes(id)), "manual trip does not pull Nordic countries");

const multiTripState = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  manualExploredCountryIds: ["GR"],
  trips: [
    createTrip({ id: "jp-one", status: "completed", cityIds: [] }),
    createTrip({ id: "jp-two", status: "completed", cityIds: [] }),
    { id: "tr-only", name: "土耳其之旅", status: "completed", countryIds: ["TR"], cityIds: [] },
    { id: "is-done", name: "冰岛完成", status: "completed", countryIds: ["IS"], cityIds: [] },
    { id: "is-plan", name: "冰岛计划", status: "planned", countryIds: ["IS"], cityIds: [] },
  ],
});
assert.strictEqual(TravelState.removeTrip(multiTripState, "jp-one").countriesById.JP.explorationStatus, "explored", "Japan stays explored while another completed trip remains");
assert.strictEqual(TravelState.removeTrip(multiTripState, "tr-only").countriesById.TR.explorationStatus, "unexplored", "Turkey returns unexplored after its only completed trip is deleted");
assert.strictEqual(TravelState.removeTrip(multiTripState, "is-done").countriesById.IS.explorationStatus, "planned", "Iceland downgrades to planned when completed trip is removed but planned remains");
assert.strictEqual(multiTripState.countriesById.GR.explorationStatus, "explored", "manual explored Greece stays explored without trips");

const cityOnlyCompleted = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  trips: [{ id: "tokyo-city-only", name: "东京之旅", status: "completed", countryIds: [], cityIds: ["JP-TYO"] }],
});
assert.strictEqual(cityOnlyCompleted.citiesById["JP-TYO"].explorationStatus, "explored", "completed city is explored");
assert.strictEqual(cityOnlyCompleted.countriesById.JP.explorationStatus, "explored", "completed city makes parent country explored");
assert.strictEqual(cityOnlyCompleted.citiesById["JP-KYO"].explorationStatus, "unexplored", "explored country does not auto-explore sibling cities");

const favoriteIndependence = TravelState.setFavorite(cityOnlyCompleted, "cities", "JP-KYO", true);
assert.strictEqual(favoriteIndependence.citiesById["JP-KYO"].isFavorite, true, "city favorite is stored independently");
assert.strictEqual(favoriteIndependence.countriesById.JP.isFavorite, false, "favorite city does not favorite parent country");
assert.strictEqual(TravelState.setFavorite(exploredFavorite, "countries", "JP", false).countriesById.JP.explorationStatus, "explored", "unfavorite does not change explored status");

const manualOverrides = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  manualStatusOverride: {
    countries: { JP: "unexplored" },
    cities: { "JP-KYO": "explored" },
  },
  trips: [createTrip({ status: "completed" })],
});
assert.strictEqual(manualOverrides.countriesById.JP.explorationStatus, "explored", "completed trips remain the source of country explored status");
assert.strictEqual(manualOverrides.citiesById["JP-KYO"].explorationStatus, "explored", "completed trips remain the source of city explored status");
assert.strictEqual(manualOverrides.citiesById["JP-OSA"].explorationStatus, "unexplored", "manual city override does not explore sibling cities");

console.log("Phase regression tests passed");
