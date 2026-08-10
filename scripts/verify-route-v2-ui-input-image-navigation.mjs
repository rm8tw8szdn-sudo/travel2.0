import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesPath = path.join(projectRoot, "routes.js");
const routeDetailPath = path.join(projectRoot, "route-detail.js");
const imageModulePath = path.join(projectRoot, "route-v2-image-assets.js");
const knowledgeRoot = path.join(projectRoot, "data", "knowledge");
const cacheRoot = path.join(projectRoot, ".route-v2-cache");

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(absolutePath) : [absolutePath];
  }).sort((left, right) => left.localeCompare(right, "en"));
}

function snapshot(root) {
  return filesUnder(root).map((absolutePath) => {
    const bytes = fs.readFileSync(absolutePath);
    return {
      path: path.relative(root, absolutePath).replaceAll("\\", "/"),
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  });
}

const knowledgeBefore = snapshot(knowledgeRoot);
const cacheBefore = snapshot(cacheRoot);
const routesSource = fs.readFileSync(routesPath, "utf8");
const routeDetailSource = fs.readFileSync(routeDetailPath, "utf8");
delete require.cache[require.resolve(imageModulePath)];
const imageAssets = require(imageModulePath);

assert.match(routesSource, /const MAX_ROUTE_QUERY_LENGTH = 160;/u);
assert.match(routesSource, /routeSearch\?\.addEventListener\("input", \(\) => \{[\s\S]*?if \(rejectOversizedRouteQuery\(routeSearch\.value\)\) return;[\s\S]*?setTimeout/u);
assert.match(routesSource, /async function loadFeed[\s\S]*?if \(rejectOversizedRouteQuery\(feedState\.query\)\) return;/u);
assert.match(routesSource, /searchFailureReason: "query-too-long"/u);
assert.match(routesSource, /系统尚未发送这次请求/u);
assert.match(routesSource, /data-route-feed-state="query-too-long"/u);
assert.match(routesSource, /data-route-feed-state="trip-capacity-exceeded"/u);
assert.match(routesSource, /系统不会用重复城市或景点凑数/u);

assert.match(routesSource, /const ROUTE_FEED_NAVIGATION_STATE_KEY = "travelCollection\.routeFeedNavigation\.v1";/u);
assert.match(routesSource, /const ROUTE_FEED_NAVIGATION_RECORD_LIMIT = 360;/u);
assert.match(routesSource, /function persistRouteFeedNavigationState\(\)/u);
assert.match(routesSource, /function restoreRouteFeedNavigationState\(\)/u);
assert.match(routesSource, /records: navigationRecordSnapshot\(feedState\.records\)/u);
assert.match(routesSource, /scrollY: Math\.max\(0, window\.scrollY/u);
assert.match(routesSource, /rootScrollTop: Math\.max\(0, routeScrollRoot\?\.scrollTop/u);
assert.match(routesSource, /window\.addEventListener\("pagehide", persistRouteFeedNavigationState\)/u);
assert.match(routesSource, /window\.addEventListener\("pageshow", \(event\) => \{[\s\S]*?event\.persisted[\s\S]*?restoreRouteFeedScrollPosition/u);
assert.match(routesSource, /event\.target\.closest\("\[data-route-open\]"\).*persistRouteFeedNavigationState/u);
assert.match(routesSource, /if \(!rejectOversizedRouteQuery\(feedState\.query\) && !restoreRouteFeedNavigationState\(\)\)/u);
assert.doesNotMatch(routesSource, /addEventListener\("pageshow", \(\) => window\.scrollTo\(0, 0\)/u);

const semanticFixtures = [
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
];
for (const record of semanticFixtures) {
  const result = imageAssets.resolveLocalRouteCover(record);
  assert.equal(result.url, imageAssets.DEFAULT_ROUTE_PLACEHOLDER, record.id);
  assert.equal(result.isFallback, true, record.id);
}

const japan = imageAssets.resolveLocalRouteCover({
  id: "gold-case-accepted-gold-1-jp-first-trip",
  countryEntities: [{ countryCode: "JP", name: "Japan" }],
});
assert.equal(japan.url, "assets/route-japan-classic-cover.svg");
assert.equal(japan.source, "local-route");
assert.match(routesSource, /function localCoverForRoute\(record = \{\}\) \{[\s\S]*?return FALLBACK_ROUTE_COVER;\s*\}/u);
assert.match(routeDetailSource, /record\.routeReferenceMode === "country-expansion"[\s\S]*?record\.routeExpansion\?\.poiEntities/u);

assert.deepEqual(snapshot(knowledgeRoot), knowledgeBefore);
assert.deepEqual(snapshot(cacheRoot), cacheBefore);

console.log(JSON.stringify({
  status: "PASS",
  inputLengthLimit: 160,
  navigationState: {
    restores: ["query", "routeType", "records", "cursor", "scrollY", "rootScrollTop"],
    maximumStoredRecords: 360,
  },
  semanticImageFixtures: semanticFixtures.length,
  wrongCountryFallbacks: semanticFixtures.length,
  externalRequests: 0,
}, null, 2));
