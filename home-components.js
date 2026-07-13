const icons = {
  bell: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.2 9.4c0-3.1-2-5.4-5.2-5.4S6.8 6.3 6.8 9.4c0 5-2 5.5-2 6.8h14.4c0-1.3-2-1.8-2-6.8Z"></path>
      <path d="M9.8 18.2c.4 1 1.1 1.7 2.2 1.7s1.8-.7 2.2-1.7"></path>
    </svg>
  `,
  arrow: `
    <svg class="home-recent-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7"></path>
    </svg>
  `,
};

const tabs = [
  {
    label: "首页",
    href: "mobile.html",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10.8 9-7.2 9 7.2"></path><path d="M5.2 9.6V20h13.6V9.6"></path><path d="M9.5 20v-6h5v6"></path></svg>`,
  },
  {
    label: "图鉴",
    href: "atlas.html",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5v14l5-2 6 2 5-2v-14l-5 2-6-2-5 2Z"></path><path d="M9 3.5v14"></path><path d="M15 5.5v14"></path></svg>`,
  },
  {
    label: "路线",
    href: "routes.html",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path><path d="M18 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path><path d="M6 7.5v2.8c0 1.5 1.2 2.7 2.7 2.7h6.6c1.5 0 2.7 1.2 2.7 2.7v.8"></path><path d="M9.5 13H14"></path></svg>`,
  },
  {
    label: "行程",
    href: "trips.html",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v13H5Z"></path><path d="M8.5 3.8v4"></path><path d="M15.5 3.8v4"></path><path d="M5 10.2h14"></path><path d="M8.5 14h2.2"></path><path d="M13.3 14h2.2"></path></svg>`,
  },
  {
    label: "我的",
    href: "profile.html",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z"></path><path d="M5.2 20.2c.9-3.4 3.3-5.2 6.8-5.2s5.9 1.8 6.8 5.2"></path></svg>`,
  },
];

class GreetingHeader extends HTMLElement {
  connectedCallback() {
    const state = readTravelState();
    const nickname = state.userProfile?.nickname || "旅行者";
    this.innerHTML = `
      <section class="home-greeting" aria-label="问候">
        <div data-profile-home-link>
          <h1>${this.getAttribute("title") || `你好，${nickname}`} <span aria-hidden="true">${this.getAttribute("emoji") || "👋"}</span></h1>
          <p>${this.getAttribute("subtitle") || "每一次出发，都是世界给你的礼物。"}</p>
        </div>
        <button class="home-bell-button notification-bell" type="button" aria-label="通知" data-notification-bell>${icons.bell}<i data-notification-badge>3</i></button>
      </section>
    `;
    this.querySelector("[data-profile-home-link]")?.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
  }
}

class StatCard extends HTMLElement {
  connectedCallback() {
    const state = readTravelState();
    const stats = getTravelStats(state);
    const exploredCount = stats.exploredCountryCount;
    const total = stats.totalCountryCount;
    const progressPercent = Math.max(0, Math.min(100, Number(this.getAttribute("percent")?.replace("%", "") || stats.progressPercent || 0)));
    const percent = `${progressPercent}%`;
    this.innerHTML = `
      <section class="home-stat-card" aria-label="${this.getAttribute("label") || "已点亮国家"}">
        <div class="home-stat-copy">
          <p>${this.getAttribute("label") || "已点亮国家"}</p>
          <div class="home-stat-number"><strong>${this.getAttribute("count") || exploredCount}</strong><span>/ ${this.getAttribute("total") || total}</span></div>
          <p class="home-progress-label">${this.getAttribute("progress-label") || "世界探索进度"}</p>
          <div class="home-progress-row">
            <div class="home-progress-track" style="--progress-percent: ${progressPercent}%"><i></i></div>
            <span>${this.getAttribute("percent") || percent}</span>
          </div>
        </div>
        <img class="home-map-asset" src="${this.getAttribute("map-src") || "assets/home-map-p2.webp"}" alt="" decoding="async" fetchpriority="high" />
        <img class="home-mascot-asset" src="${this.getAttribute("mascot-src") || "assets/home-bear-mascot.webp"}" alt="旅行熊吉祥物" decoding="async" />
      </section>
    `;
    this.querySelector(".home-stat-card")?.addEventListener("click", () => {
      window.location.href = "footprint.html?from=home";
    });
  }
}

