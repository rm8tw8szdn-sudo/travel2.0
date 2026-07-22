import crypto from "node:crypto";
import { envFlag } from "./route-v2-env.mjs";

export const ROUTE_V2_TIME_INTENT_FLAG = "ROUTE_V2_TIME_INTENT_ENABLED";
export const ROUTE_V2_TIME_INTENT_TYPES = new Set([
  "unspecified",
  "single-month",
  "month-range",
  "season-only",
  "invalid",
]);
export const ROUTE_V2_INTENT_MODES = new Set([
  "specified-destination",
  "destination-suggestion",
  "invalid-time-intent",
  "insufficient-intent",
]);

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeText(value) {
  return clean(value).toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function includesAny(haystack, aliases = []) {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) return false;
    if (/^[a-z0-9]{1,3}$/u.test(normalizedAlias)) {
      const tokens = haystack.split(/[^a-z0-9]+/u).filter(Boolean);
      return tokens.includes(normalizedAlias);
    }
    return haystack.includes(normalizedAlias);
  });
}

const COUNTRY_CATALOG = [
  { code: "JP", label: "日本", normalizedLabel: "japan", aliases: ["日本", "日本国", "japan", "jp", "nihon"] },
  { code: "IS", label: "冰岛", normalizedLabel: "iceland", aliases: ["冰岛", "iceland"] },
  { code: "TR", label: "土耳其", normalizedLabel: "turkey", aliases: ["土耳其", "turkey", "turkiye", "türkiye"] },
  { code: "MA", label: "摩洛哥", normalizedLabel: "morocco", aliases: ["摩洛哥", "morocco", "marrakech", "marrakesh"] },
  { code: "EH", label: "西撒哈拉", normalizedLabel: "western sahara", aliases: ["西撒哈拉", "western sahara"] },
  { code: "GB", label: "英国", normalizedLabel: "united kingdom", aliases: ["英国", "英格兰", "苏格兰", "uk", "britain", "united kingdom", "england", "scotland"] },
  { code: "FR", label: "法国", normalizedLabel: "france", aliases: ["法国", "france", "paris"] },
  { code: "IT", label: "意大利", normalizedLabel: "italy", aliases: ["意大利", "italy", "rome"] },
  { code: "GR", label: "希腊", normalizedLabel: "greece", aliases: ["希腊", "greece"] },
  { code: "CH", label: "瑞士", normalizedLabel: "switzerland", aliases: ["瑞士", "switzerland", "swiss"] },
  { code: "AT", label: "奥地利", normalizedLabel: "austria", aliases: ["奥地利", "austria"] },
  { code: "ES", label: "西班牙", normalizedLabel: "spain", aliases: ["西班牙", "spain"] },
  { code: "PT", label: "葡萄牙", normalizedLabel: "portugal", aliases: ["葡萄牙", "portugal"] },
  { code: "DE", label: "德国", normalizedLabel: "germany", aliases: ["德国", "germany"] },
  { code: "CZ", label: "捷克", normalizedLabel: "czechia", aliases: ["捷克", "捷克共和国", "czech", "czechia"] },
  { code: "HU", label: "匈牙利", normalizedLabel: "hungary", aliases: ["匈牙利", "hungary"] },
  { code: "CN", label: "中国", normalizedLabel: "china", aliases: ["中国", "china", "北京", "上海", "西安", "成都", "云南", "新疆", "西藏", "杭州", "广州", "深圳"] },
];

