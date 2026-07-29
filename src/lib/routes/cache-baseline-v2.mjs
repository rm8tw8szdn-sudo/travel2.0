import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  createRouteIntentFingerprint,
  validateNormalizedRouteIntent,
} from "./route-intent-model.mjs";
import { validateEmbeddedRouteIntent } from "./route-intent-invariant-gate.mjs";
import { validateRouteCandidate } from "./route-candidate-pool.mjs";
import { validateDecisionTrace } from "./decision-trace-schema.mjs";
import { validateEvidenceBundleLifecycle } from "./evidence-bundle-schema.mjs";
import { validateRouteV2RuntimeMetrics } from "./route-v2-runtime-metrics.mjs";

export const CACHE_BASELINE_SCHEMA_VERSION = "cache-manifest-v2";
export const CACHE_BASELINE_GENERATOR = Object.freeze({
  name: "audit-route-v2-cache-baseline-v2",
  version: 1,
});
export const HISTORICAL_CACHE_HASH = "056d3af349b05cc7ae59620c23be26e11e91dd1d0c37a8bf2b153362834568cb";
export const ACCEPTED_REPOSITORY_SHA256 = "aea28bcc03eaf6ccce5fd7453f88ece4f0060789f135eaf837b568d9c43e7e3f";

const MAX_BYTES = Object.freeze({
  acceptedRepository: 96 * 1024 * 1024,
  acceptedBackup: 96 * 1024 * 1024,
  routeEvidence: 24 * 1024 * 1024,
  runtimeJson: 24 * 1024 * 1024,
  runtimeJsonl: 24 * 1024 * 1024,
  runtimeLog: 16 * 1024 * 1024,
  runtimeMetrics: 1024 * 1024,
  proxiedImage: 8 * 1024 * 1024,
  proxiedImageMetadata: 256 * 1024,
});

const IMMUTABLE_CACHE_FILES = Object.freeze([
  "route-evidence.json",
]);

const EXTERNAL_FORMAL_FILES = Object.freeze([
  "accepted-routes.json",
]);

const REQUIRED_RUNTIME_STATE = Object.freeze({
  "provider-sync-state.json": "provider-sync-state-json",
  "knowledge-graph-pool.json": "knowledge-graph-pool-json",
  "search-analytics.jsonl": "search-analytics-jsonl",
  "search-cache.json": "search-cache-json",
  "search-review-candidates.json": "search-review-candidates-json",
});

const FORBIDDEN_PATH_PATTERNS = Object.freeze([
  { code: "absolute-windows-user-path", pattern: /[A-Za-z]:[\\/](?:Users|Documents|Temp)[\\/]/iu },
  { code: "absolute-posix-temp-path", pattern: /(?:^|[\s"'=])\/(?:tmp|var\/tmp)\//iu },
  { code: "browser-profile-path", pattern: /(?:browser|chrome|playwright)[-_ /\\]?profile/iu },
]);

const SENSITIVE_VALUE_PATTERN = /"(?:api[_-]?key|access[_-]?token|authorization|password|secret)"\s*:\s*"(?!\s*")[^"]+"/iu;

function clean(value) {
  return String(value || "").trim();
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeRelativePath(root, absolutePath) {
  const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
  if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
    throw new Error(`cache-path-outside-root:${relativePath || absolutePath}`);
  }
  return relativePath;
}

function listFiles(root, { enumerationOrder = "normal" } = {}) {
  const files = [];
  const walk = (directory) => {
    let entries = fs.readdirSync(directory, { withFileTypes: true });
    if (enumerationOrder === "reverse") entries = entries.reverse();
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
      else throw new Error(`unsupported-cache-entry:${normalizeRelativePath(root, absolutePath)}`);
    }
  };
  walk(root);
  return files;
}

function readBytes(filePath, maximum, errors, relativePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > maximum) errors.push(`${relativePath}:size-limit-exceeded:${stat.size}:${maximum}`);
  return fs.readFileSync(filePath);
}

function decodeUtf8(buffer) {
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseJson(buffer, relativePath, errors) {
  try {
    return JSON.parse(decodeUtf8(buffer));
  } catch (error) {
    errors.push(`${relativePath}:invalid-json:${clean(error?.message)}`);
    return null;
  }
}

function parseJsonl(buffer, relativePath, errors) {
  const text = decodeUtf8(buffer);
  const records = [];
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    try {
      const record = JSON.parse(lines[index]);
      if (!plainObject(record)) errors.push(`${relativePath}:jsonl-line-not-object:${index + 1}`);
      else records.push(record);
    } catch (error) {
      errors.push(`${relativePath}:invalid-jsonl:${index + 1}:${clean(error?.message)}`);
    }
  }
  return records;
}

function validateNoSensitiveContent(buffer, relativePath, errors) {
  const text = decodeUtf8(buffer);
  for (const { code, pattern } of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(text)) errors.push(`${relativePath}:${code}`);
  }
  if (SENSITIVE_VALUE_PATTERN.test(text)) errors.push(`${relativePath}:possible-sensitive-value`);
}

function nonNegativeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validIsoDate(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function appendIntentSchemaErrors(errors, relativePath, recordLabel, validation) {
  for (const violation of validation?.violations || []) {
    const reasonCode = clean(violation.code) === "route-intent-semantic-invalid"
      ? "route-intent-semantic-invalid"
      : "route-intent-schema-invalid";
    errors.push([
      relativePath,
      recordLabel,
      reasonCode,
      clean(violation.path || violation.field || "$"),
    ].join(":"));
  }
}

function validateCanonicalRouteIntent(intent, relativePath, recordLabel, errors) {
  const validation = validateNormalizedRouteIntent(intent);
  if (!validation.valid) appendIntentSchemaErrors(errors, relativePath, recordLabel, validation);
  return validation;
}

function validateEmbeddedIntentRecord(record, relativePath, recordLabel, errors, { allowLegacyUnbound = true } = {}) {
  const validation = validateEmbeddedRouteIntent(record, {
    source: "cache-baseline-v2",
    allowLegacyUnbound,
  });
  if (!validation.matched) {
    const violations = validation.violations || [];
    if (violations.length) {
      for (const violation of violations) {
        errors.push([
          relativePath,
          recordLabel,
          clean(violation.code || validation.reasonCodes?.[0] || "route-intent-invalid"),
          clean(violation.path || violation.field || "$"),
        ].join(":"));
      }
    } else {
      errors.push(`${relativePath}:${recordLabel}:${clean(validation.reasonCodes?.[0] || "route-intent-invalid")}:$`);
    }
  }
  return validation;
}

function validateProviderSyncState(payload, relativePath, errors) {
  if (!plainObject(payload) || Number(payload.schemaVersion) !== 1 || !plainObject(payload.providers)) {
    errors.push(`${relativePath}:invalid-provider-sync-root`);
    return;
  }
  for (const [providerId, provider] of Object.entries(payload.providers)) {
    if (!providerId || !plainObject(provider) || clean(provider.providerId) !== providerId) {
      errors.push(`${relativePath}:invalid-provider:${providerId || "empty"}`);
      continue;
    }
    for (const key of ["scannedCount", "candidateCount", "acceptedCount", "rejectedCount", "deferredCount", "failedCount", "retryAfter"]) {
      if (provider[key] != null && !nonNegativeNumber(provider[key])) errors.push(`${relativePath}:invalid-provider-counter:${providerId}:${key}`);
    }
    if (provider.updatedAt && !validIsoDate(provider.updatedAt)) errors.push(`${relativePath}:invalid-provider-date:${providerId}:updatedAt`);
  }
}

function validateKnowledgeGraphPool(payload, relativePath, errors) {
  if (!plainObject(payload)) {
    errors.push(`${relativePath}:invalid-knowledge-graph-root`);
    return;
  }
  for (const [countryCode, records] of Object.entries(payload)) {
    if (!/^[A-Z]{2}$/u.test(countryCode) || !Array.isArray(records)) {
      errors.push(`${relativePath}:invalid-knowledge-graph-country:${countryCode}`);
      continue;
    }
    const identities = new Set();
    for (const [index, record] of records.entries()) {
      const identity = clean(record?.wikidataId || record?.entityId || record?.sourceTitle || record?.name);
      if (!plainObject(record) || !identity || clean(record.countryCode) !== countryCode || !clean(record.name || record.sourceTitle)) {
        errors.push(`${relativePath}:invalid-knowledge-graph-record:${countryCode}:${index}`);
        continue;
      }
      if (identities.has(identity)) errors.push(`${relativePath}:duplicate-knowledge-graph-record:${countryCode}:${identity}`);
      identities.add(identity);
      const latitude = Number(record.latitude);
      const longitude = Number(record.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        errors.push(`${relativePath}:invalid-knowledge-graph-coordinate:${countryCode}:${identity}`);
      }
    }
  }
}

function validateSearchAnalytics(records, relativePath, errors) {
  const allowedTypes = new Set(["search", "detail-click"]);
  for (const [index, record] of records.entries()) {
    if (Number(record.schemaVersion) !== 1 || !allowedTypes.has(clean(record.type)) || !validIsoDate(record.timestamp)) {
      errors.push(`${relativePath}:invalid-search-analytics-record:${index + 1}`);
    }
  }
}

function validateSearchCache(payload, relativePath, errors) {
  if (!plainObject(payload) || Number(payload.schemaVersion) !== 2 || !plainObject(payload.items)) {
    errors.push(`${relativePath}:invalid-search-cache-root`);
    return;
  }
  for (const [itemIndex, [fingerprint, item]] of Object.entries(payload.items).entries()) {
    if (!fingerprint || !plainObject(item) || !Array.isArray(item.records) || !plainObject(item.normalizedIntent)) {
      errors.push(`${relativePath}:invalid-search-cache-item:${itemIndex}`);
      continue;
    }
    if (item.expiresAt && !validIsoDate(item.expiresAt)) errors.push(`${relativePath}:invalid-search-cache-expiry:${itemIndex}`);
    if (item.records.some((record) => !plainObject(record) || !clean(record.id))) {
      errors.push(`${relativePath}:invalid-search-cache-route:${itemIndex}`);
    }
    const claimed = item.normalizedIntent.schemaVersion != null
      || item.routeIntentFingerprint != null
      || item.routeIntentFingerprintVersion != null;
    if (!claimed) continue;
    const schemaValidation = validateCanonicalRouteIntent(
      item.normalizedIntent,
      relativePath,
      `item-${itemIndex}.normalizedIntent`,
      errors,
    );
    if (clean(item.routeIntentFingerprintVersion) !== ROUTE_INTENT_FINGERPRINT_VERSION) {
      errors.push(`${relativePath}:item-${itemIndex}:route-intent-fingerprint-version-invalid`);
    }
    if (schemaValidation.valid) {
      const recomputed = createRouteIntentFingerprint(item.normalizedIntent);
      if (clean(item.routeIntentFingerprint) !== recomputed.value || fingerprint !== recomputed.value) {
        errors.push(`${relativePath}:item-${itemIndex}:route-intent-fingerprint-mismatch`);
      }
    }
    for (const [recordIndex, record] of item.records.entries()) {
      const embedded = validateEmbeddedIntentRecord(
        record,
        relativePath,
        `item-${itemIndex}.records[${recordIndex}]`,
        errors,
        { allowLegacyUnbound: false },
      );
      if (embedded.matched && clean(embedded.fingerprint) !== clean(item.routeIntentFingerprint)) {
        errors.push(`${relativePath}:item-${itemIndex}.records[${recordIndex}]:route-intent-fingerprint-mismatch`);
      }
    }
  }
}

function validateSearchReviewCandidates(payload, relativePath, errors) {
  if (!plainObject(payload) || Number(payload.schemaVersion) !== 1 || !Array.isArray(payload.candidates)) {
    errors.push(`${relativePath}:invalid-search-review-root`);
    return;
  }
  for (const [index, candidate] of payload.candidates.entries()) {
    if (!plainObject(candidate)
      || !clean(candidate.routeId)
      || !clean(candidate.status)
      || !plainObject(candidate.record)
      || clean(candidate.record.id) !== clean(candidate.routeId)) {
      errors.push(`${relativePath}:invalid-search-review-candidate:${index}`);
      continue;
    }
    const claimed = candidate.normalizedIntent?.schemaVersion != null
      || candidate.routeIntentFingerprint != null
      || candidate.routeIntentFingerprintVersion != null;
    if (!claimed) continue;
    const schemaValidation = validateCanonicalRouteIntent(
      candidate.normalizedIntent,
      relativePath,
      `candidate-${index}.normalizedIntent`,
      errors,
    );
    if (clean(candidate.routeIntentFingerprintVersion) !== ROUTE_INTENT_FINGERPRINT_VERSION) {
      errors.push(`${relativePath}:candidate-${index}:route-intent-fingerprint-version-invalid`);
    }
    if (schemaValidation.valid) {
      const recomputed = createRouteIntentFingerprint(candidate.normalizedIntent);
      if (clean(candidate.routeIntentFingerprint) !== recomputed.value) {
        errors.push(`${relativePath}:candidate-${index}:route-intent-fingerprint-mismatch`);
      }
    }
    const embedded = validateEmbeddedIntentRecord(
      candidate.record,
      relativePath,
      `candidate-${index}.record`,
      errors,
      { allowLegacyUnbound: false },
    );
    if (embedded.matched && clean(embedded.fingerprint) !== clean(candidate.routeIntentFingerprint)) {
      errors.push(`${relativePath}:candidate-${index}.record:route-intent-fingerprint-mismatch`);
    }
  }
}

function validateAcceptedRepository(payload, relativePath, errors) {
  if (!plainObject(payload) || !Array.isArray(payload.records) || !clean(payload.schemaVersion)) {
    errors.push(`${relativePath}:invalid-accepted-repository-root`);
    return { routeIds: new Set() };
  }
  const routeIds = new Set();
  for (const [index, record] of payload.records.entries()) {
    const routeId = clean(record?.id);
    if (!plainObject(record) || !routeId) {
      errors.push(`${relativePath}:invalid-accepted-route:${index}`);
      continue;
    }
    if (routeIds.has(routeId)) errors.push(`${relativePath}:duplicate-accepted-route:${routeId}`);
    routeIds.add(routeId);
    validateEmbeddedIntentRecord(
      record,
      relativePath,
      `record-${index}`,
      errors,
      { allowLegacyUnbound: true },
    );
  }
  return { routeIds };
}

function validateRouteEvidence(payload, relativePath, errors, { acceptedRouteIds = new Set() } = {}) {
  if (!plainObject(payload) || Number(payload.schemaVersion) !== 2 || !Array.isArray(payload.evidence)) {
    errors.push(`${relativePath}:invalid-route-evidence-root`);
    return { evidenceCount: 0, externalSourceRouteReferences: [] };
  }
  const evidenceIds = new Set();
  const externalSourceRouteReferences = new Set();
  for (const [index, evidence] of payload.evidence.entries()) {
    const evidenceId = clean(evidence?.evidenceId || evidence?.id);
    const kind = clean(evidence?.kind || evidence?.evidenceType);
    if (!plainObject(evidence) || !evidenceId || !kind) {
      errors.push(`${relativePath}:invalid-route-evidence:${index}`);
      continue;
    }
    if (evidenceIds.has(evidenceId)) errors.push(`${relativePath}:duplicate-route-evidence:${evidenceId}`);
    evidenceIds.add(evidenceId);
    const sourceRouteId = clean(evidence.sourceRouteId);
    if (sourceRouteId && !/^[^\s\x00-\x1f]+$/u.test(sourceRouteId)) {
      errors.push(`${relativePath}:invalid-source-route-id:${index}`);
    } else if (sourceRouteId && acceptedRouteIds.size && !acceptedRouteIds.has(sourceRouteId)) {
      externalSourceRouteReferences.add(sourceRouteId);
    }
    const sourceUrl = clean(evidence.sourceUrl || evidence.provenance?.sourceUrl);
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (!["http:", "https:"].includes(url.protocol)) errors.push(`${relativePath}:invalid-source-url-protocol:${index}`);
      } catch {
        errors.push(`${relativePath}:invalid-source-url:${index}`);
      }
    }
  }
  return {
    evidenceCount: payload.evidence.length,
    externalSourceRouteReferences: [...externalSourceRouteReferences].sort(),
  };
}

