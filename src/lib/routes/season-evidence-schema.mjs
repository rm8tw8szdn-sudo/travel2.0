import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const SEASON_EVIDENCE_SCHEMA_VERSION = "route-generation-v2-evidence-3a2-season-v1";
export const SEASON_SUITABILITY_STATUSES = new Set(["unknown", "needs-evidence", "suitable", "unsuitable"]);
export const SEASON_FRESHNESS_STATUSES = new Set(["unknown", "fresh", "stale", "expired"]);

const MONTH_NAMES = new Map([
  ["january", 1], ["jan", 1], ["february", 2], ["feb", 2], ["march", 3], ["mar", 3],
  ["april", 4], ["apr", 4], ["may", 5], ["june", 6], ["jun", 6], ["july", 7], ["jul", 7],
  ["august", 8], ["aug", 8], ["september", 9], ["sep", 9], ["october", 10], ["oct", 10],
  ["november", 11], ["nov", 11], ["december", 12], ["dec", 12],
]);

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
  return { field: clean(issue.field), reason: clean(issue.reason || issue.message) };
}

export function normalizeEvidenceMonth(value) {
  if (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12) return Number(value);
  const text = clean(value).toLocaleLowerCase("en-US");
  if (!text) return null;
  const numeric = text.match(/^(\d{1,2})\s*(?:月|month)?$/u);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? month : null;
  }
  return MONTH_NAMES.get(text.replace(/\./gu, "")) || null;
}

export function seasonEvidenceKey(input = {}) {
  const month = normalizeEvidenceMonth(input.month);
  return `${clean(input.entityId)}|${month || "invalid"}`;
}

export function createSeasonEvidenceId(input = {}) {
  return `se-${stableHash({
    entityId: clean(input.entityId),
    month: normalizeEvidenceMonth(input.month),
    schemaVersion: SEASON_EVIDENCE_SCHEMA_VERSION,
  }).slice(0, 20)}`;
}

export function normalizeSeasonEvidence(input = {}, { now = () => new Date().toISOString() } = {}) {
  const timestamp = clean(input.updatedAt || input.createdAt) || now();
  const normalized = {
    seasonEvidenceId: clean(input.seasonEvidenceId),
    schemaVersion: clean(input.schemaVersion || SEASON_EVIDENCE_SCHEMA_VERSION),
    entityId: clean(input.entityId),
    month: normalizeEvidenceMonth(input.month),
    season: nullableString(input.season),
    suitabilityStatus: clean(input.suitabilityStatus || "needs-evidence"),
    weatherRisks: uniqueStrings(Array.isArray(input.weatherRisks) ? input.weatherRisks : []),
    transportRisks: uniqueStrings(Array.isArray(input.transportRisks) ? input.transportRisks : []),
    closureRisks: uniqueStrings(Array.isArray(input.closureRisks) ? input.closureRisks : []),
    recommendedBufferMinutes: nullableNumber(input.recommendedBufferMinutes),
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
  normalized.seasonEvidenceId = normalized.seasonEvidenceId || createSeasonEvidenceId(normalized);
  return normalized;
}

export function validateSeasonEvidence(input = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { accepted: false, reasons: ["season-evidence-not-object"] };
  const record = normalizeSeasonEvidence(input, { now: () => clean(input.updatedAt || input.createdAt) || "1970-01-01T00:00:00.000Z" });
  for (const field of ["seasonEvidenceId", "schemaVersion", "entityId", "month", "suitabilityStatus", "freshnessStatus", "createdAt", "updatedAt"]) {
    if (input[field] == null || input[field] === "") reasons.push(`${field}-required`);
  }
  if (record.schemaVersion !== SEASON_EVIDENCE_SCHEMA_VERSION) reasons.push("schemaVersion-unsupported");
  if (!record.month || record.month < 1 || record.month > 12) reasons.push("month-invalid");
  if (record.seasonEvidenceId !== createSeasonEvidenceId(record)) reasons.push("seasonEvidenceId-mismatch");
  if (!SEASON_SUITABILITY_STATUSES.has(record.suitabilityStatus)) reasons.push("suitabilityStatus-invalid");
  if (!SEASON_FRESHNESS_STATUSES.has(record.freshnessStatus)) reasons.push("freshnessStatus-invalid");
  for (const field of ["weatherRisks", "transportRisks", "closureRisks", "sourceRefs", "unknowns", "conflicts", "diagnostics"]) {
    if (!Array.isArray(input[field])) reasons.push(`${field}-array-required`);
  }
  if (record.recommendedBufferMinutes != null && (!Number.isFinite(record.recommendedBufferMinutes) || record.recommendedBufferMinutes < 0)) reasons.push("recommendedBufferMinutes-invalid");
  if (record.confidence != null && (record.confidence < 0 || record.confidence > 1)) reasons.push("confidence-invalid");
  if (record.sourceRefs.length === 0) {
    if (record.season != null || record.weatherRisks.length || record.transportRisks.length || record.closureRisks.length) reasons.push("source-free-season-must-not-claim-risks");
    if (record.recommendedBufferMinutes != null || record.confidence != null || record.retrievedAt != null || record.expiresAt != null) reasons.push("source-free-season-must-not-claim-source-metadata");
    if (!["unknown", "needs-evidence"].includes(record.suitabilityStatus)) reasons.push("source-free-season-must-remain-unknown");
  }
  return { accepted: reasons.length === 0, reasons, record: structuredClone(record) };
}

export function buildMissingSeasonEvidence(input = {}, { now = () => new Date().toISOString() } = {}) {
  const entityId = clean(input.entityId);
  const month = normalizeEvidenceMonth(input.month);
  if (!entityId) return { created: false, reason: "season-entityId-required" };
  if (!month) return { created: false, reason: "season-month-invalid" };
  const timestamp = now();
  const record = normalizeSeasonEvidence({
    schemaVersion: SEASON_EVIDENCE_SCHEMA_VERSION,
    entityId,
    month,
    season: null,
    suitabilityStatus: "needs-evidence",
    weatherRisks: [],
    transportRisks: [],
    closureRisks: [],
    recommendedBufferMinutes: null,
    sourceRefs: [],
    confidence: null,
    freshnessStatus: "unknown",
    retrievedAt: null,
    expiresAt: null,
    unknowns: [{ field: "seasonality", reason: "No reusable city-month evidence source has been collected." }],
    conflicts: [],
    diagnostics: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { now });
  const validation = validateSeasonEvidence(record);
  return validation.accepted
    ? { created: true, record: validation.record }
    : { created: false, reason: "season-evidence-invalid", reasons: validation.reasons };
}
