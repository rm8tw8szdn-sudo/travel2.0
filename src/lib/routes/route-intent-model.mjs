import crypto from "node:crypto";

export const ROUTE_INTENT_SCHEMA_VERSION = "route-intent-v1";
export const ROUTE_INTENT_FINGERPRINT_VERSION = "route-intent-fingerprint-v1";

const hasOwn = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
const clone = (value) => value == null ? value : structuredClone(value);

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
  const arrayProvided = hasOwn(input, "countries") || hasOwn(input, "countryCodes");
  const arrayValues = [
    ...(Array.isArray(input.countries) ? input.countries : []),
    ...(Array.isArray(input.countryCodes) ? input.countryCodes : []),
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
  if (!Number.isInteger(days) || days <= 0) return null;
  if (days <= 2) return 2;
  if (days <= 4) return 3;
  if (days <= 7) return 4;
  if (days <= 10) return 5;
  return 6;
}

function normalizeAlreadyNormalized(input) {
  if (input?.schemaVersion !== ROUTE_INTENT_SCHEMA_VERSION
    || !input?.hardConstraints
    || !input.hardConstraints.requiredCities
    || !Array.isArray(input.hardConstraints.requiredCities.values)
    || !input.hardConstraints.destinationOrderMode
    || !input.hardConstraints.exactDays
    || !input.hardConstraints.months
    || !input.hardConstraints.season
    || !input.hardConstraints.country
    || !input.hardConstraints.region
    || !input.hardConstraints.routeCapacity) {
    return null;
  }
  const normalized = clone(input);
  if (!normalized.hardConstraints.countries) {
    normalized.hardConstraints.countries = listPresence(false, []);
  }
  return normalized;
}

export function normalizeRouteIntent(input = {}) {
  input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const authoritativeSnapshot = normalizeAlreadyNormalized(input.normalizedRouteIntent);
  if (authoritativeSnapshot) return authoritativeSnapshot;
  const existing = normalizeAlreadyNormalized(input);
  if (existing) return existing;

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
  const timeType = clean(timeIntent.type || input.timeIntentType || "unspecified") || "unspecified";
  const seasonText = semanticText(timeIntent.season || input.seasonKey || input.season);
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

  const regionText = semanticText(input.normalizedRegion || input.regionEntityId || input.region);
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
  if (!record || typeof record !== "object") return null;
  if (record.routeIntentSchemaVersion !== ROUTE_INTENT_SCHEMA_VERSION) return null;
  if (record.routeIntentFingerprintVersion !== ROUTE_INTENT_FINGERPRINT_VERSION) return null;
  if (!clean(record.routeIntentFingerprint) || !record.normalizedRouteIntent) return null;
  return {
    schemaVersion: record.routeIntentSchemaVersion,
    fingerprintVersion: record.routeIntentFingerprintVersion,
    fingerprint: clean(record.routeIntentFingerprint),
    normalizedIntent: clone(record.normalizedRouteIntent),
  };
}
