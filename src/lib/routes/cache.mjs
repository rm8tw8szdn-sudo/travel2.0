import { RouteDiscoveryError } from "./errors.mjs";

export function createInMemoryTtlCache({ ttlMs = 5 * 60 * 1000, maxEntries = 1000, now = Date.now } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RouteDiscoveryError("INVALID_CACHE_TTL", "Cache TTL must be a positive number.");
  }
  if (typeof now !== "function") {
    throw new RouteDiscoveryError("INVALID_CLOCK", "Cache clock must be a function.");
  }
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new RouteDiscoveryError("INVALID_CACHE_CAPACITY", "Cache capacity must be a positive safe integer.");
  }

  const entries = new Map();

  function purgeExpired() {
    const timestamp = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= timestamp) entries.delete(key);
    }
  }

  return {
    get size() {
      purgeExpired();
      return entries.size;
    },
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      // Bound write-only workloads without scanning the cache on every write.
      // Replacing an entry refreshes its position in insertion eviction order.
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return value;
    },
    delete(key) {
      return entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

export const createInMemoryCacheProvider = createInMemoryTtlCache;
