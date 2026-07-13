// Wikidata SPARQL 知识图适配器（Phase 5）
// 用途：planner 的真知识图目的地来源。warmup 时按 country 跑 SPARQL 预解析、存 JSON 缓存，
//   planner 注入 createCacheBackedKnowledgeGraph（同步读缓存，满足 Phase 2b 同步硬不变量）。
// 查询设计：
//   - P17=国 约束：只返真正属于该国的实体（自动排除 QID 误用，如 Q2112 实为 Bielefeld 非富士山）
//   - P31 子类 UNION：city(Q515)/town(Q532)/village(Q484170)/mountain(Q8502)/island(Q23442)
//   - 中英 label 双 binding：rdfs:label + FILTER(LANG="zh-hans")/="en"（不用 SERVICE wikibase:label，它只给优先语言）
//   - P625 坐标：buildRouteSkeleton 最近邻需要
// 后缀 strip："东京都"→"东京"、"大阪市"→"大阪"，对齐 Gold Case 与现有 accepted-routes 中文名

import fs from "node:fs";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "TravelCollectionRouteV2/2.0 (https://github.com/rm8tw8szdn-sudo/travel-collection)";

// Phase 5 范围：17 个 Gold-Case 国家。repo 内无现成 ISO-code→QID 表，data/countries.zh.json 只有数字码。
// 动态 wdt:P297 SPARQL 解析是 Phase 6 增量。
export const COUNTRY_CODE_TO_QID = {
  JP: "Q17", US: "Q30", FR: "Q142", DE: "Q183", IT: "Q38", GB: "Q145",
  TH: "Q869", AU: "Q408", KR: "Q884", VN: "Q881", ES: "Q29", GR: "Q41",
  TR: "Q43", IS: "Q189", ID: "Q252", MX: "Q96", EG: "Q79", MA: "Q97",
};

const COUNTRY_ANCHOR_QIDS = {
  JP: ["Q1490", "Q39231", "Q34600", "Q169134", "Q35765"],
  IT: ["Q490", "Q2044", "Q220", "Q2634"],
  GB: ["Q84"],
  FR: ["Q90", "Q1479", "Q456"],
  GR: ["Q1524", "Q203715", "Q1342"],
};

