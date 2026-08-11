import { routeDedupeFingerprint } from "./route-dedupe.mjs";
import { ensureSearchGeneratedMedia } from "./search-generated-media.mjs";
import { SEARCH_KNOWLEDGE_GRAPH_FALLBACKS } from "./search-knowledge-graph-fallbacks.mjs";
import { minimumRouteDestinationCount } from "./route-cardinality-policy.mjs";

function clean(value) {
  return String(value || "").trim();
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function styleLabel(intent = {}) {
  return clean(intent.theme || intent.travelStyleLabel || intent.transportLabel || intent.season || "主题旅行");
}

function destinationsForIntent(intent = {}) {
  const pool = SEARCH_KNOWLEDGE_GRAPH_FALLBACKS[intent.countryCode] || [];
  const cityNeedles = unique([...(intent.cities || []), ...(intent.normalizedCities || []), intent.region, intent.normalizedRegion])
    .map((item) => item.toLocaleLowerCase("zh-CN"));
  const matched = cityNeedles.length
    ? pool.filter((item) => cityNeedles.some((needle) => clean(item.name).toLocaleLowerCase("zh-CN").includes(needle) || clean(item.sourceTitle).toLocaleLowerCase("zh-CN").includes(needle)))
    : [];
  const requiredIds = unique(intent.requiredDestinationIds);
  const ordered = requiredIds.length
    ? requiredIds
    : unique([...matched, ...pool].map((item) => item.wikidataId));
  return ordered
    .map((id) => pool.find((item) => item.wikidataId === id))
    .filter(Boolean)
    .slice(0, Math.max(3, Math.min(6, Number(intent.durationDays || 8) - 2)));
}

export function buildSearchGeneratedFallbackRoute(intent = {}) {
  if (!intent.countryCode || intent.isChinaBlocked) return null;
  const destinations = destinationsForIntent(intent);
  if (destinations.length < minimumRouteDestinationCount(intent)) return null;
  const label = styleLabel(intent);
  const days = Number(intent.durationDays || 8);
  const destinationEntities = destinations.map((item) => ({
    wikidataId: item.wikidataId,
    countryCode: item.countryCode || intent.countryCode,
    name: item.name,
    sourceTitle: item.sourceTitle,
    entityTypeName: item.entityTypeName || "search-fallback-anchor",
  }));
  const countryName = clean(intent.country) || intent.countryCode;
  const places = destinationEntities.map((item) => item.name);
  const baseRecord = {
    id: `search-generated-${intent.intentHash}`,
    name: `${countryName}${days}天${label}路线`,
    canonicalTitle: `${countryName}${days}天${label}路线`,
    sourceTitle: "",
    summary: `根据当前搜索意图生成，串联${places.slice(0, 4).join("、")}等目的地。`,
    recommendationText: `这条路线匹配${countryName}${intent.durationDays ? `、${days}天` : ""}${label ? `、${label}` : ""}等约束，仍需要后续证据审核。`,
    countryEntities: [{ wikidataId: "", countryCode: intent.countryCode, name: countryName }],
    destinationEntities,
    countries: [countryName],
    destinations: places,
    recommendedDays: `${days}天`,
    durationDays: days,
    bestMonths: intent.season ? [intent.season] : ["春秋季"],
    themes: unique([intent.theme, label]),
    tags: unique([label, intent.transportLabel, "Search 生成候选"]),
    highlights: [
      `${places.slice(0, 3).join("、")}构成主要路线骨架`,
      "当前结果来自 Search 实时生成，后续需要补充证据与审核",
      intent.transportLabel ? `${intent.transportLabel}作为主要移动方式` : "按旅行意图控制节奏和距离",
    ],
    source: { name: "Search Planner", url: "https://travel-collection.local/search-generated" },
    sourceType: "planner-designed",
    destinationSource: "search-knowledge-graph-fallback",
    designStrategies: unique(["Geographic", intent.season ? "Season" : "", intent.transport ? "Transport" : "", "Efficiency"]),
    compositionScore: {
      geographicFit: 0.72,
      transportFeasibility: intent.transport ? 0.62 : 0.5,
      seasonalFit: intent.season ? 0.62 : 0.5,
      themeCoherence: intent.theme ? 0.68 : 0.55,
      travelEfficiency: 0.64,
      evidenceCompleteness: 0.35,
    },
    qualityScore: 0.68,
    plannerReason: [
      { text: `${countryName}约束明确，目的地均来自搜索知识图候选池。`, strategy: "Geographic", evidenceIds: [] },
      { text: `${days}天适合保留核心目的地并减少过度绕行。`, strategy: "Efficiency", evidenceIds: [] },
      { text: "当前候选仍需要补充交通、季节和媒体证据。", strategy: "Evidence", evidenceIds: [] },
    ],
    provenance: {
      sources: [{ providerId: "search-knowledge-graph-fallback", url: "" }],
      evidence: [],
      searchIntentHash: intent.intentHash,
    },
    contentEvidence: {
      provider: "search-v1-fallback",
      evidenceHash: routeDedupeFingerprint({ destinationEntities, recommendedDays: `${days}天`, themes: [label] }),
    },
    enrichmentStatus: "needsEvidence",
    contentQualityStatus: "accepted",
    classification: "single",
    searchStatus: "needs-review",
  };
  return ensureSearchGeneratedMedia(baseRecord);
}
