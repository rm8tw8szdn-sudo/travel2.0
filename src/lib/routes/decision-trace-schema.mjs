import { cleanString, stableHash, uniqueStrings as unique } from "./route-v2-utils.mjs";
import { envFlag } from "./route-v2-env.mjs";
import { validateRouteCandidate } from "./route-candidate-pool.mjs";
import { normalizeTimeIntent } from "./search-intent-parser.mjs";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  ROUTE_INTENT_SCHEMA_VERSION,
  createRouteIntentFingerprint,
} from "./route-intent-model.mjs";

export const DECISION_TRACE_SCHEMA_VERSION = "route-generation-v2-phase1-trace-v1";
export const ROUTE_V2_INTENT_FLAG = "ROUTE_V2_INTENT_ENABLED";
export const DECISION_TRACE_OUTCOMES = new Set(["success", "failure"]);
export const DECISION_TRACE_PHASES = new Set(["phase1-trace-only", "minimal-candidate-selection", "minimal-candidate-failure"]);

function clone(value) {
  return structuredClone(value);
}

function routeOrderSnapshot(route = {}) {
  const destinationEntities = Array.isArray(route.destinationEntities) ? route.destinationEntities : [];
  const proposedOrder = destinationEntities.length
    ? destinationEntities.map((item) => cleanString(item?.wikidataId || item?.entityId || item?.id || item?.name)).filter(Boolean)
    : unique(route.destinations || route.cities || []);
  return {
    routeId: cleanString(route.id),
    countries: unique([
      ...(Array.isArray(route.countries) ? route.countries : []),
      ...(Array.isArray(route.countryEntities) ? route.countryEntities.map((item) => item?.countryCode) : []),
    ]),
    proposedOrder,
    durationDays: Number(route.durationDays) || null,
    travelStyle: cleanString(route.travelStyle) || null,
  };
}

export function isRouteV2IntentEnabled(env = process.env) {
  return envFlag(env, ROUTE_V2_INTENT_FLAG, false);
}

export function stableDecisionTraceHash(value) {
  return stableHash(value);
}

export function createDecisionTraceId({ routeId = "", candidateId = "", intentId = "", version = DECISION_TRACE_SCHEMA_VERSION } = {}) {
  const hash = stableDecisionTraceHash({ routeId, candidateId, intentId, version }).slice(0, 20);
  return `dt-${hash}`;
}

