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

const COUNTRY_CONTINENT_SETS = {
  africa: new Set(["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW"]),
  americas: new Set(["AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY", "VE"]),
  asia: new Set(["AF", "AM", "AZ", "BH", "BD", "BT", "BN", "KH", "CY", "GE", "IN", "ID", "IR", "IQ", "IL", "JP", "JO", "KZ", "KW", "KG", "LA", "LB", "MY", "MV", "MN", "MM", "NP", "KP", "OM", "PK", "PS", "PH", "QA", "SA", "SG", "KR", "LK", "SY", "TW", "TJ", "TH", "TL", "TR", "TM", "AE", "UZ", "VN", "YE"]),
  europe: new Set(["AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA", "XK"]),
  oceania: new Set(["AU", "FJ", "FM", "KI", "MH", "NR", "NZ", "PW", "PG", "WS", "SB", "TO", "TV", "VU"]),
};

const FEED_CONTINENT_ORDER = ["asia", "europe", "africa", "americas", "oceania", "other"];

function feedCountryCodes(record) {
  return [...new Set([
    ...(record?.countryEntities || []).map((item) => item.countryCode),
    ...(record?.countries || []),
  ].map((code) => String(code || "").toUpperCase()).filter((code) => /^[A-Z]{2}$/u.test(code)))];
}

function feedCountryCluster(record) {
  return feedCountryCodes(record).sort().join("|");
}

function countryContinentKey(code) {
  const normalized = String(code || "").toUpperCase();
  for (const [continent, codes] of Object.entries(COUNTRY_CONTINENT_SETS)) {
    if (codes.has(normalized)) return continent;
  }
  return "other";
}

function feedContinentBucket(record) {
  const continents = [...new Set(feedCountryCodes(record).map(countryContinentKey))].filter(Boolean);
  if (!continents.length) return "other";
  if (continents.length === 1) return continents[0];
  return continents[stableHash(`${record?.id || record?.name || ""}:continent`) % continents.length] || "other";
}

