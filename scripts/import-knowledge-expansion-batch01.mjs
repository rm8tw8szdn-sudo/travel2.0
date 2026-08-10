import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeEntityLayerAliases,
  createEntityLayerProvenanceEntry,
  createTypedEntityId,
} from "../src/lib/routes/knowledge-entity-layer-primitives.mjs";
import {
  createCountryEntityId,
  sourceEntry,
  validateCountryEntitySet,
} from "../src/lib/routes/knowledge-country-baseline-schema.mjs";
import { validateKnowledgeCityEntitySet } from "../src/lib/routes/knowledge-city-baseline-schema.mjs";
import { validateKnowledgePoiEntitySet } from "../src/lib/routes/knowledge-poi-baseline-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "travel-collection-route-v2-knowledge-expansion-batch01/1.0";
const RETRIEVED_AT = "2026-08-03T08:00:00.000Z";
const LANGUAGES = ["en", "zh-hans", "zh", "is", "th", "de", "mi"];

const COUNTRY_FILES = [
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/countries.p1a-batch03.json",
];

const COUNTRIES = Object.freeze({
  IS: { qid: "Q189", entityId: createCountryEntityId({ isoAlpha2: "IS", wikidataId: "Q189" }) },
  TH: { qid: "Q869", entityId: "country-c3fe14f3610d3a77" },
  CH: { qid: "Q39", entityId: "country-d3be2882ba68e9b0" },
  NZ: { qid: "Q664", entityId: "country-b6e9ffcc290e32d8" },
  AU: { qid: "Q408", entityId: "country-d58bcebbb9283d7e" },
});

const CITY_SEEDS = Object.freeze([
  { iso: "IS", qid: "Q1764", en: "Reykjavík", zh: "雷克雅未克" },
  { iso: "IS", qid: "Q685369", en: "Vík í Mýrdal", zh: "维克" },
  { iso: "TH", qid: "Q1861", en: "Bangkok", zh: "曼谷" },
  { iso: "TH", qid: "Q52028", en: "Chiang Mai", zh: "清迈" },
  { iso: "CH", qid: "Q72", en: "Zürich", zh: "苏黎世" },
  { iso: "CH", qid: "Q4191", en: "Lucerne", zh: "卢塞恩" },
  { iso: "NZ", qid: "Q37100", en: "Auckland", zh: "奥克兰" },
  { iso: "NZ", qid: "Q613602", en: "Queenstown", zh: "皇后镇" },
  { iso: "AU", qid: "Q3130", en: "Sydney", zh: "悉尼" },
  { iso: "AU", qid: "Q3141", en: "Melbourne", zh: "墨尔本" },
]);

