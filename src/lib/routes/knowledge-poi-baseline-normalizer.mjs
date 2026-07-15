import {
  canonicalizeEntityLayerAliases,
  createEntityLayerIssueId,
  createEntityLayerProvenanceEntry,
  createTypedEntityId,
  normalizeEntityLayerCoordinates,
  normalizeEntityLayerText,
} from "./knowledge-entity-layer-primitives.mjs";
import {
  KNOWLEDGE_POI_BASELINE_SCHEMA_VERSION,
  KNOWLEDGE_POI_ENTITY_TYPE,
} from "./knowledge-poi-baseline-schema.mjs";

const SUPPORTED_LANGUAGE_CODES = Object.freeze(["en", "zh-hans", "zh", "ja", "tr", "ms", "ta"]);

function readLabel(rawEntity, language) {
  return normalizeEntityLayerText(rawEntity?.labels?.[language]?.value);
}

function readClaimQids(rawEntity, property) {
  return [...new Set((rawEntity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => normalizeEntityLayerText(claim?.mainsnak?.datavalue?.value?.id))
    .filter(Boolean))].sort();
}

function readCoordinates(rawEntity) {
  const claims = (rawEntity?.claims?.P625 || []).filter((claim) => claim?.rank !== "deprecated");
  const preferred = claims.filter((claim) => claim.rank === "preferred");
  const selected = preferred.length > 0 ? preferred : claims;
  const coordinates = selected
    .map((claim) => normalizeEntityLayerCoordinates(claim?.mainsnak?.datavalue?.value))
    .filter(Boolean);
  return [...new Map(coordinates.map((value) => [`${value.latitude},${value.longitude}`, value])).values()];
}

function readAliases(rawEntity, canonicalNames) {
  const values = [];
  for (const language of SUPPORTED_LANGUAGE_CODES) {
    values.push(rawEntity?.labels?.[language]?.value);
    values.push(...(rawEntity?.aliases?.[language] || []).map((alias) => alias?.value));
  }
  return canonicalizeEntityLayerAliases(values, canonicalNames);
}

function rawNames(rawEntity) {
  return SUPPORTED_LANGUAGE_CODES.flatMap((language) => [
    rawEntity?.labels?.[language]?.value,
    ...(rawEntity?.aliases?.[language] || []).map((alias) => alias?.value),
  ]).map(normalizeEntityLayerText).filter(Boolean);
}

function wikidataProvenance({ field, qid, retrievedAt, value }) {
  return createEntityLayerProvenanceEntry({
    field,
    sourceType: "wikidata",
    source: "Wikidata wbgetentities",
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
    retrievedAt,
    value,
  });
}

function schemaProvenance({ field, retrievedAt, value }) {
  return createEntityLayerProvenanceEntry({
    field,
    sourceType: "project-schema",
    source: "Route V2 P1B POI Pilot schema",
    retrievedAt,
    value,
  });
}

function parentProvenance({ field, city, retrievedAt, value }) {
  return createEntityLayerProvenanceEntry({
    field,
    sourceType: "repository-reference",
    source: "Route V2 P1B City Entity Foundation",
    sourceUrl: `https://www.wikidata.org/wiki/${city.wikidataId}`,
    retrievedAt,
    value,
  });
}

function blockingConflict(type, seed, details = {}) {
  const relatedEntityIds = [seed.parentCityEntityId].filter(Boolean).sort();
  return {
    conflictId: createEntityLayerIssueId({
      prefix: "conflict",
      type,
      relatedEntityIds,
      details: { wikidataId: seed.wikidataId, ...details },
    }),
    type,
    severity: "blocking",
    wikidataId: seed.wikidataId,
    relatedEntityIds,
    details,
  };
}

