import { maxDestinationsForDuration } from "./route-candidate-evidence-validation.mjs";

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/gu, " ");
}

function normalized(value) {
  return clean(value)
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•・,，、。;；:：/\\|_()（）\[\]【】「」『』'"“”‘’`~!！?？\-–—→]+/gu, "");
}

function list(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

function recordDurationDays(record = {}) {
  const explicit = Number(record.durationDays);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = clean(record.recommendedDays).match(/\d+/u);
  return match ? Number(match[0]) : 0;
}

function destinationDescriptor(entity = {}, fallbackName = "") {
  return {
    ids: unique([
    entity.wikidataId,
    entity.entityId,
    entity.id,
    ]).map(normalized).filter(Boolean),
    names: unique([
    entity.name,
    entity.label,
    entity.sourceTitle,
    fallbackName,
    ]).map(normalized).filter(Boolean),
  };
}

function routeDestinations(record = {}) {
  const names = list(record.destinations);
  const entities = Array.isArray(record.destinationEntities) ? record.destinationEntities : [];
  return Array.from(
    { length: Math.max(names.length, entities.length) },
    (_, index) => destinationDescriptor(entities[index] || {}, names[index]),
  );
}

function requiredDestinations(intent = {}) {
  const ids = list(intent.requiredDestinationIds);
  const names = list(intent.requiredDestinationNames);
  return Array.from({ length: Math.max(ids.length, names.length) }, (_, index) => ({
    id: ids[index] || "",
    name: names[index] || "",
    normalizedId: normalized(ids[index]),
    normalizedName: normalized(names[index]),
  }));
}

function matchRequiredDestinations(intent, record) {
  const required = requiredDestinations(intent);
  const available = routeDestinations(record);
  const matchedIndexes = [];
  const usedIndexes = new Set();
  const missingRequiredDestinationIds = [];
  const missingRequiredDestinationNames = [];

  for (const item of required) {
    const anyStructuredIds = available.some((candidate) => candidate.ids.length > 0);
    const matchedIndex = available.findIndex((candidate, index) => {
      if (usedIndexes.has(index)) return false;
      if (item.normalizedId && anyStructuredIds) return candidate.ids.includes(item.normalizedId);
      if (item.normalizedName) return candidate.names.includes(item.normalizedName);
      return item.normalizedId ? candidate.ids.includes(item.normalizedId) : false;
    });
    if (matchedIndex < 0) {
      if (item.id) missingRequiredDestinationIds.push(item.id);
      if (item.name) missingRequiredDestinationNames.push(item.name);
      continue;
    }
    usedIndexes.add(matchedIndex);
    matchedIndexes.push(matchedIndex);
  }

  const orderMismatch = required.length > 1
    && clean(intent.destinationOrderMode) === "fixed"
    && missingRequiredDestinationIds.length === 0
    && missingRequiredDestinationNames.length === 0
    && matchedIndexes.some((index, position) => position > 0 && index <= matchedIndexes[position - 1]);

  return {
    requiredCount: required.length,
    missingRequiredDestinationIds,
    missingRequiredDestinationNames,
    orderMismatch,
  };
}

function recordMonths(record = {}) {
  const months = new Set();
  for (const value of list(record.bestMonths)) {
    const text = clean(value);
    const range = text.match(/(?:^|\D)(\d{1,2})\s*[-–—至到]\s*(\d{1,2})(?:\D|$)/u);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start >= 1 && start <= 12 && end >= 1 && end <= 12) {
        let month = start;
        for (let guard = 0; guard < 12; guard += 1) {
          months.add(month);
          if (month === end) break;
          month = month === 12 ? 1 : month + 1;
        }
      }
      continue;
    }
    for (const match of text.matchAll(/(?:^|\D)(\d{1,2})(?=\D|$)/gu)) {
      const month = Number(match[1]);
      if (month >= 1 && month <= 12) months.add(month);
    }
  }
  return months;
}

const SEASON_ALIASES = {
  spring: ["spring", "春季", "春天", "春日", "樱花"],
  summer: ["summer", "夏季", "夏天", "盛夏"],
  autumn: ["autumn", "fall", "秋季", "秋天", "红叶", "枫叶"],
  winter: ["winter", "冬季", "冬天", "雪季", "冰雪"],
};

function routeSeasonLabels(record = {}) {
  const text = [
    record.name,
    record.canonicalTitle,
    record.summary,
    record.recommendationText,
    ...list(record.themes),
    ...list(record.tags),
  ].map(normalized).join(" ");
  return Object.entries(SEASON_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => text.includes(normalized(alias))))
    .map(([season]) => season);
}

function requestedSeason(value) {
  const token = normalized(value);
  if (!token) return "";
  return Object.entries(SEASON_ALIASES)
    .find(([season, aliases]) => season === token || aliases.some((alias) => normalized(alias) === token))?.[0] || token;
}

