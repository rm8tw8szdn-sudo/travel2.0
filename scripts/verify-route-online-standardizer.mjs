import assert from "node:assert/strict";
import { createOnlineRouteStandardizer, orderedLinkedTitles, preferredChineseLabel } from "../src/lib/routes/online-standardizer.mjs";

assert.equal(preferredChineseLabel({ zh: { value: "愛麗斯泉" }, "zh-hans": { value: "爱丽斯泉" } }), "爱丽斯泉", "simplified Chinese labels must take precedence over generic Chinese labels");

assert.deepEqual(orderedLinkedTitles({
  revisions: [{ slots: { main: { content: "{{pagebanner|Banner.jpg}}{{see also|[[Unrelated Route]]}}\n== Route ==\nStart in [[Cape Town]], continue to [[Paarl|Paarl town]], and finish at [[Gqeberha]]." } } }],
  links: [{ title: "Alphabetical fallback" }],
}), ["Cape Town", "Paarl", "Gqeberha"], "destination candidates must follow Wikivoyage body order instead of alphabetical prop=links order");

const standardizer = createOnlineRouteStandardizer({
  resolveLinkedEntities: async () => ([
    { wikidataId: "Q3130", name: "悉尼", sourceTitle: "Sydney", countryWikidataId: "Q408", countryCode: "AU", countryName: "澳大利亚", sourceUrl: "https://www.wikidata.org/wiki/Q3130" },
    { wikidataId: "Q3141", name: "墨尔本", sourceTitle: "Melbourne", countryWikidataId: "Q408", countryCode: "AU", countryName: "澳大利亚", sourceUrl: "https://www.wikidata.org/wiki/Q3141" },
    { wikidataId: "Q5112", name: "阿德莱德", sourceTitle: "Adelaide", countryWikidataId: "Q408", countryCode: "AU", countryName: "澳大利亚", sourceUrl: "https://www.wikidata.org/wiki/Q5112" },
    { wikidataId: "Q34932", name: "布里斯班", sourceTitle: "Brisbane", countryWikidataId: "Q408", countryCode: "AU", countryName: "澳大利亚", sourceUrl: "https://www.wikidata.org/wiki/Q34932" },
    { wikidataId: "Q1377728", name: "欧洲E9海岸路", sourceTitle: "E9 European long distance path", entityTypeName: "long-distance hiking trail", countryWikidataId: "Q31", countryCode: "BE", countryName: "比利時", sourceUrl: "https://www.wikidata.org/wiki/Q1377728" },
    { wikidataId: "Q408", name: "澳大利亚", sourceTitle: "Australia", countryWikidataId: "Q408", countryCode: "AU", countryName: "澳大利亚", sourceUrl: "https://www.wikidata.org/wiki/Q408" },
    { wikidataId: "Q999", name: "Arnprior", sourceTitle: "Arnprior", countryWikidataId: "Q16", countryCode: "CA", countryName: "加拿大", sourceUrl: "https://www.wikidata.org/wiki/Q999" },
  ]),
});

const record = await standardizer.standardize({
  pageid: 175,
  title: "Across Australia by train",
  extract: "Across Australia by train connects major Australian cities on long-distance railway journeys. It is also known as the Trans-Australian railway journey.",
  links: [{ title: "Sydney" }, { title: "Melbourne" }, { title: "Adelaide" }],
  categories: [{ title: "Category:Oceania itineraries" }],
  revisions: [{ slots: { main: { content: "{{pagebanner|Australian rail journey banner.jpg|unesco=yes}}\nRoute text" } } }],
  pageimage: "Across_Australia_train.jpg",
}, { preferredEntityId: "Q34932" });

assert.equal(record.name, "乘火车穿越澳大利亚");
assert.equal(record.canonicalTitle, "乘火车穿越澳大利亚");
assert.deepEqual(record.countries, ["澳大利亚"]);
assert.deepEqual(record.destinations, ["布里斯班", "悉尼", "墨尔本", "阿德莱德"]);
assert.equal(record.countryEntities[0].countryCode, "AU");
assert.equal(record.countryEntities[0].wikidataId, "Q408");
assert.equal(record.destinationEntities.length, 4);
assert.equal(record.destinations.includes("澳大利亚"), false, "the country itself must not be emitted as a route destination");
assert.equal(record.destinations.includes("欧洲E9海岸路"), false, "routes, trails, and itinerary entities must not be emitted as destinations");
assert.equal(record.routeBannerTitle, "Australian rail journey banner.jpg");
assert.equal(record.routeImageTitle, "Across_Australia_train.jpg");
assert.deepEqual(record.routeSearchTerms, ["Trans-Australian railway journey"]);
assert.ok(record.summary.includes("悉尼"));
assert.ok(record.provenance.destinations.sourceUrl.includes("wikivoyage"));
assert.equal("coverImage" in record, false, "standardization must not inject a local/default cover");

let basicResolverCalls = 0;
const basicStandardizer = createOnlineRouteStandardizer({
  resolveLinkedEntities: async () => { basicResolverCalls += 1; throw new Error("Wikidata must not run in Feed basic mode"); },
});
const basicRecord = await basicStandardizer.standardize({
  pageid: 27,
  title: "88 Temple Pilgrimage",
  extract: "The pilgrimage is Japan's most famous route, a 1,200-km loop around Shikoku.",
  categories: [{ title: "Category:Asia itineraries" }, { title: "Category:Itineraries" }],
  pageimage: "MotoyamaJi,Kagawa-01.jpg",
  thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/MotoyamaJi.jpg/1400px-MotoyamaJi.jpg", width: 1400, height: 933 },
}, { enrichmentMode: "basic", deadlineAt: Date.now() + 100 });
assert.equal(basicResolverCalls, 0, "Feed basic normalization must not call Wikidata");
assert.equal(basicRecord.enrichmentStatus, "basic");
assert.match(basicRecord.name, /寺庙巡礼/);
assert.equal(basicRecord.coverAsset.provider, "wikivoyage-pageimage");
assert.equal(basicRecord.coverAsset.imageUrl.startsWith("https://upload.wikimedia.org/"), true);
assert.deepEqual(basicRecord.countries, ["Japan"], "basic country text must be derived from Wikivoyage without Wikidata");

const collectionPage = await standardizer.standardize({
  pageid: 999,
  title: "Europe itineraries",
  extract: "An index of routes across Europe.",
  links: [{ title: "Sydney" }, { title: "Melbourne" }, { title: "Adelaide" }],
});
assert.equal(collectionPage, null, "itinerary index/list pages must not be standardized as a travel route");

console.log("Online RouteRecord standardizer verification passed.");
