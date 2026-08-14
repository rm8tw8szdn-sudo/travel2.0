const tripTabButtons = [...document.querySelectorAll("[data-trip-tab]")];
const tripPanels = [...document.querySelectorAll("[data-trip-panel]")];
const tripModal = document.querySelector("[data-trip-modal]");
const tripStepPanels = [...document.querySelectorAll("[data-trip-step]")];
const tripDetailModal = document.querySelector("[data-trip-detail-modal]");
const tripBudgetModal = document.querySelector("[data-trip-budget-modal]");
const tripDaySearchInput = document.querySelector("[data-trip-day-search]");
const tripSearchSummary = document.querySelector("[data-trip-search-summary]");
const tripCoverFileInput = document.querySelector("[data-trip-cover-file]");
let tripOverviewModal = document.querySelector("[data-trip-overview-modal]");

let tripStep = 1;
let activeTripTab = "upcoming";
let activeTripId = "";
let activeUpcomingFilter = "all";
let activeCompletedFilter = "all";
let activeTripDaySearch = "";
let pendingCoverTripId = "";

const tripIcons = {
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v3M17 4v3M5 9h14M6 6h12v14H6Z"></path></svg>`,
  country: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V5M5 6h10l-1.4 4L15 14H5"></path></svg>`,
  city: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V8l5-3 5 3v12M9 20v-5h2v5M7.5 10h1M11.5 10h1M15 20v-7h4v7"></path></svg>`,
  theme: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4c2.4 2.2 3.6 4.4 3.6 6.6A3.6 3.6 0 0 1 12 14.2a3.6 3.6 0 0 1-3.6-3.6C8.4 8.4 9.6 6.2 12 4Z"></path><path d="M6 20c2-2.2 4-3.3 6-3.3s4 1.1 6 3.3"></path></svg>`,
  more: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"></path></svg>`,
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13 7 4 4"></path></svg>`,
  budget: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v12H5Z"></path><path d="M8 7V5h8v2M8 12h.01M12 12h.01M16 12h.01"></path></svg>`,
  person: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c1.3-4 4-6 8-6s6.7 2 8 6"></path></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7"></path></svg>`,
  camera: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l2-2h4l2 2h4v11H4Z"></path><path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path></svg>`,
};

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

function updateTravelState(updater) {
  if (window.TravelState?.updateTravelState) return window.TravelState.updateTravelState(updater);
  const current = readTravelState();
  const next = typeof updater === "function" ? updater(current) : updater;
  window.TravelState?.writeTravelState?.(next);
  return readTravelState();
}

function tripStatusLabel(trip) {
  return trip.status === "completed" ? "已完成" : trip.planStatus || "规划中";
}

function parseTripDate(value) {
  const normalized = String(value || "").replaceAll(".", "-");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function tripDayCount(trip) {
  if (trip.days) return trip.days;
  const start = parseTripDate(trip.start || trip.startDate);
  const end = parseTripDate(trip.end || trip.endDate);
  if (!start || !end) return "待定";
  return `${Math.max(1, Math.round((end - start) / 86400000) + 1)}天`;
}

function chineseNumberToValue(value) {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!value) return 0;
  if (value === "十") return 10;
  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const before = value.slice(0, tenIndex);
    const after = value.slice(tenIndex + 1);
    const tens = before ? digits[before] || 0 : 1;
    const ones = after ? digits[after] || 0 : 0;
    return tens * 10 + ones;
  }
  return [...value].reduce((number, char) => number * 10 + (digits[char] ?? 0), 0);
}

function normalizeDaySearchText(value) {
  return String(value || "")
    .trim()
    .replace(/[零一二两三四五六七八九十]+/g, (match) => String(chineseNumberToValue(match)))
    .replace(/[－—–~～]/g, "-")
    .replace(/\s+/g, "");
}