const COUNTRY_ANCHOR_FALLBACKS = {
  JP: [
    ["Q1490", "东京", "Tokyo", 35.6894, 139.6917],
    ["Q39231", "富士山", "Mount Fuji", 35.3606, 138.7275],
    ["Q34600", "京都", "Kyoto", 35.0116, 135.7681],
    ["Q169134", "奈良", "Nara", 34.6850, 135.8048],
    ["Q35765", "大阪", "Osaka", 34.6938, 135.5021],
    ["", "金泽", "Kanazawa", 36.5613, 136.6562],
    ["", "白川乡", "Shirakawa-go", 36.2571, 136.9067],
    ["", "高山", "Takayama", 36.1461, 137.2522],
    ["", "上高地", "Kamikochi", 36.2496, 137.6377],
    ["", "松本", "Matsumoto", 36.2380, 137.9720],
    ["", "岚山", "Arashiyama", 35.0094, 135.6668],
    ["", "宇治", "Uji", 34.8845, 135.7998],
    ["", "高野山", "Koyasan", 34.2124, 135.5865],
    ["", "德岛", "Tokushima", 34.0703, 134.5548],
    ["", "高知", "Kochi", 33.5597, 133.5311],
    ["", "松山", "Matsuyama", 33.8392, 132.7657],
    ["", "高松", "Takamatsu", 34.3428, 134.0466],
  ],
  IT: [
    ["Q490", "米兰", "Milan", 45.4642, 9.1900],
    ["Q2044", "佛罗伦萨", "Florence", 43.7696, 11.2558],
    ["Q220", "罗马", "Rome", 41.9028, 12.4964],
    ["Q2634", "那不勒斯", "Naples", 40.8518, 14.2681],
  ],
  GB: [
    ["Q84", "伦敦", "London", 51.5074, -0.1278],
    ["", "格林尼治", "Greenwich", 51.4826, 0.0077],
    ["", "爱丁堡", "Edinburgh", 55.9533, -3.1883],
    ["", "凯恩戈姆国家公园", "Cairngorms National Park", 57.1000, -3.6500],
    ["", "尼斯湖", "Loch Ness", 57.3229, -4.4244],
    ["", "威廉堡", "Fort William", 56.8198, -5.1052],
    ["", "格伦科", "Glencoe", 56.6826, -5.1023],
    ["", "格拉斯哥", "Glasgow", 55.8642, -4.2518],
  ],
  CH: [
    ["", "卢塞恩", "Lucerne", 47.0502, 8.3093],
    ["", "因特拉肯", "Interlaken", 46.6863, 7.8632],
    ["", "采尔马特", "Zermatt", 46.0207, 7.7491],
    ["", "圣莫里茨", "St. Moritz", 46.4908, 9.8355],
    ["", "卢加诺", "Lugano", 46.0037, 8.9511],
  ],
  FR: [
    ["Q90", "巴黎", "Paris", 48.8566, 2.3522],
    ["Q1479", "波尔多", "Bordeaux", 44.8378, -0.5792],
    ["", "圣埃美隆", "Saint-Emilion", 44.8947, -0.1553],
    ["", "梅多克", "Medoc", 45.3000, -0.8000],
    ["", "阿卡雄", "Arcachon", 44.6585, -1.1688],
  ],
  GR: [
    ["Q1524", "雅典", "Athens", 37.9838, 23.7275],
    ["Q203715", "圣托里尼", "Santorini", 36.3932, 25.4615],
    ["", "纳克索斯", "Naxos", 37.1036, 25.3767],
    ["", "帕罗斯", "Paros", 37.0856, 25.1500],
  ],
  AT: [["Q1741", "维也纳", "Vienna", 48.2082, 16.3738]],
  SK: [["", "布拉迪斯拉发", "Bratislava", 48.1486, 17.1077]],
  HU: [["", "布达佩斯", "Budapest", 47.4979, 19.0402]],
  CZ: [["", "布拉格", "Prague", 50.0755, 14.4378]],
};

// P31 子类 → destinationPriority（city/town 最高，对齐 online-standardizer.mjs:16）
const TYPE_PRIORITY = [
  { match: /city|megacity|metropolis|big city|core city|capital|town|village|municipality|settlement|commune/i, priority: 4 },
  { match: /island|park|protected area|archaeological site|temple|monastery/i, priority: 2 },
  { match: /mountain|volcano|river|lake|region/i, priority: 1 },
];

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

// 中文行政后缀裁剪：东京都→东京、大阪市→大阪、奈良县→奈良、京都府→京都
// 不裁单独的"都"，避免把"京都"误伤成"京"。
function stripAdminSuffix(name) {
  const value = clean(name);
  if (value === "东京都") return "东京";
  return value.replace(/(道|府|县|市|区|町|村)$/u, "");
}

function priorityForType(typeLabel) {
  const label = clean(typeLabel);
  if (!label) return 0;
  for (const { match, priority } of TYPE_PRIORITY) {
    if (match.test(label)) return priority;
  }
  return 0;
}

// 解析 "Point(lon lat)" → { latitude, longitude }
function parseCoord(pointValue) {
  const match = clean(pointValue).match(/^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/u);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export async function fetchCountryQid(countryCode, fetchImpl = globalThis.fetch, deadlineAt = 0) {
  const code = clean(countryCode).toUpperCase();
  if (!code) return "";
  if (COUNTRY_CODE_TO_QID[code]) return COUNTRY_CODE_TO_QID[code];
  const query = [
    "SELECT ?country WHERE {",
    ` ?country wdt:P297 "${code}".`,
    "} LIMIT 1",
  ].join("");
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const remainingMs = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : 10_000;
  const timeoutMs = Math.max(1, Math.min(10_000, remainingMs));
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
      signal: globalThis.AbortSignal?.timeout?.(timeoutMs),
    });
    if (!response.ok) return "";
    const payload = await response.json();
    const value = payload?.results?.bindings?.[0]?.country?.value || "";
    return clean(value).split("/").pop() || "";
  } catch {
    return "";
  }
}

