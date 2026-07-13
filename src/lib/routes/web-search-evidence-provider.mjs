function clean(value) {
  return String(value || "").trim();
}

function snippet(value) {
  const cleaned = clean(value).replace(/\s+/g, " ");
  return cleaned.length > 600 ? `${cleaned.slice(0, 597).trim()}...` : cleaned;
}

function normalizeResult(result = {}, rank = 0) {
  return {
    sourceUrl: clean(result.sourceUrl || result.url || result.link),
    sourceTitle: clean(result.sourceTitle || result.title || result.name),
    sourceSnippet: snippet(result.sourceSnippet || result.snippet || result.description || result.content),
    rank: Number(result.rank ?? rank + 1),
  };
}

function resultsForQuery(injectedResults, query) {
  if (Array.isArray(injectedResults)) return injectedResults;
  if (injectedResults && typeof injectedResults === "object") return injectedResults[query] || [];
  return [];
}

function configured(apiUrl, apiKey) {
  return Boolean(apiUrl && apiKey);
}

function realSearchUrl(apiUrl) {
  return clean(apiUrl) || "https://api.tavily.com/search";
}

export function createWebSearchEvidenceProvider({
  mode = "injected",
  injectedResults = {},
  apiUrl = process.env.ROUTE_WEB_SEARCH_API_URL || "",
  apiKey = process.env.ROUTE_WEB_SEARCH_API_KEY || "",
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const realSearch = mode === "real-search";
  const endpoint = realSearchUrl(apiUrl);
  const canSearch = !realSearch || configured(endpoint, apiKey);
  return {
    providerId: "web-search",
    capabilities: {
      evidenceSource: true,
      realtimeUserRequest: false,
      producesRouteRecord: false,
      requiresApiKey: realSearch,
      configured: canSearch,
    },
    async searchEvidence({ query, limit = 10, signal } = {}) {
      const normalizedQuery = clean(query);
      if (!normalizedQuery) {
        return { mode, isRealSearch: realSearch, query: "", results: [], diagnostics: [{ reason: "empty-query" }] };
      }
      if (!realSearch) {
        const results = resultsForQuery(injectedResults, normalizedQuery)
          .slice(0, limit)
          .map(normalizeResult);
        return { mode: "injected", isRealSearch: false, query: normalizedQuery, retrievedAt: now(), results, diagnostics: [] };
      }
      if (!canSearch) {
        return {
          mode: "real-search",
          isRealSearch: false,
          query: normalizedQuery,
          retrievedAt: now(),
          results: [],
          diagnostics: [{ reason: "real-search-api-not-configured" }],
        };
      }
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: normalizedQuery,
          max_results: limit,
          search_depth: "basic",
          include_answer: true,
          include_raw_content: false,
        }),
        signal,
      });
      if (!response.ok) {
        return {
          mode: "real-search",
          isRealSearch: true,
          query: normalizedQuery,
          retrievedAt: now(),
          results: [],
          diagnostics: [{ reason: `search-api-${response.status}` }],
        };
      }
      const payload = await response.json();
      const rawResults = Array.isArray(payload) ? payload : payload.results || payload.items || [];
      return {
        mode: "real-search",
        isRealSearch: true,
        query: normalizedQuery,
        retrievedAt: now(),
        results: rawResults.slice(0, limit).map(normalizeResult),
        diagnostics: [],
      };
    },
  };
}
