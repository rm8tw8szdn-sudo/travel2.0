// Route V2 Planning Concept — 确定性管线步骤 1
//
// 输入 context: { countries, destinations, destinationLevels, segmentMetrics,
//   transportConnections, regionCluster, designStrategies, bestMonths, themes }
// 产出: { durationBand, recommendedDays, tripIntent, travelStyle, paceLevel,
//   designRules, routeStructure, targetTraveler, whoShouldAvoid, travelValue, ... }
//
// Travel Style 枚举（与 route-gold-cases.mjs 的 spec 全名对齐，concept key 为短名）:
//   classic-first-trip | deep-dive | country-hopper |
//   rail-journey | road-trip | seasonal | theme | island-hopping | pilgrimage | city-break
//   （codex 旧的 transport-journey 保留为兜底，当铁路/公路/海岛证据不足时回落）
//
// 设计原则：纯函数、无 IO、无 LLM；travelStyleFor 的判定顺序即设计优先级。

const DURATION_BANDS = [
  { id: "1-3d", minDays: 1, maxDays: 3 },
  { id: "4-6d", minDays: 4, maxDays: 6 },
  { id: "7-10d", minDays: 7, maxDays: 10 },
  { id: "10-14d", minDays: 10, maxDays: 14 },
  { id: "15d+", minDays: 15, maxDays: null },
];

export const TRAVEL_STYLE_KEYS = [
  "classic-first-trip",
  "deep-dive",
  "country-hopper",
  "rail-journey",
  "road-trip",
  "seasonal",
  "theme",
  "island-hopping",
  "pilgrimage",
  "city-break",
  // 兜底（spec 里 Rail/Road/Island 不明确时仍可用单一交通线旅程）
  "transport-journey",
];

// concept key → spec 全名（route-gold-cases.travelStyle 的取值）
export const TRAVEL_STYLE_LABEL = {
  "classic-first-trip": "Classic First Trip",
  "deep-dive": "Deep Dive",
  "country-hopper": "Country Hopper",
  "rail-journey": "Rail Journey",
  "road-trip": "Road Trip",
  seasonal: "Seasonal",
  theme: "Theme",
  "island-hopping": "Island Hopping",
  pilgrimage: "Pilgrimage",
  "city-break": "City Break",
  "transport-journey": "Transport Journey",
};

// concept key → 中文标签（用于 record 的 name/summary/recommendationText，
// 这些字段受 content-quality UNTRANSLATED 检查约束，不得含英文/假名）
export const TRAVEL_STYLE_LABEL_ZH = {
  "classic-first-trip": "经典首访",
  "deep-dive": "区域深度",
  "country-hopper": "多国串联",
  "rail-journey": "铁路旅程",
  "road-trip": "公路自驾",
  seasonal: "季节性",
  theme: "主题游",
  "island-hopping": "海岛跳岛",
  pilgrimage: "朝圣巡礼",
  "city-break": "城市短假",
  "transport-journey": "交通线旅程",
};

