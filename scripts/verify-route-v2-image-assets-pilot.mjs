import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE_ROOT = path.join(PROJECT_ROOT, "data", "knowledge");
const CACHE_ROOT = path.join(PROJECT_ROOT, ".route-v2-cache");
const MODULE_PATH = path.join(PROJECT_ROOT, "route-v2-image-assets.js");

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(root, entry.name);
      return entry.isDirectory() ? filesUnder(absolutePath) : [absolutePath];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function snapshot(root, { hash = false } = {}) {
  return filesUnder(root).map((absolutePath) => {
    const stat = fs.statSync(absolutePath);
    return {
      path: path.relative(root, absolutePath).replaceAll("\\", "/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ...(hash ? { sha256: crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex") } : {}),
    };
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

const knowledgeBefore = snapshot(KNOWLEDGE_ROOT, { hash: true });
const cacheBefore = snapshot(CACHE_ROOT);
const imageAssets = require(MODULE_PATH);
const imageCoverageManifest = JSON.parse(read("data/route-v2/images/image-coverage-manifest.json"));
globalThis.RouteV2ImageCoverage = {
  countryByCode: Object.fromEntries(imageCoverageManifest.countries.map((record) => [record.countryCode, record])),
  cityByEntityId: Object.fromEntries(imageCoverageManifest.cities.map((record) => [record.entityId, record])),
  poiByEntityId: Object.fromEntries(imageCoverageManifest.pois.map((record) => [record.entityId, record])),
  fallbackPolicy: imageCoverageManifest.fallbackPolicy,
};
const tokyoCoverage = imageCoverageManifest.cities.find((record) => record.canonicalNameEn === "Tokyo");
const dedicatedPoiCoverage = imageCoverageManifest.pois.find((record) => record.status === "imageReady");

const EXPECTED_CITY_KEYS = Object.freeze({
  "NL-AMS": "cities/amsterdam.webp",
  "CZ-PRG": "cities/prague.webp",
  "JP-TYO": "cities/tokyo.webp",
});
const EXPECTED_ROUTE_KEYS = Object.freeze({
  "gold-case-accepted-gold-c45-43-benelux-explorer": "routes/benelux-explorer.webp",
  "gold-case-accepted-gold-4-central-europe-hopper": "routes/central-europe-hopper.webp",
  "gold-case-accepted-gold-2-it-first-trip": "routes/italy-first-trip.webp",
});
const TEST_ASSET_BASE_URL = "https://assets.example.test/travel/v2/";

assert.equal(imageAssets.getAssetBaseUrl(), "");
assert.equal(imageAssets.isRuntimeImageSearchEnabled(), false);
globalThis.RouteV2ImageAssetConfig = Object.freeze({ assetBaseUrl: TEST_ASSET_BASE_URL });
assert.equal(imageAssets.getAssetBaseUrl(), TEST_ASSET_BASE_URL);
assert.equal(imageAssets.isRuntimeImageSearchEnabled(), false);
assert.equal(imageAssets.resolveAssetUrl("cities/amsterdam.webp"), `${TEST_ASSET_BASE_URL}cities/amsterdam.webp`);
delete globalThis.RouteV2ImageAssetConfig;
assert.equal(imageAssets.getAssetBaseUrl(), "");
assert.equal(imageAssets.isRuntimeImageSearchEnabled({ allowRuntimeImageSearch: true }), false);
assert.deepEqual(imageAssets.PILOT_CITY_COVER_KEYS, EXPECTED_CITY_KEYS);
assert.deepEqual(imageAssets.PILOT_ROUTE_COVER_KEYS, EXPECTED_ROUTE_KEYS);
assert.equal(Object.keys(imageAssets.PILOT_CITY_COVER_KEYS).length, 3);
assert.equal(Object.keys(imageAssets.PILOT_ROUTE_COVER_KEYS).length, 3);
assert.deepEqual(imageAssets.IMAGE_DELIVERY_SPEC, {
  format: "WebP",
  aspectRatio: "16:10",
  width: 800,
  height: 500,
  targetKilobytes: "80-180",
});

for (const [cityId, key] of Object.entries(EXPECTED_CITY_KEYS)) {
  assert.equal(imageAssets.pilotCityCoverKey(cityId), key);
  const first = imageAssets.resolvePilotCityCover(cityId, { assetBaseUrl: TEST_ASSET_BASE_URL });
  const second = imageAssets.resolvePilotCityCover(cityId, { assetBaseUrl: TEST_ASSET_BASE_URL });
  assert.deepEqual(first, second);
  assert.equal(first.url, `${TEST_ASSET_BASE_URL}${key}`);
  assert.equal(first.isFallback, false);
  assert.equal(imageAssets.resolvePilotCityCover(cityId).url, "assets/route-city-placeholder.svg");
  assert.equal(imageAssets.resolvePilotCityCover(cityId).isFallback, true);
}

for (const [routeId, key] of Object.entries(EXPECTED_ROUTE_KEYS)) {
  assert.equal(imageAssets.pilotRouteCoverKey(routeId), key);
  const first = imageAssets.resolvePilotRouteCover(routeId, { assetBaseUrl: TEST_ASSET_BASE_URL });
  const second = imageAssets.resolvePilotRouteCover(routeId, { assetBaseUrl: TEST_ASSET_BASE_URL });
  assert.deepEqual(first, second);
  assert.equal(first.url, `${TEST_ASSET_BASE_URL}${key}`);
  assert.equal(first.isFallback, false);
  assert.equal(imageAssets.resolvePilotRouteCover(routeId).url, "assets/trip-cover-placeholder.svg");
  assert.equal(imageAssets.resolvePilotRouteCover(routeId).isFallback, true);
}

assert.equal(imageAssets.pilotCityCoverKey("CO-BOG"), "");
assert.equal(imageAssets.pilotRouteCoverKey("not-a-pilot"), "");
assert.equal(imageAssets.resolvePilotCityCover("CO-BOG"), null);
assert.equal(imageAssets.resolvePilotRouteCover("not-a-pilot"), null);
assert.equal(imageAssets.resolveAssetUrl("../secret.webp", { assetBaseUrl: TEST_ASSET_BASE_URL, fallbackUrl: "local.svg" }), "local.svg");
assert.equal(imageAssets.resolveAssetUrl("https://other.example/image.webp", { assetBaseUrl: TEST_ASSET_BASE_URL, fallbackUrl: "local.svg" }), "local.svg");
assert.equal(imageAssets.isConfiguredAssetUrl(`${TEST_ASSET_BASE_URL}routes/italy-first-trip.webp`, { assetBaseUrl: TEST_ASSET_BASE_URL }), true);
assert.equal(imageAssets.isConfiguredAssetUrl("https://images.unsplash.com/photo-test", { assetBaseUrl: TEST_ASSET_BASE_URL }), false);
assert.equal(imageAssets.resolveLocalRouteCover({
  id: "gold-case-accepted-gold-1-jp-first-trip",
  countryEntities: [{ countryCode: "JP", name: "Japan" }],
}).url, "assets/route-v2-images/countries/jp.svg");
assert.equal(imageAssets.resolveLocalRouteCover({
  id: "gold-case-accepted-gold-1-jp-first-trip",
  countryEntities: [{ countryCode: "US", name: "United States" }],
}).url, "assets/route-v2-images/countries/us.svg", "Route IDs cannot override the exact manifest country scope");
assert.equal(imageAssets.resolveLocalRouteCover({
  id: "local-city-route",
  destinationEntities: [{ entityId: tokyoCoverage.entityId, name: "Tokyo", countryCode: "JP" }],
  countryEntities: [{ countryCode: "JP", name: "Japan" }],
}).url, tokyoCoverage.assetPath);
assert.equal(imageAssets.resolveLocalRouteCover({
  id: "local-country-route",
  countryEntities: [{ countryCode: "FI", name: "Finland" }],
}).url, "assets/route-v2-images/countries/fi.svg");
assert.equal(imageAssets.resolveLocalRouteCover({ id: "unknown-local-route" }).url, "assets/trip-cover-placeholder.svg");
for (const record of [
  {
    id: "gold-case-accepted-gold-c45-13-california-pacific-coast",
    countryEntities: [{ countryCode: "US", name: "United States" }],
  },
  {
    id: "gold-case-accepted-gold-c45-7-andalusia-deep-dive",
    countryEntities: [{ countryCode: "ES", name: "Spain" }],
  },
  {
    id: "gold-case-accepted-gold-c45-32-croatian-islands",
    countryEntities: [{ countryCode: "HR", name: "Croatia" }],
  },
]) {
  assert.equal(
    imageAssets.resolveLocalRouteCover(record).url,
    `assets/route-v2-images/countries/${record.countryEntities[0].countryCode.toLowerCase()}.svg`,
    `${record.id}: a wrong-place legacy illustration must degrade to the exact manifest country graphic`,
  );
}
assert.equal(imageAssets.resolveLocalDestinationCover({ name: "Kyoto", countryCode: "JP" }).url, "assets/route-city-placeholder.svg");
assert.equal(imageAssets.resolveLocalDestinationCover({ entityId: tokyoCoverage.entityId, name: "Tokyo", countryCode: "JP" }).url, tokyoCoverage.assetPath);
assert.equal(imageAssets.resolveLocalDestinationCover({ entityId: dedicatedPoiCoverage.entityId, countryCode: dedicatedPoiCoverage.countryCode }).url, dedicatedPoiCoverage.assetPath);
assert.equal(imageAssets.resolveLocalDestinationCover({ name: "Unknown", countryCode: "ZZ" }).url, "assets/route-city-placeholder.svg");
assert.equal(
  imageAssets.resolveLocalRouteCover({ id: "gold-case-accepted-gold-2-it-first-trip" }, { assetBaseUrl: TEST_ASSET_BASE_URL }).url,
  `${TEST_ASSET_BASE_URL}routes/italy-first-trip.webp`,
);

const routesHtml = read("routes.html");
const mobileHtml = read("mobile.html");
const cityHtml = read("city-oslo.html");
const routesSource = read("routes.js");
const preloadSource = read("route-feed-preload.js");
const citySource = read("city-detail.js");
const detailHtml = read("route-detail.html");
const detailSource = read("route-detail.js");
const discoverySource = read("src/lib/routes/discovery.mjs");
const moduleSource = read("route-v2-image-assets.js");
const serverSource = read("server.js");
const travelDataSource = read("travel-data.js");
const plannerStatisticsLines = read("PLANNER_STRATEGY_STATISTICS.csv").split(/\r?\n/u);

assert.ok(routesHtml.indexOf("route-v2-image-assets.js") < routesHtml.indexOf("routes.js"));
assert.ok(mobileHtml.indexOf("route-v2-image-assets.js") < mobileHtml.indexOf("route-feed-preload.js"));
assert.ok(cityHtml.indexOf("route-v2-image-assets.js") < cityHtml.indexOf("city-detail.js"));
assert.match(routesSource, /const BATCH_SIZE = 6;/u);
assert.match(routesSource, /const FEED_PAGE_SIZE = BATCH_SIZE;/u);
assert.match(routesSource, /rootMargin: "800px 0px"/u);
assert.match(routesSource, /resolvePilotRouteCover/u);
assert.match(routesSource, /fixedPilotRouteCover/u);
assert.match(routesSource, /const runtimeImageSearchEnabled = false;/u);
assert.match(routesSource, /if \(!runtimeImageSearchEnabled\) \{\s*clearRouteCover\(record\);/u);
assert.match(routesSource, /function schedulePendingCoverHydration\(\) \{\s*if \(!runtimeImageSearchEnabled\) return;/u);
assert.match(routesSource, /return \/\^\(\?:https\?:\)\?\\\/\\\/\/i\.test\(text\) \? FALLBACK_ROUTE_COVER : text;/u);
assert.match(preloadSource, /resolvePilotRouteCover/u);
assert.match(preloadSource, /if \(fixedCover\?\.isFallback && runtimeImageSearchEnabled\) image = await requestCover/u);
assert.match(preloadSource, /return \/\^https\?:\\\/\\\/\/i\.test\(text\) \? imageAssets\?\.DEFAULT_ROUTE_PLACEHOLDER/u);
assert.match(citySource, /coverage\?\.status === "imageReady"/u);
assert.match(citySource, /coverage\.assetKind === "verified-destination-image"/u);
assert.match(citySource, /coverage\.semanticScope === "exact-city"/u);
assert.match(citySource, /neutralCityCover\(\)/u);
assert.doesNotMatch(citySource, /resolvePilotCityCover/u, "City Detail must not use an unverified pilot or remote City image");
assert.match(citySource, /cityCover\.alt = `\$\{city\.name\}封面图`/u);
assert.ok(detailHtml.indexOf("route-v2-image-assets.js") < detailHtml.indexOf("route-detail.js"));
assert.match(detailSource, /resolveLocalRouteCover/u);
assert.match(detailSource, /resolveLocalDestinationCover/u);
assert.match(detailSource, /if \(!runtimeImageSearchEnabled\) return;/u);
assert.match(detailSource, /if \(!runtimeImageSearchEnabled\) \{[\s\S]*routeFallbackApplied[\s\S]*DEFAULT_CITY_PLACEHOLDER[\s\S]*return;/u);
assert.doesNotMatch(detailSource, /console\.error\("Route cover asset failed"/u);
assert.doesNotMatch(discoverySource, /if \(!record\.coverAsset\?\.imageUrl\) throw new RouteDiscoveryError\("ROUTE_MEDIA_INCOMPLETE"/u);
assert.match(serverSource, /process\.env\.ROUTE_IMAGE_CACHE_PATH/u);
assert.match(serverSource, /process\.env\.ROUTE_IMAGE_PROXY_CACHE_DIR/u);
assert.match(serverSource, /const acceptedRoutesPath = process\.env\.ROUTE_ACCEPTED_REPOSITORY_PATH/u);
assert.doesNotMatch(moduleSource, /fetch\(|XMLHttpRequest|node:fs|\.route-v2-cache/u);
assert.equal((moduleSource.match(/https?:\/\//gu) || []).length, 0, "Production image module must not contain a hostname");
for (const assetPath of new Set([...moduleSource.matchAll(/["'](assets\/[^"']+)["']/gu)].map((match) => match[1]))) {
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, assetPath)), true, `Local image asset must exist: ${assetPath}`);
}

for (const cityId of Object.keys(EXPECTED_CITY_KEYS)) {
  assert.ok(travelDataSource.includes(`["${cityId}",`), `Pilot City must already exist: ${cityId}`);
}
for (const routeId of Object.keys(EXPECTED_ROUTE_KEYS)) {
  const statisticsLine = plannerStatisticsLines.find((line) => line.startsWith(`"${routeId}"`));
  assert.ok(statisticsLine, `Pilot Route must already exist: ${routeId}`);
  assert.ok(statisticsLine.includes('"accepted","是"'), `Pilot Route must be feed eligible: ${routeId}`);
}

assert.deepEqual(snapshot(KNOWLEDGE_ROOT, { hash: true }), knowledgeBefore, "Knowledge Entity Layer files changed");
assert.deepEqual(snapshot(CACHE_ROOT), cacheBefore, ".route-v2-cache files changed");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  pilot: {
    cities: Object.keys(EXPECTED_CITY_KEYS),
    routes: Object.keys(EXPECTED_ROUTE_KEYS),
  },
  defaultAssetBaseUrl: imageAssets.getAssetBaseUrl(),
  fallback: {
    city: "assets/route-city-placeholder.svg",
    route: "assets/trip-cover-placeholder.svg",
  },
  batching: {
    firstBatch: 6,
    nextPrefetchBatch: 6,
    observerRootMargin: "800px 0px",
  },
  sideEffects: {
    externalRequests: 0,
    knowledgeFilesModified: 0,
    cacheFilesModified: 0,
  },
}, null, 2)}\n`);
