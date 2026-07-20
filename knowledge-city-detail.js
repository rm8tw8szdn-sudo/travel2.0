(function (global) {
  const API_PREFIX = "/api/knowledge-entities";

  function normalizeKnowledgeName(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/['’"“”]/g, "")
      .replace(/[‐‑‒–—―·•・.,，。()（）[\]{}:：/\\_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizedNames(values) {
    return new Set((values || []).map(normalizeKnowledgeName).filter(Boolean));
  }

  function hasSharedName(leftValues, rightValues) {
    const left = normalizedNames(leftValues);
    return [...normalizedNames(rightValues)].some((value) => left.has(value));
  }

  function countryNames(country = {}) {
    return [
      country.id,
      country.name,
      country.englishName,
      country.isoAlpha2,
      country.isoAlpha3,
      country.canonicalNameZh,
      country.canonicalNameEn,
      ...(country.aliases || []),
    ];
  }

  function cityNames(city = {}) {
    return [city.name, city.englishName, city.canonicalNameZh, city.canonicalNameEn, ...(city.aliases || [])];
  }

  function resolveKnowledgeCountry({ legacyCountry = {}, countries = [] } = {}) {
    return countries.find((country) => hasSharedName(countryNames(legacyCountry), countryNames(country))) || null;
  }

  function resolveKnowledgeCity({
    legacyCityName,
    legacyCityEnglishName,
    legacyCountryId,
    legacyCountryName,
    legacyCountryEnglishName,
    countries = [],
    citiesByCountry = {},
  } = {}) {
    const legacyCountry = {
      id: legacyCountryId,
      name: legacyCountryName,
      englishName: legacyCountryEnglishName,
    };
    const country = resolveKnowledgeCountry({ legacyCountry, countries });
    if (!country) return null;
    const city = (citiesByCountry[country.entityId] || []).find((candidate) => hasSharedName(
      [legacyCityName, legacyCityEnglishName],
      cityNames(candidate),
    ));
    return city ? { country, city } : null;
  }

  function publicPoi(poi = {}) {
    return {
      entityId: poi.entityId,
      entityType: poi.entityType,
      wikidataId: poi.wikidataId,
      parentCityEntityId: poi.parentCityEntityId,
      canonicalNameZh: poi.canonicalNameZh,
      canonicalNameEn: poi.canonicalNameEn,
      coordinates: poi.coordinates ? { ...poi.coordinates } : null,
    };
  }

  function uniquePois(pois = []) {
    const seen = new Set();
    return pois.filter((poi) => {
      const key = poi.wikidataId || poi.entityId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(publicPoi);
  }

  async function requestJson(fetchImpl, apiBase, path) {
    const response = await fetchImpl(`${apiBase}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Knowledge Entity Layer request failed with status ${response.status}`);
    return response.json();
  }

  async function loadKnowledgeCityPois({
    legacyCity = {},
    legacyCountry = {},
    fetchImpl = global.fetch?.bind(global),
    apiBase = "",
  } = {}) {
    if (typeof fetchImpl !== "function") return { status: "unavailable", pois: [] };
    try {
      const countryPayload = await requestJson(fetchImpl, apiBase, `${API_PREFIX}/countries`);
      const country = resolveKnowledgeCountry({ legacyCountry, countries: countryPayload.countries || [] });
      if (!country) return { status: "unmatched", pois: [] };

      const cityPayload = await requestJson(
        fetchImpl,
        apiBase,
        `${API_PREFIX}/countries/${encodeURIComponent(country.entityId)}/cities`,
      );
      const resolved = resolveKnowledgeCity({
        legacyCityName: legacyCity.name,
        legacyCityEnglishName: legacyCity.englishName,
        legacyCountryId: legacyCountry.id,
        legacyCountryName: legacyCountry.name,
        legacyCountryEnglishName: legacyCountry.englishName,
        countries: [country],
        citiesByCountry: { [country.entityId]: cityPayload.cities || [] },
      });
      if (!resolved) return { status: "unmatched", pois: [] };

      const poiPayload = await requestJson(
        fetchImpl,
        apiBase,
        `${API_PREFIX}/cities/${encodeURIComponent(resolved.city.entityId)}/pois`,
      );
      return {
        status: "ready",
        country: resolved.country,
        city: resolved.city,
        pois: uniquePois(poiPayload.pois || []),
      };
    } catch {
      return { status: "unavailable", pois: [] };
    }
  }

  const api = {
    loadKnowledgeCityPois,
    normalizeKnowledgeName,
    resolveKnowledgeCity,
    resolveKnowledgeCountry,
    uniquePois,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KnowledgeCityDetail = api;
})(typeof window !== "undefined" ? window : globalThis);
