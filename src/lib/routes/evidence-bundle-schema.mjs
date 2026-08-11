import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";
import { normalizeTimeIntent } from "./search-intent-parser.mjs";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  createRouteIntentFingerprint,
  validateNormalizedRouteIntent,
} from "./route-intent-model.mjs";
import { minimumRouteDestinationCount } from "./route-cardinality-policy.mjs";

export const EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION = "route-generation-v2-evidence-3a-lifecycle-v1";
export const EVIDENCE_BUNDLE_LIFECYCLE_STATUSES = new Set([
  "pending",
  "collecting",
  "complete",
  "needs-review",
  "failed",
]);
export const EVIDENCE_BUNDLE_LEG_FEASIBILITY_STATUSES = new Set([
  "unknown",
  "needs-evidence",
  "feasible",
  "infeasible",
]);
export const EVIDENCE_BUNDLE_AREA_STATUSES = new Set(["unknown", "needs-evidence", "supported", "contradicted"]);
export const EVIDENCE_BUNDLE_REFERENCE_MODES = new Set(["embedded-compatibility", "public-evidence-references"]);
const ROUTE_INTENT_FINGERPRINT_PATTERN = /^rif-v1-[a-f0-9]{64}$/u;

function clone(value) {
  return structuredClone(value);
}

function clean(value) {
  return cleanString(value);
}

function nullableString(value) {
  return clean(value) || null;
}

function destinationIdentity(destination = {}) {
  return clean(destination.wikidataId || destination.entityId || destination.id || destination.qid || destination.name);
}

export function candidateDestinationOrder(candidate = {}) {
  const proposed = Array.isArray(candidate.proposedOrder)
    ? candidate.proposedOrder.map(clean).filter(Boolean)
    : [];
  if (proposed.length) return proposed;
  return (Array.isArray(candidate.destinations) ? candidate.destinations : [])
    .map(destinationIdentity)
    .filter(Boolean);
}

export function routeRecordDestinationOrder(routeRecord = {}) {
  return (Array.isArray(routeRecord.destinationEntities) ? routeRecord.destinationEntities : [])
    .map(destinationIdentity)
    .filter(Boolean);
}

function traceDestinationOrder(decisionTrace = {}) {
  return candidateDestinationOrder(decisionTrace.selectedCandidate || {});
}

function normalizeUnknown(entry = {}) {
  return {
    field: clean(entry.field),
    reason: clean(entry.reason),
  };
}

function normalizeConflict(entry = {}) {
  return {
    code: clean(entry.code),
    field: clean(entry.field),
    message: clean(entry.message || entry.reason),
  };
}

function normalizeDiagnostic(entry = {}) {
  return {
    stage: clean(entry.stage),
    code: clean(entry.code || entry.type),
    message: clean(entry.message || entry.reason || entry.error),
  };
}

function normalizeLeg(leg = {}) {
  const duration = leg.estimatedDurationMinutes == null || leg.estimatedDurationMinutes === ""
    ? null
    : Number(leg.estimatedDurationMinutes);
  return {
    fromEntityId: clean(leg.fromEntityId),
    toEntityId: clean(leg.toEntityId),
    transportMode: clean(leg.transportMode || "unknown"),
    estimatedDurationMinutes: Number.isFinite(duration) ? duration : null,
    feasibilityStatus: clean(leg.feasibilityStatus || "unknown"),
    evidenceRefs: uniqueStrings(Array.isArray(leg.evidenceRefs) ? leg.evidenceRefs : []),
    unknowns: (Array.isArray(leg.unknowns) ? leg.unknowns : []).map(normalizeUnknown),
  };
}

function normalizeEvidenceArea(area = {}, fallbackStatus = "unknown") {
  const requestedMonths = [...new Set((Array.isArray(area.requestedMonths) ? area.requestedMonths : [])
    .map(Number)
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))];
  return {
    status: clean(area.status || fallbackStatus),
    evidenceRefs: uniqueStrings(Array.isArray(area.evidenceRefs) ? area.evidenceRefs : []),
    unknowns: (Array.isArray(area.unknowns) ? area.unknowns : []).map(normalizeUnknown),
    ...(nullableString(area.requestedSeason) ? { requestedSeason: nullableString(area.requestedSeason) } : {}),
    ...(requestedMonths.length ? { requestedMonths } : {}),
  };
}

