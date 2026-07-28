import { SEARCH_KNOWLEDGE_GRAPH_FALLBACKS } from "./search-knowledge-graph-fallbacks.mjs";
import { stableHash } from "./route-v2-utils.mjs";

function clean(value) {
  return String(value || "").trim().replace(/\s+/gu, " ");
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function countryCodesForRoute(route = {}) {
  return unique([
    ...(Array.isArray(route.countryEntities) ? route.countryEntities.map((item) => item?.countryCode) : []),
    ...(Array.isArray(route.countries) ? route.countries : []),
  ].map((code) => clean(code).toUpperCase()).filter((code) => /^[A-Z]{2}$/u.test(code)));
}

function durationForRoute(route = {}) {
  const direct = Number(route.durationDays);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const matched = clean(route.recommendedDays).match(/\d{1,2}/u);
  return matched ? Number(matched[0]) : null;
}

function requestedMonths(intent = {}) {
  return ["single-month", "month-range"].includes(intent.timeIntent?.type)
    ? [...new Set((intent.timeIntent.months || []).map(Number).filter((month) => month >= 1 && month <= 12))]
    : [];
}

function monthsFromText(value) {
  const text = clean(value);
  const result = new Set();
  for (const match of text.matchAll(/(?<!\d)(\d{1,2})\s*(?:-|至|到|–|—)\s*(\d{1,2})\s*月/gu)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start < 1 || start > 12 || end < 1 || end > 12) continue;
    let cursor = start;
    for (let count = 0; count < 12; count += 1) {
      result.add(cursor);
      if (cursor === end) break;
      cursor = cursor === 12 ? 1 : cursor + 1;
    }
  }
  for (const match of text.matchAll(/(?<!\d)(\d{1,2})\s*月/gu)) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 12) result.add(month);
  }
  return result;
}

function routeMonths(route = {}) {
  const values = [
    ...(Array.isArray(route.bestMonths) ? route.bestMonths : []),
    ...(Array.isArray(route.seasonality?.months) ? route.seasonality.months : []),
  ];
  const result = new Set();
  for (const value of values) {
    if (Number.isInteger(value) && value >= 1 && value <= 12) result.add(value);
    for (const month of monthsFromText(value)) result.add(month);
  }
  return result;
}

function routeDestinations(route = {}) {
  return unique([
    ...(Array.isArray(route.destinations) ? route.destinations : []),
    ...(Array.isArray(route.destinationEntities)
      ? route.destinationEntities.flatMap((item) => [item?.name, item?.sourceTitle, item?.canonicalTitle])
      : []),
  ]);
}

