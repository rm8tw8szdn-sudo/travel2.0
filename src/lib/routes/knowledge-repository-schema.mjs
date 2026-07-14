import { cleanString, stableHash, uniqueStrings } from "./route-v2-utils.mjs";

export const KNOWLEDGE_ENTITY_SOURCE_TYPES = Object.freeze([
  "wikidata",
  "manual-anchor",
  "coverage-placeholder",
  "search-fallback",
  "route-record-derived",
  "unknown",
]);

export const KNOWLEDGE_RELATIONSHIP_TYPES = Object.freeze([
  "belongsTo",
  "near",
  "connectedTo",
  "routeSegment",
  "thematicRelation",
]);

export function isTrustedKnowledgeEntitySource(sourceType = "") {
  return cleanString(sourceType) === "wikidata";
}

export function normalizeKnowledgeEntity(input = {}) {
  const coordinates = input.coordinates && typeof input.coordinates === "object"
    ? input.coordinates
    : { latitude: input.latitude ?? input.lat, longitude: input.longitude ?? input.lon ?? input.lng };
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  const hasCoordinates = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
  const entitySourceType = KNOWLEDGE_ENTITY_SOURCE_TYPES.includes(cleanString(input.entitySourceType))
    ? cleanString(input.entitySourceType)
    : "unknown";
  const entityId = cleanString(input.entityId || input.wikidataId || input.qid || input.id || input.name);
  return {
    entityId,
    entityType: cleanString(input.entityType || input.entityTypeName || input.type || "destination"),
    canonicalName: cleanString(input.canonicalName || input.name || input.label || input.title || input.sourceTitle),
    aliases: uniqueStrings(input.aliases || [input.name, input.sourceTitle, input.label, input.title]).filter(Boolean),
    countryCode: cleanString(input.countryCode || input.country || input.iso2).toUpperCase(),
    coordinates: hasCoordinates ? { latitude, longitude } : null,
    entitySourceType,
    provenance: input.provenance && typeof input.provenance === "object" ? { ...input.provenance } : {},
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
  };
}

export function validateKnowledgeEntity(entity = {}) {
  const reasons = [];
  if (!entity || typeof entity !== "object") return { accepted: false, reasons: ["entity-not-object"] };
  if (!cleanString(entity.entityId)) reasons.push("entityId-required");
  if (!cleanString(entity.entityType)) reasons.push("entityType-required");
  if (!cleanString(entity.canonicalName)) reasons.push("canonicalName-required");
  if (!KNOWLEDGE_ENTITY_SOURCE_TYPES.includes(cleanString(entity.entitySourceType))) reasons.push("entitySourceType-unsupported");
  if (!Number.isFinite(Number(entity.confidence)) || Number(entity.confidence) < 0 || Number(entity.confidence) > 1) reasons.push("confidence-range");
  if (entity.coordinates != null) {
    const latitude = Number(entity.coordinates.latitude);
    const longitude = Number(entity.coordinates.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) reasons.push("latitude-invalid");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) reasons.push("longitude-invalid");
  }
  return { accepted: reasons.length === 0, reasons };
}

export function createKnowledgeFactId({
  subjectEntityId = "",
  predicate = "",
  object = "",
  source = {},
  supportsWhichDecision = [],
} = {}) {
  return `kf-${stableHash({
    subjectEntityId: cleanString(subjectEntityId),
    predicate: cleanString(predicate),
    object,
    sourceUrl: cleanString(source?.sourceUrl || source?.url),
    supportsWhichDecision: uniqueStrings(supportsWhichDecision).sort(),
  }).slice(0, 20)}`;
}

export function normalizeKnowledgeFact(input = {}) {
  const supportsWhichDecision = uniqueStrings(input.supportsWhichDecision || []).filter(Boolean);
  const source = input.source && typeof input.source === "object" ? { ...input.source } : {};
  return {
    factId: cleanString(input.factId) || createKnowledgeFactId({
      subjectEntityId: input.subjectEntityId,
      predicate: input.predicate,
      object: input.object,
      source,
      supportsWhichDecision,
    }),
    subjectEntityId: cleanString(input.subjectEntityId),
    predicate: cleanString(input.predicate),
    object: input.object ?? null,
    source,
    retrievedAt: cleanString(input.retrievedAt),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
    supportsWhichDecision,
  };
}

export function validateKnowledgeFact(fact = {}) {
  const reasons = [];
  if (!fact || typeof fact !== "object") return { accepted: false, reasons: ["fact-not-object"] };
  if (!cleanString(fact.factId)) reasons.push("factId-required");
  if (!cleanString(fact.subjectEntityId)) reasons.push("subjectEntityId-required");
  if (!cleanString(fact.predicate)) reasons.push("predicate-required");
  if (!Number.isFinite(Number(fact.confidence)) || Number(fact.confidence) < 0 || Number(fact.confidence) > 1) reasons.push("confidence-range");
  if (!Array.isArray(fact.supportsWhichDecision)) reasons.push("supportsWhichDecision-array-required");
  return { accepted: reasons.length === 0, reasons };
}

export function normalizeKnowledgeRelationship(input = {}) {
  const relationshipType = cleanString(input.relationshipType || input.type);
  return {
    relationshipType,
    subjectEntityId: cleanString(input.subjectEntityId),
    objectEntityId: cleanString(input.objectEntityId),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
    provenance: input.provenance && typeof input.provenance === "object" ? { ...input.provenance } : {},
  };
}

export function validateKnowledgeRelationship(relationship = {}) {
  const reasons = [];
  if (!relationship || typeof relationship !== "object") return { accepted: false, reasons: ["relationship-not-object"] };
  if (!KNOWLEDGE_RELATIONSHIP_TYPES.includes(cleanString(relationship.relationshipType))) reasons.push("relationshipType-unsupported");
  if (!cleanString(relationship.subjectEntityId)) reasons.push("subjectEntityId-required");
  if (!cleanString(relationship.objectEntityId)) reasons.push("objectEntityId-required");
  return { accepted: reasons.length === 0, reasons };
}
