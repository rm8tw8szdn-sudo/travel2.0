import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const MISSING_EVIDENCE_MANIFEST_SCHEMA_VERSION = "route-generation-v2-evidence-3a2-missing-v1";
export const MISSING_EVIDENCE_TYPES = new Set(["route-leg", "season"]);
export const MISSING_EVIDENCE_STATUSES = new Set([
  "pending",
  "queued",
  "collecting",
  "resolved",
  "needs-review",
  "failed",
]);

function clean(value) {
  return cleanString(value);
}

function normalizeDiagnostic(entry = {}) {
  return {
    code: clean(entry.code || entry.type),
    message: clean(entry.message || entry.reason || entry.error),
  };
}

export function createMissingEvidenceId(input = {}) {
  return `me-${stableHash({
    evidenceType: clean(input.evidenceType),
    targetKey: clean(input.targetKey),
    schemaVersion: MISSING_EVIDENCE_MANIFEST_SCHEMA_VERSION,
  }).slice(0, 20)}`;
}

export function computeMissingEvidencePriority(input = {}) {
  const requests = uniqueStrings(Array.isArray(input.requestedByBundleIds) ? input.requestedByBundleIds : []);
  const base = clean(input.evidenceType) === "route-leg" ? 50 : 40;
  const selectedCandidateBonus = input.selectedCandidate === true ? 10 : 0;
  const criticalBonus = input.critical === true ? 20 : 0;
  const reuseBonus = Math.min(20, Math.max(0, requests.length - 1) * 5);
  return Math.min(100, base + selectedCandidateBonus + criticalBonus + reuseBonus);
}

export function normalizeMissingEvidenceManifestItem(input = {}, { now = () => new Date().toISOString() } = {}) {
  const timestamp = clean(input.updatedAt || input.lastSeenAt || input.createdAt || input.firstSeenAt) || now();
  const requestedByBundleIds = uniqueStrings(Array.isArray(input.requestedByBundleIds) ? input.requestedByBundleIds : []);
  const priority = Number(input.priority);
  const attemptCount = Number(input.attemptCount);
  const normalized = {
    missingEvidenceId: clean(input.missingEvidenceId),
    schemaVersion: clean(input.schemaVersion || MISSING_EVIDENCE_MANIFEST_SCHEMA_VERSION),
    evidenceType: clean(input.evidenceType),
    targetKey: clean(input.targetKey),
    legEvidenceId: clean(input.legEvidenceId) || null,
    seasonEvidenceId: clean(input.seasonEvidenceId) || null,
    priority: Number.isInteger(priority) && priority >= 0 && priority <= 100
      ? priority
      : computeMissingEvidencePriority({ ...input, requestedByBundleIds }),
    reason: clean(input.reason || "Reusable evidence has not been collected."),
    requestedByBundleIds,
    firstSeenAt: clean(input.firstSeenAt || input.createdAt) || timestamp,
    lastSeenAt: clean(input.lastSeenAt || input.updatedAt) || timestamp,
    attemptCount: Number.isInteger(attemptCount) && attemptCount >= 0 ? attemptCount : 0,
    status: clean(input.status || "pending"),
    diagnostics: (Array.isArray(input.diagnostics) ? input.diagnostics : []).map(normalizeDiagnostic),
    createdAt: clean(input.createdAt || input.firstSeenAt) || timestamp,
    updatedAt: clean(input.updatedAt || input.lastSeenAt) || timestamp,
  };
  normalized.missingEvidenceId = normalized.missingEvidenceId || createMissingEvidenceId(normalized);
  return normalized;
}

export function validateMissingEvidenceManifestItem(input = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, reasons: ["missing-evidence-not-object"] };
  }
  const record = normalizeMissingEvidenceManifestItem(input, {
    now: () => clean(input.updatedAt || input.lastSeenAt || input.createdAt || input.firstSeenAt) || "1970-01-01T00:00:00.000Z",
  });
  for (const field of [
    "missingEvidenceId",
    "schemaVersion",
    "evidenceType",
    "targetKey",
    "priority",
    "reason",
    "firstSeenAt",
    "lastSeenAt",
    "attemptCount",
    "status",
    "createdAt",
    "updatedAt",
  ]) {
    if (input[field] == null || input[field] === "") reasons.push(`${field}-required`);
  }
  if (record.schemaVersion !== MISSING_EVIDENCE_MANIFEST_SCHEMA_VERSION) reasons.push("schemaVersion-unsupported");
  if (!MISSING_EVIDENCE_TYPES.has(record.evidenceType)) reasons.push("evidenceType-invalid");
  if (record.missingEvidenceId !== createMissingEvidenceId(record)) reasons.push("missingEvidenceId-mismatch");
  if (!Number.isInteger(record.priority) || record.priority < 0 || record.priority > 100) reasons.push("priority-invalid");
  if (!Number.isInteger(record.attemptCount) || record.attemptCount < 0) reasons.push("attemptCount-invalid");
  if (!MISSING_EVIDENCE_STATUSES.has(record.status)) reasons.push("status-invalid");
  if (!Array.isArray(input.requestedByBundleIds) || record.requestedByBundleIds.length === 0) reasons.push("requestedByBundleIds-required");
  if (!Array.isArray(input.diagnostics)) reasons.push("diagnostics-array-required");
  if (record.evidenceType === "route-leg") {
    if (!record.legEvidenceId) reasons.push("legEvidenceId-required");
    if (record.seasonEvidenceId) reasons.push("seasonEvidenceId-not-allowed-for-route-leg");
  }
  if (record.evidenceType === "season") {
    if (!record.seasonEvidenceId) reasons.push("seasonEvidenceId-required");
    if (record.legEvidenceId) reasons.push("legEvidenceId-not-allowed-for-season");
  }
  return { accepted: reasons.length === 0, reasons, record: structuredClone(record) };
}

export function buildMissingEvidenceManifestItem(input = {}, { now = () => new Date().toISOString() } = {}) {
  const evidenceType = clean(input.evidenceType);
  const targetKey = clean(input.targetKey);
  const requestedByBundleIds = uniqueStrings(Array.isArray(input.requestedByBundleIds) ? input.requestedByBundleIds : []);
  if (!MISSING_EVIDENCE_TYPES.has(evidenceType)) return { created: false, reason: "missing-evidence-type-invalid" };
  if (!targetKey) return { created: false, reason: "missing-evidence-targetKey-required" };
  if (requestedByBundleIds.length === 0) return { created: false, reason: "missing-evidence-bundle-reference-required" };
  const timestamp = now();
  const record = normalizeMissingEvidenceManifestItem({
    schemaVersion: MISSING_EVIDENCE_MANIFEST_SCHEMA_VERSION,
    evidenceType,
    targetKey,
    legEvidenceId: evidenceType === "route-leg" ? clean(input.legEvidenceId) : null,
    seasonEvidenceId: evidenceType === "season" ? clean(input.seasonEvidenceId) : null,
    priority: computeMissingEvidencePriority({ ...input, evidenceType, requestedByBundleIds }),
    reason: clean(input.reason || "Reusable evidence has not been collected."),
    requestedByBundleIds,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    attemptCount: 0,
    status: "pending",
    diagnostics: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { now });
  const validation = validateMissingEvidenceManifestItem(record);
  return validation.accepted
    ? { created: true, record: validation.record }
    : { created: false, reason: "missing-evidence-invalid", reasons: validation.reasons };
}
