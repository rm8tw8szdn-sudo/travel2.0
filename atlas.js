const searchInput = document.querySelector("[data-atlas-search]");
const resultsContainer = document.querySelector("[data-atlas-results]");
const pagerContainer = document.querySelector("[data-atlas-pager]");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const regionButtons = [...document.querySelectorAll("[data-region]")];
const atlasSectionTitle = document.querySelector(".atlas-section-head h2");
const showAllLink = document.querySelector("[data-atlas-show-all]");
const atlasRegionsSection = document.querySelector(".atlas-regions");

let activeFilter = "全部";
let activeBrowse = { mode: "popular", region: "" };
let atlasPage = 1;

const popularCountryIds = ["JP", "IT", "IS", "TR", "TH", "FR"];
const allCountryPriorityIds = [
  "JP", "TR", "TH", "IT", "FR", "IS", "KR", "SG", "MY", "AE", "EG", "NO",
  "GR", "VN", "KH", "UZ", "KZ", "KG", "KE", "TZ", "SE", "FI", "ES", "PT",
  "GB", "DE", "CH", "AT", "DK", "HR", "BA", "RS", "ME", "MA", "ZA", "US",
  "CA", "MX", "BR", "AR", "PE", "AU", "NZ",
];
const allCountryPageSize = 12;
const regionGroups = {
  亚洲: ["东亚", "东南亚", "西亚", "中亚", "南亚"],
  欧洲: ["西欧", "南欧", "北欧", "中欧", "东欧"],
  北美洲: ["北美洲"],
  南美洲: ["南美洲"],
  非洲: ["北非", "东非", "南非", "西非", "中非"],
  大洋洲: ["大洋洲"],
};

const statusLabels = {
  explored: "已探索",
  planned: "待出行",
  unexplored: "未探索",
};

function stateFilterValue(value) {
  return {
    全部: "all",
    已探索: "explored",
    待出行: "planned",
    未探索: "unexplored",
    收藏: "favorite",
  }[value] || value;
}

function buildAtlasItems(state = window.TravelState?.readTravelState?.()) {
  if (!state) return [];
  const countries = (state.countries || []).map((country) => ({
    id: country.id,
    type: "country",
    typeLabel: "国家",
    name: country.name,
    continent: country.continent || "",
    cover: country.cover,
    status: country.explorationStatus,
    isFavorite: country.isFavorite,
    searchText: `${country.name} ${country.englishName || ""} ${country.continent || ""} ${country.searchText || ""}`,
    href: country.id === "JP" ? "country-japan.html" : `country-japan.html#${country.id}`,
  }));
  const cities = (state.cities || []).map((city) => {
    const country = state.countriesById?.[city.countryId] || {};
    return {
      id: city.id,
      type: "city",
      typeLabel: "城市",
      name: city.name,
      parentName: country.name || "",
      cover: city.cover || country.cover,
      status: city.explorationStatus,
      isFavorite: city.isFavorite,
      searchText: `${city.name} ${country.name || ""} ${city.searchText || ""}`,
      href: `city-oslo.html#${city.id}`,
    };
  });
  return [...countries, ...cities];
}

function matchesAtlasKeyword(item, keyword) {
  if (!keyword) return item.type === "country";
  return item.searchText.includes(keyword);
}

function matchesAtlasRegion(item, region) {
  if (!region || item.type !== "country") return true;
  return (regionGroups[region] || [region]).includes(item.continent);
}

function matchesAtlasFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "favorite") return item.isFavorite;
  return item.status === filter;
}

