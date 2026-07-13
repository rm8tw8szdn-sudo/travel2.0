import { envFlag } from "./route-v2-env.mjs";
import { cleanString } from "./route-v2-utils.mjs";
import { collectLocalEvidenceBundle } from "./local-evidence-collector.mjs";
import { validateEvidenceBundle } from "./evidence-bundle.mjs";
import { isRouteV2CandidatePoolEnabled } from "./route-candidate-pool.mjs";
import { isRouteV2EvidenceBundleEnabled } from "./evidence-bundle-store.mjs";

export const ROUTE_V2_EVIDENCE_LOCAL_FLAG = "ROUTE_V2_EVIDENCE_LOCAL_ENABLED";

export function isRouteV2LocalEvidenceEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_EVIDENCE_LOCAL_FLAG, false);
}

function sidecarRecord({
  candidate = {},
  evidenceBundleId = null,
  result = {},
  reason = "",
  reasons = [],
  error = null,
} = {}) {
  return {
    candidateId: cleanString(candidate.candidateId),
    intentId: cleanString(candidate.intentId),
    evidenceBundleId: cleanString(evidenceBundleId) || null,
    written: Boolean(result.written),
    skipped: Boolean(result.skipped),
    reason: cleanString(result.reason || reason),
    reasons: Array.isArray(result.reasons) ? result.reasons : reasons,
    error: cleanString(result.error || error),
  };
}

export async function writeLocalEvidenceSidecarSafe({
  candidates = [],
  kgPool = [],
  candidatePoolStore = null,
  evidenceBundleStore = null,
  env = process.env,
  localEvidenceCollector = collectLocalEvidenceBundle,
  evidenceBundleValidator = validateEvidenceBundle,
  now = null,
} = {}) {
  try {
    if (!isRouteV2CandidatePoolEnabled(env)) {
      return { enabled: false, candidates: 0, written: 0, skipped: true, failed: 0, reason: "candidate-pool-disabled", records: [] };
    }
    if (!isRouteV2EvidenceBundleEnabled(env)) {
      return { enabled: false, candidates: 0, written: 0, skipped: true, failed: 0, reason: "evidence-bundle-disabled", records: [] };
    }
    if (!isRouteV2LocalEvidenceEnabled(env)) {
      return { enabled: false, candidates: 0, written: 0, skipped: true, failed: 0, reason: "local-evidence-disabled", records: [] };
    }
    if (!candidatePoolStore?.enabled?.()) {
      return { enabled: false, candidates: 0, written: 0, skipped: true, failed: 0, reason: "candidate-pool-disabled", records: [] };
    }
    if (!evidenceBundleStore?.enabled?.()) {
      return { enabled: false, candidates: 0, written: 0, skipped: true, failed: 0, reason: "evidence-bundle-disabled", records: [] };
    }

    const records = [];
    let written = 0;
    let failed = 0;
    let skipped = 0;
    const candidateList = Array.isArray(candidates) ? candidates : [];

    for (const candidate of candidateList) {
      try {
        const bundle = localEvidenceCollector({
          candidate,
          kgPool,
          ...(typeof now === "function" ? { now } : {}),
        });
        const validation = evidenceBundleValidator(bundle);
        if (!validation.accepted) {
          failed += 1;
          records.push(sidecarRecord({
            candidate,
            evidenceBundleId: bundle?.evidenceBundleId,
            reason: "local-evidence-invalid",
            reasons: validation.reasons,
          }));
          continue;
        }
        const result = await evidenceBundleStore.append(bundle);
        if (result?.written) written += 1;
        else if (result?.skipped) skipped += 1;
        else failed += 1;
        records.push(sidecarRecord({
          candidate,
          evidenceBundleId: result?.evidenceBundleId || bundle.evidenceBundleId,
          result,
        }));
      } catch (error) {
        failed += 1;
        records.push(sidecarRecord({
          candidate,
          reason: "local-evidence-collector-failed",
          error: error?.message || String(error),
        }));
      }
    }

    return {
      enabled: true,
      candidates: candidateList.length,
      written,
      skipped,
      failed,
      records,
    };
  } catch (error) {
    return {
      enabled: true,
      candidates: 0,
      written: 0,
      skipped: 0,
      failed: 1,
      reason: "local-evidence-sidecar-failed",
      error: error?.message || String(error),
      records: [],
    };
  }
}
