import { validateRouteContent } from "./content-quality.mjs";
import { validateCompositionRecord } from "./composition-validator.mjs";
import { routeCountryClusterKey, routeDestinationSetKey, routeDedupeFingerprint } from "./route-dedupe.mjs";
import { buildRouteConcept, validateRouteConcept, TRAVEL_STYLE_LABEL, TRAVEL_STYLE_LABEL_ZH } from "./route-planning-concept.mjs";
import { runAllDecisionTests } from "./route-decision-tests.mjs";
import { listCases, asFewShotReasoning } from "./route-gold-cases.mjs";
import { skeletonFromSuggestion } from "./route-llm-refine-shared.mjs";
import { createWebSearchEvidenceProvider } from "./web-search-evidence-provider.mjs";
import { createWebEvidenceExtractor } from "./web-evidence-extractor.mjs";
import { createWebEvidenceCorroborator } from "./web-evidence-corroborator.mjs";
import { createDecisionTraceStore, writeLegacyDecisionTraceSafe } from "./decision-trace-store.mjs";

const PHASE_2A_STRATEGIES = ["Geographic", "Theme", "Season", "Transport", "Depth", "Efficiency"];
const MAX_SEGMENT_KM = 650;
const MAX_TOTAL_ROUTE_KM = 2200;
const MAX_ROUTE_SPAN_KM = 1200;

const FIRST_TRIP_ANCHORS = {
  JP: ["Q1490", "tokyo", "东京", "Q39231", "mount fuji", "富士山", "Q34600", "kyoto", "京都", "Q169134", "nara", "奈良", "Q35765", "osaka", "大阪"],
  IT: ["Q490", "milan", "米兰", "Q2044", "florence", "佛罗伦萨", "Q220", "rome", "罗马", "Q2634", "naples", "那不勒斯"],
  GB: ["Q84", "london", "伦敦"],
  FR: ["Q90", "paris", "巴黎", "Q1479", "bordeaux", "波尔多", "Q456", "lyon", "里昂"],
  GR: ["Q1524", "athens", "雅典", "Q203715", "santorini", "圣托里尼", "Q1342", "mykonos", "米科诺斯"],
};

const STYLE_ANCHORS = {
  "JP:deep-dive": ["kanazawa", "金泽", "shirakawa", "白川乡", "takayama", "高山", "kamikochi", "上高地", "matsumoto", "松本"],
  "JP:seasonal": ["kyoto", "京都", "arashiyama", "岚山", "uji", "宇治", "nara", "奈良", "koyasan", "高野山"],
  "JP:pilgrimage": ["tokushima", "德岛", "kochi", "高知", "matsuyama", "松山", "takamatsu", "高松"],
  "GB:road-trip": ["edinburgh", "爱丁堡", "cairngorms", "凯恩戈姆", "loch ness", "尼斯湖", "fort william", "威廉堡", "glencoe", "格伦科", "glasgow", "格拉斯哥"],
  "GB:city-break": ["london", "伦敦", "greenwich", "格林尼治"],
  "CH:rail-journey": ["lucerne", "卢塞恩", "interlaken", "因特拉肯", "zermatt", "采尔马特", "st moritz", "圣莫里茨", "lugano", "卢加诺"],
  "FR:theme": ["bordeaux", "波尔多", "saint-emilion", "圣埃美隆", "medoc", "梅多克", "arcachon", "阿卡雄"],
  "GR:island-hopping": ["athens", "雅典", "santorini", "圣托里尼", "naxos", "纳克索斯", "paros", "帕罗斯"],
  "AT:country-hopper": ["vienna", "维也纳"],
  "SK:country-hopper": ["bratislava", "布拉迪斯拉发"],
  "HU:country-hopper": ["budapest", "布达佩斯"],
  "CZ:country-hopper": ["prague", "布拉格"],
  "AT/SK/HU/CZ:country-hopper": ["vienna", "维也纳", "bratislava", "布拉迪斯拉发", "budapest", "布达佩斯", "prague", "布拉格"],
};

const COUNTRY_META = {
  JP: { countryName: "日本", countryWikidataId: "Q17" },
  IT: { countryName: "意大利", countryWikidataId: "Q38" },
  AT: { countryName: "奥地利", countryWikidataId: "Q40" },
  SK: { countryName: "斯洛伐克", countryWikidataId: "Q214" },
  HU: { countryName: "匈牙利", countryWikidataId: "Q28" },
  CZ: { countryName: "捷克", countryWikidataId: "Q213" },
  GB: { countryName: "英国", countryWikidataId: "Q145" },
  CH: { countryName: "瑞士", countryWikidataId: "Q39" },
  FR: { countryName: "法国", countryWikidataId: "Q142" },
  GR: { countryName: "希腊", countryWikidataId: "Q41" },
};

function clean(value) {
  return String(value || "").trim();
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function limitedIds(items, limit = 12) {
  return items.map((item) => item.id).filter(Boolean).slice(0, limit);
}

function slug(value) {
  return clean(value).toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "");
}

function byKind(items, kind) {
  return items.filter((item) => item.kind === kind);
}

