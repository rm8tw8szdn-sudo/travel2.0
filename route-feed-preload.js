(function preloadRouteFeedFromHome() {
  const SESSION_KEY = "travelCollection.routeFeedSession";
  const PRELOAD_KEY = "travelCollection.routeFeedPreload.v2";
  const DEBUG_KEY = "travelCollection.routeFeedPreload.debug";
  const FEED_LIMIT = 6;
  const imageAssets = globalThis.RouteV2ImageAssets || null;
  const runtimeImageSearchEnabled = false;

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
    return /^https?:\/\//i.test(text) ? imageAssets?.DEFAULT_ROUTE_PLACEHOLDER || "assets/trip-cover-placeholder.svg" : text;
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

  function fallbackCover() {
    return imageAssets?.DEFAULT_ROUTE_PLACEHOLDER || "assets/trip-cover-placeholder.svg";
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
