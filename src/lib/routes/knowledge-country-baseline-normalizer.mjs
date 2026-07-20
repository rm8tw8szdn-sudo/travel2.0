import {
  COUNTRY_BASELINE_SCHEMA_VERSION,
  canonicalizeCountryAliases,
  createCountryEntityId,
  normalizeCountryCoordinates,
  normalizeIsoAlpha2,
  normalizeIsoAlpha3,
  normalizeIsoNumeric,
  sourceEntry,
  validateCountryEntity,
} from "./knowledge-country-baseline-schema.mjs";
import { cleanString, stableHash } from "./route-v2-utils.mjs";

const WIKIDATA_ENTITY_URL = "https://www.wikidata.org/wiki/";

function entityUrl(qid = "") {
  return qid ? `${WIKIDATA_ENTITY_URL}${qid}` : "";
}

function cleanObjectId(uri = "") {
  const text = cleanString(uri);
  const match = text.match(/\/(Q\d+)$/u);
  return match ? match[1] : text;
}

function parsePoint(value = "") {
  const text = cleanString(value);
  const match = text.match(/^Point\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/u);
  if (!match) return null;
  return normalizeCountryCoordinates({
    longitude: Number(match[1]),
    latitude: Number(match[2]),
  });
}

function sourceFromCatalog({ field, source, retrievedAt, value }) {
  return sourceEntry({
    sourceType: "project-country-catalog",
    source,
    field,
    retrievedAt,
    value,
  });
}

function sourceFromIso({ field, source, retrievedAt, value }) {
  return sourceEntry({
    sourceType: "iso",
    source,
    field,
    retrievedAt,
    value,
  });
}

function sourceFromWikidata({ field, qid, retrievedAt, value }) {
  return sourceEntry({
    sourceType: "wikidata",
    source: "Wikidata SPARQL",
    field,
    sourceUrl: entityUrl(qid),
    retrievedAt,
    value,
  });
}

function addUnique(map, key, value) {
  const cleanKey = cleanString(key);
  const cleanValue = cleanString(value);
  if (!cleanKey || !cleanValue) return;
  if (!map.has(cleanKey)) map.set(cleanKey, new Set());
  map.get(cleanKey).add(cleanValue);
}

function splitMultiValue(value = "") {
  return cleanString(value).split("|").map(cleanString).filter(Boolean);
}

function addValues(target, ...values) {
  for (const value of values.flatMap(splitMultiValue)) {
    if (value) target.add(value);
  }
}

