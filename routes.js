const routeFeed = document.querySelector("[data-route-feed]");
const routeFeedSentinel = document.querySelector("[data-route-feed-sentinel]");
const routeSearch = document.querySelector("[data-route-search]");
const routeSearchSummary = document.querySelector("[data-route-search-summary]");
const routeTabs = [...document.querySelectorAll("[data-route-tab]")];
const routeScrollRoot = document.querySelector(".route-screen");
let routeFeedObserver = null;
let routeFeedObserverActive = false;
let routeFeedSentinelNear = false;

const API_ENDPOINT = "/api/routes/discovery";
const IMAGE_ENDPOINT = "/api/routes/image-search";
const BATCH_SIZE = 6;
const FEED_PAGE_SIZE = BATCH_SIZE;
const FEED_CANDIDATE_PAGE_SIZE = FEED_PAGE_SIZE * 20;
const SEARCH_PAGE_SIZE = BATCH_SIZE;
const FEED_DEDUPE_WINDOW = 50;
const FEED_CLUSTER_COOLDOWN_WINDOW = 12;
const FEED_IMAGE_CANDIDATE_LIMIT = 24;
const FEED_CARD_IMAGE_TIMEOUT_MS = 2_000;
const FEED_COVER_PREPARE_DEADLINE_MS = 2_000;
const FEED_LOAD_WATCHDOG_MS = 8_000;
const SEARCH_DISCOVERY_TIMEOUT_MS = 7_000;
const SEARCH_LOAD_WATCHDOG_MS = 10_000;
const MAX_ROUTE_QUERY_LENGTH = 160;
const ROUTE_FEED_SESSION_KEY = "travelCollection.routeFeedSession";
const ROUTE_FEED_PRELOAD_KEY = "travelCollection.routeFeedPreload.v2";
const ROUTE_FEED_PRELOAD_TTL_MS = 5 * 60 * 1000;
const ROUTE_FEED_NAVIGATION_STATE_KEY = "travelCollection.routeFeedNavigation.v1";
const ROUTE_FEED_NAVIGATION_STATE_TTL_MS = 30 * 60 * 1000;
const ROUTE_FEED_NAVIGATION_RECORD_LIMIT = 360;
const ROUTE_FEED_QUERY_PARAM = "q";
const FALLBACK_ROUTE_COVER = "assets/trip-cover-placeholder.svg";
const routeImageAssets = globalThis.RouteV2ImageAssets || null;
const runtimeImageSearchEnabled = false;
const IMAGE_READY_COUNTRY_CODES = new Set(
  Object.entries(globalThis.RouteV2ImageCoverage?.countryByCode || {})
    .filter(([, item]) => item?.status === "imageReady" && item?.semanticScope === "exact-country")
    .map(([code]) => code),
);
const badRuntimeImageUrls = new Set();
const COUNTRY_CONTINENT_SETS = {
  africa: new Set(["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"]),
  americas: new Set(["AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY", "VE"]),
  asia: new Set(["AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CY", "GE", "IN", "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE"]),
  europe: new Set(["AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA", "XK"]),
  oceania: new Set(["AU", "FJ", "FM", "KI", "MH", "NR", "NZ", "PW", "PG", "WS", "SB", "TO", "TV", "VU"]),
};
const feedState = {
  records: [],
  cursor: null,
  hasMore: true,
  status: "idle",
  query: readRouteQueryFromUrl(),
  activeTab: readRouteTypeFromUrl(),
  feedRouteType: readRouteTypeFromUrl(),
  sessionId: createSessionId(),
  requestToken: 0,
  activeAbortController: null,
  activeImageAbortController: null,
  suggestions: [],
  pendingMore: false,
  pendingRetryAt: 0,
  prefetchedFeedPage: null,
  prefetchAbortController: null,
  prefetching: false,
  prefetchPromise: null,
  lastLoadDebug: null,
  skippedRouteIds: new Set(),
  nextRenderBatchId: 1,
  pendingBatchAnchorId: "",
  loadingStartedAt: 0,
  lastVisibleBatchAt: 0,
  searchResolved: false,
  searchResultCount: 0,
  searchFailureReason: "",
  searchFailureCodes: [],
  consecutiveEmptyPages: 0,
};
activateRouteTab(feedState.activeTab);

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function createSessionId() {
  const stored = sessionStorage.getItem(ROUTE_FEED_SESSION_KEY);
  if (stored) return stored;
  const next = globalThis.crypto?.randomUUID?.() || `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(ROUTE_FEED_SESSION_KEY, next);
  return next;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readRouteState() {
  return window.TravelState?.readTravelState?.() || {};
}

function updateRouteState(updater) {
  return window.TravelState?.updateTravelState?.(updater) || {};
}

function abortActiveRequest() {
  feedState.activeAbortController?.abort();
  feedState.activeImageAbortController?.abort();
  feedState.activeAbortController = null;
  feedState.activeImageAbortController = null;
  invalidateFeedPrefetch();
}

function invalidateFeedPrefetch() {
  feedState.prefetchAbortController?.abort();
  feedState.prefetchAbortController = null;
  feedState.prefetchedFeedPage = null;
  feedState.prefetching = false;
  feedState.prefetchPromise = null;
}

function timeoutSignal(timeoutMs) {
  if (globalThis.AbortSignal?.timeout) return AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function combineAbortSignals(signals = []) {
  const activeSignals = signals.filter(Boolean);
  if (globalThis.AbortSignal?.any) return AbortSignal.any(activeSignals);
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener?.("abort", abort, { once: true });
  }
  return controller.signal;
}

function requestSignal(controller, timeoutMs) {
  const deadlineSignal = timeoutSignal(timeoutMs);
  if (!controller?.signal) return deadlineSignal;
  return combineAbortSignals([controller.signal, deadlineSignal]);
}

function childDeadlineSignal(parentSignal, timeoutMs) {
  const deadlineSignal = timeoutSignal(timeoutMs);
  if (!parentSignal) return deadlineSignal;
  return combineAbortSignals([parentSignal, deadlineSignal]);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function stableTextHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function routeKind(record) {
  const entityCodes = (record.countryEntities || []).map((item) => item.countryCode).filter(Boolean);
  const fallbackCountries = (record.countries || []).filter(Boolean);
  const countryCount = new Set(entityCodes.length ? entityCodes : fallbackCountries).size;
  return countryCount > 1 ? "cross" : "single";
}

function activateRouteTab(routeType) {
  if (!["cross", "single"].includes(routeType)) return;
  feedState.activeTab = routeType;
  routeTabs.forEach((button) => {
    const active = button.dataset.routeTab === routeType;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function autoClassifySearchResults(records = []) {
  const firstResultType = records.map(routeKind).find((routeType) => ["cross", "single"].includes(routeType));
  if (firstResultType) {
    activateRouteTab(firstResultType);
    persistRouteTypeInUrl(firstResultType);
  }
  return firstResultType || "";
}

function visibleRecords() {
  const records = feedState.records.filter((record) => record?.id);
  if (feedState.query) return records.filter((record) => routeKind(record) === feedState.activeTab);
  if (!feedState.feedRouteType) return records;
  return records.filter((record) => routeKind(record) === feedState.activeTab);
}

function fixedPilotRouteCover(record = {}) {
  const resolved = routeImageAssets?.resolveLocalRouteCover?.(record)
    || routeImageAssets?.resolvePilotRouteCover(record.id);
  if (resolved?.key) record.coverImageKey = resolved.key;
  if (resolved && !resolved.isFallback && badRuntimeImageUrls.has(coverIdentity(resolved.url))) {
    return { url: FALLBACK_ROUTE_COVER, source: "local-placeholder", isFallback: true };
  }
  if (resolved && !resolved.isFallback) return resolved;
  const localUrl = localCoverForRoute(record);
  if (localUrl && localUrl !== FALLBACK_ROUTE_COVER) {
    return {
      url: localUrl,
      imageUrl: localUrl,
      source: "local-route-fallback",
      key: `local:${localUrl}`,
      isFallback: false,
    };
  }
  return resolved || { url: FALLBACK_ROUTE_COVER, source: "local-placeholder", isFallback: true };
}

function readRouteQueryFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get(ROUTE_FEED_QUERY_PARAM)?.trim() || "";
  } catch {
    return "";
  }
}

function readRouteTypeFromUrl() {
  try {
    const routeType = new URL(window.location.href).searchParams.get("routeType")?.trim() || "";
    return ["cross", "single"].includes(routeType) ? routeType : "cross";
  } catch {
    return "cross";
  }
}

function persistRouteQueryInUrl(query) {
  const url = new URL(window.location.href);
  const normalized = String(query || "").trim();
  if (normalized) url.searchParams.set(ROUTE_FEED_QUERY_PARAM, normalized);
  else url.searchParams.delete(ROUTE_FEED_QUERY_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

function persistRouteTypeInUrl(routeType) {
  if (!["cross", "single"].includes(routeType)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("routeType", routeType);
  window.history.replaceState(window.history.state, "", url);
}

function navigationRecordSnapshot(records = []) {
  try {
    return JSON.parse(JSON.stringify(records.slice(0, ROUTE_FEED_NAVIGATION_RECORD_LIMIT)));
  } catch {
    return [];
  }
}

function persistRouteFeedNavigationState() {
  try {
    const payload = {
      schemaVersion: "route-feed-navigation-v1",
      savedAt: Date.now(),
      query: feedState.query,
      activeTab: feedState.activeTab,
      feedRouteType: feedState.feedRouteType,
      records: navigationRecordSnapshot(feedState.records),
      cursor: feedState.cursor,
      hasMore: feedState.hasMore,
      sessionId: feedState.sessionId,
      suggestions: [...feedState.suggestions],
      skippedRouteIds: [...feedState.skippedRouteIds],
      searchResolved: feedState.searchResolved,
      searchResultCount: feedState.searchResultCount,
      searchFailureReason: feedState.searchFailureReason,
      searchFailureCodes: [...feedState.searchFailureCodes],
      consecutiveEmptyPages: feedState.consecutiveEmptyPages,
      scrollY: Math.max(0, window.scrollY || 0),
      rootScrollTop: Math.max(0, routeScrollRoot?.scrollTop || 0),
    };
    sessionStorage.setItem(ROUTE_FEED_NAVIGATION_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Navigation restoration is best-effort and must never block the route page.
  }
}

function readRouteFeedNavigationState() {
  try {
    const payload = JSON.parse(sessionStorage.getItem(ROUTE_FEED_NAVIGATION_STATE_KEY) || "null");
    if (payload?.schemaVersion !== "route-feed-navigation-v1") return null;
    if (!Number.isFinite(payload.savedAt) || Date.now() - payload.savedAt > ROUTE_FEED_NAVIGATION_STATE_TTL_MS) return null;
    if (!Array.isArray(payload.records) || payload.records.length > ROUTE_FEED_NAVIGATION_RECORD_LIMIT) return null;
    if (String(payload.query || "") !== readRouteQueryFromUrl()) return null;
    const urlRouteType = readRouteTypeFromUrl();
    if (payload.activeTab !== urlRouteType) return null;
    return payload;
  } catch {
    return null;
  }
}

function restoreRouteFeedNavigationState() {
  const payload = readRouteFeedNavigationState();
  if (!payload || !payload.records.length) return false;
  abortActiveRequest();
  Object.assign(feedState, {
    records: payload.records,
    cursor: payload.cursor || null,
    hasMore: Boolean(payload.hasMore && payload.cursor),
    status: "ready",
    query: String(payload.query || ""),
    activeTab: payload.activeTab,
    feedRouteType: payload.feedRouteType || payload.activeTab,
    sessionId: payload.sessionId || createSessionId(),
    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
    skippedRouteIds: new Set(payload.skippedRouteIds || []),
    searchResolved: Boolean(payload.searchResolved),
    searchResultCount: Number(payload.searchResultCount || 0),
    searchFailureReason: String(payload.searchFailureReason || ""),
    searchFailureCodes: Array.isArray(payload.searchFailureCodes) ? payload.searchFailureCodes : [],
    consecutiveEmptyPages: Number(payload.consecutiveEmptyPages || 0),
  });
  activateRouteTab(feedState.activeTab);
  if (routeSearch) routeSearch.value = feedState.query;
  renderFeed();
  activateFeedScroll();
  restoreRouteFeedScrollPosition(payload);
  return true;
}

function restoreRouteFeedScrollPosition(payload = {}) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, Math.max(0, Number(payload.scrollY || 0)));
    if (routeScrollRoot) routeScrollRoot.scrollTop = Math.max(0, Number(payload.rootScrollTop || 0));
  }));
}

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  const payload = readRouteFeedNavigationState();
  if (payload) restoreRouteFeedScrollPosition(payload);
});

function rejectOversizedRouteQuery(value) {
  const query = String(value || "").trim();
  if (query.length <= MAX_ROUTE_QUERY_LENGTH) return false;
  abortActiveRequest();
  feedState.requestToken += 1;
  Object.assign(feedState, {
    records: [],
    cursor: null,
    hasMore: false,
    status: "ready",
    query,
    suggestions: [],
    searchResolved: true,
    searchResultCount: 0,
    searchFailureReason: "query-too-long",
    searchFailureCodes: [],
    consecutiveEmptyPages: 0,
    loadingStartedAt: 0,
  });
  sessionStorage.removeItem(ROUTE_FEED_NAVIGATION_STATE_KEY);
  persistRouteQueryInUrl("");
  renderFeed();
  return true;
}

function coverUrl(record) {
  const fixedCover = fixedPilotRouteCover(record);
  if (!runtimeImageSearchEnabled || (fixedCover && !fixedCover.isFallback)) return fixedCover?.url || FALLBACK_ROUTE_COVER;
  if (
    isVerifiedRouteImageAsset(record, record.onlineCoverAsset)
      && !isPlannerFallbackCover(record.onlineCoverAsset)
      && !/picsum\.photos/i.test(record.onlineCoverAsset.imageUrl)
      && routeImageAllowed(record, record.onlineCoverAsset.imageUrl)
  ) return record.onlineCoverAsset.imageUrl;
  if (isPlannerMaterializedRecord(record)) return "";
  if (isPlannerPlaceholderCover(record)) return "";
  const remoteCover = record.coverAsset?.imageUrl || record.coverImage || "";
  if (remoteCover && isVerifiedRouteImageAsset(record, record.coverAsset) && routeImageAllowed(record, remoteCover)) return remoteCover;
  return fixedCover?.url || FALLBACK_ROUTE_COVER;
}

function displayCoverUrl(record) {
  const imageUrl = coverUrl(record);
  return imageUrl || "";
}

function markRouteCoverReady(record = {}, imageUrl = displayCoverUrl(record)) {
  const key = coverIdentity(imageUrl);
  if (key) record._coverReadyUrl = key;
}

function hasReadyRouteCover(record = {}) {
  const imageUrl = displayCoverUrl(record);
  return Boolean(imageUrl && coverIdentity(imageUrl) === record._coverReadyUrl);
}

function uniqueCoverCandidates(record = {}, offset = 0) {
  void offset;
  const candidates = [];
  const push = (imageUrl) => {
    const key = coverIdentity(imageUrl);
    if (key && !candidates.some((item) => coverIdentity(item) === key)) candidates.push(imageUrl);
  };
  push(displayCoverUrl(record));
  return candidates;
}

async function ensureUniqueReadyRouteCover(record, usedImages, controller, offset = 0) {
  void controller;
  void offset;
  const currentUrl = displayCoverUrl(record);
  const currentKey = routeImageDedupeKey(record) || coverIdentity(currentUrl);
  const reusableLocalCover = isReusableLocalCover(record, currentUrl);
  if (hasReadyRouteCover(record) && currentKey && (reusableLocalCover || !usedImages.has(currentKey))) {
    usedImages.add(currentKey);
    return true;
  }
  record.coverSearchFailed = true;
  clearRouteCover(record);
  return false;
}

async function enforceUniqueReadyCovers(records = [], previousRecords = [], controller) {
  void controller;
  const usedImages = new Set(previousRecords.slice(-FEED_DEDUPE_WINDOW)
    .map((record) => routeImageDedupeKey(record) || coverIdentity(displayCoverUrl(record)))
    .filter(Boolean));
  for (const [index, record] of records.entries()) {
    await ensureUniqueReadyRouteCover(record, usedImages, controller, index * 17);
  }
}

function forceReadyFallbackCovers(records = [], previousRecords = []) {
  void records;
  void previousRecords;
}

function isPlannerPlaceholderCover(record = {}) {
  if (!isPlannerMaterializedRecord(record) && record.coverAsset?.imageUrl && record.coverAsset?.provider && !isPlannerFallbackCover(record.coverAsset)) {
    return false;
  }
  return isPlannerMaterializedRecord(record);
}

function isPlannerMaterializedRecord(record = {}) {
  return Boolean(
    String(record.id || "").startsWith("materialized-")
      || record.contentEvidence?.plannerRuleVersion
      || record.contentEvidence?.materialized
      || record.coverAsset?.discoveredVia === "planner-rule-materialized"
      || record.coverAsset?.discoveredVia === "materialized-route-pool"
      || record.provenance?.providerId === "planner-rule-materialized",
  );
}

function isCentralEuropeMaterializedRoute(record = {}) {
  if (!isPlannerPlaceholderCover(record) && !record.contentEvidence?.plannerRuleVersion && !String(record.id || "").startsWith("materialized-")) return false;
  const codes = [
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode),
  ].map((code) => String(code || "").toUpperCase()).filter(Boolean);
  const centralEuropeCodes = new Set(["AT", "CZ", "DE", "HU", "SK"]);
  return codes.length > 0 && codes.every((code) => centralEuropeCodes.has(code));
}

function isPlannerFallbackCover(asset = {}) {
  const provider = String(asset.provider || "").toLowerCase();
  return provider.includes("fallback") || provider.includes("prewarmed");
}

function routeSearchText(record = {}) {
  return [
    record.id,
    record.name,
    record.canonicalTitle,
    record.sourceTitle,
    ...(record.countries || []),
    ...(record.destinations || []),
    ...(record.cities || []),
    ...(record.themes || []),
    ...(record.tags || []),
  ].filter(Boolean).join(" ");
}

function routeCountryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function routeImageDedupeKey(record = {}) {
  const fixedCover = fixedPilotRouteCover(record);
  if (fixedCover?.key) return `asset-key:${fixedCover.key}`;
  return record.onlineCoverAsset?.imageDedupeKey
    || record.onlineCoverAsset?.dedupeKey
    || record.coverAsset?.imageDedupeKey
    || record.coverAsset?.dedupeKey
    || coverIdentity(displayCoverUrl(record));
}

function imageCountryCodesForUrl(record = {}, imageUrl = "") {
  const key = coverIdentity(imageUrl);
  const candidates = [record.onlineCoverAsset, record.coverAsset].filter(Boolean);
  const asset = candidates.find((item) => coverIdentity(item?.imageUrl) === key) || candidates[0];
  return Array.isArray(asset?.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase()).filter(Boolean)
    : [];
}

function isVerifiedRouteImageAsset(record = {}, asset = {}) {
  if (!asset?.imageUrl) return false;
  if (asset.semanticStatus !== "verified" && asset.coverStatus !== "verified" && asset.status !== "verified") return false;
  const routeCodes = routeCountryCodes(record);
  const imageCodes = Array.isArray(asset.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase())
    : [];
  return routeCodes.length > 0 && imageCodes.some((code) => routeCodes.includes(code));
}

function routeImageReadinessScore(record = {}) {
  const verifiedCoverBonus = displayCoverUrl(record) ? 100 : 0;
  return verifiedCoverBonus + routeCountryCodes(record).filter((code) => IMAGE_READY_COUNTRY_CODES.has(code)).length;
}

function routeImageAllowed(record = {}, imageUrl = "") {
  const text = String(imageUrl || "").trim();
  if (!text || /^(?:https?:)?\/\//i.test(text)) return false;
  return !badRuntimeImageUrls.has(coverIdentity(text));
}

function routeImageAllowedForAsset(record = {}, image = {}) {
  return Boolean(image?.imageUrl && isVerifiedRouteImageAsset(record, image) && routeImageAllowed(record, image.imageUrl));
}

function englishCountryNameForCode(code) {
  const normalized = String(code || "").toUpperCase();
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

function routeImageThemeKeyword(record = {}) {
  const text = routeSearchText(record);
  if (/sahara|desert|dune/i.test(text)) return "desert";
  if (/island|beach|coast/i.test(text)) return "coast";
  if (/rail|train/i.test(text)) return "station";
  if (/castle|cathedral|temple|heritage|unesco/i.test(text)) return "landmark";
  if (/safari|wildlife|fjord|glacier|mountain/i.test(text)) return "nature";
  return "landmark";
}

function continentForCountryCode(code) {
  const normalized = String(code || "").toUpperCase();
  for (const [continent, codes] of Object.entries(COUNTRY_CONTINENT_SETS)) {
    if (codes.has(normalized)) return continent;
  }
  return "europe";
}

function normalizedRemoteImageUrl(imageUrl) {
  const text = String(imageUrl || "").trim();
  return /^(?:https?:)?\/\//i.test(text) ? FALLBACK_ROUTE_COVER : text;
}

function proxiedRouteImageUrl(imageUrl) {
  const text = normalizedRemoteImageUrl(imageUrl);
  if (routeImageAssets?.isConfiguredAssetUrl(text)) return text;
  if (!runtimeImageSearchEnabled && /^https?:\/\//i.test(text)) return FALLBACK_ROUTE_COVER;
  return /^https?:\/\//i.test(text) ? `/api/routes/image-proxy?url=${encodeURIComponent(text)}` : text;
}

function shouldPermanentlyRejectRouteImage(outcome = {}) {
  return (typeof outcome === "string" ? outcome : outcome.status) === "error";
}

async function warmProxiedImage(imageUrl, signal, timeoutMs = FEED_CARD_IMAGE_TIMEOUT_MS, onLateResult) {
  const proxiedUrl = proxiedRouteImageUrl(imageUrl);
  if (!proxiedUrl) return { status: "missing", imageUrl: "", proxiedUrl: "" };
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ status: "aborted", imageUrl, proxiedUrl });
    const image = new Image();
    let initialSettled = false;
    let terminalSettled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const settleInitial = (outcome) => {
      if (initialSettled) return false;
      initialSettled = true;
      clearTimeout(timer);
      resolve(outcome);
      return true;
    };
    const finish = (status) => {
      if (terminalSettled) return;
      terminalSettled = true;
      const outcome = { status, imageUrl, proxiedUrl };
      const wasInitial = settleInitial(outcome);
      cleanup();
      if (!wasInitial) onLateResult?.(outcome);
    };
    const onAbort = () => finish("aborted");
    const timer = setTimeout(() => {
      settleInitial({ status: "timeout", imageUrl, proxiedUrl });
    }, Math.max(0, timeoutMs));
    signal?.addEventListener?.("abort", onAbort, { once: true });
    image.onload = () => finish(image.naturalWidth >= 20 ? "ready" : "error");
    image.onerror = () => finish("error");
    image.decoding = "async";
    image.src = proxiedUrl;
  });
}

function applyRouteImageOutcome(record, imageUrl, outcome = {}, { late = false } = {}) {
  if (!record) return outcome.status || "missing";
  const status = outcome.status || "missing";
  const imageKey = coverIdentity(imageUrl);
  record._coverLoadStatus = status;
  record._coverLoadUrl = imageUrl || "";
  if (status === "ready") {
    markRouteCoverReady(record, imageUrl);
  } else if (shouldPermanentlyRejectRouteImage(outcome)) {
    if (imageKey) badRuntimeImageUrls.add(imageKey);
    record.coverSearchFailed = true;
    clearRouteCover(record);
  }
  if (late) updateRenderedRouteImage(record);
  return status;
}

async function ensureRecordCoverReady(record, signal, usedImageUrls = new Set()) {
  const current = displayCoverUrl(record);
  const currentKey = coverIdentity(current);
  const reusableLocalCover = isReusableLocalCover(record, current);
  if (currentKey && (reusableLocalCover || !usedImageUrls.has(currentKey)) && !badRuntimeImageUrls.has(currentKey)) {
    const outcome = await warmProxiedImage(current, signal, FEED_CARD_IMAGE_TIMEOUT_MS, (lateOutcome) => {
      applyRouteImageOutcome(record, current, lateOutcome, { late: true });
    }).catch(() => ({ status: "aborted" }));
    applyRouteImageOutcome(record, current, outcome);
    if (outcome.status === "ready") {
      markRouteCoverReady(record, current);
      usedImageUrls.add(currentKey);
      return true;
    }
    if (outcome.status === "timeout" || outcome.status === "aborted") return false;
  }

  if (!runtimeImageSearchEnabled) {
    clearRouteCover(record);
    record.coverSearchFailed = true;
    return false;
  }

  const image = await requestOnlineCover(record, signal, {
    excludeImageUrls: [...usedImageUrls],
    excludeImageTitles: [],
  }).catch(() => null);
  if (!routeImageAllowedForAsset(record, image)) {
    clearRouteCover(record);
    record.coverSearchFailed = true;
    return false;
  }
  const key = coverIdentity(image.imageUrl);
  const dedupeKey = image.imageDedupeKey || image.dedupeKey || key;
  if (!key || usedImageUrls.has(key) || badRuntimeImageUrls.has(key)) {
    clearRouteCover(record);
    return false;
  }
  if (dedupeKey && usedImageUrls.has(dedupeKey)) {
    clearRouteCover(record);
    return false;
  }
  applyOnlineCover(record, image);
  const outcome = await warmProxiedImage(image.imageUrl, signal, FEED_CARD_IMAGE_TIMEOUT_MS, (lateOutcome) => {
    applyRouteImageOutcome(record, image.imageUrl, lateOutcome, { late: true });
  }).catch(() => ({ status: "aborted" }));
  applyRouteImageOutcome(record, image.imageUrl, outcome);
  if (outcome.status !== "ready") {
    return false;
  }
  markRouteCoverReady(record, image.imageUrl);
  usedImageUrls.add(key);
  if (dedupeKey) usedImageUrls.add(dedupeKey);
  return true;
}

function localCoverForRoute(record = {}) {
  const resolved = routeImageAssets?.resolveLocalRouteCover?.(record);
  if (resolved?.url && !resolved.isFallback) return resolved.url;
  return FALLBACK_ROUTE_COVER;
}

function geographySummary(record) {
  const countries = (record.countries || []).join(" · ");
  const destinations = record.destinations || record.cities || [];
  const places = destinations.length > 5 ? `${destinations.slice(0, 5).join(" · ")} 等` : destinations.join(" · ");
  return [countries, places].filter(Boolean).join("｜");
}

function uniqueList(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function compactPlaceList(values = [], limit = 4) {
  const places = uniqueList(values);
  if (!places.length) return "";
  return places.length > limit ? `${places.slice(0, limit).join("、")}等地` : places.join("、");
}

function routeCountryNames(record = {}) {
  const entityNames = (record.countryEntities || []).map((item) => item.name).filter(Boolean);
  return uniqueList(entityNames.length ? entityNames : (record.countries || []));
}

function routeDestinations(record = {}) {
  return uniqueList([
    ...(record.destinations || []),
    ...(record.cities || []),
    ...(record.destinationEntities || []).map((item) => item.name),
  ]);
}

function routeThemePhrase(record = {}) {
  const text = routeSearchText(record);
  if (/自驾|road|coast|rockies|patagonia|garden route|南岛|加州|落基|花园大道/i.test(text)) return "适合看沿途风景，路上停留比赶景点更重要";
  if (/铁路|火车|rail|train|景观铁路/i.test(text)) return "适合用列车串起城市和风景，换城节奏相对清晰";
  if (/跳岛|海岛|island|hawaii|palawan|azores|croatia/i.test(text)) return "适合把海湾、老城和离岛慢慢串起来";
  if (/圣诞|christmas/i.test(text)) return "适合冬季看老城灯饰、市集和广场氛围";
  if (/美食|food|wine|葡萄酒/i.test(text)) return "适合把餐桌、街区和产区体验放进行程里";
  if (/朝圣|pilgrimage|camino|francigena|熊野|四国/i.test(text)) return "适合留出步行段，用更慢的节奏感受沿途城镇";
  if (/野生|safari|wildlife|动物|自然|namibia/i.test(text)) return "适合看自然景观和野生动物，早晚时段体验会更好";
  if (/文明|unesco|maya|遗产|古城|temple|cathedral/i.test(text)) return "适合围绕古迹、老城和世界遗产安排行程";
  if (/多国|跨国|hopper|balkan|baltic|benelux|中欧/i.test(text)) return "适合一次看几种城市气质，但每天不要排得太满";
  return "适合第一次了解这片区域，也适合按兴趣删减成更轻松的版本";
}

function routeIntro(record = {}) {
  const places = routeDestinations(record);
  const placeText = compactPlaceList(places, 4);
  const countries = routeCountryNames(record);
  const countryText = compactPlaceList(countries, 3);
  const dayText = record.recommendedDays || (record.durationDays ? `${record.durationDays}天` : "");
  const opening = placeText
    ? `从${places[0]}出发，串联${compactPlaceList(places.slice(1), 3) || countryText || "周边目的地"}。`
    : countryText
      ? `围绕${countryText}展开，适合做成${dayText || "一段"}主题旅行。`
      : "这条路线适合把几个重点目的地放在同一次旅行里。";
  const timing = dayText ? `${dayText}里` : "行程中";
  return `${opening}${timing}${routeThemePhrase(record)}。`;
}

function routeFeaturePhrase(record = {}) {
  return routeThemePhrase(record).replace(/^适合/, "适合");
}

function routeFeatureIntro(record = {}) {
  const days = Number.parseInt(record.durationDays || record.recommendedDays, 10);
  const pace = Number.isFinite(days)
    ? days <= 5 ? "短假友好" : days >= 14 ? "长线慢走" : "节奏适中"
    : "节奏适中";
  return `${pace}，${routeFeaturePhrase(record)}。`;
}
function routeLiteraryPhrase(record = {}, narrativeText = "", style = "", countryCount = 0) {
  const countryCodes = new Set(routeCountryCodes(record));
  const hasCountry = (...codes) => codes.some((code) => countryCodes.has(code));
  const onlyCountries = (...codes) => (
    countryCodes.size > 0
    && [...countryCodes].every((code) => codes.includes(code))
  );
  if (hasCountry("KZ", "KG", "UZ", "TJ", "TM")) {
    return "穿行丝路绿洲与旷野，让砖石穹顶和市集烟火交替展开";
  }
  if (countryCodes.size >= 2 && onlyCountries("AT", "CZ", "HU", "SK")) {
    return "沿多瑙河与帝国旧都的脉络前行，让宫殿、咖啡馆和老城夜色层层展开";
  }
  if (countryCodes.size === 1 && hasCountry("JP")) {
    return "在古都寺院、街巷日常与山海风景之间，读一段层次分明的日本";
  }
  if (countryCodes.size === 1 && hasCountry("IT")) {
    return "让教堂穹顶、文艺复兴街巷与餐桌烟火沿途相接";
  }
  if (countryCodes.size === 1 && hasCountry("FR")) {
    return "循着河岸、旧城与葡萄酒乡的光影，慢慢展开法兰西的不同侧面";
  }
  if (onlyCountries("DK", "FI", "IS", "NO", "SE")) {
    return "在港湾、森林与北地长光之间，感受城市秩序和旷野气息的交替";
  }
  if (style === "classic-first-trip") {
    return "从最具辨识度的老城与地标入手，先读懂一地的性格";
  }
  if (style === "deep-dive") {
    return "把脚步放慢，在支线街区与地方日常里读出更深一层";
  }
  if (style === "country-hopper") {
    return "在相邻国度的广场、街巷与餐桌之间，看见边界两侧的气质流转";
  }
  if (style === "transport-journey") {
    return "循着城际脉络换景，让站城、原野与地方日常自然衔接";
  }
  if (style === "seasonal") {
    return "顺应当季光线与风物，在天气变化里为旅途留出从容";
  }
  if (style === "theme") {
    return "循着一条鲜明线索，在建筑、风物与地方故事间逐层展开";
  }
  if (style === "city-break") {
    return "从晨间街市走到黄昏屋顶，在短暂停留里触到城市的脉搏";
  }
  if (style === "pilgrimage") {
    return "沿古道与信仰遗迹缓步前行，让沿途村镇成为旅程的一部分";
  }
  if (style === "island-hopping") {
    return "在海湾、港埠与离岛之间换景，把潮汐留进旅行节奏";
  }
  if (style === "road-trip" || /自驾|coast|highway|rockies|patagonia|garden route|公路|\broad\b|\bdrive\b/iu.test(narrativeText)) {
    return "让公路、地貌和小镇日常在车窗外自然递进";
  }
  if (style === "rail-journey" || /铁路|火车|景观铁路|列车|\brail(?:way)?\b|\btrain\b/iu.test(narrativeText)) {
    return "循着铁路线换景，在站城之间收拢沿途风土";
  }
  if (/unesco|heritage|temple|cathedral|古城|遗产|文明|城堡|教堂/iu.test(narrativeText)) {
    return "循着古城街巷与砖石遗迹，读出不同时代留下的纹理";
  }
  if (/海岛|跳岛|island|beach|azores|hawaii|palawan|croatia/iu.test(narrativeText)) {
    return "在海湾、老城与离岛之间换景，把潮汐留进旅行节奏";
  }
  if (/safari|wildlife|whale|自然|野生|动物|鲸|观鲸|冰川|峡湾|极光|aurora/iu.test(narrativeText)) {
    return "沿地貌与野生生境前行，为天气和自然节律保留余地";
  }
  if (countryCount >= 2) {
    return "让几座城市的街景、历史与餐桌气息在移动中自然递进";
  }
  return "从街巷、建筑到地方日常，慢慢读懂这片土地的层次";
}
function routeFeatureIntroV2(record = {}) {
  if (record.routeReferenceMode === "citywalk") {
    const destinations = record.destinationEntities || [];
    const city = destinations.find((destination) => destination.entityTypeName === "city");
    const poiCount = Array.isArray(city?.poiEntities) ? city.poiEntities.length : 0;
    return `以${city?.canonicalNameZh || city?.name || "当前城市"}为中心，汇总${poiCount}个现有景点；可按兴趣自由拆分，不设天数上限。`;
  }
  const narrativeText = [
    record.canonicalTitle,
    record.name,
    record.sourceTitle,
    record.summary,
    record.recommendationText,
    ...(record.highlights || []),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ").toLowerCase();
  const style = String(record.travelStyleConceptKey || record.travelStyle || record.concept?.travelStyle || "").toLowerCase();
  const destinations = routeDestinations(record);
  const countryCount = uniqueList([
    ...(record.countries || []),
    ...(record.countryEntities || []).map((item) => item.countryCode || item.name),
  ]).length;

  const first = destinations[0] || "";
  const last = destinations.at(-1) || "";
  const middle = destinations.length > 2 ? destinations[Math.floor((destinations.length - 1) / 2)] : "";
  const compactPlace = (value) => String(value || "")
    .replace(/(?:区域风景带|自然腹地|门户城市|地方生活区|历史城区|文化停留区)$/u, "")
    .trim() || String(value || "");
  const compactFirst = compactPlace(first);
  const compactLastCandidate = compactPlace(last);
  const compactLast = compactLastCandidate === compactFirst ? last : compactLastCandidate;
  const compactMiddle = compactPlace(middle);
  const middleAnchor = compactMiddle
    && compactMiddle !== compactFirst
    && compactMiddle !== compactLast
    ? `经${compactMiddle}`
    : "";
  const anchor = first && last && first !== last
    ? `从${first}${middleAnchor}到${compactLast}`
    : first ? `以${first}为核心` : "围绕沿途停留点";
  const literaryPhrase = routeLiteraryPhrase(record, narrativeText, style, countryCount);
  return `${anchor}，${literaryPhrase}。`;
}

function routeDisplayTitleV2(record = {}) {
  return String(record.canonicalTitle || record.name || "")
    .replace(/(经典|精简|延展|深度|铁路|公路)\1/gu, "$1")
    .trim();
}
function cacheRouteRecords(records) {
  if (!window.TravelState?.cacheRouteMedia) return records;
  const state = records.reduce((current, record) => (
    window.TravelState.cacheRouteMedia(current, record, { refresh: Boolean(record.onlineCoverAsset?.imageUrl) })
  ), readRouteState());
  window.TravelState.writeTravelState?.(state);
  return records.map((record) => window.TravelState.applyCachedRouteMedia?.(state, record) || record);
}

function routeRenderKey(record = {}) {
  return record.id;
}

function routeDedupeKey(record = {}) {
  const title = String(record.canonicalTitle || record.name || "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("zh-CN");
  const countries = (record.countryEntities || [])
    .map((item) => item.countryCode || item.name)
    .filter(Boolean)
    .sort()
    .join("|");
  const style = record.travelStyleConceptKey || record.travelStyle || (record.themes || [])[0] || "";
  const days = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || "";
  return [title, countries, style, days].filter(Boolean).join("::");
}

function routeVisualClusterKey(record = {}) {
  const countries = (record.countryEntities || [])
    .map((item) => item.countryCode || item.name)
    .filter(Boolean)
    .sort()
    .join("|");
  return countries || "";
}

function routeStyleBucket(record = {}) {
  const style = String(record.travelStyleConceptKey || record.travelStyle || record.concept?.travelStyle || "").toLowerCase();
  const text = routeSearchText(record);
  if (style === "rail-journey" || style === "road-trip" || style === "transport-journey") return "transport";
  if (/铁路|火车|rail|train|自驾|road|drive|highway|交通线|transport|banana/i.test(text)) return "transport";
  if (style === "classic-first-trip" || style === "city-break") return "classic";
  if (style === "theme" || style === "seasonal" || style === "pilgrimage") return "theme";
  if (style === "deep-dive") return "deep";
  if (style === "country-hopper") return "hopper";
  return "general";
}

function isTransportStyle(record = {}) {
  return routeStyleBucket(record) === "transport";
}

function routeContinentBucket(record = {}) {
  const continents = [...new Set(routeCountryCodes(record).map(continentForCountryCode))];
  if (!continents.length) return "europe";
  if (continents.length === 1) return continents[0];
  return continents[stableTextHash(`${record.id || record.name || ""}:continent`) % continents.length] || "europe";
}

function recentFeedVisualClusters(records = feedState.records) {
  return new Set(records
    .slice(-FEED_CLUSTER_COOLDOWN_WINDOW)
    .map(routeVisualClusterKey)
    .filter(Boolean));
}

function stableRouteBatch(records = [], comparisonRecords = [], limit = BATCH_SIZE) {
  const knownIds = new Set(comparisonRecords.map((record) => record?.id).filter(Boolean));
  const knownTitles = new Set(comparisonRecords
    .map((record) => record?.canonicalTitle || record?.name)
    .filter(Boolean));
  const selected = [];
  for (const record of records) {
    const id = record?.id;
    const title = record?.canonicalTitle || record?.name || "";
    if (!id || knownIds.has(id) || (title && knownTitles.has(title))) continue;
    selected.push(record);
    knownIds.add(id);
    if (title) knownTitles.add(title);
    if (selected.length >= limit) break;
  }
  return selected;
}

function selectAppendableRecords(records, limit = FEED_PAGE_SIZE, comparisonRecords = feedState.records) {
  const stableRecords = cacheRouteRecords(records || []);
  return stableRouteBatch(stableRecords, comparisonRecords, limit);
}

function appendRecords(records, limit = FEED_PAGE_SIZE, { revealImmediately = true } = {}) {
  const insertedRecords = selectAppendableRecords(records, limit, feedState.records);
  const batchId = `batch-${feedState.nextRenderBatchId++}`;
  const preparedRecords = feedState.query
    ? insertedRecords.map((record) => ({
      ...record,
      _feedBatchId: batchId,
      _renderedImageReady: true,
    }))
    : insertedRecords.map((record, index) => ({
      ...record,
      _feedInstanceId: `${record.id}::${feedState.records.length + index}`,
      _feedBatchId: batchId,
      _renderedImageReady: true,
    }));
  void revealImmediately;
  feedState.records.push(...preparedRecords);
  return preparedRecords;
}

function unseenRecords(records) {
  const knownIds = new Set(feedState.records.map((record) => record.id));
  const knownTitles = new Set(feedState.records.map((record) => record.canonicalTitle || record.name));
  return (records || []).filter((record) => !knownIds.has(record.id) && !knownTitles.has(record.canonicalTitle || record.name));
}

function feedExcludeIdsForRequest() {
  const recentRecords = feedState.query
    ? feedState.records
    : feedState.records.slice(-FEED_DEDUPE_WINDOW);
  return [...recentRecords.map((record) => record.id), ...feedState.skippedRouteIds].filter(Boolean);
}

function selectFeedPageRecords(records = []) {
  const knownIds = new Set(feedState.records.map((record) => record.id));
  const knownTitles = new Set(feedState.records.map((record) => record.canonicalTitle || record.name));
  const knownKeys = new Set(feedState.records.map(routeDedupeKey).filter(Boolean));
  const previousContinent = feedState.records.length
    ? routeContinentBucket(feedState.records[feedState.records.length - 1])
    : "";
  const recentCountryCodes = new Set(feedState.records.slice(-FEED_DEDUPE_WINDOW).flatMap(routeCountryCodes));
  const selected = [];
  const selectedCountryCodes = new Set();
  const selectedContinents = new Set();
  const selectedStyles = new Set();
  const selectedDurations = new Set();
  const priorityScore = (record) => {
    const codes = routeCountryCodes(record);
    const hasVerifiedCover = Boolean(displayCoverUrl(record));
    const freshReady = codes.filter((code) => IMAGE_READY_COUNTRY_CODES.has(code) && !recentCountryCodes.has(code)).length;
    const repeatedReady = codes.filter((code) => IMAGE_READY_COUNTRY_CODES.has(code) && recentCountryCodes.has(code)).length;
    const selectedCountryOverlap = codes.filter((code) => selectedCountryCodes.has(code)).length;
    const continent = routeContinentBucket(record);
    const style = routeStyleBucket(record);
    const duration = Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || 0;
    return (hasVerifiedCover ? 80 : 0)
      + freshReady * 24
      + repeatedReady * 8
      + (selectedContinents.has(continent) ? -5 : 6)
      + (selectedStyles.has(style) ? -3 : 4)
      + (selectedDurations.has(duration) ? -2 : 3)
      - selectedCountryOverlap * 6
      + (previousContinent && continent === previousContinent ? -3 : 0);
  };
  const sourceRecords = [...(records || [])];
  for (let pass = 0; pass < 2; pass += 1) {
    const prioritizedRecords = sourceRecords.sort((left, right) => priorityScore(right) - priorityScore(left));
    for (const record of prioritizedRecords) {
    if (selected.length >= FEED_CANDIDATE_PAGE_SIZE) break;
    const title = record.canonicalTitle || record.name;
    const key = routeDedupeKey(record);
    const codes = routeCountryCodes(record);
    const hasReadyCountry = displayCoverUrl(record) || codes.some((code) => IMAGE_READY_COUNTRY_CODES.has(code));
    if (!hasReadyCountry && pass === 0) continue;
    if (
      !record?.id
        || knownIds.has(record.id)
        || knownTitles.has(title)
        || (key && knownKeys.has(key))
    ) continue;
    selected.push(record);
    knownIds.add(record.id);
    knownTitles.add(title);
    if (key) knownKeys.add(key);
      codes.forEach((code) => selectedCountryCodes.add(code));
      selectedContinents.add(routeContinentBucket(record));
      selectedStyles.add(routeStyleBucket(record));
      selectedDurations.add(Number(record.durationDays) || Number.parseInt(record.recommendedDays, 10) || 0);
    }
    if (selected.length >= FEED_CANDIDATE_PAGE_SIZE) break;
  }
  return selected;
}

async function requestDiscoveryPage({ query, cursor, sessionId, excludeIds, routeType, signal }) {
  const isSearch = Boolean(String(query || "").trim());
  const excludeClusters = isSearch ? [] : [...recentFeedVisualClusters(feedState.records)];
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      mode: isSearch ? "search" : "feed",
      query,
      limit: isSearch ? SEARCH_PAGE_SIZE : FEED_PAGE_SIZE,
      cursor,
      sessionId,
      excludeIds,
      excludeClusters,
      routeType: isSearch ? "" : routeType,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !Array.isArray(payload.records)) {
    throw new Error(payload.error?.message || `Route Discovery failed (${response.status})`);
  }
  return payload;
}

function needsOnlineCover(record) {
  return !coverUrl(record);
}

function coverIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function isReusableLocalCover(record = {}, imageUrl = displayCoverUrl(record)) {
  const fixedCover = fixedPilotRouteCover(record);
  return Boolean(
    imageUrl
      && fixedCover
      && !fixedCover.isFallback
      && !/^https?:\/\//i.test(imageUrl)
      && imageUrl !== FALLBACK_ROUTE_COVER
  );
}

function clearRouteCover(record) {
  if (record.onlineCoverAsset) record.onlineCoverAsset = null;
  if (record.coverAsset?.imageUrl) record.coverAsset = { ...record.coverAsset, imageUrl: "" };
  if (record.coverImage) record.coverImage = "";
  delete record._coverReadyUrl;
}

function applyOnlineCover(record, image) {
  record.coverSearchFailed = false;
  record.onlineCoverAsset = {
    ...image,
    status: image.status || "verified",
    semanticStatus: image.semanticStatus || "verified",
    coverStatus: image.coverStatus || "verified",
    imageDedupeKey: image.imageDedupeKey || image.dedupeKey || coverIdentity(image.imageUrl),
  };
  record.coverAsset = {
    ...(record.coverAsset || {}),
    provider: image.provider,
    imageUrl: image.imageUrl,
    sourceUrl: image.sourceUrl,
    title: image.title,
    status: image.status || "verified",
    semanticStatus: image.semanticStatus || "verified",
    coverStatus: image.coverStatus || "verified",
    imageCountryCodes: image.imageCountryCodes || [],
    imageDedupeKey: image.imageDedupeKey || image.dedupeKey || coverIdentity(image.imageUrl),
    imageMatchReason: image.matchEvidence || image.imageMatchReason || "",
  };
}

function isUsedCoverImage(image, usedImageUrls, usedImageTitles) {
  return usedImageUrls.has(coverIdentity(image?.imageUrl))
    || usedImageTitles.has(String(image?.title || "").trim().toLowerCase());
}

async function requestOnlineCover(record, signal, exclusions = {}) {
  const response = await fetch(IMAGE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      id: record.id,
      name: record.name,
      canonicalTitle: record.canonicalTitle,
      sourceTitle: record.sourceTitle,
      countries: record.countries,
      cities: record.cities,
      destinations: record.destinations,
      themes: record.themes,
      tags: record.tags,
      countryEntities: record.countryEntities,
      destinationEntities: record.destinationEntities,
      contentEvidence: record.contentEvidence,
      provenance: record.provenance,
      coverAsset: record.coverAsset,
      excludeImageUrls: exclusions.excludeImageUrls || [],
      excludeImageTitles: exclusions.excludeImageTitles || [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok
    && payload.ok
    && payload.status === "verified"
    && payload.image?.imageUrl
    && payload.image?.semanticStatus === "verified"
    ? payload.image
    : null;
}

async function hydrateOnlineCovers(records, signal, existingRecords = [], options = {}) {
  if (!runtimeImageSearchEnabled) return records;
  const pageRecords = records || [];
  const usedImageUrls = new Set();
  const usedImageTitles = new Set();
  for (const record of existingRecords || []) {
    const imageUrl = coverUrl(record);
    const imageKey = coverIdentity(imageUrl);
    const imageTitle = String(record.onlineCoverAsset?.title || record.coverAsset?.title || "").trim().toLowerCase();
    if (imageKey) usedImageUrls.add(imageKey);
    if (imageTitle) usedImageTitles.add(imageTitle);
  }
  for (const record of pageRecords) {
    const imageUrl = coverUrl(record);
    const imageKey = coverIdentity(imageUrl);
    const imageTitle = String(record.onlineCoverAsset?.title || record.coverAsset?.title || "").trim().toLowerCase();
    if (!imageKey) continue;
    if (usedImageUrls.has(imageKey) || (imageTitle && usedImageTitles.has(imageTitle))) {
      clearRouteCover(record);
      continue;
    }
    usedImageUrls.add(imageKey);
    if (imageTitle) usedImageTitles.add(imageTitle);
  }
  const pending = pageRecords.filter(needsOnlineCover);
  for (const record of pending) {
    const recordSignal = childDeadlineSignal(signal, 2_800);
    let image = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      image = await requestOnlineCover(record, recordSignal, {
        excludeImageUrls: [...usedImageUrls],
        excludeImageTitles: [...usedImageTitles],
      }).catch(() => null);
      if (!routeImageAllowedForAsset(record, image)) break;
      if (!isUsedCoverImage(image, usedImageUrls, usedImageTitles)) break;
      usedImageUrls.add(coverIdentity(image.imageUrl));
      if (image.title) usedImageTitles.add(String(image.title).trim().toLowerCase());
      image = null;
    }
    if (image?.imageUrl) {
      applyOnlineCover(record, image);
      usedImageUrls.add(coverIdentity(image.imageUrl));
      if (image.title) usedImageTitles.add(String(image.title).trim().toLowerCase());
    } else {
      clearRouteCover(record);
      record.coverSearchFailed = true;
    }
    options.onRecord?.(record);
  }
  return records;
}

async function hydrateFeedOnlineCovers(records, signal, existingRecords = []) {
  if (!runtimeImageSearchEnabled) return;
  const pageRecords = records || [];
  const recentRecords = (existingRecords || []).slice(-FEED_DEDUPE_WINDOW);
  const usedImageUrls = new Set(recentRecords.map(displayCoverUrl).filter(Boolean));
  const usedImageTitles = new Set(recentRecords
    .map((record) => String(record.onlineCoverAsset?.title || record.coverAsset?.title || "").trim().toLowerCase())
    .filter(Boolean));
  const usedImageKeys = new Set([...usedImageUrls].map(coverIdentity).filter(Boolean));
  const targets = pageRecords.filter((record) => {
    const imageUrl = displayCoverUrl(record);
    const imageKey = coverIdentity(imageUrl);
    return !imageKey
      || usedImageKeys.has(imageKey)
      || isPlannerMaterializedRecord(record)
      || isPlannerFallbackCover(record.onlineCoverAsset)
      || isPlannerFallbackCover(record.coverAsset);
  }).slice(0, FEED_CANDIDATE_PAGE_SIZE);
  if (!targets.length) return;
  await Promise.all(targets.map(async (record) => {
    const currentUrl = displayCoverUrl(record);
    const image = await requestOnlineCover(record, childDeadlineSignal(signal, 1_600), {
      excludeImageUrls: [...usedImageUrls, currentUrl].filter(Boolean),
      excludeImageTitles: [...usedImageTitles],
    }).catch(() => null);
    if (!routeImageAllowedForAsset(record, image) || isUsedCoverImage(image, usedImageKeys, usedImageTitles)) return;
    applyOnlineCover(record, image);
    usedImageUrls.add(image.imageUrl);
    usedImageKeys.add(coverIdentity(image.imageUrl));
    if (image.title) usedImageTitles.add(String(image.title).trim().toLowerCase());
  }));
}

async function prepareRouteImageBatch(pageRecords = [], previousRecords = [], signal, timeoutMs = FEED_COVER_PREPARE_DEADLINE_MS) {
  const batch = pageRecords.slice(0, BATCH_SIZE);
  const usedImages = new Set(previousRecords
    .slice(-FEED_DEDUPE_WINDOW)
    .map((record) => routeImageDedupeKey(record) || coverIdentity(displayCoverUrl(record)))
    .filter(Boolean));
  const outcomes = await Promise.all(batch.map(async (record) => {
    const imageUrl = displayCoverUrl(record);
    const hasFixedAssetKey = Boolean(String(record.coverImageKey || "").trim());
    const reusableLocalCover = isReusableLocalCover(record, imageUrl);
    const imageKey = routeImageDedupeKey(record) || coverIdentity(imageUrl);
    if (!imageUrl || !imageKey || (!hasFixedAssetKey && !routeImageAllowed(record, imageUrl))) {
      record._coverLoadStatus = "missing";
      record._coverLoadUrl = "";
      return { status: "missing", routeId: record.id, imageUrl: "" };
    }
    if (usedImages.has(imageKey) && !reusableLocalCover) {
      record._coverLoadStatus = "duplicate";
      record._coverLoadUrl = imageUrl;
      clearRouteCover(record);
      return { status: "duplicate", routeId: record.id, imageUrl };
    }
    if (badRuntimeImageUrls.has(coverIdentity(imageUrl))) {
      record._coverLoadStatus = "error";
      record._coverLoadUrl = imageUrl;
      clearRouteCover(record);
      return { status: "error", routeId: record.id, imageUrl };
    }
    usedImages.add(imageKey);
    if (hasReadyRouteCover(record)) {
      record._coverLoadStatus = "ready";
      record._coverLoadUrl = imageUrl;
      return { status: "ready", routeId: record.id, imageUrl };
    }
    const outcome = await warmProxiedImage(imageUrl, signal, timeoutMs, (lateOutcome) => {
      applyRouteImageOutcome(record, imageUrl, lateOutcome, { late: true });
    }).catch(() => ({ status: "aborted", imageUrl }));
    applyRouteImageOutcome(record, imageUrl, outcome);
    return { ...outcome, routeId: record.id };
  }));
  return {
    records: batch,
    outcomes,
    ready: outcomes.filter((outcome) => outcome.status === "ready").length,
    placeholders: outcomes.filter((outcome) => outcome.status !== "ready").length,
  };
}

async function prefetchNextFeedPage() {
  if (
    feedState.status === "loading"
      || feedState.prefetching
      || feedState.prefetchedFeedPage
      || feedState.pendingMore
      || !feedState.hasMore
      || !feedState.cursor
  ) return;
  const controller = new AbortController();
  feedState.prefetchAbortController = controller;
  feedState.prefetching = true;
  const snapshot = {
    query: feedState.query,
    cursor: feedState.cursor,
    sessionId: feedState.sessionId,
    routeType: feedState.feedRouteType,
    excludeIds: feedExcludeIdsForRequest(),
  };
  const task = (async () => {
    try {
    const payload = await requestDiscoveryPage({
      query: snapshot.query,
      cursor: snapshot.cursor,
      sessionId: snapshot.sessionId,
      excludeIds: snapshot.excludeIds,
      routeType: snapshot.routeType,
      signal: requestSignal(controller, 4_000),
    });
    const candidates = snapshot.query ? unseenRecords(payload.records) : (payload.records || []);
    const pageRecords = selectAppendableRecords(candidates, BATCH_SIZE, feedState.records);
    const imageBatch = await prepareRouteImageBatch(pageRecords, feedState.records, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
    if (controller.signal.aborted) return;
    feedState.prefetchedFeedPage = {
      ...snapshot,
      payload,
      pageRecords,
      imageBatch,
    };
    } catch {
      // Prefetch is opportunistic; foreground loading still handles failures.
    } finally {
      if (feedState.prefetchAbortController === controller) feedState.prefetchAbortController = null;
      feedState.prefetching = false;
    }
  })();
  feedState.prefetchPromise = task;
  await task;
  if (feedState.prefetchPromise === task) feedState.prefetchPromise = null;
}

function routeCardImageMarkup(record, index = 3) {
  void index;
  const fixedCover = fixedPilotRouteCover(record);
  const imageUrl = displayCoverUrl(record);
  const fixedCoverKey = String(fixedCover?.key || record.coverImageKey || "");
  const safeLocalCover = Boolean(
    fixedCover?.url
      && fixedCover.url !== FALLBACK_ROUTE_COVER
      && !/^https?:\/\//i.test(fixedCover.url)
      && (fixedCover.isFallback === false || fixedCoverKey.startsWith("local:"))
  );
  const imageReady = safeLocalCover || Boolean(imageUrl && (
    record._coverLoadStatus === "ready"
      || (!record._coverLoadStatus && hasReadyRouteCover(record))
  ));
  const source = safeLocalCover
    ? fixedCover.url
    : imageReady ? proxiedRouteImageUrl(imageUrl) : FALLBACK_ROUTE_COVER;
  const state = safeLocalCover || (imageReady && !fixedCover?.isFallback) ? "ready" : "placeholder";
  return `<img src="${escapeHtml(source)}" alt="${escapeHtml(routeDisplayTitleV2(record))}封面图" loading="eager" decoding="async" data-route-cover-state="${state}"${fixedCover?.key ? ` data-cover-image-key="${escapeHtml(fixedCover.key)}"` : ""} />`;
}

function updateRenderedRouteImage(record, card = null) {
  if (!record || !routeFeed) return;
  const storedRecord = feedState.records.find((item) => routeRenderKey(item) === routeRenderKey(record))
    || feedState.records.find((item) => item.id === record.id);
  if (storedRecord && storedRecord !== record) {
    storedRecord._coverLoadStatus = record._coverLoadStatus;
    storedRecord._coverLoadUrl = record._coverLoadUrl;
    if (record._coverReadyUrl) storedRecord._coverReadyUrl = record._coverReadyUrl;
    if (record._coverLoadStatus === "error") clearRouteCover(storedRecord);
  }
  const targetRecord = storedRecord || record;
  const targetCard = card || [...routeFeed.querySelectorAll("[data-route-card]")]
    .find((candidate) => candidate.dataset.routeCard === routeRenderKey(targetRecord));
  const image = targetCard?.querySelector("img");
  if (!image) return;
  const fixedCover = fixedPilotRouteCover(targetRecord);
  const imageUrl = displayCoverUrl(targetRecord);
  const reusableLocalCover = isReusableLocalCover(targetRecord, fixedCover?.url || imageUrl);
  const ready = reusableLocalCover || (targetRecord._coverLoadStatus === "ready" && Boolean(imageUrl));
  const nextSource = reusableLocalCover
    ? fixedCover.url
    : ready ? proxiedRouteImageUrl(imageUrl) : FALLBACK_ROUTE_COVER;
  image.dataset.routeCoverState = reusableLocalCover || (ready && !fixedCover?.isFallback) ? "ready" : "placeholder";
  if (fixedCover?.key) image.dataset.coverImageKey = fixedCover.key;
  if (image.getAttribute("src") !== nextSource) image.src = nextSource;
}

function repairDuplicateRecordCovers(records = []) {
  void records;
}

function renderRouteCard(record, index) {
  const state = readRouteState();
  const favorite = window.TravelState?.isRouteFavorite?.(state, record.id) || false;
  const detailParams = new URLSearchParams({ id: record.id });
  detailParams.set("routeType", feedState.activeTab);
  if (feedState.query) {
    detailParams.set("q", feedState.query);
    detailParams.set("source", "search");
    detailParams.set("status", record.searchStatus || "accepted");
    detailParams.set("searchSessionId", feedState.sessionId);
    if (record.searchQueryId) detailParams.set("queryId", record.searchQueryId);
  }
  if (new URL(window.location.href).searchParams.get("localOnly") === "1") {
    detailParams.set("localOnly", "1");
  }
  const dayText = record.recommendedDays || (record.durationDays ? `${record.durationDays}天` : "");
  const monthText = record.searchStatus === "needs-review"
    ? "证据待验证"
    : (record.bestMonths || []).join(" / ");
  const displayTitle = routeDisplayTitleV2(record);
  return `
    <article class="route-card route-inspiration-card" data-route-card="${escapeHtml(routeRenderKey(record))}" data-route-id="${escapeHtml(record.id)}" data-feed-batch="${escapeHtml(record._feedBatchId || "")}">
      <a class="route-card-main" href="route-detail.html?${detailParams.toString()}" data-route-open="${escapeHtml(record.id)}" aria-label="查看${escapeHtml(displayTitle)}详情">
        ${routeCardImageMarkup(record, index)}
        <span class="route-copy">
          <strong>${escapeHtml(displayTitle)}</strong>
          <em>${escapeHtml(geographySummary(record))}</em>
          <small>${escapeHtml(routeFeatureIntroV2(record))}</small>
        </span>
      </a>
      <div class="route-card-meta">
        <span>${escapeHtml(dayText)}</span>
        <span>${escapeHtml(monthText)}</span>
      </div>
      <div class="route-card-actions">
        <button type="button" data-route-add-trip="${escapeHtml(record.id)}">加入行程</button>
        <button class="${favorite ? "favorited" : ""}" type="button" data-route-favorite="${escapeHtml(record.id)}" aria-label="${favorite ? "取消收藏" : "收藏"}${escapeHtml(displayTitle)}" aria-pressed="${favorite}">♥</button>
      </div>
    </article>`;
}

function bindRenderedImageReadiness() {
  if (!routeFeed) return;
  routeFeed.querySelectorAll("[data-route-card]").forEach((card) => {
    if (card.dataset.imageReadinessBound === "1") return;
    card.dataset.imageReadinessBound = "1";
    const image = card.querySelector("img");
    const record = feedState.records.find((item) => routeRenderKey(item) === card.dataset.routeCard)
      || feedState.records.find((item) => item.id === card.dataset.routeId);
    if (!image || !record || image.dataset.routeCoverState !== "ready") return;
    const markReady = () => {
      if (image.naturalWidth >= 20) record._renderedImageReady = true;
    };
    if (image.complete && image.naturalWidth >= 20) {
      record._renderedImageReady = true;
      return;
    }
    image.addEventListener("load", markReady, { once: true });
  });
}

function repairRenderedDuplicateImages() {
  if (!routeFeed) return;
  const used = new Set();
  routeFeed.querySelectorAll("[data-route-card]").forEach((card) => {
    const record = feedState.records.find((item) => routeRenderKey(item) === card.dataset.routeCard)
      || feedState.records.find((item) => item.id === card.dataset.routeId);
    const key = record ? routeImageDedupeKey(record) : "";
    if (!record || !key) return;
    if (used.has(key) && !isReusableLocalCover(record, displayCoverUrl(record))) {
      record._coverLoadStatus = "duplicate";
      clearRouteCover(record);
      updateRenderedRouteImage(record, card);
      return;
    }
    used.add(key);
  });
}

function scheduleSlowImageRepair() {
  void slowImageRepairTimer;
  void slowImageRepairRunning;
}

function suggestionsMarkup() {
  if (!feedState.query || !feedState.suggestions.length) return "";
  return `<span>可以试试：${feedState.suggestions.slice(0, 6).map(escapeHtml).join("、")}</span>`;
}

function stateMarkup() {
  const visible = visibleRecords();
  if (feedState.status === "loading") {
    const title = visible.length || feedState.searchResolved ? "正在加载更多路线…" : "正在发现路线…";
    const detail = visible.length || feedState.searchResolved
      ? "正在并行准备下一批封面"
      : feedState.query ? "正在解析旅行需求" : "正在读取路线库";
    return `<div class="route-empty-state" data-route-feed-state="loading"><p>${title}</p><span>${detail}</span></div>`;
  }
  if (feedState.status === "error") {
    return `<div class="route-empty-state" data-route-feed-state="error"><p>${visible.length ? "稍后重试" : "路线加载失败"}</p><span>当前请求没有成功完成</span><button type="button" ${visible.length ? "data-route-feed-more" : "data-route-feed-refresh"}>${visible.length ? "继续加载" : "重新加载"}</button></div>`;
  }
  if (!visible.length) {
    if (feedState.query && feedState.searchFailureReason === "query-too-long") {
      return `<div class="route-empty-state" data-route-feed-state="query-too-long"><p>搜索内容有点长</p><span>请将需求精简到 ${MAX_ROUTE_QUERY_LENGTH} 个字符以内，系统尚未发送这次请求</span></div>`;
    }
    if (feedState.query && feedState.searchFailureReason === "trip-duration-capacity-exceeded") {
      return `<div class="route-empty-state" data-route-feed-state="trip-capacity-exceeded"><p>当前路线容量还不足以可靠覆盖这么长的行程</p><span>系统不会用重复城市或景点凑数；可以缩短天数后再试</span></div>`;
    }
    if (feedState.query && feedState.searchFailureReason === "invalid-duration") {
      return `<div class="route-empty-state" data-route-feed-state="invalid-duration"><p>行程天数无效</p><span>请输入大于0的整数天数，例如“巴黎4天”</span></div>`;
    }
    if (feedState.query && feedState.searchFailureReason === "unresolved-destination") {
      return `<div class="route-empty-state" data-route-feed-state="unresolved-destination"><p>有城市暂时无法完整识别</p><span>请检查城市名称或换一种写法，系统不会删除城市后改推其他路线</span></div>`;
    }
    if (feedState.query && feedState.searchFailureReason === "destination-confirmation-required") {
      return `<div class="route-empty-state" data-route-feed-state="destination-confirmation-required"><p>请确认目的地名称</p><span>系统发现了可能的拼写结果，但不会在未确认时替你选择其他目的地</span>${suggestionsMarkup()}</div>`;
    }
    if (feedState.query && feedState.searchFailureReason === "constraint-conflict"
      && feedState.searchFailureCodes.includes("explicit-theme-mismatch")) {
      return `<div class="route-empty-state" data-route-feed-state="unsupported-theme"><p>暂时没有符合这个旅行主题的可靠路线</p><span>系统不会把普通路线包装成亲子、徒步、蜜月或其他主题路线</span></div>`;
    }
    if (feedState.query && feedState.searchFailureReason === "constraint-conflict") {
      return `<div class="route-empty-state" data-route-feed-state="constraint-conflict"><p>这些条件暂时无法同时满足</p><span>请增加行程天数或减少城市后再试</span></div>`;
    }
    if (feedState.query && feedState.records.length) {
      return `<div class="route-empty-state" data-route-feed-state="empty-category"><p>这个分类暂时没有路线</p><span>可以切换到另一个路线分类查看结果</span></div>`;
    }
    return `<div class="route-empty-state" data-route-feed-state="empty"><p>${feedState.query ? "暂时没有搜到路线" : "暂时没有发现路线"}</p>${suggestionsMarkup() || "<span>可以换一个旅行需求再试</span>"}</div>`;
  }
  if (!feedState.hasMore) return `<div class="route-empty-state" data-route-feed-state="complete"><p>${feedState.query ? "搜索结果已到底" : "已经到底了"}</p></div>`;
  return "";
}

function captureScrollAnchor() {
  const documentElement = document.documentElement;
  return {
    windowGap: Math.max(0, documentElement.scrollHeight - window.innerHeight - window.scrollY),
    windowNearEnd: window.innerHeight + window.scrollY >= documentElement.scrollHeight - 360,
    rootGap: routeScrollRoot
      ? Math.max(0, routeScrollRoot.scrollHeight - routeScrollRoot.clientHeight - routeScrollRoot.scrollTop)
      : 0,
    rootNearEnd: routeScrollRoot
      ? routeScrollRoot.clientHeight + routeScrollRoot.scrollTop >= routeScrollRoot.scrollHeight - 360
      : false,
  };
}

function restoreScrollAnchor(anchor, { preserveBottom = false } = {}) {
  if (!anchor) return;
  requestAnimationFrame(() => {
    if (preserveBottom && anchor.windowNearEnd) {
      const nextY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight - anchor.windowGap);
      if (nextY > window.scrollY) window.scrollTo(0, nextY);
    }
    if (preserveBottom && routeScrollRoot && anchor.rootNearEnd) {
      const nextTop = Math.max(0, routeScrollRoot.scrollHeight - routeScrollRoot.clientHeight - anchor.rootGap);
      if (nextTop > routeScrollRoot.scrollTop) routeScrollRoot.scrollTop = nextTop;
    }
  });
}

function alignInsertedBatchStart(record) {
  if (!record || !routeFeed) return;
  const renderKey = routeRenderKey(record);
  requestAnimationFrame(() => {
    const card = [...routeFeed.querySelectorAll("[data-route-card]")]
      .find((candidate) => candidate.dataset.routeCard === renderKey);
    if (!card) return;
    const targetTop = 88;
    const rect = card.getBoundingClientRect();
    const delta = rect.top - targetTop;
    if (Math.abs(delta) <= 18) return;
    if (isRootScrollable()) {
      routeScrollRoot.scrollTop = Math.max(0, routeScrollRoot.scrollTop + delta);
      return;
    }
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: "auto" });
  });
}

function schedulePendingBatchAnchor(retry = 0) {
  const anchorId = feedState.pendingBatchAnchorId;
  if (!anchorId || !routeFeed) return;
  clearTimeout(pendingBatchAnchorTimer);
  pendingBatchAnchorTimer = setTimeout(() => {
    if (feedState.pendingBatchAnchorId !== anchorId) return;
    const card = [...routeFeed.querySelectorAll("[data-route-id]")]
      .find((candidate) => candidate.dataset.routeId === anchorId);
    if (!card) return;
    const record = visibleRecords().find((item) => item.id === anchorId);
    if (!record) return;
    feedState.pendingBatchAnchorId = "";
    alignInsertedBatchStart(record);
  }, retry ? 100 : 50);
}

function renderSearchSummary() {
  if (!routeSearchSummary) return;
  routeSearchSummary.hidden = !feedState.query;
  if (!feedState.query) return;
  const count = visibleRecords().length;
  if (count) {
    routeSearchSummary.textContent = `已为“${feedState.query}”找到 ${count} 条路线`;
  } else if (!feedState.searchResolved) {
    routeSearchSummary.textContent = `正在搜索“${feedState.query}”`;
  } else if (feedState.records.length) {
    const routeTypeLabel = feedState.activeTab === "cross" ? "跨国" : "单国";
    routeSearchSummary.textContent = `“${feedState.query}”的${routeTypeLabel}分类暂时没有路线，可以切换另一分类`;
  } else if (feedState.searchResultCount) {
    routeSearchSummary.textContent = `已找到 ${feedState.searchResultCount} 条路线，正在准备首批卡片`;
  } else if (feedState.searchFailureReason === "query-too-long") {
    routeSearchSummary.textContent = `搜索内容超过 ${MAX_ROUTE_QUERY_LENGTH} 个字符，请精简后重试；本次没有发送请求`;
  } else if (feedState.searchFailureReason === "trip-duration-capacity-exceeded") {
    routeSearchSummary.textContent = `“${feedState.query}”超过当前可靠路线容量，系统没有用重复城市或景点凑数`;
  } else if (feedState.searchFailureReason === "invalid-duration") {
    routeSearchSummary.textContent = `“${feedState.query}”中的行程天数无效，请输入大于0的整数天数`;
  } else if (feedState.searchFailureReason === "unresolved-destination") {
    routeSearchSummary.textContent = `“${feedState.query}”中有城市暂时无法完整识别，请检查名称后重试`;
  } else if (feedState.searchFailureReason === "destination-confirmation-required") {
    routeSearchSummary.textContent = `“${feedState.query}”可能包含目的地拼写错误，请确认建议后重新搜索`;
  } else if (feedState.searchFailureReason === "constraint-conflict"
    && feedState.searchFailureCodes.includes("explicit-theme-mismatch")) {
    routeSearchSummary.textContent = `暂时没有符合“${feedState.query}”主题约束的可靠路线`;
  } else if (feedState.searchFailureReason === "constraint-conflict") {
    routeSearchSummary.textContent = `“${feedState.query}”的条件无法同时满足，请增加天数或减少城市`;
  } else {
    routeSearchSummary.textContent = `没有找到“${feedState.query}”的路线`;
  }
}
function renderFeed({ incremental = false } = {}) {
  if (!routeFeed) return;
  const scrollAnchor = incremental ? captureScrollAnchor() : null;
  const visible = visibleRecords();
  routeFeed.setAttribute("aria-busy", String(feedState.status === "loading"));
  routeFeed.dataset.feedStatus = feedState.status;
  routeFeed.dataset.feedHasMore = String(feedState.hasMore);
  routeFeed.dataset.feedCursor = feedState.cursor ? "1" : "0";
  routeFeed.dataset.feedRecords = String(feedState.records.length);
  routeFeed.dataset.feedVisible = String(visible.length);
  routeFeed.dataset.feedLoadingFor = feedState.loadingStartedAt ? String(Date.now() - feedState.loadingStartedAt) : "0";
  if (feedState.lastLoadDebug) routeFeed.dataset.feedLastLoad = JSON.stringify(feedState.lastLoadDebug);
  if (incremental) {
    routeFeed.querySelectorAll("[data-route-feed-state]").forEach((node) => node.remove());
    const recordsById = new Map(visible.map((record) => [routeRenderKey(record), record]));
    routeFeed.querySelectorAll("[data-route-card]").forEach((card) => {
      const record = recordsById.get(card.dataset.routeCard);
      if (!record) {
        card.remove();
        return;
      }
      updateRenderedRouteImage(record, card);
    });
    const renderedIds = new Set([...routeFeed.querySelectorAll("[data-route-card]")].map((card) => card.dataset.routeCard));
    const nextCards = visible.filter((record) => !renderedIds.has(routeRenderKey(record)));
    routeFeed.insertAdjacentHTML("beforeend", nextCards.map((record, index) => renderRouteCard(record, renderedIds.size + index)).join("") + stateMarkup());
  } else {
    routeFeed.innerHTML = visible.map(renderRouteCard).join("") + stateMarkup();
  }
  bindRenderedImageReadiness();
  repairRenderedDuplicateImages();
  renderSearchSummary();
  schedulePendingCoverHydration();
  restoreScrollAnchor(scrollAnchor);
  schedulePendingBatchAnchor();
  scheduleContinuationCheck();
  updateRouteFeedObserver();
}

function schedulePendingCoverHydration() {
  if (!runtimeImageSearchEnabled) return;
  if (pendingCoverHydrationTimer || pendingCoverHydrating) return;
  pendingCoverHydrationTimer = window.setTimeout(async () => {
    pendingCoverHydrationTimer = 0;
    if (pendingCoverHydrating || feedState.status === "loading") return;
    const visible = visibleRecords();
    const pending = visible
      .filter((record) => !displayCoverUrl(record) && Number(record._coverHydrationAttempts || 0) < 2)
      .slice(0, FEED_PAGE_SIZE * 4);
    if (!pending.length) return;
    pendingCoverHydrating = true;
    const usedImages = new Set(visible.map((record) => coverIdentity(displayCoverUrl(record))).filter(Boolean));
    try {
      await Promise.all(pending.map(async (record) => {
        record._coverHydrationAttempts = Number(record._coverHydrationAttempts || 0) + 1;
        await ensureRecordCoverReady(record, timeoutSignal(3_500), usedImages);
        updateRenderedRouteImage(record);
      }));
    } finally {
      pendingCoverHydrating = false;
    }
  }, 80);
}

function isStableFeedCursor(cursor) {
  try {
    const encoded = String(cursor || "").trim();
    if (!encoded || !/^[A-Za-z0-9_-]+$/u.test(encoded)) return false;
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const validHash = (value) => Number.isSafeInteger(value) && value >= 0;
    const validRandomRank = Number.isInteger(payload?.randomRank)
      && payload.randomRank >= 0
      && payload.randomRank <= 0xFFFFFFFF;
    return payload?.version === 1
      && payload.provider === "accepted-repository"
      && payload.orderVersion === 3
      && validHash(payload.sessionHash)
      && validHash(payload.filterHash)
      && validRandomRank
      && typeof payload.id === "string"
      && Boolean(payload.id.trim());
  } catch {
    return false;
  }
}

function readPreloadedRouteFeed() {
  try {
    const payload = JSON.parse(sessionStorage.getItem(ROUTE_FEED_PRELOAD_KEY) || "null");
    if (payload?.cacheVersion !== "route-preload-v2") return null;
    if (!payload.imagesReady) return null;
    if (!payload?.createdAt || Date.now() - payload.createdAt > ROUTE_FEED_PRELOAD_TTL_MS) return null;
    if (!Array.isArray(payload.records) || payload.records.length < FEED_PAGE_SIZE) return null;
    if (!payload.hasMore || !payload.nextCursor) return null;
    if (!isStableFeedCursor(payload.nextCursor)) return null;
    if (payload.records.some((record) => !displayCoverUrl(record))) return null;
    payload.records.forEach((record) => markRouteCoverReady(record));
    return payload;
  } catch {
    return null;
  }
}

function normalizeBootstrappedFeed(payload) {
  if (!payload || payload.cacheVersion !== "route-bootstrap-v1") return null;
  if (!Array.isArray(payload.records) || payload.records.length < FEED_PAGE_SIZE) return null;
  if (!payload.hasMore || !payload.nextCursor) return null;
  if (!isStableFeedCursor(payload.nextCursor)) return null;
  if (payload.records.some((record) => !displayCoverUrl(record))) return null;
  payload.records.forEach((record) => markRouteCoverReady(record));
  return payload;
}

function readBootstrappedRouteFeed(routeType = "cross") {
  const payload = window.__ROUTE_FEED_BOOTSTRAP;
  if (!payload || payload.cacheVersion !== "route-bootstrap-v1") return null;
  if (payload.feeds) return normalizeBootstrappedFeed(payload.feeds[routeType]);
  return normalizeBootstrappedFeed(payload);
}

function activateFeedScroll() {
  requestAnimationFrame(() => {
    hasUserScrolled = false;
    routeFeedBatchTriggerConsumed = false;
    feedReadyForScroll = true;
    if (!continuationPoller) {
      continuationPoller = setInterval(forceContinuationIfNeeded, 700);
    }
  });
}

function usePreloadedRouteFeed(payload) {
  abortActiveRequest();
  Object.assign(feedState, {
    records: [],
    cursor: payload.nextCursor || null,
    hasMore: Boolean(payload.hasMore && payload.nextCursor),
    status: "ready",
    query: "",
    activeTab: payload.routeType || feedState.activeTab,
    feedRouteType: payload.routeType || feedState.feedRouteType,
    sessionId: payload.sessionId || createSessionId(),
    suggestions: [],
    skippedRouteIds: new Set(),
    lastVisibleBatchAt: 0,
    searchResolved: false,
    searchResultCount: 0,
    searchFailureReason: "",
    searchFailureCodes: [],
    consecutiveEmptyPages: 0,
  });
  activateRouteTab(feedState.activeTab);
  if (payload.sessionId) sessionStorage.setItem(ROUTE_FEED_SESSION_KEY, payload.sessionId);
  appendRecords(payload.records, FEED_PAGE_SIZE, { revealImmediately: Boolean(payload.revealImmediately) });
  renderFeed();
  window.scrollTo(0, 0);
  if (routeScrollRoot) routeScrollRoot.scrollTo?.(0, 0);
  activateFeedScroll();
  void prefetchNextFeedPage();
}

function resolveFeedContinuation({ insertedCount, serverHasMore, nextCursor, previousEmptyCount }) {
  if (insertedCount > 0) {
    const hasMore = Boolean(serverHasMore && nextCursor);
    return {
      hasMore,
      cursor: hasMore ? nextCursor : null,
      consecutiveEmptyPages: 0,
      retry: false,
      reason: hasMore ? "continue" : "exhausted",
    };
  }
  if (!serverHasMore || !nextCursor) {
    return {
      hasMore: false,
      cursor: null,
      consecutiveEmptyPages: 0,
      retry: false,
      reason: "exhausted",
    };
  }
  const consecutiveEmptyPages = Number(previousEmptyCount || 0) + 1;
  if (consecutiveEmptyPages >= 2) {
    return {
      hasMore: false,
      cursor: null,
      consecutiveEmptyPages,
      retry: false,
      reason: "empty-page-guard",
    };
  }
  return {
    hasMore: true,
    cursor: nextCursor,
    consecutiveEmptyPages,
    retry: true,
    reason: "empty-page-confirmation",
  };
}

async function loadFeed({ refresh = false } = {}) {
  if (!routeFeed || feedState.status === "loading" || (!refresh && !canRequestMoreFeed())) return;
  if (rejectOversizedRouteQuery(feedState.query)) return;
  if (refresh) {
    abortActiveRequest();
    Object.assign(feedState, {
      records: [],
      cursor: null,
      hasMore: true,
      pendingMore: false,
      pendingRetryAt: 0,
      feedRouteType: feedState.query ? "" : feedState.activeTab,
      sessionId: createSessionId(),
      suggestions: [],
      skippedRouteIds: new Set(),
      lastVisibleBatchAt: 0,
      searchResolved: false,
      searchResultCount: 0,
      searchFailureReason: "",
      searchFailureCodes: [],
      consecutiveEmptyPages: 0,
    });
  }
  const token = ++feedState.requestToken;
  const controller = new AbortController();
  feedState.activeAbortController = controller;
  const requested = {
    query: feedState.query,
    cursor: feedState.cursor,
    sessionId: feedState.sessionId,
    excludeIds: feedExcludeIdsForRequest(),
    routeType: feedState.query ? "" : feedState.feedRouteType,
  };

  feedState.status = "loading";
  feedState.loadingStartedAt = Date.now();
  renderFeed({ incremental: feedState.records.length > 0 });
  const watchdogTimer = window.setTimeout(() => {
    if (token !== feedState.requestToken || feedState.status !== "loading") return;
    controller.abort();
    feedState.requestToken += 1;
    if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
    feedState.status = feedState.records.length ? "ready" : "error";
    if (feedState.query) feedState.searchResolved = true;
    feedState.loadingStartedAt = 0;
    feedState.hasMore = true;
    renderFeed({ incremental: feedState.records.length > 0 });
    scheduleContinuationCheck();
  }, requested.query ? SEARCH_LOAD_WATCHDOG_MS : FEED_LOAD_WATCHDOG_MS);

  try {
    if (feedState.prefetchPromise) await feedState.prefetchPromise;
    if (token !== feedState.requestToken) return;
    const prefetched = feedState.prefetchedFeedPage
      && feedState.prefetchedFeedPage.query === requested.query
      && feedState.prefetchedFeedPage.cursor === requested.cursor
      && feedState.prefetchedFeedPage.sessionId === requested.sessionId
      && feedState.prefetchedFeedPage.routeType === requested.routeType
      && Array.isArray(feedState.prefetchedFeedPage.pageRecords)
      ? feedState.prefetchedFeedPage
      : null;
    if (prefetched) feedState.prefetchedFeedPage = null;
    const discoverySignal = requestSignal(controller, requested.query ? SEARCH_DISCOVERY_TIMEOUT_MS : 4_800);
    let payload = prefetched?.payload || await requestDiscoveryPage({ ...requested, signal: discoverySignal });
    if (token !== feedState.requestToken) return;
    const previousCount = feedState.records.length;
    const previousRecords = feedState.records.slice();
    let pageRecords = prefetched?.pageRecords || (requested.query ? unseenRecords(payload.records) : (payload.records || []));
    const returnedCount = Number.isFinite(payload.returnedCount)
      ? payload.returnedCount
      : (Array.isArray(payload.records) ? payload.records.length : 0);
    let insertedRecords = [];
    let imageBatch = prefetched?.imageBatch || null;
    if (requested.query) {
      feedState.searchResolved = true;
      feedState.searchResultCount = returnedCount;
      feedState.searchFailureReason = String(payload.diagnostics?.reason || "");
      feedState.searchFailureCodes = Array.isArray(payload.diagnostics?.constraintConflict?.reasonCodes)
        ? payload.diagnostics.constraintConflict.reasonCodes.map(String)
        : [];
      if (previousRecords.length === 0 && pageRecords.length) autoClassifySearchResults(pageRecords);
      renderSearchSummary();
      const batchRecords = selectAppendableRecords(pageRecords, BATCH_SIZE, previousRecords);
      if (!prefetched) {
        imageBatch = await prepareRouteImageBatch(batchRecords, previousRecords, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
      }
      if (token !== feedState.requestToken) return;
      insertedRecords = appendRecords(batchRecords, SEARCH_PAGE_SIZE);
    } else {
      const appendableFeedRecords = selectAppendableRecords(pageRecords, FEED_PAGE_SIZE, previousRecords);
      if (!prefetched) {
        imageBatch = await prepareRouteImageBatch(appendableFeedRecords, previousRecords, controller.signal, FEED_COVER_PREPARE_DEADLINE_MS);
      }
      if (token !== feedState.requestToken) return;
      insertedRecords = appendRecords(appendableFeedRecords);
    }
    const continuation = resolveFeedContinuation({
      insertedCount: insertedRecords.length,
      serverHasMore: payload.hasMore === true,
      nextCursor: payload.nextCursor || null,
      previousEmptyCount: feedState.consecutiveEmptyPages,
    });
    feedState.lastLoadDebug = {
      returned: returnedCount,
      returnedCount,
      remainingCount: Number.isFinite(payload.remainingCount) ? payload.remainingCount : null,
      selected: pageRecords.length,
      ready: imageBatch?.ready || 0,
      placeholders: imageBatch?.placeholders || 0,
      appendable: selectAppendableRecords(pageRecords, FEED_PAGE_SIZE, previousRecords).length,
      inserted: insertedRecords.length,
      prev: previousCount,
      next: feedState.records.length,
      prefetched: Boolean(prefetched),
      routeType: requested.routeType || "",
      skipped: feedState.skippedRouteIds.size,
      selectedCodes: pageRecords.slice(0, 12).map((record) => routeCountryCodes(record).join(".")),
      readyCodes: (imageBatch?.outcomes || [])
        .filter((outcome) => outcome.status === "ready")
        .map((outcome) => outcome.routeId),
      insertedCodes: insertedRecords.map((record) => routeCountryCodes(record).join(".")),
      paginationReason: continuation.reason,
      consecutiveEmptyPages: continuation.consecutiveEmptyPages,
    };
    feedState.pendingMore = continuation.retry;
    feedState.pendingRetryAt = continuation.retry ? Date.now() + 1_500 : 0;
    feedState.suggestions = payload.suggestions || [];
    feedState.cursor = continuation.cursor;
    feedState.hasMore = continuation.hasMore;
    feedState.consecutiveEmptyPages = continuation.consecutiveEmptyPages;
    if (!continuation.hasMore) invalidateFeedPrefetch();
    feedState.status = "ready";
    feedState.loadingStartedAt = 0;
    if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
    feedState.pendingBatchAnchorId = "";
    renderFeed({ incremental: previousCount > 0 });
    persistRouteFeedNavigationState();
    void prefetchNextFeedPage();
  } catch (error) {
    if (token !== feedState.requestToken) return;
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
      feedState.status = feedState.records.length ? "ready" : "error";
      if (feedState.query) feedState.searchResolved = true;
      feedState.loadingStartedAt = 0;
      renderFeed({ incremental: feedState.records.length > 0 });
      return;
    }
    console.error("Route Discovery load failed", error);
    feedState.status = "error";
    if (feedState.query) feedState.searchResolved = true;
    feedState.loadingStartedAt = 0;
    if (feedState.activeAbortController === controller) feedState.activeAbortController = null;
    renderFeed({ incremental: feedState.records.length > 0 });
  } finally {
    window.clearTimeout(watchdogTimer);
  }
}

function resetDiscovery({ preferBootstrap = false } = {}) {
  abortActiveRequest();
  feedState.requestToken += 1;
  feedState.status = "idle";
  feedReadyForScroll = false;
  hasUserScrolled = false;
  window.scrollTo(0, 0);
  if (routeScrollRoot) routeScrollRoot.scrollTop = 0;
  if (preferBootstrap && !feedState.query) {
    const bootstrapped = readBootstrappedRouteFeed(feedState.activeTab);
    if (bootstrapped) {
      usePreloadedRouteFeed(bootstrapped);
      return Promise.resolve();
    }
  }
  return loadFeed({ refresh: true }).finally(() => {
    requestAnimationFrame(() => {
      hasUserScrolled = false;
      feedReadyForScroll = true;
      scheduleContinuationCheck();
    });
  });
}

routeTabs.forEach((button) => button.addEventListener("click", () => {
  activateRouteTab(button.dataset.routeTab);
  persistRouteTypeInUrl(feedState.activeTab);
  persistRouteFeedNavigationState();
  if (!feedState.query) resetDiscovery({ preferBootstrap: true });
  else renderFeed();
}));

let searchTimer = 0;
routeSearch?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  if (rejectOversizedRouteQuery(routeSearch.value)) return;
  searchTimer = setTimeout(() => {
    feedState.query = routeSearch.value.trim();
    persistRouteQueryInUrl(feedState.query);
    sessionStorage.removeItem(ROUTE_FEED_NAVIGATION_STATE_KEY);
    resetDiscovery();
  }, 300);
});

routeFeed?.addEventListener("click", (event) => {
  if (event.target.closest("[data-route-open]")) persistRouteFeedNavigationState();
  if (event.target.closest("[data-route-feed-refresh]")) return resetDiscovery();
  if (event.target.closest("[data-route-feed-more]")) return loadFeed();
  const favoriteButton = event.target.closest("[data-route-favorite]");
  if (favoriteButton) {
    const record = feedState.records.find((item) => item.id === favoriteButton.dataset.routeFavorite);
    if (!record) return;
    const state = readRouteState();
    updateRouteState((current) => window.TravelState.setRouteFavorite(current, record, !window.TravelState.isRouteFavorite(state, record.id)));
    return renderFeed();
  }
  const tripButton = event.target.closest("[data-route-add-trip]");
  if (tripButton) {
    const record = feedState.records.find((item) => item.id === tripButton.dataset.routeAddTrip);
    if (record) updateRouteState((state) => window.TravelState.createTripFromRoute(state, record));
    if (record) window.location.href = "trips.html";
  }
});

routeFeed?.addEventListener("error", async (event) => {
  if (!(event.target instanceof HTMLImageElement)) return;
  if (event.target.dataset.routeCoverState !== "ready") return;
  const card = event.target.closest("[data-route-card]");
  const record = feedState.records.find((item) => routeRenderKey(item) === card?.dataset.routeCard)
    || feedState.records.find((item) => item.id === card?.dataset.routeId);
  const failedUrl = new URL(event.target.src, window.location.href).searchParams.get("url") || event.target.src;
  if (record) {
    applyRouteImageOutcome(record, failedUrl, { status: "error" }, { late: true });
    schedulePendingCoverHydration();
  }
  else {
    event.target.dataset.routeCoverState = "placeholder";
    event.target.src = FALLBACK_ROUTE_COVER;
  }
}, true);

let hasUserScrolled = false;
let feedReadyForScroll = false;
let routeFeedBatchTriggerConsumed = false;
let continuationTimer = 0;
let continuationPoller = 0;
let bottomBackfillTimer = 0;
let pendingBatchAnchorTimer = 0;
let pendingCoverHydrationTimer = 0;
let pendingCoverHydrating = false;
let slowImageRepairTimer = 0;
let slowImageRepairRunning = false;
const isWindowNearEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
const isRootScrollable = () => routeScrollRoot
  ? routeScrollRoot.scrollHeight > routeScrollRoot.clientHeight + 24
  : false;
const isRootNearEnd = () => routeScrollRoot
  ? isRootScrollable() && routeScrollRoot.clientHeight + routeScrollRoot.scrollTop >= routeScrollRoot.scrollHeight - 240
  : false;
const isNearFeedEnd = () => isWindowNearEnd() || isRootNearEnd();
const shouldAutofillFeed = () => visibleRecords().length < FEED_PAGE_SIZE
  || document.documentElement.scrollHeight <= window.innerHeight + 24
  || (isRootScrollable() && routeScrollRoot.scrollHeight <= routeScrollRoot.clientHeight + 24);
const canContinueFeed = () => hasUserScrolled;
const canRequestMoreFeed = () => {
  if (!feedState.hasMore) return false;
  if (feedState.pendingMore && Date.now() < feedState.pendingRetryAt) return false;
  return true;
};
const canReactToFeedScroll = () => feedReadyForScroll || feedState.records.length >= FEED_PAGE_SIZE;
function triggerNextFeedBatch() {
  if (routeFeedBatchTriggerConsumed || feedState.status === "loading" || !canRequestMoreFeed()) return;
  routeFeedBatchTriggerConsumed = true;
  void loadFeed();
}
function scheduleContinuationCheck() {
  clearTimeout(continuationTimer);
  continuationTimer = setTimeout(() => {
    if (!canReactToFeedScroll() || !canContinueFeed() || feedState.status === "loading" || !canRequestMoreFeed()) return;
    if (isNearFeedEnd()) triggerNextFeedBatch();
  }, 120);
}
function scheduleBottomBackfill(delayMs = 120) {
  clearTimeout(bottomBackfillTimer);
  bottomBackfillTimer = setTimeout(() => {
    if (!hasUserScrolled || !canReactToFeedScroll() || feedState.status === "loading" || !canRequestMoreFeed()) return;
    if (isNearFeedEnd()) triggerNextFeedBatch();
  }, delayMs);
}
function forceContinuationIfNeeded() {
  if (feedState.status === "loading") {
    const loadingFor = feedState.loadingStartedAt ? Date.now() - feedState.loadingStartedAt : 0;
    if (loadingFor <= FEED_LOAD_WATCHDOG_MS + 1_500) return;
    feedState.activeAbortController?.abort?.();
    feedState.requestToken += 1;
    feedState.activeAbortController = null;
    feedState.status = feedState.records.length ? "ready" : "error";
    feedState.loadingStartedAt = 0;
    feedState.hasMore = true;
    renderFeed({ incremental: feedState.records.length > 0 });
  }
  if (!hasUserScrolled || !canReactToFeedScroll() || !canRequestMoreFeed()) return;
  if (isNearFeedEnd()) triggerNextFeedBatch();
}
const armPagination = () => {
  if (!canReactToFeedScroll()) return;
  hasUserScrolled = true;
  if (feedState.status !== "loading") routeFeedBatchTriggerConsumed = false;
  if (routeFeedSentinelNear || isNearFeedEnd()) triggerNextFeedBatch();
  else scheduleContinuationCheck();
};
window.addEventListener("wheel", armPagination, { passive: true });
window.addEventListener("touchmove", armPagination, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["PageDown", "End", "ArrowDown", " "].includes(event.key)) armPagination();
});
window.addEventListener("scroll", () => {
  if (canReactToFeedScroll() && canContinueFeed() && isNearFeedEnd()) triggerNextFeedBatch();
  else scheduleContinuationCheck();
}, { passive: true });
routeScrollRoot?.addEventListener("scroll", () => {
  if (canReactToFeedScroll() && canContinueFeed() && isNearFeedEnd()) triggerNextFeedBatch();
  else scheduleContinuationCheck();
}, { passive: true });
function updateRouteFeedObserver() {
  if (!routeFeedObserver || !routeFeedSentinel) return;
  if (feedState.hasMore && !routeFeedObserverActive) {
    routeFeedObserver.observe(routeFeedSentinel);
    routeFeedObserverActive = true;
  } else if (!feedState.hasMore && routeFeedObserverActive) {
    routeFeedObserver.disconnect();
    routeFeedObserverActive = false;
    routeFeedSentinelNear = false;
  }
}

if (routeFeedSentinel && "IntersectionObserver" in window) {
  routeFeedObserver = new IntersectionObserver((entries) => {
    routeFeedSentinelNear = entries.some((entry) => entry.isIntersecting);
    if (canReactToFeedScroll() && canContinueFeed() && routeFeedSentinelNear) triggerNextFeedBatch();
  }, { rootMargin: "800px 0px" });
  updateRouteFeedObserver();
}
if (!continuationPoller) {
  continuationPoller = setInterval(forceContinuationIfNeeded, 700);
}

window.__routeFeedDebug = () => ({
  records: feedState.records.length,
  visible: visibleRecords().length,
  status: feedState.status,
  hasMore: feedState.hasMore,
  cursor: Boolean(feedState.cursor),
  query: feedState.query,
  activeTab: feedState.activeTab,
  feedRouteType: feedState.feedRouteType,
  hasUserScrolled,
  feedReadyForScroll,
  canContinue: canContinueFeed(),
  nearEnd: isNearFeedEnd(),
  shouldAutofill: shouldAutofillFeed(),
  prefetching: feedState.prefetching,
  prefetched: Boolean(feedState.prefetchedFeedPage),
  observerActive: routeFeedObserverActive,
  pendingMore: feedState.pendingMore,
  consecutiveEmptyPages: feedState.consecutiveEmptyPages,
  lastLoad: feedState.lastLoadDebug,
  scrollY: window.scrollY,
  viewportHeight: window.innerHeight,
  documentHeight: document.documentElement.scrollHeight,
});
window.__routeForceLoadFeed = () => loadFeed();

window.addEventListener("pagehide", persistRouteFeedNavigationState);
if (routeSearch && feedState.query) routeSearch.value = feedState.query;
if (!rejectOversizedRouteQuery(feedState.query) && !restoreRouteFeedNavigationState()) {
  const preloadedRouteFeed = feedState.query ? null : (readBootstrappedRouteFeed(feedState.feedRouteType) || readPreloadedRouteFeed());
  if (preloadedRouteFeed) {
    usePreloadedRouteFeed(preloadedRouteFeed);
  } else {
    loadFeed().finally(() => {
      window.scrollTo(0, 0);
      if (routeScrollRoot) routeScrollRoot.scrollTo?.(0, 0);
      activateFeedScroll();
    });
  }
}
