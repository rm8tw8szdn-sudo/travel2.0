const BATCH01_CODES = Object.freeze(["BB", "BZ", "CV", "DM", "MN", "RW", "SC", "SM", "TT", "UG", "ZM", "ZW"]);

function unique(values) {
  return new Set(values).size === values.length;
}

function stableEntity(entity, type) {
  return entity?.entityType === type
    && /^[-a-z]+-[a-f0-9]{16}$/u.test(String(entity.entityId || ""))
    && /^Q\d+$/u.test(String(entity.wikidataId || ""))
    && Boolean(String(entity.canonicalNameEn || "").trim());
}

export function evaluateBatch01CountryPromotion({
  country,
  cities = [],
  pois = [],
  routeLegEvidence = [],
  seasonEvidence = [],
  requiredDirectedTransportSegments,
  requiredSeasonMonthProfiles,
  currentCatalogOnly = false,
} = {}) {
  const countryCode = String(country?.isoAlpha2 || "").toUpperCase();
  const reasons = [];
  if (!BATCH01_CODES.includes(countryCode) || !stableEntity(country, "country")) reasons.push("country-identity-invalid");
  if (!currentCatalogOnly) reasons.push("country-not-catalog-only");
  if (!cities.length) reasons.push("destination-depth-missing");
  if (!cities.every((city) => stableEntity(city, "city") && city.parentCountryEntityId === country?.entityId)) reasons.push("destination-identity-invalid");
  if (!unique(cities.map((city) => city.entityId)) || !unique(cities.map((city) => city.wikidataId)) || !unique(cities.map((city) => city.canonicalNameEn.toLocaleLowerCase("en-US")))) reasons.push("destination-identity-duplicate");
  const cityIds = new Set(cities.map((city) => city.entityId));
  if (!pois.length) reasons.push("poi-depth-missing");
  if (!pois.every((poi) => stableEntity(poi, "poi") && cityIds.has(poi.parentCityEntityId))) reasons.push("poi-ownership-invalid");
  if (!unique(pois.map((poi) => poi.entityId)) || !unique(pois.map((poi) => poi.wikidataId))) reasons.push("poi-identity-duplicate");

  const requiredTransport = Number(requiredDirectedTransportSegments);
  const requiredSeason = Number(requiredSeasonMonthProfiles);
  const singleDestination = cities.length === 1;
  const singleDestinationExemption = singleDestination && requiredTransport === 0 && routeLegEvidence.length === 0;
  if (singleDestination && !singleDestinationExemption) reasons.push("single-destination-transport-exemption-invalid");
  if (!singleDestination && (!Number.isInteger(requiredTransport) || requiredTransport <= 0 || routeLegEvidence.length !== requiredTransport)) reasons.push("directed-transport-incomplete");
  if (!routeLegEvidence.every((entry) => entry.directed === true
    && entry.feasibilityStatus === "feasible"
    && cityIds.has(entry.fromEntityId)
    && cityIds.has(entry.toEntityId)
    && entry.fromEntityId !== entry.toEntityId)) reasons.push("directed-transport-binding-invalid");
  if (!unique(routeLegEvidence.map((entry) => `${entry.fromEntityId}>${entry.toEntityId}`))) reasons.push("directed-transport-duplicate");

  if (!Number.isInteger(requiredSeason) || requiredSeason !== cities.length || seasonEvidence.length !== requiredSeason) reasons.push("season-profile-incomplete");
  if (!seasonEvidence.every((entry) => cityIds.has(entry.entityId)
    && Number.isInteger(entry.month)
    && entry.month >= 1
    && entry.month <= 12
    && Array.isArray(entry.weatherRisks)
    && entry.weatherRisks.length > 0)) reasons.push("season-profile-binding-invalid");
  if (!unique(seasonEvidence.map((entry) => entry.entityId)) || !cities.every((city) => seasonEvidence.some((entry) => entry.entityId === city.entityId))) reasons.push("season-profile-coverage-invalid");

  return Object.freeze({
    countryCode,
    eligible: reasons.length === 0,
    reasons: Object.freeze(reasons),
    identity: reasons.every((reason) => !reason.startsWith("country-") && !reason.startsWith("destination-identity")),
    destinationPoi: reasons.every((reason) => !reason.startsWith("destination-") && !reason.startsWith("poi-")),
    transport: reasons.every((reason) => !reason.includes("transport")),
    season: reasons.every((reason) => !reason.startsWith("season-")),
    singleDestinationExemption,
    evidenceBackedEligible: reasons.length === 0 && !singleDestination && routeLegEvidence.length > 0 && seasonEvidence.length > 0,
    counts: Object.freeze({ cities: cities.length, pois: pois.length, transport: routeLegEvidence.length, season: seasonEvidence.length }),
  });
}

export function batch01PromotionCountryCodes() {
  return [...BATCH01_CODES];
}
