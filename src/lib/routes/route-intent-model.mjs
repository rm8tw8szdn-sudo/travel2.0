import crypto from "node:crypto";
import { maxDestinationsForTripDays } from "./route-trip-capacity.mjs";
import { canonicalizeTravelRegionKey } from "./route-search-region-taxonomy.mjs";

export const ROUTE_INTENT_SCHEMA_VERSION = "route-intent-v1";
export const ROUTE_INTENT_FINGERPRINT_VERSION = "route-intent-fingerprint-v1";
export const ROUTE_INTENT_SCHEMA_INVALID_REASON = "route-intent-schema-invalid";

const hasOwn = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
const clone = (value) => value == null ? value : structuredClone(value);
const PRESENCE_STATES = new Set(["unspecified", "explicit-empty", "provided"]);
const INTENT_MODES = new Set([
  "specified-destination",
  "destination-suggestion",
  "invalid-duration-intent",
  "invalid-time-intent",
  "insufficient-intent",
]);
const TIME_TYPES = new Set(["unspecified", "single-month", "month-range", "season-only", "invalid"]);
const TIME_EVIDENCE_STATUSES = new Set(["not-requested", "needs-evidence", "invalid"]);
const ORDER_MODES = new Set(["unspecified", "fixed", "flexible"]);
const NORMALIZED_ROUTE_INTENT_KEYS = new Set([
  "schemaVersion",
  "intentMode",
  "hardConstraints",
  "softPreferences",
  "displayMetadata",
  "evidenceStatus",
]);
const HARD_CONSTRAINT_KEYS = new Set([
  "requiredCities",
  "destinationOrderMode",
  "exactDays",
  "months",
  "season",
  "timeType",
  "country",
  "countries",
  "region",
  "routeCapacity",
  "invalidTime",
]);
const SOFT_PREFERENCE_KEYS = new Set([
  "travelStyle",
  "theme",
  "themeConstraintMode",
  "transport",
  "pace",
  "budget",
  "tripIntent",
  "exclusions",
]);

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function semanticText(value) {
  return clean(value)
    .toLocaleLowerCase("en-US")
    .replace(/[·•・,，、。;；:：/\\|_()（）\[\]【】「」『』'"“”‘’`~!！?？\-–—→]+/gu, "")
    .replace(/\s+/gu, "");
}

function entityId(value) {
  const token = clean(value);
  if (/^q\d+$/iu.test(token)) return token.toUpperCase();
  if (/^[a-z]{2}$/iu.test(token)) return token.toUpperCase();
  return token;
}

function unique(values, identity = (value) => value) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const key = identity(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function actualType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && !Number.isFinite(value)) return "non-finite-number";
  return typeof value;
}

function schemaViolation(path, expected, value, code = "invalid-type") {
  return {
    reasonCode: ROUTE_INTENT_SCHEMA_INVALID_REASON,
    code,
    path,
    expected,
    actualType: actualType(value),
  };
}

function semanticViolation(path, expected, value) {
  return schemaViolation(path, expected, value, "route-intent-semantic-invalid");
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateObjectKeys(value, path, allowedKeys, violations, { requiredKeys = allowedKeys } = {}) {
  if (!plainObject(value)) {
    violations.push(schemaViolation(path, "object", value));
    return false;
  }
  for (const key of requiredKeys) {
    if (!hasOwn(value, key)) {
      violations.push(schemaViolation(`${path}.${key}`, "required field", undefined, "missing-field"));
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      violations.push(schemaViolation(`${path}.${key}`, "no unknown field", value[key], "unknown-field"));
    }
  }
  return true;
}

function validateString(value, path, violations, { allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    violations.push(schemaViolation(path, "string", value));
    return false;
  }
  if ((!allowEmpty && !clean(value)) || /[\u0000-\u001f\u007f]/u.test(value)) {
    violations.push(schemaViolation(path, allowEmpty ? "string without control characters" : "non-empty stable string", value, "invalid-value"));
    return false;
  }
  return true;
}

function validateState(value, path, violations) {
  if (typeof value !== "string" || !PRESENCE_STATES.has(value)) {
    violations.push(schemaViolation(path, "unspecified|explicit-empty|provided", value, "invalid-enum"));
    return false;
  }
  return true;
}

function validateListPresence(value, path, violations, itemValidator) {
  if (!validateObjectKeys(value, path, new Set(["state", "values"]), violations)) return;
  const stateValid = validateState(value.state, `${path}.state`, violations);
  if (!Array.isArray(value.values)) {
    violations.push(schemaViolation(`${path}.values`, "array", value.values));
    return;
  }
  if (stateValid && value.state === "provided" && value.values.length === 0) {
    violations.push(schemaViolation(`${path}.values`, "non-empty array when state=provided", value.values, "state-value-conflict"));
  }
  if (stateValid && value.state !== "provided" && value.values.length !== 0) {
    violations.push(schemaViolation(`${path}.values`, "empty array unless state=provided", value.values, "state-value-conflict"));
  }
  value.values.forEach((entry, index) => itemValidator(entry, `${path}.values[${index}]`, violations));
}

function validateScalarPresence(value, path, violations, {
  provided,
  empty,
}) {
  if (!validateObjectKeys(value, path, new Set(["state", "value"]), violations)) return;
  const stateValid = validateState(value.state, `${path}.state`, violations);
  if (!stateValid) return;
  if (value.state === "provided") provided(value.value, `${path}.value`, violations);
  else empty(value.value, `${path}.value`, violations);
}

function validatePositiveInteger(value, path, violations) {
  if (!Number.isInteger(value) || value <= 0) {
    violations.push(schemaViolation(path, "positive integer", value, "invalid-value"));
  }
}

function validateNull(value, path, violations) {
  if (value !== null) violations.push(schemaViolation(path, "null", value, "state-value-conflict"));
}

function validateEmptyString(value, path, violations) {
  if (typeof value !== "string" || value !== "") {
    violations.push(schemaViolation(path, "empty string", value, "state-value-conflict"));
  }
}

function validateStableString(value, path, violations) {
  validateString(value, path, violations, { allowEmpty: false });
}

function validateRequiredCity(value, path, violations) {
  if (!validateObjectKeys(value, path, new Set(["id", "name"]), violations)) return;
  const idValid = validateString(value.id, `${path}.id`, violations);
  const nameValid = validateString(value.name, `${path}.name`, violations);
  if (idValid && nameValid && !clean(value.id) && !clean(value.name)) {
    violations.push(schemaViolation(path, "city with a non-empty id or name", value, "invalid-value"));
  }
}

function validateRouteIntentSemanticConsistency(input, violations) {
  const hard = input?.hardConstraints;
  const evidence = input?.evidenceStatus;
  if (!plainObject(hard) || !plainObject(evidence) || !TIME_TYPES.has(hard.timeType)) return;

  const months = hard.months;
  const season = hard.season;
  const monthValues = Array.isArray(months?.values) ? months.values : null;
  const monthState = PRESENCE_STATES.has(months?.state) ? months.state : "";
  const seasonState = PRESENCE_STATES.has(season?.state) ? season.state : "";
  const seasonValue = typeof season?.value === "string" ? clean(season.value) : null;
  if (!monthValues || !monthState || !seasonState || seasonValue == null) return;

  const monthsProvided = monthState === "provided";
  const monthsAbsent = monthState !== "provided" && monthValues.length === 0;
  const seasonProvided = seasonState === "provided" && Boolean(seasonValue);
  const seasonAbsent = seasonState !== "provided" && seasonValue === "";

  switch (hard.timeType) {
    case "single-month":
      if (!monthsProvided) {
        violations.push(semanticViolation(
          "hardConstraints.months.state",
          "provided when timeType=single-month",
          months.state,
        ));
      }
      if (monthValues.length !== 1) {
        violations.push(semanticViolation(
          "hardConstraints.months.values",
          "exactly one month when timeType=single-month",
          months.values,
        ));
      }
      if (!seasonAbsent) {
        violations.push(semanticViolation(
          "hardConstraints.season",
          "no season when timeType=single-month",
          season,
        ));
      }
      break;
    case "month-range":
      if (!monthsProvided) {
        violations.push(semanticViolation(
          "hardConstraints.months.state",
          "provided when timeType=month-range",
          months.state,
        ));
      }
      if (monthValues.length < 2) {
        violations.push(semanticViolation(
          "hardConstraints.months.values",
          "at least two unique months when timeType=month-range",
          months.values,
        ));
      }
      if (!seasonAbsent) {
        violations.push(semanticViolation(
          "hardConstraints.season",
          "no season when timeType=month-range",
          season,
        ));
      }
      break;
    case "season-only":
      if (!seasonProvided) {
        violations.push(semanticViolation(
          "hardConstraints.season",
          "one provided non-empty season when timeType=season-only",
          season,
        ));
      }
      if (!monthsAbsent) {
        violations.push(semanticViolation(
          "hardConstraints.months",
          "no explicit months when timeType=season-only",
          months,
        ));
      }
      break;
    case "unspecified":
      if (!monthsAbsent) {
        violations.push(semanticViolation(
          "hardConstraints.months",
          "no explicit months when timeType=unspecified",
          months,
        ));
      }
      if (!seasonAbsent) {
        violations.push(semanticViolation(
          "hardConstraints.season",
          "no explicit season when timeType=unspecified",
          season,
        ));
      }
      break;
    case "invalid":
      if (!monthsAbsent || !seasonAbsent) {
        violations.push(semanticViolation(
          "hardConstraints.timeType",
          "invalid time marker without a valid month or season condition",
          hard.timeType,
        ));
      }
      break;
    default:
      break;
  }

  const expectedEvidenceStatus = hard.timeType === "unspecified"
    ? "not-requested"
    : hard.timeType === "invalid"
      ? "invalid"
      : "needs-evidence";
  if (TIME_EVIDENCE_STATUSES.has(evidence.time) && evidence.time !== expectedEvidenceStatus) {
    violations.push(semanticViolation(
      "evidenceStatus.time",
      `${expectedEvidenceStatus} when timeType=${hard.timeType}`,
      evidence.time,
    ));
  }

  if (input.intentMode === "invalid-time-intent" && hard.timeType !== "invalid") {
    violations.push(semanticViolation(
      "intentMode",
      "invalid-time-intent only when hardConstraints.timeType=invalid",
      input.intentMode,
    ));
  }
  if (hard.timeType === "invalid"
    && !["invalid-time-intent", "invalid-duration-intent"].includes(input.intentMode)) {
    violations.push(semanticViolation(
      "hardConstraints.timeType",
      "invalid only with an invalid intent mode",
      hard.timeType,
    ));
  }

  if (input.intentMode === "insufficient-intent") {
    const sufficientConstraint = [
      hard.requiredCities?.state === "provided" && hard.requiredCities.values?.length > 0,
      hard.exactDays?.state === "provided" && Number.isInteger(hard.exactDays.value) && hard.exactDays.value > 0,
      monthsProvided && monthValues.length > 0,
      seasonProvided,
      hard.country?.state === "provided" && Boolean(clean(hard.country.value)),
      hard.countries?.state === "provided" && hard.countries.values?.length > 0,
      hard.region?.state === "provided" && Boolean(clean(hard.region.value)),
    ].some(Boolean);
    if (sufficientConstraint) {
      violations.push(semanticViolation(
        "intentMode",
        "insufficient-intent only when no usable travel constraint is available",
        input.intentMode,
      ));
    }
  }
}

/**
 * Strictly validates the canonical RouteIntent snapshot.
 *
 * This function deliberately avoids cloning, parsing, normalization, hashing, or
 * value interpolation so callers can safely use it on untrusted JSON records.
 */
export function validateNormalizedRouteIntent(input) {
  const violations = [];
  try {
    if (!validateObjectKeys(input, "$", NORMALIZED_ROUTE_INTENT_KEYS, violations)) {
      return { valid: false, reasonCode: ROUTE_INTENT_SCHEMA_INVALID_REASON, violations };
    }
    if (input.schemaVersion !== ROUTE_INTENT_SCHEMA_VERSION) {
      violations.push(schemaViolation("schemaVersion", ROUTE_INTENT_SCHEMA_VERSION, input.schemaVersion, "unsupported-version"));
    }
    if (typeof input.intentMode !== "string" || !INTENT_MODES.has(input.intentMode)) {
      violations.push(schemaViolation("intentMode", [...INTENT_MODES].join("|"), input.intentMode, "invalid-enum"));
    }

    if (validateObjectKeys(input.hardConstraints, "hardConstraints", HARD_CONSTRAINT_KEYS, violations)) {
      const hard = input.hardConstraints;
      validateListPresence(hard.requiredCities, "hardConstraints.requiredCities", violations, validateRequiredCity);
      if (Array.isArray(hard.requiredCities?.values)) {
        const identities = hard.requiredCities.values.map((entry) => clean(entry?.id) || clean(entry?.name)).filter(Boolean);
        if (new Set(identities).size !== identities.length) {
          violations.push(schemaViolation("hardConstraints.requiredCities.values", "unique city identities", hard.requiredCities.values, "duplicate-value"));
        }
      }
      validateScalarPresence(hard.destinationOrderMode, "hardConstraints.destinationOrderMode", violations, {
        provided: (value, path, target) => {
          if (typeof value !== "string" || !ORDER_MODES.has(value)) {
            target.push(schemaViolation(path, [...ORDER_MODES].join("|"), value, "invalid-enum"));
          }
        },
        empty: (value, path, target) => {
          if (value !== "unspecified") target.push(schemaViolation(path, "unspecified", value, "state-value-conflict"));
        },
      });
      validateScalarPresence(hard.exactDays, "hardConstraints.exactDays", violations, {
        provided: validatePositiveInteger,
        empty: validateNull,
      });
      validateListPresence(hard.months, "hardConstraints.months", violations, (value, path, target) => {
        if (!Number.isInteger(value) || value < 1 || value > 12) {
          target.push(schemaViolation(path, "integer from 1 through 12", value, "invalid-value"));
        }
      });
      if (Array.isArray(hard.months?.values)
        && new Set(hard.months.values).size !== hard.months.values.length) {
        violations.push(schemaViolation("hardConstraints.months.values", "unique months", hard.months.values, "duplicate-value"));
      }
      validateScalarPresence(hard.season, "hardConstraints.season", violations, {
        provided: validateStableString,
        empty: validateEmptyString,
      });
      if (typeof hard.timeType !== "string" || !TIME_TYPES.has(hard.timeType)) {
        violations.push(schemaViolation("hardConstraints.timeType", [...TIME_TYPES].join("|"), hard.timeType, "invalid-enum"));
      }
      validateScalarPresence(hard.country, "hardConstraints.country", violations, {
        provided: validateStableString,
        empty: validateEmptyString,
      });
      validateListPresence(hard.countries, "hardConstraints.countries", violations, validateStableString);
      if (Array.isArray(hard.countries?.values)
        && new Set(hard.countries.values).size !== hard.countries.values.length) {
        violations.push(schemaViolation("hardConstraints.countries.values", "unique country identities", hard.countries.values, "duplicate-value"));
      }
      validateScalarPresence(hard.region, "hardConstraints.region", violations, {
        provided: validateStableString,
        empty: validateEmptyString,
      });
      if (hard.region?.state === "provided" && typeof hard.region.value === "string") {
        const canonicalRegion = canonicalizeTravelRegionKey(hard.region.value);
        if (canonicalRegion !== hard.region.value) {
          violations.push(schemaViolation(
            "hardConstraints.region.value",
            `canonical Region key ${canonicalRegion}`,
            hard.region.value,
            "non-canonical-value",
          ));
        }
      }
      validateScalarPresence(hard.routeCapacity, "hardConstraints.routeCapacity", violations, {
        provided: validatePositiveInteger,
        empty: validateNull,
      });
      if (typeof hard.invalidTime !== "boolean") {
        violations.push(schemaViolation("hardConstraints.invalidTime", "boolean", hard.invalidTime));
      } else if (TIME_TYPES.has(hard.timeType) && hard.invalidTime !== (hard.timeType === "invalid")) {
        violations.push(schemaViolation("hardConstraints.invalidTime", `boolean matching timeType=${hard.timeType}`, hard.invalidTime, "state-value-conflict"));
      }
    }

    if (validateObjectKeys(input.softPreferences, "softPreferences", SOFT_PREFERENCE_KEYS, violations, {
      requiredKeys: new Set([...SOFT_PREFERENCE_KEYS].filter((key) => key !== "themeConstraintMode")),
    })) {
      for (const field of ["travelStyle", "theme", "pace", "budget", "tripIntent"]) {
        validateString(input.softPreferences[field], `softPreferences.${field}`, violations);
      }
      if (hasOwn(input.softPreferences, "themeConstraintMode")
        && !["preference", "explicit"].includes(input.softPreferences.themeConstraintMode)) {
        violations.push(schemaViolation(
          "softPreferences.themeConstraintMode",
          "preference|explicit",
          input.softPreferences.themeConstraintMode,
          "invalid-enum",
        ));
      }
      validateListPresence(input.softPreferences.transport, "softPreferences.transport", violations, validateStableString);
      if (!Array.isArray(input.softPreferences.exclusions)) {
        violations.push(schemaViolation("softPreferences.exclusions", "array", input.softPreferences.exclusions));
      } else {
        input.softPreferences.exclusions.forEach((value, index) => validateStableString(
          value,
          `softPreferences.exclusions[${index}]`,
          violations,
        ));
      }
    }

    if (validateObjectKeys(
      input.displayMetadata,
      "displayMetadata",
      new Set(["rawQuery", "requiredDestinationNames", "countryName", "regionLabel"]),
      violations,
    )) {
      for (const field of ["rawQuery", "countryName", "regionLabel"]) {
        validateString(input.displayMetadata[field], `displayMetadata.${field}`, violations);
      }
      if (!Array.isArray(input.displayMetadata.requiredDestinationNames)) {
        violations.push(schemaViolation(
          "displayMetadata.requiredDestinationNames",
          "array",
          input.displayMetadata.requiredDestinationNames,
        ));
      } else {
        input.displayMetadata.requiredDestinationNames.forEach((value, index) => validateString(
          value,
          `displayMetadata.requiredDestinationNames[${index}]`,
          violations,
        ));
      }
    }

    if (validateObjectKeys(input.evidenceStatus, "evidenceStatus", new Set(["time"]), violations)) {
      if (typeof input.evidenceStatus.time !== "string" || !TIME_EVIDENCE_STATUSES.has(input.evidenceStatus.time)) {
        violations.push(schemaViolation(
          "evidenceStatus.time",
          [...TIME_EVIDENCE_STATUSES].join("|"),
          input.evidenceStatus.time,
          "invalid-enum",
        ));
      }
    }
    validateRouteIntentSemanticConsistency(input, violations);
  } catch {
    violations.push(schemaViolation("$", "readable canonical RouteIntent object", input, "validation-access-failed"));
  }
  return {
    valid: violations.length === 0,
    reasonCode: violations.length ? ROUTE_INTENT_SCHEMA_INVALID_REASON : "",
    violations,
  };
}

function presence(provided, value, emptyValue) {
  return {
    state: provided ? (emptyValue ? "explicit-empty" : "provided") : "unspecified",
    value,
  };
}

function listPresence(provided, values) {
  return {
    state: provided ? (values.length ? "provided" : "explicit-empty") : "unspecified",
    values,
  };
}

function normalizeRequiredCities(input) {
  const explicitObjects = Array.isArray(input.requiredCities) ? input.requiredCities : [];
  const ids = Array.isArray(input.requiredDestinationIds) ? input.requiredDestinationIds : [];
  const names = Array.isArray(input.requiredDestinationNames) ? input.requiredDestinationNames : [];
  const raw = Array.isArray(input.requiredDestinationRaw) ? input.requiredDestinationRaw : [];
  const length = Math.max(explicitObjects.length, ids.length, names.length, raw.length);
  const values = [];
  for (let index = 0; index < length; index += 1) {
    const source = explicitObjects[index] && typeof explicitObjects[index] === "object"
      ? explicitObjects[index]
      : {};
    const id = entityId(source.entityId || source.wikidataId || source.id || ids[index]);
    const name = semanticText(source.canonicalName || source.name || source.label || names[index] || raw[index]);
    const identity = id || name;
    if (!identity || values.some((entry) => (entry.id || entry.name) === identity)) continue;
    values.push({ id, name });
  }
  const provided = hasOwn(input, "requiredCities")
    || hasOwn(input, "requiredDestinationIds")
    || hasOwn(input, "requiredDestinationNames")
    || hasOwn(input, "requiredDestinationRaw");
  return listPresence(provided, values);
}

function normalizeMonths(input, timeIntent) {
  const candidates = [
    ...(Array.isArray(timeIntent.months) ? timeIntent.months : []),
    ...(Array.isArray(input.months) ? input.months : []),
    ...(input.month != null ? [input.month] : []),
  ];
  const values = unique(candidates
    .map(Number)
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))
    .sort((left, right) => left - right);
  const type = clean(timeIntent.type || input.timeIntentType || "unspecified");
  const provided = hasOwn(timeIntent, "months")
    || hasOwn(input, "months")
    || hasOwn(input, "month")
    || type === "single-month"
    || type === "month-range";
  return listPresence(provided, values);
}

function normalizeStringList(values) {
  return unique((Array.isArray(values) ? values : [])
    .map(semanticText)
    .filter(Boolean))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function normalizeCountryList(input) {
  const arrayProvided = hasOwn(input, "countries")
    || hasOwn(input, "countryCodes")
    || hasOwn(input, "regionCountryCodes");
  const arrayValues = [
    ...(Array.isArray(input.countries) ? input.countries : []),
    ...(Array.isArray(input.countryCodes) ? input.countryCodes : []),
    ...(Array.isArray(input.regionCountryCodes) ? input.regionCountryCodes : []),
  ];
  const composite = clean(input.country);
  const compositeValues = !arrayProvided && /[/|,]/u.test(composite)
    ? composite.split(/[/|,]+/u).map(clean).filter((value) => /^[a-z]{2}$/iu.test(value))
    : [];
  const values = unique([...arrayValues, ...compositeValues]
    .map(entityId)
    .filter(Boolean))
    .sort((left, right) => left.localeCompare(right, "en"));
  return listPresence(arrayProvided || compositeValues.length > 1, values);
}

export function maxDestinationsForRouteIntentDays(days) {
  return maxDestinationsForTripDays(days);
}

function normalizeAlreadyNormalized(input) {
  return validateNormalizedRouteIntent(input).valid ? clone(input) : null;
}

export function normalizeRouteIntent(input = {}) {
  input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const authoritativeSnapshot = normalizeAlreadyNormalized(input.normalizedRouteIntent);
  if (authoritativeSnapshot) return authoritativeSnapshot;
  if (hasOwn(input, "normalizedRouteIntent")
    && input.normalizedRouteIntent
    && typeof input.normalizedRouteIntent === "object"
    && !Array.isArray(input.normalizedRouteIntent)) {
    return clone(input.normalizedRouteIntent);
  }
  const existing = normalizeAlreadyNormalized(input);
  if (existing) return existing;
  if (hasOwn(input, "schemaVersion")) return clone(input);

  const timeIntent = input.timeIntent && typeof input.timeIntent === "object" && !Array.isArray(input.timeIntent)
    ? input.timeIntent
    : {};
  const requiredCities = normalizeRequiredCities(input);
  const destinationOrderModeText = clean(input.destinationOrderMode || (input.fixedOrder === true ? "fixed" : "unspecified"));
  const destinationOrderModeProvided = hasOwn(input, "destinationOrderMode") || hasOwn(input, "fixedOrder");
  const destinationOrderMode = presence(
    destinationOrderModeProvided,
    destinationOrderModeText || "unspecified",
    !destinationOrderModeText,
  );

  const durationProvided = hasOwn(input, "exactDays") || hasOwn(input, "durationDays");
  const durationNumber = Number(input.exactDays ?? input.durationDays);
  const exactDays = presence(
    durationProvided,
    Number.isInteger(durationNumber) && durationNumber > 0 ? durationNumber : null,
    input.exactDays == null && input.durationDays == null,
  );

  const months = normalizeMonths(input, timeIntent);
  const seasonText = semanticText(timeIntent.season || input.seasonKey || input.season);
  const explicitTimeType = hasOwn(timeIntent, "type") || hasOwn(input, "timeIntentType");
  const requestedTimeType = clean(timeIntent.type || input.timeIntentType || "unspecified") || "unspecified";
  const timeType = explicitTimeType
    ? requestedTimeType
    : months.values.length > 1
      ? "month-range"
      : months.values.length === 1
        ? "single-month"
        : seasonText
          ? "season-only"
          : "unspecified";
  const seasonProvided = hasOwn(timeIntent, "season")
    || hasOwn(input, "season")
    || hasOwn(input, "seasonKey")
    || timeType === "season-only";
  const season = presence(seasonProvided, seasonText, !seasonText);

  const countries = normalizeCountryList(input);
  const countryRaw = countries.state === "provided"
    ? ""
    : input.countryCode || input.countryEntityId || input.country;
  const countryIdentity = entityId(countryRaw);
  const countryText = /^Q\d+$/u.test(countryIdentity) || /^[A-Z]{2}$/u.test(countryIdentity)
    ? countryIdentity
    : semanticText(countryRaw);
  const countryProvided = countries.state !== "provided"
    && (hasOwn(input, "countryCode") || hasOwn(input, "countryEntityId") || hasOwn(input, "country"));
  const country = presence(countryProvided, countryText, !countryText);

  const regionInput = input.normalizedRegion || input.regionEntityId || input.region;
  const regionText = regionInput ? canonicalizeTravelRegionKey(regionInput) : "";
  const regionProvided = hasOwn(input, "normalizedRegion") || hasOwn(input, "regionEntityId") || hasOwn(input, "region");
  const region = presence(regionProvided, regionText, !regionText);

  const explicitCapacity = Number(input.routeCapacity?.maxDestinations ?? input.maxDestinations);
  const capacityProvided = hasOwn(input, "routeCapacity") || hasOwn(input, "maxDestinations") || exactDays.state === "provided";
  const capacityValue = Number.isInteger(explicitCapacity) && explicitCapacity > 0
    ? explicitCapacity
    : maxDestinationsForRouteIntentDays(exactDays.value);

  return {
    schemaVersion: ROUTE_INTENT_SCHEMA_VERSION,
    intentMode: clean(input.intentMode || "specified-destination") || "specified-destination",
    hardConstraints: {
      requiredCities,
      destinationOrderMode,
      exactDays,
      months,
      season,
      timeType,
      country,
      countries,
      region,
      routeCapacity: presence(capacityProvided, capacityValue, capacityValue == null),
      invalidTime: timeType === "invalid",
    },
    softPreferences: {
      travelStyle: semanticText(input.travelStyle),
      theme: semanticText(input.themeKey || input.theme),
      themeConstraintMode: input.themeConstraintMode === "explicit" ? "explicit" : "preference",
      transport: listPresence(
        hasOwn(input, "transport") || hasOwn(input, "transportPreference"),
        normalizeStringList([
          ...(Array.isArray(input.transportPreference) ? input.transportPreference : []),
          ...(input.transport ? [input.transport] : []),
        ]),
      ),
      pace: semanticText(input.pace),
      budget: semanticText(input.budget),
      tripIntent: semanticText(input.tripIntent),
      exclusions: normalizeStringList(input.exclusions),
    },
    displayMetadata: {
      rawQuery: clean(input.rawQuery),
      requiredDestinationNames: (Array.isArray(input.requiredDestinationNames) ? input.requiredDestinationNames : []).map(clean),
      countryName: clean(input.countryName),
      regionLabel: clean(input.region),
    },
    evidenceStatus: {
      time: timeType === "unspecified"
        ? "not-requested"
        : timeType === "invalid"
          ? "invalid"
          : "needs-evidence",
    },
  };
}

function fingerprintPayload(normalized) {
  const requiredCities = normalized.hardConstraints.requiredCities;
  const requiredCityValues = requiredCities.values.map((item) => item.id || item.name);
  if (normalized.hardConstraints.destinationOrderMode.value !== "fixed") {
    requiredCityValues.sort((left, right) => left.localeCompare(right, "en"));
  }
  return {
    schemaVersion: normalized.schemaVersion,
    intentMode: normalized.intentMode,
    hardConstraints: {
      ...normalized.hardConstraints,
      requiredCities: {
        state: requiredCities.state,
        values: requiredCityValues,
      },
    },
    softPreferences: normalized.softPreferences,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createRouteIntentFingerprint(input = {}) {
  const normalizedIntent = normalizeRouteIntent(input);
  const validation = validateNormalizedRouteIntent(normalizedIntent);
  if (!validation.valid) {
    return {
      version: ROUTE_INTENT_FINGERPRINT_VERSION,
      value: "",
      canonical: "",
      normalizedIntent,
      valid: false,
      validation,
    };
  }
  const canonical = stableJson({
    fingerprintVersion: ROUTE_INTENT_FINGERPRINT_VERSION,
    intent: fingerprintPayload(normalizedIntent),
  });
  const digest = crypto.createHash("sha256").update(canonical).digest("hex");
  return {
    version: ROUTE_INTENT_FINGERPRINT_VERSION,
    value: `rif-v1-${digest}`,
    canonical,
    normalizedIntent,
    valid: true,
    validation,
  };
}

export function attachRouteIntentEnvelope(record = {}, input = {}) {
  const fingerprint = createRouteIntentFingerprint(input);
  return {
    ...clone(record),
    routeIntentSchemaVersion: ROUTE_INTENT_SCHEMA_VERSION,
    routeIntentFingerprintVersion: ROUTE_INTENT_FINGERPRINT_VERSION,
    routeIntentFingerprint: fingerprint.value,
    normalizedRouteIntent: fingerprint.normalizedIntent,
  };
}

export function readRouteIntentEnvelope(record = {}) {
  const markers = [
    "routeIntentSchemaVersion",
    "routeIntentFingerprintVersion",
    "routeIntentFingerprint",
    "normalizedRouteIntent",
  ];
  const claimed = plainObject(record) && markers.some((field) => {
    if (!hasOwn(record, field)) return false;
    const value = record[field];
    if (value == null) return false;
    return typeof value !== "string" || value.trim().length > 0;
  });
  if (!claimed) {
    return {
      status: "legacy-unbound",
      claimed: false,
      valid: false,
      reasonCode: "",
      violations: [],
    };
  }

  const violations = [];
  try {
    if (record.routeIntentSchemaVersion !== ROUTE_INTENT_SCHEMA_VERSION) {
      violations.push(schemaViolation(
        "routeIntentSchemaVersion",
        ROUTE_INTENT_SCHEMA_VERSION,
        record.routeIntentSchemaVersion,
        "unsupported-version",
      ));
    }
    if (record.routeIntentFingerprintVersion !== ROUTE_INTENT_FINGERPRINT_VERSION) {
      violations.push(schemaViolation(
        "routeIntentFingerprintVersion",
        ROUTE_INTENT_FINGERPRINT_VERSION,
        record.routeIntentFingerprintVersion,
        "unsupported-version",
      ));
    }
    if (typeof record.routeIntentFingerprint !== "string"
      || !/^rif-v1-[a-f0-9]{64}$/u.test(record.routeIntentFingerprint)) {
      violations.push(schemaViolation(
        "routeIntentFingerprint",
        "rif-v1 followed by 64 lowercase hexadecimal characters",
        record.routeIntentFingerprint,
        "invalid-value",
      ));
    }
    const schemaValidation = validateNormalizedRouteIntent(record.normalizedRouteIntent);
    for (const entry of schemaValidation.violations) {
      violations.push({
        ...entry,
        path: entry.path === "$" ? "normalizedRouteIntent" : `normalizedRouteIntent.${entry.path}`,
      });
    }
    if (violations.length) {
      return {
        status: "schema-invalid",
        claimed: true,
        valid: false,
        reasonCode: ROUTE_INTENT_SCHEMA_INVALID_REASON,
        violations,
      };
    }
    return {
      status: "valid",
      claimed: true,
      valid: true,
      reasonCode: "",
      violations: [],
      schemaVersion: record.routeIntentSchemaVersion,
      fingerprintVersion: record.routeIntentFingerprintVersion,
      fingerprint: record.routeIntentFingerprint,
      normalizedIntent: clone(record.normalizedRouteIntent),
    };
  } catch {
    return {
      status: "schema-invalid",
      claimed: true,
      valid: false,
      reasonCode: ROUTE_INTENT_SCHEMA_INVALID_REASON,
      violations: [schemaViolation("$", "readable RouteIntent envelope", record, "validation-access-failed")],
    };
  }
}
