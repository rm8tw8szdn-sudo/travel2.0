import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateWikidataCountryRows,
  dedupeCountryEntities,
  normalizeCountryBaseline,
} from "../src/lib/routes/index.mjs";
import { stableHash } from "../src/lib/routes/route-v2-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(projectRoot, "data", "knowledge");
const catalogPath = path.resolve(projectRoot, "data", "countries.zh.json");
const endpoint = "https://query.wikidata.org/sparql";

export const countryBatches = Object.freeze({
  pilot: {
    label: "P1A pilot",
    schemaSuffix: "p1a-pilot",
    rawPath: path.resolve(outputRoot, "raw", "countries-p1a-pilot.wikidata.json"),
    countriesPath: path.resolve(outputRoot, "countries.p1a-pilot.json"),
    provenancePath: path.resolve(outputRoot, "provenance.p1a-pilot.json"),
    conflictsPath: path.resolve(outputRoot, "conflicts.p1a-pilot.json"),
    reviewQueuePath: path.resolve(outputRoot, "review-queue.p1a-pilot.json"),
    countries: [
      { isoAlpha2: "JP", isoAlpha3: "JPN", isoNumeric: "392", nameEn: "Japan", subregion: "East Asia" },
      { isoAlpha2: "AD", isoAlpha3: "AND", isoNumeric: "020", nameEn: "Andorra", subregion: "Southern Europe" },
      { isoAlpha2: "FJ", isoAlpha3: "FJI", isoNumeric: "242", nameEn: "Fiji", subregion: "Melanesia" },
      { isoAlpha2: "MA", isoAlpha3: "MAR", isoNumeric: "504", nameEn: "Morocco", subregion: "Northern Africa" },
      { isoAlpha2: "CD", isoAlpha3: "COD", isoNumeric: "180", nameEn: "Democratic Republic of the Congo", subregion: "Middle Africa" },
    ],
  },
  batch01: {
    label: "P1A batch01",
    schemaSuffix: "p1a-batch01",
    rawPath: path.resolve(outputRoot, "raw", "countries-p1a-batch01.wikidata.json"),
    countriesPath: path.resolve(outputRoot, "batches", "countries.p1a-batch01.json"),
    provenancePath: path.resolve(outputRoot, "batches", "provenance.p1a-batch01.json"),
    conflictsPath: path.resolve(outputRoot, "batches", "conflicts.p1a-batch01.json"),
    reviewQueuePath: path.resolve(outputRoot, "batches", "review-queue.p1a-batch01.json"),
    countries: [
      { isoAlpha2: "US", isoAlpha3: "USA", isoNumeric: "840", nameEn: "United States of America", subregion: "Northern America" },
      { isoAlpha2: "CA", isoAlpha3: "CAN", isoNumeric: "124", nameEn: "Canada", subregion: "Northern America" },
      { isoAlpha2: "MX", isoAlpha3: "MEX", isoNumeric: "484", nameEn: "Mexico", subregion: "Central America" },
      { isoAlpha2: "BR", isoAlpha3: "BRA", isoNumeric: "076", nameEn: "Brazil", subregion: "South America" },
      { isoAlpha2: "AR", isoAlpha3: "ARG", isoNumeric: "032", nameEn: "Argentina", subregion: "South America" },
      { isoAlpha2: "GB", isoAlpha3: "GBR", isoNumeric: "826", nameEn: "United Kingdom", subregion: "Northern Europe" },
      { isoAlpha2: "FR", isoAlpha3: "FRA", isoNumeric: "250", nameEn: "France", subregion: "Western Europe" },
      { isoAlpha2: "DE", isoAlpha3: "DEU", isoNumeric: "276", nameEn: "Germany", subregion: "Western Europe" },
      { isoAlpha2: "IT", isoAlpha3: "ITA", isoNumeric: "380", nameEn: "Italy", subregion: "Southern Europe" },
      { isoAlpha2: "ES", isoAlpha3: "ESP", isoNumeric: "724", nameEn: "Spain", subregion: "Southern Europe" },
      { isoAlpha2: "TR", isoAlpha3: "TUR", isoNumeric: "792", nameEn: "Turkey", subregion: "Western Asia" },
      { isoAlpha2: "EG", isoAlpha3: "EGY", isoNumeric: "818", nameEn: "Egypt", subregion: "Northern Africa" },
      { isoAlpha2: "ZA", isoAlpha3: "ZAF", isoNumeric: "710", nameEn: "South Africa", subregion: "Southern Africa" },
      { isoAlpha2: "AU", isoAlpha3: "AUS", isoNumeric: "036", nameEn: "Australia", subregion: "Australia and New Zealand" },
      { isoAlpha2: "NZ", isoAlpha3: "NZL", isoNumeric: "554", nameEn: "New Zealand", subregion: "Australia and New Zealand" },
    ],
  },
  batch02: {
    label: "P1A batch02",
    schemaSuffix: "p1a-batch02",
    rawPath: path.resolve(outputRoot, "raw", "countries-p1a-batch02.wikidata.json"),
    countriesPath: path.resolve(outputRoot, "batches", "countries.p1a-batch02.json"),
    provenancePath: path.resolve(outputRoot, "batches", "provenance.p1a-batch02.json"),
    conflictsPath: path.resolve(outputRoot, "batches", "conflicts.p1a-batch02.json"),
    reviewQueuePath: path.resolve(outputRoot, "batches", "review-queue.p1a-batch02.json"),
    countries: [
      { isoAlpha2: "CN", isoAlpha3: "CHN", isoNumeric: "156", nameEn: "China", subregion: "Eastern Asia" },
      { isoAlpha2: "IN", isoAlpha3: "IND", isoNumeric: "356", nameEn: "India", subregion: "Southern Asia" },
      { isoAlpha2: "KR", isoAlpha3: "KOR", isoNumeric: "410", nameEn: "South Korea", subregion: "Eastern Asia" },
      { isoAlpha2: "TH", isoAlpha3: "THA", isoNumeric: "764", nameEn: "Thailand", subregion: "South-eastern Asia" },
      { isoAlpha2: "VN", isoAlpha3: "VNM", isoNumeric: "704", nameEn: "Vietnam", subregion: "South-eastern Asia" },
      { isoAlpha2: "ID", isoAlpha3: "IDN", isoNumeric: "360", nameEn: "Indonesia", subregion: "South-eastern Asia" },
      { isoAlpha2: "MY", isoAlpha3: "MYS", isoNumeric: "458", nameEn: "Malaysia", subregion: "South-eastern Asia" },
      { isoAlpha2: "SG", isoAlpha3: "SGP", isoNumeric: "702", nameEn: "Singapore", subregion: "South-eastern Asia" },
      { isoAlpha2: "SA", isoAlpha3: "SAU", isoNumeric: "682", nameEn: "Saudi Arabia", subregion: "Western Asia" },
      { isoAlpha2: "AE", isoAlpha3: "ARE", isoNumeric: "784", nameEn: "United Arab Emirates", subregion: "Western Asia" },
      { isoAlpha2: "KE", isoAlpha3: "KEN", isoNumeric: "404", nameEn: "Kenya", subregion: "Eastern Africa" },
      {
        isoAlpha2: "NG",
        isoAlpha3: "NGA",
        isoNumeric: "566",
        nameEn: "Nigeria",
        subregion: "Western Africa",
        capitalOverride: {
          wikidataId: "Q3787",
          canonicalNameEn: "Abuja",
          source: "P1A batch02 curated capital label override: Wikidata Q3787 lacks an English rdfs:label in the raw snapshot.",
        },
      },
      { isoAlpha2: "GR", isoAlpha3: "GRC", isoNumeric: "300", nameEn: "Greece", subregion: "Southern Europe" },
      { isoAlpha2: "CH", isoAlpha3: "CHE", isoNumeric: "756", nameEn: "Switzerland", subregion: "Western Europe" },
      { isoAlpha2: "RU", isoAlpha3: "RUS", isoNumeric: "643", nameEn: "Russia", subregion: "Eastern Europe" },
    ],
  },
  batch03: {
    label: "P1A batch03",
    schemaSuffix: "p1a-batch03",
    rawPath: path.resolve(outputRoot, "raw", "countries-p1a-batch03.wikidata.json"),
    countriesPath: path.resolve(outputRoot, "batches", "countries.p1a-batch03.json"),
    provenancePath: path.resolve(outputRoot, "batches", "provenance.p1a-batch03.json"),
    conflictsPath: path.resolve(outputRoot, "batches", "conflicts.p1a-batch03.json"),
    reviewQueuePath: path.resolve(outputRoot, "batches", "review-queue.p1a-batch03.json"),
    countries: [
      { isoAlpha2: "AT", isoAlpha3: "AUT", isoNumeric: "040", wikidataId: "Q40", nameEn: "Austria", subregion: "Western Europe" },
      { isoAlpha2: "BE", isoAlpha3: "BEL", isoNumeric: "056", wikidataId: "Q31", nameEn: "Belgium", subregion: "Western Europe" },
      { isoAlpha2: "CL", isoAlpha3: "CHL", isoNumeric: "152", wikidataId: "Q298", nameEn: "Chile", subregion: "South America" },
      { isoAlpha2: "CO", isoAlpha3: "COL", isoNumeric: "170", wikidataId: "Q739", nameEn: "Colombia", subregion: "South America" },
      { isoAlpha2: "CZ", isoAlpha3: "CZE", isoNumeric: "203", wikidataId: "Q213", nameEn: "Czechia", subregion: "Eastern Europe" },
      { isoAlpha2: "DK", isoAlpha3: "DNK", isoNumeric: "208", wikidataId: "Q35", nameEn: "Denmark", subregion: "Northern Europe" },
      { isoAlpha2: "FI", isoAlpha3: "FIN", isoNumeric: "246", wikidataId: "Q33", nameEn: "Finland", subregion: "Northern Europe" },
      { isoAlpha2: "IE", isoAlpha3: "IRL", isoNumeric: "372", wikidataId: "Q27", nameEn: "Ireland", subregion: "Northern Europe" },
      { isoAlpha2: "IL", isoAlpha3: "ISR", isoNumeric: "376", wikidataId: "Q801", nameEn: "Israel", subregion: "Western Asia" },
      { isoAlpha2: "NL", isoAlpha3: "NLD", isoNumeric: "528", wikidataId: "Q55", nameEn: "Netherlands", subregion: "Western Europe" },
      { isoAlpha2: "NO", isoAlpha3: "NOR", isoNumeric: "578", wikidataId: "Q20", nameEn: "Norway", subregion: "Northern Europe" },
      { isoAlpha2: "PE", isoAlpha3: "PER", isoNumeric: "604", wikidataId: "Q419", nameEn: "Peru", subregion: "South America" },
      { isoAlpha2: "PH", isoAlpha3: "PHL", isoNumeric: "608", wikidataId: "Q928", nameEn: "Philippines", subregion: "South-eastern Asia" },
      { isoAlpha2: "PL", isoAlpha3: "POL", isoNumeric: "616", wikidataId: "Q36", nameEn: "Poland", subregion: "Eastern Europe" },
      { isoAlpha2: "PT", isoAlpha3: "PRT", isoNumeric: "620", wikidataId: "Q45", nameEn: "Portugal", subregion: "Southern Europe" },
    ],
  },
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeJson(value));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, serializeJson(value));
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function selectedBatchName() {
  const arg = process.argv.find((value) => value.startsWith("--batch="));
  return arg ? arg.slice("--batch=".length) : "pilot";
}

