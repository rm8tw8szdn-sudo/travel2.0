import { RouteDiscoveryError } from "./errors.mjs";

function assetIdentity(asset = {}) {
  return [asset.provider, asset.assetId, asset.sourceUrl, asset.imageUrl].filter(Boolean).join("|");
}

function validAsset(asset) {
  const width = Number(asset?.width);
  const height = Number(asset?.height);
  const ratio = width / height;
  const validDimensions = asset?.discoveredVia === "route-banner"
    ? width >= 1200 && height >= 180 && ratio >= 3 && ratio <= 10
    : width >= 800 && height >= 450 && ratio >= 1.2 && ratio <= 2.2;
  return Boolean(
    asset?.provider && asset?.assetId && asset?.sourceUrl && asset?.imageUrl
    && asset?.author && asset?.license
    && validDimensions,
  );
}

function clone(value) {
  return structuredClone(value);
}

export function createRouteMediaService({ provider, cache, destinationImageRepository = null } = {}) {
  if (!provider || typeof provider.search !== "function") {
    throw new RouteDiscoveryError("INVALID_IMAGE_PROVIDER", "A destination image provider is required.");
  }
  if (!cache || typeof cache.get !== "function" || typeof cache.set !== "function") {
    throw new RouteDiscoveryError("INVALID_IMAGE_CACHE", "An image CacheProvider is required.");
  }

  async function resolve(input, excluded) {
    const key = `media:${input.scope}:${input.cacheId}`;
    const cached = cache.get(key);
    if (cached && validAsset(cached) && !excluded.has(assetIdentity(cached))) return { asset: clone(cached), rejections: [] };
    const result = await provider.search({ ...input, excludeAssetIdentities: [...excluded] });
    const candidates = Array.isArray(result) ? result : result?.candidates || [];
    const rejections = Array.isArray(result?.rejections) ? clone(result.rejections) : [];
    const selected = (candidates || []).find((candidate) => validAsset(candidate) && !excluded.has(assetIdentity(candidate)));
    if (!selected) return { asset: null, rejections };
    cache.set(key, clone(selected));
    return { asset: clone(selected), rejections };
  }

  async function resolveRouteCover(record, { deadlineAt = 0 } = {}) {
    const excluded = new Set((record.destinationAssets || []).map(assetIdentity).filter(Boolean));
    const coverResult = await resolve({
      scope: "route",
      cacheId: record.id,
      name: record.canonicalTitle || record.name,
      sourceTitle: record.sourceTitle || "",
      routeBannerTitle: record.routeBannerTitle || "",
      routeImageTitle: record.routeImageTitle || "",
      routeSearchTerms: record.routeSearchTerms || [],
      countries: record.countryEntities || [],
      countryName: (record.countryEntities || []).map((item) => item.name).join(" "),
      destinations: record.destinationEntities || [],
      themes: record.themes || [],
      deadlineAt,
    }, excluded);
    const coverAsset = coverResult.asset;
    if (!coverAsset) {
      throw new RouteDiscoveryError("ROUTE_MEDIA_INCOMPLETE", "Route cover is unavailable.", {
        status: 422,
        details: { routeId: record.id, missingCover: true, missingDestinations: [], rejectedImages: coverResult.rejections },
      });
    }
    return { coverAsset, diagnostics: { rejected: coverResult.rejections } };
  }

  async function resolveDestinationMedia(record, { deadlineAt = 0 } = {}) {
    const existingAssets = record.destinationAssets || [];
    const excluded = new Set([record.coverAsset].map(assetIdentity).filter(Boolean));
    const destinationAssets = [];
    const missingDestinations = [];
    const rejectedImages = [];
    const destinationEntities = record.destinationEntities || [];
    const resolvedDestinations = [];
    for (let index = 0; index < destinationEntities.length; index += 3) {
      const batch = destinationEntities.slice(index, index + 3);
      const settled = await Promise.allSettled(batch.map(async (destination) => {
        const stored = destinationImageRepository?.resolve?.({
          destinationEntityId: destination.wikidataId,
          canonicalName: destination.name,
          countryCode: destination.countryCode || "",
        })?.asset;
        const existing = stored || existingAssets.find((asset) => asset.destinationId === destination.wikidataId || asset.destinationName === destination.name);
        if (existing && validAsset(existing) && !excluded.has(assetIdentity(existing))) return { destination, imageResult: { asset: clone(existing), rejections: [] } };
        return {
          destination,
          imageResult: await resolve({
            scope: "destination",
            cacheId: destination.wikidataId || `${destination.name}:${destination.countryCode || ""}`,
            name: destination.name,
            sourceTitle: destination.sourceTitle || "",
            countryName: (record.countryEntities || []).find((item) => item.countryCode === destination.countryCode)?.name || "",
            countryCode: destination.countryCode || "",
            sourceUrl: destination.sourceUrl || "",
            themes: record.themes || [],
            deadlineAt,
          }, excluded),
        };
      }));
      settled.forEach((item, itemIndex) => {
        if (item.status === "fulfilled") resolvedDestinations.push(item.value);
        else resolvedDestinations.push({ destination: batch[itemIndex], imageResult: { asset: null, rejections: [{ reason: item.reason?.message || "image-provider-failed" }] } });
      });
    }
    for (const { destination, imageResult } of resolvedDestinations) {
      const image = imageResult.asset;
      rejectedImages.push(...imageResult.rejections.map((item) => ({ ...item, destinationName: destination.name })));
      if (!image || excluded.has(assetIdentity(image))) {
        missingDestinations.push(destination.name);
        if (image) rejectedImages.push({ assetId: image.assetId, reason: "duplicate-route-image", destinationName: destination.name });
      }
      else {
        const asset = { ...image, destinationId: destination.wikidataId || "", destinationName: destination.name };
        destinationImageRepository?.upsert?.({
          destinationEntityId: destination.wikidataId || "",
          canonicalName: destination.name,
          countryCode: destination.countryCode || "",
          asset,
        });
        destinationAssets.push(asset);
        excluded.add(assetIdentity(image));
      }
    }
    return {
      destinationAssets,
      diagnostics: { missingDestinations, rejected: rejectedImages },
    };
  }

  async function resolveRouteMedia(record, options = {}) {
    const cover = record.coverAsset?.imageUrl ? { coverAsset: record.coverAsset } : await resolveRouteCover(record, options);
    const destinations = await resolveDestinationMedia({ ...record, coverAsset: cover.coverAsset }, options);
    if (destinations.diagnostics.missingDestinations.length) {
      throw new RouteDiscoveryError("ROUTE_MEDIA_INCOMPLETE", "Every route destination requires a dedicated image.", {
        status: 422,
        details: {
          routeId: record.id,
          missingCover: false,
          missingDestinations: destinations.diagnostics.missingDestinations,
          rejectedImages: destinations.diagnostics.rejected,
        },
      });
    }
    return { coverAsset: cover.coverAsset, destinationAssets: destinations.destinationAssets };
  }

  return { resolveRouteCover, resolveDestinationMedia, resolveRouteMedia };
}

export { assetIdentity, validAsset };
