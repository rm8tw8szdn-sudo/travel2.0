import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "./cursor.mjs";
import { RouteDiscoveryError } from "./errors.mjs";
import { createOnlineRouteStandardizer, createWikidataEntityResolver } from "./online-standardizer.mjs";

const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
let nextWikivoyageRequestAt = 0;

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function cleanTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function throttleWikivoyage(url) {
  if (!String(url).startsWith(WIKIVOYAGE_API)) return;
  const now = Date.now();
  const waitMs = Math.max(0, nextWikivoyageRequestAt - now);
  nextWikivoyageRequestAt = Math.max(nextWikivoyageRequestAt, now) + 450;
  if (waitMs) await wait(waitMs);
}

async function fetchWithRetry(fetchImpl, url, { basic = false, deadlineAt = 0, timeoutMs: requestedTimeoutMs = 0, maxAttempts = 0 } = {}) {
  let response;
  const attempts = maxAttempts || (basic ? 1 : 3);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await throttleWikivoyage(url);
      const remainingMs = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : 15_000;
      const timeoutMs = Math.max(1, Math.min(requestedTimeoutMs || (basic ? 2_500 : 15_000), remainingMs));
      response = await fetchImpl(url, { headers: { "Api-User-Agent": "TravelCollectionRouteV2/2.0 (https://github.com/rm8tw8szdn-sudo/travel-collection)" }, signal: globalThis.AbortSignal?.timeout?.(timeoutMs) });
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await wait(250 * (attempt + 1));
      continue;
    }
    if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    if (attempt < attempts - 1) {
      const retryAfter = Number(response.headers?.get?.("retry-after")) || 0;
      const retryMs = basic ? Math.max(retryAfter * 1000, 900 * (attempt + 1)) : Math.min(30_000, Math.max(retryAfter * 1000, 500 * (attempt + 1)));
      if (deadlineAt && Date.now() + retryMs >= deadlineAt) break;
      await wait(retryMs);
    }
  }
  return response;
}

