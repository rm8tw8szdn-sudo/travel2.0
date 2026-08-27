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

  function isRuntimeImageSearchEnabled() {
    return false;
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

  function localPoiCover(destination = {}) {
    const entityId = String(destination.entityId || destination.destinationEntityId || "").trim();
    const coverage = global.RouteV2ImageCoverage?.poiByEntityId?.[entityId];
    if (coverage?.status === "imageReady" && coverage.semanticScope === "exact-poi") return coverage.assetPath;
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
    const poiUrl = localPoiCover(destination);
    if (poiUrl) return localResolution(poiUrl, "local-poi");
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
