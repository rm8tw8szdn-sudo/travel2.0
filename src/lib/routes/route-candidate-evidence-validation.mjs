import { envFlag } from "./route-v2-env.mjs";
import { validateRouteCandidate } from "./route-candidate-pool.mjs";
import { normalizeRouteLegTransportMode, routeLegEvidenceKey } from "./route-leg-evidence-schema.mjs";
import { normalizeTimeIntent } from "./search-intent-parser.mjs";
import { seasonEvidenceKey } from "./season-evidence-schema.mjs";
import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_V2_EVIDENCE_VALIDATION_FLAG = "ROUTE_V2_EVIDENCE_VALIDATION_ENABLED";
export const ROUTE_V2_EVIDENCE_VALIDATOR_VERSION = "route-v2-evidence-validation-mvp-v1";
export const ROUTE_V2_EVIDENCE_VALIDATION_STATUSES = new Set(["ready", "needs-evidence", "rejected"]);

const HARD_CONFLICT_PATTERN = /(?:infeasible|unreachable|suspend|closed|closure|blocked|停运|封路|关闭|不可达)/iu;
const STATUS_PRIORITY = Object.freeze({ ready: 0, "needs-evidence": 1, rejected: 2 });

function clean(value) {
  return cleanString(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function statusMax(statuses = []) {
  return statuses.reduce((current, status) => (
    (STATUS_PRIORITY[status] ?? 1) > (STATUS_PRIORITY[current] ?? 0) ? status : current
  ), "ready");
}

function missingEvidenceId(type, input) {
  return `mve-${stableHash({ type, ...input }).slice(0, 20)}`;
}

function destinationOrder(candidate = {}) {
  return (Array.isArray(candidate.proposedOrder) ? candidate.proposedOrder : [])
    .map(clean)
    .filter(Boolean);
}

function requiredTransportModes(context = {}) {
  return uniqueStrings([
    context.transport,
    ...(Array.isArray(context.transportPreference) ? context.transportPreference : []),
  ])
    .map(normalizeRouteLegTransportMode)
    .filter((mode) => mode && mode !== "unknown");
}

function evidenceIndex(repository) {
  if (repository?.index) return repository.index;
  return repository;
}

function isExpired(record, nowMs) {
  if (["stale", "expired"].includes(clean(record?.freshnessStatus))) return true;
  const expiresAt = Date.parse(clean(record?.expiresAt));
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

function conflictStatus(conflicts = []) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return "ready";
  const hard = conflicts.some((conflict) => HARD_CONFLICT_PATTERN.test(`${clean(conflict?.field)} ${clean(conflict?.reason)}`));
  return hard ? "rejected" : "needs-evidence";
}

function evaluateLegEvidence(record, { requiredModes = [], nowMs } = {}) {
  const reasonCodes = [];
  let status = "ready";
  const transportMode = normalizeRouteLegTransportMode(record?.transportMode);
  if (requiredModes.length && !requiredModes.includes(transportMode)) {
    status = "needs-evidence";
    reasonCodes.push("required-transport-mode-not-covered");
  }
  if (clean(record?.feasibilityStatus) === "infeasible") {
    status = "rejected";
    reasonCodes.push("route-leg-explicitly-infeasible");
  } else if (clean(record?.feasibilityStatus) !== "feasible") {
    status = "needs-evidence";
    reasonCodes.push("route-leg-feasibility-unconfirmed");
  }
  if (!Array.isArray(record?.sources) || record.sources.length === 0 || !Array.isArray(record?.sourceRefs) || record.sourceRefs.length === 0) {
    if (status !== "rejected") status = "needs-evidence";
    reasonCodes.push("route-leg-source-missing");
  }
  const conflict = conflictStatus(record?.conflicts);
  if (conflict !== "ready") {
    status = statusMax([status, conflict]);
    reasonCodes.push(conflict === "rejected" ? "route-leg-critical-conflict" : "route-leg-conflict-unresolved");
  }
  if (isExpired(record, nowMs) || clean(record?.freshnessStatus) !== "fresh") {
    if (status !== "rejected") status = "needs-evidence";
    reasonCodes.push(isExpired(record, nowMs) ? "route-leg-evidence-stale" : "route-leg-freshness-unconfirmed");
  }
  const durationMinMinutes = record?.durationMinMinutes != null && Number.isFinite(Number(record.durationMinMinutes))
    ? Number(record.durationMinMinutes)
    : null;
  const durationMaxMinutes = record?.durationMaxMinutes != null && Number.isFinite(Number(record.durationMaxMinutes))
    ? Number(record.durationMaxMinutes)
    : null;
  if (durationMinMinutes == null || durationMaxMinutes == null) {
    if (status !== "rejected") status = "needs-evidence";
    reasonCodes.push("route-leg-duration-missing");
  }
  return {
    status,
    reasonCodes: uniqueStrings(reasonCodes),
    evidenceId: clean(record?.legEvidenceId) || null,
    transportMode,
    durationMinMinutes,
    durationMaxMinutes,
    freshnessStatus: clean(record?.freshnessStatus) || "unknown",
    conflict: conflict !== "ready",
    stale: isExpired(record, nowMs),
  };
}

function selectLegEvaluation(records = [], options = {}) {
  const evaluated = records.map((record) => ({ record, evaluation: evaluateLegEvidence(record, options) }));
  evaluated.sort((left, right) => (
    (STATUS_PRIORITY[left.evaluation.status] ?? 1) - (STATUS_PRIORITY[right.evaluation.status] ?? 1)
    || clean(left.record.transportMode).localeCompare(clean(right.record.transportMode), "en")
    || clean(left.record.legEvidenceId).localeCompare(clean(right.record.legEvidenceId), "en")
  ));
  return evaluated[0] || null;
}

function maxDestinationsForDuration(durationDays) {
  if (durationDays <= 2) return 2;
  if (durationDays <= 4) return 3;
  if (durationDays <= 7) return 4;
  if (durationDays <= 10) return 5;
  return 6;
}

function validatePacing(candidate, legResults) {
  const order = destinationOrder(candidate);
  const durationDays = Number(candidate?.durationDays);
  const reasonCodes = [];
  let status = "ready";
  if (new Set(order).size !== order.length) {
    status = "rejected";
    reasonCodes.push("pacing-duplicate-destination");
  }
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    status = "rejected";
    reasonCodes.push("pacing-duration-invalid");
  } else if (order.length > maxDestinationsForDuration(durationDays)) {
    status = "rejected";
    reasonCodes.push("pacing-too-many-destinations-for-duration");
  }
  const completeDurations = legResults.length === Math.max(0, order.length - 1)
    && legResults.every((leg) => leg.durationMinMinutes != null && leg.durationMaxMinutes != null);
  const totalTravelMinutesMin = completeDurations
    ? legResults.reduce((sum, leg) => sum + leg.durationMinMinutes, 0)
    : null;
  const totalTravelMinutesMax = completeDurations
    ? legResults.reduce((sum, leg) => sum + leg.durationMaxMinutes, 0)
    : null;
  if (!completeDurations && status !== "rejected") {
    status = "needs-evidence";
    reasonCodes.push("pacing-duration-evidence-incomplete");
  }
  if (legResults.some((leg) => Number(leg.durationMinMinutes) > 720)) {
    status = "rejected";
    reasonCodes.push("pacing-single-leg-impossible");
  }
  if (Number.isFinite(durationDays) && totalTravelMinutesMin != null && totalTravelMinutesMin > durationDays * 240) {
    status = "rejected";
    reasonCodes.push("pacing-total-travel-exceeds-capacity");
  }
  return {
    status,
    totalTravelMinutesMin,
    totalTravelMinutesMax,
    cityCount: order.length,
    durationDays: Number.isFinite(durationDays) ? durationDays : null,
    reasonCodes: uniqueStrings(reasonCodes),
  };
}

function evaluateSeasonEvidence(record, nowMs) {
  const reasonCodes = [];
  let status = "ready";
  const hardRisk = (record?.transportRisks || []).some((risk) => HARD_CONFLICT_PATTERN.test(clean(risk)))
    || (record?.closureRisks || []).some((risk) => HARD_CONFLICT_PATTERN.test(clean(risk)));
  if (clean(record?.suitabilityStatus) === "unsuitable" && hardRisk) {
    status = "rejected";
    reasonCodes.push("season-hard-closure-or-suspension");
  } else if (clean(record?.suitabilityStatus) !== "suitable") {
    status = "needs-evidence";
    reasonCodes.push("season-suitability-unconfirmed");
  }
  if ((record?.weatherRisks || []).length || (record?.transportRisks || []).length || (record?.closureRisks || []).length) {
    if (status !== "rejected") status = "needs-evidence";
    reasonCodes.push("season-risk-needs-review");
  }
  const conflict = conflictStatus(record?.conflicts);
  if (conflict !== "ready") {
    status = statusMax([status, conflict]);
    reasonCodes.push(conflict === "rejected" ? "season-critical-conflict" : "season-conflict-unresolved");
  }
  if (!Array.isArray(record?.sources) || record.sources.length === 0 || !Array.isArray(record?.sourceRefs) || record.sourceRefs.length === 0) {
    if (status !== "rejected") status = "needs-evidence";
    reasonCodes.push("season-source-missing");
  }
  if (isExpired(record, nowMs) || clean(record?.freshnessStatus) !== "fresh") {
    if (status !== "rejected") status = "needs-evidence";
    reasonCodes.push(isExpired(record, nowMs) ? "season-evidence-stale" : "season-freshness-unconfirmed");
  }
  return {
    status,
    reasonCodes: uniqueStrings(reasonCodes),
    evidenceId: clean(record?.seasonEvidenceId) || null,
    freshnessStatus: clean(record?.freshnessStatus) || "unknown",
    conflict: conflict !== "ready",
    stale: isExpired(record, nowMs),
  };
}

function bundleForCandidate(context, candidateId) {
  if (context?.evidenceBundlesByCandidateId && typeof context.evidenceBundlesByCandidateId === "object") {
    return context.evidenceBundlesByCandidateId[candidateId] || null;
  }
  return context?.evidenceBundle && clean(context.evidenceBundle.candidateId) === candidateId
    ? context.evidenceBundle
    : null;
}

export function isRouteV2EvidenceValidationEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_EVIDENCE_VALIDATION_FLAG, false);
}