function validateFeedResponse(payload, relativePath, errors) {
  if (!plainObject(payload) || payload.ok !== true || !Array.isArray(payload.records) || typeof payload.hasMore !== "boolean") {
    errors.push(`${relativePath}:invalid-feed-response`);
  }
}

function validateDestinationImages(payload, relativePath, errors) {
  if (!plainObject(payload) || Number(payload.schemaVersion) !== 1 || !Array.isArray(payload.records)) {
    errors.push(`${relativePath}:invalid-destination-images`);
  }
}

function validateRouteImageCache(payload, relativePath, errors) {
  if (!plainObject(payload)) errors.push(`${relativePath}:invalid-route-image-cache`);
}

function validateCandidateJsonl(records, relativePath, errors) {
  const identities = new Set();
  for (const [index, record] of records.entries()) {
    const identity = clean(record.candidateId || record.id);
    if (!identity) errors.push(`${relativePath}:invalid-candidate-record:${index + 1}`);
    else if (identities.has(identity)) errors.push(`${relativePath}:duplicate-candidate-record:${identity}`);
    else identities.add(identity);
    const validation = validateRouteCandidate(record);
    if (!validation.accepted) {
      for (const reason of validation.reasons) {
        const [code, ...pathParts] = reason.split(":");
        const fieldPath = pathParts.join(":");
        errors.push(`${relativePath}:record-${index}:candidate-invalid:${code}${fieldPath ? `:${fieldPath}` : ""}`);
      }
    }
  }
}

