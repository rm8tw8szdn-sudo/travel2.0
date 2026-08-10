import path from "node:path";
import { createInMemoryTtlCache } from "./cache.mjs";
import {
  normalizeDiscoveredRoutes,
  normalizeDiscoveryRequest,
} from "./contracts.mjs";
import { RouteDiscoveryError } from "./errors.mjs";
import { createAcceptedRouteRepository } from "./accepted-repository.mjs";
import { createFeedBuffer } from "./feed-buffer.mjs";
import { createSearchIndex } from "./search-index.mjs";
import { createRouteJobStore } from "./route-job-store.mjs";
import { createRouteSearchCache } from "./route-search-cache.mjs";
import { createRouteSearchAnalytics } from "./route-search-analytics.mjs";
import { createRouteSearchService } from "./route-search-service.mjs";
import { createRouteV2RuntimeMetrics } from "./route-v2-runtime-metrics.mjs";
import { createEvidenceRepository } from "./evidence-repository.mjs";
import { createRouteCompositionPlanner } from "./route-composition-planner.mjs";
import { createConfiguredLlmRefineProvider } from "./route-llm-refine-provider.mjs";
import { createCacheBackedKnowledgeGraph, readKnowledgeGraphCache } from "./wikidata-sparql-knowledge-graph.mjs";
import { mergeSearchKnowledgeGraphFallbacks } from "./search-knowledge-graph-fallbacks.mjs";
import { createPublishedKnowledgeEntityLayerRepository } from "./knowledge-entity-layer-published-assets.mjs";
import {
  createKnowledgeEntityLayerPlannerAdapter,
  createKnowledgeEntityLayerSearchIntentCatalog,
} from "./knowledge-entity-layer-planner-adapter.mjs";
import { validateEmbeddedRouteIntent } from "./route-intent-invariant-gate.mjs";

const DETAIL_MEDIA_JOB_BUDGET_MS = 60_000;

function clone(value) { return structuredClone(value); }

