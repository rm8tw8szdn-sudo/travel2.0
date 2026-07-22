import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "./cursor.mjs";
import { normalizeDiscoveredRoute } from "./contracts.mjs";
import { routeDedupeFingerprint, routeTitleKey } from "./route-dedupe.mjs";
import { buildRouteDestinationSuggestion } from "./route-destination-suggestion.mjs";
import { isRouteV2TimeIntentEnabled, parseSearchIntent } from "./search-intent-parser.mjs";
import { ensureSearchGeneratedMedia } from "./search-generated-media.mjs";
import { buildSearchGeneratedFallbackRoute } from "./search-generated-route-builder.mjs";

const DEFAULT_RANKING_WEIGHTS = {
  intentMatch: 100,
  qualityScore: 18,
  travelValue: 12,
  goldCaseSimilarity: 8,
  freshness: 4,
  popularity: 1,
};

function clone(value) {
  return structuredClone(value);
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function lower(value) {
  return clean(value).toLocaleLowerCase("zh-CN");
}

function list(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
  const numbers = values.map((item) => number(item, NaN)).filter((item) => Number.isFinite(item));
  return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : 0;
}

function recordText(record) {
  return [
    record?.name,
    record?.canonicalTitle,
    record?.sourceTitle,
    ...(record?.countries || []),
    ...(record?.destinations || []),
    ...(record?.countryEntities || []).flatMap((item) => [item.name, item.countryCode]),
    ...(record?.destinationEntities || []).flatMap((item) => [item.name, item.sourceTitle, item.countryCode]),
    ...(record?.themes || []),
    ...(record?.tags || []),
    ...(record?.highlights || []),
    record?.summary,
    record?.recommendationText,
    ...(record?.plannerReason || []).map((item) => item?.text),
    record?.travelStyle,
    record?.travelStyleConceptKey,
    record?.durationBand,
  ].map(lower).filter(Boolean).join(" ");
}

function keywordMatchReason(query, record) {
  const keyword = lower(query);
  if (!keyword) return "";
  const text = recordText(record);
  if (!text.includes(keyword)) return "";
  const title = lower(record?.name || record?.canonicalTitle);
  const destinations = list(record?.destinations).map(lower);
  const countries = [
    ...(record?.countries || []),
    ...(record?.countryEntities || []).flatMap((item) => [item?.name, item?.countryCode]),
  ].map(lower);
  if (title.includes(keyword)) return `标题匹配：${clean(query)}`;
  if (destinations.some((item) => item.includes(keyword))) return `目的地匹配：${clean(query)}`;
  if (countries.some((item) => item.includes(keyword))) return `国家/地区匹配：${clean(query)}`;
  return `内容匹配：${clean(query)}`;
}

function rankKeywordAcceptedRoutes(records, query, { routeType = "", now }) {
  const keyword = lower(query);
  if (!keyword) return [];
  return records
    .filter((record) => !routeType || routeKind(record) === routeType)
    .map((record) => {
      const reason = keywordMatchReason(keyword, record);
      if (!reason) return null;
      const titleBoost = lower(record?.name || record?.canonicalTitle).includes(keyword) ? 5 : 0;
      const destinationBoost = list(record?.destinations).some((item) => lower(item).includes(keyword)) ? 3 : 0;
      return {
        record,
        score: 50 + titleBoost + destinationBoost + qualityScore(record) * 10 + freshnessScore(record, now),
        intentScore: 1,
        matchReason: reason,
        status: "accepted",
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || String(left.record.id).localeCompare(String(right.record.id)));
}

function durationMatchScore(intent, record) {
  if (!intent.durationDays) return 0;
  const days = number(record?.durationDays || String(record?.recommendedDays || "").match(/\d+/u)?.[0], 0);
  if (!days) return 0;
  const delta = Math.abs(days - intent.durationDays);
  if (delta === 0) return 1;
  if (delta <= 1) return 0.75;
  if (delta <= 2) return 0.45;
  return 0;
}

function hasCountry(intent, record) {
  if (!intent.countryCode) return false;
  return (record?.countryEntities || []).some((item) => clean(item.countryCode).toUpperCase() === intent.countryCode);
}

function hasRegion(intent, record) {
  if (!intent.region && !intent.normalizedRegion) return true;
  const text = recordText(record);
  const aliasesByRegion = {
    sahara: ["撒哈拉", "西撒哈拉", "sahara", "western sahara"],
    kansai: ["关西", "kansai"],
    hokkaido: ["北海道", "hokkaido"],
    "golden circle": ["黄金圈", "golden circle"],
    cappadocia: ["卡帕多奇亚", "cappadocia"],
  };
  const aliases = unique([
    intent.region,
    intent.normalizedRegion,
    ...(aliasesByRegion[clean(intent.normalizedRegion)] || []),
  ]).map(lower);
  return aliases.some((alias) => alias && text.includes(alias));
}

function cityMatches(intent, text) {
  return list(intent.cities).filter((city) => text.includes(lower(city))).length;
}

function intentMatch(intent, record) {
  const text = recordText(record);
  let score = 0;
  const reasons = [];
  if (intent.countryCode && hasCountry(intent, record)) {
    score += 3;
    reasons.push(`国家匹配：${intent.country}`);
  }
  const cityHitCount = cityMatches(intent, text);
  if (cityHitCount) {
    score += 1.5 * cityHitCount;
    reasons.push(`城市匹配：${intent.cities.filter((city) => text.includes(lower(city))).join(" / ")}`);
  }
  if (intent.region && text.includes(lower(intent.region))) {
    score += 1.25;
    reasons.push(`区域匹配：${intent.region}`);
  }
  const durationScore = durationMatchScore(intent, record);
  if (durationScore) {
    score += durationScore;
    reasons.push(`天数接近：${intent.durationDays}天`);
  }
  if (intent.theme && text.includes(lower(intent.theme))) {
    score += 1.25;
    reasons.push(`主题匹配：${intent.theme}`);
  }
  if (intent.season && text.includes(lower(intent.season))) {
    score += 1;
    reasons.push(`季节匹配：${intent.season}`);
  }
  if (intent.travelStyle && [record?.travelStyle, record?.travelStyleConceptKey, record?.concept?.travelStyle].map(clean).includes(intent.travelStyle)) {
    score += 1.25;
    reasons.push(`风格匹配：${intent.travelStyleLabel || intent.travelStyle}`);
  } else if (intent.tripIntent === "first-trip" && /classic|first|入门|经典|第一次/u.test(text)) {
    score += 1;
    reasons.push("意图匹配：首次旅行");
  }
  if (intent.transport && text.includes(lower(intent.transportLabel || intent.transport))) {
    score += 1;
    reasons.push(`交通匹配：${intent.transportLabel || intent.transport}`);
  }
  return { score, reasons };
}

function qualityScore(record) {
  if (Number.isFinite(Number(record?.qualityScore))) return Number(record.qualityScore);
  return average(Object.values(record?.compositionScore || {}));
}

function travelValueScore(record) {
  return Math.min(1, (
    list(record?.highlights).length * 0.15
    + (clean(record?.recommendationText || record?.summary) ? 0.35 : 0)
    + list(record?.destinationEntities).length * 0.08
  ));
}

function goldCaseSimilarity(intent, record) {
  if (!intent.travelStyle) return 0;
  return [record?.travelStyle, record?.travelStyleConceptKey, record?.concept?.travelStyle].map(clean).includes(intent.travelStyle) ? 1 : 0;
}

function freshnessScore(record, now) {
  const timestamp = Date.parse(record?.mediaReadyAt || record?.acceptedAt || "");
  if (!timestamp) return 0;
  const ageDays = Math.max(0, (now() - timestamp) / (24 * 60 * 60 * 1000));
  return Math.max(0, 1 - ageDays / 365);
}

function routeKind(record) {
  const countryCodes = new Set((record?.countryEntities || []).map((item) => item.countryCode).filter(Boolean));
  return countryCodes.size > 1 ? "cross" : countryCodes.size === 1 ? "single" : "";
}

function searchSourceKey(record) {
  if (!record?.source?.url) return "";
  try {
    const url = new URL(record.source.url);
    return `${url.hostname}${url.pathname}`.toLocaleLowerCase("en-US").replace(/\/+$/u, "");
  } catch {
    return lower(record.source.url);
  }
}

function isStrongSearchDuplicate(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const aSource = searchSourceKey(a);
  const bSource = searchSourceKey(b);
  if (aSource && bSource && aSource === bSource) return true;
  if (a.dedupeFingerprint && b.dedupeFingerprint && a.dedupeFingerprint === b.dedupeFingerprint) return true;
  const aFingerprint = routeDedupeFingerprint(a);
  const bFingerprint = routeDedupeFingerprint(b);
  if (aFingerprint && bFingerprint && aFingerprint === bFingerprint) return true;
  const aTitle = routeTitleKey(a);
  const bTitle = routeTitleKey(b);
  return Boolean(aTitle && bTitle && aTitle === bTitle);
}

function rankRecord(record, intent, weights, now) {
  const match = intentMatch(intent, record);
  const score = (
    match.score * weights.intentMatch
    + qualityScore(record) * weights.qualityScore
    + travelValueScore(record) * weights.travelValue
    + goldCaseSimilarity(intent, record) * weights.goldCaseSimilarity
    + freshnessScore(record, now) * weights.freshness
  );
  return {
    record,
    score,
    intentScore: match.score,
    matchReason: match.reasons.length ? match.reasons.join("；") : "与当前旅行意图相近",
  };
}

function rankAcceptedRoutes(records, intent, { routeType = "", weights, now }) {
  return records
    .filter((record) => !routeType || routeKind(record) === routeType)
    .filter((record) => !intent.countryCode || hasCountry(intent, record))
    .filter((record) => hasRegion(intent, record))
    .map((record) => rankRecord(record, intent, weights, now))
    .filter((item) => item.intentScore > 0)
    .sort((left, right) => right.score - left.score || String(left.record.id).localeCompare(String(right.record.id)));
}

function dedupeRanked(items) {
  const accepted = [];
  for (const item of items) {
    if (!item?.record?.id) continue;
    const duplicateIndex = accepted.findIndex((existing) => isStrongSearchDuplicate(existing.record, item.record));
    if (duplicateIndex >= 0) {
      if (item.score > accepted[duplicateIndex].score) accepted[duplicateIndex] = item;
      continue;
    }
    accepted.push(item);
  }
  return accepted;
}

function decorateRecord(record, { status, matchReason, queryId, intentHash }) {
  return {
    ...clone(record),
    searchStatus: status,
    matchReason,
    searchQueryId: queryId,
    searchIntentHash: intentHash,
  };
}

function isRouteGenerationV2Record(record = {}) {
  return clean(record.generationVersion).startsWith("route-generation-v2-")
    || clean(record.v2PublicationStatus).startsWith("blocked-")
    || clean(record.v2PublicationStatus) === "v2-not-publishable-yet"
    || clean(record.v2PublicationStatus) === "ready-for-display";
}

function preserveGenerationMetadata(record, source = {}) {
  if (!record) return null;
  const generationVersion = clean(source.generationVersion);
  const selectedCandidateId = clean(source.selectedCandidateId);
  const decisionTraceId = clean(source.decisionTraceId);
  const intentId = clean(source.intentId);
  const v2Record = generationVersion.startsWith("route-generation-v2-");
  const v2PublicationStatus = clean(source.v2PublicationStatus);
  return {
    ...record,
    ...(generationVersion ? { generationVersion } : {}),
    ...(selectedCandidateId ? { selectedCandidateId } : {}),
    ...(decisionTraceId ? { decisionTraceId } : {}),
    ...(intentId ? { intentId } : {}),
    ...(v2Record || v2PublicationStatus
      ? { v2PublicationStatus: v2PublicationStatus || "v2-not-publishable-yet" }
      : {}),
  };
}

function generatedStatus(record, autoAcceptGenerated) {
  if (isRouteGenerationV2Record(record)) return clean(record.v2PublicationStatus) === "ready-for-display" ? "ready-for-display" : "needs-review";
  if (autoAcceptGenerated) return "accepted";
  if (record?.enrichmentStatus === "needsEvidence" || record?.contentQualityStatus !== "accepted") return "needs-review";
  return "search-generated";
}

function parseSearchCursor(cursor) {
  if (!cursor) return null;
  const decoded = decodeDiscoveryCursor(cursor);
  return decoded.provider === "search-v1" ? decoded : null;
}

function pageFromSnapshot(records, { cursor = null, limit = 20, intentHash = "" } = {}) {
  const parsed = parseSearchCursor(cursor);
  const ids = parsed?.intentHash === intentHash && Array.isArray(parsed.ids)
    ? parsed.ids.map(clean).filter(Boolean)
    : records.map((record) => record.id);
  const index = parsed?.intentHash === intentHash ? Math.max(0, number(parsed.nextIndex, 0)) : 0;
  const byId = new Map(records.map((record) => [record.id, record]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const page = ordered.slice(index, index + limit);
  const nextIndex = index + page.length;
  return {
    records: page,
    nextCursor: nextIndex < ordered.length
      ? encodeDiscoveryCursor({ provider: "search-v1", intentHash, ids, nextIndex })
      : null,
    hasMore: nextIndex < ordered.length,
  };
}

function withTimeout(task, timeoutMs, abortSignal = null) {
  if (abortSignal?.aborted) return Promise.resolve({ aborted: true, timedOut: false, result: null });
  let timer = null;
  let abortHandler = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true, result: null }), timeoutMs);
  });
  const aborted = abortSignal
    ? new Promise((resolve) => {
      abortHandler = () => resolve({ aborted: true, timedOut: false, result: null });
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    })
    : null;
  const promise = Promise.resolve().then(task);
  return Promise.race([
    promise.then((result) => ({ timedOut: false, result })).catch((error) => ({ timedOut: false, error })),
    timeout,
    ...(aborted ? [aborted] : []),
  ]).finally(() => {
    clearTimeout(timer);
    if (abortSignal && abortHandler) abortSignal.removeEventListener("abort", abortHandler);
  });
}

