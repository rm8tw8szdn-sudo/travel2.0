import { validateRouteContent } from "./content-quality.mjs";
import { validateCompositionRecord } from "./composition-validator.mjs";
import { routeCountryClusterKey, routeDestinationSetKey, routeDedupeFingerprint } from "./route-dedupe.mjs";
import { buildRouteConcept, validateRouteConcept, TRAVEL_STYLE_LABEL, TRAVEL_STYLE_LABEL_ZH } from "./route-planning-concept.mjs";
import { runAllDecisionTests } from "./route-decision-tests.mjs";
import { listCases, asFewShotReasoning } from "./route-gold-cases.mjs";
import { skeletonFromSuggestion } from "./route-llm-refine-shared.mjs";
import {
  finalizeRouteResult,
  validateEmbeddedRouteIntent,
} from "./route-intent-invariant-gate.mjs";
import { compareRouteIntentShadow } from "./route-intent-shadow-validation.mjs";
import { createWebSearchEvidenceProvider } from "./web-search-evidence-provider.mjs";
import { createWebEvidenceExtractor } from "./web-evidence-extractor.mjs";
import { createWebEvidenceCorroborator } from "./web-evidence-corroborator.mjs";
import { createDecisionTraceStore, writeFailureDecisionTraceSafe, writeLegacyDecisionTraceSafe } from "./decision-trace-store.mjs";
import { isRouteV2IntentEnabled, routeIntentSnapshot } from "./decision-trace-schema.mjs";
import { buildRouteCandidatesFromPool } from "./route-candidate-builder.mjs";
import { createRouteCandidatePoolStore, validateRouteCandidate } from "./route-candidate-pool.mjs";
import {
  ROUTE_CANDIDATE_SELECTION_TARGET,
  selectRouteCandidates,
  selectRouteCandidatesWithEvidence,
} from "./route-candidate-selection.mjs";
import {
  isRouteV2EvidenceValidationEnabled,
  maxDestinationsForDuration,
  validateRouteForUse,
} from "./route-candidate-evidence-validation.mjs";
import { createEvidenceBundleStore } from "./evidence-bundle-store.mjs";
import { writeLocalEvidenceSidecarSafe } from "./local-evidence-sidecar.mjs";
import { writeEvidenceBundleLifecycleSidecarSafe } from "./evidence-bundle-lifecycle-sidecar.mjs";
import { createLocalEvidenceRepository } from "./local-evidence-repository.mjs";
import {
  ROUTE_V2_PUBLICATION_GATE_VERSION,
  evaluateRouteV2Publication,
  isRouteV2PublicationGateEnabled,
} from "./route-publication-gate.mjs";
import { createRouteV2ReadyPool } from "./route-v2-ready-pool.mjs";

const PHASE_2A_STRATEGIES = ["Geographic", "Theme", "Season", "Transport", "Depth", "Efficiency"];
const MAX_SEGMENT_KM = 650;
const MAX_TOTAL_ROUTE_KM = 2200;
const MAX_ROUTE_SPAN_KM = 1200;
const ROUTE_GENERATION_V2_PHASE1 = "route-generation-v2-phase1";
const V2_NOT_PUBLISHABLE_YET = "v2-not-publishable-yet";

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

