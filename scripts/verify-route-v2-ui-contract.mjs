import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const feedHtml = read("routes.html");
const feedJs = read("routes.js");
const detailHtml = read("route-detail.html");
const detailJs = read("route-detail.js");
const favoriteHtml = read("favorites.html");
const favoriteJs = read("favorites.js");
const mobileCss = read("mobile.css");

assert.match(feedHtml, /data-route-search/);
assert.match(feedHtml, /data-route-tab="cross"[^>]*>跨国路线/);
assert.match(feedHtml, /data-route-tab="single"[^>]*>单国城市路线/);
assert.match(feedJs, /record\.countryEntities/);
assert.match(feedJs, /query:\s*feedState\.query/);
assert.match(feedJs, /data-route-add-trip/);
assert.match(feedJs, /data-route-favorite/);
assert.doesNotMatch(feedHtml + feedJs, /data-route-save|保存路线|isRouteSaved|saveRouteSnapshot/);
assert.doesNotMatch(feedJs, /FALLBACK_COVER|route-placeholder/);
assert.doesNotMatch(feedJs, /天数灵活|季节灵活/);

assert.match(detailHtml, /data-route-places/);
assert.match(detailHtml, /data-route-highlight-text/);
assert.match(detailHtml, /包含目的地/);
assert.match(detailJs, /destinationAssets/);
assert.doesNotMatch(detailHtml + detailJs, /data-route-save|保存路线|相关路线|FALLBACK_COVER|route-placeholder/);

assert.doesNotMatch(favoriteHtml + favoriteJs, /saved-routes|已保存|savedRouteSnapshots|getSavedRouteSnapshot/);
assert.doesNotMatch(mobileCss, /route-candidate/, "legacy candidate presentation residue must be removed");
assert.match(favoriteJs, /favoriteRouteEntries/);
assert.match(favoriteJs, /getFavoriteRouteSnapshot/);

console.log("Route V2 frozen UI and Favorite-only contract verification passed.");
