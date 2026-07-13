const API_ENDPOINT = "/api/routes/discovery";
const IMAGE_ENDPOINT = "/api/routes/image-search";
const detailParams = new URLSearchParams(window.location.search);
const routeId = detailParams.get("id")?.trim() || "";
const routeDetailSource = detailParams.get("source")?.trim() || "";
const routeSearchStatus = detailParams.get("status")?.trim() || "";
const routeSearchSessionId = detailParams.get("searchSessionId")?.trim() || "";
const routeSearchQueryId = detailParams.get("queryId")?.trim() || "";
const FALLBACK_ROUTE_COVER = "assets/trip-cover-placeholder.svg";

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
  return (record.destinationEntities || []).filter((destination) => {
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
  if (!asset?.imageUrl) {
    return `<article class="route-city-card route-city-card-missing" data-route-destination="${escapeHtml(destinationId)}" data-route-destination-media="loading"><span></span><strong>${escapeHtml(destination.name)}</strong><em>正在加载图片</em></article>`;
  }
  return `<article class="route-city-card" data-route-destination="${escapeHtml(destinationId)}" data-route-destination-media="ready"><img src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(destination.name)}目的地图" loading="lazy" decoding="async"><span></span><strong>${escapeHtml(destination.name)}</strong><em>${escapeHtml(countryName)}</em></article>`;
}

function updateDestinationCard(destination, asset, status = "ready") {
  const grid = document.querySelector("[data-route-destination-grid]");
  const key = escapeSelectorValue(destination.wikidataId || destination.name);
  const card = grid?.querySelector(`[data-route-destination="${key}"]`);
  if (!card) return;
  const countryName = (activeRouteRecord?.countryEntities || []).find((item) => item.countryCode === destination.countryCode)?.name || "";
  if (status === "ready" && asset?.imageUrl) {
    card.classList.remove("route-city-card-missing");
    card.dataset.routeDestinationMedia = "ready";
    card.innerHTML = `<img src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(destination.name)}目的地图" loading="lazy" decoding="async"><span></span><strong>${escapeHtml(destination.name)}</strong><em>${escapeHtml(countryName)}</em>`;
    return;
  }
  card.classList.add("route-city-card-missing");
  card.dataset.routeDestinationMedia = "missing";
  card.innerHTML = `<span></span><strong>${escapeHtml(destination.name)}</strong><em>图片暂不可用</em>`;
}

async function hydrateDestinationImages(record, destinations, initialAssets) {
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
    const asset = assets.get(destination.wikidataId) || assets.get(destination.name);
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

function renderRoute(record, diagnostics = {}) {
  if (!record.coverAsset?.imageUrl && !record.coverImage) throw new Error("路线封面缺失");
  activeRouteRecord = record;
  document.title = `${record.name} · 路线详情`;
  document.querySelector(".route-detail-screen")?.setAttribute("aria-label", `${record.name}路线详情`);
  const cover = document.querySelector("[data-route-cover]");
  if (cover) {
    cover.src = record.coverAsset?.imageUrl || record.coverImage;
    cover.alt = `${record.name}路线封面图`;
  }
  setText("[data-route-name]", record.name);
  setText("[data-route-places]", (record.destinations || record.cities || []).join(" · "));
  setText("[data-route-summary]", record.recommendationText || record.summary || "");
  setText("[data-route-highlight-text]", (record.highlights || []).join(" · "));
  setText("[data-route-recommended-days]", record.recommendedDays || (record.durationDays ? `${record.durationDays}天` : ""));
  setText("[data-route-best-months]", (record.bestMonths || []).join(" / "));
  renderSource(record.source);
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
      signal: AbortSignal.timeout(11_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || payload.record?.id !== routeId) {
      throw new Error(payload.error?.message || `Route detail failed (${response.status})`);
    }
    const mediaState = updateRouteState((state) => window.TravelState.cacheRouteMedia(state, payload.record));
    const stableRecord = window.TravelState.applyCachedRouteMedia?.(mediaState, payload.record) || payload.record;
    renderRoute(stableRecord, payload.diagnostics || {});
    if (window.TravelState?.isRouteFavorite?.(mediaState, routeId)) {
      updateRouteState((state) => window.TravelState.hydrateRouteFavorite(state, stableRecord));
    }
  } catch (error) {
    console.error("Route detail load failed", error);
    if (!renderFavoriteSnapshot()) showState(error.message.includes("not found") ? "not-found" : "error");
  }
}

document.querySelector("[data-route-detail-retry]")?.addEventListener("click", loadRouteDetail);
document.querySelector("[data-route-cover]")?.addEventListener("error", () => {
  const image = document.querySelector("[data-route-cover]");
  console.error("Route cover asset failed", routeId, image?.src);
  if (image && !image.src.endsWith(FALLBACK_ROUTE_COVER)) {
    image.src = FALLBACK_ROUTE_COVER;
    return;
  }
  showState("error");
});
document.querySelector("[data-route-destination-grid]")?.addEventListener("error", async (event) => {
  const image = event.target;
  const card = image.closest("[data-route-destination]");
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
