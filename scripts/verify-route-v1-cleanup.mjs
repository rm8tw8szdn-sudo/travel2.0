import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deletedFiles = [
  "route-candidates.js",
  "route-nordic.html",
  "scripts/verify-route-candidates.py",
  "scripts/verify-city-route-candidates.py",
  "scripts/verify-natural-route-search.py",
  "scripts/verify-route-detail.mjs",
];
const forbidden = [
  /RouteCandidate/g,
  /DEFAULT_ROUTES/g,
  /sourceRouteId/g,
  /lastRouteCandidateSave/g,
  /routeFromCandidate/g,
  /saveRouteCandidate/g,
  /findSimilarRoute/g,
  /route-nordic/g,
];
const scannedExtensions = new Set([".js", ".mjs", ".html"]);
const ignoredDirectories = new Set(["legacy", "output", "assets", "vendor"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) return [];
      return walk(absolute);
    }
    if (!scannedExtensions.has(path.extname(entry.name))) return [];
    if (relative === "scripts/verify-route-v1-cleanup.mjs") return [];
    return [relative];
  });
}

for (const relative of deletedFiles) {
  assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} must be deleted`);
}

const violations = [];
for (const relative of walk(root)) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  for (const pattern of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) violations.push(`${relative}: ${pattern.source}`);
  }
}
assert.deepEqual(violations, [], `Route V1 symbols remain:\n${violations.join("\n")}`);

global.TravelData = require("../travel-data.js");
const TravelState = require("../travel-state.js");
const state = TravelState.createDefaultTravelState();
assert.deepEqual(state.trips, [], "default trips must be empty after Full Reset");
assert.equal("routes" in state, false, "default state must not embed a route library");
assert.equal("favoriteRouteIds" in state, false, "legacy route favorites must be removed");
assert.ok((state.detailCache || []).every((entry) => entry.targetType !== "route"), "route detail cache entries must be removed");

const migrated = TravelState.recalculateTravelState({
  ...TravelState.createEmptyTravelState(),
  routes: [{ id: "legacy-route" }],
  favoriteRouteIds: ["legacy-route"],
  trips: [{ id: "legacy-trip", sourceRouteId: "legacy-route", countryIds: ["JP"], cityIds: [] }],
});
assert.equal("routes" in migrated, false, "legacy route data must not enter normalized state");
assert.equal("favoriteRouteIds" in migrated, false, "legacy route favorites must not enter normalized state");
assert.equal("sourceRouteId" in migrated.trips[0], false, "legacy trip route source must be removed");
console.log(`Route V1 cleanup audit passed. Scanned ${walk(root).length} active files.`);
