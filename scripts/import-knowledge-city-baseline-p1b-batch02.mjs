import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  canonicalizeEntityLayerAliases,
  createEntityLayerIssueId,
  createTypedEntityId,
  dedupeKnowledgeCityEntities,
  normalizeKnowledgeCityBaseline,
  validateKnowledgeCityEntitySet,
} from "../src/lib/routes/index.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

export const CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH = "data/knowledge/raw/cities-p1b-batch02.wikidata.json";
const RAW_PATH = path.join(REPOSITORY_ROOT, CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH);
const RAW_SCHEMA_VERSION = "route-v2-city-baseline-p1b-batch02-raw";
const ENTITY_API_ENDPOINT = "https://www.wikidata.org/w/api.php";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "travel-collection-route-v2-city-baseline-p1b-batch02/1.0";
const BATCH_ALIAS_LANGUAGES = Object.freeze(["en", "zh-hans", "zh", "fr", "de", "it", "es", "ko"]);

export const CITY_BASELINE_P1B_BATCH02_TYPE_QID_POLICY = Object.freeze({
  compatibleCityTypeQids: Object.freeze([
    "Q1549591", // big city
    "Q200250", // metropolis
    "Q2264924", // port city
    "Q257978", // statutory city in the Czech Republic
    "Q515", // city
    "Q51929311", // largest city
    "Q7930989", // city or town
    "Q8452914", // district town
    "Q925381", // city with powiat rights in Poland
  ]),
  compatibleAdministrativeTypeQids: Object.freeze([
    "Q108178728", // national capital
    "Q10864048", // first-level administrative division
    "Q12031379", // capital of region
    "Q15978299", // municipality with town privileges in the Czech Republic
    "Q1901835", // seat of government
    "Q2555896", // municipality of Colombia
    "Q257978", // statutory city in the Czech Republic
    "Q3032103", // district of Colombia
    "Q395994", // capital district or territory
    "Q499073", // direct-controlled municipality
    "Q5153359", // municipality of the Czech Republic
    "Q548611", // district of the Czech Republic
    "Q56061", // administrative territorial entity
    "Q76007695", // Czech expanded-powers administrative district
    "Q76009696", // Czech authorized-office administrative district
    "Q7819319", // Czech municipality with expanded powers
    "Q7841907", // municipality with authorized municipal office
    "Q8452914", // district town
    "Q856076", // municipality of Finland
    "Q925381", // city with powiat rights in Poland
  ]),
  blockingMetroTypeQids: Object.freeze(["Q1907114"]), // metropolitan area
  blockingRegionTypeQids: Object.freeze(["Q38911"]), // region of the Czech Republic
  // No state/province P31 QID is asserted without evidence in the approved ten-City source set.
  blockingStateTypeQids: Object.freeze([]),
  municipalityReviewTypeQids: Object.freeze([
    "Q15978299", "Q2555896", "Q499073", "Q5153359", "Q7819319", "Q7841907", "Q856076",
  ]),
  districtReviewTypeQids: Object.freeze([
    "Q3032103", "Q395994", "Q548611", "Q76007695", "Q76009696", "Q8452914",
  ]),
});

export const CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES = Object.freeze([
  "multiple-city-type-candidates",
  "city-administrative-entity-overlap",
  "city-administrative-region-overlap",
  "p17-source-projection-difference",
  "p31-source-projection-difference",
  "p131-source-projection-difference",
  "unclassified-city-type-qids",
]);

export const CITY_BASELINE_P1B_BATCH02_SEEDS = Object.freeze([
  Object.freeze({ isoAlpha2: "FR", wikidataId: "Q90", expectedNameEn: "Paris", expectedCountryWikidataId: "Q142", parentCountryEntityId: "country-a20e4bab95389730" }),
  Object.freeze({ isoAlpha2: "FR", wikidataId: "Q456", expectedNameEn: "Lyon", expectedCountryWikidataId: "Q142", parentCountryEntityId: "country-a20e4bab95389730" }),
  Object.freeze({ isoAlpha2: "DE", wikidataId: "Q64", expectedNameEn: "Berlin", expectedCountryWikidataId: "Q183", parentCountryEntityId: "country-9bef984affea20d8" }),
  Object.freeze({ isoAlpha2: "DE", wikidataId: "Q1726", expectedNameEn: "Munich", expectedCountryWikidataId: "Q183", parentCountryEntityId: "country-9bef984affea20d8" }),
  Object.freeze({ isoAlpha2: "IT", wikidataId: "Q220", expectedNameEn: "Rome", expectedCountryWikidataId: "Q38", parentCountryEntityId: "country-4df88b953a99e6a4" }),
  Object.freeze({ isoAlpha2: "IT", wikidataId: "Q2044", expectedNameEn: "Florence", expectedCountryWikidataId: "Q38", parentCountryEntityId: "country-4df88b953a99e6a4" }),
  Object.freeze({ isoAlpha2: "ES", wikidataId: "Q2807", expectedNameEn: "Madrid", expectedCountryWikidataId: "Q29", parentCountryEntityId: "country-ab252ee38e8cdf81" }),
  Object.freeze({ isoAlpha2: "ES", wikidataId: "Q1492", expectedNameEn: "Barcelona", expectedCountryWikidataId: "Q29", parentCountryEntityId: "country-ab252ee38e8cdf81" }),
  Object.freeze({ isoAlpha2: "KR", wikidataId: "Q8684", expectedNameEn: "Seoul", expectedCountryWikidataId: "Q884", parentCountryEntityId: "country-6d9a5fa9dc49e5f4" }),
  Object.freeze({ isoAlpha2: "KR", wikidataId: "Q16520", expectedNameEn: "Busan", expectedCountryWikidataId: "Q884", parentCountryEntityId: "country-6d9a5fa9dc49e5f4" }),
]);