const CITY_CATALOG = [
  { label: "东京", normalizedLabel: "tokyo", countryCode: "JP", aliases: ["东京", "東京", "tokyo"], wikidataId: "Q1490" },
  { label: "大阪", normalizedLabel: "osaka", countryCode: "JP", aliases: ["大阪", "osaka"], wikidataId: "Q35765" },
  { label: "京都", normalizedLabel: "kyoto", countryCode: "JP", aliases: ["京都", "kyoto"], wikidataId: "Q34600" },
  { label: "奈良", normalizedLabel: "nara", countryCode: "JP", aliases: ["奈良", "nara"], wikidataId: "Q169134" },
  { label: "富士山", normalizedLabel: "mount fuji", countryCode: "JP", aliases: ["富士山", "mt fuji", "mount fuji", "fuji"], wikidataId: "Q39231" },
  { label: "雷克雅未克", normalizedLabel: "reykjavik", countryCode: "IS", aliases: ["雷克雅未克", "reykjavik", "reykjavík"] },
  { label: "黄金圈", normalizedLabel: "golden circle", countryCode: "IS", aliases: ["黄金圈", "golden circle"] },
  { label: "卡帕多奇亚", normalizedLabel: "cappadocia", countryCode: "TR", aliases: ["卡帕多奇亚", "cappadocia"] },
  { label: "伊斯坦布尔", normalizedLabel: "istanbul", countryCode: "TR", aliases: ["伊斯坦布尔", "istanbul"] },
  { label: "格雷梅", normalizedLabel: "goreme", countryCode: "TR", aliases: ["格雷梅", "goreme", "göreme"] },
  { label: "马拉喀什", normalizedLabel: "marrakech", countryCode: "MA", aliases: ["马拉喀什", "马拉凯什", "marrakech", "marrakesh"] },
  { label: "菲斯", normalizedLabel: "fes", countryCode: "MA", aliases: ["菲斯", "非斯", "fes", "fez"] },
  { label: "舍夫沙万", normalizedLabel: "chefchaouen", countryCode: "MA", aliases: ["舍夫沙万", "chefchaouen"] },
  { label: "伦敦", normalizedLabel: "london", countryCode: "GB", aliases: ["伦敦", "london"] },
  { label: "巴黎", normalizedLabel: "paris", countryCode: "FR", aliases: ["巴黎", "paris"] },
  { label: "罗马", normalizedLabel: "rome", countryCode: "IT", aliases: ["罗马", "rome"] },
];

const REGION_CATALOG = [
  { label: "撒哈拉", normalizedLabel: "sahara", countryCode: "MA", aliases: ["撒哈拉", "撒哈拉沙漠", "西撒哈拉", "sahara", "western sahara", "desert"] },
  { label: "关西", normalizedLabel: "kansai", countryCode: "JP", aliases: ["关西", "kansai"] },
  { label: "北海道", normalizedLabel: "hokkaido", countryCode: "JP", aliases: ["北海道", "hokkaido"] },
  { label: "黄金圈", normalizedLabel: "golden circle", countryCode: "IS", aliases: ["黄金圈", "golden circle"] },
  { label: "卡帕多奇亚", normalizedLabel: "cappadocia", countryCode: "TR", aliases: ["卡帕多奇亚", "cappadocia"] },
];

const STYLE_CATALOG = [
  { key: "classic-first-trip", label: "第一次", aliases: ["第一次", "首次", "初次", "入门", "经典", "经典首访", "classic", "first trip", "first-time"] },
  { key: "road-trip", label: "自驾", aliases: ["自驾", "公路", "road trip", "roadtrip", "drive", "driving"] },
  { key: "rail-journey", label: "铁路", aliases: ["铁路", "火车", "列车", "rail", "train"] },
  { key: "seasonal", label: "季节限定", aliases: ["樱花", "红叶", "极光", "冬季", "夏季", "春季", "秋季", "seasonal"] },
  { key: "theme", label: "主题旅行", aliases: ["摄影", "热气球", "葡萄酒", "美食", "建筑", "主题", "photography", "balloon", "wine", "food"] },
  { key: "deep-dive", label: "深度", aliases: ["深度", "小众", "慢游", "deep dive"] },
];

const THEME_CATALOG = [
  { key: "sakura", label: "樱花", aliases: ["樱花", "sakura", "cherry blossom"] },
  { key: "aurora", label: "极光", aliases: ["极光", "aurora", "northern lights"] },
  { key: "hot-air-balloon", label: "热气球", aliases: ["热气球", "hot air balloon", "balloon"] },
  { key: "photography", label: "摄影", aliases: ["摄影", "拍照", "photography", "photo"] },
  { key: "food", label: "美食", aliases: ["美食", "food", "gourmet"] },
  { key: "wine", label: "葡萄酒", aliases: ["葡萄酒", "酒庄", "wine"] },
  { key: "desert", label: "沙漠", aliases: ["沙漠", "撒哈拉", "desert", "sahara"] },
];

