import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { createPublishedKnowledgeEntityLayerRepository } from "../src/lib/routes/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const manifest = JSON.parse(read("data/route-v2/images/image-coverage-manifest.json"));
const repository = createPublishedKnowledgeEntityLayerRepository({ projectRoot: ROOT });
const countries = repository.listCountries();
const cities = repository.listCities();
const pois = repository.listPois();
const cityIds = new Set(cities.map((entry) => entry.entityId));
const countryById = new Map(countries.map((entry) => [entry.entityId, entry]));
const plannable = countries.filter((country) => {
  const localCities = cities.filter((city) => city.parentCountryEntityId === country.entityId);
  const localIds = new Set(localCities.map((city) => city.entityId));
  return localCities.length > 0 && pois.some((poi) => localIds.has(poi.parentCityEntityId));
});

assert.equal(manifest.schemaVersion, "route-v2-image-coverage-v1");
assert.equal(manifest.fallbackPolicy.city, "assets/route-city-placeholder.svg");
assert.equal(manifest.fallbackPolicy.poi, "assets/route-city-placeholder.svg");
assert.equal(manifest.fallbackPolicy.runtimeExternalRequestsAllowed, false);
assert.equal(manifest.countries.length, plannable.length);
assert.equal(manifest.cities.length, cities.length);
assert.equal(manifest.countries.every((record) => (
  record.status === "imageReady"
  && record.semanticScope === "exact-country"
  && record.assetKind === "entity-label-card"
  && record.visualTruthStatus === "non-photographic-graphic"
  && record.rights?.sourceType === "project-generated-vector"
  && record.rights?.externalCopyrightMaterial === false
)), true);
assert.equal(manifest.coverage.overall.countryCoverCoverage.percent, 100);
assert.equal(manifest.coverage.overall.invalidMappingCount, 0);
assert.equal(manifest.coverage.overall.cityPlaceholderCount, manifest.cities.filter((record) => record.status === "placeholder").length);
assert.equal(manifest.coverage.overall.needsBackfillCount, [...manifest.cities, ...manifest.pois].filter((record) => record.needsBackfill).length);
assert.equal(manifest.coverage.overall.cityDedicatedImageCoverage.ready, 0);
assert.equal(manifest.coverage.overall.corePoiImageCoverage.ready, 0);
assert.equal(manifest.coverage.overall.needsBackfillCount, manifest.cities.length + manifest.pois.length);
assert.deepEqual(manifest.invalidMappings, []);

const dedicatedPaths = new Set();
for (const record of [...manifest.countries, ...manifest.cities, ...manifest.pois]) {
  if (record.status === "placeholder") {
    assert.equal(record.assetPath, "assets/route-city-placeholder.svg");
    assert.equal(record.semanticScope, "neutral-placeholder");
    assert.equal(record.needsBackfill, true);
    continue;
  }
  assert.match(record.assetPath, /^assets\/route-v2-images\/(?:countries|cities|pois)\/[a-z0-9-]+\.svg$/u);
  assert.equal(fs.existsSync(path.join(ROOT, record.assetPath)), true, record.assetPath);
  const svg = read(record.assetPath);
  assert.doesNotMatch(svg, /(?:href|src)=['"]https?:\/\//iu);
  const encodedName = record.canonicalNameEn.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
  assert.equal(svg.includes(encodedName), true, record.assetPath);
  if (record.semanticScope === "exact-city") {
    assert.equal(dedicatedPaths.has(record.assetPath), false, `city asset reused:${record.assetPath}`);
    dedicatedPaths.add(record.assetPath);
  }
}
assert.equal(new Set(manifest.countries.map((entry) => entry.countryCode)).size, manifest.countries.length);
assert.equal(new Set(manifest.cities.map((entry) => entry.entityId)).size, manifest.cities.length);
assert.equal(new Set(manifest.pois.map((entry) => entry.entityId)).size, manifest.pois.length);
assert.equal(manifest.cities.every((record) => cityIds.has(record.entityId)), true);
assert.equal(manifest.cities.every((record) => countryById.has(cities.find((city) => city.entityId === record.entityId)?.parentCountryEntityId)), true);

delete globalThis.RouteV2ImageCoverage;
delete globalThis.RouteV2ImageAssets;
require(path.join(ROOT, "route-v2-image-coverage.js"));
const imageAssets = require(path.join(ROOT, "route-v2-image-assets.js"));
const placeholder = manifest.cities.find((record) => record.status === "placeholder");
assert.equal(imageAssets.resolveLocalDestinationCover({ entityId: placeholder.entityId, countryCode: placeholder.countryCode }).url, "assets/route-city-placeholder.svg");
assert.equal(manifest.cities.every((record) => imageAssets.resolveLocalDestinationCover({ entityId: record.entityId, countryCode: record.countryCode }).url === "assets/route-city-placeholder.svg"), true);
assert.equal(imageAssets.resolveLocalDestinationCover({ name: "Unknown", countryCode: "CA" }).url, "assets/route-city-placeholder.svg");
const countryCover = manifest.countries.find((record) => record.countryCode === "CA");
assert.equal(imageAssets.resolveLocalRouteCover({ countryEntities: [{ countryCode: "CA", name: "Canada" }] }).url, countryCover.assetPath);
assert.equal(imageAssets.resolveLocalRouteCover({ countryEntities: [{ countryCode: "CA" }, { countryCode: "US" }] }).url, "assets/trip-cover-placeholder.svg");
for (const badRoute of [
  ["gold-case-accepted-gold-c45-13-california-pacific-coast", "US"],
  ["gold-case-accepted-gold-c45-7-andalusia-deep-dive", "ES"],
  ["gold-case-accepted-gold-c45-32-croatian-islands", "HR"],
]) {
  const resolved = imageAssets.resolveLocalRouteCover({ id: badRoute[0], countryEntities: [{ countryCode: badRoute[1] }] }).url;
  assert.equal(resolved, manifest.countries.find((record) => record.countryCode === badRoute[1]).assetPath);
  assert.doesNotMatch(resolved, /favorite-route-canada|atlas-italy|route-thai-islands/u);
}

for (const html of ["routes.html", "mobile.html", "city-oslo.html", "route-detail.html"]) {
  const source = read(html);
  assert.ok(source.indexOf("route-v2-image-coverage.js") < source.indexOf("route-v2-image-assets.js"));
}
assert.doesNotMatch(read("route-v2-image-coverage.js"), /https?:\/\//u);
assert.doesNotMatch(read("route-v2-image-assets.js"), /fetch\(|XMLHttpRequest/u);
assert.equal(fs.existsSync(path.join(ROOT, "ROUTE_V2_IMAGE_COVERAGE_BACKFILL_AUDIT.md")), true);

console.log(JSON.stringify({
  status: "PASS", verifier: "route-v2-image-coverage-batch05",
  plannableCountries: plannable.length,
  countryCovers: manifest.countries.length,
  dedicatedCities: manifest.cities.filter((record) => record.status === "imageReady").length,
  placeholders: manifest.coverage.overall.cityPlaceholderCount,
  corePois: manifest.pois.length,
  invalidMappings: manifest.coverage.overall.invalidMappingCount,
  externalRuntimeRequests: 0,
}, null, 2));
