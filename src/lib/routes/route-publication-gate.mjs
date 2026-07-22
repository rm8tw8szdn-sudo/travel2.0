import { validateCompositionRecord } from "./composition-validator.mjs";
import { validateRouteContent } from "./content-quality.mjs";
import { validateDecisionTrace } from "./decision-trace-schema.mjs";
import { validateEvidenceBundleLifecycle } from "./evidence-bundle-schema.mjs";
import { validateRouteCandidate } from "./route-candidate-pool.mjs";
import { envFlag } from "./route-v2-env.mjs";
import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_V2_PUBLICATION_GATE_FLAG = "ROUTE_V2_PUBLICATION_GATE_ENABLED";
export const ROUTE_V2_PUBLICATION_GATE_VERSION = "route-v2-publication-gate-mvp-v1";
export const ROUTE_V2_PUBLICATION_STATUSES = new Set([
  "ready-for-display",
  "blocked-needs-evidence",
  "blocked-rejected",
  "blocked-incomplete",
  "blocked-system-error",
]);

function clean(value) {
  return cleanString(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function candidateOrder(candidate = {}) {
  return (Array.isArray(candidate.proposedOrder) ? candidate.proposedOrder : []).map(clean).filter(Boolean);
}

function routeOrder(route = {}) {
  return (Array.isArray(route.destinationEntities) ? route.destinationEntities : [])
    .map((entry) => clean(entry?.wikidataId || entry?.entityId || entry?.id || entry?.qid || entry?.name))
    .filter(Boolean);
}

function sameOrder(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasDisplayImage(record = {}) {
  return Boolean(clean(record.coverAsset?.imageUrl || record.coverImageUrl || record.imageUrl));
}

function result({ status, reasons, routeRecord, validation, checkedAt }) {
  const normalizedReasons = uniqueStrings(reasons);
  return clone({
    gateId: `rpg-${stableHash({ routeId: clean(routeRecord?.id), validationId: clean(validation?.validationId), status, reasons: normalizedReasons }).slice(0, 20)}`,
    gateVersion: ROUTE_V2_PUBLICATION_GATE_VERSION,
    routeRecordId: clean(routeRecord?.id) || null,
    candidateId: clean(validation?.candidateId || routeRecord?.selectedCandidateId) || null,
    validationId: clean(validation?.validationId) || null,
    status,
    publicationStatus: status,
    publishable: status === "ready-for-display",
    reasons: normalizedReasons,
    reasonCodes: normalizedReasons,
    selectedCandidateId: clean(routeRecord?.selectedCandidateId || validation?.candidateId) || null,
    decisionTraceId: clean(routeRecord?.decisionTraceId) || null,
    checkedAt,
  });
}

export function isRouteV2PublicationGateEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_PUBLICATION_GATE_FLAG, false);
}

export function evaluateRouteV2Publication({
  routeRecord,
  selectedCandidate,
  decisionTrace,
  validation,
  evidenceBundle,
} = {}, {
  now = () => new Date().toISOString(),
  routeContentValidator = validateRouteContent,
  compositionValidator = validateCompositionRecord,
} = {}) {
  const checkedAt = now();
  try {
    const incomplete = [];
    const rejected = [];
    const evidence = [];
    if (!routeRecord || typeof routeRecord !== "object") incomplete.push("route-record-missing");
    if (!selectedCandidate || typeof selectedCandidate !== "object") incomplete.push("selected-candidate-missing");
    if (!decisionTrace || typeof decisionTrace !== "object") incomplete.push("decision-trace-missing");
    if (!validation || typeof validation !== "object") incomplete.push("validation-result-missing");
    if (!evidenceBundle || typeof evidenceBundle !== "object") incomplete.push("evidence-bundle-missing");
    if (incomplete.length) return result({ status: "blocked-incomplete", reasons: incomplete, routeRecord, validation, checkedAt });

    if (!clean(routeRecord.id)) incomplete.push("route-record-id-missing");
    if (!clean(routeRecord.generationVersion).startsWith("route-generation-v2-")) incomplete.push("route-record-not-v2");
    if (clean(routeRecord.generationVersion).includes("fallback")) rejected.push("legacy-fallback-not-publishable");

    const candidateValidation = validateRouteCandidate(selectedCandidate);
    if (!candidateValidation.accepted) incomplete.push(...candidateValidation.reasons.map((reason) => `candidate:${reason}`));
    if (clean(selectedCandidate.status) !== "selected") incomplete.push("candidate-not-selected");
    if (clean(routeRecord.selectedCandidateId) !== clean(selectedCandidate.candidateId)) incomplete.push("route-candidate-id-mismatch");
    if (!sameOrder(candidateOrder(selectedCandidate), routeOrder(routeRecord))) incomplete.push("route-candidate-order-mismatch");

    const traceValidation = validateDecisionTrace(decisionTrace);
    if (!traceValidation.accepted) incomplete.push(...(traceValidation.missing || []).map((reason) => `trace:${reason}`));
    if (clean(decisionTrace.traceId) !== clean(routeRecord.decisionTraceId)) incomplete.push("route-trace-id-mismatch");
    if (clean(decisionTrace.candidateId) !== clean(selectedCandidate.candidateId)) incomplete.push("trace-candidate-id-mismatch");
    if (!sameOrder(candidateOrder(decisionTrace.selectedCandidate), candidateOrder(selectedCandidate))) incomplete.push("trace-candidate-order-mismatch");

    const bundleValidation = validateEvidenceBundleLifecycle(evidenceBundle, { selectedCandidate, routeRecord, decisionTrace });
    if (!bundleValidation.accepted) incomplete.push(...bundleValidation.reasons.map((reason) => `evidence-bundle:${reason}`));
    if (clean(evidenceBundle.status) === "failed") incomplete.push("evidence-bundle-failed");
    if (clean(evidenceBundle.evidenceBundleId) !== clean(routeRecord.evidenceBundleId)) incomplete.push("route-evidence-bundle-id-mismatch");
    if (!sameOrder(evidenceBundle.destinationOrder || [], candidateOrder(selectedCandidate))) incomplete.push("evidence-bundle-order-mismatch");

    if (clean(validation.candidateId) !== clean(selectedCandidate.candidateId)) incomplete.push("validation-candidate-id-mismatch");
    if (clean(routeRecord.evidenceValidationId) && clean(routeRecord.evidenceValidationId) !== clean(validation.validationId)) incomplete.push("route-validation-id-mismatch");
    if (validation.status === "rejected") rejected.push("validation-rejected", ...(validation.reasonCodes || []));
    else if (validation.status !== "ready") evidence.push("validation-not-ready", ...(validation.reasonCodes || []));
    if (!Array.isArray(validation.legResults) || validation.legResults.length !== Math.max(0, candidateOrder(selectedCandidate).length - 1)) {
      evidence.push("route-leg-validation-incomplete");
    } else if (validation.legResults.some((leg) => leg.status !== "ready" || !leg.evidenceId || leg.durationMinMinutes == null || leg.durationMaxMinutes == null || leg.stale || leg.conflict)) {
      evidence.push("route-leg-evidence-not-ready");
    }
    const bundleLegRefs = new Set(evidenceBundle.legEvidenceRefs || []);
    if ((validation.legResults || []).some((leg) => clean(leg.evidenceId) && !bundleLegRefs.has(clean(leg.evidenceId)))) evidence.push("evidence-bundle-leg-reference-mismatch");
    if (!validation.pacingResult || validation.pacingResult.status !== "ready") evidence.push("route-pacing-not-ready");
    const requestedMonths = selectedCandidate.inputIntentSnapshot?.timeIntent?.months || [];
    if (requestedMonths.length) {
      const expectedSeasons = candidateOrder(selectedCandidate).length * new Set(requestedMonths).size;
      if (!Array.isArray(validation.seasonResults) || validation.seasonResults.length !== expectedSeasons) evidence.push("season-validation-incomplete");
      else if (validation.seasonResults.some((season) => season.status !== "ready" || !season.evidenceId || season.stale || season.conflict)) evidence.push("season-evidence-not-ready");
      const bundleSeasonRefs = new Set(evidenceBundle.seasonEvidenceRefs || []);
      if ((validation.seasonResults || []).some((season) => clean(season.evidenceId) && !bundleSeasonRefs.has(clean(season.evidenceId)))) evidence.push("evidence-bundle-season-reference-mismatch");
    }
    if ((validation.criticalMissingEvidenceIds || []).length) evidence.push("critical-evidence-missing");
    if ((validation.conflictEvidenceIds || []).length) evidence.push("evidence-conflict-unresolved");
    if ((validation.staleEvidenceIds || []).length) evidence.push("evidence-stale");

    const quality = routeContentValidator(routeRecord);
    const composition = compositionValidator(routeRecord);
    if (!quality.accepted) incomplete.push(...quality.reasons.map((reason) => `route-content:${reason}`));
    if (!composition.accepted) incomplete.push(...composition.reasons.map((reason) => `route-schema:${reason}`));
    if (!hasDisplayImage(routeRecord)) incomplete.push("display-image-missing");

    if (rejected.length) return result({ status: "blocked-rejected", reasons: rejected, routeRecord, validation, checkedAt });
    if (incomplete.length) return result({ status: "blocked-incomplete", reasons: incomplete, routeRecord, validation, checkedAt });
    if (evidence.length) return result({ status: "blocked-needs-evidence", reasons: evidence, routeRecord, validation, checkedAt });
    return result({ status: "ready-for-display", reasons: [], routeRecord, validation, checkedAt });
  } catch (error) {
    return result({
      status: "blocked-system-error",
      reasons: [`publication-gate-error:${clean(error?.message || String(error))}`],
      routeRecord,
      validation,
      checkedAt,
    });
  }
}
