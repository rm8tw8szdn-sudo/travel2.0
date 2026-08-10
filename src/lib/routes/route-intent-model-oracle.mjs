import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  createRouteIntentFingerprint,
  normalizeRouteIntent,
  readRouteIntentEnvelope,
  validateNormalizedRouteIntent,
} from "./route-intent-model.mjs";
import {
  ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS,
  ROUTE_V2_TRAVEL_REGION_DEFINITIONS,
  canonicalizeTravelRegionKey,
  resolveTravelRegionDefinition,
} from "./route-search-region-taxonomy.mjs";

const tidy = (value) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}]+/gu, "");
const id = (value) => {
  const token = String(value ?? "").trim();
  return /^q\d+$/iu.test(token) || /^[a-z]{2}$/iu.test(token) ? token.toUpperCase() : token;
};

function destinations(route = {}) {
  if (Array.isArray(route.destinations) && route.destinations.every((entry) => entry && typeof entry === "object")) {
    const entries = route.destinations.map((entry) => ({
      id: id(entry.wikidataId || entry.qid || entry.id || entry.entityId),
      name: tidy(entry.name),
      country: id(entry.countryCode),
      region: tidy(entry.region || entry.regionName),
      entityTypeName: String(entry.entityTypeName || entry.entityType || "").trim().toLocaleLowerCase("en-US"),
    }));
    if (!Array.isArray(route.proposedOrder) || !route.proposedOrder.length) return entries;
    const lookup = new Map(entries.flatMap((entry) => [[entry.id, entry], [entry.name, entry]].filter(([key]) => key)));
    return route.proposedOrder.map((entry) => lookup.get(id(entry)) || lookup.get(tidy(entry)) || { id: id(entry), name: "", country: "", region: "" });
  }
  const names = Array.isArray(route.destinations) ? route.destinations : [];
  const entities = Array.isArray(route.destinationEntities) ? route.destinationEntities : [];
  return Array.from({ length: Math.max(names.length, entities.length) }, (_, index) => {
    const entity = entities[index] || {};
    const raw = names[index];
    return {
      id: id(entity.wikidataId || entity.qid || entity.id || entity.entityId),
      name: tidy(entity.name || (typeof raw === "string" ? raw : "")),
      country: id(entity.countryCode),
      region: tidy(entity.region || entity.regionName),
      entityTypeName: String(entity.entityTypeName || entity.entityType || "").trim().toLocaleLowerCase("en-US"),
    };
  }).filter((entry) => entry.id || entry.name);
}

function days(route) {
  const direct = Number(route?.durationDays);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const match = String(route?.recommendedDays || "").match(/\d+/u);
  return match ? Number(match[0]) : null;
}

function monthValues(route) {
  const values = [
    ...(Array.isArray(route?.timeIntent?.months) ? route.timeIntent.months : []),
    ...(Array.isArray(route?.routeTimeIntent?.months) ? route.routeTimeIntent.months : []),
  ].map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 12);
  return [...new Set(values)];
}

function hasTimeEvidence(route = {}) {
  return [
    route.evidenceValidationStatus,
    route.evidenceStatus,
    route.timeIntent?.evidenceStatus,
    route.routeTimeIntent?.evidenceStatus,
  ].map((value) => String(value ?? "").trim().toLocaleLowerCase("en-US"))
    .some((value) => ["ready", "complete", "supported", "validated", "passed"].includes(value));
}

function oracleSubnationalRegion(value) {
  return resolveTravelRegionDefinition(
    canonicalizeTravelRegionKey(value),
    ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS,
  );
}

function oracleDestinationMatchesRegion(point = {}, definition = null) {
  if (!definition) return false;
  const known = new Set((definition.knownDestinationIds || []).map(id));
  return Boolean(point.id) && known.has(id(point.id));
}

const EXPLICIT_THEME_RULES = new Map([
  ["family", { labels: ["family", "familytrip", "亲子", "家庭旅行"], styles: [] }],
  ["hiking", { labels: ["hiking", "trekking", "trek", "徒步", "健行"], styles: ["hiking", "trekking"] }],
  ["honeymoon", { labels: ["honeymoon", "蜜月"], styles: [] }],
  ["selfdrive", { labels: ["selfdrive", "roadtrip", "自驾", "公路"], styles: ["roadtrip"] }],
  ["islandvacation", { labels: ["islandvacation", "islandhopping", "beachvacation", "海岛度假", "跳岛"], styles: ["islandhopping"] }],
  ["ringroad", { labels: ["ringroad", "islandcircuit", "环岛"], styles: ["roadtrip"] }],
  ["weekendshorttrip", { labels: ["weekendshorttrip", "weekendgetaway", "weekendbreak", "周末短途", "周末旅行"], styles: ["citybreak"], maxDays: 3 }],
  ["citywalk", { labels: ["citywalk", "urbanwalk", "城市漫游"], styles: ["citybreak", "deepdive"], routeModes: ["citywalk"] }],
]);