const SEASON_CATALOG = [
  { key: "spring", label: "春季", aliases: ["春季", "春天", "樱花", "spring"] },
  { key: "summer", label: "夏季", aliases: ["夏季", "夏天", "summer"] },
  { key: "autumn", label: "秋季", aliases: ["秋季", "秋天", "红叶", "autumn", "fall"] },
  { key: "winter", label: "冬季", aliases: ["冬季", "冬天", "雪", "极光", "winter"] },
];

const ENGLISH_MONTHS = new Map([
  ["january", 1], ["jan", 1],
  ["february", 2], ["feb", 2],
  ["march", 3], ["mar", 3],
  ["april", 4], ["apr", 4],
  ["may", 5],
  ["june", 6], ["jun", 6],
  ["july", 7], ["jul", 7],
  ["august", 8], ["aug", 8],
  ["september", 9], ["sep", 9], ["sept", 9],
  ["october", 10], ["oct", 10],
  ["november", 11], ["nov", 11],
  ["december", 12], ["dec", 12],
]);
const ENGLISH_MONTH_PATTERN = [...ENGLISH_MONTHS.keys()]
  .sort((left, right) => right.length - left.length)
  .join("|");

function timeDiagnostic(entry = {}) {
  return {
    code: clean(entry.code),
    message: clean(entry.message),
    rawValue: clean(entry.rawValue),
  };
}

