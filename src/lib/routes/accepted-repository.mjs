import fs from "node:fs";
import path from "node:path";
import { normalizeDiscoveredRoute } from "./contracts.mjs";
import { validateRouteContent } from "./content-quality.mjs";
import { validateCompositionRecord } from "./composition-validator.mjs";
import {
  dedupeRouteRecords,
  routeDedupeFingerprint,
  routeCountryClusterKey,
  routeDestinationSetKey,
  routeTitleKey,
} from "./route-dedupe.mjs";
import { acceptedPoolWatermarks } from "./route-pool-watermarks.mjs";
import { encodeDiscoveryCursor, decodeDiscoveryCursor } from "./cursor.mjs";
import { validateEmbeddedRouteIntent } from "./route-intent-invariant-gate.mjs";

function clone(value) {
  return structuredClone(value);
}

function searchable(record) {
  return [
    record.name,
    record.canonicalTitle,
    record.sourceTitle,
    ...(record.countries || []),
    ...(record.destinations || []),
    ...(record.countryEntities || []).flatMap((item) => [item.name, item.sourceTitle, item.countryCode]),
    ...(record.destinationEntities || []).flatMap((item) => [item.name, item.sourceTitle, item.countryCode]),
    ...(record.themes || []),
    ...(record.tags || []),
  ].join(" ").toLocaleLowerCase("zh-CN");
}

function readStoredRecords(storagePath) {
  if (!storagePath || !fs.existsSync(storagePath)) return [];
  const payload = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  return Array.isArray(payload?.records) ? payload.records : [];
}