function oracleThemeCompatible(route = {}, requestedTheme = "") {
  const rule = EXPLICIT_THEME_RULES.get(tidy(requestedTheme));
  if (!rule) return false;
  const generatedFallback = String(route.destinationSource || "").trim() === "search-knowledge-graph-fallback"
    || String(route.contentEvidence?.provider || "").trim() === "search-v1-fallback";
  const labels = generatedFallback
    ? new Set()
    : new Set([
        ...(Array.isArray(route.themes) ? route.themes : []),
        ...(Array.isArray(route.tags) ? route.tags : []),
        ...(Array.isArray(route.supportedThemes) ? route.supportedThemes : []),
        ...(Array.isArray(route.themeCompatibility) ? route.themeCompatibility : []),
      ].map(tidy).filter(Boolean));
  const styles = new Set([
    route.travelStyle,
    route.travelStyleConceptKey,
    route.contentEvidence?.travelStyle,
    route.contentEvidence?.concept?.travelStyle,
  ].map(tidy).filter(Boolean));
  const durationCompatible = !Number.isInteger(rule.maxDays)
    || (days(route) != null && days(route) <= rule.maxDays);
  return durationCompatible && (
    rule.labels.some((value) => labels.has(tidy(value)))
    || rule.styles.some((value) => styles.has(tidy(value)))
    || (rule.routeModes || []).some((value) => tidy(value) === tidy(route.routeReferenceMode))
  );
}

