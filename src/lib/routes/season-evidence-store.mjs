import path from "node:path";
import { createAtomicJsonlEvidenceStore } from "./local-evidence-store-primitives.mjs";
import { normalizeSeasonEvidence, validateSeasonEvidence } from "./season-evidence-schema.mjs";
import { isRouteV2LocalEvidenceIndexEnabled } from "./route-leg-evidence-store.mjs";

export function defaultSeasonEvidencePath(env = process.env) {
  return env.ROUTE_V2_SEASON_EVIDENCE_PATH || path.resolve(".route-v2-local-evidence", "season-evidence.jsonl");
}

export function createSeasonEvidenceStore({ storagePath = null, env = process.env, now = () => new Date().toISOString() } = {}) {
  return createAtomicJsonlEvidenceStore({
    storagePath: storagePath || defaultSeasonEvidencePath(env),
    enabled: () => isRouteV2LocalEvidenceIndexEnabled(env),
    recordType: "season-evidence",
    idField: "seasonEvidenceId",
    normalize: normalizeSeasonEvidence,
    validate: validateSeasonEvidence,
    now,
  });
}