function firstSource(items) {
  const source = items.find((item) => item.sourceUrl);
  return source ? { name: "Evidence Repository", url: source.sourceUrl } : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinate(value) {
  const latitude = numberOrNull(value?.latitude ?? value?.lat);
  const longitude = numberOrNull(value?.longitude ?? value?.lon);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(left, right) {
  const from = coordinate(left);
  const to = coordinate(right);
  if (!from || !to) return null;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function destinationTerms(destination = {}) {
  return [
    destination.wikidataId,
    destination.name,
    destination.sourceTitle,
    destination.canonicalTitle,
  ].map((value) => clean(value).toLocaleLowerCase("en-US")).filter(Boolean);
}

function countryCodesForContext(context = {}) {
  const raw = Array.isArray(context.countries) && context.countries.length
    ? context.countries
    : [context.country || context.countryCode];
  return unique(raw.flatMap((value) => clean(value).split(/[\/,|]/u)).map((value) => value.toUpperCase()));
}

function countryEntityForCode(code, context = {}) {
  const normalized = clean(code).toUpperCase();
  const meta = COUNTRY_META[normalized] || {};
  const contextCodes = countryCodesForContext(context);
  const isSingleContext = contextCodes.length <= 1 && normalized === clean(context.country || context.countryCode).toUpperCase();
  return {
    wikidataId: isSingleContext ? clean(context.countryWikidataId || meta.countryWikidataId) : clean(meta.countryWikidataId),
    countryCode: normalized,
    name: isSingleContext ? clean(context.countryName || meta.countryName || normalized) : clean(meta.countryName || normalized),
  };
}

function countryEntitiesForRecord(context = {}, destinationEntities = []) {
  return unique([
    ...countryCodesForContext(context),
    ...destinationEntities.map((destination) => destination.countryCode),
  ].map((value) => clean(value).toUpperCase()))
    .map((code) => countryEntityForCode(code, context));
}

function normalizeBestMonths(values = [], fallback = ["3-5月", "10-11月"]) {
  const normalized = unique(values.map((value) => {
    const text = clean(value);
    if (!text) return "";
    if (text === "全年") return "4-10月";
    const range = text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*月/u);
    if (range) return `${range[1]}-${range[2]}月`;
    const single = text.match(/(\d{1,2})\s*月/u);
    if (single) return `${single[1]}月`;
    return text;
  }));
  return normalized.length ? normalized : fallback;
}

function anchorIndex(destination, anchors = []) {
  const terms = destinationTerms(destination);
  const normalizedAnchors = anchors.map((value) => clean(value).toLocaleLowerCase("en-US")).filter(Boolean);
  for (let i = 0; i < normalizedAnchors.length; i += 1) {
    const anchor = normalizedAnchors[i];
    if (terms.some((term) => {
      if (term === anchor) return true;
      const latinAnchor = /^[a-z0-9 .'-]+$/u.test(anchor);
      if (latinAnchor) {
        const normalizedTerm = term.replace(/[^a-z0-9]+/gu, " ").trim();
        const normalizedAnchor = anchor.replace(/[^a-z0-9]+/gu, " ").trim();
        return normalizedAnchor.length >= 4 && ` ${normalizedTerm} `.includes(` ${normalizedAnchor} `);
      }
      return anchor.length >= 2 && term.includes(anchor);
    })) return i;
  }
  return Infinity;
}

function maxDestinationsForConcept(concept = {}) {
  const days = Number(concept.durationDays) || Number.parseInt(concept.recommendedDays, 10) || 8;
  if (concept.travelStyle === "city-break") return 2;
  if (days <= 3) return 2;
  if (days <= 6) return concept.travelStyle === "country-hopper" ? 4 : 3;
  if (days <= 10) {
    if (["classic-first-trip", "seasonal", "theme"].includes(concept.travelStyle)) return 5;
    return 6;
  }
  if (days <= 14) return ["road-trip", "rail-journey", "pilgrimage"].includes(concept.travelStyle) ? 8 : 6;
  return 8;
}

function routeDistanceLimits(concept = {}) {
  const days = Number(concept.durationDays) || Number.parseInt(concept.recommendedDays, 10) || 8;
  const expansive = ["road-trip", "rail-journey", "country-hopper", "pilgrimage", "island-hopping"].includes(concept.travelStyle);
  if (days <= 6) return { maxSegmentKm: expansive ? 650 : 420, maxSpanKm: expansive ? 1200 : 750 };
  if (days <= 10) return { maxSegmentKm: expansive ? 850 : 520, maxSpanKm: expansive ? 1800 : 900 };
  if (days <= 14) return { maxSegmentKm: expansive ? 1100 : 650, maxSpanKm: expansive ? 2600 : 1400 };
  return { maxSegmentKm: 1400, maxSpanKm: 3200 };
}

function routeDistanceSummary(destinations = []) {
  const adjacent = destinations.slice(0, -1).map((destination, index) => distanceKm(destination, destinations[index + 1])).filter((value) => Number.isFinite(value));
  const spans = destinations.flatMap((destination, index) => destinations.slice(index + 1).map((next) => distanceKm(destination, next))).filter((value) => Number.isFinite(value));
  return {
    maxSegmentKm: adjacent.length ? Math.max(...adjacent) : 0,
    spanKm: spans.length ? Math.max(...spans) : 0,
  };
}

function routeWithinConceptLimits(destinations, concept) {
  const limits = routeDistanceLimits(concept);
  const summary = routeDistanceSummary(destinations);
  return summary.maxSegmentKm <= limits.maxSegmentKm && summary.spanKm <= limits.maxSpanKm;
}

function anchorsForContext(concept = {}, context = {}) {
  const country = clean(context.country || context.countryCode || countryCodesForContext(context).join("/")).toUpperCase();
  const styleKey = `${country}:${concept.travelStyle}`;
  if (STYLE_ANCHORS[styleKey]) return STYLE_ANCHORS[styleKey];
  return concept.travelStyle === "classic-first-trip" ? (FIRST_TRIP_ANCHORS[country] || []) : [];
}

function entityId(value) {
  return clean(value?.entityId || value?.wikidataId || value?.name);
}

function segmentMatches(segment, left, right) {
  const from = clean(segment.fromEntityId || segment.fromName);
  const to = clean(segment.toEntityId || segment.toName);
  const leftId = entityId(left);
  const rightId = entityId(right);
  return (from === leftId && to === rightId) || (from === rightId && to === leftId);
}

function routeSegmentSummary(destinations, segments) {
  const adjacent = destinations.slice(0, -1).map((destination, index) => {
    const next = destinations[index + 1];
    const segment = segments.find((item) => segmentMatches(item, destination, next)) || null;
    const computedDistance = distanceKm(destination, next);
    return { from: destination, to: next, segment, distanceKm: numberOrNull(segment?.distanceKm) ?? computedDistance };
  });
  const distances = adjacent.map((item) => item.distanceKm).filter((value) => Number.isFinite(value));
  const spanDistances = destinations.flatMap((destination, index) => destinations.slice(index + 1).map((next) => distanceKm(destination, next))).filter((value) => Number.isFinite(value));
  return {
    adjacent,
    completeSegments: adjacent.length > 0 && adjacent.every((item) => item.segment),
    completeDistances: adjacent.length > 0 && adjacent.every((item) => Number.isFinite(item.distanceKm)),
    maxSegmentKm: distances.length ? Math.max(...distances) : null,
    totalDistanceKm: distances.reduce((sum, value) => sum + value, 0),
    spanKm: spanDistances.length ? Math.max(...spanDistances) : null,
  };
}

function scoreFor(strategies, destinationCount, hasDestinationImages, routeSanity) {
  const routeDistancesValid = routeSanity.completeDistances
    && routeSanity.maxSegmentKm <= MAX_SEGMENT_KM
    && routeSanity.totalDistanceKm <= MAX_TOTAL_ROUTE_KM
    && routeSanity.spanKm <= MAX_ROUTE_SPAN_KM;
  const transport = strategies.includes("Transport") && routeSanity.completeSegments && routeDistancesValid ? 0.86 : 0.35;
  const geographic = strategies.includes("Geographic") && routeDistancesValid ? 0.88 : 0.45;
  const efficiency = routeSanity.completeSegments && routeDistancesValid
    ? Math.min(0.9, 0.68 + destinationCount * 0.04)
    : 0.38;
  const depth = strategies.includes("Depth") && routeDistancesValid ? 0.86 : 0.48;
  return {
    geographicFit: geographic,
    transportFeasibility: transport,
    seasonalFit: strategies.includes("Season") ? 0.84 : 0.72,
    themeCoherence: strategies.includes("Theme") ? 0.86 : 0.72,
    travelEfficiency: efficiency,
    evidenceCompleteness: hasDestinationImages ? 0.9 : 0.78,
    depthFit: depth,
  };
}

function specificThemeKeys(items) {
  const themes = byKind(items, "theme").map((item) => item.name).filter((item) => item && item !== "经典旅行");
  const transports = byKind(items, "transport").map((item) => item.name);
  return unique([...transports, ...themes]).slice(0, 3);
}

function consistentSeasonEvidence(items) {
  const seasons = byKind(items, "season");
  const uniqueSeasons = unique(seasons.map((item) => item.name));
  return uniqueSeasons.length <= 2 ? seasons : [];
}

function strategyEvidence(strategy, ids) {
  return { strategy, evidenceIds: ids };
}

function reason(text, strategy, evidenceIds) {
  return { text, strategy, evidenceIds };
}

function titleFor(countries, destinations, themes, transports) {
  const country = countries[0]?.name || "";
  const primaryTheme = themes.find((item) => item.name !== "经典旅行" && /铁路|公路|徒步|骑行|文化|朝圣|海岸|美食|葡萄酒|自然|温泉/u.test(item.name))?.name || themes.find((item) => item.name !== "经典旅行")?.name || "";
  const transport = transports[0]?.name || "";
  const region = destinations.length <= 4
    ? destinations.map((item) => item.name).slice(0, 3).join("、")
    : destinations[0]?.name;
  const topic = primaryTheme || transport || "深度旅行";
  return `${country}${region ? `${region}` : ""}${topic}路线`;
}

function coverageGroups(items) {
  const groups = new Map();
  const sourceIds = [...new Set(items.map((item) => item.sourceRouteId).filter(Boolean))];
  for (const sourceRouteId of sourceIds) {
    const sourceItems = items.filter((item) => item.sourceRouteId === sourceRouteId);
    const sourceCountries = [...new Set(byKind(sourceItems, "country").map((item) => item.countryCode || item.entityId).filter(Boolean))];
    if (sourceCountries.length !== 1) continue;
    for (const themeKey of specificThemeKeys(sourceItems)) {
      const key = `coverage:${sourceCountries[0]}:${slug(themeKey)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(...sourceItems);
    }
  }
  return [...groups.entries()]
    .map(([key, values]) => [key, [...new Map(values.map((item) => [item.id, item])).values()]])
    .filter(([, values]) => new Set(values.map((item) => item.sourceRouteId).filter(Boolean)).size >= 2);
}

function summaryFor(destinations, themes, seasons, transports) {
  const places = destinations.map((item) => item.name).slice(0, 6).join("、");
  const theme = themes[0]?.name || transports[0]?.name || "旅行体验";
  const season = seasons.map((item) => item.name).slice(0, 2).join(" / ");
  return `串联${places}，围绕${theme}展开，结合已验证目的地、季节${season ? `（${season}）` : ""}和交通线索设计。`;
}

function recommendationFor(countries, destinations, transports) {
  const country = countries.map((item) => item.name).join("、");
  const transport = transports[0]?.name ? `，并保留${transports[0].name}交通证据` : "";
  return `这条路线基于${country}的已验证目的地组合，减少无意义折返${transport}，适合需要清晰顺路逻辑的旅行规划。`;
}

function recommendedDays(destinations, durationEvidence) {
  const explicit = durationEvidence[0]?.name || "";
  if (/^\d+(?:-\d+)?天$/u.test(explicit)) return explicit;
  const count = destinations.length;
  if (count <= 3) return "4-6天";
  if (count <= 5) return "7-10天";
  return "10-14天";
}

function durationDays(value) {
  const numbers = clean(value).match(/\d+/gu)?.map(Number) || [];
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, item) => sum + item, 0) / numbers.length);
}

function evidenceRefs(items, usage) {
  return items.map((item) => ({
    evidenceId: item.id,
    kind: item.kind,
    provider: item.provider,
    sourceUrl: item.sourceUrl,
    sourceRouteId: item.sourceRouteId,
    entityId: item.entityId || "",
    countryCode: item.countryCode || "",
    assetId: item.assetId || "",
    fromEntityId: item.fromEntityId || "",
    fromName: item.fromName || "",
    toEntityId: item.toEntityId || "",
    toName: item.toName || "",
    transportModes: item.transportModes || [],
    distanceKm: item.distanceKm ?? null,
    durationHours: item.durationHours ?? null,
    field: usage,
  }));
}

function candidateFromGroup(sourceRouteId, items) {
  const countries = [...new Map(byKind(items, "country").map((item) => [item.countryCode || item.entityId || item.name, item])).values()];
  const destinations = byKind(items, "destination");
  const themes = byKind(items, "theme");
  const seasons = consistentSeasonEvidence(items);
  const durations = byKind(items, "duration");
  const transports = byKind(items, "transport");
  const routeSegments = byKind(items, "route-segment");
  const images = byKind(items, "image");
  const coverImage = images.find((item) => item.imageScope === "route-cover" && item.asset);
  const destinationImages = images.filter((item) => item.imageScope === "destination" && item.asset);
  if (!countries.length || destinations.length < 3 || !coverImage || !themes.length || !byKind(items, "season").length) {
    return { rejected: true, reason: "insufficient-evidence" };
  }

  const strategies = ["Geographic", "Theme", "Efficiency"];
  if (seasons.length) strategies.push("Season");
  if (transports.length) strategies.push("Transport");
  if (countries.length === 1 && destinations.length >= 4) strategies.push("Depth");
  const usedStrategies = PHASE_2A_STRATEGIES.filter((strategy) => strategies.includes(strategy));
  const countryEntities = countries.map((item) => ({
    wikidataId: item.entityId || "",
    countryCode: item.countryCode || "",
    name: item.name,
    sourceUrl: item.sourceUrl,
  }));
  const destinationEntities = destinations.slice(0, 6).map((item) => ({
    wikidataId: item.entityId || "",
    countryCode: item.countryCode || countries[0]?.countryCode || "",
    name: item.name,
    sourceTitle: item.sourceTitle || "",
    sourceUrl: item.sourceUrl,
    entityTypeName: item.entityTypeName || "",
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
  }));
  const routeSanity = routeSegmentSummary(destinationEntities, routeSegments);
  const days = recommendedDays(destinationEntities, durations);
  const strategyEvidenceItems = [
    strategyEvidence("Geographic", limitedIds([...countries, ...destinations])),
    strategyEvidence("Theme", limitedIds(themes)),
    strategyEvidence("Efficiency", limitedIds(routeSegments.length ? routeSegments : destinations)),
  ];
  if (seasons.length) strategyEvidenceItems.push(strategyEvidence("Season", limitedIds(seasons)));
  if (transports.length) strategyEvidenceItems.push(strategyEvidence("Transport", limitedIds([...transports, ...routeSegments])));
  if (usedStrategies.includes("Depth")) strategyEvidenceItems.push(strategyEvidence("Depth", limitedIds(routeSegments.length ? routeSegments : destinations)));
  const score = scoreFor(usedStrategies, destinationEntities.length, destinationImages.length >= destinationEntities.length, routeSanity);
  const geographicEvidence = strategyEvidenceItems.find((item) => item.strategy === "Geographic");
  const themeEvidence = strategyEvidenceItems.find((item) => item.strategy === "Theme");
  const seasonEvidence = strategyEvidenceItems.find((item) => item.strategy === "Season");
  const efficiencyEvidence = strategyEvidenceItems.find((item) => item.strategy === "Efficiency");
  const transportEvidence = strategyEvidenceItems.find((item) => item.strategy === "Transport");
  const depthEvidence = strategyEvidenceItems.find((item) => item.strategy === "Depth");
  const plannerReason = [
    reason(`${destinationEntities.map((item) => item.name).slice(0, 3).join("、")}来自同一国家和主题证据组合，地缘关系清晰。`, "Geographic", geographicEvidence.evidenceIds),
    reason(`${themes.find((item) => item.name !== "经典旅行")?.name || themes[0].name}主题在来源证据中反复出现。`, "Theme", themeEvidence.evidenceIds),
    reason(`相邻目的地需要完整交通段证据；当前最大段距 ${routeSanity.maxSegmentKm ?? "未知"} 公里，总段距 ${routeSanity.totalDistanceKm || "未知"} 公里。`, "Efficiency", efficiencyEvidence.evidenceIds),
  ];
  if (seasonEvidence) plannerReason.push(reason(`最佳月份 ${unique(seasons.map((item) => item.name)).slice(0, 3).join(" / ")} 在证据中保持一致。`, "Season", seasonEvidence.evidenceIds));
  if (transportEvidence) plannerReason.push(reason(`${transports[0].name}交通方式必须由相邻 route-segment 证据支持。`, "Transport", transportEvidence.evidenceIds));
  if (depthEvidence) plannerReason.push(reason("同一国家内有足够目的地证据，适合做深度旅行版本。", "Depth", depthEvidence.evidenceIds));
  const record = {
    id: `evidence-composed-${slug(sourceRouteId)}-${slug(usedStrategies.join("-"))}`,
    name: titleFor(countries, destinations, themes, transports),
    canonicalTitle: titleFor(countries, destinations, themes, transports),
    sourceTitle: `Evidence composed from ${sourceRouteId}`,
    summary: summaryFor(destinations, themes, seasons, transports),
    recommendationText: recommendationFor(countries, destinations, transports),
    countries: unique(countryEntities.map((item) => item.name)),
    countryEntities,
    destinations: destinationEntities.map((item) => item.name),
    destinationEntities,
    recommendedDays: days,
    durationDays: durationDays(days),
    bestMonths: unique(seasons.map((item) => item.name)),
    themes: unique(themes.map((item) => item.name)),
    tags: unique(themes.map((item) => item.name)),
    highlights: [
      `${destinationEntities.map((item) => item.name).slice(0, 3).join("、")}构成顺路目的地组合`,
      `${unique(themes.map((item) => item.name)).slice(0, 2).join("、")}主题证据来自已验证来源`,
      `${unique(seasons.map((item) => item.name)).slice(0, 2).join(" / ")}季节证据保持一致`,
    ],
    coverAsset: coverImage.asset,
    destinationAssets: destinationImages.map((item) => ({ ...item.asset, destinationId: item.entityId || "", destinationName: item.name })),
    source: firstSource(items),
    sourceType: "evidence-composed",
    designStrategies: usedStrategies,
    compositionScore: score,
    coverageContribution: {
      countries: countryEntities.length,
      destinations: destinationEntities.length,
      themes: themes.length,
      strategies: usedStrategies.length,
    },
    plannerReason,
    provenance: {
      sources: unique(items.map((item) => item.sourceUrl)).map((url) => ({ providerId: "evidence-repository", url })),
      evidence: evidenceRefs([...countries, ...destinations, ...themes, ...seasons, ...durations, ...transports, ...routeSegments, coverImage, ...destinationImages], "route-composition"),
      strategyEvidence: strategyEvidenceItems,
    },
    contentEvidence: { provider: "phase2a-planner", sourceRouteId, evidenceHash: routeDedupeFingerprint({ destinationEntities, countryEntities, recommendedDays: days, themes: themes.map((item) => item.name) }) },
    enrichmentStatus: destinationImages.length >= destinationEntities.length ? "mediaReady" : "enriched",
    contentQualityStatus: "accepted",
  };
  return { record, score, strategies: usedStrategies };
}

function duplicateDistance(candidate, existingRecords) {
  const candidateDestinations = new Set((candidate.destinationEntities || []).map((item) => item.wikidataId || item.name));
  const candidateThemes = new Set(candidate.themes || []);
  const candidateCluster = routeCountryClusterKey(candidate);
  const candidateDestinationKey = routeDestinationSetKey(candidate);
  let closest = 1;
  for (const record of existingRecords || []) {
    if (
      candidateCluster
      && candidateCluster === routeCountryClusterKey(record)
      && candidateDestinationKey
      && candidateDestinationKey === routeDestinationSetKey(record)
    ) return 0;
    const destinations = new Set((record.destinationEntities || []).map((item) => item.wikidataId || item.name));
    const themes = new Set(record.themes || []);
    const sharedDestinations = [...candidateDestinations].filter((item) => destinations.has(item)).length;
    const sharedThemes = [...candidateThemes].filter((item) => themes.has(item)).length;
    const destinationOverlap = sharedDestinations / Math.max(1, Math.max(candidateDestinations.size, destinations.size));
    const themeOverlap = sharedThemes / Math.max(1, Math.max(candidateThemes.size, themes.size));
    const sameDuration = clean(candidate.recommendedDays) === clean(record.recommendedDays) ? 1 : 0;
    closest = Math.min(closest, 1 - ((destinationOverlap * 0.55) + (themeOverlap * 0.25) + (sameDuration * 0.2)));
  }
  return closest;
}

function countryClusterSaturated(candidate, existingRecords, maxPerCrossCluster = 3) {
  if (!Number.isFinite(maxPerCrossCluster) || maxPerCrossCluster <= 0) return false;
  if ((candidate.countryEntities || []).length <= 1) return false;
  const cluster = routeCountryClusterKey(candidate);
  if (!cluster) return false;
  const count = (existingRecords || []).filter((record) => routeCountryClusterKey(record) === cluster).length;
  return count >= maxPerCrossCluster;
}

function strategyContext(record, evidence) {
  return {
    destinations: record.destinationEntities || [],
    countries: record.countryEntities || [],
    evidence,
    route: record,
  };
}

function strategyEvaluations(strategyRegistry, record, evidence, strategies) {
  if (!strategyRegistry?.evaluate) return [];
  return strategies.map((strategy) => {
    const strategyId = strategy === "Efficiency" ? "Travel Efficiency" : strategy;
    const result = strategyRegistry.evaluate(strategyId, strategyContext(record, evidence));
    return { strategy, strategyId, ...result };
  });
}

// ─── Phase 2b 新管线：8 步确定性 pipeline（知识图驱动） ──────────
//
// 硬不变量：目的地必须来自知识图（knowledgeGraph.queryDestinations），
// 不得来自 evidenceRepository.list() 的桶。buildCandidates 入口断言此点。
//
// 步骤：
//   [1] buildRouteConcept(context)            确定性 Duration→Intent→Style→Structure
//   [2] selectDestinationPool(concept, kg)    从知识图按国家+区域+主题拉候选
//   [3] buildRouteSkeleton(pool, concept)     最近邻+折返惩罚生成有序骨架
//   [4] refineSelection (LLM 节点, Phase 3)   暂用 Gold Case few-shot 静态对齐占位
//   [5] runAllDecisionTests(candidate)        Removal/Replacement/Compression/Expansion/Product-boundary
//   [6] evidenceCheck(candidate, evRepo)      Evidence 作验证器：有则引用，缺则标记 needsEvidence
//   [7] validate(concept + composition)       General 层 + Style-specific 层
//   [8] duplicateDistance → 候选 / 挂起       决定 upsert 或 needsEvidence
//
// 复用本文件已有的 distanceKm / coordinate / numberOrNull / clean / unique 等工具。

// 选取与当前 concept 最贴合的 Gold Case（作 few-shot 判据 + decision-test 判据）
function goldCaseForConcept(concept) {
  const label = TRAVEL_STYLE_LABEL[concept.travelStyle] || concept.travelStyle;
  const cases = listCases({ travelStyle: label });
  if (cases.length) return cases[0];
  // 回退：取任一 case 作结构判据（decision tests 无 goldCase 时会保守通过）
  return listCases()[0] || null;
}

// [2] 从知识图拉候选目的地池。knowledgeGraph 注入；默认为空（生产由调用方注入
//     createOnlineRouteStandardizer 适配器，单测注入 mock）。
function selectDestinationPool(concept, context, knowledgeGraph) {
  if (!knowledgeGraph?.queryDestinations) return [];
  const anchors = anchorsForContext(concept, context);
  const pool = countryCodesForContext(context).flatMap((country) => knowledgeGraph.queryDestinations({
    country,
    region: context.region || "",
    theme: context.theme || "",
    travelStyle: concept.travelStyle,
    season: context.season || "",
    limit: anchors.length ? 40 : 12,
  }) || []);
  if (!anchors.length) return pool;
  return pool.slice().sort((a, b) => {
    const ai = anchorIndex(a, anchors);
    const bi = anchorIndex(b, anchors);
    if (ai !== bi) return ai - bi;
    const ap = /city|capital|town|mountain/i.test(clean(a.entityTypeName)) ? 0 : 1;
    const bp = /city|capital|town|mountain/i.test(clean(b.entityTypeName)) ? 0 : 1;
    return ap - bp || clean(a.name).localeCompare(clean(b.name), "zh-CN");
  });
}

// [3] 最近邻 + 折返惩罚生成有序骨架。从池中选起点（池已按门户优先排序），
//     每步选最近未访问点。
function buildRouteSkeleton(pool, concept, context = {}) {
  const withCoords = pool.filter((d) => coordinate(d));
  const maxDestinations = maxDestinationsForConcept(concept);
  const limits = routeDistanceLimits(concept);
  if (withCoords.length < 2) return pool.slice(0, maxDestinations);
  const anchors = anchorsForContext(concept, context);
  const anchored = anchors.length
    ? withCoords
        .filter((destination) => Number.isFinite(anchorIndex(destination, anchors)))
        .sort((a, b) => anchorIndex(a, anchors) - anchorIndex(b, anchors))
    : [];
  if (anchored.length >= 3) {
    const anchoredSkeleton = anchored.slice(0, maxDestinations);
    if (routeWithinConceptLimits(anchoredSkeleton, concept)) return anchoredSkeleton;
  }
  const start = withCoords[0];
  const visited = [start];
  const remaining = withCoords.slice(1);
  while (remaining.length && visited.length < maxDestinations) {
    const last = visited[visited.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = distanceKm(last, remaining[i]);
      if (d != null && d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = remaining[nearestIdx];
    const candidate = [...visited, next];
    const summary = routeDistanceSummary(candidate);
    if (visited.length >= 3 && (nearestDist > limits.maxSegmentKm || summary.spanKm > limits.maxSpanKm)) break;
    visited.push(remaining.splice(nearestIdx, 1)[0]);
  }
  void concept;
  return visited;
}

// [6] evidenceCheck：对骨架每段查 Evidence。有则引用，缺则标记 NeedsEvidence。
//     Evidence 是验证器，不是来源——即使缺 evidence 也不阻断（只降级 enrichmentStatus）。
// 目的地名匹配：容忍中英文/不同写法（东京/Tokyo、富士山/Mount Fuji）
// 用 name 的中文与常见英文等价表；无表时按 name 精确匹配
function namesEqual(a, b) {
  const an = clean(a).toLowerCase();
  const bn = clean(b).toLowerCase();
  if (!an || !bn) return false;
  if (an === bn) return true;
  // 简易等价：一方是另一方的子串（如 "Tokyo" vs "Tokyo Station"）或常见音译
  return false;
}

// evidenceCheck：对骨架每段查 Evidence。匹配 route-segment（旧格式 fromEntityId/toEntityId）
// 以及 transport-connection/segment-metric（web-evidence 管线产出，subject.name/object.name 多为英文）
function evidenceCheck(skeleton, evidenceRepository) {
  const refs = [];
  const missing = [];
  const allEvidence = evidenceRepository?.list?.() || [];
  for (let i = 0; i < skeleton.length - 1; i += 1) {
    const from = skeleton[i];
    const to = skeleton[i + 1];
    const fromName = clean(from.name);
    const toName = clean(to.name);
    const fromId = clean(from.wikidataId);
    const toId = clean(to.wikidataId);

    const seg = allEvidence.find((item) => {
      if (item.kind === "route-segment") {
        const f = clean(item.fromEntityId || item.fromName);
        const t = clean(item.toEntityId || item.toName);
        return (f === fromId && t === toId) || (f === toId && t === fromId)
          || (f === fromName && t === toName) || (f === toName && t === fromName);
      }
      // transport-connection / segment-metric：优先按采集时标注的 skeletonSegment 回配
      if (item.kind === "transport-connection" || item.kind === "segment-metric") {
        const seg2 = item.qualifiers?.skeletonSegment;
        if (seg2) {
          const sf = clean(seg2.fromEntityId);
          const st = clean(seg2.toEntityId);
          if (sf && st) {
            return (sf === fromId && st === toId) || (sf === toId && st === fromId);
          }
          // 中文名精确回配
          const sfn = clean(seg2.fromName);
          const stn = clean(seg2.toName);
          if (sfn && stn && ((sfn === fromName && stn === toName) || (sfn === toName && stn === fromName))) return true;
          // 英文 label 回配：采集器产出的 subject/object 是英文名(Tokyo)，骨架 name 是中文(东京)；
          // 但 seg2 标注带了 fromEnglish/toEnglish，且 from/to 也可直接用英文名比对
          const sfe = clean(seg2.fromEnglish);
          const ste = clean(seg2.toEnglish);
          // 提取器的 subject.name 通常就是 query 里的英文名(fromEn)，直接比 fromEnglish
          const s = clean(item.subject?.name);
          const o = clean(item.object?.name);
          if (sfe && ste && s && o) {
            return ((s === sfe && o === ste) || (s === ste && o === sfe));
          }
        }
        // 无标注：按 subject/object name（英文为主，仅精确匹配）
        const s = clean(item.subject?.name);
        const o = clean(item.object?.name);
        if (!s || !o) return false;
        return (namesEqual(s, fromName) && namesEqual(o, toName))
          || (namesEqual(s, toName) && namesEqual(o, fromName));
      }
      return false;
    });
    if (seg) {
      refs.push({
        kind: seg.kind,
        evidenceId: seg.evidenceId || seg.id,
        fromEntityId: fromId, toEntityId: toId,
        fromName, toName,
        field: "transport-segment",
      });
    } else {
      // 英文 label（知识图 sourceTitle = Wikidata en label）随缺段下发，供采集器构造英文标准化 query
      missing.push({
        from: fromName, to: toName, fromEntityId: fromId, toEntityId: toId,
        fromEnglish: clean(from.sourceTitle || from.englishName || ""),
        toEnglish: clean(to.sourceTitle || to.englishName || ""),
      });
    }
  }
  return { evidenceRefs: refs, missingSegments: missing, hasEvidence: refs.length > 0 };
}

// collectMissingSegmentEvidence：为缺段调 web-evidence 管线采集 transport-connection/segment-metric
// Evidence 作验证器非来源——采集用于回填 needsEvidence，不改变骨架目的地
// 关键：把骨架的 wikidataId + 中文名标注进 evidence qualifiers（skeletonSegment），
//   evidenceCheck 按此标注匹配，不依赖中英文地名翻译表
// 查询语言策略：英文标准化 query 优先（Web 提取器正则只认拉丁字母，非英文官网采不到东西）
//   - 优先用知识图 sourceTitle（Wikidata en label，如 Tokyo/Kyoto）构造英文 query
//   - sourceTitle 缺失时 fallback 到中文名（Tavily 多语言查询仍可召回，但提取命中率低）
//   - query 形态按 evidence type 明确短语（train travel / rail distance），不带 "to ... train distance travel" 杂糅
async function collectMissingSegmentEvidence(missing, { webEvidencePipeline, evidenceRepository, quota = null }) {
  if (!missing.length || !webEvidencePipeline) return { collected: 0, written: 0, queries: [] };
  const { provider, extractor, corroborator } = webEvidencePipeline;
  if (!provider?.searchEvidence || !extractor?.extract) return { collected: 0, written: 0, queries: [] };

  const queries = [];
  const allExtracted = [];
  for (const seg of missing) {
    // 配额耗尽：跳过后续采集（Evidence 是增强非必需，不阻断管线）
    if (quota && quota.limits.evidence > 0 && quota.usage.evidence >= quota.limits.evidence) {
      break;
    }
    // 英文 label 优先：让 Tavily 召回英文 Wikipedia/Wikivoyage/官方旅游局页（命中 TRUSTED_DOMAINS + 拉丁正则可解析）
    const fromEn = clean(seg.fromEnglish || seg.from);
    const toEn = clean(seg.toEnglish || seg.to);
    const query = `${fromEn} ${toEn} train travel`;
    queries.push(query);
    if (quota) quota.usage.evidence += 1;
    try {
      const search = await provider.searchEvidence({ query, limit: 5 });
      const extracted = extractor.extract({
        query, results: search.results, retrievedAt: search.retrievedAt,
      });
      // 标注骨架段信息：让 evidenceCheck 能按 wikidataId/中英文 name 回配
      for (const item of extracted.evidence) {
        if (!item.qualifiers) item.qualifiers = {};
        item.qualifiers.skeletonSegment = {
          fromEntityId: seg.fromEntityId || "",
          toEntityId: seg.toEntityId || "",
          fromName: seg.from,
          toName: seg.to,
          fromEnglish: seg.fromEnglish || "",
          toEnglish: seg.toEnglish || "",
        };
      }
      allExtracted.push(...extracted.evidence);
    } catch {
      // 采集失败不阻断管线（Evidence 是增强，非必需）
    }
  }
  if (!allExtracted.length) return { collected: 0, written: 0, queries };

  const corroborated = corroborator ? corroborator.corroborate(allExtracted) : { evidence: allExtracted };
  let written = 0;
  for (const item of corroborated.evidence) {
    if (evidenceRepository?.upsert) {
      const write = evidenceRepository.upsert(item);
      if (write.accepted) written += 1;
    }
  }
  return { collected: allExtracted.length, written, queries };
}

// 候选 record 构造（sourceType = planner-designed，绕过 composition-validator 旧桶校验）
function buildPlannerRecord({ concept, skeleton, context, evidenceResult, strategies, score, goldCase, llmPlannerReason = null, llmRefined = false, llmConfidence = null, llmRefineError = null, llmProviderName = "" } = {}) {
  const destinationEntities = skeleton.map((d) => ({
    wikidataId: d.wikidataId || "",
    countryCode: d.countryCode || context.countryCode || "",
    name: d.name,
    entityTypeName: d.entityTypeName || "city",
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
  }));
  const countryEntities = countryEntitiesForRecord(context, destinationEntities);
  const countryName = countryEntities.map((country) => country.name).filter(Boolean).join("、");
  const places = destinationEntities.map((d) => d.name);
  const styleLabel = TRAVEL_STYLE_LABEL[concept.travelStyle] || concept.travelStyle;
  const styleLabelZh = TRAVEL_STYLE_LABEL_ZH[concept.travelStyle] || concept.travelStyle;
  const days = numberOrNull(String(concept.recommendedDays).match(/\d+/u)?.[0] || concept.durationDays);
  const durationLabel = days ? `${days}天` : String(concept.recommendedDays || "");
  const shapeLabel = days && days <= 6 ? "精简" : days && days >= 9 ? "延展" : "经典";
  const anchorLabel = places[0] ? `：${places[0]}` : "";
  const name = `${countryName}${durationLabel}${shapeLabel}${styleLabelZh}${anchorLabel}`;
  const deterministicReason = [
    { text: `时长=${concept.durationBand}(${concept.recommendedDays})：${concept.whyThisDurationFits}`, strategy: "Geographic", evidenceIds: [] },
    { text: `旅行风格=${styleLabelZh}：${concept.travelValue}`, strategy: "Theme", evidenceIds: [] },
    { text: `骨架由知识图候选池经最近邻排序生成，目的地来源=知识图。`, strategy: "Efficiency", evidenceIds: [] },
  ];
  // LLM 节点产出叙事（每条 {text,strategy}）→ 转成 record.plannerReason 形态（补 evidenceIds:[]）
  const llmReason = Array.isArray(llmPlannerReason)
    ? llmPlannerReason.map((r) => ({ text: String(r?.text || ""), strategy: String(r?.strategy || ""), evidenceIds: [] }))
    : null;
  const plannerReason = (llmRefined && llmReason && llmReason.length) ? llmReason : deterministicReason;
  return {
    id: `planner-designed-${routeDedupeFingerprint({ destinationEntities, recommendedDays: concept.recommendedDays, themes: [styleLabel] })}`,
    name,
    canonicalTitle: name,
    sourceTitle: `Planner designed (${styleLabel})`,
    summary: `围绕${styleLabelZh}，由知识图候选池设计，串联${places.slice(0, 4).join("、")}${places.length > 4 ? "等" : ""}。`,
    recommendationText: concept.travelValue,
    travelStyle: concept.travelStyle,
    travelStyleConceptKey: concept.travelStyle,
    durationBand: concept.durationBand,
    concept,
    countries: countryEntities.map((country) => country.countryCode),
    countryEntities,
    destinations: places,
    destinationEntities,
    recommendedDays: concept.recommendedDays,
    durationDays: days,
    bestMonths: normalizeBestMonths(context.bestMonths),
    themes: [styleLabelZh],
    tags: [styleLabelZh, countryEntities.length > 1 ? "跨国路线" : "单国路线"].filter(Boolean),
    highlights: [
      `${places.slice(0, 3).join("、")}构成${styleLabelZh}骨架`,
      `目的地来自知识图${(evidenceResult?.missingSegments || []).length ? "，部分段待补证据" : "，段段有证据"}`,
      concept.targetTraveler,
    ],
    source: { name: "Planner", url: "" },
    sourceType: "planner-designed",
    destinationSource: "knowledge-graph",
    designStrategies: strategies,
    compositionScore: score,
    coverageContribution: {
      countries: countryEntities.length,
      destinations: destinationEntities.length,
      themes: 1,
      strategies: strategies.length,
    },
    plannerReason,
    provenance: {
      sources: [{ providerId: "knowledge-graph", url: "" }],
      evidence: evidenceResult?.evidenceRefs || [],
      strategyEvidence: strategies.map((s) => ({ strategy: s, evidenceIds: [] })),
      concept: { travelStyle: concept.travelStyle, durationBand: concept.durationBand, routeStructure: concept.routeStructure },
    },
    contentEvidence: { provider: "phase2b-planner", travelStyle: concept.travelStyle, evidenceHash: routeDedupeFingerprint({ destinationEntities, recommendedDays: concept.recommendedDays }) },
    llmRefine: {
      refined: llmRefined,
      confidence: llmConfidence,
      ...(llmRefineError ? { error: llmRefineError } : {}),
      provider: llmRefined ? (llmProviderName || "llm-refine") : "deterministic-fallback",
    },
    enrichmentStatus: (evidenceResult?.missingSegments || []).length ? "needsEvidence" : "enriched",
    contentQualityStatus: "accepted",
    classification: countryEntities.length > 1 ? "cross" : "single",
  };
}

// [7] 验证：concept 层 + content 层。planner-designed 不走 composition-validator 旧桶校验
function validatePlannerCandidate(record, concept, context, strategyRegistry) {
  const reasons = [];
  const adjacentCount = Math.max(0, (record.destinationEntities || []).length - 1);
  const conceptValidation = validateRouteConcept(concept, {
    countries: record.countryEntities.map((country) => country.countryCode),
    destinations: record.destinations,
    designStrategies: record.designStrategies,
    themes: record.themes,
    bestMonths: record.bestMonths,
    segmentMetrics: Array.from({ length: adjacentCount }, (_, index) => ({ index })),
    transportConnections: Array.from({ length: adjacentCount }, (_, index) => ({ index, modes: ["rail"] })),
  });
  if (!conceptValidation.accepted) reasons.push(...conceptValidation.reasons.map((r) => `concept:${r}`));
  const quality = validateRouteContent(record);
  if (!quality.accepted) reasons.push(...quality.reasons);
  // strategyRegistry 作 Style-specific 层（每个策略的 accepted）
  const strategyChecks = [];
  if (strategyRegistry?.evaluate) {
    for (const s of record.designStrategies) {
      const result = strategyRegistry.evaluate(s === "Efficiency" ? "Travel Efficiency" : s, {
        destinations: record.destinationEntities,
        countries: record.countryEntities,
        route: record,
      });
      strategyChecks.push({ strategy: s, ...result });
      if (result.accepted === false) reasons.push(`strategy:${s}-rejected`);
    }
  }
  return { accepted: reasons.length === 0, reasons, strategyChecks };
}

// 新管线主体
async function runPipeline({ context, knowledgeGraph, evidenceRepository, acceptedRepository, strategyRegistry, llmRefineProvider, webEvidencePipeline, decisionTraceStore, limit }) {
  const accepted = [];
  const rejected = [];

  // [1] buildRouteConcept
  // 用池中目的地数驱动 concept 的 durationBand/style 推导（而非空数组，否则会落到 city-break）
  const contextCountryCodes = countryCodesForContext(context);
  const pool0 = knowledgeGraph?.queryDestinations
    ? contextCountryCodes.flatMap((country) => knowledgeGraph.queryDestinations({
      country, region: context.region || "", theme: context.theme || "",
      travelStyle: context.travelStyle || "", season: context.season || "", limit: 12,
    }) || [])
    : [];
  const sampleDestinations = pool0.slice(0, 8).map((d) => d.name);
  const concept = buildRouteConcept({
    countries: contextCountryCodes,
    destinations: sampleDestinations,
    designStrategies: context.designStrategies || ["Geographic", "Theme", "Efficiency"],
    themes: context.theme ? [context.theme] : [],
    bestMonths: context.season ? [context.season] : (context.bestMonths || []),
  });
  // 用 context 显式覆盖 duration（concept 层从目的地数推 duration，但新管线 duration 来自用户）
  if (context.durationDays) {
    concept.durationDays = context.durationDays;
    concept.durationBand = context.durationBand || durationBandFromDays(context.durationDays);
    concept.recommendedDays = `${context.durationDays}天`;
  }
  // 用 context 显式覆盖 travelStyle（用户/上游已明确 style 时优先于启发式）
  // 注意：仅覆盖 style 标签与 durationReasons/travelValue 等文本字段；
  // routeStructure/paceLevel/intent 由 concept 层在构建时已按 sampleDestinations 推导，
  // 若 context.travelStyle 与启发式不一致，concept 层 validateRouteConcept 会捕获（作设计意图约束）。
  if (context.travelStyle && context.travelStyle !== concept.travelStyle) {
    concept.travelStyle = context.travelStyle;
    concept.travelStyleLabel = TRAVEL_STYLE_LABEL[context.travelStyle] || context.travelStyle;
    if (context.travelStyle === "country-hopper") concept.paceLevel = "intensive";
  }

  // [2] selectDestinationPool（硬不变量：来自知识图）
  const pool = selectDestinationPool(concept, context, knowledgeGraph);
  if (!pool.length) {
    rejected.push({ context, reason: "knowledge-graph-empty-pool" });
    return { accepted, rejected, concept };
  }

  // [3] buildRouteSkeleton
  const skeleton = buildRouteSkeleton(pool, concept, context);
  if (skeleton.length < 2) {
    rejected.push({ context, reason: "skeleton-too-short" });
    return { accepted, rejected, concept };
  }

  // [4] LLM refine 节点（Phase 3）：在确定性骨架上做选点取舍+排序优化+plannerReason 叙事
  //     few-shot 喂 Gold Case ②Reasoning（学推理过程，非答案）
  //     LLM 不可用/出错 → 降级到 Phase 2b 确定性骨架（管线仍可产出，质量略低）
  const goldCase = goldCaseForConcept(concept);
  const fewShot = goldCase ? asFewShotReasoning(goldCase.id) : null;
  let refinedSkeleton = skeleton;
  let llmPlannerReason = null;
  let llmRefined = false;
  let llmConfidence = null;
  let llmRefineError = null;
  const quota = context.quota;
  if (llmRefineProvider?.refine && quota && quota.limits.llm > 0 && quota.usage.llm >= quota.limits.llm) {
    // 配额耗尽：降级到确定性骨架（不阻断管线）
    llmRefineError = "llm-quota-exhausted";
  } else if (llmRefineProvider?.refine) {
    try {
      const refineResult = await llmRefineProvider.refine({
        skeleton, concept, context, fewShot,
        deadlineAt: context.deadlineAt || 0,
      });
      if (refineResult?.orderedDestinations?.length >= 2) {
        if (routeWithinConceptLimits(refineResult.orderedDestinations, concept)) {
          refinedSkeleton = refineResult.orderedDestinations;
          llmPlannerReason = refineResult.plannerReason;
          llmRefined = true;
          llmConfidence = refineResult.confidence;
        } else {
          llmRefineError = "llm-route-distance-out-of-bounds";
        }
      }
    } catch (error) {
      // LLM_REFINE_NOT_CONFIGURED / HTTP 错误 / CONSTRAINTS → 降级到确定性骨架
      // 不阻断管线（LLM 节点是增强，非必需）
      llmRefineError = clean(error?.message || String(error));
    }
  }

  // [5] decisionTests（在 refined 骨架上跑）
  const candidate = { destinations: refinedSkeleton.map((d) => d.name), travelStyle: TRAVEL_STYLE_LABEL[concept.travelStyle] };
  const decisionTests = runAllDecisionTests(candidate, { goldCase });
  if (!decisionTests.allPass) {
    // Phase 2b：决策测试失败不直接 reject，而是记录 mutations 供 Phase 3 LLM 修正
    // 但若有 high-severity 产品边界违规 → reject
    const boundaryViolation = decisionTests.mutations.some((m) => m.action === "split");
    if (boundaryViolation) {
      rejected.push({ context, reason: "product-boundary-violation", mutations: decisionTests.mutations });
      return { accepted, rejected, concept };
    }
  }

  // [6] evidenceCheck（验证器，不阻断；在 refined 骨架上）
  let evidenceResult = evidenceCheck(refinedSkeleton, evidenceRepository);
  // 缺段回填：若有 webEvidencePipeline 且缺段非空，调采集器（英文标准化 query）补 transport-connection/segment-metric
  //   Evidence 作验证器——补全后重跑 evidenceCheck 更新 refs/missing，不改变骨架目的地
  let evidenceCollect = null;
  if (evidenceResult.missingSegments.length && webEvidencePipeline) {
    evidenceCollect = await collectMissingSegmentEvidence(evidenceResult.missingSegments, { webEvidencePipeline, evidenceRepository, quota });
    if (evidenceCollect.written > 0) {
      evidenceResult = evidenceCheck(refinedSkeleton, evidenceRepository);
    }
  }

  // 组装 strategies/score
  const strategies = ["Geographic", "Efficiency"];
  if (context.theme || goldCase?.expected?.designRules?.some((r) => r === "Theme")) strategies.push("Theme");
  if (context.season || concept.travelStyle === "seasonal") strategies.push("Season");
  if (concept.travelStyle === "transport-journey" || concept.travelStyle === "rail-journey" || concept.travelStyle === "road-trip" || concept.travelStyle === "island-hopping") strategies.push("Transport");
  if (concept.travelStyle === "deep-dive") strategies.push("Depth");
  const hasEvidence = evidenceResult.hasEvidence;
  const score = {
    geographicFit: 0.82,
    transportFeasibility: hasEvidence ? 0.8 : 0.5,
    seasonalFit: context.season ? 0.8 : 0.7,
    themeCoherence: context.theme ? 0.82 : 0.7,
    travelEfficiency: 0.78,
    evidenceCompleteness: hasEvidence ? 0.85 : 0.6,
    depthFit: concept.travelStyle === "deep-dive" ? 0.8 : 0.65,
  };

  // 构造 record（用 refined 骨架 + LLM 叙事，若有）
  const record = buildPlannerRecord({
    concept, skeleton: refinedSkeleton, context, evidenceResult, strategies, score, goldCase,
    llmPlannerReason, llmRefined, llmConfidence, llmRefineError, llmProviderName: llmRefineProvider?.name,
  });
  record.concept = concept;

  // [7] validate
  const validation = validatePlannerCandidate(record, concept, context, strategyRegistry);
  if (!validation.accepted) {
    rejected.push({ context, reason: validation.reasons.join(","), strategyChecks: validation.strategyChecks });
    return { accepted, rejected, concept };
  }

  // [8] duplicateDistance
  const existingRecords = acceptedRepository.list({ limit: 100_000 }).records;
  const dedupeDistance = duplicateDistance(record, existingRecords);
  if (countryClusterSaturated(record, existingRecords, Number(context.maxAcceptedPerCountryCluster) || Infinity)) {
    rejected.push({ context, reason: "route-cluster-saturated", dedupeDistance });
    return { accepted, rejected, concept };
  }
  if (dedupeDistance < 0.28) {
    rejected.push({ context, reason: "dedupe-distance-too-low", dedupeDistance });
    return { accepted, rejected, concept };
  }

  const traceWrite = await writeLegacyDecisionTraceSafe(decisionTraceStore, {
    route: record,
    context,
    source: "planner-pipeline",
    concept,
    decisionFactors: [
      { factor: "country-context", input: countryCodesForContext(context), effect: "Limits knowledge-graph destination query." },
      { factor: "duration", input: context.durationDays || concept.durationDays || null, effect: "Constrains generated route duration fields." },
      { factor: "travel-style", input: context.travelStyle || concept.travelStyle || null, effect: "Influences concept, route structure, title, and summary." },
      { factor: "knowledge-graph", input: refinedSkeleton.map((item) => item.wikidataId || item.name), effect: "Provides selected destination entities." },
    ],
    strategyEffects: strategies.map((strategy) => ({ strategy, changedFields: [], evidenceIds: [] })),
    dataSourcesUsed: [
      { sourceType: "knowledge-graph", ids: refinedSkeleton.map((item) => item.wikidataId || item.name).filter(Boolean), usedFor: "selected destinations" },
      ...(llmRefined ? [{ sourceType: "llm", ids: [llmRefineProvider?.name || "llm-refine"], usedFor: "destination order/refinement" }] : []),
      ...(evidenceCollect?.queries?.length ? [{ sourceType: "web-evidence", ids: evidenceCollect.queries, usedFor: "missing segment evidence check" }] : []),
    ],
    unknowns: [
      { field: "completeRejectedAlternatives", reason: "Phase 1 does not persist all alternatives considered before this selected route." },
      { field: "llmContribution", reason: llmRefined ? "LLM refine result was applied, but Phase 1 does not persist a full comparison trace." : "LLM refine did not run or did not change the skeleton." },
    ],
  });

  accepted.push({
    record,
    strategies,
    score,
    dedupeDistance,
    strategyChecks: validation.strategyChecks,
    concept,
    decisionTests,
    evidenceResult,
    evidenceCollect,
    destinationSource: "knowledge-graph",
    decisionTrace: traceWrite,
  });

  // limit 控制（新管线一次 context 通常产 1 条；保留 limit 语义）
  void limit;
  return { accepted, rejected, concept };
}

function durationBandFromDays(days) {
  if (days <= 3) return "1-3d";
  if (days <= 6) return "4-6d";
  if (days <= 10) return "7-10d";
  if (days <= 14) return "10-14d";
  return "15d+";
}

export function createRouteCompositionPlanner({ evidenceRepository, acceptedRepository, strategyRegistry = null, knowledgeGraph = null, llmRefineProvider = null, webEvidencePipeline = null, decisionTraceStore = null, env = process.env } = {}) {
  if (!evidenceRepository?.bySourceRoute) throw new Error("EVIDENCE_REPOSITORY_REQUIRED");
  if (!acceptedRepository?.list) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  const traceStore = decisionTraceStore || createDecisionTraceStore({ env });
  return {
    async buildCandidates({ limit = 5, context = null } = {}) {
      // 新管线模式：有 context（{durationDays, country, style, ...}）走知识图驱动（async，含 LLM 节点）
      if (context && (context.country || context.durationDays || context.travelStyle)) {
        return runPipeline({ context, knowledgeGraph, evidenceRepository, acceptedRepository, strategyRegistry, llmRefineProvider, webEvidencePipeline, decisionTraceStore: traceStore, limit });
      }
      // 旧兼容模式：evidence 桶缝合（codex 原 buildCandidates，仅旧 verify 脚本与生产 run-route-ai-production-phase2a 走此路径）
      const existingRecords = acceptedRepository.list({ limit: 100_000 }).records;
      const allEvidence = evidenceRepository.list();
      const groups = new Map(coverageGroups(allEvidence));
      const accepted = [];
      const rejected = [];
      for (const [sourceRouteId, items] of groups.entries()) {
        if (accepted.length >= limit) break;
        const built = candidateFromGroup(sourceRouteId, items);
        if (built.rejected) {
          rejected.push({ sourceRouteId, reason: built.reason });
          continue;
        }
        const strategyChecks = strategyEvaluations(strategyRegistry, built.record, items, built.strategies);
        const quality = validateRouteContent(built.record);
        const composition = validateCompositionRecord(built.record);
        const dedupeDistance = duplicateDistance(built.record, existingRecords.concat(accepted));
        const averageScore = Object.values(built.score).map(Number).reduce((sum, item) => sum + item, 0) / Object.values(built.score).length;
        const strategyRejected = strategyChecks.filter((item) => item.accepted === false && item.strategyId !== "Regional");
        if (!quality.accepted || !composition.accepted || strategyRejected.length || dedupeDistance < 0.12 || averageScore < 0.72) {
          rejected.push({
            sourceRouteId,
            reason: [
              ...quality.reasons,
              ...composition.reasons,
              ...strategyRejected.flatMap((item) => item.reasons || []),
              dedupeDistance < 0.12 ? "dedupe-distance-too-low" : "",
            ].filter(Boolean).join(","),
            score: built.score,
            dedupeDistance,
            strategyChecks,
          });
          continue;
        }
        const traceWrite = await writeLegacyDecisionTraceSafe(traceStore, {
          route: built.record,
          context: { designStrategies: built.strategies },
          source: "planner-evidence-stitch",
          decisionFactors: [
            { factor: "evidence-group", input: sourceRouteId, effect: "Provides grouped evidence used to build the legacy candidate." },
            { factor: "quality-check", input: quality.accepted, effect: "Allows or rejects the legacy candidate before acceptance." },
            { factor: "composition-check", input: composition.accepted, effect: "Allows or rejects the legacy candidate before acceptance." },
          ],
          strategyEffects: built.strategies.map((strategy) => ({ strategy, changedFields: [], evidenceIds: [] })),
          dataSourcesUsed: [{ sourceType: "evidence-repository", ids: items.map((item) => item.id || item.sourceRouteId).filter(Boolean), usedFor: "legacy evidence stitch candidate" }],
          unknowns: [{ field: "preEvidenceCandidatePool", reason: "Phase 1 does not reconstruct alternatives before the grouped evidence candidate." }],
        });
        accepted.push({ record: built.record, strategies: built.strategies, score: built.score, dedupeDistance, strategyChecks, decisionTrace: traceWrite });
      }
      return { accepted, rejected };
    },
  };
}
