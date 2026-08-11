function roundedPercentage(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

export function createKnowledgeCoverageSemantics({
  countries = [],
  cities = [],
  pois = [],
  routeLegEvidence = [],
  seasonEvidence = [],
} = {}) {
  const countryCodeByEntityId = new Map(countries.map((country) => [
    country.entityId,
    String(country.isoAlpha2 || country.countryCode || "").toUpperCase(),
  ]));
  const cityCountryCodeByEntityId = new Map(cities.map((city) => [
    city.entityId,
    countryCodeByEntityId.get(city.parentCountryEntityId) || String(city.countryCode || "").toUpperCase(),
  ]));
  const catalogCodes = new Set([...countryCodeByEntityId.values()].filter(Boolean));
  const cityCodes = new Set([...cityCountryCodeByEntityId.values()].filter(Boolean));
  const poiCodes = new Set(pois
    .map((poi) => cityCountryCodeByEntityId.get(poi.parentCityEntityId))
    .filter(Boolean));
  const transportCodes = new Set(routeLegEvidence.flatMap((leg) => [
    cityCountryCodeByEntityId.get(leg.fromEntityId),
    cityCountryCodeByEntityId.get(leg.toEntityId),
  ]).filter(Boolean));
  const seasonCodes = new Set(seasonEvidence
    .map((entry) => cityCountryCodeByEntityId.get(entry.entityId))
    .filter(Boolean));

  const sorted = (values) => [...values].sort();
  const plannableCodes = sorted([...catalogCodes].filter((code) => cityCodes.has(code) && poiCodes.has(code)));
  const evidenceBackedCodes = plannableCodes.filter((code) => transportCodes.has(code) && seasonCodes.has(code));
  const countryOnlyCodes = sorted([...catalogCodes].filter((code) => !plannableCodes.includes(code)));
  const catalogCountries = catalogCodes.size;

  return Object.freeze({
    catalogCountries,
    plannableCountries: plannableCodes.length,
    evidenceBackedCountries: evidenceBackedCodes.length,
    countryOnlyCountries: countryOnlyCodes.length,
    plannablePercentage: roundedPercentage(plannableCodes.length, catalogCountries),
    evidenceBackedPercentage: roundedPercentage(evidenceBackedCodes.length, catalogCountries),
    plannableCountryCodes: Object.freeze(plannableCodes),
    evidenceBackedCountryCodes: Object.freeze(evidenceBackedCodes),
    countryOnlyCountryCodes: Object.freeze(countryOnlyCodes),
    definitions: Object.freeze({
      catalogCountries: "Published Country entities.",
      plannableCountries: "Catalog countries with at least one typed City and one published POI.",
      evidenceBackedCountries: "Plannable countries also touched by directed transport and objective month-risk Evidence.",
    }),
  });
}
