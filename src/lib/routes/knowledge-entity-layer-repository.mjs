function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sortCities(cities) {
  return [...cities].sort((left, right) => left.parentCountryEntityId.localeCompare(right.parentCountryEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

function sortPois(pois) {
  return [...pois].sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en")
    || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en")
    || left.wikidataId.localeCompare(right.wikidataId, "en"));
}

export function createKnowledgeEntityLayerRepository({ countries = [], cities = [], pois = [] } = {}) {
  const allEntities = [...countries, ...cities, ...pois];
  const entityById = new Map();
  const duplicateEntityIds = new Set();

  for (const entity of allEntities) {
    if (entityById.has(entity.entityId)) duplicateEntityIds.add(entity.entityId);
    else entityById.set(entity.entityId, clone(entity));
  }

  const stableCities = sortCities(cities).map(clone);
  const stablePois = sortPois(pois).map(clone);

  return Object.freeze({
    getEntity(entityId) {
      return clone(entityById.get(entityId));
    },

    listCities() {
      return stableCities.map(clone);
    },

    listCitiesByCountry(countryEntityId) {
      return stableCities
        .filter((city) => city.parentCountryEntityId === countryEntityId)
        .map(clone);
    },

    listPois() {
      return stablePois.map(clone);
    },

    listPoisByCity(cityEntityId) {
      return stablePois
        .filter((poi) => poi.parentCityEntityId === cityEntityId)
        .map(clone);
    },

    validateParentReferences() {
      const reasons = [...duplicateEntityIds]
        .sort()
        .map((entityId) => ({ type: "duplicate-entity-id", entityId }));

      for (const city of stableCities) {
        const parent = entityById.get(city.parentCountryEntityId);
        if (!parent) {
          reasons.push({
            type: "orphan-city-parent",
            entityId: city.entityId,
            parentCountryEntityId: city.parentCountryEntityId,
          });
        } else if (parent.entityType !== "country") {
          reasons.push({
            type: "city-parent-not-country",
            entityId: city.entityId,
            parentCountryEntityId: city.parentCountryEntityId,
            parentEntityType: parent.entityType,
          });
        }
      }

      for (const poi of stablePois) {
        const parent = entityById.get(poi.parentCityEntityId);
        if (!parent) {
          reasons.push({
            type: "orphan-poi-parent",
            entityId: poi.entityId,
            parentCityEntityId: poi.parentCityEntityId,
          });
        } else if (parent.entityType !== "city") {
          reasons.push({
            type: "poi-parent-not-city",
            entityId: poi.entityId,
            parentCityEntityId: poi.parentCityEntityId,
            parentEntityType: parent.entityType,
          });
        }
      }

      reasons.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
      return { accepted: reasons.length === 0, reasons };
    },
  });
}
