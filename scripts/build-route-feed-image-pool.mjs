import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".route-v2-cache");
const ACCEPTED_PATH = process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(CACHE_DIR, "accepted-routes.json");
const POOL_PATH = process.env.ROUTE_FEED_IMAGE_POOL_PATH || path.join(CACHE_DIR, "feed-image-pool.json");
const REPORT_PATH = process.env.ROUTE_FEED_IMAGE_POOL_REPORT || path.join(CACHE_DIR, "feed-image-pool-report.json");
const ROUTE_LIMIT = Number.parseInt(process.env.ROUTE_IMAGE_POOL_ROUTE_LIMIT || "800", 10);
const DESTINATION_LIMIT = Number.parseInt(process.env.ROUTE_IMAGE_POOL_DESTINATION_LIMIT || "3200", 10);
const CONCURRENCY = Number.parseInt(process.env.ROUTE_IMAGE_POOL_CONCURRENCY || "8", 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.ROUTE_IMAGE_POOL_REQUEST_TIMEOUT_MS || "1800", 10);
const SAVE_EVERY = Number.parseInt(process.env.ROUTE_IMAGE_POOL_SAVE_EVERY || "40", 10);
const POLICY_VERSION = process.env.ROUTE_FEED_IMAGE_POLICY_VERSION || "feed-image-v2";
const USER_AGENT = "travel-collection-local-preview/1.0";

