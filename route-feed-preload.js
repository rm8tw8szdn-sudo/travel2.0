(function preloadRouteFeedFromHome() {
  const SESSION_KEY = "travelCollection.routeFeedSession";
  const PRELOAD_KEY = "travelCollection.routeFeedPreload.v2";
  const DEBUG_KEY = "travelCollection.routeFeedPreload.debug";
  const FEED_LIMIT = 6;
  const imageAssets = globalThis.RouteV2ImageAssets || null;
  const runtimeImageSearchEnabled = imageAssets?.isRuntimeImageSearchEnabled?.() === true;

  function mark(status, extra = {}) {
    try {
      sessionStorage.setItem(DEBUG_KEY, JSON.stringify({ status, at: Date.now(), ...extra }));
    } catch {
      // Debug state is best effort only.
    }
  }

  function createSessionId() {
    return globalThis.crypto?.randomUUID?.() || `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function timeoutSignal(timeoutMs) {
    if (globalThis.AbortSignal?.timeout) return AbortSignal.timeout(timeoutMs);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  function proxyImageUrl(imageUrl) {
    const text = String(imageUrl || "");
    if (imageAssets?.isConfiguredAssetUrl(text)) return text;
    if (!runtimeImageSearchEnabled && /^https?:\/\//i.test(text)) return imageAssets?.DEFAULT_ROUTE_PLACEHOLDER || "assets/trip-cover-placeholder.svg";
    return /^https?:\/\//i.test(text) ? `/api/routes/image-proxy?url=${encodeURIComponent(text)}` : text;
  }

  function fixedPilotCover(record = {}) {
    return imageAssets?.resolveLocalRouteCover?.(record)
      || imageAssets?.resolvePilotRouteCover(record.id)
      || { url: "assets/trip-cover-placeholder.svg", source: "local-placeholder", isFallback: true };
  }

  function routeText(record = {}) {
    return [
      record.id,
      record.name,
      record.canonicalTitle,
      record.sourceTitle,
      ...(record.countries || []),
      ...(record.destinations || []),
      ...(record.cities || []),
      ...(record.themes || []),
      ...(record.tags || []),
    ].filter(Boolean).join(" ");
  }

  function fallbackCover(record = {}, used = new Set()) {
    const text = routeText(record);
    const fallbacks = [
      [/central|europe|austria|hungary|czech|slovakia|prague|budapest|vienna/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg/960px-Hungarian_Parliament_Building_from_across_the_Danube%2C_2025-01-11.jpg"],
      [/e45|brenner|alps/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Brennerpass_nordrampe.jpg/960px-Brennerpass_nordrampe.jpg"],
      [/danube|wachau/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Wachau_%282%29.JPG/960px-Wachau_%282%29.JPG"],
      [/bangkok|singapore|malaysia/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Bangkok-large.png/960px-Bangkok-large.png"],
      [/canada|rockies|banff/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Moraine_Lake_17092005.jpg/960px-Moraine_Lake_17092005.jpg"],
      [/netherlands|tulip|keukenhof/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Keukenhof%2C_tulips_%2833513228345%29.jpg/960px-Keukenhof%2C_tulips_%2833513228345%29.jpg"],
      [/norway|lofoten|flam/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Reine_i_Lofoten_LC0148.jpg/960px-Reine_i_Lofoten_LC0148.jpg"],
      [/new zealand|south island|milford/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Milford_Sound_in_Fiordland_National_Park_01.jpg/960px-Milford_Sound_in_Fiordland_National_Park_01.jpg"],
      [/california|pacific|coast|big sur/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Bixby_Creek_Bridge%2C_California%2C_USA_-_May_2013.jpg/960px-Bixby_Creek_Bridge%2C_California%2C_USA_-_May_2013.jpg"],
      [/peru|machu/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/960px-Machu_Picchu%2C_Peru.jpg"],
      [/morocco|benhaddou/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/A%C3%AFtBenhaddou_Morocco_2.jpg/960px-A%C3%AFtBenhaddou_Morocco_2.jpg"],
      [/london|tower bridge/i, "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Tower_Bridge_from_Shad_Thames.jpg/960px-Tower_Bridge_from_Shad_Thames.jpg"],
    ];
    const direct = fallbacks.find(([pattern]) => pattern.test(text))?.[1];
    if (direct && !used.has(direct.toLowerCase())) return direct;
    const hash = [...String(record.id || record.name || "")].reduce((total, char) => total + char.charCodeAt(0), 0);
    for (let offset = 0; offset < fallbacks.length; offset += 1) {
      const imageUrl = fallbacks[(hash + offset) % fallbacks.length][1];
      if (!used.has(imageUrl.toLowerCase())) return imageUrl;
    }
    return fallbacks[hash % fallbacks.length][1];
  }

  function warmImage(imageUrl, timeoutMs = 2500) {
    return new Promise((resolve) => {
      if (!imageUrl || !globalThis.Image) return resolve(false);
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
      image.src = proxyImageUrl(imageUrl);
    });
  }

  async function requestCover(record, usedImageUrls) {
    const response = await fetch("/api/routes/image-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: timeoutSignal(3000),
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

  async function run() {
    const currentFile = (window.location.pathname.split("/").pop() || "mobile.html").toLowerCase();
    if (currentFile !== "mobile.html" && currentFile !== "" && currentFile !== "index.html") return;
    const sessionId = createSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
    mark("started", { sessionId });
    try {
      const response = await fetch("/api/routes/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: timeoutSignal(5000),
        body: JSON.stringify({ mode: "feed", limit: FEED_LIMIT, routeType: "cross", sessionId }),
      });
      const payload = await response.json().catch(() => ({}));
      mark("feed-response", { ok: response.ok && payload.ok, count: payload.records?.length || 0 });
      if (!response.ok || !payload.ok || !Array.isArray(payload.records)) return;
      const usedImageUrls = new Set();
      const records = [];
      let imagesReady = true;
      for (const record of payload.records) {
        const fixedCover = fixedPilotCover(record);
        let image = null;
        if (fixedCover?.isFallback && runtimeImageSearchEnabled) image = await requestCover(record, usedImageUrls).catch(() => null);
        let imageUrl = (!fixedCover?.isFallback ? fixedCover?.url : "")
          || image?.imageUrl
          || (runtimeImageSearchEnabled ? (record.coverAsset?.imageUrl || record.coverImage || fallbackCover(record, usedImageUrls)) : "assets/trip-cover-placeholder.svg");
        let imageReady = await warmImage(imageUrl);
        if (!imageReady) {
          image = null;
          usedImageUrls.add(String(imageUrl).toLowerCase());
          imageUrl = fixedCover?.url || "assets/trip-cover-placeholder.svg";
          imageReady = await warmImage(imageUrl, 1800);
        }
        imagesReady = imagesReady && imageReady;
        usedImageUrls.add(String(imageUrl).toLowerCase());
        const coverProvider = fixedCover
          ? (imageUrl === fixedCover.url && !fixedCover.isFallback ? "fixed-asset-pilot" : "fixed-asset-placeholder")
          : (image?.provider || "preload-fallback");
        records.push({
          ...record,
          ...(fixedCover?.key ? { coverImageKey: fixedCover.key } : {}),
          coverSearchFailed: !image?.imageUrl && !imageReady,
          onlineCoverAsset: image || { provider: coverProvider, imageUrl },
          coverAsset: {
            ...(record.coverAsset || {}),
            provider: coverProvider,
            imageUrl,
            sourceUrl: image?.sourceUrl || "",
            title: image?.title || "",
          },
        });
      }
    sessionStorage.setItem(PRELOAD_KEY, JSON.stringify({
      cacheVersion: "route-preload-v2",
      imagesReady,
      createdAt: Date.now(),
      sessionId,
      records,
        nextCursor: payload.nextCursor || null,
        hasMore: Boolean(payload.hasMore && payload.nextCursor),
        routeType: "cross",
      }));
      mark("ready", { sessionId, count: records.length });
    } catch (error) {
      sessionStorage.removeItem(PRELOAD_KEY);
      mark("failed", { name: error?.name || "", message: error?.message || String(error) });
    }
  }

  run();
}());