function validMonth(value) {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function monthSpan(from, to) {
  const start = validMonth(from);
  const end = validMonth(to);
  if (!start || !end) return [];
  const months = [start];
  let current = start;
  while (current !== end && months.length < 12) {
    current = current === 12 ? 1 : current + 1;
    months.push(current);
  }
  return months;
}

export function normalizeTimeIntent(input = {}) {
  const requestedType = clean(input.type || "unspecified");
  const diagnostics = (Array.isArray(input.diagnostics) ? input.diagnostics : []).map(timeDiagnostic);
  const rawMonths = Array.isArray(input.months) ? input.months : [];
  const invalidMonths = rawMonths.filter((value) => validMonth(value) == null);
  const months = [...new Set(rawMonths.map(validMonth).filter(Boolean))];
  if (!ROUTE_V2_TIME_INTENT_TYPES.has(requestedType) || invalidMonths.length) {
    return {
      type: "invalid",
      months: [],
      season: null,
      rawText: clean(input.rawText),
      diagnostics: [
        ...diagnostics,
        ...(!ROUTE_V2_TIME_INTENT_TYPES.has(requestedType)
          ? [timeDiagnostic({ code: "invalid-time-intent-type", message: "Time intent type is not supported.", rawValue: requestedType })]
          : []),
        ...(invalidMonths.length
          ? [timeDiagnostic({ code: "invalid-month", message: "Month must be between 1 and 12.", rawValue: invalidMonths.join(",") })]
          : []),
      ],
    };
  }
  if (requestedType === "single-month" && months.length !== 1) {
    return normalizeTimeIntent({ type: "invalid", rawText: input.rawText, diagnostics: [...diagnostics, { code: "single-month-cardinality", message: "Single-month intent requires exactly one month." }] });
  }
  if (requestedType === "month-range" && months.length < 2) {
    return normalizeTimeIntent({ type: "invalid", rawText: input.rawText, diagnostics: [...diagnostics, { code: "month-range-cardinality", message: "Month-range intent requires at least two months." }] });
  }
  if (["unspecified", "season-only", "invalid"].includes(requestedType)) months.length = 0;
  return {
    type: requestedType,
    months,
    season: requestedType === "season-only" ? clean(input.season) || null : null,
    rawText: clean(input.rawText),
    diagnostics,
  };
}

export function parseTimeIntent(value = "") {
  const rawQuery = clean(value);
  const normalizedQuery = normalizeText(rawQuery);
  const chineseMonthTokens = [...rawQuery.matchAll(/(?<!\d)(\d{1,2})\s*月/gu)];
  const invalidChineseMonth = chineseMonthTokens.find((match) => validMonth(match[1]) == null);
  if (invalidChineseMonth) {
    return normalizeTimeIntent({
      type: "invalid",
      rawText: invalidChineseMonth[0],
      diagnostics: [{
        code: "invalid-month",
        message: "Month must be between 1 and 12.",
        rawValue: invalidChineseMonth[0],
      }],
    });
  }

  const chineseRange = rawQuery.match(/(?<!\d)(\d{1,2})\s*月\s*(?:至|到|[-–—])\s*(\d{1,2})\s*月/u);
  if (chineseRange) {
    return normalizeTimeIntent({
      type: "month-range",
      months: monthSpan(chineseRange[1], chineseRange[2]),
      rawText: chineseRange[0],
      diagnostics: [],
    });
  }

  const englishRangePattern = new RegExp(`\\b(${ENGLISH_MONTH_PATTERN})\\b\\s*(?:to|through|[-–—])\\s*\\b(${ENGLISH_MONTH_PATTERN})\\b`, "iu");
  const englishRange = rawQuery.match(englishRangePattern);
  if (englishRange) {
    return normalizeTimeIntent({
      type: "month-range",
      months: monthSpan(ENGLISH_MONTHS.get(englishRange[1].toLocaleLowerCase("en-US")), ENGLISH_MONTHS.get(englishRange[2].toLocaleLowerCase("en-US"))),
      rawText: englishRange[0],
      diagnostics: [],
    });
  }

  const explicitChineseMonths = chineseMonthTokens.map((match) => validMonth(match[1])).filter(Boolean);
  if (explicitChineseMonths.length) {
    const months = [...new Set(explicitChineseMonths)];
    return normalizeTimeIntent({
      type: months.length === 1 ? "single-month" : "month-range",
      months,
      rawText: chineseMonthTokens.map((match) => match[0]).join(" "),
      diagnostics: [],
    });
  }

  const englishMonthPattern = new RegExp(`\\b(${ENGLISH_MONTH_PATTERN})\\b`, "giu");
  const englishMonthTokens = [...rawQuery.matchAll(englishMonthPattern)];
  if (englishMonthTokens.length) {
    const months = [...new Set(englishMonthTokens.map((match) => ENGLISH_MONTHS.get(match[1].toLocaleLowerCase("en-US"))).filter(Boolean))];
    return normalizeTimeIntent({
      type: months.length === 1 ? "single-month" : "month-range",
      months,
      rawText: englishMonthTokens.map((match) => match[0]).join(" "),
      diagnostics: [],
    });
  }

  const season = firstMatch(normalizedQuery, SEASON_CATALOG);
  if (season) {
    const rawSeason = season.aliases.find((alias) => includesAny(normalizedQuery, [alias])) || season.label;
    return normalizeTimeIntent({
      type: "season-only",
      months: [],
      season: season.key,
      rawText: rawSeason,
      diagnostics: [],
    });
  }
  return normalizeTimeIntent({ type: "unspecified", months: [], season: null, rawText: "", diagnostics: [] });
}

export function isRouteV2TimeIntentEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_TIME_INTENT_FLAG, false);
}

const TRANSPORT_CATALOG = [
  { key: "self-drive", label: "自驾", aliases: ["自驾", "租车", "开车", "road trip", "drive", "driving"] },
  { key: "rail", label: "铁路", aliases: ["铁路", "火车", "列车", "rail", "train"] },
  { key: "ferry", label: "轮渡", aliases: ["轮渡", "渡轮", "ferry"] },
  { key: "cycling", label: "骑行", aliases: ["骑行", "自行车", "cycling", "bike"] },
];

