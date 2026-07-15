import {
  canonicalizeEntityLayerAliases,
  createEntityLayerIssueId,
  createEntityLayerProvenanceEntry,
  createTypedEntityId,
  normalizeEntityLayerCoordinates,
  normalizeEntityLayerText,
} from "./knowledge-entity-layer-primitives.mjs";
import {
  KNOWLEDGE_CITY_BASELINE_SCHEMA_VERSION,
  KNOWLEDGE_CITY_ENTITY_TYPE,
} from "./knowledge-city-baseline-schema.mjs";

const SUPPORTED_LANGUAGE_CODES = Object.freeze(["en", "zh-hans", "zh", "ja", "tr", "ms", "ta"]);

function readLabel(rawEntity, language) {
  return normalizeEntityLayerText(rawEntity?.labels?.[language]?.value);
}

function readCountryQids(rawEntity) {
  return [...new Set((rawEntity?.claims?.P17 || [])
    .map((claim) => normalizeEntityLayerText(claim?.mainsnak?.datavalue?.value?.id))
    .filter(Boolean))].sort();
}

function readCoordinates(rawEntity) {
  const coordinates = (rawEntity?.claims?.P625 || [])
    .map((claim) => normalizeEntityLayerCoordinates(claim?.mainsnak?.datavalue?.value))
    .filter(Boolean);
  const byValue = new Map(coordinates.map((value) => [`${value.latitude},${value.longitude}`, value]));
  return [...byValue.values()];
}

function readAliases(rawEntity, canonicalNames) {
  const values = [];
  for (const language of SUPPORTED_LANGUAGE_CODES) {
    values.push(rawEntity?.labels?.[language]?.value);
    values.push(...(rawEntity?.aliases?.[language] || []).map((alias) => alias?.value));
  }
  return canonicalizeEntityLayerAliases(values, canonicalNames);
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
    source: "Route V2 P1B City Entity Foundation schema",
    retrievedAt,
    value,
  });
}

function parentProvenance({ field, country, retrievedAt, value }) {
  return createEntityLayerProvenanceEntry({
    field,
    sourceType: "repository-reference",
    source: "Route V2 P1A Country Baseline",
    sourceUrl: `https://www.wikidata.org/wiki/${country.wikidataId}`,
    retrievedAt,
    value,
  });
}

function blockingConflict(type, seed, details = {}) {
  const relatedEntityIds = [seed.parentCountryEntityId].filter(Boolean);
  return {
    conflictId: createEntityLayerIssueId({ prefix: "conflict", type, relatedEntityIds, details: { wikidataId: seed.wikidataId, ...details } }),
    type,
    severity: "blocking",
    wikidataId: seed.wikidataId,
    relatedEntityIds: relatedEntityIds.sort(),
    details,
  };
}

export function normalizeKnowledgeCityBaseline({ rawSnapshot, citySeeds = [], countries = [] }) {
  const retrievedAt = normalizeEntityLayerText(rawSnapshot?.retrievedAt);
  const rawEntities = rawSnapshot?.wikidata?.entities || {};
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const cities = [];
  const conflicts = [];
  const reviewQueue = [];

  for (const seed of [...citySeeds].sort((left, right) => left.wikidataId.localeCompare(right.wikidataId, "en"))) {
    const rawEntity = rawEntities[seed.wikidataId];
    const country = countryById.get(seed.parentCountryEntityId);
    if (!rawEntity || rawEntity.missing !== undefined) {
      conflicts.push(blockingConflict("raw-city-entity-missing", seed));
      continue;
    }
    if (!country) {
      conflicts.push(blockingConflict("parent-country-missing", seed));
      continue;
    }

    const countryQids = readCountryQids(rawEntity);
    if (!countryQids.includes(country.wikidataId)) {
      conflicts.push(blockingConflict("wikidata-parent-country-mismatch", seed, {
        actualCountryQids: countryQids,
        expectedCountryQid: country.wikidataId,
      }));
      continue;
    }

    const coordinateOptions = readCoordinates(rawEntity);
    if (coordinateOptions.length !== 1) {
      conflicts.push(blockingConflict("wikidata-coordinate-cardinality-invalid", seed, {
        coordinateCount: coordinateOptions.length,
      }));
      continue;
    }

    const canonicalNameZh = readLabel(rawEntity, "zh-hans") || readLabel(rawEntity, "zh");
    const canonicalNameEn = readLabel(rawEntity, "en");
    if (!canonicalNameZh || !canonicalNameEn) {
      conflicts.push(blockingConflict("wikidata-canonical-name-missing", seed, {
        canonicalNameEnPresent: Boolean(canonicalNameEn),
        canonicalNameZhPresent: Boolean(canonicalNameZh),
      }));
      continue;
    }

    const entityId = createTypedEntityId({ entityType: KNOWLEDGE_CITY_ENTITY_TYPE, wikidataId: seed.wikidataId });
    const aliases = readAliases(rawEntity, [canonicalNameZh, canonicalNameEn]);
    const coordinates = coordinateOptions[0];
    const confidence = 0.95;
    const entitySourceType = "wikidata";
    const provenance = {
      entityId: schemaProvenance({ field: "entityId", retrievedAt, value: entityId }),
      entityType: schemaProvenance({ field: "entityType", retrievedAt, value: KNOWLEDGE_CITY_ENTITY_TYPE }),
      parentCountryEntityId: parentProvenance({ field: "parentCountryEntityId", country, retrievedAt, value: country.entityId }),
      wikidataId: wikidataProvenance({ field: "wikidataId", qid: seed.wikidataId, retrievedAt, value: seed.wikidataId }),
      canonicalNameZh: wikidataProvenance({ field: "canonicalNameZh", qid: seed.wikidataId, retrievedAt, value: canonicalNameZh }),
      canonicalNameEn: wikidataProvenance({ field: "canonicalNameEn", qid: seed.wikidataId, retrievedAt, value: canonicalNameEn }),
      aliases: wikidataProvenance({ field: "aliases", qid: seed.wikidataId, retrievedAt, value: aliases }),
      coordinates: wikidataProvenance({ field: "coordinates", qid: seed.wikidataId, retrievedAt, value: coordinates }),
      entitySourceType: schemaProvenance({ field: "entitySourceType", retrievedAt, value: entitySourceType }),
      confidence: schemaProvenance({ field: "confidence", retrievedAt, value: confidence }),
      retrievedAt: wikidataProvenance({ field: "retrievedAt", qid: seed.wikidataId, retrievedAt, value: retrievedAt }),
    };

    cities.push({
      schemaVersion: KNOWLEDGE_CITY_BASELINE_SCHEMA_VERSION,
      entityId,
      entityType: KNOWLEDGE_CITY_ENTITY_TYPE,
      parentCountryEntityId: country.entityId,
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

    if (seed.crossContinentReview === true) {
      const relatedEntityIds = [entityId, country.entityId].sort();
      const type = "cross-continent-city-metadata";
      reviewQueue.push({
        reviewId: createEntityLayerIssueId({
          prefix: "review",
          type,
          relatedEntityIds,
          details: { wikidataId: seed.wikidataId },
        }),
        type,
        severity: "manual-review",
        relatedEntityIds,
        field: "geographic-region-metadata",
        message: "Istanbul spans Europe and Asia; no canonical continent field is assigned in P1B.",
      });
    }
  }

  cities.sort((left, right) => left.parentCountryEntityId.localeCompare(right.parentCountryEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
  conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId, "en"));
  reviewQueue.sort((left, right) => left.reviewId.localeCompare(right.reviewId, "en"));
  return { cities, conflicts, reviewQueue };
}