function ensureV2PublicationCover(record = {}) {
  if (clean(record.coverAsset?.imageUrl || record.coverImageUrl || record.imageUrl)) return record;
  return {
    ...record,
    coverAsset: {
      provider: "local-static-fallback",
      assetId: "trip-cover-placeholder",
      imageUrl: "assets/trip-cover-placeholder.svg",
      status: "placeholder",
    },
    coverStatus: "placeholder",
  };
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
    destination.canonicalNameZh,
    destination.canonicalNameEn,
    ...(Array.isArray(destination.aliases) ? destination.aliases : []),
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
  const embeddedByCode = new Map(destinationEntities
    .map((destination) => destination?.countryEntity)
    .filter((country) => country && typeof country === "object")
    .map((country) => [clean(country.countryCode || country.isoAlpha2).toUpperCase(), country]));
  return unique([
    ...countryCodesForContext(context),
    ...destinationEntities.map((destination) => destination.countryCode),
  ].map((value) => clean(value).toUpperCase()))
    .map((code) => {
      const embedded = embeddedByCode.get(code);
      if (!embedded) return countryEntityForCode(code, context);
      return {
        ...structuredClone(embedded),
        countryCode: code,
        name: clean(embedded.name || embedded.canonicalNameZh || embedded.canonicalNameEn || code),
      };
    });
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
  const requestedCities = unique([
    ...(Array.isArray(context.cities) ? context.cities : []),
    ...(Array.isArray(context.normalizedCities) ? context.normalizedCities : []),
  ]);
  const country = clean(context.country || context.countryCode || countryCodesForContext(context).join("/")).toUpperCase();
  const styleKey = `${country}:${concept.travelStyle}`;
  const styleAnchors = STYLE_ANCHORS[styleKey]
    || (concept.travelStyle === "classic-first-trip" ? (FIRST_TRIP_ANCHORS[country] || []) : []);
  return unique([...requestedCities, ...styleAnchors]);
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
  const rawPool = countryCodesForContext(context).flatMap((country) => knowledgeGraph.queryDestinations({
    country,
    region: context.region || "",
    theme: context.theme || "",
    travelStyle: concept.travelStyle,
    season: context.season || "",
    limit: anchors.length ? 40 : 12,
  }) || []);
  const entityPool = rawPool.filter((destination) => clean(destination.destinationSource) === "knowledge-entity-layer");
  const requiredIds = new Set(
    Array.isArray(context.requiredDestinationIds)
      ? context.requiredDestinationIds.map(clean).filter(Boolean)
      : [],
  );
  if (clean(context.routeReferenceMode) === "citywalk") {
    const citywalkPool = citywalkDestinationPool(entityPool, [...requiredIds]);
    if (citywalkPool.length >= 2) return citywalkPool;
  }
  const entityKeys = new Set(entityPool.flatMap((destination) => destinationIdentityKeys(destination)));
  const entityPoolCoversRequired = [...requiredIds].every((id) => entityKeys.has(id));
  const groundedPool = entityPool.length >= 2 && entityPoolCoversRequired ? entityPool : rawPool;
  const suggestionIds = new Set(
    Array.isArray(context.destinationSuggestion?.destinationIds)
      ? context.destinationSuggestion.destinationIds.map(clean).filter(Boolean)
      : [],
  );
  const suggestionPool = suggestionIds.size
    ? groundedPool.filter((destination) => destinationIdentityKeys(destination).some((key) => suggestionIds.has(key)))
    : [];
  const pool = suggestionPool.length >= 2 ? suggestionPool : groundedPool;
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
async function writeCandidatePoolSidecarSafe({
  context,
  concept,
  pool,
  candidatePoolStore,
  localEvidenceRepository = null,
  routeCandidateBuilder = buildRouteCandidatesFromPool,
  candidateEvidenceValidator = validateRouteForUse,
  env = process.env,
} = {}) {
  async function persistBatch(intentId, candidates) {
    if (candidatePoolStore?.replaceForIntent) {
      return candidatePoolStore.replaceForIntent(intentId, candidates);
    }
    const results = [];
    for (const candidate of candidates) {
      try {
        results.push(await candidatePoolStore.append(candidate));
      } catch (error) {
        results.push({ written: false, persisted: false, reason: clean(error?.message || String(error)) || "candidate-write-failed" });
      }
    }
    const persisted = results.every((result) => result?.persisted === true || result?.written === true);
    return {
      written: results.some((result) => result?.written),
      persisted,
      count: persisted ? candidates.length : results.filter((result) => result?.persisted === true || result?.written === true).length,
      candidateIds: persisted ? candidates.map((candidate) => candidate.candidateId) : [],
      results,
      reason: persisted ? "candidate-batch-persisted" : "candidate-persistence-incomplete",
    };
  }

  try {
    if (!candidatePoolStore?.enabled?.()) {
      return { enabled: false, generated: 0, written: 0, skipped: true, reason: "candidate-pool-disabled" };
    }
    const selectionEnabled = isRouteV2IntentEnabled(env);
    const strictSuggestionCapacity = context?.destinationSuggestion
      ? maxDestinationsForConcept(concept)
      : null;
    const evidenceBridgeInsertions = selectionEnabled && isRouteV2EvidenceValidationEnabled(env)
      ? preferredEvidenceBridgeInsertions(context, pool, localEvidenceRepository)
      : [];
    const candidateContext = evidenceBridgeInsertions.length
      ? { ...context, preferredEvidenceBridgeInsertions: evidenceBridgeInsertions }
      : context;
    let builtCandidates = routeCandidateBuilder({
      context: candidateContext,
      concept,
      pool,
      targetCount: selectionEnabled && strictSuggestionCapacity
        ? 12
        : selectionEnabled
          ? ROUTE_CANDIDATE_SELECTION_TARGET
          : Number(context?.candidateTargetCount) || 8,
      seed: context?.candidateSeed || context?.intentId || "",
    });
    if (selectionEnabled && strictSuggestionCapacity) {
      const suggestionShape = (candidate) => JSON.stringify({
        destinations: [...(candidate.proposedOrder || [])].sort(),
        variant: clean(candidate.candidateVariant || ""),
      });
      const byShape = new Map(builtCandidates.map((candidate) => [suggestionShape(candidate), candidate]));
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const capacitySafeCount = [...byShape.values()]
          .filter((candidate) => candidate.destinations.length <= strictSuggestionCapacity)
          .length;
        if (capacitySafeCount >= ROUTE_CANDIDATE_SELECTION_TARGET) break;
        const retrySeed = `${context?.candidateSeed || context?.intentId || ""}:capacity:${attempt}`;
        for (const candidate of routeCandidateBuilder({
          context: candidateContext,
          concept,
          pool,
          targetCount: 12,
          seed: retrySeed,
        })) {
          const shape = suggestionShape(candidate);
          if (!byShape.has(shape)) byShape.set(shape, candidate);
        }
      }
      builtCandidates = [...byShape.values()];
    }
    const capacitySafeCandidates = strictSuggestionCapacity
      ? builtCandidates.filter((candidate) => candidate.destinations.length <= strictSuggestionCapacity)
      : builtCandidates;
    const candidates = selectionEnabled
      ? capacitySafeCandidates.slice(0, ROUTE_CANDIDATE_SELECTION_TARGET)
      : capacitySafeCandidates;
    const failures = [];
    const generatedCandidates = candidates.map((candidate) => ({
      ...candidate,
      status: "pending",
      rejectionReasons: [],
      supportingSignals: [
        ...(candidate.supportingSignals || []),
        { type: "planner-sidecar-stage", value: "after-selectDestinationPool-before-buildRouteSkeleton" },
      ],
    }));
    const inputIntentSnapshot = routeIntentSnapshot({
      context,
      intentId: context?.intentId || generatedCandidates[0]?.intentId || "",
      source: "planner-candidate-sidecar",
    });
    const pendingCandidates = generatedCandidates.map((candidate) => ({
      ...candidate,
      routeIntentFingerprintVersion: inputIntentSnapshot.routeIntentFingerprintVersion,
      routeIntentFingerprint: inputIntentSnapshot.routeIntentFingerprint,
      normalizedRouteIntent: structuredClone(inputIntentSnapshot.normalizedRouteIntent),
      inputIntentSnapshot,
    }));
    const invalidCandidates = pendingCandidates
      .map((candidate) => ({ candidate, validation: validateRouteCandidate(candidate) }))
      .filter((entry) => !entry.validation.accepted);
    if (selectionEnabled && invalidCandidates.length) {
      return {
        enabled: true,
        generated: pendingCandidates.length,
        written: 0,
        failures: invalidCandidates.flatMap((entry) => entry.validation.reasons),
        generatedCandidates: pendingCandidates.filter((candidate) => validateRouteCandidate(candidate).accepted),
        invalidCandidates: invalidCandidates.map((entry) => ({ candidateId: entry.candidate.candidateId || "", reasons: entry.validation.reasons })),
        persistedCandidates: [],
        writtenCandidates: [],
        selection: null,
        persistenceReady: false,
        failureStage: "candidate-schema-validation",
        failureReason: "candidate-schema-invalid",
      };
    }
    if (selectionEnabled && pendingCandidates.length < ROUTE_CANDIDATE_SELECTION_TARGET) {
      const failureReason = pendingCandidates.length === 0 && context?.requiredDestinationIds?.length
        ? "required-destination-not-in-pool"
        : pendingCandidates.length === 0
          ? "candidate-pool-empty"
          : "candidate-pool-insufficient";
      return {
        enabled: true,
        generated: pendingCandidates.length,
        written: 0,
        failures: [failureReason],
        generatedCandidates: pendingCandidates,
        persistedCandidates: [],
        writtenCandidates: [],
        selection: null,
        persistenceReady: false,
        failureStage: "candidate-generation",
        failureReason,
      };
    }
    const intentId = inputIntentSnapshot.intentId;
    const pendingWrite = await persistBatch(intentId, pendingCandidates);
    const pendingIds = new Set(pendingWrite?.candidateIds || []);
    const pendingPersistenceComplete = pendingWrite?.persisted === true
      && Number(pendingWrite?.count) === pendingCandidates.length
      && pendingCandidates.length > 0
      && pendingCandidates.every((candidate) => pendingIds.has(candidate.candidateId));
    if (!pendingPersistenceComplete) {
      failures.push(pendingWrite?.reason || "candidate-persistence-incomplete");
      return {
        enabled: true,
        generated: generatedCandidates.length,
        written: Number(pendingWrite?.count || 0),
        failures,
        generatedCandidates: pendingCandidates,
        persistedCandidates: [],
        writtenCandidates: [],
        selection: null,
        persistenceReady: false,
        failureStage: "candidate-persistence",
        failureReason: "candidate-persistence-incomplete",
      };
    }

    if (!selectionEnabled) {
      return {
        enabled: true,
        generated: generatedCandidates.length,
        written: pendingCandidates.length,
        failures,
        generatedCandidates: pendingCandidates,
        persistedCandidates: pendingCandidates,
        writtenCandidates: pendingCandidates,
        selection: null,
        persistenceReady: true,
      };
    }

    const selection = isRouteV2EvidenceValidationEnabled(env)
      ? selectRouteCandidatesWithEvidence({
        candidates: pendingCandidates,
        context,
        intentId,
        evidenceRepository: localEvidenceRepository,
        validator: candidateEvidenceValidator,
      })
      : selectRouteCandidates({ candidates: pendingCandidates, context, intentId });
    if (!selection?.ready) {
      const failedCandidates = selection?.candidatePool?.length ? selection.candidatePool : pendingCandidates.map((candidate) => ({
        ...candidate,
        status: "failed",
        rejectionReasons: [{ code: "candidate-selection-minimum-not-met", reason: "Candidate selection did not produce exactly one selected route." }],
      }));
      await persistBatch(intentId, failedCandidates);
      return {
        enabled: true,
        generated: generatedCandidates.length,
        written: pendingCandidates.length,
        failures: [selection?.reason || "candidate-selection-failed"],
        generatedCandidates: pendingCandidates,
        persistedCandidates: failedCandidates,
        writtenCandidates: failedCandidates,
        selection: null,
        failedSelection: selection,
        validationResults: structuredClone(selection?.validationResults || []),
        persistenceReady: false,
        failureStage: "candidate-selection",
        failureReason: selection?.reason || "candidate-selection-failed",
      };
    }
    const selectedById = new Map(selection.candidatePool.map((candidate) => [candidate.candidateId, candidate]));
    const finalCandidates = pendingCandidates.map((candidate) => ({
      ...candidate,
      ...structuredClone(selectedById.get(candidate.candidateId)),
      inputIntentSnapshot,
    }));
    const finalWrite = await persistBatch(intentId, finalCandidates);
    const finalIds = new Set(finalWrite?.candidateIds || []);
    const finalPersistenceComplete = finalWrite?.persisted === true
      && Number(finalWrite?.count) === ROUTE_CANDIDATE_SELECTION_TARGET
      && finalCandidates.length === ROUTE_CANDIDATE_SELECTION_TARGET
      && finalCandidates.every((candidate) => finalIds.has(candidate.candidateId));
    if (!finalPersistenceComplete) {
      failures.push(finalWrite?.reason || "candidate-final-state-persistence-incomplete");
      return {
        enabled: true,
        generated: generatedCandidates.length,
        written: Number(finalWrite?.count || 0),
        failures,
        generatedCandidates: pendingCandidates,
        persistedCandidates: pendingCandidates,
        writtenCandidates: pendingCandidates,
        selection: null,
        persistenceReady: false,
        failureStage: "candidate-final-state-persistence",
        failureReason: "candidate-final-state-persistence-incomplete",
      };
    }
    return {
      enabled: true,
      generated: generatedCandidates.length,
      written: finalCandidates.length,
      failures,
        generatedCandidates: pendingCandidates,
      persistedCandidates: finalCandidates,
      writtenCandidates: finalCandidates,
      selection,
      persistenceReady: true,
    };
  } catch (error) {
    const errorMessage = clean(error?.message || String(error)) || "candidate-sidecar-failed";
    return {
      enabled: true,
      generated: 0,
      written: 0,
      failures: [errorMessage],
      generatedCandidates: [],
      persistedCandidates: [],
      writtenCandidates: [],
      selection: null,
      persistenceReady: false,
      failureStage: "candidate-persistence",
      failureReason: "candidate-sidecar-failed",
      reason: "candidate-sidecar-failed",
    };
  }
}

