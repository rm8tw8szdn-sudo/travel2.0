function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizedIntent(value = {}) {
  return value.normalizedRouteIntent
    || value.inputIntentSnapshot?.normalizedRouteIntent
    || value.inputContext?.normalizedRouteIntent
    || value.routeIntent
    || null;
}

function requiredCityCount(value = {}) {
  const values = list(normalizedIntent(value)?.hardConstraints?.requiredCities?.values);
  return values.length || list(value.requiredDestinationIds).length;
}

function requiredCountryCount(value = {}) {
  const values = list(normalizedIntent(value)?.hardConstraints?.countries?.values);
  const codes = values.length ? values : list(value.requiredCountryCodes);
  return new Set(codes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)).size;
}

export function allowsExplicitSingleCityRoute(value = {}) {
  return requiredCityCount(value) === 1 && requiredCountryCount(value) <= 1;
}

export function minimumRouteDestinationCount(value = {}) {
  return allowsExplicitSingleCityRoute(value) ? 1 : 2;
}
