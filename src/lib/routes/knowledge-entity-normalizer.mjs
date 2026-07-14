import {
  isTrustedKnowledgeEntitySource,
  normalizeKnowledgeEntity,
  validateKnowledgeEntity,
} from "./knowledge-repository-schema.mjs";
import { cleanString } from "./route-v2-utils.mjs";

function hasRouteRecordSignal(input = {}) {
  return Boolean(
    input.routeId
      || input.sourceRouteId
      || input.contentEvidence
      || input.acceptedAt
      || input.repositoryStatus
      || input.contentQualityStatus
      || input.provenance?.sourceRouteId
      || input.provenance?.extractionMethod === "route-record-derived",
  );
}

export function classifyKnowledgeEntitySource(input = {}) {
  const explicit = cleanString(input.entitySourceType);
  if (explicit) return explicit;
  const rawId = cleanString(input.entityId || input.wikidataId || input.qid || input.id || input.destinationId);
  const provenanceProvider = cleanString(input.provenance?.providerId || input.provider);
  if (hasRouteRecordSignal(input)) return "route-record-derived";
  if (/^coverage:/iu.test(rawId)) return "coverage-placeholder";
  if (/^search-/iu.test(rawId)) return "search-fallback";
  if (/^anchor:/iu.test(rawId) || cleanString(input.entityTypeName) === "gold-case-anchor") return "manual-anchor";
  if (/^Q\d+$/u.test(rawId)) return "wikidata";
  if (provenanceProvider === "wikidata") return "wikidata";
  return "unknown";
}

export function confidenceForEntitySourceType(entitySourceType = "") {
  switch (cleanString(entitySourceType)) {
    case "wikidata":
      return 0.95;
    case "manual-anchor":
      return 0.65;
    case "search-fallback":
      return 0.45;
    case "coverage-placeholder":
      return 0.2;
    case "route-record-derived":
      return 0.1;
    default:
      return 0;
  }
}

export function normalizeKnowledgeEntitySource(input = {}) {
  const entitySourceType = classifyKnowledgeEntitySource(input);
  const rawId = cleanString(input.entityId || input.wikidataId || input.qid || input.id || input.destinationId || input.name);
  const sourceUrl = cleanString(input.sourceUrl || input.provenance?.sourceUrl);
  const providerId = cleanString(input.provenance?.providerId || input.provider || (
    entitySourceType === "wikidata" ? "wikidata" : ""
  ));
  const normalized = normalizeKnowledgeEntity({
    ...input,
    entityId: rawId,
    entityType: input.entityType || input.entityTypeName || input.type || "destination",
    canonicalName: input.canonicalName || input.name || input.label || input.title || input.sourceTitle,
    entitySourceType,
    confidence: input.confidence ?? confidenceForEntitySourceType(entitySourceType),
    provenance: {
      ...(input.provenance && typeof input.provenance === "object" ? input.provenance : {}),
      providerId,
      sourceUrl,
      sourceType: entitySourceType,
    },
  });
  return {
    ...normalized,
    trustedForFact: isTrustedKnowledgeEntitySource(normalized.entitySourceType)
      && validateKnowledgeEntity(normalized).accepted
      && Boolean(normalized.provenance?.providerId || normalized.provenance?.sourceUrl),
  };
}

export function annotateKnowledgeEntity(input = {}) {
  const source = normalizeKnowledgeEntitySource(input);
  return {
    ...input,
    entitySourceType: source.entitySourceType,
    provenance: {
      ...(input.provenance && typeof input.provenance === "object" ? input.provenance : {}),
      ...source.provenance,
    },
    confidence: source.confidence,
    trustedForFact: source.trustedForFact,
  };
}
