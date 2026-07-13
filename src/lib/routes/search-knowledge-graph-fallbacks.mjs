function clone(value) {
  return structuredClone(value);
}

function destination({ wikidataId, countryCode, countryName, name, sourceTitle, entityTypeName = "search-fallback-anchor", latitude, longitude }) {
  return { wikidataId, countryCode, countryName, name, sourceTitle, entityTypeName, latitude, longitude };
}

export const SEARCH_KNOWLEDGE_GRAPH_FALLBACKS = {
  IS: [
    destination({ wikidataId: "Q1764", countryCode: "IS", countryName: "Iceland", name: "雷克雅未克", sourceTitle: "Reykjavik", latitude: 64.1466, longitude: -21.9426 }),
    destination({ wikidataId: "search-is-golden-circle", countryCode: "IS", countryName: "Iceland", name: "黄金圈", sourceTitle: "Golden Circle", latitude: 64.2559, longitude: -20.4475 }),
    destination({ wikidataId: "Q3437299", countryCode: "IS", countryName: "Iceland", name: "辛格维利尔国家公园", sourceTitle: "Thingvellir National Park", latitude: 64.2559, longitude: -21.1295 }),
    destination({ wikidataId: "Q208177", countryCode: "IS", countryName: "Iceland", name: "盖锡尔", sourceTitle: "Geysir", latitude: 64.3138, longitude: -20.2995 }),
    destination({ wikidataId: "Q215900", countryCode: "IS", countryName: "Iceland", name: "黄金瀑布", sourceTitle: "Gullfoss", latitude: 64.3271, longitude: -20.1199 }),
    destination({ wikidataId: "Q200516", countryCode: "IS", countryName: "Iceland", name: "维克", sourceTitle: "Vik", latitude: 63.4186, longitude: -19.0060 }),
    destination({ wikidataId: "Q7400", countryCode: "IS", countryName: "Iceland", name: "瓦特纳冰川", sourceTitle: "Vatnajokull", latitude: 64.4000, longitude: -16.8000 }),
    destination({ wikidataId: "Q1942818", countryCode: "IS", countryName: "Iceland", name: "杰古沙龙冰河湖", sourceTitle: "Jokulsarlon", latitude: 64.0784, longitude: -16.2306 }),
  ],
  TR: [
    destination({ wikidataId: "Q406", countryCode: "TR", countryName: "Turkey", name: "伊斯坦布尔", sourceTitle: "Istanbul", latitude: 41.0082, longitude: 28.9784 }),
    destination({ wikidataId: "Q81788", countryCode: "TR", countryName: "Turkey", name: "卡帕多奇亚", sourceTitle: "Cappadocia", latitude: 38.6431, longitude: 34.8289 }),
    destination({ wikidataId: "Q184170", countryCode: "TR", countryName: "Turkey", name: "格雷梅", sourceTitle: "Goreme", latitude: 38.6431, longitude: 34.8289 }),
    destination({ wikidataId: "Q1345776", countryCode: "TR", countryName: "Turkey", name: "乌奇萨尔", sourceTitle: "Uchisar", latitude: 38.6303, longitude: 34.8050 }),
    destination({ wikidataId: "Q190406", countryCode: "TR", countryName: "Turkey", name: "代林库尤地下城", sourceTitle: "Derinkuyu underground city", latitude: 38.3750, longitude: 34.7350 }),
    destination({ wikidataId: "Q485716", countryCode: "TR", countryName: "Turkey", name: "棉花堡", sourceTitle: "Pamukkale", latitude: 37.9137, longitude: 29.1187 }),
    destination({ wikidataId: "Q47611", countryCode: "TR", countryName: "Turkey", name: "以弗所", sourceTitle: "Ephesus", latitude: 37.9391, longitude: 27.3419 }),
    destination({ wikidataId: "Q47487", countryCode: "TR", countryName: "Turkey", name: "安塔利亚", sourceTitle: "Antalya", latitude: 36.8969, longitude: 30.7133 }),
  ],
  MA: [
    destination({ wikidataId: "Q101625", countryCode: "MA", countryName: "Morocco", name: "马拉喀什", sourceTitle: "Marrakech", latitude: 31.6295, longitude: -7.9811 }),
    destination({ wikidataId: "Q478668", countryCode: "MA", countryName: "Morocco", name: "阿伊特本哈杜", sourceTitle: "Ait Benhaddou", latitude: 31.0470, longitude: -7.1295 }),
    destination({ wikidataId: "search-ma-erg-chebbi", countryCode: "MA", countryName: "Morocco", name: "尔格切比沙丘", sourceTitle: "Erg Chebbi", latitude: 31.1431, longitude: -3.9909 }),
    destination({ wikidataId: "Q193196", countryCode: "MA", countryName: "Morocco", name: "梅尔祖卡", sourceTitle: "Merzouga", latitude: 31.0992, longitude: -4.0108 }),
    destination({ wikidataId: "Q80985", countryCode: "MA", countryName: "Morocco", name: "菲斯", sourceTitle: "Fes", latitude: 34.0331, longitude: -5.0003 }),
    destination({ wikidataId: "Q836013", countryCode: "MA", countryName: "Morocco", name: "舍夫沙万", sourceTitle: "Chefchaouen", latitude: 35.1688, longitude: -5.2636 }),
    destination({ wikidataId: "Q7903", countryCode: "MA", countryName: "Morocco", name: "卡萨布兰卡", sourceTitle: "Casablanca", latitude: 33.5731, longitude: -7.5898 }),
  ],
};

export function mergeSearchKnowledgeGraphFallbacks(pool = {}) {
  const next = clone(pool || {});
  for (const [countryCode, fallbacks] of Object.entries(SEARCH_KNOWLEDGE_GRAPH_FALLBACKS)) {
    const existing = Array.isArray(next[countryCode]) ? next[countryCode] : [];
    const seen = new Set(existing.map((item) => item.wikidataId || item.sourceTitle || item.name).filter(Boolean));
    const additions = fallbacks.filter((item) => !seen.has(item.wikidataId || item.sourceTitle || item.name));
    next[countryCode] = [...existing, ...clone(additions)];
  }
  return next;
}
