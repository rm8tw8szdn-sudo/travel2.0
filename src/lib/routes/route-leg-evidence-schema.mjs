import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const ROUTE_LEG_EVIDENCE_SCHEMA_VERSION = "route-generation-v2-evidence-3a2-route-leg-v1";
export const ROUTE_LEG_FEASIBILITY_STATUSES = new Set(["unknown", "needs-evidence", "feasible", "infeasible"]);
export const ROUTE_LEG_FRESHNESS_STATUSES = new Set(["unknown", "fresh", "stale", "expired"]);

function clean(value) {
  return cleanString(value);
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value) {
  return clean(value) || null;
}

function normalizeIssue(issue = {}) {
  return {
    field: clean(issue.field),
    reason: clean(issue.reason || issue.message),
  };
}

export function normalizeRouteLegTransportMode(value) {
  return clean(value || "unknown").toLocaleLowerCase("en-US") || "unknown";
}

export function routeLegEvidenceKey(input = {}) {
  return `${clean(input.fromEntityId)}>${clean(input.toEntityId)}|${normalizeRouteLegTransportMode(input.transportMode)}`;
}

export function createRouteLegEvidenceId(input = {}) {
  return `rle-${stableHash({
    fromEntityId: clean(input.fromEntityId),
    toEntityId: clean(input.toEntityId),
    transportMode: normalizeRouteLegTransportMode(input.transportMode),
    directed: true,
    schemaVersion: ROUTE_LEG_EVIDENCE_SCHEMA_VERSION,
  }).slice(0, 20)}`;
}

export function normalizeRouteLegEvidence(input = {}, { now = () => new Date().toISOString() } = {}) {
  const timestamp = clean(input.updatedAt || input.createdAt) || now();
  const normalized = {
    legEvidenceId: clean(input.legEvidenceId),
    schemaVersion: clean(input.schemaVersion || ROUTE_LEG_EVIDENCE_SCHEMA_VERSION),
    fromEntityId: clean(input.fromEntityId),
    toEntityId: clean(input.toEntityId),
    transportMode: normalizeRouteLegTransportMode(input.transportMode),
    directed: input.directed !== false,
    feasibilityStatus: clean(input.feasibilityStatus || "needs-evidence"),
    durationMinMinutes: nullableNumber(input.durationMinMinutes),
    durationMaxMinutes: nullableNumber(input.durationMaxMinutes),
    transferCount: nullableNumber(input.transferCount),
    frequencyLevel: clean(input.frequencyLevel || "unknown"),
    sourceRefs: uniqueStrings(Array.isArray(input.sourceRefs) ? input.sourceRefs : []),
    confidence: nullableNumber(input.confidence),
    freshnessStatus: clean(input.freshnessStatus || "unknown"),
    retrievedAt: nullableString(input.retrievedAt),
    expiresAt: nullableString(input.expiresAt),
    unknowns: (Array.isArray(input.unknowns) ? input.unknowns : []).map(normalizeIssue),
    conflicts: (Array.isArray(input.conflicts) ? input.conflicts : []).map(normalizeIssue),
    diagnostics: (Array.isArray(input.diagnostics) ? input.diagnostics : []).map(normalizeIssue),
    createdAt: clean(input.createdAt) || timestamp,
    updatedAt: clean(input.updatedAt) || timestamp,
  };
  normalized.legEvidenceId = normalized.legEvidenceId || createRouteLegEvidenceId(normalized);
  return normalized;
}

export function validateRouteLegEvidence(input = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { accepted: false, reasons: ["route-leg-evidence-not-object"] };
  const record = normalizeRouteLegEvidence(input, { now: () => clean(input.updatedAt || input.createdAt) || "1970-01-01T00:00:00.000Z" });
  for (const field of ["legEvidenceId", "schemaVersion", "fromEntityId", "toEntityId", "transportMode", "feasibilityStatus", "freshnessStatus", "createdAt", "updatedAt"]) {
    if (!clean(input[field])) reasons.push(`${field}-required`);
  }
  if (record.schemaVersion !== ROUTE_LEG_EVIDENCE_SCHEMA_VERSION) reasons.push("schemaVersion-unsupported");
  if (record.legEvidenceId !== createRouteLegEvidenceId(record)) reasons.push("legEvidenceId-mismatch");
  if (record.fromEntityId === record.toEntityId) reasons.push("route-leg-endpoints-must-differ");
  if (input.directed !== true) reasons.push("directed-must-be-true");
  if (!ROUTE_LEG_FEASIBILITY_STATUSES.has(record.feasibilityStatus)) reasons.push("feasibilityStatus-invalid");
  if (!ROUTE_LEG_FRESHNESS_STATUSES.has(record.freshnessStatus)) reasons.push("freshnessStatus-invalid");
  for (const field of ["sourceRefs", "unknowns", "conflicts", "diagnostics"]) {
    if (!Array.isArray(input[field])) reasons.push(`${field}-array-required`);
  }
  for (const [field, value] of [["durationMinMinutes", record.durationMinMinutes], ["durationMaxMinutes", record.durationMaxMinutes], ["transferCount", record.transferCount]]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) reasons.push(`${field}-invalid`);
  }
  if (record.durationMinMinutes != null && record.durationMaxMinutes != null && record.durationMinMinutes > record.durationMaxMinutes) reasons.push("duration-range-invalid");
  if (record.confidence != null && (record.confidence < 0 || record.confidence > 1)) reasons.push("confidence-invalid");
  if (record.sourceRefs.length === 0) {
    if (record.durationMinMinutes != null || record.durationMaxMinutes != null || record.transferCount != null) reasons.push("source-free-route-leg-must-not-claim-time");
    if (record.confidence != null || record.retrievedAt != null || record.expiresAt != null) reasons.push("source-free-route-leg-must-not-claim-source-metadata");
    if (!["unknown", "needs-evidence"].includes(record.feasibilityStatus)) reasons.push("source-free-route-leg-must-remain-unknown");
  }
  return { accepted: reasons.length === 0, reasons, record: structuredClone(record) };
}

export function buildMissingRouteLegEvidence(input = {}, { now = () => new Date().toISOString() } = {}) {
  const fromEntityId = clean(input.fromEntityId);
  const toEntityId = clean(input.toEntityId);
  if (!fromEntityId || !toEntityId) return { created: false, reason: "route-leg-endpoints-required" };
  if (fromEntityId === toEntityId) return { created: false, reason: "route-leg-endpoints-must-differ" };
  const timestamp = now();
  const record = normalizeRouteLegEvidence({
    schemaVersion: ROUTE_LEG_EVIDENCE_SCHEMA_VERSION,
    fromEntityId,
    toEntityId,
    transportMode: normalizeRouteLegTransportMode(input.transportMode),
    directed: true,
    feasibilityStatus: "needs-evidence",
    durationMinMinutes: null,
    durationMaxMinutes: null,
    transferCount: null,
    frequencyLevel: "unknown",
    sourceRefs: [],
    confidence: null,
    freshnessStatus: "unknown",
    retrievedAt: null,
    expiresAt: null,
    unknowns: [{ field: "routeLeg", reason: "No reusable transport evidence source has been collected." }],
    conflicts: [],
    diagnostics: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { now });
  const validation = validateRouteLegEvidence(record);
  return validation.accepted
    ? { created: true, record: validation.record }
    : { created: false, reason: "route-leg-evidence-invalid", reasons: validation.reasons };
}
