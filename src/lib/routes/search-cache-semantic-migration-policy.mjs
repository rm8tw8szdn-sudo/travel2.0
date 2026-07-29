import crypto from "node:crypto";

import { validateNormalizedRouteIntent } from "./route-intent-model.mjs";

export const SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION =
  "route-v2-search-cache-semantic-migration-authorization-v2";

const SEMANTIC_REASON = "route-intent-semantic-invalid";
const SEMANTIC_PATH = "hardConstraints.season";
const EXPECTED_VIOLATION_SCOPES = Object.freeze([
  "normalizedIntent",
  "records[0].normalizedRouteIntent",
]);

export const AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES = Object.freeze([
  Object.freeze({
    migrationSchemaVersion: SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION,
    stableKey: "rif-v1-4c9d9d9e924247460776563f966f40d75d9356b45bf1e64a564bf3a11b38a207",
    intentHash: "b2fc20b07fe7aee60479d294",
    itemSha256: "e61b2ad7697da1cae8d5f80b342bc176d490bc9fc6b3707c91c4dc176927efff",
    reasonCode: SEMANTIC_REASON,
    fieldPath: SEMANTIC_PATH,
    routeIntentFingerprint: "rif-v1-4c9d9d9e924247460776563f966f40d75d9356b45bf1e64a564bf3a11b38a207",
    routeIntentFingerprintVersion: "route-intent-fingerprint-v1",
    violationScopes: EXPECTED_VIOLATION_SCOPES,
  }),
  Object.freeze({
    migrationSchemaVersion: SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION,
    stableKey: "rif-v1-4a112c70660af13de649f33fbfba67a0dc7ef29fe427375c2f2f448d9a4f1a3e",
    intentHash: "35810b5c6e7e1d9fa6d85ae9",
    itemSha256: "4c965018978b117fa46758520283524389b63e503c3fa90bf73070f9aa0d8906",
    reasonCode: SEMANTIC_REASON,
    fieldPath: SEMANTIC_PATH,
    routeIntentFingerprint: "rif-v1-4a112c70660af13de649f33fbfba67a0dc7ef29fe427375c2f2f448d9a4f1a3e",
    routeIntentFingerprintVersion: "route-intent-fingerprint-v1",
    violationScopes: EXPECTED_VIOLATION_SCOPES,
  }),
]);