export function aggregateWikidataCountryRows(rawSnapshot = {}) {
  const bindings = rawSnapshot?.wikidata?.results?.bindings || rawSnapshot?.results?.bindings || [];
  const countries = new Map();
  for (const row of bindings) {
    const isoAlpha2 = normalizeIsoAlpha2(row.iso2?.value);
    if (!isoAlpha2) continue;
    if (!countries.has(isoAlpha2)) {
      countries.set(isoAlpha2, {
        isoAlpha2,
        wikidataId: cleanObjectId(row.country?.value),
        isoAlpha3: "",
        isoNumeric: "",
        countryLabelsEn: new Set(),
        countryLabelsZh: new Set(),
        countryAliases: new Set(),
        capitalIds: new Set(),
        capitalLabelsEn: new Set(),
        capitalLabelsZh: new Set(),
        capitalAliases: new Set(),
        capitalCandidates: new Map(),
        continentIds: new Set(),
        continentLabelsEn: new Set(),
        continentLabelsZh: new Set(),
        continentCandidates: new Map(),
        coordinates: null,
      });
    }
    const entry = countries.get(isoAlpha2);
    if (cleanObjectId(row.country?.value)) entry.wikidataId = cleanObjectId(row.country?.value);
    if (normalizeIsoAlpha3(row.iso3?.value)) entry.isoAlpha3 = normalizeIsoAlpha3(row.iso3?.value);
    if (normalizeIsoNumeric(row.isoNumeric?.value)) entry.isoNumeric = normalizeIsoNumeric(row.isoNumeric?.value);
    addUnique(countries, isoAlpha2, "");
    addValues(entry.countryLabelsEn, row.countryLabelEn?.value);
    addValues(entry.countryLabelsZh, row.countryLabelZh?.value);
    addValues(entry.countryAliases, row.countryAliasEn?.value, row.countryAliasZh?.value, row.countryAliasesEn?.value, row.countryAliasesZh?.value);
    addValues(entry.capitalIds, cleanObjectId(row.capital?.value));
    addValues(entry.capitalLabelsEn, row.capitalLabelEn?.value);
    addValues(entry.capitalLabelsZh, row.capitalLabelZh?.value);
    addValues(entry.capitalAliases, row.capitalAliasEn?.value, row.capitalAliasZh?.value, row.capitalAliasesEn?.value, row.capitalAliasesZh?.value);
    addValues(entry.continentIds, cleanObjectId(row.continent?.value));
    addValues(entry.continentLabelsEn, row.continentLabelEn?.value);
    addValues(entry.continentLabelsZh, row.continentLabelZh?.value);
    const capitalId = cleanObjectId(row.capital?.value);
    if (capitalId) {
      if (!entry.capitalCandidates.has(capitalId)) {
        entry.capitalCandidates.set(capitalId, {
          wikidataId: capitalId,
          canonicalNameZh: "",
          canonicalNameEn: "",
          aliases: new Set(),
          sourceUrl: entityUrl(capitalId),
        });
      }
      const candidate = entry.capitalCandidates.get(capitalId);
      candidate.canonicalNameZh ||= cleanString(row.capitalLabelZh?.value);
      candidate.canonicalNameEn ||= cleanString(row.capitalLabelEn?.value);
      addValues(candidate.aliases, row.capitalAliasEn?.value, row.capitalAliasZh?.value, row.capitalAliasesEn?.value, row.capitalAliasesZh?.value);
    }
    const continentId = cleanObjectId(row.continent?.value);
    if (continentId) {
      if (!entry.continentCandidates.has(continentId)) {
        entry.continentCandidates.set(continentId, {
          wikidataId: continentId,
          canonicalNameZh: "",
          canonicalNameEn: "",
          sourceUrl: entityUrl(continentId),
        });
      }
      const candidate = entry.continentCandidates.get(continentId);
      candidate.canonicalNameZh ||= cleanString(row.continentLabelZh?.value);
      candidate.canonicalNameEn ||= cleanString(row.continentLabelEn?.value);
    }
    const coordinates = parsePoint(row.coordinate?.value);
    if (coordinates) entry.coordinates = coordinates;
  }
  return countries;
}

function pickFirstSorted(values = []) {
  return [...values].sort((a, b) => a.localeCompare(b, "en"))[0] || "";
}

function capitalCandidates(wikidata = {}) {
  const candidates = [...(wikidata.capitalCandidates || new Map()).values()]
    .map((candidate) => ({
      wikidataId: cleanString(candidate.wikidataId),
      canonicalNameZh: cleanString(candidate.canonicalNameZh),
      canonicalNameEn: cleanString(candidate.canonicalNameEn),
      aliases: canonicalizeCountryAliases([...(candidate.aliases || [])]),
      sourceUrl: cleanString(candidate.sourceUrl || entityUrl(candidate.wikidataId)),
      source: "Wikidata P36",
    }))
    .filter((candidate) => candidate.wikidataId);
  if (candidates.length > 0) {
    return candidates.sort((a, b) => a.wikidataId.localeCompare(b.wikidataId));
  }
  const fallbackId = pickFirstSorted(wikidata.capitalIds);
  if (!fallbackId) return [];
  return [{
    wikidataId: fallbackId,
    canonicalNameZh: pickFirstSorted(wikidata.capitalLabelsZh),
    canonicalNameEn: pickFirstSorted(wikidata.capitalLabelsEn),
    aliases: canonicalizeCountryAliases([...(wikidata.capitalAliases || [])]),
    sourceUrl: entityUrl(fallbackId),
    source: "Wikidata P36",
  }];
}

