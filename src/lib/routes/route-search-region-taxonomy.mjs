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

const REGION_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "southeast-asia",
    label: "Southeast Asia",
    aliases: Object.freeze(["东南亚", "東南亞", "southeast asia", "south east asia", "sea"]),
    metadataMatches: Object.freeze(["southeast asia", "south east asia", "东南亚", "東南亞"]),
  }),
  Object.freeze({
    key: "northern-europe",
    label: "Northern Europe",
    aliases: Object.freeze(["北欧", "北歐", "northern europe", "nordic", "nordics"]),
    metadataMatches: Object.freeze(["northern europe", "北欧", "北歐"]),
  }),
  Object.freeze({
    key: "north-america",
    label: "North America",
    aliases: Object.freeze(["北美", "北美洲", "north america"]),
    metadataMatches: Object.freeze(["north america", "northern america", "北美", "北美洲"]),
  }),
  Object.freeze({
    key: "south-america",
    label: "South America",
    aliases: Object.freeze(["南美", "南美洲", "south america"]),
    metadataMatches: Object.freeze(["south america", "南美", "南美洲"]),
  }),
  Object.freeze({
    key: "americas",
    label: "Americas",
    aliases: Object.freeze(["美洲", "americas", "the americas"]),
    metadataMatches: Object.freeze(["north america", "northern america", "south america", "美洲", "北美洲", "南美洲"]),
  }),
  Object.freeze({
    key: "europe",
    label: "Europe",
    aliases: Object.freeze(["欧洲", "歐洲", "europe", "european"]),
    metadataMatches: Object.freeze(["europe", "欧洲", "歐洲"]),
  }),
  Object.freeze({
    key: "asia",
    label: "Asia",
    aliases: Object.freeze(["亚洲", "亞洲", "asia", "asian"]),
    metadataMatches: Object.freeze(["asia", "亚洲", "亞洲"]),
  }),
]);

const SUBNATIONAL_REGION_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "andalusia",
    label: "Andalusia",
    aliases: Object.freeze(["Andalusia", "Andalucía", "Andalucia", "安达卢西亚", "安達盧西亞"]),
    scope: "subnational-region",
    parentCountryCode: "ES",
    knownDestinationIds: Object.freeze(["Q5818", "Q8810", "Q8851", "Q13153", "Q8717"]),
  }),
  Object.freeze({
    key: "mallorca",
    label: "Mallorca",
    aliases: Object.freeze(["Mallorca", "Majorca", "马略卡", "馬略卡"]),
    scope: "island-region",
    parentCountryCode: "ES",
    knownDestinationIds: Object.freeze([]),
  }),
  Object.freeze({
    key: "tenerife",
    label: "Tenerife",
    aliases: Object.freeze(["Tenerife", "特内里费", "特內里費"]),
    scope: "island-region",
    parentCountryCode: "ES",
    knownDestinationIds: Object.freeze([]),
  }),
  Object.freeze({
    key: "ibiza",
    label: "Ibiza",
    aliases: Object.freeze(["Ibiza", "Eivissa", "伊维萨", "伊維薩"]),
    scope: "island-region",
    parentCountryCode: "ES",
    knownDestinationIds: Object.freeze([]),
  }),
  Object.freeze({
    key: "provence",
    label: "Provence",
    aliases: Object.freeze(["Provence", "普罗旺斯", "普羅旺斯"]),
    scope: "subnational-region",
    parentCountryCode: "FR",
    knownDestinationIds: Object.freeze(["Q47465", "Q6397", "Q23482", "Q33959"]),
  }),
  Object.freeze({
    key: "lake-como",
    label: "Lake Como",
    aliases: Object.freeze(["Lake Como", "Lago di Como", "科莫湖"]),
    scope: "subnational-region",
    parentCountryCode: "IT",
    knownDestinationIds: Object.freeze(["Q1308"]),
  }),
  Object.freeze({
    key: "dolomites",
    label: "Dolomites",
    aliases: Object.freeze(["Dolomites", "Dolomite Alps", "多洛米蒂", "多洛米特"]),
    scope: "subnational-region",
    parentCountryCode: "IT",
    knownDestinationIds: Object.freeze([]),
  }),
  Object.freeze({
    key: "jeju-island",
    label: "Jeju Island",
    aliases: Object.freeze(["Jeju Island", "Jeju-do", "济州岛", "濟州島"]),
    scope: "island-region",
    parentCountryCode: "KR",
    knownDestinationIds: Object.freeze(["Q42142"]),
  }),
]);

const ALL_REGION_DEFINITIONS = Object.freeze([
  ...REGION_DEFINITIONS,
  ...SUBNATIONAL_REGION_DEFINITIONS,
]);

function countryMetadata(country = {}) {
  return [
    country.continent,
    country.continentNameEn,
    country.continentNameZh,
    country.region,
    country.subregion,
  ].map(normalize).filter(Boolean);
}

function definitionMatchesCountry(definition, country) {
  const metadata = countryMetadata(country);
  const expected = definition.metadataMatches.map(normalize);
  return metadata.some((value) => expected.some((match) => value === match || value.includes(match)));
}