function validateSidecarJsonl(records, relativePath, errors) {
  for (const [index, record] of records.entries()) {
    let validation;
    try {
      validation = relativePath === "decision-traces.jsonl"
        ? validateDecisionTrace(record)
        : relativePath === "route-evidence-bundles.jsonl"
          ? validateEvidenceBundleLifecycle(record)
          : { accepted: true, reasons: [] };
    } catch {
      validation = { accepted: false, reasons: ["sidecar-schema-validation-failed"] };
    }
    if (!validation.accepted) {
      for (const reason of validation.reasons || validation.missing || []) {
        errors.push(`${relativePath}:record-${index}:sidecar-invalid:${clean(reason)}`);
      }
    }
  }
}

function readRuntimeJsonlRecords(entry, errors) {
  if (!entry) return [];
  const buffer = readBytes(entry.absolutePath, MAX_BYTES.runtimeJsonl, errors, entry.path);
  return parseJsonl(buffer, entry.path, errors);
}

function readJsonEntry(entry, errors) {
  if (!entry) return null;
  const maximum = entry.structureType === "accepted-repository-json"
    ? MAX_BYTES.acceptedRepository
    : entry.structureType === "accepted-repository-backup-json"
      ? MAX_BYTES.acceptedBackup
      : MAX_BYTES.runtimeJson;
  return parseJson(readBytes(entry.absolutePath, maximum, errors, entry.path), entry.path, errors);
}

function associationError(errors, relativePath, index, reasonCode, fieldPath) {
  errors.push(`${relativePath}:record-${index}:${reasonCode}:${fieldPath}`);
}

function indexRecords(records, identityField, relativePath, errors) {
  const index = new Map();
  for (const [recordIndex, record] of records.entries()) {
    const identity = clean(record?.[identityField]);
    if (!identity) continue;
    if (index.has(identity)) {
      associationError(errors, relativePath, recordIndex, "association-duplicate-identity", identityField);
      continue;
    }
    index.set(identity, { record, recordIndex });
  }
  return index;
}

function routeRecordsFromEntry(entry, errors) {
  const payload = readJsonEntry(entry, errors);
  if (!plainObject(payload)) return [];
  if (entry.structureType === "search-cache-json") {
    return Object.values(plainObject(payload.items) ? payload.items : {})
      .flatMap((item) => (Array.isArray(item?.records) ? item.records : []));
  }
  if (entry.structureType === "ready-pool-json") {
    return (Array.isArray(payload.records) ? payload.records : [])
      .map((item) => item?.routeRecord)
      .filter(plainObject);
  }
  if (entry.structureType === "search-review-candidates-json") {
    return (Array.isArray(payload.candidates) ? payload.candidates : [])
      .map((item) => item?.routeRecord || item?.record || item)
      .filter(plainObject);
  }
  if (entry.structureType === "feed-response-json"
    || entry.structureType === "accepted-repository-json") {
    return (Array.isArray(payload.records) ? payload.records : []).filter(plainObject);
  }
  return [];
}

function routeRecordIndex(entries, errors) {
  const index = new Map();
  let recordCount = 0;
  for (const entry of entries) {
    if (!new Set([
      "search-cache-json",
      "ready-pool-json",
      "search-review-candidates-json",
      "feed-response-json",
      "accepted-repository-json",
    ]).has(entry.structureType)) continue;
    for (const [recordIndex, record] of routeRecordsFromEntry(entry, errors).entries()) {
      const routeRecordId = clean(record?.id || record?.routeRecordId);
      if (!routeRecordId) continue;
      if (!index.has(routeRecordId)) index.set(routeRecordId, []);
      index.get(routeRecordId).push({ record, recordIndex, relativePath: entry.path });
      recordCount += 1;
    }
  }
  return { index, recordCount };
}

function sameIntentContent(left, right) {
  if (!plainObject(left) || !plainObject(right)) return false;
  const leftValidation = validateNormalizedRouteIntent(left);
  const rightValidation = validateNormalizedRouteIntent(right);
  if (!leftValidation.valid || !rightValidation.valid) return false;
  return createRouteIntentFingerprint(left).value === createRouteIntentFingerprint(right).value;
}

function associationValueMatches(errors, {
  relativePath,
  recordIndex,
  reasonCode,
  fieldPath,
  actual,
  expected,
}) {
  const matched = clean(actual) === clean(expected) && clean(expected) !== "";
  if (!matched) associationError(errors, relativePath, recordIndex, reasonCode, fieldPath);
  return matched;
}

function normalizedOrder(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => clean(
      plainObject(value)
        ? value.wikidataId || value.entityId || value.id || value.name
        : value,
    ))
    .filter(Boolean);
}

function associationOrderMatches(errors, {
  relativePath,
  recordIndex,
  reasonCode,
  fieldPath,
  actual,
  expected,
}) {
  const matched = JSON.stringify(normalizedOrder(actual)) === JSON.stringify(normalizedOrder(expected))
    && normalizedOrder(expected).length > 0;
  if (!matched) associationError(errors, relativePath, recordIndex, reasonCode, fieldPath);
  return matched;
}

