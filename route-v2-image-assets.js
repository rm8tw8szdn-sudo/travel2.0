(function initializeRouteV2ImageAssets(global, factory) {
  const api = factory(global);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RouteV2ImageAssets = api;
}(typeof globalThis !== "undefined" ? globalThis : window, (global) => {
  "use strict";

  const DEFAULT_ROUTE_PLACEHOLDER = "assets/trip-cover-placeholder.svg";
  const DEFAULT_CITY_PLACEHOLDER = "assets/route-city-placeholder.svg";
  const IMAGE_DELIVERY_SPEC = Object.freeze({
    format: "WebP",
    aspectRatio: "16:10",
    width: 800,
    height: 500,
    targetKilobytes: "80-180",
  });
  const PILOT_CITY_COVER_KEYS = Object.freeze({
    "NL-AMS": "cities/amsterdam.webp",
    "CZ-PRG": "cities/prague.webp",
    "JP-TYO": "cities/tokyo.webp",
  });
  const PILOT_ROUTE_COVER_KEYS = Object.freeze({
    "gold-case-accepted-gold-c45-43-benelux-explorer": "routes/benelux-explorer.webp",
    "gold-case-accepted-gold-4-central-europe-hopper": "routes/central-europe-hopper.webp",
    "gold-case-accepted-gold-2-it-first-trip": "routes/italy-first-trip.webp",
  });
  const LOCAL_ROUTE_COVERS = Object.freeze({});
  const LOCAL_ROUTE_COVER_COUNTRIES = Object.freeze({});
  const SEMANTIC_LOCAL_COUNTRY_CODES = new Set([
    "AE", "EG", "FI", "FR", "GR", "IS", "IT", "JP", "KH", "KR", "MY", "NO", "SE", "SG", "TH", "TR", "VN",
  ]);
  const LOCAL_CITY_COVERS = Object.freeze({
    tokyo: "assets/city-tokyo-cover.svg",
    "東京": "assets/city-tokyo-cover.svg",
    "东京": "assets/city-tokyo-cover.svg",
    kyoto: "assets/city-kyoto-cover.svg",
    "京都": "assets/city-kyoto-cover.svg",
    osaka: "assets/city-osaka-cover.svg",
    "大阪": "assets/city-osaka-cover.svg",
    nara: "assets/city-nara-cover.svg",
    "奈良": "assets/city-nara-cover.svg",
    sapporo: "assets/city-sapporo-cover.svg",
    "札幌": "assets/city-sapporo-cover.svg",
    oslo: "assets/city-oslo-cover.svg",
    "奥斯陆": "assets/city-oslo-cover.svg",
    helsinki: "assets/city-helsinki-cover.svg",
    "赫尔辛基": "assets/city-helsinki-cover.svg",
    stockholm: "assets/city-stockholm-cover.svg",
    "斯德哥尔摩": "assets/city-stockholm-cover.svg",
    singapore: "assets/city-singapore-cover.svg",
    "新加坡": "assets/city-singapore-cover.svg",
    istanbul: "assets/city-istanbul-cover.svg",
    "伊斯坦布尔": "assets/city-istanbul-cover.svg",
    paris: "assets/city-paris-cover.svg",
    "巴黎": "assets/city-paris-cover.svg",
    rome: "assets/city-rome-cover.svg",
    "罗马": "assets/city-rome-cover.svg",
    athens: "assets/city-athens-cover.svg",
    "雅典": "assets/city-athens-cover.svg",
  });
  const LOCAL_COUNTRY_COVERS = Object.freeze({
    AE: "assets/country-landmark-uae.jpg",
    EG: "assets/route-egypt-pyramids-cover.svg",
    FI: "assets/country-landmark-finland.png",
    FR: "assets/country-landmark-france.jpg",
    GR: "assets/route-greece-civilization-cover.svg",
    IS: "assets/atlas-iceland-cover.svg",
    IT: "assets/atlas-italy-cover.svg",
    JP: "assets/route-japan-classic-cover.svg",
    KE: "assets/route-east-africa-safari-cover.svg",
    KG: "assets/route-central-asia-cover.svg",
    KH: "assets/country-landmark-cambodia.jpg",
    KR: "assets/country-landmark-korea.jpg",
    KZ: "assets/route-central-asia-cover.svg",
    MY: "assets/country-landmark-malaysia.jpg",
    NO: "assets/country-landmark-norway.jpg",
    SE: "assets/country-landmark-sweden.jpg",
    SG: "assets/country-landmark-singapore.jpg",
    TH: "assets/country-landmark-thailand.jpg",
    TR: "assets/trip-turkey-cover.svg",
    TZ: "assets/route-east-africa-safari-cover.svg",
    UZ: "assets/route-central-asia-cover.svg",
    VN: "assets/country-landmark-vietnam.jpg",
  });
  const LOCAL_COUNTRY_NAMES = Object.freeze({
    japan: "JP", "日本": "JP", italy: "IT", "意大利": "IT", france: "FR", "法国": "FR",
    greece: "GR", "希腊": "GR", turkey: "TR", "土耳其": "TR", iceland: "IS", "冰岛": "IS",
    norway: "NO", "挪威": "NO", finland: "FI", "芬兰": "FI", sweden: "SE", "瑞典": "SE",
    egypt: "EG", "埃及": "EG", thailand: "TH", "泰国": "TH", vietnam: "VN", "越南": "VN",
    cambodia: "KH", "柬埔寨": "KH", malaysia: "MY", "马来西亚": "MY", singapore: "SG", "新加坡": "SG",
    kenya: "KE", "肯尼亚": "KE", tanzania: "TZ", "坦桑尼亚": "TZ", korea: "KR", "韩国": "KR",
    "united arab emirates": "AE", "阿联酋": "AE", uzbekistan: "UZ", "乌兹别克斯坦": "UZ",
    kazakhstan: "KZ", "哈萨克斯坦": "KZ", kyrgyzstan: "KG", "吉尔吉斯斯坦": "KG",
  });

  function normalizedAssetBaseUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      if (!/^(?:http|https):$/u.test(url.protocol)) return "";
      url.hash = "";
      url.search = "";
      return `${url.href.replace(/\/+$/u, "")}/`;
    } catch {
      return "";
    }
  }

  function getAssetBaseUrl(options = {}) {
    if (Object.hasOwn(options, "assetBaseUrl")) return normalizedAssetBaseUrl(options.assetBaseUrl);
    return normalizedAssetBaseUrl(global.RouteV2ImageAssetConfig?.assetBaseUrl);
  }

  function isRuntimeImageSearchEnabled(options = {}) {
    if (Object.hasOwn(options, "allowRuntimeImageSearch")) return options.allowRuntimeImageSearch === true;
    return global.RouteV2ImageAssetConfig?.allowRuntimeImageSearch === true;
  }

  function normalizedCoverImageKey(value) {
    const key = String(value || "").trim().replaceAll("\\", "/");
    if (!/^[a-z0-9][a-z0-9/_-]*\.webp$/u.test(key)) return "";
    if (key.startsWith("/") || key.includes("//") || key.split("/").includes("..")) return "";
    return key;
  }

  function resolveAssetUrl(coverImageKey, options = {}) {
    const fallbackUrl = String(options.fallbackUrl || DEFAULT_ROUTE_PLACEHOLDER);
    const key = normalizedCoverImageKey(coverImageKey);
    const assetBaseUrl = getAssetBaseUrl(options);
    if (!key || !assetBaseUrl) return fallbackUrl;
    return new URL(key, assetBaseUrl).href;
  }

  function pilotCityCoverKey(cityId) {
    return PILOT_CITY_COVER_KEYS[String(cityId || "")] || "";
  }

  function pilotRouteCoverKey(routeId) {
    return PILOT_ROUTE_COVER_KEYS[String(routeId || "")] || "";
  }

  function pilotResolution(key, options, fallbackUrl) {
    if (!key) return null;
    const url = resolveAssetUrl(key, { ...options, fallbackUrl });
    return Object.freeze({
      key,
      url,
      isFallback: url === fallbackUrl,
    });
  }

  function resolvePilotCityCover(cityId, options = {}) {
    return pilotResolution(pilotCityCoverKey(cityId), options, DEFAULT_CITY_PLACEHOLDER);
  }

  function resolvePilotRouteCover(routeId, options = {}) {
    return pilotResolution(pilotRouteCoverKey(routeId), options, DEFAULT_ROUTE_PLACEHOLDER);
  }

  function isConfiguredAssetUrl(value, options = {}) {
    const assetBaseUrl = getAssetBaseUrl(options);
    return Boolean(assetBaseUrl && String(value || "").startsWith(assetBaseUrl));
  }

  function normalizedLookupKey(value) {
    return String(value || "").trim().toLocaleLowerCase("en-US");
  }

  function firstDestination(record = {}) {
    return record.destinationEntities?.[0]
      || record.cityEntities?.[0]
      || { name: record.destinations?.[0] || record.cities?.[0] || "" };
  }

  function firstCountry(record = {}, destination = {}) {
    return record.countryEntities?.[0]
      || { countryCode: destination.countryCode || record.countries?.[0] || "", name: record.countries?.[0] || "" };
  }

  function localCityCover(destination = {}) {
    const entityId = String(destination.entityId || destination.destinationEntityId || "").trim();
    const coverage = global.RouteV2ImageCoverage?.cityByEntityId?.[entityId];
    if (coverage?.status === "imageReady" && coverage.semanticScope === "exact-city") return coverage.assetPath;
    if (coverage?.status === "placeholder" && coverage.semanticScope === "neutral-placeholder") return coverage.assetPath;
    return "";
  }

  function localCountryCover(country = {}) {
    const code = String(country.countryCode || country.iso2 || "").trim().toUpperCase();
    const coverage = global.RouteV2ImageCoverage?.countryByCode?.[code];
    if (coverage?.status === "imageReady" && coverage.semanticScope === "exact-country") return coverage.assetPath;
    return "";
  }

  function recordCountryCodes(record = {}) {
    return [...new Set([
      ...(record.countryEntities || []).map((entry) => entry?.countryCode),
      ...(record.destinationEntities || []).map((entry) => entry?.countryCode),
      ...(record.countryCodes || []),
    ].map((value) => String(value || "").trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/u.test(value)))];
  }

  function semanticallyMatchedRouteCover(record = {}) {
    const routeId = String(record.id || "");
    const allowedCodes = LOCAL_ROUTE_COVER_COUNTRIES[routeId];
    const actualCodes = recordCountryCodes(record);
    if (!allowedCodes || !actualCodes.length || !actualCodes.every((code) => allowedCodes.includes(code))) return "";
    return LOCAL_ROUTE_COVERS[routeId] || "";
  }

  function localResolution(url, source, key = "") {
    return Object.freeze({
      url,
      imageUrl: url,
      source,
      key: key || `local:${url}`,
      isFallback: url === DEFAULT_ROUTE_PLACEHOLDER || url === DEFAULT_CITY_PLACEHOLDER,
    });
  }

  function resolveLocalDestinationCover(destination = {}, record = {}) {
    const cityUrl = localCityCover(destination);
    if (cityUrl) return localResolution(cityUrl, "local-city");
    return localResolution(DEFAULT_CITY_PLACEHOLDER, "local-placeholder");
  }

  function resolveLocalRouteCover(record = {}, options = {}) {
    const configured = resolvePilotRouteCover(record.id, options);
    if (configured && !configured.isFallback) return Object.freeze({ ...configured, source: "configured-route" });
    const routeUrl = semanticallyMatchedRouteCover(record);
    if (routeUrl) return localResolution(routeUrl, "local-route");
    const destination = firstDestination(record);
    const cityUrl = localCityCover(destination);
    if (cityUrl) return localResolution(cityUrl, "local-city");
    const countryCodes = recordCountryCodes(record);
    const countryUrl = countryCodes.length === 1 ? localCountryCover(firstCountry(record, destination)) : "";
    if (countryUrl) return localResolution(countryUrl, "local-country");
    return localResolution(DEFAULT_ROUTE_PLACEHOLDER, "local-placeholder");
  }

  return Object.freeze({
    DEFAULT_ROUTE_PLACEHOLDER,
    DEFAULT_CITY_PLACEHOLDER,
    IMAGE_DELIVERY_SPEC,
    PILOT_CITY_COVER_KEYS,
    PILOT_ROUTE_COVER_KEYS,
    getAssetBaseUrl,
    isRuntimeImageSearchEnabled,
    resolveAssetUrl,
    pilotCityCoverKey,
    pilotRouteCoverKey,
    resolvePilotCityCover,
    resolvePilotRouteCover,
    resolveLocalDestinationCover,
    resolveLocalRouteCover,
    isConfiguredAssetUrl,
  });
}));
