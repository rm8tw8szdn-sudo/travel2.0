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
  const diagnostics = [];

  function append(event) {
    if (!storagePath) return { written: false, reason: "analytics-disabled" };
    try {
      const payload = {
        schemaVersion: 1,
        timestamp: new Date(now()).toISOString(),
        ...clone(event || {}),
      };
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.appendFileSync(storagePath, `${JSON.stringify(payload)}\n`);
      return { written: true };
    } catch (error) {
      diagnostics.push({
        type: "analytics-write-failed",
        code: String(error?.code || "write_failed"),
        timestamp: new Date(now()).toISOString(),
      });
      if (diagnostics.length > 20) diagnostics.splice(0, diagnostics.length - 20);
      return { written: false, reason: "analytics-write-failed" };
    }
  }

  function logSearch(event) {
    append({ type: "search", ...event });
  }

  function logDetailClick(event) {
    append({ type: "detail-click", ...event });
  }

  return { append, logSearch, logDetailClick, diagnostics: () => clone(diagnostics) };
}
