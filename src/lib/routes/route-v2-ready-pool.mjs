import fs from "node:fs";
import path from "node:path";
import { envFlag } from "./route-v2-env.mjs";
import { cleanString, stableHash } from "./route-v2-utils.mjs";
import { validateEmbeddedRouteIntent } from "./route-intent-invariant-gate.mjs";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  ROUTE_INTENT_SCHEMA_VERSION,
} from "./route-intent-model.mjs";

export const ROUTE_V2_READY_POOL_FLAG = "ROUTE_V2_READY_POOL_ENABLED";

function clean(value) {
  return cleanString(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function isRouteV2ReadyPoolEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_READY_POOL_FLAG, false);
}

export function defaultRouteV2ReadyPoolPath(env = process.env) {
  return env.ROUTE_V2_READY_POOL_PATH || path.resolve(".route-v2-ready-pool", "ready-routes.json");
}

export function createRouteV2ReadyPool({
  env = process.env,
  storagePath = null,
  fileSystem = fs,
  now = () => new Date().toISOString(),
} = {}) {
  const target = storagePath || defaultRouteV2ReadyPoolPath(env);
  let revision = 0;
  let diagnostics = [];

  function enabled() {
    return isRouteV2ReadyPoolEnabled(env);
  }

  function read() {
    if (!fileSystem.existsSync(target)) return { schemaVersion: "route-v2-ready-pool-v1", records: [] };
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(target, "utf8"));
      if (!parsed || parsed.schemaVersion !== "route-v2-ready-pool-v1" || !Array.isArray(parsed.records)) throw new Error("READY_POOL_SCHEMA_INVALID");
      const seen = new Set();
      const records = parsed.records.filter((record) => {
        const routeId = clean(record?.routeRecord?.id);
        if (!routeId || record?.publicationGate?.status !== "ready-for-display" || seen.has(routeId)) return false;
        const invariant = validateEmbeddedRouteIntent(record.routeRecord, {
          source: "ready-pool-read",
          allowLegacyUnbound: false,
        });
        const entryFingerprintMatches = clean(record.routeIntentSchemaVersion) === ROUTE_INTENT_SCHEMA_VERSION
          && clean(record.routeIntentFingerprintVersion) === ROUTE_INTENT_FINGERPRINT_VERSION
          && clean(record.routeIntentFingerprint) === clean(record.routeRecord?.routeIntentFingerprint);
        if (!invariant.matched || !entryFingerprintMatches) {
          diagnostics.push({
            type: "ready-pool-route-intent-invalid",
            routeId,
            reasonCodes: [
              ...invariant.reasonCodes,
              ...(!entryFingerprintMatches ? ["ready-pool-route-intent-fingerprint-mismatch"] : []),
            ],
          });
          return false;
        }
        seen.add(routeId);
        return true;
      });
      return { schemaVersion: "route-v2-ready-pool-v1", records };
    } catch (error) {
      diagnostics.push({ type: "ready-pool-read-failed", error: clean(error?.message || error) });
      return { schemaVersion: "route-v2-ready-pool-v1", records: [] };
    }
  }

  function write(payload) {
    fileSystem.mkdirSync(path.dirname(target), { recursive: true });
    const tempPath = `${target}.${process.pid}.tmp`;
    try {
      fileSystem.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fileSystem.renameSync(tempPath, target);
      revision += 1;
    } finally {
      if (fileSystem.existsSync(tempPath)) fileSystem.rmSync(tempPath, { force: true });
    }
  }

  function applyEvaluation({ routeRecord, publicationGate } = {}) {
    if (!enabled()) return { persisted: false, skipped: true, reason: "ready-pool-disabled" };
    const routeId = clean(routeRecord?.id || publicationGate?.routeRecordId);
    if (!routeId) return { persisted: false, skipped: false, reason: "ready-pool-route-id-required" };
    try {
      const current = read();
      const previous = current.records.find((record) => clean(record.routeRecord?.id) === routeId) || null;
      const remaining = current.records.filter((record) => clean(record.routeRecord?.id) !== routeId);
      if (publicationGate?.status !== "ready-for-display") {
        if (!previous) return { persisted: true, skipped: true, demoted: false, reason: "ready-pool-route-already-absent" };
        write({ ...current, records: remaining });
        return { persisted: true, skipped: false, demoted: true, routeId, reason: "ready-pool-route-demoted" };
      }
      if (publicationGate.publishable !== true
        || clean(publicationGate.routeRecordId) !== routeId
        || clean(publicationGate.selectedCandidateId) !== clean(routeRecord?.selectedCandidateId)
        || clean(publicationGate.decisionTraceId) !== clean(routeRecord?.decisionTraceId)
        || clean(routeRecord?.v2PublicationStatus) !== "ready-for-display") {
        return { persisted: false, skipped: false, routeId, reason: "ready-pool-publication-gate-mismatch" };
      }
      const invariant = validateEmbeddedRouteIntent(routeRecord, {
        source: "ready-pool-write",
        allowLegacyUnbound: false,
      });
      if (!invariant.matched) {
        diagnostics.push({
          type: "ready-pool-route-intent-invalid",
          routeId,
          reasonCodes: invariant.reasonCodes,
        });
        return {
          persisted: false,
          skipped: false,
          routeId,
          reason: "ready-pool-route-intent-invalid",
          reasonCodes: invariant.reasonCodes,
        };
      }
      const entry = {
        readyPoolId: `rrp-${stableHash({ routeId }).slice(0, 20)}`,
        routeIntentSchemaVersion: routeRecord.routeIntentSchemaVersion,
        routeIntentFingerprintVersion: routeRecord.routeIntentFingerprintVersion,
        routeIntentFingerprint: routeRecord.routeIntentFingerprint,
        routeRecord: clone(routeRecord),
        publicationGate: clone(publicationGate),
        publishedAt: previous?.publishedAt || now(),
        updatedAt: now(),
      };
      const comparable = (value) => JSON.stringify({ routeRecord: value.routeRecord, publicationGate: { ...value.publicationGate, checkedAt: null } });
      if (previous && comparable(previous) === comparable(entry)) return { persisted: true, skipped: true, routeId, reason: "ready-pool-unchanged" };
      const records = [...remaining, entry].sort((left, right) => clean(left.routeRecord?.id).localeCompare(clean(right.routeRecord?.id), "en"));
      write({ schemaVersion: "route-v2-ready-pool-v1", records });
      return { persisted: true, skipped: false, routeId, readyPoolId: entry.readyPoolId, reason: previous ? "ready-pool-updated" : "ready-pool-published" };
    } catch (error) {
      diagnostics.push({ type: "ready-pool-write-failed", routeId, error: clean(error?.message || error) });
      return { persisted: false, skipped: false, routeId, reason: "ready-pool-write-failed", error: clean(error?.message || error) };
    }
  }

  return {
    enabled,
    applyEvaluation,
    list: () => enabled() ? clone(read().records.map((entry) => entry.routeRecord)) : [],
    entries: () => enabled() ? clone(read().records) : [],
    get: (routeId) => enabled() ? clone(read().records.find((entry) => clean(entry.routeRecord?.id) === clean(routeId))?.routeRecord || null) : null,
    diagnostics: () => clone(diagnostics),
    revision: () => revision,
    storagePath: target,
  };
}
