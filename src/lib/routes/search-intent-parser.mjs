import crypto from "node:crypto";
import { envFlag } from "./route-v2-env.mjs";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  createRouteIntentFingerprint,
} from "./route-intent-model.mjs";
import { resolveRouteTripCapacity } from "./route-trip-capacity.mjs";
import { ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS } from "./route-search-region-taxonomy.mjs";

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
  "invalid-duration-intent",
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

const ALIAS_MATCHER_CACHE = new Map();

function aliasMatcher(alias) {
  const cacheKey = String(alias || "");
  if (ALIAS_MATCHER_CACHE.has(cacheKey)) return ALIAS_MATCHER_CACHE.get(cacheKey);
  const normalizedAlias = normalizeText(cacheKey);
  let matcher = null;
  if (normalizedAlias) {
    matcher = /^[a-z0-9][a-z0-9 .'-]*$/u.test(normalizedAlias)
      ? new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalizedAlias)}(?:$|[^a-z0-9])`, "iu")
      : normalizedAlias;
  }
  ALIAS_MATCHER_CACHE.set(cacheKey, matcher);
  return matcher;
}

function includesAny(haystack, aliases = []) {
  return aliases.some((alias) => {
    const matcher = aliasMatcher(alias);
    if (!matcher) return false;
    return matcher instanceof RegExp ? matcher.test(haystack) : haystack.includes(matcher);
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
  ...ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS.map((definition) => ({
    ...definition,
    normalizedLabel: definition.key,
    countryCode: definition.parentCountryCode,
    countryCodes: [definition.parentCountryCode],
    supported: definition.knownDestinationIds.length > 0,
  })),
];

const STYLE_CATALOG = [
  { key: "road-trip", label: "环岛自驾", aliases: ["环岛", "環島", "ring road", "island circuit", "loop"] },
  { key: "island-hopping", label: "海岛度假", aliases: ["海岛", "海島", "跳岛", "跳島", "海岛度假", "海島度假", "island hopping", "island vacation", "island holiday", "beach vacation"] },
  { key: "city-break", label: "城市短途", aliases: ["周末短途", "周末旅行", "城市漫游", "城市漫遊", "city walk", "citywalk", "weekend trip", "weekend getaway", "weekend break"] },
  { key: "classic-first-trip", label: "第一次", aliases: ["第一次", "首次", "初次", "入门", "经典", "经典首访", "classic", "first trip", "first-time"] },
  { key: "road-trip", label: "自驾", aliases: ["自驾", "公路", "road trip", "roadtrip", "drive", "driving"] },
  { key: "rail-journey", label: "铁路", aliases: ["铁路", "火车", "列车", "rail", "train"] },
  { key: "seasonal", label: "季节限定", aliases: ["樱花", "红叶", "极光", "冬季", "夏季", "春季", "秋季", "seasonal"] },
  { key: "theme", label: "主题旅行", aliases: ["摄影", "热气球", "葡萄酒", "美食", "建筑", "主题", "photography", "balloon", "wine", "food"] },
  { key: "deep-dive", label: "深度", aliases: ["深度", "小众", "慢游", "deep dive"] },
];

const THEME_CATALOG = [
  { key: "ring-road", label: "环岛", aliases: ["环岛", "環島", "ring road", "island circuit", "loop"] },
  { key: "self-drive", label: "自驾", aliases: ["自驾", "自駕", "租车", "租車", "road trip", "drive", "driving"] },
  { key: "island-vacation", label: "海岛度假", aliases: ["海岛", "海島", "跳岛", "跳島", "海岛度假", "海島度假", "island hopping", "island vacation", "island holiday", "beach vacation"] },
  { key: "weekend-short-trip", label: "周末短途", aliases: ["周末短途", "周末旅行", "weekend trip", "weekend getaway", "weekend break"] },
  { key: "honeymoon", label: "蜜月", aliases: ["蜜月", "honeymoon"] },
  { key: "family", label: "亲子", aliases: ["亲子", "親子", "家庭旅行", "family", "family trip"] },
  { key: "hiking", label: "徒步", aliases: ["徒步", "健行", "hiking", "trekking", "trek"] },
  { key: "citywalk", label: "城市漫游", aliases: ["城市漫游", "城市漫遊", "city walk", "citywalk", "urban walk"] },
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

function aliasOccurrences(query, alias, normalizedQueryInput = "") {
  const normalizedQuery = normalizedQueryInput || normalizeText(query);
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

function firstCatalogMatchOutsideRanges(query, catalog, occupiedRanges = []) {
  const matches = [];
  const normalizedQuery = normalizeText(query);
  for (const item of catalog) {
    for (const alias of unique([item.label, item.normalizedLabel, ...(item.aliases || [])])) {
      for (const occurrence of aliasOccurrences(query, alias, normalizedQuery)) {
        matches.push({ ...occurrence, item });
      }
    }
  }
  matches.sort((left, right) => left.index - right.index
    || (right.end - right.index) - (left.end - left.index));
  return matches.find((match) => !occupiedRanges.some((occupied) => (
    match.index >= occupied.index && match.end <= occupied.end
  )))?.item || null;
}

function extractCountryOccurrences(query, countryCatalog) {
  const rawOccurrences = [];
  const normalizedQuery = normalizeText(query);
  for (const country of countryCatalog) {
    const identity = clean(country.code).toUpperCase();
    for (const alias of unique([country.label, country.normalizedLabel, ...(country.aliases || [])])) {
      for (const occurrence of aliasOccurrences(query, alias, normalizedQuery)) {
        rawOccurrences.push({ ...occurrence, country, identity, alias: clean(alias) });
      }
    }
  }
  rawOccurrences.sort((left, right) => left.index - right.index
    || (right.end - right.index) - (left.end - left.index)
    || left.identity.localeCompare(right.identity, "en"));
  const acceptedRanges = [];
  const byIdentity = new Map();
  for (const occurrence of rawOccurrences) {
    if (byIdentity.has(occurrence.identity)) continue;
    if (acceptedRanges.some((accepted) => (
      occurrence.index >= accepted.index
      && occurrence.end <= accepted.end
      && occurrence.identity !== accepted.identity
    ))) continue;
    acceptedRanges.push(occurrence);
    byIdentity.set(occurrence.identity, occurrence);
  }
  return [...byIdentity.values()].sort((left, right) => left.index - right.index);
}

function hasFixedDestinationOrderSyntax(query, occurrencesOrCount) {
  const occurrences = Array.isArray(occurrencesOrCount)
    ? occurrencesOrCount
    : [];
  const requiredCount = occurrences.length || Number(occurrencesOrCount);
  if (requiredCount < 2) return false;
  if (occurrences.length) {
    for (let index = 1; index < occurrences.length; index += 1) {
      if (/(?:→|->|⇒|➜)/u.test(query.slice(occurrences[index - 1].end, occurrences[index].index))) return true;
    }
  } else if (/(?:→|->|⇒|➜)/u.test(query)) {
    return true;
  }
  const scopedQuery = occurrences.length
    ? query.slice(Math.max(0, occurrences[0].index - 4), occurrences[occurrences.length - 1].end)
    : query;
  const normalized = normalizeText(scopedQuery);
  return /先.+再(?:去|到)?.+/u.test(scopedQuery)
    || /先.+(?:然后|再(?:去|到)?).+(?:最后|然后|再(?:去|到)?)/u.test(scopedQuery)
    || /到.+(?:再去|然后|再到)/u.test(scopedQuery)
    || /\bto\b.+\bthen\b/iu.test(normalized);
}

function removeKnownAlias(text, alias) {
  const value = clean(alias);
  if (!value) return text;
  const latinAlias = /^[a-z0-9][a-z0-9 .'-]*$/iu.test(value);
  const pattern = latinAlias
    ? `(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`
    : escapeRegExp(value);
  return text.replace(new RegExp(pattern, "giu"), " ");
}

function explicitDestinationPrefix(query) {
  const source = clean(query);
  if (!/[A-Za-z]/u.test(source)) return source;
  const durationMatch = normalizeText(source).match(ENGLISH_DURATION_SLOT_PATTERN);
  return durationMatch && Number.isInteger(durationMatch.index)
    ? source.slice(0, durationMatch.index)
    : source;
}

function unknownCityTokenDiagnostics(query, occurrences, countryCatalog) {
  const hasExplicitSeparator = /(?:、|，|,|→|->|⇒|➜|\s|到|再去|再到|然后|最后|先|\bto\b|\bthen\b)/iu.test(query);
  if (!hasExplicitSeparator || occurrences.length === 0) return [];
  let residual = explicitDestinationPrefix(query)
    .replace(/[+-]?\d+(?:\.\d+)?\s*(?:天|日|days?|day|d)/giu, " ")
    .replace(/\d{1,2}\s*月/gu, " ");
  const knownAliases = [
    ...occurrences.flatMap(({ city }) => unique([
      city?.label,
      city?.normalizedLabel,
      ...(city?.aliases || []),
    ])),
    ...countryCatalog.flatMap((country) => country.aliases || []),
    ...REGION_CATALOG.flatMap((item) => item.aliases || []),
    ...STYLE_CATALOG.flatMap((item) => item.aliases || []),
    ...THEME_CATALOG.flatMap((item) => item.aliases || []),
    ...SEASON_CATALOG.flatMap((item) => item.aliases || []),
    ...TRANSPORT_CATALOG.flatMap((item) => item.aliases || []),
  ].map(clean).filter(Boolean).sort((left, right) => right.length - left.length);
  const normalizedResidual = normalizeText(residual);
  for (const alias of knownAliases) {
    if (normalizedResidual.includes(normalizeText(alias))) residual = removeKnownAlias(residual, alias);
  }
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

function isAmbiguousShortCityAlias(alias) {
  const normalized = normalizeText(alias).replace(/\s+/gu, "");
  return normalized.length < 2 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized);
}

function extractRequiredDestinations(query, cityCatalog, countryCatalog) {
  const rawOccurrences = [];
  const normalizedQuery = normalizeText(query);
  for (const city of cityCatalog) {
    for (const alias of unique([city.label, city.normalizedLabel, ...(city.aliases || [])])) {
      if (isAmbiguousShortCityAlias(alias)) continue;
      for (const occurrence of aliasOccurrences(query, alias, normalizedQuery)) {
        rawOccurrences.push({ ...occurrence, city, identity: cityIdentity(city), alias: clean(alias) });
      }
    }
  }
  rawOccurrences.sort((left, right) => left.index - right.index
    || (right.end - right.index) - (left.end - left.index)
    || left.identity.localeCompare(right.identity, "en"));
  const occurrenceKeys = new Set();
  const acceptedRanges = [];
  const occurrences = rawOccurrences.filter((entry) => {
    const key = `${entry.identity}:${entry.index}:${entry.end}`;
    if (occurrenceKeys.has(key)) return false;
    if (acceptedRanges.some((accepted) => (
      entry.index >= accepted.index
      && entry.end <= accepted.end
      && entry.identity !== accepted.identity
    ))) return false;
    occurrenceKeys.add(key);
    acceptedRanges.push(entry);
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
  diagnostics.push(...unknownCityTokenDiagnostics(query, required, countryCatalog));
  return {
    required,
    diagnostics,
    destinationOrderMode: required.length >= 2
      ? hasFixedDestinationOrderSyntax(query, required) ? "fixed" : "flexible"
      : "unspecified",
  };
}

function firstMatch(query, catalog) {
  return matchesFromCatalog(query, catalog)[0] || null;
}

function mergeCatalog(base = [], additions = [], identity) {
  const merged = new Map();
  for (const item of [...base, ...(Array.isArray(additions) ? additions : [])]) {
    if (!item || typeof item !== "object") continue;
    const key = clean(identity(item));
    if (!key) continue;
    const current = merged.get(key);
    merged.set(key, current
      ? {
          ...item,
          ...current,
          entityId: clean(item.entityId || current.entityId),
          wikidataId: clean(item.wikidataId || current.wikidataId),
          aliases: unique([...(current.aliases || []), ...(item.aliases || [])]),
        }
      : item);
  }
  return [...merged.values()];
}

function mergeCityCatalog(base = [], additions = []) {
  return mergeCatalog(base, additions, (item) => `${item.countryCode}:${item.normalizedLabel}`)
    .map((city) => ({
      ...city,
      aliases: unique(city.aliases || []).filter((alias) => !isAmbiguousShortCityAlias(alias)),
    }));
}

function acceptedRouteCityCatalog(acceptedRoutes = []) {
  const cities = new Map();
  for (const route of Array.isArray(acceptedRoutes) ? acceptedRoutes : []) {
    for (const entity of Array.isArray(route?.destinationEntities) ? route.destinationEntities : []) {
      const entityType = clean(entity?.entityTypeName).toLocaleLowerCase("en-US");
      if (!/(?:city|town|municipality|village|capital|gold-case-anchor)/u.test(entityType)) continue;
      const wikidataId = clean(entity?.wikidataId || entity?.entityId);
      const countryCode = clean(entity?.countryCode).toUpperCase();
      const label = clean(entity?.canonicalNameZh || entity?.name || entity?.sourceTitle);
      const normalizedLabel = clean(entity?.canonicalNameEn || entity?.sourceTitle || label).toLocaleLowerCase("en-US");
      if (!/^Q\d+$/u.test(wikidataId) || !countryCode || !label || !normalizedLabel) continue;
      const current = cities.get(wikidataId);
      cities.set(wikidataId, {
        ...(current || {}),
        entityId: clean(entity?.entityId || current?.entityId),
        wikidataId,
        countryCode,
        label: clean(current?.label || label),
        normalizedLabel: clean(current?.normalizedLabel || normalizedLabel),
        aliases: unique([
          ...(current?.aliases || []),
          label,
          entity?.canonicalNameZh,
          entity?.canonicalNameEn,
          entity?.sourceTitle,
        ]),
        latitude: Number.isFinite(Number(entity?.latitude)) ? Number(entity.latitude) : current?.latitude,
        longitude: Number.isFinite(Number(entity?.longitude)) ? Number(entity.longitude) : current?.longitude,
      });
    }
  }
  return [...cities.values()];
}

const ENGLISH_NUMBER_VALUES = new Map([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5],
  ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
  ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15],
  ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["twenty", 20],
  ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60],
]);

function englishNumberValue(value) {
  const normalized = normalizeText(value).replace(/-/gu, " ");
  if (ENGLISH_NUMBER_VALUES.has(normalized)) return ENGLISH_NUMBER_VALUES.get(normalized);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 2
    && ENGLISH_NUMBER_VALUES.has(parts[0])
    && ENGLISH_NUMBER_VALUES.has(parts[1])
    && ENGLISH_NUMBER_VALUES.get(parts[0]) >= 20
    && ENGLISH_NUMBER_VALUES.get(parts[1]) < 10) {
    return ENGLISH_NUMBER_VALUES.get(parts[0]) + ENGLISH_NUMBER_VALUES.get(parts[1]);
  }
  return null;
}

function chineseNumberValue(value) {
  const normalized = clean(value).replace(/[兩两]/gu, "二");
  const digits = new Map([
    ["零", 0], ["〇", 0], ["一", 1], ["二", 2], ["三", 3], ["四", 4],
    ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9],
  ]);
  if (/^[零〇一二三四五六七八九]$/u.test(normalized)) return digits.get(normalized);
  if (normalized === "十") return 10;
  const tens = normalized.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/u);
  if (!tens) return null;
  return (tens[1] ? digits.get(tens[1]) : 1) * 10 + (tens[2] ? digits.get(tens[2]) : 0);
}

function textualDuration(query) {
  const englishCompoundDay = query.match(/\b((?:twenty|thirty|forty|fifty|sixty)\s+(?:one|two|three|four|five|six|seven|eight|nine))\s+days?\b/iu);
  const englishDay = englishCompoundDay || query.match(/\b([a-z]+(?:-[a-z]+)?)\s+days?\b/iu);
  if (englishDay) {
    const days = englishNumberValue(englishDay[1]);
    if (Number.isSafeInteger(days) && days > 0) {
      return { durationDays: days, invalidDuration: false, diagnostics: [] };
    }
  }
  const englishCompoundWeek = query.match(/\b((?:twenty|thirty|forty|fifty|sixty)\s+(?:one|two|three|four|five|six|seven|eight|nine))\s+weeks?\b/iu);
  const englishWeek = englishCompoundWeek || query.match(/\b(a|an|[a-z]+(?:-[a-z]+)?)\s+weeks?\b/iu);
  if (englishWeek) {
    const weeks = /^(?:a|an)$/iu.test(englishWeek[1]) ? 1 : englishNumberValue(englishWeek[1]);
    if (Number.isSafeInteger(weeks) && weeks > 0) {
      return { durationDays: weeks * 7, invalidDuration: false, diagnostics: [] };
    }
  }
  const chineseWeek = query.match(/([零〇一二三四五六七八九十兩两]+)\s*(?:周|週|星期)(?:左右)?/u);
  if (chineseWeek) {
    const weeks = chineseNumberValue(chineseWeek[1]);
    if (Number.isSafeInteger(weeks) && weeks > 0) {
      return { durationDays: weeks * 7, invalidDuration: false, diagnostics: [] };
    }
  }
  const chineseTenish = query.match(/(十)\s*来\s*天/u);
  if (chineseTenish) {
    return {
      durationDays: 10,
      invalidDuration: false,
      diagnostics: [{
        code: "approximate-duration-normalized",
        message: "Approximate duration was normalized to its stated anchor.",
        rawValue: chineseTenish[0],
      }],
    };
  }
  const chineseDay = query.match(/([零〇一二三四五六七八九十兩两]+)\s*(?:天|日)/u);
  if (chineseDay) {
    const days = chineseNumberValue(chineseDay[1]);
    if (Number.isSafeInteger(days) && days > 0) {
      return { durationDays: days, invalidDuration: false, diagnostics: [] };
    }
  }
  const hyphenatedEnglishDay = query.match(/(?<![a-z0-9.])([+-]?\d+(?:\.\d+)?)\s*-\s*days?\b/iu);
  if (hyphenatedEnglishDay) {
    const days = Number(hyphenatedEnglishDay[1]);
    if (Number.isSafeInteger(days) && days > 0) {
      return { durationDays: days, invalidDuration: false, diagnostics: [] };
    }
    return {
      durationDays: null,
      invalidDuration: true,
      diagnostics: [{
        code: "invalid-duration",
        message: "Trip duration must be a positive whole number of days.",
        rawValue: hyphenatedEnglishDay[0],
      }],
    };
  }
  return null;
}

function parseDuration(query, { allowBareNumber = false } = {}) {
  const normalized = query.replace(/\s+/g, " ").trim();
  const normalizedTextual = textualDuration(normalized);
  if (normalizedTextual) return normalizedTextual;
  const compact = normalized.replace(/\s+/g, "");
  const match = normalized.match(/(?<![a-z0-9.])([+-]?\d+(?:\.\d+)?)\s*(?:天|日|days?|day|d)/iu)
    || (allowBareNumber ? compact.match(/^([+-]?\d+(?:\.\d+)?)$/u) : null);
  if (!match) {
    const malformed = normalized.match(/[+-]?\d[\da-z.,+-]*\s*(?:天|日|days?|day|d)/iu);
    const unsupportedTextual = normalized.match(/\b[a-z][a-z-]*\s+(?:days?|weeks?)\b/iu);
    if (!malformed && !unsupportedTextual) return { durationDays: null, invalidDuration: false, diagnostics: [] };
    return {
      durationDays: null,
      invalidDuration: true,
      diagnostics: [{
        code: "invalid-duration",
        message: "Trip duration must be a positive whole number of days.",
        rawValue: (malformed || unsupportedTextual)[0],
      }],
    };
  }
  const days = Number(match[1]);
  if (Number.isSafeInteger(days) && days > 0) {
    return { durationDays: days, invalidDuration: false, diagnostics: [] };
  }
  return {
    durationDays: null,
    invalidDuration: true,
    diagnostics: [{
      code: "invalid-duration",
      message: "Trip duration must be a positive whole number of days.",
      rawValue: match[0],
    }],
  };
}

function durationBand(days) {
  if (!days) return "";
  if (days <= 3) return "1-3d";
  if (days <= 6) return "4-6d";
  if (days <= 10) return "7-10d";
  if (days <= 14) return "10-14d";
  return "15d+";
}

function inferTripIntent(query, style, theme) {
  if (style?.key === "classic-first-trip") return "first-trip";
  if (theme?.key === "family") return "family";
  if (theme?.key === "honeymoon") return "honeymoon";
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
  const explicitCountryCodes = unique(intent.requiredCountryCodes || intent.explicitCountryCodes || []);
  const countryOrderMode = clean(intent.countryOrderMode || "unspecified");
  const orderedCountryCodes = countryOrderMode === "fixed"
    ? explicitCountryCodes
    : [...explicitCountryCodes].sort();
  const payload = {
    ...(intent.intentMode ? { intentMode: clean(intent.intentMode) } : {}),
    countryCode: clean(intent.countryCode),
    ...(orderedCountryCodes.length > 1 ? {
      requiredCountryCodes: orderedCountryCodes,
      countryOrderMode,
    } : {}),
    ...((intent.regionCountryCodes || []).length ? {
      regionCountryCodes: unique(intent.regionCountryCodes).sort(),
    } : {}),
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
  const regionCatalog = mergeCatalog(REGION_CATALOG, catalogs?.regions, (item) => item.key || item.normalizedLabel);
  const cityCatalog = mergeCityCatalog(CITY_CATALOG, [
    ...(Array.isArray(catalogs?.cities) ? catalogs.cities : []),
    ...acceptedRouteCityCatalog(acceptedRoutes),
  ]);
  const candidates = [
    "撒哈拉", "撒哈拉沙漠", "摩洛哥撒哈拉", "西撒哈拉骑行",
    "日本", "日本第一次", "日本经典", "日本铁路", "日本自驾", "日本樱花",
    "冰岛", "冰岛自驾", "冰岛极光", "冰岛黄金圈",
    "土耳其", "土耳其热气球摄影", "卡帕多奇亚热气球",
    ...countryCatalog.filter((item) => item.code !== "CN").map((item) => item.label),
    ...cityCatalog.map((item) => item.label),
    ...regionCatalog.map((item) => item.label),
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

const COUNTRY_TYPO_STOP_WORDS = new Set([
  "a", "an", "the", "in", "for", "to", "go", "where", "trip", "travel", "tour", "holiday", "vacation",
  "should", "would", "could", "please", "recommend", "suggest", "somewhere", "anywhere",
  "visit", "visiting", "place", "places", "destination", "destinations", "around", "about",
  "best", "good", "nice", "want", "wants", "like", "looking", "plan", "planning",
  "getaway", "break", "adventure", "experience", "experiences", "culture", "cultural",
  "nature", "scenic", "relaxed", "relaxing", "solo", "couple", "couples", "with",
  "day", "days", "week", "weeks", "spring", "summer", "autumn", "fall", "winter",
  "island", "city", "walk", "road", "drive", "driving", "hiking", "trekking", "family", "honeymoon",
  ...ENGLISH_NUMBER_VALUES.keys(),
]);

function damerauLevenshteinDistance(leftValue, rightValue) {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
      if (row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

function latinQueryTokens(query) {
  return [...normalizeText(query).matchAll(/\b[a-z][a-z'-]{3,}\b/gu)]
    .map((match) => match[0])
    .filter((token) => !COUNTRY_TYPO_STOP_WORDS.has(token));
}

const ENGLISH_DURATION_SLOT_PATTERN = new RegExp(
  `\\b(?:\\d+|a|an|${[...ENGLISH_NUMBER_VALUES.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|")})(?:[-\\s]+(?:${[...ENGLISH_NUMBER_VALUES.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|")}))?\\s*-?\\s*(?:days?|weeks?)\\b`,
  "iu",
);

function destinationSlotLatinTokens(query) {
  if (!/[A-Za-z]/u.test(String(query || ""))) return [];
  const normalized = normalizeText(query);
  const candidates = [];
  const explicitSlotPattern = /(?:\b(?:travel|trip|holiday|vacation|tour)\s+(?:to|in)|\b(?:go|fly|head)\s+to|\b(?:visit|visiting))\s+([a-z][a-z'-]{3,})\b/giu;
  for (const match of normalized.matchAll(explicitSlotPattern)) candidates.push(match[1]);

  const durationMatch = normalized.match(ENGLISH_DURATION_SLOT_PATTERN);
  if (durationMatch && Number.isInteger(durationMatch.index) && durationMatch.index > 0) {
    const leadingSegment = normalized.slice(0, durationMatch.index).trim();
    const containsTravelGrammar = /\b(?:trip|travel|tour|holiday|vacation|where|should|with|for|in|to|visit|visiting)\b/iu
      .test(leadingSegment);
    if (!containsTravelGrammar) candidates.push(...latinQueryTokens(leadingSegment));
  }
  return unique(candidates.map(normalizeText).filter(Boolean));
}

function countryCorrectionForQuery(query, countryCatalog) {
  const aliases = countryCatalog.flatMap((country) => unique([
    country.normalizedLabel,
    ...(country.aliases || []),
  ]).map(normalizeText)
    .filter((alias) => /^[a-z][a-z'-]{3,}$/u.test(alias))
    .map((alias) => ({ alias, country })));
  const candidates = [];
  for (const token of destinationSlotLatinTokens(query)) {
    for (const entry of aliases) {
      const distance = damerauLevenshteinDistance(token, entry.alias);
      if (distance !== 1) continue;
      candidates.push({ token, distance, country: entry.country, alias: entry.alias });
    }
  }
  const uniqueCountries = new Map();
  for (const candidate of candidates) {
    const code = clean(candidate.country.code).toUpperCase();
    if (!code || uniqueCountries.has(code)) continue;
    uniqueCountries.set(code, candidate);
  }
  if (uniqueCountries.size !== 1) return null;
  const selected = [...uniqueCountries.values()][0];
  return {
    countryCode: clean(selected.country.code).toUpperCase(),
    countryName: clean(selected.country.label),
    matchedToken: selected.token,
    matchedAlias: selected.alias,
    editDistance: selected.distance,
    confidence: "high",
    requiresConfirmation: true,
  };
}

function catalogLatinTokens(catalog = []) {
  return new Set(catalog
    .flatMap((item) => [
      item?.label,
      item?.normalizedLabel,
      ...(Array.isArray(item?.aliases) ? item.aliases : []),
    ])
    .flatMap((value) => [...normalizeText(value).matchAll(/\b[a-z][a-z'-]{3,}\b/gu)].map((match) => match[0]))
    .filter(Boolean));
}

const STATIC_TRAVEL_LATIN_TOKENS = new Set([
  ...catalogLatinTokens(COUNTRY_CATALOG),
  ...catalogLatinTokens(CITY_CATALOG),
  ...catalogLatinTokens(REGION_CATALOG),
  ...catalogLatinTokens(STYLE_CATALOG),
  ...catalogLatinTokens(THEME_CATALOG),
  ...catalogLatinTokens(SEASON_CATALOG),
  ...catalogLatinTokens(TRANSPORT_CATALOG),
  ...ENGLISH_MONTHS.keys(),
]);

function unresolvedLatinDestinationTokens(query, matchedDestinations = []) {
  const matchedDestinationTokens = catalogLatinTokens(matchedDestinations);
  return destinationSlotLatinTokens(query).filter((token) => (
    !STATIC_TRAVEL_LATIN_TOKENS.has(token)
    && !matchedDestinationTokens.has(token)
  ));
}

export function parseSearchIntent(query, { acceptedRoutes = [], catalogs = null, timeIntentEnabled = false } = {}) {
  const rawQuery = clean(query);
  const normalizedQuery = normalizeText(rawQuery);
  const containsLatinText = /[A-Za-z]/u.test(rawQuery);
  const duration = parseDuration(normalizedQuery, { allowBareNumber: timeIntentEnabled });
  const durationDays = duration.durationDays;
  const countryAdditions = Array.isArray(catalogs?.countries) ? catalogs.countries : [];
  const regionAdditions = Array.isArray(catalogs?.regions) ? catalogs.regions : [];
  const cityAdditions = [
    ...(Array.isArray(catalogs?.cities) ? catalogs.cities : []),
    ...(acceptedRoutes.length ? acceptedRouteCityCatalog(acceptedRoutes) : []),
  ];
  const countryCatalog = countryAdditions.length
    ? mergeCatalog(COUNTRY_CATALOG, countryAdditions, (item) => item.code)
    : COUNTRY_CATALOG;
  const regionCatalog = regionAdditions.length
    ? mergeCatalog(REGION_CATALOG, regionAdditions, (item) => item.key || item.normalizedLabel)
    : REGION_CATALOG;
  const cityCatalog = cityAdditions.length
    ? mergeCityCatalog(CITY_CATALOG, cityAdditions)
    : CITY_CATALOG;
  const extractedDestinations = extractRequiredDestinations(rawQuery, cityCatalog, countryCatalog);
  let requiredOccurrences = extractedDestinations.required;
  let matchedCities = requiredOccurrences.map((entry) => entry.city);
  const matchedRegion = firstCatalogMatchOutsideRanges(rawQuery, regionCatalog, requiredOccurrences);
  const explicitCountryOccurrences = extractCountryOccurrences(rawQuery, countryCatalog);
  const matchedCountries = explicitCountryOccurrences.map((entry) => entry.country);
  if (matchedRegion?.scope && matchedRegion.scope !== "macro-region") {
    const regionalCityIds = new Set((matchedRegion.knownDestinationIds || []).map((value) => clean(value).toUpperCase()));
    requiredOccurrences = requiredOccurrences.filter((entry) => {
      const cityId = clean(entry.city.wikidataId || entry.city.entityId || entry.identity).toUpperCase();
      return !regionalCityIds.has(cityId);
    });
    matchedCities = requiredOccurrences.map((entry) => entry.city);
  }
  let matchedCountry = matchedCountries[0] || null;
  if (!matchedCountry && matchedCities.length) {
    matchedCountry = countryCatalog.find((item) => item.code === matchedCities[0].countryCode) || null;
  }
  if (!matchedCountry && matchedRegion?.countryCode) {
    matchedCountry = countryCatalog.find((item) => item.code === matchedRegion.countryCode) || null;
  }
  const destinationCorrection = containsLatinText && !matchedCountry && !matchedCities.length && !matchedRegion
    ? countryCorrectionForQuery(rawQuery, countryCatalog)
    : null;
  const unresolvedCountryTokens = containsLatinText && !destinationCorrection
    ? unresolvedLatinDestinationTokens(rawQuery, [
        ...matchedCountries,
        ...(!matchedCountries.length && matchedCountry ? [matchedCountry] : []),
        ...matchedCities,
        matchedRegion,
      ].filter(Boolean))
    : [];
  const style = firstMatch(normalizedQuery, STYLE_CATALOG);
  const theme = firstMatch(normalizedQuery, THEME_CATALOG);
  const season = firstMatch(normalizedQuery, SEASON_CATALOG);
  const transport = firstMatch(normalizedQuery, TRANSPORT_CATALOG);
  const timeIntent = timeIntentEnabled ? parseTimeIntent(rawQuery) : null;
  const countryCodes = unique([
    ...matchedCountries.map((item) => item.code),
    ...(matchedCountry?.code ? [matchedCountry.code] : []),
    ...matchedCities.map((item) => item.countryCode),
  ].map((code) => clean(code).toUpperCase()).filter(Boolean));
  const regionCountryCodes = unique([
    ...(matchedRegion?.countryCodes || []),
    matchedRegion?.countryCode,
    matchedRegion?.parentCountryCode,
  ]
    .map((code) => clean(code).toUpperCase())
    .filter((code) => /^[A-Z]{2}$/u.test(code)));
  const intent = {
    rawQuery,
    normalizedQuery,
    countryCode: matchedCountry?.code || "",
    countryCodes,
    explicitCountryCodes: explicitCountryOccurrences.map((entry) => clean(entry.country.code).toUpperCase()),
    requiredCountryCodes: explicitCountryOccurrences.map((entry) => clean(entry.country.code).toUpperCase()),
    countryOrderMode: explicitCountryOccurrences.length >= 2
      ? hasFixedDestinationOrderSyntax(rawQuery, explicitCountryOccurrences) ? "fixed" : "flexible"
      : "unspecified",
    country: matchedCountry?.label || "",
    normalizedCountry: matchedCountry?.normalizedLabel || "",
    region: matchedRegion?.label || "",
    normalizedRegion: matchedRegion?.key || matchedRegion?.normalizedLabel || "",
    regionEntityId: matchedRegion?.key || matchedRegion?.normalizedLabel || "",
    regionCountryCodes,
    ...(matchedRegion ? {
      regionConstraint: {
        regionId: matchedRegion.key || matchedRegion.normalizedLabel || "",
        scope: matchedRegion.scope || "legacy-region",
        parentCountryCode: matchedRegion.parentCountryCode || matchedRegion.countryCode || "",
        allowedCountryCodes: [...regionCountryCodes],
        knownDestinationIds: unique(matchedRegion.knownDestinationIds || []),
        supported: matchedRegion.supported !== false,
      },
    } : {}),
    cities: unique(matchedCities.map((item) => item.label)),
    normalizedCities: unique(matchedCities.map((item) => item.normalizedLabel)),
    requiredDestinationIds: requiredOccurrences.map((entry) => clean(entry.city.wikidataId || entry.city.entityId || entry.identity)),
    requiredDestinationNames: requiredOccurrences.map((entry) => clean(entry.city.label || entry.city.normalizedLabel)),
    requiredDestinationRaw: requiredOccurrences.map((entry) => clean(entry.rawValue)),
    destinationOrderMode: requiredOccurrences.length >= 2
      ? hasFixedDestinationOrderSyntax(rawQuery, requiredOccurrences) ? "fixed" : "flexible"
      : "unspecified",
    destinationDiagnostics: extractedDestinations.diagnostics,
    durationDays,
    durationBand: durationBand(durationDays),
    ...(timeIntentEnabled ? {
      invalidDuration: duration.invalidDuration,
      durationDiagnostics: duration.diagnostics,
    } : {}),
    travelStyle: style?.key || "",
    travelStyleLabel: style?.label || "",
    tripIntent: inferTripIntent(normalizedQuery, style, theme),
    season: season?.label || "",
    seasonKey: season?.key || "",
    theme: theme?.label || "",
    themeKey: theme?.key || "",
    themeConstraintMode: theme ? "explicit" : "preference",
    transport: transport?.key || "",
    transportLabel: transport?.label || "",
    pace: includesAny(normalizedQuery, ["慢", "慢游", "relaxed"]) ? "relaxed" : "",
    budget: "",
    ...(timeIntentEnabled ? { timeIntent } : {}),
    ...(destinationCorrection ? { destinationCorrection } : {}),
  };
  intent.constraintCount = constraintCount(intent);
  intent.targetResultCount = targetResultCountForConstraintLevel(intent.constraintCount);
  intent.isChinaBlocked = countryCodes.includes("CN");
  if (timeIntentEnabled) {
    const destinationSpecified = Boolean(intent.countryCode || intent.region || intent.cities.length);
    const invalidTime = timeIntent.type === "invalid";
    const invalidDuration = intent.invalidDuration === true;
    const unresolvedDestinations = intent.destinationDiagnostics
      .filter((item) => item.code === "unknown-city-token")
      .map((item) => clean(item.rawValue))
      .filter((item) => Array.from(item).length >= 3);
    const hasUnresolvedCountry = unresolvedCountryTokens.length > 0;
    const hasUnresolvedDestination = unresolvedDestinations.length > 0 || hasUnresolvedCountry;
    const hasUsableCondition = intent.constraintCount > 0;
    intent.unresolvedDestinationNames = unique([...unresolvedDestinations, ...unresolvedCountryTokens]);
    intent.destinationUnspecified = !destinationSpecified;
    intent.intentMode = invalidDuration
      ? "invalid-duration-intent"
      : invalidTime
      ? "invalid-time-intent"
      : destinationCorrection
        ? "insufficient-intent"
      : hasUnresolvedDestination
        ? "insufficient-intent"
      : !hasUsableCondition
        ? "insufficient-intent"
        : destinationSpecified
          ? "specified-destination"
          : "destination-suggestion";
    intent.insufficientDestination = intent.intentMode === "insufficient-intent" && !destinationSpecified;
    intent.failureReason = intent.intentMode === "invalid-duration-intent"
      ? "invalid-duration"
      : intent.intentMode === "invalid-time-intent"
      ? "invalid-time-intent"
      : destinationCorrection
        ? "destination-confirmation-required"
      : hasUnresolvedDestination
        ? "unresolved-destination"
      : intent.intentMode === "insufficient-intent"
        ? "insufficient-intent"
        : "";
    intent.parseSuccess = Boolean(!intent.isChinaBlocked && !["invalid-duration-intent", "invalid-time-intent", "insufficient-intent"].includes(intent.intentMode));
    intent.canGenerate = intent.parseSuccess;
  } else {
    intent.parseSuccess = Boolean(intent.constraintCount > 0 && !intent.isChinaBlocked);
    intent.canGenerate = Boolean(intent.parseSuccess && intent.countryCode && !intent.isChinaBlocked);
  }
  intent.tripCapacity = resolveRouteTripCapacity(intent);
  if (intent.parseSuccess && !intent.tripCapacity.supported) {
    intent.parseSuccess = false;
    intent.canGenerate = false;
    intent.failureReason = intent.tripCapacity.reasonCode;
  }
  intent.intentKey = normalizeIntentKey(intent);
  intent.intentHash = hashIntentKey(intent.intentKey);
  const routeIntentFingerprint = createRouteIntentFingerprint(intent);
  intent.normalizedRouteIntent = routeIntentFingerprint.normalizedIntent;
  intent.routeIntentFingerprint = routeIntentFingerprint.value;
  intent.routeIntentFingerprintVersion = ROUTE_INTENT_FINGERPRINT_VERSION;
  intent.suggestions = destinationCorrection?.countryName
    ? [destinationCorrection.countryName]
    : createSearchSuggestions({ query: rawQuery, acceptedRoutes, catalogs: {
        ...(catalogs || {}),
        regions: regionCatalog,
      } });
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