function validateRuntimeIntentAssociations(entries, errors) {
  const candidateEntry = entries.find((entry) => entry.path === "route-candidate-pool.jsonl");
  const traceEntry = entries.find((entry) => entry.path === "decision-traces.jsonl");
  const evidenceEntry = entries.find((entry) => entry.path === "route-evidence-bundles.jsonl");
  if (!candidateEntry && !traceEntry && !evidenceEntry) {
    return {
      candidateCount: 0,
      decisionTraceCount: 0,
      evidenceBundleCount: 0,
      routeRecordCount: 0,
      associationsChecked: 0,
    };
  }

  const candidates = readRuntimeJsonlRecords(candidateEntry, errors);
  const traces = readRuntimeJsonlRecords(traceEntry, errors);
  const bundles = readRuntimeJsonlRecords(evidenceEntry, errors);
  const candidatesById = indexRecords(candidates, "candidateId", candidateEntry?.path || "route-candidate-pool.jsonl", errors);
  const tracesById = indexRecords(traces, "traceId", traceEntry?.path || "decision-traces.jsonl", errors);
  const { index: routesById, recordCount: routeRecordCount } = bundles.length
    ? routeRecordIndex(entries, errors)
    : { index: new Map(), recordCount: 0 };
  let associationsChecked = 0;

  for (const [traceIndex, trace] of traces.entries()) {
    if (clean(trace?.outcome) !== "success") continue;
    associationsChecked += 1;
    const candidateId = clean(trace?.candidateId);
    const candidateEntryRecord = candidatesById.get(candidateId);
    if (!candidateEntryRecord) {
      associationError(errors, traceEntry.path, traceIndex, "decision-trace-candidate-reference-missing", "candidateId");
      continue;
    }
    const candidate = candidateEntryRecord.record;
    associationValueMatches(errors, {
      relativePath: traceEntry.path,
      recordIndex: traceIndex,
      reasonCode: "decision-trace-candidate-intent-mismatch",
      fieldPath: "intentId",
      actual: trace.intentId,
      expected: candidate.intentId,
    });
    associationValueMatches(errors, {
      relativePath: traceEntry.path,
      recordIndex: traceIndex,
      reasonCode: "decision-trace-candidate-fingerprint-mismatch",
      fieldPath: "routeIntentFingerprint",
      actual: trace.routeIntentFingerprint,
      expected: candidate.routeIntentFingerprint,
    });
    associationValueMatches(errors, {
      relativePath: traceEntry.path,
      recordIndex: traceIndex,
      reasonCode: "decision-trace-candidate-fingerprint-version-mismatch",
      fieldPath: "routeIntentFingerprintVersion",
      actual: trace.routeIntentFingerprintVersion,
      expected: candidate.routeIntentFingerprintVersion,
    });
    if (!sameIntentContent(trace.inputContext?.normalizedRouteIntent, candidate.normalizedRouteIntent)) {
      associationError(
        errors,
        traceEntry.path,
        traceIndex,
        "decision-trace-candidate-normalized-intent-mismatch",
        "normalizedRouteIntent",
      );
    }
    associationOrderMatches(errors, {
      relativePath: traceEntry.path,
      recordIndex: traceIndex,
      reasonCode: "decision-trace-candidate-order-mismatch",
      fieldPath: "selectedCandidate.proposedOrder",
      actual: trace.selectedCandidate?.proposedOrder,
      expected: candidate.proposedOrder,
    });
  }

  for (const [bundleIndex, bundle] of bundles.entries()) {
    associationsChecked += 1;
    const candidateId = clean(bundle?.candidateId);
    const candidateEntryRecord = candidatesById.get(candidateId);
    if (!candidateEntryRecord) {
      associationError(errors, evidenceEntry.path, bundleIndex, "evidence-candidate-reference-missing", "candidateId");
    }
    const traceEntryRecord = tracesById.get(clean(bundle?.decisionTraceId));
    if (!traceEntryRecord) {
      associationError(errors, evidenceEntry.path, bundleIndex, "evidence-decision-trace-reference-missing", "decisionTraceId");
    }
    const candidate = candidateEntryRecord?.record;
    const trace = traceEntryRecord?.record;
    for (const [subjectName, subject] of [["candidate", candidate], ["decision-trace", trace]]) {
      if (!subject) continue;
      associationValueMatches(errors, {
        relativePath: evidenceEntry.path,
        recordIndex: bundleIndex,
        reasonCode: `evidence-${subjectName}-intent-mismatch`,
        fieldPath: "intentId",
        actual: bundle.intentId,
        expected: subject.intentId,
      });
      associationValueMatches(errors, {
        relativePath: evidenceEntry.path,
        recordIndex: bundleIndex,
        reasonCode: `evidence-${subjectName}-fingerprint-mismatch`,
        fieldPath: "routeIntentFingerprint",
        actual: bundle.routeIntentFingerprint,
        expected: subject.routeIntentFingerprint,
      });
      associationValueMatches(errors, {
        relativePath: evidenceEntry.path,
        recordIndex: bundleIndex,
        reasonCode: `evidence-${subjectName}-fingerprint-version-mismatch`,
        fieldPath: "routeIntentFingerprintVersion",
        actual: bundle.routeIntentFingerprintVersion,
        expected: subject.routeIntentFingerprintVersion,
      });
    }
    if (trace && clean(trace.candidateId) !== candidateId) {
      associationError(errors, evidenceEntry.path, bundleIndex, "evidence-decision-trace-candidate-mismatch", "candidateId");
    }
    if (trace) {
      associationValueMatches(errors, {
        relativePath: evidenceEntry.path,
        recordIndex: bundleIndex,
        reasonCode: "evidence-decision-trace-route-record-mismatch",
        fieldPath: "routeRecordId",
        actual: bundle.routeRecordId,
        expected: trace.routeId,
      });
    }
    if (candidate) {
      if (clean(candidate.status) !== "selected") {
        associationError(errors, evidenceEntry.path, bundleIndex, "evidence-candidate-status-mismatch", "status");
      }
      associationOrderMatches(errors, {
        relativePath: evidenceEntry.path,
        recordIndex: bundleIndex,
        reasonCode: "evidence-candidate-order-mismatch",
        fieldPath: "destinationOrder",
        actual: bundle.destinationOrder,
        expected: candidate.proposedOrder,
      });
    }

    const routeRecordId = clean(bundle?.routeRecordId);
    const routeCandidates = routesById.get(routeRecordId) || [];
    if (routeCandidates.length === 0) {
      associationError(errors, evidenceEntry.path, bundleIndex, "association-unverifiable", "routeRecordId");
      continue;
    }
    const matchingRoute = routeCandidates.find(({ record }) => (
      clean(record?.selectedCandidateId) === candidateId
      && clean(record?.intentId) === clean(bundle.intentId)
      && clean(record?.routeIntentFingerprint) === clean(bundle.routeIntentFingerprint)
      && clean(record?.routeIntentFingerprintVersion) === clean(bundle.routeIntentFingerprintVersion)
    )) || routeCandidates[0];
    const route = matchingRoute.record;
    associationValueMatches(errors, {
      relativePath: evidenceEntry.path,
      recordIndex: bundleIndex,
      reasonCode: "evidence-route-record-candidate-mismatch",
      fieldPath: "selectedCandidateId",
      actual: route.selectedCandidateId,
      expected: candidateId,
    });
    associationValueMatches(errors, {
      relativePath: evidenceEntry.path,
      recordIndex: bundleIndex,
      reasonCode: "evidence-route-record-intent-mismatch",
      fieldPath: "intentId",
      actual: route.intentId,
      expected: bundle.intentId,
    });
    associationValueMatches(errors, {
      relativePath: evidenceEntry.path,
      recordIndex: bundleIndex,
      reasonCode: "evidence-route-record-fingerprint-mismatch",
      fieldPath: "routeIntentFingerprint",
      actual: route.routeIntentFingerprint,
      expected: bundle.routeIntentFingerprint,
    });
    associationValueMatches(errors, {
      relativePath: evidenceEntry.path,
      recordIndex: bundleIndex,
      reasonCode: "evidence-route-record-fingerprint-version-mismatch",
      fieldPath: "routeIntentFingerprintVersion",
      actual: route.routeIntentFingerprintVersion,
      expected: bundle.routeIntentFingerprintVersion,
    });
    if (clean(route.decisionTraceId)
      && clean(route.decisionTraceId) !== clean(bundle.decisionTraceId)) {
      associationError(errors, evidenceEntry.path, bundleIndex, "evidence-route-record-trace-mismatch", "decisionTraceId");
    }
    if (clean(route.evidenceBundleId)
      && clean(route.evidenceBundleId) !== clean(bundle.evidenceBundleId)) {
      associationError(errors, evidenceEntry.path, bundleIndex, "evidence-route-record-bundle-mismatch", "evidenceBundleId");
    }
    associationOrderMatches(errors, {
      relativePath: evidenceEntry.path,
      recordIndex: bundleIndex,
      reasonCode: "evidence-route-record-order-mismatch",
      fieldPath: "destinationOrder",
      actual: route.destinationEntities?.length ? route.destinationEntities : route.destinations,
      expected: bundle.destinationOrder,
    });
    if (!sameIntentContent(route.normalizedRouteIntent, candidate?.normalizedRouteIntent)) {
      associationError(errors, evidenceEntry.path, bundleIndex, "evidence-route-record-normalized-intent-mismatch", "normalizedRouteIntent");
    }
  }

  return {
    candidateCount: candidates.length,
    decisionTraceCount: traces.length,
    evidenceBundleCount: bundles.length,
    routeRecordCount,
    associationsChecked,
  };
}