// 主题词 → 信号类别（用于 theme / seasonal / pilgrimage 判定）
const THEME_LEXICON = {
  pilgrimage: ["朝圣", "巡礼", "圣路", "参拜", "pilgrimage", "camino", "shikoku", "四国遍路", "圣地"],
  wine: ["葡萄酒", "红酒", "酒庄", "winery", "wine", "波尔多", "纳帕"],
  nature: ["自然", "山岳", "阿尔卑斯", "湖", "national park", "国家公园", "大自然"],
  autumn: ["红叶", "秋叶", "autumn", "枫"],
  spring: ["樱花", "sakura", "cherry blossom", "春"],
  winter: ["雪", "滑雪", "ski", "winter", "冬"],
  summer: ["夏", "summer", "海滩"],
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function unique(values) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function count(value) {
  return list(value).length;
}

function hasStrategy(context, strategy) {
  return list(context.designStrategies).includes(strategy);
}

function isCompleteTransport(context) {
  const destinationCount = count(context.destinations);
  if (destinationCount < 2) return false;
  return count(context.segmentMetrics) >= destinationCount - 1
    && count(context.transportConnections) >= destinationCount - 1;
}

// 收集交通方式（rail/car/ferry 等）来自 transportConnections[].modes
function transportModesOf(context) {
  const modes = new Set();
  for (const conn of list(context.transportConnections)) {
    for (const m of list(conn?.modes)) {
      modes.add(text(m).toLocaleLowerCase("en-US"));
    }
  }
  return [...modes];
}

function hasMode(modes, re) {
  return modes.some((m) => re.test(m));
}

function themesOf(context) {
  return unique(list(context.themes));
}

function themeHits(context, lexiconKeys) {
  const themes = themesOf(context).map((t) => t.toLocaleLowerCase("en-US"));
  const hits = [];
  for (const key of lexiconKeys) {
    const lex = THEME_LEXICON[key] || [];
    if (themes.some((t) => lex.some((kw) => t.includes(kw)))) hits.push(key);
  }
  return hits;
}

function bestMonthsOf(context) {
  return unique(list(context.bestMonths));
}

function hasSeasonSignal(context) {
  const months = bestMonthsOf(context).map((m) => m.toLocaleLowerCase("en-US"));
  if (months.length === 0) return null;
  // 多个明确矛盾季节 → null（视为无单一季节信号）
  const tags = new Set();
  for (const m of months) {
    if (/樱|sakura|cherry|春|spring/.test(m)) tags.add("spring");
    if (/红叶|秋|autumn|fall|枫/.test(m)) tags.add("autumn");
    if (/雪|滑雪|冬|winter|ski/.test(m)) tags.add("winter");
    if (/夏|summer|海滩|beach/.test(m)) tags.add("summer");
  }
  return tags.size === 1 ? [...tags][0] : null;
}

function hasIslandSignal(context) {
  const themes = themesOf(context).map((t) => t.toLocaleLowerCase("en-US"));
  if (themes.some((t) => /岛|island|hopping|跳岛|群岛|archipelago/.test(t))) return true;
  const modes = transportModesOf(context);
  if (hasMode(modes, /ferry|渡轮|船|boat|ship/)) {
    // 渡轮 + 多目的地 → 强海岛信号
    return count(context.destinations) >= 3;
  }
  const cluster = context.regionCluster;
  if (cluster && Array.isArray(cluster.members) && /岛|island/.test(unique(cluster.members).join(" "))) return true;
  return false;
}

function durationBandFor(context) {
  const destinationCount = count(context.destinations);
  const countryCount = count(context.countries);
  if (countryCount >= 3 && destinationCount <= 5 && isCompleteTransport(context)) return "4-6d";
  if (destinationCount <= 2) return "1-3d";
  if (destinationCount <= 3) return "4-6d";
  if (destinationCount <= 5) return "7-10d";
  if (destinationCount <= 7) return "10-14d";
  return "15d+";
}

function recommendedDaysFor(context, durationBand) {
  const countryCount = count(context.countries);
  const destinationCount = count(context.destinations);
  if (durationBand === "1-3d") return destinationCount <= 1 ? "2天" : "3天";
  if (durationBand === "4-6d" && countryCount >= 3) return "4天";
  if (durationBand === "4-6d") return "5天";
  if (durationBand === "7-10d") return destinationCount >= 5 ? "8-10天" : "7-8天";
  if (durationBand === "10-14d") return "10-14天";
  return "15天以上";
}

// 核心判定：顺序即设计优先级。越靠前越特异，必须先排除。
function travelStyleFor(context, durationBand) {
  const destinationCount = count(context.destinations);

  // 0. 城市短假：1-3d 且 ≤2 目的地 → city-break
  if (durationBand === "1-3d" && destinationCount <= 2) return "city-break";

  // 1. 朝圣：主题词命中 pilgrimage
  if (themeHits(context, ["pilgrimage"]).length) return "pilgrimage";

  // 2. 主题游：单一强主题（wine/nature 等，但非 pilgrimage/季节）
  const themeHitsKeys = themeHits(context, ["wine", "nature"]);
  if (themeHitsKeys.length && hasStrategy(context, "Theme")) return "theme";

  // 3. 季节性：有单一季节信号 + Season 策略
  if (hasSeasonSignal(context) && hasStrategy(context, "Season")) return "seasonal";

  // 4. 海岛跳岛：岛/ferry/群岛信号
  if (hasIslandSignal(context)) return "island-hopping";

  const countryCount = count(context.countries);
  const modes = transportModesOf(context);

  // 5. 多国串联：≥3 国家 + 中长时长（优先于铁路/公路，因为多国打卡是首要动机）
  if (countryCount >= 3 && ["4-6d", "7-10d"].includes(durationBand)) return "country-hopper";

  // 6. 铁路/公路旅程：仅当单国（交通过程为体验主线，而非跨国打卡）
  //    铁路多国 → 仍归 country-hopper 或 transport-journey
  if (countryCount <= 1 && hasMode(modes, /rail|train|铁路|火车|新干线|shinkansen/) && destinationCount >= 3) return "rail-journey";
  if (countryCount <= 1 && hasMode(modes, /car|drive|driving|self-drive|公路|自驾|自驾车/) && destinationCount >= 3) return "road-trip";

  // 7. 区域深度：Regional 策略 + 长时长
  if (hasStrategy(context, "Regional") && ["10-14d", "15d+"].includes(durationBand)) return "deep-dive";

  // 8. 交通线旅程（兜底）：Transport 策略 + 多目的地
  if (hasStrategy(context, "Transport") && destinationCount >= 4) return "transport-journey";
  if (countryCount > 1 && hasStrategy(context, "Transport")) return "transport-journey";

  // 9. 默认：经典首访
  return "classic-first-trip";
}

function paceFor(travelStyle, durationBand, context) {
  const countryCount = count(context.countries);
  const destinationCount = count(context.destinations);
  if (travelStyle === "country-hopper") return "intensive";
  if (travelStyle === "city-break") return "relaxed";
  if (travelStyle === "island-hopping") return "relaxed";
  if (travelStyle === "pilgrimage") return "moderate";
  if (travelStyle === "rail-journey" || travelStyle === "road-trip") return "moderate";
  if (travelStyle === "seasonal" || travelStyle === "theme") return "moderate";
  if (travelStyle === "deep-dive") return "relaxed";
  if (durationBand === "4-6d" && destinationCount >= 4) return "intensive";
  if (durationBand === "7-10d" && countryCount <= 1 && destinationCount <= 4) return "moderate";
  if (["10-14d", "15d+"].includes(durationBand)) return "relaxed";
  return "moderate";
}

function intentFor(context, travelStyle) {
  if (travelStyle === "country-hopper") {
    return {
      intentType: "achievement",
      primaryMotivation: "country-count",
      description: "高效率串联多个国家或地区。",
    };
  }
  if (travelStyle === "classic-first-trip") {
    return {
      intentType: "first-trip",
      primaryMotivation: "classic",
      description: "围绕经典目的地和明确主题设计首次旅行。",
    };
  }
  if (travelStyle === "theme") {
    return {
      intentType: "thematic",
      primaryMotivation: "single-theme",
      description: "围绕单一主题（如葡萄酒、自然）在多目的地递进展开，体验有层次而非重复。",
    };
  }
  if (travelStyle === "seasonal") {
    return {
      intentType: "seasonal",
      primaryMotivation: "season-window",
      description: "以单一季节窗口为前提组织目的地，季节体验是路线成立的必要条件。",
    };
  }
  if (travelStyle === "island-hopping") {
    return {
      intentType: "transport-led",
      primaryMotivation: "island-sequence",
      description: "以渡轮/船衔接多个海岛，体验来自岛间切换与各岛差异。",
    };
  }
  if (travelStyle === "pilgrimage") {
    return {
      intentType: "thematic",
      primaryMotivation: "ritual-path",
      description: "沿既定朝圣/巡礼路径完成体验，路径本身即产品。",
    };
  }
  if (travelStyle === "rail-journey") {
    return {
      intentType: "transport-led",
      primaryMotivation: "rail-experience",
      description: "把铁路过程本身作为旅行体验，沿线站点为体验节点。",
    };
  }
  if (travelStyle === "road-trip") {
    return {
      intentType: "transport-led",
      primaryMotivation: "self-drive",
      description: "以自驾公路串联多目的地，驾驶过程与停靠点共同构成体验。",
    };
  }
  if (travelStyle === "deep-dive") {
    return {
      intentType: "first-trip",
      primaryMotivation: "regional-depth",
      description: "减少移动、深入一个区域，体验文化和风景的纵深。",
    };
  }
  if (hasStrategy(context, "Transport")) {
    return {
      intentType: "transport-led",
      primaryMotivation: "transport-experience",
      description: "把交通线路本身作为旅行体验的一部分。",
    };
  }
  return {
    intentType: "first-trip",
    primaryMotivation: "classic",
    description: "用有限天数覆盖最有代表性的目的地。",
  };
}

function routeStructureFor(context, travelStyle) {
  const destinations = unique(context.destinations);
  if (travelStyle === "pilgrimage") {
    return {
      type: "linear",
      coreDestinations: destinations,
      accessPoints: [],
      optionalSideTrips: [],
    };
  }
  if (travelStyle === "city-break") {
    return {
      type: "base-plus-side-trip",
      coreDestinations: destinations.slice(0, 1),
      accessPoints: [],
      optionalSideTrips: destinations.slice(1),
    };
  }
  if (travelStyle === "island-hopping") {
    return {
      type: "island-chain",
      coreDestinations: destinations,
      accessPoints: [],
      optionalSideTrips: [],
    };
  }
  if (travelStyle === "rail-journey" || travelStyle === "road-trip" || travelStyle === "transport-journey") {
    return {
      type: "linear-corridor",
      coreDestinations: destinations,
      accessPoints: [],
      optionalSideTrips: [],
    };
  }
  if (travelStyle === "theme" || travelStyle === "seasonal") {
    return {
      type: "thematic-cluster",
      coreDestinations: destinations,
      accessPoints: [],
      optionalSideTrips: [],
    };
  }
  if (travelStyle === "deep-dive") {
    return {
      type: "regional-hub",
      coreDestinations: destinations,
      accessPoints: [],
      optionalSideTrips: [],
    };
  }
  return {
    type: travelStyle === "country-hopper" ? "fast-linear" : "regional-linear",
    coreDestinations: destinations,
    accessPoints: [],
    optionalSideTrips: [],
  };
}

function travelerFor(travelStyle, paceLevel) {
  if (travelStyle === "country-hopper") return "想高效率打卡多个国家、能接受频繁移动和紧凑节奏的人";
  if (travelStyle === "city-break") return "想用短假期轻量体验一个城市及近郊的人";
  if (travelStyle === "rail-journey") return "把铁路过程本身视为旅行体验、享受车窗风景与沿线站点的人";
  if (travelStyle === "road-trip") return "享受自驾、愿意把驾驶过程作为旅行一部分的人";
  if (travelStyle === "seasonal") return "为特定季节体验（樱花/红叶/雪）出行、时间窗口敏感的人";
  if (travelStyle === "theme") return "对单一主题（葡萄酒/自然等）有浓厚兴趣、愿意为主题串联多目的地的人";
  if (travelStyle === "island-hopping") return "喜欢海岛节奏、能接受渡轮衔接、追求岛间差异体验的人";
  if (travelStyle === "pilgrimage") return "想沿既定朝圣/巡礼路径完成体验、重视路径本身意义的人";
  if (travelStyle === "transport-journey") return "把铁路、公路或渡轮过程本身视为旅行体验的人";
  if (travelStyle === "deep-dive") return "想减少移动、深入一个区域体验文化和风景的人";
  return paceLevel === "intensive" ? "想在较短时间覆盖经典目的地的人" : "第一次到访、希望路线清晰且节奏适中的人";
}

function avoidFor(travelStyle, paceLevel) {
  if (travelStyle === "country-hopper") return "想慢游、亲子出行、不喜欢频繁换城市或第一次长线旅行的人";
  if (travelStyle === "city-break") return "想跨区域、多城市深度旅行的人";
  if (travelStyle === "rail-journey") return "不喜欢长时间在火车上、只想停留城市体验的人";
  if (travelStyle === "road-trip") return "不喜欢自驾、不愿承担驾驶疲劳或不熟悉当地交规的人";
  if (travelStyle === "seasonal") return "时间窗口灵活、不为特定季节出行的人";
  if (travelStyle === "theme") return "对该主题无强烈兴趣、想要综合经典体验的人";
  if (travelStyle === "island-hopping") return "不喜欢渡轮/船、追求高效率城市打卡的人";
  if (travelStyle === "pilgrimage") return "对朝圣/巡礼主题无兴趣、只想观光的人";
  if (travelStyle === "transport-journey") return "不喜欢长时间在路上或只想停留城市体验的人";
  if (travelStyle === "deep-dive") return "想一次覆盖很多城市、追求广度而非深度的人";
  if (paceLevel === "intensive") return "想慢游、低移动强度或每天留大量弹性时间的人";
  return "想一次打卡很多城市或追求高强度行程的人";
}

function durationReasons(context, durationBand, recommendedDays, travelStyle) {
  const destinationCount = count(context.destinations);
  const countryCount = count(context.countries);
  if (travelStyle === "country-hopper") {
    return {
      whyThisDurationFits: `${recommendedDays}只适合作为高强度多国快闪，目的地之间必须有连续交通和距离证据支撑。`,
      whyNotShorter: "再短会压缩每个国家的停留时间，交通容错过低。",
      whyNotLonger: "如果有更长时间，应降低打卡密度，改成区域深度旅行而不是继续增加国家数量。",
    };
  }
  if (travelStyle === "city-break") {
    return {
      whyThisDurationFits: `${recommendedDays}适合单城市或城市加近郊，不需要跨区域移动。`,
      whyNotShorter: "再短只能保留城市核心体验，近郊应删除。",
      whyNotLonger: "更长时间应升级为区域路线，而不是继续叫城市短途。",
    };
  }
  if (travelStyle === "rail-journey" || travelStyle === "road-trip" || travelStyle === "transport-journey") {
    return {
      whyThisDurationFits: `${recommendedDays}为交通体验和沿线停留留出基本时间。`,
      whyNotShorter: "再短会让交通变成赶路，无法体现线路本身的旅行价值。",
      whyNotLonger: "更长时间应加入更完整的停留和分段体验，而不是只增加距离。",
    };
  }
  if (travelStyle === "island-hopping") {
    return {
      whyThisDurationFits: `${recommendedDays}覆盖渡轮衔接与各岛基础停留，岛间切换需要时间余量。`,
      whyNotShorter: "再短会让渡轮衔接压垮体验，每个岛只能点到为止。",
      whyNotLonger: "更长时间应增加单岛深度而非继续加岛，否则节奏松散。",
    };
  }
  if (travelStyle === "seasonal") {
    return {
      whyThisDurationFits: `${recommendedDays}对齐季节窗口，季节体验（樱花/红叶/雪）在该时长内可达峰值。`,
      whyNotShorter: "再短可能错过季节峰值或只能命中单一目的地。",
      whyNotLonger: "超出季节窗口后体验价值下降，应转为其他主题而非延长。",
    };
  }
  if (travelStyle === "theme") {
    return {
      whyThisDurationFits: `${recommendedDays}让单一主题在${destinationCount}个目的地递进展开，体验有层次。`,
      whyNotShorter: "再短会退化为主题打卡，缺乏递进。",
      whyNotLonger: "更长时间应深化主题深度而非简单加同类目的地，否则体验重复。",
    };
  }
  if (travelStyle === "pilgrimage") {
    return {
      whyThisDurationFits: `${recommendedDays}对应既定朝圣/巡礼路径的基本完成时长，路径本身需要完整。`,
      whyNotShorter: "再短无法完成路径，只能截取片段，失去朝圣产品的完整性。",
      whyNotLonger: "更长时间应增加精神/文化深度而非延长徒步距离。",
    };
  }
  if (travelStyle === "deep-dive") {
    return {
      whyThisDurationFits: `${recommendedDays}适合在一个区域内减少移动、深入${destinationCount}个目的地的文化与风景。`,
      whyNotShorter: "再短会退回打卡式首访，失去深度。",
      whyNotLonger: "更长时间应转向相邻区域新主题，而非在同一区域无限延长。",
    };
  }
  return {
    whyThisDurationFits: `${recommendedDays}适合串联${destinationCount}个主要目的地${countryCount > 1 ? `和${countryCount}个国家` : ""}，保持经典旅行的基本节奏。`,
    whyNotShorter: "再短需要删减目的地，否则会变成赶路。",
    whyNotLonger: "更长时间应转向深度旅行，增加停留体验而不是简单扩点。",
  };
}

function travelValueFor(travelStyle, context) {
  const destinationCount = count(context.destinations);
  switch (travelStyle) {
    case "country-hopper":
      return "用短时间完成多国高效率串联，价值来自强交通证据和明确打卡目标。";
    case "rail-journey":
      return "把铁路过程作为体验主线，价值来自沿线风景与站点的有机串联。";
    case "road-trip":
      return "把自驾公路作为体验主线，价值来自驾驶自由与多目的地差异。";
    case "island-hopping":
      return "以渡轮衔接多个海岛，价值来自岛间差异与海岛节奏。";
    case "seasonal":
      return "以单一季节窗口为前提组织目的地，价值来自季节峰值的精准命中。";
    case "theme":
      return "围绕单一主题在多目的地递进展开，价值来自主题深度而非目的地数量。";
    case "pilgrimage":
      return "沿既定朝圣/巡礼路径完成体验，价值来自路径完整性与精神/文化意义。";
    case "deep-dive":
      return "在一个区域减少移动、深入体验，价值来自文化与风景的纵深。";
    case "city-break":
      return "用短假期轻量体验一个城市及近郊，价值来自低移动与高密度城市体验。";
    case "transport-journey":
      return "把交通线路本身作为旅行体验，价值来自交通过程与沿线停留的平衡。";
    default:
      return `在给定天数内保留${destinationCount}个目的地之间的顺路关系和清晰主题。`;
  }
}

export function buildRouteConcept(context = {}) {
  const durationBand = durationBandFor(context);
  const recommendedDays = recommendedDaysFor(context, durationBand);
  const travelStyle = travelStyleFor(context, durationBand);
  const paceLevel = paceFor(travelStyle, durationBand, context);
  const tripIntent = intentFor(context, travelStyle);
  const routeStructure = routeStructureFor(context, travelStyle);
  const durationReason = durationReasons(context, durationBand, recommendedDays, travelStyle);
  return {
    durationBand,
    recommendedDays,
    tripIntent,
    travelStyle,
    travelStyleLabel: TRAVEL_STYLE_LABEL[travelStyle] || travelStyle,
    paceLevel,
    designRules: list(context.designStrategies),
    routeStructure,
    countryCount: count(context.countries),
    cityCount: count(context.destinations),
    hotelChangeEstimate: Math.max(0, count(context.destinations) - 1),
    transportDays: Math.max(0, Math.min(count(context.segmentMetrics), count(context.destinations) - 1)),
    targetTraveler: travelerFor(travelStyle, paceLevel),
    whoShouldAvoid: avoidFor(travelStyle, paceLevel),
    travelValue: travelValueFor(travelStyle, context),
    ...durationReason,
  };
}

export function validateRouteConcept(concept = {}, context = {}) {
  const reasons = [];
  if (!concept.durationBand || !DURATION_BANDS.some((item) => item.id === concept.durationBand)) reasons.push("missing-duration-band");
  if (!concept.recommendedDays) reasons.push("missing-recommended-days");
  if (!concept.tripIntent?.intentType) reasons.push("missing-trip-intent");
  if (!concept.travelStyle) reasons.push("missing-travel-style");
  if (!TRAVEL_STYLE_KEYS.includes(concept.travelStyle)) reasons.push("unknown-travel-style");
  if (!concept.paceLevel) reasons.push("missing-pace-level");
  if (!concept.whyThisDurationFits) reasons.push("missing-why-this-duration-fits");
  if (!concept.whyNotShorter) reasons.push("missing-why-not-shorter");
  if (!concept.whyNotLonger) reasons.push("missing-why-not-longer");
  if (!concept.targetTraveler) reasons.push("missing-target-traveler");
  if (!concept.whoShouldAvoid) reasons.push("missing-who-should-avoid");

  const countryCount = count(context.countries);
  const destinationCount = count(context.destinations);
  if (concept.travelStyle === "classic-first-trip" && concept.durationBand === "4-6d" && countryCount > 2) {
    reasons.push("too-many-countries-for-classic-first-trip");
  }
  if (concept.travelStyle === "country-hopper") {
    if (concept.paceLevel !== "intensive") reasons.push("country-hopper-must-be-intensive");
    if (!isCompleteTransport(context)) reasons.push("country-hopper-missing-complete-transport");
  }
  if (concept.travelStyle === "city-break" && destinationCount > 2) reasons.push("city-break-too-many-destinations");
  if (concept.durationBand === "1-3d" && countryCount > 1) reasons.push("short-duration-cross-country");
  // 朝圣/主题/季节需有对应信号（无信号却落到该 style → 判定与证据不一致）
  if (concept.travelStyle === "pilgrimage" && !themeHits(context, ["pilgrimage"]).length) {
    reasons.push("pilgrimage-without-theme-signal");
  }
  if (concept.travelStyle === "theme" && !hasStrategy(context, "Theme")) {
    reasons.push("theme-without-theme-strategy");
  }
  if (concept.travelStyle === "seasonal" && !hasStrategy(context, "Season")) {
    reasons.push("seasonal-without-season-strategy");
  }

  return { accepted: reasons.length === 0, reasons: unique(reasons) };
}