export function routeIntentSnapshot(input = {}) {
  const context = input.context && typeof input.context === "object" ? input.context : {};
  const route = input.route && typeof input.route === "object" ? input.route : {};
  const countries = unique([
    ...(Array.isArray(context.countries) ? context.countries : []),
    context.country,
    context.countryCode,
    ...(Array.isArray(route.countries) ? route.countries : []),
    ...(Array.isArray(route.countryEntities) ? route.countryEntities.map((item) => item?.countryCode) : []),
  ]);
  const destinations = unique([
    ...(Array.isArray(context.destinations) ? context.destinations : []),
    ...(Array.isArray(route.destinations) ? route.destinations : []),
    ...(Array.isArray(route.destinationEntities) ? route.destinationEntities.map((item) => item?.name) : []),
  ]);
  const fingerprint = createRouteIntentFingerprint(context.normalizedRouteIntent || context);
  return {
    intentId: cleanString(input.intentId) || `legacy-intent-${stableDecisionTraceHash({ countries, destinations, travelStyle: context.travelStyle || route.travelStyle || "", duration: context.durationDays || route.durationDays || "" }).slice(0, 16)}`,
    strategyType: cleanString(context.strategyType) || cleanString(route.designStrategies?.[0]) || "Legacy",
    targetRegions: unique([context.region, ...(Array.isArray(context.regions) ? context.regions : [])]),
    targetCountries: countries,
    targetCities: destinations,
    duration: {
      days: Number(context.durationDays || route.durationDays || 0) || null,
      durationBand: cleanString(context.durationBand) || cleanString(route.durationBand) || null,
      flexibility: cleanString(context.durationFlexibility) || null,
    },
    season: {
      monthRange: unique([context.season, ...(Array.isArray(context.bestMonths) ? context.bestMonths : []), ...(Array.isArray(route.bestMonths) ? route.bestMonths : [])]),
      seasonLabel: cleanString(context.season) || null,
      hardConstraint: Boolean(context.seasonHardConstraint),
    },
    ...(context.timeIntent && typeof context.timeIntent === "object"
      ? { timeIntent: normalizeTimeIntent(context.timeIntent) }
      : {}),
    ...(cleanString(context.intentMode) ? { intentMode: cleanString(context.intentMode) } : {}),
    ...(cleanString(context.rawQuery) ? { rawQuery: cleanString(context.rawQuery) } : {}),
    ...(Array.isArray(context.requiredDestinationIds) ? {
      requiredDestinationIds: unique(context.requiredDestinationIds),
      requiredDestinationNames: unique(context.requiredDestinationNames || []),
      requiredDestinationRaw: unique(context.requiredDestinationRaw || []),
      destinationOrderMode: cleanString(context.destinationOrderMode || "unspecified"),
      destinationDiagnostics: Array.isArray(context.destinationDiagnostics)
        ? clone(context.destinationDiagnostics)
        : [],
    } : {}),
    ...(context.destinationSuggestion && typeof context.destinationSuggestion === "object"
      ? {
        destinationSuggestion: {
          mode: cleanString(context.destinationSuggestion.mode),
          seed: cleanString(context.destinationSuggestion.seed),
          countryCode: cleanString(context.destinationSuggestion.countryCode).toUpperCase(),
          countryName: cleanString(context.destinationSuggestion.countryName),
          cities: unique(context.destinationSuggestion.cities || []),
          source: cleanString(context.destinationSuggestion.source),
          sourceRouteId: cleanString(context.destinationSuggestion.sourceRouteId) || null,
          seasonEvidencePending: Boolean(context.destinationSuggestion.seasonEvidencePending),
          diagnostics: Array.isArray(context.destinationSuggestion.diagnostics)
            ? clone(context.destinationSuggestion.diagnostics)
            : [],
        },
      }
      : {}),
    theme: {
      themeKey: cleanString(context.theme) || cleanString(route.themes?.[0]) || null,
      themeLabel: cleanString(context.themeLabel) || cleanString(route.themes?.[0]) || null,
      requiredSignals: [],
    },
    travelStyle: cleanString(context.travelStyle) || cleanString(route.travelStyle) || null,
    transportPreference: unique([context.transport, ...(Array.isArray(context.transportPreference) ? context.transportPreference : [])]),
    budgetConstraint: context.budgetConstraint == null ? null : clone(context.budgetConstraint),
    noveltyTarget: context.noveltyTarget == null ? null : clone(context.noveltyTarget),
    coverageGoal: context.coverageGoal == null ? null : clone(context.coverageGoal),
    exclusions: context.exclusions == null ? null : clone(context.exclusions),
    routeIntentSchemaVersion: ROUTE_INTENT_SCHEMA_VERSION,
    routeIntentFingerprintVersion: ROUTE_INTENT_FINGERPRINT_VERSION,
    routeIntentFingerprint: fingerprint.value,
    normalizedRouteIntent: fingerprint.normalizedIntent,
    source: cleanString(input.source) || cleanString(route.sourceType) || "legacy",
    createdAt: cleanString(input.createdAt) || cleanString(route.acceptedAt) || null,
  };
}

export function selectedCandidateSnapshot(route = {}, extra = {}) {
  const destinations = Array.isArray(route.destinationEntities)
    ? route.destinationEntities.map((item) => ({
      id: cleanString(item?.wikidataId || item?.id || item?.name),
      name: cleanString(item?.name),
      countryCode: cleanString(item?.countryCode),
    }))
    : unique(route.destinations || route.cities || []).map((name) => ({ id: name, name, countryCode: "" }));
  return {
    candidateId: cleanString(extra.candidateId) || `legacy-candidate-${stableDecisionTraceHash({ routeId: route.id, destinations }).slice(0, 16)}`,
    routeId: cleanString(route.id),
    countries: unique([
      ...(Array.isArray(route.countries) ? route.countries : []),
      ...(Array.isArray(route.countryEntities) ? route.countryEntities.map((item) => item?.countryCode) : []),
    ]),
    destinations,
    proposedOrder: destinations.map((item) => item.id || item.name).filter(Boolean),
    generationSource: cleanString(extra.generationSource) || cleanString(route.destinationSource) || cleanString(route.provenance?.source) || "legacy",
    initialReason: "Phase 1 trace-only snapshot of the selected legacy route. It is not a reconstructed candidate-pool decision.",
    status: "selected",
  };
}

