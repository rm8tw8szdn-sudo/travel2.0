const SHARE_PRESETS = {
  country: {
    type: "国家",
    name: "日本",
    cover: "assets/trip-cover-placeholder.svg",
    description: "融合传统与现代的国度，四季分明，值得一去再去。",
    meta: "来自 我的旅行足迹 · Ruby",
  },
  city: {
    type: "城市",
    name: "东京",
    cover: "assets/route-city-placeholder.svg",
    description: "现代与传统交织的国际化大都市。",
    meta: "来自 我的旅行足迹 · Ruby",
  },
  trip: {
    type: "行程",
    name: "我的旅行",
    cover: "assets/trip-cover-placeholder.svg",
    description: "旅行记录",
    meta: "日期待定",
  },
};

function ensureModal(name, html) {
  const kebabName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  let modal = document.querySelector(`[data-shared-root="${kebabName}"]`);
  if (!modal) {
    modal = document.createElement("div");
    modal.setAttribute("data-shared-root", kebabName);
    document.querySelector(".home-screen")?.append(modal);
  }
  modal.innerHTML = html;
  modal.hidden = false;
  modal.querySelector("[data-close-modal]")?.addEventListener("click", () => {
    modal.hidden = true;
  });
  return modal;
}

function openShareCard(kind, overrides = {}) {
  const data = { ...(SHARE_PRESETS[kind] || SHARE_PRESETS.country), ...overrides };
  ensureModal(
    "shareCardModal",
    `
      <div class="flow-overlay shared-overlay">
        <section class="share-card-modal" role="dialog" aria-modal="true" data-share-card-modal>
          <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
          <article class="share-card-preview" style="--share-cover: url('${data.cover}')">
            <img src="${data.cover}" alt="${data.name}封面图" />
            <span class="share-card-shade"></span>
            <div class="share-card-copy">
              <em>${data.type}</em>
              <strong>${data.name}</strong>
              <p>${data.description}</p>
              <small>${data.meta}</small>
            </div>
            <div class="share-qr" aria-label="二维码占位" data-qr-placeholder><i></i><i></i><i></i><i></i></div>
          </article>
        </section>
      </div>
    `,
  );
}

function openNotifications() {
  const state = window.TravelState?.readTravelState?.() || {};
  const notifications = window.TravelState?.getNotifications?.(state) || [];
  const modal = ensureModal(
    "notificationList",
    `
      <div class="flow-overlay shared-overlay">
        <section class="notification-list-modal" role="dialog" aria-modal="true" data-notification-list>
          <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
          <h2>通知</h2>
          <div>
            ${notifications.map((item) => `
              <article class="${item.read ? "" : "unread"}">
                <strong>${item.type}</strong>
                <p>${item.text}</p>
                <small>${item.time}${item.read ? " · 已读" : " · 未读"}</small>
                ${item.read ? "" : `<button type="button" data-mark-notification-read="${item.id}">标为已读</button>`}
              </article>
            `).join("")}
          </div>
        </section>
      </div>
    `,
  );
  modal.querySelectorAll("[data-mark-notification-read]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = window.TravelState?.markNotificationRead?.(window.TravelState.readTravelState(), button.dataset.markNotificationRead);
      if (next) window.TravelState.writeTravelState(next);
      openNotifications();
    });
  });
}

function openFavorites() {
  ensureModal(
    "favoritesModal",
    `
      <div class="flow-overlay shared-overlay">
        <section class="favorites-modal" role="dialog" aria-modal="true" data-favorites-modal>
          <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
          <h2>我的收藏</h2>
          <div class="favorite-group"><strong>国家</strong><span>日本</span><span>冰岛</span></div>
          <div class="favorite-group"><strong>城市</strong><span>东京</span><span>京都</span></div>
        </section>
      </div>
    `,
  );
}