export function createTravelRegionCatalog(countries = []) {
  const stableCountries = (Array.isArray(countries) ? countries : [])
    .filter((country) => /^[A-Z]{2}$/u.test(clean(country?.code).toUpperCase()));
  const macroRegions = REGION_DEFINITIONS.map((definition) => Object.freeze({
    key: definition.key,
    label: definition.label,
    normalizedLabel: definition.key,
    aliases: definition.aliases,
    scope: "macro-region",
    countryCodes: Object.freeze(stableCountries
      .filter((country) => definitionMatchesCountry(definition, country))
      .map((country) => clean(country.code).toUpperCase())
      .sort((left, right) => left.localeCompare(right, "en"))),
    knownDestinationIds: Object.freeze([]),
    supported: true,
  })).filter((region) => region.countryCodes.length > 0);
  const availableCountries = new Set(stableCountries.map((country) => clean(country.code).toUpperCase()));
  const localRegions = SUBNATIONAL_REGION_DEFINITIONS
    .filter((definition) => availableCountries.has(definition.parentCountryCode))
    .map((definition) => Object.freeze({
      ...definition,
      normalizedLabel: definition.key,
      countryCode: definition.parentCountryCode,
      countryCodes: Object.freeze([definition.parentCountryCode]),
      supported: definition.knownDestinationIds.length > 0,
    }));
  return Object.freeze([...macroRegions, ...localRegions]);
}

export const ROUTE_V2_TRAVEL_REGION_DEFINITIONS = REGION_DEFINITIONS;
export const ROUTE_V2_SUBNATIONAL_REGION_DEFINITIONS = SUBNATIONAL_REGION_DEFINITIONS;

const SUBNATIONAL_REGION_TOKEN_INDEX = new Map();
const SUBNATIONAL_REGION_DESTINATION_INDEX = new Map();
const MACRO_REGION_TOKEN_INDEX = new Map();
const ALL_REGION_TOKEN_INDEX = new Map();
for (const definition of REGION_DEFINITIONS) {
  for (const token of uniqueRegionTokens(definition)) {
    MACRO_REGION_TOKEN_INDEX.set(token, definition);
    ALL_REGION_TOKEN_INDEX.set(token, definition);
  }
}
for (const definition of SUBNATIONAL_REGION_DEFINITIONS) {
  for (const token of uniqueRegionTokens(definition)) {
    SUBNATIONAL_REGION_TOKEN_INDEX.set(token, definition);
    ALL_REGION_TOKEN_INDEX.set(token, definition);
  }
  SUBNATIONAL_REGION_DESTINATION_INDEX.set(
    definition.key,
    new Set(definition.knownDestinationIds.map((identifier) => clean(identifier).toUpperCase())),
  );
}

export function resolveTravelRegionDefinition(value, catalog = SUBNATIONAL_REGION_DEFINITIONS) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const token = normalize(value);
  const compact = token.replace(/\s+/gu, "");
  const index = catalog === SUBNATIONAL_REGION_DEFINITIONS
    ? SUBNATIONAL_REGION_TOKEN_INDEX
    : catalog === REGION_DEFINITIONS
      ? MACRO_REGION_TOKEN_INDEX
      : catalog === ALL_REGION_DEFINITIONS
        ? ALL_REGION_TOKEN_INDEX
        : null;
  if (index) return index.get(token) || index.get(compact) || null;
  return (Array.isArray(catalog) ? catalog : []).find((definition) => {
    const tokens = uniqueRegionTokens(definition);
    return tokens.has(token) || tokens.has(compact);
  }) || null;
}

export function canonicalizeTravelRegionKey(value, catalog = ALL_REGION_DEFINITIONS) {
  if (!clean(value)) return "";
  const definition = resolveTravelRegionDefinition(value, catalog);
  if (definition) return definition.key;
  return normalize(value).replace(/\s+/gu, "-");
}

function uniqueRegionTokens(definition = {}) {
  const tokens = [
    definition.key,
    definition.normalizedLabel,
    definition.label,
    ...(definition.aliases || []),
  ].map(normalize).filter(Boolean);
  return new Set(tokens.flatMap((token) => [token, token.replace(/\s+/gu, "")]));
}

function destinationIdentifiers(destination = {}) {
  return new Set([
    destination.wikidataId,
    destination.qid,
    destination.entityId,
    destination.id,
  ].map((value) => clean(value).toUpperCase()).filter(Boolean));
}

export function destinationMatchesTravelRegion(destination = {}, definition = null) {
  if (!definition || !Array.isArray(definition.knownDestinationIds)) return false;
  const actual = destinationIdentifiers(destination);
  const expected = SUBNATIONAL_REGION_DESTINATION_INDEX.get(definition.key);
  if (expected) return [...actual].some((identifier) => expected.has(identifier));
  return definition.knownDestinationIds.some((identifier) => actual.has(clean(identifier).toUpperCase()));
}

export function filterDestinationsForTravelRegion(destinations = [], value, catalog = SUBNATIONAL_REGION_DEFINITIONS) {
  const definition = resolveTravelRegionDefinition(value, catalog);
  if (!definition) return [...(destinations || [])];
  return (destinations || []).filter((destination) => destinationMatchesTravelRegion(destination, definition));
}