function rotatedContinentOrder(sessionId, feedCycle) {
  const order = [...FEED_CONTINENT_ORDER];
  const offset = stableHash(`${sessionId}:${feedCycle}:continent-cycle`) % order.length;
  return [...order.slice(offset), ...order.slice(0, offset)];
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

function feedRandomSortKey(record, { sessionId = "", latestAcceptedMs = 0 } = {}) {
  const acceptedMs = Date.parse(record?.acceptedAt || "") || 0;
  const recentWindowMs = 14 * 24 * 60 * 60 * 1000;
  return {
    feedReadyBucket: hasVerifiedFeedCover(record) ? 0 : 1,
    freshnessBucket: acceptedMs && latestAcceptedMs && latestAcceptedMs - acceptedMs <= recentWindowMs ? 0 : 1,
    randomRank: stableHash(`${sessionId}:${record?.id || ""}`),
    acceptedAt: String(record?.acceptedAt || ""),
    id: String(record?.id || ""),
  };
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

function feedCycleFromCursor(decoded) {
  const cycle = Number(decoded?.feedCycle || 0);
  return Number.isFinite(cycle) && cycle > 0 ? Math.floor(cycle) : 0;
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
    const typedIds = new Set(typedPool.map((record) => record.id));
    const randomizedFeed = !needle && Boolean(sessionId);
    const strictFeed = !needle && limit < 100_000;
    const feedReadyPool = strictFeed ? typedPool.filter(hasVerifiedFeedCover) : [];
    const basePool = strictFeed ? feedReadyPool : typedPool;
    const initialFeedCycle = randomizedFeed && decodedCursor ? feedCycleFromCursor(decodedCursor) : 0;
    const latestAcceptedMs = randomizedFeed
      ? Math.max(0, ...basePool.map((record) => Date.parse(record.acceptedAt || "") || 0))
      : 0;
    const sortKeyForCycle = (feedCycle) => (randomizedFeed
      ? (record) => feedRandomSortKey(record, { sessionId: `${sessionId}:${feedCycle}`, latestAcceptedMs })
      : feedSortKey);
    const sortKeyForRecord = randomizedFeed
      ? sortKeyForCycle(initialFeedCycle)
      : feedSortKey;
    const pool = basePool.sort((left, right) => {
      if (randomizedFeed && requestedKind) {
        const leftPriority = routeKind(left) === requestedKind ? 0 : 1;
        const rightPriority = routeKind(right) === requestedKind ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      }
      return compareFeedKeys(sortKeyForRecord(left), sortKeyForRecord(right));
    });
    const afterAnchor = randomizedFeed
      ? (anchorKey ? pool.filter((record) => compareFeedKeys(sortKeyForRecord(record), anchorKey) > 0) : pool)
      : anchorKey
      ? pool.filter((record) => compareFeedKeys(sortKeyForRecord(record), anchorKey) > 0)
      : anchorAcceptedAt == null
        ? pool
        : pool.filter((record) => legacyCursorFilter(record, anchorAcceptedAt, anchorId));
    const page = [];
    let lastFeedCycle = initialFeedCycle;
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
    const pushContinentCycle = (candidates, options = {}) => {
      const buckets = new Map(FEED_CONTINENT_ORDER.map((key) => [key, []]));
      for (const record of candidates) {
        if (excluded.has(record.id) || alreadyPaged.has(record.id)) continue;
        const bucket = feedContinentBucket(record);
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket).push(record);
      }
      const order = rotatedContinentOrder(sessionId, lastFeedCycle);
      let added = true;
      while (page.length < limit && added) {
        added = false;
        for (const bucketKey of order) {
          const bucket = buckets.get(bucketKey) || [];
          while (bucket.length && page.length < limit) {
            if (addRecord(bucket.shift(), options)) {
              added = true;
              break;
            }
          }
        }
      }
    };
    if (randomizedFeed) pushContinentCycle(afterAnchor, { strictCluster: true, strictVariety: true });
    else pushDiverse(afterAnchor, { strictCluster: false });
    if (randomizedFeed && page.length < limit) pushDiverse(afterAnchor, { strictCluster: true, strictVariety: false });
    if (randomizedFeed && page.length < limit && basePool.length) {
      lastFeedCycle = initialFeedCycle + 1;
      const nextSortKey = sortKeyForCycle(lastFeedCycle);
      const nextPool = basePool
        .slice()
        .sort((left, right) => {
          if (requestedKind) {
            const leftPriority = routeKind(left) === requestedKind ? 0 : 1;
            const rightPriority = routeKind(right) === requestedKind ? 0 : 1;
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          }
          return compareFeedKeys(nextSortKey(left), nextSortKey(right));
        });
      pushContinentCycle(nextPool, { strictCluster: true, strictVariety: true });
      if (page.length < limit) pushDiverse(nextPool, { strictCluster: true, strictVariety: false });
      if (page.length < limit) pushDiverse(nextPool, { strictCluster: false, strictVariety: false, allowMaterializedCentralRepeat: true });
    }
    const last = page.length ? page[page.length - 1] : null;
    const remaining = afterAnchor.length - page.length;
    const nextRecentIds = [...cursorRecentIds, ...page.map((record) => String(record.id || "")).filter(Boolean)].slice(-50);
    const nextRecentImageKeys = [
      ...cursorRecentImageKeys,
      ...page.map((record) => hasVerifiedFeedCover(record) ? feedImageRecentKey(record.onlineCoverAsset) : "").filter(Boolean),
    ].slice(-50);
    const hasMore = randomizedFeed
      ? basePool.length > 0
      : remaining > 0 || (page.length === 0 && pool.length > 0 && (anchorKey != null || anchorAcceptedAt != null));
    const lastSortKey = randomizedFeed ? sortKeyForCycle(lastFeedCycle) : sortKeyForRecord;
    return {
      records: page.map(publicFeedRecord),
      nextCursor: last && hasMore
        ? encodeDiscoveryCursor({
          provider: "accepted-repository",
          ...lastSortKey(last),
          feedCycle: lastFeedCycle,
          recentIds: nextRecentIds,
          recentImageKeys: nextRecentImageKeys,
        })
        : null,
      hasMore,
      total: pool.length,
      repositoryVersion: version(),
    };
  }

  function mark(routeId, patch) {
    const current = records.get(routeId);
    if (!current) return null;
    const next = { ...current, ...patch };
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