function recordCountryCodes(record = {}) {
  const countryEntities = (Array.isArray(record.countryEntities) ? record.countryEntities : [])
    .map((item) => item?.countryCode)
    .filter(Boolean);
  const countries = list(record.countries).filter((value) => /^[a-z]{2}$/iu.test(value));
  const destinationCountries = (Array.isArray(record.destinationEntities) ? record.destinationEntities : [])
    .map((item) => item?.countryCode)
    .filter(Boolean);
  const authoritativeCodes = countryEntities.length
    ? countryEntities
    : destinationCountries.length
      ? destinationCountries
      : countries;
  return unique(authoritativeCodes)
    .map((value) => value.toUpperCase());
}

function recordText(record = {}) {
  return [
    record.name,
    record.canonicalTitle,
    record.summary,
    record.recommendationText,
    ...list(record.countries),
    ...list(record.destinations),
    ...(Array.isArray(record.countryEntities) ? record.countryEntities : []).flatMap((item) => [item?.name, item?.countryCode]),
    ...(Array.isArray(record.destinationEntities) ? record.destinationEntities : []).flatMap((item) => [item?.name, item?.sourceTitle]),
    ...list(record.themes),
    ...list(record.tags),
  ].map(normalized).join(" ");
}

const REGION_ALIASES = {
  sahara: ["撒哈拉", "西撒哈拉", "sahara", "western sahara"],
  kansai: ["关西", "kansai"],
  hokkaido: ["北海道", "hokkaido"],
  "golden circle": ["黄金圈", "golden circle"],
  cappadocia: ["卡帕多奇亚", "cappadocia"],
};

function matchesRegion(intent = {}, record = {}) {
  const region = clean(intent.normalizedRegion || intent.region);
  if (!region) return true;
  const text = recordText(record);
  const aliases = unique([region, intent.region, ...(REGION_ALIASES[region] || [])]);
  return aliases.map(normalized).some((alias) => alias && text.includes(alias));
}

function timeCompatibility(intent = {}, record = {}) {
  const timeIntent = intent.timeIntent && typeof intent.timeIntent === "object" ? intent.timeIntent : {};
  const type = clean(timeIntent.type || "unspecified");
  if (!type || type === "unspecified") return { conflict: false, requiresEvidence: false };
  if (type === "invalid") return { conflict: true, requiresEvidence: false };
  if (type === "single-month" || type === "month-range") {
    const requested = unique(timeIntent.months).map(Number).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
    if (!requested.length) return { conflict: true, requiresEvidence: false };
    const supported = recordMonths(record);
    if (!supported.size) return { conflict: false, requiresEvidence: true };
    return {
      conflict: !requested.every((month) => supported.has(month)),
      requiresEvidence: false,
    };
  }
  if (type === "season-only") {
    const season = requestedSeason(timeIntent.season || intent.season);
    if (!season) return { conflict: false, requiresEvidence: true };
    const routeSeasons = routeSeasonLabels(record);
    if (!routeSeasons.length) return { conflict: false, requiresEvidence: true };
    return { conflict: !routeSeasons.includes(season), requiresEvidence: false };
  }
  return { conflict: false, requiresEvidence: true };
}

export function validateFallbackRouteAgainstIntent(record = {}, routeIntent = {}) {
  const destination = matchRequiredDestinations(routeIntent, record);
  const requestedDurationDays = Number(routeIntent.durationDays);
  const actualDurationDays = recordDurationDays(record);
  const durationConflict = Number.isInteger(requestedDurationDays) && requestedDurationDays > 0
    ? actualDurationDays !== requestedDurationDays
    : false;
  const routeDestinationCount = Math.max(routeDestinations(record).length, destination.requiredCount);
  const capacityConflict = Number.isInteger(requestedDurationDays) && requestedDurationDays > 0
    ? routeDestinationCount > maxDestinationsForDuration(requestedDurationDays)
    : false;
  const expectedCountry = clean(routeIntent.countryCode).toUpperCase();
  const countryCodes = recordCountryCodes(record);
  const countryConflict = Boolean(expectedCountry && !countryCodes.includes(expectedCountry));
  const regionConflict = !matchesRegion(routeIntent, record);
  const time = timeCompatibility(routeIntent, record);
  const destinationConflict = Boolean(
    destination.missingRequiredDestinationIds.length
    || destination.missingRequiredDestinationNames.length
    || destination.orderMismatch
  );
  const reasonCodes = [];
  if (destination.missingRequiredDestinationIds.length || destination.missingRequiredDestinationNames.length) {
    reasonCodes.push("required-destination-missing");
  }
  if (destination.orderMismatch) reasonCodes.push("fixed-destination-order-mismatch");
  if (durationConflict) reasonCodes.push("duration-mismatch");
  if (capacityConflict) reasonCodes.push("duration-capacity-conflict");
  if (time.conflict) reasonCodes.push("time-constraint-conflict");
  if (countryConflict) reasonCodes.push("country-constraint-conflict");
  if (regionConflict) reasonCodes.push("region-constraint-conflict");

  return {
    matched: reasonCodes.length === 0,
    reasonCodes,
    missingRequiredDestinationIds: destination.missingRequiredDestinationIds,
    missingRequiredDestinationNames: destination.missingRequiredDestinationNames,
    orderMismatch: destination.orderMismatch,
    durationConflict,
    capacityConflict,
    timeConstraintConflict: time.conflict,
    destinationConflict,
    countryConflict,
    regionConflict,
    requiresEvidence: time.requiresEvidence,
  };
}
