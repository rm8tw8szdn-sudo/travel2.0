import {
  createEntityLayerIssueId,
  entityLayerDistanceKm,
  normalizeEntityLayerNameKey,
} from "./knowledge-entity-layer-primitives.mjs";
import { validateKnowledgePoiEntity } from "./knowledge-poi-baseline-schema.mjs";

const NEARBY_POI_DISTANCE_KM = 0.05;

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

export function dedupeKnowledgePoiEntities(pois = [], { countries = [], cities = [] } = {}) {
  const conflictsById = new Map();
  const reviewsById = new Map();
  const allParents = [...countries, ...cities];
  const parentById = new Map(allParents.map((entity) => [entity.entityId, entity]));
  const countryByQid = new Map(countries.map((country) => [country.wikidataId, country]));
  const cityByQid = new Map(cities.map((city) => [city.wikidataId, city]));
  const crossTypeByEntityId = new Map(allParents.map((entity) => [entity.entityId, entity]));
  const entityIdFirstSeen = new Map();
  const qidFirstSeen = new Map();
  const addConflict = (conflict) => conflictsById.set(conflict.conflictId, conflict);
  const addReview = (review) => reviewsById.set(review.reviewId, review);

  pois.forEach((poi, index) => {
    const validation = validateKnowledgePoiEntity(poi);
    if (!validation.accepted) {
      addConflict(createConflict("poi-schema-invalid", [poi?.entityId], {
        reasons: [...validation.reasons].sort(),
        index,
      }));
    }

    if (entityIdFirstSeen.has(poi?.entityId)) {
      addConflict(createConflict("duplicate-poi-entity-id", [poi?.entityId], {
        indexes: [entityIdFirstSeen.get(poi.entityId), index],
      }));
    } else {
      entityIdFirstSeen.set(poi?.entityId, index);
    }
    if (qidFirstSeen.has(poi?.wikidataId)) {
      addConflict(createConflict("duplicate-poi-wikidata-id", [qidFirstSeen.get(poi.wikidataId)?.entityId, poi?.entityId], {
        wikidataId: poi?.wikidataId,
      }));
    } else {
      qidFirstSeen.set(poi?.wikidataId, poi);
    }

    const parent = parentById.get(poi?.parentCityEntityId);
    if (!parent) {
      addConflict(createConflict("orphan-poi-parent", [poi?.entityId, poi?.parentCityEntityId], {
        parentCityEntityId: poi?.parentCityEntityId,
      }));
    } else if (parent.entityType !== "city") {
      addConflict(createConflict("poi-parent-not-city", [poi?.entityId, parent.entityId], {
        parentEntityType: parent.entityType,
      }));
    }

    const crossTypeEntity = crossTypeByEntityId.get(poi?.entityId);
    if (crossTypeEntity) {
      addConflict(createConflict("cross-type-entity-id-overlap", [poi?.entityId], {
        otherEntityType: crossTypeEntity.entityType,
      }));
    }
    const countryWithSameQid = countryByQid.get(poi?.wikidataId);
    if (countryWithSameQid) {
      addConflict(createConflict("country-poi-qid-overlap", [countryWithSameQid.entityId, poi?.entityId], {
        wikidataId: poi?.wikidataId,
      }));
    }
    const cityWithSameQid = cityByQid.get(poi?.wikidataId);
    if (cityWithSameQid) {
      addConflict(createConflict("city-poi-qid-overlap", [cityWithSameQid.entityId, poi?.entityId], {
        wikidataId: poi?.wikidataId,
      }));
    }
  });

  for (let leftIndex = 0; leftIndex < pois.length; leftIndex += 1) {
    const left = pois[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < pois.length; rightIndex += 1) {
      const right = pois[rightIndex];
      if (left?.parentCityEntityId !== right?.parentCityEntityId || left?.wikidataId === right?.wikidataId) continue;
      const relatedEntityIds = [left?.entityId, right?.entityId];
      if (normalizeEntityLayerNameKey(left?.canonicalNameEn) === normalizeEntityLayerNameKey(right?.canonicalNameEn)) {
        addReview(createReview(
          "same-parent-poi-name-match",
          relatedEntityIds,
          "canonicalNameEn",
          "Two POI entities under the same City have the same normalized name; manual review is required and no automatic merge is performed.",
        ));
      }

      const distanceKm = entityLayerDistanceKm(left?.coordinates, right?.coordinates);
      if (distanceKm <= NEARBY_POI_DISTANCE_KM) {
        addReview(createReview(
          "same-parent-poi-coordinate-proximity",
          relatedEntityIds,
          "coordinates",
          "Two POI entities under the same City are within 50 metres; manual review is required and no automatic merge is performed.",
          { distanceKm: Number(distanceKm.toFixed(6)) },
        ));
      }
    }
  }

  return {
    pois: [...pois],
    conflicts: [...conflictsById.values()].sort((left, right) => left.conflictId.localeCompare(right.conflictId, "en")),
    reviewQueue: [...reviewsById.values()].sort((left, right) => left.reviewId.localeCompare(right.reviewId, "en")),
  };
}
