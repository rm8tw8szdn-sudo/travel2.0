const cityId = decodeURIComponent(window.location.hash.replace(/^#/, "")) || "NO-OSL";
const localOnlyMode = new URLSearchParams(window.location.search).get("localOnly") === "1";
const localOnlyPlaceholderCover = "assets/route-city-oslo.svg";
const localOnlyDiagnostics = localOnlyMode ? { requests: [], blockedRequests: [] } : null;
if (localOnlyDiagnostics) {
  window.CityDetailLocalOnlyDiagnostics = localOnlyDiagnostics;
  document.documentElement.dataset.cityDetailLocalOnly = "1";
  syncLocalOnlyDiagnostics();
}
const cityName = document.querySelector("[data-city-name]");
const cityCountry = document.querySelector("[data-city-country]");
const cityIntro = document.querySelector("[data-city-intro]");
const cityCover = document.querySelector("[data-city-cover]");
const cityTags = document.querySelector("[data-city-tags]");
const citySpots = document.querySelector("[data-city-spots]");
const favoriteButton = document.querySelector("[data-city-favorite]");
const markExploredButton = document.querySelector("[data-city-mark-explored]");
const addTripButton = document.querySelector("[data-city-add-trip]");
let activeCityDetail = null;
let activeKnowledgeCityId = "";

function syncLocalOnlyDiagnostics() {
  if (!localOnlyDiagnostics) return;
  document.documentElement.dataset.cityDetailLocalOnlyDiagnostics = JSON.stringify(localOnlyDiagnostics);
}

function localOnlyCover(cover) {
  if (!localOnlyMode || !/^https?:\/\//i.test(String(cover || ""))) return cover;
  return localOnlyPlaceholderCover;
}

async function localOnlyKnowledgeFetch(input, init) {
  const url = new URL(String(input), window.location.href);
  const allowed = url.origin === window.location.origin
    && url.pathname.startsWith("/api/knowledge-entities/");
  if (!allowed) {
    localOnlyDiagnostics.blockedRequests.push(url.href);
    syncLocalOnlyDiagnostics();
    throw new Error("localOnly blocked a non-Knowledge Entity Layer request");
  }
  const response = await window.fetch(url.href, init);
  localOnlyDiagnostics.requests.push({
    method: init?.method || "GET",
    url: `${url.pathname}${url.search}`,
    status: response.status,
  });
  syncLocalOnlyDiagnostics();
  return response;
}

function readState() {
  return window.TravelState?.readTravelState?.() || {};
}

function updateState(updater) {
  return window.TravelState?.updateTravelState?.(updater) || {};
}

function currentCity(state = readState()) {
  return state.citiesById?.[cityId] || state.citiesById?.["NO-OSL"];
}

function cityDetailData(city, state) {
  const base = window.DetailEnrichment?.baseCity?.(city, state) || {};
  return activeCityDetail?.id === city.id ? { ...base, ...activeCityDetail } : base;
}

function detailStatusNode() {
  let node = document.querySelector("[data-detail-enrichment-status]");
  if (node) return node;
  node = document.createElement("p");
  node.className = "detail-enrichment-status";
  node.setAttribute("data-detail-enrichment-status", "");
  document.querySelector(".route-detail-content")?.prepend(node);
  return node;
}

function setDetailStatus(message) {
  const node = detailStatusNode();
  node.textContent = message || "";
  node.hidden = !message;
}

function knowledgePoiSection() {
  let section = document.querySelector("[data-knowledge-poi-section]");
  if (section) return section;
  const legacySpotsSection = citySpots?.closest(".country-section");
  if (!legacySpotsSection) return null;
  section = document.createElement("section");
  section.className = "country-section";
  section.hidden = true;
  section.setAttribute("data-knowledge-poi-section", "");
  section.innerHTML = `
    <div class="country-section-head"><h2>附近景点</h2></div>
    <p class="detail-enrichment-status" data-knowledge-poi-status hidden></p>
    <div class="city-spot-list" data-knowledge-poi-list></div>
  `;
  legacySpotsSection.insertAdjacentElement("afterend", section);
  return section;
}

function renderKnowledgePois(result) {
  const section = knowledgePoiSection();
  if (!section) return;
  const status = section.querySelector("[data-knowledge-poi-status]");
  const list = section.querySelector("[data-knowledge-poi-list]");
  list.replaceChildren();
  section.removeAttribute("data-knowledge-city-id");

  if (result.status === "unmatched") {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  if (result.status !== "ready") {
    status.textContent = result.status === "loading" ? "正在加载附近景点…" : "附近景点暂时不可用，其他城市信息不受影响。";
    status.hidden = false;
    return;
  }

  status.hidden = true;
  section.setAttribute("data-knowledge-city-id", result.city.entityId);
  for (const poi of result.pois) {
    const item = document.createElement("span");
    const preferredName = poi.canonicalNameZh || poi.canonicalNameEn || "景点";
    const englishName = poi.canonicalNameEn && poi.canonicalNameEn !== preferredName ? poi.canonicalNameEn : "";
    item.textContent = [preferredName, englishName, "景点"].filter(Boolean).join(" · ");
    item.setAttribute("data-knowledge-poi", poi.entityId);
    item.setAttribute("data-knowledge-poi-qid", poi.wikidataId);
    list.append(item);
  }
}

async function loadKnowledgePoisForCurrentCity() {
  const state = readState();
  const city = currentCity(state);
  const country = state.countriesById?.[city?.countryId];
  if (!city || !country || !window.KnowledgeCityDetail?.loadKnowledgeCityPois) {
    renderKnowledgePois({ status: "unmatched", pois: [] });
    return;
  }

  activeKnowledgeCityId = city.id;
  renderKnowledgePois({ status: "loading", pois: [] });
  const result = await window.KnowledgeCityDetail.loadKnowledgeCityPois({
    legacyCity: city,
    legacyCountry: country,
    ...(localOnlyMode ? { fetchImpl: localOnlyKnowledgeFetch } : {}),
  });
  if (activeKnowledgeCityId !== city.id) return;
  renderKnowledgePois(result);
}

function renderCity() {
  const state = readState();
  const city = currentCity(state);
  const country = state.countriesById?.[city.countryId] || {};
  const detail = cityDetailData(city, state);
  if (cityName) cityName.textContent = city.name;
  if (cityCountry) cityCountry.textContent = country.name || "";
  if (cityIntro) cityIntro.textContent = detail.description || city.intro || "";
  if (cityCover) {
    cityCover.src = localOnlyCover(detail.coverImage || city.cover || country.cover || "assets/route-city-oslo.svg");
    cityCover.alt = `${city.name}封面图`;
  }
  if (cityTags) {
    cityTags.innerHTML = (detail.tags || city.tags || []).map((tag) => `<span>${tag}</span>`).join("");
  }
  if (citySpots) {
    citySpots.innerHTML = (detail.representativeSpots || city.spots || []).slice(0, 5).map((spot) => `<span>${spot}</span>`).join("");
  }
  favoriteButton?.classList.toggle("favorited", city.isFavorite);
  if (markExploredButton) markExploredButton.textContent = city.explorationStatus === "explored" ? "已探索" : "标记已探索";
}

favoriteButton?.addEventListener("click", () => {
  updateState((state) => {
    const favorites = new Set(state.favoriteCityIds || []);
    if (favorites.has(cityId)) favorites.delete(cityId);
    else favorites.add(cityId);
    state.favoriteCityIds = [...favorites];
    return state;
  });
  renderCity();
});

markExploredButton?.addEventListener("click", () => {
  updateState((state) => {
    const city = currentCity(state);
    const records = (state.manualVisitRecords || []).filter((record) => record.cityId !== cityId);
    records.push({
      id: `manual-visit-${cityId}`,
      countryId: city.countryId,
      cityId,
      date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
      note: "",
    });
    state.manualVisitRecords = records;
    return state;
  });
  renderCity();
});

addTripButton?.addEventListener("click", () => {
  const state = readState();
  const city = currentCity(state);
  window.openAddToTripModal?.({
    type: "city",
    id: city.id,
    name: city.name,
    countryIds: [city.countryId],
    cityIds: [city.id],
  });
});

document.querySelectorAll("[data-city-share]").forEach((button) => {
  button.addEventListener("click", () => {
    const state = readState();
    const city = currentCity(state);
    const country = state.countriesById?.[city.countryId] || {};
    window.openShareCard?.("city", {
      name: city.name,
      cover: city.cover || country.cover,
      description: city.intro,
      meta: `${country.name || ""} · 城市`,
    });
  });
});

async function initCityDetail() {
  renderCity();
  void loadKnowledgePoisForCurrentCity();
  if (localOnlyMode) return;
  const state = readState();
  const city = currentCity(state);
  if (!city || !window.DetailEnrichment?.ensureDetailData) return;
  const base = window.DetailEnrichment.baseCity(city, state);
  if (window.DetailEnrichment.completionScore("city", base) >= 90) return;
  setDetailStatus("正在补全旅行灵感…");
  const result = await window.DetailEnrichment.ensureDetailData("city", city.id, base, state);
  if (result.status === "failed") {
    setDetailStatus("暂时无法补全更多信息。");
    return;
  }
  activeCityDetail = result.data;
  setDetailStatus("");
  renderCity();
}

initCityDetail();
