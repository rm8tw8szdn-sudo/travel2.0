import assert from "node:assert/strict";
import { buildKnowledgeGraphPool } from "../src/lib/routes/index.mjs";

function binding(qid, zh, en, lon, lat) {
  return {
    place: { value: `http://www.wikidata.org/entity/${qid}` },
    zh: { value: zh },
    en: { value: en },
    type: { value: "http://www.wikidata.org/entity/Q515" },
    typeLabel: { value: "city" },
    coord: { value: `Point(${lon} ${lat})` },
  };
}

const fetchImpl = async (url) => {
  const decoded = decodeURIComponent(String(url));
  if (decoded.includes("VALUES ?place")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: {
          bindings: [
            binding("Q1490", "东京", "Tokyo", 139.6503, 35.6762),
            binding("Q39231", "富士山", "Mount Fuji", 138.7274, 35.3606),
            binding("Q34600", "京都", "Kyoto", 135.7681, 35.0116),
            binding("Q169134", "奈良", "Nara", 135.8048, 34.6851),
            binding("Q35765", "大阪", "Osaka", 135.5023, 34.6937),
          ],
        },
      }),
      headers: new Map(),
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: {
        bindings: [
          binding("Q1490", "东京", "Tokyo", 139.6503, 35.6762),
          binding("Q164234", "川崎", "Kawasaki", 139.7036, 35.5308),
          binding("Q38283", "横滨", "Yokohama", 139.6380, 35.4437),
          binding("Q200578", "横须贺", "Yokosuka", 139.6721, 35.2813),
          binding("Q170616", "千叶", "Chiba", 140.1063, 35.6073),
        ],
      },
    }),
    headers: new Map(),
  };
};

const pool = await buildKnowledgeGraphPool({ countryCodes: ["JP"], fetchImpl, deadlineAt: Date.now() + 30_000 });
const names = (pool.JP || []).map((item) => item.name);
for (const name of ["东京", "富士山", "京都", "奈良", "大阪"]) {
  assert.ok(names.includes(name), `JP pool should include first-trip anchor ${name}, got ${JSON.stringify(names)}`);
}
assert.deepEqual(names.slice(0, 5), ["东京", "富士山", "京都", "奈良", "大阪"], `anchors should be first in pool, got ${JSON.stringify(names.slice(0, 5))}`);

const failingFetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({ results: { bindings: [] } }),
  headers: new Map(),
});

const fallbackPool = await buildKnowledgeGraphPool({ countryCodes: ["CH"], fetchImpl: failingFetch, deadlineAt: Date.now() + 30_000 });
const fallbackNames = (fallbackPool.CH || []).map((item) => item.name);
assert.deepEqual(
  fallbackNames.slice(0, 3),
  ["卢塞恩", "因特拉肯", "采尔马特"],
  `CH pool should fall back to curated rail anchors, got ${JSON.stringify(fallbackNames.slice(0, 5))}`,
);
assert.ok(
  (fallbackPool.CH || [])[0]?.wikidataId?.startsWith("anchor:CH:"),
  `fallback anchors without Wikidata QID should receive stable anchor ids, got ${(fallbackPool.CH || [])[0]?.wikidataId}`,
);

console.log("Knowledge graph anchor pool verified: country SPARQL pool is supplemented with first-trip and fallback anchors.");