function catalogDestination(city = {}, countryCode = "") {
  const latitude = Number(city.latitude ?? city.coordinates?.latitude);
  const longitude = Number(city.longitude ?? city.coordinates?.longitude);
  return {
    entityId: clean(city.entityId),
    wikidataId: clean(city.wikidataId),
    countryCode: clean(countryCode || city.countryCode).toUpperCase(),
    name: clean(city.label || city.name || city.canonicalNameZh || city.canonicalNameEn),
    sourceTitle: clean(city.normalizedLabel || city.sourceTitle || city.canonicalNameEn || city.label || city.name),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function destinationIdentity(destination = {}) {
  return clean(destination.entityId || destination.wikidataId)
    || `${clean(destination.countryCode).toUpperCase()}:${normalize(destination.sourceTitle || destination.name)}`;
}

function mergeDestinations(values = []) {
  const merged = [];
  const seen = new Set();
  for (const destination of values) {
    const normalized = catalogDestination(destination, destination.countryCode);
    const identity = destinationIdentity(normalized);
    if (!identity || !normalized.name || seen.has(identity)) continue;
    seen.add(identity);
    merged.push(normalized);
  }
  return merged;
}

function radians(value) {
  return Number(value) * Math.PI / 180;
}

function distanceKm(left = {}, right = {}) {
  if (![left.latitude, left.longitude, right.latitude, right.longitude].every(Number.isFinite)) return null;
  const deltaLatitude = radians(right.latitude - left.latitude);
  const deltaLongitude = radians(right.longitude - left.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function maxSuggestedDestinationsForDuration(durationDays) {
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) return 4;
  if (days <= 3) return 2;
  if (days <= 6) return 3;
  if (days <= 10) return 4;
  if (days <= 14) return 5;
  return 6;
}

function shortTripDistanceLimit(durationDays) {
  const days = Number(durationDays);
  if (days <= 2) return 180;
  if (days <= 3) return 280;
  return 520;
}

function hasGroundedShortTripPair(destinations, durationDays) {
  const thresholdKm = shortTripDistanceLimit(durationDays);
  return destinations.some((left, index) => destinations.slice(index + 1).some((right) => {
    const distance = distanceKm(left, right);
    return Number.isFinite(distance) && distance <= thresholdKm;
  }));
}

function geographicallyBoundedPool(destinations, durationDays, seed) {
  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0 || days > 6) return destinations;
  const thresholdKm = shortTripDistanceLimit(days);
  const candidates = destinations.map((anchor) => ({
    anchor,
    nearby: destinations.filter((destination) => {
      const distance = distanceKm(anchor, destination);
      return destination === anchor || (Number.isFinite(distance) && distance <= thresholdKm);
    }),
  })).filter((entry) => entry.nearby.length >= 2);
  if (!candidates.length) return destinations;
  candidates.sort((left, right) => (
    right.nearby.length - left.nearby.length
    || stableHash({ seed, anchor: destinationIdentity(left.anchor) }).localeCompare(stableHash({ seed, anchor: destinationIdentity(right.anchor) }))
  ));
  const selected = candidates[0];
  return selected.nearby.slice().sort((left, right) => {
    if (left === selected.anchor) return -1;
    if (right === selected.anchor) return 1;
    const leftDistance = distanceKm(selected.anchor, left);
    const rightDistance = distanceKm(selected.anchor, right);
    return (leftDistance ?? Number.MAX_SAFE_INTEGER) - (rightDistance ?? Number.MAX_SAFE_INTEGER)
      || destinationIdentity(left).localeCompare(destinationIdentity(right));
  });
}

function routeCompatibility(route, intent) {
  const durationDays = Number(intent.durationDays);
  const routeDays = durationForRoute(route);
  const durationCompatible = !Number.isFinite(durationDays)
    || !routeDays
    || Math.abs(routeDays - durationDays) <= Math.max(1, Math.ceil(durationDays * 0.35));
  const months = requestedMonths(intent);
  const knownMonths = routeMonths(route);
  const monthCompatible = months.length > 0 && months.every((month) => knownMonths.has(month));
  return { durationCompatible, monthCompatible, routeDays, knownMonths: [...knownMonths].sort((a, b) => a - b) };
}

function representativeRoute(routes, intent) {
  if (!routes.length) return null;
  return routes.slice().sort((left, right) => {
    const leftCompatibility = routeCompatibility(left, intent);
    const rightCompatibility = routeCompatibility(right, intent);
    const leftDurationPenalty = Number(intent.durationDays) && leftCompatibility.routeDays
      ? Math.abs(leftCompatibility.routeDays - Number(intent.durationDays))
      : 0;
    const rightDurationPenalty = Number(intent.durationDays) && rightCompatibility.routeDays
      ? Math.abs(rightCompatibility.routeDays - Number(intent.durationDays))
      : 0;
    return Number(rightCompatibility.durationCompatible) - Number(leftCompatibility.durationCompatible)
      || Number(rightCompatibility.monthCompatible) - Number(leftCompatibility.monthCompatible)
      || leftDurationPenalty - rightDurationPenalty
      || clean(left.id).localeCompare(clean(right.id));
  })[0];
}

function countryNameFor(code, catalog = {}) {
  const country = (catalog?.countries || []).find((item) => clean(item.code).toUpperCase() === code);
  return clean(country?.label || country?.canonicalNameEn || country?.canonicalNameZh || code);
}

function buildCountryEntries({
  intent,
  acceptedRoutes,
  intentCatalog,
  minimumDestinationCountOverride = null,
}) {
  const minimumDestinationCount = Number.isInteger(minimumDestinationCountOverride)
    ? Math.max(1, minimumDestinationCountOverride)
    : Number(intent.durationDays) > 0 && Number(intent.durationDays) <= 3
      ? 2
      : 3;
  const catalogCitiesByCountry = new Map();
  for (const city of intentCatalog?.cities || []) {
    const code = clean(city.countryCode).toUpperCase();
    if (!code) continue;
    if (!catalogCitiesByCountry.has(code)) catalogCitiesByCountry.set(code, []);
    catalogCitiesByCountry.get(code).push(catalogDestination(city, code));
  }
  const routesByCountry = new Map();
  for (const route of acceptedRoutes || []) {
    const codes = countryCodesForRoute(route);
    if (codes.length !== 1 || !clean(route.id)) continue;
    if (!routesByCountry.has(codes[0])) routesByCountry.set(codes[0], []);
    routesByCountry.get(codes[0]).push(structuredClone(route));
  }
  const codes = unique([
    ...Object.keys(SEARCH_KNOWLEDGE_GRAPH_FALLBACKS),
    ...catalogCitiesByCountry.keys(),
  ]).sort();
  return codes.map((countryCode) => {
    const fallback = (SEARCH_KNOWLEDGE_GRAPH_FALLBACKS[countryCode] || [])
      .map((destination) => catalogDestination(destination, countryCode));
    const entityDestinations = mergeDestinations(catalogCitiesByCountry.get(countryCode) || []);
    const destinations = mergeDestinations([...fallback, ...entityDestinations]);
    if (destinations.length < minimumDestinationCount) return null;
    const route = representativeRoute(routesByCountry.get(countryCode) || [], intent);
    const compatibility = route ? routeCompatibility(route, intent) : {
      durationCompatible: false,
      monthCompatible: false,
      routeDays: null,
      knownMonths: [],
    };
    return {
      countryCode,
      countryName: countryNameFor(countryCode, intentCatalog),
      destinations,
      entityDestinations,
      entityDestinationCount: entityDestinations.length,
      route,
      compatibility,
    };
  }).filter(Boolean);
}

export function buildRouteDestinationSuggestion({
  intent = {},
  sessionId = "",
  acceptedRoutes = [],
  intentCatalog = null,
} = {}) {
  const requiredDestinationIds = unique(intent.requiredDestinationIds || []);
  const explicitCountryCodes = unique([
    ...(Array.isArray(intent.countryCodes) ? intent.countryCodes : []),
    intent.countryCode,
  ].map((code) => clean(code).toUpperCase()).filter((code) => /^[A-Z]{2}$/u.test(code)));
  const destinationSuggestionMode = intent.intentMode === "destination-suggestion";
  const countryScopedSuggestionMode = intent.intentMode === "specified-destination"
    && requiredDestinationIds.length === 0
    && explicitCountryCodes.length > 0;
  if ((!destinationSuggestionMode && !countryScopedSuggestionMode) || !intent.canGenerate) {
    return { ready: false, reason: "destination-suggestion-not-requested", suggestion: null };
  }
  const normalizedSessionId = clean(sessionId) || `intent:${clean(intent.intentHash)}`;
  const suggestionMode = countryScopedSuggestionMode
    ? "country-scoped-destination-suggestion"
    : "destination-suggestion";
  const seed = stableHash({ sessionId: normalizedSessionId, intentHash: clean(intent.intentHash), mode: suggestionMode });
  let entries = buildCountryEntries({
    intent,
    acceptedRoutes,
    intentCatalog,
    minimumDestinationCountOverride: countryScopedSuggestionMode ? 2 : null,
  });
  if (countryScopedSuggestionMode) {
    const allowedCountryCodes = new Set(explicitCountryCodes);
    entries = entries.filter((entry) => allowedCountryCodes.has(entry.countryCode));
  }
  if (!entries.length) return { ready: false, reason: "destination-suggestion-pool-empty", suggestion: null };

  if (Number(intent.durationDays)) {
    const durationMatches = entries.filter((entry) => entry.compatibility.durationCompatible);
    if (durationMatches.length >= 2) entries = durationMatches;
  }
  const months = requestedMonths(intent);
  if (months.length) {
    const monthMatches = entries.filter((entry) => entry.compatibility.monthCompatible);
    if (monthMatches.length >= 2) entries = monthMatches;
  }
  if (Number(intent.durationDays) > 0 && Number(intent.durationDays) <= 3) {
    const hasEntityCatalog = Array.isArray(intentCatalog?.cities) && intentCatalog.cities.length > 0;
    const locallyGrounded = entries.flatMap((entry) => {
      const shortTripDestinations = hasEntityCatalog ? entry.entityDestinations : entry.destinations;
      return shortTripDestinations.length >= 2
        && hasGroundedShortTripPair(shortTripDestinations, intent.durationDays)
        ? [{ ...entry, shortTripDestinations }]
        : [];
    });
    if (!locallyGrounded.length) {
      return { ready: false, reason: "destination-suggestion-short-trip-pool-empty", suggestion: null };
    }
    entries = locallyGrounded;
  }
  entries.sort((left, right) => stableHash({ seed, countryCode: left.countryCode })
    .localeCompare(stableHash({ seed, countryCode: right.countryCode })));
  const selected = entries[0];
  const sourcePool = Number(intent.durationDays) > 0 && Number(intent.durationDays) <= 3
    ? selected.shortTripDestinations
    : selected.destinations;
  const boundedPool = geographicallyBoundedPool(sourcePool, intent.durationDays, seed);
  const anchorCount = Math.min(maxSuggestedDestinationsForDuration(intent.durationDays), boundedPool.length);
  const anchors = boundedPool.slice(0, Math.max(2, anchorCount));
  const candidatePoolSize = Math.min(
    boundedPool.length,
    Math.max(3, maxSuggestedDestinationsForDuration(intent.durationDays) + 2),
  );
  const candidateDestinations = Number(intent.durationDays) > 0 && Number(intent.durationDays) <= 3
    ? anchors
    : boundedPool.slice(0, candidatePoolSize);
  const routeMonthsKnown = selected.compatibility.knownMonths;
  const seasonEvidencePending = months.length > 0 && !selected.compatibility.monthCompatible;
  const diagnostics = [
    {
      code: "destination-auto-selected",
      message: `Destination was selected from ${entries.length} bounded local candidates for this session.`,
    },
    ...(Number(intent.durationDays) ? [{
      code: "duration-capacity-applied",
      message: `The suggestion exposes at most ${anchorCount} destination anchors for a ${intent.durationDays}-day request.`,
    }] : []),
    ...(months.length ? [{
      code: seasonEvidencePending ? "season-evidence-required" : "existing-season-metadata-match",
      message: seasonEvidencePending
        ? "No verified local season evidence was used; explicit month suitability remains unverified."
        : "Existing route metadata influenced ordering, but local SeasonEvidence is still required before validation.",
    }] : []),
    ...(intent.timeIntent?.type === "season-only" ? [{
      code: "season-mapping-unavailable",
      message: "The vague season was preserved without inventing a month or hemisphere mapping.",
    }] : []),
  ];
  const suggestion = {
    mode: suggestionMode,
    seed,
    sessionId: normalizedSessionId,
    eligibleCount: entries.length,
    countryCode: selected.countryCode,
    countryName: selected.countryName,
    cities: anchors.map((destination) => destination.name),
    normalizedCities: anchors.map((destination) => normalize(destination.sourceTitle || destination.name)),
    destinationIds: candidateDestinations.map(destinationIdentity),
    candidateCities: candidateDestinations.map((destination) => destination.name),
    maxDestinations: maxSuggestedDestinationsForDuration(intent.durationDays),
    source: selected.route ? "accepted-route-and-local-planner-pool" : "local-planner-pool",
    sourceRouteId: clean(selected.route?.id) || null,
    sourceRouteDestinations: selected.route ? routeDestinations(selected.route) : [],
    requestedMonths: months,
    routeMonthsKnown,
    seasonEvidencePending,
    diagnostics,
  };
  return { ready: true, reason: "destination-suggestion-ready", suggestion: structuredClone(suggestion) };
}