function entityOf(binding, countryCode, countryName) {
  const placeUri = clean(binding?.place?.value);
  const wikidataId = placeUri ? placeUri.split("/").pop() : "";
  if (!wikidataId) return null;
  const coord = parseCoord(binding?.coord?.value);
  if (!coord) return null;
  const labelZh = clean(binding?.zh?.value);
  if (!labelZh) return null;
  const typeLabel = clean(binding?.typeLabel?.value);
  return {
    wikidataId,
    countryCode,
    countryName,
    name: stripAdminSuffix(labelZh),
    sourceTitle: clean(binding?.en?.value), // 英文 label = Wikidata en label，供采集器英文标准化 query
    entityTypeName: typeLabel,
    latitude: coord.latitude,
    longitude: coord.longitude,
  };
}

function anchorSlug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function fallbackAnchorDestinations(countryCode, countryName = "") {
  const code = clean(countryCode).toUpperCase();
  const rows = COUNTRY_ANCHOR_FALLBACKS[code] || [];
  return rows.map(([qid, name, sourceTitle, latitude, longitude], index) => {
    const id = clean(qid) || `anchor:${code}:${anchorSlug(sourceTitle || name) || index}`;
    return {
      wikidataId: id,
      countryCode: code,
      countryName,
      name: clean(name),
      sourceTitle: clean(sourceTitle),
      entityTypeName: "gold-case-anchor",
      latitude,
      longitude,
    };
  }).filter((entity) => entity.name && Number.isFinite(entity.latitude) && Number.isFinite(entity.longitude));
}

function mergeDestinations(primary = [], anchors = []) {
  const byId = new Map();
  for (const entity of [...anchors, ...primary]) {
    const key = clean(entity?.wikidataId || entity?.sourceTitle || entity?.name);
    if (!key) continue;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, entity);
    } else {
      byId.set(key, { ...existing, ...entity, sourceTitle: entity.sourceTitle || existing.sourceTitle });
    }
  }
  return [...byId.values()];
}

