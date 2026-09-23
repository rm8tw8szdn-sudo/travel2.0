const BATCH03_CODES = Object.freeze(["LC", "VC", "ST", "SB", "TG", "TM", "TO", "AG", "CG", "GD", "GM", "KN", "BI", "GN"]);

const unique = (values) => new Set(values).size === values.length;
const stable = (entity, type) => entity?.entityType === type && /^[-a-z]+-[a-f0-9]{16}$/u.test(String(entity.entityId || "")) && /^Q\d+$/u.test(String(entity.wikidataId || ""));

export function batch03PromotionCountryCodes() { return [...BATCH03_CODES]; }

export function evaluateBatch03CountryPromotion({ country, cities = [], pois = [], routeLegEvidence = [], seasonEvidence = [], currentCatalogOnly = false } = {}) {
  const countryCode = String(country?.isoAlpha2 || "").toUpperCase();
  const reasons = [];
  if (!BATCH03_CODES.includes(countryCode) || !stable(country, "country")) reasons.push("country-identity-invalid");
  if (!currentCatalogOnly) reasons.push("country-not-catalog-only");
  if (!cities.length || !cities.every((city) => stable(city, "city") && city.parentCountryEntityId === country?.entityId)) reasons.push("destination-structure-invalid");
  const cityIds = new Set(cities.map((city) => city.entityId));
  if (!unique(cities.map((city) => city.entityId))) reasons.push("destination-identity-duplicate");
  if (!pois.length || !pois.every((poi) => stable(poi, "poi") && cityIds.has(poi.parentCityEntityId))) reasons.push("poi-structure-invalid");
  const requiredTransport = cities.length === 1 ? 0 : cities.length * (cities.length - 1);
  const requiredSeason = cities.length;
  if (routeLegEvidence.length !== requiredTransport) reasons.push("directed-transport-incomplete");
  if (!routeLegEvidence.every((entry) => entry.directed === true && entry.feasibilityStatus === "feasible" && cityIds.has(entry.fromEntityId) && cityIds.has(entry.toEntityId) && entry.fromEntityId !== entry.toEntityId)) reasons.push("directed-transport-binding-invalid");
  if (!unique(routeLegEvidence.map((entry) => `${entry.fromEntityId}>${entry.toEntityId}`))) reasons.push("directed-transport-duplicate");
  if (seasonEvidence.length !== requiredSeason) reasons.push("season-profile-incomplete");
  if (!seasonEvidence.every((entry) => cityIds.has(entry.entityId) && Number.isInteger(entry.month) && entry.month >= 1 && entry.month <= 12 && Array.isArray(entry.weatherRisks) && entry.weatherRisks.length > 0)) reasons.push("season-profile-binding-invalid");
  if (!unique(seasonEvidence.map((entry) => entry.entityId)) || !cities.every((city) => seasonEvidence.some((entry) => entry.entityId === city.entityId))) reasons.push("season-profile-coverage-invalid");
  return Object.freeze({ countryCode, eligible: reasons.length === 0, reasons: Object.freeze(reasons), requiredTransport, admittedTransport: routeLegEvidence.length, requiredSeason, admittedSeason: seasonEvidence.length, transportExempt: cities.length === 1 && requiredTransport === 0 });
}
