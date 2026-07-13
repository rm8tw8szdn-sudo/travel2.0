document.querySelector("[data-profile-edit]")?.addEventListener("click", () => {
  openNicknameEditor();
});

document.querySelector("[data-profile-avatar-edit]")?.addEventListener("click", () => {
  openAvatarEditor();
});

document.querySelector("[data-favorites-page]")?.addEventListener("click", () => {
  window.location.href = "favorites.html";
});

document.querySelectorAll("[data-footprint-page]").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = "footprint.html";
  });
});

const DEFAULT_PROFILE_AVATAR = "assets/profile-avatar-kuma-small.jpg";
const LEGACY_PROFILE_AVATARS = new Set([
  "assets/home-mascot-placeholder.svg",
  "assets/profile-avatar-kuma.png",
]);
const MAX_INLINE_AVATAR_LENGTH = 360000;
const PROFILE_EDIT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13 7 4 4"></path></svg>`;

function readTravelState() {
  return window.TravelState?.readTravelState?.() || {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolveProfileAvatar(avatar) {
  if (!avatar || LEGACY_PROFILE_AVATARS.has(avatar)) return DEFAULT_PROFILE_AVATAR;
  if (String(avatar).startsWith("data:image/") && String(avatar).length > MAX_INLINE_AVATAR_LENGTH) {
    return DEFAULT_PROFILE_AVATAR;
  }
  return avatar;
}

function useDefaultAvatarOnError(image) {
  image.addEventListener("error", () => {
    if (image.src.includes(DEFAULT_PROFILE_AVATAR)) return;
    image.src = DEFAULT_PROFILE_AVATAR;
  });
}

function hydrateProfileStats() {
  const state = readTravelState();
  const statsData = window.TravelState?.getTravelStats?.(state) || {};
  const profileName = document.querySelector(".profile-person strong");
  const profileAvatar = document.querySelector(".profile-person img");
  const avatar = resolveProfileAvatar(state.userProfile?.avatar);
  if (profileName) profileName.innerHTML = `${escapeHtml(state.userProfile?.nickname || "旅行者")} ${PROFILE_EDIT_ICON}`;
  if (profileAvatar) {
    useDefaultAvatarOnError(profileAvatar);
    profileAvatar.src = avatar;
  }
  const stats = document.querySelectorAll(".profile-stats strong");
  if (stats[0]) stats[0].textContent = String(statsData.exploredCountryCount ?? 0);
  if (stats[1]) stats[1].textContent = String(statsData.exploredCityCount ?? 0);
  if (stats[2]) stats[2].textContent = String(statsData.favoriteCount ?? 0);
  if (stats[3]) stats[3].textContent = `${statsData.progressPercent ?? 0}%`;
  const unread = (window.TravelState?.getNotifications?.(state) || []).filter((item) => !item.read).length;
  document.querySelector("[data-profile-unread]")?.replaceChildren(String(unread));
}

function avatarActionIcon(type) {
  if (type === "camera") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l2-2h4l2 2h4v11H4Z"></path><path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5Z"></path><path d="m8 16 3.2-3.2 2.2 2.2 1.7-1.7L19 17"></path><path d="M9.5 9.5h.01"></path></svg>`;
}

function ensureAvatarInput(kind) {
  const selector = `[data-avatar-input="${kind}"]`;
  let input = document.querySelector(selector);
  if (input) return input;
  input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  input.setAttribute("data-avatar-input", kind);
  if (kind === "camera") input.setAttribute("capture", "user");
  document.body.append(input);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) saveAvatarFile(file);
  });
  return input;
}

function openAvatarEditor() {
  const state = readTravelState();
  const avatar = resolveProfileAvatar(state.userProfile?.avatar);
  let modal = document.querySelector('[data-shared-root="avatar-editor"]');
  if (!modal) {
    modal = document.createElement("div");
    modal.setAttribute("data-shared-root", "avatar-editor");
    document.body.append(modal);
  }
  modal.innerHTML = `
    <div class="avatar-editor-overlay" data-avatar-editor-close>
      <section class="avatar-editor-sheet" role="dialog" aria-modal="true" aria-label="编辑头像">
        <div class="avatar-editor-handle" aria-hidden="true"></div>
        <img src="${escapeHtml(avatar)}" alt="当前头像预览" decoding="async" />
        <div class="avatar-editor-actions">
          <button type="button" data-avatar-action="camera">${avatarActionIcon("camera")}<span>拍摄</span></button>
          <button type="button" data-avatar-action="album">${avatarActionIcon("album")}<span>从相册选择</span></button>
        </div>
        <button class="avatar-editor-cancel" type="button" data-avatar-editor-close>取消</button>
      </section>
    </div>
  `;
  modal.hidden = false;
  const preview = modal.querySelector(".avatar-editor-sheet > img");
  if (preview) useDefaultAvatarOnError(preview);
  modal.querySelectorAll("[data-avatar-editor-close]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target === node || event.currentTarget.classList.contains("avatar-editor-cancel")) modal.hidden = true;
    });
  });
  modal.querySelector('[data-avatar-action="camera"]')?.addEventListener("click", () => {
    modal.hidden = true;
    ensureAvatarInput("camera").click();
  });
  modal.querySelector('[data-avatar-action="album"]')?.addEventListener("click", () => {
    modal.hidden = true;
    ensureAvatarInput("album").click();
  });
}

function saveAvatarFile(file) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const left = (size - width) / 2;
      const top = (size - height) / 2;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, left, top, width, height);
      const avatar = canvas.toDataURL("image/jpeg", 0.72);
      window.TravelState?.updateTravelState?.((state) => ({
        ...state,
        userProfile: {
          ...(state.userProfile || {}),
          avatar,
        },
      }));
      hydrateProfileStats();
    });
    image.src = String(reader.result || "");
  });
  reader.readAsDataURL(file);
}

function openNicknameEditor() {
  const state = readTravelState();
  const currentName = state.userProfile?.nickname || "旅行者";
  let modal = document.querySelector('[data-shared-root="nickname-editor"]');
  if (!modal) {
    modal = document.createElement("div");
    modal.setAttribute("data-shared-root", "nickname-editor");
    document.body.append(modal);
  }
  modal.innerHTML = `
    <div class="nickname-editor-overlay" data-nickname-close>
      <section class="nickname-editor-sheet" role="dialog" aria-modal="true" aria-label="修改昵称">
        <strong>修改昵称</strong>
        <label>
          <input type="text" maxlength="10" value="${escapeHtml(currentName)}" data-nickname-input aria-label="昵称" />
          <span><em data-nickname-count>${escapeHtml(currentName.slice(0, 10).length)}</em>/10</span>
        </label>
        <div>
          <button type="button" data-nickname-close>取消</button>
          <button type="button" data-nickname-save>保存</button>
        </div>
      </section>
    </div>
  `;
  modal.hidden = false;
  const input = modal.querySelector("[data-nickname-input]");
  const count = modal.querySelector("[data-nickname-count]");
  input?.focus();
  input?.setSelectionRange?.(0, input.value.length);
  input?.addEventListener("input", () => {
    if (input.value.length > 10) input.value = input.value.slice(0, 10);
    if (count) count.textContent = String(input.value.length);
  });
  modal.querySelectorAll("[data-nickname-close]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target === node || event.currentTarget.tagName === "BUTTON") modal.hidden = true;
    });
  });
  modal.querySelector("[data-nickname-save]")?.addEventListener("click", () => {
    const nickname = (input?.value || "").trim().slice(0, 10);
    if (!nickname) return;
    window.TravelState?.updateTravelState?.((nextState) => ({
      ...nextState,
      userProfile: {
        ...(nextState.userProfile || {}),
        nickname,
      },
    }));
    hydrateProfileStats();
    modal.hidden = true;
  });
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function dateValue(value) {
  const normalized = String(value || "").replaceAll(".", "-").replace(/[^\d-].*$/, "");
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shortDate(value) {
  const text = String(value || "");
  const match = text.match(/(\d{4})[.-](\d{2})(?:[.-](\d{2}))?/);
  if (!match) return "待定";
  return `${match[1].slice(2)}.${match[2]}${match[3] ? `.${match[3]}` : ""}`;
}

function tripCountryText(trip, state) {
  const names = normalizeList(trip.countryIds)
    .map((id) => state.countriesById?.[id]?.name || id)
    .filter(Boolean);
  return names.join(" / ") || "目的地";
}

function renderProfileTimeline() {
  const timeline = document.querySelector("[data-profile-timeline]");
  if (!timeline) return;
  const state = readTravelState();
  const statsData = window.TravelState?.getTravelStats?.(state) || {};
  const trips = normalizeList(state.trips)
    .filter((trip) => trip.status === "completed")
    .sort((a, b) => dateValue(a.end || a.endDate || a.start || a.startDate) - dateValue(b.end || b.endDate || b.start || b.startDate));
  const hasFootprints = trips.length > 0
    || Number(statsData.exploredCountryCount || 0) > 0
    || Number(statsData.exploredCityCount || 0) > 0;
  const mapCard = document.querySelector(".profile-map-card");
  const mapButton = document.querySelector("[data-profile-map-open]");
  mapCard?.classList.toggle("is-empty", !hasFootprints);
  if (mapButton) {
    mapButton.disabled = !hasFootprints;
    mapButton.setAttribute("aria-disabled", hasFootprints ? "false" : "true");
  }

  timeline.innerHTML = trips.length ? `
    <span class="profile-mini-timeline-line" aria-hidden="true"></span>
    ${trips.map((trip, index) => {
      const date = trip.end || trip.endDate || trip.start || trip.startDate;
      return `
        <button type="button" class="profile-mini-timeline-item ${index % 2 ? "is-offset" : ""}" data-profile-trip="${escapeHtml(trip.id)}">
          <i aria-hidden="true"></i>
          <span>${escapeHtml(tripCountryText(trip, state))}</span>
          <em>${escapeHtml(shortDate(date))}</em>
        </button>
      `;
    }).join("")}
  ` : `
    <span class="profile-mini-timeline-empty">暂无足迹</span>
  `;
  requestAnimationFrame(() => {
    timeline.scrollTop = timeline.scrollHeight;
  });
}

const ACHIEVEMENT_PAGE_ITEMS = [
  ["first_country", "assets/achievement-crops/achievement-crop-badge-01.png"],
  ["first_trip", "assets/achievement-crops/achievement-crop-badge-02.png"],
  ["explore_5_countries", "assets/achievement-crops/achievement-crop-badge-03.png"],
  ["explore_10_countries", "assets/achievement-crops/achievement-crop-badge-04.png"],
  ["explore_30_countries", "assets/achievement-crops/achievement-crop-badge-05.png"],
  ["explore_50_countries", "assets/achievement-crops/achievement-crop-badge-06.png"],
  ["three_continents", "assets/achievement-crops/achievement-crop-badge-07.png"],
  ["aurora_chaser", "assets/achievement-crops/achievement-crop-badge-08.png"],
  ["ancient_civilization", "assets/achievement-crops/achievement-crop-badge-09.png"],
  ["island_wanderer", "assets/achievement-crops/achievement-crop-badge-10.png"],
  ["collector", "assets/achievement-crops/achievement-crop-badge-11.png"],
  ["route_collector", "assets/achievement-crops/achievement-crop-badge-12.png"],
];

function profileAchievementItems() {
  const achievements = window.TravelState?.getAchievements?.(readTravelState()) || [];
  const byAchievementId = Object.fromEntries(achievements.map((item) => [item.id, item]));
  return ACHIEVEMENT_PAGE_ITEMS.map(([id, art]) => {
    const item = byAchievementId[id] || {};
    return {
      ...item,
      id,
      name: item.title || item.name || id,
      description: item.description || "",
      art: art || item.icon || item.cover || "",
      progress: item.progress || `${item.currentValue || 0} / ${item.targetValue || 0}`,
      progressPercent: item.progressPercent || 0,
      unlockedAt: item.unlockedAt || "",
    };
  });
}

function achievementCardMarkup(item) {
  const isUnlocked = Boolean(item.unlockedAt);
  return `
    <button class="achievement-card ${isUnlocked ? "is-unlocked" : "is-locked"}" type="button" data-achievement-card="${escapeHtml(item.id)}" data-achievement-state="${isUnlocked ? "unlocked" : "locked"}">
      <img src="${escapeHtml(item.art)}" alt="${escapeHtml(item.name)}徽章" />
      <strong>${escapeHtml(item.name)}</strong>
    </button>
  `;
}

function achievementPreviewMarkup(item) {
  const isUnlocked = Boolean(item.unlockedAt);
  const status = isUnlocked ? `已解锁 · ${item.unlockedAt}` : `进度 ${item.progress || "0 / 0"}`;
  return `
    <div class="achievement-preview-mask" data-achievement-preview-close>
      <section class="achievement-preview-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(item.name)}">
        <button type="button" aria-label="关闭" data-achievement-preview-close>×</button>
        <img class="${isUnlocked ? "is-unlocked" : "is-locked"}" src="${escapeHtml(item.art)}" alt="${escapeHtml(item.name)}徽章" />
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.description)}</p>
        <em>${escapeHtml(status)}</em>
        <span aria-hidden="true"><b style="width:${Math.max(0, Math.min(100, item.progressPercent || (isUnlocked ? 100 : 0)))}%"></b></span>
      </section>
    </div>
  `;
}

function closeAchievementPreview(modal) {
  modal.querySelector(".achievement-preview-mask")?.remove();
}

function openProfileAchievements() {
  const achievementItems = profileAchievementItems();
  const unlockedCount = achievementItems.filter((item) => item.unlockedAt).length;
  const totalCount = achievementItems.length;
  const unlockPercent = totalCount ? Math.round(unlockedCount / totalCount * 100) : 0;
  let modal = document.querySelector('[data-shared-root="profile-achievements"]');
  if (!modal) {
    modal = document.createElement("div");
    modal.setAttribute("data-shared-root", "profile-achievements");
    document.querySelector(".home-screen")?.append(modal);
  }
  modal.innerHTML = `
    <section class="achievement-page-overlay" role="dialog" aria-modal="true" aria-label="我的成就" data-achievement-page>
      <header class="achievement-nav">
        <button type="button" aria-label="返回" data-achievement-back>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"></path></svg>
        </button>
        <h2>我的成就</h2>
        <button class="achievement-share-entry is-hidden" type="button" aria-label="分享" data-achievement-share aria-hidden="true" tabindex="-1">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 0 6h.17A3 3 0 0 0 18 8ZM6 15a3 3 0 1 0 2.83 4H9a3 3 0 0 0 0-6h-.17A3 3 0 0 0 6 15ZM18 21a3 3 0 1 0-2.83-4H15a3 3 0 0 0 0 6h.17A3 3 0 0 0 18 21Z"></path><path d="m8.8 14.1 6.4-3.7M8.8 17.9l6.4 3.7"></path></svg>
        </button>
      </header>
      <div class="achievement-scroll">
        <section class="achievement-overview" aria-label="成就概览" data-achievement-overview>
          <img src="assets/achievement-crops/achievement-crop-kuma-trophy.png?v=kuma-brow-20260614" alt="Kuma 小熊拿奖杯" data-achievement-kuma-art />
          <div>
            <span>已解锁成就</span>
            <strong><em>${escapeHtml(unlockedCount)}</em> / ${escapeHtml(totalCount)}</strong>
            <p>继续探索，解锁更多成就吧！</p>
            <i aria-hidden="true"><b style="width:${Math.max(0, Math.min(100, unlockPercent))}%"></b></i>
          </div>
        </section>
        <section class="achievement-grid" aria-label="成就徽章">
          ${achievementItems.map(achievementCardMarkup).join("")}
        </section>
        <section class="achievement-encourage" data-achievement-encourage>
          <p>
            <strong>每一段旅程，都是一段难忘的回忆！</strong>
            <span>继续探索世界，点亮更多精彩吧！</span>
          </p>
          <img src="assets/achievement-crops/achievement-crop-sprout.png" alt="" aria-hidden="true" />
        </section>
      </div>
    </section>
  `;
  modal.hidden = false;
  modal.querySelector("[data-achievement-back]")?.addEventListener("click", () => {
    modal.hidden = true;
  });
  modal.querySelector("[data-achievement-share]")?.addEventListener("click", () => {
    window.openShareCard?.("trip", {
      type: "成就",
      name: "我的成就",
      cover: "assets/achievement-crops/achievement-crop-kuma-trophy.png?v=kuma-brow-20260614",
      description: `已解锁 ${unlockedCount} / ${totalCount} 个旅行成就`,
      meta: "来自 我的旅行足迹 · Ruby",
    });
  });
  modal.querySelectorAll("[data-achievement-card]").forEach((card) => {
    card.addEventListener("click", () => {
      const item = achievementItems.find((achievement) => achievement.id === card.dataset.achievementCard);
      if (!item) return;
      closeAchievementPreview(modal);
      modal.querySelector("[data-achievement-page]")?.insertAdjacentHTML("beforeend", achievementPreviewMarkup(item));
      const previewMask = modal.querySelector(".achievement-preview-mask");
      previewMask?.addEventListener("click", (event) => {
        if (event.target === previewMask || event.target.closest("[data-achievement-preview-close]")) {
          closeAchievementPreview(modal);
        }
      });
    });
  });
}

function ensureProfileMapModal() {
  let modal = document.querySelector("[data-profile-map-modal]");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "profile-map-zoom-modal";
  modal.setAttribute("data-profile-map-modal", "");
  modal.hidden = true;
  document.body.append(modal);
  return modal;
}

function closeProfileMapModal() {
  const modal = document.querySelector("[data-profile-map-modal]");
  if (modal) modal.hidden = true;
  document.body.classList.remove("profile-map-modal-open", "profile-map-landscape-open");
}

function syncProfileMapOrientation(modal) {
  if (!modal) return;
  const wantsLandscape = modal.classList.contains("is-landscape");
  document.body.classList.toggle("profile-map-landscape-open", wantsLandscape);
}

function refreshProfileMapModal(modal) {
  syncProfileMapOrientation(modal);
  requestAnimationFrame(() => {
    window.renderTravelWorldMaps?.();
    setTimeout(() => window.renderTravelWorldMaps?.(), 120);
  });
}

function openProfileMapModal() {
  const state = readTravelState();
  const statsData = window.TravelState?.getTravelStats?.(state) || {};
  const modal = ensureProfileMapModal();
  modal.innerHTML = `
    <div class="profile-map-zoom-backdrop" data-profile-map-close></div>
    <section class="profile-map-zoom-panel" role="dialog" aria-modal="true" aria-label="足迹地图">
      <header>
        <strong>足迹地图</strong>
        <span>${escapeHtml(statsData.exploredCountryCount ?? 0)} / 195</span>
        <button type="button" data-profile-map-orientation>横屏</button>
        <button type="button" aria-label="关闭" data-profile-map-close>×</button>
      </header>
      <div class="profile-map-zoom-frame">
        <div class="travel-world-map travel-world-map--zoom" data-world-map data-world-map-mode="detail"></div>
      </div>
    </section>
  `;
  modal.hidden = false;
  document.body.classList.add("profile-map-modal-open");
  syncProfileMapOrientation(modal);
  modal.querySelectorAll("[data-profile-map-close]").forEach((button) => {
    button.addEventListener("click", closeProfileMapModal);
  });
  modal.querySelector("[data-profile-map-orientation]")?.addEventListener("click", (event) => {
    modal.classList.toggle("is-landscape");
    event.currentTarget.textContent = modal.classList.contains("is-landscape") ? "竖屏" : "横屏";
    refreshProfileMapModal(modal);
  });
  window.addEventListener("resize", () => refreshProfileMapModal(modal), { once: true });
  refreshProfileMapModal(modal);
}

document.querySelectorAll("[data-profile-link]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.profileLink === "achievements") {
      openProfileAchievements();
      return;
    }
    window.location.hash = button.dataset.profileLink || "profile";
  });
});

document.querySelector("[data-profile-timeline]")?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-profile-trip]");
  if (item) window.location.href = `trips.html#${encodeURIComponent(item.dataset.profileTrip || "")}`;
});

document.querySelector("[data-profile-map-open]")?.addEventListener("click", openProfileMapModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeProfileMapModal();
});

document.querySelector("[data-profile-notifications]")?.addEventListener("click", () => {
  window.openNotifications?.();
  hydrateProfileStats();
});

hydrateProfileStats();
renderProfileTimeline();