const POI_SEEDS = Object.freeze([
  { city: "Q1764", qid: "Q271466", en: "Hallgrímskirkja", zh: "哈尔格林姆教堂" },
  { city: "Q1764", qid: "Q1783706", en: "Harpa", zh: "哈帕音乐厅" },
  { city: "Q1764", qid: "Q626963", en: "National Museum of Iceland", zh: "冰岛国家博物馆" },
  { city: "Q685369", qid: "Q115641739", en: "Reynisfjara", zh: "雷尼斯黑沙滩" },
  { city: "Q685369", qid: "Q7319590", en: "Reynisdrangar", zh: "雷尼斯德朗加海蚀柱" },
  { city: "Q685369", qid: "Q16430332", en: "Víkurkirkja", zh: "维克教堂" },
  { city: "Q1861", qid: "Q873769", en: "Grand Palace", zh: "曼谷大皇宫" },
  { city: "Q1861", qid: "Q724970", en: "Wat Arun", zh: "郑王庙" },
  { city: "Q1861", qid: "Q1059910", en: "Wat Pho", zh: "卧佛寺" },
  { city: "Q52028", qid: "Q1657130", en: "Wat Phra Singh", zh: "帕辛寺" },
  { city: "Q52028", qid: "Q1454288", en: "Wat Chedi Luang", zh: "契迪龙寺" },
  { city: "Q52028", qid: "Q1517698", en: "Wat Phra That Doi Suthep", zh: "素贴寺" },
  { city: "Q72", qid: "Q691896", en: "National Museum Zurich", zh: "瑞士国家博物馆" },
  { city: "Q72", qid: "Q684948", en: "Grossmünster", zh: "苏黎世大教堂" },
  { city: "Q72", qid: "Q685038", en: "Kunsthaus Zürich", zh: "苏黎世美术馆" },
  { city: "Q4191", qid: "Q25225", en: "Chapel Bridge", zh: "卡佩尔廊桥" },
  { city: "Q4191", qid: "Q688214", en: "Lion Monument", zh: "狮子纪念碑" },
  { city: "Q4191", qid: "Q670595", en: "Swiss Museum of Transport", zh: "瑞士交通博物馆" },
  { city: "Q37100", qid: "Q758657", en: "Auckland War Memorial Museum", zh: "奥克兰战争纪念博物馆" },
  { city: "Q37100", qid: "Q722125", en: "Sky Tower", zh: "天空塔" },
  { city: "Q37100", qid: "Q4819492", en: "Auckland Art Gallery", zh: "奥克兰美术馆" },
  { city: "Q613602", qid: "Q106362263", en: "Skyline Queenstown", zh: "皇后镇天空缆车" },
  { city: "Q613602", qid: "Q7271100", en: "Queenstown Gardens", zh: "皇后镇花园" },
  { city: "Q613602", qid: "Q127469", en: "Lake Wakatipu", zh: "瓦卡蒂普湖" },
  { city: "Q3130", qid: "Q45178", en: "Sydney Opera House", zh: "悉尼歌剧院" },
  { city: "Q3130", qid: "Q54495", en: "Sydney Harbour Bridge", zh: "悉尼海港大桥" },
  { city: "Q3130", qid: "Q54489", en: "Royal Botanic Garden, Sydney", zh: "悉尼皇家植物园" },
  { city: "Q3141", qid: "Q1464509", en: "National Gallery of Victoria", zh: "维多利亚国家美术馆" },
  { city: "Q3141", qid: "Q695935", en: "Royal Exhibition Building", zh: "皇家展览馆" },
  { city: "Q3141", qid: "Q1353869", en: "Melbourne Museum", zh: "墨尔本博物馆" },
]);

const OUTPUTS = Object.freeze({
  raw: "data/knowledge/raw/knowledge-expansion-batch01.wikidata.json",
  countries: "data/knowledge/batches/countries.p1a-batch04.json",
  cities: "data/knowledge/batches/cities.p1b-batch03.json",
  pois: "data/knowledge/batches/pois.p1b-batch03.json",
  provenance: "data/knowledge/batches/provenance.knowledge-expansion-batch01.json",
  conflicts: "data/knowledge/batches/conflicts.knowledge-expansion-batch01.json",
  review: "data/knowledge/batches/review-queue.knowledge-expansion-batch01.json",
  selection: "data/knowledge/batches/selection.p1b-batch03.json",
});

function coordinate(entity) {
  const claim = (entity?.claims?.P625 || []).find((value) => value?.rank !== "deprecated");
  const value = claim?.mainsnak?.datavalue?.value;
  if (!Number.isFinite(Number(value?.latitude)) || !Number.isFinite(Number(value?.longitude))) return null;
  return { latitude: Number(value.latitude), longitude: Number(value.longitude) };
}

function values(entity, property) {
  return [...new Set((entity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value) => /^Q\d+$/u.test(String(value))))].sort();
}

function aliases(entity, canonical) {
  return canonicalizeEntityLayerAliases(LANGUAGES.flatMap((language) => [
    entity?.labels?.[language]?.value,
    ...(entity?.aliases?.[language] || []).map((entry) => entry.value),
  ]).filter(Boolean), canonical);
}

