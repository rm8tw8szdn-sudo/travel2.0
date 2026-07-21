import path from "node:path";

import { createRouteV2LiveEvidenceCanaryProvider } from "./live-evidence-canary-provider.mjs";
import { routeLegEvidenceKey, buildMissingRouteLegEvidence } from "./route-leg-evidence-schema.mjs";
import { buildMissingSeasonEvidence, seasonEvidenceKey } from "./season-evidence-schema.mjs";
import { cleanString, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_V2_JAPAN_EVIDENCE_PILOT_ID = "route-v2-japan-evidence-validation-pilot-v1";
export const ROUTE_V2_JAPAN_EVIDENCE_PILOT_STORAGE_ROOT = ".route-v2-local-evidence-japan-pilot";
export const ROUTE_V2_JAPAN_EVIDENCE_PILOT_BUNDLE_ID = "eb-japan-evidence-validation-pilot";

const CITY = Object.freeze({
  Tokyo: "Q1490",
  Kyoto: "Q34600",
  Osaka: "Q35765",
  Nara: "Q169134",
  Matsumoto: "anchor:JP:matsumoto",
  Takayama: "anchor:JP:takayama",
  Kanazawa: "anchor:JP:kanazawa",
});

export const ROUTE_V2_JAPAN_EVIDENCE_PILOT_ENTITIES = Object.freeze([
  Object.freeze({ wikidataId: CITY.Tokyo, countryCode: "JP", name: "东京", sourceTitle: "Tokyo", entityTypeName: "city", latitude: 35.6894, longitude: 139.6917 }),
  Object.freeze({ wikidataId: CITY.Kyoto, countryCode: "JP", name: "京都", sourceTitle: "Kyoto", entityTypeName: "city", latitude: 35.0116, longitude: 135.7681 }),
  Object.freeze({ wikidataId: CITY.Osaka, countryCode: "JP", name: "大阪", sourceTitle: "Osaka", entityTypeName: "city", latitude: 34.6938, longitude: 135.5021 }),
  Object.freeze({ wikidataId: CITY.Nara, countryCode: "JP", name: "奈良", sourceTitle: "Nara", entityTypeName: "city", latitude: 34.685, longitude: 135.8048 }),
  Object.freeze({ wikidataId: CITY.Kanazawa, countryCode: "JP", name: "金泽", sourceTitle: "Kanazawa", entityTypeName: "city", latitude: 36.5613, longitude: 136.6562 }),
  Object.freeze({ wikidataId: CITY.Takayama, countryCode: "JP", name: "高山", sourceTitle: "Takayama", entityTypeName: "town", latitude: 36.1461, longitude: 137.2522 }),
  Object.freeze({ wikidataId: CITY.Matsumoto, countryCode: "JP", name: "松本", sourceTitle: "Matsumoto", entityTypeName: "city", latitude: 36.238, longitude: 137.972 }),
]);

function source(url, text, { before = 120, after = 320 } = {}) {
  return Object.freeze({
    sourceUrl: url,
    sourceLocator: Object.freeze({ text, before, after }),
  });
}

function leg(from, to, transportMode, sources = []) {
  return Object.freeze({
    pilotTargetId: `leg:${from}>${to}:${transportMode}`,
    evidenceType: "route-leg",
    fromEntityId: from,
    toEntityId: to,
    transportMode,
    sources: Object.freeze(sources),
  });
}

function season(entityId, sources = []) {
  return Object.freeze({
    pilotTargetId: `season:${entityId}:2`,
    evidenceType: "season",
    entityId,
    month: 2,
    sources: Object.freeze(sources),
  });
}

const JR_CENTRAL_TOKYO_KYOTO = source(
  "https://global.jr-central.co.jp/en/onlinebooking/contents/shinkansen/",
  "You’ll arrive in Kyoto from Tokyo in about 2 hours",
  { before: 90, after: 80 },
);
const KYOTO_FROM_OSAKA = source(
  "https://kyoto.travel/en/getting-to",
  "From Osaka Station(JR) By JR Special Rapid Service (Approx. 30 minutes) To Kyoto Station",
  { before: 80, after: 140 },
);
const NARA_FROM_OSAKA = source(
  "https://www.westjr.co.jp/global/en/with-expo2025/nara/",
  "Nara Access - From Osaka About 55 min.",
  { before: 80, after: 100 },
);
const MATSUMOTO_ACCESS = "https://www.japan.travel/en/destinations/hokuriku-shinetsu/nagano/matsumoto-and-around/";
const TOKYO_MATSUMOTO = source(
  MATSUMOTO_ACCESS,
  "Easily accessible by train from popular destinations such as Tokyo's Shinjuku Station (2 hours 40 minutes)",
  { before: 260, after: 100 },
);
const MATSUMOTO_TAKAYAMA = source(
  MATSUMOTO_ACCESS,
  "Convenient bus service connects the area with Takayama in the neighboring Gifu Prefecture (2 hours 30 minutes)",
  { before: 380, after: 80 },
);
const KANAZAWA_ACCESS = "https://visitkanazawa.jp/en/getting-to-kanazawa";
const KANAZAWA_TAKAYAMA = source(
  KANAZAWA_ACCESS,
  "Bus tours from Kanazawa to Takayama, Shirakawa-go, etc.",
  { before: 100, after: 80 },
);
const TOKYO_KANAZAWA = source(
  KANAZAWA_ACCESS,
  "From TOKYO BY TRAIN Tokyo Station --- 2 h 30 min",
  { before: 40, after: 100 },
);

const FEBRUARY_GUIDE = "https://www.japan.travel/en/guide/february/";
const TOKYO_FEBRUARY = source(
  FEBRUARY_GUIDE,
  "Though uncommon, snow can fall in Tokyo and other urban areas such as Osaka and Hiroshima",
  { before: 120, after: 100 },
);
const OSAKA_FEBRUARY = TOKYO_FEBRUARY;
const KYOTO_NARA_WINTER = "https://www.japan.travel/en/my/your-first-winter-japan/breathtaking-views-visit-ancient-cities-kyoto-nara-during-snowy-/";
const KYOTO_FEBRUARY = source(
  KYOTO_NARA_WINTER,
  "The average temperature in January is around 3℃-5℃, and in February, the average temperature is around 4℃-5℃",
  { before: 400, after: 180 },
);
const NARA_FEBRUARY = source(
  "https://www.japan.travel/en/destinations/kansai/nara/yoshino-area/",
  "In early February, the town comes alive with the local Oni Fest",
  { before: 360, after: 120 },
);
const MATSUMOTO_FEBRUARY = source(
  "https://www.japan.travel/en/weather/hokuriku/matsumoto/",
  "Monthly Trends Matsumoto",
  { before: 80, after: 500 },
);
const TAKAYAMA_FEBRUARY = source(
  "https://www.japan.travel/en/sports/snow/tokai/",
  "see plenty of snow between December and February every year",
  { before: 260, after: 360 },
);
const KANAZAWA_FEBRUARY = source(
  "https://visitkanazawa.jp/en/kanazawa-101/detail_238.html",
  "Snowfall usually begins around the end of December and continues through the end of February",
  { before: 160, after: 260 },
);

export const ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS = Object.freeze([
  leg(CITY.Tokyo, CITY.Kyoto, "rail", [JR_CENTRAL_TOKYO_KYOTO]),
  leg(CITY.Kyoto, CITY.Tokyo, "rail"),
  leg(CITY.Kyoto, CITY.Osaka, "rail"),
  leg(CITY.Osaka, CITY.Kyoto, "rail", [KYOTO_FROM_OSAKA]),
  leg(CITY.Osaka, CITY.Nara, "rail", [NARA_FROM_OSAKA]),
  leg(CITY.Nara, CITY.Osaka, "rail"),
  leg(CITY.Tokyo, CITY.Matsumoto, "rail", [TOKYO_MATSUMOTO]),
  leg(CITY.Matsumoto, CITY.Tokyo, "rail"),
  leg(CITY.Matsumoto, CITY.Takayama, "road", [MATSUMOTO_TAKAYAMA]),
  leg(CITY.Takayama, CITY.Matsumoto, "road"),
  leg(CITY.Kanazawa, CITY.Takayama, "road", [KANAZAWA_TAKAYAMA]),
  leg(CITY.Takayama, CITY.Kanazawa, "road"),
  leg(CITY.Tokyo, CITY.Kanazawa, "rail", [TOKYO_KANAZAWA]),
  leg(CITY.Kanazawa, CITY.Tokyo, "rail"),
  season(CITY.Tokyo, [TOKYO_FEBRUARY]),
  season(CITY.Kyoto, [KYOTO_FEBRUARY]),
  season(CITY.Osaka, [OSAKA_FEBRUARY]),
  season(CITY.Nara, [NARA_FEBRUARY]),
  season(CITY.Matsumoto, [MATSUMOTO_FEBRUARY]),
  season(CITY.Takayama, [TAKAYAMA_FEBRUARY]),
  season(CITY.Kanazawa, [KANAZAWA_FEBRUARY]),
]);

function clean(value) {
  return cleanString(value);
}

function targetKey(target) {
  return target.evidenceType === "route-leg"
    ? routeLegEvidenceKey(target)
    : seasonEvidenceKey(target);
}

function matchesType(target, type = "all") {
  return type === "all" || target.evidenceType === type;
}

export function planJapanEvidencePilot({ limit = ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS.length, type = "all" } = {}) {
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS.length));
  return ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS
    .filter((target) => matchesType(target, type))
    .slice(0, safeLimit)
    .map((target) => ({
      pilotTargetId: target.pilotTargetId,
      evidenceType: target.evidenceType,
      targetKey: targetKey(target),
      sourceUrls: target.sources.map((entry) => entry.sourceUrl),
    }));
}