function numericOption(name, fallback) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(name.length + 3));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadBatchCountries(batch) {
  const catalog = readJson(catalogPath);
  const byCode = new Map(catalog.map((item) => [String(item.code || "").toUpperCase(), item]));
  return batch.countries.map((country) => {
    const catalogRecord = byCode.get(country.isoAlpha2) || {};
    return {
      ...country,
      canonicalNameZh: catalogRecord.name || "",
      region: catalogRecord.group || "",
      numeric: catalogRecord.numeric || country.isoNumeric,
    };
  });
}

function usesApprovedQidAnchors(countries) {
  const anchoredCount = countries.filter((country) => country.wikidataId).length;
  if (anchoredCount !== 0 && anchoredCount !== countries.length) {
    throw new Error("Country batch must provide approved QID anchors for every seed or none.");
  }
  if (anchoredCount === 0) return false;
  const qids = new Set(countries.map((country) => country.wikidataId));
  if (qids.size !== countries.length) throw new Error("Country batch QID anchors must be unique.");
  return true;
}

export function buildCountrySparql(countries) {
  const qidAnchored = usesApprovedQidAnchors(countries);
  const isoValues = countries.map((country) => `"${country.isoAlpha2}"`).join(" ");
  const qidValues = countries.map((country) => `(wd:${country.wikidataId} "${country.isoAlpha2}")`).join(" ");
  const identitySelection = qidAnchored
    ? `VALUES (?country ?iso2) { ${qidValues} }
  OPTIONAL { ?country wdt:P297 ?sourceIso2. }`
    : `VALUES ?iso2 { ${isoValues} }
  ?country wdt:P297 ?iso2.`;
  const sourceIso2Selection = qidAnchored ? " ?sourceIso2" : "";
  const sourceIso2Grouping = qidAnchored ? " ?sourceIso2" : "";
  return `
SELECT ?country ?iso2${sourceIso2Selection} ?iso3 ?isoNumeric ?countryLabelEn ?countryLabelZh
       (GROUP_CONCAT(DISTINCT ?countryAliasEn; separator="|") AS ?countryAliasesEn)
       (GROUP_CONCAT(DISTINCT ?countryAliasZh; separator="|") AS ?countryAliasesZh)
       ?capital ?capitalLabelEn ?capitalLabelZh
       (GROUP_CONCAT(DISTINCT ?capitalAliasEn; separator="|") AS ?capitalAliasesEn)
       (GROUP_CONCAT(DISTINCT ?capitalAliasZh; separator="|") AS ?capitalAliasesZh)
       ?continent ?continentLabelEn ?continentLabelZh ?coordinate
WHERE {
  ${identitySelection}
  OPTIONAL { ?country wdt:P298 ?iso3. }
  OPTIONAL { ?country wdt:P299 ?isoNumeric. }
  OPTIONAL { ?country wdt:P36 ?capital. }
  OPTIONAL { ?country wdt:P30 ?continent. }
  OPTIONAL { ?country wdt:P625 ?coordinate. }
  OPTIONAL { ?country rdfs:label ?countryLabelEn FILTER(LANG(?countryLabelEn) = "en") }
  OPTIONAL { ?country rdfs:label ?countryLabelZh FILTER(LANG(?countryLabelZh) = "zh" || LANG(?countryLabelZh) = "zh-hans") }
  OPTIONAL { ?country skos:altLabel ?countryAliasEn FILTER(LANG(?countryAliasEn) = "en") }
  OPTIONAL { ?country skos:altLabel ?countryAliasZh FILTER(LANG(?countryAliasZh) = "zh" || LANG(?countryAliasZh) = "zh-hans") }
  OPTIONAL { ?capital rdfs:label ?capitalLabelEn FILTER(LANG(?capitalLabelEn) = "en") }
  OPTIONAL { ?capital rdfs:label ?capitalLabelZh FILTER(LANG(?capitalLabelZh) = "zh" || LANG(?capitalLabelZh) = "zh-hans") }
  OPTIONAL { ?capital skos:altLabel ?capitalAliasEn FILTER(LANG(?capitalAliasEn) = "en") }
  OPTIONAL { ?capital skos:altLabel ?capitalAliasZh FILTER(LANG(?capitalAliasZh) = "zh" || LANG(?capitalAliasZh) = "zh-hans") }
  OPTIONAL { ?continent rdfs:label ?continentLabelEn FILTER(LANG(?continentLabelEn) = "en") }
  OPTIONAL { ?continent rdfs:label ?continentLabelZh FILTER(LANG(?continentLabelZh) = "zh" || LANG(?continentLabelZh) = "zh-hans") }
}
GROUP BY ?country ?iso2${sourceIso2Grouping} ?iso3 ?isoNumeric ?countryLabelEn ?countryLabelZh
         ?capital ?capitalLabelEn ?capitalLabelZh
         ?continent ?continentLabelEn ?continentLabelZh ?coordinate
ORDER BY ?iso2 ?country ?capital ?continent
`.trim();
}

