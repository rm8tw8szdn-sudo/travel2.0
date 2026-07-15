import {
  canonicalizeEntityLayerAliases,
  createTypedEntityId,
  isValidEntityLayerQid,
  normalizeEntityLayerCoordinates,
  normalizeEntityLayerText,
  validateEntityLayerProvenanceEntry,
} from "./knowledge-entity-layer-primitives.mjs";

export const KNOWLEDGE_POI_BASELINE_SCHEMA_VERSION = "route-v2-poi-baseline-p1b";
export const KNOWLEDGE_POI_ENTITY_TYPE = "poi";
export const KNOWLEDGE_POI_PROVENANCE_SOURCE_TYPES = Object.freeze([
  "wikidata",
  "repository-reference",
  "project-schema",
]);
export const KNOWLEDGE_POI_PROVENANCE_FIELDS = Object.freeze([
  "entityId",
  "entityType",
  "parentCityEntityId",
  "wikidataId",
  "canonicalNameZh",
  "canonicalNameEn",
  "aliases",
  "coordinates",
  "entitySourceType",
  "confidence",
  "retrievedAt",
]);

const EXACT_POI_KEYS = Object.freeze([
  "schemaVersion",
  "entityId",
  "entityType",
  "parentCityEntityId",
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

export function validateKnowledgePoiEntity(poi) {
  const reasons = [];
  if (!poi || typeof poi !== "object" || Array.isArray(poi)) {
    return { accepted: false, reasons: ["poi-invalid"] };
  }

  if (JSON.stringify(Object.keys(poi).sort()) !== JSON.stringify([...EXACT_POI_KEYS].sort())) {
    reasons.push("poi-shape-invalid");
  }
  if (poi.schemaVersion !== KNOWLEDGE_POI_BASELINE_SCHEMA_VERSION) reasons.push("schema-version-invalid");
  if (poi.entityType !== KNOWLEDGE_POI_ENTITY_TYPE) reasons.push("entity-type-invalid");
  if (!isValidEntityLayerQid(poi.wikidataId)) reasons.push("wikidata-id-invalid");
  if (isValidEntityLayerQid(poi.wikidataId)) {
    const expectedEntityId = createTypedEntityId({ entityType: KNOWLEDGE_POI_ENTITY_TYPE, wikidataId: poi.wikidataId });
    if (poi.entityId !== expectedEntityId) reasons.push("entity-id-invalid");
  }
  if (!/^city-[0-9a-f]{16}$/u.test(normalizeEntityLayerText(poi.parentCityEntityId))) {
    reasons.push("parent-city-entity-id-invalid");
  }
  if (!normalizeEntityLayerText(poi.canonicalNameZh)) reasons.push("canonical-name-zh-missing");
  if (!normalizeEntityLayerText(poi.canonicalNameEn)) reasons.push("canonical-name-en-missing");
  if (!Array.isArray(poi.aliases)) {
    reasons.push("aliases-invalid");
  } else {
    const expectedAliases = canonicalizeEntityLayerAliases(poi.aliases, [poi.canonicalNameZh, poi.canonicalNameEn]);
    if (JSON.stringify(poi.aliases) !== JSON.stringify(expectedAliases)) reasons.push("aliases-not-canonical");
  }
  if (!normalizeEntityLayerCoordinates(poi.coordinates)) reasons.push("coordinates-invalid");
  if (poi.entitySourceType !== "wikidata") reasons.push("entity-source-type-invalid");
  if (!Number.isFinite(poi.confidence) || poi.confidence < 0 || poi.confidence > 1) reasons.push("confidence-invalid");
  if (!normalizeEntityLayerText(poi.retrievedAt) || Number.isNaN(Date.parse(poi.retrievedAt))) {
    reasons.push("retrieved-at-invalid");
  }
  if (!poi.provenance || typeof poi.provenance !== "object" || Array.isArray(poi.provenance)) {
    reasons.push("provenance-invalid");
  } else {
    if (JSON.stringify(Object.keys(poi.provenance).sort()) !== JSON.stringify([...KNOWLEDGE_POI_PROVENANCE_FIELDS].sort())) {
      reasons.push("provenance-fields-invalid");
    }
    for (const field of KNOWLEDGE_POI_PROVENANCE_FIELDS) {
      const validation = validateEntityLayerProvenanceEntry(poi.provenance[field], {
        allowedSourceTypes: KNOWLEDGE_POI_PROVENANCE_SOURCE_TYPES,
        expectedField: field,
      });
      for (const reason of validation.reasons) reasons.push(`${field}:${reason}`);
    }
  }

  return { accepted: reasons.length === 0, reasons };
}

export function validateKnowledgePoiEntitySet(pois = []) {
  const reasons = [];
  const entityIds = new Set();
  const wikidataIds = new Set();
  if (!Array.isArray(pois)) return { accepted: false, reasons: ["poi-set-invalid"] };

  pois.forEach((poi, index) => {
    const validation = validateKnowledgePoiEntity(poi);
    for (const reason of validation.reasons) reasons.push(`poi-${index}:${reason}`);
    if (entityIds.has(poi?.entityId)) reasons.push(`poi-${index}:duplicate-entity-id`);
    if (wikidataIds.has(poi?.wikidataId)) reasons.push(`poi-${index}:duplicate-wikidata-id`);
    entityIds.add(poi?.entityId);
    wikidataIds.add(poi?.wikidataId);
  });

  return { accepted: reasons.length === 0, reasons };
}