export const CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/countries.p1a-pilot.json",
  "data/knowledge/batches/countries.p1a-batch01.json",
  "data/knowledge/batches/countries.p1a-batch02.json",
  "data/knowledge/batches/countries.p1a-batch03.json",
]);

export const CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS = Object.freeze({
  cities: "data/knowledge/batches/cities.p1b-batch02.json",
  provenance: "data/knowledge/batches/provenance.cities.p1b-batch02.json",
  conflicts: "data/knowledge/batches/conflicts.p1b-batch02.json",
  reviewQueue: "data/knowledge/batches/review-queue.p1b-batch02.json",
});

const PRIOR_CITY_RELATIVE_PATHS = Object.freeze([
  "data/knowledge/cities.p1b-pilot.json",
  "data/knowledge/batches/cities.p1b-batch01.json",
]);

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en")));
}

function stableAliases(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([language, aliases]) => [language, [...aliases].map(clone)
      .sort((left, right) => String(left?.value || "").localeCompare(String(right?.value || ""), "en"))]));
}

function stableClaims(claims = []) {
  return [...claims].map(clone).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));
}

function pruneWikidataEntity(entity, responseMapKey) {
  if (!entity || entity.missing !== undefined) {
    return entity ? { responseMapKey, id: entity.id, missing: entity.missing } : undefined;
  }
  return {
    responseMapKey,
    pageid: entity.pageid,
    ns: entity.ns,
    title: entity.title,
    lastrevid: entity.lastrevid,
    modified: entity.modified,
    type: entity.type,
    id: entity.id,
    labels: stableObject(entity.labels || {}),
    descriptions: stableObject(entity.descriptions || {}),
    aliases: stableAliases(entity.aliases || {}),
    claims: {
      P17: stableClaims(entity.claims?.P17 || []),
      P31: stableClaims(entity.claims?.P31 || []),
      P131: stableClaims(entity.claims?.P131 || []),
      P625: stableClaims(entity.claims?.P625 || []),
    },
  };
}

function claimQids(entity, property) {
  return [...new Set((entity?.claims?.[property] || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter((value) => /^Q\d+$/u.test(String(value))))].sort((left, right) => left.localeCompare(right, "en"));
}

function coordinateValues(entity) {
  const values = (entity?.claims?.P625 || [])
    .filter((claim) => claim?.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value) => Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude)))
    .map((value) => ({ latitude: Number(value.latitude), longitude: Number(value.longitude) }));
  return [...new Map(values.map((value) => [`${value.latitude},${value.longitude}`, value])).values()];
}

function buildSemanticQuery() {
  const values = CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => `wd:${seed.wikidataId}`).join(" ");
  return `SELECT DISTINCT ?city ?type ?typeLabel ?admin ?adminLabel ?country ?isCityClass ?isAdministrativeClass ?isMetropolitanAreaClass WHERE {
    VALUES ?city { ${values} }
    OPTIONAL { ?city wdt:P31 ?type . }
    OPTIONAL { ?city wdt:P131 ?admin . }
    OPTIONAL { ?city wdt:P17 ?country . }
    BIND(EXISTS { ?city wdt:P31/wdt:P279* wd:Q515 } AS ?isCityClass)
    BIND(EXISTS { ?city wdt:P31/wdt:P279* wd:Q56061 } AS ?isAdministrativeClass)
    BIND(EXISTS { ?city wdt:P31/wdt:P279* wd:Q1907114 } AS ?isMetropolitanAreaClass)
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  ORDER BY ?city ?type ?admin`;
}

function qidFromUri(value) {
  return String(value || "").match(/Q\d+$/u)?.[0] || "";
}

function booleanBinding(value) {
  return String(value || "").toLocaleLowerCase("en") === "true";
}

function semanticEvidenceFromBindings(bindings = []) {
  const byQid = new Map();

  for (const binding of bindings) {
    const entityUri = binding.city?.value || "";
    const qid = qidFromUri(entityUri);
    if (!qid) continue;
    if (!byQid.has(qid)) {
      byQid.set(qid, {
        wikidataId: qid,
        entityUris: new Set(),
        bindingCount: 0,
        typeLabelsById: new Map(),
        parentLabelsById: new Map(),
        countryIds: new Set(),
        isCityClass: false,
        isAdministrativeClass: false,
        isMetropolitanAreaClass: false,
      });
    }
    const evidence = byQid.get(qid);
    evidence.entityUris.add(entityUri);
    evidence.bindingCount += 1;
    const typeId = qidFromUri(binding.type?.value);
    const parentId = qidFromUri(binding.admin?.value);
    const countryId = qidFromUri(binding.country?.value);
    if (typeId) evidence.typeLabelsById.set(typeId, binding.typeLabel?.value || "");
    if (parentId) evidence.parentLabelsById.set(parentId, binding.adminLabel?.value || "");
    if (countryId) evidence.countryIds.add(countryId);
    evidence.isCityClass ||= booleanBinding(binding.isCityClass?.value);
    evidence.isAdministrativeClass ||= booleanBinding(binding.isAdministrativeClass?.value);
    evidence.isMetropolitanAreaClass ||= booleanBinding(binding.isMetropolitanAreaClass?.value);
  }

  return Object.fromEntries([...byQid.entries()].sort(([left], [right]) => left.localeCompare(right, "en")).map(([qid, evidence]) => [qid, {
    wikidataId: qid,
    entityUris: [...evidence.entityUris].sort(),
    bindingCount: evidence.bindingCount,
    typeIds: [...evidence.typeLabelsById.keys()].sort(),
    typeLabelsEn: Object.fromEntries([...evidence.typeLabelsById.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))),
    parentIds: [...evidence.parentLabelsById.keys()].sort(),
    parentLabelsEn: Object.fromEntries([...evidence.parentLabelsById.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))),
    countryIds: [...evidence.countryIds].sort(),
    isCityClass: evidence.isCityClass,
    isAdministrativeClass: evidence.isAdministrativeClass,
    isMetropolitanAreaClass: evidence.isMetropolitanAreaClass,
  }]));
}