export function normalizeKnowledgePoiBaseline({ rawSnapshot, poiSeeds = [], cities = [] }) {
  const retrievedAt = normalizeEntityLayerText(rawSnapshot?.retrievedAt);
  const rawEntities = rawSnapshot?.wikidata?.entities || {};
  const parentEvidence = rawSnapshot?.parentEvidence || {};
  const cityById = new Map(cities.map((city) => [city.entityId, city]));
  const pois = [];
  const conflicts = [];
  const reviewQueue = [];

  for (const seed of [...poiSeeds].sort((left, right) => left.wikidataId.localeCompare(right.wikidataId, "en"))) {
    const rawEntity = rawEntities[seed.wikidataId];
    const city = cityById.get(seed.parentCityEntityId);
    if (!rawEntity || rawEntity.missing !== undefined) {
      conflicts.push(blockingConflict("raw-poi-entity-missing", seed));
      continue;
    }
    if (!city) {
      conflicts.push(blockingConflict("parent-city-missing", seed));
      continue;
    }

    const evidence = parentEvidence[seed.wikidataId];
    const parentConfirmed = evidence
      && evidence.expectedCityWikidataId === city.wikidataId
      && evidence.expectedCountryWikidataId === seed.expectedCountryWikidataId
      && evidence.countryMatch === true
      && (evidence.administrativePath === true
        || evidence.directLocation === true
        || (seed.expectedDescriptionCityNameEn && evidence.descriptionCityMatch === true)
        || (seed.cityStateParent === true && city.wikidataId === seed.expectedCountryWikidataId));
    if (!parentConfirmed) {
      conflicts.push(blockingConflict("wikidata-parent-city-unconfirmed", seed, { evidence: evidence || null }));
      continue;
    }

    const countryQids = readClaimQids(rawEntity, "P17");
    if (!countryQids.includes(seed.expectedCountryWikidataId)) {
      conflicts.push(blockingConflict("wikidata-parent-country-mismatch", seed, {
        actualCountryQids: countryQids,
        expectedCountryQid: seed.expectedCountryWikidataId,
      }));
      continue;
    }

    const typeQids = readClaimQids(rawEntity, "P31");
    if (typeQids.length === 0) {
      conflicts.push(blockingConflict("wikidata-poi-type-missing", seed));
      continue;
    }

    const coordinateOptions = readCoordinates(rawEntity);
    if (coordinateOptions.length !== 1) {
      conflicts.push(blockingConflict("wikidata-coordinate-cardinality-invalid", seed, {
        coordinateCount: coordinateOptions.length,
      }));
      continue;
    }

    const rawCanonicalNameZh = readLabel(rawEntity, "zh-hans") || readLabel(rawEntity, "zh");
    const canonicalNameZh = normalizeEntityLayerText(seed.canonicalNameZhFromAlias) || rawCanonicalNameZh;
    const canonicalNameEn = readLabel(rawEntity, "en");
    if (!canonicalNameZh || !canonicalNameEn) {
      conflicts.push(blockingConflict("wikidata-canonical-name-missing", seed, {
        canonicalNameEnPresent: Boolean(canonicalNameEn),
        canonicalNameZhPresent: Boolean(canonicalNameZh),
      }));
      continue;
    }
    if (seed.canonicalNameZhFromAlias && !rawNames(rawEntity).includes(canonicalNameZh)) {
      conflicts.push(blockingConflict("wikidata-curated-name-source-missing", seed, {
        canonicalNameZh,
      }));
      continue;
    }
    if (canonicalNameEn !== seed.expectedNameEn) {
      conflicts.push(blockingConflict("wikidata-poi-identity-mismatch", seed, {
        actualNameEn: canonicalNameEn,
        expectedNameEn: seed.expectedNameEn,
      }));
      continue;
    }

    const entityId = createTypedEntityId({ entityType: KNOWLEDGE_POI_ENTITY_TYPE, wikidataId: seed.wikidataId });
    const aliases = readAliases(rawEntity, [canonicalNameZh, canonicalNameEn, rawCanonicalNameZh]);
    const coordinates = coordinateOptions[0];
    const confidence = 0.95;
    const entitySourceType = "wikidata";
    const provenance = {
      entityId: schemaProvenance({ field: "entityId", retrievedAt, value: entityId }),
      entityType: schemaProvenance({ field: "entityType", retrievedAt, value: KNOWLEDGE_POI_ENTITY_TYPE }),
      parentCityEntityId: parentProvenance({ field: "parentCityEntityId", city, retrievedAt, value: city.entityId }),
      wikidataId: wikidataProvenance({ field: "wikidataId", qid: seed.wikidataId, retrievedAt, value: seed.wikidataId }),
      canonicalNameZh: wikidataProvenance({ field: "canonicalNameZh", qid: seed.wikidataId, retrievedAt, value: canonicalNameZh }),
      canonicalNameEn: wikidataProvenance({ field: "canonicalNameEn", qid: seed.wikidataId, retrievedAt, value: canonicalNameEn }),
      aliases: wikidataProvenance({ field: "aliases", qid: seed.wikidataId, retrievedAt, value: aliases }),
      coordinates: wikidataProvenance({ field: "coordinates", qid: seed.wikidataId, retrievedAt, value: coordinates }),
      entitySourceType: schemaProvenance({ field: "entitySourceType", retrievedAt, value: entitySourceType }),
      confidence: schemaProvenance({ field: "confidence", retrievedAt, value: confidence }),
      retrievedAt: wikidataProvenance({ field: "retrievedAt", qid: seed.wikidataId, retrievedAt, value: retrievedAt }),
    };

    pois.push({
      schemaVersion: KNOWLEDGE_POI_BASELINE_SCHEMA_VERSION,
      entityId,
      entityType: KNOWLEDGE_POI_ENTITY_TYPE,
      parentCityEntityId: city.entityId,
      wikidataId: seed.wikidataId,
      canonicalNameZh,
      canonicalNameEn,
      aliases,
      coordinates,
      entitySourceType,
      confidence,
      retrievedAt,
      provenance,
    });

    if (typeQids.length > 1) {
      const relatedEntityIds = [entityId, city.entityId].sort();
      const type = "multiple-wikidata-poi-types";
      reviewQueue.push({
        reviewId: createEntityLayerIssueId({
          prefix: "review",
          type,
          relatedEntityIds,
          details: {
            wikidataId: seed.wikidataId,
            wikidataTypeIds: typeQids,
          },
        }),
        type,
        severity: "manual-review",
        relatedEntityIds,
        field: "wikidataInstanceOf",
        message: "Wikidata supplies multiple active instance-of values for this POI; identity remains QID-based and no canonical POI type is published in P1B.",
        wikidataId: seed.wikidataId,
        wikidataTypeIds: typeQids,
      });
    }

    if (seed.canonicalNameZhFromAlias) {
      const relatedEntityIds = [entityId, city.entityId].sort();
      const type = "wikidata-zh-label-curated-selection";
      reviewQueue.push({
        reviewId: createEntityLayerIssueId({
          prefix: "review",
          type,
          relatedEntityIds,
          details: {
            wikidataId: seed.wikidataId,
            rawCanonicalNameZh,
            selectedCanonicalNameZh: canonicalNameZh,
          },
        }),
        type,
        severity: "manual-review",
        relatedEntityIds,
        field: "canonicalNameZh",
        message: "The Wikidata zh-hans label is inconsistent with the entity; a correct Chinese alias from the same raw record is selected canonically.",
        rawCanonicalNameZh,
        selectedCanonicalNameZh: canonicalNameZh,
      });
    }
  }

  pois.sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
  conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId, "en"));
  reviewQueue.sort((left, right) => left.reviewId.localeCompare(right.reviewId, "en"));
  return { pois, conflicts, reviewQueue };
}
