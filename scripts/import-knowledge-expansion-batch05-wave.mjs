import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeEntityLayerAliases,
  createEntityLayerProvenanceEntry,
  createTypedEntityId,
  entityLayerDistanceKm,
} from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import {
  canonicalizeCountryAliases,
  createCountryEntityId,
  sourceEntry,
  validateCountryEntitySet,
} from "../src/lib/routes/knowledge-country-baseline-schema.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";
import { KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS } from "../src/lib/routes/knowledge-entity-layer-published-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
const BATCH = argument("batch") || "05";
if (!["05", "06"].includes(BATCH)) throw new Error("batch-argument-invalid:--batch=05|06");
const BATCH_LABEL = `Batch ${BATCH}`;
const SEED_PATH = `data/knowledge/seeds/knowledge-expansion-batch${BATCH}-20-country.json`;
const COUNTRY_OUTPUT = `data/knowledge/batches/countries.p1a-batch${BATCH}.json`;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const LOCAL_WIKIPEDIA_LANGUAGE = Object.freeze({
  AD: "ca", AE: "ar", AR: "es", BR: "pt", CD: "fr", CL: "es", CN: "zh", CR: "es", UY: "es",
  EG: "ar", FJ: "fj", IL: "he", IN: "hi", KE: "sw", KH: "km", MA: "fr", NG: "en",
  RO: "ro", RU: "ru", SA: "ar", ZA: "en",
  BE: "nl", CA: "fr", CZ: "cs", DK: "da", FI: "fi", HR: "hr", HU: "hu", ID: "id", IE: "ga",
  MX: "es", MY: "ms", NO: "no", PE: "es", PL: "pl", SE: "sv", SI: "sl", VN: "vi",
});
const USER_AGENT = `travel2-route-v2-knowledge-expansion-batch${BATCH}/1.0 (https://github.com/rm8tw8szdn-sudo/travel2.0)`;
const FETCH_CACHE_ROOT = path.join(ROOT, ".tmp", `route-v2-batch${BATCH}-import-cache`);
const MAX_SUBCLASS_DEPTH = 8;
const CITY_ROOTS = new Set(["Q486972", "Q15284"]);
const POI_ROOTS = new Set([
  "Q570116", "Q41176", "Q33506", "Q4989906", "Q1370598", "Q22698", "Q839954", "Q9259",
  "Q473972", "Q294440", "Q121359", "Q13226383", "Q3918", "Q37654", "Q166118", "Q838948",
  "Q172754", "Q35145263", "Q20719696", "Q15324", "Q271669", "Q811979", "Q811430", "Q1497375",
  "Q132911", "Q210272", "Q338112", "Q123705",
]);
const OPERATIONAL_POI_ROOTS = new Set([
  "Q1248784", // airport
  "Q62447", // aerodrome
  "Q695850", // airbase
  "Q55488", // railway station
  "Q928830", // metro station
  "Q728937", // railway line
  "Q5503", // rapid transit
  "Q18325841", // public transport network
  "Q2678338", // railway network
  "Q2516436", // transportation system
  "Q15984860", // transport system
  "Q44782", // port
  "Q3918", // university institution
  "Q16917", // hospital
  "Q40357", // prison
  "Q861951", // police station
  "Q917182", // military academy
]);
const VISITOR_POI_ROOTS = new Set([
  "Q570116", "Q33506", "Q4989906", "Q1370598", "Q22698", "Q839954", "Q9259", "Q473972",
  "Q294440", "Q166118", "Q172754", "Q35145263", "Q15324", "Q271669", "Q1497375", "Q37654",
]);
const ISO = Object.freeze({
  HU: ["HUN", "348"], HR: ["HRV", "191"], SE: ["SWE", "752"], SI: ["SVN", "705"],
  KH: ["KHM", "116"], RO: ["ROU", "642"], CR: ["CRI", "188"], UY: ["URY", "858"],
});
const COUNTRY_OUTPUT_CODES = BATCH === "05"
  ? new Set(["HU", "HR", "SE", "SI"])
  : new Set(["KH", "RO", "CR", "UY"]);

const wave = Number(argument("wave"));
if (![1, 2, 3, 4].includes(wave)) throw new Error("wave-argument-required:--wave=1|2|3|4");

const clean = (value) => String(value || "").normalize("NFKC").trim();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const qids = (entity, property) => [...new Set((entity?.claims?.[property] || [])
  .filter((claim) => claim?.rank !== "deprecated")
  .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
  .filter((value) => /^Q\d+$/u.test(String(value || ""))))];

