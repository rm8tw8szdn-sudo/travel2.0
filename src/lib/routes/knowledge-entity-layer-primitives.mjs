import {
  cleanString,
  stableHash,
  uniqueStrings,
} from "./route-v2-utils.mjs";

const EARTH_RADIUS_KM = 6371.0088;

export function normalizeEntityLayerText(value) {
  return cleanString(value).replace(/\s+/gu, " ");
}

export function isValidEntityLayerQid(value) {
  return /^Q\d+$/u.test(normalizeEntityLayerText(value));
}

export function normalizeEntityLayerNameKey(value) {
  return normalizeEntityLayerText(value).normalize("NFKC").toLocaleLowerCase("en");
}

export function canonicalizeEntityLayerAliases(values = [], canonicalNames = []) {
  const canonicalKeys = new Set(canonicalNames.map(normalizeEntityLayerNameKey).filter(Boolean));
  const byKey = new Map();

  for (const alias of uniqueStrings(values.map(normalizeEntityLayerText))) {
    const key = normalizeEntityLayerNameKey(alias);
    if (!key || canonicalKeys.has(key) || byKey.has(key)) continue;
    byKey.set(key, alias);
  }

  return [...byKey.values()].sort((left, right) => left.localeCompare(right, "en"));
}

export function normalizeEntityLayerCoordinates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.latitude === null || value.latitude === undefined || value.latitude === "") return null;
  if (value.longitude === null || value.longitude === undefined || value.longitude === "") return null;

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

export function createTypedEntityId({ entityType, wikidataId }) {
  const normalizedType = normalizeEntityLayerText(entityType).toLocaleLowerCase("en");
  const normalizedQid = normalizeEntityLayerText(wikidataId);
  if (!normalizedType || !isValidEntityLayerQid(normalizedQid)) {
    throw new Error("typed-entity-id-invalid-input");
  }
  return `${normalizedType}-${stableHash({ entityType: normalizedType, wikidataId: normalizedQid }).slice(0, 16)}`;
}

export function createEntityLayerIssueId({ prefix, type, relatedEntityIds = [], details = {} }) {
  const normalizedPrefix = normalizeEntityLayerText(prefix);
  const normalizedType = normalizeEntityLayerText(type);
  if (!normalizedPrefix || !normalizedType) throw new Error("entity-layer-issue-id-invalid-input");

  return `${normalizedPrefix}-${stableHash({
    type: normalizedType,
    relatedEntityIds: uniqueStrings(relatedEntityIds).sort(),
    details,
  }).slice(0, 16)}`;
}

export function createEntityLayerProvenanceEntry({
  field,
  sourceType,
  source,
  sourceUrl = "",
  retrievedAt,
  value,
}) {
  return {
    field: normalizeEntityLayerText(field),
    sourceType: normalizeEntityLayerText(sourceType),
    source: normalizeEntityLayerText(source),
    sourceUrl: normalizeEntityLayerText(sourceUrl),
    retrievedAt: normalizeEntityLayerText(retrievedAt),
    value,
  };
}

export function validateEntityLayerProvenanceEntry(entry, {
  allowedSourceTypes = [],
  expectedField = "",
} = {}) {
  const reasons = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { accepted: false, reasons: ["provenance-entry-invalid"] };
  }

  if (!normalizeEntityLayerText(entry.field)) reasons.push("provenance-field-missing");
  if (expectedField && entry.field !== expectedField) reasons.push("provenance-field-mismatch");
  if (!normalizeEntityLayerText(entry.sourceType)) reasons.push("provenance-source-type-missing");
  if (allowedSourceTypes.length > 0 && !allowedSourceTypes.includes(entry.sourceType)) {
    reasons.push("provenance-source-type-unsupported");
  }
  if (!normalizeEntityLayerText(entry.source)) reasons.push("provenance-source-missing");
  if (!normalizeEntityLayerText(entry.retrievedAt) || Number.isNaN(Date.parse(entry.retrievedAt))) {
    reasons.push("provenance-retrieved-at-invalid");
  }
  if (!("value" in entry)) reasons.push("provenance-value-missing");

  return { accepted: reasons.length === 0, reasons };
}

export function entityLayerDistanceKm(leftCoordinates, rightCoordinates) {
  const left = normalizeEntityLayerCoordinates(leftCoordinates);
  const right = normalizeEntityLayerCoordinates(rightCoordinates);
  if (!left || !right) return Number.POSITIVE_INFINITY;

  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}