export function buildLegacyDecisionTrace({
  route,
  context = {},
  source = "legacy",
  concept = null,
  candidateSelection = null,
  decisionFactors = [],
  strategyEffects = [],
  dataSourcesUsed = [],
  unknowns = [],
  timestamp = new Date().toISOString(),
} = {}) {
  if (!route?.id) throw new Error("DECISION_TRACE_ROUTE_REQUIRED");
  const hasCandidateSelection = candidateSelection?.ready === true
    && candidateSelection?.selectedCandidate?.candidateId;
  const selectionIntent = hasCandidateSelection ? candidateSelection.inputIntentSnapshot || {} : {};
  const inputContext = hasCandidateSelection
    ? clone(selectionIntent)
    : routeIntentSnapshot({
      route,
      context,
      source,
      createdAt: timestamp,
      intentId: selectionIntent.intentId,
    });
  const selectedCandidate = hasCandidateSelection
    ? {
      ...clone(candidateSelection.selectedCandidate),
      proposedOrder: [...(candidateSelection.selectedCandidate.proposedOrder || [])],
      rejectionReasons: clone(candidateSelection.selectedCandidate.rejectionReasons || []),
      routeId: cleanString(route.id),
      status: "selected",
    }
    : selectedCandidateSnapshot(route, {
      generationSource: source === "materialize" ? "knowledge-graph-pool" : route.destinationSource || route.provenance?.source || source,
    });
  const traceId = createDecisionTraceId({
    routeId: route.id,
    candidateId: selectedCandidate.candidateId,
    intentId: inputContext.intentId,
  });
  const legacyUnknowns = [
    { field: "candidatePool", reason: "Phase 1 does not persist a true pre-generation candidate pool." },
    { field: "rejectedCandidates", reason: "Legacy generation did not persist rejected alternatives for this route." },
    { field: "rejectionReasons", reason: "Legacy generation did not persist per-candidate rejection reasons for this route." },
  ];
  const candidatePool = hasCandidateSelection
    ? clone(candidateSelection.candidatePool)
    : [];
  const rejectedCandidates = hasCandidateSelection
    ? clone(candidateSelection.rejectedCandidates)
    : [];
  const candidateValidations = hasCandidateSelection && Array.isArray(candidateSelection.validationResults)
    ? clone(candidateSelection.validationResults)
    : [];
  const selectedCandidateValidation = candidateValidations.find((validation) => (
    cleanString(validation?.candidateId) === cleanString(selectedCandidate.candidateId)
  )) || null;
  return {
    traceId,
    routeId: route.id,
    candidateId: selectedCandidate.candidateId,
    intentId: inputContext.intentId,
    routeIntentSchemaVersion: cleanString(inputContext.routeIntentSchemaVersion),
    routeIntentFingerprintVersion: cleanString(inputContext.routeIntentFingerprintVersion),
    routeIntentFingerprint: cleanString(inputContext.routeIntentFingerprint),
    inputContext,
    ...(hasCandidateSelection ? { inputIntentSnapshot: clone(selectionIntent) } : {}),
    candidatePool,
    selectedCandidate,
    rejectedCandidates,
    rejectionReasons: hasCandidateSelection
      ? clone(candidateSelection.rejectionReasons)
      : [],
    ...(candidateValidations.length
      ? {
        candidateValidations,
        selectedCandidateValidation: clone(selectedCandidateValidation),
        candidateSelectionMode: cleanString(candidateSelection.selectionMode),
      }
      : {}),
    decisionFactors: [
      ...(hasCandidateSelection ? candidateSelection.decisionFactors : []),
      ...decisionFactors,
    ].map((item) => clone(item)),
    strategyEffects: clone(strategyEffects),
    dataSourcesUsed: clone(dataSourcesUsed),
    unknowns: [
      ...(hasCandidateSelection ? candidateSelection.unknowns : legacyUnknowns),
      ...unknowns,
    ].map((item) => clone(item)),
    timestamp,
    version: DECISION_TRACE_SCHEMA_VERSION,
    phase: hasCandidateSelection ? "minimal-candidate-selection" : "phase1-trace-only",
    outcome: "success",
    routeSnapshot: routeOrderSnapshot(route),
    conceptSnapshot: concept ? {
      travelStyle: concept.travelStyle || null,
      durationBand: concept.durationBand || null,
      routeStructure: concept.routeStructure || null,
    } : null,
  };
}

