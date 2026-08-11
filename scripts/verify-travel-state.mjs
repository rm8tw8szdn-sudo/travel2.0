import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const require = createRequire(import.meta.url);
const {
  TRAVEL_STATE_STORAGE_KEY,
  createDefaultTravelState,
  recalculateTravelState,
  getTravelStats,
  resolveTripCover,
  getTripBudgetItems,
  setTripStatus,
  removeTrip,
  setFavorite,
  getFavoriteItems,
  getAchievements,
  getNotifications,
  markNotificationRead,
  isRouteFavorite,
  setRouteFavorite,
  getFavoriteRouteSnapshot,
  createTripFromRoute,
} = require("../travel-state.js");

assert.equal(TRAVEL_STATE_STORAGE_KEY, "travelCollectionState");

function ids(items) {
  return items.map((item) => item.id).sort();
}

function baseState(overrides = {}) {
  return {
    userProfile: { nickname: "Ruby" },
    countries: [
      { id: "JP", name: "日本", cover: "assets/atlas-japan-cover.svg" },
      { id: "NO", name: "挪威", cover: "assets/route-country-norway.svg" },
      { id: "IS", name: "冰岛", cover: "assets/atlas-iceland-cover.svg" },
    ],
    cities: [
      { id: "JP-TYO", name: "东京", englishName: "Tokyo", countryId: "JP", cover: "assets/detail-city-tokyo.svg" },
      { id: "NO-OSL", name: "奥斯陆", englishName: "Oslo", countryId: "NO", cover: "assets/route-city-oslo.svg" },
      { id: "IS-REK", name: "雷克雅未克", englishName: "Reykjavik", countryId: "IS", cover: "assets/favorite-city-reykjavik.svg" },
    ],
    trips: [],
    manualExploredCountryIds: [],
    manualExploredCityIds: [],
    favoriteCountryIds: [],
    favoriteCityIds: [],
    achievements: [],
    notifications: [],
    ...overrides,
  };
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-japan", status: "completed", countryIds: ["JP"], cityIds: ["JP-TYO"] },
      { id: "trip-nordic", status: "upcoming", countryIds: ["NO"], cityIds: ["NO-OSL"] },
    ],
    favoriteCountryIds: ["NO"],
  }));

  assert.equal(state.countriesById.JP.explorationStatus, "explored");
  assert.equal(state.countriesById.NO.explorationStatus, "planned");
  assert.equal(state.countriesById.IS.explorationStatus, "unexplored");
  assert.equal(state.countriesById.NO.isFavorite, true);
  assert.equal(state.countriesById.JP.isFavorite, false);
  assert.equal(state.citiesById["JP-TYO"].explorationStatus, "explored");
  assert.equal(state.citiesById["NO-OSL"].explorationStatus, "planned");
  assert.deepEqual(ids(state.exploredCountries), ["JP"]);
  assert.deepEqual(ids(state.plannedCountries), ["NO"]);
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-done", status: "completed", countryIds: ["JP"], cityIds: ["JP-TYO"] },
      { id: "trip-plan", status: "planned", countryIds: ["JP", "NO"], cityIds: ["JP-TYO", "NO-OSL"] },
    ],
  }));

  assert.equal(state.countriesById.JP.explorationStatus, "explored");
  assert.equal(state.citiesById["JP-TYO"].explorationStatus, "explored");
  assert.equal(state.countriesById.NO.explorationStatus, "planned");
}

{
  const withCompleted = recalculateTravelState(baseState({
    trips: [
      { id: "trip-a", status: "completed", countryIds: ["JP"], cityIds: ["JP-TYO"] },
      { id: "trip-b", status: "completed", countryIds: ["JP"], cityIds: [] },
    ],
  }));
  assert.equal(withCompleted.countriesById.JP.explorationStatus, "explored");

  const afterDeleteOne = recalculateTravelState({
    ...withCompleted,
    trips: withCompleted.trips.filter((trip) => trip.id !== "trip-a"),
  });
  assert.equal(afterDeleteOne.countriesById.JP.explorationStatus, "explored");

  const afterDeleteBoth = recalculateTravelState({
    ...withCompleted,
    trips: [],
  });
  assert.equal(afterDeleteBoth.countriesById.JP.explorationStatus, "unexplored");
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-japan", status: "completed", countryIds: ["JP"], cityIds: ["JP-TYO"] },
    ],
  }));
  const changedBack = recalculateTravelState({
    ...state,
    trips: state.trips.map((trip) => ({ ...trip, status: "upcoming" })),
  });

  assert.equal(changedBack.countriesById.JP.explorationStatus, "planned");
  assert.equal(changedBack.citiesById["JP-TYO"].explorationStatus, "planned");
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-country", countryIds: ["JP"], cityIds: [] },
      { id: "trip-default", countryIds: [], cityIds: [] },
    ],
  }));

  assert.equal(resolveTripCover(state.trips[0], state), state.countriesById.JP.cover);
  assert.equal(resolveTripCover(state.trips[1], state), "assets/trip-cover-placeholder.svg");
}

