const defaultFootprint = {
  countries: ["JP", "TR", "TH", "IT", "FR", "IS", "KR", "SG", "MY", "AE", "EG"],
  cities: [
    "东京",
    "京都",
    "大阪",
    "札幌",
    "伊斯坦布尔",
    "卡帕多奇亚",
    "安塔利亚",
    "清迈",
    "清莱",
    "罗马",
    "佛罗伦萨",
    "威尼斯",
    "巴黎",
    "尼斯",
    "雷克雅未克",
    "首尔",
    "釜山",
    "新加坡",
    "吉隆坡",
    "槟城",
    "迪拜",
    "阿布扎比",
    "开罗",
    "卢克索",
    "横滨",
    "奈良",
    "神户",
  ],
  completedTrips: 8,
};

const footprintBackButton = document.querySelector("[data-footprint-back]");
const footprintSource = new URLSearchParams(window.location.search).get("from");
if (footprintBackButton && footprintSource === "home") {
  footprintBackButton.setAttribute("aria-label", "返回首页");
}

footprintBackButton?.addEventListener("click", () => {
  const from = new URLSearchParams(window.location.search).get("from");
  window.location.href = from === "home" ? "mobile.html" : "profile.html";
});

function readTravelState() {
  return window.TravelState?.readTravelState?.() || {};
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function calculateFootprintStats(state = readTravelState()) {
  const stats = window.TravelState?.getTravelStats?.(state);
  if (!stats) {
    return {
      countries: defaultFootprint.countries.length,
      cities: defaultFootprint.cities.length,
      completedTrips: defaultFootprint.completedTrips,
    };
  }
  return {
    countries: stats.exploredCountryCount,
    cities: stats.exploredCityCount,
    completedTrips: stats.completedTripCount,
  };
}

function hydrateFootprintStats() {
  const stats = calculateFootprintStats();
  const progress = Math.min(100, Math.max(0, stats.countries / 195 * 100));
  const percent = `${progress.toFixed(1)}%`;

  document.querySelectorAll("[data-footprint-country-count]").forEach((node) => {
    node.textContent = String(stats.countries);
  });
  document.querySelectorAll("[data-footprint-city-count]").forEach((node) => {
    node.textContent = String(stats.cities);
  });
  document.querySelectorAll("[data-footprint-trip-count]").forEach((node) => {
    node.textContent = String(stats.completedTrips);
  });
  document.querySelector("[data-footprint-progress]")?.style.setProperty("--footprint-progress", percent);
  document.querySelector("[data-footprint-progress-percent]")?.replaceChildren(percent);
}

function dateParts(value) {
  const text = String(value || "");
  const match = text.match(/(\d{4})[.-](\d{2})/);
  return { year: match?.[1] || "----", month: match?.[2] || "--" };
}

function tripPlaceText(trip, state) {
  const countryNames = normalizeList(trip.countryIds).map((id) => state.countriesById?.[id]?.name || id);
  const cityNames = normalizeList(trip.cityIds).map((id) => state.citiesById?.[id]?.name || id);
  return {
    country: countryNames.join(" · ") || "旅程",
    city: cityNames.join(" · ") || trip.memory || "旅行记录",
  };
}

function renderFootprintTrips() {
  const state = readTravelState();
  const list = document.querySelector("[data-footprint-trip-list]");
  if (!list) return;
  const trips = normalizeList(state.trips)
    .filter((trip) => trip.status === "completed")
    .sort((a, b) => String(b.end || b.endDate || "").localeCompare(String(a.end || a.endDate || "")))
    .slice(0, 4);
  list.innerHTML = `<span class="footprint-timeline-line" aria-hidden="true"></span>${trips.map((trip) => {
    const parts = dateParts(trip.end || trip.endDate || trip.start || trip.startDate);
    const places = tripPlaceText(trip, state);
    const cover = window.TravelState?.resolveTripCover?.(trip, state) || trip.cover || "assets/home-aurora-cover.svg";
    return `
      <article class="footprint-trip-row" data-trip-detail="${escapeHtml(trip.id)}">
        <time><strong>${escapeHtml(parts.year)}</strong><em>${escapeHtml(parts.month)}</em></time>
        <i aria-hidden="true"></i>
        <button type="button">
          <img src="${escapeHtml(cover)}" alt="${escapeHtml(trip.name)}封面图" />
          <span><strong>${escapeHtml(places.country)}</strong><em>${escapeHtml(places.city)}</em></span>
          <small>${escapeHtml(parts.year)}.${escapeHtml(parts.month)}</small>
        </button>
      </article>
    `;
  }).join("") || `<article class="trip-empty-state">还没有已完成旅程。</article>`}`;
}

function renderFootprintAchievements() {
  const list = document.querySelector("[data-footprint-achievement-list]");
  if (!list) return;
  const achievements = (window.TravelState?.getAchievements?.(readTravelState()) || []).filter((item) => item.unlockedAt).slice(0, 3);
  list.innerHTML = `${achievements.map((item) => `
    <button type="button" data-achievement="${escapeHtml(item.id)}">
      <img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}徽章" />
      <strong>${escapeHtml(item.title)}</strong>
      <em>${escapeHtml(item.description)}</em>
      <small>${escapeHtml(item.unlockedAt)}</small>
    </button>
  `).join("")}`;
}

