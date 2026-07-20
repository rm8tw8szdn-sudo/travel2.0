import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const COUNTRY_BASELINE_SCHEMA_VERSION = "route-v2-country-baseline-p1a";
export const COUNTRY_BASELINE_ENTITY_TYPE = "country";
export const COUNTRY_BASELINE_ALLOWED_SOURCE_TYPES = Object.freeze([
  "iso",
  "project-country-catalog",
  "wikidata",
  "manual-override",
]);
export const COUNTRY_BASELINE_FORBIDDEN_SOURCE_TYPES = Object.freeze([
  "coverage-placeholder",
  "search-fallback",
  "route-record-derived",
  "unknown",
]);

export function normalizeIsoAlpha2(value = "") {
  return cleanString(value).toUpperCase();
}

export function normalizeIsoAlpha3(value = "") {
  return cleanString(value).toUpperCase();
}

export function normalizeIsoNumeric(value = "") {
  const text = cleanString(value);
  if (!text) return "";
  return text.padStart(3, "0");
}

export function isValidQid(value = "") {
  return /^Q\d+$/u.test(cleanString(value));
}

export function isValidIsoAlpha2(value = "") {
  return /^[A-Z]{2}$/u.test(normalizeIsoAlpha2(value));
}

export function isValidIsoAlpha3(value = "") {
  return /^[A-Z]{3}$/u.test(normalizeIsoAlpha3(value));
}

export function isValidIsoNumeric(value = "") {
  return /^\d{3}$/u.test(normalizeIsoNumeric(value));
}

export function normalizeCountryCoordinates(input = null) {
  if (!input || typeof input !== "object") return null;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function createCountryEntityId({ isoAlpha2 = "", wikidataId = "" } = {}) {
  const iso2 = normalizeIsoAlpha2(isoAlpha2);
  const qid = cleanString(wikidataId);
  return `country-${stableHash({ isoAlpha2: iso2, wikidataId: qid }).slice(0, 16)}`;
}

export function sourceEntry({
  sourceType = "",
  source = "",
  field = "",
  sourceUrl = "",
  retrievedAt = "",
  value = undefined,
} = {}) {
  return {
    sourceType: cleanString(sourceType),
    source: cleanString(source),
    field: cleanString(field),
    sourceUrl: cleanString(sourceUrl),
    retrievedAt: cleanString(retrievedAt),
    ...(value === undefined ? {} : { value }),
  };
}

export function requiredCountryProvenanceFields() {
  return [
    "entityId",
    "isoAlpha2",
    "isoAlpha3",
    "isoNumeric",
    "wikidataId",
    "canonicalNameZh",
    "canonicalNameEn",
    "aliases",
    "continent",
    "region",
    "subregion",
    "capital",
    "coordinates",
  ];
}

export function validateCountryEntity(entity = {}) {
  const reasons = [];
  if (!entity || typeof entity !== "object") return { accepted: false, reasons: ["country-entity-not-object"] };
  if (cleanString(entity.schemaVersion) !== COUNTRY_BASELINE_SCHEMA_VERSION) reasons.push("schemaVersion-unsupported");
  if (!cleanString(entity.entityId)) reasons.push("entityId-required");
  if (entity.entityType !== COUNTRY_BASELINE_ENTITY_TYPE) reasons.push("entityType-country-required");
  if (!isValidIsoAlpha2(entity.isoAlpha2)) reasons.push("isoAlpha2-invalid");
  if (!isValidIsoAlpha3(entity.isoAlpha3)) reasons.push("isoAlpha3-invalid");
  if (!isValidIsoNumeric(entity.isoNumeric)) reasons.push("isoNumeric-invalid");
  if (!isValidQid(entity.wikidataId)) reasons.push("wikidataId-invalid");
  if (!cleanString(entity.canonicalNameZh)) reasons.push("canonicalNameZh-required");
  if (!cleanString(entity.canonicalNameEn)) reasons.push("canonicalNameEn-required");
  if (!Array.isArray(entity.aliases)) reasons.push("aliases-array-required");
  if (!cleanString(entity.continent?.wikidataId) || !cleanString(entity.continent?.canonicalNameEn)) reasons.push("continent-required");
  if (!cleanString(entity.region)) reasons.push("region-required");
  if (!cleanString(entity.subregion)) reasons.push("subregion-required");
  if (!cleanString(entity.capital?.wikidataId) || !cleanString(entity.capital?.canonicalNameEn)) reasons.push("capital-required");
  if (!normalizeCountryCoordinates(entity.coordinates)) reasons.push("coordinates-invalid");
  if (cleanString(entity.entitySourceType) !== "wikidata") reasons.push("entitySourceType-wikidata-required");
  if (!entity.provenance || typeof entity.provenance !== "object" || Array.isArray(entity.provenance)) {
    reasons.push("provenance-object-required");
  } else {
    for (const field of requiredCountryProvenanceFields()) {
      if (!Array.isArray(entity.provenance[field]) || entity.provenance[field].length === 0) {
        reasons.push(`provenance-${field}-required`);
      }
    }
    const sourceTypes = Object.values(entity.provenance)
      .flatMap((entries) => (Array.isArray(entries) ? entries : []))
      .map((entry) => cleanString(entry.sourceType));
    for (const forbidden of COUNTRY_BASELINE_FORBIDDEN_SOURCE_TYPES) {
      if (sourceTypes.includes(forbidden)) reasons.push(`forbidden-source-${forbidden}`);
    }
    for (const sourceType of sourceTypes) {
      if (!COUNTRY_BASELINE_ALLOWED_SOURCE_TYPES.includes(sourceType)) reasons.push(`unsupported-source-${sourceType || "empty"}`);
    }
  }
  if (!Number.isFinite(Number(entity.confidence)) || Number(entity.confidence) < 0 || Number(entity.confidence) > 1) reasons.push("confidence-range");
  if (!cleanString(entity.retrievedAt) || Number.isNaN(Date.parse(entity.retrievedAt))) reasons.push("retrievedAt-invalid");
  return { accepted: reasons.length === 0, reasons };
}

export function validateCountryEntitySet(entities = []) {
  const reasons = [];
  if (!Array.isArray(entities)) return { accepted: false, reasons: ["countries-array-required"] };
  const iso2 = new Map();
  const iso3 = new Map();
  const qids = new Map();
  for (const entity of entities) {
    const validation = validateCountryEntity(entity);
    if (!validation.accepted) reasons.push(...validation.reasons.map((reason) => `${entity?.isoAlpha2 || "unknown"}:${reason}`));
    for (const [key, value, map] of [
      ["isoAlpha2", normalizeIsoAlpha2(entity?.isoAlpha2), iso2],
      ["isoAlpha3", normalizeIsoAlpha3(entity?.isoAlpha3), iso3],
      ["wikidataId", cleanString(entity?.wikidataId), qids],
    ]) {
      if (!value) continue;
      if (map.has(value)) reasons.push(`${key}-duplicate-${value}`);
      map.set(value, entity?.entityId || value);
    }
  }
  return { accepted: reasons.length === 0, reasons };
}

export function canonicalizeCountryAliases(values = []) {
  return uniqueStrings(values)
    .filter((value) => !/^Q\d+$/u.test(value))
    .sort((a, b) => a.localeCompare(b, "en"));
}