function dayCriteriaFromText(value) {
  const text = normalizeDaySearchText(value);
  if (!text) return null;
  const range = text.match(/(\d+)(?:天)?(?:-|到|至)(\d+)(?:天)?/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const atLeast = text.match(/(\d+)(?:天)?(?:以上|起|及以上)/);
  if (atLeast) return { min: Number(atLeast[1]), max: Infinity };
  const atMost = text.match(/(\d+)(?:天)?(?:以内|以下|内|之内)/);
  if (atMost) return { min: 1, max: Number(atMost[1]) };
  const exact = text.match(/(\d+)天/) || text.match(/^(\d+)$/);
  if (exact) {
    const days = Number(exact[1]);
    if (Number.isFinite(days)) return { min: days, max: days };
  }
  return null;
}

function tripDayCriteria(trip) {
  return dayCriteriaFromText(tripDayCount(trip));
}

function dayCriteriaIntersects(a, b) {
  if (!a || !b) return false;
  return a.min <= b.max && b.min <= a.max;
}

function daySearchLabel(criteria) {
  if (!criteria) return "";
  if (criteria.max === Infinity) return `${criteria.min}天以上`;
  if (criteria.min === criteria.max) return `${criteria.min}天`;
  return `${criteria.min}-${criteria.max}天`;
}

function tripDateRange(trip) {
  const start = trip.start || trip.startDate || "日期待定";
  const end = trip.end || trip.endDate || "";
  return end ? `${start} - ${String(end).slice(5)}` : start;
}

function tripYear(trip) {
  const date = parseTripDate(trip.start || trip.startDate);
  return date ? date.getFullYear() : 0;
}

function namesFromIds(ids, itemsById) {
  return (ids || []).map((id) => itemsById?.[id]?.name || id).filter(Boolean);
}

function tripPlaceNames(trip, state) {
  const countryNames = namesFromIds(trip.countryIds, state.countriesById);
  const cityNames = namesFromIds(trip.cityIds, state.citiesById);
  if (countryNames.length) return countryNames;
  if (cityNames.length) return cityNames;
  const snapshot = trip.routeSnapshot || {};
  if ((snapshot.countries || []).length) return snapshot.countries;
  return (snapshot.destinations || []).length ? snapshot.destinations : snapshot.cities || [];
}

function tripPlaceText(trip, state) {
  const names = tripPlaceNames(trip, state);
  return names.length ? names.join(" · ") : "目的地待补充";
}

function tripPlaceMeta(trip, state) {
  const countryCount = (trip.countryIds || []).length;
  const cityCount = (trip.cityIds || []).length;
  if (countryCount && cityCount) return `${countryCount}国 · ${cityCount}城`;
  if (countryCount) return `${countryCount}国`;
  if (cityCount) return `${cityCount}城`;
  return trip.countries || "目的地待定";
}

function resolveTripCover(trip, state) {
  const resolved = window.TravelState?.resolveTripCover?.(trip, state) || "";
  const stored = String(trip?.cover || "").trim();
  const safeStored = /^(?:https?:)?\/\//iu.test(stored) ? "" : stored;
  return resolved || safeStored || "assets/trip-cover-placeholder.svg";
}

function resolveCitySpotCover(city, trip, state) {
  const configured = window.RouteV2ImageCoverage?.cityByEntityId?.[city?.entityId || city?.id]?.assetPath;
  if (configured && !/^(?:https?:)?\/\//iu.test(configured)) return configured;
  const localCover = String(city?.cover || "").trim();
  if (localCover && !/^(?:https?:)?\/\//iu.test(localCover)) return localCover;
  return window.RouteV2ImageCoverage?.fallbackPolicy?.city || "assets/route-city-placeholder.svg";
}

function tripCountdown(trip) {
  if (trip.status === "completed") return "已完成";
  const start = parseTripDate(trip.start || trip.startDate);
  if (!start) return tripStatusLabel(trip);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((start - today) / 86400000));
  return days ? `还有 ${days} 天` : "今天出发";
}

function tripBudgetTotalFromState(trip, state = readTravelState()) {
  const items = window.TravelState?.getTripBudgetItems?.(state, trip.id) || [];
  const total = items.reduce((sum, item) => sum + budgetAmountValue(item.amount), 0);
  return total > 0 ? formatBudgetAmount(total) : "";
}

function tripBudgetText(trip, state = readTravelState()) {
  const sheetTotal = tripBudgetTotalFromState(trip, state);
  if (trip.status === "completed") {
    if (sheetTotal) return `实际花费 ￥${sheetTotal}`;
    if (trip.actualBudget) return `实际花费 ￥${trip.actualBudget}`;
    if (trip.id === "trip-japan-kansai") return "实际花费 ￥8,650";
    if (trip.id.includes("turkey")) return "实际花费 ￥9,800";
    return "实际花费待补";
  }
  if (sheetTotal) return `预计 ￥${sheetTotal}`;
  if (trip.budget && /\d/.test(String(trip.budget))) return `预计 ￥${trip.budget}`;
  if (trip.id === "trip-nordic") return "预计 ￥18,000";
  if (trip.id === "trip-japan-kansai") return "预计 ￥8,000";
  return "预算待定";
}

function tripThemeText(trip) {
  if (trip.id === "trip-japan-kansai") return trip.status === "completed" ? "樱花记忆" : "樱花季";
  if (trip.id === "trip-nordic") return "极光";
  if (trip.id.includes("turkey")) return "热气球";
  if (trip.id.includes("italy")) return "古迹";
  if (trip.id.includes("thai")) return "寺庙";
  return trip.status === "completed" ? "旅行回忆" : "规划中";
}

function tripCountryItems(trip, state) {
  return (trip.countryIds || []).map((id) => state.countriesById?.[id]).filter(Boolean);
}

function tripCityItems(trip, state) {
  return (trip.cityIds || []).map((id) => state.citiesById?.[id]).filter(Boolean);
}

function tripBudgetValue(trip, state = readTravelState()) {
  const text = tripBudgetText(trip, state).replace(/^预计\s*/, "").replace(/^实际花费\s*/, "");
  return text || trip.budget || "待定";
}

function tripBudgetInputValue(trip, state = readTravelState()) {
  const sheetTotal = tripBudgetTotalFromState(trip, state);
  if (sheetTotal) return sheetTotal;
  const rawBudget = String(trip.budget || "").trim();
  if (/\d/.test(rawBudget)) return rawBudget.replace(/[^\d.]/g, "");
  const displayBudget = tripBudgetValue(trip, state);
  const matched = String(displayBudget || "").match(/[\d,.]+/);
  return matched ? matched[0].replace(/[^\d.]/g, "") : "";
}

function tripNightText(trip) {
  const dayText = tripDayCount(trip);
  const days = Number.parseInt(dayText, 10);
  if (!Number.isFinite(days)) return dayText;
  return `${days}天${Math.max(0, days - 1)}晚`;
}

function tripDetailDateLine(trip) {
  const start = trip.start || trip.startDate || "日期待定";
  const end = trip.end || trip.endDate || "";
  return end ? `${start} - ${end}（${tripNightText(trip)}）` : `${start}（${tripNightText(trip)}）`;
}

function toDateInputValue(value) {
  const text = String(value || "").trim().replaceAll(".", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function fromDateInputValue(value) {
  return toDateInputValue(value).replaceAll("-", ".");
}

function tripDurationFromDates(startValue, endValue) {
  const start = parseTripDate(startValue);
  const end = parseTripDate(endValue);
  if (!start || !end) return { days: 0, nights: 0, label: "日期待定" };
  const diff = Math.max(0, Math.round((end - start) / 86400000));
  return { days: diff + 1, nights: diff, label: `${diff + 1}天${diff}晚` };
}

function splitCityNames(value) {
  return [...new Set(String(value || "")
    .split(/[\n,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function tripCountdownDays(trip) {
  if (trip.status === "completed") return "";
  const start = parseTripDate(trip.start || trip.startDate);
  if (!start) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return `${Math.max(0, Math.ceil((start - today) / 86400000))}`;
}

function distributeNights(cityCount, totalDays) {
  if (!cityCount) return [];
  const nights = Math.max(1, totalDays - 1);
  const base = Math.floor(nights / cityCount);
  let remainder = nights % cityCount;
  return Array.from({ length: cityCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return Math.max(1, value);
  });
}

function renderDetailSection(title, action, content, extraClass = "") {
  const actionAttribute = extraClass.includes("trip-overview-block") ? " data-edit-trip-overview" : "";
  return `
    <section class="trip-detail-block ${extraClass}">
      <header>
        <h2>${escapeHtml(title)}</h2>
        ${action ? `<button type="button"${actionAttribute}>${escapeHtml(action)}</button>` : ""}
      </header>
      ${content}
    </section>
  `;
}

function renderOverviewGrid(trip, state, completed) {
  const snapshot = trip.routeSnapshot || {};
  const countryText = namesFromIds(trip.countryIds, state.countriesById).join(" · ")
    || (snapshot.countries || []).join(" · ")
    || "待定";
  const cityText = namesFromIds(trip.cityIds, state.citiesById).join(" · ")
    || (snapshot.destinations || snapshot.cities || []).join(" · ")
    || "待定";
  return `
    <div class="trip-overview-grid">
      <article>
        ${tripIcons.country}
        <span><small>国家</small><strong>${escapeHtml(countryText)}</strong></span>
      </article>
      <article>
        ${tripIcons.city}
        <span><small>城市</small><strong>${escapeHtml(cityText)}</strong></span>
      </article>
      <article>
        ${tripIcons.calendar}
        <span><small>天数</small><strong>${escapeHtml(tripNightText(trip))}</strong></span>
      </article>
      <article>
        ${tripIcons.budget}
        <span><small>${completed ? "实际花费" : "预算"}</small><strong>${escapeHtml(tripBudgetValue(trip, state))}</strong></span>
      </article>
    </div>
  `;
}

function renderRouteTimeline(trip, state) {
  const cities = tripCityItems(trip, state).slice(0, 3);
  const totalDays = Number.parseInt(tripDayCount(trip), 10) || cities.length + 1;
  const nights = distributeNights(cities.length, totalDays);
  const fallback = `<p class="trip-detail-muted">添加城市后会显示目的地列表。</p>`;
  if (!cities.length) return fallback;
  return `
    <div class="trip-route-timeline">
      ${cities.map((city, index) => `
        <article>
          <img src="${escapeHtml(resolveCitySpotCover(city, trip, state))}" alt="${escapeHtml(city.name)}封面图" />
          <strong>${escapeHtml(city.name)}</strong>
          <small>${escapeHtml(nights[index] || 1)}晚</small>
        </article>
        ${index < cities.length - 1 ? `<i>···→</i>` : ""}
      `).join("")}
    </div>
  `;
}

function renderSavedSpots(trip, state) {
  const cities = tripCityItems(trip, state).slice(0, 3);
  if (!cities.length) return `<p class="trip-detail-muted">城市记录会按目的地整理在这里。</p>`;
  return `
    <div class="trip-saved-spots">
      ${cities.map((city) => {
        const spots = (city.spots || []).slice(0, 3);
        return `
          <article>
            <img src="${escapeHtml(resolveCitySpotCover(city, trip, state))}" alt="${escapeHtml(city.name)}城市图片" />
            <span>
              <strong>${escapeHtml(city.name)} (${spots.length || 1})</strong>
              ${spots.map((spot) => `<small>· ${escapeHtml(spot)}</small>`).join("")}
              ${spots.length > 2 ? `<small>+${spots.length - 2}个</small>` : ""}
            </span>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderRelatedRoute(trip, state) {
  const snapshot = trip.routeSnapshot;
  if (!snapshot?.id) return "";
  const places = (snapshot.destinations || []).length ? snapshot.destinations : snapshot.countries || [];
  const duration = snapshot.recommendedDays || (snapshot.durationDays ? `${snapshot.durationDays}天` : "天数灵活");
  const sourceName = snapshot.source?.name || "路线快照";
  const tags = [sourceName, duration, ...(snapshot.themes || []).slice(0, 1)];
  return `
    <section class="trip-route-source-card" data-trip-route-source aria-label="来源路线">
      <span class="trip-route-source-label"><small>来源路线</small><em>ROUTE SNAPSHOT</em></span>
      <strong>${escapeHtml(snapshot.name || trip.name || "路线")}</strong>
      <p>${escapeHtml(snapshot.recommendationText || snapshot.summary || "已保留加入行程时的路线信息。")}${places.length ? `<br>主要目的地：${escapeHtml(places.slice(0, 8).join(" · "))}` : ""}</p>
      <span class="trip-route-source-meta">${tags.filter(Boolean).map((item) => `<i>${escapeHtml(item)}</i>`).join("")}</span>
    </section>
  `;
}

function getTripsForTab(state, tab) {
  return (state.trips || [])
    .filter((trip) => (tab === "completed" ? trip.status === "completed" : trip.status !== "completed"))
    .sort((a, b) => String(a.start || a.startDate || "").localeCompare(String(b.start || b.startDate || "")));
}

function filterTripsForPanel(trips, tab) {
  const searchCriteria = dayCriteriaFromText(activeTripDaySearch);
  if (tab === "upcoming") {
    if (activeUpcomingFilter === "planning") trips = trips.filter((trip) => tripStatusLabel(trip) === "规划中");
    if (activeUpcomingFilter === "confirmed") trips = trips.filter((trip) => tripStatusLabel(trip) === "已确认");
    return searchCriteria ? trips.filter((trip) => dayCriteriaIntersects(tripDayCriteria(trip), searchCriteria)) : trips;
  }
  const currentYear = new Date().getFullYear();
  if (activeCompletedFilter === "this-year") trips = trips.filter((trip) => tripYear(trip) === currentYear);
  if (activeCompletedFilter === "2024") trips = trips.filter((trip) => tripYear(trip) === 2024);
  if (activeCompletedFilter === "older") trips = trips.filter((trip) => tripYear(trip) && tripYear(trip) <= 2023);
  return searchCriteria ? trips.filter((trip) => dayCriteriaIntersects(tripDayCriteria(trip), searchCriteria)) : trips;
}

function renderTripCard(trip, state) {
  const completed = trip.status === "completed";
  const dayText = tripDayCount(trip);
  const cityCount = (trip.cityIds || []).length;
  const countryCount = (trip.countryIds || []).length;
  const countryLabel = `${countryCount || 1}个国家`;
  const cityLabel = cityCount ? `${cityCount}个城市` : "城市待定";
  const bottomMeta = completed
    ? [
        ["country", countryLabel],
        ["city", cityLabel],
        ["theme", tripThemeText(trip)],
      ]
    : [
        ["country", countryCount > 1 ? countryLabel : (tripPlaceText(trip, state).split(" · ")[0] || "目的地")],
        ["city", cityLabel],
        ["theme", tripThemeText(trip)],
      ];
  return `
    <button class="trip-card" type="button" data-trip-open="${escapeHtml(trip.id)}">
      <span class="trip-card-top">
        <span class="trip-cover-wrap">
          <img src="${escapeHtml(resolveTripCover(trip, state))}" alt="${escapeHtml(trip.name)}封面图" />
          <i>${completed ? "已完成" : tripStatusLabel(trip)}</i>
        </span>
        <span class="trip-card-copy">
          <strong>${escapeHtml(trip.name || "未命名行程")}</strong>
          <em>${escapeHtml(tripPlaceText(trip, state))}</em>
          <small class="trip-date-line">${tripIcons.calendar}${escapeHtml(tripDateRange(trip))}</small>
          <small class="trip-budget-line">${escapeHtml(dayText)}　|　${escapeHtml(tripBudgetText(trip, state))}</small>
        </span>
        <span class="trip-status ${completed ? "done" : "planning"}">${escapeHtml(tripCountdown(trip))}</span>
      </span>
      <span class="trip-meta-strip">${bottomMeta.map(([icon, item]) => `<i>${tripIcons[icon] || ""}${escapeHtml(item)}</i>`).join("")}<i>${tripIcons.more}</i></span>
    </button>
  `;
}

function renderTripLists() {
  const state = readTravelState();
  const upcomingTrips = getTripsForTab(state, "upcoming");
  const completedTrips = getTripsForTab(state, "completed");
  tripTabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tripTab === activeTripTab));
  tripPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tripPanel !== activeTripTab;
  });
  updateTripFilters(upcomingTrips, completedTrips);
  const searchCriteria = dayCriteriaFromText(activeTripDaySearch);
  let activeMatches = 0;
  ["upcoming", "completed"].forEach((tab) => {
    const list = document.querySelector(`[data-trip-list="${tab}"]`);
    if (!list) return;
    const trips = filterTripsForPanel(tab === "completed" ? completedTrips : upcomingTrips, tab);
    if (tab === activeTripTab) activeMatches = trips.length;
    list.innerHTML = trips.length
      ? trips.map((trip) => renderTripCard(trip, state)).join("")
      : `<article class="trip-empty-state">${searchCriteria ? `没有找到${escapeHtml(daySearchLabel(searchCriteria))}相关行程。` : `还没有${tab === "completed" ? "已完成" : "待出行"}行程。`}</article>`;
  });
  if (tripSearchSummary) {
    tripSearchSummary.hidden = !searchCriteria;
    tripSearchSummary.textContent = searchCriteria ? `已找到 ${activeMatches} 个 ${daySearchLabel(searchCriteria)} 相关行程` : "";
  }
}

function updateTripFilters(upcomingTrips, completedTrips) {
  const upcomingButtons = document.querySelectorAll('[data-trip-filter="upcoming"] button');
  if (upcomingButtons.length) {
    const planned = upcomingTrips.filter((trip) => tripStatusLabel(trip) === "规划中").length;
    const confirmed = upcomingTrips.length - planned;
    upcomingButtons[0].querySelector("span").textContent = upcomingTrips.length;
    upcomingButtons[1].querySelector("span").textContent = planned;
    upcomingButtons[2].querySelector("span").textContent = confirmed;
  }
  const completedButton = document.querySelector('[data-trip-filter="completed"] button span');
  if (completedButton) completedButton.textContent = completedTrips.length;
  document.querySelectorAll('[data-trip-filter="upcoming"] button').forEach((button) => {
    button.classList.toggle("active", button.dataset.tripFilterValue === activeUpcomingFilter);
  });
  document.querySelectorAll('[data-trip-filter="completed"] button').forEach((button) => {
    button.classList.toggle("active", button.dataset.tripFilterValue === activeCompletedFilter);
  });
}

function showTripStep(step) {
  tripStep = step;
  tripStepPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tripStep !== String(step);
  });
}

function selectedPlaceNames() {
  return [...document.querySelectorAll(".trip-selected-list span")]
    .map((item) => (item.childNodes[0]?.textContent || "").trim())
    .filter(Boolean);
}

function resolvePlaces(names, state) {
  const countries = Object.values(state.countriesById || {});
  const cities = Object.values(state.citiesById || {});
  const countryIds = [];
  const cityIds = [];
  names.forEach((name) => {
    const country = countries.find((item) => item.name === name || item.id === name);
    const city = cities.find((item) => item.name === name || item.id === name);
    if (country) countryIds.push(country.id);
    if (city) cityIds.push(city.id);
  });
  return {
    countryIds: [...new Set(countryIds)],
    cityIds: [...new Set(cityIds)],
  };
}

function autoTripName(countryIds, state) {
  const countryNames = (countryIds || []).map((id) => state.countriesById?.[id]?.name || id).filter(Boolean);
  if (countryNames.length === 1) return `${countryNames[0]}之旅`;
  if (countryNames.length === 2) return `${countryNames[0]} · ${countryNames[1]}之旅`;
  if (countryNames.length >= 3) return `${countryNames.length}国旅行计划`;
  return "新的旅行计划";
}

function buildTripFromForm() {
  const state = readTravelState();
  const explicitName = document.querySelector("[data-trip-name-input]")?.value.trim();
  const searchPlace = document.querySelector("[data-place-search]")?.value.trim();
  const places = [...new Set([...selectedPlaceNames(), searchPlace, explicitName].filter(Boolean))];
  const resolvedPlaces = resolvePlaces(places, state);
  const cityCountryIds = resolvedPlaces.cityIds.map((id) => state.citiesById?.[id]?.countryId).filter(Boolean);
  const countryIds = [...new Set([...resolvedPlaces.countryIds, ...cityCountryIds])];
  const cityIds = resolvedPlaces.cityIds;
  const trip = {
    id: `trip-${Date.now()}`,
    name: explicitName || autoTripName(countryIds, state),
    start: document.querySelector("[data-trip-start-input]")?.value.trim() || "2026.07.18",
    end: document.querySelector("[data-trip-end-input]")?.value.trim() || "2026.07.30",
    note: document.querySelector("[data-trip-note-input]")?.value.trim() || "",
    status: "planned",
    planStatus: "规划中",
    countryIds,
    cityIds,
    budget: document.querySelector("[data-trip-budget-input]")?.value.trim() || "",
    currency: "CNY",
  };
  trip.cover = resolveTripCover(trip, state);
  return trip;
}

function updateTripPreview() {
  const preview = document.querySelector("[data-trip-preview]");
  if (!preview) return;
  const state = readTravelState();
  const trip = buildTripFromForm();
  preview.querySelector("img").src = trip.cover || resolveTripCover(trip, state);
  preview.querySelector("b").textContent = trip.name;
  preview.querySelector("em").textContent = tripPlaceText(trip, state);
  const small = preview.querySelectorAll("small");
  small[0].textContent = tripDateRange(trip);
  small[1].textContent = `${tripDayCount(trip)} · ${tripPlaceMeta(trip, state)}`;
}

function closeLayer(layer) {
  if (layer) layer.hidden = true;
}

function ensureTripOverviewModal() {
  if (tripOverviewModal) return tripOverviewModal;
  tripOverviewModal = document.createElement("div");
  tripOverviewModal.className = "trip-create-modal trip-detail-modal";
  tripOverviewModal.hidden = true;
  tripOverviewModal.dataset.tripOverviewModal = "";
  document.querySelector(".trip-screen")?.append(tripOverviewModal);
  return tripOverviewModal;
}

function findTrip(id) {
  const state = readTravelState();
  return { state, trip: (state.trips || []).find((item) => item.id === id) };
}

function renderTripDetail(id) {
  const { state, trip } = findTrip(id);
  if (!trip || !tripDetailModal) return;
  activeTripId = id;
  const completed = trip.status === "completed";
  const countdownDays = tripCountdownDays(trip);
  const noteText = completed
    ? trip.memory || "很棒的旅程，期待你下一次出发！"
    : trip.note || trip.routeSnapshot?.recommendationText || "记录这趟旅程的重点、节奏与期待。";
  const countries = tripCountryItems(trip, state);
  const countryName = countries[0]?.name || "目的地";
  const cityCount = tripCityItems(trip, state).length;
  tripDetailModal.innerHTML = `
    <section class="trip-detail-panel ${completed ? "is-completed" : "is-upcoming"}" role="dialog" aria-modal="true" aria-label="${escapeHtml(trip.name)}详情">
      <header class="trip-detail-head">
        <button class="trip-detail-back" type="button" aria-label="返回行程列表" data-close-trip-detail>${tripIcons.back}</button>
        <span class="trip-detail-head-actions">
          <button type="button" aria-label="更多">${tripIcons.more}</button>
        </span>
      </header>
      <section class="trip-detail-title">
        <h1>${escapeHtml(trip.name)}</h1>
        <em>${escapeHtml(tripStatusLabel(trip))}</em>
        <p>${escapeHtml(tripDetailDateLine(trip))}</p>
        ${completed ? "" : `<small>出发倒计时 <b>${escapeHtml(countdownDays)}</b> 天</small>`}
      </section>
      <figure class="trip-detail-hero">
        <img src="${escapeHtml(resolveTripCover(trip, state))}" alt="${escapeHtml(trip.name)}封面图" />
        <button type="button" data-change-trip-cover="${escapeHtml(trip.id)}">更换封面</button>
      </figure>
      ${completed ? `
        <section class="trip-complete-callout">
          <i>${tripIcons.check}</i>
          <span><strong>旅程已完成</strong><small>很棒的旅程，期待你下一次出发！</small></span>
        </section>
      ` : ""}
      ${renderDetailSection("行程概览", completed ? "" : "编辑", renderOverviewGrid(trip, state, completed), "trip-overview-block")}
      ${renderRelatedRoute(trip, state)}
      ${completed ? `
        ${renderDetailSection("点亮记录", "", `
          <div class="trip-lit-records">
            <small>国家 (${countries.length || 1})</small>
            <article class="trip-lit-country"><b>${escapeHtml(countryName)}</b><em>${escapeHtml(trip.start || "")} 点亮</em></article>
            <small>城市 (${cityCount || 0})</small>
            ${renderSavedSpots(trip, state)}
          </div>
        `)}
        ${renderDetailSection("旅行记录", "编辑", `
          <label class="trip-note-box">
            <textarea rows="3" data-trip-record-input>${escapeHtml(noteText)}</textarea>
          </label>
        `)}
      ` : `
        ${renderDetailSection("行程备注", "编辑", `
          <label class="trip-note-box">
            <textarea rows="3" data-trip-record-input>${escapeHtml(noteText)}</textarea>
          </label>
        `)}
      `}
      <div class="trip-detail-actions">
        ${completed
          ? `<button type="button" data-trip-budget="${escapeHtml(trip.id)}">预算</button>`
          : `
            <button class="secondary" type="button" data-trip-budget="${escapeHtml(trip.id)}">预算</button>
            <button type="button" data-complete-trip="${escapeHtml(trip.id)}">完成旅程</button>
          `}
      </div>
      <div class="trip-detail-utility-actions">
        <button type="button" data-save-trip-record="${escapeHtml(trip.id)}">保存记录</button>
        <button type="button" data-delete-trip="${escapeHtml(trip.id)}">删除行程</button>
      </div>
    </section>
  `;
  tripDetailModal.hidden = false;
}

function countrySearchText(country) {
  return [
    country.id,
    country.name,
    country.englishName,
    country.continent,
    ...(country.keywords || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderCountryPickerList(state, selectedIds, query = "") {
  const term = query.trim().toLowerCase();
  const countries = (state.countries || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"))
    .filter((country) => !term || countrySearchText(country).includes(term));
  return countries.length
    ? countries.map((country) => `
      <button type="button" class="${selectedIds.includes(country.id) ? "selected" : ""}" data-trip-overview-country="${escapeHtml(country.id)}">
        <span>${escapeHtml(country.name)}</span>
        <small>${escapeHtml(country.englishName || country.continent || "")}</small>
      </button>
    `).join("")
    : `<p class="trip-detail-muted">没有找到这个国家。</p>`;
}

function renderSelectedCountryChips(state, selectedIds) {
  return selectedIds.length
    ? selectedIds.map((id) => `
      <span>${escapeHtml(state.countriesById?.[id]?.name || id)}<button type="button" aria-label="移除${escapeHtml(state.countriesById?.[id]?.name || id)}" data-trip-overview-remove-country="${escapeHtml(id)}">×</button></span>
    `).join("")
    : `<em>至少选择一个国家</em>`;
}

function updateOverviewEditorCountryUi(modal, state) {
  const selectedIds = [...modal.querySelectorAll("[data-trip-overview-selected-country]")]
    .map((item) => item.dataset.tripOverviewSelectedCountry)
    .filter(Boolean);
  const query = modal.querySelector("[data-trip-overview-country-search]")?.value || "";
  const selected = modal.querySelector("[data-trip-overview-selected]");
  const list = modal.querySelector("[data-trip-overview-country-list]");
  if (selected) selected.innerHTML = renderSelectedCountryChips(state, selectedIds);
  if (list) list.innerHTML = renderCountryPickerList(state, selectedIds, query);
}

function setOverviewEditorCountries(modal, countryIds) {
  const store = modal.querySelector("[data-trip-overview-selected-store]");
  if (!store) return;
  store.innerHTML = [...new Set(countryIds)]
    .filter(Boolean)
    .map((countryId) => `<i data-trip-overview-selected-country="${escapeHtml(countryId)}"></i>`)
    .join("");
}

function updateOverviewEditorDuration(modal) {
  const start = modal.querySelector("[data-trip-overview-start]")?.value || "";
  const end = modal.querySelector("[data-trip-overview-end]")?.value || "";
  const summary = modal.querySelector("[data-trip-overview-duration]");
  const duration = tripDurationFromDates(start, end);
  if (summary) summary.textContent = duration.label;
}

function openTripOverviewEditor(id) {
  const { state, trip } = findTrip(id);
  const modal = ensureTripOverviewModal();
  if (!trip || !modal || trip.status === "completed") return;
  const countryIds = (trip.countryIds || []).filter((countryId) => state.countriesById?.[countryId]);
  const cityText = namesFromIds(trip.cityIds, state.citiesById).join("，");
  const startValue = toDateInputValue(trip.start || trip.startDate) || "2026-07-18";
  const endValue = toDateInputValue(trip.end || trip.endDate) || startValue;
  modal.innerHTML = `
    <section class="trip-create-panel trip-detail-panel trip-overview-editor-panel" role="dialog" aria-modal="true" aria-label="编辑行程概览">
      <header class="trip-detail-head">
        <button type="button" aria-label="返回行程详情" data-trip-overview-close="${escapeHtml(id)}">${tripIcons.back}</button>
        <span>
          <strong>${escapeHtml(trip.name || "未命名行程")}</strong>
        </span>
      </header>
      <form class="trip-overview-editor-form" data-trip-overview-form>
        <fieldset>
          <legend>国家</legend>
          <input type="search" placeholder="搜索国家" autocomplete="off" data-trip-overview-country-search />
          <div class="trip-overview-selected" data-trip-overview-selected>
            ${renderSelectedCountryChips(state, countryIds)}
          </div>
          <div hidden data-trip-overview-selected-store>
            ${countryIds.map((countryId) => `<i data-trip-overview-selected-country="${escapeHtml(countryId)}"></i>`).join("")}
          </div>
          <div class="trip-overview-country-list" data-trip-overview-country-list>
            ${renderCountryPickerList(state, countryIds)}
          </div>
        </fieldset>
        <label>
          <span>城市</span>
          <textarea rows="3" placeholder="手动输入城市，用逗号或换行分隔" data-trip-overview-cities>${escapeHtml(cityText)}</textarea>
        </label>
        <div class="trip-overview-date-grid">
          <label><span>出发日期</span><input type="date" value="${escapeHtml(startValue)}" data-trip-overview-start /></label>
          <label><span>结束日期</span><input type="date" value="${escapeHtml(endValue)}" data-trip-overview-end /></label>
          <p>自动计算：<strong data-trip-overview-duration>${escapeHtml(tripDurationFromDates(startValue, endValue).label)}</strong></p>
        </div>
        <label>
          <span>预算</span>
          <input type="text" inputmode="numeric" placeholder="例如 18000" value="${escapeHtml(tripBudgetInputValue(trip, state))}" data-trip-overview-budget />
        </label>
      </form>
      <div class="trip-overview-editor-actions">
        <button class="secondary" type="button" data-trip-overview-close="${escapeHtml(id)}">取消</button>
        <button type="button" data-trip-overview-save="${escapeHtml(id)}">保存</button>
      </div>
    </section>
  `;
  modal.hidden = false;
}

function openTripDetail(id) {
  closeLayer(tripBudgetModal);
  renderTripDetail(id);
}

function renderBudgetPage(id) {
  const { state, trip } = findTrip(id);
  if (!trip || !tripBudgetModal) return;
  const items = window.TravelState?.getTripBudgetItems?.(state, id) || [];
  const budgetRows = items.length ? items : [
    { name: "机票", amount: "5000" },
    { name: "酒店", amount: "6000" },
    { name: "交通", amount: "1500" },
    { name: "门票", amount: "1000" },
    { name: "餐饮", amount: "2500" },
  ];
  const actualTotal = budgetRows.reduce((sum, item) => sum + budgetAmountValue(item.amount), 0);
  tripBudgetModal.innerHTML = `
    <section class="trip-create-panel trip-detail-panel trip-budget-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(trip.name)}预算">
      <header class="budget-page-head">
        <button type="button" aria-label="返回行程详情" data-back-trip-detail="${escapeHtml(trip.id)}">${tripIcons.back}</button>
        <strong>${escapeHtml(trip.name)}</strong>
        <span aria-hidden="true"></span>
      </header>
      <figure class="budget-hero" data-budget-hero>
        <img src="${escapeHtml(resolveTripCover(trip, state))}" alt="${escapeHtml(trip.name)}封面图" />
        <span class="budget-hero-shade"></span>
        <figcaption>
          <small>预计预算</small>
          <strong data-budget-hero-total>${escapeHtml(formatBudgetCurrency(actualTotal))}</strong>
          <em>合理规划预算，让旅行更安心</em>
        </figcaption>
      </figure>
      <div class="budget-sheet" data-budget-sheet>
        <div class="budget-sheet-rows" data-budget-rows>
          ${budgetRows.map((item) => budgetRowTemplate(item)).join("")}
        </div>
        <button class="budget-add-row-button" type="button" aria-label="添加预算项目" data-add-budget-row>＋</button>
        <div class="budget-total-row">
          <button type="button" data-calculate-budget-total>计算总和</button>
          <strong data-budget-total>以上： ${escapeHtml(formatBudgetAmount(actualTotal))}</strong>
        </div>
      </div>
      <div class="budget-editor">
        <button type="button" data-save-budget-items="${escapeHtml(trip.id)}">保存预算</button>
      </div>
    </section>
  `;
  tripBudgetModal.hidden = false;
}

function budgetAmountValue(value) {
  const normalized = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : 0;
}

function formatBudgetAmount(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatBudgetCurrency(value) {
  const amount = Math.round(Number(value) || 0);
  return `¥${amount.toLocaleString("en-US")}`;
}

function budgetRowTemplate(item = {}) {
  return `
    <label class="budget-row">
      <span class="budget-item-field">
        <input type="text" placeholder="项目" value="${escapeHtml(item.name || "")}" data-budget-item-name />
      </span>
      <span class="budget-amount-field">
        <em>¥</em>
        <input type="text" inputmode="decimal" placeholder="金额" value="${escapeHtml(item.amount || "")}" data-budget-item-amount />
      </span>
    </label>
  `;
}

function budgetItemsFromSheet() {
  return [...(tripBudgetModal?.querySelectorAll(".budget-row") || [])]
    .map((row, index) => {
      const name = row.querySelector("[data-budget-item-name]")?.value.trim() || "";
      const amount = row.querySelector("[data-budget-item-amount]")?.value.trim() || "";
      if (!name && !amount) return null;
      return {
        id: `budget-${Date.now()}-${index}`,
        name: name || "预算记录",
        amount: amount || "0",
        category: "其他",
      };
    })
    .filter(Boolean);
}

function updateBudgetTotal() {
  const total = budgetItemsFromSheet().reduce((sum, item) => sum + budgetAmountValue(item.amount), 0);
  const totalNode = tripBudgetModal?.querySelector("[data-budget-total]");
  if (totalNode) totalNode.textContent = `以上： ${formatBudgetAmount(total)}`;
  const heroTotalNode = tripBudgetModal?.querySelector("[data-budget-hero-total]");
  if (heroTotalNode) heroTotalNode.textContent = formatBudgetCurrency(total);
  return total;
}

function persistBudgetSheet(id) {
  const items = budgetItemsFromSheet().map((item) => ({ ...item, tripId: id }));
  const total = updateBudgetTotal();
  updateTravelState((state) => {
    const budgetItems = { ...(state.budgetItems || {}) };
    budgetItems[id] = items;
    state.budgetItems = budgetItems;
    state.trips = (state.trips || []).map((trip) => {
      if (trip.id !== id) return trip;
      const value = formatBudgetAmount(total);
      return trip.status === "completed"
        ? { ...trip, actualBudget: value }
        : { ...trip, budget: value };
    });
    return state;
  });
  return total;
}

tripTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeTripTab = button.dataset.tripTab || "upcoming";
    renderTripLists();
  });
});

document.querySelectorAll("[data-trip-filter] button").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest("[data-trip-filter]")?.dataset.tripFilter;
    const value = button.dataset.tripFilterValue || "all";
    if (group === "upcoming") activeUpcomingFilter = value;
    if (group === "completed") activeCompletedFilter = value;
    renderTripLists();
  });
});

tripDaySearchInput?.addEventListener("input", () => {
  activeTripDaySearch = tripDaySearchInput.value || "";
  renderTripLists();
});

document.querySelector("[data-new-trip]")?.addEventListener("click", () => {
  if (tripModal) tripModal.hidden = false;
  showTripStep(1);
});

document.querySelectorAll("[data-close-trip-modal]").forEach((button) => {
  button.addEventListener("click", () => closeLayer(tripModal));
});

tripModal?.addEventListener("click", (event) => {
  if (event.target === tripModal) closeLayer(tripModal);
});

document.querySelectorAll("[data-trip-next]").forEach((button) => {
  button.addEventListener("click", () => {
    if (tripStep === 2) updateTripPreview();
    showTripStep(Math.min(tripStep + 1, 3));
  });
});

document.querySelectorAll("[data-trip-prev]").forEach((button) => {
  button.addEventListener("click", () => {
    showTripStep(Math.max(tripStep - 1, 1));
  });
});

document.querySelectorAll("[data-remove-place]").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest("span")?.remove();
  });
});