function validateReadyPool(payload, relativePath, errors) {
  if (!plainObject(payload) || payload.schemaVersion !== "route-v2-ready-pool-v1" || !Array.isArray(payload.records)) {
    errors.push(`${relativePath}:invalid-ready-pool-root`);
    return;
  }
  for (const [index, entry] of payload.records.entries()) {
    if (!plainObject(entry) || !plainObject(entry.routeRecord)) {
      errors.push(`${relativePath}:invalid-ready-pool-record:${index}`);
      continue;
    }
    const validation = validateEmbeddedIntentRecord(
      entry.routeRecord,
      relativePath,
      `record-${index}.routeRecord`,
      errors,
      { allowLegacyUnbound: false },
    );
    if (validation.matched && clean(entry.routeIntentFingerprint) !== clean(entry.routeRecord.routeIntentFingerprint)) {
      errors.push(`${relativePath}:record-${index}:route-intent-fingerprint-mismatch`);
    }
  }
}

function validateGenericReport(payload, relativePath, errors) {
  if (!plainObject(payload)) errors.push(`${relativePath}:invalid-report-root`);
}

function validateProxyMetadata(payload, relativePath, errors) {
  if (!plainObject(payload) || !clean(payload.contentType || payload.sourceUrl || payload.url)) {
    errors.push(`${relativePath}:invalid-proxy-image-metadata`);
  }
}

function runtimeType(relativePath) {
  if (REQUIRED_RUNTIME_STATE[relativePath]) return REQUIRED_RUNTIME_STATE[relativePath];
  if (/^accepted-routes(?:\.json)?\..+/u.test(relativePath)
    || /^accepted-routes\.\d{8}-\d{6}\.before-.+/u.test(relativePath)
    || /^accepted-routes\.\d{14}\.before-.+/u.test(relativePath)) return "accepted-repository-backup-json";
  if (/^route-evidence\..+\.json$/u.test(relativePath)) return "route-evidence-backup-json";
  if (/^route-feed-bootstrap(?:-(?:cross|single))?-payload\.json$/u.test(relativePath)) return "feed-response-json";
  if (relativePath === "destination-images.json") return "destination-images-json";
  if (relativePath === "route-image-cache.json") return "route-image-cache-json";
  if (/^route-v2-runtime-metrics\.json(?:\.\d+)?$/u.test(relativePath)) return "route-v2-runtime-metrics-json";
  if (relativePath === "route-candidate-pool.jsonl") return "candidate-pool-jsonl";
  if (/^(?:route-v2-ready-pool|ready-routes)\.json$/u.test(relativePath)) return "ready-pool-json";
  if (/^(?:decision-traces|route-evidence-bundles)\.jsonl$/u.test(relativePath)) return "sidecar-store-jsonl";
  if (/^bulk-route-generation-.+\.jsonl$/u.test(relativePath)) return "bulk-report-jsonl";
  if (/^(?:feed-image-pool|feed-image-pool-report|feed-image-prewarm-report|feed-proxy-warm-report|image-country-audit-500)\.json$/u.test(relativePath)) {
    return "generated-media-report-json";
  }
  if (/^proxied-images\/[a-f0-9]{64}\.bin$/u.test(relativePath)) return "proxied-image-binary";
  if (/^proxied-images\/[a-f0-9]{64}\.json$/u.test(relativePath)) return "proxied-image-metadata-json";
  if (/\.log$/u.test(relativePath)) return "runtime-log";
  return "";
}

