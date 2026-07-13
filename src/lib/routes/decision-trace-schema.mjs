import crypto from "node:crypto";

export const DECISION_TRACE_SCHEMA_VERSION = "route-generation-v2-phase1-trace-v1";

function cleanString(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableDecisionTraceHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
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
    theme: {
      themeKey: cleanString(context.theme) || cleanString(route.themes?.[0]) || null,
      themeLabel: cleanString(context.themeLabel) || cleanString(route.themes?.[0]) || null,
      requiredSignals: [],
    },
    travelStyle: cleanString(context.travelStyle) || cleanString(route.travelStyle) || null,
    transportPreference: unique([context.transport, ...(Array.isArray(context.transportPreference) ? context.transportPreference : [])]),
    budgetConstraint: context.budgetConstraint || null,
    noveltyTarget: context.noveltyTarget || null,
    coverageGoal: context.coverageGoal || null,
    exclusions: context.exclusions || null,
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
  decisionFactors = [],
  strategyEffects = [],
  dataSourcesUsed = [],
  unknowns = [],
  timestamp = new Date().toISOString(),
} = {}) {
  if (!route?.id) throw new Error("DECISION_TRACE_ROUTE_REQUIRED");
  const inputContext = routeIntentSnapshot({ route, context, source, createdAt: timestamp });
  const selectedCandidate = selectedCandidateSnapshot(route, {
    generationSource: source === "materialize" ? "knowledge-graph-pool" : route.destinationSource || route.provenance?.source || source,
  });
  const traceId = createDecisionTraceId({
    routeId: route.id,
    candidateId: selectedCandidate.candidateId,
    intentId: inputContext.intentId,
  });
  const defaultUnknowns = [
    { field: "candidatePool", reason: "Phase 1 does not persist a true pre-generation candidate pool." },
    { field: "rejectedCandidates", reason: "Legacy generation did not persist rejected alternatives for this route." },
    { field: "rejectionReasons", reason: "Legacy generation did not persist per-candidate rejection reasons for this route." },
  ];
  return {
    traceId,
    routeId: route.id,
    candidateId: selectedCandidate.candidateId,
    intentId: inputContext.intentId,
    inputContext,
    candidatePool: [],
    selectedCandidate,
    rejectedCandidates: [],
    rejectionReasons: [],
    decisionFactors: decisionFactors.map((item) => ({ ...item })),
    strategyEffects: strategyEffects.map((item) => ({ ...item })),
    dataSourcesUsed: dataSourcesUsed.map((item) => ({ ...item })),
    unknowns: [...defaultUnknowns, ...unknowns.map((item) => ({ ...item }))],
    timestamp,
    version: DECISION_TRACE_SCHEMA_VERSION,
    phase: "phase1-trace-only",
    conceptSnapshot: concept ? {
      travelStyle: concept.travelStyle || null,
      durationBand: concept.durationBand || null,
      routeStructure: concept.routeStructure || null,
    } : null,
  };
}

export function validateDecisionTrace(trace = {}) {
  const missing = [];
  for (const field of [
    "traceId",
    "routeId",
    "candidateId",
    "intentId",
    "inputContext",
    "candidatePool",
    "selectedCandidate",
    "rejectedCandidates",
    "rejectionReasons",
    "decisionFactors",
    "strategyEffects",
    "dataSourcesUsed",
    "unknowns",
    "timestamp",
    "version",
  ]) {
    if (trace[field] == null) missing.push(field);
  }
  if (!Array.isArray(trace.candidatePool)) missing.push("candidatePool[]");
  if (!Array.isArray(trace.rejectedCandidates)) missing.push("rejectedCandidates[]");
  if (!Array.isArray(trace.rejectionReasons)) missing.push("rejectionReasons[]");
  if (!Array.isArray(trace.decisionFactors)) missing.push("decisionFactors[]");
  if (!Array.isArray(trace.strategyEffects)) missing.push("strategyEffects[]");
  if (!Array.isArray(trace.dataSourcesUsed)) missing.push("dataSourcesUsed[]");
  if (!Array.isArray(trace.unknowns)) missing.push("unknowns[]");
  return { accepted: missing.length === 0, missing };
}