function plannerContextFromIntent(intent, deadlineAt, abortSignal = null, { destinationSuggestion = null } = {}) {
  const suggested = destinationSuggestion && typeof destinationSuggestion === "object" ? destinationSuggestion : null;
  const countryCode = suggested?.countryCode || intent.countryCode;
  const countryName = suggested?.countryName || intent.country;
  const cities = suggested?.cities || (Array.isArray(intent.cities) ? intent.cities : []);
  const normalizedCities = suggested?.normalizedCities || (Array.isArray(intent.normalizedCities) ? intent.normalizedCities : []);
  const travelStyle = intent.intentMode && !intent.travelStyle && Number(intent.durationDays) > 0 && Number(intent.durationDays) <= 3
    ? "city-break"
    : intent.travelStyle || undefined;
  return {
    intentId: suggested ? `${intent.intentHash}-${suggested.seed.slice(0, 12)}` : intent.intentHash,
    baseIntentId: intent.intentHash,
    intentMode: intent.intentMode || "",
    rawQuery: intent.rawQuery || "",
    country: countryCode,
    countryCode,
    countryName,
    cities: [...cities],
    normalizedCities: [...normalizedCities],
    targetCities: suggested ? [] : [...normalizedCities],
    ...(Array.isArray(intent.requiredDestinationIds) ? {
      requiredDestinationIds: [...intent.requiredDestinationIds],
      requiredDestinationNames: [...(intent.requiredDestinationNames || [])],
      requiredDestinationRaw: [...(intent.requiredDestinationRaw || [])],
      destinationOrderMode: intent.destinationOrderMode || "unspecified",
      destinationDiagnostics: structuredClone(intent.destinationDiagnostics || []),
    } : {}),
    ...(suggested ? {
      candidateSeed: suggested.seed,
      destinationSuggestion: structuredClone(suggested),
    } : {}),
    durationDays: intent.durationDays || undefined,
    durationBand: intent.durationBand || undefined,
    travelStyle,
    theme: intent.theme || undefined,
    season: intent.season || undefined,
    ...(intent.timeIntent ? { timeIntent: structuredClone(intent.timeIntent) } : {}),
    transport: intent.transport || undefined,
    transportPreference: intent.transport ? [intent.transport] : [],
    budgetConstraint: intent.budget || null,
    region: intent.region || undefined,
    designStrategies: [
      "Geographic",
      intent.theme ? "Theme" : "",
      intent.season ? "Season" : "",
      intent.transport ? "Transport" : "",
      "Efficiency",
    ].filter(Boolean),
    deadlineAt,
    abortSignal,
    quota: { limits: { llm: 1, planner: 1 }, usage: { llm: 0, planner: 0 } },
  };
}

