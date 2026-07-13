import fs from "node:fs";
import path from "node:path";

function clone(value) {
  return structuredClone(value);
}

function defaultStoragePath() {
  return process.env.SEARCH_ANALYTICS_PATH || path.resolve(".route-v2-cache", "search-analytics.jsonl");
}

export function createRouteSearchAnalytics({
  storagePath = defaultStoragePath(),
  now = () => Date.now(),
} = {}) {
  function append(event) {
    if (!storagePath) return;
    const payload = {
      schemaVersion: 1,
      timestamp: new Date(now()).toISOString(),
      ...clone(event || {}),
    };
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.appendFileSync(storagePath, `${JSON.stringify(payload)}\n`);
  }

  function logSearch(event) {
    append({ type: "search", ...event });
  }

  function logDetailClick(event) {
    append({ type: "detail-click", ...event });
  }

  return { append, logSearch, logDetailClick };
}