function clean(value) {
  return String(value || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function violationsForIntent(intent) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return [];
  try {
    return (validateNormalizedRouteIntent(intent).violations || []).map((violation) => ({
      reasonCode: clean(violation?.code || violation?.reasonCode || "route-intent-schema-invalid"),
      fieldPath: clean(violation?.path || violation?.field || "$"),
    }));
  } catch {
    return [{ reasonCode: "route-intent-schema-invalid", fieldPath: "$" }];
  }
}

export function discoverSearchCacheIntentViolations(document = {}) {
  const items = document?.items && typeof document.items === "object" && !Array.isArray(document.items)
    ? document.items
    : {};
  const violations = [];
  for (const [stableKey, item] of Object.entries(items)) {
    const subjects = [
      { scope: "normalizedIntent", intent: item?.normalizedIntent },
      ...(Array.isArray(item?.records) ? item.records : []).map((record, recordIndex) => ({
        scope: `records[${recordIndex}].normalizedRouteIntent`,
        intent: record?.normalizedRouteIntent,
      })),
    ];
    for (const subject of subjects) {
      if (!subject.intent?.schemaVersion) continue;
      for (const violation of violationsForIntent(subject.intent)) {
        violations.push({
          stableKey,
          intentHash: clean(item?.intentHash),
          scope: subject.scope,
          ...violation,
        });
      }
    }
  }
  return violations;
}

function signatureForItem(stableKey, item, violations) {
  const matching = violations
    .filter((violation) => violation.stableKey === stableKey)
    .map((violation) => violation.scope)
    .sort();
  return {
    migrationSchemaVersion: SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION,
    stableKey,
    intentHash: clean(item?.intentHash),
    itemSha256: sha256(JSON.stringify(item)),
    reasonCode: SEMANTIC_REASON,
    fieldPath: SEMANTIC_PATH,
    routeIntentFingerprint: clean(item?.routeIntentFingerprint),
    routeIntentFingerprintVersion: clean(item?.routeIntentFingerprintVersion),
    violationScopes: matching,
  };
}

function canonicalSignature(signature = {}) {
  return JSON.stringify({
    migrationSchemaVersion: clean(signature.migrationSchemaVersion),
    stableKey: clean(signature.stableKey),
    intentHash: clean(signature.intentHash),
    itemSha256: clean(signature.itemSha256),
    reasonCode: clean(signature.reasonCode),
    fieldPath: clean(signature.fieldPath),
    routeIntentFingerprint: clean(signature.routeIntentFingerprint),
    routeIntentFingerprintVersion: clean(signature.routeIntentFingerprintVersion),
    violationScopes: [...(Array.isArray(signature.violationScopes) ? signature.violationScopes : [])]
      .map(clean)
      .filter(Boolean)
      .sort(),
  });
}

export function authorizeSearchCacheSemanticMigrationSignatures(
  actualSignatures,
  authorizedSignatures = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES,
) {
  const actual = [...(Array.isArray(actualSignatures) ? actualSignatures : [])]
    .map((signature) => JSON.parse(canonicalSignature(signature)))
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, "en"));
  const authorized = [...(Array.isArray(authorizedSignatures) ? authorizedSignatures : [])]
    .map((signature) => JSON.parse(canonicalSignature(signature)))
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, "en"));
  const expectedByKey = new Map(authorized.map((signature) => [signature.stableKey, signature]));
  const actualByKey = new Map(actual.map((signature) => [signature.stableKey, signature]));
  const missingStableKeys = authorized
    .filter((signature) => !actualByKey.has(signature.stableKey))
    .map((signature) => signature.stableKey);
  const unexpectedStableKeys = actual
    .filter((signature) => !expectedByKey.has(signature.stableKey))
    .map((signature) => signature.stableKey);
  const changedStableKeys = actual
    .filter((signature) => {
      const expected = expectedByKey.get(signature.stableKey);
      return expected && canonicalSignature(expected) !== canonicalSignature(signature);
    })
    .map((signature) => signature.stableKey);
  const authorizedExactSet = actual.length === authorized.length
    && missingStableKeys.length === 0
    && unexpectedStableKeys.length === 0
    && changedStableKeys.length === 0;
  return {
    authorized: authorizedExactSet,
    reasonCode: authorizedExactSet
      ? "migration-authorized-exact-signature-set"
      : actual.length === 0
        ? "migration-already-applied-or-no-authorized-records"
        : "migration-authorization-mismatch",
    migrationSchemaVersion: SEARCH_CACHE_SEMANTIC_MIGRATION_SCHEMA_VERSION,
    expectedCount: authorized.length,
    actualCount: actual.length,
    missingStableKeys,
    unexpectedStableKeys,
    changedStableKeys,
    actualSignatures: actual,
  };
}

export function authorizeSearchCacheSemanticMigrationDocument(
  document,
  authorizedSignatures = AUTHORIZED_SEARCH_CACHE_SEMANTIC_MIGRATION_SIGNATURES,
) {
  const violations = discoverSearchCacheIntentViolations(document);
  const targetViolations = violations.filter((violation) => (
    violation.reasonCode === SEMANTIC_REASON && violation.fieldPath === SEMANTIC_PATH
  ));
  const targetKeys = [...new Set(targetViolations.map((violation) => violation.stableKey))];
  const actualSignatures = targetKeys.map((stableKey) => (
    signatureForItem(stableKey, document.items[stableKey], targetViolations)
  ));
  const authorization = authorizeSearchCacheSemanticMigrationSignatures(actualSignatures, authorizedSignatures);
  const unexpectedViolations = violations.filter((violation) => (
    violation.reasonCode !== SEMANTIC_REASON || violation.fieldPath !== SEMANTIC_PATH
  ));
  if (unexpectedViolations.length) {
    return {
      ...authorization,
      authorized: false,
      reasonCode: "migration-authorization-mismatch",
      unexpectedViolationCount: unexpectedViolations.length,
      unexpectedViolations,
      allViolations: violations,
    };
  }
  return {
    ...authorization,
    unexpectedViolationCount: 0,
    unexpectedViolations: [],
    allViolations: violations,
  };
}