function coordinate(entity) {
  const value = (entity?.claims?.P625 || [])
    .find((claim) => claim?.rank !== "deprecated")?.mainsnak?.datavalue?.value;
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function localizedLabel(entity, language, fallback = "") {
  return clean(entity?.labels?.[language]?.value || fallback);
}

function aliases(entity, curated, canonicalNames) {
  return canonicalizeEntityLayerAliases([
    ...curated,
    ...["en", "zh-hans", "zh"].flatMap((language) => [
      entity?.labels?.[language]?.value,
      ...(entity?.aliases?.[language] || []).map((entry) => entry.value),
    ]),
  ].filter(Boolean), canonicalNames);
}

async function fetchJson(url, attempt = 0) {
  const cachePath = path.join(FETCH_CACHE_ROOT, `${crypto.createHash("sha256").update(url.href).digest("hex")}.json`);
  if (fs.existsSync(cachePath)) return JSON.parse(await readFile(cachePath, "utf8"));
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    const retry = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1_000 : Math.min(20_000, 800 * 2 ** attempt));
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`remote-fetch-failed:${response.status}:${url.hostname}:${url.pathname}`);
  const payload = await response.json();
  await mkdir(FETCH_CACHE_ROOT, { recursive: true });
  await writeFile(cachePath, jsonText(payload), "utf8");
  return payload;
}

function apiUrl(endpoint, parameters) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ format: "json", origin: "*", ...parameters });
  return url;
}

async function fetchEntities(entityQids, props = "labels|aliases|descriptions|claims|sitelinks") {
  const result = {};
  const values = [...new Set(entityQids)].filter((value) => /^Q\d+$/u.test(value));
  for (let index = 0; index < values.length; index += 50) {
    const payload = await fetchJson(apiUrl(WIKIDATA_API, {
      action: "wbgetentities",
      ids: values.slice(index, index + 50).join("|"),
      props,
      languages: "en|zh-hans|zh",
      languagefallback: "1",
    }));
    Object.assign(result, payload.entities || {});
    await sleep(80);
  }
  return result;
}

async function resolveCityTitles(entries) {
  const result = new Map();
  for (let index = 0; index < entries.length; index += 25) {
    const chunk = entries.slice(index, index + 25);
    const payload = await fetchJson(apiUrl(WIKIDATA_API, {
      action: "wbgetentities",
      sites: "enwiki",
      titles: chunk.map((entry) => entry.title).join("|"),
      redirects: "yes",
      props: "sitelinks",
    }));
    const byTitle = new Map(Object.values(payload.entities || {}).map((entity) => [
      clean(entity?.sitelinks?.enwiki?.title).toLocaleLowerCase("en-US"), entity.id,
    ]));
    const normalized = new Map((payload.normalized || []).map((item) => [clean(item.from), clean(item.to)]));
    const redirects = new Map((payload.redirects || []).map((item) => [clean(item.from), clean(item.to)]));
    for (const entry of chunk) {
      let title = entry.title;
      for (let pass = 0; pass < 4; pass += 1) title = redirects.get(normalized.get(title) || title) || normalized.get(title) || title;
      result.set(entry.key, { requestedTitle: entry.title, resolvedTitle: title, qid: byTitle.get(title.toLocaleLowerCase("en-US")) || "" });
    }
    await sleep(100);
  }
  return result;
}

async function geosearchEndpoint(city, endpoint, limit = 100) {
  const payload = await fetchJson(apiUrl(endpoint, {
    action: "query",
    generator: "geosearch",
    ggsprimary: "all",
    ggsnamespace: "0",
    ggscoord: `${city.coordinates.latitude}|${city.coordinates.longitude}`,
    ggsradius: "10000",
    ggslimit: String(limit),
    prop: "pageprops|info",
    inprop: "url",
  }));
  if (payload.error) throw new Error(`wikipedia-geosearch-failed:${payload.error.code}:${payload.error.info}`);
  return Object.values(payload.query?.pages || {})
    .map((page) => ({
      pageId: page.pageid,
      title: clean(page.title),
      qid: clean(page.pageprops?.wikibase_item),
      sourceUrl: clean(page.fullurl),
    }))
    .filter((entry) => /^Q\d+$/u.test(entry.qid));
}

async function geosearch(city, iso, minimumUsefulCandidates) {
  const primary = await geosearchEndpoint(city, WIKIPEDIA_API);
  const language = LOCAL_WIKIPEDIA_LANGUAGE[iso];
  if (!language || primary.length >= minimumUsefulCandidates) return primary;
  const endpoint = `https://${language}.wikipedia.org/w/api.php`;
  const combined = new Map([...primary, ...await geosearchEndpoint(city, endpoint)].map((entry) => [entry.qid, entry]));
  const offsets = [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18], [0.18, 0.18], [0.18, -0.18], [-0.18, 0.18], [-0.18, -0.18]];
  for (const [latitudeOffset, longitudeOffset] of offsets) {
    if (combined.size >= minimumUsefulCandidates * 3) break;
    const shifted = {
      ...city,
      coordinates: {
        latitude: city.coordinates.latitude + latitudeOffset,
        longitude: city.coordinates.longitude + longitudeOffset,
      },
    };
    for (const entry of await geosearchEndpoint(shifted, endpoint)) combined.set(entry.qid, entry);
  }
  return [...combined.values()];
}

