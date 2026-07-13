const favoriteTabs = [...document.querySelectorAll("[data-favorite-tab]")];
const favoriteSearch = document.querySelector("[data-favorite-search]");
const favoriteGrid = document.querySelector("[data-favorite-grid]");
const favoriteCount = document.querySelector("[data-favorite-count]");
const favoritesBack = document.querySelector("[data-favorites-back]");
const ROUTE_API = "/api/routes/discovery";

const tabLabels = {
  countries: { placeholder: "搜索国家" },
  cities: { placeholder: "搜索城市或所属国家" },
  routes: { placeholder: "搜索收藏路线" },
};

let activeFavoriteTab = "countries";
let routeFavoriteRecords = [];
let routeLoadToken = 0;

favoritesBack?.addEventListener("click", () => {
  window.location.href = "profile.html";
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readTravelState() {
  return window.TravelState?.readTravelState?.() || {};
}

function itemHref(item, type) {
  if (type === "routes") return `route-detail.html?id=${encodeURIComponent(item.id)}`;
  if (type === "cities") return `city-oslo.html#${encodeURIComponent(item.id)}`;
  return item.id === "JP" ? "country-japan.html" : `country-japan.html#${encodeURIComponent(item.id)}`;
}

function statusText(item) {
  if (item.explorationStatus === "explored") return "已探索";
  if (item.explorationStatus === "planned") return "待出行";
  return "未探索";
}

function pendingRoute(routeId) {
  return {
    id: routeId,
    name: "收藏路线待联网补全",
    summary: "保留原 routeId，联网成功后自动补全快照。",
    countries: [],
    destinations: [],
    tags: [],
    migrationStatus: "pending",
  };
}

function itemsForTab(state) {
  if (activeFavoriteTab === "routes") {
    const recordsById = Object.fromEntries(routeFavoriteRecords.map((item) => [item.id, item]));
    return (state.favoriteRouteEntries || []).map((entry) => window.TravelState?.getFavoriteRouteSnapshot?.(state, entry.routeId) || recordsById[entry.routeId] || pendingRoute(entry.routeId));
  }
  return window.TravelState?.getFavoriteItems?.(state, activeFavoriteTab) || [];
}

function currentItems() {
  const state = readTravelState();
  const keyword = (favoriteSearch?.value || "").trim().toLowerCase();
  return itemsForTab(state).filter((item) => {
    const country = state.countriesById?.[item.countryId]?.name || "";
    const text = [
      item.name,
      item.id,
      item.searchText,
      item.summary,
      item.recommendedDays,
      country,
      ...(item.countries || []),
      ...(item.destinations || []),
      ...(item.tags || []),
    ].join(" ").toLowerCase();
    return !keyword || text.includes(keyword);
  });
}

function renderFavoriteCountryCard(item) {
  return `
    <article class="favorite-card" tabindex="0" role="button" data-favorite-card data-favorite-id="${escapeHtml(item.id)}" data-favorite-href="${escapeHtml(itemHref(item, "countries"))}">
      <span class="favorite-cover">
        <img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.name)}封面图" />
        <span class="favorite-cover-shade"></span>
        <button class="favorite-heart" type="button" aria-label="取消收藏 ${escapeHtml(item.name)}" data-remove-favorite>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.2S5.2 15.1 5.2 9.9A3.7 3.7 0 0 1 12 7.8a3.7 3.7 0 0 1 6.8 2.1c0 5.2-6.8 9.3-6.8 9.3Z"></path></svg>
        </button>
      </span>
      <span class="favorite-copy"><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(item.id)}</em><small>${escapeHtml(statusText(item))}</small></span>
    </article>
  `;
}

function renderFavoriteCityCard(item) {
  const state = readTravelState();
  const countryName = state.countriesById?.[item.countryId]?.name || item.countryId || "";
  return `
    <article class="favorite-city-card" tabindex="0" role="button" data-favorite-card data-favorite-id="${escapeHtml(item.id)}" data-favorite-href="${escapeHtml(itemHref(item, "cities"))}">
      <img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.name)}封面图" />
      <span class="favorite-city-copy"><strong>${escapeHtml(item.name)}</strong><em>${escapeHtml(countryName)}</em><small>${escapeHtml(statusText(item))} · ${escapeHtml(countryName)}</small></span>
      <button class="favorite-city-heart" type="button" aria-label="取消收藏 ${escapeHtml(item.name)}" data-remove-favorite>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.2S5.2 15.1 5.2 9.9A3.7 3.7 0 0 1 12 7.8a3.7 3.7 0 0 1 6.8 2.1c0 5.2-6.8 9.3-6.8 9.3Z"></path></svg>
      </button>
    </article>
  `;
}

function renderRouteCard(item) {
  const places = (item.destinations || []).length ? item.destinations : item.countries;
  const pending = item.migrationStatus === "pending";
  return `
    <article class="favorite-route-card ${pending ? "is-pending" : ""}" tabindex="0" role="button" data-favorite-card data-favorite-id="${escapeHtml(item.id)}" data-favorite-route-id="${escapeHtml(item.id)}" data-favorite-href="${pending ? "" : escapeHtml(itemHref(item, activeFavoriteTab))}">
      ${pending ? "" : `<img src="${escapeHtml(item.coverAsset?.imageUrl || "")}" alt="${escapeHtml(item.name)}封面图" />`}
      <span class="favorite-route-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <em>${escapeHtml((places || []).join(" · ") || item.summary || "")}</em>
        <span class="favorite-route-meta"><small>${escapeHtml(item.recommendedDays || "待联网补全")}</small><small>已收藏</small></span>
      </span>
      <button class="favorite-route-heart" type="button" aria-label="取消收藏 ${escapeHtml(item.name)}" data-remove-favorite><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.2S5.2 15.1 5.2 9.9A3.7 3.7 0 0 1 12 7.8a3.7 3.7 0 0 1 6.8 2.1c0 5.2-6.8 9.3-6.8 9.3Z"></path></svg></button>
    </article>
  `;
}

function renderFavoriteCard(item) {
  if (activeFavoriteTab === "routes") return renderRouteCard(item);
  if (activeFavoriteTab === "cities") return renderFavoriteCityCard(item);
  return renderFavoriteCountryCard(item);
}

function renderFavorites() {
  const items = currentItems();
  if (favoriteCount) favoriteCount.textContent = `全部 ${items.length}`;
  if (!favoriteGrid) return;
  favoriteGrid.classList.toggle("city-list", activeFavoriteTab === "cities");
  favoriteGrid.classList.toggle("route-list", activeFavoriteTab === "routes");
  favoriteGrid.innerHTML = items.length
    ? items.map(renderFavoriteCard).join("")
    : `<article class="trip-empty-state">没有匹配的收藏。</article>`;
}

async function loadFavoriteRoutes() {
  if (activeFavoriteTab !== "routes") return;
  const state = readTravelState();
  const routeIds = (state.favoriteRouteEntries || []).filter((item) => !item.routeSnapshot).map((item) => item.routeId);
  const token = ++routeLoadToken;
  const records = await Promise.all(routeIds.map(async (routeId) => {
    try {
      const response = await fetch(ROUTE_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "detail", routeId }),
      });
      const payload = await response.json();
      if (response.ok && payload.record?.id === routeId) {
        window.TravelState?.updateTravelState?.((current) => window.TravelState.hydrateRouteFavorite(current, payload.record));
        return payload.record;
      }
      return pendingRoute(routeId);
    } catch {
      return pendingRoute(routeId);
    }
  }));
  if (token !== routeLoadToken || activeFavoriteTab !== "routes") return;
  routeFavoriteRecords = records;
  renderFavorites();
}

