import path from "node:path";
import { createRouteSearchCache } from "../src/lib/routes/index.mjs";

const cache = createRouteSearchCache({
  storagePath: process.env.SEARCH_CACHE_PATH || path.resolve(".route-v2-cache", "search-cache.json"),
  reviewPath: process.env.SEARCH_REVIEW_CANDIDATES_PATH || path.resolve(".route-v2-cache", "search-review-candidates.json"),
  ttlDays: Number(process.env.SEARCH_CACHE_TTL_DAYS || 30),
});

const result = cache.cleanup();
console.log(`Search cache cleanup complete: removed=${result.removed}, remaining=${result.remaining}`);