document.querySelector("[data-add-place]")?.addEventListener("click", () => {
  const search = document.querySelector("[data-place-search]");
  const value = (search?.value || "").trim();
  if (!value) return;
  addSelectedPlace(value);
  search.value = "";
});

function addSelectedPlace(value) {
  const list = document.querySelector(".trip-selected-list");
  const chipRow = document.querySelector(".trip-selected-chips");
  const selected = selectedPlaceNames();
  if (selected.includes(value)) return;
  const item = document.createElement("span");
  item.innerHTML = `${escapeHtml(value)} <button type="button" data-remove-place="${escapeHtml(value)}">×</button>`;
  item.querySelector("button")?.addEventListener("click", () => item.remove());
  list?.append(item);
  chipRow?.querySelector(`[data-place-suggestion="${CSS.escape(value)}"]`)?.classList.add("selected");
}

document.querySelectorAll("[data-place-suggestion]").forEach((button) => {
  button.addEventListener("click", () => {
    addSelectedPlace(button.dataset.placeSuggestion || button.textContent.trim());
  });
});

document.querySelector("[data-create-trip]")?.addEventListener("click", () => {
  const trip = buildTripFromForm();
  if (!trip.countryIds.length) return;
  updateTravelState((state) => {
    state.trips = [...(state.trips || []), trip];
    return state;
  });
  activeTripTab = "upcoming";
  closeLayer(tripModal);
  renderTripLists();
  openTripDetail(trip.id);
});

