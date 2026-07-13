(function (global) {
  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function dataSource(state = {}) {
    const data = global.TravelData || {};
    return {
      countries: state.countries || data.DEFAULT_COUNTRIES || [],
      cities: state.cities || data.DEFAULT_CITIES || [],
    };
  }

  function expandTerms(query, aliases = {}) {
    const raw = String(query || "").trim();
    if (!raw) return [];
    const direct = raw.split(/\s+/).filter(Boolean);
    const aliasTerms = Object.entries(aliases).flatMap(([key, values]) => (
      normalize(raw).includes(normalize(key)) ? values : []
    ));
    return unique([...direct, raw, ...aliasTerms]).map(normalize).filter(Boolean);
  }

  function itemText(item, state = {}) {
    const country = state.countriesById?.[item.countryId];
    return [
      item.id,
      item.name,
      item.englishName,
      item.continent,
      item.intro,
      item.description,
      item.reason,
      item.days,
      item.season,
      item.bestSeason,
      item.budgetLevel,
      item.searchText,
      country?.name,
      country?.englishName,
      ...(item.tags || []),
      ...(item.keywords || []),
      ...(item.spots || []),
      ...(item.countries || []),
      ...(item.cities || []),
      ...(item.cityNames || []),
      ...(item.candidateCityNames || []),
      ...(item.countryIds || []).map((id) => state.countriesById?.[id]?.name || id),
      ...(item.countryIds || []).map((id) => state.countriesById?.[id]?.englishName || ""),
      ...(item.cityIds || []).map((id) => state.citiesById?.[id]?.name || id),
      ...(item.cityIds || []).map((id) => state.citiesById?.[id]?.englishName || ""),
    ].join(" ").toLowerCase();
  }

  function matchesTerms(item, terms, state) {
    if (!terms.length) return true;
    const text = itemText(item, state);
    return terms.some((term) => text.includes(term));
  }

  function atlasItemFromCountry(country) {
    return {
      ...country,
      type: "country",
      typeLabel: "国家",
      href: `country-japan.html#${encodeURIComponent(country.id)}`,
    };
  }

  function atlasItemFromCity(city, state = {}) {
    const country = state.countriesById?.[city.countryId] || {};
    return {
      ...city,
      type: "city",
      typeLabel: "城市",
      parentName: country.name || "",
      href: `city-oslo.html#${encodeURIComponent(city.id)}`,
    };
  }

  function searchAtlas(state = {}, query = "", options = {}) {
    const source = dataSource(state);
    const terms = expandTerms(query, source.aliases);
    const countriesById = state.countriesById || Object.fromEntries(source.countries.map((item) => [item.id, item]));
    const citiesById = state.citiesById || Object.fromEntries(source.cities.map((item) => [item.id, item]));
    const nextState = { ...state, countriesById, citiesById };
    const directCountries = source.countries
      .filter((country) => matchesTerms(country, terms, nextState))
      .map(atlasItemFromCountry);
    const directCountryIds = new Set(directCountries.map((country) => country.id));
    const cities = source.cities
      .filter((city) => matchesTerms(city, terms, nextState) || directCountryIds.has(city.countryId))
      .map((city) => atlasItemFromCity(city, nextState));
    const parentCountryIds = new Set(cities.map((city) => city.countryId));
    const parentCountries = source.countries
      .filter((country) => parentCountryIds.has(country.id) && !directCountryIds.has(country.id))
      .map(atlasItemFromCountry);
    const countries = [...directCountries, ...parentCountries];
    const allItems = [...countries, ...cities];
    if (options.filter === "favorite") return allItems.filter((item) => item.isFavorite);
    if (options.filter && options.filter !== "all") return allItems.filter((item) => item.explorationStatus === options.filter);
    return allItems;
  }

  const api = {
    expandTerms,
    searchAtlas,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TravelSearch = api;
})(typeof window !== "undefined" ? window : globalThis);