function normalizeSource(source = {}) {
  const confidence = source.confidence == null || source.confidence === "" ? null : Number(source.confidence);
  return {
    sourceId: clean(source.sourceId),
    sourceType: clean(source.sourceType),
    url: clean(source.url),
    publisher: clean(source.publisher),
    retrievedAt: clean(source.retrievedAt),
    supports: uniqueStrings(Array.isArray(source.supports) ? source.supports : []),
    confidence: Number.isFinite(confidence) ? confidence : null,
  };
}

function lifecycleIdSeed(input = {}) {
  return {
    schemaVersion: EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION,
    intentId: clean(input.intentId),
    candidateId: clean(input.candidateId),
    decisionTraceId: clean(input.decisionTraceId),
    routeRecordId: clean(input.routeRecordId),
    routeIntentFingerprintVersion: clean(input.routeIntentFingerprintVersion),
    routeIntentFingerprint: clean(input.routeIntentFingerprint),
    ...(input.normalizedRouteIntent && typeof input.normalizedRouteIntent === "object" ? {
      normalizedRouteIntent: clone(input.normalizedRouteIntent),
    } : {}),
  };
}

export function createEvidenceBundleLifecycleId(input = {}) {
  return `ebl-${stableHash(lifecycleIdSeed(input)).slice(0, 20)}`;
}

export function normalizeEvidenceBundleLifecycle(input = {}, { now = () => new Date().toISOString() } = {}) {
  const timestamp = clean(input.updatedAt || input.createdAt) || now();
  const normalized = {
    evidenceBundleId: clean(input.evidenceBundleId),
    schemaVersion: clean(input.schemaVersion || EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION),
    intentId: clean(input.intentId),
    candidateId: clean(input.candidateId),
    decisionTraceId: clean(input.decisionTraceId),
    routeRecordId: clean(input.routeRecordId),
    routeIntentFingerprintVersion: clean(input.routeIntentFingerprintVersion),
    routeIntentFingerprint: clean(input.routeIntentFingerprint),
    ...(input.normalizedRouteIntent && typeof input.normalizedRouteIntent === "object" ? {
      normalizedRouteIntent: clone(input.normalizedRouteIntent),
    } : {}),
    createdAt: clean(input.createdAt) || timestamp,
    updatedAt: clean(input.updatedAt) || timestamp,
    status: clean(input.status || "pending"),
    evidenceReferenceMode: clean(input.evidenceReferenceMode || "embedded-compatibility"),
    destinationOrder: uniqueStrings(Array.isArray(input.destinationOrder) ? input.destinationOrder.map(clean) : []),
    legs: (Array.isArray(input.legs) ? input.legs : []).map(normalizeLeg),
    legEvidenceRefs: uniqueStrings(Array.isArray(input.legEvidenceRefs) ? input.legEvidenceRefs : []),
    seasonEvidenceRefs: uniqueStrings(Array.isArray(input.seasonEvidenceRefs) ? input.seasonEvidenceRefs : []),
    missingEvidenceRefs: uniqueStrings(Array.isArray(input.missingEvidenceRefs) ? input.missingEvidenceRefs : []),
    seasonality: normalizeEvidenceArea(input.seasonality, "unknown"),
    geography: normalizeEvidenceArea(input.geography, "needs-evidence"),
    routePacing: normalizeEvidenceArea(input.routePacing, "needs-evidence"),
    unknowns: (Array.isArray(input.unknowns) ? input.unknowns : []).map(normalizeUnknown),
    conflicts: (Array.isArray(input.conflicts) ? input.conflicts : []).map(normalizeConflict),
    sources: (Array.isArray(input.sources) ? input.sources : []).map(normalizeSource),
    diagnostics: (Array.isArray(input.diagnostics) ? input.diagnostics : []).map(normalizeDiagnostic),
    failureReason: nullableString(input.failureReason),
  };
  normalized.evidenceBundleId = normalized.evidenceBundleId || createEvidenceBundleLifecycleId(normalized);
  return normalized;
}