async function fetchJsonWithRetry(url, options, { fetchImplementation, timeoutMs, retries, counters }) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      counters.httpRequestCount += 1;
      const response = await fetchImplementation(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`wikidata-fetch-failed:${response.status}`);
      const payload = await response.json();
      clearTimeout(timer);
      return payload;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= retries) break;
      counters.retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function loadKnowledgeCityBaselineP1bBatch02Countries(repositoryRoot = REPOSITORY_ROOT) {
  const assets = await Promise.all(CITY_BASELINE_P1B_BATCH02_COUNTRY_ASSET_RELATIVE_PATHS.map(async (relativePath) => {
    return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
  }));
  const countries = assets.flatMap((asset) => asset.countries || []);
  if (countries.length !== 50) throw new Error(`country-context-count-invalid:${countries.length}`);
  const byId = new Map(countries.map((country) => [country.entityId, country]));
  for (const seed of CITY_BASELINE_P1B_BATCH02_SEEDS) {
    const country = byId.get(seed.parentCountryEntityId);
    if (!country || country.isoAlpha2 !== seed.isoAlpha2 || country.wikidataId !== seed.expectedCountryWikidataId) {
      throw new Error(`country-context-identity-mismatch:${seed.isoAlpha2}:${seed.wikidataId}`);
    }
  }
  return countries;
}

export function validateKnowledgeCityBaselineP1bBatch02SeedScope({ countries = [], priorCities = [] } = {}) {
  const seedQids = CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => seed.wikidataId);
  const seedIsoAlpha2 = CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => seed.isoAlpha2);
  const countryQidList = stableUniqueQids(countries.map((country) => country.wikidataId));
  const countryQids = new Set(countryQidList);
  const priorCityQids = new Set(priorCities.map((city) => city.wikidataId));
  const countryQidOverlaps = seedQids.filter((qid) => countryQids.has(qid));
  const priorCityQidOverlaps = seedQids.filter((qid) => priorCityQids.has(qid));
  const result = {
    accepted: countries.length === 50
      && CITY_BASELINE_P1B_BATCH02_SEEDS.length === 10
      && new Set(seedQids).size === 10
      && new Set(seedIsoAlpha2).size === 5
      && countryQidOverlaps.length === 0
      && priorCityQidOverlaps.length === 0,
    countryCount: countries.length,
    seedCount: CITY_BASELINE_P1B_BATCH02_SEEDS.length,
    seedQidCount: seedQids.length,
    uniqueSeedQidCount: new Set(seedQids).size,
    seedCountryCount: new Set(seedIsoAlpha2).size,
    countryQids: countryQidList,
    countryQidOverlaps,
    priorCityQidOverlaps,
  };
  return result;
}

export async function refreshKnowledgeCityBaselineP1bBatch02RawSnapshot({
  fetchImplementation = globalThis.fetch,
  timeoutMs = 60_000,
  retries = 1,
  now = () => new Date().toISOString(),
  identityScope,
} = {}) {
  if (typeof fetchImplementation !== "function") throw new Error("wikidata-fetch-unavailable");
  if (identityScope?.accepted !== true) throw new Error("city-batch02-identity-scope-not-validated");
  const qids = CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => seed.wikidataId);
  const entityEndpoint = new URL(ENTITY_API_ENDPOINT);
  entityEndpoint.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    props: "labels|descriptions|aliases|claims",
    languages: BATCH_ALIAS_LANGUAGES.join("|"),
    ids: qids.join("|"),
    origin: "*",
  }).toString();
  const semanticQuery = buildSemanticQuery();
  const semanticBody = new URLSearchParams({ query: semanticQuery, format: "json" });
  const counters = { httpRequestCount: 0, retryCount: 0 };
  const headers = { accept: "application/json", "user-agent": USER_AGENT };

  const entityPayload = await fetchJsonWithRetry(entityEndpoint, { headers }, {
    fetchImplementation, timeoutMs, retries, counters,
  });
  const semanticPayload = await fetchJsonWithRetry(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: semanticBody,
  }, { fetchImplementation, timeoutMs, retries, counters });

  const entities = Object.fromEntries(Object.entries(entityPayload?.entities || {})
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([responseMapKey, entity]) => [responseMapKey, pruneWikidataEntity(entity, responseMapKey)]));
  const semanticEvidence = semanticEvidenceFromBindings(semanticPayload?.results?.bindings || []);
  const rawSnapshot = {
    schemaVersion: RAW_SCHEMA_VERSION,
    retrievedAt: now(),
    source: {
      provider: "wikidata-api+sparql",
      endpoints: [entityEndpoint.toString(), SPARQL_ENDPOINT],
      semanticQuery,
      cityCount: qids.length,
      approvedEntities: CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => ({
        isoAlpha2: seed.isoAlpha2,
        cityKey: `${seed.isoAlpha2}:${seed.expectedNameEn}`,
        wikidataId: seed.wikidataId,
        parentCountryEntityId: seed.parentCountryEntityId,
        expectedCountryWikidataId: seed.expectedCountryWikidataId,
      })),
      wikidataIds: qids,
      apiEntityKeys: Object.keys(entityPayload?.entities || {}).sort(),
      httpRequestCount: counters.httpRequestCount,
      retryCount: counters.retryCount,
      entityRecordCount: Object.keys(entityPayload?.entities || {}).length,
      semanticBindingCount: semanticPayload?.results?.bindings?.length || 0,
      semanticRecordCount: Object.keys(semanticEvidence).length,
      identityScope: clone(identityScope),
    },
    wikidata: {
      success: entityPayload?.success,
      entities,
    },
    semanticEvidence,
  };
  const gate = validateKnowledgeCityBaselineP1bBatch02RawSnapshot(rawSnapshot);
  return { ...rawSnapshot, gate };
}