function stableMultiValue(value = "") {
  return String(value || "")
    .split("|")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en"))
    .join("|");
}

function stableWikidataResponse(wikidata = {}) {
  const multiValueFields = ["countryAliasesEn", "countryAliasesZh", "capitalAliasesEn", "capitalAliasesZh"];
  const bindings = [...(wikidata?.results?.bindings || [])]
    .map((binding) => {
      const stable = structuredClone(binding);
      for (const field of multiValueFields) {
        if (stable[field]?.value) stable[field].value = stableMultiValue(stable[field].value);
      }
      return stable;
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
  return {
    ...wikidata,
    results: {
      ...(wikidata.results || {}),
      bindings,
    },
  };
}

function qidFromUri(value = "") {
  return String(value || "").match(/Q\d+$/u)?.[0] || "";
}

export function summarizeCanonicalRawRecords(rawSnapshot = {}) {
  const byIso2 = new Map();
  for (const binding of rawSnapshot?.wikidata?.results?.bindings || []) {
    const isoAlpha2 = String(binding.iso2?.value || "").toUpperCase();
    if (!isoAlpha2) continue;
    if (!byIso2.has(isoAlpha2)) {
      byIso2.set(isoAlpha2, {
        isoAlpha2,
        wikidataIds: new Set(),
        sourceIsoAlpha2: new Set(),
        isoAlpha3: new Set(),
        isoNumeric: new Set(),
        bindingCount: 0,
      });
    }
    const record = byIso2.get(isoAlpha2);
    record.bindingCount += 1;
    if (qidFromUri(binding.country?.value)) record.wikidataIds.add(qidFromUri(binding.country.value));
    if (binding.sourceIso2?.value) record.sourceIsoAlpha2.add(String(binding.sourceIso2.value).toUpperCase());
    if (binding.iso3?.value) record.isoAlpha3.add(String(binding.iso3.value).toUpperCase());
    if (binding.isoNumeric?.value) record.isoNumeric.add(String(binding.isoNumeric.value).padStart(3, "0"));
  }
  return [...byIso2.values()]
    .map((record) => ({
      isoAlpha2: record.isoAlpha2,
      wikidataIds: [...record.wikidataIds].sort(),
      sourceIsoAlpha2: [...record.sourceIsoAlpha2].sort(),
      isoAlpha3: [...record.isoAlpha3].sort(),
      isoNumeric: [...record.isoNumeric].sort(),
      bindingCount: record.bindingCount,
    }))
    .sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2));
}