document.querySelector(".trip-screen")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-new-trip]")) {
    if (tripModal) tripModal.hidden = false;
    showTripStep(1);
    return;
  }

  const openTrip = event.target.closest("[data-trip-open]");
  if (openTrip) {
    openTripDetail(openTrip.dataset.tripOpen);
    return;
  }

  const editOverview = event.target.closest("[data-edit-trip-overview]");
  if (editOverview) {
    openTripOverviewEditor(activeTripId);
    return;
  }

  if (event.target.closest("[data-close-trip-detail]")) {
    closeLayer(tripDetailModal);
    return;
  }

  const closeOverview = event.target.closest("[data-trip-overview-close]");
  if (closeOverview) {
    closeLayer(tripOverviewModal);
    if (closeOverview.dataset.tripOverviewClose) renderTripDetail(closeOverview.dataset.tripOverviewClose);
    return;
  }

  const overviewCountry = event.target.closest("[data-trip-overview-country]");
  if (overviewCountry && tripOverviewModal) {
    const state = readTravelState();
    const current = [...tripOverviewModal.querySelectorAll("[data-trip-overview-selected-country]")]
      .map((item) => item.dataset.tripOverviewSelectedCountry)
      .filter(Boolean);
    const countryId = overviewCountry.dataset.tripOverviewCountry;
    const next = current.includes(countryId) ? current.filter((id) => id !== countryId) : [...current, countryId];
    setOverviewEditorCountries(tripOverviewModal, next);
    updateOverviewEditorCountryUi(tripOverviewModal, state);
    return;
  }

  const removeOverviewCountry = event.target.closest("[data-trip-overview-remove-country]");
  if (removeOverviewCountry && tripOverviewModal) {
    const state = readTravelState();
    const current = [...tripOverviewModal.querySelectorAll("[data-trip-overview-selected-country]")]
      .map((item) => item.dataset.tripOverviewSelectedCountry)
      .filter((countryId) => countryId && countryId !== removeOverviewCountry.dataset.tripOverviewRemoveCountry);
    setOverviewEditorCountries(tripOverviewModal, current);
    updateOverviewEditorCountryUi(tripOverviewModal, state);
    return;
  }

  const saveOverview = event.target.closest("[data-trip-overview-save]");
  if (saveOverview && tripOverviewModal) {
    const id = saveOverview.dataset.tripOverviewSave;
    const selectedCountryIds = [...tripOverviewModal.querySelectorAll("[data-trip-overview-selected-country]")]
      .map((item) => item.dataset.tripOverviewSelectedCountry)
      .filter(Boolean);
    if (!selectedCountryIds.length) return;
    const cityIds = splitCityNames(tripOverviewModal.querySelector("[data-trip-overview-cities]")?.value || "");
    const start = fromDateInputValue(tripOverviewModal.querySelector("[data-trip-overview-start]")?.value || "");
    const end = fromDateInputValue(tripOverviewModal.querySelector("[data-trip-overview-end]")?.value || "");
    const budgetValue = tripOverviewModal.querySelector("[data-trip-overview-budget]")?.value.trim() || "";
    updateTravelState((state) => {
      state.trips = (state.trips || []).map((trip) => {
        if (trip.id !== id) return trip;
        return {
          ...trip,
          countryIds: selectedCountryIds,
          cityIds,
          start: start || trip.start,
          end: end || trip.end,
          days: "",
          budget: budgetValue,
        };
      });
      return state;
    });
    closeLayer(tripOverviewModal);
    renderTripLists();
    renderTripDetail(id);
    return;
  }

  const complete = event.target.closest("[data-complete-trip]");
  if (complete) {
    const id = complete.dataset.completeTrip;
    const record = tripDetailModal?.querySelector("[data-trip-record-input]")?.value.trim();
    const next = window.TravelState.setTripStatus(readTravelState(), id, "completed", {
      actualBudget: findTrip(id).trip?.actualBudget || findTrip(id).trip?.budget || "",
      memory: record || "很棒的旅程，期待下一次出发！",
    });
    window.TravelState.writeTravelState(next);
    activeTripTab = "completed";
    renderTripLists();
    renderTripDetail(id);
    return;
  }

  const reopen = event.target.closest("[data-reopen-trip]");
  if (reopen) {
    const next = window.TravelState.setTripStatus(readTravelState(), reopen.dataset.reopenTrip, "upcoming");
    window.TravelState.writeTravelState(next);
    activeTripTab = "upcoming";
    renderTripLists();
    renderTripDetail(reopen.dataset.reopenTrip);
    return;
  }

  const deleteTrip = event.target.closest("[data-delete-trip]");
  if (deleteTrip) {
    const next = window.TravelState.removeTrip(readTravelState(), deleteTrip.dataset.deleteTrip);
    window.TravelState.writeTravelState(next);
    closeLayer(tripDetailModal);
    closeLayer(tripBudgetModal);
    renderTripLists();
    return;
  }

  const saveRecord = event.target.closest("[data-save-trip-record]");
  if (saveRecord) {
    const id = saveRecord.dataset.saveTripRecord;
    const value = tripDetailModal?.querySelector("[data-trip-record-input]")?.value.trim() || "";
    updateTravelState((state) => {
      state.trips = (state.trips || []).map((trip) => {
        if (trip.id !== id) return trip;
        return trip.status === "completed" ? { ...trip, memory: value } : { ...trip, note: value };
      });
      return state;
    });
    renderTripDetail(id);
    return;
  }

  const budget = event.target.closest("[data-trip-budget]");
  if (budget) {
    renderBudgetPage(budget.dataset.tripBudget);
    return;
  }

  const changeCover = event.target.closest("[data-change-trip-cover]");
  if (changeCover) {
    pendingCoverTripId = changeCover.dataset.changeTripCover || "";
    tripCoverFileInput?.click();
    return;
  }

  const backTrip = event.target.closest("[data-back-trip-detail]");
  if (backTrip) {
    closeLayer(tripBudgetModal);
    renderTripDetail(backTrip.dataset.backTripDetail);
    return;
  }

  if (event.target.closest("[data-calculate-budget-total]")) {
    updateBudgetTotal();
    return;
  }

  if (event.target.closest("[data-add-budget-row]")) {
    tripBudgetModal?.querySelector("[data-budget-rows]")?.insertAdjacentHTML("beforeend", budgetRowTemplate());
    return;
  }

  const saveBudget = event.target.closest("[data-save-budget-items]");
  if (saveBudget) {
    const id = saveBudget.dataset.saveBudgetItems;
    persistBudgetSheet(id);
    renderBudgetPage(id);
  }
});

