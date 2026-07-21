import path from "node:path";
import { envFlag } from "./route-v2-env.mjs";
import { createAtomicJsonlEvidenceStore } from "./local-evidence-store-primitives.mjs";
import { normalizeRouteLegEvidence, validateRouteLegEvidence } from "./route-leg-evidence-schema.mjs";

export const ROUTE_V2_LOCAL_EVIDENCE_INDEX_FLAG = "ROUTE_V2_LOCAL_EVIDENCE_INDEX_ENABLED";

export function isRouteV2LocalEvidenceIndexEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_LOCAL_EVIDENCE_INDEX_FLAG, false);
}

export function defaultRouteLegEvidencePath(env = process.env) {
  return env.ROUTE_V2_ROUTE_LEG_EVIDENCE_PATH || path.resolve(".route-v2-local-evidence", "route-leg-evidence.jsonl");
}

export function createRouteLegEvidenceStore({ storagePath = null, env = process.env, now = () => new Date().toISOString() } = {}) {
  return createAtomicJsonlEvidenceStore({
    storagePath: storagePath || defaultRouteLegEvidencePath(env),
    enabled: () => isRouteV2LocalEvidenceIndexEnabled(env),
    recordType: "route-leg-evidence",
    idField: "legEvidenceId",
    normalize: normalizeRouteLegEvidence,
    validate: validateRouteLegEvidence,
    now,
  });
}