function provenance(field, sourceType, source, sourceUrl, value) {
  return createEntityLayerProvenanceEntry({ field, sourceType, source, sourceUrl, retrievedAt: RETRIEVED_AT, value });
}

function buildCity(seed, rawEntity) {
  const entityId = createTypedEntityId({ entityType: "city", wikidataId: seed.qid });
  const parent = COUNTRIES[seed.iso];
  const coords = coordinate(rawEntity);
  if (!coords) throw new Error(`city-coordinate-missing:${seed.qid}`);
  const cityAliases = aliases(rawEntity, [seed.zh, seed.en]);
  const wiki = `https://www.wikidata.org/wiki/${seed.qid}`;
  const schema = (field, value) => provenance(field, "project-schema", "Route V2 Knowledge Expansion Batch 01", "", value);
  const wd = (field, value) => provenance(field, "wikidata", "Wikidata wbgetentities", wiki, value);
  return {
    schemaVersion: "route-v2-city-baseline-p1b", entityId, entityType: "city",
    parentCountryEntityId: parent.entityId, wikidataId: seed.qid,
    canonicalNameZh: seed.zh, canonicalNameEn: seed.en, aliases: cityAliases,
    coordinates: coords, entitySourceType: "wikidata", confidence: 0.95, retrievedAt: RETRIEVED_AT,
    provenance: {
      entityId: schema("entityId", entityId), entityType: schema("entityType", "city"),
      parentCountryEntityId: provenance("parentCountryEntityId", "repository-reference", "Route V2 P1A Country Baseline", `https://www.wikidata.org/wiki/${parent.qid}`, parent.entityId),
      wikidataId: wd("wikidataId", seed.qid),
      canonicalNameZh: provenance("canonicalNameZh", "project-schema", "Curated Chinese display name for Knowledge Expansion Batch 01", wiki, seed.zh),
      canonicalNameEn: wd("canonicalNameEn", seed.en), aliases: wd("aliases", cityAliases), coordinates: wd("coordinates", coords),
      entitySourceType: schema("entitySourceType", "wikidata"), confidence: schema("confidence", 0.95), retrievedAt: wd("retrievedAt", RETRIEVED_AT),
    },
  };
}

function buildPoi(seed, rawEntity, cityByQid) {
  const city = cityByQid.get(seed.city);
  const entityId = createTypedEntityId({ entityType: "poi", wikidataId: seed.qid });
  const coords = coordinate(rawEntity);
  if (!city || !coords) throw new Error(`poi-parent-or-coordinate-missing:${seed.qid}`);
  const poiAliases = aliases(rawEntity, [seed.zh, seed.en]);
  const wiki = `https://www.wikidata.org/wiki/${seed.qid}`;
  const schema = (field, value) => provenance(field, "project-schema", "Route V2 Knowledge Expansion Batch 01", "", value);
  const wd = (field, value) => provenance(field, "wikidata", "Wikidata wbgetentities", wiki, value);
  return {
    schemaVersion: "route-v2-poi-baseline-p1b", entityId, entityType: "poi",
    parentCityEntityId: city.entityId, wikidataId: seed.qid,
    canonicalNameZh: seed.zh, canonicalNameEn: seed.en, aliases: poiAliases,
    coordinates: coords, entitySourceType: "wikidata", confidence: 0.95, retrievedAt: RETRIEVED_AT,
    provenance: {
      entityId: schema("entityId", entityId), entityType: schema("entityType", "poi"),
      parentCityEntityId: provenance("parentCityEntityId", "repository-reference", "Route V2 P1B City Baseline", `https://www.wikidata.org/wiki/${city.wikidataId}`, city.entityId),
      wikidataId: wd("wikidataId", seed.qid),
      canonicalNameZh: provenance("canonicalNameZh", "project-schema", "Curated Chinese display name for Knowledge Expansion Batch 01", wiki, seed.zh),
      canonicalNameEn: wd("canonicalNameEn", seed.en), aliases: wd("aliases", poiAliases), coordinates: wd("coordinates", coords),
      entitySourceType: schema("entitySourceType", "wikidata"), confidence: schema("confidence", 0.95), retrievedAt: wd("retrievedAt", RETRIEVED_AT),
    },
  };
}