function stableUniqueQids(values = []) {
  return [...new Set(values.filter((value) => /^Q\d+$/u.test(String(value))))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function compareKnowledgeCityBaselineP1bBatch02ClaimProjections(apiClaims = [], sparqlTruthyClaims = []) {
  const api = stableUniqueQids(apiClaims);
  const sparql = stableUniqueQids(sparqlTruthyClaims);
  const apiSet = new Set(api);
  const sparqlSet = new Set(sparql);
  return {
    apiClaims: api,
    sparqlTruthyClaims: sparql,
    unionClaims: stableUniqueQids([...api, ...sparql]),
    onlyInApi: api.filter((qid) => !sparqlSet.has(qid)),
    onlyInSparql: sparql.filter((qid) => !apiSet.has(qid)),
    exactMatch: api.length === sparql.length && api.every((qid, index) => qid === sparql[index]),
  };
}

function policyMatches(typeQids, policyKey) {
  const policy = new Set(CITY_BASELINE_P1B_BATCH02_TYPE_QID_POLICY[policyKey]);
  return typeQids.filter((qid) => policy.has(qid));
}

export function classifyKnowledgeCityBaselineP1bBatch02TypeQids(typeQids = []) {
  const normalizedTypeQids = stableUniqueQids(typeQids);
  const compatibleCityTypeQids = policyMatches(normalizedTypeQids, "compatibleCityTypeQids");
  const compatibleAdministrativeTypeQids = policyMatches(normalizedTypeQids, "compatibleAdministrativeTypeQids");
  const blockingMetroTypeQids = policyMatches(normalizedTypeQids, "blockingMetroTypeQids");
  const blockingRegionTypeQids = policyMatches(normalizedTypeQids, "blockingRegionTypeQids");
  const blockingStateTypeQids = policyMatches(normalizedTypeQids, "blockingStateTypeQids");
  const classifiedQids = new Set([
    ...compatibleCityTypeQids,
    ...compatibleAdministrativeTypeQids,
    ...blockingMetroTypeQids,
    ...blockingRegionTypeQids,
    ...blockingStateTypeQids,
  ]);
  const unclassifiedTypeQids = normalizedTypeQids.filter((qid) => !classifiedQids.has(qid));
  const hasExplicitCityIdentity = compatibleCityTypeQids.length > 0;
  const blockingReasons = [];
  const reviewReasons = [];

  if (blockingMetroTypeQids.length > 0) blockingReasons.push("approved-qid-is-metropolitan-area");
  if (!hasExplicitCityIdentity && blockingRegionTypeQids.length > 0) blockingReasons.push("approved-qid-is-region-without-city-identity");
  if (!hasExplicitCityIdentity && blockingStateTypeQids.length > 0) blockingReasons.push("approved-qid-is-state-without-city-identity");
  if (!hasExplicitCityIdentity) blockingReasons.push("approved-qid-not-city-class");

  if (hasExplicitCityIdentity && compatibleAdministrativeTypeQids.length > 0) reviewReasons.push("city-administrative-entity-overlap");
  if (hasExplicitCityIdentity && blockingRegionTypeQids.length > 0) reviewReasons.push("city-administrative-region-overlap");
  if (hasExplicitCityIdentity && blockingStateTypeQids.length > 0) reviewReasons.push("city-administrative-state-overlap");
  if (compatibleCityTypeQids.length > 1) reviewReasons.push("multiple-city-type-candidates");
  if (unclassifiedTypeQids.length > 0) reviewReasons.push("unclassified-city-type-qids");

  return {
    policy: "exact-p31-qid-v1",
    sourceTypeQids: normalizedTypeQids,
    compatibleCityTypeQids,
    compatibleAdministrativeTypeQids,
    blockingMetroTypeQids,
    blockingRegionTypeQids,
    blockingStateTypeQids,
    unclassifiedTypeQids,
    hasExplicitCityIdentity,
    blockingReasons,
    reviewReasons,
    status: blockingReasons.length > 0 ? "blocking" : reviewReasons.length > 0 ? "compatible-review" : "pass",
  };
}

export function validateKnowledgeCityBaselineP1bBatch02RawSnapshot(rawSnapshot) {
  const results = [];
  const rawEntities = rawSnapshot?.wikidata?.entities || {};
  const semanticEvidence = rawSnapshot?.semanticEvidence || {};
  const expectedQids = CITY_BASELINE_P1B_BATCH02_SEEDS.map((seed) => seed.wikidataId).sort();
  const actualQids = Object.keys(rawEntities).sort();
  const actualSemanticQids = Object.keys(semanticEvidence).sort();
  const globalReasons = [];
  if (rawSnapshot?.schemaVersion !== RAW_SCHEMA_VERSION) globalReasons.push("raw-schema-version-invalid");
  if (rawSnapshot?.source?.provider !== "wikidata-api+sparql") globalReasons.push("raw-provider-invalid");
  if (rawSnapshot?.source?.identityScope?.accepted !== true) globalReasons.push("raw-identity-scope-invalid");
  if (JSON.stringify(actualQids) !== JSON.stringify(expectedQids)) globalReasons.push("raw-qid-set-mismatch");
  if (JSON.stringify(actualSemanticQids) !== JSON.stringify(expectedQids)) globalReasons.push("semantic-qid-set-mismatch");
  if (Number.isNaN(Date.parse(rawSnapshot?.retrievedAt))) globalReasons.push("raw-retrieved-at-invalid");

  for (const seed of CITY_BASELINE_P1B_BATCH02_SEEDS) {
    const entity = rawEntities[seed.wikidataId];
    const evidence = semanticEvidence[seed.wikidataId] || {};
    const reasons = [];
    const apiP17 = claimQids(entity, "P17");
    const apiP31 = claimQids(entity, "P31");
    const apiP131 = claimQids(entity, "P131");
    const sparqlP17 = stableUniqueQids(evidence.countryIds || []);
    const sparqlP31 = stableUniqueQids(evidence.typeIds || []);
    const sparqlP131 = stableUniqueQids(evidence.parentIds || []);
    const claimProjections = {
      P17: compareKnowledgeCityBaselineP1bBatch02ClaimProjections(apiP17, sparqlP17),
      P31: compareKnowledgeCityBaselineP1bBatch02ClaimProjections(apiP31, sparqlP31),
      P131: compareKnowledgeCityBaselineP1bBatch02ClaimProjections(apiP131, sparqlP131),
    };
    const typeClassification = classifyKnowledgeCityBaselineP1bBatch02TypeQids(claimProjections.P31.unionClaims);
    const coordinates = coordinateValues(entity);
    const apiQid = entity?.id || "";
    const apiResponseMapKey = entity?.responseMapKey || "";
    const sparqlQid = evidence.wikidataId || "";
    const sparqlEntityUris = evidence.entityUris || [];
    const exactQidPass = apiResponseMapKey === seed.wikidataId
      && apiQid === seed.wikidataId
      && sparqlQid === seed.wikidataId
      && sparqlEntityUris.length === 1
      && qidFromUri(sparqlEntityUris[0]) === seed.wikidataId;
    const apiCountryContainsApproved = apiP17.includes(seed.expectedCountryWikidataId);
    const sparqlCountryContainsApproved = sparqlP17.includes(seed.expectedCountryWikidataId);
    const sparqlCountryEvidenceMissing = sparqlP17.length === 0;
    const knownCountryQids = new Set(rawSnapshot?.source?.identityScope?.countryQids
      || CITY_BASELINE_P1B_BATCH02_SEEDS.map((candidate) => candidate.expectedCountryWikidataId));
    const p131CountryQids = claimProjections.P131.unionClaims.filter((qid) => knownCountryQids.has(qid));
    const conflictingP131CountryQids = p131CountryQids.filter((qid) => qid !== seed.expectedCountryWikidataId);
    const p17CountryPass = apiCountryContainsApproved
      && (sparqlCountryContainsApproved || sparqlCountryEvidenceMissing);
    const p131CountryPass = conflictingP131CountryQids.length === 0;
    const countryParentPass = p17CountryPass && p131CountryPass;
    const reviewReasons = new Set(typeClassification.reviewReasons);
    if (!claimProjections.P17.exactMatch) reviewReasons.add("p17-source-projection-difference");
    if (!claimProjections.P31.exactMatch) reviewReasons.add("p31-source-projection-difference");
    if (!claimProjections.P131.exactMatch) reviewReasons.add("p131-source-projection-difference");
    if (sparqlCountryEvidenceMissing && apiCountryContainsApproved) reviewReasons.add("sparql-country-evidence-missing-api-fallback");

    if (!entity || entity.missing !== undefined) reasons.push("approved-qid-missing");
    if (!exactQidPass) reasons.push("approved-qid-anchor-mismatch");
    if (entity?.labels?.en?.value !== seed.expectedNameEn) reasons.push("canonical-name-en-anchor-mismatch");
    if (!(entity?.labels?.["zh-hans"]?.value || entity?.labels?.zh?.value)) reasons.push("canonical-name-zh-missing");
    if (!countryParentPass) reasons.push("country-parent-evidence-mismatch");
    if (!p131CountryPass) reasons.push("p131-country-conflict");
    if (apiP31.length === 0) reasons.push("api-city-type-evidence-missing");
    if (sparqlP31.length === 0) reasons.push("sparql-city-type-evidence-missing");
    if (coordinates.length !== 1) reasons.push("coordinate-cardinality-invalid");
    if (coordinates.some(({ latitude, longitude }) => latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
      reasons.push("coordinate-out-of-range");
    }
    reasons.push(...typeClassification.blockingReasons);

    const normalizedReviewReasons = [...reviewReasons].sort((left, right) => left.localeCompare(right, "en"));
    const compatibleAdministrativeLabels = typeClassification.compatibleAdministrativeTypeQids
      .map((qid) => evidence.typeLabelsEn?.[qid])
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "en"));

    results.push({
      isoAlpha2: seed.isoAlpha2,
      cityKey: `${seed.isoAlpha2}:${seed.expectedNameEn}`,
      expectedNameEn: seed.expectedNameEn,
      wikidataId: seed.wikidataId,
      parentCountryEntityId: seed.parentCountryEntityId,
      expectedCountryWikidataId: seed.expectedCountryWikidataId,
      apiResponseMapKey,
      apiQid,
      sparqlQid,
      sparqlEntityUris,
      exactQidPass,
      countryParentPass,
      countryEvidence: {
        approvedCountryQid: seed.expectedCountryWikidataId,
        apiContainsApproved: apiCountryContainsApproved,
        sparqlContainsApproved: sparqlCountryContainsApproved,
        sparqlEvidenceMissing: sparqlCountryEvidenceMissing,
        p17Pass: p17CountryPass,
        p131KnownCountryQids: p131CountryQids,
        conflictingP131CountryQids,
        p131Pass: p131CountryPass,
        status: countryParentPass ? "compatible" : "conflicting",
      },
      accepted: reasons.length === 0,
      reasons,
      reviewReasons: normalizedReviewReasons,
      claimProjections,
      countryQids: claimProjections.P17.unionClaims,
      apiCountryQids: apiP17,
      sparqlCountryQids: sparqlP17,
      typeIds: claimProjections.P31.unionClaims,
      apiTypeIds: apiP31,
      sparqlTypeIds: sparqlP31,
      typeLabelsEn: evidence.typeLabelsEn || {},
      parentIds: claimProjections.P131.unionClaims,
      apiParentIds: apiP131,
      sparqlParentIds: sparqlP131,
      parentLabelsEn: evidence.parentLabelsEn || {},
      administrativeParentEvidence: {
        status: countryParentPass ? "compatible-with-approved-country" : "blocked-by-country-conflict",
        sourceProjectionDifference: !claimProjections.P131.exactMatch,
      },
      coordinates,
      typeClassification,
      isCityClass: typeClassification.hasExplicitCityIdentity,
      isAdministrativeClass: typeClassification.compatibleAdministrativeTypeQids.length > 0
        || typeClassification.blockingRegionTypeQids.length > 0
        || typeClassification.blockingStateTypeQids.length > 0,
      isMetropolitanAreaClass: typeClassification.blockingMetroTypeQids.length > 0,
      sparqlTaxonomySignals: {
        isCityClass: evidence.isCityClass === true,
        isAdministrativeClass: evidence.isAdministrativeClass === true,
        isMetropolitanAreaClass: evidence.isMetropolitanAreaClass === true,
      },
      compatibleAdministrativeReview: normalizedReviewReasons.includes("city-administrative-entity-overlap")
        || normalizedReviewReasons.includes("city-administrative-region-overlap")
        || normalizedReviewReasons.includes("city-administrative-state-overlap"),
      compatibleAdministrativeTypeLabels: compatibleAdministrativeLabels,
      blockingTypeQids: stableUniqueQids([
        ...typeClassification.blockingMetroTypeQids,
        ...typeClassification.blockingRegionTypeQids,
        ...typeClassification.blockingStateTypeQids,
      ]),
      rejectedTypeLabels: [],
      gateClassification: reasons.length > 0 ? "blocking" : normalizedReviewReasons.length > 0 ? "compatible-review" : "pass",
      usedDescriptionFallback: false,
    });
  }

  return {
    status: globalReasons.length === 0 && results.every((result) => result.accepted) ? "PASS" : "BLOCKED",
    globalReasons,
    cityCount: results.length,
    approvedQidsMatched: results.filter((result) => result.exactQidPass).length,
    results,
  };
}

function sourcedAliases(rawEntity) {
  const values = [];
  for (const language of BATCH_ALIAS_LANGUAGES) {
    values.push(rawEntity?.labels?.[language]?.value);
    values.push(...(rawEntity?.aliases?.[language] || []).map((alias) => alias?.value));
  }
  return values.filter(Boolean);
}

function enrichAliases(cities, rawSnapshot) {
  return cities.map((city) => {
    const next = clone(city);
    next.aliases = canonicalizeEntityLayerAliases([
      ...next.aliases,
      ...sourcedAliases(rawSnapshot?.wikidata?.entities?.[city.wikidataId]),
    ], [next.canonicalNameZh, next.canonicalNameEn]);
    next.provenance.aliases.value = next.aliases;
    return next;
  });
}

function combineUniqueIssues(issues, idField) {
  const byId = new Map(issues.map((issue) => [issue[idField], issue]));
  return [...byId.values()].sort((left, right) => left[idField].localeCompare(right[idField], "en"));
}

const REVIEW_METADATA = Object.freeze({
  "multiple-city-type-candidates": Object.freeze({
    field: "wikidataInstanceOf",
    message: "Wikidata supplies multiple compatible City instance-of values; canonical identity remains anchored to the approved QID.",
  }),
  "city-administrative-entity-overlap": Object.freeze({
    field: "wikidataInstanceOf",
    message: "The approved City QID also has administrative-territorial semantics; P1B publishes no administrative-level field.",
  }),
  "city-administrative-region-overlap": Object.freeze({
    field: "wikidataInstanceOf",
    message: "The approved City QID also has an exact region type while retaining explicit City identity; the overlap is non-blocking review metadata.",
  }),
  "p17-source-projection-difference": Object.freeze({
    field: "wikidataCountry",
    message: "Wikidata API and SPARQL truthy P17 projections differ; both projections retain the approved Country anchor.",
  }),
  "p31-source-projection-difference": Object.freeze({
    field: "wikidataInstanceOf",
    message: "Wikidata API and SPARQL truthy P31 projections differ; the union retains explicit City identity under the exact-QID policy.",
  }),
  "p131-source-projection-difference": Object.freeze({
    field: "wikidataAdministrativeParent",
    message: "Wikidata API and SPARQL truthy P131 projections differ without introducing a conflicting Country parent.",
  }),
  "unclassified-city-type-qids": Object.freeze({
    field: "wikidataInstanceOf",
    message: "The approved City QID includes P31 values outside the explicit City boundary policy; those QIDs are retained for manual review.",
  }),
});

function projectionForReview(type, gateResult) {
  if (type.startsWith("p17-")) return gateResult.claimProjections?.P17;
  if (type.startsWith("p31-")) return gateResult.claimProjections?.P31;
  if (type.startsWith("p131-")) return gateResult.claimProjections?.P131;
  return undefined;
}

function createBoundaryReview(type, city, gateResult) {
  const metadata = REVIEW_METADATA[type];
  if (!metadata) throw new Error(`unsupported-city-batch02-review-type:${type}`);
  const relatedEntityIds = [city.entityId, city.parentCountryEntityId].sort();
  const sourceProjection = projectionForReview(type, gateResult);
  const unclassifiedCityTypeQids = gateResult.typeClassification?.unclassifiedTypeQids || [];
  const details = {
    wikidataId: city.wikidataId,
    rawGateReviewReason: type,
    wikidataTypeIds: gateResult.typeIds,
    wikidataParentIds: gateResult.parentIds,
    sourceProjection,
    unclassifiedCityTypeQids,
  };
  return {
    reviewId: createEntityLayerIssueId({ prefix: "review", type, relatedEntityIds, details }),
    type,
    severity: "manual-review",
    relatedEntityIds,
    field: metadata.field,
    message: metadata.message,
    wikidataId: city.wikidataId,
    wikidataTypeIds: gateResult.typeIds,
    wikidataTypeLabelsEn: gateResult.typeLabelsEn,
    wikidataParentIds: gateResult.parentIds,
    wikidataParentLabelsEn: gateResult.parentLabelsEn,
    rawGateEvidence: {
      reviewReason: type,
      gateClassification: gateResult.gateClassification,
      sourceProjection,
      typeClassification: gateResult.typeClassification,
      unclassifiedCityTypeQids,
    },
  };
}

export function buildKnowledgeCityBaselineP1bBatch02BoundaryReviews({ cities = [], rawGate }) {
  const resultByQid = new Map((rawGate?.results || []).map((result) => [result.wikidataId, result]));
  const reviews = [];
  for (const city of cities) {
    const result = resultByQid.get(city.wikidataId);
    if (!result?.accepted) continue;
    const reviewReasons = new Set(result.reviewReasons || []);
    for (const type of CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES) {
      if (reviewReasons.has(type)) reviews.push(createBoundaryReview(type, city, result));
    }
  }
  const byCityAndType = new Map(reviews.map((review) => [`${review.wikidataId}:${review.type}`, review]));
  return combineUniqueIssues([...byCityAndType.values()], "reviewId");
}

function createGateConflict(result) {
  const entityId = createTypedEntityId({ entityType: "city", wikidataId: result.wikidataId });
  const relatedEntityIds = [entityId, result.parentCountryEntityId].sort();
  const details = { wikidataId: result.wikidataId, reasons: [...result.reasons].sort() };
  return {
    conflictId: createEntityLayerIssueId({ prefix: "conflict", type: "city-raw-semantic-gate-failed", relatedEntityIds, details }),
    type: "city-raw-semantic-gate-failed",
    severity: "blocking",
    relatedEntityIds,
    details,
  };
}

function createIsolationConflict(type, relatedEntityIds, details = {}) {
  const stableIds = [...new Set(relatedEntityIds.filter(Boolean))].sort();
  return {
    conflictId: createEntityLayerIssueId({ prefix: "conflict", type, relatedEntityIds: stableIds, details }),
    type,
    severity: "blocking",
    relatedEntityIds: stableIds,
    details,
  };
}

export function validateKnowledgeCityBaselineP1bBatch02Isolation({ batchCities = [], priorCities = [], countries = [] } = {}) {
  const conflicts = [];
  const priorByEntityId = new Map(priorCities.map((city) => [city.entityId, city]));
  const priorByQid = new Map(priorCities.map((city) => [city.wikidataId, city]));
  const countryByQid = new Map(countries.map((country) => [country.wikidataId, country]));
  for (const city of batchCities) {
    if (priorByEntityId.has(city.entityId)) {
      conflicts.push(createIsolationConflict("prior-batch-city-entity-id-overlap", [city.entityId]));
    }
    if (priorByQid.has(city.wikidataId)) {
      conflicts.push(createIsolationConflict("prior-batch-city-qid-overlap", [priorByQid.get(city.wikidataId).entityId, city.entityId], { wikidataId: city.wikidataId }));
    }
    if (countryByQid.has(city.wikidataId)) {
      conflicts.push(createIsolationConflict("unexpected-country-city-qid-overlap", [countryByQid.get(city.wikidataId).entityId, city.entityId], { wikidataId: city.wikidataId }));
    }
  }
  return { accepted: conflicts.length === 0, conflicts: combineUniqueIssues(conflicts, "conflictId") };
}

export function buildKnowledgeCityBaselineP1bBatch02Assets({ rawSnapshot, countries, priorCities = [] }) {
  const rawGate = validateKnowledgeCityBaselineP1bBatch02RawSnapshot(rawSnapshot);
  const normalized = normalizeKnowledgeCityBaseline({
    rawSnapshot,
    citySeeds: CITY_BASELINE_P1B_BATCH02_SEEDS,
    countries,
  });
  const cities = enrichAliases(normalized.cities, rawSnapshot);
  const deduped = dedupeKnowledgeCityEntities(cities, { countries });
  const isolation = validateKnowledgeCityBaselineP1bBatch02Isolation({ batchCities: cities, priorCities, countries });
  const gateConflicts = rawGate.results.filter((result) => !result.accepted).map(createGateConflict);
  if (rawGate.globalReasons.length > 0) {
    gateConflicts.push(createIsolationConflict("city-raw-global-gate-failed", [], { reasons: rawGate.globalReasons }));
  }
  const conflicts = combineUniqueIssues([
    ...normalized.conflicts,
    ...deduped.conflicts,
    ...isolation.conflicts,
    ...gateConflicts,
  ], "conflictId");
  const reviewQueue = combineUniqueIssues([
    ...normalized.reviewQueue,
    ...deduped.reviewQueue,
    ...buildKnowledgeCityBaselineP1bBatch02BoundaryReviews({ cities, rawGate }),
  ], "reviewId");
  const provenance = Object.fromEntries(cities.map((city) => [city.entityId, city.provenance]));

  return {
    rawGate,
    citiesAsset: {
      schemaVersion: "route-v2-city-baseline-p1b-batch02",
      generatedFrom: CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
      cityCount: cities.length,
      cities,
    },
    provenanceAsset: {
      schemaVersion: "route-v2-city-baseline-provenance-p1b-batch02",
      generatedFrom: CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
      cityCount: cities.length,
      provenance,
    },
    conflictsAsset: {
      schemaVersion: "route-v2-city-baseline-conflicts-p1b-batch02",
      blockingCount: conflicts.filter((conflict) => conflict.severity === "blocking").length,
      conflictCount: conflicts.length,
      conflicts,
    },
    reviewQueueAsset: {
      schemaVersion: "route-v2-city-baseline-review-p1b-batch02",
      reviewCount: reviewQueue.length,
      reviewQueue,
    },
  };
}

export function serializeKnowledgeCityBaselineP1bBatch02Assets(assets) {
  return {
    cities: serializeJson(assets.citiesAsset),
    provenance: serializeJson(assets.provenanceAsset),
    conflicts: serializeJson(assets.conflictsAsset),
    reviewQueue: serializeJson(assets.reviewQueueAsset),
  };
}

async function writeTextAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function writePublishedAssets(assets) {
  const serialized = serializeKnowledgeCityBaselineP1bBatch02Assets(assets);
  await Promise.all(Object.entries(CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS).map(async ([key, relativePath]) => {
    const targetPath = path.join(REPOSITORY_ROOT, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeTextAtomic(targetPath, serialized[key]);
  }));
}

function numericOption(args, name, fallback) {
  const argument = args.find((value) => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid-${name}:${argument}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const supported = args.every((argument) => argument === "--refresh" || /^--(?:timeout-ms|retries)=\d+$/u.test(argument));
  if (!supported) throw new Error(`unsupported-arguments:${args.join(",")}`);
  const refresh = args.includes("--refresh");
  const timeoutMs = numericOption(args, "timeout-ms", 60_000);
  const retries = numericOption(args, "retries", 1);
  const countries = await loadKnowledgeCityBaselineP1bBatch02Countries();
  const priorCities = (await Promise.all(PRIOR_CITY_RELATIVE_PATHS.map(async (relativePath) => {
    const asset = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
    return asset.cities || [];
  }))).flat();
  const identityScope = validateKnowledgeCityBaselineP1bBatch02SeedScope({ countries, priorCities });
  if (!identityScope.accepted) throw new Error(`city-batch02-seed-scope-invalid:${JSON.stringify(identityScope)}`);

  if (refresh) {
    const rawSnapshot = await refreshKnowledgeCityBaselineP1bBatch02RawSnapshot({ timeoutMs, retries, identityScope });
    if (rawSnapshot.gate.status !== "PASS") {
      process.stderr.write(`${JSON.stringify({ status: "RAW_REJECTED", gate: rawSnapshot.gate, source: rawSnapshot.source }, null, 2)}\n`);
      throw new Error("city-batch02-raw-gate-failed");
    }
    const contents = serializeJson(rawSnapshot);
    await writeTextAtomic(RAW_PATH, contents);
    process.stdout.write(`${JSON.stringify({
      status: "RAW_REFRESHED",
      calledWikidata: true,
      endpoints: rawSnapshot.source.endpoints,
      httpRequestCount: rawSnapshot.source.httpRequestCount,
      retryCount: rawSnapshot.source.retryCount,
      retrievedAt: rawSnapshot.retrievedAt,
      bindingCount: rawSnapshot.source.semanticBindingCount,
      canonicalRecordCount: rawSnapshot.gate.results.length,
      approvedQidsMatched: rawSnapshot.gate.approvedQidsMatched,
      raw: CITY_BASELINE_P1B_BATCH02_RAW_RELATIVE_PATH,
      fileSizeBytes: Buffer.byteLength(contents),
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
      cities: rawSnapshot.gate.results,
    }, null, 2)}\n`);
    return;
  }

  let rawSnapshot;
  try {
    rawSnapshot = JSON.parse(await readFile(RAW_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("city-batch02-raw-missing:rerun-with---refresh");
    throw error;
  }
  const assets = buildKnowledgeCityBaselineP1bBatch02Assets({ rawSnapshot, countries, priorCities });
  const validation = validateKnowledgeCityEntitySet(assets.citiesAsset.cities);
  if (!validation.accepted) throw new Error(`city-schema-validation-failed:${validation.reasons.join("|")}`);
  if (assets.rawGate.status !== "PASS") throw new Error(`city-raw-gate-failed:${JSON.stringify(assets.rawGate)}`);
  if (assets.citiesAsset.cityCount !== CITY_BASELINE_P1B_BATCH02_SEEDS.length) throw new Error(`city-count-invalid:${assets.citiesAsset.cityCount}`);
  if (assets.conflictsAsset.blockingCount !== 0 || assets.conflictsAsset.conflictCount !== 0) {
    throw new Error(`city-conflicts-present:${JSON.stringify(assets.conflictsAsset.conflicts)}`);
  }
  const unexpectedReviewTypes = [...new Set(assets.reviewQueueAsset.reviewQueue
    .map((review) => review.type)
    .filter((type) => !CITY_BASELINE_P1B_BATCH02_REVIEW_TYPES.includes(type)))].sort();
  if (unexpectedReviewTypes.length > 0) throw new Error(`city-review-types-invalid:${unexpectedReviewTypes.join("|")}`);
  await writePublishedAssets(assets);
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: "offline-publish",
    calledWikidata: false,
    cityCount: assets.citiesAsset.cityCount,
    conflictCount: assets.conflictsAsset.conflictCount,
    reviewCount: assets.reviewQueueAsset.reviewCount,
    outputs: CITY_BASELINE_P1B_BATCH02_PUBLISH_RELATIVE_PATHS,
  }, null, 2)}\n`);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
