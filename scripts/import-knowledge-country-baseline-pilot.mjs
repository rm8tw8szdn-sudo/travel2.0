import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  dedupeCountryEntities,
  normalizeCountryBaseline,
} from "../src/lib/routes/index.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(projectRoot, "data", "knowledge");
const catalogPath = path.resolve(projectRoot, "data", "countries.zh.json");
const endpoint = "https://query.wikidata.org/sparql";

const countryBatches = Object.freeze({
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
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function loadBatchCountries(batch) {
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

function buildCountrySparql(countries) {
  const isoValues = countries.map((country) => `"${country.isoAlpha2}"`).join(" ");
  return `
SELECT ?country ?iso2 ?iso3 ?isoNumeric ?countryLabelEn ?countryLabelZh
       (GROUP_CONCAT(DISTINCT ?countryAliasEn; separator="|") AS ?countryAliasesEn)
       (GROUP_CONCAT(DISTINCT ?countryAliasZh; separator="|") AS ?countryAliasesZh)
       ?capital ?capitalLabelEn ?capitalLabelZh
       (GROUP_CONCAT(DISTINCT ?capitalAliasEn; separator="|") AS ?capitalAliasesEn)
       (GROUP_CONCAT(DISTINCT ?capitalAliasZh; separator="|") AS ?capitalAliasesZh)
       ?continent ?continentLabelEn ?continentLabelZh ?coordinate
WHERE {
  VALUES ?iso2 { ${isoValues} }
  ?country wdt:P297 ?iso2.
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
GROUP BY ?country ?iso2 ?iso3 ?isoNumeric ?countryLabelEn ?countryLabelZh
         ?capital ?capitalLabelEn ?capitalLabelZh
         ?continent ?continentLabelEn ?continentLabelZh ?coordinate
ORDER BY ?iso2 ?country ?capital ?continent
`.trim();
}

async function fetchWikidataSnapshot({ countries, timeoutMs = 20_000, retries = 1 } = {}) {
  const query = buildCountrySparql(countries);
  const body = new URLSearchParams({ query, format: "json" });
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
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
      const wikidata = await response.json();
      clearTimeout(timer);
      return {
        schemaVersion: "route-v2-country-baseline-p1a-raw",
        pilot: countries.length === 5,
        retrievedAt: new Date().toISOString(),
        source: {
          provider: "wikidata-sparql",
          endpoint,
          query,
          countryCount: countries.length,
          countries: countries.map((country) => country.isoAlpha2),
        },
        wikidata,
      };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function publishCountryBatchFromRaw(rawSnapshot, batchCountries, batch) {
  const normalized = normalizeCountryBaseline({
    rawSnapshot,
    pilotCountries: batchCountries,
    sourceNames: {
      catalog: "data/countries.zh.json",
      iso: `${batch.label} ISO seed`,
    },
  });
  const deduped = dedupeCountryEntities(normalized.countries);
  const conflicts = [...normalized.conflicts, ...deduped.conflicts]
    .sort((a, b) => String(a.isoAlpha2 || "").localeCompare(String(b.isoAlpha2 || "")) || String(a.type || "").localeCompare(String(b.type || "")));
  const generatedFrom = path.relative(projectRoot, batch.rawPath).replace(/\\/gu, "/");
  writeJson(batch.countriesPath, {
    schemaVersion: `route-v2-country-baseline-${batch.schemaSuffix}`,
    generatedFrom,
    countryCount: deduped.entities.length,
    countries: deduped.entities,
  });
  writeJson(batch.provenancePath, {
    schemaVersion: `route-v2-country-baseline-provenance-${batch.schemaSuffix}`,
    generatedFrom,
    countryCount: Object.keys(normalized.provenance).length,
    provenance: normalized.provenance,
  });
  writeJson(batch.conflictsPath, {
    schemaVersion: `route-v2-country-baseline-conflicts-${batch.schemaSuffix}`,
    blockingCount: conflicts.filter((item) => item.severity === "blocking").length,
    conflictCount: conflicts.length,
    conflicts,
  });
  writeJson(batch.reviewQueuePath, {
    schemaVersion: `route-v2-country-baseline-review-${batch.schemaSuffix}`,
    reviewCount: normalized.reviewQueue.length,
    reviewQueue: normalized.reviewQueue,
  });
  return {
    countries: deduped.entities,
    conflicts,
    reviewQueue: normalized.reviewQueue,
  };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const batchName = selectedBatchName();
  const batch = countryBatches[batchName];
  if (!batch) throw new Error(`Unsupported batch: ${batchName}`);
  const batchCountries = loadBatchCountries(batch);
  const timeoutMs = numericOption("timeout-ms", 20_000);
  const retries = numericOption("retries", 1);
  let rawSnapshot;
  let calledWikidata = false;
  if (refresh || !fs.existsSync(batch.rawPath)) {
    rawSnapshot = await fetchWikidataSnapshot({ countries: batchCountries, timeoutMs, retries });
    writeJson(batch.rawPath, rawSnapshot);
    calledWikidata = true;
  } else {
    rawSnapshot = readJson(batch.rawPath);
  }
  const result = publishCountryBatchFromRaw(rawSnapshot, batchCountries, batch);
  console.log(JSON.stringify({
    status: result.conflicts.some((item) => item.severity === "blocking") ? "BLOCKED" : "PASS",
    batch: batchName,
    calledWikidata,
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