export function validateRouteForUse(candidate, context = {}, evidenceRepository = null, {
  now = () => new Date().toISOString(),
} = {}) {
  const validatedAt = now();
  const nowMs = Date.parse(validatedAt);
  const reasonCodes = [];
  const criticalMissingEvidenceIds = [];
  const conflictEvidenceIds = [];
  const staleEvidenceIds = [];
  const legResults = [];
  const seasonResults = [];
  let status = "ready";
  const candidateValidation = validateRouteCandidate(candidate);
  if (!candidateValidation.accepted) {
    status = "rejected";
    reasonCodes.push(...candidateValidation.reasons.map((reason) => `candidate-schema:${reason}`));
  }
  const index = evidenceIndex(evidenceRepository);
  const order = destinationOrder(candidate);
  const requiredModes = requiredTransportModes(context);

  try {
    if (!index?.getRouteLegsByEndpoints || !index?.getSeason) {
      status = statusMax([status, "needs-evidence"]);
      reasonCodes.push("local-evidence-index-unavailable");
    } else {
      const bundle = bundleForCandidate(context, clean(candidate?.candidateId));
      if (bundle) {
        const bundleOrder = (Array.isArray(bundle.destinationOrder) ? bundle.destinationOrder : []).map(clean).filter(Boolean);
        if (JSON.stringify(bundleOrder) !== JSON.stringify(order)) {
          status = statusMax([status, "needs-evidence"]);
          reasonCodes.push("evidence-bundle-order-mismatch");
        }
        for (const evidenceId of bundle.legEvidenceRefs || []) {
          if (!index.getRouteLegById?.(evidenceId)) {
            criticalMissingEvidenceIds.push(clean(evidenceId));
            status = statusMax([status, "needs-evidence"]);
            reasonCodes.push("evidence-bundle-leg-reference-missing");
          }
        }
        for (const evidenceId of bundle.seasonEvidenceRefs || []) {
          if (!index.getSeasonById?.(evidenceId)) {
            criticalMissingEvidenceIds.push(clean(evidenceId));
            status = statusMax([status, "needs-evidence"]);
            reasonCodes.push("evidence-bundle-season-reference-missing");
          }
        }
      }

      for (let position = 0; position < order.length - 1; position += 1) {
        const fromEntityId = order[position];
        const toEntityId = order[position + 1];
        const allRecords = index.getRouteLegsByEndpoints({ fromEntityId, toEntityId });
        const records = requiredModes.length
          ? allRecords.filter((record) => requiredModes.includes(normalizeRouteLegTransportMode(record.transportMode)))
          : allRecords;
        const diagnostics = index.getRouteLegDiagnostics?.({ fromEntityId, toEntityId }) || [];
        const selected = selectLegEvaluation(records, { requiredModes, nowMs });
        if (!selected) {
          const targetKey = routeLegEvidenceKey({ fromEntityId, toEntityId, transportMode: requiredModes[0] || "unknown" });
          const missing = index.getMissingByTarget?.("route-leg", targetKey);
          const missingId = clean(missing?.missingEvidenceId) || missingEvidenceId("route-leg", { fromEntityId, toEntityId, requiredModes });
          criticalMissingEvidenceIds.push(missingId);
          status = statusMax([status, "needs-evidence"]);
          reasonCodes.push(requiredModes.length && allRecords.length ? "route-leg-required-mode-missing" : "route-leg-evidence-missing");
          legResults.push({
            fromEntityId,
            toEntityId,
            status: "needs-evidence",
            reasonCodes: diagnostics.length ? ["route-leg-schema-invalid"] : ["route-leg-evidence-missing"],
            evidenceId: null,
            transportMode: requiredModes[0] || "unknown",
            durationMinMinutes: null,
            durationMaxMinutes: null,
            freshnessStatus: "unknown",
          });
          continue;
        }
        const result = {
          fromEntityId,
          toEntityId,
          ...selected.evaluation,
        };
        if (diagnostics.length) {
          result.status = result.status === "rejected" ? "rejected" : "needs-evidence";
          result.reasonCodes = uniqueStrings([...result.reasonCodes, "route-leg-schema-invalid"]);
        }
        legResults.push(result);
        status = statusMax([status, result.status]);
        reasonCodes.push(...result.reasonCodes);
        if (result.conflict && result.evidenceId) conflictEvidenceIds.push(result.evidenceId);
        if (result.stale && result.evidenceId) staleEvidenceIds.push(result.evidenceId);
        if (result.status === "needs-evidence") {
          criticalMissingEvidenceIds.push(result.evidenceId || missingEvidenceId("route-leg", { fromEntityId, toEntityId, requiredModes }));
        }
      }

      const timeIntent = normalizeTimeIntent(context.timeIntent || candidate?.inputIntentSnapshot?.timeIntent || {});
      if (timeIntent.type === "invalid") {
        status = "rejected";
        reasonCodes.push("invalid-time-intent");
        seasonResults.push({ status: "rejected", reasonCodes: ["invalid-time-intent"], validation: "invalid" });
      } else if (timeIntent.type === "season-only") {
        status = statusMax([status, "needs-evidence"]);
        reasonCodes.push("season-only-month-mapping-unavailable");
        seasonResults.push({
          status: "needs-evidence",
          reasonCodes: ["season-only-month-mapping-unavailable"],
          validation: "needs-evidence",
          season: timeIntent.season,
        });
      } else if (["single-month", "month-range"].includes(timeIntent.type)) {
        for (const entityId of order) {
          for (const month of timeIntent.months) {
            const record = index.getSeason({ entityId, month });
            const diagnostics = index.getSeasonDiagnostics?.({ entityId, month }) || [];
            if (!record) {
              const targetKey = seasonEvidenceKey({ entityId, month });
              const missing = index.getMissingByTarget?.("season", targetKey);
              const missingId = clean(missing?.missingEvidenceId) || missingEvidenceId("season", { entityId, month });
              criticalMissingEvidenceIds.push(missingId);
              status = statusMax([status, "needs-evidence"]);
              reasonCodes.push("season-evidence-missing");
              seasonResults.push({
                entityId,
                month,
                status: "needs-evidence",
                reasonCodes: diagnostics.length ? ["season-evidence-schema-invalid"] : ["season-evidence-missing"],
                evidenceId: null,
                validation: "checked",
              });
              continue;
            }
            const evaluated = evaluateSeasonEvidence(record, nowMs);
            if (diagnostics.length) {
              evaluated.status = evaluated.status === "rejected" ? "rejected" : "needs-evidence";
              evaluated.reasonCodes = uniqueStrings([...evaluated.reasonCodes, "season-evidence-schema-invalid"]);
            }
            const result = { entityId, month, ...evaluated, validation: "checked" };
            seasonResults.push(result);
            status = statusMax([status, result.status]);
            reasonCodes.push(...result.reasonCodes);
            if (result.conflict && result.evidenceId) conflictEvidenceIds.push(result.evidenceId);
            if (result.stale && result.evidenceId) staleEvidenceIds.push(result.evidenceId);
            if (result.status === "needs-evidence") {
              criticalMissingEvidenceIds.push(result.evidenceId || missingEvidenceId("season", { entityId, month }));
            }
          }
        }
      } else {
        seasonResults.push({ status: "skipped", reasonCodes: [], validation: "skipped" });
      }
    }
  } catch (error) {
    status = statusMax([status, "needs-evidence"]);
    reasonCodes.push("local-evidence-index-read-failed");
    criticalMissingEvidenceIds.push(missingEvidenceId("index", { candidateId: clean(candidate?.candidateId) }));
    legResults.push({
      status: "needs-evidence",
      reasonCodes: ["local-evidence-index-read-failed"],
      error: clean(error?.message || String(error)),
    });
  }

  const pacingResult = validatePacing(candidate, legResults.filter((leg) => leg.fromEntityId && leg.toEntityId));
  status = statusMax([status, pacingResult.status]);
  reasonCodes.push(...pacingResult.reasonCodes);
  const normalizedReasons = uniqueStrings(reasonCodes);
  const normalizedMissing = uniqueStrings(criticalMissingEvidenceIds);
  const normalizedConflicts = uniqueStrings(conflictEvidenceIds);
  const normalizedStale = uniqueStrings(staleEvidenceIds);
  const candidateId = clean(candidate?.candidateId);
  const validationId = `rvv-${stableHash({
    candidateId,
    status,
    reasonCodes: normalizedReasons,
    legEvidenceIds: legResults.map((result) => result.evidenceId).filter(Boolean),
    seasonEvidenceIds: seasonResults.map((result) => result.evidenceId).filter(Boolean),
    validatorVersion: ROUTE_V2_EVIDENCE_VALIDATOR_VERSION,
  }).slice(0, 20)}`;
  return clone({
    validationId,
    candidateId,
    status,
    reasonCodes: normalizedReasons,
    legResults,
    seasonResults,
    pacingResult,
    criticalMissingEvidenceIds: normalizedMissing,
    conflictEvidenceIds: normalizedConflicts,
    staleEvidenceIds: normalizedStale,
    validatedAt,
    validatorVersion: ROUTE_V2_EVIDENCE_VALIDATOR_VERSION,
  });
}