function countryProvenance(field, entries) {
  return entries.map((entry) => sourceEntry({ field, retrievedAt: RETRIEVED_AT, ...entry }));
}

function buildIceland(rawEntity) {
  const entityId = COUNTRIES.IS.entityId;
  const wiki = "https://www.wikidata.org/wiki/Q189";
  const coords = coordinate(rawEntity);
  const wd = (field, value) => ({ sourceType: "wikidata", source: "Wikidata wbgetentities", sourceUrl: wiki, value });
  const iso = (field, value) => ({ sourceType: "iso", source: "ISO 3166 Knowledge Expansion Batch 01 seed", sourceUrl: "", value });
  const catalog = (field, value) => ({ sourceType: "project-country-catalog", source: "Knowledge Expansion Batch 01 curated country catalog", sourceUrl: "", value });
  const continent = { wikidataId: "Q46", canonicalNameZh: "欧洲", canonicalNameEn: "Europe" };
  const capital = { wikidataId: "Q1764", canonicalNameZh: "雷克雅未克", canonicalNameEn: "Reykjavík", aliases: ["Reykjavik"] };
  const countryAliases = canonicalizeEntityLayerAliases(["Ísland", "Republic of Iceland", "冰岛共和国"], ["冰岛", "Iceland"]);
  const valuesByField = { entityId, isoAlpha2: "IS", isoAlpha3: "ISL", isoNumeric: "352", wikidataId: "Q189", canonicalNameZh: "冰岛", canonicalNameEn: "Iceland", aliases: countryAliases, continent, region: "欧洲", subregion: "Northern Europe", capital, coordinates: coords };
  return {
    schemaVersion: "route-v2-country-baseline-p1a", entityId, entityType: "country",
    isoAlpha2: "IS", isoAlpha3: "ISL", isoNumeric: "352", wikidataId: "Q189",
    canonicalNameZh: "冰岛", canonicalNameEn: "Iceland", aliases: countryAliases,
    continent, region: "欧洲", subregion: "Northern Europe", capital, coordinates: coords,
    entitySourceType: "wikidata",
    provenance: {
      entityId: countryProvenance("entityId", [iso("isoAlpha2", "IS"), wd("wikidataId", "Q189")]),
      isoAlpha2: countryProvenance("isoAlpha2", [iso("isoAlpha2", "IS")]),
      isoAlpha3: countryProvenance("isoAlpha3", [iso("isoAlpha3", "ISL")]),
      isoNumeric: countryProvenance("isoNumeric", [iso("isoNumeric", "352")]),
      wikidataId: countryProvenance("wikidataId", [wd("wikidataId", "Q189")]),
      canonicalNameZh: countryProvenance("canonicalNameZh", [catalog("canonicalNameZh", "冰岛")]),
      canonicalNameEn: countryProvenance("canonicalNameEn", [wd("canonicalNameEn", "Iceland")]),
      aliases: countryProvenance("aliases", [wd("aliases", countryAliases)]),
      continent: countryProvenance("continent", [wd("continent", continent)]),
      region: countryProvenance("region", [catalog("region", "欧洲")]),
      subregion: countryProvenance("subregion", [catalog("subregion", "Northern Europe")]),
      capital: countryProvenance("capital", [wd("capital", capital)]),
      coordinates: countryProvenance("coordinates", [wd("coordinates", coords)]),
    },
    confidence: 0.95, retrievedAt: RETRIEVED_AT,
  };
}