favoriteTabs.forEach((button) => {
  button.addEventListener("click", () => {
    activeFavoriteTab = button.dataset.favoriteTab || "countries";
    favoriteTabs.forEach((item) => item.classList.toggle("active", item === button));
    if (favoriteSearch) {
      favoriteSearch.value = "";
      favoriteSearch.placeholder = tabLabels[activeFavoriteTab].placeholder;
    }
    renderFavorites();
    loadFavoriteRoutes();
  });
});

favoriteSearch?.addEventListener("input", renderFavorites);

favoriteGrid?.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-favorite]");
  if (remove) {
    event.preventDefault();
    event.stopPropagation();
    const card = remove.closest("[data-favorite-card]");
    if (activeFavoriteTab === "routes") {
      window.TravelState?.updateTravelState?.((state) => window.TravelState.setRouteFavorite(state, card?.dataset.favoriteId, false));
      routeFavoriteRecords = routeFavoriteRecords.filter((item) => item.id !== card?.dataset.favoriteId);
    } else {
      const next = window.TravelState?.setFavorite?.(readTravelState(), activeFavoriteTab, card?.dataset.favoriteId, false);
      if (next) window.TravelState.writeTravelState(next);
    }
    renderFavorites();
    return;
  }
  const card = event.target.closest("[data-favorite-card]");
  if (card?.dataset.favoriteHref) window.location.href = card.dataset.favoriteHref;
});

favoriteGrid?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-favorite-card]");
  if (!card?.dataset.favoriteHref) return;
  event.preventDefault();
  window.location.href = card.dataset.favoriteHref;
});

renderFavorites();