export function seedJapanEvidencePilot(repository, { now = () => new Date().toISOString() } = {}) {
  if (!repository?.routeLegStore || !repository?.seasonStore || !repository?.missingEvidenceStore) {
    return { persisted: false, reason: "japan-pilot-repository-required", targetCount: 0 };
  }
  const routeLegRecords = [];
  const seasonRecords = [];
  const manifestInputs = [];
  for (const target of ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS) {
    if (target.evidenceType === "route-leg") {
      const built = buildMissingRouteLegEvidence(target, { now });
      if (!built.created) return { persisted: false, reason: built.reason, targetCount: 0 };
      routeLegRecords.push(built.record);
      manifestInputs.push({
        evidenceType: "route-leg",
        targetKey: routeLegEvidenceKey(built.record),
        legEvidenceId: built.record.legEvidenceId,
        requestedByBundleIds: [ROUTE_V2_JAPAN_EVIDENCE_PILOT_BUNDLE_ID],
        selectedCandidate: true,
        critical: true,
        reason: "Japan pilot directed route leg requires official reusable evidence.",
      });
    } else {
      const built = buildMissingSeasonEvidence(target, { now });
      if (!built.created) return { persisted: false, reason: built.reason, targetCount: 0 };
      seasonRecords.push(built.record);
      manifestInputs.push({
        evidenceType: "season",
        targetKey: seasonEvidenceKey(built.record),
        seasonEvidenceId: built.record.seasonEvidenceId,
        requestedByBundleIds: [ROUTE_V2_JAPAN_EVIDENCE_PILOT_BUNDLE_ID],
        selectedCandidate: true,
        critical: false,
        reason: "Japan pilot destination requires official February hard-risk evidence.",
      });
    }
  }
  const existingLegIds = new Set(repository.routeLegStore.list().map((record) => record.legEvidenceId));
  const existingSeasonIds = new Set(repository.seasonStore.list().map((record) => record.seasonEvidenceId));
  const newRouteLegRecords = routeLegRecords.filter((record) => !existingLegIds.has(record.legEvidenceId));
  const newSeasonRecords = seasonRecords.filter((record) => !existingSeasonIds.has(record.seasonEvidenceId));
  const legWrite = repository.routeLegStore.upsertMany(newRouteLegRecords);
  if (legWrite.persisted !== true) return { persisted: false, reason: legWrite.reason, targetCount: 0 };
  const seasonWrite = repository.seasonStore.upsertMany(newSeasonRecords);
  if (seasonWrite.persisted !== true) return { persisted: false, reason: seasonWrite.reason, targetCount: 0 };
  const manifestWrite = repository.missingEvidenceStore.aggregateMany(manifestInputs);
  if (manifestWrite.persisted !== true) return { persisted: false, reason: manifestWrite.reason, targetCount: 0 };
  return {
    persisted: true,
    skipped: Boolean(legWrite.skipped && seasonWrite.skipped && manifestWrite.skipped),
    targetCount: ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS.length,
    routeLegCount: routeLegRecords.length,
    seasonCount: seasonRecords.length,
    manifestCount: manifestInputs.length,
  };
}

