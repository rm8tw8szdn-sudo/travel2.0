const countryCode = normalizeCountryHash();
const exploreToggle = document.querySelector("[data-explore-toggle]");
const exploreToggleText = exploreToggle?.querySelector("span");
const exploreModal = document.querySelector("[data-explore-modal]");
const visitRecord = document.querySelector("[data-visit-record]");
const recordMenu = document.querySelector("[data-record-menu]");
const NEUTRAL_CITY_COVER = "assets/route-city-placeholder.svg";
let activeCountryDetail = null;

function normalizeCountryHash() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return (raw.replace(/^country-/, "") || document.querySelector("[data-explore-toggle]")?.dataset.countryCode || "JP").toUpperCase();
}

function readTravelState() {
  return window.TravelState?.readTravelState?.() || {};
}

function updateTravelState(updater) {
  return window.TravelState?.updateTravelState?.(updater) || {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function localImageAssetPath(value) {
  const candidate = String(value || "").trim().replaceAll("\\", "/");
  if (!candidate.startsWith("assets/") || candidate.includes("..") || /^(?:https?:)?\/\//iu.test(candidate)) return "";
  return candidate;
}

function cityCardCover(city) {
  const entityId = String(city?.entityId || city?.id || "").trim();
  const coverage = window.RouteV2ImageCoverage?.cityByEntityId?.[entityId];
  const verifiedAsset = coverage?.status === "imageReady"
    && coverage.assetKind === "verified-destination-image"
    && coverage.semanticScope === "exact-city"
    ? localImageAssetPath(coverage.assetPath)
    : "";
  return verifiedAsset || NEUTRAL_CITY_COVER;
}

function countryCityReferences(country, state, preferred = []) {
  const seen = new Set();
  const linkedCityIds = (state.cities || [])
    .filter((city) => city.countryId === country.id)
    .map((city) => city.id);
  return [...preferred, ...(country.cityIds || []), ...linkedCityIds].filter((id) => {
    const value = String(id || "").trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function statusLabel(status) {
  if (status === "explored") return "已去";
  if (status === "planned") return "待出行";
  return "未去";
}

function currentCountry(state = readTravelState()) {
  return state.countriesById?.[countryCode] || state.countriesById?.JP;
}

function budgetLabel(value) {
  if (value === "low") return "低";
  if (value === "high") return "中高";
  if (value === "medium") return "中等";
  return value || "中等";
}

function countryDetailData(country, state) {
  const base = window.DetailEnrichment?.baseCountry?.(country, state) || {};
  return activeCountryDetail?.id === country.id ? { ...base, ...activeCountryDetail } : base;
}

function detailStatusNode() {
  let node = document.querySelector("[data-detail-enrichment-status]");
  if (node) return node;
  node = document.createElement("p");
  node.className = "detail-enrichment-status";
  node.setAttribute("data-detail-enrichment-status", "");
  document.querySelector(".country-content")?.prepend(node);
  return node;
}

function setDetailStatus(message) {
  const node = detailStatusNode();
  node.textContent = message || "";
  node.hidden = !message;
}

function renderCountry() {
  const state = readTravelState();
  const country = currentCountry(state);
  if (!country) return;
  const detail = countryDetailData(country, state);
  document.title = `${country.name} · 国家详情`;
  document.querySelector(".country-screen")?.setAttribute("aria-label", `${country.name}国家详情`);
  document.querySelector(".country-hero")?.setAttribute("aria-label", country.name);
  const heroImage = document.querySelector(".country-hero-image");
  if (heroImage) {
    const coverage = window.RouteV2ImageCoverage?.countryByCode?.[String(country.id || countryCode).toUpperCase()];
    heroImage.src = coverage?.status === "imageReady" && coverage?.semanticScope === "exact-country"
      ? coverage.assetPath
      : "assets/trip-cover-placeholder.svg";
    heroImage.alt = `${country.name}封面图`;
  }
  document.querySelector(".country-hero-copy h1")?.replaceChildren(country.name);
  document.querySelector(".country-hero-copy p")?.replaceChildren(`${country.continent || "目的地"}  |  ${(detail.tags || country.tags || []).slice(0, 3).join(" · ")}`);
  document.querySelector(".country-intro")?.replaceChildren(detail.description || country.intro || country.description || "");
  document.querySelector("[data-country-tags]")?.replaceChildren(...(detail.tags || country.tags || []).slice(0, 5).map((tag) => {
    const node = document.createElement("span");
    node.textContent = tag;
    return node;
  }));
  const meta = document.querySelector("[data-country-trip-meta]");
  if (meta) {
    meta.innerHTML = `
      <span><em>推荐天数</em><strong>${escapeHtml(detail.recommendedDays || country.recommendedDays || "待补充")}</strong></span>
      <span><em>最佳季节</em><strong>${escapeHtml(detail.bestSeason || country.bestSeason || "按路线季节")}</strong></span>
      <span><em>预算</em><strong>${escapeHtml(budgetLabel(detail.budgetLevel || country.budgetLevel))}</strong></span>
    `;
  }
  document.querySelectorAll("[data-add-country-id]").forEach((button) => {
    button.dataset.addCountryId = country.id;
  });
  if (exploreToggle) exploreToggle.dataset.countryCode = country.id;
  renderExploredState(country.explorationStatus);
  renderFavoriteState(country.isFavorite);
  renderCities(country, state, detail);
  renderSpots(country, detail);
}

function renderCities(country, state, detail = {}) {
  const list = document.querySelector(".country-city-list");
  if (!list) return;
  const cityRefs = countryCityReferences(country, state, detail.recommendedCities || []);
  const cities = cityRefs
    .map((id) => state.citiesById?.[id] || { id: "", name: id, cover: NEUTRAL_CITY_COVER, explorationStatus: "unexplored", isNameOnly: true })
    .slice(0, 3);
  list.innerHTML = cities.map((city) => `
    <button class="country-mini-card" type="button" ${city.id ? `data-city-id="${escapeHtml(city.id)}"` : "disabled"}>
      <img src="${escapeHtml(cityCardCover(city))}" alt="${escapeHtml(city.name)}封面图" />
      <span></span>
      <strong>${escapeHtml(city.name)}</strong>
      <em>${escapeHtml(statusLabel(city.explorationStatus))}</em>
    </button>
  `).join("") || `<p class="atlas-empty">暂无推荐城市</p>`;
}

function countryRecommendedCities(country, state, limit = 12) {
  return countryCityReferences(country, state)
    .map((id) => state.citiesById?.[id])
    .filter(Boolean)
    .slice(0, limit);
}

function ensureCountryCityGalleryRoot() {
  let root = document.querySelector("[data-country-city-gallery-root]");
  if (root) return root;
  root = document.createElement("div");
  root.setAttribute("data-country-city-gallery-root", "");
  document.querySelector(".country-screen")?.append(root);
  return root;
}

function openCountryCityGallery() {
  const state = readTravelState();
  const country = currentCountry(state);
  if (!country) return;
  const root = ensureCountryCityGalleryRoot();
  const cities = countryRecommendedCities(country, state);
  root.innerHTML = `
    <section class="country-city-gallery" role="dialog" aria-modal="true" aria-label="${escapeHtml(country.name)}推荐城市">
      <header class="country-city-gallery-head">
        <button type="button" aria-label="返回国家详情" data-country-city-gallery-close>‹</button>
        <span>
          <strong>推荐城市</strong>
          <em>${escapeHtml(country.name)} · ${cities.length} 个城市</em>
        </span>
      </header>
      <div class="country-city-gallery-grid">
        ${cities.map((city) => `
          <button class="country-city-gallery-card" type="button" data-city-id="${escapeHtml(city.id)}">
            <img src="${escapeHtml(cityCardCover(city))}" alt="${escapeHtml(city.name)}封面图" />
            <span></span>
            <strong>${escapeHtml(city.name)}</strong>
            <em>${escapeHtml(city.englishName || statusLabel(city.explorationStatus))}</em>
          </button>
        `).join("") || `<p class="atlas-empty">暂无推荐城市</p>`}
      </div>
    </section>
  `;
  root.hidden = false;
}

function closeCountryCityGallery() {
  const root = document.querySelector("[data-country-city-gallery-root]");
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
  }
}

function renderSpots(country, detail = {}) {
  const spots = document.querySelector("[data-country-spots]");
  if (!spots) return;
  spots.innerHTML = (detail.representativeSpots || country.spots || []).slice(0, 5).map((spot) => `<span>${escapeHtml(spot)}</span>`).join("");
}

function setExplored(isExplored) {
  const nextState = updateTravelState((state) => {
    const records = (state.manualVisitRecords || []).filter((record) => record.countryId !== countryCode);
    if (isExplored) {
      records.push({
        id: `manual-visit-${countryCode}`,
        countryId: countryCode,
        cityId: "",
        date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
        note: "",
      });
    }
    state.manualVisitRecords = records;
    return state;
  });
  renderExploredState(nextState.countriesById?.[countryCode]?.explorationStatus || "unexplored");
}

function renderExploredState(status) {
  if (exploreToggleText) exploreToggleText.textContent = statusLabel(status);
  exploreToggle?.classList.toggle("visited", status === "explored");
  if (visitRecord) visitRecord.hidden = status !== "explored";
  if (recordMenu) recordMenu.hidden = true;
}

function renderFavoriteState(isFavorite) {
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    button.classList.toggle("favorited", Boolean(isFavorite));
    button.setAttribute("aria-pressed", String(Boolean(isFavorite)));
  });
}

document.querySelector("[data-back]")?.addEventListener("click", () => {
  window.location.href = "atlas.html";
});

exploreToggle?.addEventListener("click", () => {
  const state = readTravelState();
  const country = currentCountry(state);
  if (country?.explorationStatus !== "explored" && exploreModal) exploreModal.hidden = false;
});

document.querySelector("[data-save-explore]")?.addEventListener("click", () => {
  if (exploreModal) exploreModal.hidden = true;
  setExplored(true);
});

document.querySelector("[data-record-more]")?.addEventListener("click", () => {
  if (recordMenu) recordMenu.hidden = false;
});

document.querySelector("[data-mark-unvisited]")?.addEventListener("click", () => setExplored(false));
document.querySelector("[data-delete-record]")?.addEventListener("click", () => setExplored(false));
document.querySelector("[data-edit-record]")?.addEventListener("click", () => {
  if (recordMenu) recordMenu.hidden = true;
  if (exploreModal) exploreModal.hidden = false;
});

document.querySelectorAll("[data-favorite]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextState = updateTravelState((state) => {
      const favorites = new Set(state.favoriteCountryIds || []);
      if (favorites.has(countryCode)) favorites.delete(countryCode);
      else favorites.add(countryCode);
      state.favoriteCountryIds = [...favorites];
      return state;
    });
    renderFavoriteState(nextState.countriesById?.[countryCode]?.isFavorite);
  });
});