async function fetchAnchorDestinations({
  countryCode,
  countryName,
  fetchImpl = globalThis.fetch,
  deadlineAt = 0,
} = {}) {
  const code = clean(countryCode).toUpperCase();
  const qids = COUNTRY_ANCHOR_QIDS[code] || [];
  if (!qids.length) return [];
  const values = qids.map((qid) => `wd:${qid}`).join(" ");
  const query = [
    "SELECT ?place ?zh ?en ?type ?typeLabel ?coord WHERE {",
    ` VALUES ?place { ${values} }`,
    " ?place wdt:P31 ?type.",
    " ?place wdt:P625 ?coord.",
    ' OPTIONAL { ?place rdfs:label ?zhHans. FILTER(LANG(?zhHans)="zh-hans") }',
    ' OPTIONAL { ?place rdfs:label ?zhText. FILTER(LANG(?zhText)="zh") }',
    ' ?place rdfs:label ?en. FILTER(LANG(?en)="en")',
    " BIND(COALESCE(?zhHans, ?zhText, ?en) AS ?zh)",
    ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    "}",
  ].join("");
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const remainingMs = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : 12_000;
  const timeoutMs = Math.max(1, Math.min(12_000, remainingMs));
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
      signal: globalThis.AbortSignal?.timeout?.(timeoutMs),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const bindings = payload?.results?.bindings || [];
    const byId = new Map();
    for (const binding of bindings) {
      const entity = entityOf(binding, code, countryName);
      if (!entity) continue;
      const existing = byId.get(entity.wikidataId);
      const pri = priorityForType(entity.entityTypeName);
      if (!existing || pri > priorityForType(existing.entityTypeName)) byId.set(entity.wikidataId, entity);
    }
    return qids.map((qid) => byId.get(qid)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchSparqlDestinations({
  countryQid,
  countryCode,
  countryName,
  fetchImpl = globalThis.fetch,
  deadlineAt = 0,
} = {}) {
  const qid = clean(countryQid);
  const code = clean(countryCode);
  if (!qid || !code) return [];
  const query = [
    "SELECT ?place ?zh ?en ?type ?typeLabel ?coord WHERE {",
    ` ?place wdt:P17 wd:${qid}.`,
    " ?place wdt:P31 ?type.",
    " ?place wdt:P625 ?coord.",
    " { ?type wdt:P279* wd:Q515. } UNION { ?type wdt:P279* wd:Q532. } UNION { ?type wdt:P279* wd:Q484170. }",
    " UNION { ?type wdt:P279* wd:Q8502. } UNION { ?type wdt:P279* wd:Q23442. }",
    ' ?place rdfs:label ?zh. FILTER(LANG(?zh)="zh-hans")',
    ' ?place rdfs:label ?en. FILTER(LANG(?en)="en")',
    ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    "} LIMIT 200",
  ].join("");
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const remainingMs = deadlineAt ? Math.max(1, deadlineAt - Date.now()) : 20_000;
  const timeoutMs = Math.max(1, Math.min(20_000, remainingMs));
  const response = await fetchImpl(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    signal: globalThis.AbortSignal?.timeout?.(timeoutMs),
  });
  if (!response.ok) return [];
  const payload = await response.json();
  const bindings = payload?.results?.bindings || [];
  // 按 wikidataId 去重（同一实体可能多个 ?type，取 priority 最高的）
  const byId = new Map();
  for (const binding of bindings) {
    const entity = entityOf(binding, code, countryName);
    if (!entity) continue;
    const existing = byId.get(entity.wikidataId);
    const pri = priorityForType(entity.entityTypeName);
    if (!existing || pri > priorityForType(existing.entityTypeName)) {
      byId.set(entity.wikidataId, { ...entity, _priority: pri });
    }
  }
  // priority desc 排序后 cap 50/country（大国 SPARQL 可返千条，控量保 buildRouteSkeleton 快）
  return [...byId.values()]
    .sort((a, b) => (b._priority || 0) - (a._priority || 0))
    .slice(0, 50)
    .map(({ _priority, ...rest }) => rest);
}

export async function buildKnowledgeGraphPool({
  countryCodes = [],
  fetchImpl = globalThis.fetch,
  deadlineAt = 0,
} = {}) {
  const pool = {};
  for (const code of countryCodes) {
    const upper = clean(code).toUpperCase();
    const qid = await fetchCountryQid(upper, fetchImpl, deadlineAt);
    let destinations = [];
    let anchors = [];
    if (qid) {
      try {
        destinations = await fetchSparqlDestinations({
          countryQid: qid, countryCode: upper, countryName: "",
          fetchImpl, deadlineAt,
        });
      } catch {
        destinations = [];
      }
    }
    try {
      anchors = await fetchAnchorDestinations({
        countryCode: upper, countryName: "",
        fetchImpl, deadlineAt,
      });
    } catch {
      anchors = [];
    }
    const fallbackAnchors = fallbackAnchorDestinations(upper, "");
    const merged = mergeDestinations(destinations, [...fallbackAnchors, ...anchors]).slice(0, 50);
    if (merged.length) pool[upper] = merged;
  }
  return pool;
}

// 同步缓存适配器：满足 planner knowledgeGraph.queryDestinations(query) 同步契约（Phase 2b 硬不变量）
export function createCacheBackedKnowledgeGraph({ pool = {} } = {}) {
  return {
    queryDestinations(query = {}) {
      const country = clean(query.country).toUpperCase();
      const candidates = pool[country] ? pool[country].slice() : [];
      if (!candidates.length) return [];
      // 可选浅过滤：theme/season（pool 字段有限，先按 entityTypeName 关键词粗筛）
      if (query.theme) {
        const needle = clean(query.theme).toLowerCase();
        const filtered = candidates.filter((d) => clean(d.entityTypeName).toLowerCase().includes(needle));
        if (filtered.length >= 4) return filtered;
      }
      const limit = Number(query.limit) || 12;
      return candidates.slice(0, limit);
    },
  };
}

export function readKnowledgeGraphCache(storagePath) {
  try {
    if (!fs.existsSync(storagePath)) return {};
    const raw = fs.readFileSync(storagePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeKnowledgeGraphCache(storagePath, pool) {
  try {
    const dir = storagePath.replace(/[/\\][^/\\]+$/u, "");
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify(pool || {}, null, 2), "utf8");
  } catch {
    // 缓存写入失败不阻断（planner 可直接用内存 pool）
  }
}
