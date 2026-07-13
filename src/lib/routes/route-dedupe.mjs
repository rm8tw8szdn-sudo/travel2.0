function text(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sourceKey(record) {
  if (record?.sourceType === "evidence-composed") {
    return `evidence-composed:${text(record?.id)}`;
  }
  if (!record?.source?.url) return "";
  try {
    const url = new URL(record.source.url);
    return `${url.hostname}${url.pathname}`.toLocaleLowerCase("en-US").replace(/\/+$/u, "");
  } catch {
    return text(record.source.url).toLocaleLowerCase("en-US");
  }
}

function entitySet(entities = [], key) {
  return entities.map((item) => text(item?.[key] || item?.name)).filter(Boolean).sort().join("|");
}

export function routeCountryClusterKey(record = {}) {
  const fallbackCountries = (record?.countries || [])
    .map((item) => text(item).toUpperCase())
    .filter(Boolean);
  const entityCountries = (record?.countryEntities || [])
    .map((item) => item?.countryCode || item?.code || item?.iso2 || item?.name)
    .map((item) => text(item).toUpperCase())
    .filter(Boolean);
  const countries = (fallbackCountries.length ? fallbackCountries : entityCountries).sort();
  return [...new Set(countries)].join("|");
}

export function routeDestinationSetKey(record = {}) {
  return [
    ...(record?.destinationEntities || []),
    ...(record?.destinations || []),
  ]
    .map((item) => text(item?.name || item?.label || item?.title || item?.wikidataId || item?.cityCode || item))
    .filter(Boolean)
    .map((item) => item.toLocaleLowerCase("zh-CN").replace(/\s+/gu, ""))
    .sort()
    .join("|");
}

export function routeTitleKey(record = {}) {
  return text(record?.canonicalTitle || record?.title || record?.name).replace(/\s+/gu, "").toLocaleLowerCase("zh-CN");
}

function themeSet(record) {
  return (record?.themes || record?.tags || []).map(text).filter(Boolean).sort().join("|");
}

function routeStructure(record) {
  return (record?.destinationEntities || record?.destinations || [])
    .map((item) => text(item?.wikidataId || item?.name || item))
    .filter(Boolean)
    .join(">");
}

export function routeDedupeFingerprint(record) {
  return [
    sourceKey(record),
    text(record?.canonicalTitle || record?.name).toLocaleLowerCase("zh-CN"),
    entitySet(record?.countryEntities, "countryCode"),
    entitySet(record?.destinationEntities, "wikidataId"),
    text(record?.recommendedDays),
    themeSet(record),
    text(record?.travelMode || record?.contentEvidence?.travelMode),
    routeStructure(record),
  ].join("::");
}

export function isDuplicateRoute(a, b) {
  const aSource = sourceKey(a);
  const bSource = sourceKey(b);
  if (aSource && bSource && aSource === bSource) return true;
  if (routeDedupeFingerprint(a) === routeDedupeFingerprint(b)) return true;
  const aTitle = routeTitleKey(a);
  const bTitle = routeTitleKey(b);
  if (aTitle && bTitle && aTitle === bTitle) return true;
  const aCountries = routeCountryClusterKey(a);
  const bCountries = routeCountryClusterKey(b);
  const aDestinations = routeDestinationSetKey(a);
  const bDestinations = routeDestinationSetKey(b);
  return Boolean(
    aCountries
      && aCountries === bCountries
      && aDestinations
      && aDestinations === bDestinations,
  );
}

export function dedupeRouteRecords(records = []) {
  const accepted = [];
  for (const record of records) {
    if (!record || accepted.some((item) => isDuplicateRoute(item, record))) continue;
    accepted.push(record);
  }
  return accepted;
}