function openAddToTripModal(payload = {}) {
  const state = window.TravelState?.readTravelState?.() || {};
  const trips = (state.trips || []).filter((trip) => trip.status !== "completed");
  const itemName = payload.name || "目的地";
  const options = trips.map((trip) => `
    <button type="button" data-confirm-add-trip="${trip.id}">
      <strong>${trip.name}</strong>
      <small>${trip.start || trip.startDate || "日期待定"}</small>
    </button>
  `).join("");

  const modal = ensureModal(
    "addTripModal",
    `
      <div class="flow-overlay shared-overlay">
        <section class="notification-list-modal add-trip-modal" role="dialog" aria-modal="true" data-add-trip-modal>
          <button class="shared-close" type="button" aria-label="关闭" data-close-modal>×</button>
          <h2>加入行程</h2>
          <article>
            <strong>${itemName}</strong>
            <p>选择一个待出行行程，或创建新的轻量行程。</p>
            <div class="add-trip-options">
              ${options || `<small>暂无待出行行程</small>`}
              <button type="button" data-create-trip-from-payload>创建新行程</button>
            </div>
          </article>
        </section>
      </div>
    `,
  );

  modal.querySelectorAll("[data-confirm-add-trip]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetTripId = button.dataset.confirmAddTrip;
      window.TravelState?.updateTravelState?.((nextState) => {
        const nextTrip = (nextState.trips || []).find((trip) => trip.id === targetTripId);
        if (!nextTrip) return nextState;
        nextTrip.countryIds = [...new Set([...(nextTrip.countryIds || []), ...(payload.countryIds || [])])];
        nextTrip.cityIds = [...new Set([...(nextTrip.cityIds || []), ...(payload.cityIds || [])])];
        return nextState;
      });
      modal.hidden = true;
    });
  });

  modal.querySelector("[data-create-trip-from-payload]")?.addEventListener("click", () => {
    window.TravelState?.updateTravelState?.((nextState) => {
      const countries = payload.countryIds || [];
      const countryNames = countries.map((id) => nextState.countriesById?.[id]?.name || id).filter(Boolean);
      const name = countryNames.length === 1
        ? `${countryNames[0]}之旅`
        : countryNames.length > 1
          ? `${countryNames.slice(0, 2).join(" · ")}之旅`
          : `${itemName}之旅`;
      const trip = {
        id: `trip-${Date.now()}`,
        name,
        status: "planned",
        start: "2026.08.01",
        end: "2026.08.07",
        countryIds: [...new Set(payload.countryIds || [])],
        cityIds: [...new Set(payload.cityIds || [])],
        budget: "",
        currency: "CNY",
        note: "",
        planStatus: "规划中",
      };
      nextState.trips = [...(nextState.trips || []), trip];
      return nextState;
    });
    modal.hidden = true;
  });
}

document.querySelectorAll("[data-share-card-trigger]").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    const kind = trigger.dataset.shareType || "country";
    openShareCard(kind, {
      name: trigger.dataset.shareName,
      cover: trigger.dataset.shareCover,
      description: trigger.dataset.shareDescription,
      meta: trigger.dataset.shareMeta,
    });
  });
});

document.querySelectorAll("[data-share]").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    if (!document.querySelector(".country-screen")) return;
    if (event.defaultPrevented) return;
    event.preventDefault();
    openShareCard("country");
  });
});

document.querySelector("[data-notification-bell]")?.addEventListener("click", openNotifications);
document.querySelector("[data-favorites-entry]")?.addEventListener("click", openFavorites);

window.openShareCard = openShareCard;
window.openAddToTripModal = openAddToTripModal;
window.openNotifications = openNotifications;

const ROUTE_FEED_SESSION_KEY = "travelCollection.routeFeedSession";
const ROUTE_FEED_PRELOAD_KEY = "travelCollection.routeFeedPreload.v2";
const ROUTE_FEED_PRELOAD_DEBUG_KEY = "travelCollection.routeFeedPreload.debug";
const ROUTE_FEED_PRELOAD_TTL_MS = 5 * 60 * 1000;

function markRoutePreloadDebug(status, extra = {}) {
  try {
    sessionStorage.setItem(ROUTE_FEED_PRELOAD_DEBUG_KEY, JSON.stringify({
      status,
      at: Date.now(),
      ...extra,
    }));
  } catch {
    // Debug state is best effort only.
  }
}