export function createRouteSearchService({
  acceptedRepository,
  searchCache,
  analytics = null,
  planner = null,
  intentCatalog = null,
  now = () => Date.now(),
  env = process.env,
  rankingWeights = DEFAULT_RANKING_WEIGHTS,
} = {}) {
  if (!acceptedRepository?.list) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  if (!searchCache?.get || !searchCache?.put) throw new Error("SEARCH_CACHE_REQUIRED");
  const plannerTimeoutMs = Math.max(1, Number(env.SEARCH_PLANNER_TIMEOUT_MS || 2000));
  const maxPlannerCalls = Math.max(0, Number(env.SEARCH_MAX_PLANNER_CALLS_PER_REQUEST || 1));
  const autoAcceptGenerated = String(env.SEARCH_AUTO_ACCEPT_GENERATED || "false").toLocaleLowerCase("en-US") === "true";

  async function search(request = {}, context = {}) {
    const startedAt = now();
    const queryId = context.requestId || `search-${startedAt}-${Math.random().toString(36).slice(2)}`;
    const acceptedSnapshot = acceptedRepository.list({ limit: 100_000 }).records;
    const intent = parseSearchIntent(request.query, {
      acceptedRoutes: acceptedSnapshot,
      catalogs: intentCatalog,
      timeIntentEnabled: isRouteV2TimeIntentEnabled(env),
    });
    const destinationSuggestionResult = intent.intentMode === "destination-suggestion"
      ? buildRouteDestinationSuggestion({
        intent,
        sessionId: request.sessionId || intent.intentHash,
        acceptedRoutes: acceptedRepository.list({
          limit: 99_999,
          sessionId: request.sessionId || intent.intentHash,
          routeType: request.routeType || "",
        }).records,
        intentCatalog,
      })
      : null;
    const destinationSuggestion = destinationSuggestionResult?.ready
      ? destinationSuggestionResult.suggestion
      : null;
    if (destinationSuggestionResult) {
      intent.destinationSuggestionStatus = destinationSuggestionResult.reason;
      intent.destinationSuggestion = destinationSuggestion ? structuredClone(destinationSuggestion) : null;
    }
    let acceptedHit = false;
    let cacheHit = false;
    let plannerCalled = false;
    let plannerTimeout = false;
    let plannerAborted = false;
    let plannerError = "";
    let cacheItem = null;
    let generatedRecords = [];
    let ranked = [];

    if (!intent.parseSuccess) {
      const keywordRanked = intent.intentMode
        ? []
        : dedupeRanked(rankKeywordAcceptedRoutes(acceptedSnapshot, request.query, {
        routeType: request.routeType,
        now,
      })).slice(0, intent.targetResultCount || 10);
      if (keywordRanked.length && !intent.isChinaBlocked) {
        const merged = keywordRanked.map((item) => decorateRecord(item.record, {
          status: "accepted",
          matchReason: item.matchReason,
          queryId,
          intentHash: intent.intentHash,
        }));
        const page = pageFromSnapshot(merged, {
          cursor: request.cursor,
          limit: request.limit || 20,
          intentHash: intent.intentHash,
        });
        analytics?.logSearch?.({
          query: request.query || "",
          normalizedIntent: intent,
          constraintCount: intent.constraintCount,
          acceptedHit: true,
          cacheHit: false,
          plannerCalled: false,
          plannerTimeout: false,
          resultCount: page.records.length,
          suggestionsCount: intent.suggestions.length,
          durationMs: now() - startedAt,
          queryId,
          searchSessionId: request.sessionId || null,
          diagnostics: { reason: "keyword-fallback" },
        });
        return {
          records: page.records,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          pending: false,
          suggestions: intent.suggestions,
          intent: { ...intent, parseSuccess: true, keywordFallback: true },
          queryId,
          diagnostics: {
            source: "search-v1-keyword-fallback",
            acceptedHit: true,
            cacheHit: false,
            plannerCalled: false,
            plannerTimeout: false,
            targetResultCount: intent.targetResultCount,
            durationMs: now() - startedAt,
          },
          cacheStatus: "REPOSITORY",
        };
      }
      const diagnostics = {
        reason: intent.isChinaBlocked ? "china-blocked" : intent.failureReason || "intent-parse-failed",
      };
      analytics?.logSearch?.({
        query: request.query || "",
        normalizedIntent: intent,
        constraintCount: intent.constraintCount,
        acceptedHit: false,
        cacheHit: false,
        plannerCalled: false,
        plannerTimeout: false,
        resultCount: 0,
        suggestionsCount: intent.suggestions.length,
        durationMs: now() - startedAt,
        queryId,
        searchSessionId: request.sessionId || null,
        diagnostics,
      });
      return {
        records: [],
        nextCursor: null,
        hasMore: false,
        pending: false,
        suggestions: intent.suggestions,
        intent,
        queryId,
        diagnostics,
        cacheStatus: "EMPTY",
      };
    }

    ranked = rankAcceptedRoutes(acceptedSnapshot, intent, {
      routeType: request.routeType,
      weights: rankingWeights,
      now,
    });
    if (!ranked.length) {
      ranked = dedupeRanked(rankKeywordAcceptedRoutes(acceptedSnapshot, request.query, {
        routeType: request.routeType,
        now,
      }));
    }
    acceptedHit = ranked.length > 0;

    const destinationSuggestionMode = intent.intentMode === "destination-suggestion";
    const plannerEligible = intent.canGenerate && (!destinationSuggestionMode || Boolean(destinationSuggestion));
    const cacheIntent = destinationSuggestion
      ? {
        ...intent,
        intentHash: `${intent.intentHash}-${destinationSuggestion.seed.slice(0, 12)}`,
        intentKey: `${intent.intentKey}|session:${destinationSuggestion.seed.slice(0, 12)}`,
      }
      : intent;
    if (destinationSuggestionMode || ranked.length < intent.targetResultCount) {
      cacheItem = destinationSuggestionMode ? null : searchCache.get(cacheIntent.intentHash);
      cacheHit = Boolean(cacheItem);
      if (cacheItem) {
        generatedRecords = (cacheItem.records || [])
          .map((record) => {
            const normalized = preserveGenerationMetadata(normalizeDiscoveredRoute(record), record);
            if (!normalized) return null;
            const status = isRouteGenerationV2Record(normalized)
              ? "needs-review"
              : record.searchStatus === "accepted" ? "accepted" : generatedStatus(normalized, false);
            return { ...normalized, searchStatus: status || cacheItem.status || "search-generated" };
          })
          .filter(Boolean);
      } else if (plannerEligible && planner?.buildCandidates && maxPlannerCalls > 0 && !context.abortSignal?.aborted) {
        plannerCalled = true;
        const deadlineAt = now() + plannerTimeoutMs;
        const result = await withTimeout(
          () => planner.buildCandidates({
            limit: 1,
            context: plannerContextFromIntent(intent, deadlineAt, context.abortSignal || null, { destinationSuggestion }),
          }),
          plannerTimeoutMs,
          context.abortSignal || null,
        );
        plannerTimeout = Boolean(result.timedOut);
        plannerAborted = Boolean(result.aborted);
        plannerError = clean(result.error?.message || result.error || "");
        if (!plannerTimeout && !plannerAborted && result.result?.accepted?.length) {
          generatedRecords = result.result.accepted
            .map((item) => preserveGenerationMetadata(normalizeDiscoveredRoute(item.record), item.record))
            .filter(Boolean)
            .map((record) => {
              const status = generatedStatus(record, autoAcceptGenerated);
              return ensureSearchGeneratedMedia({
                ...record,
                searchStatus: status,
                contentQualityStatus: record.contentQualityStatus || "accepted",
                ...(isRouteGenerationV2Record(record) ? { v2PublicationStatus: record.v2PublicationStatus || "v2-not-publishable-yet" } : {}),
              });
            });
        } else if (!destinationSuggestionMode && !plannerTimeout && !plannerAborted && !result.error) {
          const fallback = normalizeDiscoveredRoute(buildSearchGeneratedFallbackRoute(intent));
          generatedRecords = fallback ? [ensureSearchGeneratedMedia({ ...fallback, searchStatus: "needs-review" })] : [];
        }
        if (generatedRecords.length) {
            const v2BlockedRecords = generatedRecords.filter((record) => isRouteGenerationV2Record(record) && record.v2PublicationStatus !== "ready-for-display");
            const cacheStatus = generatedRecords.some((record) => record.searchStatus === "needs-review")
              ? "needs-review"
              : generatedRecords.every((record) => record.searchStatus === "accepted") ? "accepted" : "search-generated";
            searchCache.put({
              intent: cacheIntent,
              records: generatedRecords,
              sourceQuery: request.query,
              status: cacheStatus,
              plannerMeta: {
                timeoutMs: plannerTimeoutMs,
                autoAcceptGenerated,
                ...(v2BlockedRecords.length ? { v2PromotionBlocked: v2BlockedRecords.length, v2PromotionReason: "v2-not-publishable-yet" } : {}),
              },
            });
            searchCache.appendReviewCandidates({
              intent: cacheIntent,
              records: generatedRecords,
              queryId,
              plannerMeta: {
                timeoutMs: plannerTimeoutMs,
                autoAcceptGenerated,
                ...(v2BlockedRecords.length ? { v2PromotionBlocked: v2BlockedRecords.length, v2PromotionReason: "v2-not-publishable-yet" } : {}),
              },
            });
            if (autoAcceptGenerated) {
              for (const record of generatedRecords) {
                if (isRouteGenerationV2Record(record)) continue;
                acceptedRepository.upsert?.(record);
              }
            }
        }
      } else if (plannerEligible && !destinationSuggestionMode && !context.abortSignal?.aborted) {
        const fallback = normalizeDiscoveredRoute(buildSearchGeneratedFallbackRoute(intent));
        generatedRecords = fallback ? [ensureSearchGeneratedMedia({ ...fallback, searchStatus: "needs-review" })] : [];
        if (generatedRecords.length) {
          searchCache.put({
            intent,
            records: generatedRecords,
            sourceQuery: request.query,
            status: "needs-review",
            plannerMeta: { timeoutMs: plannerTimeoutMs, autoAcceptGenerated, fallbackReason: "planner-unavailable" },
          });
          searchCache.appendReviewCandidates({
            intent,
            records: generatedRecords,
            queryId,
            plannerMeta: { timeoutMs: plannerTimeoutMs, autoAcceptGenerated, fallbackReason: "planner-unavailable" },
          });
        }
      }
    }

    const generatedRanked = generatedRecords.map((record) => ({
      ...rankRecord(record, intent, rankingWeights, now),
      status: record.searchStatus === "needs-review" ? "needs-review" : record.searchStatus === "accepted" ? "accepted" : "search-generated",
    }));
    const acceptedRanked = ranked.map((item) => ({ ...item, status: "accepted" }));
    const merged = dedupeRanked([...acceptedRanked, ...generatedRanked])
      .sort((left, right) => right.score - left.score || String(left.record.id).localeCompare(String(right.record.id)))
      .slice(0, intent.targetResultCount)
      .map((item) => decorateRecord(item.record, {
        status: item.status,
        matchReason: item.matchReason,
        queryId,
        intentHash: intent.intentHash,
      }));
    const page = pageFromSnapshot(merged, {
      cursor: request.cursor,
      limit: request.limit || 20,
      intentHash: intent.intentHash,
    });
    analytics?.logSearch?.({
      query: request.query || "",
      normalizedIntent: intent,
      constraintCount: intent.constraintCount,
      acceptedHit,
      cacheHit,
      plannerCalled,
      plannerTimeout,
      plannerAborted,
      plannerError,
      resultCount: page.records.length,
      totalResultCount: merged.length,
      suggestionsCount: intent.suggestions.length,
      durationMs: now() - startedAt,
      queryId,
      searchSessionId: request.sessionId || null,
    });
    return {
      records: page.records,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      pending: false,
      suggestions: intent.suggestions,
      intent,
      queryId,
      diagnostics: {
        source: plannerCalled ? "search-v1-planner" : cacheHit ? "search-v1-cache" : "search-v1-accepted",
        acceptedHit,
        cacheHit,
        plannerCalled,
        plannerTimeout,
        plannerAborted,
        plannerError,
        destinationSuggestion: destinationSuggestion ? structuredClone(destinationSuggestion) : null,
        targetResultCount: intent.targetResultCount,
        durationMs: now() - startedAt,
      },
      cacheStatus: cacheHit ? "SEARCH_CACHE" : acceptedHit ? "REPOSITORY" : generatedRecords.length ? "SEARCH_GENERATED" : "EMPTY",
    };
  }

  function getSearchRoute(routeId) {
    return searchCache.findRoute(routeId)?.record || null;
  }

  return { search, getSearchRoute };
}
