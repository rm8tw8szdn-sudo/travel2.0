(function initializeRouteV2ImageAssets(global, factory) {
  const api = factory(global);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.RouteV2ImageAssets = api;
}(typeof globalThis !== "undefined" ? globalThis : window, (global) => {
  "use strict";

  const DEFAULT_ROUTE_PLACEHOLDER = "assets/trip-cover-placeholder.svg";
  const DEFAULT_CITY_PLACEHOLDER = "assets/route-city-oslo.svg";
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
    isConfiguredAssetUrl,
  });
}));
