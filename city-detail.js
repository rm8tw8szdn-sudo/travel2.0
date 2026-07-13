const cityId = decodeURIComponent(window.location.hash.replace(/^#/, "")) || "NO-OSL";
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

function renderCity() {
  const state = readState();
  const city = currentCity(state);
  const country = state.countriesById?.[city.countryId] || {};
  const detail = cityDetailData(city, state);
  if (cityName) cityName.textContent = city.name;
  if (cityCountry) cityCountry.textContent = country.name || "";
  if (cityIntro) cityIntro.textContent = detail.description || city.intro || "";
  if (cityCover) {
    cityCover.src = detail.coverImage || city.cover || country.cover || "assets/route-city-oslo.svg";
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
