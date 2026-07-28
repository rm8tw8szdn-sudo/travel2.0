import {
  ROUTE_INTENT_FINGERPRINT_VERSION,
  attachRouteIntentEnvelope,
  createRouteIntentFingerprint,
  normalizeRouteIntent,
  readRouteIntentEnvelope,
} from "./route-intent-model.mjs";

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function semantic(value) {
  return clean(value)
    .toLocaleLowerCase("en-US")
    .replace(/[·•・,，、。;；:：/\\|_()（）\[\]【】「」『』'"“”‘’`~!！?？\-–—→]+/gu, "")
    .replace(/\s+/gu, "");
}

function identity(value) {
  const token = clean(value);
  if (/^q\d+$/iu.test(token) || /^[a-z]{2}$/iu.test(token)) return token.toUpperCase();
  return token;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function routeDestinations(record = {}) {
  const entities = Array.isArray(record.destinationEntities) ? record.destinationEntities : [];
  const raw = Array.isArray(record.destinations) ? record.destinations : [];
  const candidates = Array.isArray(record.proposedOrder) && Array.isArray(record.destinations)
    && record.destinations.every((entry) => entry && typeof entry === "object")
    ? record.destinations
    : [];
  if (candidates.length) {
    const byIdentity = new Map(candidates.flatMap((entry) => {
      const id = identity(entry.wikidataId || entry.qid || entry.id || entry.entityId);
      return [[id, entry], [semantic(entry.name), entry]].filter(([key]) => key);
    }));
    return record.proposedOrder.map((token) => byIdentity.get(identity(token)) || byIdentity.get(semantic(token)) || { id: token });
  }
  const count = Math.max(entities.length, raw.length);
  return Array.from({ length: count }, (_, index) => {
    const entity = entities[index] || {};
    const rawValue = raw[index];
    const rawObject = rawValue && typeof rawValue === "object" ? rawValue : {};
    const name = rawObject.name || entity.name || entity.label || (typeof rawValue === "string" ? rawValue : "");
    return {
      id: identity(rawObject.wikidataId || rawObject.qid || rawObject.id || rawObject.entityId || entity.wikidataId || entity.qid || entity.id || entity.entityId),
      name: semantic(name),
      countryCode: identity(rawObject.countryCode || entity.countryCode),
      region: semantic(rawObject.region || rawObject.regionName || entity.region || entity.regionName),
      entityTypeName: clean(rawObject.entityTypeName || rawObject.entityType || entity.entityTypeName || entity.entityType).toLocaleLowerCase("en-US"),
    };
  }).filter((entry) => entry.id || entry.name);
}

function routeDays(record = {}) {
  const direct = Number(record.durationDays);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const match = clean(record.recommendedDays).match(/\d+/u);
  return match ? Number(match[0]) : null;
}

function routeCountryCodes(record = {}, destinations = routeDestinations(record)) {
  const countryEntities = Array.isArray(record.countryEntities)
    ? record.countryEntities.map((entry) => entry?.countryCode || entry?.entityId).map(identity).filter(Boolean)
    : [];
  if (countryEntities.length) return unique(countryEntities);
  const countryCodes = Array.isArray(record.countryCodes) ? record.countryCodes.map(identity).filter(Boolean) : [];
  if (countryCodes.length) return unique(countryCodes);
  const countries = Array.isArray(record.countries)
    ? record.countries.filter((entry) => /^[a-z]{2}$/iu.test(clean(entry))).map(identity)
    : [];
  if (countries.length) return unique(countries);
  return unique(destinations.map((entry) => entry.countryCode).filter(Boolean));
}

function routeRegions(record = {}, destinations = routeDestinations(record)) {
  return unique([
    ...(Array.isArray(record.regions) ? record.regions : []),
    record.region,
    record.regionEntityId,
    ...destinations.map((entry) => entry.region),
  ].map(semantic).filter(Boolean));
}

function routeMonths(record = {}) {
  const structured = [
    ...(Array.isArray(record.timeIntent?.months) ? record.timeIntent.months : []),
    ...(Array.isArray(record.routeTimeIntent?.months) ? record.routeTimeIntent.months : []),
  ];
  return unique(structured.map(Number).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12));
}

function routeSeasons(record = {}) {
  return unique([
    record.timeIntent?.season,
    record.routeTimeIntent?.season,
    record.season,
    ...(Array.isArray(record.seasons) ? record.seasons : []),
  ].map(semantic).filter(Boolean));
}

function timeEvidenceReady(record = {}) {
  return [
    record.evidenceValidationStatus,
    record.evidenceStatus,
    record.timeIntent?.evidenceStatus,
    record.routeTimeIntent?.evidenceStatus,
  ].map((value) => clean(value).toLocaleLowerCase("en-US"))
    .some((value) => ["ready", "complete", "supported", "validated", "passed"].includes(value));
}

function violation(code, field, expected, actual, source) {
  return { code, field, expected, actual, source: clean(source || "route-result") };
}

function requestedMatches(normalizedIntent, destinations, source, violations) {
  const required = normalizedIntent.hardConstraints.requiredCities;
  if (required.state !== "provided" || !required.values.length) return;
  const used = new Set();
  const indexes = [];
  const missing = [];
  for (const expected of required.values) {
    const index = destinations.findIndex((candidate, candidateIndex) => {
      if (used.has(candidateIndex)) return false;
      if (expected.id && candidate.id) return identity(candidate.id) === identity(expected.id);
      return Boolean(expected.name && candidate.name && semantic(candidate.name) === semantic(expected.name));
    });
    if (index < 0) missing.push(expected.id || expected.name);
    else {
      used.add(index);
      indexes.push(index);
    }
  }
  if (missing.length) {
    violations.push(violation("required-city-missing", "requiredCities", required.values.map((entry) => entry.id || entry.name), missing, source));
  }
  if (destinations.length !== required.values.length) {
    violations.push(violation(
      destinations.length > required.values.length ? "unexpected-city-added" : "required-city-count-mismatch",
      "requiredCities",
      required.values.length,
      destinations.length,
      source,
    ));
  }
  if (normalizedIntent.hardConstraints.destinationOrderMode.value === "fixed"
    && !missing.length
    && indexes.some((index, position) => index !== position)) {
    violations.push(violation("fixed-order-mismatch", "destinationOrderMode", indexes.map((_, index) => index), indexes, source));
  }
}

function successClaim(record = {}, options = {}) {
  if (typeof options.claimedSuccess === "boolean") return options.claimedSuccess;
  const statuses = [
    record.outcome,
    record.status,
    record.searchStatus,
    record.repositoryStatus,
    record.v2PublicationStatus,
  ].map(clean);
  return statuses.some((status) => ["success", "accepted", "mediaReady", "ready-for-display", "search-generated", "needs-review"].includes(status))
    || Boolean(record.accepted === true || record.success === true || record.feedReady === true);
}

export function validateRouteIntentInvariants(record = {}, routeIntent = {}, options = {}) {
  const source = options.source || "route-result";
  const normalizedIntent = normalizeRouteIntent(routeIntent);
  const expectedFingerprint = createRouteIntentFingerprint(normalizedIntent);
  const destinations = routeDestinations(record);
  const constraintDestinations = clean(record.routeReferenceMode) === "citywalk"
    ? destinations.filter((destination) => destination.entityTypeName !== "poi")
    : destinations;
  const violations = [];
  const diagnostics = [];
  const required = normalizedIntent.hardConstraints.requiredCities;

  requestedMatches(normalizedIntent, constraintDestinations, source, violations);

  const duplicateDestinationKeys = destinations
    .map((entry) => entry.id || entry.name)
    .filter((key, index, values) => key && values.indexOf(key) !== index);
  if (duplicateDestinationKeys.length) {
    violations.push(violation("duplicate-route-city", "destinations", "unique", unique(duplicateDestinationKeys), source));
  }

  const exactDays = normalizedIntent.hardConstraints.exactDays;
  const actualDays = routeDays(record);
  if (exactDays.state === "provided" && exactDays.value !== actualDays) {
    violations.push(violation("exact-days-mismatch", "exactDays", exactDays.value, actualDays, source));
  }
  const capacity = normalizedIntent.hardConstraints.routeCapacity;
  const capacityDemand = Math.max(constraintDestinations.length, required.state === "provided" ? required.values.length : 0);
  if (capacity.state === "provided" && Number.isInteger(capacity.value) && capacityDemand > capacity.value) {
    violations.push(violation("duration-capacity-conflict", "routeCapacity", capacity.value, capacityDemand, source));
  }

  const expectedCountry = normalizedIntent.hardConstraints.country;
  const expectedCountries = normalizedIntent.hardConstraints.countries;
  const actualCountries = routeCountryCodes(record, destinations);
  if (expectedCountries?.state === "provided" && expectedCountries.values.length
    && (expectedCountries.values.length !== actualCountries.length
      || expectedCountries.values.some((country) => !actualCountries.includes(country)))) {
    violations.push(violation("country-mismatch", "countries", expectedCountries.values, actualCountries, source));
  } else if (expectedCountry.state === "provided" && expectedCountry.value
    && (actualCountries.length !== 1 || actualCountries[0] !== expectedCountry.value)) {
    violations.push(violation("country-mismatch", "country", expectedCountry.value, actualCountries, source));
  }

  const expectedRegion = normalizedIntent.hardConstraints.region;
  const actualRegions = routeRegions(record, destinations);
  if (expectedRegion.state === "provided" && expectedRegion.value && !actualRegions.includes(expectedRegion.value)) {
    violations.push(violation("region-mismatch", "region", expectedRegion.value, actualRegions, source));
  }

  let requiresEvidence = false;
  const expectedMonths = normalizedIntent.hardConstraints.months;
  const actualMonths = routeMonths(record);
  if (expectedMonths.state === "provided" && expectedMonths.values.length) {
    if (actualMonths.length && !expectedMonths.values.every((month) => actualMonths.includes(month))) {
      violations.push(violation("month-conflict", "months", expectedMonths.values, actualMonths, source));
    } else if (!actualMonths.length || !timeEvidenceReady(record)) {
      requiresEvidence = true;
      diagnostics.push({ code: "month-evidence-pending", field: "months" });
    }
  }

  const expectedSeason = normalizedIntent.hardConstraints.season;
  const actualSeasons = routeSeasons(record);
  if (expectedSeason.state === "provided" && expectedSeason.value) {
    if (actualSeasons.length && !actualSeasons.includes(expectedSeason.value)) {
      violations.push(violation("season-conflict", "season", expectedSeason.value, actualSeasons, source));
    } else if (!actualSeasons.length || !timeEvidenceReady(record)) {
      requiresEvidence = true;
      diagnostics.push({ code: "season-evidence-pending", field: "season" });
    }
  }

  if (normalizedIntent.hardConstraints.invalidTime) {
    violations.push(violation("invalid-time-intent", "timeType", "valid", "invalid", source));
  }

  const envelope = readRouteIntentEnvelope(record);
  if (options.requireFingerprint !== false) {
    if (!envelope) {
      violations.push(violation("route-intent-fingerprint-missing", "routeIntentFingerprint", expectedFingerprint.value, null, source));
    } else {
      if (envelope.fingerprintVersion !== ROUTE_INTENT_FINGERPRINT_VERSION) {
        violations.push(violation("route-intent-fingerprint-version-mismatch", "routeIntentFingerprintVersion", ROUTE_INTENT_FINGERPRINT_VERSION, envelope.fingerprintVersion, source));
      }
      if (envelope.fingerprint !== expectedFingerprint.value) {
        violations.push(violation("route-intent-fingerprint-mismatch", "routeIntentFingerprint", expectedFingerprint.value, envelope.fingerprint, source));
      }
      const embeddedFingerprint = createRouteIntentFingerprint(envelope.normalizedIntent);
      if (embeddedFingerprint.value !== envelope.fingerprint) {
        violations.push(violation("route-intent-envelope-tampered", "normalizedRouteIntent", envelope.fingerprint, embeddedFingerprint.value, source));
      }
    }
  } else if (envelope && envelope.fingerprint !== expectedFingerprint.value) {
    violations.push(violation("route-intent-fingerprint-mismatch", "routeIntentFingerprint", expectedFingerprint.value, envelope.fingerprint, source));
  }

  const conflictStatus = [record.outcome, record.status, record.constraintStatus, record.publicationGate?.status]
    .map(clean)
    .some((status) => ["rejected", "conflict", "invalid", "failed", "not-publishable"].includes(status));
  if (successClaim(record, options) && conflictStatus) {
    violations.push(violation("rejected-result-repackaged-as-success", "outcome", "rejected", "success", source));
  }
  const reasonCodes = unique(violations.map((entry) => entry.code));
  const missingRequiredDestinationIds = unique(violations
    .filter((entry) => entry.code === "required-city-missing")
    .flatMap((entry) => Array.isArray(entry.actual) ? entry.actual : []));

  return {
    matched: violations.length === 0,
    outcome: violations.length ? "constraint-conflict" : requiresEvidence ? "needs-evidence" : "success",
    reasonCodes,
    violations,
    diagnostics,
    requiresEvidence,
    fingerprint: expectedFingerprint.value,
    fingerprintVersion: expectedFingerprint.version,
    normalizedIntent,
    routeDestinationCount: destinations.length,
    capacityDemand,
    requiredDestinationCount: required.values.length,
    missingRequiredDestinationIds,
    missingRequiredDestinationNames: missingRequiredDestinationIds,
    orderMismatch: reasonCodes.includes("fixed-order-mismatch"),
    durationConflict: reasonCodes.includes("exact-days-mismatch") || reasonCodes.includes("duration-capacity-conflict"),
    capacityConflict: reasonCodes.includes("duration-capacity-conflict"),
    timeConstraintConflict: reasonCodes.includes("month-conflict")
      || reasonCodes.includes("season-conflict")
      || reasonCodes.includes("invalid-time-intent"),
    destinationConflict: reasonCodes.includes("required-city-missing")
      || reasonCodes.includes("unexpected-city-added")
      || reasonCodes.includes("required-city-count-mismatch")
      || reasonCodes.includes("duplicate-route-city"),
    countryConflict: reasonCodes.includes("country-mismatch"),
    regionConflict: reasonCodes.includes("region-mismatch"),
  };
}

export function finalizeRouteResult(record = {}, routeIntent = {}, options = {}) {
  const attached = attachRouteIntentEnvelope(record, routeIntent);
  const validation = validateRouteIntentInvariants(attached, routeIntent, {
    ...options,
    requireFingerprint: true,
  });
  if (!validation.matched) {
    return {
      matched: false,
      accepted: false,
      success: false,
      status: "constraint-conflict",
      record: null,
      validation,
    };
  }
  return {
    matched: true,
    accepted: true,
    success: true,
    status: validation.requiresEvidence ? "needs-evidence" : "success",
    record: {
      ...attached,
      routeIntentInvariantStatus: validation.requiresEvidence ? "needs-evidence" : "passed",
      routeIntentInvariantCheckedAt: null,
    },
    validation,
  };
}

export function validateEmbeddedRouteIntent(record = {}, options = {}) {
  const envelope = readRouteIntentEnvelope(record);
  if (!envelope) {
    return options.allowLegacyUnbound === false
      ? {
        matched: false,
        outcome: "constraint-conflict",
        reasonCodes: ["route-intent-fingerprint-missing"],
        violations: [violation("route-intent-fingerprint-missing", "routeIntentFingerprint", "required", null, options.source)],
        requiresEvidence: false,
      }
      : {
        matched: true,
        outcome: "legacy-unbound",
        reasonCodes: [],
        violations: [],
        requiresEvidence: false,
        legacyUnbound: true,
      };
  }
  return validateRouteIntentInvariants(record, envelope.normalizedIntent, {
    ...options,
    requireFingerprint: true,
  });
}
