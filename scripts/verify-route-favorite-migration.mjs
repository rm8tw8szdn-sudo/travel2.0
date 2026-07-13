import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TravelState = require("../travel-state.js");

const snapshot = {
  id: "wikivoyage-175",
  name: "乘火车穿越澳大利亚",
  summary: "横跨澳大利亚的铁路路线。",
  recommendationText: "横贯大陆的铁路旅程串联内陆地貌与沿线城市历史。",
  countries: ["澳大利亚"],
  countryEntities: [{ wikidataId: "Q408", countryCode: "AU", name: "澳大利亚" }],
  destinations: ["悉尼", "墨尔本", "阿德莱德"],
  destinationEntities: [{ wikidataId: "Q3130", name: "悉尼", countryCode: "AU" }, { wikidataId: "Q3141", name: "墨尔本", countryCode: "AU" }, { wikidataId: "Q5112", name: "阿德莱德", countryCode: "AU" }],
  recommendedDays: "14天",
  bestMonths: ["4-5月"],
  themes: ["铁路旅行"],
  tags: ["铁路旅行"],
  highlights: ["横跨多个州", "串联主要城市", "铁路旅行体验"],
  routeBannerTitle: "Australia railway route banner.jpg",
  routeImageTitle: "Australia railway route.jpg",
  coverAsset: {
    provider: "wikimedia-commons",
    assetId: "route-cover",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:route.jpg",
    imageUrl: "https://upload.wikimedia.org/route.jpg",
    author: "Author",
    license: "CC BY-SA 4.0",
    width: 1200,
    height: 720,
  },
  destinationAssets: ["Q3130", "Q3141", "Q5112"].map((destinationId) => ({
    provider: "wikimedia-commons",
    assetId: `destination-${destinationId}`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:destination-${destinationId}.jpg`,
    imageUrl: `https://upload.wikimedia.org/destination-${destinationId}.jpg`,
    author: "Author",
    license: "CC BY-SA 4.0",
    width: 1200,
    height: 720,
    destinationId,
  })),
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/Across_Australia_by_train" },
  contentQualityStatus: "accepted",
  classification: "single",
};

const migrated = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  favoriteRouteRecordIds: [snapshot.id, "wikivoyage-pending"],
  savedRouteSnapshots: [{ ...snapshot, savedAt: "2026-06-18T12:00:00.000Z" }],
});
assert.equal("favoriteRouteRecordIds" in migrated, false);
assert.equal("savedRouteSnapshots" in migrated, false);
assert.equal(migrated.favoriteRouteEntries.length, 2);
assert.equal(TravelState.getFavoriteRouteSnapshot(migrated, snapshot.id).name, snapshot.name);
assert.equal(migrated.favoriteRouteEntries.find((item) => item.routeId === "wikivoyage-pending").migrationStatus, "pending");

const idempotent = TravelState.recalculateTravelState(JSON.parse(JSON.stringify(migrated)));
assert.deepEqual(idempotent.favoriteRouteEntries, migrated.favoriteRouteEntries, "favorite migration must be idempotent");

const favorited = TravelState.setRouteFavorite(TravelState.createEmptyTravelState(), snapshot, true);
assert.equal(TravelState.isRouteFavorite(favorited, snapshot.id), true);
assert.equal(TravelState.getFavoriteRouteSnapshot(favorited, snapshot.id).coverAsset.assetId, "route-cover");
assert.equal(TravelState.getFavoriteRouteSnapshot(favorited, snapshot.id).routeBannerTitle, snapshot.routeBannerTitle);
assert.equal(favorited.trips.length, 0, "favoriting must not create a trip");

const unfavorited = TravelState.setRouteFavorite(favorited, snapshot.id, false);
assert.equal(TravelState.isRouteFavorite(unfavorited, snapshot.id), false);

const tripState = TravelState.createTripFromRoute(TravelState.createEmptyTravelState(), snapshot);
assert.equal(TravelState.isRouteFavorite(tripState, snapshot.id), false, "creating a trip must not favorite the route");
assert.equal(tripState.trips[0].routeSnapshot.coverAsset.assetId, "route-cover");
assert.equal(tripState.trips[0].routeSnapshot.routeImageTitle, snapshot.routeImageTitle);

const cachedOnce = TravelState.cacheRouteMedia(TravelState.createEmptyTravelState(), snapshot);
const changedOnline = {
  ...snapshot,
  coverAsset: { ...snapshot.coverAsset, assetId: "replacement-cover", imageUrl: "https://upload.wikimedia.org/replacement.jpg" },
};
const cachedAgain = TravelState.cacheRouteMedia(cachedOnce, changedOnline);
assert.equal(TravelState.applyCachedRouteMedia(cachedAgain, changedOnline).coverAsset.assetId, "route-cover", "automatic refresh must retain the first successful route cover");
const manuallyRefreshed = TravelState.cacheRouteMedia(cachedAgain, changedOnline, { refresh: true });
assert.equal(TravelState.applyCachedRouteMedia(manuallyRefreshed, changedOnline).coverAsset.assetId, "replacement-cover", "manual refresh may replace cached route media");

console.log("Route Favorite snapshot migration verification passed.");