function buildRouteSkeleton(pool, concept, context = {}) {
  const requiredIds = Array.isArray(context.requiredDestinationIds) ? context.requiredDestinationIds.map(clean).filter(Boolean) : [];
  const requiredNames = Array.isArray(context.requiredDestinationNames) ? context.requiredDestinationNames.map(clean).filter(Boolean) : [];
  const requiredCount = Math.max(requiredIds.length, requiredNames.length);
  if (requiredCount) {
    const selected = [];
    const used = new Set();
    for (let index = 0; index < requiredCount; index += 1) {
      const requiredId = requiredIds[index] || "";
      const requiredName = requiredNames[index] || "";
      const matchIndex = pool.findIndex((destination, poolIndex) => {
        if (used.has(poolIndex)) return false;
        const keys = destinationIdentityKeys(destination);
        if (requiredId) return keys.includes(requiredId);
        return requiredName ? destinationTerms(destination).includes(requiredName.toLocaleLowerCase("en-US")) : false;
      });
      if (matchIndex < 0) return [];
      used.add(matchIndex);
      selected.push(pool[matchIndex]);
    }
    return selected;
  }
  const withCoords = pool.filter((d) => coordinate(d));
  const requestedDurationDays = Number(context.durationDays || concept.durationDays);
  const durationCapacity = Number.isInteger(requestedDurationDays) && requestedDurationDays > 0
    ? maxDestinationsForDuration(requestedDurationDays)
    : Infinity;
  const maxDestinations = Math.min(maxDestinationsForConcept(concept), durationCapacity);
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
  const start = anchors.length
    ? withCoords.slice().sort((left, right) => anchorIndex(left, anchors) - anchorIndex(right, anchors))[0]
    : withCoords[0];
  const visited = [start];
  const remaining = withCoords.filter((destination) => destination !== start);
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

function destinationIdentityKeys(destination = {}) {
  return unique([
    destination.entityId,
    destination.id,
    destination.wikidataId,
    destination.qid,
    destination.name,
  ]).map((value) => clean(value));
}

function citywalkDestinationPool(entityPool = [], requiredIds = []) {
  if (requiredIds.length !== 1) return [];
  const requiredId = clean(requiredIds[0]);
  const city = entityPool.find((destination) => (
    clean(destination.entityTypeName) === "city"
    && destinationIdentityKeys(destination).includes(requiredId)
  ));
  if (!city || !Array.isArray(city.poiEntities) || city.poiEntities.length === 0) return [];
  const pois = city.poiEntities.map((poi) => ({
    ...structuredClone(poi),
    parentCountryEntityId: clean(city.parentCountryEntityId),
    parentCityEntityId: clean(poi.parentCityEntityId || city.entityId),
    countryCode: clean(city.countryCode),
    name: clean(poi.canonicalNameZh || poi.canonicalNameEn || poi.name),
    sourceTitle: clean(poi.canonicalNameEn || poi.canonicalNameZh || poi.name),
    canonicalTitle: clean(poi.canonicalNameEn || poi.canonicalNameZh || poi.name),
    entityTypeName: "poi",
    destinationSource: "knowledge-entity-layer",
    countryEntity: structuredClone(city.countryEntity || {}),
  }));
  const seen = new Set();
  return [city, ...pois].filter((destination) => {
    const id = destinationIdentityKeys(destination)[0];
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function reusableLegEvidence(index, fromEntityId, toEntityId) {
  if (!index?.getRouteLegsByEndpoints) return [];
  return index.getRouteLegsByEndpoints({ fromEntityId, toEntityId }).filter((record) => (
    clean(record?.feasibilityStatus) === "feasible"
    && clean(record?.freshnessStatus) === "fresh"
    && Array.isArray(record?.sources)
    && record.sources.length > 0
    && Array.isArray(record?.sourceRefs)
    && record.sourceRefs.length > 0
    && Number.isFinite(Number(record?.durationMinMinutes))
    && Number.isFinite(Number(record?.durationMaxMinutes))
    && (!record?.expiresAt || Date.parse(record.expiresAt) > Date.now())
    && (!Array.isArray(record?.conflicts) || record.conflicts.length === 0)
  ));
}

function preferredEvidenceBridgeInsertions(context = {}, pool = [], localEvidenceRepository = null) {
  if (clean(context.destinationOrderMode) !== "flexible") return [];
  const requiredIds = unique(context.requiredDestinationIds || []).map(clean);
  if (requiredIds.length < 2) return [];
  const requiredSet = new Set(requiredIds);
  const index = localEvidenceRepository?.index || localEvidenceRepository;
  const bridges = [];
  for (const destination of pool) {
    const destinationId = destinationIdentityKeys(destination).find((key) => !requiredSet.has(key));
    if (!destinationId) continue;
    for (let pairIndex = 0; pairIndex < requiredIds.length - 1; pairIndex += 1) {
      const inbound = reusableLegEvidence(index, requiredIds[pairIndex], destinationId);
      const outbound = reusableLegEvidence(index, destinationId, requiredIds[pairIndex + 1]);
      if (!inbound.length || !outbound.length) continue;
      const durationMinutes = Math.min(...inbound.map((record) => Number(record.durationMaxMinutes)))
        + Math.min(...outbound.map((record) => Number(record.durationMaxMinutes)));
      bridges.push({ destinationId, insertionIndex: pairIndex + 1, durationMinutes });
    }
  }
  return bridges.sort((left, right) => left.durationMinutes - right.durationMinutes
    || left.destinationId.localeCompare(right.destinationId, "en")
    || left.insertionIndex - right.insertionIndex);
}

function skeletonFromSelectedCandidate(selectedCandidate, pool = []) {
  if (!selectedCandidate?.candidateId) return { ok: false, reason: "selected-candidate-missing" };
  const proposedOrder = Array.isArray(selectedCandidate.proposedOrder)
    ? selectedCandidate.proposedOrder.map(clean).filter(Boolean)
    : [];
  const candidateDestinations = Array.isArray(selectedCandidate.destinations) ? selectedCandidate.destinations : [];
  if (proposedOrder.length < 2 || proposedOrder.length !== candidateDestinations.length) {
    return { ok: false, reason: "selected-candidate-order-invalid" };
  }
  const poolByKey = new Map();
  for (const destination of pool) {
    for (const key of destinationIdentityKeys(destination)) {
      if (!poolByKey.has(key)) poolByKey.set(key, destination);
    }
  }
  const candidateByKey = new Map();
  for (const destination of candidateDestinations) {
    for (const key of destinationIdentityKeys(destination)) {
      if (!candidateByKey.has(key)) candidateByKey.set(key, destination);
    }
  }
  const skeleton = [];
  const used = new Set();
  for (const orderId of proposedOrder) {
    const candidateDestination = candidateByKey.get(orderId);
    if (!candidateDestination) return { ok: false, reason: `selected-candidate-order-destination-missing:${orderId}` };
    const source = destinationIdentityKeys(candidateDestination).map((key) => poolByKey.get(key)).find(Boolean);
    if (!source) return { ok: false, reason: `selected-candidate-pool-destination-missing:${orderId}` };
    const sourceKey = clean(source.entityId || source.wikidataId || source.id || source.name);
    if (used.has(sourceKey)) return { ok: false, reason: `selected-candidate-order-duplicate:${orderId}` };
    used.add(sourceKey);
    skeleton.push(structuredClone(source));
  }
  return { ok: true, skeleton, proposedOrder };
}

function recordMatchesSelectedCandidate(record, selectedCandidate) {
  if (!record || !selectedCandidate) return false;
  const recordOrder = (record.destinationEntities || [])
    .map((destination) => clean(destination.wikidataId || destination.entityId || destination.id || destination.name))
    .filter(Boolean);
  const selectedOrder = (selectedCandidate.proposedOrder || []).map(clean).filter(Boolean);
  const recordCountries = unique((record.countryEntities || []).map((country) => country.countryCode)).sort();
  const selectedCountries = unique(selectedCandidate.countries || []).sort();
  return JSON.stringify(recordOrder) === JSON.stringify(selectedOrder)
    && JSON.stringify(recordCountries) === JSON.stringify(selectedCountries)
    && Number(record.durationDays) === Number(selectedCandidate.durationDays)
    && clean(record.travelStyle) === clean(selectedCandidate.travelStyle);
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

function plannerDestinationSource(destinations = []) {
  const hasEntityLayer = destinations.some((destination) => destination?.destinationSource === "knowledge-entity-layer");
  const hasKnowledgeGraph = destinations.some((destination) => destination?.destinationSource !== "knowledge-entity-layer");
  if (hasEntityLayer && hasKnowledgeGraph) return "knowledge-entity-layer+knowledge-graph";
  return hasEntityLayer ? "knowledge-entity-layer" : "knowledge-graph";
}

function destinationSourceLabel(destinationSource) {
  if (destinationSource === "knowledge-entity-layer") return "知识实体层";
  if (destinationSource === "knowledge-entity-layer+knowledge-graph") return "知识实体层与知识图";
  return "知识图";
}

function destinationSourceProviders(destinationSource) {
  if (destinationSource === "knowledge-entity-layer") return [{ providerId: "knowledge-entity-layer", url: "" }];
  if (destinationSource === "knowledge-entity-layer+knowledge-graph") {
    return [
      { providerId: "knowledge-entity-layer", url: "" },
      { providerId: "knowledge-graph", url: "" },
    ];
  }
  return [{ providerId: "knowledge-graph", url: "" }];
}

function plannerLiteraryTravelValue({ countryEntities = [], destinationEntities = [], concept = {} } = {}) {
  const countryCodes = new Set(countryEntities.map((country) => clean(country.countryCode)).filter(Boolean));
  const hasCountry = (...codes) => codes.some((code) => countryCodes.has(code));
  const onlyCountries = (...codes) => (
    countryCodes.size > 0
    && [...countryCodes].every((code) => codes.includes(code))
  );
  const style = clean(concept.travelStyle).toLocaleLowerCase("en-US");
  const narrative = [
    style,
    ...destinationEntities.flatMap((destination) => [
      destination.name,
      destination.canonicalNameZh,
      destination.canonicalNameEn,
    ]),
  ].map(clean).filter(Boolean).join(" ");
  if (hasCountry("KZ", "KG", "UZ", "TJ", "TM")) {
    return "穿行丝路绿洲与旷野，让砖石穹顶和市集烟火交替展开。";
  }
  if (countryCodes.size >= 2 && onlyCountries("AT", "CZ", "HU", "SK")) {
    return "沿多瑙河与帝国旧都的脉络前行，让宫殿、咖啡馆和老城夜色层层展开。";
  }
  if (countryCodes.size === 1 && hasCountry("JP")) {
    return "在古都寺院、街巷日常与山海风景之间，读一段层次分明的日本。";
  }
  if (countryCodes.size === 1 && hasCountry("IT")) {
    return "让教堂穹顶、文艺复兴街巷与餐桌烟火沿途相接。";
  }
  if (countryCodes.size === 1 && hasCountry("FR")) {
    return "循着河岸、旧城与葡萄酒乡的光影，慢慢展开法兰西的不同侧面。";
  }
  if (onlyCountries("DK", "FI", "IS", "NO", "SE")) {
    return "在港湾、森林与北地长光之间，感受城市秩序和旷野气息的交替。";
  }
  if (style === "classic-first-trip") {
    return "从最具辨识度的老城与地标入手，先读懂一地的性格。";
  }
  if (style === "deep-dive") {
    return "把脚步放慢，在支线街区与地方日常里读出更深一层。";
  }
  if (style === "country-hopper") {
    return "在相邻国度的广场、街巷与餐桌之间，看见边界两侧的气质流转。";
  }
  if (style === "transport-journey") {
    return "循着城际脉络换景，让站城、原野与地方日常自然衔接。";
  }
  if (style === "seasonal") {
    return "顺应当季光线与风物，在天气变化里为旅途留出从容。";
  }
  if (style === "theme") {
    return "循着一条鲜明线索，在建筑、风物与地方故事间逐层展开。";
  }
  if (style === "city-break") {
    return "从晨间街市走到黄昏屋顶，在短暂停留里触到城市的脉搏。";
  }
  if (style === "pilgrimage") {
    return "沿古道与信仰遗迹缓步前行，让沿途村镇成为旅程的一部分。";
  }
  if (style === "island-hopping") {
    return "在海湾、港埠与离岛之间换景，把潮汐留进旅行节奏。";
  }
  if (style === "road-trip" || /自驾|公路|coast|highway|\broad\b|\bdrive\b/iu.test(narrative)) {
    return "让公路、地貌和小镇日常在车窗外自然递进。";
  }
  if (style === "rail-journey" || /铁路|火车|列车|\brail(?:way)?\b|\btrain\b/iu.test(narrative)) {
    return "循着铁路线换景，在站城之间收拢沿途风土。";
  }
  if (/古城|遗产|文明|城堡|教堂|unesco|heritage|temple|cathedral/iu.test(narrative)) {
    return "循着古城街巷与砖石遗迹，读出不同时代留下的纹理。";
  }
  if (countryCodes.size >= 2) {
    return "让几座城市的街景、历史与餐桌气息在移动中自然递进。";
  }
  return "从街巷、建筑到地方日常，慢慢读懂这片土地的层次。";
}

// 候选 record 构造（sourceType = planner-designed，绕过 composition-validator 旧桶校验）
function buildPlannerRecord({ concept, skeleton, context, evidenceResult, strategies, score, goldCase, llmPlannerReason = null, llmRefined = false, llmConfidence = null, llmRefineError = null, llmProviderName = "" } = {}) {
  const countryEntities = countryEntitiesForRecord(context, skeleton);
  const destinationEntities = skeleton.map((destination) => ({
    ...(destination.entityId ? { entityId: clean(destination.entityId) } : {}),
    ...(destination.parentCountryEntityId ? { parentCountryEntityId: clean(destination.parentCountryEntityId) } : {}),
    ...(destination.parentCityEntityId ? { parentCityEntityId: clean(destination.parentCityEntityId) } : {}),
    wikidataId: clean(destination.wikidataId),
    countryCode: clean(destination.countryCode || context.countryCode),
    name: clean(destination.name),
    ...(destination.canonicalNameZh ? { canonicalNameZh: clean(destination.canonicalNameZh) } : {}),
    ...(destination.canonicalNameEn ? { canonicalNameEn: clean(destination.canonicalNameEn) } : {}),
    ...(Array.isArray(destination.aliases) ? { aliases: unique(destination.aliases) } : {}),
    entityTypeName: clean(destination.entityTypeName || "city"),
    latitude: destination.latitude ?? null,
    longitude: destination.longitude ?? null,
    ...(Array.isArray(destination.poiEntities) ? { poiEntities: structuredClone(destination.poiEntities) } : {}),
    ...(destination.destinationSource ? { destinationSource: clean(destination.destinationSource) } : {}),
  }));
  const destinationSource = plannerDestinationSource(skeleton);
  const sourceLabel = destinationSourceLabel(destinationSource);
  const countryName = countryEntities.map((country) => country.name).filter(Boolean).join("、");
  const places = destinationEntities.map((d) => d.name);
  const displayTravelValue = plannerLiteraryTravelValue({
    countryEntities,
    destinationEntities,
    concept,
  });
  const displayConcept = {
    ...concept,
    cityCount: places.length,
    hotelChangeEstimate: Math.max(0, places.length - 1),
    travelValue: displayTravelValue,
  };
  const styleLabel = TRAVEL_STYLE_LABEL[concept.travelStyle] || concept.travelStyle;
  const styleLabelZh = TRAVEL_STYLE_LABEL_ZH[concept.travelStyle] || concept.travelStyle;
  const days = numberOrNull(String(concept.recommendedDays).match(/\d+/u)?.[0] || concept.durationDays);
  const durationLabel = days ? `${days}天` : String(concept.recommendedDays || "");
  const recordDurationLabel = context.timeIntent ? durationLabel : concept.recommendedDays;
  const shapeLabel = days && days <= 6 ? "精简" : days && days >= 9 ? "延展" : "经典";
  const anchorLabel = places[0] ? `：${places[0]}` : "";
  const shapedStyleLabel = styleLabelZh.includes(shapeLabel) ? styleLabelZh : `${shapeLabel}${styleLabelZh}`;
  const name = `${countryName}${durationLabel}${shapedStyleLabel}${anchorLabel}`;
  const deterministicReason = [
    { text: `时长=${concept.durationBand}(${concept.recommendedDays})：${concept.whyThisDurationFits}`, strategy: "Geographic", evidenceIds: [] },
    { text: `旅行风格=${styleLabelZh}：${displayTravelValue}`, strategy: "Theme", evidenceIds: [] },
    { text: `骨架由${sourceLabel}候选池经最近邻排序生成，目的地来源=${sourceLabel}。`, strategy: "Efficiency", evidenceIds: [] },
  ];
  // LLM 节点产出叙事（每条 {text,strategy}）→ 转成 record.plannerReason 形态（补 evidenceIds:[]）
  const llmReason = Array.isArray(llmPlannerReason)
    ? llmPlannerReason.map((r) => ({ text: String(r?.text || ""), strategy: String(r?.strategy || ""), evidenceIds: [] }))
    : null;
  const plannerReason = (llmRefined && llmReason && llmReason.length) ? llmReason : deterministicReason;
  return {
    id: `planner-designed-${routeDedupeFingerprint({ destinationEntities, recommendedDays: recordDurationLabel, themes: [styleLabel] })}`,
    name,
    canonicalTitle: name,
    sourceTitle: `Planner designed (${styleLabel})`,
    summary: `围绕${styleLabelZh}，由${sourceLabel}候选池设计，串联${places.slice(0, 4).join("、")}${places.length > 4 ? "等" : ""}。`,
    recommendationText: displayTravelValue,
    travelStyle: concept.travelStyle,
    travelStyleConceptKey: concept.travelStyle,
    durationBand: concept.durationBand,
    concept: displayConcept,
    countries: countryEntities.map((country) => country.countryCode),
    countryEntities,
    destinations: places,
    destinationEntities,
    recommendedDays: recordDurationLabel,
    durationDays: days,
    bestMonths: normalizeBestMonths(context.bestMonths),
    themes: [styleLabelZh],
    tags: [styleLabelZh, countryEntities.length > 1 ? "跨国路线" : "单国路线"].filter(Boolean),
    highlights: [
      `${places.slice(0, 3).join("、")}构成${styleLabelZh}骨架`,
      `目的地来自${sourceLabel}${(evidenceResult?.missingSegments || []).length ? "，部分段待补证据" : "，段段有证据"}`,
      concept.targetTraveler,
    ],
    source: { name: "Planner", url: "" },
    sourceType: "planner-designed",
    destinationSource,
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
      sources: destinationSourceProviders(destinationSource),
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
    ...(clean(context.routeReferenceMode) ? {
      routeReferenceMode: clean(context.routeReferenceMode),
      durationPolicy: clean(context.durationPolicy),
      requestedDurationDays: Number(context.durationDays) || null,
    } : {}),
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
  const suggestedDestinationCount = Array.isArray(context?.destinationSuggestion?.destinationIds)
    ? context.destinationSuggestion.destinationIds.length
    : 0;
  const quality = validateRouteContent(record, {
    minimumDestinations: suggestedDestinationCount > 0
      ? Math.min(2, suggestedDestinationCount)
      : null,
  });
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

function preserveExplicitTimeIntent(record, context = {}) {
  if (!record || !context.timeIntent || typeof context.timeIntent !== "object") return record;
  const timeIntent = structuredClone(context.timeIntent);
  const explicitTime = ["single-month", "month-range", "season-only"].includes(clean(timeIntent.type));
  return {
    ...record,
    timeIntent,
    ...(explicitTime ? { bestMonths: [] } : {}),
  };
}

function decorateCitywalkReferenceRecord(record, context = {}) {
  if (clean(context.routeReferenceMode) !== "citywalk") return record;
  const destinations = Array.isArray(record.destinationEntities) ? record.destinationEntities : [];
  const city = destinations.find((destination) => clean(destination.entityTypeName) === "city");
  const pois = destinations.filter((destination) => clean(destination.entityTypeName) === "poi");
  if (!city || !pois.length) return record;
  const cityName = clean(city.canonicalNameZh || city.name || city.canonicalNameEn);
  const poiNames = pois.map((poi) => clean(poi.canonicalNameZh || poi.name || poi.canonicalNameEn)).filter(Boolean);
  const stableDestinations = [...destinations].sort((left, right) => (
    clean(left.wikidataId || left.entityId || left.name)
      .localeCompare(clean(right.wikidataId || right.entityId || right.name), "en")
  ));
  const title = `${cityName}城市漫游｜景点总览`;
  return {
    ...record,
    id: `planner-citywalk-${routeDedupeFingerprint({
      countryEntities: record.countryEntities,
      destinationEntities: stableDestinations,
      recommendedDays: "open-ended",
      themes: ["citywalk"],
    })}`,
    name: title,
    canonicalTitle: title,
    sourceTitle: "Planner designed (Citywalk reference)",
    summary: `以${cityName}为中心，汇总当前知识库中的${poiNames.join("、")}，可按兴趣拆分到任意停留天数。`,
    recommendationText: "这是一条不限定每日固定进度的城市漫游参考；建议按街区组合景点，实际开放时间和预约要求仍需确认。",
    recommendedDays: "不限天数",
    requestedDurationDays: Number(context.durationDays) || null,
    routeReferenceMode: "citywalk",
    durationPolicy: "open-ended",
    bestMonths: [],
    themes: ["城市漫游"],
    tags: unique([...(record.tags || []), "城市漫游", "景点总览"]),
    highlights: [
      `${cityName}作为唯一城市锚点`,
      `当前知识库共收录${pois.length}个景点`,
      "停留天数由用户自行安排，不删除景点",
    ],
    contentQualityStatus: "needs-review",
    enrichmentStatus: "needsEvidence",
  };
}

function validatePlannerCandidateSafe(record, concept, context, strategyRegistry) {
  try {
    return validatePlannerCandidate(record, concept, context, strategyRegistry);
  } catch (error) {
    return {
      accepted: false,
      reasons: [`validator-exception:${clean(error?.message || String(error)) || "unknown"}`],
      strategyChecks: [],
      exception: true,
    };
  }
}

// 新管线主体
async function runPipeline({ context, knowledgeGraph, evidenceRepository, acceptedRepository, strategyRegistry, llmRefineProvider, webEvidencePipeline, decisionTraceStore, candidatePoolStore, evidenceBundleStore, localEvidenceRepository, publicationGateEvaluator, readyPool, routeCandidateBuilder, candidateEvidenceValidator, localEvidenceSidecar, localEvidenceCollector, env, limit }) {
  const accepted = [];
  const rejected = [];
  const v2IntentEnabled = isRouteV2IntentEnabled(env);
  let candidatePoolEnabled = false;
  let candidatePoolInitializationFailure = "";
  if (v2IntentEnabled && candidatePoolStore?.enabled) {
    try {
      candidatePoolEnabled = Boolean(candidatePoolStore.enabled());
    } catch (error) {
      candidatePoolInitializationFailure = clean(error?.message || String(error)) || "candidate-store-enabled-check-failed";
    }
  }
  const v2Attempted = v2IntentEnabled && (candidatePoolEnabled || Boolean(candidatePoolInitializationFailure));
  let v2Failure = null;
  async function recordV2Failure({ stage, reason, candidates = [], candidateValidations = [], decisionFactors = [], candidateSelectionMode = "", unknowns = [], legacyFallback = true } = {}) {
    if (!v2Attempted) return null;
    if (v2Failure) return v2Failure;
    const failureCode = clean(reason) || "v2-planner-failed";
    const failedCandidates = structuredClone(candidates || []).map((candidate) => ({
      ...candidate,
      status: candidate.status === "rejected" ? "rejected" : "failed",
      rejectionReasons: Array.isArray(candidate.rejectionReasons) && candidate.rejectionReasons.length
        ? candidate.rejectionReasons
        : [{ code: failureCode, reason: failureCode }],
    }));
    let candidateStateWrite = null;
    const candidateIntentId = clean(failedCandidates[0]?.intentId || context?.intentId);
    if (failedCandidates.length && candidateIntentId && candidatePoolStore?.replaceForIntent) {
      try {
        candidateStateWrite = await candidatePoolStore.replaceForIntent(candidateIntentId, failedCandidates);
      } catch (error) {
        candidateStateWrite = { written: false, persisted: false, reason: "candidate-failure-state-write-failed", error: clean(error?.message || String(error)) };
      }
    }
    const failure = {
      stage: clean(stage) || "planner",
      reason: failureCode,
      candidates: failedCandidates,
      legacyFallback: Boolean(legacyFallback),
      candidateStateWrite,
    };
    const traceWrite = await writeFailureDecisionTraceSafe(decisionTraceStore, {
      context,
      intentId: context?.intentId || "",
      candidatePool: failure.candidates,
      candidateValidations,
      candidateSelectionMode,
      failureStage: failure.stage,
      failureReason: failure.reason,
      source: "planner-pipeline",
      decisionFactors,
      unknowns: [
        ...unknowns,
        ...(failedCandidates.length ? [{
          field: "candidateStatePersistence",
          reason: candidateStateWrite?.persisted === true
            ? "Failure lifecycle state was persisted in Candidate Pool."
            : `Failure lifecycle state persistence was unavailable: ${candidateStateWrite?.reason || "candidate-state-store-missing"}.`,
        }] : []),
      ],
      legacyFallback: failure.legacyFallback,
    });
    v2Failure = { ...failure, traceWrite };
    return v2Failure;
  }

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
    const failureTrace = await recordV2Failure({ stage: "candidate-generation", reason: "knowledge-graph-empty-pool", legacyFallback: false });
    rejected.push({ context, reason: "knowledge-graph-empty-pool" });
    return { accepted, rejected, concept, v2Failure: failureTrace };
  }

  const explicitRequestedDestinations = unique([
    ...(Array.isArray(context.destinations) ? context.destinations : []),
    ...(Array.isArray(context.targetCities) ? context.targetCities : []),
  ]);
  const durationCapacity = Math.max(2, Number(context.durationDays || concept.durationDays || 0) * 2);
  const v2InputConstraintFailure = v2Attempted
    && explicitRequestedDestinations.length > 0
    && explicitRequestedDestinations.length > durationCapacity;
  const candidateSidecar = candidatePoolInitializationFailure
      ? {
        enabled: true,
        generated: 0,
        written: 0,
        failures: [candidatePoolInitializationFailure],
        selection: null,
        persistenceReady: false,
        failureStage: "candidate-persistence",
        failureReason: "candidate-store-initialization-failed",
      }
    : await writeCandidatePoolSidecarSafe({
      context,
      concept,
      pool,
      candidatePoolStore,
      localEvidenceRepository,
      routeCandidateBuilder,
      candidateEvidenceValidator,
      env,
    });
  if (candidateSidecar?.failureStage) {
    await recordV2Failure({
      stage: candidateSidecar.failureStage,
      reason: candidateSidecar.failureReason,
      candidates: candidateSidecar.generatedCandidates || [],
      candidateValidations: candidateSidecar.validationResults || [],
      candidateSelectionMode: candidateSidecar.failedSelection?.selectionMode || "",
      decisionFactors: candidateSidecar.failedSelection?.decisionFactors || [],
      unknowns: [{ field: "candidatePersistence", reason: (candidateSidecar.failures || []).join(",") || candidateSidecar.failureReason }],
      legacyFallback: true,
    });
  }
  if (v2InputConstraintFailure && !candidateSidecar?.failureStage) {
    await recordV2Failure({
      stage: "input-constraints",
      reason: "duration-destination-capacity-exceeded",
      candidates: candidateSidecar.persistedCandidates || candidateSidecar.generatedCandidates || [],
      unknowns: [{
        field: "requestedDestinations",
        reason: `${explicitRequestedDestinations.length} requested destinations exceed the Phase 1 capacity ${durationCapacity}.`,
      }],
      legacyFallback: true,
    });
  }
  const v2SelectionReady = !v2InputConstraintFailure
    && candidateSidecar?.persistenceReady === true
    && candidateSidecar?.selection?.ready === true;
  if (!v2SelectionReady) {
    await localEvidenceSidecar({
      candidates: candidateSidecar?.writtenCandidates || [],
      kgPool: pool,
      candidatePoolStore,
      evidenceBundleStore,
      env,
      ...(localEvidenceCollector ? { localEvidenceCollector } : {}),
    });
  }

  // [3] buildRouteSkeleton
  let selectedCandidate = v2SelectionReady ? candidateSidecar.selection.selectedCandidate : null;
  let selectedResolution = selectedCandidate ? skeletonFromSelectedCandidate(selectedCandidate, pool) : null;
  if (selectedCandidate && !selectedResolution?.ok) {
    await recordV2Failure({
      stage: "selected-candidate-materialization",
      reason: selectedResolution?.reason || "selected-candidate-materialization-failed",
      candidates: candidateSidecar.persistedCandidates || candidateSidecar.generatedCandidates || [],
      legacyFallback: true,
    });
    selectedCandidate = null;
    selectedResolution = null;
  }
  let usingV2SelectedCandidate = Boolean(selectedCandidate && selectedResolution?.ok);
  if (usingV2SelectedCandidate && Number(selectedCandidate.durationDays) > 0) {
    concept.durationDays = Number(selectedCandidate.durationDays);
    concept.durationBand = durationBandFromDays(concept.durationDays);
    concept.recommendedDays = `${concept.durationDays}天`;
  }
  const skeleton = usingV2SelectedCandidate
    ? selectedResolution.skeleton
    : buildRouteSkeleton(pool, concept, context);
  if (skeleton.length < 2) {
    const failureTrace = await recordV2Failure({
      stage: "route-skeleton",
      reason: "skeleton-too-short",
      candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
      legacyFallback: !usingV2SelectedCandidate,
    });
    rejected.push({ context, reason: "skeleton-too-short" });
    return { accepted, rejected, concept, v2Failure: failureTrace };
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
  if (usingV2SelectedCandidate) {
    llmRefineError = "v2-selected-candidate-order-locked";
  } else if (llmRefineProvider?.refine && quota && quota.limits.llm > 0 && quota.usage.llm >= quota.limits.llm) {
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
  let decisionTests = runAllDecisionTests(candidate, { goldCase });
  if (!decisionTests.allPass) {
    // Phase 2b：决策测试失败不直接 reject，而是记录 mutations 供 Phase 3 LLM 修正
    // 但若有 high-severity 产品边界违规 → reject
    const boundaryViolation = decisionTests.mutations.some((m) => m.action === "split");
    if (boundaryViolation) {
      const failureTrace = await recordV2Failure({
        stage: "decision-tests",
        reason: "product-boundary-violation",
        candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
        legacyFallback: false,
      });
      rejected.push({ context, reason: "product-boundary-violation", mutations: decisionTests.mutations });
      return { accepted, rejected, concept, v2Failure: failureTrace };
    }
  }

  // [6] evidenceCheck（验证器，不阻断；在 refined 骨架上）
  let evidenceResult = evidenceCheck(refinedSkeleton, evidenceRepository);
  // 缺段回填：若有 webEvidencePipeline 且缺段非空，调采集器（英文标准化 query）补 transport-connection/segment-metric
  //   Evidence 作验证器——补全后重跑 evidenceCheck 更新 refs/missing，不改变骨架目的地
  let evidenceCollect = null;
  if (evidenceResult.missingSegments.length && webEvidencePipeline && !v2Attempted) {
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
  let record = buildPlannerRecord({
    concept, skeleton: refinedSkeleton, context, evidenceResult, strategies, score, goldCase,
    llmPlannerReason, llmRefined, llmConfidence, llmRefineError, llmProviderName: llmRefineProvider?.name,
  });
  record.concept = concept;
  if (usingV2SelectedCandidate && !recordMatchesSelectedCandidate(record, selectedCandidate)) {
    await recordV2Failure({
      stage: "final-route-consistency",
      reason: "selected-candidate-route-record-mismatch",
      candidates: candidateSidecar?.persistedCandidates || [],
      legacyFallback: true,
    });
    usingV2SelectedCandidate = false;
    selectedCandidate = null;
    refinedSkeleton = buildRouteSkeleton(pool, concept, context);
    if (refinedSkeleton.length < 2) {
      rejected.push({ context, reason: "legacy-fallback-skeleton-too-short" });
      return { accepted, rejected, concept, v2Failure };
    }
    evidenceResult = evidenceCheck(refinedSkeleton, evidenceRepository);
    decisionTests = runAllDecisionTests({
      destinations: refinedSkeleton.map((destination) => destination.name),
      travelStyle: TRAVEL_STYLE_LABEL[concept.travelStyle],
    }, { goldCase });
    record = buildPlannerRecord({
      concept,
      skeleton: refinedSkeleton,
      context,
      evidenceResult,
      strategies,
      score,
      goldCase,
      llmPlannerReason: null,
      llmRefined: false,
      llmConfidence: null,
      llmRefineError: "v2-fallback-to-legacy-skeleton",
      llmProviderName: "",
    });
    record.concept = concept;
  }
  if (usingV2SelectedCandidate) {
    record.generationVersion = ROUTE_GENERATION_V2_PHASE1;
    record.intentId = candidateSidecar.selection.inputIntentSnapshot.intentId;
    record.selectedCandidateId = selectedCandidate.candidateId;
    if (candidateSidecar.selection.selectedValidationId) {
      record.evidenceValidationId = candidateSidecar.selection.selectedValidationId;
      record.evidenceValidationStatus = candidateSidecar.selection.selectedValidationStatus;
      record.evidenceSelectionMode = candidateSidecar.selection.selectionMode;
    }
    record.v2PublicationStatus = V2_NOT_PUBLISHABLE_YET;
  } else if (v2Failure) {
    record.generationVersion = "route-generation-v2-fallback";
    record.intentId = context?.intentId || "";
    record.v2PublicationStatus = V2_NOT_PUBLISHABLE_YET;
    record.v2FailureStage = v2Failure.stage;
    record.v2FailureReason = v2Failure.reason;
  }

  // [7] validate
  let validation = validatePlannerCandidateSafe(record, concept, context, strategyRegistry);
  if (!validation.accepted) {
    const failureTrace = await recordV2Failure({
      stage: "legacy-validator",
      reason: validation.reasons.join(",") || "legacy-validator-rejected",
      candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
      unknowns: validation.strategyChecks || [],
      legacyFallback: false,
    });
    rejected.push({ context, reason: validation.reasons.join(","), strategyChecks: validation.strategyChecks });
    return { accepted, rejected, concept, v2Failure: failureTrace };
  }
  record = preserveExplicitTimeIntent(record, context);
  const routeIntentFinalization = finalizeRouteResult(record, context, {
    source: "planner-final-route",
    claimedSuccess: true,
  });
  const routeIntentShadow = compareRouteIntentShadow({
    route: routeIntentFinalization.record || record,
    intent: context,
    productionResult: routeIntentFinalization.validation,
    source: "planner-final-route",
    env,
  });
  if (!routeIntentFinalization.matched || routeIntentShadow.matched === false) {
    const invariantFailure = routeIntentFinalization.matched
      ? {
          ...routeIntentFinalization.validation,
          matched: false,
          reasonCodes: ["route-intent-oracle-disagreement"],
          shadow: routeIntentShadow,
        }
      : routeIntentFinalization.validation;
    const failureTrace = await recordV2Failure({
      stage: "fallback-hard-constraints",
      reason: invariantFailure.reasonCodes.join(",") || "fallback-hard-constraint-mismatch",
      candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
      unknowns: [{ field: "routeIntentInvariantValidation", reason: JSON.stringify(invariantFailure) }],
      legacyFallback: false,
    });
    rejected.push({ context, reason: "fallback-hard-constraint-mismatch", constraintValidation: invariantFailure });
    return { accepted, rejected, concept, v2Failure: failureTrace };
  }
  record = decorateCitywalkReferenceRecord(routeIntentFinalization.record, context);

  // [8] duplicateDistance
  const existingRecords = acceptedRepository.list({ limit: 100_000 }).records;
  let dedupeDistance = duplicateDistance(record, existingRecords);
  if (countryClusterSaturated(record, existingRecords, Number(context.maxAcceptedPerCountryCluster) || Infinity)) {
    const failureTrace = await recordV2Failure({
      stage: "dedupe",
      reason: "route-cluster-saturated",
      candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
      legacyFallback: false,
    });
    rejected.push({ context, reason: "route-cluster-saturated", dedupeDistance });
    return { accepted, rejected, concept, v2Failure: failureTrace };
  }
  if (dedupeDistance < 0.28) {
    const failureTrace = await recordV2Failure({
      stage: "dedupe",
      reason: "dedupe-distance-too-low",
      candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
      legacyFallback: false,
    });
    rejected.push({ context, reason: "dedupe-distance-too-low", dedupeDistance });
    return { accepted, rejected, concept, v2Failure: failureTrace };
  }

  let traceWrite = v2Failure?.traceWrite || await writeLegacyDecisionTraceSafe(decisionTraceStore, {
    route: record,
    context,
    source: "planner-pipeline",
    concept,
    candidateSelection: usingV2SelectedCandidate ? candidateSidecar.selection : null,
    decisionFactors: [
      { factor: "country-context", input: countryCodesForContext(context), effect: "Limits knowledge-graph destination query." },
      { factor: "duration", input: context.durationDays || concept.durationDays || null, effect: "Constrains generated route duration fields." },
      { factor: "travel-style", input: context.travelStyle || concept.travelStyle || null, effect: "Influences concept, route structure, title, and summary." },
      {
        factor: record.destinationSource,
        input: refinedSkeleton.map((item) => item.entityId || item.wikidataId || item.name),
        effect: "Provides selected destination entities.",
      },
    ],
    strategyEffects: strategies.map((strategy) => ({ strategy, changedFields: [], evidenceIds: [] })),
    dataSourcesUsed: [
      {
        sourceType: record.destinationSource,
        ids: refinedSkeleton.map((item) => item.entityId || item.wikidataId || item.name).filter(Boolean),
        usedFor: "selected destinations",
      },
      ...(llmRefined ? [{ sourceType: "llm", ids: [llmRefineProvider?.name || "llm-refine"], usedFor: "destination order/refinement" }] : []),
      ...(evidenceCollect?.queries?.length ? [{ sourceType: "web-evidence", ids: evidenceCollect.queries, usedFor: "missing segment evidence check" }] : []),
    ],
    unknowns: [
      { field: "completeRejectedAlternatives", reason: "Phase 1 persists exactly three deterministic alternatives; evidence-backed expansion is not implemented." },
      { field: "llmContribution", reason: llmRefined ? "LLM refine result was applied to the legacy path." : "LLM refine did not change the selected candidate route." },
    ],
  });
  const successTracePersisted = traceWrite?.persisted === true && Boolean(clean(traceWrite?.traceId));
  if (usingV2SelectedCandidate && !successTracePersisted) {
    await recordV2Failure({
      stage: "decision-trace-persistence",
      reason: traceWrite?.reason || "decision-trace-persistence-failed",
      candidates: candidateSidecar.persistedCandidates || [],
      legacyFallback: true,
    });
    usingV2SelectedCandidate = false;
    selectedCandidate = null;
    refinedSkeleton = buildRouteSkeleton(pool, concept, context);
    if (refinedSkeleton.length < 2) {
      rejected.push({ context, reason: "legacy-fallback-skeleton-too-short" });
      return { accepted, rejected, concept, v2Failure };
    }
    decisionTests = runAllDecisionTests({
      destinations: refinedSkeleton.map((destination) => destination.name),
      travelStyle: TRAVEL_STYLE_LABEL[concept.travelStyle],
    }, { goldCase });
    if (!decisionTests.allPass && decisionTests.mutations.some((mutation) => mutation.action === "split")) {
      rejected.push({ context, reason: "legacy-fallback-product-boundary-violation", mutations: decisionTests.mutations });
      return { accepted, rejected, concept, v2Failure };
    }
    evidenceResult = evidenceCheck(refinedSkeleton, evidenceRepository);
    record = buildPlannerRecord({
      concept,
      skeleton: refinedSkeleton,
      context,
      evidenceResult,
      strategies,
      score,
      goldCase,
      llmPlannerReason: null,
      llmRefined: false,
      llmConfidence: null,
      llmRefineError: "v2-fallback-after-trace-persistence-failure",
      llmProviderName: "",
    });
    record.concept = concept;
    record.generationVersion = "route-generation-v2-fallback";
    record.intentId = context?.intentId || "";
    record.v2PublicationStatus = V2_NOT_PUBLISHABLE_YET;
    record.v2FailureStage = v2Failure.stage;
    record.v2FailureReason = v2Failure.reason;
    validation = validatePlannerCandidateSafe(record, concept, context, strategyRegistry);
    if (!validation.accepted) {
      rejected.push({ context, reason: validation.reasons.join(",") || "legacy-fallback-validator-rejected", strategyChecks: validation.strategyChecks });
      return { accepted, rejected, concept, v2Failure };
    }
    record = preserveExplicitTimeIntent(record, context);
    const legacyRouteIntentFinalization = finalizeRouteResult(record, context, {
      source: "planner-legacy-fallback",
      claimedSuccess: true,
    });
    const legacyRouteIntentShadow = compareRouteIntentShadow({
      route: legacyRouteIntentFinalization.record || record,
      intent: context,
      productionResult: legacyRouteIntentFinalization.validation,
      source: "planner-legacy-fallback",
      env,
    });
    if (!legacyRouteIntentFinalization.matched || legacyRouteIntentShadow.matched === false) {
      const invariantFailure = legacyRouteIntentFinalization.matched
        ? {
            ...legacyRouteIntentFinalization.validation,
            matched: false,
            reasonCodes: ["route-intent-oracle-disagreement"],
            shadow: legacyRouteIntentShadow,
          }
        : legacyRouteIntentFinalization.validation;
      rejected.push({ context, reason: "legacy-fallback-hard-constraint-mismatch", constraintValidation: invariantFailure });
      return { accepted, rejected, concept, v2Failure };
    }
    record = legacyRouteIntentFinalization.record;
    dedupeDistance = duplicateDistance(record, existingRecords);
    if (countryClusterSaturated(record, existingRecords, Number(context.maxAcceptedPerCountryCluster) || Infinity)) {
      rejected.push({ context, reason: "legacy-fallback-route-cluster-saturated", dedupeDistance });
      return { accepted, rejected, concept, v2Failure };
    }
    if (dedupeDistance < 0.28) {
      rejected.push({ context, reason: "legacy-fallback-dedupe-distance-too-low", dedupeDistance });
      return { accepted, rejected, concept, v2Failure };
    }
    traceWrite = v2Failure?.traceWrite || traceWrite;
  } else if (usingV2SelectedCandidate && traceWrite?.traceId) {
    record.decisionTraceId = traceWrite.traceId;
  }

  let evidenceBundleLifecycle = null;
  if (usingV2SelectedCandidate) {
    const selectedValidation = (candidateSidecar.selection.validationResults || [])
      .find((validationResult) => clean(validationResult?.candidateId) === clean(selectedCandidate?.candidateId)) || null;
    evidenceBundleLifecycle = await writeEvidenceBundleLifecycleSidecarSafe({
      evidenceBundleStore,
      selectedCandidate,
      persistedCandidates: candidateSidecar.persistedCandidates || [],
      routeRecord: record,
      decisionTraceWrite: traceWrite,
      context: { ...context, validationResult: selectedValidation },
      localEvidenceRepository,
    });
    if (evidenceBundleLifecycle.persisted === true && evidenceBundleLifecycle.failed !== true) {
      record.evidenceBundleId = evidenceBundleLifecycle.evidenceBundleId;
      record.evidenceStatus = evidenceBundleLifecycle.status;
    }
  }

  let publicationGate = null;
  let readyPoolWrite = null;
  const finalEmbeddedIntentValidation = validateEmbeddedRouteIntent(record, {
    source: "planner-success-exit",
    allowLegacyUnbound: false,
  });
  if (!finalEmbeddedIntentValidation.matched) {
    const failureTrace = await recordV2Failure({
      stage: "final-route-intent-invariant",
      reason: finalEmbeddedIntentValidation.reasonCodes.join(",") || "final-route-intent-invariant-failed",
      candidates: candidateSidecar?.persistedCandidates || candidateSidecar?.generatedCandidates || [],
      unknowns: [{ field: "routeIntentInvariantValidation", reason: JSON.stringify(finalEmbeddedIntentValidation) }],
      legacyFallback: false,
    });
    rejected.push({
      context,
      reason: "final-route-intent-invariant-failed",
      constraintValidation: finalEmbeddedIntentValidation,
    });
    return { accepted, rejected, concept, v2Failure: failureTrace };
  }
  if (usingV2SelectedCandidate && isRouteV2PublicationGateEnabled(env)) {
    record = ensureV2PublicationCover(record);
    try {
      const decisionTrace = decisionTraceStore?.list?.().find((trace) => clean(trace?.traceId) === clean(record.decisionTraceId)) || null;
      const selectedValidation = (candidateSidecar.selection.validationResults || [])
        .find((validationResult) => clean(validationResult?.candidateId) === clean(selectedCandidate?.candidateId)) || null;
      publicationGate = publicationGateEvaluator({
        routeRecord: record,
        selectedCandidate,
        decisionTrace,
        validation: selectedValidation,
        evidenceBundle: evidenceBundleLifecycle?.bundle || null,
      });
    } catch (error) {
      publicationGate = {
        gateVersion: ROUTE_V2_PUBLICATION_GATE_VERSION,
        routeRecordId: record.id,
        selectedCandidateId: selectedCandidate?.candidateId || null,
        decisionTraceId: record.decisionTraceId || null,
        validationId: record.evidenceValidationId || null,
        status: "blocked-system-error",
        publicationStatus: "blocked-system-error",
        publishable: false,
        reasons: [`publication-gate-error:${clean(error?.message || String(error))}`],
        reasonCodes: [`publication-gate-error:${clean(error?.message || String(error))}`],
        checkedAt: new Date().toISOString(),
      };
    }
    record.v2PublicationStatus = publicationGate.status;
    try {
      if (readyPool?.enabled?.()) {
        readyPoolWrite = readyPool.applyEvaluation({ routeRecord: record, publicationGate });
      }
    } catch (error) {
      readyPoolWrite = { persisted: false, skipped: false, reason: "ready-pool-write-failed", error: clean(error?.message || String(error)) };
    }
  }

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
    destinationSource: record.destinationSource,
    decisionTrace: traceWrite,
    ...(candidateSidecar?.selection?.validationResults?.length
      ? { candidateEvidenceValidations: structuredClone(candidateSidecar.selection.validationResults) }
      : {}),
    ...(evidenceBundleLifecycle?.enabled === true ? { evidenceBundleLifecycle } : {}),
    ...(publicationGate ? { publicationGate } : {}),
    ...(readyPoolWrite ? { readyPoolWrite } : {}),
    ...(v2Failure ? { v2Failure } : {}),
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

export function createRouteCompositionPlanner({ evidenceRepository, acceptedRepository, strategyRegistry = null, knowledgeGraph = null, llmRefineProvider = null, webEvidencePipeline = null, decisionTraceStore = null, candidatePoolStore = null, evidenceBundleStore = null, localEvidenceRepository = null, publicationGateEvaluator = evaluateRouteV2Publication, readyPool = null, routeCandidateBuilder = buildRouteCandidatesFromPool, candidateEvidenceValidator = validateRouteForUse, localEvidenceSidecar = writeLocalEvidenceSidecarSafe, localEvidenceCollector = null, env = process.env } = {}) {
  if (!evidenceRepository?.bySourceRoute) throw new Error("EVIDENCE_REPOSITORY_REQUIRED");
  if (!acceptedRepository?.list) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  const traceStore = decisionTraceStore || createDecisionTraceStore({ env });
  const sidecarCandidatePoolStore = candidatePoolStore || createRouteCandidatePoolStore({ env });
  const sidecarEvidenceBundleStore = evidenceBundleStore || createEvidenceBundleStore({ env });
  const sidecarLocalEvidenceRepository = localEvidenceRepository || createLocalEvidenceRepository({ env });
  const sidecarReadyPool = readyPool || createRouteV2ReadyPool({ env });
  return {
    async buildCandidates({ limit = 5, context = null } = {}) {
      // 新管线模式：有 context（{durationDays, country, style, ...}）走知识图驱动（async，含 LLM 节点）
      if (context && (context.country || context.durationDays || context.travelStyle)) {
        return runPipeline({ context, knowledgeGraph, evidenceRepository, acceptedRepository, strategyRegistry, llmRefineProvider, webEvidencePipeline, decisionTraceStore: traceStore, candidatePoolStore: sidecarCandidatePoolStore, evidenceBundleStore: sidecarEvidenceBundleStore, localEvidenceRepository: sidecarLocalEvidenceRepository, publicationGateEvaluator, readyPool: sidecarReadyPool, routeCandidateBuilder, candidateEvidenceValidator, localEvidenceSidecar, localEvidenceCollector, env, limit });
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