export function createJapanEvidencePilotSourceDiscovery({ now = () => new Date().toISOString() } = {}) {
  const byTargetKey = new Map(ROUTE_V2_JAPAN_EVIDENCE_PILOT_TARGETS.map((target) => [targetKey(target), target]));
  return {
    providerId: "japan-evidence-pilot-official-url-seed",
    capabilities: {
      configured: true,
      requiresApiKey: false,
      realtimeUserRequest: false,
    },
    async searchEvidence({ task = null, context = {} } = {}) {
      const key = clean(task?.targetKey)
        || (context.record?.fromEntityId ? routeLegEvidenceKey(context.record) : seasonEvidenceKey(context.record));
      const target = byTargetKey.get(key);
      const results = target?.sources?.map((entry) => structuredClone(entry)) || [];
      return {
        ok: results.length > 0,
        configured: true,
        attempted: false,
        attempts: 0,
        results,
        failure: results.length ? "" : "no-result",
        retrievedAt: now(),
      };
    },
  };
}

export function createJapanEvidencePilotProvider({
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = 8_000,
} = {}) {
  return createRouteV2LiveEvidenceCanaryProvider({
    discoveryProvider: createJapanEvidencePilotSourceDiscovery({ now }),
    fetchImpl,
    now,
    timeoutMs,
    maxSourcesPerTask: 2,
  });
}

export function summarizeJapanEvidencePilot(repository, {
  storageRoot = ROUTE_V2_JAPAN_EVIDENCE_PILOT_STORAGE_ROOT,
} = {}) {
  const routeLegs = repository?.routeLegStore?.list?.() || [];
  const seasons = repository?.seasonStore?.list?.() || [];
  const manifest = repository?.missingEvidenceStore?.list?.() || [];
  const statusCounts = Object.fromEntries(uniqueStrings(manifest.map((item) => item.status)).map((status) => [
    status,
    manifest.filter((item) => item.status === status).length,
  ]));
  const sourceDomains = uniqueStrings([...routeLegs, ...seasons].flatMap((record) => (record.sources || []).map((entry) => {
    try { return new URL(entry.url).hostname; } catch { return ""; }
  })).filter(Boolean));
  return {
    storageRoot: path.resolve(storageRoot),
    routeLegCount: routeLegs.filter((record) => record.sourceRefs?.length).length,
    seasonCount: seasons.filter((record) => record.sourceRefs?.length).length,
    manifestCount: manifest.length,
    statusCounts,
    sourceDomains,
  };
}
