import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".route-v2-cache");
const ACCEPTED_PATH = process.env.ROUTE_ACCEPTED_REPOSITORY_PATH || path.join(CACHE_DIR, "accepted-routes.json");
const API_BASE_URL = process.env.ROUTE_PREWARM_API_BASE_URL || "http://127.0.0.1:4173";
const LIMIT = Number.parseInt(process.env.ROUTE_PROXY_WARM_LIMIT || "900", 10);
const CONCURRENCY = Number.parseInt(process.env.ROUTE_PROXY_WARM_CONCURRENCY || "10", 10);
const TIMEOUT_MS = Number.parseInt(process.env.ROUTE_PROXY_WARM_TIMEOUT_MS || "8000", 10);
const REPORT_PATH = process.env.ROUTE_PROXY_WARM_REPORT || path.join(CACHE_DIR, "feed-proxy-warm-report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function countryCodes(record = {}) {
  return [...new Set([
    ...(record.countryEntities || []).map((item) => item.countryCode),
    ...(record.countries || []),
  ].map((code) => String(code || "").trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
}

function isVerifiedFeedRecord(record = {}) {
  const asset = record.feedReady ? record.onlineCoverAsset : null;
  if (!asset?.imageUrl) return false;
  const routeCodes = countryCodes(record);
  const imageCodes = Array.isArray(asset.imageCountryCodes)
    ? asset.imageCountryCodes.map((code) => String(code || "").toUpperCase())
    : [];
  return routeCodes.length > 0 && imageCodes.some((code) => routeCodes.includes(code));
}

function routeKind(record = {}) {
  if (record.classification === "single" || record.classification === "cross") return record.classification;
  return countryCodes(record).length > 1 ? "cross" : "single";
}

function imageKey(record = {}) {
  const asset = record.onlineCoverAsset || {};
  return asset.imageDedupeKey || asset.dedupeKey || asset.imageUrl || "";
}

async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
const records = Array.isArray(payload.records) ? payload.records : [];
const seenImages = new Set();
const readyRecords = records
  .filter(isVerifiedFeedRecord)
  .sort((left, right) => {
    const leftKind = routeKind(left) === "cross" ? 0 : 1;
    const rightKind = routeKind(right) === "cross" ? 0 : 1;
    if (leftKind !== rightKind) return leftKind - rightKind;
    return String(left.id || "").localeCompare(String(right.id || ""));
  })
  .filter((record) => {
    const key = imageKey(record);
    if (!key || seenImages.has(key)) return false;
    seenImages.add(key);
    return true;
  })
  .slice(0, Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : records.length);

let warmed = 0;
let failed = 0;
const failures = [];
const startedAt = new Date().toISOString();

console.log(JSON.stringify({
  startedAt,
  acceptedRecords: records.length,
  readyRecords: readyRecords.length,
  limit: LIMIT,
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
}, null, 2));

await runPool(readyRecords, async (record) => {
  const imageUrl = record.onlineCoverAsset.imageUrl;
  const proxyUrl = `${API_BASE_URL}/api/routes/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  const response = await fetchWithTimeout(proxyUrl).catch(() => null);
  const contentType = response?.headers?.get("content-type") || "";
  if (response?.ok && contentType.startsWith("image/")) {
    await response.arrayBuffer().catch(() => null);
    warmed += 1;
    return;
  }
  failed += 1;
  if (failures.length < 30) failures.push({
    id: record.id,
    name: record.name,
    imageUrl,
    status: response?.status || 0,
    contentType,
  });
}, CONCURRENCY);

const report = {
  ok: failed === 0,
  startedAt,
  finishedAt: new Date().toISOString(),
  acceptedRecords: records.length,
  attempted: readyRecords.length,
  warmed,
  failed,
  failures,
};
writeJsonAtomic(REPORT_PATH, report);
console.log(JSON.stringify(report, null, 2));