export function classifyCachePath(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (IMMUTABLE_CACHE_FILES.includes(normalized)) {
    return { layer: "immutable", structureType: "route-evidence-repository-json" };
  }
  if (EXTERNAL_FORMAL_FILES.includes(normalized)) {
    return { layer: "external-formal", structureType: "accepted-repository-json" };
  }
  const structureType = runtimeType(normalized);
  return structureType ? { layer: "runtime-state", structureType } : { layer: "unclassified", structureType: "unknown" };
}

function validateRuntimeFile({ absolutePath, path: relativePath, structureType, bytes }, errors) {
  let buffer;
  let payload;
  let records;
  switch (structureType) {
    case "provider-sync-state-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateProviderSyncState(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "knowledge-graph-pool-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateKnowledgeGraphPool(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "search-analytics-jsonl":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJsonl, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateSearchAnalytics(parseJsonl(buffer, relativePath, errors), relativePath, errors);
      break;
    case "search-cache-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateSearchCache(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "search-review-candidates-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateSearchReviewCandidates(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "accepted-repository-backup-json":
      buffer = readBytes(absolutePath, MAX_BYTES.acceptedBackup, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateAcceptedRepository(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "route-evidence-backup-json":
      buffer = readBytes(absolutePath, MAX_BYTES.routeEvidence, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateRouteEvidence(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "feed-response-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateFeedResponse(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "destination-images-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateDestinationImages(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "route-image-cache-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateRouteImageCache(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "route-v2-runtime-metrics-json": {
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeMetrics, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      const validation = validateRouteV2RuntimeMetrics(parseJson(buffer, relativePath, errors));
      for (const error of validation.errors) errors.push(`${relativePath}:${error}`);
      break;
    }
    case "candidate-pool-jsonl":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJsonl, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      records = parseJsonl(buffer, relativePath, errors);
      validateCandidateJsonl(records, relativePath, errors);
      break;
    case "ready-pool-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateReadyPool(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "sidecar-store-jsonl":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJsonl, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      records = parseJsonl(buffer, relativePath, errors);
      validateSidecarJsonl(records, relativePath, errors);
      break;
    case "bulk-report-jsonl":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJsonl, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      parseJsonl(buffer, relativePath, errors);
      break;
    case "generated-media-report-json":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeJson, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      validateGenericReport(parseJson(buffer, relativePath, errors), relativePath, errors);
      break;
    case "proxied-image-metadata-json":
      buffer = readBytes(absolutePath, MAX_BYTES.proxiedImageMetadata, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      payload = parseJson(buffer, relativePath, errors);
      validateProxyMetadata(payload, relativePath, errors);
      if (!fs.existsSync(absolutePath.replace(/\.json$/u, ".bin"))) errors.push(`${relativePath}:missing-proxy-image-binary`);
      break;
    case "proxied-image-binary":
      if (bytes <= 0) errors.push(`${relativePath}:zero-byte-proxy-image`);
      if (bytes > MAX_BYTES.proxiedImage) errors.push(`${relativePath}:size-limit-exceeded:${bytes}:${MAX_BYTES.proxiedImage}`);
      if (!fs.existsSync(absolutePath.replace(/\.bin$/u, ".json"))) errors.push(`${relativePath}:missing-proxy-image-metadata`);
      break;
    case "runtime-log":
      buffer = readBytes(absolutePath, MAX_BYTES.runtimeLog, errors, relativePath);
      validateNoSensitiveContent(buffer, relativePath, errors);
      break;
    default:
      errors.push(`${relativePath}:unsupported-runtime-structure:${structureType}`);
  }
}

export function aggregateCacheEntries(entries) {
  const hash = crypto.createHash("sha256");
  for (const entry of [...entries].sort((left, right) => comparePaths(left.path, right.path))) {
    hash.update(entry.path, "utf8");
    hash.update(Buffer.from([0]));
    hash.update(String(entry.bytes), "utf8");
    hash.update(Buffer.from([0]));
    hash.update(entry.sha256, "utf8");
    hash.update("\n", "utf8");
  }
  return hash.digest("hex");
}

function entryFor(root, absolutePath) {
  const relativePath = normalizeRelativePath(root, absolutePath);
  const bytes = fs.statSync(absolutePath).size;
  return {
    absolutePath,
    path: relativePath,
    bytes,
    sha256: sha256(fs.readFileSync(absolutePath)),
    ...classifyCachePath(relativePath),
  };
}

export function auditRouteV2Cache(cacheRoot, { enumerationOrder = "normal" } = {}) {
  const root = path.resolve(cacheRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`cache-root-missing:${root}`);
  }
  const entries = listFiles(root, { enumerationOrder }).map((absolutePath) => entryFor(root, absolutePath));
  const errors = [];
  const unclassified = entries.filter((entry) => entry.layer === "unclassified");
  for (const entry of unclassified) errors.push(`${entry.path}:unclassified-cache-file`);

  const external = entries.filter((entry) => entry.layer === "external-formal");
  const immutable = entries.filter((entry) => entry.layer === "immutable");
  const runtime = entries.filter((entry) => entry.layer === "runtime-state");

  const acceptedEntry = external.find((entry) => entry.path === "accepted-routes.json");
  let acceptedRouteIds = new Set();
  if (!acceptedEntry) {
    errors.push("accepted-routes.json:missing-external-formal-asset");
  } else {
    const acceptedErrors = [];
    const acceptedBuffer = readBytes(acceptedEntry.absolutePath, MAX_BYTES.acceptedRepository, acceptedErrors, acceptedEntry.path);
    validateNoSensitiveContent(acceptedBuffer, acceptedEntry.path, acceptedErrors);
    acceptedRouteIds = validateAcceptedRepository(parseJson(acceptedBuffer, acceptedEntry.path, acceptedErrors), acceptedEntry.path, acceptedErrors).routeIds;
    errors.push(...acceptedErrors);
    if (acceptedEntry.sha256 !== ACCEPTED_REPOSITORY_SHA256) {
      errors.push(`${acceptedEntry.path}:accepted-sha256-mismatch:${acceptedEntry.sha256}`);
    }
  }

  let evidenceIntegrity = { evidenceCount: 0, externalSourceRouteReferences: [] };
  for (const entry of immutable) {
    if (entry.bytes <= 0) errors.push(`${entry.path}:zero-byte-immutable-file`);
    const buffer = readBytes(entry.absolutePath, MAX_BYTES.routeEvidence, errors, entry.path);
    validateNoSensitiveContent(buffer, entry.path, errors);
    evidenceIntegrity = validateRouteEvidence(parseJson(buffer, entry.path, errors), entry.path, errors, { acceptedRouteIds });
  }

  for (const requiredPath of Object.keys(REQUIRED_RUNTIME_STATE)) {
    if (!runtime.some((entry) => entry.path === requiredPath)) errors.push(`${requiredPath}:missing-required-runtime-state`);
  }
  for (const entry of runtime) validateRuntimeFile(entry, errors);
  const associationAudit = validateRuntimeIntentAssociations(entries, errors);

  const immutableFiles = immutable
    .map(({ path: relativePath, bytes, sha256: fileSha256 }) => ({ path: relativePath, bytes, sha256: fileSha256 }))
    .sort((left, right) => comparePaths(left.path, right.path));
  const runtimeFiles = runtime
    .map(({ path: relativePath, bytes, sha256: fileSha256, structureType }) => ({
      path: relativePath,
      bytes,
      sha256: fileSha256,
      structureType,
      required: Object.hasOwn(REQUIRED_RUNTIME_STATE, relativePath),
    }))
    .sort((left, right) => comparePaths(left.path, right.path));
  const externalFiles = external
    .map(({ path: relativePath, bytes, sha256: fileSha256, structureType }) => ({
      path: relativePath,
      bytes,
      sha256: fileSha256,
      structureType,
    }))
    .sort((left, right) => comparePaths(left.path, right.path));

  return {
    schemaVersion: CACHE_BASELINE_SCHEMA_VERSION,
    generatedBy: CACHE_BASELINE_GENERATOR,
    status: errors.length ? "FAIL" : "PASS",
    errors: [...new Set(errors)].sort(),
    classification: {
      includeImmutable: [...IMMUTABLE_CACHE_FILES],
      externalFormal: [...EXTERNAL_FORMAL_FILES],
      requiredRuntimeState: Object.entries(REQUIRED_RUNTIME_STATE)
        .map(([relativePath, structureType]) => ({ path: relativePath, structureType })),
      runtimeRuleVersion: 1,
      unclassifiedCount: unclassified.length,
    },
    immutable: {
      fileCount: immutableFiles.length,
      totalBytes: immutableFiles.reduce((sum, entry) => sum + entry.bytes, 0),
      aggregateSha256: aggregateCacheEntries(immutableFiles),
      files: immutableFiles,
      integrity: evidenceIntegrity,
    },
    runtimeState: {
      fileCount: runtimeFiles.length,
      totalBytes: runtimeFiles.reduce((sum, entry) => sum + entry.bytes, 0),
      auditSha256: aggregateCacheEntries(runtimeFiles),
      files: runtimeFiles,
      associationAudit,
    },
    externalFormal: {
      fileCount: externalFiles.length,
      totalBytes: externalFiles.reduce((sum, entry) => sum + entry.bytes, 0),
      files: externalFiles,
    },
    fullCache: {
      fileCount: entries.length,
      totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      snapshotSha256: aggregateCacheEntries(entries.map((entry) => ({
        path: entry.path,
        bytes: entry.bytes,
        sha256: entry.sha256,
      }))),
    },
    historicalWholeCacheHash: {
      sha256: HISTORICAL_CACHE_HASH,
      enforcement: "historical-only",
      reproducible: false,
    },
  };
}

export function createCacheBaselineV2(audit) {
  return {
    schemaVersion: CACHE_BASELINE_SCHEMA_VERSION,
    generatedBy: CACHE_BASELINE_GENERATOR,
    aggregateAlgorithm: {
      digest: "SHA-256",
      pathEncoding: "UTF-8 root-relative POSIX separators",
      ordering: "ascending Unicode code-unit path order; no locale collation",
      entryEncoding: "relativePath + NUL + byteLength(base10) + NUL + fileSha256(lowercase hex) + LF",
      metadataExcluded: ["mtime", "ctime", "absolutePath"],
      contentRule: "hash original file bytes; do not reformat JSON or JSONL",
    },
    classification: audit.classification,
    immutable: audit.immutable,
    runtimeState: {
      enforcement: "structure-and-test-run-stability",
      snapshotInformationalOnly: true,
      fileCount: audit.runtimeState.fileCount,
      totalBytes: audit.runtimeState.totalBytes,
      files: audit.runtimeState.files.map(({ path: relativePath, structureType, required }) => ({
        path: relativePath,
        structureType,
        required,
      })),
    },
    externalFormal: {
      enforcement: "independent-accepted-baseline",
      files: audit.externalFormal.files,
    },
    historicalWholeCacheHash: audit.historicalWholeCacheHash,
  };
}

export function verifyCacheBaselineV2(audit, baseline) {
  const errors = [];
  if (audit.status !== "PASS") errors.push(...audit.errors);
  if (!plainObject(baseline) || baseline.schemaVersion !== CACHE_BASELINE_SCHEMA_VERSION) {
    errors.push("baseline:schema-version-mismatch");
    return { ok: false, errors: [...new Set(errors)].sort() };
  }
  if (audit.immutable.fileCount !== baseline.immutable?.fileCount) errors.push("baseline:immutable-file-count-mismatch");
  if (audit.immutable.totalBytes !== baseline.immutable?.totalBytes) errors.push("baseline:immutable-byte-count-mismatch");
  if (audit.immutable.aggregateSha256 !== baseline.immutable?.aggregateSha256) errors.push("baseline:immutable-aggregate-mismatch");
  if (JSON.stringify(audit.immutable.files) !== JSON.stringify(baseline.immutable?.files || [])) {
    errors.push("baseline:immutable-file-manifest-mismatch");
  }
  const accepted = audit.externalFormal.files.find((entry) => entry.path === "accepted-routes.json");
  if (accepted?.sha256 !== ACCEPTED_REPOSITORY_SHA256) errors.push("baseline:accepted-repository-mismatch");
  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() };
}
