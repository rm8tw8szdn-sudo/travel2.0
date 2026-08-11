import {
  entityLayerDistanceKm,
  normalizeEntityLayerCoordinates,
  normalizeEntityLayerText,
} from "./knowledge-entity-layer-primitives.mjs";

const CITY_FORBIDDEN_INSTANCE_IDS = new Set([
  "Q5", // human
  "Q6256", // country
  "Q23442", // island
  "Q82794", // geographic region
  "Q165", // sea
  "Q23397", // lake
  "Q8502", // mountain
]);
const POI_FORBIDDEN_INSTANCE_IDS = new Set(["Q5", "Q6256"]);

function clean(value) {
  return normalizeEntityLayerText(value);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizedName(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function claimValues(entity = {}, propertyId) {
  return list(entity.claims?.[propertyId]).map((claim) => claim?.mainsnak?.datavalue?.value).filter(Boolean);
}

function claimEntityIds(entity = {}, propertyId) {
  return claimValues(entity, propertyId).map((value) => clean(value?.id || value)).filter(Boolean);
}

function claimCoordinates(entity = {}) {
  const value = claimValues(entity, "P625")[0];
  return normalizeEntityLayerCoordinates(value ? { latitude: value.latitude, longitude: value.longitude } : null);
}

function multilingualValues(value = {}) {
  return Object.values(value || {}).flatMap((entry) => list(entry).length ? list(entry).map((item) => item?.value) : [entry?.value]);
}

export function semanticFactFromWikidataEntity(entity = {}, source = {}) {
  const qid = clean(entity.id);
  if (!qid) return null;
  return {
    qid,
    labels: [...new Set([
      ...multilingualValues(entity.labels),
      ...multilingualValues(entity.aliases),
      ...Object.values(entity.sitelinks || {}).map((item) => item?.title),
    ].map(clean).filter(Boolean))],
    instanceOfIds: [...new Set(claimEntityIds(entity, "P31"))],
    countryQids: [...new Set(claimEntityIds(entity, "P17"))],
    coordinates: claimCoordinates(entity),
    sourcePath: clean(source.sourcePath),
    retrievedAt: clean(source.retrievedAt),
  };
}

function factMap(value) {
  if (value instanceof Map) return value;
  return new Map(Object.entries(value || {}).map(([qid, fact]) => [clean(qid), { ...fact, qid: clean(fact?.qid || qid) }]));
}

function compatibleName(entity = {}, fact = {}) {
  const published = [entity.canonicalNameEn, entity.canonicalNameZh, ...(entity.aliases || [])]
    .map(normalizedName).filter(Boolean);
  const reference = list(fact.labels).map(normalizedName).filter(Boolean);
  return published.some((name) => reference.some((label) => (
    name === label || (Math.min(name.length, label.length) >= 5 && (name.includes(label) || label.includes(name)))
  )));
}

function exceptionKey({ qid, entityId, kind, code, parentEntityId, expectedCountryQid } = {}) {
  return [
    clean(qid).toUpperCase(),
    clean(entityId),
    clean(kind).toLocaleLowerCase("en-US"),
    clean(parentEntityId),
    clean(expectedCountryQid).toUpperCase(),
    clean(code),
  ].join(":");
}

function validateEntity({ entity, kind, facts, countryByEntityId, cityByEntityId, exceptions, violations }) {
  const qid = clean(entity.wikidataId).toUpperCase();
  const fact = facts.get(qid);
  const parentEntityId = kind === "city"
    ? clean(entity.parentCountryEntityId)
    : kind === "poi"
      ? clean(entity.parentCityEntityId)
      : "";
  const expectedCountry = kind === "country"
    ? entity
    : kind === "city"
      ? countryByEntityId.get(entity.parentCountryEntityId)
      : countryByEntityId.get(cityByEntityId.get(entity.parentCityEntityId)?.parentCountryEntityId);
  const expectedCountryQid = clean(expectedCountry?.wikidataId);
  const add = (code, details = {}) => {
    if (!exceptions.has(exceptionKey({
      qid,
      entityId: entity.entityId,
      kind,
      parentEntityId,
      expectedCountryQid,
      code,
    }))) {
      violations.push({ qid, entityId: entity.entityId, kind, code, ...details });
    }
  };

  if (!fact) {
    add("qid-not-in-semantic-snapshot");
    return;
  }
  if (!clean(fact.sourcePath || fact.sourceUrl)) add("semantic-source-missing");
  if (!compatibleName(entity, fact)) add("canonical-name-mismatch", { labels: list(fact.labels).slice(0, 8) });

  const factCoordinates = normalizeEntityLayerCoordinates(fact.coordinates);
  const publishedCoordinates = normalizeEntityLayerCoordinates(entity.coordinates);
  if (!factCoordinates) add("semantic-coordinate-missing");
  else if (!publishedCoordinates) add("published-coordinate-missing");
  else {
    const distanceKm = entityLayerDistanceKm(publishedCoordinates, factCoordinates);
    const maximumKm = kind === "city" ? 30 : kind === "poi" ? 10 : 100;
    if (distanceKm > maximumKm) add("semantic-coordinate-mismatch", { distanceKm: Number(distanceKm.toFixed(3)), maximumKm });
  }

  const instanceIds = new Set(list(fact.instanceOfIds).map(clean));
  const forbidden = kind === "city" ? CITY_FORBIDDEN_INSTANCE_IDS : kind === "poi" ? POI_FORBIDDEN_INSTANCE_IDS : new Set();
  if ((kind === "city" || kind === "poi") && instanceIds.size === 0) {
    add("instance-type-missing");
  }
  if (list(fact.instanceOfIds).some((id) => forbidden.has(clean(id)))) add("instance-type-incompatible", { instanceOfIds: [...instanceIds] });
  if (fact.semanticClass && clean(fact.semanticClass) !== kind) add("semantic-class-mismatch", { semanticClass: fact.semanticClass });

  const factCountries = new Set(list(fact.countryQids).map(clean));
  if (kind !== "country" && expectedCountryQid && !factCountries.size) {
    add("country-claim-missing", { expectedCountryQid });
  } else if (kind !== "country" && expectedCountryQid && !factCountries.has(expectedCountryQid)) {
    add("country-claim-mismatch", { expectedCountryQid, actualCountryQids: [...factCountries] });
  }

  if (kind === "poi") {
    const parentCity = cityByEntityId.get(entity.parentCityEntityId);
    const parentCoordinates = normalizeEntityLayerCoordinates(parentCity?.coordinates);
    if (parentCoordinates && publishedCoordinates) {
      const parentDistanceKm = entityLayerDistanceKm(parentCoordinates, publishedCoordinates);
      if (parentDistanceKm > 200) add("poi-parent-distance-implausible", { parentDistanceKm: Number(parentDistanceKm.toFixed(3)) });
    }
  }
}

export function validatePublishedKnowledgeSemantics({
  countries = [],
  cities = [],
  pois = [],
  factsByQid = new Map(),
  exceptions = [],
} = {}) {
  const facts = factMap(factsByQid);
  const exceptionSet = new Set(list(exceptions).map((entry) => exceptionKey(entry)));
  const countryByEntityId = new Map(countries.map((entity) => [entity.entityId, entity]));
  const cityByEntityId = new Map(cities.map((entity) => [entity.entityId, entity]));
  const violations = [];

  for (const entity of countries) validateEntity({ entity, kind: "country", facts, countryByEntityId, cityByEntityId, exceptions: exceptionSet, violations });
  for (const entity of cities) validateEntity({ entity, kind: "city", facts, countryByEntityId, cityByEntityId, exceptions: exceptionSet, violations });
  for (const entity of pois) validateEntity({ entity, kind: "poi", facts, countryByEntityId, cityByEntityId, exceptions: exceptionSet, violations });

  return {
    accepted: violations.length === 0,
    violations,
    checked: countries.length + cities.length + pois.length,
    factCount: facts.size,
    exceptionCount: exceptionSet.size,
  };
}