async function buildTypeGraph(instanceQids) {
  const graph = new Map();
  const fetched = new Set();
  let frontier = [...new Set(instanceQids)];
  for (let depth = 0; depth <= MAX_SUBCLASS_DEPTH && frontier.length; depth += 1) {
    const current = frontier.filter((value) => !fetched.has(value));
    current.forEach((value) => fetched.add(value));
    if (!current.length) break;
    const entities = await fetchEntities(current, "labels|claims");
    frontier = [];
    for (const [qid, entity] of Object.entries(entities)) {
      const parents = qids(entity, "P279");
      graph.set(qid, { qid, label: localizedLabel(entity, "en", qid), parentQids: parents });
      frontier.push(...parents);
    }
  }
  return graph;
}

function pathToRoot(start, roots, graph) {
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const current = queue.shift();
    const node = current.at(-1);
    if (roots.has(node)) return current;
    if (current.length - 1 >= MAX_SUBCLASS_DEPTH) continue;
    for (const parent of graph.get(node)?.parentQids || []) {
      if (visited.has(parent)) continue;
      visited.add(parent);
      queue.push([...current, parent]);
    }
  }
  return null;
}

function classified(entity, roots, graph) {
  for (const instanceQid of qids(entity, "P31")) {
    const path = pathToRoot(instanceQid, roots, graph);
    if (path) return path;
  }
  return null;
}

function routePoiEligibility(entity, graph) {
  const instanceQids = qids(entity, "P31");
  const operationalTypePath = instanceQids.map((qid) => pathToRoot(qid, OPERATIONAL_POI_ROOTS, graph)).find(Boolean) || null;
  // A separate, non-operational P31 must establish visitor value. This keeps
  // broad facility ancestry from making a bare port or transit system pass,
  // while still permitting an entity explicitly typed as both a station and
  // a tourist attraction or heritage site.
  const visitorTypePath = instanceQids
    .filter((qid) => !pathToRoot(qid, OPERATIONAL_POI_ROOTS, graph))
    .map((qid) => pathToRoot(qid, VISITOR_POI_ROOTS, graph))
    .find(Boolean) || null;
  return {
    accepted: !operationalTypePath || Boolean(visitorTypePath),
    operationalTypePath,
    visitorTypePath,
  };
}

function provenance(field, sourceType, source, sourceUrl, value, retrievedAt) {
  return createEntityLayerProvenanceEntry({ field, sourceType, source, sourceUrl, retrievedAt, value });
}

function buildCity(seed, entity, country, retrievedAt) {
  const entityId = createTypedEntityId({ entityType: "city", wikidataId: entity.id });
  const coordinates = coordinate(entity);
  const canonicalNameZh = localizedLabel(entity, "zh-hans", localizedLabel(entity, "zh", seed.name));
  const countryNames = new Set([country.canonicalNameEn, country.canonicalNameZh]
    .map((value) => clean(value).toLocaleLowerCase("en-US")));
  const entityAliases = aliases(entity, seed.aliases, [canonicalNameZh, seed.name])
    .filter((value) => entity.id === country.wikidataId || !countryNames.has(clean(value).toLocaleLowerCase("en-US")));
  const wiki = `https://www.wikidata.org/wiki/${entity.id}`;
  const wd = (field, value) => provenance(field, "wikidata", "Wikidata exact enwiki title and wbgetentities", wiki, value, retrievedAt);
  const schema = (field, value) => provenance(field, "project-schema", `Route V2 Knowledge Expansion ${BATCH_LABEL}`, "", value, retrievedAt);
  return {
    schemaVersion: "route-v2-city-baseline-p1b", entityId, entityType: "city",
    parentCountryEntityId: country.entityId, wikidataId: entity.id,
    canonicalNameZh, canonicalNameEn: seed.name, aliases: entityAliases, coordinates,
    entitySourceType: "wikidata", confidence: 0.95, retrievedAt,
    provenance: {
      entityId: schema("entityId", entityId), entityType: schema("entityType", "city"),
      parentCountryEntityId: provenance("parentCountryEntityId", "repository-reference", `${country.canonicalNameEn} Country Entity`, `https://www.wikidata.org/wiki/${country.wikidataId}`, country.entityId, retrievedAt),
      wikidataId: wd("wikidataId", entity.id), canonicalNameZh: wd("canonicalNameZh", canonicalNameZh),
      canonicalNameEn: wd("canonicalNameEn", seed.name),
      aliases: seed.aliases.length > 0
        ? provenance("aliases", "repository-reference", `${BATCH_LABEL} reviewed search aliases bound to the exact Wikidata city entity`, wiki, entityAliases, retrievedAt)
        : wd("aliases", entityAliases),
      coordinates: wd("coordinates", coordinates), entitySourceType: schema("entitySourceType", "wikidata"),
      confidence: schema("confidence", 0.95), retrievedAt: wd("retrievedAt", retrievedAt),
    },
  };
}

