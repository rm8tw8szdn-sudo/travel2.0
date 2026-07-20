import {
  canonicalizeEntityLayerAliases,
  createTypedEntityId,
  isValidEntityLayerQid,
  normalizeEntityLayerCoordinates,
  normalizeEntityLayerText,
  validateEntityLayerProvenanceEntry,
} from "./knowledge-entity-layer-primitives.mjs";

export const KNOWLEDGE_CITY_BASELINE_SCHEMA_VERSION = "route-v2-city-baseline-p1b";
export const KNOWLEDGE_CITY_ENTITY_TYPE = "city";
export const KNOWLEDGE_CITY_PROVENANCE_SOURCE_TYPES = Object.freeze([
  "wikidata",
  "repository-reference",
  "project-schema",
]);
export const KNOWLEDGE_CITY_PROVENANCE_FIELDS = Object.freeze([
  "entityId",
  "entityType",
  "parentCountryEntityId",
  "wikidataId",
  "canonicalNameZh",
  "canonicalNameEn",
  "aliases",
  "coordinates",
  "entitySourceType",
  "confidence",
  "retrievedAt",
]);

const EXACT_CITY_KEYS = Object.freeze([
  "schemaVersion",
  "entityId",
  "entityType",
  "parentCountryEntityId",
  "wikidataId",
  "canonicalNameZh",
  "canonicalNameEn",
  "aliases",
  "coordinates",
  "entitySourceType",
  "confidence",
  "retrievedAt",
  "provenance",
]);

export function validateKnowledgeCityEntity(city) {
  const reasons = [];
  if (!city || typeof city !== "object" || Array.isArray(city)) {
    return { accepted: false, reasons: ["city-invalid"] };
  }

  const keys = Object.keys(city).sort();
  const expectedKeys = [...EXACT_CITY_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) reasons.push("city-shape-invalid");
  if (city.schemaVersion !== KNOWLEDGE_CITY_BASELINE_SCHEMA_VERSION) reasons.push("schema-version-invalid");
  if (city.entityType !== KNOWLEDGE_CITY_ENTITY_TYPE) reasons.push("entity-type-invalid");
  if (!isValidEntityLayerQid(city.wikidataId)) reasons.push("wikidata-id-invalid");
  if (isValidEntityLayerQid(city.wikidataId)) {
    const expectedEntityId = createTypedEntityId({ entityType: KNOWLEDGE_CITY_ENTITY_TYPE, wikidataId: city.wikidataId });
    if (city.entityId !== expectedEntityId) reasons.push("entity-id-invalid");
  }
  if (!/^country-[0-9a-f]{16}$/u.test(normalizeEntityLayerText(city.parentCountryEntityId))) {
    reasons.push("parent-country-entity-id-invalid");
  }
  if (!normalizeEntityLayerText(city.canonicalNameZh)) reasons.push("canonical-name-zh-missing");
  if (!normalizeEntityLayerText(city.canonicalNameEn)) reasons.push("canonical-name-en-missing");
  if (!Array.isArray(city.aliases)) {
    reasons.push("aliases-invalid");
  } else {
    const expectedAliases = canonicalizeEntityLayerAliases(city.aliases, [city.canonicalNameZh, city.canonicalNameEn]);
    if (JSON.stringify(city.aliases) !== JSON.stringify(expectedAliases)) reasons.push("aliases-not-canonical");
  }
  if (!normalizeEntityLayerCoordinates(city.coordinates)) reasons.push("coordinates-invalid");
  if (city.entitySourceType !== "wikidata") reasons.push("entity-source-type-invalid");
  if (!Number.isFinite(city.confidence) || city.confidence < 0 || city.confidence > 1) reasons.push("confidence-invalid");
  if (!normalizeEntityLayerText(city.retrievedAt) || Number.isNaN(Date.parse(city.retrievedAt))) {
    reasons.push("retrieved-at-invalid");
  }
  if (!city.provenance || typeof city.provenance !== "object" || Array.isArray(city.provenance)) {
    reasons.push("provenance-invalid");
  } else {
    const provenanceFields = Object.keys(city.provenance).sort();
    if (JSON.stringify(provenanceFields) !== JSON.stringify([...KNOWLEDGE_CITY_PROVENANCE_FIELDS].sort())) {
      reasons.push("provenance-fields-invalid");
    }
    for (const field of KNOWLEDGE_CITY_PROVENANCE_FIELDS) {
      const validation = validateEntityLayerProvenanceEntry(city.provenance[field], {
        allowedSourceTypes: KNOWLEDGE_CITY_PROVENANCE_SOURCE_TYPES,
        expectedField: field,
      });
      for (const reason of validation.reasons) reasons.push(`${field}:${reason}`);
    }
  }

  return { accepted: reasons.length === 0, reasons };
}

export function validateKnowledgeCityEntitySet(cities = []) {
  const reasons = [];
  const entityIds = new Set();
  const wikidataIds = new Set();
  if (!Array.isArray(cities)) return { accepted: false, reasons: ["city-set-invalid"] };

  cities.forEach((city, index) => {
    const validation = validateKnowledgeCityEntity(city);
    for (const reason of validation.reasons) reasons.push(`city-${index}:${reason}`);
    if (entityIds.has(city?.entityId)) reasons.push(`city-${index}:duplicate-entity-id`);
    if (wikidataIds.has(city?.wikidataId)) reasons.push(`city-${index}:duplicate-wikidata-id`);
    entityIds.add(city?.entityId);
    wikidataIds.add(city?.wikidataId);
  });

  return { accepted: reasons.length === 0, reasons };
}
