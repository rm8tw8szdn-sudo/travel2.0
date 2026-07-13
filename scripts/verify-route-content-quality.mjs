import assert from "node:assert/strict";
import {
  classifyRoute,
  createContentEnricher,
  createTextEnrichmentProvider,
  validateRouteContent,
} from "../src/lib/routes/index.mjs";

const coverAsset = {
  provider: "wikivoyage-pageimage",
  assetId: "shikoku.jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Shikoku.jpg",
  imageUrl: "https://upload.wikimedia.org/shikoku.jpg",
  author: "Author",
  license: "CC BY-SA 4.0",
  width: 1200,
  height: 720,
  discoveredVia: "route-pageimage",
};

const facts = {
  routeId: "wikivoyage-27",
  source: { name: "Wikivoyage", url: "https://en.wikivoyage.org/wiki/88_Temple_Pilgrimage" },
  sourceTitle: "88 Temple Pilgrimage",
  extract: "A pilgrimage around Shikoku visiting 88 temples through Tokushima, Kochi, Ehime and Kagawa.",
  categories: ["Japan itineraries", "Pilgrimages"],
  countryEntities: [{ wikidataId: "Q17", countryCode: "JP", name: "日本" }],
  destinationEntities: [
    { wikidataId: "Q134093", countryWikidataId: "Q17", countryCode: "JP", name: "德岛" },
    { wikidataId: "Q134127", countryWikidataId: "Q17", countryCode: "JP", name: "高知" },
    { wikidataId: "Q132934", countryWikidataId: "Q17", countryCode: "JP", name: "松山" },
    { wikidataId: "Q132936", countryWikidataId: "Q17", countryCode: "JP", name: "高松" },
  ],
  durationEvidence: { recommendedDays: "12天", source: "extract" },
  seasonEvidence: { bestMonths: ["3-5月", "10-11月"], source: "provider-inference" },
  themesEvidence: ["寺庙巡礼", "文化旅行"],
  coverAsset,
};

const suggestion = {
  title: "四国八十八所巡礼路线",
  summary: "沿日本四国岛巡访寺院，串联德岛、高知、松山与高松，结合朝圣文化、步行体验与地方城镇。",
  recommendationText: "这条路线以真实巡礼网络为骨架，能够完整体验四国寺院文化与沿途聚落。",
  countryIds: ["Q17"],
  destinationIds: ["Q134093", "Q134127", "Q132934", "Q132936"],
  themes: ["寺庙巡礼", "文化旅行"],
  recommendedDays: "12天",
  bestMonths: ["3-5月", "10-11月"],
  highlights: ["巡访四国寺院", "串联四国四县", "体验遍路文化"],
};

const goodRoute = {
  id: facts.routeId,
  name: suggestion.title,
  canonicalTitle: suggestion.title,
  summary: suggestion.summary,
  recommendationText: suggestion.recommendationText,
  countries: ["日本"],
  countryEntities: facts.countryEntities,
  destinations: facts.destinationEntities.map((item) => item.name),
  destinationEntities: facts.destinationEntities,
  recommendedDays: suggestion.recommendedDays,
  durationDays: 12,
  bestMonths: suggestion.bestMonths,
  themes: suggestion.themes,
  tags: suggestion.themes,
  highlights: suggestion.highlights,
  coverAsset,
  source: facts.source,
  enrichmentStatus: "enriched",
};

assert.equal(validateRouteContent(goodRoute).accepted, true);
assert(validateRouteContent({ ...goodRoute, name: "四国八十八所巡礼路线-774", canonicalTitle: "四国八十八所巡礼路线-774" }).reasons.includes("generic-title"));
assert(validateRouteContent({ ...goodRoute, recommendationText: "适合喜欢寺庙文化的旅行者。" }).reasons.includes("template-summary"));
assert(validateRouteContent({ ...goodRoute, summary: "" }).reasons.includes("missing-summary"));
assert(validateRouteContent({ ...goodRoute, recommendationText: "" }).reasons.includes("missing-recommendation"));
assert(validateRouteContent({ ...goodRoute, name: "Shikoku route", summary: "沿线体验 pilgrimage 文化。" }).reasons.includes("untranslated-copy"));
assert(validateRouteContent({ ...goodRoute, countryEntities: [] }).reasons.includes("missing-country-code"));
assert(validateRouteContent({ ...goodRoute, countryEntities: [{ wikidataId: "Q148", countryCode: "CN", name: "中国" }] }).reasons.includes("disabled-country"));
assert(validateRouteContent({
  ...goodRoute,
  destinationEntities: [{ wikidataId: "Q956", countryCode: "CN", name: "北京" }, ...facts.destinationEntities.slice(1)],
  destinations: ["北京", "高知", "松山", "高松"],
}).reasons.includes("disabled-destination-country"));
assert(validateRouteContent({ ...goodRoute, destinationEntities: [], destinations: [] }).reasons.includes("missing-destinations"));
assert(validateRouteContent({ ...goodRoute, destinationEntities: facts.destinationEntities.slice(0, 2), destinations: ["德岛", "高知"] }).reasons.includes("missing-destinations"));
assert(validateRouteContent({ ...goodRoute, recommendedDays: "10" }).reasons.includes("invalid-duration"));
assert(validateRouteContent({ ...goodRoute, bestMonths: ["全年"] }).reasons.includes("default-season"));

assert.equal(classifyRoute([{ countryCode: "NO" }, { countryCode: "IS" }]), "cross");
assert.equal(classifyRoute([{ countryCode: "JP" }, { countryCode: "JP" }]), "single");
assert.equal(classifyRoute([]), "failed");

const provider = createTextEnrichmentProvider({
  name: "test",
  async enrich(input) {
    assert.equal(input.source.name, "Wikivoyage");
    return suggestion;
  },
});
assert.equal((await provider.enrich(facts)).title, suggestion.title);
assert.throws(() => createTextEnrichmentProvider({}), /enrich/);

const enricher = createContentEnricher({ provider });
const enriched = await enricher.enrich(facts);
assert.equal(enriched.accepted, true);
assert.equal(enriched.record.name, suggestion.title);

const hallucinating = createContentEnricher({
  provider: createTextEnrichmentProvider({
    async enrich() {
      return { ...suggestion, countryIds: ["Q142"] };
    },
  }),
});
assert.equal((await hallucinating.enrich(facts)).diagnostics.reasons.includes("unsupported-provider-entity"), true);

const cnFacts = {
  ...facts,
  countryEntities: [{ wikidataId: "Q148", countryCode: "CN", name: "中国" }],
  destinationEntities: [
    { wikidataId: "Q956", countryWikidataId: "Q148", countryCode: "CN", name: "北京" },
    { wikidataId: "Q11746", countryWikidataId: "Q148", countryCode: "CN", name: "西安" },
    { wikidataId: "Q585", countryWikidataId: "Q148", countryCode: "CN", name: "拉萨" },
  ],
};
const cnSuggestion = {
  ...suggestion,
  countryIds: ["Q148"],
  destinationIds: ["Q956", "Q11746", "Q585"],
};
const cnProvider = createContentEnricher({
  provider: createTextEnrichmentProvider({
    async enrich() {
      return cnSuggestion;
    },
  }),
});
assert.equal((await cnProvider.enrich(cnFacts)).diagnostics.reasons.includes("disabled-country"), true);

console.log("Route content quality verified: content gates, CN hard block, enrichment whitelist, and classifier.");