function failureCandidateSnapshot(candidate = {}, failureReason = "v2-failed") {
  const existingReasons = Array.isArray(candidate.rejectionReasons) ? clone(candidate.rejectionReasons) : [];
  const rejectionReasons = existingReasons.length
    ? existingReasons
    : [{ code: cleanString(failureReason), reason: cleanString(failureReason) }];
  return {
    ...clone(candidate),
    status: candidate.status === "rejected" ? "rejected" : "failed",
    rejectionReasons,
  };
}

export function buildFailureDecisionTrace({
  context = {},
  intentId = context.intentId || "",
  candidatePool = [],
  candidateValidations = [],
  candidateSelectionMode = "",
  failureStage = "planner",
  failureReason = "v2-planner-failed",
  source = "planner-pipeline",
  decisionFactors = [],
  unknowns = [],
  legacyFallback = true,
  timestamp = new Date().toISOString(),
} = {}) {
  const inputContext = routeIntentSnapshot({ context, intentId, source, createdAt: timestamp });
  const failedCandidates = (Array.isArray(candidatePool) ? candidatePool : [])
    .map((candidate) => failureCandidateSnapshot(candidate, failureReason));
  const traceId = createDecisionTraceId({
    routeId: "failure",
    candidateId: `failure:${cleanString(failureStage)}:${cleanString(failureReason)}`,
    intentId: inputContext.intentId,
  });
  return {
    traceId,
    routeId: null,
    candidateId: null,
    intentId: inputContext.intentId,
    routeIntentSchemaVersion: cleanString(inputContext.routeIntentSchemaVersion),
    routeIntentFingerprintVersion: cleanString(inputContext.routeIntentFingerprintVersion),
    routeIntentFingerprint: cleanString(inputContext.routeIntentFingerprint),
    inputContext,
    inputIntentSnapshot: clone(inputContext),
    candidatePool: failedCandidates,
    ...(Array.isArray(candidateValidations) && candidateValidations.length
      ? {
        candidateValidations: clone(candidateValidations),
        selectedCandidateValidation: null,
        candidateSelectionMode: cleanString(candidateSelectionMode),
      }
      : {}),
    selectedCandidate: null,
    rejectedCandidates: clone(failedCandidates),
    rejectionReasons: failedCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      ...(clone(candidate.rejectionReasons[0]) || {}),
    })),
    decisionFactors: clone(decisionFactors),
    strategyEffects: [],
    dataSourcesUsed: [],
    unknowns: [
      { field: "v2Failure", reason: cleanString(failureReason) },
      ...clone(unknowns),
    ],
    timestamp,
    version: DECISION_TRACE_SCHEMA_VERSION,
    phase: "minimal-candidate-failure",
    outcome: "failure",
    routeSnapshot: null,
    failureStage: cleanString(failureStage),
    failureReason: cleanString(failureReason),
    legacyFallback: Boolean(legacyFallback),
    source: cleanString(source),
  };
}