function createRouteFeedSessionId() {
  return globalThis.crypto?.randomUUID?.() || `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function routePreloadTimeoutSignal(timeoutMs) {
  if (globalThis.AbortSignal?.timeout) return AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function proxiedRoutePreloadImageUrl(imageUrl) {
  const text = String(imageUrl || "");
  return /^https?:\/\//i.test(text) ? "assets/trip-cover-placeholder.svg" : text;
}

function routePreloadFallbackCover() {
  return "assets/trip-cover-placeholder.svg";
}

function warmRoutePreloadImage(imageUrl, timeoutMs = 2_500) {
  return new Promise((resolve) => {
    if (!imageUrl) return resolve(false);
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, timeoutMs);
    image.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    image.decoding = "async";
    image.src = imageUrl;
  });
}

async function requestRoutePreloadCover(record, usedImageUrls) {
  const response = await fetch("/api/routes/image-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: routePreloadTimeoutSignal(3_000),
    body: JSON.stringify({
      id: record.id,
      name: record.name,
      canonicalTitle: record.canonicalTitle,
      sourceTitle: record.sourceTitle,
      countries: record.countries,
      cities: record.cities,
      destinations: record.destinations,
      themes: record.themes,
      tags: record.tags,
      countryEntities: record.countryEntities,
      destinationEntities: record.destinationEntities,
      contentEvidence: record.contentEvidence,
      provenance: record.provenance,
      coverAsset: record.coverAsset,
      excludeImageUrls: [...usedImageUrls],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload.ok && payload.image?.imageUrl ? payload.image : null;
}

async function preloadRouteFeed() {
  const currentFile = (window.location.pathname.split("/").pop() || "mobile.html").toLowerCase();
  if (currentFile !== "mobile.html" && currentFile !== "" && currentFile !== "index.html") return;
  markRoutePreloadDebug("started", { currentFile });

  const sessionId = createRouteFeedSessionId();
  sessionStorage.setItem(ROUTE_FEED_SESSION_KEY, sessionId);
  try {
    markRoutePreloadDebug("fetching-feed", { sessionId });
    const response = await fetch("/api/routes/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: routePreloadTimeoutSignal(5_000),
      body: JSON.stringify({
        mode: "feed",
        limit: 6,
        routeType: "cross",
        sessionId,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    markRoutePreloadDebug("feed-response", { ok: response.ok && payload.ok, count: payload.records?.length || 0 });
    if (!response.ok || !payload.ok || !Array.isArray(payload.records)) return;
    const usedImageUrls = new Set();
    const records = await Promise.all(payload.records.map(async (record) => {
      let image = null;
      try {
        image = await requestRoutePreloadCover(record, usedImageUrls);
      } catch {
        image = null;
      }
      let imageUrl = image?.imageUrl || record.coverAsset?.imageUrl || record.coverImage || routePreloadFallbackCover(record, usedImageUrls);
      const imageReady = await warmRoutePreloadImage(proxiedRoutePreloadImageUrl(imageUrl));
      if (!imageReady) {
        image = null;
        usedImageUrls.add(String(imageUrl).toLowerCase());
        imageUrl = routePreloadFallbackCover(record, usedImageUrls);
        const fallbackReady = await warmRoutePreloadImage(proxiedRoutePreloadImageUrl(imageUrl), 1_800);
        return {
          ...record,
          _preloadImageReady: fallbackReady,
          coverSearchFailed: !image?.imageUrl && !fallbackReady,
          onlineCoverAsset: image || { provider: "preload-fallback", imageUrl },
          coverAsset: {
            ...(record.coverAsset || {}),
            provider: image?.provider || "preload-fallback",
            imageUrl,
            sourceUrl: image?.sourceUrl || "",
            title: image?.title || "",
          },
        };
      }
      usedImageUrls.add(String(imageUrl).toLowerCase());
      return {
        ...record,
        _preloadImageReady: imageReady,
        coverSearchFailed: !image?.imageUrl,
        onlineCoverAsset: image || { provider: "preload-fallback", imageUrl },
        coverAsset: {
          ...(record.coverAsset || {}),
          provider: image?.provider || "preload-fallback",
          imageUrl,
          sourceUrl: image?.sourceUrl || "",
          title: image?.title || "",
        },
      };
    }));
    sessionStorage.setItem(ROUTE_FEED_PRELOAD_KEY, JSON.stringify({
      cacheVersion: "route-preload-v2",
      imagesReady: records.every((record) => record._preloadImageReady),
      createdAt: Date.now(),
      sessionId,
      records: records.map(({ _preloadImageReady, ...record }) => record),
      nextCursor: payload.nextCursor || null,
      hasMore: Boolean(payload.hasMore && payload.nextCursor),
      routeType: "cross",
    }));
    markRoutePreloadDebug("ready", { sessionId, count: records.length });
  } catch (error) {
    markRoutePreloadDebug("failed", {
      message: error?.message || String(error),
      name: error?.name || "",
    });
    sessionStorage.removeItem(ROUTE_FEED_PRELOAD_KEY);
  }
}

// Route feed preload is now isolated in route-feed-preload.js so home shared logic cannot block it.
