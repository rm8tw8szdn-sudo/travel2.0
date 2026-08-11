import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageAssets = require(path.join(projectRoot, "route-v2-image-assets.js"));
const placeholder = "assets/route-city-placeholder.svg";
const svg = fs.readFileSync(path.join(projectRoot, placeholder), "utf8");

assert.equal(imageAssets.DEFAULT_CITY_PLACEHOLDER, placeholder);
assert.equal(imageAssets.resolvePilotCityCover("NL-AMS", { assetBaseUrl: "" })?.url, placeholder);
assert.equal(imageAssets.resolveLocalDestinationCover({ name: "Unknown", countryCode: "ZZ" }).url, placeholder);
assert.notEqual(imageAssets.resolveLocalDestinationCover({ name: "Unknown", countryCode: "NO" }).url, "assets/route-city-oslo.svg");
assert.doesNotMatch(svg, /oslo|norway|norge|fjord|flag|country|city name/iu);
assert.doesNotMatch(svg, /(?:href|src)=["']https?:\/\//iu);
assert.match(svg, /aria-label="Neutral travel placeholder"/u);

const detailSource = fs.readFileSync(path.join(projectRoot, "city-detail.js"), "utf8");
assert.match(detailSource, /assets\/route-city-placeholder\.svg/u);
assert.doesNotMatch(detailSource, /localOnlyPlaceholderCover\s*=\s*["']assets\/route-city-oslo\.svg/u);

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-neutral-city-placeholder",
  status: "PASS",
  placeholder,
  geographicClaims: 0,
  externalUrls: 0,
}, null, 2)}\n`);
