export function createFeedBuffer({ repository, targetSize = 40 } = {}) {
  if (!repository?.list) throw new Error("ACCEPTED_REPOSITORY_REQUIRED");
  return {
    page({ query = "", cursor = null, limit = 20, excludeIds = [], excludeClusters = [], routeType = "", sessionId = "" } = {}) {
      return repository.list({ query, cursor, limit, excludeIds, excludeClusters, routeType, sessionId });
    },
    needsRefill({ query = "", excludeIds = [], routeType = "" } = {}) {
      const status = repository.status?.();
      if (!query && status && (routeType === "single" || routeType === "cross")) {
        return (status[routeType] || 0) < (status.targets?.[routeType] || targetSize);
      }
      return repository.list({ query, limit: targetSize, excludeIds, routeType }).records.length < targetSize;
    },
    status() {
      return repository.status?.() || { targetSize };
    },
  };
}
