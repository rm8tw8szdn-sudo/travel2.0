import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const EVIDENCE_BUNDLE_SCHEMA_VERSION = "route-generation-v2-phase3a-evidence-bundle-v1";
export const EVIDENCE_BUNDLE_STATUSES = new Set(["verified", "weak_signal", "unknown", "failed"]);
export const EVIDENCE_BUNDLE_ITEM_STATUSES = new Set(["verified", "weak_signal"]);

const FORBIDDEN_FINAL_ROUTE_FIELDS = new Set([
  "title",
  "canonicalTitle",
  "summary",
  "plannerReason",
  "recommendationText",
  "coverUrl",
  "routeId",
  "acceptedAt",
  "contentQualityStatus",
]);
const ALLOWED_SUMMARY_KEYS = new Set([
  "verified",
  "weak_signal",
  "unknown",
  "failed",
  "totalItems",
  "totalUnknowns",
  "totalFailures",
  "total",
]);

function cloneObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeNullableString(value) {
  const text = cleanString(value);
  return text || null;
}

function numericConfidence(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function itemIdSeed(item = {}) {
  return {
    status: item.status,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    evidenceCategory: item.evidenceCategory,
    extractedFacts: item.extractedFacts || {},
    supportsWhichDecision: item.supportsWhichDecision || [],
    confidence: item.confidence,
    freshness: item.freshness,
    matchMethod: item.matchMethod,
    failureReason: item.failureReason,
    unknownReason: item.unknownReason,
  };
}

export function createEvidenceItemId({ candidateId = "", intentId = "", item = {}, index = 0 } = {}) {
  const hash = stableHash({
    candidateId: cleanString(candidateId),
    intentId: cleanString(intentId),
    index: Number(index) || 0,
    item: itemIdSeed(item),
    version: EVIDENCE_BUNDLE_SCHEMA_VERSION,
  }).slice(0, 20);
  return `ebi-${hash}`;
}

function normalizeEvidenceItem(item = {}, { candidateId = "", intentId = "", index = 0 } = {}) {
  const status = cleanString(item.status || "unknown");
  const normalized = {
    evidenceItemId: "",
    status,
    sourceType: cleanString(item.sourceType),
    sourceId: normalizeNullableString(item.sourceId),
    sourceUrl: normalizeNullableString(item.sourceUrl),
    evidenceCategory: cleanString(item.evidenceCategory),
    extractedFacts: cloneObject(item.extractedFacts),
    supportsWhichDecision: uniqueStrings(Array.isArray(item.supportsWhichDecision) ? item.supportsWhichDecision : [item.supportsWhichDecision]),
    confidence: numericConfidence(item.confidence),
    freshness: normalizeNullableString(item.freshness),
    matchMethod: normalizeNullableString(item.matchMethod),
    failureReason: normalizeNullableString(item.failureReason),
    unknownReason: normalizeNullableString(item.unknownReason),
  };
  normalized.evidenceItemId = normalized.evidenceItemId || createEvidenceItemId({
    candidateId,
    intentId,
    item: normalized,
    index,
  });
  return normalized;
}

function normalizeReasonRecord(record = {}, status) {
  return {
    status,
    field: cleanString(record.field || record.evidenceCategory || record.supportsWhichDecision),
    reason: cleanString(record.reason || record.failureReason || record.unknownReason),
    sourceType: normalizeNullableString(record.sourceType),
    evidenceCategory: normalizeNullableString(record.evidenceCategory),
    supportsWhichDecision: normalizeNullableString(record.supportsWhichDecision),
  };
}

export function summarizeEvidenceBundle({ items = [], unknowns = [], failures = [] } = {}) {
  const summary = {
    verified: 0,
    weak_signal: 0,
    unknown: 0,
    failed: 0,
    totalItems: Array.isArray(items) ? items.length : 0,
    totalUnknowns: Array.isArray(unknowns) ? unknowns.length : 0,
    totalFailures: Array.isArray(failures) ? failures.length : 0,
  };
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.status === "verified" || item?.status === "weak_signal") summary[item.status] += 1;
  }
  summary.unknown = summary.totalUnknowns;
  summary.failed = summary.totalFailures;
  summary.total = summary.verified + summary.weak_signal + summary.unknown + summary.failed;
  return summary;
}

function bundleIdSeed(bundle = {}) {
  return {
    candidateId: bundle.candidateId,
    intentId: bundle.intentId,
    generationSource: bundle.generationSource,
    items: (bundle.items || []).map(itemIdSeed),
    unknowns: bundle.unknowns || [],
    failures: bundle.failures || [],
    schemaVersion: bundle.schemaVersion || EVIDENCE_BUNDLE_SCHEMA_VERSION,
  };
}

export function createEvidenceBundleId(input = {}) {
  const normalizedItems = Array.isArray(input.items)
    ? input.items.map((item, index) => normalizeEvidenceItem(item, {
      candidateId: input.candidateId,
      intentId: input.intentId,
      index,
    }))
    : [];
  const normalized = {
    candidateId: cleanString(input.candidateId),
    intentId: cleanString(input.intentId),
    generationSource: cleanString(input.generationSource),
    items: normalizedItems,
    unknowns: Array.isArray(input.unknowns) ? input.unknowns.map((item) => normalizeReasonRecord(item, "unknown")) : [],
    failures: Array.isArray(input.failures) ? input.failures.map((item) => normalizeReasonRecord(item, "failed")) : [],
    schemaVersion: cleanString(input.schemaVersion || EVIDENCE_BUNDLE_SCHEMA_VERSION),
  };
  return `eb-${stableHash(bundleIdSeed(normalized)).slice(0, 20)}`;
}

