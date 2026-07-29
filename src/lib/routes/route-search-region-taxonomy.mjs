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
  return Object.freeze(REGION_DEFINITIONS.map((definition) => Object.freeze({
    key: definition.key,
    label: definition.label,
    normalizedLabel: definition.key,
    aliases: definition.aliases,
    countryCodes: Object.freeze(stableCountries
      .filter((country) => definitionMatchesCountry(definition, country))
      .map((country) => clean(country.code).toUpperCase())
      .sort((left, right) => left.localeCompare(right, "en"))),
  })).filter((region) => region.countryCodes.length > 0));
}

export const ROUTE_V2_TRAVEL_REGION_DEFINITIONS = REGION_DEFINITIONS;
