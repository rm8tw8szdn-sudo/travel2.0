const API_ENDPOINT = "/api/routes/discovery";
const IMAGE_ENDPOINT = "/api/routes/image-search";
const detailParams = new URLSearchParams(window.location.search);
const routeId = detailParams.get("id")?.trim() || "";
const routeDetailSource = detailParams.get("source")?.trim() || "";
const routeSearchStatus = detailParams.get("status")?.trim() || "";
const routeSearchSessionId = detailParams.get("searchSessionId")?.trim() || "";
const routeSearchQueryId = detailParams.get("queryId")?.trim() || "";
const routeReturnQuery = detailParams.get("q")?.trim() || "";
const routeReturnLocalOnly = detailParams.get("localOnly") === "1";
const routeReturnType = detailParams.get("routeType")?.trim() || "";
const routeReturnUrl = new URL("routes.html", window.location.href);
if (routeReturnQuery) routeReturnUrl.searchParams.set("q", routeReturnQuery);
if (routeReturnLocalOnly) routeReturnUrl.searchParams.set("localOnly", "1");
if (["cross", "single"].includes(routeReturnType)) routeReturnUrl.searchParams.set("routeType", routeReturnType);
document.querySelectorAll("[data-route-back]").forEach((link) => {
  link.href = `${routeReturnUrl.pathname.split("/").pop()}${routeReturnUrl.search}`;
});
const FALLBACK_ROUTE_COVER = "assets/trip-cover-placeholder.svg";
const routeImageAssets = globalThis.RouteV2ImageAssets || null;
const runtimeImageSearchEnabled = routeImageAssets?.isRuntimeImageSearchEnabled?.() === true;
const detailLoadController = globalThis.RouteV2DetailLoadController?.create?.({ timeoutMs: 11_000 });
if (!detailLoadController) throw new Error("Route detail load controller is unavailable");

let activeRouteRecord = null;
let destinationHydrationToken = 0;

function readRouteState() {
  return window.TravelState?.readTravelState?.() || {};
}

