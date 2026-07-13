(function (global) {
  const TravelData = global.TravelData || (typeof require === "function" ? require("./travel-data.js") : {});
  const TRAVEL_STATE_STORAGE_KEY = "travelCollectionState";
  const ROUTE_V1_STORAGE_KEYS = [
    "routeCache",
    "routeSearchCache",
    "routeDiscoveryCache",
    "savedRoutes",
    "favoriteRoutes",
  ];
  const DEFAULT_TRIP_COVER = TravelData.DEFAULT_TRIP_COVER || "assets/trip-cover-placeholder.svg";
  const TOTAL_COUNTRY_COUNT = 195;
  const BLOCKED_COVER_ASSETS = new Set([
    "assets/city-helsinki-cover.svg",
    "assets/city-chiangmai-cover.svg",
  ]);

  const defaultCountries = [
    ["JP", "日本", "assets/country-landmark-japan.jpg"],
    ["TR", "土耳其", "assets/country-landmark-turkey.jpg"],
    ["TH", "泰国", "assets/country-landmark-thailand.jpg"],
    ["IT", "意大利", "assets/country-landmark-italy.jpg"],
    ["FR", "法国", "assets/country-landmark-france.jpg"],
    ["IS", "冰岛", "assets/country-landmark-iceland.jpg"],
    ["KR", "韩国", "assets/country-landmark-korea.jpg"],
    ["SG", "新加坡", "assets/country-landmark-singapore.jpg"],
    ["MY", "马来西亚", "assets/country-landmark-malaysia.jpg"],
    ["AE", "阿联酋", "assets/country-landmark-uae.jpg"],
    ["EG", "埃及", "assets/country-landmark-egypt.jpg"],
    ["NO", "挪威", "assets/country-landmark-norway.jpg"],
    ["FI", "芬兰", "assets/country-landmark-finland.png"],
    ["SE", "瑞典", "assets/country-landmark-sweden.jpg"],
    ["KE", "肯尼亚", "assets/country-landmark-kenya.jpg"],
    ["TZ", "坦桑尼亚", "assets/country-landmark-tanzania.jpg"],
    ["GR", "希腊", "assets/country-landmark-greece.jpg"],
    ["UZ", "乌兹别克斯坦", "assets/country-landmark-uzbekistan.jpg"],
    ["KZ", "哈萨克斯坦", "assets/country-landmark-kazakhstan.jpg"],
    ["KG", "吉尔吉斯斯坦", "assets/country-landmark-kyrgyzstan.jpg"],
    ["VN", "越南", "assets/country-landmark-vietnam.jpg"],
    ["KH", "柬埔寨", "assets/country-landmark-cambodia.jpg"],
  ].map(([id, name, cover]) => ({ id, name, cover }));

  const countryDetails = {
    JP: {
      intro: "融合传统与现代的国度，四季分明，文化多元，适合城市漫游、温泉、美食和季节旅行。",
      tags: ["樱花", "城市漫游", "温泉", "美食"],
      recommendedDays: "5-8天",
      bestSeason: "3-5月 / 10-11月",
      budgetLevel: "中高",
      spots: ["富士山", "浅草寺", "伏见稻荷大社", "道顿堀"],
      searchText: "日本 Japan 东京 京都 大阪 札幌 樱花 温泉 美食",
    },
    NO: {
      intro: "峡湾、城市设计和北境自然感并存，适合作为北欧路线的起点。",
      tags: ["峡湾", "极光", "设计", "海岸"],
      recommendedDays: "5-9天",
      bestSeason: "6-9月 / 12-3月",
      budgetLevel: "高",
      spots: ["奥斯陆歌剧院", "峡湾游船", "维格兰雕塑公园"],
      searchText: "挪威 Norway 奥斯陆 峡湾 极光 北欧",
    },
    IS: {
      intro: "火山、瀑布、冰川和极光集中，适合自然风景主题旅行。",
      tags: ["极光", "冰川", "瀑布", "自驾"],
      recommendedDays: "5-8天",
      bestSeason: "6-9月 / 9-3月",
      budgetLevel: "高",
      spots: ["黄金圈", "黑沙滩", "蓝湖"],
      searchText: "冰岛 Iceland 雷克雅未克 极光 冰川 瀑布",
    },
    IT: {
      intro: "古城、艺术、美食和海岸线兼具，适合城市串联旅行。",
      tags: ["古城", "艺术", "美食", "海岸"],
      recommendedDays: "7-10天",
      bestSeason: "4-6月 / 9-10月",
      budgetLevel: "中高",
      spots: ["斗兽场", "乌菲兹美术馆", "威尼斯运河"],
      searchText: "意大利 Italy 罗马 佛罗伦萨 威尼斯 艺术",
    },
  };

  const defaultCities = [
    ["JP-TYO", "东京", "JP", "assets/city-tokyo-cover.svg"],
    ["JP-KYO", "京都", "JP", "assets/city-kyoto-cover.svg"],
    ["JP-OSA", "大阪", "JP", "assets/city-osaka-cover.svg"],
    ["JP-SPK", "札幌", "JP", "assets/city-sapporo-cover.svg"],
    ["TR-IST", "伊斯坦布尔", "TR", "assets/city-istanbul-cover.svg"],
    ["TR-CAP", "卡帕多奇亚", "TR", "assets/city-cappadocia-cover.svg"],
    ["TR-ANT", "安塔利亚", "TR", "assets/city-antalya-cover.svg"],
    ["TH-CNX", "清迈", "TH", "assets/country-landmark-thailand.jpg"],
    ["TH-CEI", "清莱", "TH", "assets/city-chiangrai-cover.svg"],
    ["IT-ROM", "罗马", "IT", "assets/city-rome-cover.svg"],
    ["IT-FLR", "佛罗伦萨", "IT", "assets/city-florence-cover.svg"],
    ["IT-VCE", "威尼斯", "IT", "assets/city-venice-cover.svg"],
    ["FR-PAR", "巴黎", "FR", "assets/city-paris-cover.svg"],
    ["FR-NCE", "尼斯", "FR", "assets/city-nice-cover.svg"],
    ["IS-REK", "雷克雅未克", "IS", "assets/city-reykjavik-cover.svg"],
    ["KR-SEL", "首尔", "KR", "assets/city-seoul-cover.svg"],
    ["KR-PUS", "釜山", "KR", "assets/city-busan-cover.svg"],
    ["SG-SIN", "新加坡", "SG", "assets/city-singapore-cover.svg"],
    ["MY-KUL", "吉隆坡", "MY", "assets/city-kuala-lumpur-cover.svg"],
    ["MY-PEN", "槟城", "MY", "assets/city-penang-cover.svg"],
    ["AE-DXB", "迪拜", "AE", "assets/city-dubai-cover.svg"],
    ["AE-AUH", "阿布扎比", "AE", "assets/city-abudhabi-cover.svg"],
    ["EG-CAI", "开罗", "EG", "assets/city-cairo-cover.svg"],
    ["EG-LXR", "卢克索", "EG", "assets/city-luxor-cover.svg"],
    ["JP-YOK", "横滨", "JP", "assets/city-yokohama-cover.svg"],
    ["JP-NAR", "奈良", "JP", "assets/city-nara-cover.svg"],
    ["JP-KOB", "神户", "JP", "assets/city-kobe-cover.svg"],
    ["NO-OSL", "奥斯陆", "NO", "assets/city-oslo-cover.svg"],
    ["FI-HEL", "赫尔辛基", "FI", "assets/country-landmark-finland.png"],
    ["SE-STO", "斯德哥尔摩", "SE", "assets/city-stockholm-cover.svg"],
    ["KE-NBO", "内罗毕", "KE", "assets/city-nairobi-cover.svg"],
    ["TZ-ARK", "阿鲁沙", "TZ", "assets/city-arusha-cover.svg"],
    ["EG-GLZ", "吉萨", "EG", "assets/city-giza-cover.svg"],
    ["GR-ATH", "雅典", "GR", "assets/city-athens-cover.svg"],
    ["TH-HKT", "普吉", "TH", "assets/city-phuket-cover.svg"],
    ["TH-KBI", "甲米", "TH", "assets/city-krabi-cover.svg"],
    ["UZ-SKD", "撒马尔罕", "UZ", "assets/city-samarkand-cover.svg"],
    ["VN-HAN", "河内", "VN", "assets/city-hanoi-cover.svg"],
    ["KH-REP", "暹粒", "KH", "assets/city-siemreap-cover.svg"],
  ].map(([id, name, countryId, cover]) => ({ id, name, countryId, cover }));

  const cityDetails = {
    "JP-TYO": {
      intro: "现代与传统交织的国际化大都市，适合第一次到日本时作为起点。",
      tags: ["城市", "美食", "展览", "夜景"],
      spots: ["浅草寺", "涩谷路口", "明治神宫", "东京塔"],
      searchText: "东京 Tokyo 日本 城市 美食 夜景",
    },
    "JP-KYO": {
      intro: "寺社、庭园和老街集中，适合放慢节奏感受传统日本。",
      tags: ["古建筑", "庭园", "神社", "慢旅行"],
      spots: ["伏见稻荷大社", "清水寺", "岚山", "祇园"],
      searchText: "京都 Kyoto 日本 神社 古建筑 庭园",
    },
    "JP-OSA": {
      intro: "关西的热闹城市核心，美食、购物和夜晚街区都很集中。",
      tags: ["美食", "城市", "购物", "夜景"],
      spots: ["道顿堀", "大阪城", "梅田蓝天大厦", "黑门市场"],
      searchText: "大阪 Osaka 日本 美食 关西 城市",
    },
    "JP-SPK": {
      intro: "北海道门户城市，适合串联小樽、温泉和冬季雪景。",
      tags: ["雪景", "美食", "北海道", "城市"],
      spots: ["大通公园", "札幌电视塔", "白色恋人公园"],
      searchText: "札幌 Sapporo 日本 北海道 雪景",
    },
    "NO-OSL": {
      intro: "挪威首都，峡湾、建筑和博物馆集中，适合作为北欧路线起点。",
      tags: ["设计", "峡湾", "博物馆", "海港"],
      spots: ["奥斯陆歌剧院", "维格兰雕塑公园", "蒙克美术馆", "阿克尔码头"],
      searchText: "奥斯陆 Oslo 挪威 北欧 峡湾 设计",
    },
    "IS-REK": {
      intro: "冰岛旅行的城市门户，适合连接黄金圈、南岸和极光体验。",
      tags: ["极光", "海港", "温泉", "自然"],
      spots: ["哈尔格林姆教堂", "太阳航海者", "蓝湖"],
      searchText: "雷克雅未克 Reykjavik 冰岛 极光",
    },
  };

  const achievementCatalog = [
    ["first_country", "第一次点亮国家", "点亮你的第一个国家", "exploration", "countryCount", 1, "assets/achievement-crops/achievement-crop-badge-01.png"],
    ["first_trip", "完成第一趟旅程", "完成你的第一趟旅程", "trip", "tripCount", 1, "assets/achievement-crops/achievement-crop-badge-02.png"],
    ["explore_5_countries", "5国探索者", "探索 5 个国家", "exploration", "countryCount", 5, "assets/achievement-crops/achievement-crop-badge-03.png"],
    ["explore_10_countries", "10国探索者", "探索 10 个国家", "exploration", "countryCount", 10, "assets/achievement-crops/achievement-crop-badge-04.png"],
    ["explore_30_countries", "30国探索者", "探索 30 个国家", "exploration", "countryCount", 30, "assets/achievement-crops/achievement-crop-badge-05.png"],
    ["explore_50_countries", "50国探索者", "探索 50 个国家", "exploration", "countryCount", 50, "assets/achievement-crops/achievement-crop-badge-06.png"],
    ["three_continents", "跨越三大洲", "探索国家涉及 3 个大洲", "exploration", "continentCount", 3, "assets/achievement-crops/achievement-crop-badge-07.png"],
    ["aurora_chaser", "极光追寻者", "探索极光主题国家", "theme", "themeCountryCount", 1, "assets/achievement-crops/achievement-crop-badge-08.png"],
    ["ancient_civilization", "古文明旅人", "探索 2 个古文明国家", "theme", "themeCountryCount", 2, "assets/achievement-crops/achievement-crop-badge-09.png"],
    ["island_wanderer", "海岛漫游者", "探索 3 个海岛国家", "theme", "themeCountryCount", 3, "assets/achievement-crops/achievement-crop-badge-10.png"],
    ["collector", "收藏家", "收藏内容达到 20 条", "collection", "favoriteCount", 20, "assets/achievement-crops/achievement-crop-badge-11.png"],
  ].map(([id, title, description, category, targetType, targetValue, icon]) => ({
    id,
    title,
    description,
    category,
    targetType,
    targetValue,
    icon,
    cover: icon,
  }));

  const defaultExploredCountryIds = ["JP", "TR", "TH", "IT", "FR", "IS", "KR", "SG", "MY", "AE", "EG"];
  const defaultExploredCityIds = defaultCities.slice(0, 27).map((city) => city.id);

  function createDefaultTravelState() {
    return {
      userProfile: {
        nickname: "Ruby",
        avatar: "assets/profile-avatar-kuma-small.jpg",
      },
      countries: defaultData("DEFAULT_COUNTRIES", defaultCountries),
      cities: defaultData("DEFAULT_CITIES", defaultCities),
      trips: [],
      budgetItems: [],
      achievements: [],
      notifications: [
        { id: "notification-system-welcome", type: "系统通知", text: "旅行收藏册已接入统一状态。", time: "今天", read: false },
      ],
      detailCache: [],
      manualVisitRecords: [],
      manualExploredCountryIds: [],
      manualExploredCityIds: [],
      favoriteCountryIds: ["JP", "IS"],
      favoriteCityIds: ["JP-TYO", "JP-KYO"],
      favoriteRouteEntries: [],
      routeImageAssetCache: {},
    };
  }

  function createEmptyTravelState() {
    const defaults = createDefaultTravelState();
    return {
      userProfile: defaults.userProfile,
      countries: defaults.countries,
      cities: defaults.cities,
      trips: [],
      budgetItems: [],
      achievements: [],
      notifications: [],
      detailCache: [],
      manualVisitRecords: [],
      manualExploredCountryIds: [],
      manualExploredCityIds: [],
      favoriteCountryIds: [],
      favoriteCityIds: [],
      favoriteRouteEntries: [],
      routeImageAssetCache: {},
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultData(key, fallback) {
    return clone(TravelData[key] || fallback);
  }

  function normalizeList(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalizeTextList(value) {
    return unique(normalizeList(value).map((item) => String(item || "").trim()).filter(Boolean));
  }

  function normalizeRouteSnapshot(value = {}) {
    value = value || {};
    const id = String(value.id || "").trim();
    const name = String(value.name || "").trim();
    if (!id || !name) return null;
    const durationDays = Number(value.durationDays);
    const sourceName = String(value.source?.name || "").trim();
    const sourceUrl = String(value.source?.url || "").trim();
    return {
      id,
      name,
      canonicalTitle: String(value.canonicalTitle || value.name || "").trim(),
      sourceTitle: String(value.sourceTitle || "").trim(),
      summary: String(value.summary || "").trim(),
      recommendationText: String(value.recommendationText || value.summary || "").trim(),
      countries: normalizeTextList(value.countries),
      cities: normalizeTextList(value.cities),
      destinations: normalizeTextList(value.destinations || value.cities),
      durationDays: Number.isFinite(durationDays) && durationDays > 0 ? Math.round(durationDays) : null,
      recommendedDays: String(value.recommendedDays || "").trim(),
      bestMonths: normalizeTextList(value.bestMonths),
      themes: normalizeTextList(value.themes),
      tags: normalizeTextList(value.tags),
      highlights: normalizeTextList(value.highlights),
      coverImage: String(value.coverImage || "").trim(),
      coverImageKind: String(value.coverImageKind || "").trim(),
      coverAsset: value.coverAsset && typeof value.coverAsset === "object" ? clone(value.coverAsset) : null,
      destinationAssets: normalizeList(value.destinationAssets).map((item) => clone(item)),
      countryEntities: normalizeList(value.countryEntities).map((item) => clone(item)),
      destinationEntities: normalizeList(value.destinationEntities).map((item) => clone(item)),
      provenance: value.provenance && typeof value.provenance === "object" ? clone(value.provenance) : {},
      routeBannerTitle: String(value.routeBannerTitle || "").trim(),
      routeImageTitle: String(value.routeImageTitle || "").trim(),
      routeSearchTerms: normalizeTextList(value.routeSearchTerms),
      enrichmentStatus: ["basic", "enriched", "mediaReady", "failed"].includes(String(value.enrichmentStatus || ""))
        ? String(value.enrichmentStatus)
        : (normalizeList(value.destinationAssets).length ? "mediaReady" : "enriched"),
      source: sourceName && sourceUrl ? { name: sourceName, url: sourceUrl } : null,
      savedAt: String(value.savedAt || "").trim(),
    };
  }

  function normalizeSavedRouteSnapshots(value) {
    const snapshots = new Map();
    normalizeList(value).forEach((item) => {
      const snapshot = normalizeRouteSnapshot(item);
      if (snapshot) snapshots.set(snapshot.id, snapshot);
    });
    return [...snapshots.values()];
  }

  function normalizeFavoriteRouteEntries(value, legacyIds = [], legacySnapshots = []) {
    const entries = new Map();
    normalizeList(value).forEach((item) => {
      const routeId = String(item?.routeId || item?.routeSnapshot?.id || "").trim();
      if (!routeId) return;
      const routeSnapshot = normalizeRouteSnapshot(item.routeSnapshot);
      entries.set(routeId, {
        routeId,
        routeSnapshot,
        favoritedAt: String(item.favoritedAt || routeSnapshot?.savedAt || "").trim(),
        migrationStatus: routeSnapshot ? "complete" : "pending",
      });
    });
    normalizeSavedRouteSnapshots(legacySnapshots).forEach((routeSnapshot) => {
      entries.set(routeSnapshot.id, {
        routeId: routeSnapshot.id,
        routeSnapshot,
        favoritedAt: routeSnapshot.savedAt || "",
        migrationStatus: "complete",
      });
    });
    normalizeTextList(legacyIds).forEach((routeId) => {
      if (!entries.has(routeId)) entries.set(routeId, { routeId, routeSnapshot: null, favoritedAt: "", migrationStatus: "pending" });
    });
    return [...entries.values()];
  }

  function normalizeRouteImageAssetCache(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([routeId, item]) => {
      const id = String(routeId || "").trim();
      const coverAsset = item?.coverAsset && typeof item.coverAsset === "object" ? clone(item.coverAsset) : null;
      const destinationAssets = normalizeList(item?.destinationAssets).map((asset) => clone(asset));
      if (!id || (!coverAsset?.imageUrl && !destinationAssets.length)) return [];
      return [[id, { coverAsset, destinationAssets, cachedAt: String(item.cachedAt || "").trim() }]];
    }));
  }

  function byId(items) {
    return Object.fromEntries(items.map((item) => [item.id, item]));
  }

  function coverById(items) {
    return Object.fromEntries(items.map((item) => [item.id, item.cover]).filter(([, cover]) => cover));
  }

  function isBlockedCover(cover) {
    return !cover || BLOCKED_COVER_ASSETS.has(cover);
  }

  function safeCountryCover(country) {
    return isBlockedCover(country.cover) ? DEFAULT_TRIP_COVER : country.cover;
  }

  function safeCityCover(city, countriesById) {
    if (!isBlockedCover(city.cover)) return city.cover;
    return safeCountryCover(countriesById[city.countryId] || {});
  }

  function syncDefaultCovers(items, covers) {
    return items.map((item) => ({ ...item, cover: covers[item.id] || item.cover }));
  }

  function mergeDefaultItems(defaultItems, sourceItems) {
    const sourceById = byId(sourceItems);
    const defaultIds = new Set(defaultItems.map((item) => item.id));
    const mergedDefaults = defaultItems.map((item) => ({ ...item, ...(sourceById[item.id] || {}) }));
    const customItems = sourceItems.filter((item) => item?.id && !defaultIds.has(item.id));
    return [...mergedDefaults, ...customItems];
  }

  function mergeDetails(items, details) {
    return items.map((item) => ({ ...(details[item.id] || {}), ...item }));
  }

  function resolveId(value, itemsById) {
    if (!value) return null;
    if (typeof value === "object") return value.id || null;
    if (itemsById[value]) return value;
    const match = Object.values(itemsById).find((item) => item.name === value);
    return match?.id || value;
  }

  function normalizeIds(values, itemsById) {
    return unique(normalizeList(values).map((value) => resolveId(value, itemsById)));
  }

  function normalizeKnownIds(values, itemsById) {
    return unique(normalizeList(values).map((value) => {
      if (value && typeof value === "object" && itemsById[value.id]) return value.id;
      const text = String(value || "").trim().toLowerCase();
      if (!text) return null;
      const match = Object.values(itemsById).find((item) => (
        [item.id, item.name, item.englishName].some((candidate) => String(candidate || "").trim().toLowerCase() === text)
      ));
      return match?.id || null;
    }).filter(Boolean));
  }

  function normalizeBudgetItems(value) {
    if (!value) return {};
    if (Array.isArray(value)) {
      return value.reduce((itemsByTrip, item) => {
        const tripId = item?.tripId;
        if (!tripId) return itemsByTrip;
        itemsByTrip[tripId] = [...(itemsByTrip[tripId] || []), { ...item }];
        return itemsByTrip;
      }, {});
    }
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([tripId, items]) => [
          tripId,
          normalizeList(items).map((item) => ({ ...item, tripId: item.tripId || tripId })),
        ]),
      );
    }
    return {};
  }

  function normalizeNotifications(value) {
    return normalizeList(value).map((item, index) => ({
      id: item.id || `notification-${index + 1}`,
      type: item.type || "系统通知",
      text: item.text || "",
      time: item.time || "刚刚",
      read: Boolean(item.read),
    }));
  }

  function normalizeDetailCache(value) {
    return normalizeList(value).map((item) => ({
      targetType: item.targetType || "",
      targetId: item.targetId || "",
      data: item.data && typeof item.data === "object" ? item.data : {},
      source: item.source || "web",
      updatedAt: item.updatedAt || todayText(),
      expiresAt: item.expiresAt || "",
    })).filter((item) => item.targetType && item.targetId && item.targetType !== "route");
  }

  function todayText() {
    return new Date().toISOString().slice(0, 10).replaceAll("-", ".");
  }

  function sameIds(a, b) {
    return normalizeList(a).slice().sort().join("|") === normalizeList(b).slice().sort().join("|");
  }

  function isLegacyDefaultFootprint(source, countryIds) {
    const tripIds = normalizeList(source.trips).map((trip) => trip.id);
    return sameIds(countryIds, defaultExploredCountryIds)
      && tripIds.includes("trip-japan-kansai")
      && tripIds.includes("trip-nordic");
  }

  function normalizeVisitRecords(value, countriesById, citiesById) {
    return normalizeList(value).map((record, index) => {
      const cityId = resolveId(record.cityId || record.city, citiesById);
      const countryId = resolveId(record.countryId || record.country || citiesById[cityId]?.countryId, countriesById);
      if (!countryId && !cityId) return null;
      return {
        id: record.id || `manual-visit-${countryId || cityId}-${index + 1}`,
        countryId: countryId || citiesById[cityId]?.countryId || "",
        cityId: cityId || "",
        date: record.date || record.visitedAt || record.time || todayText(),
        note: record.note || "",
      };
    }).filter(Boolean);
  }

  function legacyVisitRecords(countryIds, cityIds, countriesById, citiesById, date = todayText()) {
    const countryRecords = normalizeIds(countryIds, countriesById).map((countryId) => ({
      id: `manual-visit-${countryId}`,
      countryId,
      cityId: "",
      date,
      note: "",
    }));
    const cityRecords = normalizeIds(cityIds, citiesById).map((cityId) => ({
      id: `manual-visit-${cityId}`,
      countryId: citiesById[cityId]?.countryId || "",
      cityId,
      date,
      note: "",
    }));
    return [...countryRecords, ...cityRecords];
  }

  function normalizeStatusOverride(value, itemsById) {
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([id, status]) => [resolveId(id, itemsById), status])
        .filter(([id, status]) => id && ["explored", "planned", "unexplored"].includes(status)),
    );
  }

  function textTokens(item) {
    return normalizeList(item.tags)
      .concat(normalizeList(item.keywords))
      .concat(item.searchText || "", item.name || "", item.englishName || "")
      .join(" ")
      .toLowerCase();
  }

  function countryMatches(country, keywords, whitelistIds, whitelistNames) {
    const text = textTokens(country);
    return keywords.some((keyword) => text.includes(keyword))
      || whitelistIds.includes(country.id)
      || whitelistNames.includes(country.name)
      || whitelistNames.includes(country.englishName);
  }

  function achievementMetrics(state = {}) {
    const exploredCountries = normalizeList(state.countries).filter((country) => country.explorationStatus === "explored");
    const exploredCities = normalizeList(state.cities).filter((city) => city.explorationStatus === "explored");
    const completedTrips = normalizeList(state.trips).filter((trip) => trip.status === "completed");
    const favoriteCountries = normalizeList(state.favoriteCountryIds).length
      ? normalizeList(state.favoriteCountryIds)
      : normalizeList(state.countries).filter((country) => country.isFavorite).map((country) => country.id);
    const favoriteCities = normalizeList(state.favoriteCityIds).length
      ? normalizeList(state.favoriteCityIds)
      : normalizeList(state.cities).filter((city) => city.isFavorite).map((city) => city.id);
    const continentCount = unique(exploredCountries.map((country) => country.continent)).length;
    const auroraCount = exploredCountries.filter((country) => countryMatches(
      country,
      ["aurora", "极光", "northern_lights", "northern lights"],
      ["NO", "FI", "IS", "SE"],
      ["挪威", "芬兰", "冰岛", "瑞典", "Norway", "Finland", "Iceland", "Sweden"],
    )).length;
    const ancientCount = exploredCountries.filter((country) => countryMatches(
      country,
      ["ancient", "civilization", "history", "ruins", "古文明", "古迹"],
      ["EG", "GR", "IT", "CN", "MX", "TR"],
      ["埃及", "希腊", "意大利", "中国", "墨西哥", "土耳其", "Egypt", "Greece", "Italy", "China", "Mexico", "Turkey"],
    )).length;
    const islandCount = exploredCountries.filter((country) => countryMatches(
      country,
      ["island", "海岛"],
      ["JP", "PH", "ID", "MV", "LK", "IS", "TH", "MY"],
      ["日本", "菲律宾", "印度尼西亚", "马尔代夫", "斯里兰卡", "冰岛", "泰国", "马来西亚", "Japan", "Philippines", "Indonesia", "Maldives", "Sri Lanka", "Iceland", "Thailand", "Malaysia"],
    )).length;

    return {
      exploredCountries,
      exploredCities,
      completedTrips,
      favoriteCountries,
      favoriteCities,
      countryCount: exploredCountries.length,
      cityCount: exploredCities.length,
      tripCount: completedTrips.length,
      continentCount,
      auroraCount,
      ancientCount,
      islandCount,
      favoriteCount: favoriteCountries.length + favoriteCities.length,
    };
  }

  function achievementCurrentValue(achievement, metrics) {
    if (achievement.id === "aurora_chaser") return metrics.auroraCount;
    if (achievement.id === "ancient_civilization") return metrics.ancientCount;
    if (achievement.id === "island_wanderer") return metrics.islandCount;
    if (achievement.targetType === "countryCount") return metrics.countryCount;
    if (achievement.targetType === "tripCount") return metrics.tripCount;
    if (achievement.targetType === "continentCount") return metrics.continentCount;
    if (achievement.targetType === "favoriteCount") return metrics.favoriteCount;
    return 0;
  }

  function mergeAchievements(sourceAchievements, achievementState) {
    const storedById = byId(normalizeList(sourceAchievements));
    const metrics = achievementMetrics(achievementState);
    const today = todayText();
    return achievementCatalog.map((achievement) => {
      const stored = storedById[achievement.id] || {};
      const currentValue = achievementCurrentValue(achievement, metrics);
      const shouldUnlock = currentValue >= achievement.targetValue;
      const unlockedAt = stored.unlockedAt || (stored.unlocked ? today : "") || (shouldUnlock ? today : "");
      const unlocked = Boolean(unlockedAt);
      return {
        ...achievement,
        currentValue,
        unlocked,
        unlockedAt,
        progress: `${currentValue} / ${achievement.targetValue}`,
        progressPercent: achievement.targetValue ? Math.min(100, Math.round(currentValue / achievement.targetValue * 100)) : 0,
      };
    });
  }

  function ensureNotification(notifications, notification) {
    if (notifications.some((item) => item.id === notification.id)) return notifications;
    return [notification, ...notifications];
  }

  function addGeneratedNotifications(state, previousAchievements = []) {
    let notifications = normalizeNotifications(state.notifications);
    const previousUnlocked = new Set(
      normalizeList(previousAchievements).filter((item) => item.unlockedAt).map((item) => item.id),
    );
    normalizeList(state.achievements)
      .filter((item) => item.unlockedAt && !previousUnlocked.has(item.id))
      .forEach((item) => {
        notifications = ensureNotification(notifications, {
          id: `notification-achievement-${item.id}`,
          type: "成就解锁",
          text: `已解锁「${item.title}」`,
          time: item.unlockedAt || "刚刚",
          read: false,
        });
      });
    normalizeList(state.trips)
      .filter((trip) => trip.status === "completed")
      .forEach((trip) => {
        notifications = ensureNotification(notifications, {
          id: `notification-footprint-${trip.id}`,
          type: "足迹事件",
          text: `${trip.name || "一趟旅程"}已同步到足迹。`,
          time: trip.end || trip.endDate || "刚刚",
          read: false,
        });
      });
    normalizeList(state.trips)
      .filter((trip) => trip.status !== "completed")
      .slice(0, 2)
      .forEach((trip) => {
        notifications = ensureNotification(notifications, {
          id: `notification-trip-${trip.id}`,
          type: "行程提醒",
          text: `${trip.name || "待出行行程"}正在规划中。`,
          time: trip.start || trip.startDate || "待定",
          read: false,
        });
      });
    return notifications;
  }

  function tripStatus(status) {
    if (status === "planned" || status === "待出行" || status === "规划中") return "planned";
    if (status === "completed" || status === "已完成") return "completed";
    if (status === "cancelled" || status === "deleted") return status;
    return "planned";
  }

  function dateValue(value) {
    if (!value) return 0;
    const normalized = String(value).replaceAll(".", "-").replace(/[^\d-].*$/, "");
    const time = new Date(normalized).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function normalizeTrip(trip, countriesById, citiesById) {
    const countryIds = normalizeIds(trip.countryIds || trip.countries || trip.places, countriesById);
    const cityIds = normalizeIds(trip.cityIds || trip.cities, citiesById);
    const routeSnapshot = normalizeRouteSnapshot(trip.routeSnapshot);
    const normalized = {
      ...trip,
      id: trip.id || `trip-${Date.now()}`,
      status: tripStatus(trip.status),
      countryIds,
      cityIds,
    };
    if (routeSnapshot) normalized.routeSnapshot = routeSnapshot;
    else delete normalized.routeSnapshot;
    delete normalized.routeId;
    delete normalized[["source", "RouteId"].join("")];
    normalized.cover = routeSnapshot ? resolveTripCover(normalized, { countriesById }) : trip.cover || resolveTripCover(normalized, { countriesById });
    return normalized;
  }

  function resolveTripCover(trip, state) {
    const routeAssetCover = String(trip?.routeSnapshot?.coverAsset?.imageUrl || "").trim();
    if (routeAssetCover) return routeAssetCover;
    const routeCover = String(trip?.routeSnapshot?.coverImage || "").trim();
    if (routeCover) return routeCover;
    if (trip?.routeSnapshot) return "";
    const countriesById = state.countriesById || byId(state.countries || []);
    const countryId = normalizeList(trip?.countryIds || trip?.countries)[0];
    const countryCover = countriesById[countryId]?.cover;
    return countryCover || DEFAULT_TRIP_COVER;
  }

  function recalculateTravelState(input = {}) {
    const defaults = createDefaultTravelState();
    const source = input && Object.keys(input).length ? input : defaults;
    const defaultCountryCovers = coverById(defaults.countries);
    const defaultCityCovers = coverById(defaults.cities);
    const sourceCountries = normalizeList(source.countries?.length ? source.countries : defaults.countries);
    let countries = syncDefaultCovers(
      mergeDetails(mergeDefaultItems(defaults.countries, sourceCountries), countryDetails),
      defaultCountryCovers,
    ).map((country) => ({ ...country, cover: safeCountryCover(country) }));
    const countriesById = byId(countries);
    const cities = syncDefaultCovers(
      mergeDetails(normalizeList(source.cities?.length ? source.cities : defaults.cities), cityDetails),
      defaultCityCovers,
    ).map((city) => ({ ...city, cover: safeCityCover(city, countriesById) }));
    const citiesById = byId(cities);
    const legacyManualExploredCountryIds = normalizeIds(
      source.manualExploredCountryIds || source.manualExploredCountries || source.exploredCountryIds || source.exploredCountries,
      countriesById,
    );
    const legacyManualExploredCityIds = normalizeIds(
      source.manualExploredCityIds || source.manualExploredCities || source.exploredCityIds || source.exploredCities,
      citiesById,
    );
    const hasManualVisitRecords = normalizeList(source.manualVisitRecords).length > 0;
    const manualVisitRecords = hasManualVisitRecords
      ? normalizeVisitRecords(source.manualVisitRecords, countriesById, citiesById)
      : isLegacyDefaultFootprint(source, legacyManualExploredCountryIds)
        ? []
        : legacyVisitRecords(legacyManualExploredCountryIds, legacyManualExploredCityIds, countriesById, citiesById);
    const manualExploredCountryIds = unique(manualVisitRecords.map((record) => record.countryId).filter(Boolean));
    const manualExploredCityIds = unique(manualVisitRecords.map((record) => record.cityId).filter(Boolean));
    const hasFavoriteCountryIds = Array.isArray(source.favoriteCountryIds) || Array.isArray(source.favoriteCountries);
    const hasFavoriteCityIds = Array.isArray(source.favoriteCityIds) || Array.isArray(source.favoriteCities);
    const favoriteCountryIds = unique([
      ...normalizeIds(source.favoriteCountryIds || source.favoriteCountries, countriesById),
      ...(hasFavoriteCountryIds ? [] : countries.filter((country) => country.isFavorite).map((country) => country.id)),
    ]);
    const favoriteCityIds = unique([
      ...normalizeIds(source.favoriteCityIds || source.favoriteCities, citiesById),
      ...(hasFavoriteCityIds ? [] : cities.filter((city) => city.isFavorite).map((city) => city.id)),
    ]);
    const favoriteRouteEntries = normalizeFavoriteRouteEntries(
      source.favoriteRouteEntries,
      source.favoriteRouteRecordIds,
      source.savedRouteSnapshots,
    );
    const sourceOverrides = source.manualStatusOverride || {};
    const manualCountryStatusOverride = normalizeStatusOverride(
      sourceOverrides.countries || source.manualCountryStatusOverride,
      countriesById,
    );
    const manualCityStatusOverride = normalizeStatusOverride(
      sourceOverrides.cities || source.manualCityStatusOverride,
      citiesById,
    );
    const trips = normalizeList(source.trips).map((trip) => normalizeTrip(trip, countriesById, citiesById));

    const exploredCountryIds = new Set(manualExploredCountryIds);
    const exploredCityIds = new Set(manualExploredCityIds);
    const plannedCountryIds = new Set();
    const plannedCityIds = new Set();

    trips.forEach((trip) => {
      const targetCountries = trip.status === "completed" ? exploredCountryIds : plannedCountryIds;
      const targetCities = trip.status === "completed" ? exploredCityIds : plannedCityIds;
      if (trip.status === "cancelled" || trip.status === "deleted") return;
      normalizeList(trip.countryIds).forEach((id) => targetCountries.add(id));
      normalizeList(trip.cityIds).forEach((id) => {
        targetCities.add(id);
        const countryId = citiesById[id]?.countryId;
        if (countryId) targetCountries.add(countryId);
      });
    });

    countries.forEach((country) => {
      country.isFavorite = favoriteCountryIds.includes(country.id);
      country.explorationStatus = exploredCountryIds.has(country.id)
        ? "explored"
        : plannedCountryIds.has(country.id)
          ? "planned"
          : "unexplored";
    });

    cities.forEach((city) => {
      city.isFavorite = favoriteCityIds.includes(city.id);
      city.explorationStatus = exploredCityIds.has(city.id)
        ? "explored"
        : plannedCityIds.has(city.id)
          ? "planned"
          : "unexplored";
    });

    const nextTrip = trips
      .filter((trip) => trip.status !== "completed")
      .sort((a, b) => dateValue(a.start || a.startDate) - dateValue(b.start || b.startDate))[0] || null;
    const recentTrip = trips
      .filter((trip) => trip.status === "completed")
      .sort((a, b) => dateValue(b.end || b.endDate) - dateValue(a.end || a.endDate))[0] || null;

    const stats = getTravelStats({ countries, cities, trips });
    const achievementState = {
      countries,
      cities,
      trips,
      favoriteCountryIds,
      favoriteCityIds,
    };
    const achievements = mergeAchievements(source.achievements, achievementState);
    const state = {
      ...source,
      userProfile: { ...defaults.userProfile, ...(source.userProfile || {}) },
      countries,
      cities,
      trips,
      budgetItems: normalizeBudgetItems(source.budgetItems),
      achievements,
      notifications: normalizeNotifications(source.notifications),
      detailCache: normalizeDetailCache(source.detailCache),
      manualVisitRecords,
      manualExploredCountryIds,
      manualExploredCityIds,
      manualStatusOverride: {
        countries: manualCountryStatusOverride,
        cities: manualCityStatusOverride,
      },
      favoriteCountryIds,
      favoriteCityIds,
      favoriteRouteEntries,
      routeImageAssetCache: normalizeRouteImageAssetCache(source.routeImageAssetCache),
      countriesById: byId(countries),
      citiesById: byId(cities),
      exploredCountries: countries.filter((country) => country.explorationStatus === "explored"),
      plannedCountries: countries.filter((country) => country.explorationStatus === "planned"),
      unexploredCountries: countries.filter((country) => country.explorationStatus === "unexplored"),
      exploredCities: cities.filter((city) => city.explorationStatus === "explored"),
      plannedCities: cities.filter((city) => city.explorationStatus === "planned"),
      nextTrip,
      recentTrip,
    };
    delete state.routes;
    delete state.routesById;
    delete state.favoriteRouteRecordIds;
    delete state.savedRouteSnapshots;
    delete state.favoriteRouteIds;
    delete state.favoriteRoutes;
    delete state[["last", "Route", "Candidate", "Save"].join("")];
    state.notifications = addGeneratedNotifications(state, source.achievements);
    return { ...state, ...stats };
  }

  function getTravelStats(state = {}) {
    const countries = normalizeList(state.countries);
    const cities = normalizeList(state.cities);
    const trips = normalizeList(state.trips);
    const exploredCountryCount = countries.filter((country) => country.explorationStatus === "explored").length;
    const exploredCityCount = cities.filter((city) => city.explorationStatus === "explored").length;
    const plannedCountryCount = countries.filter((country) => country.explorationStatus === "planned").length;
    const plannedCityCount = cities.filter((city) => city.explorationStatus === "planned").length;
    const completedTripCount = trips.filter((trip) => trip.status === "completed").length;
    const favoriteCount = countries.filter((country) => country.isFavorite).length
      + cities.filter((city) => city.isFavorite).length;

    return {
      exploredCountryCount,
      exploredCityCount,
      plannedCountryCount,
      plannedCityCount,
      completedTripCount,
      favoriteCount,
      footprintCount: exploredCountryCount + exploredCityCount + completedTripCount,
      totalCountryCount: TOTAL_COUNTRY_COUNT,
      progressPercent: Math.round(exploredCountryCount / TOTAL_COUNTRY_COUNT * 100),
    };
  }

  function readTravelState() {
    if (!global.localStorage) return recalculateTravelState(createDefaultTravelState());
    ROUTE_V1_STORAGE_KEYS.forEach((key) => global.localStorage.removeItem(key));
    const params = new URLSearchParams(global.location?.search || "");
    if (params.get("reset") === "empty") {
      const emptyState = writeTravelState(createEmptyTravelState());
      params.delete("reset");
      const nextQuery = params.toString();
      const nextUrl = `${global.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${global.location.hash || ""}`;
      global.history?.replaceState?.(null, "", nextUrl);
      return emptyState;
    }
    try {
      const stored = JSON.parse(global.localStorage.getItem(TRAVEL_STATE_STORAGE_KEY) || "{}");
      return recalculateTravelState(stored);
    } catch {
      return recalculateTravelState(createDefaultTravelState());
    }
  }

  function writeTravelState(nextState) {
    const normalized = recalculateTravelState(nextState);
    if (global.localStorage) {
      global.localStorage.setItem(TRAVEL_STATE_STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }

  function updateTravelState(updater) {
    const current = readTravelState();
    const next = typeof updater === "function" ? updater(clone(current)) : updater;
    return writeTravelState(next);
  }

  function getTripBudgetItems(state = {}, tripId) {
    const budgetItems = normalizeBudgetItems(state.budgetItems);
    return normalizeList(budgetItems[tripId]);
  }

  function favoriteKey(type) {
    if (type === "cities") return "favoriteCityIds";
    return "favoriteCountryIds";
  }

  function collectionKey(type) {
    if (type === "cities") return "cities";
    return "countries";
  }

  function getFavoriteItems(state = {}, type = "countries") {
    const ids = state[favoriteKey(type)] || [];
    const itemsById = byId(state[collectionKey(type)] || []);
    return ids.map((id) => itemsById[id]).filter(Boolean);
  }

  function setFavorite(state = {}, type = "countries", id, isFavorite = true) {
    const nextState = clone(state);
    const key = favoriteKey(type);
    const current = new Set(normalizeList(nextState[key]));
    if (isFavorite) current.add(id);
    else current.delete(id);
    nextState[key] = [...current];
    return recalculateTravelState(nextState);
  }

  function isRouteFavorite(state = {}, routeId) {
    const id = String(routeId || "").trim();
    return normalizeFavoriteRouteEntries(state.favoriteRouteEntries, state.favoriteRouteRecordIds, state.savedRouteSnapshots)
      .some((item) => item.routeId === id);
  }

  function setRouteFavorite(state = {}, routeRecord, isFavorite = true) {
    const record = routeRecord && typeof routeRecord === "object" ? normalizeRouteSnapshot(routeRecord) : null;
    const id = String(record?.id || routeRecord || "").trim();
    const nextState = recalculateTravelState(state);
    nextState.favoriteRouteEntries = normalizeFavoriteRouteEntries(nextState.favoriteRouteEntries)
      .filter((item) => item.routeId !== id);
    if (id && isFavorite) nextState.favoriteRouteEntries.push({
      routeId: id,
      routeSnapshot: record,
      favoritedAt: new Date().toISOString(),
      migrationStatus: record ? "complete" : "pending",
    });
    return recalculateTravelState(nextState);
  }

  function getFavoriteRouteSnapshot(state = {}, routeId) {
    const id = String(routeId || "").trim();
    const snapshot = normalizeFavoriteRouteEntries(state.favoriteRouteEntries, state.favoriteRouteRecordIds, state.savedRouteSnapshots)
      .find((item) => item.routeId === id)?.routeSnapshot;
    return snapshot ? clone(snapshot) : null;
  }

  function hydrateRouteFavorite(state = {}, routeRecord = {}) {
    const id = String(routeRecord?.id || "").trim();
    if (!id || !isRouteFavorite(state, id)) return recalculateTravelState(state);
    return setRouteFavorite(state, routeRecord, true);
  }

  function cacheRouteMedia(state = {}, routeRecord = {}, options = {}) {
    const normalizedState = recalculateTravelState(state);
    const routeId = String(routeRecord?.id || "").trim();
    const coverAsset = routeRecord?.coverAsset;
    const destinationAssets = normalizeList(routeRecord?.destinationAssets);
    if (!routeId || (!coverAsset?.imageUrl && !destinationAssets.length)) return normalizedState;
    const nextState = clone(normalizedState);
    const current = normalizedState.routeImageAssetCache[routeId] || {};
    nextState.routeImageAssetCache[routeId] = {
      coverAsset: clone(options.refresh ? coverAsset : (current.coverAsset || coverAsset)),
      destinationAssets: clone(options.refresh ? destinationAssets : (current.destinationAssets?.length ? current.destinationAssets : destinationAssets)),
      cachedAt: new Date().toISOString(),
    };
    return recalculateTravelState(nextState);
  }

  function applyCachedRouteMedia(state = {}, routeRecord = {}) {
    const routeId = String(routeRecord?.id || "").trim();
    const cached = normalizeRouteImageAssetCache(state.routeImageAssetCache)[routeId];
    return cached ? {
      ...clone(routeRecord),
      coverAsset: clone(cached.coverAsset || routeRecord.coverAsset),
      destinationAssets: clone(cached.destinationAssets?.length ? cached.destinationAssets : (routeRecord.destinationAssets || [])),
    } : clone(routeRecord);
  }

  function createTripFromRoute(state = {}, routeSnapshot = {}) {
    const normalizedState = recalculateTravelState(state);
    const snapshot = normalizeRouteSnapshot(routeSnapshot);
    if (!snapshot) return normalizedState;
    const countryIds = normalizeKnownIds(snapshot.countries, normalizedState.countriesById);
    const cityIds = normalizeKnownIds([...snapshot.cities, ...snapshot.destinations], normalizedState.citiesById);
    const trip = {
      id: `trip-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: snapshot.name,
      status: "planned",
      planStatus: "规划中",
      countryIds,
      cityIds,
      days: snapshot.recommendedDays || (snapshot.durationDays ? `${snapshot.durationDays}天` : ""),
      routeSnapshot: snapshot,
    };
    const nextState = clone(normalizedState);
    nextState.trips = [...normalizeList(nextState.trips), trip];
    return recalculateTravelState(nextState);
  }

  function getAchievements(state = {}) {
    return recalculateTravelState(state).achievements;
  }

  function getNotifications(state = {}) {
    return recalculateTravelState(state).notifications;
  }

  function markNotificationRead(state = {}, notificationId) {
    const normalized = recalculateTravelState(state);
    normalized.notifications = normalizeNotifications(normalized.notifications).map((item) => (
      item.id === notificationId ? { ...item, read: true } : item
    ));
    return recalculateTravelState(normalized);
  }

  function detailCacheKey(targetType, targetId) {
    return `${targetType}:${targetId}`;
  }

  function getDetailCache(state = {}, targetType, targetId) {
    if (targetType === "route") return null;
    const now = Date.now();
    const cache = normalizeDetailCache(state.detailCache);
    return cache.find((item) => (
      detailCacheKey(item.targetType, item.targetId) === detailCacheKey(targetType, targetId)
      && (!item.expiresAt || new Date(item.expiresAt).getTime() > now)
    )) || null;
  }

  function setDetailCache(state = {}, entry = {}) {
    if (entry.targetType === "route") return recalculateTravelState(state);
    const nextState = clone(state);
    const cache = normalizeDetailCache(nextState.detailCache);
    const key = detailCacheKey(entry.targetType, entry.targetId);
    const filtered = cache.filter((item) => detailCacheKey(item.targetType, item.targetId) !== key);
    nextState.detailCache = [...filtered, {
      targetType: entry.targetType,
      targetId: entry.targetId,
      data: entry.data || {},
      source: entry.source || "web",
      updatedAt: entry.updatedAt || todayText(),
      expiresAt: entry.expiresAt || "",
    }];
    return recalculateTravelState(nextState);
  }

  function setTripStatus(state = {}, tripId, status, patch = {}) {
    const nextState = clone(state);
    nextState.trips = normalizeList(nextState.trips).map((trip) => (
      trip.id === tripId ? { ...trip, ...patch, status } : trip
    ));
    return recalculateTravelState(nextState);
  }

  function removeTrip(state = {}, tripId) {
    const nextState = clone(state);
    nextState.trips = normalizeList(nextState.trips).filter((trip) => trip.id !== tripId);
    const budgetItems = normalizeBudgetItems(nextState.budgetItems);
    delete budgetItems[tripId];
    nextState.budgetItems = budgetItems;
    return recalculateTravelState(nextState);
  }

  const api = {
    TRAVEL_STATE_STORAGE_KEY,
    DEFAULT_TRIP_COVER,
    createDefaultTravelState,
    createEmptyTravelState,
    recalculateTravelState,
    getTravelStats,
    resolveTripCover,
    getTripBudgetItems,
    getFavoriteItems,
    setFavorite,
    isRouteFavorite,
    setRouteFavorite,
    getFavoriteRouteSnapshot,
    hydrateRouteFavorite,
    cacheRouteMedia,
    applyCachedRouteMedia,
    createTripFromRoute,
    getAchievements,
    getNotifications,
    markNotificationRead,
    getDetailCache,
    setDetailCache,
    setTripStatus,
    removeTrip,
    readTravelState,
    writeTravelState,
    updateTravelState,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TravelState = api;
})(typeof window !== "undefined" ? window : globalThis);
