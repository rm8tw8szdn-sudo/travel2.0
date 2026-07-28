import fs from "node:fs";
import path from "node:path";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  createRouteIntentFingerprint,
  validateNormalizedRouteIntent,
} from "./route-intent-model.mjs";
import {
  finalizeRouteResult,
  validateEmbeddedRouteIntent,
} from "./route-intent-invariant-gate.mjs";

const ROUTE_SEARCH_CACHE_SCHEMA_VERSION = 2;

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
  const diagnostics = [];

  function recordDiagnostic(type, validation = null, extra = {}) {
    const first = validation?.violations?.[0] || {};
    diagnostics.push({
      type,
      reasonCode: validation?.reasonCodes?.[0] || validation?.reasonCode || "",
      path: first.path || first.field || "",
      ...extra,
    });
  }

  function readStore() {
    const payload = readJson(storagePath, { schemaVersion: ROUTE_SEARCH_CACHE_SCHEMA_VERSION, items: {} });
    return {
      schemaVersion: ROUTE_SEARCH_CACHE_SCHEMA_VERSION,
      items: payload?.items && typeof payload.items === "object" ? payload.items : {},
    };
  }

  function writeStore(store) {
    writeJson(storagePath, { schemaVersion: ROUTE_SEARCH_CACHE_SCHEMA_VERSION, items: store.items || {} });
  }

  function isFresh(item) {
    return Boolean(item?.expiresAt && Date.parse(item.expiresAt) > now());
  }

  function intentFingerprint(intent) {
    if (!intent || typeof intent !== "object") return "";
    try {
      const fingerprint = createRouteIntentFingerprint(intent);
      if (!fingerprint.valid) {
        recordDiagnostic("search-cache-intent-invalid", fingerprint.validation);
        return "";
      }
      return clean(fingerprint.value);
    } catch {
      recordDiagnostic("search-cache-intent-invalid");
      return "";
    }
  }

  function get(intent) {
    try {
      const key = intentFingerprint(intent);
      if (!key) return null;
      const store = readStore();
      const item = store.items[key];
      if (!item
        || Number(item.schemaVersion) !== ROUTE_SEARCH_CACHE_SCHEMA_VERSION
        || clean(item.routeIntentFingerprintVersion) !== ROUTE_INTENT_FINGERPRINT_VERSION
        || clean(item.routeIntentFingerprint) !== key
        || !Array.isArray(item.records)
        || !isFresh(item)) {
        return null;
      }
      const itemIntentValidation = validateNormalizedRouteIntent(item.normalizedIntent);
      if (!itemIntentValidation.valid) {
        recordDiagnostic("search-cache-item-intent-invalid", itemIntentValidation);
        return null;
      }
      const itemFingerprint = createRouteIntentFingerprint(item.normalizedIntent);
      if (!itemFingerprint.valid || clean(itemFingerprint.value) !== key) {
        recordDiagnostic("search-cache-item-intent-invalid", null, { reasonCode: "route-intent-fingerprint-mismatch" });
        return null;
      }
      const records = item.records.filter((record, index) => {
        const validation = validateEmbeddedRouteIntent(record, {
          source: "search-cache-read",
          allowLegacyUnbound: false,
        });
        if (!validation.matched || clean(validation.fingerprint) !== key) {
          recordDiagnostic("search-cache-record-invalid", validation, { index });
          return false;
        }
        return true;
      });
      if (records.length !== item.records.length) return null;
      const next = {
        ...item,
        records,
        lastAccess: new Date(now()).toISOString(),
        hitCount: Number(item.hitCount || 0) + 1,
      };
      store.items[key] = next;
      writeStore(store);
      return clone(next);
    } catch {
      recordDiagnostic("search-cache-read-failed");
      return null;
    }
  }

  function put({ intent, records = [], sourceQuery = "", status = "search-generated", plannerMeta = {} } = {}) {
    const fingerprint = createRouteIntentFingerprint(intent || {});
    const key = clean(fingerprint.value);
    if (!fingerprint.valid || !key) {
      recordDiagnostic("search-cache-intent-invalid", fingerprint.validation);
      return null;
    }
    const finalizedRecords = [];
    for (const record of records || []) {
      const finalized = finalizeRouteResult(record, intent, {
        source: "search-cache-write",
        claimedSuccess: true,
      });
      if (!finalized.matched || !finalized.record) return null;
      finalizedRecords.push(finalized.record);
    }
    const store = readStore();
    const createdAt = new Date(now()).toISOString();
    const existing = store.items[key] || {};
    const sourceQuerySamples = unique([...(existing.sourceQuerySamples || []), sourceQuery || intent.rawQuery]).slice(-8);
    const item = {
      schemaVersion: ROUTE_SEARCH_CACHE_SCHEMA_VERSION,
      intentHash: intent.intentHash || "",
      intentKey: intent.intentKey,
      routeIntentFingerprintVersion: fingerprint.version,
      routeIntentFingerprint: key,
      normalizedIntent: clone(fingerprint.normalizedIntent),
      status,
      records: clone(finalizedRecords),
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
    store.items[key] = item;
    writeStore(store);
    return clone(item);
  }

  function findRoute(routeId) {
    const id = clean(routeId);
    if (!id) return null;
    const store = readStore();
    for (const [itemKey, item] of Object.entries(store.items)) {
      if (!isFresh(item)
        || Number(item?.schemaVersion) !== ROUTE_SEARCH_CACHE_SCHEMA_VERSION
        || clean(item?.routeIntentFingerprintVersion) !== ROUTE_INTENT_FINGERPRINT_VERSION
        || !Array.isArray(item?.records)) {
        continue;
      }
      const itemIntentValidation = validateNormalizedRouteIntent(item.normalizedIntent);
      if (!itemIntentValidation.valid) {
        recordDiagnostic("search-cache-item-intent-invalid", itemIntentValidation, { itemKey });
        continue;
      }
      const itemFingerprint = createRouteIntentFingerprint(item.normalizedIntent);
      if (!itemFingerprint.valid || clean(itemFingerprint.value) !== clean(item.routeIntentFingerprint)) {
        recordDiagnostic("search-cache-item-intent-invalid", null, {
          itemKey,
          reasonCode: "route-intent-fingerprint-mismatch",
        });
        continue;
      }
      const record = item.records.find((candidate) => clean(candidate?.id) === id);
      if (!record) continue;
      let validation;
      try {
        validation = validateEmbeddedRouteIntent(record, {
          source: "search-cache-route-detail",
          allowLegacyUnbound: false,
        });
      } catch {
        recordDiagnostic("search-cache-record-invalid", null, { itemKey });
        continue;
      }
      if (validation.matched
        && clean(validation.fingerprint) === clean(item.routeIntentFingerprint)) {
        return { item: clone(item), record: clone(record) };
      }
      recordDiagnostic("search-cache-record-invalid", validation, { itemKey });
    }
    return null;
  }

  function appendReviewCandidates({ intent, records = [], queryId = "", plannerMeta = {} } = {}) {
    if (!records.length) return;
    const fingerprint = createRouteIntentFingerprint(intent || {});
    if (!fingerprint.valid) {
      recordDiagnostic("search-review-intent-invalid", fingerprint.validation);
      return;
    }
    const payload = readJson(reviewPath, { schemaVersion: 1, candidates: [] });
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    const existing = new Set(candidates.map((item) => `${item.intentHash}:${item.routeId}`));
    const createdAt = new Date(now()).toISOString();
    for (const record of records) {
      const validation = validateEmbeddedRouteIntent(record, {
        source: "search-review-write",
        allowLegacyUnbound: false,
      });
      if (!validation.matched || clean(validation.fingerprint) !== clean(fingerprint.value)) {
        recordDiagnostic("search-review-record-invalid", validation);
        continue;
      }
      const key = `${intent?.intentHash || ""}:${record?.id || ""}`;
      if (existing.has(key)) continue;
      existing.add(key);
      candidates.push({
        createdAt,
        queryId,
        intentHash: intent?.intentHash || "",
        intentKey: intent?.intentKey || "",
        routeIntentSchemaVersion: fingerprint.normalizedIntent.schemaVersion,
        routeIntentFingerprintVersion: fingerprint.version,
        routeIntentFingerprint: fingerprint.value,
        normalizedIntent: clone(fingerprint.normalizedIntent),
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

  return {
    get,
    put,
    findRoute,
    appendReviewCandidates,
    cleanup,
    diagnostics: () => clone(diagnostics),
  };
}