function updateRouteState(updater) {
  return window.TravelState?.updateTravelState?.(updater) || {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeSelectorValue(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function showState(name) {
  document.querySelectorAll("[data-route-detail-state]").forEach((node) => {
    node.hidden = node.dataset.routeDetailState !== name;
  });
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value || "";
}

function renderSource(source) {
  const link = document.querySelector("[data-route-source]");
  if (!link) return;
  if (!source?.url) {
    link.removeAttribute("href");
    link.textContent = source?.name || "Search V1";
    return;
  }
  const url = new URL(source.url);
  link.href = url.href;
  link.textContent = source.name || url.hostname;
}

function destinationAssetMap(record) {
  return new Map((record.destinationAssets || []).map((asset) => [asset.destinationId || asset.destinationName, asset]));
}

function destinationKey(destination = {}) {
  const id = String(destination.wikidataId || "").trim();
  if (id) return `id:${id}`;
  return `name:${String(destination.name || "").trim().toLocaleLowerCase("zh-CN")}:${String(destination.countryCode || "").trim().toUpperCase()}`;
}

function destinationNameKey(destination = {}) {
  return `name:${String(destination.name || "").trim().toLocaleLowerCase("zh-CN")}:${String(destination.countryCode || "").trim().toUpperCase()}`;
}

function uniqueDestinations(record = {}) {
  const seen = new Set();
  const expansionPois = record.routeReferenceMode === "country-expansion"
    && Array.isArray(record.routeExpansion?.poiEntities)
    ? record.routeExpansion.poiEntities
    : [];
  return [...(record.destinationEntities || []), ...expansionPois].filter((destination) => {
    const key = destinationKey(destination);
    const nameKey = destinationNameKey(destination);
    if (!destination?.name || seen.has(key) || seen.has(nameKey)) return false;
    seen.add(key);
    seen.add(nameKey);
    return true;
  });
}

function destinationImageRoute(record = {}, destination = {}, excludeImageUrls = []) {
  const country = (record.countryEntities || []).find((item) => item.countryCode === destination.countryCode)
    || record.countryEntities?.[0]
    || {};
  return {
    id: `${record.id || "route"}::destination::${destination.wikidataId || destination.name}`,
    name: `${destination.name} ${country.name || destination.countryCode || ""}`.trim(),
    canonicalTitle: `${destination.name} ${country.name || destination.countryCode || ""}`.trim(),
    sourceTitle: destination.sourceTitle || destination.name,
    countryEntities: [{
      wikidataId: country.wikidataId || "",
      countryCode: destination.countryCode || country.countryCode || "",
      name: country.name || destination.countryCode || "",
    }],
    destinationEntities: [destination],
    countries: [destination.countryCode || country.countryCode || country.name].filter(Boolean),
    destinations: [destination.name, destination.sourceTitle].filter(Boolean),
    routeSearchTerms: [destination.name, destination.sourceTitle, country.name, destination.countryCode, "landmark"].filter(Boolean),
    coverAsset: null,
    excludeImageUrls,
  };
}

function currentDetailImageUrls(extraUrls = []) {
  return [
    activeRouteRecord?.coverAsset?.imageUrl,
    activeRouteRecord?.coverImage,
    activeRouteRecord?.coverUrl,
    ...Array.from(document.querySelectorAll("[data-route-destination-grid] img")).map((image) => image.src),
    ...extraUrls,
  ].map((url) => String(url || "").trim()).filter(Boolean);
}

async function fetchDestinationImage(record, destination, excludeImageUrls = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_500);
  try {
    const response = await fetch(IMAGE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(destinationImageRoute(record, destination, excludeImageUrls)),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload.ok && payload.image?.imageUrl ? payload.image : null;
  } finally {
    clearTimeout(timer);
  }
}

function findDestinationForCard(card) {
  if (!card || !activeRouteRecord) return null;
  const key = card.dataset.routeDestination || "";
  const name = card.querySelector("strong")?.textContent?.trim() || "";
  return uniqueDestinations(activeRouteRecord).find((destination) => (
    destination.wikidataId === key
    || destination.name === key
    || destination.name === name
  )) || null;
}

function destinationCardMarkup(record, destination, asset) {
  const destinationId = destination.wikidataId || destination.name;
  const countryName = (record.countryEntities || []).find((item) => item.countryCode === destination.countryCode)?.name || "";
  const citywalkLabel = record.routeReferenceMode === "citywalk"
    ? destination.entityTypeName === "poi" ? "景点" : "城市中心"
    : "";
  const destinationLabel = [countryName, citywalkLabel].filter(Boolean).join(" · ");
  if (!asset?.imageUrl) {
    return `<article class="route-city-card route-city-card-missing" data-route-destination="${escapeHtml(destinationId)}" data-route-destination-media="loading"><span></span><strong>${escapeHtml(destination.name)}</strong><em>${escapeHtml(destinationLabel || "正在加载图片")}</em></article>`;
  }
  return `<article class="route-city-card" data-route-destination="${escapeHtml(destinationId)}" data-route-destination-media="ready"><img src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(destination.name)}目的地图" loading="lazy" decoding="async"><span></span><strong>${escapeHtml(destination.name)}</strong><em>${escapeHtml(destinationLabel)}</em></article>`;
}

function updateDestinationCard(destination, asset, status = "ready") {
  const grid = document.querySelector("[data-route-destination-grid]");
  const key = escapeSelectorValue(destination.wikidataId || destination.name);
  const card = grid?.querySelector(`[data-route-destination="${key}"]`);
  if (!card) return;
  const countryName = (activeRouteRecord?.countryEntities || []).find((item) => item.countryCode === destination.countryCode)?.name || "";
  const citywalkLabel = activeRouteRecord?.routeReferenceMode === "citywalk"
    ? destination.entityTypeName === "poi" ? "景点" : "城市中心"
    : "";
  const destinationLabel = [countryName, citywalkLabel].filter(Boolean).join(" · ");
  if (status === "ready" && asset?.imageUrl) {
    card.classList.remove("route-city-card-missing");
    card.dataset.routeDestinationMedia = "ready";
    card.innerHTML = `<img src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(destination.name)}目的地图" loading="lazy" decoding="async"><span></span><strong>${escapeHtml(destination.name)}</strong><em>${escapeHtml(destinationLabel)}</em>`;
    return;
  }
  card.classList.add("route-city-card-missing");
  card.dataset.routeDestinationMedia = "missing";
  card.innerHTML = `<span></span><strong>${escapeHtml(destination.name)}</strong><em>图片暂不可用</em>`;
}

async function hydrateDestinationImages(record, destinations, initialAssets) {
  if (!runtimeImageSearchEnabled) return;
  const token = ++destinationHydrationToken;
  const usedImageUrls = new Set(
    [
      record.coverAsset?.imageUrl,
      record.coverImage,
      record.coverUrl,
      ...initialAssets.values().map((asset) => asset?.imageUrl),
    ]
      .map((url) => String(url || "").trim())
      .filter(Boolean),
  );
  const pendingDestinations = destinations.filter((destination) => {
    const existing = initialAssets.get(destination.wikidataId) || initialAssets.get(destination.name);
    return !existing?.imageUrl;
  });
  let nextIndex = 0;

  async function hydrateOneDestination(destination) {
    if (token !== destinationHydrationToken) return;
    try {
      const image = await fetchDestinationImage(record, destination, [...usedImageUrls]);
      if (image?.imageUrl) {
        usedImageUrls.add(image.imageUrl);
        updateDestinationCard(destination, image, "ready");
      } else {
        updateDestinationCard(destination, null, "missing");
      }
    } catch {
      updateDestinationCard(destination, null, "missing");
    }
  }

  async function worker() {
    while (token === destinationHydrationToken && nextIndex < pendingDestinations.length) {
      const destination = pendingDestinations[nextIndex];
      nextIndex += 1;
      await hydrateOneDestination(destination);
    }
  }

  const concurrency = Math.min(3, pendingDestinations.length);
  await Promise.all(Array.from({ length: concurrency }, worker));
}

function renderDestinations(record, diagnostics = {}) {
  const grid = document.querySelector("[data-route-destination-grid]");
  if (!grid) return;
  const assets = destinationAssetMap(record);
  const missing = [];
  const destinations = uniqueDestinations(record);
  const cards = destinations.map((destination) => {
    const asset = runtimeImageSearchEnabled
      ? (assets.get(destination.wikidataId) || assets.get(destination.name))
      : routeImageAssets?.resolveLocalDestinationCover?.(destination, record);
    if (!asset?.imageUrl) {
      missing.push(destination.name);
      return destinationCardMarkup(record, destination, null);
    }
    return destinationCardMarkup(record, destination, asset);
  });
  grid.innerHTML = cards.join("");
  grid.dataset.missingDestinations = [...new Set([...(diagnostics.missingDestinations || []), ...missing])].join("|");
  hydrateDestinationImages(record, destinations, assets);
}

function routeDetailRecommendationText(record = {}) {
  const current = String(record.recommendationText || record.summary || "").trim();
  if (!/(?:在给定天数内保留\d+个目的地|日均一个主要体验|停留点多，先锁定重点|适合短假|偏紧，只保留关键体验|预留休息与改线时间)/u.test(current)) {
    return current;
  }
  const countryCodes = new Set([
    ...(record.countries || []),
    ...(record.countryEntities || []).map((country) => country.countryCode),
  ].map((code) => String(code || "").trim().toUpperCase()).filter(Boolean));
  const hasCountry = (...codes) => codes.some((code) => countryCodes.has(code));
  const onlyCountries = (...codes) => (
    countryCodes.size > 0
    && [...countryCodes].every((code) => codes.includes(code))
  );
  const narrative = [
    record.name,
    record.canonicalTitle,
    record.travelStyle,
    ...(record.themes || []),
    ...(record.tags || []),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  if (hasCountry("KZ", "KG", "UZ", "TJ", "TM")) {
    return "穿行丝路绿洲与旷野，让砖石穹顶和市集烟火交替展开。";
  }
  if (countryCodes.size >= 2 && onlyCountries("AT", "CZ", "HU", "SK")) {
    return "沿多瑙河与帝国旧都的脉络前行，让宫殿、咖啡馆和老城夜色层层展开。";
  }
  if (countryCodes.size === 1 && hasCountry("JP")) {
    return "在古都寺院、街巷日常与山海风景之间，读一段层次分明的日本。";
  }
  if (countryCodes.size === 1 && hasCountry("IT")) {
    return "让教堂穹顶、文艺复兴街巷与餐桌烟火沿途相接。";
  }
  if (countryCodes.size === 1 && hasCountry("FR")) {
    return "循着河岸、旧城与葡萄酒乡的光影，慢慢展开法兰西的不同侧面。";
  }
  if (onlyCountries("DK", "FI", "IS", "NO", "SE")) {
    return "在港湾、森林与北地长光之间，感受城市秩序和旷野气息的交替。";
  }
  const style = String(record.travelStyleConceptKey || record.travelStyle || record.concept?.travelStyle || "")
    .trim()
    .toLocaleLowerCase("en-US");
  if (style === "classic-first-trip") {
    return "从最具辨识度的老城与地标入手，先读懂一地的性格。";
  }
  if (style === "deep-dive") {
    return "把脚步放慢，在支线街区与地方日常里读出更深一层。";
  }
  if (style === "country-hopper") {
    return "在相邻国度的广场、街巷与餐桌之间，看见边界两侧的气质流转。";
  }
  if (style === "transport-journey") {
    return "循着城际脉络换景，让站城、原野与地方日常自然衔接。";
  }
  if (style === "seasonal") {
    return "顺应当季光线与风物，在天气变化里为旅途留出从容。";
  }
  if (style === "theme") {
    return "循着一条鲜明线索，在建筑、风物与地方故事间逐层展开。";
  }
  if (style === "city-break") {
    return "从晨间街市走到黄昏屋顶，在短暂停留里触到城市的脉搏。";
  }
  if (style === "pilgrimage") {
    return "沿古道与信仰遗迹缓步前行，让沿途村镇成为旅程的一部分。";
  }
  if (style === "island-hopping") {
    return "在海湾、港埠与离岛之间换景，把潮汐留进旅行节奏。";
  }
  if (/自驾|公路|coast|highway|\broad\b|\bdrive\b/iu.test(narrative)) {
    return "让公路、地貌和小镇日常在车窗外自然递进。";
  }
  if (/铁路|火车|列车|\brail(?:way)?\b|\btrain\b/iu.test(narrative)) {
    return "循着铁路线换景，在站城之间收拢沿途风土。";
  }
  if (countryCodes.size >= 2) {
    return "让几座城市的街景、历史与餐桌气息在移动中自然递进。";
  }
  return "从街巷、建筑到地方日常，慢慢读懂这片土地的层次。";
}

function renderRoute(record, diagnostics = {}) {
  activeRouteRecord = record;
  const reviewOnly = routeSearchStatus === "needs-review"
    || record.searchStatus === "needs-review"
    || (record.v2PublicationStatus && record.v2PublicationStatus !== "ready-for-display");
  document.title = `${record.name} · 路线详情`;
  document.querySelector(".route-detail-screen")?.setAttribute("aria-label", `${record.name}路线详情`);
  const cover = document.querySelector("[data-route-cover]");
  if (cover) {
    const localCover = routeImageAssets?.resolveLocalRouteCover?.(record)?.url || FALLBACK_ROUTE_COVER;
    cover.src = runtimeImageSearchEnabled
      ? (record.coverAsset?.imageUrl || record.coverImage || localCover)
      : localCover;
    cover.alt = `${record.name}路线封面图`;
  }
  setText("[data-route-name]", record.name);
  setText("[data-route-places]", (record.destinations || record.cities || []).join(" · "));
  setText("[data-route-summary]", routeDetailRecommendationText(record));
  setText("[data-route-highlight-text]", (record.highlights || []).join(" · "));
  const reviewNotice = document.querySelector("[data-route-review-notice]");
  if (reviewNotice) {
    reviewNotice.hidden = !reviewOnly;
    reviewNotice.textContent = reviewOnly ? "这条路线仍在证据审核中，交通与季节建议仅供预览。" : "";
  }
  setText("[data-route-recommended-days]", record.recommendedDays || (record.durationDays ? `${record.durationDays}天` : ""));
  setText("[data-route-season-label]", reviewOnly ? "季节信息" : "最佳季节");
  setText("[data-route-best-months]", reviewOnly
    ? "季节建议待验证"
    : record.routeReferenceMode === "citywalk"
      ? "待确认"
      : (record.bestMonths || []).join(" / "));
  renderSource(record.routeReferenceMode === "citywalk"
    ? { name: "Route V2 城市漫游", url: "" }
    : record.source);
  renderDestinations(record, diagnostics);
  renderRouteActions();
  showState("ready");
}

function renderRouteActions() {
  const favorite = window.TravelState?.isRouteFavorite?.(readRouteState(), routeId) || false;
  const button = document.querySelector("[data-route-favorite]");
  button?.classList.toggle("favorited", favorite);
  button?.setAttribute("aria-pressed", String(favorite));
  button?.setAttribute("aria-label", favorite ? "取消收藏路线" : "收藏路线");
}

function renderFavoriteSnapshot() {
  const snapshot = window.TravelState?.getFavoriteRouteSnapshot?.(readRouteState(), routeId);
  if (!snapshot) return false;
  try {
    renderRoute(snapshot);
    return true;
  } catch (error) {
    console.error("Favorite snapshot invalid", error);
    return false;
  }
}

async function loadRouteDetail() {
  if (!routeId) return showState("not-found");
  const load = detailLoadController.begin();
  destinationHydrationToken += 1;
  showState("loading");
  try {
    const mode = routeDetailSource === "search" && routeSearchStatus !== "accepted" ? "search-detail" : "detail";
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        routeId,
        source: routeDetailSource,
        searchSessionId: routeSearchSessionId,
        queryId: routeSearchQueryId,
      }),
      signal: load.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!load.isCurrent()) return;
    if (!response.ok || !payload.ok || payload.record?.id !== routeId) {
      throw new Error(payload.error?.message || `Route detail failed (${response.status})`);
    }
    const mediaState = updateRouteState((state) => window.TravelState.cacheRouteMedia(state, payload.record));
    const stableRecord = window.TravelState.applyCachedRouteMedia?.(mediaState, payload.record) || payload.record;
    renderRoute(stableRecord, payload.diagnostics || {});
    try {
      if (window.TravelState?.isRouteFavorite?.(mediaState, routeId)) {
        updateRouteState((state) => window.TravelState.hydrateRouteFavorite(state, stableRecord));
      }
    } catch {
      // Persisted UI state is optional and must never replace a successfully rendered detail.
    }
    load.settle();
  } catch (error) {
    if (!load.isCurrent() || load.abortReason() === "superseded") return;
    console.error("Route detail load failed", error);
    if (!renderFavoriteSnapshot()) showState(error.message.includes("not found") ? "not-found" : "error");
    load.settle();
  }
}

document.querySelector("[data-route-detail-retry]")?.addEventListener("click", loadRouteDetail);
document.querySelector("[data-route-cover]")?.addEventListener("error", () => {
  const image = document.querySelector("[data-route-cover]");
  if (image && !image.src.endsWith(FALLBACK_ROUTE_COVER)) {
    image.src = FALLBACK_ROUTE_COVER;
    return;
  }
});

document.querySelector("[data-route-destination-grid]")?.addEventListener("error", async (event) => {
  const image = event.target instanceof HTMLImageElement ? event.target : null;
  if (!image) return;
  const card = image.closest("[data-route-destination]");
  if (!runtimeImageSearchEnabled) {
    if (image.dataset.routeFallbackApplied === "true") return;
    image.dataset.routeFallbackApplied = "true";
    image.src = routeImageAssets?.DEFAULT_CITY_PLACEHOLDER || FALLBACK_ROUTE_COVER;
    card?.setAttribute("data-route-destination-media", "fallback");
    return;
  }
  console.warn("Destination asset failed; searching replacement", image.alt, image.src);
  const destination = findDestinationForCard(card);
  const attempts = Number(card?.dataset.routeDestinationRepairAttempts || 0);
  image.remove();
  card?.classList.add("route-city-card-missing");
  if (!card || !destination || !activeRouteRecord || attempts >= 1) {
    card?.setAttribute("data-route-destination-media", "missing");
    return;
  }
  card.dataset.routeDestinationRepairAttempts = String(attempts + 1);
  card.setAttribute("data-route-destination-media", "loading");
  const failedUrl = image.src;
  card.innerHTML = `<span></span><strong>${escapeHtml(destination.name)}</strong><em>正在重新加载图片</em>`;
  try {
    const replacement = await fetchDestinationImage(activeRouteRecord, destination, currentDetailImageUrls([failedUrl]));
    updateDestinationCard(destination, replacement, replacement?.imageUrl ? "ready" : "missing");
  } catch {
    updateDestinationCard(destination, null, "missing");
  }
}, true);
document.querySelector("[data-route-favorite]")?.addEventListener("click", () => {
  if (!activeRouteRecord) return;
  const state = readRouteState();
  updateRouteState((current) => window.TravelState.setRouteFavorite(current, activeRouteRecord, !window.TravelState.isRouteFavorite(state, routeId)));
  renderRouteActions();
});
document.querySelector("[data-route-add-trip]")?.addEventListener("click", () => {
  if (!activeRouteRecord) return;
  updateRouteState((state) => window.TravelState.createTripFromRoute(state, activeRouteRecord));
  window.location.href = "trips.html";
});

loadRouteDetail();
