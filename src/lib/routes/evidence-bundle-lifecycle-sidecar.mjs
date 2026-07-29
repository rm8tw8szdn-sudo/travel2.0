import { buildEvidenceBundleLifecycle } from "./evidence-bundle-schema.mjs";
import { cleanString } from "./route-v2-utils.mjs";

function clean(value) {
  return cleanString(value);
}

function result({
  enabled = true,
  persisted = false,
  skipped = false,
  failed = false,
  reason = "",
  evidenceBundleId = null,
  status = null,
  bundle = null,
  diagnostics = [],
  error = "",
  localEvidence = null,
} = {}) {
  return {
    enabled,
    persisted,
    skipped,
    failed,
    reason: clean(reason),
    evidenceBundleId: clean(evidenceBundleId) || null,
    status: clean(status) || null,
    bundle: bundle ? structuredClone(bundle) : null,
    diagnostics: Array.isArray(diagnostics) ? structuredClone(diagnostics) : [],
    error: clean(error),
    localEvidence: localEvidence ? structuredClone(localEvidence) : null,
  };
}

export async function writeEvidenceBundleLifecycleSidecarSafe({
  evidenceBundleStore = null,
  selectedCandidate = null,
  persistedCandidates = [],
  routeRecord = null,
  decisionTraceWrite = null,
  context = {},
  now = null,
  localEvidenceRepository = null,
} = {}) {
  try {
    if (!evidenceBundleStore?.enabled || !evidenceBundleStore?.upsertLifecycle) {
      return result({ enabled: false, skipped: true, reason: "evidence-bundle-store-missing" });
    }
    let enabled;
    try {
      enabled = Boolean(evidenceBundleStore.enabled());
    } catch (error) {
      return result({ failed: true, reason: "evidence-bundle-store-initialization-failed", error: error?.message || String(error) });
    }
    if (!enabled) return result({ enabled: false, skipped: true, reason: "evidence-bundle-disabled" });
    if (!selectedCandidate || clean(selectedCandidate.status) !== "selected") {
      return result({ failed: true, reason: "selected-candidate-not-persisted" });
    }
    const persistedSelected = (Array.isArray(persistedCandidates) ? persistedCandidates : [])
      .find((candidate) => clean(candidate?.candidateId) === clean(selectedCandidate.candidateId) && clean(candidate?.status) === "selected");
    if (!persistedSelected) return result({ failed: true, reason: "selected-candidate-not-persisted" });
    if (decisionTraceWrite?.persisted !== true || !clean(decisionTraceWrite?.traceId)) {
      return result({ failed: true, reason: "decision-trace-not-persisted" });
    }
    if (!routeRecord || !clean(routeRecord.id)) return result({ failed: true, reason: "route-record-missing" });

    const decisionTrace = {
      traceId: clean(decisionTraceWrite.traceId),
      intentId: clean(persistedSelected.intentId),
      outcome: "success",
      routeIntentFingerprintVersion: clean(
        persistedSelected.routeIntentFingerprintVersion || routeRecord.routeIntentFingerprintVersion,
      ),
      routeIntentFingerprint: clean(
        persistedSelected.routeIntentFingerprint || routeRecord.routeIntentFingerprint,
      ),
      selectedCandidate: structuredClone(persistedSelected),
    };
    const built = buildEvidenceBundleLifecycle({
      selectedCandidate: persistedSelected,
      routeRecord,
      decisionTrace,
      context,
      ...(typeof now === "function" ? { now } : {}),
    });
    if (!built.created) {
      return result({ failed: true, reason: built.reason || "evidence-bundle-build-failed", diagnostics: built.reasons || [] });
    }

    let bundleToPersist = built.bundle;
    if (built.bundle.status !== "failed" && evidenceBundleStore?.getLifecycleByCandidate) {
      const existingBundle = evidenceBundleStore.getLifecycleByCandidate(built.bundle.candidateId);
      if (existingBundle?.evidenceBundleId === built.bundle.evidenceBundleId
        && existingBundle?.evidenceReferenceMode === "public-evidence-references") {
        bundleToPersist = {
          ...built.bundle,
          evidenceReferenceMode: existingBundle.evidenceReferenceMode,
          legEvidenceRefs: structuredClone(existingBundle.legEvidenceRefs || []),
          seasonEvidenceRefs: structuredClone(existingBundle.seasonEvidenceRefs || []),
          missingEvidenceRefs: structuredClone(existingBundle.missingEvidenceRefs || []),
        };
      }
    }

    let write;
    try {
      write = await evidenceBundleStore.upsertLifecycle(bundleToPersist);
    } catch (error) {
      return result({
        failed: true,
        reason: "evidence-bundle-write-failed",
        evidenceBundleId: bundleToPersist.evidenceBundleId,
        status: bundleToPersist.status,
        bundle: bundleToPersist,
        error: error?.message || String(error),
      });
    }
    if (write?.persisted !== true) {
      return result({
        failed: true,
        reason: write?.reason || "evidence-bundle-write-failed",
        evidenceBundleId: bundleToPersist.evidenceBundleId,
        status: bundleToPersist.status,
        bundle: bundleToPersist,
        diagnostics: write?.diagnostics || write?.reasons || [],
        error: write?.error || "",
      });
    }
    if (built.bundle.status === "failed") {
      return result({
        persisted: true,
        failed: true,
        reason: built.bundle.failureReason || "evidence-bundle-consistency-failed",
        evidenceBundleId: built.bundle.evidenceBundleId,
        status: built.bundle.status,
        bundle: built.bundle,
        diagnostics: built.bundle.diagnostics,
      });
    }
    let persistedBundle = bundleToPersist;
    let localEvidence = null;
    if (localEvidenceRepository?.linkEvidenceBundle) {
      try {
        localEvidence = await localEvidenceRepository.linkEvidenceBundle({
          bundle: bundleToPersist,
          routeRecord,
          evidenceBundleStore,
          context,
        });
        if (localEvidence?.persisted === true && localEvidence?.bundle) persistedBundle = localEvidence.bundle;
      } catch (error) {
        localEvidence = {
          enabled: true,
          persisted: false,
          failed: true,
          reason: "local-evidence-index-sidecar-failed",
          error: error?.message || String(error),
        };
      }
    }
    return result({
      persisted: true,
      reason: write?.skipped ? "evidence-bundle-unchanged" : "evidence-bundle-persisted",
      evidenceBundleId: write.evidenceBundleId || persistedBundle.evidenceBundleId,
      status: persistedBundle.status,
      bundle: persistedBundle,
      diagnostics: [
        ...(write?.diagnostics || []),
        ...(localEvidence?.failed ? [{
          stage: "local-evidence-index",
          code: localEvidence.reason || "local-evidence-index-failed",
          message: localEvidence.error || "Local evidence index failed without blocking the planner.",
        }] : []),
      ],
      localEvidence,
    });
  } catch (error) {
    return result({ failed: true, reason: "evidence-bundle-sidecar-failed", error: error?.message || String(error) });
  }
}
