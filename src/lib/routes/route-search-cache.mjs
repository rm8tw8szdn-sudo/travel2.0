import fs from "node:fs";
import path from "node:path";

function clone(value) {
  return structuredClone(value);
}

function clean(value) {
  return String(value || "").trim();
}

function readJson(storagePath, fallback) {
  if (!storagePath || !fs.existsSync(storagePath)) return clone(fallback);
  try {
    return JSON.parse(fs.readFileSync(storagePath, "utf8"));
  } catch {
    return clone(fallback);
  }
}

function writeJson(storagePath, payload) {
  if (!storagePath) return;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const tempPath = `${storagePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, storagePath);
}

function defaultCachePath() {
  return process.env.SEARCH_CACHE_PATH || path.resolve(".route-v2-cache", "search-cache.json");
}

function defaultReviewPath() {
  return process.env.SEARCH_REVIEW_CANDIDATES_PATH || path.resolve(".route-v2-cache", "search-review-candidates.json");
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

export function createRouteSearchCache({
  storagePath = defaultCachePath(),
  reviewPath = defaultReviewPath(),
  ttlDays = Number(process.env.SEARCH_CACHE_TTL_DAYS || 30),
  now = () => Date.now(),
} = {}) {
  const ttlMs = Math.max(1, Number(ttlDays) || 30) * 24 * 60 * 60 * 1000;

  function readStore() {
    const payload = readJson(storagePath, { schemaVersion: 1, items: {} });
    return {
      schemaVersion: 1,
      items: payload?.items && typeof payload.items === "object" ? payload.items : {},
    };
  }

  function writeStore(store) {
    writeJson(storagePath, { schemaVersion: 1, items: store.items || {} });
  }

  function isFresh(item) {
    return Boolean(item?.expiresAt && Date.parse(item.expiresAt) > now());
  }

  function get(intentHash) {
    const key = clean(intentHash);
    if (!key) return null;
    const store = readStore();
    const item = store.items[key];
    if (!item || !isFresh(item)) return null;
    const next = {
      ...item,
      lastAccess: new Date(now()).toISOString(),
      hitCount: Number(item.hitCount || 0) + 1,
    };
    store.items[key] = next;
    writeStore(store);
    return clone(next);
  }

  function put({ intent, records = [], sourceQuery = "", status = "search-generated", plannerMeta = {} } = {}) {
    if (!intent?.intentHash) return null;
    const store = readStore();
    const createdAt = new Date(now()).toISOString();
    const existing = store.items[intent.intentHash] || {};
    const sourceQuerySamples = unique([...(existing.sourceQuerySamples || []), sourceQuery || intent.rawQuery]).slice(-8);
    const item = {
      schemaVersion: 1,
      intentHash: intent.intentHash,
      intentKey: intent.intentKey,
      normalizedIntent: clone(intent),
      status,
      records: clone(records),
      createdAt: existing.createdAt || createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(now() + ttlMs).toISOString(),
      lastAccess: createdAt,
      hitCount: Number(existing.hitCount || 0),
      sourceQuerySamples,
      refreshRequested: false,
      stale: false,
      plannerMeta: clone(plannerMeta),
    };
    store.items[intent.intentHash] = item;
    writeStore(store);
    return clone(item);
  }

  function findRoute(routeId) {
    const id = clean(routeId);
    if (!id) return null;
    const store = readStore();
    for (const item of Object.values(store.items)) {
      if (!isFresh(item)) continue;
      const record = (item.records || []).find((candidate) => clean(candidate?.id) === id);
      if (record) return { item: clone(item), record: clone(record) };
    }
    return null;
  }

  function appendReviewCandidates({ intent, records = [], queryId = "", plannerMeta = {} } = {}) {
    if (!records.length) return;
    const payload = readJson(reviewPath, { schemaVersion: 1, candidates: [] });
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    const existing = new Set(candidates.map((item) => `${item.intentHash}:${item.routeId}`));
    const createdAt = new Date(now()).toISOString();
    for (const record of records) {
      const key = `${intent?.intentHash || ""}:${record?.id || ""}`;
      if (existing.has(key)) continue;
      existing.add(key);
      candidates.push({
        createdAt,
        queryId,
        intentHash: intent?.intentHash || "",
        intentKey: intent?.intentKey || "",
        normalizedIntent: clone(intent || {}),
        routeId: record.id,
        status: "needs-review",
        plannerMeta: clone(plannerMeta),
        record: clone(record),
      });
    }
    writeJson(reviewPath, { schemaVersion: 1, candidates: candidates.slice(-1000) });
  }

  function cleanup() {
    const store = readStore();
    const before = Object.keys(store.items).length;
    store.items = Object.fromEntries(Object.entries(store.items).filter(([, item]) => isFresh(item)));
    writeStore(store);
    return { removed: before - Object.keys(store.items).length, remaining: Object.keys(store.items).length };
  }

  return { get, put, findRoute, appendReviewCandidates, cleanup };
}
