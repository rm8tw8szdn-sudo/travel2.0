function clean(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export const ROUTE_TRIP_CAPACITY_VERSION = "route-trip-capacity-v1";

export const ROUTE_TRIP_CAPACITY_LIMITS = Object.freeze({
  "single-city": Object.freeze({
    maxDays: null,
    maxCountries: 1,
    maxCities: 1,
    maxPois: 24,
  }),
  "single-country": Object.freeze({
    maxDays: 45,
    maxCountries: 1,
    maxCities: 8,
    maxPois: 24,
  }),
  "multi-country": Object.freeze({
    maxDays: 60,
    maxCountries: 6,
    maxCities: 12,
    maxPois: 36,
  }),
  suggestion: Object.freeze({
    maxDays: 30,
    maxCountries: 3,
    maxCities: 8,
    maxPois: 24,
  }),
});

export function maxDestinationsForTripDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) return null;
  if (days <= 2) return 2;
  if (days <= 4) return 3;
  if (days <= 7) return 4;
  if (days <= 10) return 5;
  if (days <= 14) return 6;
  if (days <= 30) return 8;
  return 12;
}

function normalizedIntentConstraints(intent = {}) {
  return intent?.normalizedRouteIntent?.hardConstraints || intent?.hardConstraints || {};
}

function requiredDestinationCount(intent = {}) {
  const direct = Array.isArray(intent.requiredDestinationIds)
    ? intent.requiredDestinationIds
    : [];
  if (direct.length) return unique(direct).length;
  const normalized = normalizedIntentConstraints(intent).requiredCities?.values;
  if (Array.isArray(normalized)) {
    return unique(normalized.map((item) => item?.id || item?.name)).length;
  }
  return unique(intent.cities || []).length;
}

function countryCodes(intent = {}) {
  const hard = normalizedIntentConstraints(intent);
  const normalizedCountries = Array.isArray(hard.countries?.values) ? hard.countries.values : [];
  const normalizedCountry = hard.country?.state === "provided" ? [hard.country.value] : [];
  return unique([
    ...(intent.countryCodes || []),
    intent.countryCode,
    ...normalizedCountries,
    ...normalizedCountry,
  ].map((value) => clean(value).toUpperCase()).filter((value) => /^[A-Z]{2}$/u.test(value)));
}

function regionCountryCodes(intent = {}) {
  return unique((intent.regionCountryCodes || [])
    .map((value) => clean(value).toUpperCase())
    .filter((value) => /^[A-Z]{2}$/u.test(value)));
}

function exactDurationDays(intent = {}) {
  const direct = Number(intent.durationDays);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const exactDays = normalizedIntentConstraints(intent).exactDays;
  const normalized = exactDays?.state === "provided" ? Number(exactDays.value) : null;
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function capacityScope(intent = {}) {
  const requiredCount = requiredDestinationCount(intent);
  const countries = countryCodes(intent);
  const regionCountries = regionCountryCodes(intent);
  if (requiredCount === 1 && countries.length <= 1 && regionCountries.length <= 1) return "single-city";
  if (countries.length > 1 || regionCountries.length > 1) return "multi-country";
  if (countries.length === 1 || requiredCount > 0) return "single-country";
  return "suggestion";
}

function expansionMode(scope, days, supported) {
  if (!supported) return "unsupported";
  if (scope === "single-city") return "open-ended";
  if (!days || days <= 10) return "curated";
  if (days <= 14) return "extended";
  return "deep-exploration";
}

function targetPoiCount({ days, mode, limit, cityCount }) {
  if (!days) return Math.min(limit, Math.max(3, cityCount * 2));
  if (mode === "curated") return Math.min(limit, Math.max(3, Math.ceil(days / 2)));
  if (mode === "extended") return Math.min(limit, Math.max(5, Math.ceil(days / 3)));
  return Math.min(limit, Math.max(9, Math.ceil(days * 0.8)));
}

export function resolveRouteTripCapacity(intent = {}) {
  const scope = capacityScope(intent);
  const limits = ROUTE_TRIP_CAPACITY_LIMITS[scope];
  const days = exactDurationDays(intent);
  const countryCount = Math.max(countryCodes(intent).length, regionCountryCodes(intent).length > 1 ? 2 : 0);
  const supported = scope === "single-city"
    || !days
    || (days <= limits.maxDays && countryCount <= limits.maxCountries);
  const mode = expansionMode(scope, days, supported);
  const maxCitiesForDays = maxDestinationsForTripDays(days) || Math.min(4, limits.maxCities);
  const targetCityCount = scope === "single-city"
    ? 1
    : Math.min(limits.maxCities, maxCitiesForDays);
  const targetPois = targetPoiCount({
    days,
    mode,
    limit: limits.maxPois,
    cityCount: targetCityCount,
  });
  return Object.freeze({
    version: ROUTE_TRIP_CAPACITY_VERSION,
    scope,
    mode,
    supported,
    requestedDays: days,
    maxSupportedDays: limits.maxDays,
    maxCountries: limits.maxCountries,
    maxCities: limits.maxCities,
    maxPois: limits.maxPois,
    targetCityCount,
    targetPoiCount: targetPois,
    reasonCode: supported ? "" : "trip-duration-capacity-exceeded",
  });
}