function sameOrder(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function consistencyFailures({ selectedCandidate = {}, routeRecord = {}, decisionTrace = {} } = {}) {
  const failures = [];
  const candidateId = clean(selectedCandidate.candidateId);
  const intentId = clean(selectedCandidate.intentId);
  const routeCandidateId = clean(routeRecord.selectedCandidateId);
  const traceCandidateId = clean(decisionTrace.selectedCandidate?.candidateId);
  const routeIntentId = clean(routeRecord.intentId);
  const traceIntentId = clean(decisionTrace.intentId || decisionTrace.inputIntent?.intentId);
  const candidateFingerprint = clean(selectedCandidate.routeIntentFingerprint);
  const routeFingerprint = clean(routeRecord.routeIntentFingerprint);
  const traceFingerprint = clean(decisionTrace.routeIntentFingerprint);
  const candidateFingerprintVersion = clean(selectedCandidate.routeIntentFingerprintVersion);
  const routeFingerprintVersion = clean(routeRecord.routeIntentFingerprintVersion);
  const traceFingerprintVersion = clean(decisionTrace.routeIntentFingerprintVersion);
  const candidateOrder = candidateDestinationOrder(selectedCandidate);
  const routeOrder = routeRecordDestinationOrder(routeRecord);
  const selectedTraceOrder = traceDestinationOrder(decisionTrace);

  if (clean(selectedCandidate.status) !== "selected") failures.push("candidate-status-not-selected");
  if (candidateId !== routeCandidateId) failures.push("candidate-route-id-mismatch");
  if (candidateId !== traceCandidateId) failures.push("candidate-trace-id-mismatch");
  if (intentId && routeIntentId && intentId !== routeIntentId) failures.push("candidate-route-intent-mismatch");
  if (intentId && traceIntentId && intentId !== traceIntentId) failures.push("candidate-trace-intent-mismatch");
  if (candidateFingerprint || routeFingerprint || traceFingerprint) {
    if (!candidateFingerprint || !routeFingerprint || !traceFingerprint) failures.push("route-intent-fingerprint-missing");
    else if (candidateFingerprint !== routeFingerprint || candidateFingerprint !== traceFingerprint) failures.push("route-intent-fingerprint-mismatch");
  }
  if (candidateFingerprintVersion || routeFingerprintVersion || traceFingerprintVersion) {
    if (!candidateFingerprintVersion || !routeFingerprintVersion || !traceFingerprintVersion) {
      failures.push("route-intent-fingerprint-version-missing");
    } else if (candidateFingerprintVersion !== routeFingerprintVersion
      || candidateFingerprintVersion !== traceFingerprintVersion) {
      failures.push("route-intent-fingerprint-version-mismatch");
    }
  }
  if (clean(decisionTrace.outcome) !== "success") failures.push("decision-trace-not-success");
  if (!sameOrder(candidateOrder, routeOrder)) failures.push("candidate-route-destination-order-mismatch");
  if (!sameOrder(candidateOrder, selectedTraceOrder)) failures.push("candidate-trace-destination-order-mismatch");
  return failures;
}

function conflictFor(code) {
  const field = code.includes("destination-order") ? "destinationOrder"
    : code.includes("intent") ? "intentId"
      : code.includes("trace") ? "decisionTraceId"
        : "candidateId";
  return { code, field, message: `Evidence lifecycle consistency check failed: ${code}.` };
}

export function buildEvidenceBundleLifecycle({
  selectedCandidate = null,
  routeRecord = null,
  decisionTrace = null,
  context = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!selectedCandidate || typeof selectedCandidate !== "object") return { created: false, reason: "selected-candidate-missing" };
  if (!routeRecord || typeof routeRecord !== "object" || !clean(routeRecord.id)) return { created: false, reason: "route-record-missing" };
  if (!decisionTrace || typeof decisionTrace !== "object" || !clean(decisionTrace.traceId)) return { created: false, reason: "decision-trace-missing" };
  if (!clean(selectedCandidate.candidateId)) return { created: false, reason: "selected-candidate-id-missing" };
  if (!clean(selectedCandidate.intentId)) return { created: false, reason: "selected-candidate-intent-id-missing" };

  const timestamp = now();
  const destinationOrder = candidateDestinationOrder(selectedCandidate);
  if (destinationOrder.length < minimumRouteDestinationCount(selectedCandidate)) return { created: false, reason: "selected-candidate-order-invalid" };
  const consistency = consistencyFailures({ selectedCandidate, routeRecord, decisionTrace });
  const hardSeasonConstraint = Boolean(context.seasonHardConstraint);
  const timeIntent = context.timeIntent && typeof context.timeIntent === "object"
    ? normalizeTimeIntent(context.timeIntent)
    : null;
  const requestedMonths = timeIntent && ["single-month", "month-range"].includes(timeIntent.type)
    ? timeIntent.months
    : [];
  const requestedSeason = timeIntent?.type === "season-only"
    ? nullableString(timeIntent.season)
    : timeIntent
      ? null
      : nullableString(context.season || context.bestMonths?.[0]);
  const invalidTimeIntent = timeIntent?.type === "invalid";
  const timeEvidenceRequested = requestedMonths.length > 0 || Boolean(requestedSeason);
  const requiresTimeReview = hardSeasonConstraint
    || requestedMonths.length > 0
    || timeIntent?.type === "season-only"
    || invalidTimeIntent;
  const unknowns = [
    ...(destinationOrder.length > 1
      ? [{ field: "transport", reason: "Transport feasibility and duration require external evidence." }]
      : []),
    { field: "geography", reason: "Geographic relationship evidence has not been collected." },
    { field: "routePacing", reason: "Route pacing has not been evidence-validated." },
    ...(requestedMonths.length ? [{ field: "seasonality", reason: `Season evidence for month${requestedMonths.length > 1 ? "s" : ""} ${requestedMonths.join(", ")} has not been collected.` }] : []),
    ...(requestedSeason ? [{ field: "seasonality", reason: `Season evidence for ${requestedSeason} has not been collected without a local month mapping.` }] : []),
    ...(invalidTimeIntent ? [{ field: "seasonality", reason: "Season evidence was not created because the time intent is invalid." }] : []),
  ];
  const conflicts = consistency.map(conflictFor);
  const status = consistency.length ? "failed" : requiresTimeReview ? "needs-review" : "pending";
  const bundle = normalizeEvidenceBundleLifecycle({
    schemaVersion: EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION,
    intentId: selectedCandidate.intentId,
    candidateId: selectedCandidate.candidateId,
    decisionTraceId: decisionTrace.traceId,
    routeRecordId: routeRecord.id,
    routeIntentFingerprintVersion: routeRecord.routeIntentFingerprintVersion || selectedCandidate.routeIntentFingerprintVersion,
    routeIntentFingerprint: routeRecord.routeIntentFingerprint || selectedCandidate.routeIntentFingerprint,
    normalizedRouteIntent: selectedCandidate.normalizedRouteIntent,
    createdAt: timestamp,
    updatedAt: timestamp,
    status,
    evidenceReferenceMode: "embedded-compatibility",
    destinationOrder,
    legs: destinationOrder.slice(0, -1).map((fromEntityId, index) => ({
      fromEntityId,
      toEntityId: destinationOrder[index + 1],
      transportMode: "unknown",
      estimatedDurationMinutes: null,
      feasibilityStatus: "needs-evidence",
      evidenceRefs: [],
      unknowns: [{ field: "transport", reason: "No transport source has been collected for this leg." }],
    })),
    legEvidenceRefs: [],
    seasonEvidenceRefs: [],
    missingEvidenceRefs: [],
    seasonality: {
      status: timeEvidenceRequested || invalidTimeIntent ? "needs-evidence" : "unknown",
      ...(requestedSeason ? { requestedSeason } : {}),
      ...(requestedMonths.length ? { requestedMonths } : {}),
      evidenceRefs: [],
      unknowns: timeIntent
        ? timeEvidenceRequested || invalidTimeIntent
          ? [{ field: "seasonality", reason: invalidTimeIntent ? "Invalid time intent cannot be linked to season evidence." : "No seasonality source has been collected." }]
          : []
        : [{ field: "seasonality", reason: "No seasonality source has been collected." }],
    },
    geography: {
      status: "needs-evidence",
      evidenceRefs: [],
      unknowns: [{ field: "geography", reason: "No geographic relationship source has been collected." }],
    },
    routePacing: {
      status: "needs-evidence",
      evidenceRefs: [],
      unknowns: [{ field: "routePacing", reason: "No route pacing source has been collected." }],
    },
    unknowns,
    conflicts,
    sources: [],
    diagnostics: [
      ...consistency.map((code) => ({ stage: "consistency", code, message: `Evidence lifecycle consistency check failed: ${code}.` })),
      ...(invalidTimeIntent ? timeIntent.diagnostics.map((diagnostic) => ({
        stage: "time-intent",
        code: diagnostic.code || "invalid-time-intent",
        message: diagnostic.message || "Time intent is invalid.",
      })) : []),
    ],
    failureReason: consistency[0] || null,
  }, { now });
  const validation = validateEvidenceBundleLifecycle(bundle, { selectedCandidate, routeRecord, decisionTrace });
  if (!validation.accepted) return { created: false, reason: "evidence-bundle-invalid", reasons: validation.reasons, bundle };
  return { created: true, bundle, consistencyPassed: consistency.length === 0, reasons: consistency };
}

function validateEvidenceArea(area, prefix, reasons) {
  if (!area || typeof area !== "object" || Array.isArray(area)) {
    reasons.push(`${prefix}-object-required`);
    return;
  }
  if (!clean(area.status)) reasons.push(`${prefix}-status-required`);
  else if (!EVIDENCE_BUNDLE_AREA_STATUSES.has(clean(area.status))) reasons.push(`${prefix}-status-invalid`);
  if (!Array.isArray(area.evidenceRefs)) reasons.push(`${prefix}-evidenceRefs-array-required`);
  if (!Array.isArray(area.unknowns)) reasons.push(`${prefix}-unknowns-array-required`);
  for (const [index, unknown] of (Array.isArray(area.unknowns) ? area.unknowns : []).entries()) {
    if (!clean(unknown?.field) || !clean(unknown?.reason)) reasons.push(`${prefix}-unknown-${index}:field-and-reason-required`);
  }
}

export function validateEvidenceBundleLifecycle(input = {}, expected = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { accepted: false, reasons: ["evidence-lifecycle-not-object"] };
  const bundle = normalizeEvidenceBundleLifecycle(input, { now: () => clean(input.updatedAt || input.createdAt) || "1970-01-01T00:00:00.000Z" });

  if (!clean(input.schemaVersion)) reasons.push("schemaVersion-required");
  else if (bundle.schemaVersion !== EVIDENCE_BUNDLE_LIFECYCLE_SCHEMA_VERSION) reasons.push("schemaVersion-unsupported");
  for (const field of ["evidenceBundleId", "intentId", "candidateId", "decisionTraceId", "routeRecordId", "createdAt", "updatedAt", "status"]) {
    if (!clean(input[field])) reasons.push(`${field}-required`);
  }
  const expectedId = createEvidenceBundleLifecycleId(bundle);
  if (bundle.evidenceBundleId !== expectedId) reasons.push("evidenceBundleId-mismatch");
  if (!EVIDENCE_BUNDLE_LIFECYCLE_STATUSES.has(bundle.status)) reasons.push("status-invalid");
  if (!EVIDENCE_BUNDLE_REFERENCE_MODES.has(bundle.evidenceReferenceMode)) reasons.push("evidenceReferenceMode-invalid");
  if (!clean(input.routeIntentFingerprintVersion)) {
    reasons.push("bundle-route-intent-fingerprint-version-required:routeIntentFingerprintVersion");
  } else if (bundle.routeIntentFingerprintVersion !== ROUTE_INTENT_FINGERPRINT_VERSION) {
    reasons.push("bundle-route-intent-fingerprint-version-unsupported:routeIntentFingerprintVersion");
  }
  if (!clean(input.routeIntentFingerprint)) {
    reasons.push("bundle-route-intent-fingerprint-required:routeIntentFingerprint");
  } else if (!ROUTE_INTENT_FINGERPRINT_PATTERN.test(bundle.routeIntentFingerprint)) {
    reasons.push("bundle-route-intent-fingerprint-format-invalid:routeIntentFingerprint");
  }
  if (input.normalizedRouteIntent !== undefined) {
    const intentValidation = validateNormalizedRouteIntent(input.normalizedRouteIntent);
    if (!intentValidation.valid) {
      reasons.push(...intentValidation.violations.map(
        (entry) => `bundle-route-intent-invalid:normalizedRouteIntent.${entry.path}`,
      ));
    } else {
      const intentFingerprint = createRouteIntentFingerprint(input.normalizedRouteIntent);
      if (intentFingerprint.value !== bundle.routeIntentFingerprint) {
        reasons.push("bundle-normalized-route-intent-fingerprint-mismatch:normalizedRouteIntent");
      }
      if (clean(input.routeIntentFingerprintVersion) !== ROUTE_INTENT_FINGERPRINT_VERSION) {
        reasons.push("bundle-normalized-route-intent-version-mismatch:routeIntentFingerprintVersion");
      }
    }
  }
  if (!Array.isArray(input.destinationOrder) || bundle.destinationOrder.length < minimumRouteDestinationCount(bundle)) reasons.push("destinationOrder-below-intent-minimum");
  if (bundle.destinationOrder.length !== (Array.isArray(input.destinationOrder) ? input.destinationOrder.map(clean).filter(Boolean).length : 0)) reasons.push("destinationOrder-duplicate-or-empty");
  if (!Array.isArray(input.legs)) reasons.push("legs-array-required");
  if (bundle.legs.length !== Math.max(0, bundle.destinationOrder.length - 1)) reasons.push("legs-destination-order-length-mismatch");
  for (const [index, leg] of bundle.legs.entries()) {
    const rawLeg = input.legs?.[index] || {};
    if (!leg.fromEntityId) reasons.push(`leg-${index}:fromEntityId-required`);
    if (!leg.toEntityId) reasons.push(`leg-${index}:toEntityId-required`);
    if (!clean(rawLeg.transportMode)) reasons.push(`leg-${index}:transportMode-required`);
    if (rawLeg.estimatedDurationMinutes !== null && rawLeg.estimatedDurationMinutes !== "" && rawLeg.estimatedDurationMinutes !== undefined
      && !Number.isFinite(Number(rawLeg.estimatedDurationMinutes))) reasons.push(`leg-${index}:estimatedDurationMinutes-invalid`);
    if (!EVIDENCE_BUNDLE_LEG_FEASIBILITY_STATUSES.has(leg.feasibilityStatus)) reasons.push(`leg-${index}:feasibilityStatus-invalid`);
    if (leg.estimatedDurationMinutes != null && (!Number.isFinite(leg.estimatedDurationMinutes) || leg.estimatedDurationMinutes < 0)) reasons.push(`leg-${index}:estimatedDurationMinutes-invalid`);
    if (!Array.isArray(rawLeg.evidenceRefs)) reasons.push(`leg-${index}:evidenceRefs-array-required`);
    if (!Array.isArray(rawLeg.unknowns)) reasons.push(`leg-${index}:unknowns-array-required`);
    for (const [unknownIndex, unknown] of (Array.isArray(rawLeg.unknowns) ? rawLeg.unknowns : []).entries()) {
      if (!clean(unknown?.field) || !clean(unknown?.reason)) reasons.push(`leg-${index}:unknown-${unknownIndex}-field-and-reason-required`);
    }
    if (leg.fromEntityId !== bundle.destinationOrder[index] || leg.toEntityId !== bundle.destinationOrder[index + 1]) reasons.push(`leg-${index}:destination-order-mismatch`);
  }
  validateEvidenceArea(input.seasonality, "seasonality", reasons);
  validateEvidenceArea(input.geography, "geography", reasons);
  validateEvidenceArea(input.routePacing, "routePacing", reasons);
  for (const field of ["unknowns", "conflicts", "sources", "diagnostics"]) {
    if (!Array.isArray(input[field])) reasons.push(`${field}-array-required`);
  }
  for (const field of ["legEvidenceRefs", "seasonEvidenceRefs", "missingEvidenceRefs"]) {
    if (input[field] !== undefined && !Array.isArray(input[field])) reasons.push(`${field}-array-required`);
  }
  if (bundle.legEvidenceRefs.length > 0 && bundle.legEvidenceRefs.length !== bundle.legs.length) {
    reasons.push("legEvidenceRefs-legs-length-mismatch");
  }
  if (bundle.evidenceReferenceMode === "public-evidence-references") {
    if (bundle.legEvidenceRefs.length !== bundle.legs.length) reasons.push("public-reference-mode-requires-all-leg-refs");
  }
  for (const [index, unknown] of bundle.unknowns.entries()) {
    if (!unknown.field || !unknown.reason) reasons.push(`unknown-${index}:field-and-reason-required`);
  }
  for (const [index, conflict] of bundle.conflicts.entries()) {
    if (!conflict.code || !conflict.field || !conflict.message) reasons.push(`conflict-${index}:code-field-and-message-required`);
  }
  for (const [index, diagnostic] of bundle.diagnostics.entries()) {
    if (!diagnostic.stage || !diagnostic.code || !diagnostic.message) reasons.push(`diagnostic-${index}:stage-code-and-message-required`);
  }
  for (const [index, source] of bundle.sources.entries()) {
    for (const field of ["sourceId", "sourceType", "url", "publisher", "retrievedAt"]) {
      if (!clean(source[field])) reasons.push(`source-${index}:${field}-required`);
    }
    if (!Array.isArray(source.supports) || source.supports.length === 0) reasons.push(`source-${index}:supports-required`);
    if (source.confidence == null || source.confidence < 0 || source.confidence > 1) reasons.push(`source-${index}:confidence-invalid`);
  }
  if (bundle.status === "complete" && (bundle.sources.length === 0 || bundle.unknowns.length > 0 || bundle.conflicts.length > 0)) reasons.push("complete-status-requires-resolved-evidence");
  if (bundle.status === "complete" && bundle.missingEvidenceRefs.length > 0) reasons.push("complete-status-requires-no-missing-evidence");
  if (bundle.status === "failed" && !bundle.failureReason) reasons.push("failed-status-requires-failureReason");
  if (bundle.status !== "failed" && bundle.failureReason) reasons.push("failureReason-only-valid-for-failed-status");

  if (expected.selectedCandidate || expected.routeRecord || expected.decisionTrace) {
    const consistency = consistencyFailures(expected);
    if (bundle.status === "failed") {
      if (consistency.length && bundle.failureReason !== consistency[0]) reasons.push("failureReason-consistency-mismatch");
    } else if (consistency.length) {
      reasons.push(...consistency);
    }
    const expectedOrder = candidateDestinationOrder(expected.selectedCandidate || {});
    if (expectedOrder.length && !sameOrder(bundle.destinationOrder, expectedOrder)) reasons.push("bundle-candidate-destination-order-mismatch");
    const expectedFingerprint = clean(
      expected.selectedCandidate?.routeIntentFingerprint
        || expected.routeRecord?.routeIntentFingerprint
        || expected.decisionTrace?.routeIntentFingerprint,
    );
    const expectedFingerprintVersion = clean(
      expected.selectedCandidate?.routeIntentFingerprintVersion
        || expected.routeRecord?.routeIntentFingerprintVersion
        || expected.decisionTrace?.routeIntentFingerprintVersion,
    );
    if (expectedFingerprint) {
      if (!bundle.routeIntentFingerprint) reasons.push("bundle-route-intent-fingerprint-required:routeIntentFingerprint");
      else if (bundle.routeIntentFingerprint !== expectedFingerprint) reasons.push("bundle-route-intent-fingerprint-mismatch:routeIntentFingerprint");
    }
    if (expectedFingerprintVersion) {
      if (!bundle.routeIntentFingerprintVersion) reasons.push("bundle-route-intent-fingerprint-version-required:routeIntentFingerprintVersion");
      else if (bundle.routeIntentFingerprintVersion !== expectedFingerprintVersion) reasons.push("bundle-route-intent-fingerprint-version-mismatch:routeIntentFingerprintVersion");
    }
  }

  return { accepted: reasons.length === 0, reasons, bundle: clone(bundle), expectedEvidenceBundleId: expectedId };
}