const BAD_IMAGE_PATTERNS = /map|locator|flag|logo|icon|diagram|sign|marker|svg|\.png(?:[?#]|$)|\.tiff?|tif(?:[/?#]|$)|collage|pays|interior|room|shop|stall|vendor|worker|people|person|crowd|selfie|passport|luggage|brochure|poster|airport|station|platform|parking|garage|workshop|national[_ -]?road|rail[_ -]?trail|car[_ -]?wash|memorial|arkadenhof|front\.jpe?g|museum|camping|thumbnail_unscaled.*\.png|red[_ -]?background|blank/i;

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function imageIdentity(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return `${url.hostname}${url.pathname.replace(/\/\d+px-/i, "/").toLowerCase()}`;
  } catch {
    return text.toLowerCase();
  }
}

function countryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function routeKind(record = {}) {
  if (record.classification === "single" || record.classification === "cross") return record.classification;
  return countryCodes(record).length > 1 ? "cross" : "single";
}

function routeHasChina(record = {}) {
  return countryCodes(record).includes("CN")
    || [...(record.countries || []), ...(record.countryEntities || []).map((item) => item.name)]
      .some((item) => /中国|china/i.test(String(item || "")));
}

function isMaterializedRoute(record = {}) {
  return String(record.id || "").startsWith("materialized-")
    || record.contentEvidence?.plannerRuleVersion
    || record.contentEvidence?.materialized
    || record.coverAsset?.discoveredVia === "planner-rule-materialized"
    || record.coverAsset?.discoveredVia === "materialized-route-pool";
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function routeScore(record = {}) {
  const kindBonus = routeKind(record) === "cross" ? 4 : 2;
  const destinations = Array.isArray(record.destinationEntities) ? record.destinationEntities.length : 0;
  const score = Number(record.qualityScore || record.compositionScore?.total || 0);
  return kindBonus + destinations + score;
}

function normalizeTitle(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function destinationTasks(records = []) {
  const taskMap = new Map();
  const sorted = records
    .filter((record) => !routeHasChina(record) && Array.isArray(record.destinationEntities))
    .sort((left, right) => routeScore(right) - routeScore(left) || stableHash(left.id || left.name) - stableHash(right.id || right.name))
    .slice(0, Number.isFinite(ROUTE_LIMIT) && ROUTE_LIMIT > 0 ? ROUTE_LIMIT : records.length);

  for (const record of sorted) {
    const routeCodes = new Set(countryCodes(record));
    const destinations = (record.destinationEntities || [])
      .map((item) => ({
        countryCode: String(item?.countryCode || "").toUpperCase(),
        wikidataId: normalizeTitle(item?.wikidataId),
        title: normalizeTitle(item?.sourceTitle || item?.name),
        name: normalizeTitle(item?.name || item?.sourceTitle),
        entityTypeName: normalizeTitle(item?.entityTypeName),
        routeId: record.id,
        routeName: record.name,
      }))
      .filter((item) => /^[A-Z]{2}$/.test(item.countryCode) && routeCodes.has(item.countryCode) && item.title);
    const rotated = destinations.slice().sort((left, right) => stableHash(`${record.id}:${left.title}`) - stableHash(`${record.id}:${right.title}`));
    for (const destination of rotated) {
      const key = `${destination.countryCode}:${destination.title}`.toLowerCase();
      if (!taskMap.has(key)) taskMap.set(key, destination);
    }
  }
  return [...taskMap.values()].slice(0, Number.isFinite(DESTINATION_LIMIT) && DESTINATION_LIMIT > 0 ? DESTINATION_LIMIT : taskMap.size);
}

function createPoolStore(existing = {}) {
  return {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: existing.entries && typeof existing.entries === "object" ? existing.entries : {},
    checkedDestinations: existing.checkedDestinations && typeof existing.checkedDestinations === "object" ? existing.checkedDestinations : {},
    stats: existing.stats && typeof existing.stats === "object" ? existing.stats : {},
  };
}

function addPoolImage(store, code, image) {
  const normalized = String(code || "").toUpperCase();
  const key = image?.imageDedupeKey || image?.dedupeKey || imageIdentity(image?.imageUrl);
  if (!/^[A-Z]{2}$/.test(normalized) || !image?.imageUrl || !key) return false;
  const list = Array.isArray(store.entries[normalized]) ? store.entries[normalized] : [];
  if (list.some((item) => (item.imageDedupeKey || item.dedupeKey || imageIdentity(item.imageUrl)) === key)) {
    store.entries[normalized] = list;
    return false;
  }
  list.push({
    ...image,
    imageCountryCodes: [normalized],
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    policyVersion: POLICY_VERSION,
    imageDedupeKey: key,
    dedupeKey: key,
  });
  store.entries[normalized] = list;
  return true;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function wikipediaSummary(pageTitle) {
  const url = new URL(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`);
  const response = await fetchWithTimeout(url, {
    headers: { "user-agent": USER_AGENT },
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function wikidataFilePathUrl(fileName = "") {
  const normalized = normalizeTitle(fileName);
  if (!normalized) return "";
  const url = new URL(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalized.replace(/ /g, "_"))}`);
  url.searchParams.set("width", "960");
  return url.href;
}

async function wikidataEntityImage(task) {
  if (!/^Q\d+$/i.test(String(task.wikidataId || ""))) return null;
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(task.wikidataId)}.json`;
  const response = await fetchWithTimeout(url, {
    headers: { "user-agent": USER_AGENT },
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null);
  const entity = payload?.entities?.[task.wikidataId];
  const fileName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || "";
  const imageUrl = wikidataFilePathUrl(fileName);
  const text = [fileName, task.title, task.entityTypeName].filter(Boolean).join(" ");
  if (!imageUrl || BAD_IMAGE_PATTERNS.test(text)) return null;
  const key = imageIdentity(imageUrl);
  return {
    provider: "feed-image-pool-wikidata-p18",
    imageUrl,
    sourceUrl: `https://www.wikidata.org/wiki/${task.wikidataId}`,
    title: task.title || fileName,
    query: task.title || task.name || task.wikidataId,
    qualityScore: 84,
    imageCountryCodes: [task.countryCode],
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    matchEvidence: `country:${task.countryCode}; destination:${task.title}; wikidata:${task.wikidataId}; P18`,
    imageMatchReason: `目的地 ${task.title} 的 Wikidata 图片属于 ${task.countryCode}`,
    imageDedupeKey: key,
    dedupeKey: key,
    verifiedAt: new Date().toISOString(),
  };
}

function summaryImageAsset(task, summary) {
  const source = summary?.originalimage?.source || summary?.thumbnail?.source || "";
  const title = normalizeTitle(summary?.title || task.title);
  const sourceUrl = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(task.title.replace(/ /g, "_"))}`;
  const text = [source, sourceUrl, title, task.title, task.entityTypeName].filter(Boolean).join(" ");
  if (!/^https?:\/\//i.test(source)) return null;
  if (BAD_IMAGE_PATTERNS.test(text)) return null;
  if (/\.(?:svg|gif|pdf|webm|ogv|tiff?|xcf)(?:[?#]|$)/i.test(source)) return null;
  const key = imageIdentity(source);
  return {
    provider: "feed-image-pool-wikipedia-summary",
    imageUrl: source,
    sourceUrl,
    title,
    query: task.title,
    qualityScore: summary?.originalimage?.source ? 86 : 72,
    imageCountryCodes: [task.countryCode],
    status: "verified",
    semanticStatus: "verified",
    coverStatus: "verified",
    matchEvidence: `country:${task.countryCode}; destination:${task.title}; wikipedia-summary`,
    imageMatchReason: `目的地 ${task.title} 属于 ${task.countryCode}`,
    imageDedupeKey: key,
    dedupeKey: key,
    verifiedAt: new Date().toISOString(),
  };
}

async function resolveTaskImage(task) {
  const wikidataImage = await wikidataEntityImage(task).catch(() => null);
  if (wikidataImage) return wikidataImage;
  let summary = await wikipediaSummary(task.title);
  let asset = summaryImageAsset(task, summary);
  if (!asset && task.name && task.name !== task.title) {
    summary = await wikipediaSummary(task.name);
    asset = summaryImageAsset({ ...task, title: task.name }, summary);
  }
  return asset;
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, next));
}

const payload = readJson(ACCEPTED_PATH);
const records = Array.isArray(payload?.records) ? payload.records : [];
if (!records.length) throw new Error(`No accepted records found at ${ACCEPTED_PATH}`);

const store = createPoolStore(readJson(POOL_PATH, {}));
const tasks = destinationTasks(records);
const startedAt = new Date().toISOString();
let checked = 0;
let skipped = 0;
let added = 0;
let failed = 0;
let lastSave = 0;

console.log(JSON.stringify({
  startedAt,
  acceptedRecords: records.length,
  tasks: tasks.length,
  routeLimit: ROUTE_LIMIT,
  destinationLimit: DESTINATION_LIMIT,
  concurrency: CONCURRENCY,
  timeoutMs: REQUEST_TIMEOUT_MS,
}, null, 2));

await runPool(tasks, async (task) => {
  const taskKey = `${task.countryCode}:${task.title}`.toLowerCase();
  const checkedItem = store.checkedDestinations[taskKey];
  if (checkedItem?.policyVersion === POLICY_VERSION && checkedItem?.status === "verified") {
    skipped += 1;
    return;
  }
  checked += 1;
  const image = await resolveTaskImage(task).catch(() => null);
  if (image && addPoolImage(store, task.countryCode, image)) {
    added += 1;
    store.checkedDestinations[taskKey] = {
      policyVersion: POLICY_VERSION,
      status: "verified",
      checkedAt: new Date().toISOString(),
      imageDedupeKey: image.imageDedupeKey,
      routeId: task.routeId,
      routeName: task.routeName,
    };
  } else {
    failed += 1;
    store.checkedDestinations[taskKey] = {
      policyVersion: POLICY_VERSION,
      status: "not_found",
      checkedAt: new Date().toISOString(),
      routeId: task.routeId,
      routeName: task.routeName,
    };
  }
  if (checked - lastSave >= SAVE_EVERY) {
    lastSave = checked;
    store.updatedAt = new Date().toISOString();
    store.stats = {
      checked,
      skipped,
      added,
      failed,
      totalImages: Object.values(store.entries).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
      countries: Object.keys(store.entries).length,
    };
    writeJsonAtomic(POOL_PATH, store);
    console.log(`saved pool checkpoint: checked=${checked}, added=${added}, failed=${failed}`);
  }
}, CONCURRENCY);

store.updatedAt = new Date().toISOString();
store.stats = {
  checked,
  skipped,
  added,
  failed,
  totalImages: Object.values(store.entries).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
  countries: Object.keys(store.entries).length,
};
writeJsonAtomic(POOL_PATH, store);

const report = {
  ok: true,
  startedAt,
  finishedAt: new Date().toISOString(),
  acceptedRecords: records.length,
  taskCount: tasks.length,
  policyVersion: POLICY_VERSION,
  poolPath: POOL_PATH,
  ...store.stats,
};
writeJsonAtomic(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