{
  const state = recalculateTravelState(baseState({
    manualExploredCountryIds: ["IS"],
    manualExploredCityIds: ["IS-REK"],
    favoriteCountryIds: ["JP", "NO"],
    favoriteCityIds: ["JP-TYO"],
    trips: [
      { id: "trip-done", status: "completed", countryIds: ["JP"], cityIds: ["JP-TYO"] },
      { id: "trip-plan", status: "upcoming", countryIds: ["NO"], cityIds: ["NO-OSL"] },
    ],
  }));
  const stats = getTravelStats(state);

  assert.equal(stats.exploredCountryCount, 2);
  assert.equal(stats.exploredCityCount, 2);
  assert.equal(stats.plannedCountryCount, 1);
  assert.equal(stats.favoriteCount, 3);
  assert.equal(stats.completedTripCount, 1);
}

{
  const state = createDefaultTravelState();
  const normalized = recalculateTravelState(state);

  assert.ok(normalized.countries.length >= 3);
  assert.ok(normalized.cities.length >= 3);
  assert.ok(Array.isArray(normalized.trips));
  assert.deepEqual(normalized.trips, []);
  assert.equal("routes" in normalized, false);
  assert.equal(getTravelStats(normalized).totalCountryCount, 195);
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-a", status: "completed", countryIds: ["JP"], cityIds: ["JP-TYO"], budget: 12000 },
      { id: "trip-b", status: "completed", countryIds: ["NO"], cityIds: ["NO-OSL"], budget: 8000 },
    ],
    budgetItems: {
      "trip-a": [
        { id: "a-flight", name: "机票", category: "交通", amount: 5200 },
        { id: "a-hotel", name: "酒店", category: "住宿", amount: 4100 },
      ],
      "trip-b": [
        { id: "b-flight", name: "机票", category: "交通", amount: 3900 },
      ],
    },
  }));

  assert.equal(getTripBudgetItems(state, "trip-a").length, 2);
  assert.equal(getTripBudgetItems(state, "trip-b").length, 1);
  assert.equal(getTripBudgetItems(state, "missing").length, 0);
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-japan", status: "upcoming", countryIds: ["JP"], cityIds: ["JP-TYO"] },
    ],
  }));

  const completed = setTripStatus(state, "trip-japan", "completed", { memory: "樱花很好。" });
  assert.equal(completed.trips[0].status, "completed");
  assert.equal(completed.trips[0].memory, "樱花很好。");
  assert.equal(completed.countriesById.JP.explorationStatus, "explored");

  const upcoming = setTripStatus(completed, "trip-japan", "upcoming");
  assert.equal(upcoming.trips[0].status, "planned");
  assert.equal(upcoming.countriesById.JP.explorationStatus, "planned");

  const removed = removeTrip(upcoming, "trip-japan");
  assert.equal(removed.trips.length, 0);
  assert.equal(removed.countriesById.JP.explorationStatus, "unexplored");
}

{
  const state = recalculateTravelState(baseState({
    favoriteCountryIds: ["JP"],
    favoriteCityIds: ["JP-TYO"],
  }));
  assert.equal(getFavoriteItems(state, "countries").length, 1);
  assert.equal(getFavoriteItems(state, "cities").length, 1);

  const unfavorited = setFavorite(state, "countries", "JP", false);
  assert.equal(unfavorited.countriesById.JP.isFavorite, false);
  assert.equal(unfavorited.countriesById.JP.explorationStatus, "unexplored");
  assert.equal(getTravelStats(unfavorited).favoriteCount, 1);
}