function ensureFootprintModal() {
  const rootName = "footprintNotice";
  let modal = document.querySelector(`[data-shared-root="${rootName}"]`);
  if (!modal) {
    modal = document.createElement("div");
    modal.setAttribute("data-shared-root", rootName);
    document.querySelector(".home-screen")?.append(modal);
  }
  return modal;
}

function openFootprintNotice(title, text) {
  const modal = ensureFootprintModal();
  modal.innerHTML = `
    <div class="flow-overlay shared-overlay">
      <section class="notification-list-modal footprint-notice" role="dialog" aria-modal="true">
        <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
        <h2>${title}</h2>
        <article><strong>${text}</strong><p>可结合下方旅程时间线查看最近完成的旅行记录。</p></article>
      </section>
    </div>
  `;
  modal.hidden = false;
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => {
    modal.hidden = true;
  });
}

function completedTrips(state = readTravelState()) {
  return normalizeList(state.trips)
    .filter((trip) => trip.status === "completed")
    .sort((a, b) => String(b.end || b.endDate || "").localeCompare(String(a.end || a.endDate || "")));
}

function openFootprintTripList() {
  const state = readTravelState();
  const trips = completedTrips(state);
  const modal = ensureFootprintModal();
  modal.innerHTML = `
    <div class="flow-overlay shared-overlay">
      <section class="notification-list-modal footprint-notice" role="dialog" aria-modal="true" data-footprint-full-trips>
        <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
        <h2>完整旅程列表</h2>
        <div>
          ${trips.length ? trips.map((trip) => {
            const parts = dateParts(trip.end || trip.endDate || trip.start || trip.startDate);
            const places = tripPlaceText(trip, state);
            return `
              <article>
                <button type="button" data-open-footprint-trip="${escapeHtml(trip.id)}">
                  <strong>${escapeHtml(trip.name || places.country)}</strong>
                  <p>${escapeHtml(places.country)} · ${escapeHtml(places.city)}</p>
                  <small>${escapeHtml(parts.year)}.${escapeHtml(parts.month)}</small>
                </button>
              </article>
            `;
          }).join("") : `<article><strong>还没有已完成旅程</strong><p>完成旅程后会自动出现在这里。</p></article>`}
        </div>
      </section>
    </div>
  `;
  modal.hidden = false;
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => {
    modal.hidden = true;
  });
  modal.querySelectorAll("[data-open-footprint-trip]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `trips.html#${encodeURIComponent(button.dataset.openFootprintTrip)}`;
    });
  });
}

function openFootprintAchievementList() {
  const achievements = window.TravelState?.getAchievements?.(readTravelState()) || [];
  const modal = ensureFootprintModal();
  modal.innerHTML = `
    <div class="flow-overlay shared-overlay">
      <section class="notification-list-modal footprint-notice" role="dialog" aria-modal="true" data-footprint-full-achievements>
        <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
        <h2>完整成就列表</h2>
        <div>
          ${achievements.map((item) => `
            <article class="${item.unlockedAt ? "unread" : ""}">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.description)}</p>
              <small>${item.unlockedAt ? `已解锁 · ${escapeHtml(item.unlockedAt)}` : "未解锁"}</small>
            </article>
          `).join("")}
        </div>
      </section>
    </div>
  `;
  modal.hidden = false;
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => {
    modal.hidden = true;
  });
}

document.querySelector("[data-footprint-calendar]")?.addEventListener("click", () => {
  openFootprintNotice("时间筛选", "按年份、月份筛选足迹记录。");
});

document.querySelector("[data-footprint-share]")?.addEventListener("click", () => {
  const stats = calculateFootprintStats();
  window.openShareCard?.("trip", {
    name: "Ruby 的旅行足迹",
    cover: "assets/footprint-world-map.svg",
    description: `已探索 ${stats.countries} 个国家 · ${stats.cities} 个城市`,
    meta: `完成旅程 ${stats.completedTrips} 趟`,
  });
});

document.querySelectorAll("[data-footprint-list]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.footprintList === "achievements") openFootprintAchievementList();
    else openFootprintTripList();
  });
});

document.querySelectorAll("[data-trip-detail]").forEach((trip) => {
  trip.addEventListener("click", () => {
    window.location.href = `trips.html#${trip.dataset.tripDetail || "trip"}`;
  });
});

document.querySelector("[data-footprint-trip-list]")?.addEventListener("click", (event) => {
  const trip = event.target.closest("[data-trip-detail]");
  if (trip) window.location.href = `trips.html#${trip.dataset.tripDetail || "trip"}`;
});

document.querySelector("[data-footprint-achievement-list]")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-achievement]");
  if (card) openFootprintNotice("成就详情", card.querySelector("strong")?.textContent || "成就详情");
});

hydrateFootprintStats();
renderFootprintTrips();
renderFootprintAchievements();
