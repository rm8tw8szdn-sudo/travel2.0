import {
  createEntityLayerIssueId,
  entityLayerDistanceKm,
  normalizeEntityLayerNameKey,
} from "./knowledge-entity-layer-primitives.mjs";
import { validateKnowledgeCityEntity } from "./knowledge-city-baseline-schema.mjs";

function createConflict(type, relatedEntityIds, details = {}) {
  const sortedRelatedEntityIds = [...new Set(relatedEntityIds.filter(Boolean))].sort();
  return {
    conflictId: createEntityLayerIssueId({ prefix: "conflict", type, relatedEntityIds: sortedRelatedEntityIds, details }),
    type,
    severity: "blocking",
    relatedEntityIds: sortedRelatedEntityIds,
    details,
  };
}

function createReview(type, relatedEntityIds, field, message, details = {}) {
  const sortedRelatedEntityIds = [...new Set(relatedEntityIds.filter(Boolean))].sort();
  return {
    reviewId: createEntityLayerIssueId({ prefix: "review", type, relatedEntityIds: sortedRelatedEntityIds, details }),
    type,
    severity: "manual-review",
    relatedEntityIds: sortedRelatedEntityIds,
    field,
    message,
  };
}

export function dedupeKnowledgeCityEntities(cities = [], { countries = [] } = {}) {
  const conflictsById = new Map();
  const reviewsById = new Map();
  const countryById = new Map(countries.map((country) => [country.entityId, country]));
  const countryByQid = new Map(countries.map((country) => [country.wikidataId, country]));
  const entityIdFirstSeen = new Map();
  const qidFirstSeen = new Map();

  const addConflict = (conflict) => conflictsById.set(conflict.conflictId, conflict);
  const addReview = (review) => reviewsById.set(review.reviewId, review);

  cities.forEach((city, index) => {
    const validation = validateKnowledgeCityEntity(city);
    if (!validation.accepted) {
      addConflict(createConflict("city-schema-invalid", [city?.entityId], {
        reasons: [...validation.reasons].sort(),
        index,
      }));
    }

    if (entityIdFirstSeen.has(city?.entityId)) {
      addConflict(createConflict("duplicate-city-entity-id", [city?.entityId], {
        indexes: [entityIdFirstSeen.get(city.entityId), index],
      }));
    } else {
      entityIdFirstSeen.set(city?.entityId, index);
    }

    if (qidFirstSeen.has(city?.wikidataId)) {
      addConflict(createConflict("duplicate-city-wikidata-id", [qidFirstSeen.get(city.wikidataId)?.entityId, city?.entityId], {
        wikidataId: city?.wikidataId,
      }));
    } else {
      qidFirstSeen.set(city?.wikidataId, city);
    }

    const parent = countryById.get(city?.parentCountryEntityId);
    if (!parent) {
      addConflict(createConflict("orphan-city-parent", [city?.entityId, city?.parentCountryEntityId], {
        parentCountryEntityId: city?.parentCountryEntityId,
      }));
    } else if (parent.entityType !== "country") {
      addConflict(createConflict("city-parent-not-country", [city?.entityId, parent.entityId], {
        parentEntityType: parent.entityType,
      }));
    }

    const sameQidCountry = countryByQid.get(city?.wikidataId);
    if (sameQidCountry) {
      addReview(createReview(
        "cross-type-qid-overlap",
        [city.entityId, sameQidCountry.entityId],
        "wikidataId",
        "A City and Country intentionally share the same Wikidata QID; typed entity IDs keep them distinct.",
        { wikidataId: city.wikidataId },
      ));
    }
  });

  for (let leftIndex = 0; leftIndex < cities.length; leftIndex += 1) {
    const left = cities[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < cities.length; rightIndex += 1) {
      const right = cities[rightIndex];
      if (left?.parentCountryEntityId !== right?.parentCountryEntityId) continue;
      if (normalizeEntityLayerNameKey(left?.canonicalNameEn) !== normalizeEntityLayerNameKey(right?.canonicalNameEn)) continue;
      const distanceKm = entityLayerDistanceKm(left?.coordinates, right?.coordinates);
      if (distanceKm > 1) continue;

      addReview(createReview(
        "same-parent-nearby-city-name-match",
        [left?.entityId, right?.entityId],
        "canonicalNameEn",
        "Two City entities under the same Country have the same normalized name within 1 km; manual review is required and no automatic merge is performed.",
        { distanceKm: Number(distanceKm.toFixed(6)) },
      ));
    }
  }

  return {
    cities: [...cities],
    conflicts: [...conflictsById.values()].sort((left, right) => left.conflictId.localeCompare(right.conflictId, "en")),
    reviewQueue: [...reviewsById.values()].sort((left, right) => left.reviewId.localeCompare(right.reviewId, "en")),
  };
}