{
  const routeSnapshot = {
    id: "wikivoyage-live-alaska-highway",
    name: "Alaska Highway",
    summary: "A live route through Canada and Alaska.",
    countries: ["Canada", "United States", "Unknownland"],
    cities: ["Tokyo"],
    destinations: ["Dawson Creek", "Fairbanks", "Tokyo"],
    durationDays: 12,
    recommendedDays: "10-14天",
    bestMonths: ["June", "July", "August"],
    themes: ["road trip", "nature"],
    tags: ["live-discovery", "Wikivoyage"],
    highlights: ["Northern landscapes"],
    coverImage: "https://example.test/alaska.jpg",
    source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Alaska_Highway" },
  };
  const initial = recalculateTravelState(baseState());
  const created = createTripFromRoute(initial, routeSnapshot);
  const trip = created.trips.at(-1);

  assert.equal(trip.status, "planned");
  assert.equal(trip.planStatus, "规划中");
  assert.deepEqual(trip.countryIds.sort(), ["CA", "US"], "only canonical country IDs should be imported");
  assert.deepEqual(trip.cityIds, ["JP-TYO"], "only canonical city IDs should be imported");
  assert.deepEqual(trip.routeSnapshot.destinations, routeSnapshot.destinations, "unmatched destinations must remain in the snapshot");
  assert.equal(isRouteFavorite(created, routeSnapshot.id), false, "creating a trip must not favorite its route");
  assert.equal(created.countriesById.CA.explorationStatus, "planned");
  assert.equal(created.citiesById["JP-TYO"].explorationStatus, "planned");
  assert.equal(created.exploredCountryCount, initial.exploredCountryCount, "planned route trips must not explore countries");
  assert.equal(created.exploredCityCount, initial.exploredCityCount, "planned route trips must not explore cities");

  const favorited = setRouteFavorite(initial, routeSnapshot, true);
  assert.equal(isRouteFavorite(favorited, routeSnapshot.id), true);
  assert.equal(getFavoriteRouteSnapshot(favorited, routeSnapshot.id).summary, routeSnapshot.summary);

  const persisted = recalculateTravelState(JSON.parse(JSON.stringify(created)));
  assert.equal(persisted.trips.at(-1).routeSnapshot.summary, routeSnapshot.summary, "route snapshots must survive persistence");
  const completed = setTripStatus(persisted, trip.id, "completed");
  assert.equal(completed.countriesById.CA.explorationStatus, "explored");
  assert.equal(completed.countriesById.US.explorationStatus, "explored");
  assert.equal(completed.citiesById["JP-TYO"].explorationStatus, "explored");
  assert.equal(isRouteFavorite(completed, routeSnapshot.id), false);
}

{
  const state = recalculateTravelState(baseState({
    trips: [
      { id: "trip-japan", status: "upcoming", name: "日本测试行程", countryIds: ["JP"], cityIds: ["JP-TYO"] },
    ],
    favoriteCountryIds: ["NO"],
  }));
  const completed = setTripStatus(state, "trip-japan", "completed", { memory: "任务五完成记录" });
  const achievements = getAchievements(completed);
  const notifications = getNotifications(completed);

  assert.ok(achievements.some((item) => item.id === "first_country" && item.unlockedAt), "completion should unlock first_country achievement");
  assert.ok(achievements.some((item) => item.id === "first_trip" && item.unlockedAt), "completion should unlock first_trip achievement");
  assert.ok(notifications.some((item) => item.type === "足迹事件" && item.text.includes("日本测试行程")), "completion should create footprint notification");
  assert.ok(notifications.some((item) => item.type === "成就解锁"), "completion should create achievement notification");

  const removed = removeTrip(completed, "trip-japan");
  assert.ok(getAchievements(removed).some((item) => item.id === "first_trip" && item.unlockedAt), "unlocked achievement should remain after deleting trip");

  const unread = getNotifications(completed).find((item) => !item.read);
  assert.ok(unread);
  const readState = markNotificationRead(completed, unread.id);
  assert.equal(getNotifications(readState).find((item) => item.id === unread.id)?.read, true);
}

{
  const state = recalculateTravelState(baseState());
  assert.equal(resolveTripCover({ id: "route-trip", routeSnapshot: { id: "route-missing-cover", name: "缺封面路线" } }, state), "", "a route trip must never fall back to an unrelated cover");
  assert.match(resolveTripCover({ id: "manual-trip", name: "手动行程" }, state), /trip-cover-placeholder\.svg$/, "a manual trip without a real cover must use the explicit neutral placeholder");
  assert.doesNotMatch(resolveTripCover({ id: "manual-trip", name: "手动行程" }, state), /aurora/i);
}