document.querySelector(".trip-screen")?.addEventListener("input", (event) => {
  if (tripBudgetModal && !tripBudgetModal.hidden && event.target.closest("[data-budget-item-amount]")) {
    updateBudgetTotal();
    return;
  }
  if (!tripOverviewModal || tripOverviewModal.hidden) return;
  if (event.target.closest("[data-trip-overview-country-search]")) {
    updateOverviewEditorCountryUi(tripOverviewModal, readTravelState());
    return;
  }
  if (event.target.closest("[data-trip-overview-start], [data-trip-overview-end]")) {
    updateOverviewEditorDuration(tripOverviewModal);
  }
});

tripCoverFileInput?.addEventListener("change", () => {
  const file = tripCoverFileInput.files?.[0];
  const id = pendingCoverTripId;
  pendingCoverTripId = "";
  if (!file || !id) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl) return;
    updateTravelState((state) => {
      state.trips = (state.trips || []).map((trip) => trip.id === id ? { ...trip, cover: dataUrl } : trip);
      return state;
    });
    renderTripLists();
    renderTripDetail(id);
    tripCoverFileInput.value = "";
  });
  reader.readAsDataURL(file);
});

renderTripLists();

const initialTripId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
if (initialTripId) {
  const { trip } = findTrip(initialTripId);
  if (trip) openTripDetail(initialTripId);
}