function sortCountriesByPriority(items) {
  const order = new Map(allCountryPriorityIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aOrder = order.has(a.id) ? order.get(a.id) : 999;
    const bOrder = order.has(b.id) ? order.get(b.id) : 999;
    return aOrder - bOrder || a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function cardImageSrc(src) {
  if (!src || !/^https:\/\/images\.unsplash\.com\//.test(src)) return src;
  try {
    const url = new URL(src);
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "crop");
    url.searchParams.set("w", "560");
    url.searchParams.set("q", "62");
    return url.toString();
  } catch (error) {
    return src;
  }
}

function cardImageAttrs(index) {
  const isLeadImage = index < 2;
  return `loading="${isLeadImage ? "eager" : "lazy"}" decoding="async"${isLeadImage ? ' fetchpriority="high"' : ""}`;
}

function renderAtlasCard(item, index = 0) {
  const status = statusLabels[item.status] || "未探索";
  const statusClass = item.status === "explored" ? "explored" : item.status === "planned" ? "planned" : "";
  const subtitle = item.type === "city" ? `${item.parentName} · ${item.typeLabel}` : item.typeLabel;
  const cover = cardImageSrc(item.cover);
  return `
    <button class="atlas-country-card atlas-place-card" type="button" data-atlas-item="${item.id}" data-atlas-type="${item.type}" data-href="${item.href}">
      <img src="${cover}" alt="${item.name}封面图" ${cardImageAttrs(index)} />
      <span class="atlas-card-shade"></span>
      <span class="atlas-place-type">${subtitle}</span>
      <span class="atlas-country-name">${item.name}</span>
      <span class="atlas-status-chip ${statusClass}">${status}</span>
    </button>
  `;
}

function renderAtlasResults() {
  if (!resultsContainer) return;
  const keyword = (searchInput?.value || "").trim();
  const filter = stateFilterValue(activeFilter);
  let items = buildAtlasItems()
    .filter((item) => matchesAtlasKeyword(item, keyword))
    .filter((item) => matchesAtlasFilter(item, filter));
  if (!keyword) {
    items = items.filter((item) => item.type === "country");
    if (activeBrowse.mode === "popular") {
      items = popularCountryIds.map((id) => items.find((item) => item.id === id)).filter(Boolean).slice(0, 6);
    } else if (activeBrowse.mode === "region") {
      items = items.filter((item) => matchesAtlasRegion(item, activeBrowse.region));
    }
  }
  items = !keyword && items.every((item) => item.type === "country") ? sortCountriesByPriority(items) : items;
  const usesPagedCountryGrid = !keyword && (activeBrowse.mode === "all" || activeBrowse.mode === "region");
  const pageTotal = usesPagedCountryGrid ? Math.max(1, Math.ceil(items.length / allCountryPageSize)) : 1;
  if (atlasPage > pageTotal) atlasPage = pageTotal;
  if (usesPagedCountryGrid) {
    const start = (atlasPage - 1) * allCountryPageSize;
    items = items.slice(start, start + allCountryPageSize);
  }

  resultsContainer.innerHTML = items.length
    ? items.map(renderAtlasCard).join("")
    : `<p class="atlas-empty">没有找到匹配的国家或城市</p>`;
  if (pagerContainer) pagerContainer.innerHTML = renderAtlasPager(pageTotal, keyword);
  updateAtlasBrowseUi(keyword);
}

function renderAtlasPager(pageTotal, keyword) {
  if ((activeBrowse.mode !== "all" && activeBrowse.mode !== "region") || keyword || pageTotal <= 1) return "";
  return `
    <div class="atlas-pager" aria-label="${activeBrowse.mode === "region" ? `${activeBrowse.region}国家` : "全部国家"}分页">
      <button type="button" data-atlas-page="prev" ${atlasPage <= 1 ? "disabled" : ""}>上一页</button>
      <span>${atlasPage} / ${pageTotal}</span>
      <button type="button" data-atlas-page="next" ${atlasPage >= pageTotal ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function updateAtlasBrowseUi(keyword = "") {
  if (atlasSectionTitle) {
    atlasSectionTitle.textContent = keyword
      ? "搜索结果"
      : activeBrowse.mode === "all"
        ? "全部国家"
        : activeBrowse.mode === "region"
          ? `${activeBrowse.region}国家`
          : "热门国家";
  }
  if (showAllLink) {
    showAllLink.innerHTML = activeBrowse.mode === "popular" && !keyword
      ? '查看全部 <span aria-hidden="true">›</span>'
      : '返回热门 <span aria-hidden="true">›</span>';
  }
  regionButtons.forEach((button) => {
    button.classList.toggle("active", !keyword && activeBrowse.mode === "region" && button.dataset.region === activeBrowse.region);
  });
  if (atlasRegionsSection) atlasRegionsSection.hidden = !keyword && (activeBrowse.mode === "all" || activeBrowse.mode === "region");
}

function updateCountryCards() {
  renderAtlasResults();
}

searchInput?.addEventListener("input", updateCountryCards);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "全部";
    atlasPage = 1;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    updateCountryCards();
  });
});

showAllLink?.addEventListener("click", (event) => {
  event.preventDefault();
  activeBrowse = activeBrowse.mode === "popular" ? { mode: "all", region: "" } : { mode: "popular", region: "" };
  atlasPage = 1;
  if (searchInput) searchInput.value = "";
  window.location.hash = activeBrowse.mode === "all" ? "all" : "";
  updateCountryCards();
});

function handleAtlasContentClick(event) {
  const pageButton = event.target.closest("[data-atlas-page]");
  if (pageButton) {
    atlasPage += pageButton.dataset.atlasPage === "next" ? 1 : -1;
    updateCountryCards();
    resultsContainer.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  const card = event.target.closest("[data-atlas-item]");
  if (card?.dataset.href) window.location.href = card.dataset.href;
}

resultsContainer?.addEventListener("click", handleAtlasContentClick);
pagerContainer?.addEventListener("click", handleAtlasContentClick);

regionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeBrowse = { mode: "region", region: button.dataset.region || "" };
    atlasPage = 1;
    if (searchInput) searchInput.value = "";
    window.location.hash = `region=${encodeURIComponent(activeBrowse.region)}`;
    updateCountryCards();
    resultsContainer?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
});

function applyAtlasHash() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (hash === "all") {
    activeBrowse = { mode: "all", region: "" };
    atlasPage = 1;
    return;
  }
  const region = hash.startsWith("region=") ? hash.slice(7) : "";
  if (region) {
    activeBrowse = { mode: "region", region };
    atlasPage = 1;
  }
}

window.addEventListener("hashchange", () => {
  applyAtlasHash();
  updateCountryCards();
});

applyAtlasHash();
renderAtlasResults();