{
  const routeSnapshot = {
    id: "route-v2-knowledge-germany",
    name: "Berlin and Munich",
    countries: ["DE"],
    destinations: ["Berlin", "Munich"],
    durationDays: 7,
    destinationEntities: [
      {
        entityId: "city-berlin-stable",
        wikidataId: "Q64",
        countryCode: "DE",
        name: "柏林",
        canonicalNameEn: "Berlin",
        entityTypeName: "city",
      },
      {
        entityId: "city-munich-stable",
        wikidataId: "Q1726",
        countryCode: "DE",
        name: "慕尼黑",
        canonicalNameEn: "Munich",
        entityTypeName: "city",
      },
    ],
  };
  const planned = createTripFromRoute(recalculateTravelState(baseState()), routeSnapshot);
  const plannedTrip = planned.trips.at(-1);

  assert.deepEqual(
    plannedTrip.cityIds,
    ["city-berlin-stable", "city-munich-stable"],
    "Route V2 Knowledge entity IDs must survive route-to-trip conversion",
  );
  assert.deepEqual(
    plannedTrip.cityQids,
    ["Q64", "Q1726"],
    "Wikidata identities must remain available for future migrations",
  );
  assert.equal(planned.plannedCities.length, 2, "Knowledge cities must participate in planned footprint state");

  const persisted = recalculateTravelState(JSON.parse(JSON.stringify(planned)));
  assert.deepEqual(persisted.trips.at(-1).cityIds, plannedTrip.cityIds, "Knowledge city IDs must survive persistence");
  const completed = setTripStatus(persisted, plannedTrip.id, "completed");
  assert.equal(getTravelStats(completed).exploredCityCount, 2, "completed Knowledge routes must count their cities");
  assert.deepEqual(
    completed.exploredCities.map((city) => city.wikidataId).sort(),
    ["Q1726", "Q64"],
    "completed footprint city identities must remain canonical",
  );
}

{
  const repository = createPublishedKnowledgeEntityLayerRepository();
  const countries = repository.listCountries();
  const cities = repository.listCities();
  const countryByCode = new Map(countries.map((country) => [country.isoAlpha2, country]));
  const citiesByCode = new Map();
  for (const city of cities) {
    const countryCode = countries.find((country) => country.entityId === city.parentCountryEntityId)?.isoAlpha2;
    if (!countryCode) continue;
    citiesByCode.set(countryCode, [...(citiesByCode.get(countryCode) || []), city]);
  }

  for (const scenario of [
    { name: "Germany Austria 14 days", countryCodes: ["DE", "AT"], citiesPerCountry: 3, durationDays: 14 },
    { name: "Japan 14 days", countryCodes: ["JP"], citiesPerCountry: 3, durationDays: 14 },
    { name: "Italy 14 days", countryCodes: ["IT"], citiesPerCountry: 3, durationDays: 14 },
  ]) {
    const selectedCities = scenario.countryCodes.flatMap((countryCode) => (
      (citiesByCode.get(countryCode) || []).slice(0, scenario.citiesPerCountry).map((city) => ({
        ...city,
        countryCode,
        name: city.canonicalNameZh || city.canonicalNameEn,
        entityTypeName: "city",
      }))
    ));
    assert.equal(
      selectedCities.length,
      scenario.countryCodes.length * scenario.citiesPerCountry,
      `${scenario.name}: published Knowledge cities must exist for the regression fixture`,
    );
    const snapshot = {
      id: `route-v2-${scenario.name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "-")}`,
      name: scenario.name,
      countries: scenario.countryCodes,
      durationDays: scenario.durationDays,
      destinationEntities: selectedCities,
      countryEntities: scenario.countryCodes.map((code) => countryByCode.get(code)).filter(Boolean),
    };
    const planned = createTripFromRoute(recalculateTravelState(baseState()), snapshot);
    const trip = planned.trips.at(-1);
    assert.equal(trip.cityIds.length, selectedCities.length, `${scenario.name}: Trip main data must retain every city`);
    assert.deepEqual(
      trip.cityQids.sort(),
      selectedCities.map((city) => city.wikidataId).sort(),
      `${scenario.name}: Trip must retain every city QID`,
    );
    const completed = setTripStatus(recalculateTravelState(JSON.parse(JSON.stringify(planned))), trip.id, "completed");
    const completedStats = getTravelStats(completed);
    assert.equal(completedStats.exploredCountryCount, scenario.countryCodes.length, `${scenario.name}: completed Footprint country count`);
    assert.equal(completedStats.exploredCityCount, selectedCities.length, `${scenario.name}: completed Footprint city count`);
    const removed = removeTrip(completed, trip.id);
    assert.equal(getTravelStats(removed).exploredCountryCount, 0, `${scenario.name}: deleting the only Trip must clear explored countries`);
    assert.equal(getTravelStats(removed).exploredCityCount, 0, `${scenario.name}: deleting the only Trip must clear explored cities`);
  }
}

console.log("Travel state calculations verified.");
