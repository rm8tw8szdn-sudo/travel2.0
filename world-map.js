(function (global) {
  const MAP_TOPOLOGY_URL = "data/countries-50m.json";
  const COUNTRY_META_URL = "data/countries.zh.json";
  const D3_URL = "vendor/d3.min.js";
  const TOPOJSON_URL = "vendor/topojson-client.min.js";
  const WIDTH = 960;
  const HEIGHT = 500;
  const STATIC_PREVIEW_URL = "assets/profile-world-map.svg";
  const EXPLORED_FILL = "#6DBF67";
  const UNEXPLORED_FILL = "#E8ECE6";
  const BORDER_FILL = "#FFFFFF";

  let resourcesPromise = null;
  let libraryPromise = null;
  let previewUpgradeScheduled = false;

  function normalizeNumeric(value) {
    return String(value ?? "").padStart(3, "0");
  }

  function readState() {
    return global.TravelState?.readTravelState?.() || {};
  }

  function hasFootprintData(state) {
    const countries = Array.isArray(state.countries) ? state.countries : [];
    const cities = Array.isArray(state.cities) ? state.cities : [];
    const trips = Array.isArray(state.trips) ? state.trips : [];
    return countries.some((country) => country.explorationStatus === "explored")
      || cities.some((city) => city.explorationStatus === "explored")
      || trips.some((trip) => trip.status === "completed");
  }

  function mapUnavailable(container, message = "地图加载中") {
    if (message === "地图加载中" && container.dataset.worldMapMode === "detail") {
      renderStaticPreview(container);
      container.insertAdjacentHTML("beforeend", `<span class="travel-world-map__loading">地图加载中</span>`);
      return;
    }
    container.innerHTML = `<div class="travel-world-map__fallback">${message}</div>`;
  }

  function renderStaticPreview(container) {
    const state = readState();
    if (container.dataset.worldMapMode === "preview" && !hasFootprintData(state)) {
      container.dataset.worldMapEmpty = "true";
      container.innerHTML = "";
      return false;
    }
    const exploredCount = (state.countries || []).filter((country) => country.explorationStatus === "explored").length;
    container.dataset.worldMapEmpty = "false";
    container.innerHTML = `
      <img class="travel-world-map__preview" src="${STATIC_PREVIEW_URL}" alt="世界足迹地图预览，已探索 ${exploredCount} 个国家" loading="lazy" decoding="async" />
    `;
    return true;
  }

  function loadScriptOnce(src, globalName) {
    if (global[globalName]) return Promise.resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });
  }

  async function ensureMapLibraries() {
    if (global.d3 && global.topojson) return;
    if (!libraryPromise) {
      libraryPromise = loadScriptOnce(D3_URL, "d3").then(() => loadScriptOnce(TOPOJSON_URL, "topojson"));
    }
    await libraryPromise;
  }

  async function loadResources() {
    if (resourcesPromise) return resourcesPromise;
    resourcesPromise = ensureMapLibraries()
      .then(() => Promise.all([
        fetch(MAP_TOPOLOGY_URL).then((response) => response.json()),
        fetch(COUNTRY_META_URL).then((response) => response.json()),
      ]))
      .then(([topology, countryMeta]) => {
        const numericByIso = Object.fromEntries(
          countryMeta
            .filter((item) => item.code && item.numeric)
            .map((item) => [item.code, normalizeNumeric(item.numeric)]),
        );
        const metaByNumeric = Object.fromEntries(
          countryMeta
            .filter((item) => item.numeric)
            .map((item) => [normalizeNumeric(item.numeric), item]),
        );
        const features = global.topojson.feature(topology, topology.objects.countries).features;
        return { topology, features, numericByIso, metaByNumeric };
      });
    return resourcesPromise;
  }

  function exploredNumericCodes(state, numericByIso) {
    return new Set(
      (state.countries || [])
        .filter((country) => country.explorationStatus === "explored")
        .map((country) => numericByIso[country.id])
        .filter(Boolean),
    );
  }

  function countryName(feature, metaByNumeric) {
    const numeric = normalizeNumeric(feature.id);
    return metaByNumeric[numeric]?.name || feature.properties?.name || "国家";
  }

  function renderMap(container, resources) {
    const state = readState();
    if (container.dataset.worldMapMode === "preview" && !hasFootprintData(state)) {
      container.dataset.worldMapEmpty = "true";
      container.innerHTML = "";
      return;
    }
    const exploredCodes = exploredNumericCodes(state, resources.numericByIso);
    const isInteractive = container.dataset.worldMapMode === "detail";
    const isPreview = container.dataset.worldMapMode === "preview";
    container.innerHTML = "";
    container.style.setProperty("--explored-country-count", String(exploredCodes.size));

    const svg = global.d3
      .select(container)
      .append("svg")
      .attr("class", "travel-world-map__svg")
      .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
      .attr("role", "img")
      .attr("aria-label", `世界地图，已探索 ${exploredCodes.size} 个国家`);

    const projection = global.d3.geoNaturalEarth1();
    projection.fitExtent(
      isPreview ? [[0, 10], [WIDTH, HEIGHT - 10]] : [[18, 18], [WIDTH - 18, HEIGHT - 18]],
      isPreview ? { type: "FeatureCollection", features: resources.features } : { type: "Sphere" },
    );
    const path = global.d3.geoPath(projection);
    const group = svg.append("g").attr("class", "travel-world-map__countries");

    group
      .selectAll("path")
      .data(resources.features)
      .join("path")
      .attr("d", path)
      .attr("class", (feature) => exploredCodes.has(normalizeNumeric(feature.id)) ? "is-explored" : "is-unexplored")
      .attr("fill", (feature) => exploredCodes.has(normalizeNumeric(feature.id)) ? EXPLORED_FILL : UNEXPLORED_FILL)
      .attr("stroke", BORDER_FILL)
      .attr("stroke-width", 0.8)
      .attr("vector-effect", "non-scaling-stroke")
      .append("title")
      .text((feature) => {
        const status = exploredCodes.has(normalizeNumeric(feature.id)) ? "已探索" : "未探索";
        return `${countryName(feature, resources.metaByNumeric)} · ${status}`;
      });

    if (isInteractive) {
      const zoom = global.d3
        .zoom()
        .scaleExtent([1, 5])
        .translateExtent([[0, 0], [WIDTH, HEIGHT]])
        .on("zoom", (event) => {
          group.attr("transform", event.transform);
        });
      svg.call(zoom);
    }
  }

  function upgradePreviewMaps(containers) {
    const liveContainers = () => containers.filter((container) => container.isConnected);
    if (!liveContainers().length || !global.fetch) return;
    const run = async () => {
      try {
        const resources = await loadResources();
        liveContainers().forEach((container) => renderMap(container, resources));
      } catch {
        liveContainers().forEach((container) => mapUnavailable(container, "地图加载失败"));
      }
    };
    if (resourcesPromise) {
      run();
      return;
    }
    if (previewUpgradeScheduled) return;
    previewUpgradeScheduled = true;
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(run, { timeout: 1400 });
    } else {
      global.setTimeout(run, 700);
    }
  }

  async function renderTravelWorldMaps() {
    const containers = [...document.querySelectorAll("[data-world-map]")];
    if (!containers.length) return;
    const detailContainers = containers.filter((container) => container.dataset.worldMapMode !== "preview");
    const previewContainers = containers.filter((container) => container.dataset.worldMapMode === "preview");
    const previewContainersToUpgrade = previewContainers.filter((container) => renderStaticPreview(container));
    if (previewContainersToUpgrade.length) upgradePreviewMaps(previewContainersToUpgrade);
    if (!detailContainers.length) return;
    if (!global.fetch) {
      detailContainers.forEach((container) => mapUnavailable(container, "地图资源不可用"));
      return;
    }
    detailContainers.forEach((container) => mapUnavailable(container));
    try {
      const resources = await loadResources();
      detailContainers.forEach((container) => renderMap(container, resources));
    } catch {
      detailContainers.forEach((container) => mapUnavailable(container, "地图加载失败"));
    }
  }

  document.addEventListener("DOMContentLoaded", renderTravelWorldMaps);
  global.addEventListener?.("storage", (event) => {
    if (event.key === global.TravelState?.TRAVEL_STATE_STORAGE_KEY) renderTravelWorldMaps();
  });
  global.renderTravelWorldMaps = renderTravelWorldMaps;
})(typeof window !== "undefined" ? window : globalThis);
