import { validateRouteContent } from "./content-quality.mjs";

function unique(values) { return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))]; }

function recommendedDays(facts, suggestion) {
  const evidence = facts.durationEvidence || {};
  if (evidence.recommendedDays && evidence.source !== "derived-from-online-entities") return String(evidence.recommendedDays).trim();
  return String(suggestion.recommendedDays || evidence.recommendedDays || "").trim();
}

export function createContentEnricher({ provider } = {}) {
  if (typeof provider?.enrich !== "function") throw new TypeError("Content enricher requires TextEnrichmentProvider.");
  return {
    async enrich(facts, options = {}) {
      const suggestion = await provider.enrich(facts, options);
      const countryIds = new Set(suggestion.countryIds || []);
      const destinationIds = new Set(suggestion.destinationIds || []);
      const countries = (facts.countryEntities || []).filter((item) => countryIds.has(item.wikidataId));
      const destinations = (facts.destinationEntities || []).filter((item) => destinationIds.has(item.wikidataId));
      const unsupported = countryIds.size !== countries.length || destinationIds.size !== destinations.length;
      const record = {
        id: facts.routeId, name: String(suggestion.title || "").trim(), canonicalTitle: String(suggestion.title || "").trim(),
        sourceTitle: facts.sourceTitle, summary: String(suggestion.summary || "").trim(),
        recommendationText: String(suggestion.recommendationText || "").trim(),
        countries: countries.map((item) => item.name), countryEntities: countries,
        destinations: destinations.map((item) => item.name), destinationEntities: destinations,
        recommendedDays: recommendedDays(facts, suggestion),
        durationDays: Number(facts.durationEvidence?.durationDays || 0) || null,
        bestMonths: unique(facts.seasonEvidence?.bestMonths?.length ? facts.seasonEvidence.bestMonths : suggestion.bestMonths),
        themes: unique(suggestion.themes), tags: unique(suggestion.themes), highlights: unique(suggestion.highlights).slice(0, 5),
        coverAsset: facts.coverAsset || null, destinationAssets: [], source: facts.source,
        enrichmentStatus: "enriched", contentEvidence: { sourceUrl: facts.source?.url, provider: provider.name },
      };
      const quality = validateRouteContent(record);
      const reasons = unsupported ? ["unsupported-provider-entity", ...quality.reasons] : quality.reasons;
      return { accepted: !unsupported && quality.accepted, status: !unsupported && quality.accepted ? "enriched" : "deferred", record, diagnostics: { provider: provider.name, reasons } };
    },
  };
}