const ISO_PROPERTY_FIELDS = Object.freeze([
  { property: "P297", entityField: "isoAlpha2", seedField: "isoAlpha2", recordField: "sourceIsoAlpha2" },
  { property: "P298", entityField: "isoAlpha3", seedField: "isoAlpha3", recordField: "isoAlpha3" },
  { property: "P299", entityField: "isoNumeric", seedField: "isoNumeric", recordField: "isoNumeric" },
]);

export function canonicalRawRecordsForBatch(rawSnapshot = {}, batchCountries = []) {
  const summarized = summarizeCanonicalRawRecords(rawSnapshot);
  const seedByIso2 = new Map(batchCountries.map((seed) => [seed.isoAlpha2, seed]));
  const qidAnchored = usesApprovedQidAnchors(batchCountries);
  return summarized.map((record) => {
    const seed = seedByIso2.get(record.isoAlpha2) || {};
    const wikidataIso = {
      isoAlpha2: qidAnchored ? record.sourceIsoAlpha2[0] || null : record.isoAlpha2 || null,
      isoAlpha3: record.isoAlpha3[0] || null,
      isoNumeric: record.isoNumeric[0] || null,
    };
    const missingWikidataProperties = ISO_PROPERTY_FIELDS
      .filter(({ entityField }) => !wikidataIso[entityField])
      .map(({ property }) => property);
    return {
      ...record,
      approvedSeed: {
        isoAlpha2: seed.isoAlpha2 || "",
        isoAlpha3: seed.isoAlpha3 || "",
        isoNumeric: seed.isoNumeric || "",
        wikidataId: seed.wikidataId || "",
      },
      wikidataIso,
      missingWikidataProperties,
      isoValidation: missingWikidataProperties.length > 0
        ? "approved-seed-backed-because-missing"
        : "wikidata-confirmed",
    };
  });
}