export function normalizeEvidenceBundle(input = {}, { now = () => new Date().toISOString() } = {}) {
  const candidateId = cleanString(input.candidateId);
  const intentId = cleanString(input.intentId);
  const items = Array.isArray(input.items)
    ? input.items.map((item, index) => normalizeEvidenceItem(item, { candidateId, intentId, index }))
    : [];
  const unknowns = Array.isArray(input.unknowns) ? input.unknowns.map((item) => normalizeReasonRecord(item, "unknown")) : [];
  const failures = Array.isArray(input.failures) ? input.failures.map((item) => normalizeReasonRecord(item, "failed")) : [];
  const seed = {
    schemaVersion: cleanString(input.schemaVersion || EVIDENCE_BUNDLE_SCHEMA_VERSION),
    candidateId,
    intentId,
    generationSource: cleanString(input.generationSource),
    items,
    unknowns,
    failures,
  };
  const evidenceBundleId = cleanString(input.evidenceBundleId) || createEvidenceBundleId(seed);
  return {
    schemaVersion: seed.schemaVersion,
    evidenceBundleId,
    candidateId,
    intentId,
    generationSource: seed.generationSource,
    createdAt: cleanString(input.createdAt) || now(),
    items,
    unknowns,
    failures,
    summary: summarizeEvidenceBundle({ items, unknowns, failures }),
  };
}

function collectForbiddenFinalFields(value, path, reasons) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenFinalFields(item, `${path}[${index}]`, reasons));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (path === "$" && key === "summary" && child && typeof child === "object" && !Array.isArray(child)) {
      continue;
    }
    if (FORBIDDEN_FINAL_ROUTE_FIELDS.has(key)) {
      reasons.push(`forbidden-final-route-field:${path}.${key}`);
      continue;
    }
    collectForbiddenFinalFields(child, `${path}.${key}`, reasons);
  }
}

function hasObjectFacts(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

export function validateEvidenceBundle(input = {}) {
  const reasons = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, reasons: ["evidence-bundle-not-object"] };
  }
  if (input.summary != null && (typeof input.summary !== "object" || Array.isArray(input.summary))) {
    reasons.push("forbidden-final-route-field:$.summary");
  }
  if (input.summary && typeof input.summary === "object" && !Array.isArray(input.summary)) {
    for (const key of Object.keys(input.summary)) {
      if (!ALLOWED_SUMMARY_KEYS.has(key)) reasons.push(`summary-unsupported-key:${key}`);
    }
  }
  collectForbiddenFinalFields(input, "$", reasons);

  const bundle = normalizeEvidenceBundle(input, { now: () => cleanString(input.createdAt) || "1970-01-01T00:00:00.000Z" });
  const expectedId = createEvidenceBundleId(bundle);

  if (bundle.schemaVersion !== EVIDENCE_BUNDLE_SCHEMA_VERSION) reasons.push("schemaVersion-unsupported");
  if (!bundle.evidenceBundleId) reasons.push("evidenceBundleId-required");
  if (cleanString(input.evidenceBundleId) && cleanString(input.evidenceBundleId) !== expectedId) reasons.push("evidenceBundleId-mismatch");
  if (!bundle.candidateId) reasons.push("candidateId-required");
  if (!bundle.intentId) reasons.push("intentId-required");
  if (!bundle.generationSource) reasons.push("generationSource-required");
  if (!bundle.createdAt) reasons.push("createdAt-required");
  if (!Array.isArray(input.items)) reasons.push("items-array-required");
  if (!Array.isArray(input.unknowns)) reasons.push("unknowns-array-required");
  if (!Array.isArray(input.failures)) reasons.push("failures-array-required");

  for (const [index, item] of bundle.items.entries()) {
    if (!item.evidenceItemId) reasons.push(`item-${index}:evidenceItemId-required`);
    if (!EVIDENCE_BUNDLE_STATUSES.has(item.status)) reasons.push(`item-${index}:status-invalid`);
    else if (!EVIDENCE_BUNDLE_ITEM_STATUSES.has(item.status)) reasons.push(`item-${index}:item-status-must-be-verified-or-weak_signal`);
    if (!item.evidenceCategory) reasons.push(`item-${index}:evidenceCategory-required`);
    if (!item.supportsWhichDecision.length) reasons.push(`item-${index}:supportsWhichDecision-required`);
    if ((item.status === "verified" || item.status === "weak_signal") && !item.sourceType) reasons.push(`item-${index}:sourceType-required`);
    if (item.status === "verified" && !hasObjectFacts(item.extractedFacts)) reasons.push(`item-${index}:verified-extractedFacts-required`);
    if (item.confidence != null && (item.confidence < 0 || item.confidence > 1)) reasons.push(`item-${index}:confidence-out-of-range`);
  }
  for (const [index, unknown] of bundle.unknowns.entries()) {
    if (!unknown.field) reasons.push(`unknown-${index}:field-required`);
    if (!unknown.reason) reasons.push(`unknown-${index}:reason-required`);
  }
  for (const [index, failure] of bundle.failures.entries()) {
    if (!failure.field) reasons.push(`failure-${index}:field-required`);
    if (!failure.reason) reasons.push(`failure-${index}:reason-required`);
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    bundle,
    expectedEvidenceBundleId: expectedId,
  };
}