export function validateDecisionTrace(trace = {}) {
  const missing = [];
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return { accepted: false, missing: ["trace-object-required"] };
  for (const field of ["traceId", "intentId", "timestamp", "version", "phase", "outcome"]) {
    if (!cleanString(trace[field])) missing.push(`${field}-required`);
  }
  if (trace.version !== DECISION_TRACE_SCHEMA_VERSION) missing.push("version-unsupported");
  if (!DECISION_TRACE_PHASES.has(cleanString(trace.phase))) missing.push("phase-unsupported");
  if (!DECISION_TRACE_OUTCOMES.has(cleanString(trace.outcome))) missing.push("outcome-unsupported");
  if (!trace.inputContext || typeof trace.inputContext !== "object" || Array.isArray(trace.inputContext)) missing.push("inputContext-object-required");
  if (cleanString(trace.inputContext?.intentId) !== cleanString(trace.intentId)) missing.push("inputContext-intentId-mismatch");
  if (cleanString(trace.routeIntentSchemaVersion) !== cleanString(trace.inputContext?.routeIntentSchemaVersion)) missing.push("routeIntentSchemaVersion-inputContext-mismatch");
  if (cleanString(trace.routeIntentFingerprintVersion) !== cleanString(trace.inputContext?.routeIntentFingerprintVersion)) missing.push("routeIntentFingerprintVersion-inputContext-mismatch");
  if (cleanString(trace.routeIntentFingerprint) !== cleanString(trace.inputContext?.routeIntentFingerprint)) missing.push("routeIntentFingerprint-inputContext-mismatch");
  for (const field of ["candidatePool", "rejectedCandidates", "rejectionReasons", "decisionFactors", "strategyEffects", "dataSourcesUsed", "unknowns"]) {
    if (!Array.isArray(trace[field])) missing.push(`${field}-array-required`);
  }
  const candidatePool = Array.isArray(trace.candidatePool) ? trace.candidatePool : [];
  const candidateValidations = Array.isArray(trace.candidateValidations) ? trace.candidateValidations : [];
  const evidenceAware = candidateValidations.length > 0;
  if (trace.candidateValidations != null && !Array.isArray(trace.candidateValidations)) missing.push("candidateValidations-array-required");
  const validationIds = new Set();
  const validationCandidateIds = new Set();
  for (const validation of candidateValidations) {
    const validationId = cleanString(validation?.validationId);
    const candidateId = cleanString(validation?.candidateId);
    if (!validationId) missing.push("candidateValidation-validationId-required");
    if (!candidateId) missing.push("candidateValidation-candidateId-required");
    if (validationIds.has(validationId)) missing.push(`candidateValidation-validationId-duplicate:${validationId}`);
    if (validationCandidateIds.has(candidateId)) missing.push(`candidateValidation-candidateId-duplicate:${candidateId}`);
    validationIds.add(validationId);
    validationCandidateIds.add(candidateId);
    if (!new Set(["ready", "needs-evidence", "rejected"]).has(cleanString(validation?.status))) {
      missing.push(`candidateValidation-status:${candidateId}`);
    }
    for (const field of ["reasonCodes", "legResults", "seasonResults", "criticalMissingEvidenceIds", "conflictEvidenceIds", "staleEvidenceIds"]) {
      if (!Array.isArray(validation?.[field])) missing.push(`candidateValidation-${field}:${candidateId}`);
    }
    if (!validation?.pacingResult || typeof validation.pacingResult !== "object" || Array.isArray(validation.pacingResult)) {
      missing.push(`candidateValidation-pacingResult:${candidateId}`);
    }
    if (!cleanString(validation?.validatedAt)) missing.push(`candidateValidation-validatedAt:${candidateId}`);
    if (!cleanString(validation?.validatorVersion)) missing.push(`candidateValidation-validatorVersion:${candidateId}`);
  }
  const candidateIds = new Set();
  for (const candidate of candidatePool) {
    const candidateId = cleanString(candidate?.candidateId);
    if (!candidateId) missing.push("candidatePool-candidateId-required");
    if (candidateIds.has(candidateId)) missing.push(`candidatePool-candidateId-duplicate:${candidateId}`);
    candidateIds.add(candidateId);
    if (!Array.isArray(candidate?.proposedOrder) || candidate.proposedOrder.length < 2) missing.push(`candidatePool-order:${candidateId}`);
    if (!Array.isArray(candidate?.rejectionReasons)) missing.push(`candidatePool-rejectionReasons:${candidateId}`);
    if (!new Set(["pending", "selected", "rejected", "needs-evidence", "failed"]).has(candidate?.status)) {
      missing.push(`candidatePool-status:${candidateId}`);
    }
    if (["rejected", "failed"].includes(candidate?.status) && candidate.rejectionReasons.length === 0) {
      missing.push(`candidatePool-failure-reason:${candidateId}`);
    }
    if (trace.phase !== "phase1-trace-only") {
      const candidateValidation = validateRouteCandidate(candidate);
      if (!candidateValidation.accepted) {
        missing.push(...candidateValidation.reasons.map((reason) => `candidatePool-schema:${candidateId}:${reason}`));
      }
    }
  }

  if (trace.outcome === "success") {
    if (!cleanString(trace.routeId)) missing.push("routeId-required");
    if (!cleanString(trace.candidateId)) missing.push("candidateId-required");
    if (!trace.selectedCandidate || typeof trace.selectedCandidate !== "object") missing.push("selectedCandidate-required");
    if (trace.selectedCandidate?.status !== "selected") missing.push("selectedCandidate-status-selected");
    if (cleanString(trace.selectedCandidate?.candidateId) !== cleanString(trace.candidateId)) missing.push("selectedCandidate-top-level-mismatch");
    if (cleanString(trace.selectedCandidate?.routeId) !== cleanString(trace.routeId)) missing.push("selectedCandidate-routeId-mismatch");
    if (!trace.routeSnapshot || typeof trace.routeSnapshot !== "object") missing.push("routeSnapshot-required");
    if (cleanString(trace.routeSnapshot?.routeId) !== cleanString(trace.routeId)) missing.push("routeSnapshot-routeId-mismatch");
    if (trace.phase === "minimal-candidate-selection") {
      if (!trace.inputIntentSnapshot || typeof trace.inputIntentSnapshot !== "object") missing.push("inputIntentSnapshot-required");
      if (cleanString(trace.inputIntentSnapshot?.intentId) !== cleanString(trace.intentId)) missing.push("inputIntentSnapshot-intentId-mismatch");
      if (candidatePool.length !== 3) missing.push("candidatePool-size-exactly-3");
      if (!candidateIds.has(cleanString(trace.candidateId))) missing.push("selectedCandidate-in-candidatePool");
      if (candidatePool.filter((candidate) => candidate.status === "selected").length !== 1) missing.push("candidatePool-selected-exactly-one");
      const selectedInPool = candidatePool.find((candidate) => cleanString(candidate.candidateId) === cleanString(trace.candidateId));
      if (selectedInPool?.status !== "selected") missing.push("candidatePool-selected-id-status");
      if (selectedInPool && JSON.stringify(selectedInPool.proposedOrder || []) !== JSON.stringify(trace.selectedCandidate?.proposedOrder || [])) {
        missing.push("selectedCandidate-candidatePool-order-mismatch");
      }
      if (selectedInPool && JSON.stringify(selectedInPool.countries || []) !== JSON.stringify(trace.selectedCandidate?.countries || [])) {
        missing.push("selectedCandidate-candidatePool-countries-mismatch");
      }
      if (selectedInPool && JSON.stringify(selectedInPool.destinations || []) !== JSON.stringify(trace.selectedCandidate?.destinations || [])) {
        missing.push("selectedCandidate-candidatePool-destinations-mismatch");
      }
      const expectedRejectedIds = new Set(candidatePool.filter((candidate) => cleanString(candidate.candidateId) !== cleanString(trace.candidateId)).map((candidate) => candidate.candidateId));
      const rejectedIds = new Set((trace.rejectedCandidates || []).map((candidate) => cleanString(candidate?.candidateId)).filter(Boolean));
      if (expectedRejectedIds.size !== 2 || rejectedIds.size !== 2 || [...expectedRejectedIds].some((id) => !rejectedIds.has(id))) {
        missing.push("rejectedCandidates-cover-non-selected");
      }
      for (const candidate of trace.rejectedCandidates || []) {
        const allowedStatus = evidenceAware
          ? ["rejected", "needs-evidence"]
          : ["rejected"];
        if (!allowedStatus.includes(candidate?.status)) missing.push(`rejectedCandidate-status:${cleanString(candidate?.candidateId)}`);
        if (!Array.isArray(candidate?.rejectionReasons) || candidate.rejectionReasons.length === 0) missing.push(`rejectedCandidate-reason:${cleanString(candidate?.candidateId)}`);
      }
      if ((trace.rejectionReasons || []).length !== 2) missing.push("rejectionReasons-cover-rejectedCandidates");
      for (const rejectedCandidate of trace.rejectedCandidates || []) {
        const inPool = candidatePool.find((candidate) => cleanString(candidate.candidateId) === cleanString(rejectedCandidate?.candidateId));
        if (!inPool || JSON.stringify(inPool.rejectionReasons || []) !== JSON.stringify(rejectedCandidate?.rejectionReasons || [])) {
          missing.push(`rejectedCandidate-candidatePool-mismatch:${cleanString(rejectedCandidate?.candidateId)}`);
        }
      }
      const topLevelRejections = new Map((trace.rejectionReasons || []).map((reason) => [cleanString(reason?.candidateId), reason]));
      for (const rejectedCandidate of trace.rejectedCandidates || []) {
        const topLevel = topLevelRejections.get(cleanString(rejectedCandidate?.candidateId));
        const firstReason = rejectedCandidate?.rejectionReasons?.[0] || {};
        if (!topLevel || cleanString(topLevel.code) !== cleanString(firstReason.code) || cleanString(topLevel.reason) !== cleanString(firstReason.reason)) {
          missing.push(`rejectionReasons-candidate-mismatch:${cleanString(rejectedCandidate?.candidateId)}`);
        }
      }
      const selectedOrder = (trace.selectedCandidate?.proposedOrder || []).map(cleanString).filter(Boolean);
      const routeOrder = (trace.routeSnapshot?.proposedOrder || []).map(cleanString).filter(Boolean);
      if (JSON.stringify(selectedOrder) !== JSON.stringify(routeOrder)) missing.push("selectedCandidate-route-order-mismatch");
      const selectedCountries = unique(trace.selectedCandidate?.countries || []).sort();
      const routeCountries = unique(trace.routeSnapshot?.countries || []).sort();
      if (JSON.stringify(selectedCountries) !== JSON.stringify(routeCountries)) missing.push("selectedCandidate-route-countries-mismatch");
      if (Number(trace.selectedCandidate?.durationDays) !== Number(trace.routeSnapshot?.durationDays)) missing.push("selectedCandidate-route-duration-mismatch");
      if (cleanString(trace.selectedCandidate?.travelStyle) !== cleanString(trace.routeSnapshot?.travelStyle)) missing.push("selectedCandidate-route-travelStyle-mismatch");
      if (evidenceAware) {
        if (candidateValidations.length !== candidatePool.length) missing.push("candidateValidations-cover-candidatePool");
        if (candidatePool.some((candidate) => !validationCandidateIds.has(cleanString(candidate.candidateId)))) {
          missing.push("candidateValidations-candidatePool-mismatch");
        }
        if (!trace.selectedCandidateValidation || typeof trace.selectedCandidateValidation !== "object") {
          missing.push("selectedCandidateValidation-required");
        } else {
          if (cleanString(trace.selectedCandidateValidation.candidateId) !== cleanString(trace.candidateId)) {
            missing.push("selectedCandidateValidation-candidateId-mismatch");
          }
          const expectedValidation = candidateValidations.find((validation) => cleanString(validation.candidateId) === cleanString(trace.candidateId));
          if (!expectedValidation || cleanString(expectedValidation.validationId) !== cleanString(trace.selectedCandidateValidation.validationId)) {
            missing.push("selectedCandidateValidation-validationId-mismatch");
          }
        }
        if (!new Set(["evidence-ready", "needs-evidence-preview"]).has(cleanString(trace.candidateSelectionMode))) {
          missing.push("candidateSelectionMode-invalid");
        }
      }
    }
  }

  if (trace.outcome === "failure") {
    if (trace.phase !== "minimal-candidate-failure") missing.push("failure-phase-required");
    if (trace.routeId != null && cleanString(trace.routeId)) missing.push("failure-routeId-must-be-empty");
    if (trace.candidateId != null && cleanString(trace.candidateId)) missing.push("failure-candidateId-must-be-empty");
    if (trace.selectedCandidate != null) missing.push("failure-selectedCandidate-must-be-null");
    if (trace.routeSnapshot != null) missing.push("failure-routeSnapshot-must-be-null");
    if (!cleanString(trace.failureStage)) missing.push("failureStage-required");
    if (!cleanString(trace.failureReason)) missing.push("failureReason-required");
    if (typeof trace.legacyFallback !== "boolean") missing.push("legacyFallback-boolean-required");
    if (candidatePool.some((candidate) => candidate.status === "selected")) missing.push("failure-candidatePool-must-not-select");
    if (candidatePool.some((candidate) => !["failed", "rejected", "needs-evidence"].includes(candidate.status))) missing.push("failure-candidatePool-status-invalid");
    if (evidenceAware) {
      if (candidateValidations.length !== candidatePool.length) missing.push("failure-candidateValidations-cover-candidatePool");
      if (candidatePool.some((candidate) => !validationCandidateIds.has(cleanString(candidate.candidateId)))) {
        missing.push("failure-candidateValidations-candidatePool-mismatch");
      }
      if (trace.selectedCandidateValidation != null) missing.push("failure-selectedCandidateValidation-must-be-null");
      if (!new Set(["evidence-aware-rejected", "evidence-aware-failed"]).has(cleanString(trace.candidateSelectionMode))) {
        missing.push("failure-candidateSelectionMode-invalid");
      }
    }
  }
  return { accepted: missing.length === 0, missing };
}
