import fs from "node:fs";
import path from "node:path";
import { envFlag } from "./route-v2-env.mjs";
import { normalizeEvidenceBundle, validateEvidenceBundle } from "./evidence-bundle.mjs";

export function isRouteV2EvidenceBundleEnabled(env = process.env) {
  return envFlag(env, "ROUTE_V2_EVIDENCE_BUNDLE_ENABLED", false);
}

export function defaultRouteEvidenceBundlePath(env = process.env) {
  return env.ROUTE_V2_EVIDENCE_BUNDLE_PATH || path.resolve(".route-v2-cache", "route-evidence-bundles.jsonl");
}

export function createEvidenceBundleStore({
  storagePath = defaultRouteEvidenceBundlePath(),
  env = process.env,
  now = () => new Date().toISOString(),
} = {}) {
  function enabled() {
    return isRouteV2EvidenceBundleEnabled(env);
  }

  function append(input) {
    if (!enabled()) return { written: false, skipped: true, reason: "evidence-bundle-disabled" };
    const validation = validateEvidenceBundle(input);
    if (!validation.accepted) {
      return {
        written: false,
        skipped: false,
        reason: "evidence-bundle-invalid",
        reasons: validation.reasons,
      };
    }
    const bundle = normalizeEvidenceBundle(input, { now });
    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.appendFileSync(storagePath, `${JSON.stringify(bundle)}\n`, "utf8");
      return {
        written: true,
        evidenceBundleId: bundle.evidenceBundleId,
        candidateId: bundle.candidateId,
        intentId: bundle.intentId,
        storagePath,
      };
    } catch (error) {
      return {
        written: false,
        skipped: false,
        reason: "evidence-bundle-write-failed",
        error: error?.message || String(error),
      };
    }
  }

  function readAll() {
    if (!fs.existsSync(storagePath)) return [];
    return fs.readFileSync(storagePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          const bundle = JSON.parse(line);
          return { ok: true, index, bundle, validation: validateEvidenceBundle(bundle) };
        } catch (error) {
          return { ok: false, index, error: error?.message || String(error), line };
        }
      });
  }

  function listByCandidate(candidateId) {
    return readAll()
      .filter((record) => record.ok && record.bundle.candidateId === candidateId)
      .map((record) => record.bundle);
  }

  return {
    storagePath,
    enabled,
    append,
    readAll,
    listByCandidate,
  };
}