async function fetchRaw() {
  const qids = ["Q189", ...CITY_SEEDS.map((seed) => seed.qid), ...POI_SEEDS.map((seed) => seed.qid)];
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ action: "wbgetentities", format: "json", ids: qids.join("|"), props: "labels|aliases|descriptions|claims", languages: LANGUAGES.join("|") });
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`wikidata-fetch-failed:${response.status}`);
  const payload = await response.json();
  return { schemaVersion: "route-v2-knowledge-expansion-batch01-raw", retrievedAt: RETRIEVED_AT, endpoint: ENDPOINT, qids: [...qids].sort(), wikidata: { entities: payload.entities } };
}

async function atomicJson(relativePath, value) {
  const filePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, filePath); }
  finally { await rm(temporary, { force: true }); }
}

async function main() {
  const raw = await fetchRaw();
  const entities = raw.wikidata.entities;
  const countries = [buildIceland(entities.Q189)];
  const cities = CITY_SEEDS.map((seed) => buildCity(seed, entities[seed.qid])).sort((a, b) => a.entityId.localeCompare(b.entityId, "en"));
  const cityByQid = new Map(cities.map((city) => [city.wikidataId, city]));
  const pois = POI_SEEDS.map((seed) => buildPoi(seed, entities[seed.qid], cityByQid)).sort((a, b) => a.entityId.localeCompare(b.entityId, "en"));

  const validations = [validateCountryEntitySet(countries), validateKnowledgeCityEntitySet(cities), validateKnowledgePoiEntitySet(pois)];
  if (validations.some((validation) => !validation.accepted)) throw new Error(`batch01-invalid:${JSON.stringify(validations)}`);

  const priorCountries = (await Promise.all(COUNTRY_FILES.map(async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")).countries))).flat();
  const priorQids = new Set(priorCountries.map((country) => country.wikidataId));
  if (priorQids.has("Q189")) throw new Error("iceland-already-published");

  const selections = {
    schemaVersion: "route-v2-knowledge-expansion-batch01-selection-v1",
    country: countries.map(({ entityId, wikidataId, canonicalNameEn }) => ({ entityId, wikidataId, canonicalNameEn })),
    cities: cities.map(({ entityId, parentCountryEntityId, wikidataId, canonicalNameEn }) => ({ entityId, parentCountryEntityId, wikidataId, canonicalNameEn })),
    pois: pois.map(({ entityId, parentCityEntityId, wikidataId, canonicalNameEn }) => ({ entityId, parentCityEntityId, wikidataId, canonicalNameEn })),
  };
  const provenance = { schemaVersion: "route-v2-knowledge-expansion-batch01-provenance-v1", retrievedAt: RETRIEVED_AT, source: "Wikidata wbgetentities plus explicit project-schema Chinese display-name curation", entityQids: raw.qids };
  const reviewQueue = { schemaVersion: "route-v2-knowledge-expansion-batch01-review-v1", reviewCount: 0, reviews: [] };
  const conflicts = { schemaVersion: "route-v2-knowledge-expansion-batch01-conflicts-v1", conflictCount: 0, conflicts: [] };

  await atomicJson(OUTPUTS.raw, raw);
  await atomicJson(OUTPUTS.countries, { schemaVersion: "route-v2-country-baseline-p1a-batch04", generatedFrom: OUTPUTS.raw, countryCount: countries.length, countries });
  await atomicJson(OUTPUTS.cities, { schemaVersion: "route-v2-city-baseline-p1b-batch03", generatedFrom: OUTPUTS.raw, cityCount: cities.length, cities });
  await atomicJson(OUTPUTS.pois, { schemaVersion: "route-v2-poi-baseline-p1b-batch03", generatedFrom: OUTPUTS.raw, poiCount: pois.length, pois });
  await atomicJson(OUTPUTS.provenance, provenance);
  await atomicJson(OUTPUTS.conflicts, conflicts);
  await atomicJson(OUTPUTS.review, reviewQueue);
  await atomicJson(OUTPUTS.selection, selections);
  console.log(JSON.stringify({ countries: countries.length, cities: cities.length, pois: pois.length, total: countries.length + cities.length + pois.length, conflicts: 0 }, null, 2));
}

await main();
