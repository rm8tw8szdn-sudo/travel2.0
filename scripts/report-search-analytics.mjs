import fs from "node:fs";
import path from "node:path";

const storagePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(".route-v2-cache", "search-analytics.jsonl");

function readEvents(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function increment(map, key, patch = {}) {
  if (!key) return;
  const item = map.get(key) || { key, count: 0 };
  item.count += 1;
  Object.assign(item, patch);
  map.set(key, item);
}

const events = readEvents(storagePath);
const searches = events.filter((event) => event.type === "search");
const clicks = events.filter((event) => event.type === "detail-click");
const byQuery = new Map();
const byIntent = new Map();

for (const event of searches) {
  increment(byQuery, event.query, {
    resultCount: (byQuery.get(event.query)?.resultCount || 0) + Number(event.resultCount || 0),
    plannerCalled: (byQuery.get(event.query)?.plannerCalled || 0) + (event.plannerCalled ? 1 : 0),
    plannerTimeout: (byQuery.get(event.query)?.plannerTimeout || 0) + (event.plannerTimeout ? 1 : 0),
  });
  increment(byIntent, event.normalizedIntent?.intentHash, {
    countryCode: event.normalizedIntent?.countryCode || "",
    theme: event.normalizedIntent?.theme || "",
    travelStyle: event.normalizedIntent?.travelStyle || "",
    resultCount: (byIntent.get(event.normalizedIntent?.intentHash)?.resultCount || 0) + Number(event.resultCount || 0),
  });
}

const top = (map, limit = 10) => [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit);

console.log(JSON.stringify({
  storagePath,
  totalEvents: events.length,
  searches: searches.length,
  detailClicks: clicks.length,
  plannerCalled: searches.filter((event) => event.plannerCalled).length,
  plannerTimeout: searches.filter((event) => event.plannerTimeout).length,
  emptySearches: searches.filter((event) => Number(event.resultCount || 0) === 0).length,
  topQueries: top(byQuery),
  topIntents: top(byIntent),
}, null, 2));