function buildPoi(candidate, entity, city, retrievedAt) {
  const entityId = createTypedEntityId({ entityType: "poi", wikidataId: entity.id });
  const coordinates = coordinate(entity);
  const nameEn = localizedLabel(entity, "en", candidate.title);
  const nameZh = localizedLabel(entity, "zh-hans", localizedLabel(entity, "zh", nameEn));
  const entityAliases = aliases(entity, [candidate.title], [nameZh, nameEn]);
  const wiki = `https://www.wikidata.org/wiki/${entity.id}`;
  const wd = (field, value) => provenance(field, "wikidata", "Wikidata plus English Wikipedia geosearch", wiki, value, retrievedAt);
  const schema = (field, value) => provenance(field, "project-schema", `Route V2 Knowledge Expansion ${BATCH_LABEL}`, "", value, retrievedAt);
  return {
    schemaVersion: "route-v2-poi-baseline-p1b", entityId, entityType: "poi",
    parentCityEntityId: city.entityId, wikidataId: entity.id,
    canonicalNameZh: nameZh, canonicalNameEn: nameEn, aliases: entityAliases, coordinates,
    entitySourceType: "wikidata", confidence: 0.9, retrievedAt,
    provenance: {
      entityId: schema("entityId", entityId), entityType: schema("entityType", "poi"),
      parentCityEntityId: provenance("parentCityEntityId", "repository-reference", `${city.canonicalNameEn} City Entity`, `https://www.wikidata.org/wiki/${city.wikidataId}`, city.entityId, retrievedAt),
      wikidataId: wd("wikidataId", entity.id), canonicalNameZh: wd("canonicalNameZh", nameZh),
      canonicalNameEn: wd("canonicalNameEn", nameEn), aliases: wd("aliases", entityAliases),
      coordinates: wd("coordinates", coordinates), entitySourceType: schema("entitySourceType", "wikidata"),
      confidence: schema("confidence", 0.9), retrievedAt: wd("retrievedAt", retrievedAt),
    },
  };
}

function buildCountry(seed, entity, relatedEntities, retrievedAt) {
  const [isoAlpha3, isoNumeric] = ISO[seed.iso] || [seed.iso3, seed.isoNumeric];
  const capitalQid = qids(entity, "P36")[0];
  const continentQid = qids(entity, "P30")[0];
  const capital = relatedEntities[capitalQid];
  const continent = relatedEntities[continentQid];
  if (!isoAlpha3 || !isoNumeric || !capital || !continent || !coordinate(entity)) throw new Error(`country-metadata-incomplete:${seed.iso}`);
  const entityId = createCountryEntityId({ isoAlpha2: seed.iso, wikidataId: seed.qid });
  const wiki = `https://www.wikidata.org/wiki/${seed.qid}`;
  const canonicalNameZh = localizedLabel(entity, "zh-hans", localizedLabel(entity, "zh", seed.label));
  const countryAliases = canonicalizeCountryAliases(aliases(entity, [], [canonicalNameZh, seed.label]));
  const continentValue = {
    wikidataId: continentQid,
    canonicalNameZh: localizedLabel(continent, "zh-hans", localizedLabel(continent, "zh", localizedLabel(continent, "en", "Continent"))),
    canonicalNameEn: localizedLabel(continent, "en", "Continent"),
  };
  const capitalNameEn = localizedLabel(capital, "en", capitalQid);
  const capitalValue = {
    wikidataId: capitalQid,
    canonicalNameZh: localizedLabel(capital, "zh-hans", localizedLabel(capital, "zh", capitalNameEn)),
    canonicalNameEn: capitalNameEn,
    aliases: aliases(capital, [], [capitalNameEn]),
  };
  const coords = coordinate(entity);
  const isoSource = (field, value) => sourceEntry({ sourceType: "iso", source: `ISO 3166 ${BATCH_LABEL} reviewed seed`, field, retrievedAt, value });
  const wd = (field, value) => sourceEntry({ sourceType: "wikidata", source: "Wikidata wbgetentities", field, sourceUrl: wiki, retrievedAt, value });
  const catalog = (field, value) => sourceEntry({ sourceType: "project-country-catalog", source: `${BATCH_LABEL} reviewed country catalog`, field, retrievedAt, value });
  return {
    schemaVersion: "route-v2-country-baseline-p1a", entityId, entityType: "country",
    isoAlpha2: seed.iso, isoAlpha3, isoNumeric, wikidataId: seed.qid,
    canonicalNameZh, canonicalNameEn: seed.label, aliases: countryAliases,
    continent: continentValue, region: seed.region, subregion: seed.subregion,
    capital: capitalValue, coordinates: coords, entitySourceType: "wikidata",
    provenance: {
      entityId: [isoSource("entityId", seed.iso), wd("entityId", seed.qid)],
      isoAlpha2: [isoSource("isoAlpha2", seed.iso)], isoAlpha3: [isoSource("isoAlpha3", isoAlpha3)],
      isoNumeric: [isoSource("isoNumeric", isoNumeric)], wikidataId: [wd("wikidataId", seed.qid)],
      canonicalNameZh: [wd("canonicalNameZh", canonicalNameZh)], canonicalNameEn: [wd("canonicalNameEn", seed.label)],
      aliases: [wd("aliases", countryAliases)], continent: [wd("continent", continentValue)],
      region: [catalog("region", seed.region)], subregion: [catalog("subregion", seed.subregion)],
      capital: [wd("capital", capitalValue)], coordinates: [wd("coordinates", coords)],
    }, confidence: 0.95, retrievedAt,
  };
}