async function fetchWikidataSnapshot({ countries, timeoutMs = 20_000, retries = 1 } = {}) {
  const query = buildCountrySparql(countries);
  const qidAnchored = usesApprovedQidAnchors(countries);
  const body = new URLSearchParams({ query, format: "json" });
  let lastError = null;
  let requestCount = 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      requestCount += 1;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "travel2.0-route-v2-country-baseline-p1a/1.0",
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Wikidata SPARQL HTTP ${response.status}`);
      const wikidata = stableWikidataResponse(await response.json());
      clearTimeout(timer);
      const rawSnapshot = {
        schemaVersion: "route-v2-country-baseline-p1a-raw",
        pilot: countries.length === 5,
        retrievedAt: new Date().toISOString(),
        source: {
          provider: "wikidata-sparql",
          endpoint,
          query,
          canonicalEntityAnchor: qidAnchored ? "approved-wikidata-qid" : "iso-alpha2",
          countryCount: countries.length,
          countries: countries.map((country) => country.isoAlpha2),
          approvedEntities: countries.filter((country) => country.wikidataId).map((country) => ({
            isoAlpha2: country.isoAlpha2,
            wikidataId: country.wikidataId,
          })),
          httpRequestCount: requestCount,
          retryCount: attempt,
        },
        wikidata,
      };
      rawSnapshot.canonicalRecords = canonicalRawRecordsForBatch(rawSnapshot, countries);
      return rawSnapshot;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function assertRawSnapshotMatchesBatch(rawSnapshot, batchCountries) {
  if (rawSnapshot?.source?.provider !== "wikidata-sparql") {
    throw new Error("Country raw snapshot must come from wikidata-sparql.");
  }
  if (!rawSnapshot.retrievedAt || Number.isNaN(Date.parse(rawSnapshot.retrievedAt))) {
    throw new Error("Country raw snapshot must contain a valid retrievedAt.");
  }
  const expectedIso2 = batchCountries.map((country) => country.isoAlpha2).sort();
  const declaredIso2 = [...(rawSnapshot.source?.countries || [])].sort();
  if (rawSnapshot.source?.countryCount !== batchCountries.length || JSON.stringify(declaredIso2) !== JSON.stringify(expectedIso2)) {
    throw new Error(`Country raw snapshot scope mismatch: expected ${expectedIso2.join(",")}, received ${declaredIso2.join(",")}.`);
  }
  const aggregated = aggregateWikidataCountryRows(rawSnapshot);
  const actualIso2 = [...aggregated.keys()].sort();
  if (JSON.stringify(actualIso2) !== JSON.stringify(expectedIso2)) {
    throw new Error(`Country raw bindings scope mismatch: expected ${expectedIso2.join(",")}, received ${actualIso2.join(",")}.`);
  }
  const canonicalRecords = canonicalRawRecordsForBatch(rawSnapshot, batchCountries);
  if (rawSnapshot.canonicalRecords && JSON.stringify(rawSnapshot.canonicalRecords) !== JSON.stringify(canonicalRecords)) {
    throw new Error("Country raw canonicalRecords do not match the raw bindings.");
  }
  if (canonicalRecords.length !== batchCountries.length) {
    throw new Error(`Country raw canonical record count mismatch: expected ${batchCountries.length}, received ${canonicalRecords.length}.`);
  }
  const recordsByIso2 = new Map(canonicalRecords.map((record) => [record.isoAlpha2, record]));
  const qidAnchored = usesApprovedQidAnchors(batchCountries);
  if (qidAnchored && rawSnapshot.source?.canonicalEntityAnchor !== "approved-wikidata-qid") {
    throw new Error("Country raw snapshot must use approved Wikidata QID anchors.");
  }
  for (const seed of batchCountries) {
    const actual = aggregated.get(seed.isoAlpha2);
    const record = recordsByIso2.get(seed.isoAlpha2);
    for (const field of ["isoAlpha2", "isoAlpha3", "isoNumeric"]) {
      if (!seed[field]) throw new Error(`${seed.isoAlpha2 || "unknown"} approved seed is missing ${field}.`);
    }
    if (record.wikidataIds.length !== 1) {
      throw new Error(`${seed.isoAlpha2} raw record must contain exactly one canonical QID.`);
    }
    if (seed.wikidataId && record.wikidataIds[0] !== seed.wikidataId) {
      throw new Error(`${seed.isoAlpha2} wikidataId seed mismatch: expected ${seed.wikidataId}, received ${record.wikidataIds[0] || "missing"}.`);
    }
    for (const { entityField, recordField } of ISO_PROPERTY_FIELDS) {
      if (record[recordField].length > 1) {
        throw new Error(`${seed.isoAlpha2} Wikidata ${entityField} must contain at most one value.`);
      }
      const received = record.wikidataIso[entityField];
      if (received && received !== seed[entityField]) {
        throw new Error(`${seed.isoAlpha2} ${entityField} seed conflict: expected ${seed[entityField]}, received ${received}.`);
      }
      if (!received && !qidAnchored) {
        throw new Error(`${seed.isoAlpha2} ${entityField} is missing without an approved QID anchor.`);
      }
    }
    if (actual?.wikidataId !== seed.wikidataId && seed.wikidataId) {
      throw new Error(`${seed.isoAlpha2} aggregated QID mismatch: expected ${seed.wikidataId}, received ${actual?.wikidataId || "missing"}.`);
    }
  }
}

function applyApprovedIsoSeedFallbacks({ normalized, rawSnapshot, batchCountries, batch }) {
  const records = canonicalRawRecordsForBatch(rawSnapshot, batchCountries);
  const seedByIso2 = new Map(batchCountries.map((seed) => [seed.isoAlpha2, seed]));
  const entityByIso2 = new Map(normalized.countries.map((entity) => [entity.isoAlpha2, entity]));
  const approvedSeedSource = `${batch.schemaSuffix}-approved-country-seed`;
  for (const record of records.filter((item) => item.missingWikidataProperties.length > 0)) {
    const seed = seedByIso2.get(record.isoAlpha2);
    const entity = entityByIso2.get(record.isoAlpha2);
    if (!seed || !entity || entity.wikidataId !== seed.wikidataId) {
      throw new Error(`${record.isoAlpha2} approved ISO seed fallback requires an exact canonical QID match.`);
    }
    for (const property of record.missingWikidataProperties) {
      const descriptor = ISO_PROPERTY_FIELDS.find((item) => item.property === property);
      const field = descriptor.entityField;
      const entries = (entity.provenance[field] || [])
        .filter((entry) => entry.sourceType !== "wikidata")
        .map((entry) => entry.sourceType === "iso" ? {
          ...entry,
          source: approvedSeedSource,
          field,
          retrievedAt: rawSnapshot.retrievedAt,
          value: seed[descriptor.seedField],
        } : entry);
      if (!entries.some((entry) => entry.sourceType === "iso")) {
        entries.push({
          sourceType: "iso",
          source: approvedSeedSource,
          field,
          sourceUrl: "",
          retrievedAt: rawSnapshot.retrievedAt,
          value: seed[descriptor.seedField],
        });
      }
      entity.provenance[field] = entries;
      normalized.provenance[entity.entityId][field] = entries;
    }
    const reviewIdentity = {
      isoAlpha2: seed.isoAlpha2,
      wikidataId: seed.wikidataId,
      type: "wikidata-iso-identifiers-missing",
      missingProperties: record.missingWikidataProperties,
      selected: {
        isoAlpha2: seed.isoAlpha2,
        isoAlpha3: seed.isoAlpha3,
        isoNumeric: seed.isoNumeric,
      },
    };
    normalized.reviewQueue.push({
      reviewId: `review-${stableHash(reviewIdentity).slice(0, 16)}`,
      isoAlpha2: seed.isoAlpha2,
      entityId: entity.entityId,
      severity: "manual-review",
      type: "wikidata-iso-identifiers-missing",
      missingProperties: record.missingWikidataProperties,
      selected: reviewIdentity.selected,
      candidates: [],
      sourceField: record.missingWikidataProperties.join(","),
      sourceUrl: `https://www.wikidata.org/wiki/${seed.wikidataId}`,
      retrievedAt: rawSnapshot.retrievedAt,
    });
  }
  normalized.reviewQueue.sort((a, b) => a.isoAlpha2.localeCompare(b.isoAlpha2) || a.type.localeCompare(b.type));
}

