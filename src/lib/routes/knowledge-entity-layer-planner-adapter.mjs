import { createTravelRegionCatalog } from "./route-search-region-taxonomy.mjs";

function clean(value) {
  return String(value || "").trim().replace(/\s+/gu, " ");
}

function clone(value) {
  return structuredClone(value);
}

function uniqueText(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function normalizedKey(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function coordinatesFor(entity = {}) {
  const latitude = Number(entity.coordinates?.latitude);
  const longitude = Number(entity.coordinates?.longitude);
  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function publicCountry(country = {}) {
  return {
    entityId: clean(country.entityId),
    wikidataId: clean(country.wikidataId),
    countryCode: clean(country.isoAlpha2).toUpperCase(),
    isoAlpha2: clean(country.isoAlpha2).toUpperCase(),
    name: clean(country.canonicalNameZh || country.canonicalNameEn),
    canonicalNameZh: clean(country.canonicalNameZh),
    canonicalNameEn: clean(country.canonicalNameEn),
    aliases: uniqueText(country.aliases),
    entityTypeName: "country",
    ...coordinatesFor(country),
  };
}

function publicPoi(poi = {}) {
  return {
    entityId: clean(poi.entityId),
    parentCityEntityId: clean(poi.parentCityEntityId),
    wikidataId: clean(poi.wikidataId),
    name: clean(poi.canonicalNameZh || poi.canonicalNameEn),
    canonicalNameZh: clean(poi.canonicalNameZh),
    canonicalNameEn: clean(poi.canonicalNameEn),
    aliases: uniqueText(poi.aliases),
    entityTypeName: "poi",
    ...coordinatesFor(poi),
  };
}

function plannerDestination(country, city, pois = []) {
  const countryEntity = publicCountry(country);
  return {
    entityId: clean(city.entityId),
    parentCountryEntityId: clean(city.parentCountryEntityId),
    wikidataId: clean(city.wikidataId),
    countryCode: countryEntity.countryCode,
    name: clean(city.canonicalNameZh || city.canonicalNameEn),
    sourceTitle: clean(city.canonicalNameEn || city.canonicalNameZh),
    canonicalTitle: clean(city.canonicalNameEn || city.canonicalNameZh),
    canonicalNameZh: clean(city.canonicalNameZh),
    canonicalNameEn: clean(city.canonicalNameEn),
    aliases: uniqueText(city.aliases),
    entityTypeName: "city",
    ...coordinatesFor(city),
    countryEntity,
    poiEntities: pois.map(publicPoi),
    destinationSource: "knowledge-entity-layer",
  };
}

function destinationIdentity(destination = {}) {
  const wikidataId = clean(destination.wikidataId).toUpperCase();
  if (wikidataId) return `qid:${wikidataId}`;
  const entityId = clean(destination.entityId);
  if (entityId) return `entity:${entityId}`;
  return `name:${clean(destination.countryCode).toUpperCase()}:${normalizedKey(
    destination.canonicalNameEn || destination.canonicalNameZh || destination.name,
  )}`;
}

function mergeDestinations(primary = [], fallback = []) {
  const merged = [];
  const seen = new Set();
  for (const destination of [...primary, ...fallback]) {
    if (!destination || typeof destination !== "object") continue;
    const identity = destinationIdentity(destination);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    merged.push(clone(destination));
  }
  return merged;
}

function countryCatalogItem(country = {}) {
  return Object.freeze({
    code: clean(country.isoAlpha2).toUpperCase(),
    label: clean(country.canonicalNameEn || country.canonicalNameZh),
    normalizedLabel: normalizedKey(country.canonicalNameEn || country.canonicalNameZh),
    aliases: Object.freeze(uniqueText([
      country.canonicalNameEn,
      country.canonicalNameZh,
      normalizedKey(country.canonicalNameEn || country.canonicalNameZh),
      ...(country.aliases || []),
    ])),
    entityId: clean(country.entityId),
    wikidataId: clean(country.wikidataId),
    continent: clean(country.continent?.canonicalNameEn || country.continent?.canonicalNameZh),
    continentNameEn: clean(country.continent?.canonicalNameEn),
    continentNameZh: clean(country.continent?.canonicalNameZh),
    region: clean(country.region),
    subregion: clean(country.subregion),
  });
}

function cityCatalogItem(city = {}, countryCode = "") {
  return Object.freeze({
    label: clean(city.canonicalNameEn || city.canonicalNameZh),
    normalizedLabel: normalizedKey(city.canonicalNameEn || city.canonicalNameZh),
    countryCode: clean(countryCode).toUpperCase(),
    aliases: Object.freeze(uniqueText([
      city.canonicalNameEn,
      city.canonicalNameZh,
      normalizedKey(city.canonicalNameEn || city.canonicalNameZh),
      ...(city.aliases || []),
    ])),
    entityId: clean(city.entityId),
    wikidataId: clean(city.wikidataId),
    ...coordinatesFor(city),
  });
}

function assertPlannerRepository(repository) {
  if (
    !repository?.listCountries
    || !repository?.listCities
    || !repository?.listCitiesByCountry
    || !repository?.listPoisByCity
  ) {
    throw new Error("KNOWLEDGE_ENTITY_LAYER_REPOSITORY_REQUIRED");
  }
}

export function createKnowledgeEntityLayerPlannerAdapter({
  repository,
  fallbackKnowledgeGraph = null,
} = {}) {
  assertPlannerRepository(repository);
  const countries = repository.listCountries();
  const countryByCode = new Map(countries.map((country) => [clean(country.isoAlpha2).toUpperCase(), country]));
  const destinationsByCountry = new Map(countries.map((country) => [
    clean(country.isoAlpha2).toUpperCase(),
    repository.listCitiesByCountry(country.entityId).map((city) => plannerDestination(
      country,
      city,
      repository.listPoisByCity(city.entityId),
    )),
  ]));

  return Object.freeze({
    queryDestinations(query = {}) {
      const countryCode = clean(query.country).toUpperCase();
      const limit = Math.max(1, Number(query.limit) || 12);
      const entityDestinations = countryByCode.has(countryCode)
        ? destinationsByCountry.get(countryCode) || []
        : [];
      const fallback = fallbackKnowledgeGraph?.queryDestinations?.(query) || [];
      return mergeDestinations(entityDestinations, fallback).slice(0, limit).map(clone);
    },
  });
}

export function createKnowledgeEntityLayerSearchIntentCatalog({ repository } = {}) {
  assertPlannerRepository(repository);
  const countries = repository.listCountries();
  const countryCodeByEntityId = new Map(countries.map((country) => [country.entityId, country.isoAlpha2]));
  const countryCatalog = countries.map(countryCatalogItem);
  return Object.freeze({
    countries: Object.freeze(countryCatalog),
    cities: Object.freeze(repository.listCities().map((city) => cityCatalogItem(
      city,
      countryCodeByEntityId.get(city.parentCountryEntityId),
    ))),
    regions: createTravelRegionCatalog(countryCatalog),
  });
}
