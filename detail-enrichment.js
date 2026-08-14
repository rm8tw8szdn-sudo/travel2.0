(function (global) {
  const CACHE_DAYS = 30;
  const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
  const DEFAULT_TRIP_COVER = global.TravelState?.DEFAULT_TRIP_COVER || global.TravelData?.DEFAULT_TRIP_COVER || "assets/trip-cover-placeholder.svg";
  const DEFAULT_PLACE_COVER = global.TravelData?.DEFAULT_PLACE_COVER || DEFAULT_TRIP_COVER;

  function nowIso() {
    return new Date().toISOString();
  }

  function expiresAt() {
    return new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function cnLength(value) {
    return String(value || "").replace(/\s+/g, "").length;
  }

  function budgetCode(value) {
    if (value === "低" || value === "low") return "low";
    if (value === "高" || value === "high") return "high";
    if (value === "中高") return "high";
    if (value === "中等" || value === "medium") return "medium";
    return value || "";
  }

  function budgetLabel(value) {
    if (value === "low") return "低";
    if (value === "high") return "中高";
    if (value === "medium") return "中等";
    return value || "";
  }

  function fieldCandidate(value, sourceUrl, confidence = 0.82, sourceType = "verified_web") {
    return {
      value,
      sourceType,
      sourceUrl,
      confidence,
      updatedAt: nowIso(),
    };
  }

  const SOURCE_PRIORITY = {
    user: 4,
    seed: 3,
    verified_web: 2,
    generated: 1,
  };

  const QUALITY_RULES = {
    country: {
      description: (value) => cnLength(value) >= 40,
      tags: (value) => (value || []).length >= 3,
      recommendedCities: (value) => (value || []).length >= 3,
      representativeSpots: (value) => (value || []).length >= 3,
      bestSeason: Boolean,
      budgetLevel: Boolean,
      coverImage: (value) => Boolean(value) && value !== DEFAULT_TRIP_COVER && value !== DEFAULT_PLACE_COVER,
    },
    city: {
      description: (value) => cnLength(value) >= 30,
      tags: (value) => (value || []).length >= 3,
      representativeSpots: (value) => (value || []).length >= 3,
      coverImage: (value) => Boolean(value) && value !== DEFAULT_TRIP_COVER && value !== DEFAULT_PLACE_COVER,
    },
  };

  function completionScore(targetType, data) {
    const rules = QUALITY_RULES[targetType] || {};
    const entries = Object.entries(rules);
    if (!entries.length) return 0;
    const passed = entries.filter(([key, rule]) => rule(data[key])).length;
    return Math.round(passed / entries.length * 100);
  }

  function shouldUseCandidate(currentValue, currentMeta, candidate, targetType, fieldName) {
    if (!candidate) return false;
    if (currentMeta?.sourceType === "user") return false;
    const rule = QUALITY_RULES[targetType]?.[fieldName];
    const currentOk = rule ? rule(currentValue) : Boolean(currentValue);
    if (!currentOk) return true;
    if (currentMeta?.sourceType === "generated" && candidate.sourceType === "verified_web") return true;
    if (currentMeta?.sourceType === "verified_web") return candidate.confidence > (currentMeta.confidence || 0);
    return false;
  }

  function sourceMeta(sourceType = "seed", confidence = 0.7) {
    return { sourceType, confidence, updatedAt: nowIso() };
  }

  function baseCountry(country = {}, state = {}) {
    return {
      id: country.id,
      name: country.name,
      englishName: country.englishName,
      continent: country.continent,
      coverImage: country.cover,
      description: country.description || country.intro || "",
      tags: country.tags || [],
      recommendedDays: country.recommendedDays || "",
      bestSeason: country.bestSeason || "",
      budgetLevel: budgetCode(country.budgetLevel),
      recommendedCities: country.cityIds || [],
      representativeSpots: country.spots || [],
      keywords: country.keywords || [],
      fieldMeta: country.fieldMeta || {},
    };
  }

  function baseCity(city = {}, state = {}) {
    return {
      id: city.id,
      countryId: city.countryId,
      name: city.name,
      englishName: city.englishName,
      coverImage: city.cover,
      description: city.description || city.intro || "",
      tags: city.tags || [],
      representativeSpots: city.spots || [],
      recommendedDays: city.recommendedDays || "",
      bestSeason: city.bestSeason || "",
      keywords: city.keywords || [],
      fieldMeta: city.fieldMeta || {},
    };
  }

  function sourceText(targetType, targetId, state) {
    if (targetType === "country") return baseCountry(state.countriesById?.[targetId], state);
    if (targetType === "city") return baseCity(state.citiesById?.[targetId], state);
    return {};
  }

  const DETAIL_PROFILES = {
    "country:GB": {
      sourceUrl: "https://en.wikivoyage.org/wiki/United_Kingdom",
      queries: ["United Kingdom travel cities museums castles itinerary", "英国 旅行 灵感 伦敦 爱丁堡 约克"],
      evidence: ["united kingdom", "london", "edinburgh", "york", "museum", "英国", "伦敦"],
      fields: {
        description: "英国适合把伦敦博物馆、约克古城、爱丁堡城堡和湖区自然放进一趟轻量路线，城市文化与历史风景都很集中。",
        tags: ["博物馆", "古城", "戏剧", "湖区"],
        recommendedCities: ["GB-LON", "GB-EDI", "约克"],
        representativeSpots: ["大英博物馆", "塔桥", "爱丁堡城堡", "湖区"],
        recommendedDays: "7-10天",
        bestSeason: "5月-9月",
        budgetLevel: "high",
        keywords: ["英国", "UK", "London", "Edinburgh", "York", "museum", "history"],
      },
    },
    "country:FR": {
      sourceUrl: "https://en.wikivoyage.org/wiki/France",
      queries: ["France travel museums Riviera Lyon itinerary", "法国 旅行 灵感 巴黎 尼斯 里昂"],
      evidence: ["france", "paris", "lyon", "nice", "museum", "法国", "巴黎"],
      fields: {
        tags: ["博物馆", "建筑", "美食", "海岸"],
        recommendedCities: ["FR-PAR", "FR-NCE", "FR-LYS"],
        representativeSpots: ["卢浮宫", "埃菲尔铁塔", "奥赛博物馆", "尼斯老城"],
        keywords: ["法国", "France", "Paris", "Nice", "Lyon", "museum", "art"],
      },
    },
    "city:GB-LON": {
      sourceUrl: "https://en.wikivoyage.org/wiki/London",
      queries: ["London travel museums parks theatre landmarks", "伦敦 城市 灵感 博物馆 剧院 公园"],
      evidence: ["london", "museum", "theatre", "park", "伦敦"],
      fields: {
        description: "伦敦是英国初访核心城市，博物馆、剧院、公园和历史地标密集，适合作为英格兰城市路线起点。",
        tags: ["博物馆", "戏剧", "公园", "历史"],
        representativeSpots: ["大英博物馆", "塔桥", "海德公园", "西区剧院"],
        bestSeason: "5月-9月",
        keywords: ["伦敦", "London", "museum", "theatre", "park", "history"],
      },
    },
  };

  function profileFor(targetType, targetId) {
    return DETAIL_PROFILES[`${targetType}:${targetId}`] || null;
  }

  async function fetchSearchText(query, fetchImpl) {
    const url = new URL(WIKIVOYAGE_API);
    url.searchParams.set("origin", "*");
    url.searchParams.set("format", "json");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srlimit", "5");
    url.searchParams.set("srsearch", query);
    const response = await fetchImpl(url.toString());
    if (!response.ok) return "";
    const data = await response.json();
    return (data?.query?.search || []).map((item) => `${item.title || ""} ${item.snippet || ""}`).join(" ");
  }

  function evidenceScore(text, terms) {
    const normalized = normalize(text);
    const hits = unique(terms).filter((term) => normalized.includes(normalize(term)));
    return hits.length / Math.max(1, unique(terms).length);
  }

  async function buildDetailCandidate(targetType, targetId, options = {}) {
    const profile = profileFor(targetType, targetId);
    const fetchImpl = options.fetchImpl || global.fetch;
    if (!profile || typeof fetchImpl !== "function") return null;
    let text = "";
    for (const query of profile.queries || []) {
      try {
        text += ` ${await fetchSearchText(query, fetchImpl)}`;
      } catch {
        text += "";
      }
    }
    const score = evidenceScore(text, profile.evidence || []);
    if (score < 0.18) return null;
    const sourceUrl = profile.sourceUrl;
    const fields = Object.fromEntries(Object.entries(profile.fields || {}).map(([key, value]) => [
      key,
      fieldCandidate(value, sourceUrl, Math.min(0.95, 0.72 + score)),
    ]));
    return {
      targetType,
      targetId,
      fields,
      sourceUrl,
      sourceType: "verified_web",
      confidence: Math.min(0.95, 0.72 + score),
      updatedAt: nowIso(),
    };
  }

  function withSeedMeta(data) {
    const fieldMeta = { ...(data.fieldMeta || {}) };
    Object.keys(data).forEach((key) => {
      if (["fieldMeta", "dataStatus", "completionScore", "updatedAt"].includes(key)) return;
      if (data[key] !== undefined && data[key] !== null && data[key] !== "" && !fieldMeta[key]) {
        fieldMeta[key] = sourceMeta("seed", 0.7);
      }
    });
    return { ...data, fieldMeta };
  }

  function applyCache(base, cache) {
    if (!cache?.data) return base;
    const next = { ...base, ...(cache.data || {}) };
    next.fieldMeta = { ...(base.fieldMeta || {}), ...(cache.data.fieldMeta || {}) };
    next.dataStatus = cache.data.dataStatus || "cached";
    next.updatedAt = cache.updatedAt;
    return next;
  }

  function applyCandidate(base, candidate, targetType) {
    const next = { ...base, fieldMeta: { ...(base.fieldMeta || {}) } };
    Object.entries(candidate?.fields || {}).forEach(([fieldName, candidateField]) => {
      if (!shouldUseCandidate(next[fieldName], next.fieldMeta[fieldName], candidateField, targetType, fieldName)) return;
      next[fieldName] = candidateField.value;
      next.fieldMeta[fieldName] = {
        sourceType: candidateField.sourceType,
        sourceUrl: candidateField.sourceUrl,
        confidence: candidateField.confidence,
        updatedAt: candidateField.updatedAt,
      };
    });
    next.completionScore = completionScore(targetType, next);
    next.dataStatus = next.completionScore >= 90 ? "complete" : "cached";
    next.updatedAt = nowIso();
    return next;
  }

  async function ensureDetailData(targetType, targetId, localData, state, options = {}) {
    const base = withSeedMeta(localData || sourceText(targetType, targetId, state));
    const cached = global.TravelState?.getDetailCache?.(state, targetType, targetId);
    const cachedData = applyCache(base, cached);
    const cachedScore = completionScore(targetType, cachedData);
    if (cached && cachedScore >= 90) {
      return { status: "cached", data: { ...cachedData, completionScore: cachedScore, dataStatus: "complete" } };
    }
    const baseScore = completionScore(targetType, cachedData);
    if (baseScore >= 90) return { status: "seed", data: { ...cachedData, completionScore: baseScore, dataStatus: "complete" } };

    const candidate = await buildDetailCandidate(targetType, targetId, options);
    if (!candidate) return { status: "failed", data: { ...cachedData, completionScore: baseScore }, message: "暂时无法补全更多信息。" };
    const merged = applyCandidate(cachedData, candidate, targetType);
    const nextState = global.TravelState?.updateTravelState?.((current) => global.TravelState.setDetailCache(current, {
      targetType,
      targetId,
      data: merged,
      source: "web",
      updatedAt: nowIso(),
      expiresAt: expiresAt(),
    }));
    return {
      status: "completed",
      data: merged,
      state: nextState,
      DetailCandidate: candidate,
    };
  }

  const api = {
    FieldCandidate: fieldCandidate,
    DetailCandidate: buildDetailCandidate,
    completionScore,
    ensureDetailData,
    buildDetailCandidate,
    baseCountry,
    baseCity,
    sourceType: "user",
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DetailEnrichment = api;
})(typeof window !== "undefined" ? window : globalThis);