document.querySelector(".country-city-list")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-city-id]");
  if (card) window.location.href = `city-oslo.html#${encodeURIComponent(card.dataset.cityId)}`;
});

document.querySelector("[data-country-city-gallery]")?.addEventListener("click", (event) => {
  event.preventDefault();
  openCountryCityGallery();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-country-city-gallery-root]")) return;
  const close = event.target.closest("[data-country-city-gallery-close]");
  if (close) {
    closeCountryCityGallery();
    return;
  }
  const card = event.target.closest("[data-city-id]");
  if (card) window.location.href = `city-oslo.html#${encodeURIComponent(card.dataset.cityId)}`;
});

document.querySelector("[data-add-to-trip]")?.addEventListener("click", () => {
  const state = readTravelState();
  const country = currentCountry(state);
  if (!country) return;
  window.openAddToTripModal?.({
    type: "country",
    id: country.id,
    name: country.name,
    countryIds: [country.id],
    cityIds: [],
  });
});

document.querySelectorAll("[data-share]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const state = readTravelState();
    const country = currentCountry(state);
    window.openShareCard?.("country", {
      name: country.name,
      cover: country.cover,
      description: country.intro,
      meta: `${country.continent || "目的地"} · ${state.userProfile?.nickname || "旅行者"}`,
    });
  });
});

async function initCountryDetail() {
  renderCountry();
  const state = readTravelState();
  const country = currentCountry(state);
  if (!country || !window.DetailEnrichment?.ensureDetailData) return;
  const base = window.DetailEnrichment.baseCountry(country, state);
  if (window.DetailEnrichment.completionScore("country", base) >= 90) return;
  setDetailStatus("正在补全旅行灵感…");
  const result = await window.DetailEnrichment.ensureDetailData("country", country.id, base, state);
  if (result.status === "failed") {
    setDetailStatus("暂时无法补全更多信息。");
    return;
  }
  activeCountryDetail = result.data;
  setDetailStatus("");
  renderCountry();
}

initCountryDetail();