function normalizeCapital(wikidata = {}, seed = {}) {
  const [candidate] = capitalCandidates(wikidata);
  if (!candidate) {
    return {
      wikidataId: "",
      canonicalNameZh: "",
      canonicalNameEn: "",
      aliases: [],
    };
  }
  const override = seed.capitalOverride && typeof seed.capitalOverride === "object"
    ? seed.capitalOverride
    : null;
  if (override && (!override.wikidataId || cleanString(override.wikidataId) === candidate.wikidataId)) {
    return {
      wikidataId: candidate.wikidataId,
      canonicalNameZh: cleanString(override.canonicalNameZh) || candidate.canonicalNameZh,
      canonicalNameEn: cleanString(override.canonicalNameEn) || candidate.canonicalNameEn,
      aliases: canonicalizeCountryAliases([
        ...candidate.aliases,
        ...(Array.isArray(override.aliases) ? override.aliases : []),
      ]),
    };
  }
  return {
    wikidataId: candidate.wikidataId,
    canonicalNameZh: candidate.canonicalNameZh,
    canonicalNameEn: candidate.canonicalNameEn,
    aliases: candidate.aliases,
  };
}

function continentCandidates(wikidata = {}) {
  const candidates = [...(wikidata.continentCandidates || new Map()).values()]
    .map((candidate) => ({
      wikidataId: cleanString(candidate.wikidataId),
      canonicalNameZh: cleanString(candidate.canonicalNameZh),
      canonicalNameEn: cleanString(candidate.canonicalNameEn),
      sourceUrl: cleanString(candidate.sourceUrl || entityUrl(candidate.wikidataId)),
      source: "Wikidata P30",
      semanticNote: "Wikidata P30 can represent continent, macro-region, or a special geographic region.",
    }))
    .filter((candidate) => candidate.wikidataId);
  if (candidates.length > 0) {
    return candidates.sort((a, b) => a.wikidataId.localeCompare(b.wikidataId));
  }
  const fallbackId = pickFirstSorted(wikidata.continentIds);
  if (!fallbackId) return [];
  return [{
    wikidataId: fallbackId,
    canonicalNameZh: pickFirstSorted(wikidata.continentLabelsZh),
    canonicalNameEn: pickFirstSorted(wikidata.continentLabelsEn),
    sourceUrl: entityUrl(fallbackId),
    source: "Wikidata P30",
    semanticNote: "Wikidata P30 can represent continent, macro-region, or a special geographic region.",
  }];
}

function normalizeContinent(wikidata = {}, seed = {}) {
  const override = seed.continentOverride && typeof seed.continentOverride === "object"
    ? seed.continentOverride
    : null;
  if (override) {
    return {
      wikidataId: cleanString(override.wikidataId),
      canonicalNameZh: cleanString(override.canonicalNameZh),
      canonicalNameEn: cleanString(override.canonicalNameEn),
    };
  }
  const [candidate] = continentCandidates(wikidata);
  if (!candidate) {
    return {
      wikidataId: "",
      canonicalNameZh: "",
      canonicalNameEn: "",
    };
  }
  return {
    wikidataId: candidate.wikidataId,
    canonicalNameZh: candidate.canonicalNameZh,
    canonicalNameEn: candidate.canonicalNameEn,
  };
}

