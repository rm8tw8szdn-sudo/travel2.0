import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "data/route-v2/images/image-coverage-manifest.json");
const BUILD_PATH = path.join(ROOT, "scripts/build-route-v2-image-coverage-batch05.mjs");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const assets = [...manifest.countries, ...manifest.cities, ...manifest.pois]
  .filter((record) => record.assetPath && record.assetPath !== manifest.fallbackPolicy.city)
  .map((record) => ({ ...record, source: read(record.assetPath) }));

function normalizedTemplate(source) {
  return source
    .replace(/aria-label="[^"]*"/gu, "aria-label=\"ENTITY\"")
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/gu, "<text>ENTITY</text>")
    .replace(/hsl\([^)]*\)/gu, "hsl(COLOR)")
    .replace(/#[0-9a-f]{3,8}/giu, "#COLOR")
    .replace(/\s+/gu, " ")
    .trim();
}

const exactGroups = new Map();
const templateGroups = new Map();
for (const asset of assets) {
  const exact = sha256(asset.source);
  const template = sha256(normalizedTemplate(asset.source));
  if (!exactGroups.has(exact)) exactGroups.set(exact, []);
  if (!templateGroups.has(template)) templateGroups.set(template, []);
  exactGroups.get(exact).push(asset.assetPath);
  templateGroups.get(template).push(asset.assetPath);
  assert.doesNotMatch(asset.source, /(?:href|src)=["']https?:\/\//iu, `${asset.assetPath}:external-image-reference`);
  assert.doesNotMatch(asset.source, /<image\b/iu, `${asset.assetPath}:embedded-unverified-raster`);
  assert.match(asset.source, /viewBox="0 0 800 500"/u, `${asset.assetPath}:unexpected-aspect-ratio`);
}

const exactDuplicates = [...exactGroups.values()].filter((group) => group.length > 1);
const suspiciousTemplateGroups = [...templateGroups.values()].filter((group) => group.length > 1);
assert.equal(exactDuplicates.length, 0, `byte-identical image assets:${JSON.stringify(exactDuplicates)}`);

const misleadingCityRecords = manifest.cities.filter((record) => (
  record.status === "imageReady" && record.assetKind !== "verified-destination-image"
));
const misleadingPoiRecords = manifest.pois.filter((record) => (
  record.status === "imageReady" && record.assetKind !== "verified-destination-image"
));
assert.equal(
  misleadingCityRecords.length,
  0,
  `abstract label cards must not count as dedicated City imagery:${misleadingCityRecords.length}`,
);
assert.equal(
  misleadingPoiRecords.length,
  0,
  `abstract label cards must not count as dedicated POI imagery:${misleadingPoiRecords.length}`,
);

for (const record of manifest.countries) {
  assert.equal(record.assetKind, "entity-label-card", `${record.assetPath}:Country graphic cover kind must be explicit`);
  assert.equal(record.status, "imageReady");
  assert.equal(record.semanticScope, "exact-country");
}
for (const record of manifest.cities) {
  if (record.status === "imageReady") continue;
  assert.equal(record.assetPath, manifest.fallbackPolicy.city, `${record.entityId}:City fallback must be neutral`);
  assert.equal(record.needsBackfill, true, `${record.entityId}:missing City image must remain debt`);
}
for (const record of manifest.pois) {
  if (record.status === "imageReady") continue;
  assert.equal(record.assetPath, manifest.fallbackPolicy.poi, `${record.entityId}:POI fallback must be neutral`);
  assert.equal(record.needsBackfill, true, `${record.entityId}:missing POI image must remain debt`);
}

const buildSource = fs.readFileSync(BUILD_PATH, "utf8");
const tripsSource = read("trips.js");
const travelStateSource = read("travel-state.js");
const tripsHtml = read("trips.html");
const imageRuntimeSource = read("route-v2-image-assets.js");
const cityDetailSource = read("city-detail.js");
assert.doesNotMatch(buildSource, /invalidMappingCount:\s*0/u, "invalidMappingCount must be derived, not hard-coded");
assert.doesNotMatch(tripsSource, /https?:\/\/(?:images\.unsplash\.com|upload\.wikimedia\.org)/iu, "Trip runtime must not embed remote destination images");
assert.match(tripsHtml, /route-v2-image-coverage\.js/u, "Trip runtime must load the fixed local image manifest");
assert.match(travelStateSource, /\^\(\?:https\?:\)\?\\\/\\\//u, "TravelState must reject remote covers before rendering");
assert.match(imageRuntimeSource, /const LOCAL_ROUTE_COVERS = Object\.freeze\(\{\}\)/u, "unverified legacy route-to-place mappings must stay retired");
assert.match(imageRuntimeSource, /coverage\?\.status === "placeholder" && coverage\.semanticScope === "neutral-placeholder"/u, "published Cities without a verified image must resolve through the manifest placeholder");
assert.match(cityDetailSource, /coverage\?\.status === "imageReady"/u, "City Detail must require imageReady before rendering a dedicated City image");
assert.match(cityDetailSource, /coverage\.assetKind === "verified-destination-image"/u, "City Detail must require a verified destination image");
assert.match(cityDetailSource, /coverage\.semanticScope === "exact-city"/u, "City Detail must require exact City semantics");
assert.match(cityDetailSource, /neutralCityCover\(\)/u, "City Detail must retain a neutral City fallback");
assert.doesNotMatch(cityDetailSource, /cityCover\.src\s*=\s*[^;]*(?:country\.cover|detail\.coverImage|pilotCover)/u, "City Detail must not use Country, route, or unrelated imagery as a City fallback");
assert.equal(manifest.coverage.overall.invalidMappingCount, manifest.invalidMappings.length);
assert.equal(manifest.coverage.overall.cityDedicatedImageCoverage.ready, manifest.cities.filter((record) => record.status === "imageReady").length);
assert.equal(manifest.coverage.overall.corePoiImageCoverage.ready, manifest.pois.filter((record) => record.status === "imageReady").length);

console.log(JSON.stringify({
  verifier: "route-v2-image-quality-adversarial",
  status: "PASS",
  auditedAssets: assets.length,
  countryGraphicCovers: manifest.countries.length,
  dedicatedCityImages: manifest.cities.filter((record) => record.status === "imageReady").length,
  dedicatedPoiImages: manifest.pois.filter((record) => record.status === "imageReady").length,
  neutralCityPlaceholders: manifest.cities.filter((record) => record.status !== "imageReady").length,
  neutralPoiPlaceholders: manifest.pois.filter((record) => record.status !== "imageReady").length,
  exactDuplicateGroups: exactDuplicates.length,
  suspiciousTemplateGroups: suspiciousTemplateGroups.length,
  largestTemplateGroup: Math.max(0, ...suspiciousTemplateGroups.map((group) => group.length)),
  invalidMappings: manifest.invalidMappings.length,
}, null, 2));