export function buildCountryBatchAssetsFromRaw(rawSnapshot, batchCountries, batch) {
  assertRawSnapshotMatchesBatch(rawSnapshot, batchCountries);
  const normalized = normalizeCountryBaseline({
    rawSnapshot,
    pilotCountries: batchCountries,
    sourceNames: {
      catalog: "data/countries.zh.json",
      iso: `${batch.label} ISO seed`,
    },
  });
  applyApprovedIsoSeedFallbacks({ normalized, rawSnapshot, batchCountries, batch });
  const deduped = dedupeCountryEntities(normalized.countries);
  const conflicts = [...normalized.conflicts, ...deduped.conflicts]
    .sort((a, b) => String(a.isoAlpha2 || "").localeCompare(String(b.isoAlpha2 || "")) || String(a.type || "").localeCompare(String(b.type || "")));
  const generatedFrom = path.relative(projectRoot, batch.rawPath).replace(/\\/gu, "/");
  const assets = {
    countries: {
      schemaVersion: `route-v2-country-baseline-${batch.schemaSuffix}`,
      generatedFrom,
      countryCount: deduped.entities.length,
      countries: deduped.entities,
    },
    provenance: {
      schemaVersion: `route-v2-country-baseline-provenance-${batch.schemaSuffix}`,
      generatedFrom,
      countryCount: Object.keys(normalized.provenance).length,
      provenance: normalized.provenance,
    },
    conflicts: {
      schemaVersion: `route-v2-country-baseline-conflicts-${batch.schemaSuffix}`,
      blockingCount: conflicts.filter((item) => item.severity === "blocking").length,
      conflictCount: conflicts.length,
      conflicts,
    },
    reviewQueue: {
      schemaVersion: `route-v2-country-baseline-review-${batch.schemaSuffix}`,
      reviewCount: normalized.reviewQueue.length,
      reviewQueue: normalized.reviewQueue,
    },
  };
  return {
    countries: deduped.entities,
    conflicts,
    reviewQueue: normalized.reviewQueue,
    assets,
  };
}