async function readAssets(paths, key) {
  const collections = await Promise.all(paths.filter((relativePath) => fs.existsSync(path.join(ROOT, relativePath))).map(async (relativePath) => (
    JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"))[key] || []
  )));
  return collections.flat();
}

async function atomicJson(relativePath, value) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, jsonText(value), "utf8");
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function citySeed(country, tuple, targetByTier) {
  const [title, tier, displayName = title, reviewedAliases = []] = tuple;
  return {
    key: `${country.iso}:${displayName}`,
    iso: country.iso,
    title,
    name: displayName,
    tier,
    targetPoiCount: targetByTier[tier],
    aliases: [...(title === displayName ? [] : [title]), ...reviewedAliases],
  };
}

async function main() {
  const seedDocument = JSON.parse(await readFile(path.join(ROOT, SEED_PATH), "utf8"));
  const waveConfig = seedDocument.waves[String(wave)];
  const batchNumber = waveConfig.batchNumber;
  const currentCityPath = `data/knowledge/batches/cities.p1b-batch${batchNumber}.json`;
  const currentPoiPath = `data/knowledge/batches/pois.p1b-batch${batchNumber}.json`;
  const retrievedAt = seedDocument.retrievedAt;
  const countries = waveConfig.countries.map((iso) => ({ iso, ...seedDocument.countries[iso] }));
  const existingCountries = await readAssets([...KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.countries, COUNTRY_OUTPUT], "countries");
  const batchNumbers = Object.values(seedDocument.waves).map((entry) => String(entry.batchNumber));
  const priorBatchCityPaths = batchNumbers
    .filter((number) => number !== batchNumber)
    .map((number) => `data/knowledge/batches/cities.p1b-batch${number}.json`)
    .filter((relativePath) => !KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.includes(relativePath));
  const priorBatchPoiPaths = batchNumbers
    .filter((number) => number !== batchNumber)
    .map((number) => `data/knowledge/batches/pois.p1b-batch${number}.json`)
    .filter((relativePath) => !KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.includes(relativePath));
  const existingCities = await readAssets([
    ...KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.cities.filter((relativePath) => relativePath !== currentCityPath),
    ...priorBatchCityPaths,
  ], "cities");
  const existingPois = await readAssets([
    ...KNOWLEDGE_ENTITY_LAYER_PUBLISHED_ASSETS.pois.filter((relativePath) => relativePath !== currentPoiPath),
    ...priorBatchPoiPaths,
  ], "pois");
  const countryByIso = new Map(existingCountries.map((entry) => [entry.isoAlpha2, entry]));
  const cityByQid = new Map(existingCities.map((entry) => [entry.wikidataId, entry]));
  const poiByQid = new Map(existingPois.map((entry) => [entry.wikidataId, entry]));
  const countryEntities = await fetchEntities(countries.map((entry) => entry.qid));
  const countryRelatedQids = Object.values(countryEntities).flatMap((entity) => [...qids(entity, "P36"), ...qids(entity, "P30")]);
  const countryRelatedEntities = await fetchEntities(countryRelatedQids);

  const missingCountrySeeds = countries.filter((entry) => !countryByIso.has(entry.iso));
  if (missingCountrySeeds.length) {
    const additions = missingCountrySeeds.map((entry) => buildCountry(entry, countryEntities[entry.qid], countryRelatedEntities, retrievedAt));
    const allNewCountries = [...existingCountries.filter((entry) => COUNTRY_OUTPUT_CODES.has(entry.isoAlpha2)), ...additions]
      .filter((entry, index, array) => array.findIndex((candidate) => candidate.isoAlpha2 === entry.isoAlpha2) === index)
      .sort((left, right) => left.isoAlpha2.localeCompare(right.isoAlpha2, "en"));
    const validation = validateCountryEntitySet(allNewCountries);
    if (!validation.accepted) throw new Error(`country-validation-failed:${validation.reasons.join("|")}`);
    await atomicJson(COUNTRY_OUTPUT, {
      schemaVersion: `route-v2-country-baseline-p1a-batch${BATCH}`,
      generatedFrom: SEED_PATH,
      countryCount: allNewCountries.length,
      countries: allNewCountries,
    });
    additions.forEach((entry) => countryByIso.set(entry.isoAlpha2, entry));
  }

  const seeds = countries.flatMap((country) => country.cities.map((tuple) => citySeed(country, tuple, seedDocument.poiTargets)));
  const titleResolution = await resolveCityTitles(seeds);
  const unresolvedCities = seeds.filter((entry) => !titleResolution.get(entry.key)?.qid);
  if (unresolvedCities.length) throw new Error(`unresolved-cities:${unresolvedCities.map((entry) => entry.title).join("|")}`);
  const cityEntities = await fetchEntities(seeds.map((entry) => titleResolution.get(entry.key).qid));
  const cityTypeGraph = await buildTypeGraph(Object.values(cityEntities).flatMap((entity) => qids(entity, "P31")));
  const reviews = [];
  const selectedCities = [];
  const newCities = [];
  for (const seed of seeds) {
    const resolution = titleResolution.get(seed.key);
    const entity = cityEntities[resolution.qid];
    const countrySeed = countries.find((entry) => entry.iso === seed.iso);
    const country = countryByIso.get(seed.iso);
    const reasons = [];
    const coords = coordinate(entity);
    const typePath = classified(entity, CITY_ROOTS, cityTypeGraph);
    if (!coords) reasons.push("coordinate-missing");
    if (!qids(entity, "P17").includes(countrySeed.qid)) reasons.push("country-claim-mismatch");
    if (!typePath) reasons.push("positive-city-type-unconfirmed");
    if (reasons.length) throw new Error(`city-semantic-rejected:${seed.title}:${reasons.join(",")}`);
    const existing = cityByQid.get(entity.id);
    if (existing && existing.parentCountryEntityId !== country.entityId) throw new Error(`existing-city-parent-mismatch:${entity.id}`);
    const city = existing || buildCity(seed, entity, country, retrievedAt);
    selectedCities.push({ seed, city, typePath, reused: Boolean(existing) });
    if (!existing) newCities.push(city);
  }

  const geosearchByCity = new Map();
  for (const selected of selectedCities) {
    geosearchByCity.set(selected.city.entityId, await geosearch(selected.city, selected.seed.iso, selected.seed.targetPoiCount * 3));
    await sleep(60);
  }
  const candidateQids = [...new Set([...geosearchByCity.values()].flat().map((entry) => entry.qid))];
  const poiEntities = await fetchEntities(candidateQids);
  const poiTypeGraph = await buildTypeGraph(Object.values(poiEntities).flatMap((entity) => qids(entity, "P31")));
  const usedPoiQids = new Set(existingPois.map((entry) => entry.wikidataId));
  const newPois = [];
  const selectedPoiByCity = new Map();
  for (const selected of selectedCities) {
    const countrySeed = countries.find((entry) => entry.iso === selected.seed.iso);
    const candidates = geosearchByCity.get(selected.city.entityId);
    const accepted = [];
    for (const candidate of candidates) {
      const entity = poiEntities[candidate.qid];
      const reasons = [];
      const coords = coordinate(entity);
      const poiPath = classified(entity, POI_ROOTS, poiTypeGraph);
      const cityPath = classified(entity, CITY_ROOTS, poiTypeGraph);
      const routeEligibility = routePoiEligibility(entity, poiTypeGraph);
      if (!coords) reasons.push("coordinate-missing");
      if (!qids(entity, "P17").includes(countrySeed.qid)) reasons.push("country-claim-mismatch");
      if (!poiPath) reasons.push("positive-poi-type-unconfirmed");
      if (cityPath) reasons.push("settlement-not-published-as-poi");
      if (!routeEligibility.accepted) reasons.push("operational-entity-not-route-poi");
      const distanceKm = coords ? entityLayerDistanceKm(selected.city.coordinates, coords) : Number.POSITIVE_INFINITY;
      if (distanceKm > 40) reasons.push("parent-city-distance-exceeded");
      if (candidate.qid === selected.city.wikidataId) reasons.push("same-as-parent-city");
      if (poiByQid.has(candidate.qid)) reasons.push("already-published-poi");
      if (usedPoiQids.has(candidate.qid)) reasons.push("duplicate-wave-poi");
      if (reasons.length) {
        reviews.push({
          reviewId: `batch${BATCH}-wave${wave}-review-${String(reviews.length + 1).padStart(5, "0")}`,
          entityType: "poi-candidate", countryCode: selected.seed.iso, parentCityEntityId: selected.city.entityId,
          requestedTitle: candidate.title, wikidataId: candidate.qid, reasonCodes: reasons,
          disposition: "quarantined-not-published",
        });
        continue;
      }
      accepted.push({
        candidate, entity, poiPath, distanceKm,
        score: Object.keys(entity.sitelinks || {}).length * 100 - distanceKm,
      });
    }
    accepted.sort((left, right) => right.score - left.score || left.candidate.qid.localeCompare(right.candidate.qid, "en"));
    const chosen = accepted.slice(0, selected.seed.targetPoiCount);
    const surplus = accepted.slice(selected.seed.targetPoiCount);
    for (const item of surplus) {
      reviews.push({
        reviewId: `batch${BATCH}-wave${wave}-review-${String(reviews.length + 1).padStart(5, "0")}`,
        entityType: "poi-candidate", countryCode: selected.seed.iso, parentCityEntityId: selected.city.entityId,
        requestedTitle: item.candidate.title, wikidataId: item.candidate.qid,
        reasonCodes: ["capacity-surplus"], disposition: "quarantined-not-published",
      });
    }
    // One confirmed visitor-facing POI is the publication floor. A city may be
    // published below its editorial target, but must never be padded with an
    // airport, station, university, hospital, or other operational entity.
    const minimumRoutePoiCount = Math.min(1, selected.seed.targetPoiCount);
    if (chosen.length < minimumRoutePoiCount) {
      reviews.push({
        reviewId: `batch${BATCH}-wave${wave}-review-${String(reviews.length + 1).padStart(5, "0")}`,
        entityType: "city-capacity", countryCode: selected.seed.iso, parentCityEntityId: selected.city.entityId,
        requestedTitle: selected.seed.name, wikidataId: selected.city.wikidataId,
        reasonCodes: ["no-route-eligible-poi"], disposition: "quarantined-city-not-published",
        selectedPoiCount: chosen.length, targetPoiCount: selected.seed.targetPoiCount,
      });
      selectedPoiByCity.set(selected.city.entityId, []);
      continue;
    }
    if (chosen.length < selected.seed.targetPoiCount) {
      reviews.push({
        reviewId: `batch${BATCH}-wave${wave}-review-${String(reviews.length + 1).padStart(5, "0")}`,
        entityType: "poi-capacity", countryCode: selected.seed.iso, parentCityEntityId: selected.city.entityId,
        requestedTitle: selected.seed.name, wikidataId: selected.city.wikidataId,
        reasonCodes: ["route-quality-capacity-shortfall"], disposition: "accepted-below-target-without-padding",
        selectedPoiCount: chosen.length, targetPoiCount: selected.seed.targetPoiCount,
      });
    }
    selectedPoiByCity.set(selected.city.entityId, chosen);
    for (const item of chosen) {
      usedPoiQids.add(item.candidate.qid);
      newPois.push(buildPoi(item.candidate, item.entity, selected.city, retrievedAt));
    }
  }

  const publishableCities = selectedCities.filter((entry) => (selectedPoiByCity.get(entry.city.entityId) || []).length >= 1);
  const publishableCityIds = new Set(publishableCities.map((entry) => entry.city.entityId));
  const publishableNewCities = newCities.filter((entry) => publishableCityIds.has(entry.entityId));

  const cityValidation = validateKnowledgeCityEntitySet(publishableNewCities);
  const poiValidation = validateKnowledgePoiEntitySet(newPois);
  if (!cityValidation.accepted) throw new Error(`city-validation-failed:${cityValidation.reasons.join("|")}`);
  if (!poiValidation.accepted) throw new Error(`poi-validation-failed:${poiValidation.reasons.join("|")}`);
  if (new Set(publishableNewCities.map((entry) => entry.wikidataId)).size !== publishableNewCities.length) throw new Error("duplicate-new-city-qid");
  if (new Set(newPois.map((entry) => entry.wikidataId)).size !== newPois.length) throw new Error("duplicate-new-poi-qid");

  publishableNewCities.sort((left, right) => left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));
  newPois.sort((left, right) => left.parentCityEntityId.localeCompare(right.parentCityEntityId, "en") || left.canonicalNameEn.localeCompare(right.canonicalNameEn, "en"));
  const prefix = `knowledge-expansion-batch${BATCH}-wave${wave}`;
  const paths = {
    raw: `data/knowledge/raw/${prefix}.wikidata.json`,
    cities: `data/knowledge/batches/cities.p1b-batch${batchNumber}.json`,
    pois: `data/knowledge/batches/pois.p1b-batch${batchNumber}.json`,
    provenance: `data/knowledge/batches/provenance.${prefix}.json`,
    conflicts: `data/knowledge/batches/conflicts.${prefix}.json`,
    review: `data/knowledge/batches/review-queue.${prefix}.json`,
    selection: `data/knowledge/batches/selection.p1b-batch${batchNumber}.json`,
  };
  await atomicJson(paths.raw, {
    schemaVersion: `route-v2-${prefix}-raw-v1`, retrievedAt, endpoint: { wikidata: WIKIDATA_API, wikipedia: WIKIPEDIA_API },
    seedPath: SEED_PATH, wave, countries: countries.map((entry) => entry.iso), titleResolution: Object.fromEntries(titleResolution),
    wikidata: { countryEntities, countryRelatedEntities, cityEntities, poiEntities }, typeGraphs: {
      city: Object.fromEntries(cityTypeGraph), poi: Object.fromEntries(poiTypeGraph),
    }, geosearch: Object.fromEntries(geosearchByCity),
  });
  await atomicJson(paths.cities, { schemaVersion: `route-v2-city-baseline-p1b-batch${batchNumber}`, generatedFrom: paths.raw, cityCount: publishableNewCities.length, cities: publishableNewCities });
  await atomicJson(paths.pois, { schemaVersion: `route-v2-poi-baseline-p1b-batch${batchNumber}`, generatedFrom: paths.raw, poiCount: newPois.length, pois: newPois });
  await atomicJson(paths.provenance, {
    schemaVersion: `route-v2-${prefix}-provenance-v1`, retrievedAt,
    sources: [WIKIDATA_API, WIKIPEDIA_API], sourcePolicy: "exact-enwiki-title plus positive P31/P279, exact P17, coordinates and parent distance",
    publishedEntityQids: [...publishableNewCities, ...newPois].map((entry) => entry.wikidataId).sort(),
  });
  await atomicJson(paths.conflicts, { schemaVersion: `route-v2-${prefix}-conflicts-v1`, conflictCount: 0, conflicts: [] });
  await atomicJson(paths.review, { schemaVersion: `route-v2-${prefix}-review-v1`, reviewCount: reviews.length, entries: reviews });
  await atomicJson(paths.selection, {
    schemaVersion: `route-v2-${prefix}-selection-v1`, wave,
    countries: countries.map((entry) => ({ isoAlpha2: entry.iso, wikidataId: entry.qid, entityId: countryByIso.get(entry.iso).entityId })),
    cities: publishableCities.map((entry) => ({
      countryCode: entry.seed.iso, tier: entry.seed.tier, targetPoiCount: entry.seed.targetPoiCount,
      selectedPoiCount: selectedPoiByCity.get(entry.city.entityId).length, reused: entry.reused,
      entityId: entry.city.entityId, wikidataId: entry.city.wikidataId, canonicalNameEn: entry.city.canonicalNameEn,
      positiveTypePath: entry.typePath,
    })),
    pois: [...selectedPoiByCity.entries()].flatMap(([parentCityEntityId, items]) => items.map((item) => ({
      entityId: createTypedEntityId({ entityType: "poi", wikidataId: item.candidate.qid }), parentCityEntityId,
      wikidataId: item.candidate.qid, canonicalNameEn: localizedLabel(item.entity, "en", item.candidate.title),
      positiveTypePath: item.poiPath, distanceKm: Number(item.distanceKm.toFixed(3)),
    }))),
    quarantineCount: reviews.length,
  });
  console.log(JSON.stringify({ status: "PASS", wave, countries: countries.map((entry) => entry.iso), newCountries: missingCountrySeeds.length, newCities: publishableNewCities.length, reusedCities: publishableCities.length - publishableNewCities.length, quarantinedCities: selectedCities.length - publishableCities.length, newPois: newPois.length, quarantined: reviews.length, outputs: paths }, null, 2));
}

await main();