function defaultRequestId() {
  return `route-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function emptyDiagnostics(source = "accepted-repository") {
  return {
    source,
    timings: { basicDiscoveryMs: 0, coverMediaMs: 0, deferredEntityResolveMs: 0, destinationMediaMs: 0, responseBuildMs: 0 },
    deferred: [],
    rejected: [],
    missingDestinations: [],
    partial: false,
    cacheHit: false,
    liveSuccess: false,
    liveTimeout: false,
    retryable: false,
    staleReturned: false,
  };
}

function createDefaultSearchPlannerContext(acceptedRepository, {
  includePlanner = true,
  knowledgeEntityLayerRepository = null,
  env = process.env,
} = {}) {
  try {
    const repository = knowledgeEntityLayerRepository || createPublishedKnowledgeEntityLayerRepository();
    const intentCatalog = createKnowledgeEntityLayerSearchIntentCatalog({ repository });
    if (!includePlanner) return { planner: null, intentCatalog };
    const root = process.cwd();
    const evidenceRepository = createEvidenceRepository({ storagePath: path.join(root, ".route-v2-cache", "route-evidence.json") });
    const fallbackKnowledgeGraph = createCacheBackedKnowledgeGraph({
      pool: mergeSearchKnowledgeGraphFallbacks(readKnowledgeGraphCache(path.join(root, ".route-v2-cache", "knowledge-graph-pool.json"))),
    });
    const knowledgeGraph = createKnowledgeEntityLayerPlannerAdapter({ repository, fallbackKnowledgeGraph });
    return {
      planner: createRouteCompositionPlanner({
        evidenceRepository,
        acceptedRepository,
        knowledgeGraph,
        llmRefineProvider: createConfiguredLlmRefineProvider(env),
        env,
      }),
      intentCatalog,
    };
  } catch {
    return { planner: null, intentCatalog: null };
  }
}

function jobTypeForRequest(request) {
  if (request.query) return "search-build";
  return "feed-refill";
}

function shortageDiagnostics(poolStatus) {
  const shortages = poolStatus?.shortages || [];
  if (!shortages.length) return [];
  return shortages.map((item) => ({
    stage: "accepted-pool",
    reason: "pool-below-target",
    pool: item.pool,
    count: item.count,
    target: item.target,
    shortage: item.shortage,
  }));
}

function destinationAssetsByIdentity(record) {
  return new Map((record.destinationAssets || []).flatMap((asset) => [
    [asset.destinationId, asset],
    [asset.destinationName, asset],
  ]).filter(([key]) => key));
}

function missingDestinations(record) {
  const assets = destinationAssetsByIdentity(record);
  return (record.destinationEntities || [])
    .filter((destination) => !assets.has(destination.wikidataId) && !assets.has(destination.name))
    .map((destination) => destination.name);
}

export function createRouteDiscovery({
  mediaService = null,
  cache = createInMemoryTtlCache(),
  acceptedRepository = createAcceptedRouteRepository(),
  feedBuffer = null,
  searchIndex = null,
  searchCache = createRouteSearchCache(),
  searchAnalytics = createRouteSearchAnalytics(),
  runtimeMetrics = null,
  searchPlanner = null,
  searchService = null,
  knowledgeEntityLayerRepository = null,
  feedRefillWorker = null,
  jobStore = createRouteJobStore(),
  requestId = defaultRequestId,
  env = process.env,
} = {}) {
  if (typeof requestId !== "function") throw new RouteDiscoveryError("INVALID_REQUEST_ID_FACTORY", "A request ID factory is required.");
  const acceptedFeedBuffer = feedBuffer || createFeedBuffer({ repository: acceptedRepository, targetSize: 40 });
  const acceptedSearchIndex = searchIndex || createSearchIndex({ repository: acceptedRepository });
  const defaultSearchContext = searchService
    ? null
    : createDefaultSearchPlannerContext(acceptedRepository, {
      includePlanner: !searchPlanner,
      knowledgeEntityLayerRepository,
      env,
    });
  const routeV2RuntimeMetrics = runtimeMetrics || (
    searchService
      ? null
      : createRouteV2RuntimeMetrics({
          env,
          storagePath: env.ROUTE_V2_RUNTIME_METRICS_PATH || null,
        })
  );
  const routeSearchService = searchService || createRouteSearchService({
    acceptedRepository,
    searchCache,
    analytics: searchAnalytics,
    planner: searchPlanner || defaultSearchContext?.planner || null,
    intentCatalog: defaultSearchContext?.intentCatalog || null,
    runtimeMetrics: routeV2RuntimeMetrics,
    env,
  });
  const runningDestinationJobs = new Set();

  function poolStatus() {
    return acceptedRepository.status?.() || acceptedFeedBuffer.status?.() || {};
  }

  function pendingJobs() {
    return jobStore.list?.().filter((job) => !["accepted", "mediaReady", "rejected", "failed", "expired"].includes(job.status)) || [];
  }

  function response(result, cacheStatus, id) {
    const status = poolStatus();
    const nextCursor = result.nextCursor || null;
    const hasMore = Boolean(result.hasMore && nextCursor);
    const diagnostics = {
      ...emptyDiagnostics(),
      ...(result.diagnostics || {}),
      source: "accepted-repository",
    };
    if (!status.meetsTarget) diagnostics.deferred = [...(diagnostics.deferred || []), ...shortageDiagnostics(status)];
    return {
      ok: true,
      records: clone(result.records || []),
      nextCursor: hasMore ? nextCursor : null,
      hasMore,
      returnedCount: Number.isFinite(result.returnedCount)
        ? result.returnedCount
        : (result.records || []).length,
      remainingCount: Number.isFinite(result.remainingCount)
        ? result.remainingCount
        : null,
      paginationStatus: result.paginationStatus || (hasMore ? "ready" : "exhausted"),
      pending: Boolean(result.pending),
      pendingSearchJobId: result.pendingSearchJobId || null,
      pendingJobIds: pendingJobs().map((job) => job.id),
      cacheStatus,
      requestId: id,
      repositoryVersion: status.repositoryVersion || acceptedRepository.version?.() || "",
      poolStatus: status,
      poolShortageDiagnostics: shortageDiagnostics(status),
      diagnostics: clone(diagnostics),
    };
  }

  function detailResponse(record, cacheStatus, id, diagnostics) {
    const status = poolStatus();
    return {
      ok: true,
      record: clone(record),
      cacheStatus,
      requestId: id,
      repositoryVersion: status.repositoryVersion || acceptedRepository.version?.() || "",
      poolStatus: status,
      poolShortageDiagnostics: shortageDiagnostics(status),
      pendingJobIds: pendingJobs().map((job) => job.id),
      diagnostics: clone(diagnostics),
    };
  }

  function searchResponse(result, id) {
    const status = poolStatus();
    return {
      ok: true,
      records: clone(result.records || []),
      nextCursor: result.nextCursor || null,
      hasMore: Boolean(result.hasMore),
      pending: Boolean(result.pending),
      suggestions: clone(result.suggestions || []),
      intent: clone(result.intent || null),
      queryId: result.queryId || id,
      pendingJobIds: pendingJobs().map((job) => job.id),
      cacheStatus: result.cacheStatus || "EMPTY",
      requestId: id,
      repositoryVersion: status.repositoryVersion || acceptedRepository.version?.() || "",
      poolStatus: status,
      poolShortageDiagnostics: shortageDiagnostics(status),
      diagnostics: clone({ ...emptyDiagnostics("search-v1"), ...(result.diagnostics || {}) }),
    };
  }

  function enqueueBuildJob(request) {
    const type = request.query ? "search-build" : jobTypeForRequest(request);
    return jobStore.enqueue({
      type,
      providerId: "wikivoyage",
      query: request.query || "",
      sourceIdentity: request.routeType || "",
    }).job;
  }

  function scheduleDestinationMedia(record, context) {
    if (!mediaService?.resolveDestinationMedia) return null;
    const job = jobStore.enqueue({
      type: "destination-media",
      providerId: record.source?.name || "",
      evidenceHash: record.id,
      sourceIdentity: record.source?.url || record.id,
    }).job;
    if (runningDestinationJobs.has(job.id)) return job;
    runningDestinationJobs.add(job.id);
    const task = new Promise((resolve) => { setTimeout(resolve, 0); }).then(async () => {
      jobStore.transition(job.id, "resolvingDestinationImages");
      try {
        const media = await mediaService.resolveDestinationMedia(record, { deadlineAt: Date.now() + DETAIL_MEDIA_JOB_BUDGET_MS });
        const stillMissing = media.diagnostics?.missingDestinations || [];
        const nextRecord = {
          ...record,
          destinationAssets: media.destinationAssets || [],
          enrichmentStatus: stillMissing.length ? "enriched" : "mediaReady",
          repositoryStatus: stillMissing.length ? "accepted" : "mediaReady",
          mediaReadyAt: stillMissing.length ? record.mediaReadyAt : new Date().toISOString(),
        };
        acceptedRepository.upsert(nextRecord);
        cache.set(`route:${record.id}:media`, clone(nextRecord));
        jobStore.transition(job.id, stillMissing.length ? "deferred" : "mediaReady", stillMissing.length ? { missingDestinations: stillMissing } : null);
      } catch (error) {
        jobStore.transition(job.id, "failed", { reason: error.message });
      } finally {
        runningDestinationJobs.delete(job.id);
      }
    });
    if (typeof context.waitUntil === "function") context.waitUntil(task);
    else queueMicrotask(() => task.catch(() => null));
    return job;
  }

  async function discoverDetail(request, context) {
    const startedAt = Date.now();
    const id = context.requestId || requestId();
    if (request.searchSessionId || request.queryId || request.source === "search") {
      searchAnalytics?.logDetailClick?.({
        routeId: request.routeId,
        routeStatus: "accepted",
        searchSessionId: request.searchSessionId || null,
        queryId: request.queryId || null,
        source: request.source || "",
      });
    }
    const diagnostics = emptyDiagnostics("accepted-repository");
    const record = normalizeDiscoveredRoutes(acceptedRepository.get(request.routeId) ? [acceptedRepository.get(request.routeId)] : [], 1)[0];
    if (!record) throw new RouteDiscoveryError("ROUTE_NOT_FOUND", `Route ${request.routeId} was not found in Accepted Repository.`, { status: 404 });
    const invariant = validateEmbeddedRouteIntent(record, {
      source: "accepted-route-detail",
      allowLegacyUnbound: true,
    });
    if (!invariant.matched) {
      throw new RouteDiscoveryError("ROUTE_NOT_FOUND", `Route ${request.routeId} failed route intent validation.`, { status: 404 });
    }
    const missing = missingDestinations(record);
    diagnostics.missingDestinations = missing;
    diagnostics.partial = missing.length > 0;
    if (missing.length) {
      const job = scheduleDestinationMedia(record, context);
      diagnostics.deferred.push({
        routeId: record.id,
        stage: "destination-image",
        reason: "destination-media-job-required",
        missingDestinations: missing,
        jobId: job?.id || "",
      });
    }
    const normalized = {
      ...record,
      enrichmentStatus: missing.length ? "enriched" : "mediaReady",
      repositoryStatus: missing.length ? "accepted" : "mediaReady",
    };
    diagnostics.timings.responseBuildMs = Date.now() - startedAt;
    return detailResponse(normalized, "REPOSITORY", id, diagnostics);
  }

  async function discoverSearchDetail(request, context) {
    const id = context.requestId || requestId();
    const diagnostics = emptyDiagnostics("search-v1-cache");
    const record = routeSearchService.getSearchRoute(request.routeId);
    if (!record) throw new RouteDiscoveryError("ROUTE_NOT_FOUND", `Route ${request.routeId} was not found in Search Cache.`, { status: 404 });
    const invariant = validateEmbeddedRouteIntent(record, {
      source: "search-route-detail",
      allowLegacyUnbound: false,
    });
    if (!invariant.matched) {
      throw new RouteDiscoveryError("ROUTE_NOT_FOUND", `Route ${request.routeId} failed route intent validation.`, { status: 404 });
    }
    searchAnalytics?.logDetailClick?.({
      routeId: request.routeId,
      routeStatus: record.searchStatus || "search-generated",
      searchSessionId: request.searchSessionId || null,
      queryId: request.queryId || record.searchQueryId || null,
      source: request.source || "search",
    });
    diagnostics.cacheHit = true;
    diagnostics.timings.responseBuildMs = 0;
    return detailResponse(record, "SEARCH_CACHE", id, diagnostics);
  }

  async function discoverFeed(request, context) {
    const startedAt = Date.now();
    const id = context.requestId || requestId();
    const page = request.query
      ? acceptedSearchIndex.search({
        query: request.query,
        cursor: request.cursor,
        limit: request.limit,
        excludeIds: request.excludeIds,
        excludeClusters: request.excludeClusters,
        routeType: request.routeType,
      })
      : acceptedFeedBuffer.page({
        query: request.query,
        cursor: request.cursor,
        limit: request.limit,
        excludeIds: request.excludeIds,
        excludeClusters: request.excludeClusters,
        routeType: request.routeType,
        sessionId: request.sessionId,
      });
    const diagnostics = emptyDiagnostics("accepted-repository");
    const safeRecords = (page.records || []).filter((record) => {
      const invariant = validateEmbeddedRouteIntent(record, {
        source: "accepted-route-feed",
        allowLegacyUnbound: true,
      });
      if (invariant.matched) return true;
      diagnostics.deferred.push({
        stage: "route-intent-invariant",
        routeId: record?.id || "",
        reasonCodes: invariant.reasonCodes,
      });
      return false;
    });
    diagnostics.cacheHit = safeRecords.length > 0;
    diagnostics.partial = Boolean(page.pending);
    diagnostics.timings.responseBuildMs = Date.now() - startedAt;
    let pendingSearchJobId = page.pendingSearchJobId || null;
    let pending = Boolean(page.pending);
    const needsRefill = !request.query && acceptedFeedBuffer.needsRefill({
      query: request.query,
      excludeIds: request.excludeIds,
      routeType: request.routeType,
    });

    if (needsRefill || (request.query && page.pending)) {
      const job = enqueueBuildJob(request);
      let refill = null;
      if (!request.query && feedRefillWorker?.schedule) {
        refill = feedRefillWorker.schedule({
          request,
          job,
          reason: "accepted-pool-below-watermark",
        });
        if (refill?.promise) {
          if (typeof context.waitUntil === "function") context.waitUntil(refill.promise);
          else refill.promise.catch(() => null);
        }
      }
      diagnostics.deferred.push({
        stage: request.query ? "search-build" : "feed-refill",
        reason: request.query ? "accepted-search-partial-or-miss" : "accepted-pool-below-watermark",
        jobId: job.id,
        routeType: request.routeType || "",
        refillStarted: Boolean(refill?.started),
        refillReused: Boolean(refill?.reused),
      });
      if (request.query && !pendingSearchJobId) pendingSearchJobId = job.id;
      pending = true;
    }

    return response({
      records: safeRecords,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      returnedCount: safeRecords.length,
      remainingCount: page.remainingCount,
      paginationStatus: page.paginationStatus,
      pending,
      pendingSearchJobId,
      diagnostics,
    }, safeRecords.length ? "REPOSITORY" : "EMPTY", id);
  }

  async function discoverSearch(request, context) {
    const id = context.requestId || requestId();
    const result = await routeSearchService.search(request, { requestId: id, abortSignal: context.abortSignal || null });
    return searchResponse(result, id);
  }

  async function discover(input, context = {}) {
    const request = normalizeDiscoveryRequest(input);
    if (request.mode === "detail") return discoverDetail(request, context);
    if (request.mode === "search-detail") return discoverSearchDetail(request, context);
    if (request.mode === "search") return discoverSearch(request, context);
    return discoverFeed(request, context);
  }

  return { discover };
}
