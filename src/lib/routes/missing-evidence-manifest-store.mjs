import path from "node:path";
import { createAtomicJsonlEvidenceStore } from "./local-evidence-store-primitives.mjs";
import {
  buildMissingEvidenceManifestItem,
  computeMissingEvidencePriority,
  normalizeMissingEvidenceManifestItem,
  validateMissingEvidenceManifestItem,
} from "./missing-evidence-manifest-schema.mjs";
import { isRouteV2LocalEvidenceIndexEnabled } from "./route-leg-evidence-store.mjs";
import { uniqueStrings } from "./route-v2-utils.mjs";

export function defaultMissingEvidenceManifestPath(env = process.env) {
  return env.ROUTE_V2_MISSING_EVIDENCE_MANIFEST_PATH
    || path.resolve(".route-v2-local-evidence", "missing-evidence-manifest.jsonl");
}

export function createMissingEvidenceManifestStore({
  storagePath = null,
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  const core = createAtomicJsonlEvidenceStore({
    storagePath: storagePath || defaultMissingEvidenceManifestPath(env),
    enabled: () => isRouteV2LocalEvidenceIndexEnabled(env),
    recordType: "missing-evidence-manifest",
    idField: "missingEvidenceId",
    normalize: normalizeMissingEvidenceManifestItem,
    validate: validateMissingEvidenceManifestItem,
    now,
  });

  function aggregateMany(inputs = []) {
    if (!core.enabled()) return { written: false, persisted: false, skipped: true, reason: "missing-evidence-manifest-disabled" };
    const builtItems = [];
    for (const input of Array.isArray(inputs) ? inputs : []) {
      const built = buildMissingEvidenceManifestItem(input, { now });
      if (!built.created) return { written: false, persisted: false, skipped: false, reason: built.reason, reasons: built.reasons || [] };
      builtItems.push({ input, record: built.record });
    }
    if (!builtItems.length) return { written: false, persisted: true, skipped: true, reason: "missing-evidence-manifest-empty-batch" };
    const existingById = new Map(core.list().map((record) => [record.missingEvidenceId, record]));
    const mergedById = new Map();
    for (const { input, record } of builtItems) {
      const existing = mergedById.get(record.missingEvidenceId) || existingById.get(record.missingEvidenceId);
      if (!existing) {
        mergedById.set(record.missingEvidenceId, record);
        continue;
      }
      const requestedByBundleIds = uniqueStrings([
        ...existing.requestedByBundleIds,
        ...record.requestedByBundleIds,
      ]);
      const newRequester = requestedByBundleIds.length > existing.requestedByBundleIds.length;
      const timestamp = newRequester ? now() : existing.updatedAt;
      mergedById.set(record.missingEvidenceId, normalizeMissingEvidenceManifestItem({
        ...existing,
        requestedByBundleIds,
        priority: Math.max(existing.priority, computeMissingEvidencePriority({ ...input, requestedByBundleIds })),
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: newRequester ? timestamp : existing.lastSeenAt,
        createdAt: existing.createdAt,
        updatedAt: timestamp,
      }, { now }));
    }
    return core.upsertMany([...mergedById.values()]);
  }

  function aggregate(input = {}) {
    const result = aggregateMany([input]);
    return { ...result, recordId: result.recordIds?.[0] || null };
  }

  return {
    ...core,
    aggregate,
    aggregateMany,
  };
}