function matchesFromCatalog(query, catalog) {
  return catalog.filter((item) => includesAny(query, item.aliases));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function cityIdentity(city = {}) {
  return clean(city.wikidataId || city.entityId)
    || `${clean(city.countryCode).toUpperCase()}:${clean(city.normalizedLabel || city.label).toLocaleLowerCase("en-US")}`;
}

function aliasOccurrences(query, alias) {
  const normalizedQuery = normalizeText(query);
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return [];
  if (/^[a-z0-9][a-z0-9\s.-]*$/u.test(normalizedAlias)) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizedAlias)}(?![a-z0-9])`, "giu");
    return [...normalizedQuery.matchAll(pattern)].map((match) => ({
      index: match.index,
      end: Number(match.index) + match[0].length,
      rawValue: match[0],
    }));
  }
  const occurrences = [];
  let index = normalizedQuery.indexOf(normalizedAlias);
  while (index >= 0) {
    occurrences.push({ index, end: index + normalizedAlias.length, rawValue: normalizedQuery.slice(index, index + normalizedAlias.length) });
    index = normalizedQuery.indexOf(normalizedAlias, index + normalizedAlias.length);
  }
  return occurrences;
}

function hasFixedDestinationOrderSyntax(query, requiredCount) {
  if (requiredCount < 2) return false;
  const normalized = normalizeText(query);
  return /(?:→|->|⇒|➜)/u.test(query)
    || /先.+(?:然后|再去|再到).+(?:最后|然后|再去|再到)/u.test(query)
    || /到.+(?:再去|然后|再到)/u.test(query)
    || /\bto\b.+\bthen\b/iu.test(normalized);
}

function unknownCityTokenDiagnostics(query, occurrences, cityCatalog, countryCatalog) {
  const hasExplicitSeparator = /(?:、|，|,|→|->|⇒|➜|\s|到|再去|再到|然后|最后|先|\bto\b|\bthen\b)/iu.test(query);
  if (!hasExplicitSeparator || occurrences.length === 0) return [];
  let residual = clean(query)
    .replace(/\d{1,2}\s*(?:天|日|days?|day|d)\b/giu, " ")
    .replace(/\d{1,2}\s*月/gu, " ");
  const knownAliases = [
    ...cityCatalog.flatMap((city) => city.aliases || []),
    ...countryCatalog.flatMap((country) => country.aliases || []),
  ].map(clean).filter(Boolean).sort((left, right) => right.length - left.length);
  for (const alias of knownAliases) residual = residual.replace(new RegExp(escapeRegExp(alias), "giu"), " ");
  const tokens = residual
    .split(/(?:、|，|,|→|->|⇒|➜|\s+|到|再去|再到|然后|最后|先|\bto\b|\bthen\b)/iu)
    .map((token) => clean(token).replace(/^(?:去|游|旅行|路线)+|(?:去|游|旅行|路线)+$/gu, ""))
    .filter((token) => token.length >= 2 && /[\p{L}\p{Script=Han}]/u.test(token));
  return unique(tokens).map((rawValue) => ({
    code: "unknown-city-token",
    message: "Explicit destination token did not match the known city catalog.",
    rawValue,
  }));
}

function extractRequiredDestinations(query, cityCatalog, countryCatalog) {
  const rawOccurrences = [];
  for (const city of cityCatalog) {
    for (const alias of unique([city.label, city.normalizedLabel, ...(city.aliases || [])])) {
      for (const occurrence of aliasOccurrences(query, alias)) {
        rawOccurrences.push({ ...occurrence, city, identity: cityIdentity(city), alias: clean(alias) });
      }
    }
  }
  rawOccurrences.sort((left, right) => left.index - right.index
    || (right.end - right.index) - (left.end - left.index)
    || left.identity.localeCompare(right.identity, "en"));
  const occurrenceKeys = new Set();
  const occurrences = rawOccurrences.filter((entry) => {
    const key = `${entry.identity}:${entry.index}:${entry.end}`;
    if (occurrenceKeys.has(key)) return false;
    occurrenceKeys.add(key);
    return true;
  });
  const byIdentity = new Map();
  const diagnostics = [];
  for (const occurrence of occurrences) {
    const existing = byIdentity.get(occurrence.identity);
    if (existing) {
      if (existing.index !== occurrence.index) {
        diagnostics.push({
          code: "duplicate-required-destination",
          message: "Duplicate required city was removed while preserving its first occurrence.",
          rawValue: occurrence.rawValue,
          destinationId: occurrence.identity,
        });
      }
      continue;
    }
    byIdentity.set(occurrence.identity, occurrence);
  }
  const required = [...byIdentity.values()].sort((left, right) => left.index - right.index);
  diagnostics.push(...unknownCityTokenDiagnostics(query, required, cityCatalog, countryCatalog));
  return {
    required,
    diagnostics,
    destinationOrderMode: required.length >= 2
      ? hasFixedDestinationOrderSyntax(query, required.length) ? "fixed" : "flexible"
      : "unspecified",
  };
}

function firstMatch(query, catalog) {
  return matchesFromCatalog(query, catalog)[0] || null;
}

function mergeCatalog(base = [], additions = [], identity) {
  const merged = [];
  const seen = new Set();
  for (const item of [...base, ...(Array.isArray(additions) ? additions : [])]) {
    if (!item || typeof item !== "object") continue;
    const key = clean(identity(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function parseDuration(query, { allowBareNumber = false } = {}) {
  const compact = query.replace(/\s+/g, "");
  const match = compact.match(/(\d{1,2})(?:天|日|days?|day|d)/iu)
    || (allowBareNumber ? compact.match(/^(\d{1,2})$/u) : null);
  if (!match) return null;
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) && days > 0 && days <= 60 ? days : null;
}

function durationBand(days) {
  if (!days) return "";
  if (days <= 3) return "1-3d";
  if (days <= 6) return "4-6d";
  if (days <= 10) return "7-10d";
  if (days <= 14) return "10-14d";
  return "15d+";
}

function inferTripIntent(query, style) {
  if (style?.key === "classic-first-trip") return "first-trip";
  if (includesAny(query, ["亲子", "family"])) return "family";
  if (includesAny(query, ["蜜月", "honeymoon"])) return "honeymoon";
  return "";
}

function constraintCount(intent) {
  return [
    intent.countryCode,
    intent.region,
    intent.cities.length ? "city" : "",
    intent.durationDays,
    intent.timeIntent && intent.timeIntent.type !== "unspecified" ? intent.timeIntent.type : intent.season,
    intent.theme,
    intent.travelStyle,
    intent.transport,
    intent.tripIntent,
    intent.pace,
    intent.budget,
  ].filter(Boolean).length;
}

export function targetResultCountForConstraintLevel(count) {
  if (count >= 4) return 2;
  if (count === 3) return 4;
  if (count === 2) return 6;
  return 10;
}

export function normalizeIntentKey(intent = {}) {
  const payload = {
    ...(intent.intentMode ? { intentMode: clean(intent.intentMode) } : {}),
    countryCode: clean(intent.countryCode),
    region: clean(intent.normalizedRegion || intent.region),
    cities: unique(intent.normalizedCities || intent.cities).sort(),
    ...((intent.requiredDestinationIds || []).length ? {
      requiredDestinationIds: unique(intent.requiredDestinationIds),
      destinationOrderMode: clean(intent.destinationOrderMode || "unspecified"),
    } : {}),
    durationDays: intent.durationDays || null,
    season: clean(intent.seasonKey || intent.season),
    theme: clean(intent.themeKey || intent.theme),
    travelStyle: clean(intent.travelStyle),
    tripIntent: clean(intent.tripIntent),
    transport: clean(intent.transport),
    pace: clean(intent.pace),
    budget: clean(intent.budget),
    ...(intent.timeIntent ? {
      timeIntent: {
        type: clean(intent.timeIntent.type),
        months: [...(Array.isArray(intent.timeIntent.months) ? intent.timeIntent.months : [])],
        season: clean(intent.timeIntent.season),
        ...(intent.timeIntent.type === "invalid" ? { rawText: clean(intent.timeIntent.rawText) } : {}),
      },
    } : {}),
  };
  return JSON.stringify(payload);
}

export function hashIntentKey(intentKey) {
  return crypto.createHash("sha256").update(String(intentKey || "")).digest("hex").slice(0, 24);
}

export function createSearchSuggestions({ query = "", acceptedRoutes = [], catalogs = null } = {}) {
  const normalized = normalizeText(query);
  const countryCatalog = mergeCatalog(COUNTRY_CATALOG, catalogs?.countries, (item) => item.code);
  const cityCatalog = mergeCatalog(CITY_CATALOG, catalogs?.cities, (item) => `${item.countryCode}:${item.normalizedLabel}`);
  const candidates = [
    "撒哈拉", "撒哈拉沙漠", "摩洛哥撒哈拉", "西撒哈拉骑行",
    "日本", "日本第一次", "日本经典", "日本铁路", "日本自驾", "日本樱花",
    "冰岛", "冰岛自驾", "冰岛极光", "冰岛黄金圈",
    "土耳其", "土耳其热气球摄影", "卡帕多奇亚热气球",
    ...countryCatalog.filter((item) => item.code !== "CN").map((item) => item.label),
    ...cityCatalog.map((item) => item.label),
    ...REGION_CATALOG.map((item) => item.label),
    ...STYLE_CATALOG.map((item) => item.label),
    ...THEME_CATALOG.map((item) => item.label),
    ...SEASON_CATALOG.map((item) => item.label),
    ...(acceptedRoutes || []).flatMap((route) => [
      route?.name,
      route?.canonicalTitle,
      ...(route?.countries || []),
      ...(route?.destinations || []),
      ...(route?.themes || []),
      route?.travelStyle,
    ]),
  ].map(clean).filter(Boolean);
  const uniqueCandidates = unique(candidates);
  if (!normalized) return uniqueCandidates.slice(0, 8);
  const prefixMatches = uniqueCandidates.filter((item) => normalizeText(item).startsWith(normalized));
  const containsMatches = uniqueCandidates.filter((item) => !prefixMatches.includes(item) && normalizeText(item).includes(normalized));
  const matches = [...prefixMatches, ...containsMatches].slice(0, 8);
  return matches.length ? matches : uniqueCandidates.slice(0, 8);
}

export function parseSearchIntent(query, { acceptedRoutes = [], catalogs = null, timeIntentEnabled = false } = {}) {
  const rawQuery = clean(query);
  const normalizedQuery = normalizeText(rawQuery);
  const durationDays = parseDuration(normalizedQuery, { allowBareNumber: timeIntentEnabled });
  const countryCatalog = mergeCatalog(COUNTRY_CATALOG, catalogs?.countries, (item) => item.code);
  const cityCatalog = mergeCatalog(CITY_CATALOG, catalogs?.cities, (item) => `${item.countryCode}:${item.normalizedLabel}`);
  const extractedDestinations = timeIntentEnabled
    ? extractRequiredDestinations(rawQuery, cityCatalog, countryCatalog)
    : { required: [], diagnostics: [] };
  let requiredOccurrences = extractedDestinations.required;
  let matchedCities = timeIntentEnabled
    ? requiredOccurrences.map((entry) => entry.city)
    : matchesFromCatalog(normalizedQuery, cityCatalog);
  const matchedRegion = firstMatch(normalizedQuery, REGION_CATALOG);
  let matchedCountry = firstMatch(normalizedQuery, countryCatalog);
  if (matchedCountry && matchedCities.length && !timeIntentEnabled) {
    matchedCities = matchedCities.filter((item) => item.countryCode === matchedCountry.code);
  }
  if (!matchedCountry && matchedCities.length) {
    matchedCountry = countryCatalog.find((item) => item.code === matchedCities[0].countryCode) || null;
  }
  if (!matchedCountry && matchedRegion?.countryCode) {
    matchedCountry = countryCatalog.find((item) => item.code === matchedRegion.countryCode) || null;
  }
  const style = firstMatch(normalizedQuery, STYLE_CATALOG);
  const theme = firstMatch(normalizedQuery, THEME_CATALOG);
  const season = firstMatch(normalizedQuery, SEASON_CATALOG);
  const transport = firstMatch(normalizedQuery, TRANSPORT_CATALOG);
  const timeIntent = timeIntentEnabled ? parseTimeIntent(rawQuery) : null;
  const intent = {
    rawQuery,
    normalizedQuery,
    countryCode: matchedCountry?.code || "",
    country: matchedCountry?.label || "",
    normalizedCountry: matchedCountry?.normalizedLabel || "",
    region: matchedRegion?.label || "",
    normalizedRegion: matchedRegion?.normalizedLabel || "",
    cities: unique(matchedCities.map((item) => item.label)),
    normalizedCities: unique(matchedCities.map((item) => item.normalizedLabel)),
    ...(timeIntentEnabled ? {
      requiredDestinationIds: requiredOccurrences.map((entry) => clean(entry.city.wikidataId || entry.city.entityId || entry.identity)),
      requiredDestinationNames: requiredOccurrences.map((entry) => clean(entry.city.label || entry.city.normalizedLabel)),
      requiredDestinationRaw: requiredOccurrences.map((entry) => clean(entry.rawValue)),
      destinationOrderMode: requiredOccurrences.length >= 2
        ? hasFixedDestinationOrderSyntax(rawQuery, requiredOccurrences.length) ? "fixed" : "flexible"
        : "unspecified",
      destinationDiagnostics: extractedDestinations.diagnostics,
    } : {}),
    durationDays,
    durationBand: durationBand(durationDays),
    travelStyle: style?.key || "",
    travelStyleLabel: style?.label || "",
    tripIntent: inferTripIntent(normalizedQuery, style),
    season: season?.label || "",
    seasonKey: season?.key || "",
    theme: theme?.label || "",
    themeKey: theme?.key || "",
    transport: transport?.key || "",
    transportLabel: transport?.label || "",
    pace: includesAny(normalizedQuery, ["慢", "慢游", "relaxed"]) ? "relaxed" : "",
    budget: "",
    ...(timeIntentEnabled ? { timeIntent } : {}),
  };
  intent.constraintCount = constraintCount(intent);
  intent.targetResultCount = targetResultCountForConstraintLevel(intent.constraintCount);
  intent.isChinaBlocked = intent.countryCode === "CN";
  if (timeIntentEnabled) {
    const destinationSpecified = Boolean(intent.countryCode || intent.region || intent.cities.length);
    const invalidTime = timeIntent.type === "invalid";
    const hasUsableCondition = intent.constraintCount > 0;
    intent.destinationUnspecified = !destinationSpecified;
    intent.intentMode = invalidTime
      ? "invalid-time-intent"
      : !hasUsableCondition
        ? "insufficient-intent"
        : destinationSpecified
          ? "specified-destination"
          : "destination-suggestion";
    intent.insufficientDestination = intent.intentMode === "insufficient-intent" && !destinationSpecified;
    intent.failureReason = intent.intentMode === "invalid-time-intent"
      ? "invalid-time-intent"
      : intent.intentMode === "insufficient-intent"
        ? "insufficient-intent"
        : "";
    intent.parseSuccess = Boolean(!intent.isChinaBlocked && !["invalid-time-intent", "insufficient-intent"].includes(intent.intentMode));
    intent.canGenerate = intent.parseSuccess;
  } else {
    intent.parseSuccess = Boolean(intent.constraintCount > 0 && !intent.isChinaBlocked);
    intent.canGenerate = Boolean(intent.parseSuccess && intent.countryCode && !intent.isChinaBlocked);
  }
  intent.intentKey = normalizeIntentKey(intent);
  intent.intentHash = hashIntentKey(intent.intentKey);
  intent.suggestions = createSearchSuggestions({ query: rawQuery, acceptedRoutes, catalogs });
  return intent;
}

export const SEARCH_INTENT_CATALOGS = {
  countries: COUNTRY_CATALOG,
  cities: CITY_CATALOG,
  regions: REGION_CATALOG,
  styles: STYLE_CATALOG,
  themes: THEME_CATALOG,
  seasons: SEASON_CATALOG,
  transports: TRANSPORT_CATALOG,
};
