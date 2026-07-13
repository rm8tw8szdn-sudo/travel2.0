import { assetIdentity, validAsset } from "./media-service.mjs";
import fs from "node:fs";
import path from "node:path";

function keyFor(input = {}) {
  return [input.destinationEntityId || input.wikidataId, input.canonicalName || input.name, input.countryCode].filter(Boolean).join("::");
}

function clone(value) {
  return structuredClone(value);
}

function readRecords(storagePath) {
  if (!storagePath || !fs.existsSync(storagePath)) return [];
  const payload = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  return Array.isArray(payload?.records) ? payload.records : [];
}

function writeRecords(storagePath, records) {
  if (!storagePath) return;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const tempPath = `${storagePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify({ schemaVersion: 1, records }, null, 2));
  fs.renameSync(tempPath, storagePath);
}

export function createDestinationImageRepository({ storagePath = "" } = {}) {
  const byDestination = new Map();
  const usedAssets = new Map();

  function persist() {
    writeRecords(storagePath, [...byDestination.values()]);
  }

  for (const record of readRecords(storagePath)) {
    if (!validAsset(record?.asset)) continue;
    const key = keyFor(record);
    byDestination.set(key, clone(record));
    usedAssets.set(assetIdentity(record.asset), key);
  }

  function upsert({ destinationEntityId = "", canonicalName = "", countryCode = "", asset } = {}) {
    if (!validAsset(asset)) return { accepted: false, reason: "invalid-asset" };
    const key = keyFor({ destinationEntityId, canonicalName, countryCode });
    const identity = assetIdentity(asset);
    const owner = usedAssets.get(identity);
    if (owner && owner !== key) return { accepted: false, reason: "duplicate-destination-asset" };
    const record = { destinationEntityId, canonicalName, countryCode, asset: clone(asset), status: "ready", updatedAt: new Date().toISOString() };
    byDestination.set(key, record);
    usedAssets.set(identity, key);
    persist();
    return { accepted: true, record: clone(record) };
  }

  function resolve(input = {}) {
    const record = byDestination.get(keyFor(input));
    return record ? clone(record) : null;
  }

  function stats() {
    return { total: byDestination.size };
  }

  return { upsert, resolve, stats };
}