export function normalizeCountryBaseline({
  rawSnapshot = {},
  pilotCountries = [],
  sourceNames = {},
} = {}) {
  const retrievedAt = cleanString(rawSnapshot.retrievedAt);
  const catalogSource = cleanString(sourceNames.catalog) || "data/countries.zh.json";
  const isoSource = cleanString(sourceNames.iso) || "P1A pilot ISO seed";
  const wikidataByIso2 = aggregateWikidataCountryRows(rawSnapshot);
  const countries = [];
  const conflicts = [];
  const reviewQueue = [];
  const provenance = {};

  for (const seed of pilotCountries) {
    const isoAlpha2 = normalizeIsoAlpha2(seed.isoAlpha2 || seed.code);
    const wikidata = wikidataByIso2.get(isoAlpha2);
    if (!wikidata) {
      conflicts.push({
        conflictId: `conflict-${stableHash({ isoAlpha2, type: "wikidata-country-missing" }).slice(0, 16)}`,
        isoAlpha2,
        severity: "blocking",
        type: "wikidata-country-missing",
        message: "No Wikidata row found for pilot country.",
      });
      continue;
    }

    const isoAlpha3 = normalizeIsoAlpha3(wikidata.isoAlpha3 || seed.isoAlpha3);
    const isoNumeric = normalizeIsoNumeric(wikidata.isoNumeric || seed.isoNumeric || seed.numeric);
    const wikidataId = cleanString(wikidata.wikidataId || seed.wikidataId);
    const canonicalNameZh = cleanString(seed.canonicalNameZh || seed.nameZh || seed.name || pickFirstSorted(wikidata.countryLabelsZh));
    const canonicalNameEn = cleanString(seed.canonicalNameEn || seed.nameEn || pickFirstSorted(wikidata.countryLabelsEn));
    const allCapitalCandidates = capitalCandidates(wikidata);
    const allContinentCandidates = continentCandidates(wikidata);
    const continent = normalizeContinent(wikidata, seed);
    const capital = normalizeCapital(wikidata, seed);
    const aliases = canonicalizeCountryAliases([
      ...wikidata.countryAliases,
      ...wikidata.countryLabelsEn,
      ...wikidata.countryLabelsZh,
      canonicalNameZh,
      canonicalNameEn,
      ...(Array.isArray(seed.aliases) ? seed.aliases : []),
    ]).filter((alias) => alias !== canonicalNameZh && alias !== canonicalNameEn);
    const coordinates = normalizeCountryCoordinates(wikidata.coordinates);
    const entityId = createCountryEntityId({ isoAlpha2, wikidataId });
    const fieldProvenance = {
      entityId: [sourceFromIso({ field: "isoAlpha2", source: isoSource, retrievedAt, value: isoAlpha2 }), sourceFromWikidata({ field: "wikidataId", qid: wikidataId, retrievedAt, value: wikidataId })],
      isoAlpha2: [sourceFromIso({ field: "isoAlpha2", source: isoSource, retrievedAt, value: isoAlpha2 })],
      isoAlpha3: [sourceFromIso({ field: "isoAlpha3", source: isoSource, retrievedAt, value: normalizeIsoAlpha3(seed.isoAlpha3) }), sourceFromWikidata({ field: "P298", qid: wikidataId, retrievedAt, value: isoAlpha3 })],
      isoNumeric: [sourceFromIso({ field: "isoNumeric", source: isoSource, retrievedAt, value: normalizeIsoNumeric(seed.isoNumeric || seed.numeric) }), sourceFromWikidata({ field: "P299", qid: wikidataId, retrievedAt, value: isoNumeric })],
      wikidataId: [sourceFromWikidata({ field: "country", qid: wikidataId, retrievedAt, value: wikidataId })],
      canonicalNameZh: [sourceFromCatalog({ field: "name", source: catalogSource, retrievedAt, value: canonicalNameZh })],
      canonicalNameEn: [sourceFromWikidata({ field: "rdfs:label@en", qid: wikidataId, retrievedAt, value: canonicalNameEn })],
      aliases: [sourceFromWikidata({ field: "skos:altLabel", qid: wikidataId, retrievedAt, value: aliases })],
      continent: [
        ...(seed.continentOverride ? [sourceEntry({
          sourceType: "manual-override",
          source: cleanString(seed.continentOverride.source) || "P1A curated override",
          field: "continent",
          retrievedAt,
          value: continent,
        })] : []),
        sourceFromWikidata({
          field: "P30",
          qid: wikidataId,
          retrievedAt,
          value: {
            selected: continent,
            candidates: allContinentCandidates,
            semanticNote: "Wikidata P30 can represent continent, macro-region, or a special geographic region.",
          },
        }),
      ],
      region: [sourceFromCatalog({ field: "group", source: catalogSource, retrievedAt, value: cleanString(seed.region || seed.group) })],
      subregion: [sourceFromCatalog({ field: "subregion", source: catalogSource, retrievedAt, value: cleanString(seed.subregion || seed.region || seed.group) })],
      capital: [
        ...(seed.capitalOverride ? [sourceEntry({
          sourceType: "manual-override",
          source: cleanString(seed.capitalOverride.source) || "P1A curated capital override",
          field: "capital",
          retrievedAt,
          value: seed.capitalOverride,
        })] : []),
        sourceFromWikidata({
          field: "P36",
          qid: wikidataId,
          retrievedAt,
          value: {
            selected: capital,
            candidates: allCapitalCandidates,
          },
        }),
      ],
      coordinates: [sourceFromWikidata({ field: "P625", qid: wikidataId, retrievedAt, value: coordinates })],
    };
    const entity = {
      schemaVersion: COUNTRY_BASELINE_SCHEMA_VERSION,
      entityId,
      entityType: "country",
      isoAlpha2,
      isoAlpha3,
      isoNumeric,
      wikidataId,
      canonicalNameZh,
      canonicalNameEn,
      aliases,
      continent,
      region: cleanString(seed.region || seed.group),
      subregion: cleanString(seed.subregion || seed.region || seed.group),
      capital,
      coordinates,
      entitySourceType: "wikidata",
      provenance: fieldProvenance,
      confidence: 0.95,
      retrievedAt,
    };
    const validation = validateCountryEntity(entity);
    if (!validation.accepted) {
      conflicts.push({
        conflictId: `conflict-${stableHash({ isoAlpha2, reasons: validation.reasons }).slice(0, 16)}`,
        isoAlpha2,
        entityId,
        severity: "blocking",
        type: "country-validation-failed",
        reasons: validation.reasons,
      });
    }
    if (allCapitalCandidates.length > 1) {
      reviewQueue.push({
        reviewId: `review-${stableHash({ isoAlpha2, type: "multiple-capital-candidates", values: allCapitalCandidates.map((candidate) => candidate.wikidataId) }).slice(0, 16)}`,
        isoAlpha2,
        entityId,
        severity: "manual-review",
        type: "multiple-capital-candidates",
        selected: capital,
        candidates: allCapitalCandidates,
        sourceField: "Wikidata P36",
      });
    } else if (seed.capitalOverride) {
      reviewQueue.push({
        reviewId: `review-${stableHash({ isoAlpha2, type: "capital-curated-override", value: seed.capitalOverride }).slice(0, 16)}`,
        isoAlpha2,
        entityId,
        severity: "manual-review",
        type: "capital-curated-override",
        selected: capital,
        candidates: allCapitalCandidates,
        override: seed.capitalOverride,
        sourceField: "Wikidata P36",
      });
    }
    if (allContinentCandidates.length === 0) {
      reviewQueue.push({
        reviewId: `review-${stableHash({ isoAlpha2, type: "continent-candidate-missing" }).slice(0, 16)}`,
        isoAlpha2,
        entityId,
        severity: "manual-review",
        type: "continent-candidate-missing",
        sourceField: "Wikidata P30",
        semanticNote: "Wikidata P30 can represent continent, macro-region, or a special geographic region.",
      });
    } else if (allContinentCandidates.length > 1) {
      reviewQueue.push({
        reviewId: `review-${stableHash({ isoAlpha2, type: "multiple-continent-candidates", values: allContinentCandidates.map((candidate) => candidate.wikidataId) }).slice(0, 16)}`,
        isoAlpha2,
        entityId,
        severity: "manual-review",
        type: seed.continentOverride ? "multiple-continent-candidates-with-curated-override" : "multiple-continent-candidates",
        selected: continent,
        candidates: allContinentCandidates,
        sourceField: "Wikidata P30",
        semanticNote: "Wikidata P30 can represent continent, macro-region, or a special geographic region.",
      });
    }
    if (wikidata.countryLabelsZh.size > 1 || wikidata.countryLabelsEn.size > 1) {
      reviewQueue.push({
        reviewId: `review-${stableHash({ isoAlpha2, type: "multiple-country-labels" }).slice(0, 16)}`,
        isoAlpha2,
        entityId,
        severity: "manual-review",
        type: "multiple-country-labels",
        labels: {
          zh: [...wikidata.countryLabelsZh].sort(),
          en: [...wikidata.countryLabelsEn].sort(),
        },
      });
    }
    countries.push(entity);
    provenance[entityId] = fieldProvenance;
  }

  return {
    countries: countries.sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2)),
    provenance: Object.fromEntries(Object.entries(provenance).sort(([a], [b]) => a.localeCompare(b))),
    conflicts: conflicts.sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2) || a.type.localeCompare(b.type)),
    reviewQueue: reviewQueue.sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2) || a.type.localeCompare(b.type)),
  };
}