export function publishCountryBatchFromRaw(rawSnapshot, batchCountries, batch) {
  const result = buildCountryBatchAssetsFromRaw(rawSnapshot, batchCountries, batch);
  writeJson(batch.countriesPath, result.assets.countries);
  writeJson(batch.provenancePath, result.assets.provenance);
  writeJson(batch.conflictsPath, result.assets.conflicts);
  writeJson(batch.reviewQueuePath, result.assets.reviewQueue);
  return result;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const batchName = selectedBatchName();
  const batch = countryBatches[batchName];
  if (!batch) throw new Error(`Unsupported batch: ${batchName}`);
  const batchCountries = loadBatchCountries(batch);
  const timeoutMs = numericOption("timeout-ms", 20_000);
  const retries = numericOption("retries", 1);
  if (refresh) {
    const rawSnapshot = await fetchWikidataSnapshot({ countries: batchCountries, timeoutMs, retries });
    try {
      assertRawSnapshotMatchesBatch(rawSnapshot, batchCountries);
    } catch (error) {
      console.error(JSON.stringify({
        status: "RAW_REJECTED",
        batch: batchName,
        retrievedAt: rawSnapshot.retrievedAt,
        bindingCount: rawSnapshot.wikidata?.results?.bindings?.length || 0,
        canonicalRecords: rawSnapshot.canonicalRecords,
        httpRequestCount: rawSnapshot.source.httpRequestCount,
        retryCount: rawSnapshot.source.retryCount,
        reason: error.message,
      }, null, 2));
      throw error;
    }
    writeJsonAtomic(batch.rawPath, rawSnapshot);
    console.log(JSON.stringify({
      status: "RAW_REFRESHED",
      batch: batchName,
      calledWikidata: true,
      retrievedAt: rawSnapshot.retrievedAt,
      bindingCount: rawSnapshot.wikidata?.results?.bindings?.length || 0,
      canonicalRecordCount: rawSnapshot.canonicalRecords.length,
      httpRequestCount: rawSnapshot.source.httpRequestCount,
      retryCount: rawSnapshot.source.retryCount,
      raw: path.relative(projectRoot, batch.rawPath),
    }, null, 2));
    return;
  }
  if (!fs.existsSync(batch.rawPath)) {
    throw new Error(`Raw snapshot missing for ${batchName}; rerun explicitly with --refresh.`);
  }
  const rawSnapshot = readJson(batch.rawPath);
  const result = publishCountryBatchFromRaw(rawSnapshot, batchCountries, batch);
  console.log(JSON.stringify({
    status: result.conflicts.some((item) => item.severity === "blocking") ? "BLOCKED" : "PASS",
    batch: batchName,
    calledWikidata: false,
    countries: result.countries.map((country) => ({
      isoAlpha2: country.isoAlpha2,
      isoAlpha3: country.isoAlpha3,
      wikidataId: country.wikidataId,
      canonicalNameZh: country.canonicalNameZh,
      canonicalNameEn: country.canonicalNameEn,
    })),
    conflictCount: result.conflicts.length,
    reviewCount: result.reviewQueue.length,
    outputs: {
      raw: path.relative(projectRoot, batch.rawPath),
      countries: path.relative(projectRoot, batch.countriesPath),
      provenance: path.relative(projectRoot, batch.provenancePath),
      conflicts: path.relative(projectRoot, batch.conflictsPath),
      reviewQueue: path.relative(projectRoot, batch.reviewQueuePath),
    },
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
