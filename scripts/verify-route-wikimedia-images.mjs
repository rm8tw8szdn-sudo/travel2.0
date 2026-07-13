import assert from "node:assert/strict";
import { createWikimediaImageProvider } from "../src/lib/routes/wikimedia-image-provider.mjs";
import { validAsset } from "../src/lib/routes/media-service.mjs";

function response(pages) {
  return { ok: true, async json() { return { query: { pages } }; } };
}

function page(title, { width = 1600, height = 900 } = {}) {
  return {
    title: `File:${title}`,
    imageinfo: [{
      url: `https://upload.wikimedia.org/${encodeURIComponent(title)}`,
      thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      width,
      height,
      thumbwidth: width,
      thumbheight: height,
      extmetadata: {
        Artist: { value: "Wikimedia contributor" },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        ImageDescription: { value: "Australia railway journey" },
      },
    }],
  };
}

const calls = [];
const provider = createWikimediaImageProvider({
  async fetchImpl(url) {
    calls.push(url.searchParams.get("titles") || url.searchParams.get("gsrsearch"));
    if (url.searchParams.get("titles")?.includes("Banner")) return response([page("Australia Railway Route Banner.jpg", { width: 2100, height: 300 })]);
    if (url.searchParams.get("titles")) return response([page("Darwin.jpg")]);
    return response([page("Australia Airport Terminal.jpg"), page("Australian railway landscape.jpg")]);
  },
});

const result = await provider.search({
  scope: "route",
  name: "乘火车穿越澳大利亚",
  sourceTitle: "Across Australia by train",
  routeBannerTitle: "Australia Railway Route Banner.jpg",
  routeImageTitle: "Darwin.jpg",
  countryName: "澳大利亚",
  themes: ["铁路旅行"],
  destinations: [{ name: "达尔文", sourceTitle: "Darwin" }],
  excludeAssetIdentities: [],
});

assert.deepEqual(calls, ["File:Australia Railway Route Banner.jpg"], "a valid route banner must stop lower-priority image lookups");
assert.equal(result.candidates[0].discoveredVia, "route-banner", "route banner must outrank pageimage and theme search");
assert.equal(validAsset(result.candidates[0]), true, "an official ultrawide route banner must pass route-cover validation");
assert.doesNotMatch(result.candidates[0].assetId, /darwin/, "a single destination image must not become the route cover");
assert.equal(result.rejections.length, 0);

let destinationAttempts = 0;
const destinationProvider = createWikimediaImageProvider({
  async fetchImpl(url) {
    destinationAttempts += 1;
    if (destinationAttempts === 1) return { ok: false, status: 429, headers: { get: () => "0" } };
    if (url.hostname === "en.wikipedia.org") return response([{ title: "Adelaide", pageimage: "Adelaide city skyline.jpg" }]);
    if (url.hostname === "en.wikivoyage.org") return response([{ title: "Adelaide", pageimage: "Adelaide skyline.jpg" }]);
    if (url.searchParams.get("titles")) return response([page("Adelaide skyline.jpg")]);
    return response([]);
  },
});
const destinationResult = await destinationProvider.search({
  scope: "destination",
  name: "阿德莱德",
  sourceTitle: "Adelaide",
  countryName: "澳大利亚",
  themes: ["铁路旅行"],
  excludeAssetIdentities: [],
});
assert.equal(destinationResult.candidates[0].discoveredVia, "destination-wikipedia-pageimage", "a destination must prefer its own exact Wikipedia pageimage");

let routeThemeQuery = "";
const routeThemeQueries = [];
const themeFallbackProvider = createWikimediaImageProvider({
  async fetchImpl(url) {
    const title = url.searchParams.get("titles") || "";
    if (title.includes("Itinerary")) return response([{ title: "File:Itinerary" }]);
    if (title.includes("Whale_road_sign")) return response([page("Whale road sign.jpg", { width: 900, height: 1400 })]);
    routeThemeQuery = url.searchParams.get("gsrsearch") || "";
    routeThemeQueries.push(routeThemeQuery);
    return routeThemeQuery.includes("Nature aux")
      ? response([page("Old route book.pdf")])
      : response([page("Route 138 scenic road.jpg")]);
  },
});
const themeFallback = await themeFallbackProvider.search({
  scope: "route",
  name: "加拿大经典线",
  sourceTitle: "Route Nature aux mille délices",
  routeBannerTitle: "Itinerary",
  routeImageTitle: "Tadoussac_-_Whale_road_sign.jpg",
  routeSearchTerms: ["Route des Baleines"],
  countryName: "加拿大",
  themes: ["经典旅行"],
  destinations: [{ name: "北岸", sourceTitle: "North Shore (Quebec)" }, { name: "加斯佩半岛", sourceTitle: "Gaspé Peninsula" }],
  excludeAssetIdentities: [],
});
assert.equal(themeFallback.candidates[0].discoveredVia, "route-theme-search");
assert.equal(routeThemeQueries.length, 2);
assert.doesNotMatch(routeThemeQuery, /[\u3400-\u9fff]/u, "Commons route-theme search must not be poisoned by Chinese display terms");
assert.match(routeThemeQuery, /^Route des Baleines.*North Shore.*Gaspé Peninsula$/i);

console.log("Wikimedia route banner priority and image rejection diagnostics verified.");