function writeStoredRecords(storagePath, payload) {
  if (!storagePath) return;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const tempPath = `${storagePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, storagePath);
}

function routeKind(record) {
  const classification = record?.classification;
  if (classification === "single" || classification === "cross") return classification;
  const countryCodes = new Set((record?.countryEntities || []).map((item) => item.countryCode).filter(Boolean));
  return countryCodes.size > 1 ? "cross" : countryCodes.size === 1 ? "single" : "failed";
}

function feedClusterKey(record) {
  return routeCountryClusterKey(record) || String(record?.id || "");
}

function feedVarietyKey(record) {
  const codes = new Set((record?.countryEntities || []).map((item) => item.countryCode).filter(Boolean));
  const centralEuropeCodes = new Set(["AT", "CZ", "DE", "HU", "SK"]);
  const materialized = Boolean(
    record?.contentEvidence?.plannerRuleVersion
      || record?.contentEvidence?.materialized
      || String(record?.id || "").startsWith("materialized-"),
  );
  if (materialized && codes.size && [...codes].every((code) => centralEuropeCodes.has(code))) {
    return "materialized-central-europe";
  }
  return [...codes].sort().slice(0, 2).join("|") || feedClusterKey(record);
}

const FEED_ORDER_VERSION = 3;

function feedCountryCodes(record) {
  return [...new Set([
    ...(record?.countryEntities || []).map((item) => item.countryCode),
    ...(record?.countries || []),
  ].map((code) => String(code || "").toUpperCase()).filter((code) => /^[A-Z]{2}$/u.test(code)))];
}

function feedCountryCluster(record) {
  return feedCountryCodes(record).sort().join("|");
}

function stableSessionFeedOrder(pool, { sessionId = "" } = {}) {
  return pool.slice().sort((left, right) => compareSessionFeedKeys(
    feedSessionSortKey(left, { sessionId }),
    feedSessionSortKey(right, { sessionId }),
  ));
}

function maxClusterSize(record) {
  void record;
  return Infinity;
}

function numericScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function feedQualityScore(record) {
  const explicit = numericScore(record?.qualityScore);
  if (explicit != null) return explicit;
  const scores = Object.values(record?.compositionScore || {})
    .map(numericScore)
    .filter((value) => value != null);
  if (!scores.length) return 0;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function hasLicensedCover(record) {
  return Boolean(record?.coverAsset?.imageUrl && record.coverAsset.author && record.coverAsset.license);
}

function routeCountryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

const BAD_FEED_IMAGE_PATTERN = /map|locator|flag|logo|icon|diagram|sign|marker|svg|\.png(?:[?#]|$)|\.tiff?|tif(?:[/?#]|$)|collage|pays|interior|room|shop|stall|vendor|worker|people|person|crowd|selfie|passport|luggage|brochure|poster|airport|station|platform|parking|garage|workshop|national[_ -]?road|rail[_ -]?trail|car[_ -]?wash|memorial|arkadenhof|front\.jpe?g|museum|camping|thumbnail_unscaled.*\.png|red[_ -]?background|blank/i;

function hasBadFeedImageSignal(asset = {}) {
  const directSignals = [
    asset.imageUrl,
    asset.sourceUrl,
    asset.imageDedupeKey,
    asset.dedupeKey,
    asset.assetId,
  ].map((item) => String(item || "").toLowerCase());
  if (directSignals.some((item) => item.includes(".png") || item.includes(".svg") || item.includes(".tif"))) return true;
  const text = [
    asset.imageUrl,
    asset.sourceUrl,
    asset.title,
    asset.assetId,
    asset.imageDedupeKey,
    asset.dedupeKey,
    asset.destinationName,
    asset.matchEvidence,
  ].flat().join(" ");
  return BAD_FEED_IMAGE_PATTERN.test(text);
}

function hasVerifiedFeedCover(record = {}) {
  const asset = record.feedReady ? record.onlineCoverAsset : null;
  if (!asset?.imageUrl) return false;
  if (hasBadFeedImageSignal(asset)) return false;
  const imageCodes = Array.isArray(asset.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase())
    : [];
  const routeCodes = routeCountryCodes(record);
  return (record.feedReady || asset.status === "verified" || asset.semanticStatus === "verified" || asset.coverStatus === "verified")
    && routeCodes.length > 0
    && imageCodes.some((code) => routeCodes.includes(code));
}

function feedImageDedupeKey(asset = {}) {
  return String(asset.imageDedupeKey || asset.dedupeKey || asset.assetId || asset.imageUrl || "").trim();
}

function feedImageRecentKey(asset = {}) {
  const key = feedImageDedupeKey(asset);
  return key ? stableHash(key).toString(36) : "";
}

function feedImageMatchReason(asset = {}) {
  if (Array.isArray(asset.matchEvidence)) return asset.matchEvidence.join("；");
  return String(asset.matchEvidence || asset.matchReason || "图片国家与路线国家匹配").trim();
}

function publicFeedRecord(record = {}) {
  if (!hasVerifiedFeedCover(record)) return clone(record);
  const asset = record.onlineCoverAsset;
  const verifiedCover = {
    ...(record.coverAsset || {}),
    ...asset,
    imageUrl: asset.imageUrl,
    coverStatus: "verified",
    semanticStatus: "verified",
    status: "verified",
  };
  return clone({
    ...record,
    coverAsset: verifiedCover,
    coverUrl: asset.imageUrl,
    coverStatus: "verified",
    imageCountryCodes: asset.imageCountryCodes || [],
    imageDedupeKey: feedImageDedupeKey(asset),
    imageMatchReason: feedImageMatchReason(asset),
  });
}

function validateBoundRouteIntent(record, source) {
  const isBound = Boolean(
    record?.routeIntentSchemaVersion
      || record?.routeIntentFingerprint
      || record?.routeIntentFingerprintVersion
      || record?.normalizedRouteIntent,
  );
  if (!isBound) return { matched: true, legacyUnbound: true, reasonCodes: [] };
  return validateEmbeddedRouteIntent(record, {
    source,
    allowLegacyUnbound: false,
  });
}

function feedMediaRank(record) {
  if (hasVerifiedFeedCover(record)) return 3;
  const mediaReady = record?.repositoryStatus === "mediaReady" || record?.enrichmentStatus === "mediaReady";
  if (mediaReady && hasLicensedCover(record)) return 2;
  if (hasLicensedCover(record)) return 1;
  return 0;
}

function feedSourceRank(record) {
  if (record?.sourceType === "planner-designed") return 2;
  if (record?.sourceType === "evidence-composed") return 1;
  return 0;
}

function feedSortKey(record) {
  return {
    qualityScore: feedQualityScore(record),
    mediaRank: feedMediaRank(record),
    sourceRank: feedSourceRank(record),
    acceptedAt: String(record?.acceptedAt || ""),
    id: String(record?.id || ""),
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function feedSessionSortKey(record, { sessionId = "" } = {}) {
  return {
    randomRank: stableHash(`${sessionId}:${record?.id || ""}`),
    id: String(record?.id || ""),
  };
}

function compareSessionFeedKeys(left, right) {
  if (left.randomRank !== right.randomRank) return left.randomRank - right.randomRank;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function compareFeedKeys(left, right) {
  if (left.randomRank != null || right.randomRank != null) {
    if (left.feedReadyBucket !== right.feedReadyBucket) return left.feedReadyBucket - right.feedReadyBucket;
    if (left.freshnessBucket !== right.freshnessBucket) return left.freshnessBucket - right.freshnessBucket;
    if (left.randomRank !== right.randomRank) return left.randomRank - right.randomRank;
    const acceptedOrder = String(right.acceptedAt || "").localeCompare(String(left.acceptedAt || ""));
    if (acceptedOrder !== 0) return acceptedOrder;
    return String(left.id || "").localeCompare(String(right.id || ""));
  }
  if (left.qualityScore !== right.qualityScore) return right.qualityScore - left.qualityScore;
  if (left.mediaRank !== right.mediaRank) return right.mediaRank - left.mediaRank;
  if (left.sourceRank !== right.sourceRank) return right.sourceRank - left.sourceRank;
  const acceptedOrder = String(right.acceptedAt || "").localeCompare(String(left.acceptedAt || ""));
  if (acceptedOrder !== 0) return acceptedOrder;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function compareFeedRecords(left, right) {
  return compareFeedKeys(feedSortKey(left), feedSortKey(right));
}

function feedAnchorFromCursor(decoded) {
  if (decoded?.randomRank != null && decoded?.id) {
    return {
      feedReadyBucket: Number(decoded.feedReadyBucket || 0),
      freshnessBucket: Number(decoded.freshnessBucket || 0),
      randomRank: Number(decoded.randomRank),
      acceptedAt: String(decoded?.acceptedAt || ""),
      id: String(decoded.id),
    };
  }
  const qualityScore = numericScore(decoded?.qualityScore);
  const mediaRank = numericScore(decoded?.mediaRank);
  const sourceRank = numericScore(decoded?.sourceRank);
  if (qualityScore == null || mediaRank == null || sourceRank == null || !decoded?.id) return null;
  return {
    qualityScore,
    mediaRank,
    sourceRank,
    acceptedAt: String(decoded?.acceptedAt || ""),
    id: String(decoded.id),
  };
}

function legacyCursorFilter(record, anchorAcceptedAt, anchorId) {
  const acceptedAt = String(record.acceptedAt || "");
  if (acceptedAt < anchorAcceptedAt) return true;
  if (acceptedAt > anchorAcceptedAt) return false;
  return anchorId == null ? false : String(record.id).localeCompare(anchorId) > 0;
}

function poolShortage(status) {
  return Object.entries(status.targets).flatMap(([kind, target]) => {
    const count = status[kind] || 0;
    return count < target ? [{ pool: kind, count, target, shortage: target - count }] : [];
  });
}

function mergeRecord(existing, stored) {
  return {
    ...existing,
    ...stored,
    destinationAssets: stored.destinationAssets?.length ? stored.destinationAssets : (existing.destinationAssets || []),
    coverAsset: stored.coverAsset || existing.coverAsset,
    acceptedAt: existing.acceptedAt || stored.acceptedAt,
    mediaReadyAt: stored.mediaReadyAt || existing.mediaReadyAt,
    provenance: {
      ...(existing.provenance || {}),
      ...(stored.provenance || {}),
      sources: [
        ...((existing.provenance || {}).sources || []),
        ...((stored.provenance || {}).sources || []),
      ],
    },
  };
}

export function createAcceptedRouteRepository({
  now = () => Date.now(),
  storagePath = "",
  poolTargets = null,
  poolMinimums = null,
  totalTarget = 0,
  totalMinimum = 0,
} = {}) {
  const watermarks = acceptedPoolWatermarks({
    targets: poolTargets || undefined,
    minimums: poolMinimums || undefined,
    totalTarget,
    totalMinimum,
  });
  const records = new Map();
  let revision = 0;

  function persist() {
    revision += 1;
    writeStoredRecords(storagePath, {
      schemaVersion: 2,
      repositoryVersion: version(),
      records: [...records.values()],
    });
  }

  function version() {
    const latest = [...records.values()]
      .map((record) => record.mediaReadyAt || record.acceptedAt || "")
      .sort()
      .at(-1) || "empty";
    return `accepted-v2:${records.size}:${revision}:${latest}`;
  }

  const loadIndexes = {
    ids: new Map(),
    titles: new Map(),
    skeletons: new Map(),
  };
  function skeletonKey(record) {
    const countries = routeCountryClusterKey(record);
    const destinations = routeDestinationSetKey(record);
    return countries && destinations ? `${countries}::${destinations}` : "";
  }
  function indexLoadedRecord(record) {
    if (!record?.id) return;
    loadIndexes.ids.set(record.id, record.id);
    const title = routeTitleKey(record);
    const skeleton = skeletonKey(record);
    if (title) loadIndexes.titles.set(title, record.id);
    if (skeleton) loadIndexes.skeletons.set(skeleton, record.id);
  }
  function loadedDuplicateId(record) {
    const title = routeTitleKey(record);
    const skeleton = skeletonKey(record);
    return loadIndexes.ids.get(record.id)
      || (title ? loadIndexes.titles.get(title) : "")
      || (skeleton ? loadIndexes.skeletons.get(skeleton) : "")
      || "";
  }

  const storedItems = readStoredRecords(storagePath);
  for (const item of storedItems) {
    if (isUnpublishableRouteGenerationV2(item)) continue;
    const routeIntentValidation = validateBoundRouteIntent(item, "accepted-repository-load");
    if (!routeIntentValidation.matched) continue;
    const record = normalizeDiscoveredRoute(item);
    const quality = validateRouteContent(record);
    const composition = validateCompositionRecord(record);
    if (record?.contentQualityStatus === "accepted" && quality.accepted && composition.accepted && record.coverAsset?.imageUrl) {
      const stored = {
        ...record,
        classification: record.classification || quality.classification,
        repositoryStatus: record.enrichmentStatus === "mediaReady" ? "mediaReady" : "accepted",
        dedupeFingerprint: record.dedupeFingerprint || routeDedupeFingerprint(record),
      };
      const duplicateId = loadedDuplicateId(stored);
      if (duplicateId) {
        const existing = records.get(duplicateId);
        if (existing) {
          const merged = mergeRecord(existing, stored);
          records.delete(existing.id);
          records.set(merged.id, clone(merged));
          indexLoadedRecord(merged);
        }
        continue;
      }
      const cluster = feedClusterKey(stored);
      const clusterLimit = maxClusterSize(stored);
      if (cluster && Number.isFinite(clusterLimit)) {
        const clusterSize = [...records.values()].filter((existing) => feedClusterKey(existing) === cluster).length;
        if (clusterSize >= clusterLimit) continue;
      }
      records.set(stored.id, clone(stored));
      indexLoadedRecord(stored);
    }
  }
  if (storedItems.length !== records.size) persist();

  function upsert(input) {
    if (isUnpublishableRouteGenerationV2(input)) {
      return { accepted: false, reasons: ["v2-not-publishable-yet"] };
    }
    const routeIntentValidation = validateBoundRouteIntent(input, "accepted-repository-upsert");
    if (!routeIntentValidation.matched) {
      return {
        accepted: false,
        reasons: ["route-intent-invariant-failed", ...(routeIntentValidation.reasonCodes || [])],
      };
    }
    const record = normalizeDiscoveredRoute(input);
    const quality = validateRouteContent(record);
    const composition = validateCompositionRecord(record);
    if (!record || record.contentQualityStatus !== "accepted" || !quality.accepted || !composition.accepted || !record.coverAsset?.imageUrl) {
      return { accepted: false, reasons: [...(quality.reasons || ["invalid-record"]), ...(composition.reasons || [])] };
    }
    const stored = {
      ...record,
      classification: record.classification || quality.classification,
      repositoryStatus: record.enrichmentStatus === "mediaReady" ? "mediaReady" : "accepted",
      dedupeFingerprint: routeDedupeFingerprint(record),
      acceptedAt: record.acceptedAt || new Date(now()).toISOString(),
    };
    for (const existing of records.values()) {
      const deduped = dedupeRouteRecords([existing, stored]);
      if (deduped.length === 1) {
        const merged = mergeRecord(existing, stored);
        records.delete(existing.id);
        records.set(merged.id, clone(merged));
        persist();
        return { accepted: true, record: clone(merged), merged: true };
      }
    }
    const cluster = feedClusterKey(stored);
    const clusterSize = [...records.values()].filter((item) => feedClusterKey(item) === cluster).length;
    if (cluster && clusterSize >= maxClusterSize(stored)) {
      return { accepted: false, reasons: [`route-cluster-saturated:${cluster}`] };
    }
    records.set(stored.id, clone(stored));
    persist();
    return { accepted: true, record: clone(stored), merged: false };
  }

  function get(routeId) {
    const record = records.get(routeId);
    return record ? clone(record) : null;
  }

  function list({ query = "", cursor = null, limit = 20, excludeIds = [], excludeClusters = [], routeType = "", sessionId = "" } = {}) {
    const excluded = new Set(excludeIds || []);
    const excludedClusters = new Set(excludeClusters || []);
    const needle = String(query || "").trim().toLocaleLowerCase("zh-CN");
    const requestedKind = routeType === "single" || routeType === "cross" ? routeType : "";
    let anchorKey = null;
    let anchorAcceptedAt = null;
    let anchorId = null;
    let decodedCursor = null;
    if (cursor) {
      const parsed = Number.parseInt(cursor, 10);
      if (!Number.isNaN(parsed) && /^\d+$/u.test(cursor.trim())) {
        anchorAcceptedAt = null;
        anchorId = null;
      } else {
        try {
          decodedCursor = decodeDiscoveryCursor(cursor);
          anchorKey = feedAnchorFromCursor(decodedCursor);
          anchorAcceptedAt = decodedCursor?.acceptedAt || null;
          anchorId = decodedCursor?.id || null;
        } catch {
          decodedCursor = null;
          anchorKey = null;
          anchorAcceptedAt = null;
          anchorId = null;
        }
      }
    }
    const cursorRecentIds = Array.isArray(decodedCursor?.recentIds) ? decodedCursor.recentIds.map(String).filter(Boolean) : [];
    for (const id of cursorRecentIds) excluded.add(id);
    const cursorRecentImageKeys = Array.isArray(decodedCursor?.recentImageKeys)
      ? decodedCursor.recentImageKeys.map(String).filter(Boolean)
      : [];
    const recentImageKeys = new Set(cursorRecentImageKeys);
    const allPool = [...records.values()]
      .filter((record) => !needle || searchable(record).includes(needle));
    const typedPool = allPool.filter((record) => !requestedKind || routeKind(record) === requestedKind);
    const randomizedFeed = !needle && Boolean(sessionId);
    const strictFeed = !needle && limit < 100_000;
    const feedReadyPool = strictFeed ? typedPool.filter(hasVerifiedFeedCover) : [];
    const basePool = strictFeed ? feedReadyPool : typedPool;
    if (randomizedFeed) {
      const orderedPool = stableSessionFeedOrder(basePool, { sessionId });
      const orderIdentity = {
        orderVersion: FEED_ORDER_VERSION,
        sessionHash: stableHash(sessionId),
        filterHash: stableHash(JSON.stringify({ query: needle, routeType: requestedKind, strictFeed })),
      };
      const cursorRandomRank = decodedCursor?.randomRank;
      const cursorId = decodedCursor?.id;
      const cursorMatches = decodedCursor?.provider === "accepted-repository"
        && decodedCursor?.orderVersion === orderIdentity.orderVersion
        && decodedCursor?.sessionHash === orderIdentity.sessionHash
        && decodedCursor?.filterHash === orderIdentity.filterHash
        && typeof cursorRandomRank === "number"
        && Number.isInteger(cursorRandomRank)
        && cursorRandomRank >= 0
        && cursorRandomRank <= 0xffff_ffff
        && typeof cursorId === "string"
        && cursorId.length > 0
        && cursorId.trim() === cursorId
        && cursorRandomRank === stableHash(`${sessionId}:${cursorId}`);
      if (cursor && !cursorMatches) {
        return {
          records: [],
          nextCursor: null,
          hasMore: false,
          returnedCount: 0,
          remainingCount: 0,
          total: orderedPool.length,
          paginationStatus: "cursor-mismatch",
          repositoryVersion: version(),
        };
      }
      const anchorKey = cursorMatches
        ? { randomRank: cursorRandomRank, id: cursorId }
        : null;
      let nextIndex = anchorKey
        ? orderedPool.findIndex((record) => compareSessionFeedKeys(
          feedSessionSortKey(record, { sessionId }),
          anchorKey,
        ) > 0)
        : 0;
      if (nextIndex < 0) nextIndex = orderedPool.length;
      const page = [];
      while (nextIndex < orderedPool.length && page.length < limit) {
        const record = orderedPool[nextIndex];
        nextIndex += 1;
        if (excluded.has(record.id)) continue;
        page.push(record);
      }
      const remainingCount = orderedPool
        .slice(nextIndex)
        .filter((record) => !excluded.has(record.id))
        .length;
      const hasMore = remainingCount > 0;
      const last = page.at(-1) || null;
      return {
        records: page.map(publicFeedRecord),
        nextCursor: hasMore && last
          ? encodeDiscoveryCursor({
            provider: "accepted-repository",
            ...orderIdentity,
            ...feedSessionSortKey(last, { sessionId }),
          })
          : null,
        hasMore,
        returnedCount: page.length,
        remainingCount,
        total: orderedPool.length,
        paginationStatus: hasMore ? "ready" : "exhausted",
        repositoryVersion: version(),
      };
    }
    const sortKeyForRecord = feedSortKey;
    const pool = basePool.sort((left, right) => compareFeedKeys(sortKeyForRecord(left), sortKeyForRecord(right)));
    const afterAnchor = anchorKey
      ? pool.filter((record) => compareFeedKeys(sortKeyForRecord(record), anchorKey) > 0)
      : anchorAcceptedAt == null
        ? pool
        : pool.filter((record) => legacyCursorFilter(record, anchorAcceptedAt, anchorId));
    const page = [];
    const clusters = new Set();
    const varietyKeys = new Set();
    const alreadyPaged = new Set();
    const addRecord = (record, { strictCluster = true, strictVariety = false, allowMaterializedCentralRepeat = false } = {}) => {
      if (page.length >= limit) return false;
      if (alreadyPaged.has(record.id) || excluded.has(record.id)) return false;
      const cluster = feedClusterKey(record);
      const varietyKey = feedVarietyKey(record);
      const countryCluster = feedCountryCluster(record);
      const imageKey = hasVerifiedFeedCover(record) ? feedImageRecentKey(record.onlineCoverAsset) : "";
      if (countryCluster && excludedClusters.has(countryCluster)) return false;
      if (cluster && excludedClusters.has(cluster)) return false;
      if (varietyKey && excludedClusters.has(varietyKey)) return false;
      if (imageKey && recentImageKeys.has(imageKey)) return false;
      if (strictCluster && clusters.has(cluster)) return false;
      if (!allowMaterializedCentralRepeat && varietyKey === "materialized-central-europe" && varietyKeys.has(varietyKey)) return false;
      if (strictVariety && varietyKeys.has(varietyKey)) return false;
      page.push(record);
      clusters.add(cluster);
      varietyKeys.add(varietyKey);
      alreadyPaged.add(record.id);
      if (imageKey) recentImageKeys.add(imageKey);
      return true;
    };
    const pushDiverse = (candidates, options = {}) => {
      for (const record of candidates) {
        if (page.length >= limit) break;
        addRecord(record, options);
      }
    };
    pushDiverse(afterAnchor, { strictCluster: false });
    const last = page.length ? page[page.length - 1] : null;
    const remaining = afterAnchor.length - page.length;
    const nextRecentIds = [...cursorRecentIds, ...page.map((record) => String(record.id || "")).filter(Boolean)].slice(-50);
    const nextRecentImageKeys = [
      ...cursorRecentImageKeys,
      ...page.map((record) => hasVerifiedFeedCover(record) ? feedImageRecentKey(record.onlineCoverAsset) : "").filter(Boolean),
    ].slice(-50);
    const hasMore = remaining > 0 || (page.length === 0 && pool.length > 0 && (anchorKey != null || anchorAcceptedAt != null));
    return {
      records: page.map(publicFeedRecord),
      nextCursor: last && hasMore
        ? encodeDiscoveryCursor({
          provider: "accepted-repository",
          ...sortKeyForRecord(last),
          recentIds: nextRecentIds,
          recentImageKeys: nextRecentImageKeys,
        })
        : null,
      hasMore,
      returnedCount: page.length,
      remainingCount: Math.max(0, remaining),
      total: pool.length,
      repositoryVersion: version(),
    };
  }

  function mark(routeId, patch) {
    const current = records.get(routeId);
    if (!current) return null;
    const next = { ...current, ...patch };
    if (isUnpublishableRouteGenerationV2(next)) return null;
    const routeIntentValidation = validateBoundRouteIntent(next, "accepted-repository-mark");
    if (!routeIntentValidation.matched) return null;
    records.set(routeId, clone(next));
    persist();
    return clone(next);
  }

  function status() {
    const values = [...records.values()];
    const single = values.filter((record) => routeKind(record) === "single").length;
    const cross = values.filter((record) => routeKind(record) === "cross").length;
    const mediaReady = values.filter((record) => record.repositoryStatus === "mediaReady" || record.enrichmentStatus === "mediaReady").length;
    const current = {
      total: values.length,
      single,
      cross,
      mediaReady,
      targets: { ...watermarks.targets, total: watermarks.totalTarget },
      minimums: { ...watermarks.minimums, total: watermarks.totalMinimum },
      repositoryVersion: version(),
    };
    return {
      ...current,
      meetsMinimum: single >= watermarks.minimums.single && cross >= watermarks.minimums.cross && values.length >= watermarks.totalMinimum,
      meetsTarget: single >= watermarks.targets.single && cross >= watermarks.targets.cross && values.length >= watermarks.totalTarget,
      shortages: poolShortage(current),
    };
  }

  return { upsert, get, list, mark, status, version };
}
function isUnpublishableRouteGenerationV2(record = {}) {
  return String(record?.generationVersion || "").trim().startsWith("route-generation-v2-")
    || String(record?.v2PublicationStatus || "").trim() === "v2-not-publishable-yet";
}
