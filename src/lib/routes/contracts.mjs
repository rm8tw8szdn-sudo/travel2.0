import { RouteDiscoveryError } from "./errors.mjs";
import { isDuplicateRoute } from "./route-dedupe.mjs";

const DEFAULT_LOCALE = "zh-CN";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 60;
const MAX_QUERY_LENGTH = 160;
const MAX_CURSOR_LENGTH = 8192;
const MAX_EXCLUDE_IDS = 6000;
const MAX_EXCLUDE_CLUSTERS = 200;
const ENRICHMENT_STATUSES = new Set(["basic", "enriched", "needsEvidence", "mediaReady", "failed"]);
const SOURCE_TYPES = new Set(["source-original", "evidence-composed", "planner-designed"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function uniqueTextList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function safeHttpUrl(value) {
  const text = cleanText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function uniqueEntities(value, key) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item) => ({ ...item })).filter((item) => {
    const identity = cleanText(item?.[key] || item?.name);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function objectList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object").map((item) => structuredClone(item))
    : [];
}

function scoreObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : {};
}

function imageAsset(value) {
  if (!value || typeof value !== "object") return null;
  const asset = {
    provider: cleanText(value.provider), assetId: cleanText(value.assetId),
    sourceUrl: safeHttpUrl(value.sourceUrl), imageUrl: safeHttpUrl(value.imageUrl),
    author: cleanText(value.author), license: cleanText(value.license),
    width: Number(value.width) || 0, height: Number(value.height) || 0,
    createdAt: cleanText(value.createdAt), updatedAt: cleanText(value.updatedAt),
    discoveredVia: cleanText(value.discoveredVia), semanticScore: Number(value.semanticScore) || 0,
    destinationId: cleanText(value.destinationId), destinationName: cleanText(value.destinationName),
  };
  return asset.provider && asset.assetId && asset.sourceUrl && asset.imageUrl ? asset : null;
}

function feedCoverAsset(value) {
  if (!value || typeof value !== "object") return null;
  const imageUrl = safeHttpUrl(value.imageUrl || value.url);
  if (!imageUrl) return null;
  const sourceUrl = safeHttpUrl(value.sourceUrl) || imageUrl;
  const imageCountryCodes = uniqueTextList(value.imageCountryCodes)
    .map((code) => code.toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
  return {
    provider: cleanText(value.provider),
    assetId: cleanText(value.assetId),
    sourceUrl,
    imageUrl,
    title: cleanText(value.title),
    query: cleanText(value.query),
    author: cleanText(value.author),
    license: cleanText(value.license),
    width: Number(value.width) || 0,
    height: Number(value.height) || 0,
    qualityScore: Number(value.qualityScore) || 0,
    semanticScore: Number(value.semanticScore) || 0,
    imageCountryCodes,
    status: cleanText(value.status),
    semanticStatus: cleanText(value.semanticStatus),
    coverStatus: cleanText(value.coverStatus),
    matchEvidence: cleanText(value.matchEvidence),
    imageDedupeKey: cleanText(value.imageDedupeKey || value.dedupeKey),
    dedupeKey: cleanText(value.dedupeKey || value.imageDedupeKey),
    verifiedAt: cleanText(value.verifiedAt),
    failureReason: cleanText(value.failureReason),
  };
}

export function normalizeDiscoveryRequest(input = {}) {
  const mode = cleanText(input.mode) || "feed";
  if (!new Set(["feed", "detail", "search", "search-detail"]).has(mode)) {
    throw new RouteDiscoveryError("INVALID_MODE", "Discovery mode must be feed, detail, search, or search-detail.", { status: 400 });
  }
  if (mode === "detail" || mode === "search-detail") {
    const routeId = cleanText(input.routeId);
    if (!routeId) {
      throw new RouteDiscoveryError("INVALID_ROUTE_ID", "A routeId is required for detail mode.", { status: 400 });
    }
    return {
      mode,
      routeId,
      source: cleanText(input.source),
      searchSessionId: cleanText(input.searchSessionId) || null,
      queryId: cleanText(input.queryId) || null,
    };
  }
  const query = cleanText(input.query ?? input.q);
  if (query.length > MAX_QUERY_LENGTH) {
    throw new RouteDiscoveryError("INVALID_QUERY", `Route query must not exceed ${MAX_QUERY_LENGTH} characters.`, { status: 400 });
  }

  const parsedLimit = Number.parseInt(input.limit, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, parsedLimit))
    : DEFAULT_LIMIT;
  const locale = cleanText(input.locale) || DEFAULT_LOCALE;
  const cursor = input.cursor == null || input.cursor === "" ? null : cleanText(input.cursor);
  if (cursor && cursor.length > MAX_CURSOR_LENGTH) {
    throw new RouteDiscoveryError("INVALID_CURSOR", "Discovery cursor is too long.", { status: 400 });
  }
  const sessionId = cleanText(input.sessionId) || null;
  const excludeIds = uniqueTextList(input.excludeIds).slice(0, MAX_EXCLUDE_IDS);
  const excludeClusters = uniqueTextList(input.excludeClusters).slice(0, MAX_EXCLUDE_CLUSTERS);
  const routeType = cleanText(input.routeType || input.classification || input.tab);
  const normalizedRouteType = routeType === "single" || routeType === "cross" ? routeType : "";

  return { mode, query, locale, limit, cursor, sessionId, excludeIds, excludeClusters, routeType: normalizedRouteType };
}

export function routeDiscoveryCacheKey(request) {
  if (request.mode === "detail" || request.mode === "search-detail") return JSON.stringify([request.mode, request.routeId, request.queryId || ""]);
  return JSON.stringify([
    request.mode,
    request.query.toLocaleLowerCase("en-US"),
    request.locale.toLocaleLowerCase("en-US"),
    request.limit,
    request.sessionId,
    request.cursor,
    request.excludeIds,
    request.excludeClusters,
    request.routeType,
  ]);
}

export function normalizeDiscoveredRoute(value) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id);
  const name = cleanText(value.name);
  if (!id || !name) return null;

  const route = {
    id,
    name,
    canonicalTitle: cleanText(value.canonicalTitle || value.name),
    sourceTitle: cleanText(value.sourceTitle),
    summary: cleanText(value.summary),
    recommendationText: cleanText(value.recommendationText),
    countryEntities: uniqueEntities(value.countryEntities, "countryCode"),
    destinationEntities: uniqueEntities(value.destinationEntities, "wikidataId"),
    countries: uniqueTextList(value.countries),
    cities: uniqueTextList(value.cities),
    durationDays: Number.isFinite(Number(value.durationDays)) && Number(value.durationDays) > 0
      ? Math.round(Number(value.durationDays))
      : null,
    tags: uniqueTextList(value.tags),
    destinations: uniqueTextList(value.destinations || value.cities),
    recommendedDays: cleanText(value.recommendedDays) || (
      Number.isFinite(Number(value.durationDays)) && Number(value.durationDays) > 0
        ? `${Math.round(Number(value.durationDays))}天`
        : ""
    ),
    bestMonths: uniqueTextList(value.bestMonths),
    timeIntent: value.timeIntent && typeof value.timeIntent === "object" ? structuredClone(value.timeIntent) : null,
    routeTimeIntent: value.routeTimeIntent && typeof value.routeTimeIntent === "object" ? structuredClone(value.routeTimeIntent) : null,
    season: cleanText(value.season),
    seasons: uniqueTextList(value.seasons),
    region: cleanText(value.region),
    regionEntityId: cleanText(value.regionEntityId),
    regions: uniqueTextList(value.regions),
    themes: uniqueTextList(value.themes),
    highlights: uniqueTextList(value.highlights),
    coverAsset: imageAsset(value.coverAsset),
    onlineCoverAsset: feedCoverAsset(value.onlineCoverAsset),
    feedReady: Boolean(value.feedReady),
    feedReadyAt: cleanText(value.feedReadyAt),
    coverStatus: cleanText(value.coverStatus),
    destinationAssets: (value.destinationAssets || []).map(imageAsset).filter(Boolean),
    provenance: value.provenance && typeof value.provenance === "object" ? structuredClone(value.provenance) : {},
    sourceType: SOURCE_TYPES.has(cleanText(value.sourceType)) ? cleanText(value.sourceType) : "source-original",
    destinationSource: cleanText(value.destinationSource) || "",
    designStrategies: uniqueTextList(value.designStrategies),
    travelStyle: cleanText(value.travelStyle || value.concept?.travelStyle || value.contentEvidence?.travelStyle),
    travelStyleConceptKey: cleanText(value.travelStyleConceptKey || value.concept?.travelStyle || value.contentEvidence?.travelStyle),
    durationBand: cleanText(value.durationBand || value.concept?.durationBand),
    concept: value.concept && typeof value.concept === "object" ? structuredClone(value.concept) : null,
    compositionScore: scoreObject(value.compositionScore),
    qualityScore: Number.isFinite(Number(value.qualityScore)) ? Number(value.qualityScore) : null,
    coverageContribution: scoreObject(value.coverageContribution),
    plannerReason: objectList(value.plannerReason),
    routeBannerTitle: cleanText(value.routeBannerTitle),
    routeImageTitle: cleanText(value.routeImageTitle),
    routeSearchTerms: uniqueTextList(value.routeSearchTerms),
    enrichmentStatus: ENRICHMENT_STATUSES.has(cleanText(value.enrichmentStatus))
      ? cleanText(value.enrichmentStatus)
      : ((value.destinationAssets || []).length ? "mediaReady" : "enriched"),
    contentQualityStatus: cleanText(value.contentQualityStatus),
    repositoryStatus: cleanText(value.repositoryStatus),
    acceptedAt: cleanText(value.acceptedAt),
    mediaReadyAt: cleanText(value.mediaReadyAt),
    classification: cleanText(value.classification),
    contentEvidence: value.contentEvidence && typeof value.contentEvidence === "object" ? structuredClone(value.contentEvidence) : {},
    routeIntentSchemaVersion: cleanText(value.routeIntentSchemaVersion),
    routeIntentFingerprintVersion: cleanText(value.routeIntentFingerprintVersion),
    routeIntentFingerprint: cleanText(value.routeIntentFingerprint),
    normalizedRouteIntent: value.normalizedRouteIntent && typeof value.normalizedRouteIntent === "object"
      ? structuredClone(value.normalizedRouteIntent)
      : null,
    routeIntentInvariantStatus: value.routeIntentInvariantStatus && typeof value.routeIntentInvariantStatus === "object"
      ? structuredClone(value.routeIntentInvariantStatus)
      : null,
    generationVersion: cleanText(value.generationVersion),
    intentId: cleanText(value.intentId),
    selectedCandidateId: cleanText(value.selectedCandidateId),
    decisionTraceId: cleanText(value.decisionTraceId),
    evidenceBundleId: cleanText(value.evidenceBundleId),
    evidenceStatus: cleanText(value.evidenceStatus),
    evidenceValidationId: cleanText(value.evidenceValidationId),
    evidenceValidationStatus: cleanText(value.evidenceValidationStatus),
    evidenceSelectionMode: cleanText(value.evidenceSelectionMode),
    v2PublicationStatus: cleanText(value.v2PublicationStatus),
    routeReferenceMode: cleanText(value.routeReferenceMode),
    durationPolicy: cleanText(value.durationPolicy),
    requestedDurationDays: Number.isFinite(Number(value.requestedDurationDays)) && Number(value.requestedDurationDays) > 0
      ? Math.round(Number(value.requestedDurationDays))
      : null,
  };

  const sourceName = cleanText(value.source?.name);
  const sourceUrl = safeHttpUrl(value.source?.url);
  route.source = sourceName && sourceUrl ? { name: sourceName, url: sourceUrl } : null;
  return route;
}

export function normalizeDiscoveredRoutes(values, limit = DEFAULT_LIMIT) {
  if (!Array.isArray(values)) return [];
  const routes = [];
  for (const value of values) {
    const route = normalizeDiscoveredRoute(value);
    if (!route) continue;
    if (routes.some((item) => item.id === route.id || isDuplicateRoute(item, route))) continue;
    routes.push(route);
    if (routes.length >= limit) break;
  }
  return routes;
}