export function evaluateRouteIntentOracle(normalizedIntentInput, route = {}, options = {}) {
  const intent = normalizeRouteIntent(normalizedIntentInput);
  const schemaValidation = validateNormalizedRouteIntent(intent);
  if (!schemaValidation.valid) {
    return {
      matched: false,
      outcome: "constraint-conflict",
      violationCodes: ["route-intent-schema-invalid"],
      requiresEvidence: false,
      fingerprint: "",
    };
  }
  const points = destinations(route);
  const constraintPoints = String(route.routeReferenceMode || "").trim() === "citywalk"
    ? points.filter((entry) => entry.entityTypeName !== "poi")
    : points;
  const violations = [];
  const pointKeys = points.map((entry) => entry.id || entry.name).filter(Boolean);
  if (new Set(pointKeys).size !== pointKeys.length) violations.push("duplicate-route-city");
  const required = intent.hardConstraints.requiredCities;
  if (required.state === "provided") {
    const actualKeys = constraintPoints.map((entry) => entry.id || entry.name);
    const expectedKeys = required.values.map((entry) => id(entry.id) || tidy(entry.name));
    const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
    if (missing.length) violations.push("required-city-missing");
    if (actualKeys.length > expectedKeys.length) violations.push("unexpected-city-added");
    if (actualKeys.length < expectedKeys.length) violations.push("required-city-count-mismatch");
    if (intent.hardConstraints.destinationOrderMode.value === "fixed"
      && expectedKeys.length === actualKeys.length
      && expectedKeys.some((key, index) => key !== actualKeys[index])) {
      violations.push("fixed-order-mismatch");
    }
  }
  const expectedDays = intent.hardConstraints.exactDays;
  if (expectedDays.state === "provided" && expectedDays.value !== days(route)) violations.push("exact-days-mismatch");
  const capacity = intent.hardConstraints.routeCapacity;
  const capacityDemand = Math.max(constraintPoints.length, required.state === "provided" ? required.values.length : 0);
  if (capacity.state === "provided" && Number.isInteger(capacity.value) && capacityDemand > capacity.value) violations.push("duration-capacity-conflict");

  const expectedCountry = intent.hardConstraints.country;
  const expectedCountries = intent.hardConstraints.countries;
  const expectedRegion = intent.hardConstraints.region;
  const regionScopedCountrySet = expectedRegion.state === "provided"
    && expectedRegion.value
    && expectedCountry.state !== "provided"
    && expectedCountries?.state === "provided"
    && expectedCountries.values.length > 0;
  const pointCountries = constraintPoints.map((entry) => entry.country).filter(Boolean);
  const authoritativeCountries = pointCountries.length
    ? pointCountries
    : Array.isArray(route.countryEntities) && route.countryEntities.length
      ? route.countryEntities.map((entry) => id(entry?.countryCode || entry?.entityId))
      : Array.isArray(route.countryCodes) && route.countryCodes.length
      ? route.countryCodes.map(id)
      : Array.isArray(route.countries) && route.countries.some((entry) => /^[a-z]{2}$/iu.test(String(entry)))
        ? route.countries.filter((entry) => /^[a-z]{2}$/iu.test(String(entry))).map(id)
        : [];
  const orderedCountries = [...new Set(authoritativeCountries.filter(Boolean))];
  const countries = new Set(authoritativeCountries.filter(Boolean));
  if (expectedCountries?.state === "provided" && expectedCountries.values.length) {
    if (regionScopedCountrySet) {
      const allowed = new Set(expectedCountries.values.map(id));
      if (!countries.size || [...countries].some((country) => !allowed.has(country))) violations.push("region-country-mismatch");
    } else if (countries.size !== expectedCountries.values.length
      || expectedCountries.values.some((country) => !countries.has(country))) violations.push("country-mismatch");
  } else if (expectedCountry.state === "provided" && expectedCountry.value
    && (countries.size !== 1 || !countries.has(expectedCountry.value))) {
    violations.push("country-mismatch");
  }
  const exactCountrySetMatches = expectedCountries?.state === "provided"
    && expectedCountries.values.length === countries.size
    && expectedCountries.values.every((country) => countries.has(country));
  if (!regionScopedCountrySet
    && exactCountrySetMatches
    && expectedCountries.values.length > 1
    && intent.hardConstraints.destinationOrderMode.value === "fixed"
    && expectedCountries.values.some((country, index) => country !== orderedCountries[index])) {
    violations.push("fixed-country-order-mismatch");
  }

  const regions = new Set([
    ...points.map((entry) => entry.region),
    ...(Array.isArray(route.regions) ? route.regions.map(tidy) : []),
    tidy(route.region || route.regionEntityId),
  ].filter(Boolean));
  if (expectedRegion.state === "provided" && expectedRegion.value) {
    const localRegion = oracleSubnationalRegion(expectedRegion.value);
    const macroRegion = resolveTravelRegionDefinition(
      canonicalizeTravelRegionKey(expectedRegion.value),
      ROUTE_V2_TRAVEL_REGION_DEFINITIONS,
    );
    if (!localRegion && !macroRegion) {
      violations.push("region-definition-missing");
    } else if (localRegion) {
      if (!(localRegion.knownDestinationIds || []).length) violations.push("unsupported-region");
      else if (!constraintPoints.length
        || constraintPoints.some((point) => !oracleDestinationMatchesRegion(point, localRegion))) {
        violations.push("region-mismatch");
      }
    } else if (!regionScopedCountrySet && !regions.has(tidy(macroRegion.key))) {
      violations.push("region-mismatch");
    }
  }

  let requiresEvidence = false;
  const expectedMonths = intent.hardConstraints.months;
  const actualMonths = monthValues(route);
  if (expectedMonths.state === "provided" && expectedMonths.values.length) {
    if (!actualMonths.length) requiresEvidence = true;
    else if (expectedMonths.values.some((month) => !actualMonths.includes(month))) violations.push("month-conflict");
    else if (!hasTimeEvidence(route)) requiresEvidence = true;
  }
  const expectedSeason = intent.hardConstraints.season;
  const seasons = new Set([
    route.timeIntent?.season,
    route.routeTimeIntent?.season,
    route.season,
    ...(Array.isArray(route.seasons) ? route.seasons : []),
  ].map(tidy).filter(Boolean));
  if (expectedSeason.state === "provided" && expectedSeason.value) {
    if (!seasons.size) requiresEvidence = true;
    else if (!seasons.has(expectedSeason.value)) violations.push("season-conflict");
    else if (!hasTimeEvidence(route)) requiresEvidence = true;
  }
  if (intent.hardConstraints.invalidTime) violations.push("invalid-time-intent");
  if (intent.softPreferences.themeConstraintMode === "explicit"
    && intent.softPreferences.theme
    && !oracleThemeCompatible(route, intent.softPreferences.theme)) {
    violations.push("explicit-theme-mismatch");
  }

  const expectedFingerprint = createRouteIntentFingerprint(intent).value;
  const envelope = readRouteIntentEnvelope(route);
  if (options.requireFingerprint !== false) {
    if (!envelope.valid) violations.push(envelope.claimed ? "route-intent-schema-invalid" : "route-intent-fingerprint-missing");
    else {
      if (envelope.fingerprintVersion !== ROUTE_INTENT_FINGERPRINT_VERSION) violations.push("route-intent-fingerprint-version-mismatch");
      if (envelope.fingerprint !== expectedFingerprint) violations.push("route-intent-fingerprint-mismatch");
      if (createRouteIntentFingerprint(envelope.normalizedIntent).value !== envelope.fingerprint) violations.push("route-intent-envelope-tampered");
    }
  } else if (envelope.valid && envelope.fingerprint !== expectedFingerprint) {
    violations.push("route-intent-fingerprint-mismatch");
  } else if (envelope.claimed && !envelope.valid) {
    violations.push("route-intent-schema-invalid");
  }
  const statuses = [route.outcome, route.status, route.constraintStatus, route.publicationGate?.status]
    .map((value) => String(value ?? "").trim());
  const claimsSuccess = route.accepted === true
    || route.success === true
    || route.feedReady === true
    || statuses.some((status) => ["success", "accepted", "mediaReady", "ready-for-display", "search-generated", "needs-review"].includes(status));
  if (claimsSuccess && statuses.some((status) => ["rejected", "conflict", "invalid", "failed", "not-publishable"].includes(status))) {
    violations.push("rejected-result-repackaged-as-success");
  }
  const result = [...new Set(violations)].sort();
  return {
    matched: result.length === 0,
    outcome: result.length ? "constraint-conflict" : requiresEvidence ? "needs-evidence" : "success",
    violationCodes: result,
    requiresEvidence,
    fingerprint: expectedFingerprint,
  };
}