async function json(fetchImpl, url, code = "LIVE_DISCOVERY_FAILED", policy = {}) {
  const attempts = policy.jsonAttempts || (policy.basic ? 2 : 3);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetchWithRetry(fetchImpl, url, policy);
    if (!response.ok) throw new RouteDiscoveryError(code, `Online source returned HTTP ${response.status}.`, { status: 502 });
    if (typeof response.text !== "function") {
      const payload = await response.json();
      if (payload.error) throw new RouteDiscoveryError(code, payload.error.info || "Online source failed.", { status: 502 });
      return payload;
    }
    const text = await response.text();
    if (/^\s*[\[{]/u.test(text)) {
      const payload = JSON.parse(text);
      if (payload.error) throw new RouteDiscoveryError(code, payload.error.info || "Online source failed.", { status: 502 });
      return payload;
    }
    if (!/too many requests/i.test(text) || attempt === attempts - 1) {
      throw new RouteDiscoveryError(code, "Online source returned a non-JSON response.", { status: 502 });
    }
    const retryMs = policy.basic ? 1_500 * (attempt + 1) : 4_000 * (attempt + 1);
    if (policy.deadlineAt && Date.now() + retryMs >= policy.deadlineAt) break;
    await wait(retryMs);
  }
  throw new RouteDiscoveryError(code, "Online source returned HTTP 429.", { status: 502 });
}

async function onlineQueries(fetchImpl, query, policy = {}) {
  const text = String(query || "").trim();
  if (!text || /^[\x00-\x7f]+$/.test(text)) return { queries: [text], targetEntityId: "" };
  try {
    const searchUrl = new URL(WIKIDATA_API);
    searchUrl.searchParams.set("origin", "*");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("action", "wbsearchentities");
    searchUrl.searchParams.set("search", text);
    searchUrl.searchParams.set("language", "zh");
    searchUrl.searchParams.set("limit", "1");
    const id = (await json(fetchImpl, searchUrl, "LIVE_DISCOVERY_FAILED", policy)).search?.[0]?.id;
    if (!id) return { queries: [text], targetEntityId: "" };
    const entityUrl = new URL(WIKIDATA_API);
    entityUrl.searchParams.set("origin", "*");
    entityUrl.searchParams.set("format", "json");
    entityUrl.searchParams.set("action", "wbgetentities");
    entityUrl.searchParams.set("ids", id);
    entityUrl.searchParams.set("props", "labels|aliases");
    entityUrl.searchParams.set("languages", "en");
    const entity = (await json(fetchImpl, entityUrl, "LIVE_DISCOVERY_FAILED", policy)).entities?.[id] || {};
    const queries = [...new Set([
      entity.labels?.en?.value,
      ...(entity.aliases?.en || []).map((item) => item.value),
    ].map((item) => String(item || "").trim()).filter((item) => item.length >= 4))].slice(0, 5).concat(text).filter((item, index, values) => values.indexOf(item) === index);
    return { queries, targetEntityId: id };
  } catch {
    return { queries: [text], targetEntityId: "" };
  }
}

async function basicSearchQueries(fetchImpl, query, policy = {}) {
  const text = String(query || "").trim();
  if (!text || /^[\x00-\x7f]+$/.test(text)) return { queries: [text], targetEntityId: "" };
  const searchUrl = new URL(WIKIDATA_API);
  searchUrl.searchParams.set("origin", "*");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("search", text);
  searchUrl.searchParams.set("language", "zh");
  searchUrl.searchParams.set("uselang", "en");
  searchUrl.searchParams.set("limit", "1");
  const deadlineAt = Math.min(policy.deadlineAt || Date.now() + 1_500, Date.now() + 1_500);
  const match = (await json(fetchImpl, searchUrl, "LIVE_DISCOVERY_FAILED", { ...policy, basic: true, deadlineAt }).catch(() => null))?.search?.[0];
  const label = match?.label;
  const countryHint = String(match?.description || "").match(/\b(?:city|town|municipality|village)\s+(?:of|in)\s+(?:the\s+)?([A-Z][A-Za-z .'-]+?)(?:,|$)/)?.[1];
  const queries = [...new Set([countryHint && label ? `${label} ${countryHint}` : "", label, text].map((item) => String(item || "").trim()).filter(Boolean))];
  return { queries, targetEntityId: match?.id || "" };
}

function requestUrl(request, upstreamContinue, query) {
  const url = new URL(WIKIVOYAGE_API);
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("action", "query");
  const upstreamLimit = Math.min(20, Math.max(request.limit, request.limit + Math.min(3, (request.excludeIds || []).length)));
  if (query) {
    const searchTerm = /\s/.test(query) ? `"${query.replaceAll('"', "").trim()}"` : query;
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrnamespace", "0");
    url.searchParams.set("gsrlimit", String(upstreamLimit));
    url.searchParams.set("gsrsearch", `${searchTerm} incategory:Itineraries`);
  } else {
    url.searchParams.set("generator", "categorymembers");
    url.searchParams.set("gcmtitle", "Category:Itineraries");
    url.searchParams.set("gcmnamespace", "0");
    url.searchParams.set("gcmlimit", String(upstreamLimit));
  }
  if (request.enrichmentMode === "basic") {
    url.searchParams.set("prop", "extracts|pageimages");
    url.searchParams.set("explaintext", "1");
    url.searchParams.set("exintro", "1");
    url.searchParams.set("piprop", "name|thumbnail");
    url.searchParams.set("pithumbsize", "1400");
  }
  Object.entries(upstreamContinue || {}).forEach(([key, value]) => {
    if (["continue", "gcmcontinue", "gsroffset"].includes(key) && value != null) url.searchParams.set(key, String(value));
  });
  return url;
}

function detailUrl(pageId) {
  const url = new URL(WIKIVOYAGE_API);
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("action", "query");
  url.searchParams.set("pageids", String(pageId));
  url.searchParams.set("prop", "extracts|categories|links|pageimages|pageprops|langlinks|revisions");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("cllimit", "50");
  url.searchParams.set("pllimit", "50");
  url.searchParams.set("piprop", "name|thumbnail");
  url.searchParams.set("lllang", "zh");
  url.searchParams.set("lllimit", "5");
  url.searchParams.set("pithumbsize", "1400");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  return url;
}

function exactTitleUrl(title) {
  const url = new URL(WIKIVOYAGE_API);
  url.searchParams.set("origin", "*");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("redirects", "1");
  url.searchParams.set("prop", "categories");
  url.searchParams.set("cllimit", "50");
  return url;
}

export function createLiveDiscoveryProvider({ fetchImpl = globalThis.fetch, standardizer = null } = {}) {
  if (typeof fetchImpl !== "function") throw new RouteDiscoveryError("INVALID_LIVE_FETCH", "Live discovery requires fetch.");
  const onlineStandardizer = standardizer || createOnlineRouteStandardizer({
    resolveLinkedEntities: createWikidataEntityResolver({ fetchImpl }),
  });
  const pageCache = new Map();
  const titleIndex = new Map();

  function rememberPage(page) {
    if (!page?.pageid || !page?.title) return;
    pageCache.set(String(page.pageid), page);
    titleIndex.set(cleanTitle(page.title), String(page.pageid));
  }

  async function getPage(pageId, options = {}) {
    const cached = pageCache.get(String(pageId));
    if (cached) return cached;
    const basic = options.enrichmentMode === "basic";
    const payload = await json(fetchImpl, detailUrl(pageId), "LIVE_DISCOVERY_FAILED", { basic, deadlineAt: options.deadlineAt || 0 });
    const page = payload.query?.pages?.[0];
    rememberPage(page);
    return !page || page.missing ? null : page;
  }

  async function getByPageId(pageId, preferredEntityId = "", preferredQuery = "", options = {}) {
    const page = await getPage(pageId, options);
    if (!page) return null;
    options.onPage?.(page);
    return onlineStandardizer.standardize(page, { preferredEntityId, preferredQuery, enrichmentMode: options.enrichmentMode || "full", deadlineAt: options.deadlineAt || 0 });
  }

  return {
    name: "wikivoyage-live",
    async getById(routeId, options = {}) {
      const pageId = /^wikivoyage-(\d+)$/.exec(routeId)?.[1];
      return pageId ? getByPageId(pageId, "", "", options) : null;
    },
    async getFactsById(routeId, options = {}) {
      const pageId = /^wikivoyage-(\d+)$/.exec(routeId)?.[1];
      if (!pageId) return null;
      const page = await getPage(pageId, { ...options, enrichmentMode: "full" });
      if (!page) return null;
      const route = await onlineStandardizer.standardize(page, { preferredEntityId: options.preferredEntityId || "", enrichmentMode: "full", deadlineAt: options.deadlineAt || 0 });
      if (!route) return null;
      return {
        routeId: route.id, source: route.source, sourceTitle: route.sourceTitle,
        extract: page.extract || "", categories: (page.categories || []).map((item) => item.title || ""),
        countryEntities: route.countryEntities, destinationEntities: route.destinationEntities,
        durationEvidence: { recommendedDays: route.recommendedDays, durationDays: route.durationDays, source: route.provenance?.duration?.provider },
        seasonEvidence: null, themesEvidence: route.themes || [], coverAsset: route.coverAsset || null,
      };
    },
    async discover(request) {
      const startedAt = Date.now();
      const basic = request.enrichmentMode === "basic";
      const policy = { basic, deadlineAt: request.deadlineAt || 0 };
      const decoded = decodeDiscoveryCursor(request.cursor);
      const continuation = decoded?.provider === "live" ? decoded.upstreamContinue : null;
      if (!request.cursor && request.query) {
        const indexedPageId = titleIndex.get(cleanTitle(request.query));
        if (indexedPageId && !(request.excludeIds || []).includes(`wikivoyage-${indexedPageId}`)) {
          const indexedRecord = await getByPageId(indexedPageId, "", request.query, request);
          if (indexedRecord) {
            return { records: [indexedRecord], nextCursor: null, hasMore: false };
          }
        }
        const exactPayload = await json(fetchImpl, exactTitleUrl(request.query), "LIVE_DISCOVERY_FAILED", { ...policy, maxAttempts: basic ? 2 : 0 }).catch((error) => {
          request.onRejected?.({
            title: request.query,
            sourceUrl: "",
            stage: "exact-title",
            reason: error.message,
            elapsedMs: Date.now() - startedAt,
          });
          return null;
        });
        const exactPage = (exactPayload?.query?.pages || []).find((page) => (
          !page.missing && (page.categories || []).some((item) => /itinerar/i.test(item.title || ""))
        ));
        if (exactPage?.pageid && !(request.excludeIds || []).includes(`wikivoyage-${exactPage.pageid}`)) {
          const exactRecord = await getByPageId(exactPage.pageid, "", request.query, request);
          if (exactRecord) {
            return {
              records: [exactRecord],
              nextCursor: null,
              hasMore: false,
            };
          }
        }
      }
      const queryPlan = decoded?.searchQuery
        ? { queries: [decoded.searchQuery], targetEntityId: decoded.searchEntityId || "" }
        : basic ? await basicSearchQueries(fetchImpl, request.query, policy) : await onlineQueries(fetchImpl, request.query, policy);
      const queries = queryPlan.queries;
      const targetEntityId = queryPlan.targetEntityId;
      const excluded = new Set(request.excludeIds || []);
      const records = [];
      const failures = [];
      const rejected = [];
      const deferred = [];
      let payload = {};
      let selectedQuery = queries[0] || "";
      for (const query of queries) {
        selectedQuery = query;
        payload = await json(fetchImpl, requestUrl(request, continuation, query), "LIVE_DISCOVERY_FAILED", { ...policy, timeoutMs: basic ? 2_800 : 0, maxAttempts: basic ? 3 : 0 });
        const observedNext = payload.continue && typeof payload.continue === "object"
          ? Object.fromEntries(Object.entries(payload.continue).filter(([key]) => ["continue", "gcmcontinue", "gsroffset"].includes(key)))
          : null;
        if (observedNext && (observedNext.gcmcontinue != null || observedNext.gsroffset != null)) {
          request.onCursor?.(encodeDiscoveryCursor({ provider: "live", upstreamContinue: observedNext, searchQuery: query, searchEntityId: targetEntityId }));
        }
        const pageItems = (payload.query?.pages || []).filter((page) => page.pageid);
        request.onCandidates?.(pageItems.map((page) => ({
          routeId: `wikivoyage-${page.pageid}`,
          title: page.title || "",
          sourceUrl: page.title ? `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` : "",
        })));
        const pageIds = pageItems.map((page) => page.pageid);
        const pageById = new Map(pageItems.map((page) => [page.pageid, page]));
        const processed = new Set();
        const batchSize = basic ? 4 : 1;
        for (let offset = 0; offset < pageIds.length; offset += batchSize) {
          if (request.deadlineAt && Date.now() >= request.deadlineAt) break;
          const batch = pageIds.slice(offset, offset + batchSize);
          const settled = await Promise.allSettled(batch.map((pageId) => {
            if (!basic) return getByPageId(pageId, targetEntityId, query, request);
            return onlineStandardizer.standardize(pageById.get(pageId), {
              preferredEntityId: targetEntityId,
              preferredQuery: query,
              enrichmentMode: "basic",
              deadlineAt: request.deadlineAt || 0,
            });
          }));
          settled.forEach((item, itemIndex) => {
            const pageId = batch[itemIndex];
            const page = pageById.get(pageId) || {};
            const identity = { routeId: `wikivoyage-${pageId}`, title: page.title || "", sourceUrl: page.title ? `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` : "", elapsedMs: Date.now() - startedAt };
            processed.add(pageId);
            if (item.status === "fulfilled") {
              const record = item.value;
              const entityMatch = basic || !targetEntityId || [
                ...(record?.countryEntities || []),
                ...(record?.destinationEntities || []),
              ].some((entity) => entity.wikidataId === targetEntityId);
              if (record && entityMatch && !excluded.has(record.id)) {
                records.push(record);
                request.onRecord?.(record);
              } else rejected.push({ ...identity, stage: "basic-normalize", reason: record ? "query-entity-mismatch-or-excluded" : "wikivoyage-basic-fields-incomplete" });
            } else {
              const reason = item.reason instanceof Error ? item.reason.message : String(item.reason);
              failures.push(reason);
              deferred.push({ ...identity, stage: "basic-normalize", reason });
            }
          });
          if (records.length >= request.limit) break;
        }
        pageItems.filter((page) => !processed.has(page.pageid)).forEach((page) => deferred.push({
          routeId: `wikivoyage-${page.pageid}`,
          title: page.title || "",
          sourceUrl: page.title ? `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` : "",
          stage: "basic-normalize",
          reason: "feed-deadline-before-normalize",
          elapsedMs: Date.now() - startedAt,
        }));
        if (records.length) break;
      }
      if (!basic && !records.length && failures.length) {
        throw new RouteDiscoveryError("ROUTE_STANDARDIZATION_FAILED", "Online routes could not be standardized.", {
          status: 502, details: failures,
        });
      }
      const next = payload.continue && typeof payload.continue === "object"
        ? Object.fromEntries(Object.entries(payload.continue).filter(([key]) => ["continue", "gcmcontinue", "gsroffset"].includes(key)))
        : null;
      const hasMore = Boolean(next && (next.gcmcontinue != null || next.gsroffset != null));
      const nextCursor = hasMore ? encodeDiscoveryCursor({ provider: "live", upstreamContinue: next, searchQuery: selectedQuery, searchEntityId: targetEntityId }) : null;
      if (nextCursor) request.onCursor?.(nextCursor);
      return {
        records: records.slice(0, request.limit),
        nextCursor,
        hasMore: hasMore || Boolean(request.deadlineAt && Date.now() >= request.deadlineAt),
        deferred,
        rejected,
      };
    },
  };
}