class TripPreviewCard extends HTMLElement {
  connectedCallback() {
    const state = readTravelState();
    const trip = state.nextTrip || null;
    const title = trip?.name || this.getAttribute("empty-title") || "暂无待出行";
    const start = trip?.start || trip?.startDate;
    const date = start ? `出发日期：${start}` : this.getAttribute("empty-date") || "从行程页添加计划";
    const cover = homeTripCover(trip, state);
    this.innerHTML = `
      <section class="home-next-section" aria-label="${this.getAttribute("label") || "下一目标"}">
        <h2>${this.getAttribute("label") || "下一目标"}</h2>
        <article class="home-next-card ${trip ? "" : "is-empty"}">
          ${trip ? `<img class="home-next-cover" src="${this.getAttribute("cover-src") || cover}" alt="${this.getAttribute("cover-alt") || `${title}封面图`}" loading="lazy" decoding="async" />` : `<span class="home-next-cover home-next-empty-cover" aria-hidden="true"></span>`}
          <div class="home-next-copy">
            <h3>${title}</h3>
            <p>${date}</p>
          </div>
          ${trip ? icons.arrow : ""}
        </article>
      </section>
    `;
    this.querySelector(".home-next-card")?.addEventListener("click", () => {
      if (trip.id) window.location.href = `trips.html#${encodeURIComponent(trip.id)}`;
    });
  }
}

class RecentTripCard extends HTMLElement {
  connectedCallback() {
    const state = readTravelState();
    const trip = state.recentTrip || null;
    const countryCount = Array.isArray(trip?.countryIds) ? trip.countryIds.length : 0;
    const cityCount = Array.isArray(trip?.cityIds) ? trip.cityIds.length : 0;
    const countryName = tripPlaceNames(trip || {}, state).split("、")[0] || "目的地";
    const chips = (this.getAttribute("chips") || `${countryName},${cityCount}城市,${countryCount}国家`)
      .split(",")
      .map((chip) => `<span>${chip.trim()}</span>`)
      .join("");
    const title = trip?.name || this.getAttribute("empty-title") || "还没有完成旅程";
    const date = trip?.start && trip?.end ? `${trip.start} - ${shortDate(trip.end)}` : this.getAttribute("empty-date") || "完成旅程后会显示在这里";
    const cover = homeTripCover(trip, state);

    this.innerHTML = `
      <section class="home-recent-section" aria-label="最近旅程">
        <h2>${this.getAttribute("section-title") || "最近旅程"}</h2>
        <article class="home-recent-card ${trip ? "" : "is-empty"}">
          ${trip ? `<img class="home-recent-cover" src="${this.getAttribute("cover-src") || cover}" alt="${this.getAttribute("cover-alt") || `${title}封面图`}" loading="lazy" decoding="async" />` : `<span class="home-recent-cover home-recent-empty-cover" aria-hidden="true"></span>`}
          <div class="home-recent-copy">
            <h3>${title}</h3>
            <p>${date}</p>
            ${trip ? `<div class="home-recent-chips" aria-label="旅程标签">${chips}</div>` : ""}
          </div>
          ${icons.arrow}
        </article>
      </section>
    `;
    this.querySelector(".home-recent-card")?.addEventListener("click", () => {
      if (trip.id) window.location.href = `trips.html#${encodeURIComponent(trip.id)}`;
      else if ((state.exploredCountries || [])[0]) window.location.href = `country-japan.html#${encodeURIComponent(state.exploredCountries[0].id)}`;
      else window.location.href = "footprint.html";
    });
  }
}

class BottomTabBar extends HTMLElement {
  connectedCallback() {
    const currentFile = (window.location.pathname.split("/").pop() || "mobile.html").toLowerCase();
    const currentTab = tabs.find((tab) => tab.href.toLowerCase() === currentFile)?.label;
    const activeLabel = this.getAttribute("active") || currentTab || "首页";
    this.innerHTML = `
      <nav class="home-tabbar" aria-label="底部导航">
        ${tabs
          .map((tab) => {
            const isActive = tab.label === activeLabel;
            return `
              <a class="${isActive ? "active" : ""}" href="${tab.href}" ${isActive ? 'aria-current="page"' : ""}>
                <span>${tab.icon}</span>
                ${tab.label}
              </a>
            `;
          })
          .join("")}
      </nav>
    `;
  }
}

customElements.define("greeting-header", GreetingHeader);
customElements.define("stat-card", StatCard);
customElements.define("trip-preview-card", TripPreviewCard);
customElements.define("recent-trip-card", RecentTripCard);
customElements.define("bottom-tab-bar", BottomTabBar);

function readTravelState() {
  return window.TravelState?.readTravelState?.() || {};
}

function getTravelStats(state) {
  return window.TravelState?.getTravelStats?.(state) || {};
}

function resolveTripCover(trip, state) {
  return window.TravelState?.resolveTripCover?.(trip, state) || "assets/home-aurora-cover.svg";
}

function homeTripCover(trip, state) {
  return resolveTripCover(trip, state);
}

function tripPlaceNames(trip, state) {
  const names = (trip.countryIds || trip.countries || trip.places || [])
    .map((id) => state.countriesById?.[id]?.name || (typeof id === "string" ? id : id?.name))
    .filter(Boolean);
  return names.join("、");
}

function shortDate(value) {
  return String(value).replace(/^\d{4}[.-]?/, "");
}
