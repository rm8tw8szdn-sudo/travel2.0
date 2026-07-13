export function createSearchIndex({ repository } = {}) {
  if (!repository?.list) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  return {
    search({ query = "", cursor = null, limit = 20, excludeIds = [], routeType = "" } = {}) {
      const result = repository.list({ query, cursor, limit, excludeIds, routeType });
      const normalizedQuery = String(query || "").trim().toLocaleLowerCase("zh-CN");
      const pending = Boolean(normalizedQuery && result.records.length < limit);
      return {
        ...result,
        pending,
        pendingSearchJobId: pending ? `search:${encodeURIComponent(normalizedQuery)}:${cursor || "0"}` : null,
      };
    },
  };
}
